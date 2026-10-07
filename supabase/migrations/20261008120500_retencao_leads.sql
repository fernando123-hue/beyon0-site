-- ==========================================================================
-- RETENÇÃO DE 2 MESES para quem pediu orçamento com IA e não fechou
-- (decisão do dono, 2026-10-07: "2 meses"; revisão de segurança do PR #1,
-- M3: o contato de quem nunca pagou não tinha prazo). Revisada nas duas
-- revisões do PR #7:
-- • Quem "fechou" é decidido pelo DINHEIRO, não pela etapa: fica protegida a
--   conversa em produção, com pagamento pago ou estornado (registro legal) ou
--   com cobrança pendente criada dentro do prazo. Antes, "aguardando
--   pagamento" protegia para sempre quem aceitou o escopo e desistiu (a etapa
--   não tem volta).
-- • O padrão passa de 90 para 60 dias: texto das conversas (mensagens,
--   pedidos de ajuste, resumo do caso), como antes.
-- • O CONTATO (lead) de quem não fechou é ANONIMIZADO — nome vira
--   "[apagado]"; e-mail, WhatsApp, empresa, observações e motivo saem —, não
--   apagado: apagar o lead levaria junto proposta e briefing da equipe
--   (privado.lead_leva_os_seus) e a proposta com cobrança travaria a rotina
--   inteira (a FK de app.pagamentos não tem ação). O número do funil fica.
-- • Só o lead que VEIO do orçamento com IA (tem conversa). O lead criado à
--   mão no painel (indicação, prospecção: a carteira do dono) nunca é
--   tocado. E nunca o lead em negociação pela equipe ("em_conversa",
--   "proposta"), o ganho, o com cliente ou com projeto, o que a equipe mexeu
--   dentro do prazo, ou o que tem alguma conversa ainda protegida.
-- ==========================================================================
create or replace function app.vendas_reter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dias integer := coalesce((p ->> 'dias')::integer, 60);
  v_limite timestamptz;
  v_velhas uuid[];
  v_conversas integer;
  v_mensagens integer;
  v_freio integer;
  v_leads integer;
begin
  if v_dias < 30 then raise exception 'retenção mínima de 30 dias' using errcode = '22023'; end if;
  v_limite := now() - make_interval(days => v_dias);
  -- as conversas paradas que não fecharam
  select coalesce(array_agg(c.id), '{}') into v_velhas
  from app.conversas c
  where c.ultima_atividade < v_limite
    and c.etapa <> 'em_producao'
    and not exists (
      select 1 from app.propostas pr join app.pagamentos pg on pg.org_id = pr.org_id and pg.proposta_id = pr.id
      where pr.org_id = c.org_id and pr.conversa_id = c.id
        and (pg.status in ('pago', 'estornado') or (pg.status = 'pendente' and pg.created_at >= v_limite)));

  delete from app.mensagens m where m.conversa_id = any(v_velhas);
  get diagnostics v_mensagens = row_count;
  -- o pedido de ajuste também é texto do visitante
  update app.alteracoes a set pedido = '[apagado]' where a.conversa_id = any(v_velhas) and a.pedido <> '[apagado]';
  update app.conversas c set briefing = '{}' where c.id = any(v_velhas) and c.briefing <> '{}';
  get diagnostics v_conversas = row_count;

  -- o contato de quem não fechou: anonimizado
  update app.leads l
  set nome = '[apagado]', email = null, telefone = null, empresa = null, observacoes = null, motivo_perda = null
  where l.nome is distinct from '[apagado]'
    and l.updated_at < v_limite
    and l.status not in ('ganho', 'em_conversa', 'proposta') and l.cliente_id is null
    and exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id)
    and not exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id and not (c.id = any(v_velhas)))
    and not exists (select 1 from app.projetos pr where pr.org_id = l.org_id and pr.lead_id = l.id);
  get diagnostics v_leads = row_count;

  delete from privado.freio_ip where dia < (now() at time zone 'America/Sao_Paulo')::date - 1;
  get diagnostics v_freio = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'briefings_esvaziados', v_conversas, 'leads_anonimizados', v_leads,
                            'dias', v_dias, 'freio_apagado', v_freio);
end $$;

-- (create or replace mantém as concessões; repetidas aqui para a migration se explicar sozinha)
revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
