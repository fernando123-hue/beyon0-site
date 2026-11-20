-- ==========================================================================
-- SEGURANÇA DOS PAGAMENTOS NA ENTREGA (decisões do dono, 19/11/2026). Aplicar DEPOIS de 20261115130000_confirmacao_entrada.sql.
-- 1. "Bloquear automaticamente a nossa entrega quando o cliente pedir reembolso": com a entrada estornada (inteira ou em parte), contestada, num estado
--    não reconhecido depois de aprovada, ou com o projeto pausado, NADA da entrega avança nem vai ao ar, nem pelas ações do DONO no painel
--    (privado.entrega_bloqueada, conferida em privado.entrega_trava, privado.entrega_do_dono e na cobrança do restante). Encerrar e suspender continuam
--    (são o caminho da devolução e de tirar o site do ar). O dono recebe o aviso NA HORA: app.pagamentos_aplicar devolve o `alerta` (só o código do
--    pedido, o evento e a parcela) e o servidor manda o e-mail (api/_pagamentos/servico.mjs → api/_aviso.mjs).
-- 2. A ORDEM NOVA: o restante é cobrado quando o site está 100% pronto (a prévia final APROVADA) e o site só vai ao ar com o restante pago e limpo
--    (vendas_no_ar). Antes: o site ia ao ar na conta da Beyon e o restante abria com ele no ar (no_ar/suspensa). As entregas antigas que já estão no ar
--    (no_ar/suspensa) continuam podendo pagar e concluir como antes (privado.concluir_entrega não muda).
-- 3. (c) O estorno PARCIAL deixa o pagamento "pago" no Mercado Pago, mas a entrada deixa de contar como paga (privado.parcela_quitada).
--    (d) Estado não reconhecido DEPOIS da aprovação é tratado como contestação (falha fechada: pausa o projeto e bloqueia a entrega).
-- 4. A contestação REVERTIDA a favor da Beyon (contestada_revertida) devolve o pagamento a "pago", mas o projeto continua pausado e a entrega bloqueada até uma
--    pessoa reativar o projeto (como já dizia docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md: as fontes oficiais do provedor se contradizem; falha fechada).
-- Só `create or replace` com as MESMAS assinaturas (e os mesmos privilégios, repetidos no fim); funções novas nascem fechadas (revoke de public, anon,
-- authenticated e service_role, menos as app.* que o servidor chama). Ordem de travas de sempre: conversa → entrega → pagamento → tentativa.
-- Erros: 55000 (entrega bloqueada ou passo errado), como as travas que já existiam; o painel lê vendas_entrega_info (bloqueada, restante_pago) para
-- dizer a frase certa ANTES de tentar.
-- ==========================================================================

-- ---------- a parcela está paga e LIMPA? (o pagamento "pago" e a order que o pagou sem estorno, contestação ou divergência) ----------
create function privado.parcela_quitada(p_proposta uuid, p_parcela text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app.pagamentos pg
     where pg.proposta_id = p_proposta and pg.parcela = p_parcela and pg.status = 'pago'
       and not exists (select 1 from app.tentativas_pagamento t
                        where t.pagamento_id = pg.id and t.provedor_order_id = pg.gateway_ref
                          and t.status in ('estornada', 'estornada_parcial', 'contestada', 'divergente')));
$$;
revoke all on function privado.parcela_quitada(uuid, text) from public, anon, authenticated, service_role;

