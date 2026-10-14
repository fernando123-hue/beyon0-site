-- ==========================================================================
-- ORÇAMENTO SEM IA, PR 2a: o lado do DONO do pedido de modelos (painel: api/painel.mjs; rotina: api/rotinas.mjs).
--   • confirmar pelo WhatsApp: o pedido entra na fila de trabalho e as três direções nascem (uma geração);
--   • descartar (pedido falso ou desistência): encerra e PARA a geração; arquivar (resolvido por fora): sai da fila;
--   • os não confirmados numa lista SEPARADA, com busca pelo código que chegou no WhatsApp;
--   • o pedido CONCLUI sozinho quando sai do trabalho do dono: "Já avisei", o cliente escolheu um modelo (ou foi
--     além) ou a geração acabou sem pendência (as três falharam). Assim nenhum confirmado ocupa o teto e o
--     telefone sem aparecer na fila (privado.pedido_na_fila, 20261013120000_pedidos.sql);
--   • gerar direções exige o pedido confirmado quando a conversa tem pedido (a API recusa o caminho sem pedido);
--   • a rotina diária vence quem não confirmou em 72 h, apaga o hash do telefone 2 dias depois do encerramento e
--     as redes do cliente depois de 60 dias.
-- A fila do painel (só confirmados) vem em 20261013120200_fila_confirmados.sql.
-- ==========================================================================

-- a conversa pelo lado do dono (painel: sem visitante no pedido), travada como as do visitante
create function privado.conversa_da_org(p_org_slug text, p_conversa uuid) returns app.conversas
language plpgsql security definer set search_path = '' as $$
declare v_visitante uuid;
begin
  select c.visitante_id into v_visitante from app.conversas c join app.organizacoes o on o.id = c.org_id
   where c.id = p_conversa and o.slug = p_org_slug;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  return privado.conversa_do(p_conversa, v_visitante);   -- (FOR UPDATE)
end $$;

