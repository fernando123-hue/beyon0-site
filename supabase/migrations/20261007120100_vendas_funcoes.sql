-- ==========================================================================
-- FASE 2 — 2/3: AS OPERAÇÕES DO FLUXO DE VENDAS, NO BANCO
-- Cada passo é uma função que recebe e devolve JSON, chamada SÓ pelo backend
-- (service_role): pela API do Supabase (/rest/v1/rpc/…) em produção e pelo
-- PGlite nos testes — a mesma lógica nos dois. Cada função é UMA transação:
-- o pagamento confirmado cria cliente, projeto e muda a proposta juntos, ou
-- nada. Regras que valem aqui, não no navegador nem no modelo de IA:
--   • a conversa só é mexida pelo visitante dono dela (o backend passa o id
--     tirado do token conferido; "não existe" e "não é sua" dão o MESMO erro);
--   • o preço da proposta vem da última estimativa gravada (calculada pelo
--     motor de regras), nunca de um valor enviado na chamada;
--   • o valor cobrado vem da proposta aceita; o pagamento só vale pelo evento
--     do gateway, uma vez por evento (idempotente) e com o valor conferido;
--   • cada etapa só acontece depois da anterior.
-- Códigos de erro: P0002 não encontrada; 55000 etapa errada; 22023 dado
-- inválido; 23514 regra de negócio.
-- ==========================================================================

-- a conversa do visitante, travada para a transação (corridas: dois cliques, duas abas)
create function privado.conversa_do(p_conversa uuid, p_visitante uuid) returns app.conversas
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  select * into c from app.conversas where id = p_conversa and visitante_id = p_visitante for update;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  return c;
end $$;

create function privado.evento(p_org uuid, p_conversa uuid, p_tipo text, p_dados jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into app.eventos_funil (org_id, conversa_id, tipo, dados) values (p_org, p_conversa, p_tipo, coalesce(p_dados, '{}'));
$$;

create function privado.exigir_etapa(c app.conversas, p_etapas text[]) returns void
language plpgsql set search_path = '' as $$
begin
  if not c.etapa = any (p_etapas) then
    raise exception 'etapa atual (%) não permite esta ação', c.etapa using errcode = '55000';
  end if;
end $$;

-- ---------- 1. começar ----------
create function app.vendas_iniciar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if v_org is null then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  insert into app.conversas (org_id, visitante_id, origem_meio, origem_fonte, campanha, termo, codigo_visita)
  values (v_org, (p ->> 'visitante_id')::uuid, nullif(p ->> 'origem_meio', ''), nullif(p ->> 'origem_fonte', ''),
          nullif(p ->> 'campanha', ''), nullif(p ->> 'termo', ''), nullif(p ->> 'codigo_visita', ''))
  returning id into v_id;
  perform privado.evento(v_org, v_id, 'conversa_iniciada');
  return jsonb_build_object('conversa_id', v_id);
end $$;

-- ---------- 2. o estado inteiro da conversa (o que a tela precisa) ----------
create function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_geracao integer;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  select max(geracao) into v_geracao from app.direcoes where conversa_id = c.id;
  return jsonb_build_object(
    'conversa', jsonb_build_object('id', c.id, 'etapa', c.etapa, 'briefing', c.briefing, 'confianca', c.confianca,
                                   'tem_contato', c.lead_id is not null, 'turnos', c.turnos, 'custo_ia_usd', c.custo_ia_usd),
    'mensagens', coalesce((select jsonb_agg(jsonb_build_object('papel', m.papel, 'conteudo', m.conteudo, 'em', m.created_at) order by m.created_at)
                           from (select * from app.mensagens where conversa_id = c.id order by created_at desc limit 60) m), '[]'),
    'estimativa', (select jsonb_build_object('id', e.id, 'valor_total', e.valor_total, 'sinal', e.sinal, 'prazo_dias', e.prazo_dias,
                                             'fase', e.fase, 'fatores', e.fatores, 'detalhes', e.detalhes)
                   from app.estimativas e where e.conversa_id = c.id order by e.created_at desc limit 1),
    'direcoes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'numero', d.numero, 'estrategia', d.estrategia,
                                                              'status', d.status, 'conteudo', d.conteudo) order by d.numero)
                          from app.direcoes d where d.conversa_id = c.id and d.geracao = v_geracao), '[]'),
    'escolha', (select jsonb_build_object('direcao_id', s.direcao_id, 'em', s.created_at)
                from app.escolhas s where s.conversa_id = c.id order by s.created_at desc limit 1),
    'alteracoes', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'pedido', a.pedido, 'mudancas', a.mudancas, 'status', a.status) order by a.created_at)
                            from app.alteracoes a where a.conversa_id = c.id), '[]'),
    'versao_final', (select a.resultado from app.alteracoes a where a.conversa_id = c.id and a.status = 'aplicada' order by a.created_at desc limit 1),
    'proposta', (select jsonb_build_object('id', pr.id, 'versao', pr.versao, 'titulo', pr.titulo, 'escopo', pr.escopo,
                                           'valor_total', pr.valor_total, 'sinal_percentual', pr.sinal_percentual,
                                           'prazo_dias', pr.prazo_dias, 'status', pr.status)
                 from app.propostas pr where pr.conversa_id = c.id and pr.status in ('enviada', 'aceita') order by pr.versao desc limit 1),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('id', pg.id, 'parcela', pg.parcela, 'valor', pg.valor,
                                                                'status', pg.status, 'link', pg.link) order by pg.created_at)
                            from app.pagamentos pg join app.propostas pr on pr.id = pg.proposta_id where pr.conversa_id = c.id), '[]')
  );
