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

-- (create or replace mantém as concessões; repetidas aqui para a migration se explicar sozinha)
do $$
declare f text;
begin
  foreach f in array array['vendas_reservar_ia'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
