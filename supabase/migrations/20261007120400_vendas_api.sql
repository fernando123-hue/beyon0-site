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

-- custo de IA das conversas criadas hoje (fuso de Brasília): o teto diário global
create function app.vendas_custo_dia(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('custo_usd', coalesce(sum(c.custo_ia_usd), 0))
  from app.conversas c join app.organizacoes o on o.id = c.org_id
  where o.slug = p ->> 'org_slug' and (c.created_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
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

do $$
declare f text;
begin
  foreach f in array array['vendas_somar_custo', 'vendas_custo_dia', 'vendas_contato_da_conversa'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
