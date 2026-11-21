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
--   3. app.desistencia_preparar (decide e reserva) e app.desistencia_marcar (as marcas só andam para a frente: pedida, estornada, concluida); app.desistencia_restante (o Pix do restante, antes de estornar) e app.desistencia_pendentes (o que ficou pela metade; a reconciliação só acaba o que já aconteceu); nenhuma cobrança nova do restante com a desistência pedida.
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
create function privado.desistencia_retomada() returns interval
language sql immutable set search_path = '' as $$ select interval '24 hours' $$;
revoke all on function privado.desistencia_prazo() from public, anon, authenticated, service_role;
revoke all on function privado.desistencia_retomada() from public, anon, authenticated, service_role;
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
-- Uma desistência JÁ pedida (linha `pedida` depois de falha ou de queda) só é retomada pela pessoa dentro de 24 horas do pedido (privado.desistencia_retomada): o direito de
-- 7 dias não fica aberto para sempre por causa de uma falha; passado isso, a equipe resolve à mão (o dono já recebeu `desistencia_falhou`). Depois de 3 falhas, também.
create function app.desistencia_preparar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; e app.entregas; d app.desistencias; pg app.pagamentos; t app.tentativas_pagamento; v_motivo text; v_codigo text; v_achou boolean;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- trava 1: a conversa DESTE visitante (de outro: P0002)
  select * into d from app.desistencias where conversa_id = c.id for update;
  v_achou := found;
  if v_achou and d.status = 'concluida' then return jsonb_build_object('ok', false, 'motivo', 'ja_desistiu'); end if;
  -- a entrada já foi devolvida e o dono encerrou o pedido à mão: a desistência está feita
  if v_achou and d.status = 'estornada' and c.etapa = 'encerrada' then
    update app.desistencias set status = 'concluida', concluida_em = now() where id = d.id;
    return jsonb_build_object('ok', false, 'motivo', 'ja_desistiu');
  end if;
  perform privado.exigir_etapa(c, array['em_producao']);
  select * into e from app.entregas where conversa_id = c.id for update;   -- trava 2: a entrega
  if not found then return jsonb_build_object('ok', false, 'motivo', 'passo'); end if;
  select codigo into v_codigo from app.pedidos where conversa_id = c.id;
  if v_codigo is null then return jsonb_build_object('ok', false, 'motivo', 'passo'); end if;

  if v_achou then
    v_motivo := privado.desistencia_motivo(e, true);
    if v_motivo is not null then return jsonb_build_object('ok', false, 'motivo', v_motivo); end if;
    if d.status = 'pedida' then
      if d.iniciada_em is not null and now() - d.iniciada_em < privado.desistencia_trava() then return jsonb_build_object('ok', false, 'motivo', 'em_andamento'); end if;
      if d.falhas >= 3 or now() > d.pedida_em + privado.desistencia_retomada() then return jsonb_build_object('ok', false, 'motivo', 'prazo'); end if;
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

-- ---------- as marcas: só para a frente (liberada = a rotina olhou, nada a fazer: só solta a trava) ----------
create function app.desistencia_marcar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d app.desistencias; v_status text := p ->> 'status';
begin
  if v_status is null or v_status not in ('estornada', 'concluida', 'falhou', 'liberada') then raise exception 'desistência: marca fora da lista' using errcode = '22023'; end if;
  select * into d from app.desistencias where id = (p ->> 'desistencia_id')::uuid for update;
  if not found then raise exception 'desistência não encontrada' using errcode = 'P0002'; end if;
  if v_status = 'estornada' and d.status = 'pedida' then
    update app.desistencias set status = 'estornada', estornada_em = now() where id = d.id;
  elsif v_status = 'concluida' and d.status = 'estornada' then
    update app.desistencias set status = 'concluida', concluida_em = now() where id = d.id;
  elsif v_status = 'falhou' and d.status = 'pedida' then
    update app.desistencias set iniciada_em = null, falhas = falhas + 1, falha = left(coalesce(p ->> 'detalhe', 'erro'), 60) where id = d.id;
  elsif v_status = 'liberada' and d.status = 'pedida' then
    update app.desistencias set iniciada_em = null where id = d.id;
  else
    raise exception 'desistência: a marca % não vale com a desistência %', v_status, d.status using errcode = '55000';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function app.desistencia_marcar(jsonb) from public, anon, authenticated;
grant execute on function app.desistencia_marcar(jsonb) to service_role;

