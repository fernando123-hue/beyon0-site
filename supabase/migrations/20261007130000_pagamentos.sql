-- ==========================================================================
-- PAGAMENTOS (Mercado Pago, Orders API) — o domínio financeiro no banco.
-- Documentos: docs/pagamentos/00-PESQUISA-E-PLANO.md e 01-ARQUITETURA.md.
--
--   app.pagamentos            o que deve ser pago (sinal da proposta aceita). Valor SÓ da proposta.
--   app.tentativas_pagamento  cada tentativa (Pix ou cartão) = uma order no provedor
--   app.pagamentos_auditoria  trilha append-only (ninguém altera nem apaga, nem o service_role)
--
-- Regras que valem AQUI (a última trava, mesmo que o código acima erre):
--   • o pagamento só vira "pago" por app.pagamentos_aplicar, com o retrato da order
--     consultada no provedor, conferindo tentativa, referência, valores, país/moeda,
--     conta e meio de pagamento; qualquer divergência: NÃO aplica (fail closed);
--   • estado desconhecido nunca vira pago; regressão (aprovada → pendente) é ignorada;
--   • o projeto nasce "pronto_para_producao" (não "em_producao"): a equipe dá a partida;
--   • estorno ou contestação de um pagamento que liberou projeto PAUSA o projeto;
--   • uma tentativa ativa por vez por pagamento (índice parcial único).
-- Erros: P0002 não encontrado; 55000 etapa errada; 22023 dado inválido; 23514 regra.
-- ==========================================================================

-- ---------- estados novos ----------
do $$
declare r record;
begin
  -- pagamentos: + 'contestado' (chargeback)
  for r in select conname from pg_constraint where conrelid = 'app.pagamentos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%pendente%' loop
    execute format('alter table app.pagamentos drop constraint %I', r.conname);
  end loop;
  -- projetos: + 'pronto_para_producao' (o pagamento confirmado libera; a equipe dá a partida)
  for r in select conname from pg_constraint where conrelid = 'app.projetos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%em_producao%' loop
    execute format('alter table app.projetos drop constraint %I', r.conname);
  end loop;
end $$;
alter table app.pagamentos add constraint pagamentos_status_check
  check (status in ('pendente', 'pago', 'cancelado', 'expirado', 'estornado', 'contestado'));
alter table app.projetos add constraint projetos_status_check
  check (status in ('briefing', 'proposta', 'pronto_para_producao', 'em_producao', 'em_revisao', 'entregue', 'pausado', 'cancelado'));

-- transições do pagamento (o trigger anterior não conhecia estorno depois de contestação etc.)
create or replace function privado.pagamento_transicao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'pendente'   and new.status in ('pago', 'cancelado', 'expirado')) or
       (old.status = 'pago'       and new.status in ('estornado', 'contestado')) or
       (old.status = 'contestado' and new.status in ('pago', 'estornado'))) then
    raise exception 'pagamento: % para % não é permitido', old.status, new.status using errcode = '23514';
  end if;
  if (new.valor, new.moeda, new.proposta_id, new.parcela, new.gateway) is distinct from (old.valor, old.moeda, old.proposta_id, old.parcela, old.gateway) then
    raise exception 'pagamento: valor, moeda, proposta, parcela e gateway não mudam' using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------- tentativas: cada uma é UMA order no provedor ----------