end $$;

-- ---------- 3. um turno de conversa (as duas mensagens e o briefing atualizado, juntos) ----------
create function app.vendas_registrar_turno(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_conf numeric; v_completo boolean;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if c.etapa in ('aguardando_pagamento', 'em_producao', 'encerrada') then
    raise exception 'esta conversa não recebe mais mensagens do agente' using errcode = '55000';
  end if;
  insert into app.mensagens (org_id, conversa_id, papel, conteudo) values (c.org_id, c.id, 'visitante', p ->> 'mensagem_visitante');
  insert into app.mensagens (org_id, conversa_id, papel, conteudo) values (c.org_id, c.id, 'agente', p ->> 'mensagem_agente');
  v_conf := least(1, greatest(0, coalesce((p ->> 'confianca')::numeric, c.confianca)));
  v_completo := c.confianca < 0.7 and v_conf >= 0.7;
  update app.conversas set
    briefing = coalesce(p -> 'briefing', briefing),
    confianca = v_conf,
    turnos = turnos + 1,
    custo_ia_usd = custo_ia_usd + greatest(0, coalesce((p ->> 'custo_usd')::numeric, 0)),
    ultima_atividade = now()
  where id = c.id;
  if v_completo then perform privado.evento(c.org_id, c.id, 'briefing_completo'); end if;
  return jsonb_build_object('turnos', c.turnos + 1, 'briefing_completo', v_conf >= 0.7);
end $$;

-- ---------- 4. a estimativa (valores calculados pelo motor de regras no backend, com a versão usada) ----------
create function app.vendas_registrar_estimativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_regras app.regras_comerciais; v_id uuid;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes']);
  -- só a tabela ATIVA, aprovada pelo dono, gera estimativa para visitante
  select * into v_regras from app.regras_comerciais where id = (p ->> 'regras_id')::uuid and org_id = c.org_id and status = 'ativa';
  if not found then raise exception 'regras comerciais ativas não encontradas' using errcode = '55000'; end if;
  insert into app.estimativas (org_id, conversa_id, regras_id, fatores, valor_total, sinal, prazo_dias, fase, detalhes)
  values (c.org_id, c.id, v_regras.id, p -> 'fatores', (p ->> 'valor_total')::numeric, (p ->> 'sinal')::numeric,
          (p ->> 'prazo_dias')::integer, coalesce(p ->> 'fase', 'unica'), coalesce(p -> 'detalhes', '{}'))
  returning id into v_id;
  if c.etapa = 'descoberta' then update app.conversas set etapa = 'estimativa', ultima_atividade = now() where id = c.id; end if;
  perform privado.evento(c.org_id, c.id, 'estimativa_mostrada', jsonb_build_object('valor_total', (p ->> 'valor_total')::numeric, 'fase', coalesce(p ->> 'fase', 'unica')));
  return jsonb_build_object('estimativa_id', v_id);
end $$;

-- ---------- 5. o contato (vira lead, com a origem da visita) ----------
create function app.vendas_informar_contato(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_lead uuid;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if c.lead_id is null then
    insert into app.leads (org_id, nome, email, telefone, interesse, status, origem_meio, origem_fonte, campanha, termo, codigo_visita)
    values (c.org_id, nullif(p ->> 'nome', ''), nullif(p ->> 'email', ''), nullif(p ->> 'telefone', ''), 'site', 'em_conversa',
            case when c.origem_meio in ('anuncio', 'busca', 'social', 'mensagem', 'email', 'referencia', 'direto') then c.origem_meio else 'outro' end,
            c.origem_fonte, c.campanha, c.termo,
            -- o código da visita é único por organização: se outro lead já tem, este fica sem
            case when c.codigo_visita is not null and not exists (select 1 from app.leads l where l.org_id = c.org_id and l.codigo_visita = c.codigo_visita)
                 then c.codigo_visita end)
    returning id into v_lead;
  else
    update app.leads set nome = coalesce(nullif(p ->> 'nome', ''), nome), email = coalesce(nullif(p ->> 'email', ''), email),
                         telefone = coalesce(nullif(p ->> 'telefone', ''), telefone)
    where id = c.lead_id returning id into v_lead;
  end if;
  update app.conversas set lead_id = v_lead, etapa = case when etapa in ('descoberta', 'estimativa') then 'contato' else etapa end,
                           ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'contato_informado');
  return jsonb_build_object('lead_id', v_lead);
end $$;

-- ---------- 6. pedir as 3 direções (idempotente: um clique duplo não gera duas vezes) ----------
create function app.vendas_iniciar_geracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_geracao integer; v_max integer := coalesce((p ->> 'max_geracoes')::integer, 3);
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if c.lead_id is null then raise exception 'informe o contato antes de gerar as direções' using errcode = '55000'; end if;
  if not exists (select 1 from app.estimativas e where e.conversa_id = c.id) then
    raise exception 'a estimativa vem antes das direções' using errcode = '55000';
  end if;
  -- uma geração em andamento: devolve a mesma
  select geracao into v_geracao from app.direcoes where conversa_id = c.id and status = 'gerando' order by geracao desc limit 1;
  if found then
    return jsonb_build_object('geracao', v_geracao, 'nova', false,
      'direcoes', (select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'estrategia', estrategia) order by numero) from app.direcoes where conversa_id = c.id and geracao = v_geracao));
  end if;
  perform privado.exigir_etapa(c, array['contato', 'estimativa', 'direcoes', 'escolhida', 'alteracoes']);
  select coalesce(max(geracao), 0) + 1 into v_geracao from app.direcoes where conversa_id = c.id;
  if v_geracao > v_max then raise exception 'limite de gerações desta conversa atingido' using errcode = '23514'; end if;
  insert into app.direcoes (org_id, conversa_id, geracao, numero, estrategia)
  values (c.org_id, c.id, v_geracao, 1, 'conversao'), (c.org_id, c.id, v_geracao, 2, 'autoridade'), (c.org_id, c.id, v_geracao, 3, 'experiencia');
  update app.conversas set etapa = 'gerando', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'direcoes_solicitadas', jsonb_build_object('geracao', v_geracao));
  return jsonb_build_object('geracao', v_geracao, 'nova', true,
    'direcoes', (select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'estrategia', estrategia) order by numero) from app.direcoes where conversa_id = c.id and geracao = v_geracao));
