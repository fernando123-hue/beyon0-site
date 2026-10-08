-- ==========================================================================
-- FILA MANUAL DAS DIREÇÕES (decisão do dono, 2026-10-08). Enquanto não há
-- verba para a API, as três direções não são geradas pelo modelo: ficam
-- "gerando" (na fila) e o dono as produz no Claude Code, em até 24 horas
-- úteis. O painel (api/painel.mjs, protegido pela PAINEL_CHAVE) lista a fila
-- com o briefing e o contato, entrega cada direção pela mesma função da
-- geração automática (app.vendas_concluir_direcao, depois do filtro
-- higienizar no servidor) e marca o aviso feito pelo WhatsApp do dono.
-- Só acrescenta: coluna que aceita vazio e funções novas (compatível com o
-- código da promoção anterior, docs/revisoes/pr1-pendencias.md item 6).
-- ==========================================================================
alter table app.direcoes add column avisada_em timestamptz;   -- quando o dono avisou o cliente de que ficaram prontas

-- a fila: pedidos com direção na fila, ou prontos e ainda não avisados (a geração mais recente de cada conversa)
create function app.vendas_fila_direcoes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  return coalesce((
    select jsonb_agg(q.item order by q.pedido_em) from (
      select min(d.created_at) as pedido_em, jsonb_build_object(
        'conversa_id', c.id, 'etapa', c.etapa, 'pedido_em', min(d.created_at),
        'contato', jsonb_build_object('nome', l.nome, 'telefone', l.telefone, 'email', l.email),
        'briefing', c.briefing,
        'fatores', (select e.fatores from app.estimativas e where e.conversa_id = c.id order by e.created_at desc limit 1),
        'direcoes', jsonb_agg(jsonb_build_object('id', d.id, 'numero', d.numero, 'estrategia', d.estrategia, 'status', d.status) order by d.numero)
      ) as item
      from app.conversas c
      join app.direcoes d on d.conversa_id = c.id
       and d.geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id)
      left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id
      where c.org_id = v_org and c.etapa in ('contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes')
      group by c.id, l.nome, l.telefone, l.email
      having bool_or(d.status = 'gerando')
          or (bool_and(d.status <> 'gerando') and bool_or(d.status = 'pronta') and bool_or(d.status = 'pronta' and d.avisada_em is null))
      order by min(d.created_at)
      limit 50
    ) q
  ), '[]'::jsonb);
end $$;

-- o que o painel precisa saber de UMA direção antes de entregar (a estratégia vem do banco, nunca do arquivo)
create function app.vendas_direcao_info(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d app.direcoes;
begin
  select dr.* into d from app.direcoes dr join app.organizacoes o on o.id = dr.org_id
   where dr.id = (p ->> 'direcao_id')::uuid and o.slug = p ->> 'org_slug';
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', d.id, 'conversa_id', d.conversa_id, 'estrategia', d.estrategia, 'status', d.status, 'numero', d.numero);
end $$;

-- o aviso feito: as direções prontas da geração mais recente saem da fila
create function app.vendas_marcar_avisado(p jsonb) returns jsonb
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
  return jsonb_build_object('avisadas', v_n);
end $$;

revoke all on function app.vendas_fila_direcoes(jsonb) from public, anon, authenticated;
revoke all on function app.vendas_direcao_info(jsonb) from public, anon, authenticated;
revoke all on function app.vendas_marcar_avisado(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_fila_direcoes(jsonb) to service_role;
grant execute on function app.vendas_direcao_info(jsonb) to service_role;
grant execute on function app.vendas_marcar_avisado(jsonb) to service_role;
