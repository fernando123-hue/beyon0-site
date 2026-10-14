-- ==========================================================================
-- ORÇAMENTO SEM IA, PR 2a: a FILA DE TRABALHO do dono passa a ser EXATAMENTE os pedidos na fila
-- (privado.pedido_na_fila: confirmado e não concluído, 20261013120000_pedidos.sql), a mesma regra do teto, do
-- estado e do freio por telefone: nenhum pedido ocupa o teto sem aparecer aqui, e nada aparece aqui sem ocupar.
-- Por prioridade (prontos para avisar primeiro, um toque fecha o pedido; depois os que faltam produzir) e pela
-- ordem da confirmação. SEM o corte de 50 (o teto da fila global limita quantos são).
-- ATENÇÃO na promoção: a fila do painel deixa de mostrar pedidos sem confirmação. Aplicar esta migration e
-- promover o código deste PR JUNTOS (docs/revisoes/pr1-pendencias.md, PR 2a).
-- ANTES de aplicar: esvaziar a fila antiga (entregar e avisar). Conversas do fluxo antigo (contato + gerar) não têm
-- linha em app.pedidos: com direções "gerando" ou prontas e não avisadas, somem da fila (e o comando "pedido" e o
-- "entregar-pedido" deixam de achá-las). Esta consulta precisa dar 0:
--   select count(distinct d.conversa_id) from app.direcoes d where (d.status = 'gerando' or (d.status = 'pronta' and d.avisada_em is null)) and not exists (select 1 from app.pedidos p where p.conversa_id = d.conversa_id);
-- ==========================================================================
create or replace function app.vendas_fila_direcoes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with pedidos as (
    select pd.confirmado_em,
      case when coalesce(bool_or(d.status = 'pronta' and d.avisada_em is null), false)
                and not coalesce(bool_or(d.status = 'gerando'), false) then 1 else 2 end as prioridade,
      jsonb_build_object(
        'conversa_id', c.id, 'etapa', c.etapa, 'pedido_em', coalesce(min(d.created_at), pd.confirmado_em), 'confirmado_em', pd.confirmado_em,
        'codigo', pd.codigo, 'suspeito', pd.suspeito, 'redes', pd.redes,
        'contato', jsonb_build_object('nome', l.nome, 'telefone', l.telefone, 'email', l.email),
        'briefing', c.briefing,
        'fatores', (select e.fatores from app.estimativas e where e.conversa_id = c.id order by e.created_at desc limit 1),
        'direcoes', coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'numero', d.numero, 'estrategia', d.estrategia, 'status', d.status) order by d.numero)
                             filter (where d.id is not null), '[]'::jsonb)
      ) as item
    from app.pedidos pd
    join app.conversas c on c.id = pd.conversa_id
    left join app.direcoes d on d.conversa_id = c.id
     and d.geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id)
    left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id
    where pd.org_id = v_org and privado.pedido_na_fila(pd)
    group by c.id, pd.id, l.nome, l.telefone, l.email
  )
  select coalesce(jsonb_agg(q.item || jsonb_build_object('prioridade', q.prioridade) order by q.prioridade, q.confirmado_em), '[]'::jsonb)
    into v_itens from pedidos q;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

revoke all on function app.vendas_fila_direcoes(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_fila_direcoes(jsonb) to service_role;
