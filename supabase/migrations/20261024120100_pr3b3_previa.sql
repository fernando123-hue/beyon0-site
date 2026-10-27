-- ==========================================================================
-- PR 3b-3: A PRÉVIA (spec §2 e §3). Parte 1 (cliente): o que a tela recebe (privado.entrega_json estendido), a lista de ajustes e a aprovação.
-- Toda função: conversa_do (dono da sessão) → entrega no passo exigido (privado.entrega_trava, que também confere o sinal pago) → o resto.
-- Ordem de travas: conversa → entrega (a mesma de todas as funções de entrega; nunca o contrário).
-- Recusa de regra volta como { ok: false, motivo }; exceção só para dono errado (P0002), passo errado ou sinal estornado (55000),
-- dado malformado (22023) e corrida (40001).
-- O PRAZO é calculado no servidor (JS, a regra da captação) e chega pronto; o banco guarda e confere a `versao` (entregas.updated_at).
-- D5: nenhuma função daqui é de rotina e nenhuma aprova por tempo. Só estas duas mudam previa → ajustes/aprovada, e só no nome do cliente dono da conversa.
-- Aplicar DEPOIS de 20261024120000_pr3b3_esquema.sql. As próximas tarefas acrescentam seções ao fim deste arquivo.
-- ==========================================================================

-- ==========================================================================
-- SEÇÃO 1. O que a tela recebe (privado.entrega_json)
-- ==========================================================================
-- (já existe, criada na 3b-2 com `create function`; aqui `create or replace` com a MESMA assinatura)
-- O texto da lista de ajustes, o telefone e o e-mail do site NUNCA entram aqui.

create or replace function privado.entrega_json(p_conversa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; pr app.propostas; v_dias integer;
begin
  select * into e from app.entregas where conversa_id = p_conversa;
  if not found then return null; end if;
  select * into m from app.materiais where entrega_id = e.id;
  select * into pr from app.propostas where id = e.proposta_id;
  -- dias CORRIDOS desde o REGISTRO do aviso "seu site está no ar", no dia de Campo Grande (a regra de 22/10: o restante vale 3 dias a partir dele; antes do registro, nulo)
  v_dias := case when e.aviso_no_ar_feito_em is null then null
                 else (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date end;
  return jsonb_build_object(
    'id', e.id, 'passo', e.passo, 'prazo_dias', e.prazo_dias, 'entrega_ate', e.entrega_ate, 'prazo', e.prazo,
    'entrada_paga_em', e.prazo ->> 'entrada_em',
    'versao', e.updated_at,
    'importada', e.cliente_captacao is not null,
    'percentuais', jsonb_build_object('entrada', pr.sinal_percentual, 'restante', 100 - pr.sinal_percentual),
    'link_pedido', exists (select 1 from app.links_pedido l where l.conversa_id = p_conversa and l.revogado_em is null and l.valido_ate > now()),
    'rodadas', jsonb_build_object('usadas', e.rodadas_usadas, 'max', e.rodadas_max),
    'previa', jsonb_build_object('url', e.previa_url, 'em', e.previa_em),
    'site', jsonb_build_object('url', e.site_url, 'no_ar_em', e.no_ar_em, 'aviso_em', e.aviso_no_ar_feito_em, 'dias_do_aviso', v_dias, 'limite_dias', 3),
    'aprovada_em', e.aprovada_em, 'suspensa_em', e.suspensa_em, 'concluida_em', e.concluida_em,
    'material', jsonb_build_object('status', m.status, 'dados', m.dados, 'negocio', m.negocio, 'autorizacao', m.autorizacao,
      'enviado_em', m.enviado_em, 'updated_at', m.updated_at,
      'arquivos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'papel', a.papel, 'ordem', a.ordem,
                              'tamanho', coalesce(a.tamanho_real, a.tamanho_declarado), 'status', a.status) order by a.papel, a.ordem, a.created_at)
                              from app.material_arquivos a where a.entrega_id = e.id and a.status in ('reservado', 'conferido')), '[]'::jsonb)));
end $$;

-- ==========================================================================
-- SEÇÃO 2. As ações do cliente na prévia: a lista de ajustes e aprovar
-- ==========================================================================

