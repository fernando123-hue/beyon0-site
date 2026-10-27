-- PR 3b-1 (spec docs/specs/2026-10-21-pr3b-vender-sozinho.md §4, achado C1): a entrada sai SEMPRE do percentual da
-- proposta. O valor-reserva de 50 (coalesce(pr.sinal_percentual, 50)) vira FALHA FECHADA: proposta sem percentual
-- (nulo ou abaixo de 1) não cobra (23514), e nenhuma cobrança é criada. A tela faz o mesmo (js/orcamento-pix.js).
-- Aplicar DEPOIS de 20261020120000_auditoria_correcoes.sql. Reaplicável (create or replace): mesma assinatura (jsonb),
-- security definer, search_path vazio; as concessões são repetidas no fim.
create or replace function app.pagamentos_iniciar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pr app.propostas; pg app.pagamentos; t app.tentativas_pagamento; v_valor numeric; v_qtd integer; v_ultima timestamptz;
begin
  if coalesce(p ->> 'metodo', '') not in ('pix', 'cartao') then raise exception 'método inválido' using errcode = '22023'; end if;
  if coalesce(p ->> 'provedor', '') !~ '^[a-z0-9_]{2,30}$' then raise exception 'provedor inválido' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- trava 1: conversa
  perform privado.exigir_etapa(c, array['aguardando_pagamento']);
  select * into pr from app.propostas where conversa_id = c.id and status = 'aceita' order by versao desc limit 1;
  if not found then raise exception 'proposta aceita não encontrada' using errcode = 'P0002'; end if;
  -- (PR 3b-1) sem o percentual da proposta, não cobra: nunca um número de reserva (era 50)
  if pr.sinal_percentual is null or pr.sinal_percentual < 1 then
    raise exception 'proposta sem percentual de entrada' using errcode = '23514';
  end if;
  v_valor := round(pr.valor_total * pr.sinal_percentual / 100.0, 2);

  select * into pg from app.pagamentos where proposta_id = pr.id and parcela = 'sinal' and status in ('pendente', 'pago', 'contestado') for update;   -- trava 2
  if not found then
    insert into app.pagamentos (org_id, proposta_id, parcela, valor, gateway)
    values (c.org_id, pr.id, 'sinal', v_valor, p ->> 'provedor') returning * into pg;
    perform privado.evento(c.org_id, c.id, 'pagamento_iniciado', jsonb_build_object('valor', v_valor));
  end if;
  if pg.status <> 'pendente' then raise exception 'este pagamento já foi feito' using errcode = '55000'; end if;
  if pg.valor <> v_valor then raise exception 'valor do pagamento diverge da proposta' using errcode = '23514'; end if;

  -- já existe uma tentativa ativa: devolve para o serviço decidir (reaproveitar o Pix, cancelar, ou repetir a criação)
  select * into t from app.tentativas_pagamento where pagamento_id = pg.id and status in ('criada', 'processando', 'aguardando', 'requer_acao') for update;   -- trava 3
  if found then
    return jsonb_build_object('ativa', true, 'tentativa_id', t.id, 'metodo', t.metodo, 'status', t.status, 'provedor_order_id', t.provedor_order_id,
      'chave_idempotencia', t.chave_idempotencia, 'pagamento_id', pg.id, 'valor', pg.valor, 'criada_em', t.created_at);
  end if;
  -- um caso em verificação humana: não abre outra cobrança por cima
  if exists (select 1 from app.tentativas_pagamento where pagamento_id = pg.id and status = 'divergente') then
    raise exception 'pagamento em verificação pela equipe' using errcode = '55000';
  end if;
  -- freios de CARTÃO (teste de cartões): no máximo N tentativas de cartão por pagamento, e um intervalo depois de uma recusa
  if p ->> 'metodo' = 'cartao' then
    select count(*) into v_qtd from app.tentativas_pagamento where pagamento_id = pg.id and metodo = 'cartao';
    if v_qtd >= coalesce((p ->> 'max_tentativas')::integer, 5) then raise exception 'tentativas esgotadas' using errcode = '23514'; end if;
    select max(updated_at) into v_ultima from app.tentativas_pagamento where pagamento_id = pg.id and metodo = 'cartao' and status = 'recusada';
    if v_ultima > now() - make_interval(secs => coalesce((p ->> 'intervalo_s')::integer, 20)) then raise exception 'aguarde entre tentativas' using errcode = '55P03'; end if;
  end if;
  if p ->> 'metodo' = 'cartao' and (select count(*) from app.tentativas_pagamento
        where org_id = c.org_id and metodo = 'cartao' and status = 'recusada' and updated_at > now() - interval '1 hour')
        >= coalesce((p ->> 'max_recusas_hora')::integer, 20) then
    perform privado.auditar_uma_vez(c.org_id, pg.id, null, 'payment.divergence', p ->> 'provedor', null, 'criacao', null, null,
      jsonb_build_object('motivo', 'cartão pausado: muitas recusas na última hora'), null);
    raise exception 'cartão pausado' using errcode = '23514';
  end if;

  insert into app.tentativas_pagamento (org_id, pagamento_id, provedor, metodo, valor, chave_idempotencia)
  values (c.org_id, pg.id, p ->> 'provedor', p ->> 'metodo', pg.valor, 'bz-' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  perform privado.auditar_pagamento(c.org_id, pg.id, t.id, 'payment.created', t.provedor, null, 'criacao', null, 'criada',
    jsonb_build_object('metodo', t.metodo, 'valor', t.valor), null);
  return jsonb_build_object('ativa', false, 'tentativa_id', t.id, 'pagamento_id', pg.id, 'valor', pg.valor, 'moeda', pg.moeda,
    'metodo', t.metodo, 'chave_idempotencia', t.chave_idempotencia, 'external_reference', t.id::text);
end $$;

revoke all on function app.pagamentos_iniciar_tentativa(jsonb) from public, anon, authenticated;
grant execute on function app.pagamentos_iniciar_tentativa(jsonb) to service_role;