-- a geração para junto com o pedido (descartar ou arquivar): nem o dono (a entrega exige "gerando") nem a IA fazem
-- as direções que faltam, e a conversa não fica presa em "gerando". Chamada com a conversa já travada
create function privado.parar_geracao(p_conversa uuid, p_erro text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app.direcoes set status = 'falhou', erro = p_erro where conversa_id = p_conversa and status = 'gerando';
  update app.conversas set etapa = 'contato', ultima_atividade = now() where id = p_conversa and etapa = 'gerando';
end $$;

-- ---------- a conclusão automática: o pedido sai do trabalho do dono junto com a conversa ----------
create function privado.pedido_conclui_com_a_conversa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.etapa in ('escolhida', 'alteracoes', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada')
     or (old.etapa = 'gerando' and new.etapa = 'contato') then   -- (cliente avançou, ou as três falharam)
    update app.pedidos set concluido_em = now() where conversa_id = new.id and status = 'confirmado' and concluido_em is null;
  end if;
  return null;
end $$;
create trigger pedido_conclui after update of etapa on app.conversas
  for each row when (old.etapa is distinct from new.etapa) execute function privado.pedido_conclui_com_a_conversa();

-- ---------- a confirmação: o dono viu "Meu pedido é BZ-…" chegar do WhatsApp informado ----------
create function app.vendas_confirmar_whatsapp(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pd app.pedidos; v_geracao jsonb;
begin
  c := privado.conversa_da_org(p ->> 'org_slug', (p ->> 'conversa_id')::uuid);
  perform privado.exigir_etapa(c, array['contato']);
  select * into pd from app.pedidos where conversa_id = c.id for update;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  if pd.status <> 'aguardando' then return jsonb_build_object('ok', false, 'status', pd.status); end if;
  if pd.expira_em <= now() then   -- (venceu antes de a rotina passar: registra agora e não confirma)
    update app.pedidos set status = 'expirado', encerrado_em = now() where id = pd.id;
    perform privado.evento(c.org_id, c.id, 'pedido_expirado');
    return jsonb_build_object('ok', false, 'status', 'expirado');
  end if;
  update app.pedidos set status = 'confirmado', confirmado_em = now() where id = pd.id;
  perform privado.evento(c.org_id, c.id, 'confirmacao_whatsapp');
  -- confirmado, o pedido entra na fila: as três direções nascem agora (a 1ª geração)
  v_geracao := app.vendas_iniciar_geracao(jsonb_build_object('conversa_id', c.id, 'visitante_id', c.visitante_id, 'max_geracoes', 1));
  return jsonb_build_object('ok', true, 'status', 'confirmado', 'codigo', pd.codigo, 'geracao', v_geracao -> 'geracao');
end $$;

-- ---------- descartar (encerra e para a geração) ou arquivar (resolvido por fora) ----------
create function app.vendas_mudar_pedido(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pd app.pedidos; v_acao text := p ->> 'acao'; v_status text;
begin
  if v_acao is null or v_acao not in ('descartar', 'arquivar') then raise exception 'ação inválida' using errcode = '22023'; end if;
  -- a mesma ordem de travas de vendas_concluir_direcao (direções, depois a conversa): sem espera circular (40P01).
  -- A organização é conferida aqui também, para não travar direção de outra organização
  perform 1 from app.direcoes d join app.conversas cv on cv.id = d.conversa_id join app.organizacoes o on o.id = cv.org_id
   where d.conversa_id = (p ->> 'conversa_id')::uuid and o.slug = p ->> 'org_slug' for update of d;
  c := privado.conversa_da_org(p ->> 'org_slug', (p ->> 'conversa_id')::uuid);
  -- descartar só antes do resumo (depois disso há proposta e pagamento); arquivar em qualquer etapa depois do contato
  perform privado.exigir_etapa(c, case when v_acao = 'descartar'
    then array['contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes']
    else array['contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada'] end);
  select * into pd from app.pedidos where conversa_id = c.id for update;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  if v_acao = 'arquivar' and pd.status <> 'confirmado' then raise exception 'só se arquiva pedido confirmado' using errcode = '23514'; end if;
  if v_acao = 'descartar' and pd.status not in ('aguardando', 'confirmado') then raise exception 'pedido já encerrado' using errcode = '23514'; end if;
  v_status := case v_acao when 'descartar' then 'descartado' else 'arquivado' end;
  update app.pedidos set status = v_status, encerrado_em = now() where id = pd.id;
  -- encerrado por qualquer das duas ações, o pedido não pode deixar direções órfãs em "gerando"
  perform privado.parar_geracao(c.id, case v_acao when 'descartar' then 'pedido descartado' else 'pedido arquivado' end);
  if v_acao = 'descartar' then
    perform privado.evento(c.org_id, c.id, 'pedido_descartado');
  end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- ---------- os não confirmados (lista separada; os 50 mais novos e o total; ou só o código buscado) ----------
create function app.vendas_pedidos_pendentes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_itens jsonb; v_total integer; v_codigo text := upper(nullif(p ->> 'codigo', ''));
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with pend as (
    select pd.created_at, jsonb_build_object(
      'conversa_id', c.id, 'codigo', pd.codigo, 'pedido_em', pd.created_at, 'expira_em', pd.expira_em,
      'suspeito', pd.suspeito, 'redes', pd.redes,
      'contato', jsonb_build_object('nome', l.nome, 'telefone', l.telefone),
      'negocio', jsonb_build_object('nome', c.briefing #>> '{negocio,nome}', 'descricao', c.briefing #>> '{negocio,descricao}',
                                    'segmento', c.briefing #>> '{negocio,segmento}', 'cidade', c.briefing #>> '{negocio,cidade}')
    ) as item
    from app.pedidos pd
    join app.conversas c on c.id = pd.conversa_id
    left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id
    where pd.org_id = v_org and pd.status = 'aguardando' and pd.expira_em > now() and c.etapa = 'contato'
      and (v_codigo is null or pd.codigo = v_codigo)
  )
  select (select coalesce(jsonb_agg(q.item order by q.created_at desc), '[]'::jsonb) from (select * from pend order by created_at desc limit 50) q),
         (select count(*) from pend)
    into v_itens, v_total;
  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- ---------- "Já avisei": as direções saem da fila e o pedido conclui (troca a de 20261009120000) ----------
create or replace function app.vendas_marcar_avisado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_n integer;
begin
  select cv.* into c from app.conversas cv join app.organizacoes o on o.id = cv.org_id
   where cv.id = (p ->> 'conversa_id')::uuid and o.slug = p ->> 'org_slug';
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
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

-- ---------- gerar: com pedido, só depois da confirmação (troca a de 20261008120000_auditoria_p0.sql) ----------
create or replace function app.vendas_iniciar_geracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_geracao integer; v_max integer := coalesce((p ->> 'max_geracoes')::integer, 3);
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if c.lead_id is null then raise exception 'informe o contato antes de gerar as direções' using errcode = '55000'; end if;
  if not exists (select 1 from app.estimativas e where e.conversa_id = c.id) then
    raise exception 'a estimativa vem antes das direções' using errcode = '55000';
  end if;
  -- (PR 2a) o pedido feito pelos detalhes só gera depois que o dono confirma pelo WhatsApp
  if exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status <> 'confirmado') then
    raise exception 'o pedido ainda não foi confirmado' using errcode = '55000';
  end if;
  -- uma geração em andamento: devolve a mesma
  select geracao into v_geracao from app.direcoes where conversa_id = c.id and status = 'gerando' order by geracao desc limit 1;
  if found then
    return jsonb_build_object('geracao', v_geracao, 'nova', false,
      'direcoes', (select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'estrategia', estrategia) order by numero) from app.direcoes where conversa_id = c.id and geracao = v_geracao));
  end if;
  -- (sem "alteracoes": os ajustes são da direção escolhida; gerar de novo depois deles reabria a troca)
  perform privado.exigir_etapa(c, array['contato', 'estimativa', 'direcoes', 'escolhida']);
  select coalesce(max(geracao), 0) + 1 into v_geracao from app.direcoes where conversa_id = c.id;
  if v_geracao > v_max then raise exception 'limite de gerações desta conversa atingido' using errcode = '23514'; end if;
  insert into app.direcoes (org_id, conversa_id, geracao, numero, estrategia)
  values (c.org_id, c.id, v_geracao, 1, 'conversao'), (c.org_id, c.id, v_geracao, 2, 'autoridade'), (c.org_id, c.id, v_geracao, 3, 'experiencia');
  update app.conversas set etapa = 'gerando', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'direcoes_solicitadas', jsonb_build_object('geracao', v_geracao));
  return jsonb_build_object('geracao', v_geracao, 'nova', true,
    'direcoes', (select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'estrategia', estrategia) order by numero) from app.direcoes where conversa_id = c.id and geracao = v_geracao));