-- ---------- a lista de ajustes: previa → ajustes (conta 1 rodada; a 3ª é recusada, D2) ----------
-- O texto livre já chega REDIGIDO pelo servidor. O WhatsApp/telefone e o e-mail DO SITE (M3, 22/10) chegam em campos próprios, já normalizados, e só valem com a
-- autorização de uso no site (a mesma do material): o banco confere o formato de novo (a mesma regra da tela e do servidor) e grava a data da autorização.
create function app.vendas_previa_ajustes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_texto text := btrim(coalesce(p ->> 'texto', '')); v_agora timestamptz; v_versao_vista timestamptz; v_ate date; v_conversa uuid; v_visitante uuid;
        v_whats text := nullif(btrim(coalesce(p ->> 'whatsapp', '')), ''); v_email text := nullif(btrim(coalesce(p ->> 'email', '')), '');
        v_versao text := nullif(btrim(coalesce(p ->> 'autorizacao_versao', '')), '');
begin
  if char_length(v_texto) > 1500 or (v_texto = '' and v_whats is null and v_email is null) or coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = ''
     or jsonb_typeof(p -> 'prazo') is distinct from 'object' or coalesce(p ->> 'entrega_ate', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p ->> 'rodada_base', '') !~ '^[0-9]{1,2}$' then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end if;
  -- o contato do site: formato, tamanho e autorização (a mesma regra do check da tabela)
  if (v_whats is not null and v_whats !~ '^\+55[1-9][1-9](9[0-9]{8}|[2-8][0-9]{7})$')
     or (v_email is not null and (char_length(v_email) > 120 or char_length(split_part(v_email, '@', 1)) > 64
         or v_email !~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'))
     or ((v_whats is not null or v_email is not null) and (v_versao is null or char_length(v_versao) > 20)) then
    raise exception 'previa: contato do site inválido' using errcode = '22023';
  end if;
  -- datas e ids malformados (ex.: 2026-02-31) são dado ruim, não erro de conversão
  begin
    v_agora := (p ->> 'agora')::timestamptz; v_versao_vista := (p ->> 'versao')::timestamptz; v_ate := (p ->> 'entrega_ate')::date;
    v_conversa := (p ->> 'conversa_id')::uuid; v_visitante := (p ->> 'visitante_id')::uuid;
  exception when others then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'previa: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_trava(v_conversa, v_visitante, array['previa']);
  if e.updated_at is distinct from v_versao_vista or e.rodadas_usadas <> (p ->> 'rodada_base')::integer then
    raise exception 'a prévia mudou enquanto você escrevia' using errcode = '40001';
  end if;
  if e.rodadas_max is not null and e.rodadas_usadas >= e.rodadas_max then return jsonb_build_object('ok', false, 'motivo', 'rodadas'); end if;
  insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto, contato_whatsapp, contato_email, contato_autorizado_em, contato_autorizacao_versao)
  values (e.org_id, e.id, e.rodadas_usadas + 1, v_texto, v_whats, v_email,
          case when v_whats is not null or v_email is not null then v_agora end, case when v_whats is not null or v_email is not null then v_versao end);
  update app.entregas set passo = 'ajustes', rodadas_usadas = rodadas_usadas + 1, prazo = prazo || (p -> 'prazo'),
         entrega_ate = v_ate, updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'previa_ajustes', jsonb_build_object('rodada', e.rodadas_usadas + 1));
  return jsonb_build_object('ok', true, 'rodada', e.rodadas_usadas + 1);
end $$;

-- ---------- aprovar: previa → aprovada (só o cliente, D5) ----------
create function app.vendas_previa_aprovar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_agora timestamptz; v_versao_vista timestamptz; v_conversa uuid; v_visitante uuid;
begin
  if coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' or jsonb_typeof(p -> 'prazo') is distinct from 'object' then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end if;
  begin
    v_agora := (p ->> 'agora')::timestamptz; v_versao_vista := (p ->> 'versao')::timestamptz;
    v_conversa := (p ->> 'conversa_id')::uuid; v_visitante := (p ->> 'visitante_id')::uuid;
  exception when others then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'previa: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_trava(v_conversa, v_visitante, array['previa']);
  if e.updated_at is distinct from v_versao_vista then raise exception 'a prévia mudou' using errcode = '40001'; end if;
  update app.entregas set passo = 'aprovada', aprovada_em = v_agora, prazo = prazo || (p -> 'prazo'), updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'previa_aprovada');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- permissões: só o servidor (service_role) chama ----------
