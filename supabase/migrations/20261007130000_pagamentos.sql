-- ==========================================================================
-- PAGAMENTOS (Mercado Pago, Orders API) — o domínio financeiro no banco.
-- Documentos: docs/pagamentos/00-PESQUISA-E-PLANO.md e 01-ARQUITETURA-E-OPERACAO.md.
--
--   app.pagamentos            o que deve ser pago (sinal da proposta aceita). Valor SÓ da proposta.
--   app.tentativas_pagamento  cada tentativa (Pix ou cartão) = uma order no provedor
--   app.pagamentos_auditoria  trilha append-only (trigger bloqueia alterar/apagar, para TODOS)
--
-- Regras que valem AQUI (a última trava, mesmo que o código acima erre):
--   • o pagamento só vira "pago" por app.pagamentos_aplicar, com o retrato da order
--     consultada no provedor, conferindo tentativa, referência, valores, país/moeda,
--     conta e meio; qualquer divergência: NÃO aplica (fail closed), e o caso vai para
--     uma pessoa ("divergente"); retrato incompleto (campo nulo) também não aplica;
--   • estado desconhecido nunca vira pago; regressão é ignorada; fim sem dinheiro
--     (recusada, cancelada, expirada) só anda para aprovada ou estorno;
--   • o DINHEIRO é gravado primeiro; criar cliente e projeto é um passo separado
--     (subtransação): se falhar, o pagamento continua pago e o erro vai para a trilha;
--   • o projeto nasce "pronto_para_producao" (a equipe dá a partida em em_producao);
--   • estorno ou contestação do pagamento que liberou PAUSA o projeto;
--   • uma tentativa ativa por pagamento; cartão: no máximo 5 por pagamento e 20 s depois de
--     uma recusa; muitas recusas de cartão na última hora pausam o cartão (teste de cartões);
--   • ordem de travas em todas as funções: conversa → pagamento → tentativa;
--   • o service_role NÃO escreve nas tabelas financeiras: só pelas funções.
-- Erros: P0002 não encontrado; 55000 etapa errada; 22023 dado inválido; 23514 regra; 55P03 aguarde.
-- ==========================================================================

-- ---------- estados novos ----------
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'app.pagamentos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%pendente%' loop
    execute format('alter table app.pagamentos drop constraint %I', r.conname);
  end loop;
  for r in select conname from pg_constraint where conrelid = 'app.projetos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%em_producao%' loop
    execute format('alter table app.projetos drop constraint %I', r.conname);
  end loop;
end $$;
alter table app.pagamentos add constraint pagamentos_status_check
  check (status in ('pendente', 'pago', 'cancelado', 'expirado', 'estornado', 'contestado'));
alter table app.projetos add constraint projetos_status_check
  check (status in ('briefing', 'proposta', 'pronto_para_producao', 'em_producao', 'em_revisao', 'entregue', 'pausado', 'cancelado'));
-- a cobrança viva da parcela inclui a contestada (não abre outra por cima de uma em disputa)
drop index app.pagamentos_parcela_viva;
create unique index pagamentos_parcela_viva on app.pagamentos (proposta_id, parcela) where status in ('pendente', 'pago', 'contestado');

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
                        'expirada', 'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida', 'duplicada', 'divergente')),
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
create index tentativas_aprovadas on app.tentativas_pagamento (aprovada_em) where status in ('aprovada', 'duplicada', 'estornada_parcial', 'contestada');
create index tentativas_recusas_recentes on app.tentativas_pagamento (org_id, updated_at) where status = 'recusada' and metodo = 'cartao';
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
  if new.status is distinct from old.status then
    -- com dinheiro (aprovada e o que vem dela): só estorno, contestação, duplicidade ou divergência
    if old.status in ('aprovada', 'duplicada', 'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida')
       and new.status not in ('estornada', 'estornada_parcial', 'contestada', 'contestada_revertida', 'divergente') then
      raise exception 'tentativa: % para % não é permitido', old.status, new.status using errcode = '23514';
    end if;
    -- fim sem dinheiro: só para aprovada (o provedor diz que pagou: dinheiro real), estorno ou divergência
    if old.status in ('recusada', 'cancelada', 'expirada', 'divergente')
       and new.status not in ('aprovada', 'duplicada', 'estornada', 'estornada_parcial', 'contestada', 'divergente') then
      raise exception 'tentativa: % para % não é permitido', old.status, new.status using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger tentativa_transicao before update on app.tentativas_pagamento
  for each row execute function privado.tentativa_transicao();

