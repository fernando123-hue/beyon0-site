-- ==========================================================================
-- RETENÇÃO DE 2 MESES para quem pediu orçamento e não fechou (decisão do
-- dono, 2026-10-07: "2 meses"; revisão de segurança do PR #1, M3: os leads
-- de quem nunca pagou não tinham prazo e a política de privacidade não dizia).
-- • O padrão da rotina diária passa de 90 para 60 dias (texto da conversa,
--   pedidos de ajuste e resumo do caso, como antes).
-- • NOVO: o lead (nome, WhatsApp, e-mail, observações) sem atividade há mais
--   de 60 dias é apagado, a menos que tenha fechado: virou cliente (status
--   "ganho" ou cliente_id), tem projeto, ou tem conversa recente ou com
--   pagamento em andamento/feito. A última atividade é a mais nova entre o
--   lead e as conversas dele. Apagar o lead já leva briefing e proposta que
--   só existiam por ele (privado.lead_leva_os_seus) e solta o lead_id nas
--   outras tabelas (on delete set null). A auditoria registra quem e o quê,
--   sem dado pessoal.
-- ==========================================================================
create or replace function app.vendas_reter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dias integer := coalesce((p ->> 'dias')::integer, 60);
  v_conversas integer;
  v_mensagens integer;
  v_freio integer;
  v_leads integer;
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
  -- o lead de quem não fechou
  delete from app.leads l
  where l.updated_at < now() - make_interval(days => v_dias)
    and l.status <> 'ganho' and l.cliente_id is null
    and not exists (select 1 from app.projetos pr where pr.org_id = l.org_id and pr.lead_id = l.id)
    and not exists (
      select 1 from app.conversas c
      where c.org_id = l.org_id and c.lead_id = l.id
        and (c.ultima_atividade >= now() - make_interval(days => v_dias) or c.etapa in ('aguardando_pagamento', 'em_producao')));
  get diagnostics v_leads = row_count;
  delete from privado.freio_ip where dia < (now() at time zone 'America/Sao_Paulo')::date - 1;
  get diagnostics v_freio = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'briefings_esvaziados', v_conversas, 'leads_apagados', v_leads,
                            'dias', v_dias, 'freio_apagado', v_freio);
end $$;

-- (create or replace mantém as concessões; repetidas aqui para a migration se explicar sozinha)
revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
