-- Correções da auditoria de segurança (run-1, 20/10/2026). Aplicar DEPOIS de 20261017120000_pr3a_ajustes.sql.
-- Reaplicável (create or replace); as migrations anteriores não mudam. Todas as funções mantêm a assinatura (jsonb),
-- security definer, search_path vazio e as concessões (bloco no fim).

-- ---------- 1. o limite diário do consultor também por /48 do IPv6 (pista 1) ----------
-- A casa ou a empresa com IPv6 recebe um /48 inteiro (65.536 redes /64) e trocava de /64 à vontade: só o /64 contava,
-- e o teto por IP nunca disparava. Agora a chave do /48 (outro "uso" no servidor, 'ia48': não divide o contador do
-- pedido, que mora na mesma privado.freio_ip) conta junto, na mesma vez por conversa, e recusa com o mesmo motivo.
-- Chave do /48 nula (IPv4, endereço sem /64) = só a regra de antes. Mal formada, ou sem o teto: erro 22023 (não freio
-- desligado em silêncio, como no pedido). A ordem das travas é a de antes (conversa FOR UPDATE → freio_ip).
-- Se o /48 recusar depois de o /64 já ter contado, o /64 fica contado (igual ao pedido): a conversa seguinte desse
-- /48 também seria recusada, então a conta a mais só pesa contra quem já está acima do teto.
create or replace function app.vendas_reservar_ia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_chave text := p ->> 'chave_ip'; v_chave48 text := p ->> 'chave_ip48';
begin
  if v_chave48 is not null and (v_chave48 !~ '^[0-9a-f]{64}$' or (p ->> 'max_por_ip48') is null) then
    raise exception 'chave do /48 inválida ou sem o teto' using errcode = '22023';
  end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- (FOR UPDATE)
  if c.ia_ate is not null and c.ia_ate > now() then raise exception 'outra resposta em andamento' using errcode = '55P03'; end if;
  if c.turnos >= coalesce((p ->> 'max_turnos')::integer, 40) then raise exception 'turnos esgotados' using errcode = '23514'; end if;
  if c.custo_ia_usd >= coalesce((p ->> 'teto_usd')::numeric, 1.5) then raise exception 'custo esgotado' using errcode = '23514'; end if;
  if not c.ip_contado and v_chave ~ '^[0-9a-f]{64}$' and (p ->> 'max_por_ip') is not null then
    if not privado.contar_ip(v_chave, (p ->> 'max_por_ip')::integer) then
      perform privado.evento(c.org_id, c.id, 'freio_ip');
      return jsonb_build_object('ok', false, 'freio_ip', true);
    end if;
    -- (dois ifs, e não um "and": o Postgres não garante a ordem do "and", e contar_ip com chave nula falha)
    if v_chave48 is not null then
      if not privado.contar_ip(v_chave48, (p ->> 'max_por_ip48')::integer) then
        perform privado.evento(c.org_id, c.id, 'freio_ip', jsonb_build_object('prefixo', 48));
        return jsonb_build_object('ok', false, 'freio_ip', true);
      end if;
    end if;
    update app.conversas set ip_contado = true where id = c.id;
  end if;
  update app.conversas set ia_ate = now() + make_interval(secs => least(300, greatest(30, coalesce((p ->> 'segundos')::integer, 120)))) where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 2. o teto do dia pelo gasto REAL do dia (pista 2) ----------
-- app.vendas_custo_dia somava o custo_ia_usd (a vida inteira) de toda conversa com atividade hoje: tocar em muitas
-- conversas antigas, sem chamar o modelo, bastava para o teto de US$ 25 travar a IA para todos. A conta passa a ser o
-- registro das chamadas (app.ia_chamadas, só acréscimo) desde a meia-noite de São Paulo, escrita UMA vez aqui e usada
-- pela leitura rápida (vendas_custo_dia) e pela reserva (vendas_reservar_custo). O índice já existe
-- (ia_chamadas_org, org_id + created_at); o servidor grava o registro de uma chamada antes de liberar a sua reserva
-- (api/_vendas/fluxo.mjs, comReserva), então, com o banco de pé, o gasto não fica fora da conta entre as duas. Se a
-- gravação do registro falhar, a reserva NÃO é liberada e segura o valor até vencer (10 minutos); depois disso aquela
-- chamada deixa de contar no dia (sub-conta pequena: precisa de falha do banco no meio de uma requisição que funcionou, e o
-- limite de gasto no console da Anthropic é o freio final).
create or replace function privado.gasto_ia_dia(p_org uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(c.custo_usd), 0)
  from app.ia_chamadas c
  where c.org_id = p_org
    and c.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
$$;
revoke all on function privado.gasto_ia_dia(uuid) from public, anon, authenticated, service_role;