-- ---------- auditoria financeira (append-only) ----------
-- (org_id sem FK: apagar a organização não pode reescrever a trilha)
create table app.pagamentos_auditoria (
  id             bigint generated always as identity primary key,
  org_id         uuid,
  pagamento_id   uuid,
  tentativa_id   uuid,
  evento         text not null check (evento in (
                   'payment.created', 'payment.pending', 'payment.requires_action', 'payment.confirmed', 'payment.failed',
                   'payment.cancelled', 'payment.expired', 'payment.refunded', 'payment.chargeback', 'payment.duplicate',
                   'payment.mismatch', 'payment.unknown_status', 'payment.provider_error', 'payment.reconciled',
                   'payment.divergence', 'payment.webhook.received', 'payment.webhook.rejected', 'project.ready', 'project.paused',
                   'project.error')),
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
create index pagamentos_auditoria_tent on app.pagamentos_auditoria (tentativa_id, evento, created_at desc);
create index pagamentos_auditoria_ref on app.pagamentos_auditoria (provedor_ref);
create index pagamentos_auditoria_evento on app.pagamentos_auditoria (evento, created_at desc);

create function privado.auditoria_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'a trilha financeira não se altera nem se apaga' using errcode = '42501';
end $$;
create trigger auditoria_imutavel before update or delete on app.pagamentos_auditoria
  for each row execute function privado.auditoria_imutavel();
create trigger auditoria_sem_truncate before truncate on app.pagamentos_auditoria
  for each statement execute function privado.auditoria_imutavel();

-- grava um evento; org nula vira a da organização informada (a equipe precisa ver a divergência de dinheiro desconhecido)
create function privado.auditar_pagamento(p_org uuid, p_pag uuid, p_tent uuid, p_evento text, p_provedor text, p_ref text,
                                          p_origem text, p_antes text, p_depois text, p_detalhe jsonb, p_request text)
returns void language sql security definer set search_path = '' as $$
  insert into app.pagamentos_auditoria (org_id, pagamento_id, tentativa_id, evento, provedor, provedor_ref, origem, status_antes, status_depois, detalhe, request_id)
  values (p_org, p_pag, p_tent, p_evento, left(p_provedor, 30), left(p_ref, 80),
          case when p_origem in ('criacao', 'webhook', 'consulta', 'reconciliacao', 'operacao') then p_origem else 'consulta' end,
          left(p_antes, 40), left(p_depois, 40), coalesce(p_detalhe, '{}'), left(p_request, 120));
$$;
-- a mesma ocorrência repetida (cada execução da reconciliação) não enche a trilha: uma por dia
create function privado.auditar_uma_vez(p_org uuid, p_pag uuid, p_tent uuid, p_evento text, p_provedor text, p_ref text,
                                        p_origem text, p_antes text, p_depois text, p_detalhe jsonb, p_request text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from app.pagamentos_auditoria a
             where a.evento = p_evento and a.created_at > now() - interval '1 day'
               and coalesce(a.tentativa_id::text, a.provedor_ref, '') = coalesce(p_tent::text, p_ref, '')
               and a.detalhe ->> 'motivo' is not distinct from p_detalhe ->> 'motivo') then
    return;
  end if;
  perform privado.auditar_pagamento(p_org, p_pag, p_tent, p_evento, p_provedor, p_ref, p_origem, p_antes, p_depois, p_detalhe, p_request);
end $$;
create function privado.org_por_slug(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from app.organizacoes where slug = p_slug
$$;

-- ---------- acesso: o service_role só LÊ; escrever é pelas funções ----------
revoke all on app.tentativas_pagamento, app.pagamentos_auditoria from public, anon, authenticated, service_role;
grant select on app.tentativas_pagamento, app.pagamentos_auditoria to authenticated, service_role;
revoke insert, update, delete, truncate on app.pagamentos from service_role;
alter table app.tentativas_pagamento enable row level security;
alter table app.pagamentos_auditoria enable row level security;
create policy tentativas_ler on app.tentativas_pagamento for select to authenticated using (org_id in (select privado.minhas_orgs()));
create policy pagamentos_auditoria_ler on app.pagamentos_auditoria for select to authenticated using (org_id in (select privado.minhas_orgs()));

-- ---------- as funções antigas do gateway simulado saem ----------
drop function app.vendas_reservar_cobranca(jsonb);
drop function app.vendas_vincular_cobranca(jsonb);
drop function app.vendas_confirmar_pagamento(jsonb);
drop function app.vendas_contato_da_conversa(jsonb);

-- ==========================================================================
-- 1. começar uma tentativa: o valor vem da proposta ACEITA da conversa do visitante
--    Freios contra teste de cartões: 5 tentativas de cartão por pagamento, 20 s depois de uma recusa,
--    e o cartão pausa se houver muitas recusas na organização na última hora.
-- ==========================================================================
create function app.pagamentos_iniciar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pr app.propostas; pg app.pagamentos; t app.tentativas_pagamento; v_valor numeric; v_qtd integer; v_ultima timestamptz;
begin
  if coalesce(p ->> 'metodo', '') not in ('pix', 'cartao') then raise exception 'método inválido' using errcode = '22023'; end if;
  if coalesce(p ->> 'provedor', '') !~ '^[a-z0-9_]{2,30}$' then raise exception 'provedor inválido' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- trava 1: conversa
  perform privado.exigir_etapa(c, array['aguardando_pagamento']);
  select * into pr from app.propostas where conversa_id = c.id and status = 'aceita' order by versao desc limit 1;
  if not found then raise exception 'proposta aceita não encontrada' using errcode = 'P0002'; end if;
  v_valor := round(pr.valor_total * coalesce(pr.sinal_percentual, 50) / 100.0, 2);

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

-- ==========================================================================
-- 2. encerrar uma tentativa que NÃO tem order no provedor (criação recusada ou abandonada)
--    Com order vinculada, quem decide é o retrato do provedor (pagamentos_aplicar).
-- ==========================================================================
create function app.pagamentos_encerrar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t app.tentativas_pagamento; v_status text := p ->> 'status';
begin
  if coalesce(v_status, '') not in ('cancelada', 'recusada', 'expirada') then raise exception 'status inválido' using errcode = '22023'; end if;
  select * into t from app.tentativas_pagamento where id = (p ->> 'tentativa_id')::uuid for update;
  if not found then raise exception 'tentativa não encontrada' using errcode = 'P0002'; end if;
  if t.status not in ('criada', 'processando', 'aguardando', 'requer_acao') or t.provedor_order_id is not null then
    return jsonb_build_object('sem_mudanca', true, 'status', t.status);
  end if;
  update app.tentativas_pagamento set status = v_status, detalhe_provedor = left(p ->> 'motivo', 60) where id = t.id;
  perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id,
    case v_status when 'cancelada' then 'payment.cancelled' when 'expirada' then 'payment.expired' else 'payment.failed' end,
    t.provedor, null, coalesce(p ->> 'origem', 'criacao'), t.status, v_status,
    jsonb_build_object('motivo', left(p ->> 'motivo', 60)), p ->> 'request_id');
  return jsonb_build_object('status', v_status);
end $$;

-- ==========================================================================
-- 3. APLICAR o retrato de uma order consultada no provedor. A ÚNICA porta para "pago".
--    p = { provedor, origem, request_id, conta_esperada, org_slug, retrato: {
--          order_id, external_reference, user_id, total_amount, country_code, currency?,
--          pagamento: { id, amount, paid_amount, status, status_detail, metodo_id, metodo_tipo, parcelas },
--          pix?: { qr, qr_base64, link, expira_em }, desafio_url?, reembolsado?, estado } }
-- ==========================================================================
create function app.pagamentos_aplicar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := coalesce(p -> 'retrato', '{}'); rp jsonb := coalesce(p -> 'retrato' -> 'pagamento', '{}');
  v_prov text := p ->> 'provedor'; v_req text := p ->> 'request_id';
  v_origem text := case when p ->> 'origem' in ('criacao', 'webhook', 'consulta', 'reconciliacao', 'operacao') then p ->> 'origem' else 'consulta' end;
  v_order text := r ->> 'order_id'; v_estado text := coalesce(r ->> 'estado', '');
  v_ref text := coalesce(r ->> 'external_reference', '');
  v_org uuid := privado.org_por_slug(coalesce(p ->> 'org_slug', 'beyon-zero'));
  VALOR constant text := '^\d{1,10}(\.\d{1,2})?$';
  UUID_RE constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_tid uuid; v_cid uuid; v_vincular boolean := false;
  t app.tentativas_pagamento; pg app.pagamentos; pr app.propostas; c app.conversas; l app.leads;
  v_total numeric; v_amount numeric; v_pago numeric; v_motivo text; v_incompleto text; v_antes text;
  v_cliente uuid; v_projeto uuid; v_tipo text; v_meio_ok boolean;
begin
  if coalesce(v_prov, '') !~ '^[a-z0-9_]{2,30}$' or coalesce(v_order, '') !~ '^[A-Za-z0-9_-]{4,64}$' then
    raise exception 'retrato inválido' using errcode = '22023';
  end if;
  if v_estado not in ('processando', 'aguardando', 'requer_acao', 'aprovada', 'recusada', 'cancelada', 'expirada',
                      'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida', 'desconhecido') then
    raise exception 'estado inválido' using errcode = '22023';
  end if;

  -- localizar SEM travar: pela order vinculada, ou (resposta da criação perdida) pela referência, se ainda sem order
  select id into v_tid from app.tentativas_pagamento where provedor = v_prov and provedor_order_id = v_order;
  if v_tid is null and v_ref ~ UUID_RE then
    select id into v_tid from app.tentativas_pagamento where id = v_ref::uuid and provedor = v_prov and provedor_order_id is null;
    v_vincular := v_tid is not null;
  end if;
  if v_tid is null then
    perform privado.auditar_uma_vez(v_org, null, null, 'payment.divergence', v_prov, v_order, v_origem, null, v_estado,
      jsonb_build_object('motivo', 'order sem tentativa conhecida', 'external_reference', left(v_ref, 64)), v_req);
    return jsonb_build_object('ignorado', 'order desconhecida');
  end if;
  -- travas na ordem de todas as funções: conversa → pagamento → tentativa
  select pr2.conversa_id into v_cid from app.tentativas_pagamento t2 join app.pagamentos p2 on p2.id = t2.pagamento_id
    join app.propostas pr2 on pr2.id = p2.proposta_id where t2.id = v_tid;
  select * into c from app.conversas where id = v_cid for update;
  select p2.* into pg from app.pagamentos p2 join app.tentativas_pagamento t2 on t2.pagamento_id = p2.id where t2.id = v_tid for update of p2;
  select * into t from app.tentativas_pagamento where id = v_tid for update;
  if v_vincular and t.provedor_order_id is not null and t.provedor_order_id <> v_order then
    return jsonb_build_object('ignorado', 'tentativa já vinculada a outra order');
  end if;

  -- ---------- retrato incompleto: nada é decidido (nem divergência), só registrado ----------
  v_incompleto := case
    when coalesce(r ->> 'total_amount', '') !~ VALOR then 'total ausente ou malformado'
    when coalesce(rp ->> 'amount', '') !~ VALOR then 'valor da transação ausente ou malformado'
    when nullif(rp ->> 'status', '') is null or nullif(rp ->> 'status_detail', '') is null then 'status ausente'
    when nullif(rp ->> 'metodo_tipo', '') is null or nullif(rp ->> 'metodo_id', '') is null then 'meio ausente'
    when nullif(r ->> 'country_code', '') is null then 'país ausente'
  end;
  if v_incompleto is not null then
    perform privado.auditar_uma_vez(t.org_id, t.pagamento_id, t.id, 'payment.unknown_status', v_prov, v_order, v_origem, t.status, null,
      jsonb_build_object('motivo', v_incompleto), v_req);
    return jsonb_build_object('sem_mudanca', true, 'motivo', v_incompleto);
  end if;
  v_total := (r ->> 'total_amount')::numeric;
  v_amount := (rp ->> 'amount')::numeric;
  v_pago := case when coalesce(rp ->> 'paid_amount', '') ~ VALOR then (rp ->> 'paid_amount')::numeric end;
  v_meio_ok := (t.metodo = 'pix' and rp ->> 'metodo_tipo' = 'bank_transfer' and rp ->> 'metodo_id' = 'pix')
            or (t.metodo = 'cartao' and rp ->> 'metodo_tipo' in ('credit_card', 'debit_card'));

  -- ---------- conferência financeira (fail closed; nenhum ramo depende de NULL) ----------
  v_motivo := case
    when v_ref <> t.id::text then 'referência externa diferente'
    when coalesce(p ->> 'conta_esperada', '') = '' then 'conta esperada não configurada'
    when coalesce(r ->> 'user_id', '') <> p ->> 'conta_esperada' then 'conta do provedor diferente'
    when r ->> 'country_code' <> 'BRA' then 'país diferente'
    when r ? 'currency' and coalesce(r ->> 'currency', '') <> 'BRL' then 'moeda diferente'
    when pg.moeda <> 'BRL' then 'moeda do pagamento'
    when v_total <> t.valor then 'valor total diferente'
    when v_amount <> t.valor then 'valor da transação diferente'
    when t.valor <> pg.valor then 'valor da tentativa diferente do pagamento'
    when not coalesce(v_meio_ok, false) then 'meio de pagamento diferente'
    when v_estado = 'aprovada' and not (rp ->> 'status' = 'processed' and rp ->> 'status_detail' = 'accredited') then 'estado aprovado sem status de aprovação'
    when v_estado = 'aprovada' and (v_pago is null or v_pago < t.valor) then 'valor pago ausente ou menor'
  end;
  if v_motivo is not null then
    -- divergência real: o caso sai da fila ativa e vai para uma pessoa (o retrato bruto fica registrado)
    update app.tentativas_pagamento set status = case when status in ('aprovada', 'duplicada', 'estornada', 'contestada', 'contestada_revertida', 'estornada_parcial') then status else 'divergente' end,
      status_provedor = left(rp ->> 'status', 40), detalhe_provedor = left(rp ->> 'status_detail', 60), valor_pago = coalesce(v_pago, valor_pago),
      consultada_em = now()
    where id = t.id;
    perform privado.auditar_uma_vez(t.org_id, t.pagamento_id, t.id, 'payment.mismatch', v_prov, v_order, v_origem, t.status, 'divergente',
      jsonb_build_object('motivo', v_motivo, 'status', left(rp ->> 'status', 40), 'status_detail', left(rp ->> 'status_detail', 60),
                         'total', r ->> 'total_amount', 'pago', rp ->> 'paid_amount'), v_req);
    return jsonb_build_object('recusado', v_motivo);
  end if;

  -- passou: agora sim vincula (se veio pela referência) e grava o retrato
  update app.tentativas_pagamento set
    provedor_order_id = coalesce(provedor_order_id, v_order),
    provedor_pagamento_id = coalesce(left(rp ->> 'id', 64), provedor_pagamento_id),
    status_provedor = left(rp ->> 'status', 40), detalhe_provedor = left(rp ->> 'status_detail', 60),
    meio = coalesce(case when rp ->> 'metodo_id' ~ '^[a-z0-9_]{2,30}$' then rp ->> 'metodo_id' end, meio),
    tipo_meio = coalesce(case when rp ->> 'metodo_tipo' in ('bank_transfer', 'credit_card', 'debit_card') then rp ->> 'metodo_tipo' end, tipo_meio),
    parcelas = coalesce(case when (rp ->> 'parcelas') ~ '^\d{1,2}$' and (rp ->> 'parcelas')::integer between 1 and 24 then (rp ->> 'parcelas')::integer end, parcelas),
    valor_pago = coalesce(v_pago, valor_pago),
    pix_qr = coalesce(left(r -> 'pix' ->> 'qr', 1000), pix_qr),
    pix_qr_base64 = coalesce(case when char_length(r -> 'pix' ->> 'qr_base64') <= 30000 and (r -> 'pix' ->> 'qr_base64') ~ '^[A-Za-z0-9+/=]+$' then r -> 'pix' ->> 'qr_base64' end, pix_qr_base64),
    pix_link = coalesce(case when (r -> 'pix' ->> 'link') ~ '^https://' then left(r -> 'pix' ->> 'link', 500) end, pix_link),
    expira_em = coalesce(case when (r -> 'pix' ->> 'expira_em') ~ '^\d{4}-\d{2}-\d{2}T' then (r -> 'pix' ->> 'expira_em')::timestamptz end, expira_em),
    desafio_url = case when (r ->> 'desafio_url') ~ '^https://' then left(r ->> 'desafio_url', 1000) else desafio_url end,
    consultada_em = now()
  where id = t.id
  returning * into t;

  v_antes := t.status;
  if v_estado = 'desconhecido' then
    perform privado.auditar_uma_vez(t.org_id, t.pagamento_id, t.id, 'payment.unknown_status', v_prov, v_order, v_origem, t.status, null,
      jsonb_build_object('motivo', 'estado sem mapeamento', 'status', left(rp ->> 'status', 40), 'status_detail', left(rp ->> 'status_detail', 60)), v_req);
    return jsonb_build_object('sem_mudanca', true, 'motivo', 'estado desconhecido');
  end if;
  if v_estado = t.status then return jsonb_build_object('sem_mudanca', true, 'status', t.status); end if;
  -- regressão (avisos fora de ordem): depois de dinheiro, só estorno/contestação andam
  if t.status in ('aprovada', 'duplicada', 'estornada', 'estornada_parcial', 'contestada', 'contestada_revertida')
     and v_estado not in ('estornada', 'estornada_parcial', 'contestada', 'contestada_revertida') then
    return jsonb_build_object('sem_mudanca', true, 'status', t.status, 'ignorado', 'regressão');
  end if;
  -- fim sem dinheiro não volta a ativo (retrato velho, ou order tardia de tentativa já encerrada)
  if t.status in ('recusada', 'cancelada', 'expirada') and v_estado in ('processando', 'aguardando', 'requer_acao') then
    perform privado.auditar_uma_vez(t.org_id, t.pagamento_id, t.id, 'payment.divergence', v_prov, v_order, v_origem, t.status, v_estado,
      jsonb_build_object('motivo', 'tentativa encerrada voltou a ficar ativa no provedor'), v_req);
    return jsonb_build_object('sem_mudanca', true, 'status', t.status, 'ignorado', 'encerrada');
  end if;

  -- ---------- aprovação: o DINHEIRO primeiro ----------
  if v_estado = 'aprovada' then
    if pg.status <> 'pendente' then
      update app.tentativas_pagamento set status = 'duplicada', aprovada_em = now() where id = t.id;
      perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.duplicate', v_prov, v_order, v_origem, v_antes, 'duplicada',
        jsonb_build_object('acao', 'reembolsar esta order', 'valor', t.valor), v_req);
      return jsonb_build_object('duplicada', true);
    end if;
    update app.tentativas_pagamento set status = 'aprovada', aprovada_em = now() where id = t.id;
    update app.pagamentos set status = 'pago', pago_em = now(), gateway_ref = coalesce(gateway_ref, v_order) where id = pg.id;
    perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.confirmed', v_prov, v_order, v_origem, v_antes, 'aprovada',
      jsonb_build_object('valor', t.valor, 'valor_pago', rp ->> 'paid_amount', 'meio', t.meio, 'parcelas', t.parcelas), v_req);
    if c.etapa = 'aguardando_pagamento' then
      update app.conversas set etapa = 'em_producao', ultima_atividade = now() where id = c.id;
    end if;
    perform privado.evento(pg.org_id, c.id, 'pagamento_confirmado', jsonb_build_object('valor', pg.valor, 'parcela', pg.parcela));

    -- cliente e projeto: passo SEPARADO (subtransação). Se falhar, o pagamento continua pago e o erro vai para a trilha
    if pg.parcela = 'sinal' then
      begin
        select * into pr from app.propostas where id = pg.proposta_id for update;
        select * into l from app.leads where id = pr.lead_id for update;
        if pr.projeto_id is null then
          v_cliente := l.cliente_id;
          if v_cliente is null then
            insert into app.clientes (org_id, nome, tipo, contato_nome, email, telefone)
            values (pr.org_id, left(coalesce(nullif(btrim(c.briefing #>> '{negocio,nome}'), ''), nullif(btrim(l.empresa), ''), nullif(btrim(l.nome), ''), 'Cliente'), 160),
                    'empresa', left(nullif(btrim(l.nome), ''), 120), l.email, l.telefone)
            returning id into v_cliente;
          end if;
          update app.leads set status = 'ganho', cliente_id = v_cliente where id = l.id;
          v_tipo := case c.briefing #>> '{projeto,formato}' when 'landing_page' then 'landing_page' when 'institucional' then 'site_institucional'
                                                             when 'sob_medida' then 'site_sob_medida' else 'outro' end;
          insert into app.projetos (org_id, cliente_id, lead_id, nome, tipo, status, inicio_em, previsto_para)
          values (pr.org_id, v_cliente, l.id, left(coalesce(nullif(btrim(pr.titulo), ''), 'Site'), 160), v_tipo, 'pronto_para_producao', current_date,
                  current_date + coalesce(pr.prazo_dias, 10))
          returning id into v_projeto;
          update app.propostas set projeto_id = v_projeto where id = pr.id;
          perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'project.ready', v_prov, v_order, v_origem, null, 'pronto_para_producao',
            jsonb_build_object('projeto_id', v_projeto), v_req);
        end if;
      exception when others then
        perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'project.error', v_prov, v_order, v_origem, null, null,
          jsonb_build_object('motivo', 'não foi possível criar cliente/projeto: ' || left(sqlerrm, 120), 'codigo', sqlstate), v_req);
      end;
    end if;
    return jsonb_build_object('aplicado', 'aprovada', 'projeto_id', v_projeto);
  end if;

  -- ---------- estorno / contestação ----------
  if v_estado in ('estornada', 'estornada_parcial', 'contestada', 'contestada_revertida') then
    if t.status not in ('aprovada', 'duplicada', 'estornada_parcial', 'contestada', 'contestada_revertida') then
      -- nunca vimos a aprovação aqui (aviso perdido + estorno rápido): registra o estado do provedor (sai da fila ativa)
      -- e a divergência; o pagamento não muda (nunca foi dado como pago)
      update app.tentativas_pagamento set status = case when v_estado = 'contestada_revertida' then 'divergente' else v_estado end where id = t.id;
      perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id, 'payment.divergence', v_prov, v_order, v_origem, v_antes, v_estado,
        jsonb_build_object('motivo', 'estorno/contestação sem aprovação registrada', 'reembolsado', r ->> 'reembolsado'), v_req);
      return jsonb_build_object('aplicado', v_estado, 'divergencia', true);
    end if;
    update app.tentativas_pagamento set status = v_estado where id = t.id;
    perform privado.auditar_pagamento(t.org_id, t.pagamento_id, t.id,
      case when v_estado like 'contestada%' then 'payment.chargeback' else 'payment.refunded' end,
      v_prov, v_order, v_origem, v_antes, v_estado, jsonb_build_object('reembolsado', r ->> 'reembolsado'), v_req);
    if v_antes <> 'duplicada' and pg.gateway_ref = v_order then
      if v_estado = 'estornada' and pg.status in ('pago', 'contestado') then update app.pagamentos set status = 'estornado' where id = pg.id;
      elsif v_estado = 'contestada' and pg.status = 'pago' then update app.pagamentos set status = 'contestado' where id = pg.id;
      elsif v_estado = 'contestada_revertida' and pg.status = 'contestado' then update app.pagamentos set status = 'pago' where id = pg.id;
      end if;
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

  -- ---------- os demais (pendências e fins sem dinheiro) ----------
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
  if coalesce(p ->> 'provedor_order_id', '') !~ '^[A-Za-z0-9_-]{4,64}$' then raise exception 'order inválida' using errcode = '22023'; end if;
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
-- 6. a tentativa (para o serviço): pela conversa do visitante, ou pela order (operação da equipe)
-- ==========================================================================
create function app.pagamentos_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t app.tentativas_pagamento;
begin
  if p ? 'provedor_order_id' then
    select * into t from app.tentativas_pagamento where provedor_order_id = p ->> 'provedor_order_id' and provedor = coalesce(p ->> 'provedor', 'mercadopago');
  else
    select tp.* into t from app.tentativas_pagamento tp
      join app.pagamentos pa on pa.id = tp.pagamento_id join app.propostas pr on pr.id = pa.proposta_id
      join app.conversas c on c.id = pr.conversa_id
    where tp.id = (p ->> 'tentativa_id')::uuid and c.id = (p ->> 'conversa_id')::uuid and c.visitante_id = (p ->> 'visitante_id')::uuid;
  end if;
  if t.id is null then raise exception 'tentativa não encontrada' using errcode = 'P0002'; end if;
  return jsonb_build_object('tentativa_id', t.id, 'provedor', t.provedor, 'provedor_order_id', t.provedor_order_id, 'status', t.status,
    'chave_idempotencia', t.chave_idempotencia, 'metodo', t.metodo, 'valor', t.valor, 'consultada_em', t.consultada_em, 'criada_em', t.created_at);
end $$;

-- ==========================================================================
-- 7. reconciliação: o que precisa ser conferido no provedor
--    • tentativas não terminais (inclusive sem order: a resposta da criação pode ter se perdido)
--    • tentativas com dinheiro recentes (estorno e contestação vêm depois), até 85 dias (o MP consulta orders de até 3 meses)
-- ==========================================================================
create function app.pagamentos_para_reconciliar(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tentativa_id', t.id, 'provedor', t.provedor, 'provedor_order_id', t.provedor_order_id,
                                               'status', t.status, 'criada_em', t.created_at, 'valor', t.valor, 'metodo', t.metodo)
                            order by coalesce(t.consultada_em, t.created_at)), '[]')
  from (
    select * from app.tentativas_pagamento
    where provedor = p ->> 'provedor'
      and ((status in ('criada', 'processando', 'aguardando', 'requer_acao') and updated_at < now() - make_interval(secs => coalesce((p ->> 'idade_min_s')::integer, 120)))
        or (status in ('aprovada', 'duplicada', 'estornada_parcial', 'contestada') and aprovada_em > now() - make_interval(days => least(coalesce((p ->> 'dias_aprovadas')::integer, 85), 85))))
    order by coalesce(consultada_em, created_at)
    limit least(coalesce((p ->> 'limite')::integer, 50), 200)
  ) t