end $$;

-- ---------- 7. uma direção ficou pronta ou falhou (chamado pelo processo de geração) ----------
create function app.vendas_concluir_direcao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d app.direcoes; v_pendentes integer; v_prontas integer;
begin
  select * into d from app.direcoes where id = (p ->> 'direcao_id')::uuid for update;
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  if d.status <> 'gerando' then return jsonb_build_object('ignorado', true, 'status', d.status); end if;   -- (concluída por outra tentativa)
  if p ? 'conteudo' and jsonb_typeof(p -> 'conteudo') = 'object' then
    update app.direcoes set status = 'pronta', conteudo = p -> 'conteudo', modelo = left(p ->> 'modelo', 60), erro = null where id = d.id;
  else
    update app.direcoes set status = 'falhou', erro = left(coalesce(p ->> 'erro', 'falha na geração'), 300), modelo = left(p ->> 'modelo', 60) where id = d.id;
  end if;
  perform 1 from app.conversas where id = d.conversa_id for update;
  select count(*) filter (where status = 'gerando'), count(*) filter (where status = 'pronta')
    into v_pendentes, v_prontas from app.direcoes where conversa_id = d.conversa_id and geracao = d.geracao;
  if v_pendentes = 0 then
    update app.conversas set etapa = case when v_prontas > 0 then 'direcoes' else 'contato' end, ultima_atividade = now()
    where id = d.conversa_id and etapa = 'gerando';
    perform privado.evento(d.org_id, d.conversa_id, case when v_prontas > 0 then 'direcoes_prontas' else 'direcoes_falharam' end,
                           jsonb_build_object('geracao', d.geracao, 'prontas', v_prontas));
  end if;
  return jsonb_build_object('pendentes', v_pendentes, 'prontas', v_prontas);