create table app.tentativas_pagamento (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references app.organizacoes (id) on delete cascade,
  pagamento_id        uuid not null,
  provedor            text not null check (provedor ~ '^[a-z0-9_]{2,30}$'),
  metodo              text not null check (metodo in ('pix', 'cartao')),
  valor               numeric(12, 2) not null check (valor > 0),
  moeda               text not null default 'BRL' check (moeda = 'BRL'),
  chave_idempotencia  text not null unique check (char_length(chave_idempotencia) between 16 and 128),
  provedor_order_id   text check (provedor_order_id ~ '^[A-Za-z0-9_-]{4,64}$'),
  provedor_pagamento_id text check (char_length(provedor_pagamento_id) <= 64),
  status              text not null default 'criada' check (status in (
                        'criada', 'processando', 'aguardando', 'requer_acao', 'aprovada', 'recusada', 'cancelada',
                        'expirada', 'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida', 'duplicada')),
  status_provedor     text check (char_length(status_provedor) <= 40),
  detalhe_provedor    text check (char_length(detalhe_provedor) <= 60),
  meio                text check (meio ~ '^[a-z0-9_]{2,30}$'),          -- pix, visa, master…
  tipo_meio           text check (tipo_meio in ('bank_transfer', 'credit_card', 'debit_card')),
  parcelas            integer check (parcelas between 1 and 24),
  valor_pago          numeric(12, 2) check (valor_pago >= 0),
  pix_qr              text check (char_length(pix_qr) <= 1000),
  pix_qr_base64       text check (char_length(pix_qr_base64) <= 30000),
  pix_link            text check (pix_link ~ '^https://' and char_length(pix_link) <= 500),
  desafio_url         text check (desafio_url ~ '^https://' and char_length(desafio_url) <= 1000),
  expira_em           timestamptz,
  aprovada_em         timestamptz,
  consultada_em       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  unique (provedor, provedor_order_id),
  foreign key (org_id, pagamento_id) references app.pagamentos (org_id, id)
);
create index tentativas_por_pagamento on app.tentativas_pagamento (pagamento_id, created_at desc);
create index tentativas_abertas on app.tentativas_pagamento (status, updated_at) where status in ('criada', 'processando', 'aguardando', 'requer_acao');
-- UMA tentativa ativa por pagamento (Pix pendente + cartão ao mesmo tempo = risco de pagar duas vezes)
create unique index tentativas_uma_ativa on app.tentativas_pagamento (pagamento_id) where status in ('criada', 'processando', 'aguardando', 'requer_acao');

create trigger carimbar before insert or update on app.tentativas_pagamento for each row execute function privado.carimbar();
create trigger org_imutavel before update on app.tentativas_pagamento for each row execute function privado.org_imutavel();

-- o que nunca muda numa tentativa, e as transições permitidas
create function privado.tentativa_transicao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.pagamento_id, new.provedor, new.metodo, new.valor, new.moeda, new.chave_idempotencia)
     is distinct from (old.pagamento_id, old.provedor, old.metodo, old.valor, old.moeda, old.chave_idempotencia) then
    raise exception 'tentativa: pagamento, provedor, método, valor e chave não mudam' using errcode = '23514';
  end if;
  if old.provedor_order_id is not null and new.provedor_order_id is distinct from old.provedor_order_id then
    raise exception 'tentativa: a order do provedor não muda depois de vinculada' using errcode = '23514';
  end if;
  -- depois de aprovada, só estorno, contestação ou duplicidade (nunca volta a pendente nem a recusada)
  if old.status in ('aprovada', 'duplicada', 'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida')
     and new.status is distinct from old.status
     and new.status not in ('estornada', 'estornada_parcial', 'contestada', 'contestada_revertida') then
    raise exception 'tentativa: % para % não é permitido', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
create trigger tentativa_transicao before update on app.tentativas_pagamento
  for each row execute function privado.tentativa_transicao();

-- ---------- auditoria financeira (append-only) ----------
create table app.pagamentos_auditoria (
  id             bigint generated always as identity primary key,
  org_id         uuid references app.organizacoes (id) on delete set null,
  pagamento_id   uuid,
  tentativa_id   uuid,
  evento         text not null check (evento in (
                   'payment.created', 'payment.pending', 'payment.requires_action', 'payment.confirmed', 'payment.failed',
                   'payment.cancelled', 'payment.expired', 'payment.refunded', 'payment.chargeback', 'payment.duplicate',
                   'payment.mismatch', 'payment.unknown_status', 'payment.provider_error', 'payment.reconciled',
                   'payment.divergence', 'payment.webhook.received', 'payment.webhook.rejected', 'project.ready', 'project.paused')),
  provedor       text check (char_length(provedor) <= 30),
  provedor_ref   text check (char_length(provedor_ref) <= 80),
  origem         text check (origem in ('criacao', 'webhook', 'consulta', 'reconciliacao', 'operacao')),
  status_antes   text check (char_length(status_antes) <= 40),
  status_depois  text check (char_length(status_depois) <= 40),
  detalhe        jsonb not null default '{}' check (jsonb_typeof(detalhe) = 'object' and pg_column_size(detalhe) <= 4096),
  request_id     text check (char_length(request_id) <= 120),
  created_at     timestamptz not null default now()
);
create index pagamentos_auditoria_pag on app.pagamentos_auditoria (pagamento_id, created_at);
create index pagamentos_auditoria_ref on app.pagamentos_auditoria (provedor_ref);
create index pagamentos_auditoria_evento on app.pagamentos_auditoria (evento, created_at desc);