do $$
declare f text;
begin
  foreach f in array array['vendas_previa_ajustes', 'vendas_previa_aprovar'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;

-- ==========================================================================
-- PARTE 2 (o dono, pelo painel): funções com org_slug e codigo (BZ-…), sem visitante. Trava conversa → entrega (privado.entrega_do_dono).
-- ==========================================================================
create function privado.entrega_do_dono(p jsonb, p_passos text[]) returns app.entregas
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
revoke all on function privado.entrega_do_dono(jsonb, text[]) from public, anon, authenticated, service_role;

-- o que o JS precisa ler antes de calcular o prazo (só leitura, sem trava)
create function app.vendas_entrega_info(p jsonb) returns jsonb
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
    'material', jsonb_build_object('status', m.status, 'dados', m.dados, 'negocio', m.negocio, 'autorizacao', m.autorizacao));
end $$;

-- ---------- publicar a prévia: producao | ajustes → previa ----------
create function app.vendas_previa_publicar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_url text := p ->> 'url'; v_agora timestamptz;
begin
  if coalesce(v_url, '') = '' or coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' or jsonb_typeof(p -> 'prazo') is distinct from 'object' then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end if;
  v_agora := (p ->> 'agora')::timestamptz;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'previa: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_do_dono(p, array['producao', 'ajustes']);
  if e.updated_at is distinct from (p ->> 'versao')::timestamptz then raise exception 'a entrega mudou' using errcode = '40001'; end if;
  if e.cliente_captacao is null then return jsonb_build_object('ok', false, 'motivo', 'sem_importado'); end if;
  -- a rede de baixo: o endereço é do PROJETO desta entrega (o JS já conferiu com a mensagem certa)
  if v_url !~ ('^https://v[0-9]{1,2}\.bz-' || e.cliente_captacao || '\.pages\.dev/?$') then return jsonb_build_object('ok', false, 'motivo', 'endereco'); end if;
  update app.entrega_ajustes set status = 'feito', feito_em = v_agora where entrega_id = e.id and status = 'na_fila';
  update app.entregas set passo = 'previa', previa_url = v_url, previa_em = v_agora, prazo = prazo || (p -> 'prazo'),
         aviso_previa_desde = v_agora, updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'previa_pronta');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- pôr no ar: aprovada → no_ar (D5: SÓ depois de o cliente aprovar) ----------
create function app.vendas_no_ar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_url text := p ->> 'url'; v_agora timestamptz;
begin
  if coalesce(v_url, '') = '' or coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' then raise exception 'no ar: parâmetros inválidos' using errcode = '22023'; end if;
  v_agora := (p ->> 'agora')::timestamptz;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'no ar: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_do_dono(p, array['aprovada']);
  if e.updated_at is distinct from (p ->> 'versao')::timestamptz then raise exception 'a entrega mudou' using errcode = '40001'; end if;
  -- (B4) a rede de baixo barra o que o JS já barra: domínio com ponto e TLD só de letras (nada de localhost, IP ou número)
  if v_url !~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/?$' then return jsonb_build_object('ok', false, 'motivo', 'endereco'); end if;
  update app.entregas set passo = 'no_ar', site_url = v_url, no_ar_em = v_agora, aviso_no_ar_desde = v_agora, updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'site_no_ar');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- suspender: no_ar → suspensa (D4, 22/10): 3 dias corridos do REGISTRO do aviso "no ar"; à 00:00 depois do 3º dia o site sai do ar ----------
