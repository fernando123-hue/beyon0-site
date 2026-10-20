-- ==========================================================================
-- ORÇAMENTO SEM IA, PR 3a (spec docs/specs/2026-10-11-orcamento-sem-ia.md §4 e §7): OS AJUSTES SEM IA.
-- • OPÇÕES PRONTAS: o servidor monta UMA mudança de uma lista fechada (api/_vendas/opcoes.mjs) e grava pela
--   vendas_registrar_alteracao com origem 'opcao': sempre com a versão aplicada, nunca com preço, no máximo 30 por
--   conversa (as desfeitas contam: o teto é de trabalho, não de versão).
-- • DESFAZER: o ajuste aplicado mais recente (pela data de APLICAÇÃO) vira 'desfeita', se for uma opção pronta; o
--   trabalho do dono (pedido livre feito) não se desfaz pelo botão do cliente.
-- • PEDIDO LIVRE: até 3 por conversa, de 1 a 300 caracteres, 'na_fila', sem operações. O dono resolve pelo comando dele
--   ("feito", com a versão nova e a base que ele baixou, ou "recusado"), só com o pedido confirmado e a conversa ainda na
--   etapa de ajustes (spec §4: "o comando do dono recusa entregar ajuste de conversa que já passou da etapa de ajustes").
-- • O ESTADO: cada ajuste traz origem, status e data; a versão final segue a data de APLICAÇÃO (o pedido livre feito
--   pelo dono hoje vale mais que a opção pronta de ontem, mesmo pedido antes dela).
-- • ORDEM DE TRAVAS: as direções da conversa (por id) ANTES da conversa, em toda função que trava as duas (a chave
--   estrangeira de app.alteracoes trava a direção apontada); ver também o 2º bloco, mais abaixo.
-- Compatível com o código da promoção anterior (docs/revisoes/pr1-pendencias.md, item 6): colunas novas com padrão,
-- CHECK com MAIS estados, vendas_registrar_alteracao com a mesma assinatura (sem "origem" vale 'ia', como antes) e
-- vendas_estado que só ACRESCENTA campos aos ajustes.
-- O dono aplica esta migration no banco real antes de promover o código do PR 3a.
-- ==========================================================================

alter table app.eventos_funil drop constraint eventos_funil_tipo_check;
alter table app.eventos_funil add constraint eventos_funil_tipo_check check (tipo in (
  'conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado',
  'direcoes_solicitadas', 'direcoes_prontas', 'direcoes_falharam', 'direcao_escolhida',
  'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado',
  'pagamento_confirmado', 'ia_falhou', 'tentativa_bloqueada', 'freio_ip',
  'respostas_formulario', 'confirmacao_whatsapp', 'pedido_expirado', 'pedido_descartado',
  'retomada_criada', 'retomada_usada', 'lembrete_enviado',
  'ajuste_desfeito', 'pedido_livre', 'pedido_livre_resolvido'));

-- ---------- os ajustes ganham a origem e a data da aplicação; dois estados novos ----------
alter table app.alteracoes
  add column origem text not null default 'ia' check (origem in ('ia', 'opcao', 'livre')),
  add column aplicada_em timestamptz;
update app.alteracoes set aplicada_em = created_at where status = 'aplicada';
-- (a regra do status nasceu na coluna, sem nome próprio: o Postgres a chamou de alteracoes_status_check)
alter table app.alteracoes drop constraint alteracoes_status_check;
alter table app.alteracoes add constraint alteracoes_status_check
  check (status in ('interpretada', 'aplicada', 'recusada', 'desfeita', 'na_fila'));
alter table app.alteracoes add constraint alteracoes_fila_so_livre check (status <> 'na_fila' or origem = 'livre');
create index alteracoes_aplicadas on app.alteracoes (conversa_id, aplicada_em desc) where status = 'aplicada';
-- (a documentação viva da máquina de estados: o pedido livre também leva de "escolhida" a "alteracoes")
update privado.transicoes_conversa set quem = 'vendas_registrar_alteracao, vendas_pedido_livre' where de = 'escolhida' and para = 'alteracoes';