create function privado.auditar_pagamento(p_org uuid, p_pag uuid, p_tent uuid, p_evento text, p_provedor text, p_ref text,
                                          p_origem text, p_antes text, p_depois text, p_detalhe jsonb, p_request text)
returns void language sql security definer set search_path = '' as $$
  insert into app.pagamentos_auditoria (org_id, pagamento_id, tentativa_id, evento, provedor, provedor_ref, origem, status_antes, status_depois, detalhe, request_id)
  values (p_org, p_pag, p_tent, p_evento, left(p_provedor, 30), left(p_ref, 80), p_origem, left(p_antes, 40), left(p_depois, 40), coalesce(p_detalhe, '{}'), left(p_request, 120));
$$;

-- ---------- acesso ----------
revoke all on app.tentativas_pagamento, app.pagamentos_auditoria from public, anon, authenticated;
grant select on app.tentativas_pagamento, app.pagamentos_auditoria to authenticated;
grant select, insert, update on app.tentativas_pagamento to service_role;
grant select, insert on app.pagamentos_auditoria to service_role;   -- (sem update/delete: a trilha não se reescreve)
revoke update, delete, truncate on app.pagamentos_auditoria from service_role;
alter table app.tentativas_pagamento enable row level security;
alter table app.pagamentos_auditoria enable row level security;
-- só a equipe da organização lê (o visitante vê o estado do pagamento pela API, já filtrado)
create policy tentativas_ler on app.tentativas_pagamento for select to authenticated using (org_id in (select privado.minhas_orgs()));
create policy pagamentos_auditoria_ler on app.pagamentos_auditoria for select to authenticated using (org_id in (select privado.minhas_orgs()));

-- ---------- as funções antigas do gateway simulado saem (substituídas pelas de baixo) ----------
drop function app.vendas_reservar_cobranca(jsonb);
drop function app.vendas_vincular_cobranca(jsonb);
drop function app.vendas_confirmar_pagamento(jsonb);

-- ==========================================================================
-- 1. começar uma tentativa: o valor vem da proposta ACEITA da conversa do visitante
-- ==========================================================================
create function app.pagamentos_iniciar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pr app.propostas; pg app.pagamentos; t app.tentativas_pagamento; l app.leads; v_valor numeric;
begin
  if (p ->> 'metodo') not in ('pix', 'cartao') then raise exception 'método inválido' using errcode = '22023'; end if;
  if coalesce(p ->> 'provedor', '') !~ '^[a-z0-9_]{2,30}$' then raise exception 'provedor inválido' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['aguardando_pagamento']);
  select * into pr from app.propostas where conversa_id = c.id and status = 'aceita' order by versao desc limit 1;
  if not found then raise exception 'proposta aceita não encontrada' using errcode = 'P0002'; end if;
  v_valor := round(pr.valor_total * coalesce(pr.sinal_percentual, 50) / 100.0, 2);

  select * into pg from app.pagamentos where proposta_id = pr.id and parcela = 'sinal' and status in ('pendente', 'pago', 'contestado') for update;
  if not found then
    insert into app.pagamentos (org_id, proposta_id, parcela, valor, gateway)
    values (c.org_id, pr.id, 'sinal', v_valor, p ->> 'provedor') returning * into pg;
    perform privado.evento(c.org_id, c.id, 'pagamento_iniciado', jsonb_build_object('valor', v_valor));
  end if;
  if pg.status <> 'pendente' then raise exception 'este pagamento já foi feito' using errcode = '55000'; end if;
  if pg.valor <> v_valor then raise exception 'valor do pagamento diverge da proposta' using errcode = '23514'; end if;   -- (nunca deveria acontecer)

  -- já existe uma tentativa ativa: devolve para o serviço decidir (reaproveitar o Pix, cancelar, ou repetir a criação)
  select * into t from app.tentativas_pagamento where pagamento_id = pg.id and status in ('criada', 'processando', 'aguardando', 'requer_acao') for update;
  if found then
    return jsonb_build_object('ativa', true, 'tentativa_id', t.id, 'metodo', t.metodo, 'status', t.status, 'provedor_order_id', t.provedor_order_id,
      'chave_idempotencia', t.chave_idempotencia, 'pagamento_id', pg.id, 'valor', pg.valor, 'criada_em', t.created_at);
  end if;

  insert into app.tentativas_pagamento (org_id, pagamento_id, provedor, metodo, valor, chave_idempotencia)
  values (c.org_id, pg.id, p ->> 'provedor', p ->> 'metodo', pg.valor, 'bz-' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  select * into l from app.leads where id = c.lead_id;
  perform privado.auditar_pagamento(c.org_id, pg.id, t.id, 'payment.created', t.provedor, null, 'criacao', null, 'criada',
    jsonb_build_object('metodo', t.metodo, 'valor', t.valor), null);
  return jsonb_build_object('ativa', false, 'tentativa_id', t.id, 'pagamento_id', pg.id, 'valor', pg.valor, 'moeda', pg.moeda,
    'metodo', t.metodo, 'chave_idempotencia', t.chave_idempotencia, 'external_reference', t.id::text,
    'descricao', left(coalesce(pr.titulo, 'Projeto Beyon Zero'), 120),
    'pagador', jsonb_build_object('nome', l.nome, 'email', l.email));
end $$;

-- ==========================================================================
-- 2. encerrar uma tentativa SEM order aplicável (cancelada no provedor, ou recusada na criação sem order)
-- ==========================================================================
create function app.pagamentos_encerrar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t app.tentativas_pagamento; v_status text := p ->> 'status';
begin
  if v_status not in ('cancelada', 'recusada', 'expirada') then raise exception 'status inválido' using errcode = '22023'; end if;
  select * into t from app.tentativas_pagamento where id = (p ->> 'tentativa_id')::uuid for update;
  if not found then raise exception 'tentativa não encontrada' using errcode = 'P0002'; end if;
  if t.status not in ('criada', 'processando', 'aguardando', 'requer_acao') then return jsonb_build_object('sem_mudanca', true, 'status', t.status); end if;
  update app.tentativas_pagamento set status = v_status, detalhe_provedor = left(p ->> 'motivo', 60) where id = t.id;
  perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id,
    case v_status when 'cancelada' then 'payment.cancelled' when 'expirada' then 'payment.expired' else 'payment.failed' end,
    t.provedor, t.provedor_order_id, coalesce(p ->> 'origem', 'criacao'), t.status, v_status,
    jsonb_build_object('motivo', left(p ->> 'motivo', 60)), p ->> 'request_id');
  return jsonb_build_object('status', v_status);