end $$;

-- ---------- 8. a escolha ----------
create function app.vendas_escolher(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; d app.direcoes;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['direcoes', 'escolhida', 'alteracoes']);
  select * into d from app.direcoes where id = (p ->> 'direcao_id')::uuid and conversa_id = c.id and status = 'pronta';
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  insert into app.escolhas (org_id, conversa_id, direcao_id, visitante_id, lead_id, geracao)
  values (c.org_id, c.id, d.id, c.visitante_id, c.lead_id, d.geracao);
  update app.conversas set etapa = 'escolhida', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'direcao_escolhida', jsonb_build_object('numero', d.numero, 'estrategia', d.estrategia, 'geracao', d.geracao));
  return jsonb_build_object('direcao_id', d.id);
end $$;

-- ---------- 9. uma alteração (as mudanças estruturadas e o resultado aplicado pelo código) ----------
create function app.vendas_registrar_alteracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_escolhida uuid; v_id uuid; v_status text;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);
  select direcao_id into v_escolhida from app.escolhas where conversa_id = c.id order by created_at desc limit 1;
  v_status := case when jsonb_typeof(p -> 'resultado') = 'object' then 'aplicada' else 'recusada' end;
  insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, mudancas, status, resultado)
  values (c.org_id, c.id, v_escolhida, p ->> 'pedido', coalesce(p -> 'mudancas', '[]'), v_status,
          case when v_status = 'aplicada' then p -> 'resultado' end)
  returning id into v_id;
  update app.conversas set etapa = 'alteracoes', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'alteracao_pedida', jsonb_build_object('mudancas', jsonb_array_length(coalesce(p -> 'mudancas', '[]')), 'status', v_status));
  return jsonb_build_object('alteracao_id', v_id, 'status', v_status);
end $$;

-- ---------- 10. o escopo final: proposta com o preço da ÚLTIMA ESTIMATIVA (nunca da chamada) ----------
create function app.vendas_apresentar_escopo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; e app.estimativas; v_escolhida uuid; v_versao integer; v_id uuid; v_sinal_pct integer;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes', 'escopo']);
  select * into e from app.estimativas where conversa_id = c.id order by created_at desc limit 1;
  if not found then raise exception 'sem estimativa' using errcode = '55000'; end if;
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

