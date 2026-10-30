-- ==========================================================================
-- O ATENDENTE DE IA NO SITE DO CLIENTE (fase 0 do plano da plataforma do atendente; Decisões 28/10 e 30/10): um balão
-- que se cola no site do CLIENTE da Beyon e responde só com a base daquele negócio. Sem Meta, sem API de WhatsApp, sem CNPJ.
-- Reaproveita o banco da fundação (plano: "reaproveita Banco"): mesma organização (dona do cliente), mesmo RLS fechado.
--
-- • ISOLAMENTO é o ponto central: cada tabela leva cliente_id e org_id; toda função recebe o id PÚBLICO do cliente (ou
--   o id interno + org no painel) e só toca linhas desse cliente. Conversa de outro cliente, ainda que o uuid seja
--   adivinhado, é tratada como inexistente (nasce conversa nova; nunca revela que existe).
-- • Tabelas fechadas, como app.recados: RLS ligado, SEM política, nenhum privilégio; só as funções (service_role).
-- • publico: o id que vai no script do site (não é segredo; quem decide é o domínio permitido e os tetos).
-- • Domínios: só nome de máquina exato (sem curinga, sem esquema, sem porta).
-- • Base: perguntas e respostas, e a TABELA DE PREÇOS (item, centavos): o preço que a IA fala só sai daqui.
-- • Gasto: dólares por cliente por dia (teto por cliente). Contato: nome e telefone que o visitante deixou.
-- • RETENÇÃO (rotina diária, app.rotinas_atendente): conversas e mensagens 60 dias (o prazo do texto das conversas do
--   site, privacidade.html); contatos 90 dias; gasto 90 dias.
-- ==========================================================================

create table app.atendente_clientes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references app.organizacoes (id) on delete cascade,
  publico         text not null unique default ('at_' || replace(gen_random_uuid()::text, '-', '')) check (publico ~ '^at_[0-9a-f]{32}$'),
  criado_em       timestamptz not null default now(),
  nome            text not null check (char_length(nome) between 1 and 80 and nome = btrim(nome)),
  whatsapp        text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  privacidade_url text check (privacidade_url is null or (privacidade_url ~ '^https://[^\s<>"]{4,250}$')),
  saudacao        text check (saudacao is null or char_length(saudacao) between 1 and 300),
  cor             text not null default '#1a1a1a' check (cor ~ '^#[0-9a-f]{6}$'),
  cor_texto       text not null default '#ffffff' check (cor_texto ~ '^#[0-9a-f]{6}$'),
  teto_dia_usd    numeric(8,2) not null default 1.00 check (teto_dia_usd between 0 and 100),
  ativo           boolean not null default true,
  unique (org_id, id)
);
create index atendente_clientes_org on app.atendente_clientes (org_id, criado_em desc);

create table app.atendente_dominios (
  cliente_id uuid not null,
  org_id     uuid not null,
  dominio    text not null check (dominio ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$' and dominio !~ '\.\.' and char_length(dominio) <= 253),
  primary key (cliente_id, dominio),
  foreign key (org_id, cliente_id) references app.atendente_clientes (org_id, id) on delete cascade
);

create table app.atendente_base (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null,
  org_id         uuid not null,
  ordem          integer not null default 0,
  tipo           text not null check (tipo in ('pergunta', 'preco')),
  pergunta       text check (pergunta is null or char_length(pergunta) between 1 and 300),
  resposta       text check (resposta is null or char_length(resposta) between 1 and 1500),
  item           text check (item is null or char_length(item) between 1 and 120),
  preco_centavos integer check (preco_centavos is null or preco_centavos between 0 and 100000000),
  foreign key (org_id, cliente_id) references app.atendente_clientes (org_id, id) on delete cascade,
  check ((tipo = 'pergunta' and pergunta is not null and resposta is not null) or (tipo = 'preco' and item is not null and preco_centavos is not null))
);
create index atendente_base_cliente on app.atendente_base (cliente_id, ordem);

create table app.atendente_conversas (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  org_id     uuid not null,
  criado_em  timestamptz not null default now(),
  ultima_em  timestamptz not null default now(),
  unique (cliente_id, id),
  foreign key (org_id, cliente_id) references app.atendente_clientes (org_id, id) on delete cascade
);
create index atendente_conversas_cliente on app.atendente_conversas (cliente_id, ultima_em desc);
create index atendente_conversas_ultima on app.atendente_conversas (ultima_em);

create table app.atendente_mensagens (
  id          bigint generated always as identity primary key,
  conversa_id uuid not null,
  cliente_id  uuid not null,
  criado_em   timestamptz not null default now(),
  papel       text not null check (papel in ('visitante', 'atendente')),
  texto       text not null check (char_length(texto) between 1 and 4000),
  foreign key (cliente_id, conversa_id) references app.atendente_conversas (cliente_id, id) on delete cascade
);
create index atendente_mensagens_conversa on app.atendente_mensagens (conversa_id, id);

create table app.atendente_contatos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null,
  org_id      uuid not null,
  conversa_id uuid,
  criado_em   timestamptz not null default now(),
  nome        text not null check (char_length(nome) between 1 and 80),
  telefone    text not null check (telefone ~ '^[0-9]{10,15}$'),
  foreign key (org_id, cliente_id) references app.atendente_clientes (org_id, id) on delete cascade
);
create index atendente_contatos_cliente on app.atendente_contatos (cliente_id, criado_em desc);

