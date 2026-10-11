-- ==========================================================================
-- RETENÇÃO: três prazos (decisões do dono, 2026-10-09 e 2026-10-11).
-- • Quem NÃO fechou: o texto da conversa (mensagens, pedidos de ajuste,
--   resumo do caso) sai em 60 dias, como antes.
-- • Quem NÃO fechou: o CONTATO (lead) é anonimizado em 12 meses (era junto
--   com o texto, em 60 dias). O dono quer poder voltar a falar com quem não
--   comprou; as regras de quem fica são as mesmas de antes.
-- • Quem PAGOU: o texto da conversa com o consultor (as mensagens) sai 30
--   dias depois da última atividade. Ficam o briefing (a base do projeto),
--   a proposta, os ajustes, o pagamento e o contato. Antes, ficava sem prazo.
--   Exceção: pagamento CONTESTADO segura o texto, que é a prova da venda
--   enquanto a disputa durar.
-- A lista de conversas "paradas sem fechar" é a mesma de antes, agora numa
-- função (privado.conversas_paradas), usada com os dois prazos.
-- O resto da função é igual à versão anterior (20261009130000).
-- ==========================================================================

-- as conversas paradas desde antes do limite que não fecharam (fechar = pagamento pago, estornado ou contestado, ou
-- cobrança pendente criada depois do limite; ou a conversa em produção)
create function privado.conversas_paradas(p_limite timestamptz) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), '{}')
  from app.conversas c
  where c.ultima_atividade < p_limite
    and c.etapa <> 'em_producao'
    and not exists (
      select 1 from app.propostas pr join app.pagamentos pg on pg.org_id = pr.org_id and pg.proposta_id = pr.id
      where pr.org_id = c.org_id and pr.conversa_id = c.id
        and (pg.status in ('pago', 'estornado', 'contestado') or (pg.status = 'pendente' and pg.created_at >= p_limite)));
$$;
revoke all on function privado.conversas_paradas(timestamptz) from public, anon, authenticated;

create or replace function app.vendas_reter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dias integer := coalesce((p ->> 'dias')::integer, 60);
  v_dias_contato integer := coalesce((p ->> 'dias_contato')::integer, 365);
  v_dias_pagos integer := coalesce((p ->> 'dias_pagos')::integer, 30);
  v_velhas uuid[];
  v_velhas_contato uuid[];
  v_pagas uuid[];
  v_conversas integer;
  v_mensagens integer;
  v_mensagens_pagas integer;
  v_ajustes integer;
  v_freio integer;
  v_leads integer;
  v_anonimos uuid[];
  v_limite_contato timestamptz;
begin
  if least(v_dias, v_dias_contato, v_dias_pagos) < 30 then raise exception 'retenção mínima de 30 dias' using errcode = '22023'; end if;
  v_velhas := privado.conversas_paradas(now() - make_interval(days => v_dias));
  v_limite_contato := now() - make_interval(days => v_dias_contato);
  v_velhas_contato := privado.conversas_paradas(v_limite_contato);

  -- quem não fechou: o texto
  delete from app.mensagens m where m.conversa_id = any(v_velhas);
  get diagnostics v_mensagens = row_count;
  -- o ajuste também é texto do visitante: o pedido, as operações traduzidas dele e a direção com elas aplicadas
  update app.alteracoes a set pedido = '[apagado]', mudancas = '[]', resultado = null
  where a.conversa_id = any(v_velhas)
    and (a.pedido <> '[apagado]' or a.mudancas <> '[]'::jsonb or a.resultado is not null);
  get diagnostics v_ajustes = row_count;
  update app.conversas c set briefing = '{}' where c.id = any(v_velhas) and c.briefing <> '{}';
  get diagnostics v_conversas = row_count;

  -- quem pagou: só as mensagens, 30 dias depois da última atividade; contestado segura
  select coalesce(array_agg(c.id), '{}') into v_pagas
  from app.conversas c
  where c.ultima_atividade < now() - make_interval(days => v_dias_pagos)
    and (c.etapa = 'em_producao' or exists (
      select 1 from app.propostas pr join app.pagamentos pg on pg.org_id = pr.org_id and pg.proposta_id = pr.id
      where pr.org_id = c.org_id and pr.conversa_id = c.id and pg.status in ('pago', 'estornado')))
    and not exists (
      select 1 from app.propostas pr join app.pagamentos pg on pg.org_id = pr.org_id and pg.proposta_id = pr.id
      where pr.org_id = c.org_id and pr.conversa_id = c.id and pg.status = 'contestado');
  delete from app.mensagens m where m.conversa_id = any(v_pagas);
  get diagnostics v_mensagens_pagas = row_count;

  -- o contato de quem não fechou, em 12 meses: anonimizado (os ids voltam para limpar a conversa)
  with anonimizados as (
  update app.leads l
  set nome = '[apagado]', email = null, telefone = null, empresa = null, observacoes = null, motivo_perda = null,
      codigo_visita = null, termo = null   -- (o código da visita liga às métricas da visita; o termo é o que a pessoa buscou)
  where l.nome is distinct from '[apagado]'
    and l.updated_at < v_limite_contato
    and l.status not in ('ganho', 'proposta') and l.cliente_id is null
    and exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id)
    and not exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id and not (c.id = any(v_velhas_contato)))
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
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'mensagens_pagas_apagadas', v_mensagens_pagas, 'briefings_esvaziados', v_conversas,
                            'ajustes_esvaziados', v_ajustes, 'leads_anonimizados', v_leads, 'dias', v_dias, 'dias_contato', v_dias_contato,
                            'dias_pagos', v_dias_pagos, 'freio_apagado', v_freio);
end $$;

revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
