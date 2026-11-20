-- ==========================================================================
-- A DESISTÊNCIA PELO CLIENTE (dono, 20/11/2026). Aplicar DEPOIS de 20261119120000_seguranca_pagamentos.sql.
-- Até 7 dias depois de aceitar as condições o cliente desiste por qualquer motivo e recebe a ENTRADA de volta, pelo mesmo Pix (CDC, art. 49; /condicoes).
-- A opção é DISCRETA na tela (a regra de design do dono: nada que induza o pedido) e o banco é quem decide se ela existe: o navegador nunca decide prazo,
-- valor nem order. Este arquivo só traz a decisão e a trava; o estorno no Mercado Pago e o encerramento são do servidor (api/_pagamentos/desistencia.mjs),
-- que usa as funções que já existiam (app.pagamentos_aplicar para o estorno, app.vendas_encerrar para fechar o pedido).
--   1. app.desistencias: UMA desistência por pedido (unique na proposta). A trava `iniciada_em` (2 minutos) segura o duplo clique e as duas abas; a chave de
--      idempotência no provedor (`dsc-<tentativa>`) segura o resto.
--   2. privado.desistencia_motivo: a regra única (passo, restante, bloqueio, a entrada paga, a janela) que a leitura da tela e a ação usam. Janela: 7 dias
--      contados da marca MAIS ANTIGA entre a aceitação da proposta e o pagamento da entrada, mais 3 horas a favor do cliente (relógio do banco; intervalo fixo,
--      então o fuso de Campo Grande não muda a conta).
--   3. app.desistencia_preparar (decide e reserva) e app.desistencia_marcar (as marcas só andam para a frente: pedida, estornada, concluida).
--   4. app.pagamentos_aplicar: o alerta do estorno da entrada vira "desistencia" quando há desistência pedida (o dono não a confunde com contestação).
--   5. app.vendas_estado: a leitura do cliente ganha dois booleanos em `entrega`: pode_desistir e desistiu (nada de data, order ou valor).
-- Só `create or replace`/renomear com as MESMAS assinaturas e os mesmos privilégios (só service_role).
-- ==========================================================================

create table app.desistencias (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references app.organizacoes (id) on delete cascade,
  proposta_id uuid not null,
  conversa_id uuid not null,
  tentativa_id uuid not null references app.tentativas_pagamento (id),   -- a tentativa que pagou a entrada: a chave no provedor é `dsc-<tentativa_id>`
  order_id    text not null check (char_length(order_id) between 4 and 64),
  valor       numeric(12, 2) not null check (valor > 0),
  status      text not null default 'pedida' check (status in ('pedida', 'estornada', 'concluida')),
  tentativas  integer not null default 1 check (tentativas >= 1),
  falhas      integer not null default 0 check (falhas >= 0),
  falha       text check (char_length(falha) <= 60),
  pedida_em   timestamptz not null default now(),
  iniciada_em timestamptz default now(),   -- a trava do duplo clique; nula depois de uma falha (a pessoa pode tentar de novo)
  estornada_em timestamptz,
  concluida_em timestamptz,
  unique (proposta_id),
  foreign key (org_id, proposta_id) references app.propostas (org_id, id),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade
);
alter table app.desistencias enable row level security;   -- (sem política: só as funções do backend leem e escrevem)
revoke all on app.desistencias from public, anon, authenticated, service_role;

-- ---------- a janela e a trava, em um lugar só ----------
create function privado.desistencia_prazo() returns interval
language sql immutable set search_path = '' as $$ select interval '7 days 3 hours' $$;
create function privado.desistencia_trava() returns interval
language sql immutable set search_path = '' as $$ select interval '2 minutes' $$;
revoke all on function privado.desistencia_prazo() from public, anon, authenticated, service_role;
revoke all on function privado.desistencia_trava() from public, anon, authenticated, service_role;