create table app.atendente_gasto (
  cliente_id uuid not null,
  org_id     uuid not null,
  dia        date not null,
  usd        numeric(10,4) not null default 0 check (usd >= 0),
  primary key (cliente_id, dia),
  foreign key (org_id, cliente_id) references app.atendente_clientes (org_id, id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['atendente_clientes', 'atendente_dominios', 'atendente_base', 'atendente_conversas', 'atendente_mensagens', 'atendente_contatos', 'atendente_gasto'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('revoke all on app.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

-- ---------- lado do visitante (API pública do balão) ----------

-- a configuração que a API usa: cliente ativo, domínios e base. Id desconhecido ou cliente desligado = null (sem dizer qual).
create function app.atendente_config(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.atendente_clientes;
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico' and ativo;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', c.id, 'publico', c.publico, 'nome', c.nome, 'whatsapp', c.whatsapp, 'privacidade_url', c.privacidade_url, 'saudacao', c.saudacao,
    'cor', c.cor, 'cor_texto', c.cor_texto, 'teto_dia_usd', c.teto_dia_usd,
    'dominios', coalesce((select jsonb_agg(dominio order by dominio) from app.atendente_dominios where cliente_id = c.id), '[]'::jsonb),
    'base', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'pergunta', pergunta, 'resposta', resposta, 'item', item, 'preco_centavos', preco_centavos) order by ordem, id)
                        from app.atendente_base where cliente_id = c.id), '[]'::jsonb));
end $$;