-- ---------- o restante, ANTES de estornar: o servidor cancela o Pix aberto e confere de novo que ele não foi pago (a corrida "o cliente paga o restante enquanto a entrada volta") ----------
create function app.desistencia_restante(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d app.desistencias; e app.entregas; v_abertas jsonb;
begin
  select * into d from app.desistencias where id = (p ->> 'desistencia_id')::uuid;
  if not found then raise exception 'desistência não encontrada' using errcode = 'P0002'; end if;
  select * into e from app.entregas where conversa_id = d.conversa_id;
  if not found then raise exception 'entrega não encontrada' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('tentativa_id', t.id, 'order', t.provedor_order_id) order by t.created_at), '[]'::jsonb) into v_abertas
    from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id
   where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo' and t.status in ('criada', 'aguardando', 'requer_acao', 'processando') and t.provedor_order_id is not null;
  -- criando: uma tentativa do restante recém-criada, cuja order ainda não voltou do provedor (não há o que cancelar, mas o Pix pode nascer): o servidor não estorna agora
  return jsonb_build_object('criando', exists (select 1 from app.tentativas_pagamento t join app.pagamentos pg on pg.id = t.pagamento_id where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo'
                              and t.status = 'criada' and t.provedor_order_id is null and t.created_at > now() - interval '5 minutes'),
                            'restante_pago', exists (select 1 from app.pagamentos where proposta_id = e.proposta_id and parcela = 'saldo' and status in ('pago', 'contestado', 'estornado')),
                            'abertas', v_abertas);
end $$;
revoke all on function app.desistencia_restante(jsonb) from public, anon, authenticated;
grant execute on function app.desistencia_restante(jsonb) to service_role;

-- ---------- o que ficou pela metade (a rotina da reconciliação só ACABA o que já aconteceu; nunca estorna sozinha) ----------
-- desistências `estornada` (falta encerrar) ou `pedida` sem resposta há mais de 10 minutos e menos de 3 dias, ainda no passo e sem restante pago; a trava é reservada para o cliente
-- não colidir; no máximo 3 por vez
create function app.desistencia_pendentes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d app.desistencias; e app.entregas; v_codigo text; v_itens jsonb := '[]'::jsonb;
begin
  for d in select * from app.desistencias
            where status in ('pedida', 'estornada') and (iniciada_em is null or now() - iniciada_em >= privado.desistencia_trava())
              and now() - pedida_em >= interval '10 minutes' and now() - pedida_em < interval '3 days'
            order by (status = 'estornada') desc, pedida_em limit 3 for update skip locked loop   -- (as estornadas, que só faltam encerrar, passam à frente das pedidas que podem ficar em liberada)
    select * into e from app.entregas where conversa_id = d.conversa_id;
    if not found or privado.desistencia_motivo(e, true) is not null then continue; end if;
    select codigo into v_codigo from app.pedidos where conversa_id = d.conversa_id;
    if v_codigo is null then continue; end if;
    update app.desistencias set iniciada_em = now() where id = d.id;
    v_itens := v_itens || jsonb_build_object('desistencia_id', d.id, 'status', d.status, 'tentativa_id', d.tentativa_id, 'order_id', d.order_id, 'valor', d.valor::text, 'codigo', v_codigo);
  end loop;
  return jsonb_build_object('itens', v_itens);
end $$;
revoke all on function app.desistencia_pendentes(jsonb) from public, anon, authenticated;
grant execute on function app.desistencia_pendentes(jsonb) to service_role;

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

-- ---------- com a desistência pedida (ou a entrada já devolvida), nenhuma cobrança nova do restante ----------
-- (o cliente que abre outra aba e gera um Pix do restante enquanto a entrada volta ficaria com o restante pago e a entrada devolvida). A frase com "bloqueada" vira, no servidor,
-- "Estamos conferindo o seu pagamento": a mesma de sempre para a entrega bloqueada
alter function app.pagamentos_iniciar_tentativa(jsonb) rename to pagamentos_iniciar_tentativa_196;
revoke all on function app.pagamentos_iniciar_tentativa_196(jsonb) from public, anon, authenticated, service_role;

create function app.pagamentos_iniciar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  -- a conversa é travada (e o dono conferido: de outro visitante, P0002 como sempre) ANTES de olhar a desistência: o `pedir o restante` e o `desistir` não correm juntos
  perform privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if exists (select 1 from app.desistencias d where d.conversa_id = (p ->> 'conversa_id')::uuid and d.status in ('pedida', 'estornada')) then
    raise exception 'a entrega está bloqueada: a desistência do cliente está em andamento' using errcode = '55000';
  end if;
  return app.pagamentos_iniciar_tentativa_196(p);
end $$;
revoke all on function app.pagamentos_iniciar_tentativa(jsonb) from public, anon, authenticated;
grant execute on function app.pagamentos_iniciar_tentativa(jsonb) to service_role;
