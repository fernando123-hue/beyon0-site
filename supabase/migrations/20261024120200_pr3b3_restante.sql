-- ==========================================================================
-- PR 3b-3 (spec §5): O RESTANTE. A parcela quem decide é o BANCO (nunca o navegador): com a conversa em aguardando_pagamento, a entrada; com a conversa em
-- em_producao e a entrega em no_ar ou suspensa, o saldo = valor_total − entrada PAGA (a diferença exata fecha o total); em qualquer outro caso, 55000. Entrada estornada ou contestada: 55000 (a equipe resolve).
-- O saldo pago conclui a entrega por GATILHO (sem reescrever pagamentos_aplicar, decisão A do plano): o pagamento nunca falha por causa da entrega, o erro vai
-- para a auditoria e a leitura do estado conserta (privado.concluir_pendente). Estorno ou contestação do saldo: as regras de hoje; a entrega concluída não volta.
-- Ordem de travas: conversa → entrega → pagamento → tentativa. Aplicar DEPOIS de 20261024120100_pr3b3_previa.sql.
-- ==========================================================================

-- a cobrança: a de 20261022120000_pr3b1_entrada.sql (falha fechada do percentual) com a parcela escolhida pelo estado
create or replace function app.pagamentos_iniciar_tentativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pr app.propostas; pg app.pagamentos; t app.tentativas_pagamento; e app.entregas;
        v_parcela text; v_valor numeric; v_sinal numeric; v_qtd integer; v_ultima timestamptz;
begin
  if coalesce(p ->> 'metodo', '') not in ('pix', 'cartao') then raise exception 'método inválido' using errcode = '22023'; end if;
  if coalesce(p ->> 'provedor', '') !~ '^[a-z0-9_]{2,30}$' then raise exception 'provedor inválido' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- trava 1: conversa
  perform privado.exigir_etapa(c, array['aguardando_pagamento', 'em_producao']);
  v_parcela := case when c.etapa = 'aguardando_pagamento' then 'sinal' else 'saldo' end;
  -- (B3) defesa em profundidade: o restante é SÓ Pix também no banco (o JS e a tela já recusam o cartão)
  if v_parcela = 'saldo' and p ->> 'metodo' <> 'pix' then raise exception 'o restante é pago só por Pix' using errcode = '22023'; end if;
  select * into pr from app.propostas where conversa_id = c.id and status = 'aceita' order by versao desc limit 1;
  if not found then raise exception 'proposta aceita não encontrada' using errcode = 'P0002'; end if;
  -- (PR 3b-1) sem o percentual da proposta, não cobra: nunca um número de reserva
  if pr.sinal_percentual is null or pr.sinal_percentual < 1 then
    raise exception 'proposta sem percentual de entrada' using errcode = '23514';
  end if;
  if v_parcela = 'sinal' then
    v_valor := round(pr.valor_total * pr.sinal_percentual / 100.0, 2);
  else
    select * into e from app.entregas where conversa_id = c.id for update;   -- trava 2: a entrega
    if not found or e.passo not in ('no_ar', 'suspensa') then
      raise exception 'o restante só abre com o site no ar' using errcode = '55000';
    end if;
    -- a entrega é a DESTA proposta (a aceita mais nova): senão a conclusão do saldo não a acharia
    if e.proposta_id <> pr.id then raise exception 'a entrega não é da proposta aceita mais recente: a equipe resolve' using errcode = '55000'; end if;
    -- (desvio do plano, revisão da Task 6) sem a entrada PAGA o restante não abre, como as outras ações da entrega (privado.sinal_pago): com a entrada
    -- estornada ou contestada, cobrar total − entrada entregaria o site recebendo menos que o combinado e nada avisaria a equipe
    if not privado.sinal_pago(pr.id) then raise exception 'a entrada não está paga (estornada ou contestada): a equipe resolve' using errcode = '55000'; end if;
    select valor into v_sinal from app.pagamentos where proposta_id = pr.id and parcela = 'sinal' and status = 'pago';   -- uma só linha paga (índice pagamentos_parcela_viva)
    if v_sinal is null then raise exception 'sem a entrada registrada' using errcode = '23514'; end if;
    v_valor := pr.valor_total - v_sinal;
    if v_valor <= 0 then raise exception 'restante inválido' using errcode = '23514'; end if;
  end if;

  select * into pg from app.pagamentos where proposta_id = pr.id and parcela = v_parcela and status in ('pendente', 'pago', 'contestado') for update;   -- trava 3
  if not found then
    insert into app.pagamentos (org_id, proposta_id, parcela, valor, gateway)
    values (c.org_id, pr.id, v_parcela, v_valor, p ->> 'provedor') returning * into pg;
    perform privado.evento(c.org_id, c.id, case when v_parcela = 'sinal' then 'pagamento_iniciado' else 'restante_iniciado' end, jsonb_build_object('valor', v_valor));
  end if;
  if pg.status <> 'pendente' then raise exception 'este pagamento já foi feito' using errcode = '55000'; end if;
  if pg.valor <> v_valor then raise exception 'valor do pagamento diverge da proposta' using errcode = '23514'; end if;

  select * into t from app.tentativas_pagamento where pagamento_id = pg.id and status in ('criada', 'processando', 'aguardando', 'requer_acao') for update;   -- trava 4
  if found then
    return jsonb_build_object('ativa', true, 'tentativa_id', t.id, 'metodo', t.metodo, 'status', t.status, 'provedor_order_id', t.provedor_order_id,
      'chave_idempotencia', t.chave_idempotencia, 'pagamento_id', pg.id, 'valor', pg.valor, 'criada_em', t.created_at);
  end if;
  if exists (select 1 from app.tentativas_pagamento where pagamento_id = pg.id and status = 'divergente') then
    raise exception 'pagamento em verificação pela equipe' using errcode = '55000';
  end if;
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

