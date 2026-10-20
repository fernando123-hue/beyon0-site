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
-- (api/_vendas/fluxo.mjs, comReserva), então o gasto nunca fica fora da conta entre as duas.
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

-- (create or replace mantém as concessões; repetidas aqui para a migration se explicar sozinha)
do $$
declare f text;
begin
  foreach f in array array['vendas_reservar_ia', 'vendas_custo_dia', 'vendas_reservar_custo'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