end $$;

-- ---------- a rotina diária: vence quem não confirmou; apaga o hash e as redes no prazo (decisão D4: 60 dias) ----------
create function app.vendas_expirar_pedidos(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_expirados integer; v_redes integer; v_telefones integer;
begin
  with vencidos as (
    update app.pedidos set status = 'expirado', encerrado_em = now()
    where status = 'aguardando' and expira_em <= now()
    returning org_id, conversa_id
  ), eventos as (
    insert into app.eventos_funil (org_id, conversa_id, tipo)
    select org_id, conversa_id, 'pedido_expirado' from vencidos
    returning 1
  )
  select count(*) into v_expirados from eventos;
  -- o hash só serve para os freios (aberto e "2 por dia"): 2 dias depois de encerrado ou concluído, não serve mais
  update app.pedidos set telefone_hash = null
  where telefone_hash is not null
    and coalesce(encerrado_em, concluido_em) < now() - make_interval(days => greatest(1, coalesce((p ->> 'dias_telefone')::integer, 2)));
  get diagnostics v_telefones = row_count;
  update app.pedidos set redes = '{}', redes_autorizadas_em = null
  where redes <> '{}' and created_at < now() - make_interval(days => greatest(30, coalesce((p ->> 'dias_redes')::integer, 60)));
  get diagnostics v_redes = row_count;
  return jsonb_build_object('expirados', v_expirados, 'redes_apagadas', v_redes, 'telefones_apagados', v_telefones);
end $$;

-- ---------- quem chama ----------
do $$
declare f text;
begin
  foreach f in array array['vendas_confirmar_whatsapp', 'vendas_mudar_pedido', 'vendas_pedidos_pendentes',
                           'vendas_marcar_avisado', 'vendas_iniciar_geracao', 'vendas_expirar_pedidos'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
revoke all on function privado.conversa_da_org(text, uuid) from public, anon, authenticated, service_role;
revoke all on function privado.parar_geracao(uuid, text) from public, anon, authenticated, service_role;
revoke all on function privado.pedido_conclui_com_a_conversa() from public, anon, authenticated, service_role;