-- ---------- 11. a confirmação explícita do cliente ----------
create function app.vendas_confirmar_escopo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pr app.propostas;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escopo']);
  if coalesce((p ->> 'confirmo')::boolean, false) is not true then raise exception 'confirmação explícita necessária' using errcode = '22023'; end if;
  select * into pr from app.propostas where id = (p ->> 'proposta_id')::uuid and conversa_id = c.id and status = 'enviada' for update;
  if not found then raise exception 'proposta não encontrada' using errcode = 'P0002'; end if;
  update app.propostas set status = 'aceita', respondida_em = now(),
         inicio_imediato_em = case when coalesce((p ->> 'inicio_imediato')::boolean, false) then now() end
  where id = pr.id;
  update app.conversas set etapa = 'aguardando_pagamento', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'escopo_confirmado', jsonb_build_object('valor_total', pr.valor_total));
  return jsonb_build_object('proposta_id', pr.id);
end $$;

-- ---------- 12. a cobrança do sinal: o valor vem da proposta aceita ----------
create function app.vendas_reservar_cobranca(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pr app.propostas; pg app.pagamentos; v_valor numeric;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['aguardando_pagamento']);
  select * into pr from app.propostas where conversa_id = c.id and status = 'aceita' order by versao desc limit 1;
  if not found then raise exception 'proposta aceita não encontrada' using errcode = 'P0002'; end if;
  -- já existe cobrança viva do sinal: devolve a mesma (dois cliques, uma cobrança)
  select * into pg from app.pagamentos where proposta_id = pr.id and parcela = 'sinal' and status in ('pendente', 'pago');
  if found then return jsonb_build_object('pagamento_id', pg.id, 'valor', pg.valor, 'link', pg.link, 'status', pg.status, 'nova', false); end if;
  v_valor := round(pr.valor_total * coalesce(pr.sinal_percentual, 50) / 100.0, 2);
  insert into app.pagamentos (org_id, proposta_id, parcela, valor, gateway)
  values (c.org_id, pr.id, 'sinal', v_valor, p ->> 'gateway') returning * into pg;
  perform privado.evento(c.org_id, c.id, 'pagamento_iniciado', jsonb_build_object('valor', v_valor));
  return jsonb_build_object('pagamento_id', pg.id, 'valor', v_valor, 'link', null, 'status', 'pendente', 'nova', true,
                            'descricao', left(pr.titulo, 120), 'lead_id', c.lead_id);
end $$;

