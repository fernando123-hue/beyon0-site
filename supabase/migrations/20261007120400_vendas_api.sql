-- ==========================================================================
-- FASE 2 — ajustes para a API: o custo de IA das gerações e alterações entra
-- na conta da conversa (os tetos de custo valem para o fluxo inteiro), o
-- custo do dia (teto global) e o contato que o gateway precisa na cobrança.
-- ==========================================================================

-- custo de uma etapa fora do turno de conversa (geração, alteração)
create function app.vendas_somar_custo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update app.conversas set custo_ia_usd = custo_ia_usd + greatest(0, coalesce((p ->> 'custo_usd')::numeric, 0))
  where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- custo de IA das conversas ATIVAS hoje (fuso de Brasília): o teto diário global. Conta o custo inteiro de quem
-- mexeu hoje (conservador: conversa antiga que volta a gastar não escapa; o custo de ontem dela pesa a mais)
create function app.vendas_custo_dia(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('custo_usd', coalesce(sum(c.custo_ia_usd), 0))
  from app.conversas c join app.organizacoes o on o.id = c.org_id
  where o.slug = p ->> 'org_slug' and (c.ultima_atividade at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
$$;

-- o contato da cobrança vem do lead da conversa (o gateway pede nome e e-mail ou telefone)
create function app.vendas_contato_da_conversa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; l app.leads;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  select * into l from app.leads where id = c.lead_id;
  if not found then raise exception 'contato não informado' using errcode = '55000'; end if;
  return jsonb_build_object('nome', l.nome, 'email', l.email, 'telefone', l.telefone);
end $$;

-- UMA chamada de IA por vez por conversa (conversa e ajuste): sem isso, N pedidos em paralelo passam todos pelo
-- teto de custo e de turnos lido antes. A trava tem prazo (se a função morrer no meio, solta sozinha).
create function app.vendas_reservar_ia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- (FOR UPDATE)
  if c.ia_ate is not null and c.ia_ate > now() then raise exception 'outra resposta em andamento' using errcode = '55P03'; end if;
  if c.turnos >= coalesce((p ->> 'max_turnos')::integer, 40) then raise exception 'turnos esgotados' using errcode = '23514'; end if;
  if c.custo_ia_usd >= coalesce((p ->> 'teto_usd')::numeric, 1.5) then raise exception 'custo esgotado' using errcode = '23514'; end if;
  update app.conversas set ia_ate = now() + make_interval(secs => least(300, greatest(30, coalesce((p ->> 'segundos')::integer, 120)))) where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

create function app.vendas_liberar_ia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update app.conversas set ia_ate = null where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['vendas_somar_custo', 'vendas_custo_dia', 'vendas_contato_da_conversa', 'vendas_reservar_ia', 'vendas_liberar_ia'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