end $$;

-- ==========================================================================
-- 3. APLICAR o retrato de uma order consultada no provedor. A ÚNICA porta para "pago".
--    p = { provedor, origem, request_id, conta_esperada?, retrato: {
--          order_id, external_reference, user_id, total_amount, country_code, currency?,
--          pagamento: { id, amount, paid_amount, status, status_detail, metodo_id, metodo_tipo, parcelas },
--          pix?: { qr, qr_base64, link, expira_em }, desafio_url?, estado } }
--    "estado" é o mapeamento feito pelo código (api/_pagamentos/estados.mjs); o banco confere
--    que ele é coerente com o status bruto antes de aceitar "aprovada".
-- ==========================================================================
create function app.pagamentos_aplicar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := p -> 'retrato'; rp jsonb := p -> 'retrato' -> 'pagamento';
  v_prov text := p ->> 'provedor'; v_origem text := coalesce(p ->> 'origem', 'consulta'); v_req text := p ->> 'request_id';
  v_order text := r ->> 'order_id'; v_estado text := r ->> 'estado';
  t app.tentativas_pagamento; pg app.pagamentos; pr app.propostas; c app.conversas; l app.leads;
  v_cliente uuid; v_projeto uuid; v_tipo text; v_motivo text; v_antes text; v_meio_ok boolean;
