-- ==========================================================================
-- RETENÇÃO: limpa também a CONVERSA do lead anonimizado (revisões do PR #7,
-- técnica B2 e segurança B12/B13). Na anonimização do contato
-- (20261008120500_retencao_leads.sql), a conversa ficava com:
-- • codigo_visita e termo, que ligam a conversa às métricas da visita
--   (metricas.contatos, ~13 meses) e ao que a pessoa buscou;
-- • contato_aceite_em: a prova do consentimento valia para o contato que
--   saiu. Zerada, um retorno com contato novo registra um aceite novo
--   (vendas_informar_contato grava coalesce(contato_aceite_em, now())).
-- O resto da função é igual à versão anterior.
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
  v_anonimos uuid[];
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
        and (pg.status in ('pago', 'estornado', 'contestado') or (pg.status = 'pendente' and pg.created_at >= v_limite)));

  delete from app.mensagens m where m.conversa_id = any(v_velhas);
  get diagnostics v_mensagens = row_count;
  -- o pedido de ajuste também é texto do visitante
  update app.alteracoes a set pedido = '[apagado]' where a.conversa_id = any(v_velhas) and a.pedido <> '[apagado]';
  update app.conversas c set briefing = '{}' where c.id = any(v_velhas) and c.briefing <> '{}';
  get diagnostics v_conversas = row_count;

  -- o contato de quem não fechou: anonimizado (os ids voltam para limpar a conversa)
  with anonimizados as (
  update app.leads l
  set nome = '[apagado]', email = null, telefone = null, empresa = null, observacoes = null, motivo_perda = null,
      codigo_visita = null, termo = null   -- (o código da visita liga às métricas da visita; o termo é o que a pessoa buscou)
  where l.nome is distinct from '[apagado]'
    and l.updated_at < v_limite
    and l.status not in ('ganho', 'proposta') and l.cliente_id is null
    and exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id)
    and not exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id and not (c.id = any(v_velhas)))
    and not exists (select 1 from app.projetos pr where pr.org_id = l.org_id and pr.lead_id = l.id)
  returning l.id)
  select coalesce(array_agg(id), '{}') into v_anonimos from anonimizados;
  v_leads := cardinality(v_anonimos);
  -- na conversa do lead anonimizado: o código da visita e o termo (ligam às métricas) e o aceite, que valia para o
  -- contato que saiu (se a pessoa voltar e informar de novo, um aceite novo é registrado)
  update app.conversas c set codigo_visita = null, termo = null, contato_aceite_em = null
  where c.lead_id = any(v_anonimos);

  delete from privado.freio_ip where dia < (now() at time zone 'America/Sao_Paulo')::date - 1;
  get diagnostics v_freio = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'briefings_esvaziados', v_conversas, 'leads_anonimizados', v_leads,
                            'dias', v_dias, 'freio_apagado', v_freio);
end $$;

revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