-- ---------- a trava das direções de uma conversa do visitante, por id (antes da conversa) ----------
-- (confere o visitante na mesma consulta: ninguém trava as direções da conversa de outro)
create function privado.travar_direcoes(p_conversa uuid, p_visitante uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from app.direcoes d join app.conversas cv on cv.id = d.conversa_id
   where d.conversa_id = p_conversa and cv.visitante_id = p_visitante
   order by d.id for update of d;
end $$;

-- ---------- o ajuste gravado (troca a de 20261008120000_auditoria_p0.sql): a origem, o teto e a ordem de travas ----------
create or replace function app.vendas_registrar_alteracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_escolhida uuid; v_id uuid; v_status text; v_atual uuid; v_origem text := coalesce(p ->> 'origem', 'ia');
begin
  -- só a IA (o caminho da promoção anterior) e a opção pronta gravam por aqui; o pedido livre tem a função dele
  if v_origem not in ('ia', 'opcao') then raise exception 'origem inválida' using errcode = '22023'; end if;
  -- a ordem única de travas: as direções (por id) antes da conversa (o ajuste trava a direção pela chave estrangeira)
  perform privado.travar_direcoes((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);
  select direcao_id into v_escolhida from app.escolhas where conversa_id = c.id order by created_at desc limit 1;
  -- o ajuste foi montado sobre a direção que o servidor leu: se outra foi escolhida no meio, recusa
  if p ? 'direcao_id' and (p ->> 'direcao_id')::uuid is distinct from v_escolhida then
    raise exception 'a direção escolhida mudou durante o ajuste' using errcode = '40001';
  end if;
  -- (PR 3a) a opção pronta nunca muda o preço, sempre traz a versão aplicada, foi montada sobre a versão de agora e tem
  -- teto de 30 por conversa
  if v_origem = 'opcao' then
    if p ? 'estimativa' or jsonb_typeof(p -> 'resultado') is distinct from 'object' then
      raise exception 'opção pronta: sem preço e com a versão aplicada' using errcode = '22023';
    end if;
    -- a base: o ajuste aplicado mais recente que o servidor leu (null = nenhum). Outro aplicado no meio (outra aba, ou o
    -- "feito" do dono) seria apagado da versão final por esta gravação: recusa, como no resolver do dono
    select x.id into v_atual from app.alteracoes x where x.conversa_id = c.id and x.status = 'aplicada'
     order by x.aplicada_em desc nulls last, x.created_at desc limit 1;
    if v_atual is distinct from nullif(p ->> 'base_id', '')::uuid then
      raise exception 'a versão mudou durante o ajuste' using errcode = '40001';
    end if;
    if (select count(*) from app.alteracoes a where a.conversa_id = c.id and a.origem = 'opcao') >= 30 then
      raise exception 'limite de ajustes desta conversa' using errcode = '23514';
    end if;
  end if;
  -- o escopo mudou (só no caminho antigo): a estimativa nova entra JUNTO
  if jsonb_typeof(p -> 'estimativa') = 'object' then
    perform app.vendas_registrar_estimativa((p -> 'estimativa') || jsonb_build_object('conversa_id', c.id, 'visitante_id', c.visitante_id));
  end if;
  v_status := case when jsonb_typeof(p -> 'resultado') = 'object' then 'aplicada' else 'recusada' end;
  insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, mudancas, status, resultado, origem, aplicada_em)
  values (c.org_id, c.id, v_escolhida, p ->> 'pedido', coalesce(p -> 'mudancas', '[]'), v_status,
          case when v_status = 'aplicada' then p -> 'resultado' end, v_origem,
          case when v_status = 'aplicada' then clock_timestamp() end)   -- (a hora de agora, não a do início da transação)
  returning id into v_id;
  update app.conversas set etapa = 'alteracoes', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'alteracao_pedida', jsonb_build_object('mudancas', jsonb_array_length(coalesce(p -> 'mudancas', '[]')),
    'status', v_status, 'origem', v_origem));
  return jsonb_build_object('alteracao_id', v_id, 'status', v_status);
end $$;

-- ---------- desfazer o último ajuste aplicado (se for uma opção pronta) ----------
create function app.vendas_desfazer_alteracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; a app.alteracoes;
begin
  -- (sem trava de direção: desfazer só muda o status de um ajuste, sem chave estrangeira nova)
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['alteracoes']);
  select * into a from app.alteracoes x where x.conversa_id = c.id and x.status = 'aplicada'
   order by x.aplicada_em desc nulls last, x.created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false); end if;
  -- só a opção pronta se desfaz por aqui: o pedido livre feito é trabalho do dono (o cliente pede outro ajuste)
  if a.origem <> 'opcao' then return jsonb_build_object('ok', false, 'motivo', 'dono'); end if;
  update app.alteracoes set status = 'desfeita' where id = a.id;
  update app.conversas set ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'ajuste_desfeito');
  return jsonb_build_object('ok', true, 'alteracao_id', a.id);
end $$;

