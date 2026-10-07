-- ==========================================================================
-- P1 DA AUDITORIA DO HARNESS: ALERTAS e a saúde das rotinas.
-- Antes, "silêncio parecia saúde": pagamento divergente, teto de IA no fim,
-- IA falhando ou a própria rotina parada não avisavam ninguém. Agora a
-- rotina diária (/api/rotinas) chama app.rotinas_conferir, que grava a
-- execução do dia e os alertas (um por tipo por dia); o painel lê
-- app.rotinas_painel (alertas abertos + quando a rotina rodou) e o dono
-- recebe o resumo no celular pelo ntfy.sh (grátis, sem conta), se o tópico
-- estiver configurado. Sem dado pessoal nos alertas: só contagens.
-- ==========================================================================
create table app.rotinas_execucoes (
  dia        date not null,
  rotina     text not null check (rotina in ('diaria')),
  ok         boolean not null,
  resultado  jsonb not null default '{}' check (jsonb_typeof(resultado) = 'object' and pg_column_size(resultado) <= 4096),
  avisado    boolean not null default false,       -- o resumo do dia já foi enviado ao dono (não repete)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dia, rotina)
);

create table app.alertas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  dia          date not null,
  tipo         text not null check (tipo in ('pagamento_atencao', 'teto_ia', 'ia_falhando', 'freio_ip', 'rotina_falhou')),
  nivel        text not null check (nivel in ('aviso', 'urgente')),
  mensagem     text not null check (char_length(mensagem) <= 300),
  resolvido_em timestamptz,
  created_at   timestamptz not null default now(),
  unique (org_id, dia, tipo)
);
create index alertas_abertos on app.alertas (org_id, dia desc) where resolvido_em is null;

revoke all on app.rotinas_execucoes, app.alertas from public, anon, authenticated, service_role;
grant select on app.alertas to authenticated;
grant select on app.rotinas_execucoes, app.alertas to service_role;
alter table app.rotinas_execucoes enable row level security;
alter table app.alertas enable row level security;
create policy alertas_ler on app.alertas for select to authenticated using (org_id in (select privado.minhas_orgs()));

-- a conferência do dia: calcula, grava os alertas novos e a execução; devolve os alertas do dia e se é preciso avisar
create function app.rotinas_conferir(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atencao integer; v_custo numeric; v_teto numeric := coalesce((p ->> 'teto_dia_usd')::numeric, 25);
  v_falhas integer; v_freios integer; v_falhou text := nullif(p ->> 'falha', '');
  v_avisado boolean;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if v_org is null then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;

  -- (24 h = o intervalo do cron diário: um evento não é contado em dois dias seguidos)
  select coalesce((app.pagamentos_atencao('{"horas": 24}'::jsonb) ->> 'total')::integer, 0) into v_atencao;
  -- o gasto das ÚLTIMAS 24 h pelo registro das chamadas (a rotina roda de madrugada: o "hoje" mal começou)
  select coalesce(sum(custo_usd), 0) into v_custo from app.ia_chamadas where org_id = v_org and created_at > now() - interval '24 hours';
  -- (só falha do provedor: recusa, formato e entrada um visitante provoca, e não podem acordar o dono)
  select count(*) into v_falhas from app.ia_chamadas where org_id = v_org and erro in ('tempo', 'limite', 'indisponivel', 'falha')
    and created_at > now() - interval '24 hours';
  select count(*) into v_freios from app.eventos_funil where org_id = v_org and tipo = 'freio_ip' and created_at > now() - interval '24 hours';

  if v_atencao > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'pagamento_atencao', 'urgente',
      v_atencao || ' evento(s) de pagamento pedem uma pessoa nas últimas 24 h (divergência, estorno, contestação ou projeto pausado).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_custo >= 0.8 * v_teto then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'teto_ia', case when v_custo >= v_teto then 'urgente' else 'aviso' end,
      'Gasto de IA nas últimas 24 h: US$ ' || replace(round(v_custo, 2)::text, '.', ',') || ' (teto do dia: US$ ' || replace(v_teto::text, '.', ',') || '; no teto, o agente para e oferece o WhatsApp).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_falhas >= coalesce((p ->> 'max_falhas_ia')::integer, 5) then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'ia_falhando', 'aviso',
      v_falhas || ' chamada(s) de IA falharam nas últimas 24 h (veja app.ia_chamadas).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_freios > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'freio_ip', 'aviso',
      v_freios || ' conversa(s) barradas pelo limite diário por endereço (abuso ou muita gente na mesma rede).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_falhou is not null then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'rotina_falhou', 'urgente',
      'A rotina diária falhou em: ' || left(v_falhou, 200))
    on conflict (org_id, dia, tipo) do nothing;
  end if;

  insert into app.rotinas_execucoes (dia, rotina, ok, resultado)
  values (v_dia, 'diaria', v_falhou is null, jsonb_build_object('atencao', v_atencao, 'custo_dia', v_custo, 'falhas_ia', v_falhas, 'freios', v_freios))
  on conflict (dia, rotina) do update set ok = excluded.ok, resultado = excluded.resultado, updated_at = now()
  returning avisado into v_avisado;

  -- os alertas abertos dos últimos 7 dias: o urgente não resolvido volta no aviso de cada dia até alguém resolver
  return jsonb_build_object(
    'alertas', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'nivel', nivel, 'dia', dia, 'mensagem', mensagem) order by nivel desc, dia desc, tipo)
                         from app.alertas where org_id = v_org and dia > v_dia - 7 and resolvido_em is null
                           and (dia = v_dia or nivel = 'urgente')), '[]'),
    'avisar', not v_avisado);
end $$;

-- o resumo do dia foi enviado: não repete
create function app.rotinas_avisado(p jsonb) returns jsonb
language sql security definer set search_path = '' as $$
  update app.rotinas_execucoes set avisado = true, updated_at = now()
  where dia = (now() at time zone 'America/Sao_Paulo')::date and rotina = 'diaria'
  returning jsonb_build_object('ok', true);
$$;

-- o que o painel mostra: quando a rotina rodou pela última vez (com ou sem falha: a falha vira alerta à parte) e os
-- alertas abertos dos últimos 30 dias
create function app.rotinas_painel(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ultima_rotina', (select max(dia) from app.rotinas_execucoes where rotina = 'diaria'),
    'alertas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'dia', a.dia, 'tipo', a.tipo, 'nivel', a.nivel, 'mensagem', a.mensagem) order by a.dia desc, a.nivel desc)
                         from app.alertas a join app.organizacoes o on o.id = a.org_id
                         where o.slug = p ->> 'org_slug' and a.resolvido_em is null and a.dia > (now() at time zone 'America/Sao_Paulo')::date - 30), '[]'));
$$;

-- o dono marca um alerta como resolvido (pelo painel)
create function app.rotinas_resolver(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update app.alertas a set resolvido_em = now()
  from app.organizacoes o
  where a.id = (p ->> 'id')::uuid and a.resolvido_em is null and o.id = a.org_id and o.slug = coalesce(p ->> 'org_slug', 'beyon-zero');
  if not found then raise exception 'alerta não encontrado' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['rotinas_conferir', 'rotinas_avisado', 'rotinas_painel', 'rotinas_resolver'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