begin
  if v_prov is null or v_order is null or v_order !~ '^[A-Za-z0-9_-]{4,64}$' then raise exception 'retrato inválido' using errcode = '22023'; end if;
  if v_estado not in ('processando', 'aguardando', 'requer_acao', 'aprovada', 'recusada', 'cancelada', 'expirada',
                      'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida', 'desconhecido') then
    raise exception 'estado inválido' using errcode = '22023';
  end if;

  -- a tentativa: pela order já vinculada, ou (resposta da criação perdida) pela referência externa, se ainda sem order
  select * into t from app.tentativas_pagamento where provedor = v_prov and provedor_order_id = v_order for update;
  if not found and coalesce(r ->> 'external_reference', '') ~ '^[0-9a-f-]{36}$' then
    select * into t from app.tentativas_pagamento where id = (r ->> 'external_reference')::uuid and provedor = v_prov and provedor_order_id is null for update;
    if found then update app.tentativas_pagamento set provedor_order_id = v_order where id = t.id returning * into t; end if;
  end if;
  if t.id is null then
    perform privado.auditar_pagamento(null, null, null, 'payment.divergence', v_prov, v_order, v_origem, null, v_estado,
      jsonb_build_object('motivo', 'order sem tentativa conhecida', 'external_reference', left(r ->> 'external_reference', 64)), v_req);
    return jsonb_build_object('ignorado', 'order desconhecida');
  end if;
  select * into pg from app.pagamentos where id = t.pagamento_id for update;

  -- ---------- conferência financeira (fail closed) ----------
  v_meio_ok := (t.metodo = 'pix' and rp ->> 'metodo_tipo' = 'bank_transfer' and rp ->> 'metodo_id' = 'pix')
            or (t.metodo = 'cartao' and rp ->> 'metodo_tipo' in ('credit_card', 'debit_card'));
  v_motivo := case
    when coalesce(r ->> 'external_reference', '') <> t.id::text then 'referência externa diferente'
    when nullif(p ->> 'conta_esperada', '') is not null and coalesce(r ->> 'user_id', '') <> p ->> 'conta_esperada' then 'conta do provedor diferente'
    when coalesce(r ->> 'country_code', '') <> 'BRA' then 'país diferente'
    when r ? 'currency' and coalesce(r ->> 'currency', '') <> 'BRL' then 'moeda diferente'
    when pg.moeda <> 'BRL' then 'moeda do pagamento'
    when (r ->> 'total_amount') !~ '^\d{1,10}(\.\d{1,2})?$' or (r ->> 'total_amount')::numeric <> t.valor then 'valor total diferente'
    when (rp ->> 'amount') !~ '^\d{1,10}(\.\d{1,2})?$' or (rp ->> 'amount')::numeric <> t.valor then 'valor da transação diferente'
    when t.valor <> pg.valor then 'valor da tentativa diferente do pagamento'
    when not v_meio_ok then 'meio de pagamento diferente'
    when v_estado = 'aprovada' and not (rp ->> 'status' = 'processed' and rp ->> 'status_detail' = 'accredited') then 'estado aprovado sem status de aprovação'
    when v_estado = 'aprovada' and ((rp ->> 'paid_amount') is null or (rp ->> 'paid_amount') !~ '^\d{1,10}(\.\d{1,2})?$'
                                    or (rp ->> 'paid_amount')::numeric < t.valor) then 'valor pago ausente ou menor'
  end;
  if v_motivo is not null then
    perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.mismatch', v_prov, v_order, v_origem, t.status, v_estado,
      jsonb_build_object('motivo', v_motivo), v_req);
    return jsonb_build_object('recusado', v_motivo);
  end if;

  -- dados que o cliente precisa ver (Pix, desafio 3DS) e o retrato bruto
  update app.tentativas_pagamento set
    provedor_pagamento_id = coalesce(left(rp ->> 'id', 64), provedor_pagamento_id),
    status_provedor = left(rp ->> 'status', 40), detalhe_provedor = left(rp ->> 'status_detail', 60),
    meio = coalesce(nullif(rp ->> 'metodo_id', ''), meio), tipo_meio = coalesce(rp ->> 'metodo_tipo', tipo_meio),
    parcelas = coalesce((rp ->> 'parcelas')::integer, parcelas),
    valor_pago = case when (rp ->> 'paid_amount') ~ '^\d{1,10}(\.\d{1,2})?$' then (rp ->> 'paid_amount')::numeric else valor_pago end,
    pix_qr = coalesce(left(r -> 'pix' ->> 'qr', 1000), pix_qr),
    pix_qr_base64 = coalesce(case when char_length(r -> 'pix' ->> 'qr_base64') <= 30000 then r -> 'pix' ->> 'qr_base64' end, pix_qr_base64),
    pix_link = coalesce(case when (r -> 'pix' ->> 'link') ~ '^https://' then left(r -> 'pix' ->> 'link', 500) end, pix_link),
    expira_em = coalesce((r -> 'pix' ->> 'expira_em')::timestamptz, expira_em),
    desafio_url = case when (r ->> 'desafio_url') ~ '^https://' then left(r ->> 'desafio_url', 1000) else desafio_url end,
    consultada_em = now()
  where id = t.id;

  v_antes := t.status;
  if v_estado = 'desconhecido' then
    perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.unknown_status', v_prov, v_order, v_origem, t.status, null,
      jsonb_build_object('status', left(rp ->> 'status', 40), 'status_detail', left(rp ->> 'status_detail', 60)), v_req);
    return jsonb_build_object('sem_mudanca', true, 'motivo', 'estado desconhecido');
  end if;
  if v_estado = t.status then return jsonb_build_object('sem_mudanca', true, 'status', t.status); end if;
  -- regressão (avisos fora de ordem): depois de aprovada, só estorno/contestação andam
  if t.status in ('aprovada', 'duplicada', 'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida')
     and v_estado not in ('estornada', 'estornada_parcial', 'contestada', 'contestada_revertida') then
    return jsonb_build_object('sem_mudanca', true, 'status', t.status, 'ignorado', 'regressão');
  end if;

  -- ---------- aprovação ----------
  if v_estado = 'aprovada' then
    if pg.status <> 'pendente' then
      -- outra tentativa já pagou: o cliente pagou duas vezes. Nada é liberado de novo; alerta para reembolso
      update app.tentativas_pagamento set status = 'duplicada', aprovada_em = now() where id = t.id;
      perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.duplicate', v_prov, v_order, v_origem, v_antes, 'duplicada',
        jsonb_build_object('acao', 'reembolsar esta order', 'valor', t.valor), v_req);
      return jsonb_build_object('duplicada', true);
    end if;
    update app.tentativas_pagamento set status = 'aprovada', aprovada_em = now() where id = t.id;
    update app.pagamentos set status = 'pago', pago_em = now(), gateway_ref = coalesce(gateway_ref, v_order) where id = pg.id;
    perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.confirmed', v_prov, v_order, v_origem, v_antes, 'aprovada',
      jsonb_build_object('valor', t.valor, 'valor_pago', rp ->> 'paid_amount', 'meio', rp ->> 'metodo_id', 'parcelas', rp ->> 'parcelas'), v_req);

    if pg.parcela = 'sinal' then
      select * into pr from app.propostas where id = pg.proposta_id for update;
      select * into c from app.conversas where id = pr.conversa_id for update;
      select * into l from app.leads where id = pr.lead_id for update;
      if pr.projeto_id is null then
        v_cliente := l.cliente_id;
        if v_cliente is null then
          insert into app.clientes (org_id, nome, tipo, contato_nome, email, telefone)
          values (pr.org_id, left(coalesce(nullif(c.briefing #>> '{negocio,nome}', ''), l.empresa, l.nome, 'Cliente'), 160), 'empresa',
                  left(l.nome, 120), l.email, l.telefone)
          returning id into v_cliente;
        end if;
        update app.leads set status = 'ganho', cliente_id = v_cliente where id = l.id;
        v_tipo := case c.briefing #>> '{projeto,formato}' when 'landing_page' then 'landing_page' when 'institucional' then 'site_institucional'
                                                           when 'sob_medida' then 'site_sob_medida' else 'outro' end;
        insert into app.projetos (org_id, cliente_id, lead_id, nome, tipo, status, inicio_em, previsto_para)
        values (pr.org_id, v_cliente, l.id, left(coalesce(pr.titulo, 'Site'), 160), v_tipo, 'pronto_para_producao', current_date,
                current_date + coalesce(pr.prazo_dias, 10))
        returning id into v_projeto;
        update app.propostas set projeto_id = v_projeto where id = pr.id;
        perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'project.ready', v_prov, v_order, v_origem, null, 'pronto_para_producao',
          jsonb_build_object('projeto_id', v_projeto), v_req);
      end if;
      update app.conversas set etapa = 'em_producao', ultima_atividade = now() where id = c.id and etapa = 'aguardando_pagamento';
      perform privado.evento(pr.org_id, c.id, 'pagamento_confirmado', jsonb_build_object('valor', pg.valor, 'parcela', 'sinal'));
    end if;
    return jsonb_build_object('aplicado', 'aprovada', 'projeto_id', v_projeto);
  end if;

  -- ---------- estorno / contestação ----------
  if v_estado in ('estornada', 'estornada_parcial', 'contestada', 'contestada_revertida') then
    if t.status not in ('aprovada', 'duplicada', 'estornada_parcial', 'contestada', 'contestada_revertida') then
      -- estorno de algo que nunca foi aprovado aqui: divergência, não aplica
      perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.divergence', v_prov, v_order, v_origem, t.status, v_estado,
        jsonb_build_object('motivo', 'estorno/contestação sem aprovação registrada'), v_req);
      return jsonb_build_object('recusado', 'estorno sem aprovação');
    end if;
    update app.tentativas_pagamento set status = v_estado where id = t.id;
    perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id,
      case when v_estado like 'contestada%' then 'payment.chargeback' else 'payment.refunded' end,
      v_prov, v_order, v_origem, v_antes, v_estado, '{}', v_req);
    -- o pagamento acompanha só se esta tentativa é a que pagou (não a duplicada)
    if v_antes <> 'duplicada' and pg.gateway_ref = v_order then
      if v_estado = 'estornada' and pg.status in ('pago', 'contestado') then update app.pagamentos set status = 'estornado' where id = pg.id;
      elsif v_estado = 'contestada' and pg.status = 'pago' then update app.pagamentos set status = 'contestado' where id = pg.id;
      elsif v_estado = 'contestada_revertida' and pg.status = 'contestado' then update app.pagamentos set status = 'pago' where id = pg.id;
      end if;
      -- dinheiro devolvido ou em disputa: o projeto PARA (a equipe decide depois)
      if v_estado in ('estornada', 'estornada_parcial', 'contestada') then
        update app.projetos pj set status = 'pausado'
        from app.propostas pr2 where pr2.id = pg.proposta_id and pj.id = pr2.projeto_id and pj.status in ('pronto_para_producao', 'em_producao', 'em_revisao');
        if found then
          perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'project.paused', v_prov, v_order, v_origem, null, 'pausado',
            jsonb_build_object('motivo', v_estado), v_req);
        end if;
      end if;
    end if;
    return jsonb_build_object('aplicado', v_estado);
  end if;

  -- ---------- os demais (pendências e finais sem dinheiro) ----------
  update app.tentativas_pagamento set status = v_estado where id = t.id;
  perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id,
    case v_estado when 'recusada' then 'payment.failed' when 'cancelada' then 'payment.cancelled' when 'expirada' then 'payment.expired'
                  when 'requer_acao' then 'payment.requires_action' else 'payment.pending' end,
    v_prov, v_order, v_origem, v_antes, v_estado, jsonb_build_object('status_detail', left(rp ->> 'status_detail', 60)), v_req);
  return jsonb_build_object('aplicado', v_estado);