-- o estado do pagamento olha a parcela certa: depois do ar, o restante; antes, a entrada
create or replace function app.pagamentos_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pg app.pagamentos; t app.tentativas_pagamento; v_parcela text;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  v_parcela := case when exists (select 1 from app.entregas e where e.conversa_id = c.id and e.passo in ('no_ar', 'suspensa', 'concluida')) then 'saldo' else 'sinal' end;
  select pa.* into pg from app.pagamentos pa join app.propostas pr on pr.id = pa.proposta_id
  where pr.conversa_id = c.id and pa.parcela = v_parcela order by pa.created_at desc limit 1;
  if not found then return jsonb_build_object('pagamento', null, 'parcela', v_parcela); end if;
  select * into t from app.tentativas_pagamento where pagamento_id = pg.id order by created_at desc limit 1;
  return jsonb_build_object(
    'parcela', v_parcela,
    'pagamento', jsonb_build_object('status', pg.status, 'valor', pg.valor, 'moeda', pg.moeda, 'pago_em', pg.pago_em, 'parcela', pg.parcela),
    'tentativa', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'metodo', t.metodo, 'status', t.status, 'detalhe', t.detalhe_provedor, 'parcelas', t.parcelas, 'meio', t.meio,
      'pix_qr', case when t.status = 'aguardando' then t.pix_qr end,
      'pix_qr_base64', case when t.status = 'aguardando' then t.pix_qr_base64 end,
      'expira_em', t.expira_em,
      'desafio_url', case when t.status = 'requer_acao' then t.desafio_url end,
      'consultada_em', t.consultada_em, 'criada_em', t.created_at) end);
end $$;
revoke all on function app.pagamentos_estado(jsonb) from public, anon, authenticated;
grant execute on function app.pagamentos_estado(jsonb) to service_role;

