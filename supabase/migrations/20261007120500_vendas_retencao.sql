-- ==========================================================================
-- FASE 2 — retenção do orçamento com IA (o que a página de privacidade promete):
-- o TEXTO das conversas que não viraram contrato some depois de N dias sem
-- atividade (padrão 90). Apaga as mensagens, os pedidos de ajuste e esvazia o briefing; ficam os
-- números do funil (etapa, estimativa, custo), que não têm o que a pessoa
-- escreveu. Conversa com sinal pago (em produção) ou cobrança em aberto não
-- entra: ali o texto é parte do contrato.
-- Roda pelo agendador do Supabase (pg_cron) ou à mão; só service_role.
-- ==========================================================================
create function app.vendas_reter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dias integer := coalesce((p ->> 'dias')::integer, 90);
  v_conversas integer;
  v_mensagens integer;
begin
  if v_dias < 30 then raise exception 'retenção mínima de 30 dias' using errcode = '22023'; end if;
  with velhas as (
    select id from app.conversas
    where ultima_atividade < now() - make_interval(days => v_dias)
      and etapa not in ('aguardando_pagamento', 'em_producao')
  ), apagadas as (
    delete from app.mensagens m using velhas v where m.conversa_id = v.id returning m.id
  )
  select count(*) into v_mensagens from apagadas;
  -- o pedido de ajuste também é texto do visitante
  update app.alteracoes a set pedido = '[apagado]'
  from app.conversas c
  where a.conversa_id = c.id and a.pedido <> '[apagado]'
    and c.ultima_atividade < now() - make_interval(days => v_dias) and c.etapa not in ('aguardando_pagamento', 'em_producao');
  update app.conversas set briefing = '{}'
  where ultima_atividade < now() - make_interval(days => v_dias)
    and etapa not in ('aguardando_pagamento', 'em_producao')
    and briefing <> '{}';
  get diagnostics v_conversas = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'briefings_esvaziados', v_conversas, 'dias', v_dias);
end $$;

revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