end $$;

-- ==========================================================================
-- 4. vincular a order criada à tentativa (uma vez)
-- ==========================================================================
create function app.pagamentos_vincular(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t app.tentativas_pagamento;
begin
  select * into t from app.tentativas_pagamento where id = (p ->> 'tentativa_id')::uuid for update;
  if not found then raise exception 'tentativa não encontrada' using errcode = 'P0002'; end if;
  if t.provedor_order_id is not null then
    if t.provedor_order_id = p ->> 'provedor_order_id' then return jsonb_build_object('ok', true); end if;
    raise exception 'tentativa já vinculada a outra order' using errcode = '23514';
  end if;
  update app.tentativas_pagamento set provedor_order_id = p ->> 'provedor_order_id' where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

-- ==========================================================================
-- 5. o que o visitante vê do pagamento da conversa dele (sem ids do provedor nem dados internos)
-- ==========================================================================
create function app.pagamentos_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pg app.pagamentos; t app.tentativas_pagamento;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  select pa.* into pg from app.pagamentos pa join app.propostas pr on pr.id = pa.proposta_id
  where pr.conversa_id = c.id and pa.parcela = 'sinal' order by pa.created_at desc limit 1;
  if not found then return jsonb_build_object('pagamento', null); end if;
  select * into t from app.tentativas_pagamento where pagamento_id = pg.id order by created_at desc limit 1;
  return jsonb_build_object(
    'pagamento', jsonb_build_object('status', pg.status, 'valor', pg.valor, 'moeda', pg.moeda, 'pago_em', pg.pago_em),
    'tentativa', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'metodo', t.metodo, 'status', t.status, 'detalhe', t.detalhe_provedor, 'parcelas', t.parcelas, 'meio', t.meio,
      'pix_qr', case when t.status = 'aguardando' then t.pix_qr end,
      'pix_qr_base64', case when t.status = 'aguardando' then t.pix_qr_base64 end,
      'expira_em', t.expira_em,
      'desafio_url', case when t.status = 'requer_acao' then t.desafio_url end,
      'consultada_em', t.consultada_em, 'criada_em', t.created_at) end);