-- (c) a entrada PAGA agora é a entrada quitada: o estorno parcial (o pagamento continua "pago", a tentativa fica estornada_parcial) não conta mais como paga
create or replace function privado.sinal_pago(p_proposta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.parcela_quitada(p_proposta, 'sinal');
$$;
revoke all on function privado.sinal_pago(uuid) from public, anon, authenticated, service_role;

-- ---------- a entrega está BLOQUEADA? (a regra única do bloqueio, para o cliente, o dono e a cobrança) ----------
-- entrada não quitada; projeto pausado (o estorno/contestação pausa: pagamentos_aplicar) ou cancelado; restante estornado, contestado ou pago com a order suja
create function privado.entrega_bloqueada(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select not privado.sinal_pago(e.proposta_id)
      or exists (select 1 from app.propostas pr join app.projetos pj on pj.id = pr.projeto_id
                  where pr.id = e.proposta_id and pj.status in ('pausado', 'cancelado'))
      or exists (select 1 from app.pagamentos pg where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo'
                  and (pg.status in ('estornado', 'contestado') or (pg.status = 'pago' and not privado.parcela_quitada(e.proposta_id, 'saldo'))));
$$;
revoke all on function privado.entrega_bloqueada(app.entregas) from public, anon, authenticated, service_role;

-- ---------- a trava do cliente: a de 20261023120000_pr3b2_entrega.sql, com o bloqueio inteiro no lugar de "o sinal está pago" ----------
create or replace function privado.entrega_trava(p_conversa uuid, p_visitante uuid, p_passos text[]) returns app.entregas
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; e app.entregas;
begin
  c := privado.conversa_do(p_conversa, p_visitante);   -- trava 1 (de outro visitante: P0002)
  perform privado.exigir_etapa(c, array['em_producao']);
  select * into e from app.entregas where conversa_id = c.id for update;   -- trava 2
  if not found then raise exception 'entrega não encontrada' using errcode = 'P0002'; end if;
  if privado.entrega_bloqueada(e) then raise exception 'entrega bloqueada (entrada estornada, contestada ou projeto pausado)' using errcode = '55000'; end if;
  if not e.passo = any (p_passos) then raise exception 'passo atual (%) não permite esta ação', e.passo using errcode = '55000'; end if;
  return e;
end $$;
revoke all on function privado.entrega_trava(uuid, uuid, text[]) from public, anon, authenticated, service_role;

-- ---------- a trava do dono: a de 20261024120100_pr3b3_previa.sql vira `entrega_do_dono_travar` (sem bloqueio: só encerrar e suspender a usam) ----------
create function privado.entrega_do_dono_travar(p jsonb, p_passos text[]) returns app.entregas
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; c app.conversas; e app.entregas;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  select cv.* into c from app.conversas cv join app.pedidos pd on pd.conversa_id = cv.id
   where pd.codigo = p ->> 'codigo' and cv.org_id = v_org for update of cv;   -- trava 1
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  select * into e from app.entregas where conversa_id = c.id for update;   -- trava 2
  if not found then raise exception 'entrega não encontrada' using errcode = 'P0002'; end if;
  if p_passos is not null and not e.passo = any (p_passos) then
    raise exception 'passo atual (%) não permite esta ação', e.passo using errcode = '55000';
  end if;
  return e;
end $$;
revoke all on function privado.entrega_do_dono_travar(jsonb, text[]) from public, anon, authenticated, service_role;

-- toda ação do dono que ANDA com a entrega (publicar a prévia, pôr no ar, dispensar o material, registrar aviso, religar) passa por aqui: bloqueada, 55000.
-- (falha fechada por padrão: uma função nova que use esta trava já nasce bloqueada)
create or replace function privado.entrega_do_dono(p jsonb, p_passos text[]) returns app.entregas
language plpgsql security definer set search_path = '' as $$
declare e app.entregas;
begin
  e := privado.entrega_do_dono_travar(p, p_passos);
  if privado.entrega_bloqueada(e) then raise exception 'entrega bloqueada (entrada estornada, contestada ou projeto pausado)' using errcode = '55000'; end if;
  return e;
end $$;
revoke all on function privado.entrega_do_dono(jsonb, text[]) from public, anon, authenticated, service_role;

-- ---------- o que o painel lê antes de agir: a de 20261024120100 com `bloqueada` e `restante_pago` ----------
create or replace function app.vendas_entrega_info(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; e app.entregas; m app.materiais;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  select e2.* into e from app.entregas e2 join app.pedidos pd on pd.conversa_id = e2.conversa_id where pd.codigo = p ->> 'codigo' and e2.org_id = v_org;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  select * into m from app.materiais where entrega_id = e.id;
  return jsonb_build_object('passo', e.passo, 'prazo', e.prazo, 'prazo_dias', e.prazo_dias, 'versao', e.updated_at, 'cliente_captacao', e.cliente_captacao, 'entrega_ate', e.entrega_ate,
    'entrada_em', e.prazo ->> 'entrada_em', 'no_ar_em', e.no_ar_em, 'aviso_material_em', e.aviso_material_em,
    'bloqueada', privado.entrega_bloqueada(e), 'restante_pago', privado.parcela_quitada(e.proposta_id, 'saldo'),
    'material', jsonb_build_object('status', m.status, 'dados', m.dados, 'negocio', m.negocio, 'autorizacao', m.autorizacao));
end $$;

-- ---------- pôr no ar (a ordem nova): aprovada → no_ar → concluida, SÓ com o restante pago e limpo e a entrega sem bloqueio ----------
-- O restante já foi pago, então pôr no ar CONCLUI o pedido na mesma transação (a conclusão de privado.concluir_entrega, sem o evento "restante_pago",
-- que saiu quando o restante caiu). O aviso "seu site está no ar" fica pendente para o dono mandar (vendas_avisos_lista aceita a concluída).
create or replace function app.vendas_no_ar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_url text := p ->> 'url'; v_agora timestamptz; v_projeto uuid;
begin
  if coalesce(v_url, '') = '' or coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' then raise exception 'no ar: parâmetros inválidos' using errcode = '22023'; end if;
  v_agora := (p ->> 'agora')::timestamptz;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'no ar: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_do_dono(p, array['aprovada']);   -- (bloqueada: 55000)
  if e.updated_at is distinct from (p ->> 'versao')::timestamptz then raise exception 'a entrega mudou' using errcode = '40001'; end if;
  -- (19/11) o site não vai ao ar, nem na conta da Beyon, antes de o restante estar pago
  if not privado.parcela_quitada(e.proposta_id, 'saldo') then return jsonb_build_object('ok', false, 'motivo', 'sem_restante'); end if;
  -- (B4) a rede de baixo barra o que o JS já barra: domínio com ponto e TLD só de letras (nada de localhost, IP ou número)
  if v_url !~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/?$' then return jsonb_build_object('ok', false, 'motivo', 'endereco'); end if;
  update app.entregas set passo = 'no_ar', site_url = v_url, no_ar_em = v_agora, updated_at = now() where id = e.id;
  update app.entregas set passo = 'concluida', concluida_em = now(), aviso_no_ar_desde = v_agora, updated_at = now() where id = e.id;
  update app.conversas set etapa = 'encerrada', ultima_atividade = now() where id = e.conversa_id and etapa = 'em_producao';
  select projeto_id into v_projeto from app.propostas where id = e.proposta_id;
  update app.projetos set status = 'entregue', entregue_em = (now() at time zone 'America/Campo_Grande')::date
   where id = v_projeto and status in ('pronto_para_producao', 'em_producao', 'em_revisao');
  perform privado.encerrar_links_do_pedido(e.conversa_id, 30);   -- o link continua abrindo o recibo final por mais 30 dias
  perform privado.evento(e.org_id, e.conversa_id, 'site_no_ar');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- encerrar e suspender: as de 20261024120100, pela trava SEM bloqueio (a devolução e tirar o site do ar valem com a entrega bloqueada) ----------
create or replace function app.vendas_suspender(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_dias integer;
begin
  e := privado.entrega_do_dono_travar(p, array['no_ar']);
  if e.aviso_no_ar_feito_em is null then return jsonb_build_object('ok', false, 'motivo', 'sem_aviso'); end if;
  v_dias := (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date;
  if v_dias < 4 then return jsonb_build_object('ok', false, 'motivo', 'cedo', 'dias', v_dias); end if;
  if exists (select 1 from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id
              where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo' and t.status in ('criada', 'processando', 'aguardando', 'requer_acao')) then
    return jsonb_build_object('ok', false, 'motivo', 'pagamento_em_andamento');
  end if;
  update app.entregas set passo = 'suspensa', suspensa_em = now(), updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'entrega_suspensa');
  return jsonb_build_object('ok', true, 'lembretes', (e.lembrete_restante_1_em is not null)::int + (e.lembrete_restante_2_em is not null)::int);
end $$;

create or replace function app.vendas_encerrar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_motivo text := p ->> 'motivo';
begin
  if v_motivo is null or v_motivo not in ('desistencia', 'atraso', 'producao_manual', 'outro') then
    raise exception 'encerrar: motivo fora da lista' using errcode = '22023';
  end if;
  e := privado.entrega_do_dono_travar(p, array['material', 'producao', 'previa', 'ajustes', 'aprovada', 'no_ar', 'suspensa']);
  -- (19/11) na ordem nova o restante pode estar PAGO com a entrega ainda aprovada: encerrar assim deixaria 100% do valor recebido sem entrega e sem
  -- ninguém lembrar a devolução. Primeiro o estorno do restante no Mercado Pago (o pagamento vira estornado), depois o encerrar
  if exists (select 1 from app.pagamentos where proposta_id = e.proposta_id and parcela = 'saldo' and status = 'pago') then
    return jsonb_build_object('ok', false, 'motivo', 'restante_pago');
  end if;
  if exists (select 1 from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id
              where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo' and t.status in ('criada', 'processando', 'aguardando', 'requer_acao')) then
    return jsonb_build_object('ok', false, 'motivo', 'pagamento_em_andamento');
  end if;
  update app.pagamentos set status = 'cancelado' where proposta_id = e.proposta_id and parcela = 'saldo' and status = 'pendente';
  update app.entregas set passo = 'encerrada', encerrada_em = now(), encerrada_motivo = v_motivo, aviso_previa_desde = null, aviso_no_ar_desde = null, updated_at = now() where id = e.id;
  update app.conversas set etapa = 'encerrada', ultima_atividade = now() where id = e.conversa_id and etapa = 'em_producao';
  update app.projetos set status = 'cancelado' where id = (select projeto_id from app.propostas where id = e.proposta_id) and status in ('pronto_para_producao', 'em_producao', 'em_revisao', 'pausado');
  perform privado.encerrar_links_do_pedido(e.conversa_id, 30);
  perform privado.evento(e.org_id, e.conversa_id, 'entrega_encerrada', jsonb_build_object('motivo', v_motivo));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- a fila de avisos: a de 20261028120000 com o aviso "no ar" também na CONCLUÍDA (a ordem nova conclui ao pôr no ar) e sem as entregas bloqueadas ----------
-- (a concluída pelo caminho antigo, restante pago com o site no ar, tem aviso_no_ar_desde nulo: privado.concluir_entrega o limpa)
create or replace function app.vendas_avisos_lista(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with x as (
    select e.conversa_id, 'previa'::text as momento, e.aviso_previa_desde as desde, e.passo from app.entregas e
     where e.org_id = v_org and e.aviso_previa_desde is not null and e.passo = 'previa' and not privado.entrega_bloqueada(e)
    union all   -- (19/11) com o site no ar: a no_ar antiga e a concluída da ordem nova; suspensa (e qualquer outro passo) não oferece "O seu site está no ar!"
    select e.conversa_id, 'no_ar', e.aviso_no_ar_desde, e.passo from app.entregas e
     where e.org_id = v_org and e.aviso_no_ar_desde is not null and (e.passo = 'no_ar' or (e.passo = 'concluida' and not e.religar_pendente)) and e.site_url is not null
       and not privado.entrega_bloqueada(e)
    union all   -- (22/10) material parado: dia 30 sem o material, SEM número autorizado e sem o aviso já registrado
    select e.conversa_id, 'material_parado', (e.prazo ->> 'entrada_em')::timestamptz + interval '30 days', e.passo from app.entregas e join app.materiais m on m.entrega_id = e.id
     where e.org_id = v_org and e.passo = 'material' and e.aviso_material_em is null
       and (now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date >= 30
       and not privado.material_autorizado(m) and not privado.entrega_bloqueada(e)
    union all   -- (22/10) o aviso prévio do apagamento do material: o projeto parado completou 5 meses (privado.material_apagar_devido). Bloqueada (19/11), o registro do
                -- aviso é recusado como as outras ações do dono: a fila não oferece o que o dono não consegue marcar; o caminho dela é encerrar o pedido
    select e.conversa_id, 'material_apagar', ((privado.material_parado_desde(e) at time zone 'America/Campo_Grande')::date + interval '5 months') at time zone 'America/Campo_Grande', e.passo from app.entregas e
     where e.org_id = v_org and privado.material_apagar_devido(e) and not privado.entrega_bloqueada(e)
    union all   -- (22/10) o lembrete do 2º dia depois do aviso "no ar" (só as entregas antigas, no ar sem o restante)
    select e.conversa_id, 'restante_lembrete_1', e.aviso_no_ar_feito_em + interval '2 days', e.passo from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_1_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 2 and not privado.entrega_bloqueada(e)
    union all   -- (22/10) o último lembrete, no 3º dia
    select e.conversa_id, 'restante_lembrete_2', e.aviso_no_ar_feito_em + interval '3 days', e.passo from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_2_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 3 and not privado.entrega_bloqueada(e))
  select coalesce(jsonb_agg(jsonb_build_object('conversa_id', c.id, 'codigo', pd.codigo, 'momento', x.momento, 'passo', x.passo, 'desde', x.desde,
           'contato', jsonb_build_object('nome', l.nome, 'telefone', l.telefone, 'email', l.email)) order by x.desde), '[]'::jsonb) into v_itens
    from x join app.conversas c on c.id = x.conversa_id join app.pedidos pd on pd.conversa_id = c.id left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

-- ---------- a cobrança: a de 20261024120200_pr3b3_restante.sql com o restante na APROVAÇÃO e o bloqueio inteiro ----------
create or replace function app.pagamentos_iniciar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pr app.propostas; pg app.pagamentos; t app.tentativas_pagamento; e app.entregas;
        v_parcela text; v_valor numeric; v_sinal numeric; v_qtd integer; v_ultima timestamptz;
begin
  if coalesce(p ->> 'metodo', '') not in ('pix', 'cartao') then raise exception 'método inválido' using errcode = '22023'; end if;
  if coalesce(p ->> 'provedor', '') !~ '^[a-z0-9_]{2,30}$' then raise exception 'provedor inválido' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- trava 1: conversa
  perform privado.exigir_etapa(c, array['aguardando_pagamento', 'em_producao']);
  v_parcela := case when c.etapa = 'aguardando_pagamento' then 'sinal' else 'saldo' end;
  -- (B3) defesa em profundidade: o restante é SÓ Pix também no banco (o JS e a tela já recusam o cartão)
  if v_parcela = 'saldo' and p ->> 'metodo' <> 'pix' then raise exception 'o restante é pago só por Pix' using errcode = '22023'; end if;
  select * into pr from app.propostas where conversa_id = c.id and status = 'aceita' order by versao desc limit 1;
  if not found then raise exception 'proposta aceita não encontrada' using errcode = 'P0002'; end if;
  -- (PR 3b-1) sem o percentual da proposta, não cobra: nunca um número de reserva
  if pr.sinal_percentual is null or pr.sinal_percentual < 1 then
    raise exception 'proposta sem percentual de entrada' using errcode = '23514';
  end if;
  if v_parcela = 'sinal' then
    v_valor := round(pr.valor_total * pr.sinal_percentual / 100.0, 2);
  else
    select * into e from app.entregas where conversa_id = c.id for update;   -- trava 2: a entrega
    -- (19/11) o restante abre com a prévia final APROVADA (o site 100% pronto); no_ar/suspensa: as entregas antigas, que foram ao ar antes da ordem nova
    if not found or e.passo not in ('aprovada', 'no_ar', 'suspensa') then
      raise exception 'o restante só abre com a prévia aprovada' using errcode = '55000';
    end if;
    -- a entrega é a DESTA proposta (a aceita mais nova): senão a conclusão do saldo não a acharia
    if e.proposta_id <> pr.id then raise exception 'a entrega não é da proposta aceita mais recente: a equipe resolve' using errcode = '55000'; end if;
    -- (19/11) entrada estornada (inteira ou em parte), contestada ou projeto pausado: não cobra; cobrar total − entrada entregaria o site recebendo menos que o combinado
    if privado.entrega_bloqueada(e) then raise exception 'a entrega está bloqueada (entrada estornada, contestada ou projeto pausado): a equipe resolve' using errcode = '55000'; end if;
    select valor into v_sinal from app.pagamentos where proposta_id = pr.id and parcela = 'sinal' and status = 'pago';   -- uma só linha paga (índice pagamentos_parcela_viva)
    if v_sinal is null then raise exception 'sem a entrada registrada' using errcode = '23514'; end if;
    v_valor := pr.valor_total - v_sinal;
    if v_valor <= 0 then raise exception 'restante inválido' using errcode = '23514'; end if;
  end if;

  select * into pg from app.pagamentos where proposta_id = pr.id and parcela = v_parcela and status in ('pendente', 'pago', 'contestado') for update;   -- trava 3
  if not found then
    insert into app.pagamentos (org_id, proposta_id, parcela, valor, gateway)
    values (c.org_id, pr.id, v_parcela, v_valor, p ->> 'provedor') returning * into pg;
    perform privado.evento(c.org_id, c.id, case when v_parcela = 'sinal' then 'pagamento_iniciado' else 'restante_iniciado' end, jsonb_build_object('valor', v_valor));
  end if;
  if pg.status <> 'pendente' then raise exception 'este pagamento já foi feito' using errcode = '55000'; end if;
  if pg.valor <> v_valor then raise exception 'valor do pagamento diverge da proposta' using errcode = '23514'; end if;

  select * into t from app.tentativas_pagamento where pagamento_id = pg.id and status in ('criada', 'processando', 'aguardando', 'requer_acao') for update;   -- trava 4
  if found then
    return jsonb_build_object('ativa', true, 'tentativa_id', t.id, 'metodo', t.metodo, 'status', t.status, 'provedor_order_id', t.provedor_order_id,
      'chave_idempotencia', t.chave_idempotencia, 'pagamento_id', pg.id, 'valor', pg.valor, 'criada_em', t.created_at);
  end if;
  if exists (select 1 from app.tentativas_pagamento where pagamento_id = pg.id and status = 'divergente') then
    raise exception 'pagamento em verificação pela equipe' using errcode = '55000';
  end if;
  if p ->> 'metodo' = 'cartao' then
    select count(*) into v_qtd from app.tentativas_pagamento where pagamento_id = pg.id and metodo = 'cartao';
    if v_qtd >= coalesce((p ->> 'max_tentativas')::integer, 5) then raise exception 'tentativas esgotadas' using errcode = '23514'; end if;
    select max(updated_at) into v_ultima from app.tentativas_pagamento where pagamento_id = pg.id and metodo = 'cartao' and status = 'recusada';
    if v_ultima > now() - make_interval(secs => coalesce((p ->> 'intervalo_s')::integer, 20)) then raise exception 'aguarde entre tentativas' using errcode = '55P03'; end if;
  end if;
  if p ->> 'metodo' = 'cartao' and (select count(*) from app.tentativas_pagamento
        where org_id = c.org_id and metodo = 'cartao' and status = 'recusada' and updated_at > now() - interval '1 hour')
        >= coalesce((p ->> 'max_recusas_hora')::integer, 20) then
    perform privado.auditar_uma_vez(c.org_id, pg.id, null, 'payment.divergence', p ->> 'provedor', null, 'criacao', null, null,
      jsonb_build_object('motivo', 'cartão pausado: muitas recusas na última hora'), null);
    raise exception 'cartão pausado' using errcode = '23514';
  end if;

  insert into app.tentativas_pagamento (org_id, pagamento_id, provedor, metodo, valor, chave_idempotencia)
  values (c.org_id, pg.id, p ->> 'provedor', p ->> 'metodo', pg.valor, 'bz-' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  perform privado.auditar_pagamento(c.org_id, pg.id, t.id, 'payment.created', t.provedor, null, 'criacao', null, 'criada',
    jsonb_build_object('metodo', t.metodo, 'valor', t.valor), null);
  return jsonb_build_object('ativa', false, 'tentativa_id', t.id, 'pagamento_id', pg.id, 'valor', pg.valor, 'moeda', pg.moeda,
    'metodo', t.metodo, 'chave_idempotencia', t.chave_idempotencia, 'external_reference', t.id::text);
end $$;

-- ---------- o estado do pagamento: a de 20261024120200 com a parcela do restante desde a APROVAÇÃO ----------
create or replace function app.pagamentos_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pg app.pagamentos; t app.tentativas_pagamento; v_parcela text; v_bloq boolean;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  v_parcela := case when exists (select 1 from app.entregas e where e.conversa_id = c.id and e.passo in ('aprovada', 'no_ar', 'suspensa', 'concluida')) then 'saldo' else 'sinal' end;
  select pa.* into pg from app.pagamentos pa join app.propostas pr on pr.id = pa.proposta_id
  where pr.conversa_id = c.id and pa.parcela = v_parcela order by pa.created_at desc limit 1;
  if not found then return jsonb_build_object('pagamento', null, 'parcela', v_parcela); end if;
  select * into t from app.tentativas_pagamento where pagamento_id = pg.id order by created_at desc limit 1;
  -- (S2, revisão de segurança) entrega bloqueada: o Pix já emitido (e o desafio do cartão) NÃO é mais mostrado; o cliente não paga o que a Beyon não vai entregar
  v_bloq := exists (select 1 from app.entregas e where e.conversa_id = c.id and privado.entrega_bloqueada(e));
  return jsonb_build_object(
    'parcela', v_parcela,
    'pagamento', jsonb_build_object('status', pg.status, 'valor', pg.valor, 'moeda', pg.moeda, 'pago_em', pg.pago_em, 'parcela', pg.parcela),
    'tentativa', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'metodo', t.metodo, 'status', t.status, 'detalhe', t.detalhe_provedor, 'parcelas', t.parcelas, 'meio', t.meio,
      'pix_qr', case when t.status = 'aguardando' and not v_bloq then t.pix_qr end,
      'pix_qr_base64', case when t.status = 'aguardando' and not v_bloq then t.pix_qr_base64 end,
      'expira_em', t.expira_em,
      'desafio_url', case when t.status = 'requer_acao' and not v_bloq then t.desafio_url end,
      'consultada_em', t.consultada_em, 'criada_em', t.created_at) end);
end $$;

-- ---------- a conclusão (revisão 2, item 2): a de 20261024120200_pr3b3_restante.sql, que só conferia status = 'pago'. O restante pago com a entrega BLOQUEADA (entrada estornada ou
-- contestada, projeto pausado, restante estornado em parte...) NÃO conclui o pedido nem fecha a conversa: grava o rastro project.error (uma vez por dia e por pagamento; o MESMO
-- que o alerta do banco grava, então não duplica) e devolve false. Mesma assinatura, mesmos privilégios ----------
create or replace function privado.concluir_entrega(p_proposta uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_conversa uuid; e app.entregas; v_projeto uuid; pg app.pagamentos;
begin
  select conversa_id into v_conversa from app.entregas where proposta_id = p_proposta;
  if not found then return false; end if;
  -- NÃO RETIRAR a trava da conversa: chamada pelo gatilho dentro de pagamentos_aplicar, esta função já chega com conversa → pagamento → tentativa travados e
  -- só então pega a entrega (a ordem de iniciar_tentativa é conversa → entrega → pagamento). Sem ciclo porque TODA função que toca a entrega toma a conversa primeiro.
  perform 1 from app.conversas where id = v_conversa for update;   -- trava 1: conversa
  select * into e from app.entregas where proposta_id = p_proposta for update;   -- trava 2: entrega
  if e.passo not in ('no_ar', 'suspensa') then return false; end if;
  if not exists (select 1 from app.pagamentos where proposta_id = p_proposta and parcela = 'saldo' and status = 'pago') then return false; end if;
  -- (19/11) a parcela paga tem de estar QUITADA (sem estorno parcial, contestação ou divergência) e a entrega livre: senão uma pessoa decide
  if privado.entrega_bloqueada(e) then
    select * into pg from app.pagamentos where proposta_id = p_proposta and parcela = 'saldo' and status = 'pago';
    perform privado.auditar_uma_vez(pg.org_id, pg.id, null, 'project.error', 'sistema', pg.gateway_ref, 'operacao', null, null,
      jsonb_build_object('motivo', 'restante pago com a entrega bloqueada: o dinheiro entrou e nada vai ao ar; devolver ou resolver com o Mercado Pago'), null);
    return false;
  end if;
  update app.entregas set passo = 'concluida', concluida_em = now(), religar_pendente = (e.passo = 'suspensa'), aviso_no_ar_desde = null, updated_at = now() where id = e.id;
  update app.conversas set etapa = 'encerrada', ultima_atividade = now() where id = e.conversa_id and etapa = 'em_producao';
  select projeto_id into v_projeto from app.propostas where id = p_proposta;
  update app.projetos set status = 'entregue', entregue_em = (now() at time zone 'America/Campo_Grande')::date where id = v_projeto and status in ('pronto_para_producao', 'em_producao', 'em_revisao');
  if not found and not exists (select 1 from app.projetos where id = v_projeto and status = 'entregue') then
    -- projeto pausado (estorno da entrada), cancelado ou sem projeto: a entrega conclui, o projeto não muda e uma pessoa decide
    select * into pg from app.pagamentos where proposta_id = p_proposta and parcela = 'saldo' and status = 'pago';
    perform privado.auditar_pagamento(pg.org_id, pg.id, null, 'project.error', 'sistema', null, 'operacao', null, null,
      jsonb_build_object('motivo', 'restante pago com o projeto fora de produção (' || coalesce((select status from app.projetos where id = v_projeto), 'sem projeto') || ')'), null);
  end if;
  perform privado.encerrar_links_do_pedido(e.conversa_id, 30);   -- o link continua abrindo o recibo final por mais 30 dias
  perform privado.evento(e.org_id, e.conversa_id, 'restante_pago');
  return true;
end $$;
revoke all on function privado.concluir_entrega(uuid) from public, anon, authenticated, service_role;

-- a leitura do cliente só conserta a conclusão do que está LIVRE: bloqueada, não toca nada (e não grava rastro a cada leitura)
create or replace function privado.concluir_pendente(p_conversa uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_prop uuid;
begin
  select e.proposta_id into v_prop from app.entregas e
   where e.conversa_id = p_conversa and e.passo in ('no_ar', 'suspensa') and not privado.entrega_bloqueada(e)
     and exists (select 1 from app.pagamentos pg where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo' and pg.status = 'pago');
  if v_prop is null then return false; end if;
  return privado.concluir_entrega(v_prop);
end $$;
revoke all on function privado.concluir_pendente(uuid) from public, anon, authenticated, service_role;

-- ---------- o restante pago: na ordem nova a entrega está APROVADA e espera o "no ar" do dono (nada de erro na auditoria) ----------
create or replace function privado.entrega_apos_saldo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_passo text; e app.entregas; v_tem boolean;
begin
  begin
    select * into e from app.entregas where proposta_id = new.proposta_id;
    v_tem := found; v_passo := e.passo;
    if v_passo = 'aprovada' then
      -- (19/11) o caminho normal: o restante caiu com o site pronto; o dono põe no ar (app.vendas_no_ar) e o aviso dele sai na hora (alerta restante_pago)
      perform privado.evento(new.org_id, (select conversa_id from app.entregas where proposta_id = new.proposta_id), 'restante_pago');
    elsif not privado.concluir_entrega(new.proposta_id)
       and not exists (select 1 from app.entregas where proposta_id = new.proposta_id and passo = 'concluida')
       -- (revisão 2, item 4) bloqueada: o rastro já foi gravado (por concluir_entrega e pelo alerta do banco, o mesmo, uma vez): este não duplica
       and not (v_tem and privado.entrega_bloqueada(e)) then
      -- o restante caiu e a entrega não está aprovada, no ar nem suspensa (encerrada?): o dinheiro fica registrado e o caso vai para uma pessoa
      perform privado.auditar_pagamento(new.org_id, new.id, null, 'project.error', 'sistema', null, 'operacao', null, null,
        jsonb_build_object('motivo', 'restante pago com a entrega fora do ar (' || coalesce(v_passo, 'sem entrega') || ')'), null);
    end if;
  exception when others then
    raise warning 'entrega não concluída para a proposta %: %', new.proposta_id, sqlerrm;
    begin
      perform privado.auditar_pagamento(new.org_id, new.id, null, 'project.error', 'sistema', null, 'operacao', null, null,
        jsonb_build_object('motivo', 'entrega não concluída: ' || left(sqlerrm, 120), 'codigo', sqlstate), null);
    exception when others then null;
    end;
  end;
  return new;
end $$;
revoke all on function privado.entrega_apos_saldo() from public, anon, authenticated, service_role;

-- ---------- APLICAR o retrato: a de 20261007130000_pagamentos.sql fica intacta como `pagamentos_aplicar_base`; esta a envolve ----------
-- (d) estado não reconhecido DEPOIS da aprovação (a order que pagou está aprovada, estornada em parte ou com a contestação revertida) vira CONTESTAÇÃO:
--     o pagamento fica contestado, o projeto pausa e a entrega bloqueia. Antes da aprovação, nada muda (a base registra e não decide: nunca vira pago).
-- (e) o ALERTA para o aviso NA HORA ao dono: só o código do pedido, o evento (estorno, estorno_parcial, contestacao, restante_pago) e a parcela
--     (entrada, restante). Só quando o estado MUDOU de verdade na order que pagou a parcela (o aviso repetido do provedor não alerta de novo; a order
--     duplicada, que a equipe mesma reembolsa, também não).
alter function app.pagamentos_aplicar(jsonb) rename to pagamentos_aplicar_base;
revoke all on function app.pagamentos_aplicar_base(jsonb) from public, anon, authenticated, service_role;

create function app.pagamentos_aplicar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_prov text := p ->> 'provedor'; v_order text := p -> 'retrato' ->> 'order_id'; v_estado text := coalesce(p -> 'retrato' ->> 'estado', '');
  v_origem text := case when p ->> 'origem' in ('criacao', 'webhook', 'consulta', 'reconciliacao', 'operacao') then p ->> 'origem' else 'consulta' end;   -- (a mesma regra da base: a trilha só aceita estas)
  v_tid uuid; v_cid uuid; t app.tentativas_pagamento; pg app.pagamentos; r jsonb; v_virou boolean := false; v_evento text; v_codigo text; v_cancelar jsonb;
begin
  -- as travas na ordem de sempre (conversa → pagamento → tentativa) ANTES de olhar o estado da tentativa; a base trava de novo (a mesma transação: não espera)
  select id into v_tid from app.tentativas_pagamento where provedor = v_prov and provedor_order_id = v_order;
  if v_tid is not null then
    select pr.conversa_id into v_cid from app.tentativas_pagamento t2 join app.pagamentos p2 on p2.id = t2.pagamento_id
      join app.propostas pr on pr.id = p2.proposta_id where t2.id = v_tid;
    perform 1 from app.conversas where id = v_cid for update;
    select p2.* into pg from app.pagamentos p2 join app.tentativas_pagamento t2 on t2.pagamento_id = p2.id where t2.id = v_tid for update of p2;
    select * into t from app.tentativas_pagamento where id = v_tid for update;
    if v_estado = 'desconhecido' and t.status in ('aprovada', 'estornada_parcial', 'contestada_revertida') and pg.gateway_ref = v_order then
      p := jsonb_set(p, '{retrato,estado}', '"contestada"');
      v_virou := true;
    end if;
  end if;

  r := app.pagamentos_aplicar_base(p);

  if r ->> 'aplicado' is null or r ? 'divergencia' then return r; end if;
  if v_tid is null then
    -- (a resposta da criação se perdeu: a base achou a tentativa pela referência e acabou de vincular a order; ainda sem dinheiro antes, então o (d) não se aplica)
    select id into v_tid from app.tentativas_pagamento where provedor = v_prov and provedor_order_id = v_order;
    if v_tid is null then return r; end if;
    select pr.conversa_id into v_cid from app.tentativas_pagamento t2 join app.pagamentos p2 on p2.id = t2.pagamento_id
      join app.propostas pr on pr.id = p2.proposta_id where t2.id = v_tid;
    select p2.* into pg from app.pagamentos p2 join app.tentativas_pagamento t2 on t2.pagamento_id = p2.id where t2.id = v_tid;
  end if;
  if v_virou and r ->> 'aplicado' = 'contestada' then
    perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.unknown_status', v_prov, v_order, v_origem, t.status, 'contestada',
      jsonb_build_object('motivo', 'estado não reconhecido depois da aprovação: tratado como contestação', 'status', left(p -> 'retrato' -> 'pagamento' ->> 'status', 40),
                         'status_detail', left(p -> 'retrato' -> 'pagamento' ->> 'status_detail', 60)), p ->> 'request_id');
  end if;
  -- (revisão 2, item 5) o rastro do restante pago com a entrega bloqueada vem ANTES do trecho que monta o alerta: se a montagem falhar, o rastro (que a rotina diária conta em
  -- pagamentos_atencao) já está gravado e o dono o vê no painel. Uma vez só (auditar_uma_vez, a mesma de concluir_entrega); um erro aqui também NUNCA derruba o pagamento
  begin
    select * into pg from app.pagamentos where id = pg.id;
    if pg.gateway_ref is not distinct from v_order and r ->> 'aplicado' = 'aprovada' and pg.parcela = 'saldo'
       and exists (select 1 from app.entregas e where e.proposta_id = pg.proposta_id and privado.entrega_bloqueada(e)) then
      perform privado.auditar_uma_vez(pg.org_id, pg.id, null, 'project.error', 'sistema', v_order, 'operacao', null, null,
        jsonb_build_object('motivo', 'restante pago com a entrega bloqueada: o dinheiro entrou e nada vai ao ar; devolver ou resolver com o Mercado Pago'), null);
    end if;
  exception when others then
    raise warning 'rastro do restante pago bloqueado não gravado (order %): %', v_order, sqlerrm;
  end;
  -- o alerta é só leitura e NUNCA derruba o pagamento já aplicado (a mesma regra do gatilho da entrega): qualquer erro aqui devolve o resultado sem alerta
  begin
  select * into pg from app.pagamentos where id = pg.id;
  if pg.gateway_ref is distinct from v_order then return r; end if;   -- (a order duplicada, reembolsada pela equipe: sem alerta)
  v_evento := case when r ->> 'aplicado' = 'estornada' then 'estorno'
                   when r ->> 'aplicado' = 'estornada_parcial' then 'estorno_parcial'
                   when r ->> 'aplicado' = 'contestada' then 'contestacao'
                   -- (o restante pago com a entrega JÁ bloqueada, p. ex. o Pix emitido antes do estorno da entrada: o dinheiro entrou e nada vai ao ar; avisa também, e a revisão E
                   -- deixa o rastro abaixo para a rotina diária)
                   when r ->> 'aplicado' = 'aprovada' and pg.parcela = 'saldo'
                        and exists (select 1 from app.entregas e where e.proposta_id = pg.proposta_id and privado.entrega_bloqueada(e)) then 'restante_pago_bloqueada'
                   -- (o restante pago avisa só na ordem nova: a entrega aprovada, sem bloqueio, espera o dono pôr no ar; as antigas concluem sozinhas)
                   when r ->> 'aplicado' = 'aprovada' and pg.parcela = 'saldo'
                        and exists (select 1 from app.entregas e where e.proposta_id = pg.proposta_id and e.passo = 'aprovada' and not privado.entrega_bloqueada(e)) then 'restante_pago' end;
  if v_evento is null then return r; end if;
  -- (o alerta só vive na RESPOSTA desta chamada: se ela se perder depois do commit, o aviso repetido do provedor não alerta de novo; o rastro acima já está gravado no MESMO commit)
  select codigo into v_codigo from app.pedidos where conversa_id = v_cid;
  -- (S2) a entrada caiu: o Pix do restante que estiver aberto não pode ser pago (nada vai ao ar). O banco lista as orders; o servidor cancela no provedor (melhor esforço)
  if v_evento in ('estorno', 'estorno_parcial', 'contestacao') and pg.parcela = 'sinal' then
    select coalesce(jsonb_agg(jsonb_build_object('tentativa_id', t3.id, 'order', t3.provedor_order_id) order by t3.created_at), '[]'::jsonb) into v_cancelar
      from app.tentativas_pagamento t3 join app.pagamentos p3 on p3.id = t3.pagamento_id
     where p3.proposta_id = pg.proposta_id and p3.parcela = 'saldo' and t3.status in ('criada', 'aguardando', 'requer_acao', 'processando') and t3.provedor_order_id is not null;
  end if;
  return r || case when coalesce(jsonb_array_length(v_cancelar), 0) > 0 then jsonb_build_object('cancelar_restante', v_cancelar) else '{}'::jsonb end || jsonb_build_object('alerta', jsonb_strip_nulls(jsonb_build_object('codigo', v_codigo, 'evento', v_evento,
    'parcela', case when pg.parcela = 'sinal' then 'entrada' else 'restante' end)));
  exception when others then
    raise warning 'alerta do pagamento não montado (order %): %', v_order, sqlerrm;
    return r;
  end;
end $$;

-- ---------- a lista do painel e do `listar`: a de 20261024120400_pr3b3_lista.sql com `bloqueada` e `restante_pago` (o próximo passo certo: esperar o restante ou pôr no ar) ----------
-- (revisão técnica B) o pedido CONCLUÍDO (site no ar) continua na lista por 30 dias, o mesmo prazo do link de retomada: a passagem do site para a conta do cliente é MANUAL e
-- ainda não tem marca própria no banco; sem isso, uma contestação entre o "no ar" e a passagem só apareceria no e-mail. Passados os 30 dias o item sai sozinho.
create or replace function app.vendas_entregas_lista(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; r record; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  for r in select c.id from app.conversas c where c.org_id = v_org and c.etapa = 'em_producao' and not exists (select 1 from app.entregas e where e.conversa_id = c.id) loop
    perform privado.garantir_entrega(r.id);
  end loop;
  select coalesce(jsonb_agg(q.x order by q.x ->> 'criada_em'), '[]'::jsonb) into v_itens from (
    select jsonb_build_object(
      'codigo', pd.codigo, 'passo', e.passo, 'material_status', m.status, 'enviado_em', m.enviado_em, 'importado_em', m.importado_em,
      'entrada_em', e.prazo ->> 'entrada_em', 'entrega_ate', e.entrega_ate, 'prazo_dias', e.prazo_dias, 'prazo', e.prazo,
      'dias_desde_entrada', (now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date,
      'arquivos', (select count(*) from app.material_arquivos a where a.entrega_id = e.id and a.status = 'conferido'),
      'formato', c.briefing #>> '{projeto,formato}', 'segmento', c.briefing #>> '{negocio,segmento}',
      'cliente_captacao', e.cliente_captacao, 'tem_whatsapp', coalesce(m.dados ->> 'whatsapp', '') <> '',
      'autorizacao_marcada', coalesce(m.autorizacao ->> 'marcada', '') = 'true', 'tem_uf', coalesce(m.negocio ->> 'uf', '') <> '',
      'rodadas', jsonb_build_object('usadas', e.rodadas_usadas, 'max', e.rodadas_max),
      'ajustes_na_fila', (select count(*) from app.entrega_ajustes ea where ea.entrega_id = e.id and ea.status = 'na_fila'),
      'ajustes_com_contato', (select count(*) from app.entrega_ajustes ea where ea.entrega_id = e.id and ea.status = 'na_fila' and (ea.contato_whatsapp is not null or ea.contato_email is not null)),
      'previa_url', e.previa_url, 'previa_em', e.previa_em,
      'dias_na_previa', case when e.passo = 'previa' then (now() at time zone 'America/Campo_Grande')::date - (e.previa_em at time zone 'America/Campo_Grande')::date end,
      'no_ar_em', e.no_ar_em, 'concluida_em', e.concluida_em,
      'dias_no_ar', case when e.no_ar_em is not null then (now() at time zone 'America/Campo_Grande')::date - (e.no_ar_em at time zone 'America/Campo_Grande')::date end,
      'aviso_material_em', e.aviso_material_em, 'aviso_no_ar_feito_em', e.aviso_no_ar_feito_em,
      'aviso_apagar_material_em', e.aviso_apagar_material_em, 'material_apagado_em', e.material_apagado_em, 'apagar_material_devido', privado.material_apagar_devido(e),
      'dias_do_aviso', case when e.aviso_no_ar_feito_em is not null then (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date end,
      'lembrete_restante_1_em', e.lembrete_restante_1_em, 'lembrete_restante_2_em', e.lembrete_restante_2_em,
      'aviso_previa_pendente', e.aviso_previa_desde is not null, 'aviso_no_ar_pendente', e.aviso_no_ar_desde is not null,
      'religar_pendente', e.religar_pendente, 'criada_em', e.created_at,
      'bloqueada', privado.entrega_bloqueada(e), 'bloqueada_desde', privado.entrega_bloqueada_desde(e), 'restante_pago', privado.parcela_quitada(e.proposta_id, 'saldo'), 'restante_pago_em', privado.restante_pago_em(e)) as x
      from app.entregas e
      join app.materiais m on m.entrega_id = e.id
      join app.conversas c on c.id = e.conversa_id
      left join app.pedidos pd on pd.conversa_id = c.id
     where e.org_id = v_org and (e.passo not in ('concluida', 'encerrada') or e.religar_pendente
             or (e.passo = 'concluida' and e.site_url is not null and e.concluida_em > now() - interval '30 days'))
     -- (revisão 2, item 3) os pedidos em aberto vêm primeiro: com mais de 100 itens, o corte tira os concluídos que esperam a passagem, nunca um pedido em andamento
     order by (e.passo in ('concluida', 'encerrada') and not e.religar_pendente), e.created_at, e.id limit 100
  ) q;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

-- ---------- a retomada do pedido concluído (19/11): na ordem nova, pôr no ar conclui o pedido e encerra a conversa, mas o aviso "seu site está no ar" do dono
-- leva um link de retomada (painel › Avisos). A conversa encerrada com a entrega CONCLUÍDA (site no ar) há até 30 dias passa a aceitar o link (o mesmo prazo do link do
-- pedido, privado.encerrar_links_do_pedido): abre o recibo final. As de 20261016120000_pr2b2_retomada.sql, só com a conferência da etapa trocada por esta ----------
create function privado.conversa_retomavel(c app.conversas) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.etapa_retomavel(c.etapa)
      or (c.etapa = 'encerrada' and exists (select 1 from app.entregas e where e.conversa_id = c.id and e.passo = 'concluida' and e.site_url is not null
                                                and e.concluida_em > now() - interval '30 days'));
$$;
revoke all on function privado.conversa_retomavel(app.conversas) from public, anon, authenticated, service_role;

create or replace function app.vendas_criar_retomada(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_dias integer; v_expira timestamptz;
begin
  if coalesce(p ->> 'codigo_hash', '') !~ '^[0-9a-f]{64}$' or coalesce(p ->> 'dias', '') !~ '^[0-9]{1,2}$' then
    raise exception 'retomada: parâmetros inválidos' using errcode = '22023';
  end if;
  v_dias := (p ->> 'dias')::integer;
  if v_dias not between 1 and 14 then raise exception 'retomada: validade inválida' using errcode = '22023'; end if;
  select cv.* into c from app.conversas cv join app.organizacoes o on o.id = cv.org_id
   where cv.id = (p ->> 'conversa_id')::uuid and o.slug = p ->> 'org_slug'
   for update of cv;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  if not privado.conversa_retomavel(c)
     or not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    raise exception 'retomada: só para pedido confirmado, nas etapas do pedido' using errcode = '55000';
  end if;
  -- um link valendo por vez: o novo apaga os que não foram usados
  delete from app.retomadas where conversa_id = c.id and usada_em is null;
  v_expira := now() + make_interval(days => v_dias);
  insert into app.retomadas (org_id, conversa_id, codigo_hash, expira_em) values (c.org_id, c.id, p ->> 'codigo_hash', v_expira);
  perform privado.evento(c.org_id, c.id, 'retomada_criada');
  return jsonb_build_object('expira_em', v_expira);
end $$;

create or replace function app.vendas_usar_retomada(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_conversa uuid; c app.conversas; r app.retomadas; v_vid uuid;
begin
  if coalesce(p ->> 'codigo_hash', '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false); end if;
  v_vid := (p ->> 'visitante_id')::uuid;
  -- 1º a conversa (sem trava, só para saber qual), depois a trava da conversa, depois a da retomada: a mesma ordem do criar
  select rt.conversa_id into v_conversa from app.retomadas rt join app.organizacoes o on o.id = rt.org_id
   where rt.codigo_hash = p ->> 'codigo_hash' and o.slug = p ->> 'org_slug';
  if not found then return jsonb_build_object('ok', false); end if;
  select * into c from app.conversas where id = v_conversa for update;
  select * into r from app.retomadas where codigo_hash = p ->> 'codigo_hash' and conversa_id = v_conversa for update;
  if not found or r.usada_em is not null or r.expira_em <= now() or not privado.conversa_retomavel(c)
     or not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    return jsonb_build_object('ok', false);
  end if;
  update app.retomadas set usada_em = now() where id = r.id;
  update app.conversas set visitante_id = v_vid, ultima_atividade = now() where id = c.id;
  update app.escolhas set visitante_id = v_vid where conversa_id = c.id;
  perform privado.evento(c.org_id, c.id, 'retomada_usada');
  return jsonb_build_object('ok', true, 'conversa_id', c.id);
end $$;

-- ---------- a leitura do CLIENTE (revisão técnica F): a de 20261024120200_pr3b3_restante.sql com dois sinais a mais, para a tela não dizer "Restante pago" quando o restante foi
-- estornado em parte (o registro do pagamento continua "pago") nem prometer o ar com a entrega bloqueada. Só dois booleanos (nenhum código, motivo ou valor novo):
-- em cada pagamento, "quitada" (privado.parcela_quitada); na entrega, "bloqueada" (privado.entrega_bloqueada). A tela troca a frase; o resto da leitura é o mesmo ----------
create or replace function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_conversa uuid; e app.entregas;
begin
  r := app.vendas_estado_pr3b2(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  v_conversa := (r #>> '{conversa,id}')::uuid;
  if r #>> '{conversa,etapa}' = 'em_producao' then
    -- a leitura conserta o que faltou, mas NUNCA quebra a tela: se a conclusão falhar de novo, o cliente vê o estado como está e o erro fica no aviso do banco
    begin
      if privado.concluir_pendente(v_conversa) then r := app.vendas_estado_pr3b2(p); end if;
    exception when others then
      raise warning 'conclusão pendente não feita para a conversa %: %', v_conversa, sqlerrm;
    end;
  end if;
  r := jsonb_set(r, '{pagamentos}', coalesce((
         select jsonb_agg(x.item || jsonb_build_object('quitada', coalesce((select privado.parcela_quitada(pg.proposta_id, pg.parcela) from app.pagamentos pg where pg.id = (x.item ->> 'id')::uuid), false)) order by x.n)
           from jsonb_array_elements(coalesce(r -> 'pagamentos', '[]'::jsonb)) with ordinality as x(item, n)), '[]'::jsonb));
  select * into e from app.entregas where conversa_id = v_conversa;
  if found and jsonb_typeof(r -> 'entrega') = 'object' then
    r := jsonb_set(r, '{entrega,bloqueada}', to_jsonb(privado.entrega_bloqueada(e)));
  end if;
  return r;
end $$;

-- ---------- a aprovação da prévia (20/11, dono): o prazo PARA quando o cliente aprova (a bola está com o cliente). A de 20261024120100_pr3b3_previa.sql, igual, menos o
-- jsonb_strip_nulls que apagava o "ate": null da pausa aberta: agora a pausa aberta na publicação da prévia continua aberta depois da aprovação (calcularEntregarAte e
-- prazoVencido já a tratam: aberta, não vence; o scripts/prazo-real tira esse tempo dos dias reais). Mesma assinatura e mesmos privilégios ----------
create or replace function app.vendas_previa_aprovar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_agora timestamptz; v_versao_vista timestamptz; v_conversa uuid; v_visitante uuid;
begin
  if coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' or jsonb_typeof(p -> 'prazo') is distinct from 'object' then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end if;
  begin
    v_agora := (p ->> 'agora')::timestamptz; v_versao_vista := (p ->> 'versao')::timestamptz;
    v_conversa := (p ->> 'conversa_id')::uuid; v_visitante := (p ->> 'visitante_id')::uuid;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'previa: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_trava(v_conversa, v_visitante, array['previa']);
  if e.updated_at is distinct from v_versao_vista then raise exception 'a prévia mudou' using errcode = '40001'; end if;
  update app.entregas set passo = 'aprovada', aprovada_em = v_agora, prazo = prazo || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p -> 'prazo') as t(k, v) where k in ('conta_desde', 'pausas')), updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'previa_aprovada');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- o material de uma entrega BLOQUEADA (20/11, dono: "60 dias") ----------
-- Estorno, estorno parcial, contestação ou projeto pausado bloqueiam a entrega; o material que o cliente enviou fica GUARDADO por 60 dias contados do bloqueio e depois entra na
-- limpeza normal (arquivos pela reconciliação, campos pela rotina; app.rotinas_material_pendencias e _baixar já usam privado.material_vencido_pelo_fim). Antes, o sinal estornado
-- tirava o material no dia seguinte e os outros bloqueios nunca o tiravam. Na última semana (dia 53 a 59) a rotina diária avisa o dono (alerta "material_bloqueado", só contagem).
-- Desbloqueada, volta à regra de sempre. "Desde quando": o último movimento que bloqueia (a tentativa estornada, estornada em parte, contestada ou divergente; o pagamento estornado ou
-- contestado; o projeto pausado ou cancelado); sem nenhum registro, a criação da entrega.
-- (T2, revisão técnica) quando o restante foi QUITADO (nulo se não está): o alarme "restante pago e o site ainda fora do ar" conta a partir daqui
create function privado.restante_pago_em(e app.entregas) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when privado.parcela_quitada(e.proposta_id, 'saldo')
    then (select pg.pago_em from app.pagamentos pg where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo' and pg.status = 'pago' order by pg.pago_em desc limit 1) end;
$$;
revoke all on function privado.restante_pago_em(app.entregas) from public, anon, authenticated, service_role;

-- (S1, revisão de segurança) O "desde quando" NÃO pode ser o updated_at: o carimbo mexe nele a cada UPDATE, e a reconciliação reaplica o mesmo retrato de hora em hora
-- (consultada_em = now()), o que reiniciaria os 60 dias para sempre. A marca nova, status_em, só anda quando o STATUS muda (e na criação). Linhas antigas, sem a marca, caem no updated_at.
alter table app.tentativas_pagamento add column status_em timestamptz;
alter table app.pagamentos add column status_em timestamptz;
alter table app.projetos add column status_em timestamptz;
-- (re-revisão) as linhas que já existem ganham a marca = o updated_at de hoje, ANTES dos gatilhos e em modo restauração (o carimbo não mexe em updated_at). Num bloco só,
-- para o modo valer mesmo fora de uma transação explícita da ferramenta de migrations
do $$
begin
  perform set_config('bz.restaurando', 'on', true);
  update app.tentativas_pagamento set status_em = updated_at where status_em is null;
  update app.pagamentos set status_em = updated_at where status_em is null;
  update app.projetos set status_em = updated_at where status_em is null;
  perform set_config('bz.restaurando', 'off', true);   -- o modo restauração não sobra para o resto da migration
end $$;

create function privado.carimbar_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status_em is null or not privado.restaurando() then new.status_em := now(); end if;
  elsif privado.restaurando() and new.status_em is distinct from old.status_em then
    null;   -- (a restauração de uma cópia, ou o teste que data o estado, escolhe a marca)
  elsif new.status is distinct from old.status then
    new.status_em := now();
  else
    new.status_em := coalesce(old.status_em, old.updated_at);   -- sem mudança de estado a marca não anda, nem se alguém tentar mudá-la; sem marca, congela no updated_at de ANTES deste UPDATE
  end if;
  return new;
end $$;
revoke all on function privado.carimbar_status() from public, anon, authenticated, service_role;
create trigger status_em before insert or update on app.tentativas_pagamento for each row execute function privado.carimbar_status();
create trigger status_em before insert or update on app.pagamentos for each row execute function privado.carimbar_status();
create trigger status_em before insert or update on app.projetos for each row execute function privado.carimbar_status();

create function privado.entrega_bloqueada_desde(e app.entregas) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when privado.entrega_bloqueada(e) then coalesce((
    select max(q.quando) from (
      select coalesce(t.status_em, t.updated_at) as quando from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id
       where pg.proposta_id = e.proposta_id and t.status in ('estornada', 'estornada_parcial', 'contestada', 'divergente')
      union all
      select coalesce(pg.status_em, pg.updated_at) from app.pagamentos pg where pg.proposta_id = e.proposta_id and pg.status in ('estornado', 'contestado')
      union all
      select coalesce(pj.status_em, pj.updated_at) from app.propostas pr join app.projetos pj on pj.id = pr.projeto_id where pr.id = e.proposta_id and pj.status in ('pausado', 'cancelado')
    ) q), e.created_at) end;
$$;
revoke all on function privado.entrega_bloqueada_desde(app.entregas) from public, anon, authenticated, service_role;

-- a guarda de 60 dias passou (por data de Campo Grande)
create function privado.material_bloqueado_vencido(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(privado.entrega_bloqueada(e)
    and (privado.entrega_bloqueada_desde(e) at time zone 'America/Campo_Grande')::date + 60 <= (now() at time zone 'America/Campo_Grande')::date, false);
$$;
revoke all on function privado.material_bloqueado_vencido(app.entregas) from public, anon, authenticated, service_role;

-- a última semana da guarda, com o que apagar: o aviso ao dono
create function privado.material_bloqueado_aviso(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(privado.entrega_bloqueada(e) and privado.material_tem_o_que_apagar(e)
    and (privado.entrega_bloqueada_desde(e) at time zone 'America/Campo_Grande')::date + 53 <= (now() at time zone 'America/Campo_Grande')::date
    and not privado.material_bloqueado_vencido(e), false);
$$;
revoke all on function privado.material_bloqueado_aviso(app.entregas) from public, anon, authenticated, service_role;

-- a de 20261023120300_pr3b2_dono.sql com a cláusula do sinal estornado trocada pela da entrega bloqueada (60 dias)
create or replace function privado.material_vencido_pelo_fim(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (e.passo = 'concluida' and e.updated_at < now() - interval '30 days')
    or (e.passo = 'encerrada' and e.updated_at < now() - interval '1 day')
    or privado.material_bloqueado_vencido(e), false);
$$;
revoke all on function privado.material_vencido_pelo_fim(app.entregas) from public, anon, authenticated, service_role;

alter table app.alertas drop constraint alertas_tipo_check;
alter table app.alertas add constraint alertas_tipo_check check (tipo in (
  'pagamento_atencao', 'teto_ia', 'ia_falhando', 'freio_ip', 'rotina_falhou', 'prazo_vencido', 'material_30_dias', 'restante_3_dias', 'material_apagar', 'material_bloqueado', 'site_parado'));

-- a lista da rotina e a conferência do dia: as de 20261024120300_pr3b3_rotina.sql com o aviso do material da entrega bloqueada
create or replace function app.rotinas_entregas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_apagados integer; v_itens jsonb;
begin
  -- a prova da autorização do contato do site é copiada na MESMA instrução do apagamento (atômica): o que o DELETE leva, e tem contato, vai para a prova (o que já foi copiado não duplica)
  with apagadas as (
    delete from app.entrega_ajustes a using app.entregas e
     where e.id = a.entrega_id and e.updated_at < now() - interval '30 days' and (a.status = 'feito' or e.passo in ('concluida', 'encerrada'))
    returning a.org_id, a.entrega_id, a.rodada, a.contato_whatsapp, a.contato_email, a.contato_autorizado_em, a.contato_autorizacao_versao),
  prova as (
    insert into app.entrega_contato_autorizacoes (org_id, entrega_id, rodada, contato_whatsapp, contato_email, contato_autorizado_em, contato_autorizacao_versao)
      select org_id, entrega_id, rodada, contato_whatsapp, contato_email, contato_autorizado_em, contato_autorizacao_versao
        from apagadas where contato_whatsapp is not null or contato_email is not null
      on conflict (entrega_id, rodada) do nothing
      returning 1)
  select count(*)::integer into v_apagados from apagadas;
  select coalesce(jsonb_agg(jsonb_build_object('passo', e.passo, 'prazo', e.prazo, 'prazo_dias', e.prazo_dias,
           'entrada_em', e.prazo ->> 'entrada_em', 'no_ar_em', e.no_ar_em, 'aviso_material_em', e.aviso_material_em, 'aviso_no_ar_feito_em', e.aviso_no_ar_feito_em,
           'apagar_material_devido', privado.material_apagar_devido(e),
           'material_bloqueado_apagar', privado.material_bloqueado_aviso(e), 'restante_pago_em', privado.restante_pago_em(e))), '[]'::jsonb) into v_itens
    -- (T1) a guarda de 60 dias do material vale em QUALQUER passo (o estorno pode vir depois de ver a prévia, com o site suspenso ou já concluído): esses passos entram só quando o aviso é devido
    from (select * from app.entregas x where x.passo in ('material', 'producao', 'ajustes', 'aprovada', 'no_ar')
             or (x.passo in ('previa', 'suspensa', 'concluida') and privado.material_bloqueado_aviso(x)) order by x.created_at limit 500) e;
  return jsonb_build_object('itens', v_itens, 'ajustes_apagados', v_apagados);
end $$;
revoke all on function app.rotinas_entregas(jsonb) from public, anon, authenticated;
grant execute on function app.rotinas_entregas(jsonb) to service_role;

create or replace function app.rotinas_conferir(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atencao integer; v_custo numeric; v_teto numeric := coalesce((p ->> 'teto_dia_usd')::numeric, 25);
  v_falhas integer; v_freios integer; v_falhou text := nullif(p ->> 'falha', '');
  v_avisado boolean;
  v_ent jsonb := case when jsonb_typeof(p -> 'entregas') = 'object' then p -> 'entregas' else '{}'::jsonb end;
  v_prazo integer := coalesce((v_ent ->> 'prazo_vencido')::integer, 0);
  v_mat integer := coalesce((v_ent ->> 'material_30')::integer, 0);
  v_resto integer := coalesce((v_ent ->> 'restante_vencido')::integer, 0);
  v_apagar integer := coalesce((v_ent ->> 'material_apagar')::integer, 0);
  v_bloq integer := coalesce((v_ent ->> 'material_bloqueado')::integer, 0);
  v_site integer := coalesce((v_ent ->> 'site_parado')::integer, 0);
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if v_org is null then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;

  select coalesce((app.pagamentos_atencao('{"horas": 24}'::jsonb) ->> 'total')::integer, 0) into v_atencao;
  select coalesce(sum(custo_usd), 0) into v_custo from app.ia_chamadas where org_id = v_org and created_at > now() - interval '24 hours';
  select count(*) into v_falhas from app.ia_chamadas where org_id = v_org and erro in ('tempo', 'limite', 'indisponivel', 'falha')
    and created_at > now() - interval '24 hours';
  select count(*) into v_freios from app.eventos_funil where org_id = v_org and tipo = 'freio_ip' and created_at > now() - interval '24 hours';

  if v_atencao > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'pagamento_atencao', 'urgente',
      v_atencao || ' evento(s) de pagamento pedem uma pessoa nas últimas 24 h (divergência, estorno, contestação ou projeto pausado).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_custo >= 0.8 * v_teto then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'teto_ia', case when v_custo >= v_teto then 'urgente' else 'aviso' end,
      'Gasto de IA nas últimas 24 h: US$ ' || replace(round(v_custo, 2)::text, '.', ',') || ' (teto do dia: US$ ' || replace(v_teto::text, '.', ',') || '; no teto, o agente para e oferece o WhatsApp).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_falhas >= coalesce((p ->> 'max_falhas_ia')::integer, 5) then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'ia_falhando', 'aviso',
      v_falhas || ' chamada(s) de IA falharam nas últimas 24 h (veja app.ia_chamadas).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_freios > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'freio_ip', 'aviso',
      v_freios || ' conversa(s) barradas pelo limite diário por endereço (abuso ou muita gente na mesma rede).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_falhou is not null then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'rotina_falhou', 'urgente',
      'A rotina diária falhou em: ' || left(v_falhou, 200))
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  -- (PR 3b-3, D4) os prazos da entrega: só contagem; o dono vê os pedidos com `node scripts/entregas.mjs listar`
  if v_prazo > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'prazo_vencido', 'urgente',
      v_prazo || ' entrega(s) com o prazo vencido: a regra da D4 devolve a entrada se a Beyon atrasar. Veja "entregas.mjs listar".')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_mat > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'material_30_dias', 'aviso',
      v_mat || ' pedido(s) com 30 dias ou mais sem o material e sem o aviso de material parado: veja "entregas.mjs listar" (dispensar, se o cliente autorizou expressamente; senão, o aviso de que se aguarda o material: o projeto fica parado, nada é publicado nem encerrado).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_resto > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'restante_3_dias', 'urgente',
      v_resto || ' site(s) com o prazo de 3 dias do restante vencido (passou da 00:00 depois do 3º dia do aviso "no ar"): veja "entregas.mjs listar" (suspender).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_apagar > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'material_apagar', 'aviso',
      v_apagar || ' pedido(s) parado(s) há 5 meses ou mais esperando o material ou a autorização: o material será apagado aos 6 meses, e o cliente precisa ser avisado 30 dias antes. Veja "entregas.mjs listar" (o aviso prévio é registrado pelo dono; sem ele, nada é apagado).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;

  -- (20/11, dono) o aviso ANTES de apagar: o material de uma entrega bloqueada é guardado por 60 dias e apagado no 61º; na última semana a rotina avisa (só contagem)
  if v_bloq > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'material_bloqueado', 'aviso',
      v_bloq || ' pedido(s) com a entrega bloqueada (estorno, contestação ou projeto pausado) cujo material será apagado em até 7 dias (a guarda é de 60 dias a partir do bloqueio). Veja o Mercado Pago e "entregas.mjs listar"; se o caso foi resolvido e o projeto reativado, o material deixa de ser apagado.')
    on conflict (org_id, dia, tipo) do nothing;
  end if;

  -- (20/11, revisão técnica) o prazo da Beyon parou na aprovação: o restante pago com o site fora do ar há dias não pode ficar sem ninguém ver (o e-mail único do restante pago só vai ao log se falhar)
  if v_site > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'site_parado', 'urgente',
      v_site || ' pedido(s) com o restante pago e o site ainda fora do ar há mais de 2 dias: veja "entregas.mjs listar" e ponha no ar (no-ar <código> <endereço>).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;

  insert into app.rotinas_execucoes (dia, rotina, ok, resultado)
  values (v_dia, 'diaria', v_falhou is null, jsonb_build_object('atencao', v_atencao, 'custo_dia', v_custo, 'falhas_ia', v_falhas, 'freios', v_freios,
                                                                'entregas', case when jsonb_typeof(p -> 'entregas') = 'object' then jsonb_build_object('prazo_vencido', v_prazo, 'material_30', v_mat, 'restante_vencido', v_resto, 'material_apagar', v_apagar, 'material_bloqueado', v_bloq, 'site_parado', v_site) end))
  on conflict (dia, rotina) do update set ok = excluded.ok, resultado = excluded.resultado, updated_at = now()
  returning avisado into v_avisado;

  return jsonb_build_object(
    'alertas', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'nivel', nivel, 'dia', dia, 'mensagem', mensagem) order by nivel desc, dia desc, tipo)
                         from app.alertas where org_id = v_org and dia > v_dia - 7 and resolvido_em is null
                           and (dia = v_dia or nivel = 'urgente')), '[]'),
    'avisar', not v_avisado);
end $$;
revoke all on function app.rotinas_conferir(jsonb) from public, anon, authenticated;
grant execute on function app.rotinas_conferir(jsonb) to service_role;

-- ---------- privilégios: os mesmos das funções originais (só o servidor) ----------
do $$
declare f text;
begin
  foreach f in array array['pagamentos_aplicar', 'pagamentos_iniciar_tentativa', 'pagamentos_estado', 'vendas_estado', 'vendas_previa_aprovar', 'vendas_entrega_info', 'vendas_no_ar',
                           'vendas_suspender', 'vendas_encerrar', 'vendas_avisos_lista', 'vendas_entregas_lista', 'vendas_criar_retomada', 'vendas_usar_retomada'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
