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
--   tocado. E nunca o lead em negociação marcado pela equipe ("proposta"),
--   o ganho, o com cliente ou com projeto, o que a equipe mexeu dentro do
--   prazo, ou o que tem alguma conversa ainda protegida. ("em_conversa" NÃO
--   protege: é o status com que o agente cria todo lead.)
-- • Quem VOLTA numa conversa anonimizada: o estado diz "sem contato" (o
--   formulário reaparece) e preencher de novo devolve o contato ao MESMO lead
--   (o da proposta), então o cliente nasce com contato se pagar. A API recusa
--   pagar sem contato (api/_vendas/fluxo.mjs).
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
        and (pg.status in ('pago', 'estornado', 'contestado') or (pg.status = 'pendente' and pg.created_at >= v_limite)));

  delete from app.mensagens m where m.conversa_id = any(v_velhas);
  get diagnostics v_mensagens = row_count;
  -- o pedido de ajuste também é texto do visitante
  update app.alteracoes a set pedido = '[apagado]' where a.conversa_id = any(v_velhas) and a.pedido <> '[apagado]';
  update app.conversas c set briefing = '{}' where c.id = any(v_velhas) and c.briefing <> '{}';
  get diagnostics v_conversas = row_count;

  -- o contato de quem não fechou: anonimizado
  update app.leads l
  set nome = '[apagado]', email = null, telefone = null, empresa = null, observacoes = null, motivo_perda = null,
      codigo_visita = null, termo = null   -- (o código da visita liga às métricas da visita; o termo é o que a pessoa buscou)
  where l.nome is distinct from '[apagado]'
    and l.updated_at < v_limite
    and l.status not in ('ganho', 'proposta') and l.cliente_id is null
    and exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id)
    and not exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id and not (c.id = any(v_velhas)))
    and not exists (select 1 from app.projetos pr where pr.org_id = l.org_id and pr.lead_id = l.id);
  get diagnostics v_leads = row_count;

  delete from privado.freio_ip where dia < (now() at time zone 'America/Sao_Paulo')::date - 1;
  get diagnostics v_freio = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'briefings_esvaziados', v_conversas, 'leads_anonimizados', v_leads,
                            'dias', v_dias, 'freio_apagado', v_freio);
end $$;

-- o estado: lead anonimizado conta como SEM contato (o resto é igual a 20261007120100_vendas_funcoes.sql)
create or replace function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_geracao integer;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  select max(geracao) into v_geracao from app.direcoes where conversa_id = c.id;
  return jsonb_build_object(
    'conversa', jsonb_build_object('id', c.id, 'etapa', c.etapa, 'briefing', c.briefing, 'confianca', c.confianca,
                                   'tem_contato', exists (select 1 from app.leads l where l.id = c.lead_id and l.nome is distinct from '[apagado]'), 'turnos', c.turnos, 'custo_ia_usd', c.custo_ia_usd),
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

-- (create or replace mantém as concessões; repetidas aqui para a migration se explicar sozinha)
revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
revoke all on function app.vendas_estado(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_estado(jsonb) to service_role;