-- a leitura rápida do teto (dentroDoCusto): só o gasto registrado, SEM as reservas abertas; organização desconhecida
-- = 0 (o fluxo lê custo_usd, e nulo viraria erro 500)
create or replace function app.vendas_custo_dia(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('custo_usd',
    coalesce((select privado.gasto_ia_dia(o.id) from app.organizacoes o where o.slug = p ->> 'org_slug'), 0))
$$;

-- a reserva (copiada de 20261008120700_reservas_ia.sql): só muda a conta do gasto do dia, que agora soma também as
-- reservas abertas da organização, como antes
create or replace function app.vendas_reservar_custo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.conversas;
  v_valor numeric := (p ->> 'valor_usd')::numeric;
  v_teto_conv numeric := (p ->> 'teto_conversa_usd')::numeric;
  v_teto_dia numeric := (p ->> 'teto_dia_usd')::numeric;
  v_segundos integer := coalesce((p ->> 'segundos')::integer, 600);
  v_reservado_conv numeric;
  v_reservado_org numeric;
  v_gasto_dia numeric;
  v_id uuid;
begin
  if v_valor is null or v_valor <= 0 or v_valor > 10 then raise exception 'valor da reserva inválido' using errcode = '22023'; end if;
  if v_teto_conv is null or v_teto_conv <= 0 or v_teto_dia is null or v_teto_dia <= 0 then raise exception 'teto inválido' using errcode = '22023'; end if;
  if v_segundos < 30 or v_segundos > 900 then raise exception 'validade da reserva inválida' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  -- uma reserva por vez na organização inteira (o teto do dia é da organização). "for no key update": exclui as
  -- outras reservas sem bloquear quem só cria linhas que apontam para a organização (conversas, eventos)
  perform set_config('lock_timeout', '2000', true);   -- (fila longa na trava: desiste em 2 s, e o servidor responde 503 com WhatsApp)
  perform 1 from app.organizacoes where id = c.org_id for no key update;
  delete from privado.reservas_ia where org_id = c.org_id and expira_em < now();
  select coalesce(sum(valor_usd), 0) into v_reservado_conv from privado.reservas_ia where conversa_id = c.id;
  if c.custo_ia_usd + v_reservado_conv >= v_teto_conv then return jsonb_build_object('ok', false, 'motivo', 'conversa'); end if;
  select coalesce(sum(valor_usd), 0) into v_reservado_org from privado.reservas_ia where org_id = c.org_id;
  -- o gasto do dia: a mesma conta de app.vendas_custo_dia
  v_gasto_dia := privado.gasto_ia_dia(c.org_id);
  if v_gasto_dia + v_reservado_org >= v_teto_dia then return jsonb_build_object('ok', false, 'motivo', 'dia'); end if;
  insert into privado.reservas_ia (org_id, conversa_id, valor_usd, expira_em)
  values (c.org_id, c.id, v_valor, now() + make_interval(secs => v_segundos))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'reserva_id', v_id);
end $$;

-- ---------- 3. o preço não é recalculado depois da escolha (pista 4) ----------
-- vendas_registrar_estimativa aceitava a estimativa também em direções, escolhida e alterações. Depois da confirmação
-- do pedido pelo WhatsApp o pacote está fechado e nenhum ajuste muda o preço (as opções prontas recusam estimativa),
-- mas o modelo ainda podia chamar "estimar" ("achei caro, dá para começar menor?") e o escopo, que pega a ÚLTIMA
-- estimativa, saía com outro valor. Agora só descoberta, estimativa e contato (= ETAPAS_COM_PRECO em
-- api/_vendas/consultor.mjs; um teste confere que as duas listas são iguais); o resto (teto de 30 pacotes, só a tabela
-- ATIVA) fica como estava em 20261015120000_pr2b_ajustes.sql.
-- "contato" nem sempre é ANTES da confirmação: se as três direções falham, a conversa volta de "gerando" para "contato"
-- (privado.parar_geracao, 20261013120100_pedidos_dono.sql) com o pedido já "confirmado", e gerar de novo segue permitido. Aí o
-- pacote continua fechado: com pedido confirmado na conversa a função recusa (55000), qualquer que seja a etapa.
create or replace function app.vendas_registrar_estimativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_regras app.regras_comerciais; v_id uuid;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa', 'contato']);
  if exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    raise exception 'pacote fechado: o pedido já foi confirmado' using errcode = '55000';
  end if;
  if (select count(*) from app.estimativas e where e.conversa_id = c.id) >= 30 then
    raise exception 'limite de pacotes desta conversa' using errcode = '23514';
  end if;
  -- só a tabela ATIVA, aprovada pelo dono, gera estimativa para visitante
  select * into v_regras from app.regras_comerciais where id = (p ->> 'regras_id')::uuid and org_id = c.org_id and status = 'ativa';
  if not found then raise exception 'regras comerciais ativas não encontradas' using errcode = '55000'; end if;
  insert into app.estimativas (org_id, conversa_id, regras_id, fatores, valor_total, sinal, prazo_dias, fase, detalhes)
  values (c.org_id, c.id, v_regras.id, p -> 'fatores', (p ->> 'valor_total')::numeric, (p ->> 'sinal')::numeric,
          (p ->> 'prazo_dias')::integer, coalesce(p ->> 'fase', 'unica'), coalesce(p -> 'detalhes', '{}'))
  returning id into v_id;
  if c.etapa = 'descoberta' then update app.conversas set etapa = 'estimativa', ultima_atividade = now() where id = c.id; end if;
  perform privado.evento(c.org_id, c.id, 'estimativa_mostrada', jsonb_build_object('valor_total', (p ->> 'valor_total')::numeric, 'fase', coalesce(p ->> 'fase', 'unica')));
  return jsonb_build_object('estimativa_id', v_id);