-- ---------- o pedido livre do visitante: na fila do dono, sem operações ----------
create function app.vendas_pedido_livre(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_escolhida uuid; v_id uuid; v_texto text := p ->> 'texto'; v_feitos integer;
begin
  -- (texto que é só espaço ou traz caractere de controle também não entra: a API já manda numa linha só)
  if v_texto is null or char_length(v_texto) not between 1 and 300 or btrim(v_texto) = '' or v_texto ~ '[[:cntrl:]]' then
    raise exception 'pedido livre: de 1 a 300 caracteres' using errcode = '22023';
  end if;
  perform privado.travar_direcoes((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);
  -- só pedido confirmado: a fila do dono só lista confirmados, e o pedido arquivado ficaria "aguardando" para sempre
  if not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    raise exception 'pedido livre: pedido não confirmado' using errcode = '55000';
  end if;
  select count(*) into v_feitos from app.alteracoes a where a.conversa_id = c.id and a.origem = 'livre';
  if v_feitos >= 3 then raise exception 'limite de pedidos livres desta conversa' using errcode = '23514'; end if;
  select direcao_id into v_escolhida from app.escolhas where conversa_id = c.id order by created_at desc limit 1;
  insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, mudancas, status, origem)
  values (c.org_id, c.id, v_escolhida, v_texto, '[]', 'na_fila', 'livre')
  returning id into v_id;
  -- o pedido livre também é ajuste do modelo escolhido: a troca de modelo trava, como na opção pronta
  update app.conversas set etapa = 'alteracoes', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'pedido_livre');   -- (sem o texto: o funil não guarda o que a pessoa escreveu)
  return jsonb_build_object('alteracao_id', v_id, 'restantes', 3 - v_feitos - 1);
end $$;