-- abre o turno: confere os tetos, acha ou cria a conversa DESTE cliente e devolve o histórico. Conta o IP na hora.
-- motivo: 'ip' | 'conversa' | 'gasto' (a API responde com honestidade e passa para pessoa)
create function app.atendente_turno_abrir(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.atendente_clientes;
  v_conv uuid;
  v_max_msgs integer := least(greatest(coalesce((p ->> 'max_msgs')::integer, 30), 1), 200);
  v_max_ip integer := least(greatest(coalesce((p ->> 'max_ip_hora')::integer, 40), 1), 1000);
  v_n integer := 0;
  v_gasto numeric := 0;
  v_hist jsonb := '[]'::jsonb;
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico' and ativo;
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  if coalesce(p ->> 'chave_ip', '') ~ '^[0-9a-f]{64}$' and not privado.freio_hora('atendente|ip|' || c.id || '|' || (p ->> 'chave_ip'), v_max_ip) then
    return jsonb_build_object('ok', false, 'motivo', 'ip');
  end if;
  select usd into v_gasto from app.atendente_gasto where cliente_id = c.id and dia = (now() at time zone 'UTC')::date;
  if coalesce(v_gasto, 0) >= c.teto_dia_usd then return jsonb_build_object('ok', false, 'motivo', 'gasto'); end if;
  if coalesce(p ->> 'conversa_id', '') ~ '^[0-9a-f-]{36}$' then
    select id into v_conv from app.atendente_conversas where id = (p ->> 'conversa_id')::uuid and cliente_id = c.id;   -- só se for DESTE cliente
  end if;
  if v_conv is null then
    insert into app.atendente_conversas (cliente_id, org_id) values (c.id, c.org_id) returning id into v_conv;
  else
    select count(*) into v_n from app.atendente_mensagens where conversa_id = v_conv and cliente_id = c.id and papel = 'visitante';
    if v_n >= v_max_msgs then return jsonb_build_object('ok', false, 'motivo', 'conversa', 'conversa_id', v_conv); end if;
    select coalesce(jsonb_agg(jsonb_build_object('papel', papel, 'texto', texto) order by id), '[]'::jsonb) into v_hist
      from (select * from app.atendente_mensagens where conversa_id = v_conv and cliente_id = c.id order by id desc limit 12) m;
  end if;
  return jsonb_build_object('ok', true, 'conversa_id', v_conv, 'mensagens', v_n, 'historico', v_hist);
end $$;

-- grava o turno (visitante e atendente) e soma o gasto do dia; a conversa tem de ser deste cliente
create function app.atendente_turno_gravar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.atendente_clientes; v_conv uuid := (p ->> 'conversa_id')::uuid; v_usd numeric := least(greatest(coalesce((p ->> 'custo_usd')::numeric, 0), 0), 100);
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico' and ativo;
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  if not exists (select 1 from app.atendente_conversas where id = v_conv and cliente_id = c.id) then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  insert into app.atendente_mensagens (conversa_id, cliente_id, papel, texto) values
    (v_conv, c.id, 'visitante', left(p ->> 'texto_visitante', 4000)), (v_conv, c.id, 'atendente', left(p ->> 'texto_atendente', 4000));
  update app.atendente_conversas set ultima_em = now() where id = v_conv;
  insert into app.atendente_gasto (cliente_id, org_id, dia, usd) values (c.id, c.org_id, (now() at time zone 'UTC')::date, v_usd)
    on conflict (cliente_id, dia) do update set usd = app.atendente_gasto.usd + excluded.usd;
  return jsonb_build_object('ok', true);
end $$;

-- contato deixado pelo visitante (nome e telefone); no máximo 3 por conversa
create function app.atendente_contato_criar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.atendente_clientes; v_conv uuid; v_tel text := regexp_replace(coalesce(p ->> 'telefone', ''), '[^0-9]', '', 'g'); v_nome text := btrim(coalesce(p ->> 'nome', ''));
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico' and ativo;
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  if coalesce(p ->> 'conversa_id', '') ~ '^[0-9a-f-]{36}$' then
    select id into v_conv from app.atendente_conversas where id = (p ->> 'conversa_id')::uuid and cliente_id = c.id;
  end if;
  if v_conv is null then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  if char_length(v_nome) not between 1 and 80 or v_tel !~ '^[0-9]{10,15}$' then raise exception 'contato inválido' using errcode = '22023'; end if;
  if (select count(*) from app.atendente_contatos where conversa_id = v_conv and cliente_id = c.id) >= 3 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  insert into app.atendente_contatos (cliente_id, org_id, conversa_id, nome, telefone) values (c.id, c.org_id, v_conv, v_nome, v_tel);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- lado do dono (painel) ----------

create function app.atendente_cliente_salvar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_id uuid; v_publico text; i jsonb; v_ordem integer := 0; d text;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  if coalesce(p ->> 'id', '') ~ '^[0-9a-f-]{36}$' then
    update app.atendente_clientes set
      nome = btrim(p ->> 'nome'), whatsapp = nullif(p ->> 'whatsapp', ''), privacidade_url = nullif(p ->> 'privacidade_url', ''),
      saudacao = nullif(btrim(coalesce(p ->> 'saudacao', '')), ''), cor = coalesce(p ->> 'cor', cor), cor_texto = coalesce(p ->> 'cor_texto', cor_texto),
      teto_dia_usd = coalesce((p ->> 'teto_dia_usd')::numeric, teto_dia_usd), ativo = coalesce((p ->> 'ativo')::boolean, ativo)
     where id = (p ->> 'id')::uuid and org_id = v_org returning id, publico into v_id, v_publico;
    if v_id is null then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  else
    insert into app.atendente_clientes (org_id, nome, whatsapp, privacidade_url, saudacao, cor, cor_texto, teto_dia_usd, ativo)
    values (v_org, btrim(p ->> 'nome'), nullif(p ->> 'whatsapp', ''), nullif(p ->> 'privacidade_url', ''), nullif(btrim(coalesce(p ->> 'saudacao', '')), ''),
            coalesce(p ->> 'cor', '#1a1a1a'), coalesce(p ->> 'cor_texto', '#ffffff'), coalesce((p ->> 'teto_dia_usd')::numeric, 1.00), coalesce((p ->> 'ativo')::boolean, true))
    returning id, publico into v_id, v_publico;
  end if;
  if p ? 'dominios' then
    delete from app.atendente_dominios where cliente_id = v_id;
    for d in select jsonb_array_elements_text(p -> 'dominios') loop
      insert into app.atendente_dominios (cliente_id, org_id, dominio) values (v_id, v_org, lower(btrim(d))) on conflict do nothing;
    end loop;
  end if;
  if p ? 'base' then
    delete from app.atendente_base where cliente_id = v_id;
    for i in select jsonb_array_elements(p -> 'base') loop
      v_ordem := v_ordem + 1;
      insert into app.atendente_base (cliente_id, org_id, ordem, tipo, pergunta, resposta, item, preco_centavos)
      values (v_id, v_org, v_ordem, i ->> 'tipo', i ->> 'pergunta', i ->> 'resposta', i ->> 'item', (i ->> 'preco_centavos')::integer);
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'publico', v_publico);
end $$;