end $$;

-- ==========================================================================
-- 6. a tentativa (para o serviço) — só o que ele precisa para consultar o provedor
-- ==========================================================================
create function app.pagamentos_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t app.tentativas_pagamento;
begin
  select tp.* into t from app.tentativas_pagamento tp
    join app.pagamentos pa on pa.id = tp.pagamento_id join app.propostas pr on pr.id = pa.proposta_id
    join app.conversas c on c.id = pr.conversa_id
  where tp.id = (p ->> 'tentativa_id')::uuid and c.id = (p ->> 'conversa_id')::uuid and c.visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'tentativa não encontrada' using errcode = 'P0002'; end if;
  return jsonb_build_object('tentativa_id', t.id, 'provedor', t.provedor, 'provedor_order_id', t.provedor_order_id, 'status', t.status,
    'chave_idempotencia', t.chave_idempotencia, 'metodo', t.metodo, 'valor', t.valor, 'consultada_em', t.consultada_em, 'criada_em', t.created_at);
end $$;

-- ==========================================================================
-- 7. reconciliação: o que precisa ser conferido no provedor
--    • tentativas não terminais (inclusive sem order: a resposta da criação pode ter se perdido)
--    • tentativas aprovadas/duplicadas recentes (estorno e contestação acontecem depois)
-- ==========================================================================
create function app.pagamentos_para_reconciliar(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tentativa_id', t.id, 'provedor', t.provedor, 'provedor_order_id', t.provedor_order_id,
                                               'status', t.status, 'criada_em', t.created_at, 'valor', t.valor, 'metodo', t.metodo)
                            order by t.updated_at), '[]')
  from (
    select * from app.tentativas_pagamento
    where provedor = p ->> 'provedor'
      and ((status in ('criada', 'processando', 'aguardando', 'requer_acao') and updated_at < now() - make_interval(secs => coalesce((p ->> 'idade_min_s')::integer, 120)))
        or (status in ('aprovada', 'duplicada', 'estornada_parcial', 'contestada') and aprovada_em > now() - make_interval(days => coalesce((p ->> 'dias_aprovadas')::integer, 180))))
    order by updated_at
    limit least(coalesce((p ->> 'limite')::integer, 100), 500)
  ) t