create function app.vendas_vincular_cobranca(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update app.pagamentos set gateway_ref = p ->> 'gateway_ref', link = p ->> 'link'
  where id = (p ->> 'pagamento_id')::uuid and status = 'pendente' and gateway_ref is null;
  if not found then raise exception 'cobrança não encontrada ou já vinculada' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 13. o evento do gateway (já com a assinatura conferida pelo backend) ----------
-- idempotente; confere o valor; o sinal pago cria cliente e projeto e põe em produção, numa transação
create function app.vendas_confirmar_pagamento(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pg app.pagamentos; pr app.propostas; c app.conversas; l app.leads; v_cliente uuid; v_projeto uuid; v_tipo text; v_status text;
begin
  insert into app.eventos_pagamento (gateway, evento_id, tipo) values (p ->> 'gateway', p ->> 'evento_id', p ->> 'tipo')
  on conflict (gateway, evento_id) do nothing;
  if not found then return jsonb_build_object('duplicado', true); end if;

  select * into pg from app.pagamentos where gateway = p ->> 'gateway' and gateway_ref = p ->> 'gateway_ref' for update;
  if not found then
    update app.eventos_pagamento set resultado = 'cobrança desconhecida' where gateway = p ->> 'gateway' and evento_id = p ->> 'evento_id';
    return jsonb_build_object('ignorado', 'cobrança desconhecida');
  end if;
  v_status := p ->> 'status';
  if v_status = 'pago' and (p ->> 'valor')::numeric is distinct from pg.valor then
    update app.eventos_pagamento set pagamento_id = pg.id, resultado = 'valor divergente' where gateway = p ->> 'gateway' and evento_id = p ->> 'evento_id';
    return jsonb_build_object('ignorado', 'valor divergente');
  end if;
  if v_status = pg.status then
    update app.eventos_pagamento set pagamento_id = pg.id, resultado = 'sem mudança' where gateway = p ->> 'gateway' and evento_id = p ->> 'evento_id';
    return jsonb_build_object('sem_mudanca', true);
  end if;
  update app.pagamentos set status = v_status, pago_em = case when v_status = 'pago' then now() else pago_em end where id = pg.id;
  update app.eventos_pagamento set pagamento_id = pg.id, resultado = 'aplicado: ' || v_status where gateway = p ->> 'gateway' and evento_id = p ->> 'evento_id';

  if v_status = 'pago' and pg.parcela = 'sinal' then
    select * into pr from app.propostas where id = pg.proposta_id for update;
    select * into c from app.conversas where id = pr.conversa_id for update;
    select * into l from app.leads where id = pr.lead_id for update;
    -- cliente: o do lead, ou um novo a partir do contato e do nome do negócio no briefing
    v_cliente := l.cliente_id;
    if v_cliente is null then
      insert into app.clientes (org_id, nome, tipo, contato_nome, email, telefone)
      values (pr.org_id, left(coalesce(nullif(c.briefing #>> '{negocio,nome}', ''), l.empresa, l.nome, 'Cliente'), 160), 'empresa',
              left(l.nome, 120), l.email, l.telefone)
      returning id into v_cliente;
    end if;
    update app.leads set status = 'ganho', cliente_id = v_cliente where id = l.id;
    v_tipo := case c.briefing #>> '{projeto,formato}' when 'landing_page' then 'landing_page' when 'institucional' then 'site_institucional'
                                                       when 'sob_medida' then 'site_sob_medida' else 'outro' end;
    insert into app.projetos (org_id, cliente_id, lead_id, nome, tipo, status, inicio_em, previsto_para)
    values (pr.org_id, v_cliente, l.id, left(coalesce(pr.titulo, 'Site'), 160), v_tipo, 'em_producao', current_date,
            current_date + coalesce(pr.prazo_dias, 10))
    returning id into v_projeto;
    update app.propostas set projeto_id = v_projeto where id = pr.id;
    update app.conversas set etapa = 'em_producao', ultima_atividade = now() where id = c.id;
    perform privado.evento(pr.org_id, c.id, 'pagamento_confirmado', jsonb_build_object('valor', pg.valor, 'parcela', 'sinal'));
    return jsonb_build_object('aplicado', v_status, 'projeto_id', v_projeto, 'cliente_id', v_cliente);
  end if;
  return jsonb_build_object('aplicado', v_status);
end $$;

-- ---------- 14. evento avulso do funil (falha da IA, tentativa bloqueada) ----------
create function app.vendas_registrar_evento(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  if (p ->> 'tipo') not in ('ia_falhou', 'tentativa_bloqueada') then raise exception 'evento não permitido' using errcode = '22023'; end if;
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  perform privado.evento(c.org_id, c.id, p ->> 'tipo', coalesce(p -> 'dados', '{}'));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 15. as regras ativas (o motor de preço no backend lê) ----------
create function app.vendas_regras_ativas(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'versao', r.versao, 'regras', r.regras)
  from app.regras_comerciais r join app.organizacoes o on o.id = r.org_id
  where o.slug = p ->> 'org_slug' and r.status = 'ativa'
$$;

-- só o backend (service_role) executa; ninguém mais
do $$
declare f text;
begin
  foreach f in array array['vendas_iniciar', 'vendas_estado', 'vendas_registrar_turno', 'vendas_registrar_estimativa', 'vendas_informar_contato',
                           'vendas_iniciar_geracao', 'vendas_concluir_direcao', 'vendas_escolher', 'vendas_registrar_alteracao',
                           'vendas_apresentar_escopo', 'vendas_confirmar_escopo', 'vendas_reservar_cobranca', 'vendas_vincular_cobranca',
                           'vendas_confirmar_pagamento', 'vendas_registrar_evento', 'vendas_regras_ativas'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
revoke all on function privado.conversa_do(uuid, uuid) from public, anon, authenticated;
revoke all on function privado.evento(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function privado.exigir_etapa(app.conversas, text[]) from public, anon, authenticated;
