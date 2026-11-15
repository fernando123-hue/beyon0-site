-- ==========================================================================
-- A CONFIRMAÇÃO DA ENTRADA POR E-MAIL (decisões do dono, 14 e 15/11/2026): quem PAGOU a entrada recebe um e-mail
-- de confirmação, uma vez só. O envio é do código (api/_pagamentos/confirmacao.mjs, pelo Resend); o banco guarda o
-- e-mail de quem pagou até o envio e garante a vez única.
-- • app.tentativas_pagamento.pagador_email: o e-mail que a pessoa digitou para pagar (o mesmo que vai ao Mercado
--   Pago). Antes não ficava em lugar nenhum. Sai quando a confirmação é reservada, e a retenção apaga o que sobrar
--   (tentativa sem pagamento, prévia sem a chave do Resend) em 30 dias.
-- • app.tentativas_pagamento.confirmacao_email_em: a marca da reserva (o envio foi tentado). Nunca volta a nulo.
-- • app.pagamentos_guardar_pagador: grava o e-mail numa tentativa ABERTA (antes de criar a order no provedor).
-- • app.pagamentos_reservar_confirmacao: reserva, numa operação só (for update skip locked + a marca), as entradas
--   APROVADAS (parcela sinal, tentativa aprovada que pagou o pagamento) com e-mail e sem marca, das últimas 48 h.
--   Com provedor_order_id: só aquela (o caminho do aviso, da consulta e da criação); sem: a varredura da
--   reconciliação, até `limite`. O aviso do Mercado Pago, a consulta da página e a reconciliação podem chegar
--   juntos: só um recebe o item, os outros recebem a lista vazia. Falha no envio NÃO devolve a reserva (no máximo
--   uma tentativa por pedido; o erro fica no log, sem o e-mail).
-- • app.vendas_reter: igual à versão anterior (20261011120000), mais a limpeza do pagador_email com 30 dias.
-- Não mexe em app.pagamentos_aplicar (o pagamento nunca depende do e-mail).
-- ==========================================================================

alter table app.tentativas_pagamento
  add column pagador_email text check (pagador_email is null or (
    char_length(pagador_email) <= 254 and pagador_email = lower(pagador_email)
    and pagador_email ~ '^[^@[:space:]]{1,64}@[^@[:space:]]+\.[^@[:space:]]{2,}$')),
  add column confirmacao_email_em timestamptz;

create index tentativas_confirmacao_pendente on app.tentativas_pagamento (aprovada_em)
  where status = 'aprovada' and confirmacao_email_em is null and pagador_email is not null;

-- ---------- o e-mail de quem vai pagar, numa tentativa aberta ----------
create function app.pagamentos_guardar_pagador(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p ->> 'email', '')));
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]{1,64}@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'e-mail inválido' using errcode = '22023';
  end if;
  update app.tentativas_pagamento set pagador_email = v_email
  where id = (p ->> 'tentativa_id')::uuid and status in ('criada', 'processando', 'aguardando', 'requer_acao');
  return jsonb_build_object('guardado', found);
end $$;

-- ---------- a reserva da confirmação: uma vez por entrada paga ----------
create function app.pagamentos_reservar_confirmacao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order text := p ->> 'provedor_order_id';
  v_limite integer;
  v_itens jsonb;
begin
  if v_order is not null and v_order !~ '^[A-Za-z0-9_-]{4,64}$' then raise exception 'order inválida' using errcode = '22023'; end if;
  if coalesce(p ->> 'limite', '5') !~ '^\d{1,3}$' then raise exception 'limite inválido' using errcode = '22023'; end if;
  v_limite := least(greatest(coalesce((p ->> 'limite')::integer, 5), 1), 20);
  with alvo as (
    select t.id, t.pagador_email, t.valor, t.metodo, pr.prazo_dias, t.aprovada_em
    from app.tentativas_pagamento t
    join app.pagamentos pg on pg.org_id = t.org_id and pg.id = t.pagamento_id
    join app.propostas pr on pr.org_id = pg.org_id and pr.id = pg.proposta_id
    where t.status = 'aprovada' and pg.parcela = 'sinal' and pg.status = 'pago' and pg.gateway_ref = t.provedor_order_id
      and t.confirmacao_email_em is null and t.pagador_email is not null
      and t.aprovada_em > now() - interval '48 hours'
      and (v_order is null or (t.provedor = coalesce(p ->> 'provedor', 'mercadopago') and t.provedor_order_id = v_order))
    order by t.aprovada_em
    limit case when v_order is null then v_limite else 1 end
    for update of t skip locked
  ), reservadas as (
    update app.tentativas_pagamento t set confirmacao_email_em = now(), pagador_email = null
    from alvo a where t.id = a.id
    returning a.id, a.pagador_email, a.valor, a.metodo, a.prazo_dias, a.aprovada_em
  )
  select coalesce(jsonb_agg(jsonb_build_object('tentativa_id', r.id, 'email', r.pagador_email, 'valor', r.valor, 'metodo', r.metodo,
                                               'prazo_dias', r.prazo_dias) order by r.aprovada_em), '[]'::jsonb)
    into v_itens from reservadas r;
  return jsonb_build_object('itens', v_itens);
end $$;

revoke all on function app.pagamentos_guardar_pagador(jsonb) from public, anon, authenticated;
grant execute on function app.pagamentos_guardar_pagador(jsonb) to service_role;
revoke all on function app.pagamentos_reservar_confirmacao(jsonb) from public, anon, authenticated;
grant execute on function app.pagamentos_reservar_confirmacao(jsonb) to service_role;

-- ---------- a retenção: igual à 20261011120000, mais o e-mail do pagador em 30 dias ----------
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
  v_pagadores integer;
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
    and not exists (   -- (o estorno é final no banco: a contestação que chega depois dele aparece só na tentativa)
      select 1 from app.propostas pr join app.pagamentos pg on pg.org_id = pr.org_id and pg.proposta_id = pr.id
      where pr.org_id = c.org_id and pr.conversa_id = c.id
        and (pg.status = 'contestado' or exists (
          select 1 from app.tentativas_pagamento t where t.org_id = pg.org_id and t.pagamento_id = pg.id and t.status = 'contestada')));
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

  -- o e-mail de quem pagou (ou tentou) serve só para a confirmação da entrada: o que sobrou sai em 30 dias (20261115130000)
  update app.tentativas_pagamento t set pagador_email = null
  where t.pagador_email is not null and t.created_at < now() - make_interval(days => v_dias_pagos);
  get diagnostics v_pagadores = row_count;

  delete from privado.freio_ip where dia < (now() at time zone 'America/Sao_Paulo')::date - 1;
  get diagnostics v_freio = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'mensagens_pagas_apagadas', v_mensagens_pagas, 'briefings_esvaziados', v_conversas,
                            'ajustes_esvaziados', v_ajustes, 'leads_anonimizados', v_leads, 'dias', v_dias, 'dias_contato', v_dias_contato,
                            'dias_pagos', v_dias_pagos, 'freio_apagado', v_freio, 'pagadores_apagados', v_pagadores);
end $$;

revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