-- O dia do aviso é o dia 0: o último lembrete é do dia 3 e o site só pode sair com 4 dias ou mais (a primeira 00:00 depois do 3º dia), no dia de Campo Grande. O site NÃO suspende
-- sozinho (a ação é do dono; a rotina diária só conta o alarme). Sem o aviso registrado a contagem não começou. Os lembretes (2º e 3º dia) são registrados à parte: aqui só se
-- devolve quantos foram (a trava de verdade é a da captação, que exige os 2). Com um Pix do restante em andamento, espere: o cliente pode estar pagando.
create function app.vendas_suspender(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_dias integer;
begin
  e := privado.entrega_do_dono(p, array['no_ar']);
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

-- ---------- encerrar: qualquer passo menos concluida/encerrada; motivo de LISTA FECHADA (nunca silêncio do cliente, D5) ----------
create function app.vendas_encerrar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_motivo text := p ->> 'motivo';
begin
  if v_motivo is null or v_motivo not in ('desistencia', 'atraso', 'producao_manual', 'outro') then
    raise exception 'encerrar: motivo fora da lista' using errcode = '22023';
  end if;
  e := privado.entrega_do_dono(p, array['material', 'producao', 'previa', 'ajustes', 'aprovada', 'no_ar', 'suspensa']);
  -- (22/10) não existe encerrar por falta de material: o pedido sem material fica PARADO e não se encerra (o motivo `sem_material` saiu da lista fechada)
  -- fechar com uma cobrança do restante viva deixaria dinheiro entrar sem entrega: espere o Pix expirar (1 h) ou cancele no Mercado Pago
  if exists (select 1 from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id
              where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo' and t.status in ('criada', 'processando', 'aguardando', 'requer_acao')) then
    return jsonb_build_object('ok', false, 'motivo', 'pagamento_em_andamento');
  end if;
  update app.pagamentos set status = 'cancelado' where proposta_id = e.proposta_id and parcela = 'saldo' and status = 'pendente';
  update app.entregas set passo = 'encerrada', encerrada_em = now(), encerrada_motivo = v_motivo, aviso_previa_desde = null, aviso_no_ar_desde = null, updated_at = now() where id = e.id;
  update app.conversas set etapa = 'encerrada', ultima_atividade = now() where id = e.conversa_id and etapa = 'em_producao';
  update app.projetos set status = 'cancelado' where id = (select projeto_id from app.propostas where id = e.proposta_id) and status in ('pronto_para_producao', 'em_producao', 'em_revisao', 'pausado');
  perform privado.encerrar_links_do_pedido(e.conversa_id, 30);   -- (a 3b-2 deixou pronto: o link passa a valer só mais 30 dias)
  perform privado.evento(e.org_id, e.conversa_id, 'entrega_encerrada', jsonb_build_object('motivo', v_motivo));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- dispensar o material (D4, dia 30): material → producao, SÓ com o número AUTORIZADO (captação, resposta 3); sem a autorização expressa do cliente nada é publicado (22/10) ----------
create function app.vendas_material_dispensar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; v_agora timestamptz; v_dias integer;
begin
  if coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' or jsonb_typeof(p -> 'prazo') is distinct from 'object' or coalesce(p ->> 'entrega_ate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'dispensar: parâmetros inválidos' using errcode = '22023';
  end if;
  v_agora := (p ->> 'agora')::timestamptz;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'dispensar: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_do_dono(p, array['material']);
  if e.updated_at is distinct from (p ->> 'versao')::timestamptz then raise exception 'a entrega mudou' using errcode = '40001'; end if;
  v_dias := coalesce((now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date, 0);   -- (entrada_em ausente conta como dia 0: a trava dos 30 dias falha FECHADA)
  if v_dias < 30 then return jsonb_build_object('ok', false, 'motivo', 'cedo', 'dias', v_dias); end if;
  select * into m from app.materiais where entrega_id = e.id for update;
  if m.status <> 'rascunho' then return jsonb_build_object('ok', false, 'motivo', 'estado'); end if;
  if coalesce(m.dados ->> 'whatsapp', '') = '' or coalesce(m.autorizacao ->> 'marcada', '') <> 'true' or coalesce(m.negocio ->> 'uf', '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem_numero');
  end if;
  -- o que não chegou a ser conferido não vai no pacote (a reconciliação apaga o objeto)
  update app.material_arquivos set status = 'removido', removido_em = now(), motivo = coalesce(motivo, 'dispensa') where entrega_id = e.id and status in ('reservado', 'recusado');
  with n as (select id, row_number() over (partition by papel order by ordem, created_at) as r from app.material_arquivos where entrega_id = e.id and status = 'conferido')
  update app.material_arquivos a set ordem = n.r from n where a.id = n.id;
  update app.materiais set status = 'enviado', enviado_em = v_agora, dispensado_em = v_agora, updated_at = now() where id = m.id;
  update app.entregas set passo = 'producao', prazo = prazo || (p -> 'prazo'), entrega_ate = (p ->> 'entrega_ate')::date, updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'material_dispensado');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- os avisos da D1, o de material parado e os 2 lembretes do restante ----------
-- previa / no_ar: tiram o aviso pendente da fila; o "no_ar" registra também a DATA DE PARTIDA dos 3 dias do restante (só na primeira vez: registrar de novo não adia o prazo do cliente).
-- material_parado (22/10): o dono avisou que aguarda o material e que o projeto fica PARADO; nada é publicado nem encerrado por isso.
-- restante_lembrete_1 / _2 (22/10): o lembrete do 2º e o do 3º dia depois do aviso "no ar" (o dia do aviso é o dia 0); o dono manda a mensagem pronta do painel e registra aqui.
create function app.vendas_aviso_feito(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; v_momento text := p ->> 'momento'; v_dias integer; v_min integer;
begin
  if v_momento is null or v_momento not in ('previa', 'no_ar', 'material_parado', 'restante_lembrete_1', 'restante_lembrete_2') then
    raise exception 'aviso: momento fora da lista' using errcode = '22023';
  end if;
  e := privado.entrega_do_dono(p, null);
  if v_momento = 'previa' then update app.entregas set aviso_previa_desde = null where id = e.id;
  elsif v_momento = 'no_ar' then
    update app.entregas set aviso_no_ar_desde = null, aviso_no_ar_feito_em = case when e.passo = 'no_ar' then coalesce(aviso_no_ar_feito_em, now()) else aviso_no_ar_feito_em end where id = e.id;
  elsif v_momento = 'material_parado' then
    if e.passo <> 'material' then return jsonb_build_object('ok', false, 'motivo', 'estado'); end if;
    if e.aviso_material_em is not null then return jsonb_build_object('ok', false, 'motivo', 'ja'); end if;
    -- (A1) a captação só deixa o aviso a partir do dia 30 depois da entrada (clientes/producao.mjs:118): sem esta trava o aviso podia sair no dia 1 e
    -- o pedido passar por "parado" sem ter esperado. Mesma conta de dias da vendas_material_dispensar.
    v_dias := coalesce((now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date, 0);   -- (idem: sem entrada_em não passa do dia 30)
    if v_dias < 30 then return jsonb_build_object('ok', false, 'dias', v_dias, 'motivo', 'cedo'); end if;
    -- com o número AUTORIZADO (WhatsApp + caixa + UF) o caminho é dispensar o material, não o aviso de material parado
    select * into m from app.materiais where entrega_id = e.id;
    if coalesce(m.dados ->> 'whatsapp', '') <> '' and coalesce(m.autorizacao ->> 'marcada', '') = 'true' and coalesce(m.negocio ->> 'uf', '') <> '' then
      return jsonb_build_object('ok', false, 'motivo', 'dispensar');
    end if;
    update app.entregas set aviso_material_em = now() where id = e.id;
  else
    if e.passo <> 'no_ar' then return jsonb_build_object('ok', false, 'motivo', 'fora_do_ar'); end if;
    if e.aviso_no_ar_feito_em is null then return jsonb_build_object('ok', false, 'motivo', 'sem_aviso'); end if;
    if (v_momento = 'restante_lembrete_1' and e.lembrete_restante_1_em is not null) or (v_momento = 'restante_lembrete_2' and e.lembrete_restante_2_em is not null) then
      return jsonb_build_object('ok', false, 'motivo', 'ja');
    end if;
    v_dias := (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date;
    v_min := case when v_momento = 'restante_lembrete_1' then 2 else 3 end;   -- (o CASE não pode ficar dentro do IF: o THEN do CASE confunde o plpgsql)
    if v_dias < v_min then return jsonb_build_object('ok', false, 'motivo', 'cedo', 'dias', v_dias); end if;
    if v_momento = 'restante_lembrete_1' then update app.entregas set lembrete_restante_1_em = now() where id = e.id;
    else update app.entregas set lembrete_restante_2_em = now() where id = e.id; end if;
  end if;
  perform privado.evento(e.org_id, e.conversa_id, 'aviso_registrado', jsonb_build_object('momento', v_momento));
  return jsonb_build_object('ok', true);
end $$;

create function app.vendas_religado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas;
begin
  e := privado.entrega_do_dono(p, array['concluida']);
  update app.entregas set religar_pendente = false where id = e.id;
  return jsonb_build_object('ok', true);
end $$;

create function app.vendas_avisos_lista(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with x as (
    select e.conversa_id, 'previa'::text as momento, e.aviso_previa_desde as desde from app.entregas e
     where e.org_id = v_org and e.aviso_previa_desde is not null and e.passo = 'previa'
    union all
    select e.conversa_id, 'no_ar', e.aviso_no_ar_desde from app.entregas e
     where e.org_id = v_org and e.aviso_no_ar_desde is not null and e.passo in ('no_ar', 'suspensa')
    union all   -- (22/10) material parado: dia 30 sem o material, SEM número autorizado e sem o aviso já registrado
    select e.conversa_id, 'material_parado', (e.prazo ->> 'entrada_em')::timestamptz + interval '30 days' from app.entregas e join app.materiais m on m.entrega_id = e.id
     where e.org_id = v_org and e.passo = 'material' and e.aviso_material_em is null
       and (now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date >= 30
       and not (coalesce(m.dados ->> 'whatsapp', '') <> '' and coalesce(m.autorizacao ->> 'marcada', '') = 'true' and coalesce(m.negocio ->> 'uf', '') <> '')
    union all   -- (22/10) o lembrete do 2º dia depois do aviso "no ar"
    select e.conversa_id, 'restante_lembrete_1', e.aviso_no_ar_feito_em + interval '2 days' from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_1_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 2
    union all   -- (22/10) o último lembrete, no 3º dia
    select e.conversa_id, 'restante_lembrete_2', e.aviso_no_ar_feito_em + interval '3 days' from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_2_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 3)
  select coalesce(jsonb_agg(jsonb_build_object('conversa_id', c.id, 'codigo', pd.codigo, 'momento', x.momento, 'desde', x.desde,
           'contato', jsonb_build_object('nome', l.nome, 'telefone', l.telefone, 'email', l.email)) order by x.desde), '[]'::jsonb) into v_itens
    from x join app.conversas c on c.id = x.conversa_id join app.pedidos pd on pd.conversa_id = c.id left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

-- a lista de ajustes do cliente, como DADO para a produção (o painel põe o selo de texto suspeito)
create function app.vendas_ajustes_da_entrega(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; e app.entregas;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  select e2.* into e from app.entregas e2 join app.pedidos pd on pd.conversa_id = e2.conversa_id where pd.codigo = p ->> 'codigo' and e2.org_id = v_org;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  return jsonb_build_object('passo', e.passo, 'previa_url', e.previa_url, 'ajustes', coalesce((select jsonb_agg(jsonb_build_object('rodada', a.rodada, 'status', a.status, 'texto', a.texto,
                'contato', jsonb_build_object('whatsapp', a.contato_whatsapp, 'email', a.contato_email, 'autorizado_em', a.contato_autorizado_em, 'autorizacao_versao', a.contato_autorizacao_versao)) order by a.rodada)
                                                                                          from app.entrega_ajustes a where a.entrega_id = e.id and a.status = 'na_fila'), '[]'::jsonb));
end $$;

-- a lista do painel (substitui a da 3b-2): mais campos e a concluída com religação pendente continua à vista. `dias_desde_entrada` passa a contar o DIA de Campo Grande
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
      'no_ar_em', e.no_ar_em,
      'dias_no_ar', case when e.no_ar_em is not null then (now() at time zone 'America/Campo_Grande')::date - (e.no_ar_em at time zone 'America/Campo_Grande')::date end,
      'aviso_material_em', e.aviso_material_em, 'aviso_no_ar_feito_em', e.aviso_no_ar_feito_em,
      'dias_do_aviso', case when e.aviso_no_ar_feito_em is not null then (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date end,
      'lembrete_restante_1_em', e.lembrete_restante_1_em, 'lembrete_restante_2_em', e.lembrete_restante_2_em,
      'aviso_previa_pendente', e.aviso_previa_desde is not null, 'aviso_no_ar_pendente', e.aviso_no_ar_desde is not null,
      'religar_pendente', e.religar_pendente, 'criada_em', e.created_at) as x
      from app.entregas e
      join app.materiais m on m.entrega_id = e.id
      join app.conversas c on c.id = e.conversa_id
      left join app.pedidos pd on pd.conversa_id = c.id
     where e.org_id = v_org and (e.passo not in ('concluida', 'encerrada') or e.religar_pendente)
     order by e.created_at limit 100
  ) q;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

do $$
declare f text;
begin
  foreach f in array array['vendas_entrega_info', 'vendas_previa_publicar', 'vendas_no_ar', 'vendas_suspender', 'vendas_encerrar', 'vendas_material_dispensar',
                           'vendas_aviso_feito', 'vendas_religado', 'vendas_avisos_lista', 'vendas_ajustes_da_entrega', 'vendas_entregas_lista'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