-- ---------- a regra: null = pode desistir; senão, o motivo ----------
-- p_retomada: a desistência JÁ foi pedida (nova tentativa depois de falha ou de queda): o prazo e o bloqueio não valem de novo (a entrada pode já ter sido
-- devolvida pela própria desistência); continuam valendo o passo e o restante pago
create function privado.desistencia_motivo(e app.entregas, p_retomada boolean default false) returns text
language plpgsql stable security definer set search_path = '' as $$
declare pg app.pagamentos; v_base timestamptz;
begin
  if not e.passo = any (array['material', 'producao', 'previa', 'ajustes', 'aprovada']) then return 'passo'; end if;   -- no ar, suspensa, concluída, encerrada: o dono resolve
  if exists (select 1 from app.pagamentos where proposta_id = e.proposta_id and parcela = 'saldo' and status in ('pago', 'contestado', 'estornado')) then return 'restante'; end if;
  if p_retomada then return null; end if;
  if privado.entrega_bloqueada(e) then return 'bloqueada'; end if;
  select * into pg from app.pagamentos where proposta_id = e.proposta_id and parcela = 'sinal' and status = 'pago';
  if not found or pg.gateway_ref is null or pg.pago_em is null then return 'entrada'; end if;
  select least(pr.respondida_em, pg.pago_em) into v_base from app.propostas pr where pr.id = e.proposta_id;
  if v_base is null or now() > v_base + privado.desistencia_prazo() then return 'prazo'; end if;
  return null;
end $$;
revoke all on function privado.desistencia_motivo(app.entregas, boolean) from public, anon, authenticated, service_role;

-- ---------- decidir e reservar ----------
create function app.desistencia_preparar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; e app.entregas; d app.desistencias; pg app.pagamentos; t app.tentativas_pagamento; v_motivo text; v_codigo text;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- trava 1: a conversa DESTE visitante (de outro: P0002)
  select * into d from app.desistencias where conversa_id = c.id for update;
  if found and d.status = 'concluida' then return jsonb_build_object('ok', false, 'motivo', 'ja_desistiu'); end if;
  perform privado.exigir_etapa(c, array['em_producao']);
  select * into e from app.entregas where conversa_id = c.id for update;   -- trava 2: a entrega
  if not found then return jsonb_build_object('ok', false, 'motivo', 'passo'); end if;
  select codigo into v_codigo from app.pedidos where conversa_id = c.id;
  if v_codigo is null then return jsonb_build_object('ok', false, 'motivo', 'passo'); end if;

  if found and d.id is not null then
    v_motivo := privado.desistencia_motivo(e, true);
    if v_motivo is not null then return jsonb_build_object('ok', false, 'motivo', v_motivo); end if;
    if d.status = 'pedida' then
      if d.iniciada_em is not null and now() - d.iniciada_em < privado.desistencia_trava() then return jsonb_build_object('ok', false, 'motivo', 'em_andamento'); end if;
      update app.desistencias set iniciada_em = now(), tentativas = tentativas + 1 where id = d.id returning * into d;
    end if;
    return jsonb_build_object('ok', true, 'retomar', d.status = 'estornada', 'desistencia_id', d.id, 'tentativa_id', d.tentativa_id,
                              'order_id', d.order_id, 'valor', d.valor::text, 'codigo', v_codigo);
  end if;

  v_motivo := privado.desistencia_motivo(e, false);
  if v_motivo is not null then return jsonb_build_object('ok', false, 'motivo', v_motivo); end if;
  select * into pg from app.pagamentos where proposta_id = e.proposta_id and parcela = 'sinal' and status = 'pago' for update;   -- trava 3: o pagamento
  select * into t from app.tentativas_pagamento where pagamento_id = pg.id and provedor_order_id = pg.gateway_ref and status = 'aprovada';
  if not found then return jsonb_build_object('ok', false, 'motivo', 'entrada'); end if;
  insert into app.desistencias (org_id, proposta_id, conversa_id, tentativa_id, order_id, valor)
    values (c.org_id, e.proposta_id, c.id, t.id, pg.gateway_ref, pg.valor) returning * into d;
  return jsonb_build_object('ok', true, 'retomar', false, 'desistencia_id', d.id, 'tentativa_id', d.tentativa_id,
                            'order_id', d.order_id, 'valor', d.valor::text, 'codigo', v_codigo);