-- ---------- a fila de pedidos livres do dono: só confirmados, só na etapa de ajustes, com a versão atual e a base ----------
-- (os 50 mais antigos e o total da fila inteira, como vendas_pedidos_pendentes: cada item leva a versão inteira do site, e uma fila
--  grande passaria do limite de resposta; o dono resolve estes e pede de novo)
create function app.vendas_pedidos_livres(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_itens jsonb; v_total integer;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with fila as (
    select a.id, a.created_at
      from app.alteracoes a
      join app.conversas c on c.id = a.conversa_id
      join app.pedidos pd on pd.conversa_id = c.id and pd.status = 'confirmado'
     where a.org_id = v_org and a.origem = 'livre' and a.status = 'na_fila' and c.etapa in ('escolhida', 'alteracoes')
  ), pagina as (
    select f.id, f.created_at from fila f order by f.created_at, f.id limit 50
  )
  select (select coalesce(jsonb_agg(jsonb_build_object(
                   'alteracao_id', a.id, 'conversa_id', c.id, 'codigo', pd.codigo, 'pedido_em', a.created_at, 'texto', a.pedido,
                   'estrategia', d.estrategia, 'base_id', ult.id, 'versao', coalesce(ult.resultado, d.conteudo)) order by pg.created_at, pg.id), '[]'::jsonb)
            from pagina pg
            join app.alteracoes a on a.id = pg.id
            join app.conversas c on c.id = a.conversa_id
            join app.pedidos pd on pd.conversa_id = c.id and pd.status = 'confirmado'
            join app.direcoes d on d.id = a.direcao_id
            left join lateral (select x.id, x.resultado from app.alteracoes x where x.conversa_id = c.id and x.status = 'aplicada'
                                order by x.aplicada_em desc nulls last, x.created_at desc limit 1) ult on true),
         (select count(*)::integer from fila)
    into v_itens, v_total;
  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- ---------- o dono resolve um pedido livre: "feito" (a versão nova) ou "recusado" ----------
create function app.vendas_resolver_pedido_livre(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a app.alteracoes; c app.conversas; v_acao text := p ->> 'acao'; v_atual uuid; v_status text;
begin
  if v_acao is null or v_acao not in ('feito', 'recusado') then raise exception 'ação inválida' using errcode = '22023'; end if;
  if v_acao = 'feito' and (jsonb_typeof(p -> 'resultado') is distinct from 'object' or pg_column_size(p -> 'resultado') > 262144) then
    raise exception 'versão inválida' using errcode = '22023';
  end if;
  select x.* into a from app.alteracoes x join app.organizacoes o on o.id = x.org_id
   where x.id = (p ->> 'alteracao_id')::uuid and o.slug = p ->> 'org_slug' and x.origem = 'livre';
  if not found then raise exception 'ajuste não encontrado' using errcode = 'P0002'; end if;
  -- a ordem única de travas: as direções (por id), a conversa, o ajuste
  perform 1 from app.direcoes d where d.conversa_id = a.conversa_id order by d.id for update;
  c := privado.conversa_da_org(p ->> 'org_slug', a.conversa_id);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);   -- (o dono: só na etapa de ajustes)
  if not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    raise exception 'pedido não confirmado' using errcode = '55000';
  end if;
  select * into a from app.alteracoes where id = a.id for update;
  if a.status <> 'na_fila' then return jsonb_build_object('ok', false, 'status', a.status); end if;
  if v_acao = 'feito' then
    -- a versão nova foi feita sobre a que o dono baixou: se o cliente ajustou depois, ela apagaria o ajuste dele
    select x.id into v_atual from app.alteracoes x where x.conversa_id = c.id and x.status = 'aplicada'
     order by x.aplicada_em desc nulls last, x.created_at desc limit 1;
    if v_atual is distinct from nullif(p ->> 'base_id', '')::uuid then
      raise exception 'a versão do cliente mudou' using errcode = '40001';
    end if;
    update app.alteracoes set status = 'aplicada', resultado = p -> 'resultado', aplicada_em = clock_timestamp() where id = a.id;
    v_status := 'aplicada';
  else
    update app.alteracoes set status = 'recusada' where id = a.id;
    v_status := 'recusada';
  end if;
  update app.conversas set ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'pedido_livre_resolvido', jsonb_build_object('status', v_status));
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- ---------- o estado (troca a de 20261016120000_pr2b2_retomada.sql): os ajustes com origem e data; a versão final pela
-- data de aplicação (desfeito, na fila e recusado não contam), o id dele (a base da próxima opção pronta) e se dá para
-- desfazer (o banco decide: o "feito" do dono não se desfaz). A base fica como está: só estas chaves mudam ou entram ----------
create or replace function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_conversa uuid; ult app.alteracoes;
begin
  r := app.vendas_estado_base(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  v_conversa := (r #>> '{conversa,id}')::uuid;
  select a.* into ult from app.alteracoes a
   where a.conversa_id = v_conversa and a.status = 'aplicada' order by a.aplicada_em desc nulls last, a.created_at desc limit 1;
  return r || jsonb_build_object(
    'pedido', (select jsonb_build_object('codigo', pd.codigo, 'expira_em', pd.expira_em, 'confirmado_em', pd.confirmado_em,
                 'status', case when pd.status = 'aguardando' and pd.expira_em <= now() then 'expirado' else pd.status end)
               from app.pedidos pd where pd.conversa_id = v_conversa),
    'fila_confirmados', (select count(*)::integer from app.pedidos pd
                         where pd.org_id = (select c.org_id from app.conversas c where c.id = v_conversa)
                           and privado.pedido_na_fila(pd)),
    'alteracoes', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'pedido', a.pedido, 'mudancas', a.mudancas, 'status', a.status,
                                                                'origem', a.origem, 'created_at', a.created_at) order by a.created_at)
                            from app.alteracoes a where a.conversa_id = v_conversa), '[]'::jsonb),
    'versao_final', ult.resultado,
    'ajuste_atual', ult.id,
    'pode_desfazer', coalesce(ult.origem = 'opcao', false));
end $$;