end $$;

-- ---------- 4. fecha a porta antiga do ajuste pela IA (segurança #1 do PR 3a) ----------
-- Em 20261017120000_pr3a_ajustes.sql, vendas_registrar_alteracao SEM "origem" assumia 'ia': sem o teto de 30 por conversa
-- e aceitando a chave "estimativa" (que muda o preço). Era uma porta aberta de propósito, para o código velho (o ajuste
-- pelo modelo) funcionar enquanto a migration chegava antes do código. Com a produção ainda sem API (/api/vendas → 404
-- em 20/10) não há código antigo a proteger, e o único chamador (api/_vendas/fluxo-ajustes.mjs) manda sempre 'opcao'.
-- Agora só a opção pronta grava por aqui (o pedido livre tem a função dele): origem diferente de 'opcao' (inclusive a
-- falta dela) = 22023; as regras da opção valem sempre (sem preço, com a versão aplicada, montada sobre a versão de agora,
-- teto de 30); e a função deixa de chamar vendas_registrar_estimativa (nada mais dependia disso). A ordem de travas é a
-- mesma (direções por id, depois a conversa). Um código antigo que ainda mande o ajuste pelo modelo recebe 400 no ajuste:
-- falha fechada, não brecha.
create or replace function app.vendas_registrar_alteracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_escolhida uuid; v_id uuid; v_atual uuid; v_origem text := p ->> 'origem';
begin
  if v_origem is distinct from 'opcao' then raise exception 'origem inválida' using errcode = '22023'; end if;
  -- a ordem única de travas: as direções (por id) antes da conversa (o ajuste trava a direção pela chave estrangeira)
  perform privado.travar_direcoes((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);
  select direcao_id into v_escolhida from app.escolhas where conversa_id = c.id order by created_at desc limit 1;
  -- o ajuste foi montado sobre a direção que o servidor leu: se outra foi escolhida no meio, recusa
  if p ? 'direcao_id' and (p ->> 'direcao_id')::uuid is distinct from v_escolhida then
    raise exception 'a direção escolhida mudou durante o ajuste' using errcode = '40001';
  end if;
  -- a opção pronta nunca muda o preço, sempre traz a versão aplicada, foi montada sobre a versão de agora e tem teto de 30
  -- por conversa
  if p ? 'estimativa' or jsonb_typeof(p -> 'resultado') is distinct from 'object' then
    raise exception 'opção pronta: sem preço e com a versão aplicada' using errcode = '22023';
  end if;
  -- a base: o ajuste aplicado mais recente que o servidor leu (null = nenhum). Outro aplicado no meio (outra aba, ou o
  -- "feito" do dono) seria apagado da versão final por esta gravação: recusa, como no resolver do dono
  select x.id into v_atual from app.alteracoes x where x.conversa_id = c.id and x.status = 'aplicada'
   order by x.aplicada_em desc nulls last, x.created_at desc limit 1;
  if v_atual is distinct from nullif(p ->> 'base_id', '')::uuid then
    raise exception 'a versão mudou durante o ajuste' using errcode = '40001';
  end if;
  if (select count(*) from app.alteracoes a where a.conversa_id = c.id and a.origem = 'opcao') >= 30 then
    raise exception 'limite de ajustes desta conversa' using errcode = '23514';
  end if;
  insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, mudancas, status, resultado, origem, aplicada_em)
  values (c.org_id, c.id, v_escolhida, p ->> 'pedido', coalesce(p -> 'mudancas', '[]'), 'aplicada', p -> 'resultado', 'opcao',
          clock_timestamp())   -- (a hora de agora, não a do início da transação)
  returning id into v_id;
  update app.conversas set etapa = 'alteracoes', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'alteracao_pedida', jsonb_build_object('mudancas', jsonb_array_length(coalesce(p -> 'mudancas', '[]')),
    'status', 'aplicada', 'origem', 'opcao'));
  return jsonb_build_object('alteracao_id', v_id, 'status', 'aplicada');
end $$;

-- (create or replace mantém as concessões; repetidas aqui para a migration se explicar sozinha)
do $$
declare f text;
begin
  foreach f in array array['vendas_reservar_ia', 'vendas_custo_dia', 'vendas_reservar_custo', 'vendas_registrar_estimativa', 'vendas_registrar_alteracao'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
