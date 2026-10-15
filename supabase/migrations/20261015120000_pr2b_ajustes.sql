-- PR 2b-1: os ajustes das revisões do PR 2a (docs/revisoes/pr1-pendencias.md, linhas PR2a-*). As três são substituições
-- compatíveis com o código da promoção anterior: mesma assinatura, mesmo retorno (docs/revisoes/pr1-pendencias.md §6).

-- PR2a-ordem-trava: as direções travadas sempre em ordem de id (duas travas da mesma conversa em ordens diferentes
-- esperavam uma pela outra: 40P01)
create or replace function app.vendas_mudar_pedido(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pd app.pedidos; v_acao text := p ->> 'acao'; v_status text;
begin
  if v_acao is null or v_acao not in ('descartar', 'arquivar') then raise exception 'ação inválida' using errcode = '22023'; end if;
  -- a mesma ordem de travas de vendas_concluir_direcao (direções, depois a conversa), e as direções por id: sem espera
  -- circular (40P01) contra `vendas_concluir_direcao`; `vendas_escolher` e `vendas_marcar_avisado` seguem em
  -- PR2b1-escolher-trava e PR2b-avisado. A organização é conferida aqui também, para não travar direção de outra organização
  perform 1 from app.direcoes d join app.conversas cv on cv.id = d.conversa_id join app.organizacoes o on o.id = cv.org_id
   where d.conversa_id = (p ->> 'conversa_id')::uuid and o.slug = p ->> 'org_slug' order by d.id for update of d;
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

-- PR2a-teto-pacotes: o caminho do consultor (estimar) com o mesmo teto de 30 pacotes por conversa das respostas
create or replace function app.vendas_registrar_estimativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_regras app.regras_comerciais; v_id uuid;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes']);
  if (select count(*) from app.estimativas e where e.conversa_id = c.id) >= 30 then
    raise exception 'limite de pacotes desta conversa' using errcode = '23514';
  end if;
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

-- PR2a-dono-leitura: a consulta LEVE só lê; sem FOR UPDATE ela não espera atrás de quem grava
create or replace function app.vendas_conversa_dono(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_etapas text[];
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  select coalesce(array_agg(x), '{}') into v_etapas from jsonb_array_elements_text(coalesce(p -> 'etapas', '[]')) x;
  perform privado.exigir_etapa(c, v_etapas);   -- (lista vazia: nenhuma etapa vale, fecha)
  return jsonb_build_object('etapa', c.etapa,
    'estimativa', (select jsonb_build_object('regras_id', e.regras_id, 'fatores', e.fatores)
                   from app.estimativas e where e.conversa_id = c.id order by e.created_at desc limit 1));
end $$;