-- ---------- quem chama ----------
do $$
declare f text;
begin
  foreach f in array array['vendas_registrar_alteracao', 'vendas_desfazer_alteracao', 'vendas_pedido_livre', 'vendas_pedidos_livres',
                           'vendas_resolver_pedido_livre', 'vendas_estado'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
revoke all on function privado.travar_direcoes(uuid, uuid) from public, anon, authenticated, service_role;

-- ==========================================================================
-- A ORDEM ÚNICA DE TRAVAS (docs/revisoes/pr1-pendencias.md, PR2b-avisado e PR2b1-escolher-trava): toda função que trava
-- as direções de uma conversa e a própria conversa faz na MESMA ordem, as direções por id e DEPOIS a conversa. Inserir uma
-- escolha ou uma proposta trava a direção apontada pela chave estrangeira, então a trava das direções vem antes do
-- conversa_do (que trava a conversa com FOR UPDATE). Já seguiam: vendas_mudar_pedido (20261015120000) e
-- vendas_concluir_direcao (uma direção, depois a conversa). As funções novas do bloco de cima já nascem assim.
-- ==========================================================================

-- a escolha (troca a de 20261008120000_auditoria_p0.sql; o resto é igual)
create or replace function app.vendas_escolher(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; d app.direcoes;
begin
  perform privado.travar_direcoes((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  -- trocar de direção só ANTES do 1º ajuste: os ajustes são sobre a direção escolhida (senão o escopo descreve outra)
  perform privado.exigir_etapa(c, array['direcoes', 'escolhida']);
  select * into d from app.direcoes
  where id = (p ->> 'direcao_id')::uuid and conversa_id = c.id and status = 'pronta'
    and geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id);
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  insert into app.escolhas (org_id, conversa_id, direcao_id, visitante_id, lead_id, geracao)
  values (c.org_id, c.id, d.id, c.visitante_id, c.lead_id, d.geracao);
  update app.conversas set etapa = 'escolhida', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'direcao_escolhida', jsonb_build_object('numero', d.numero, 'estrategia', d.estrategia, 'geracao', d.geracao));
  return jsonb_build_object('direcao_id', d.id);
end $$;

-- "Já avisei" (troca a de 20261013120100_pedidos_dono.sql): as direções travadas por id ANTES do update
create or replace function app.vendas_marcar_avisado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_n integer;
begin
  select cv.* into c from app.conversas cv join app.organizacoes o on o.id = cv.org_id
   where cv.id = (p ->> 'conversa_id')::uuid and o.slug = p ->> 'org_slug';
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  perform 1 from app.direcoes d where d.conversa_id = c.id order by d.id for update;
  update app.direcoes set avisada_em = now()
   where conversa_id = c.id and status = 'pronta' and avisada_em is null
     and geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id);
  get diagnostics v_n = row_count;
  -- (só conclui se nada ficou em "gerando": avisar as prontas não tira do dono o que ainda falta fazer)
  if v_n > 0 and not exists (select 1 from app.direcoes where conversa_id = c.id and status = 'gerando') then
    update app.pedidos set concluido_em = now() where conversa_id = c.id and status = 'confirmado' and concluido_em is null;
  end if;
  return jsonb_build_object('avisadas', v_n);
end $$;

-- o resumo (troca a de 20261007120100_vendas_funcoes.sql; a proposta aponta a direção escolhida pela chave estrangeira)
create or replace function app.vendas_apresentar_escopo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; e app.estimativas; v_escolhida uuid; v_versao integer; v_id uuid; v_sinal_pct integer;
begin
  perform privado.travar_direcoes((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes', 'escopo']);
  select * into e from app.estimativas where conversa_id = c.id order by created_at desc limit 1;
  if not found then raise exception 'sem estimativa' using errcode = '55000'; end if;
  -- o texto do escopo foi montado com UMA estimativa: se outra entrou no meio, o texto e o preço não batem
  if p ? 'estimativa_id' and e.id is distinct from (p ->> 'estimativa_id')::uuid then
    raise exception 'a estimativa mudou; monte o escopo de novo' using errcode = '40001';
  end if;
  select direcao_id into v_escolhida from app.escolhas where conversa_id = c.id order by created_at desc limit 1;
  v_sinal_pct := case when e.valor_total > 0 then round(e.sinal / e.valor_total * 100) else 0 end;
  -- a versão anterior apresentada é substituída (o histórico fica)
  update app.propostas set status = 'substituida' where conversa_id = c.id and status = 'enviada';
  select coalesce(max(versao), 0) + 1 into v_versao from app.propostas where org_id = c.org_id and lead_id = c.lead_id and projeto_id is null;
  insert into app.propostas (org_id, lead_id, conversa_id, direcao_id, versao, titulo, escopo, valor_total, moeda, validade,
                             status, enviada_em, sinal_percentual, prazo_dias)
  values (c.org_id, c.lead_id, c.id, v_escolhida, v_versao, left(coalesce(p ->> 'titulo', 'Site'), 160), p ->> 'escopo', e.valor_total, 'BRL',
          (current_date + coalesce((p ->> 'validade_dias')::integer, 7)), 'rascunho', null, v_sinal_pct, e.prazo_dias)
  returning id into v_id;
  update app.propostas set status = 'enviada', enviada_em = now() where id = v_id;
  update app.conversas set etapa = 'escopo', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'escopo_apresentado', jsonb_build_object('valor_total', e.valor_total, 'versao', v_versao));
  return jsonb_build_object('proposta_id', v_id, 'valor_total', e.valor_total, 'sinal_percentual', v_sinal_pct, 'prazo_dias', e.prazo_dias);
end $$;

-- (create or replace mantém as concessões; repetidas para a migration se explicar sozinha)
do $$
declare f text;
begin
  foreach f in array array['vendas_escolher', 'vendas_marcar_avisado', 'vendas_apresentar_escopo'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