-- ---------- a conclusão: o saldo pago fecha o pedido ----------
create function privado.concluir_entrega(p_proposta uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_conversa uuid; e app.entregas; v_projeto uuid; pg app.pagamentos;
begin
  select conversa_id into v_conversa from app.entregas where proposta_id = p_proposta;
  if not found then return false; end if;
  -- NÃO RETIRAR a trava da conversa: chamada pelo gatilho dentro de pagamentos_aplicar, esta função já chega com conversa → pagamento → tentativa travados e
  -- só então pega a entrega (a ordem de iniciar_tentativa é conversa → entrega → pagamento). Sem ciclo porque TODA função que toca a entrega toma a conversa primeiro.
  perform 1 from app.conversas where id = v_conversa for update;   -- trava 1: conversa
  select * into e from app.entregas where proposta_id = p_proposta for update;   -- trava 2: entrega
  if e.passo not in ('no_ar', 'suspensa') then return false; end if;
  if not exists (select 1 from app.pagamentos where proposta_id = p_proposta and parcela = 'saldo' and status = 'pago') then return false; end if;
  update app.entregas set passo = 'concluida', concluida_em = now(), religar_pendente = (e.passo = 'suspensa'), aviso_no_ar_desde = null, updated_at = now() where id = e.id;
  update app.conversas set etapa = 'encerrada', ultima_atividade = now() where id = e.conversa_id and etapa = 'em_producao';
  select projeto_id into v_projeto from app.propostas where id = p_proposta;
  update app.projetos set status = 'entregue', entregue_em = (now() at time zone 'America/Campo_Grande')::date where id = v_projeto and status in ('pronto_para_producao', 'em_producao', 'em_revisao');
  if not found and not exists (select 1 from app.projetos where id = v_projeto and status = 'entregue') then
    -- projeto pausado (estorno da entrada), cancelado ou sem projeto: a entrega conclui, o projeto não muda e uma pessoa decide
    select * into pg from app.pagamentos where proposta_id = p_proposta and parcela = 'saldo' and status = 'pago';
    perform privado.auditar_pagamento(pg.org_id, pg.id, null, 'project.error', 'sistema', null, 'operacao', null, null,
      jsonb_build_object('motivo', 'restante pago com o projeto fora de produção (' || coalesce((select status from app.projetos where id = v_projeto), 'sem projeto') || ')'), null);
  end if;
  perform privado.encerrar_links_do_pedido(e.conversa_id, 30);   -- o link continua abrindo o recibo final por mais 30 dias
  perform privado.evento(e.org_id, e.conversa_id, 'restante_pago');
  return true;
end $$;
revoke all on function privado.concluir_entrega(uuid) from public, anon, authenticated, service_role;

create function privado.entrega_apos_saldo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if not privado.concluir_entrega(new.proposta_id)
       and not exists (select 1 from app.entregas where proposta_id = new.proposta_id and passo = 'concluida') then
      -- o restante caiu e a entrega não está em no_ar/suspensa (encerrada?): o dinheiro fica registrado e o caso vai para uma pessoa
      perform privado.auditar_pagamento(new.org_id, new.id, null, 'project.error', 'sistema', null, 'operacao', null, null,
        jsonb_build_object('motivo', 'restante pago com a entrega fora do ar (' || coalesce((select passo from app.entregas where proposta_id = new.proposta_id), 'sem entrega') || ')'), null);
    end if;
  exception when others then
    raise warning 'entrega não concluída para a proposta %: %', new.proposta_id, sqlerrm;
    begin
      perform privado.auditar_pagamento(new.org_id, new.id, null, 'project.error', 'sistema', null, 'operacao', null, null,
        jsonb_build_object('motivo', 'entrega não concluída: ' || left(sqlerrm, 120), 'codigo', sqlstate), null);
    exception when others then null;
    end;
  end;
  return new;
end $$;
revoke all on function privado.entrega_apos_saldo() from public, anon, authenticated, service_role;
create trigger pagamentos_saldo after update of status on app.pagamentos
for each row when (new.parcela = 'saldo' and new.status = 'pago' and old.status is distinct from 'pago')
execute function privado.entrega_apos_saldo();

-- a leitura conserta o que o gatilho não fez (o restante pago e a entrega ainda no ar)
create function privado.concluir_pendente(p_conversa uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_prop uuid;
begin
  select e.proposta_id into v_prop from app.entregas e
   where e.conversa_id = p_conversa and e.passo in ('no_ar', 'suspensa')
     and exists (select 1 from app.pagamentos pg where pg.proposta_id = e.proposta_id and pg.parcela = 'saldo' and pg.status = 'pago');
  if v_prop is null then return false; end if;
  return privado.concluir_entrega(v_prop);
end $$;
revoke all on function privado.concluir_pendente(uuid) from public, anon, authenticated, service_role;

alter function app.vendas_estado(jsonb) rename to vendas_estado_pr3b2;
revoke all on function app.vendas_estado_pr3b2(jsonb) from public, anon, authenticated, service_role;
create function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_conversa uuid;
begin
  r := app.vendas_estado_pr3b2(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  v_conversa := (r #>> '{conversa,id}')::uuid;
  if r #>> '{conversa,etapa}' = 'em_producao' then
    -- a leitura conserta o que faltou, mas NUNCA quebra a tela: se a conclusão falhar de novo, o cliente vê o estado como está e o erro fica no aviso do banco
    begin
      if privado.concluir_pendente(v_conversa) then r := app.vendas_estado_pr3b2(p); end if;
    exception when others then
      raise warning 'conclusão pendente não feita para a conversa %: %', v_conversa, sqlerrm;
    end;
  end if;
  return r;
end $$;
revoke all on function app.vendas_estado(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_estado(jsonb) to service_role;