$$;

-- ==========================================================================
-- 8. registrar um aviso recebido (aceito ou recusado) — só auditoria, sem estado
-- ==========================================================================
create function app.pagamentos_registrar_aviso(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.auditar_pagamento(null, null, null,
    case when (p ->> 'aceito')::boolean then 'payment.webhook.received' else 'payment.webhook.rejected' end,
    left(p ->> 'provedor', 30), left(p ->> 'provedor_ref', 80), 'webhook', null, null,
    jsonb_build_object('motivo', left(p ->> 'motivo', 80), 'acao', left(p ->> 'acao', 60)), left(p ->> 'request_id', 120));
  return jsonb_build_object('ok', true);
end $$;

-- 9. registrar um resultado de reconciliação ou erro do provedor (auditoria)
create function app.pagamentos_registrar_ocorrencia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t app.tentativas_pagamento;
begin
  if (p ->> 'evento') not in ('payment.reconciled', 'payment.divergence', 'payment.provider_error') then raise exception 'evento inválido' using errcode = '22023'; end if;
  if (p ->> 'tentativa_id') ~ '^[0-9a-f-]{36}$' then select * into t from app.tentativas_pagamento where id = (p ->> 'tentativa_id')::uuid; end if;
  perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, p ->> 'evento', left(p ->> 'provedor', 30), left(p ->> 'provedor_ref', 80),
    coalesce(p ->> 'origem', 'reconciliacao'), null, null, coalesce(p -> 'detalhe', '{}'), left(p ->> 'request_id', 120));
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['pagamentos_iniciar_tentativa', 'pagamentos_encerrar_tentativa', 'pagamentos_aplicar', 'pagamentos_vincular',
                           'pagamentos_estado', 'pagamentos_tentativa', 'pagamentos_para_reconciliar', 'pagamentos_registrar_aviso',
                           'pagamentos_registrar_ocorrencia'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
revoke all on function privado.auditar_pagamento(uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function privado.tentativa_transicao() from public, anon, authenticated;