end $$;
revoke all on function app.desistencia_preparar(jsonb) from public, anon, authenticated;
grant execute on function app.desistencia_preparar(jsonb) to service_role;

-- ---------- as marcas: só para a frente ----------
create function app.desistencia_marcar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d app.desistencias; v_status text := p ->> 'status';
begin
  if v_status is null or v_status not in ('estornada', 'concluida', 'falhou') then raise exception 'desistência: marca fora da lista' using errcode = '22023'; end if;
  select * into d from app.desistencias where id = (p ->> 'desistencia_id')::uuid for update;
  if not found then raise exception 'desistência não encontrada' using errcode = 'P0002'; end if;
  if v_status = 'estornada' and d.status = 'pedida' then
    update app.desistencias set status = 'estornada', estornada_em = now() where id = d.id;
  elsif v_status = 'concluida' and d.status = 'estornada' then
    update app.desistencias set status = 'concluida', concluida_em = now() where id = d.id;
  elsif v_status = 'falhou' and d.status = 'pedida' then
    update app.desistencias set iniciada_em = null, falhas = falhas + 1, falha = left(coalesce(p ->> 'detalhe', 'erro'), 60) where id = d.id;
  else
    raise exception 'desistência: a marca % não vale com a desistência %', v_status, d.status using errcode = '55000';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function app.desistencia_marcar(jsonb) from public, anon, authenticated;
grant execute on function app.desistencia_marcar(jsonb) to service_role;

-- ---------- o alerta do estorno da entrada: "desistencia" quando o cliente a pediu ----------
alter function app.pagamentos_aplicar(jsonb) rename to pagamentos_aplicar_196;
revoke all on function app.pagamentos_aplicar_196(jsonb) from public, anon, authenticated, service_role;

create function app.pagamentos_aplicar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := app.pagamentos_aplicar_196(p);
  if r #>> '{alerta,evento}' = 'estorno' and r #>> '{alerta,parcela}' = 'entrada'
     and exists (select 1 from app.desistencias d join app.pagamentos pg on pg.proposta_id = d.proposta_id and pg.parcela = 'sinal'
                  where pg.gateway_ref = p -> 'retrato' ->> 'order_id' and d.status in ('pedida', 'estornada')) then
    r := jsonb_set(r, '{alerta,evento}', '"desistencia"');
  end if;
  return r;
end $$;
revoke all on function app.pagamentos_aplicar(jsonb) from public, anon, authenticated;
grant execute on function app.pagamentos_aplicar(jsonb) to service_role;

-- ---------- a leitura do cliente: pode_desistir e desistiu ----------
alter function app.vendas_estado(jsonb) rename to vendas_estado_196;
revoke all on function app.vendas_estado_196(jsonb) from public, anon, authenticated, service_role;

create function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; e app.entregas; v_pode boolean; v_desistiu boolean;
begin
  r := app.vendas_estado_196(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  if jsonb_typeof(r -> 'entrega') = 'object' then
    select * into e from app.entregas where conversa_id = (r #>> '{conversa,id}')::uuid;
    if found then
      v_desistiu := exists (select 1 from app.desistencias d where d.proposta_id = e.proposta_id and d.status in ('estornada', 'concluida'));
      v_pode := r #>> '{conversa,etapa}' = 'em_producao' and not exists (select 1 from app.desistencias d where d.proposta_id = e.proposta_id)
                and privado.desistencia_motivo(e, false) is null;
      r := jsonb_set(jsonb_set(r, '{entrega,pode_desistir}', to_jsonb(v_pode)), '{entrega,desistiu}', to_jsonb(v_desistiu));
    end if;
  end if;
  return r;
end $$;
revoke all on function app.vendas_estado(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_estado(jsonb) to service_role;