$$;

-- 8. o que pede uma pessoa (o cron devolve a contagem e o log da Vercel acusa)
create function app.pagamentos_atencao(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('total', count(*), 'eventos', coalesce(jsonb_object_agg(evento, n), '{}'))
  from (select evento, count(*) n from app.pagamentos_auditoria
        where created_at > now() - make_interval(hours => coalesce((p ->> 'horas')::integer, 25))
          and evento in ('payment.mismatch', 'payment.divergence', 'payment.duplicate', 'payment.unknown_status', 'payment.chargeback',
                         'payment.refunded', 'project.paused', 'project.error')
        group by evento) x
$$;

-- 9. registrar um aviso ACEITO (assinatura válida) — só auditoria, sem estado
create function app.pagamentos_registrar_aviso(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.auditar_pagamento(privado.org_por_slug(coalesce(p ->> 'org_slug', 'beyon-zero')), null, null, 'payment.webhook.received',
    left(p ->> 'provedor', 30), left(p ->> 'provedor_ref', 80), 'webhook', null, null,
    jsonb_build_object('acao', left(p ->> 'acao', 60)), left(p ->> 'request_id', 120));
  return jsonb_build_object('ok', true);
end $$;

-- 10. registrar um resultado de reconciliação ou erro do provedor (auditoria; repetidos uma vez por dia)
create function app.pagamentos_registrar_ocorrencia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t app.tentativas_pagamento;
begin
  if coalesce(p ->> 'evento', '') not in ('payment.reconciled', 'payment.divergence', 'payment.provider_error') then raise exception 'evento inválido' using errcode = '22023'; end if;
  if coalesce(p ->> 'tentativa_id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into t from app.tentativas_pagamento where id = (p ->> 'tentativa_id')::uuid;
  end if;
  if p ->> 'evento' = 'payment.reconciled' then
    perform privado.auditar_pagamento(coalesce(t.org_id, privado.org_por_slug(coalesce(p ->> 'org_slug', 'beyon-zero'))), t.pagamento_id, t.id, p ->> 'evento',
      left(p ->> 'provedor', 30), left(p ->> 'provedor_ref', 80), coalesce(p ->> 'origem', 'reconciliacao'), null, null, coalesce(p -> 'detalhe', '{}'), left(p ->> 'request_id', 120));
  else
    perform privado.auditar_uma_vez(coalesce(t.org_id, privado.org_por_slug(coalesce(p ->> 'org_slug', 'beyon-zero'))), t.pagamento_id, t.id, p ->> 'evento',
      left(p ->> 'provedor', 30), left(p ->> 'provedor_ref', 80), coalesce(p ->> 'origem', 'reconciliacao'), null, null, coalesce(p -> 'detalhe', '{}'), left(p ->> 'request_id', 120));
  end if;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['pagamentos_iniciar_tentativa', 'pagamentos_encerrar_tentativa', 'pagamentos_aplicar', 'pagamentos_vincular',
                           'pagamentos_estado', 'pagamentos_tentativa', 'pagamentos_para_reconciliar', 'pagamentos_atencao',
                           'pagamentos_registrar_aviso', 'pagamentos_registrar_ocorrencia'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
revoke all on function privado.auditar_pagamento(uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function privado.auditar_uma_vez(uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function privado.org_por_slug(text) from public, anon, authenticated, service_role;
revoke all on function privado.tentativa_transicao() from public, anon, authenticated;
revoke all on function privado.auditoria_imutavel() from public, anon, authenticated;