create function app.atendente_painel_clientes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  return jsonb_build_object('itens', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'publico', c.publico, 'nome', c.nome, 'ativo', c.ativo,
      'conversas', (select count(*) from app.atendente_conversas x where x.cliente_id = c.id),
      'contatos', (select count(*) from app.atendente_contatos x where x.cliente_id = c.id)) order by c.criado_em desc)
    from app.atendente_clientes c where c.org_id = v_org), '[]'::jsonb));
end $$;

-- o cliente inteiro para editar (base, domínios, ajustes), da organização do dono
create function app.atendente_painel_cliente(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.atendente_clientes;
begin
  select c0.* into c from app.atendente_clientes c0 join app.organizacoes o on o.id = c0.org_id where c0.id = (p ->> 'id')::uuid and o.slug = p ->> 'org_slug';
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', c.id, 'publico', c.publico, 'nome', c.nome, 'whatsapp', c.whatsapp, 'privacidade_url', c.privacidade_url, 'saudacao', c.saudacao,
    'cor', c.cor, 'cor_texto', c.cor_texto, 'teto_dia_usd', c.teto_dia_usd, 'ativo', c.ativo,
    'dominios', coalesce((select jsonb_agg(dominio order by dominio) from app.atendente_dominios where cliente_id = c.id), '[]'::jsonb),
    'base', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'pergunta', pergunta, 'resposta', resposta, 'item', item, 'preco_centavos', preco_centavos) order by ordem, id)
                        from app.atendente_base where cliente_id = c.id), '[]'::jsonb));
end $$;

-- conversas (com as mensagens) e contatos de UM cliente da organização
create function app.atendente_painel_conversas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.atendente_clientes; v_limite integer := least(greatest(coalesce((p ->> 'limite')::integer, 30), 1), 100);
begin
  select c0.* into c from app.atendente_clientes c0 join app.organizacoes o on o.id = c0.org_id where c0.id = (p ->> 'id')::uuid and o.slug = p ->> 'org_slug';
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'conversas', coalesce((select jsonb_agg(jsonb_build_object('id', left(v.id::text, 8), 'criado_em', v.criado_em,
        'mensagens', (select coalesce(jsonb_agg(jsonb_build_object('papel', m.papel, 'texto', m.texto, 'criado_em', m.criado_em) order by m.id), '[]'::jsonb) from app.atendente_mensagens m where m.conversa_id = v.id and m.cliente_id = c.id)) order by v.ultima_em desc)
      from (select * from app.atendente_conversas where cliente_id = c.id order by ultima_em desc limit v_limite) v), '[]'::jsonb),
    'contatos', coalesce((select jsonb_agg(jsonb_build_object('criado_em', criado_em, 'nome', nome, 'telefone', telefone) order by criado_em desc)
      from (select * from app.atendente_contatos where cliente_id = c.id order by criado_em desc limit 100) k), '[]'::jsonb),
    'gasto_hoje_usd', coalesce((select usd from app.atendente_gasto where cliente_id = c.id and dia = (now() at time zone 'UTC')::date), 0));
end $$;

-- retenção (rotina diária): conversas e mensagens 60 dias; contatos e gasto 90; o mínimo aceito é 30
create function app.rotinas_atendente(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dias integer := coalesce((p ->> 'dias')::integer, 60); v_conv integer; v_cont integer; v_gasto integer;
begin
  if v_dias < 30 then raise exception 'retenção mínima de 30 dias' using errcode = '22023'; end if;
  delete from app.atendente_conversas where ultima_em < now() - make_interval(days => v_dias);
  get diagnostics v_conv = row_count;
  delete from app.atendente_contatos where criado_em < now() - make_interval(days => v_dias + 30);
  get diagnostics v_cont = row_count;
  delete from app.atendente_gasto where dia < (now() at time zone 'UTC')::date - (v_dias + 30);
  get diagnostics v_gasto = row_count;
  return jsonb_build_object('conversas', v_conv, 'contatos', v_cont, 'gasto', v_gasto, 'dias', v_dias);
end $$;

do $$
declare f text;
begin
  foreach f in array array['atendente_config', 'atendente_turno_abrir', 'atendente_turno_gravar', 'atendente_contato_criar', 'atendente_cliente_salvar',
      'atendente_painel_clientes', 'atendente_painel_cliente', 'atendente_painel_conversas', 'rotinas_atendente'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
