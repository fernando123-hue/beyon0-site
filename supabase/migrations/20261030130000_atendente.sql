-- ==========================================================================
-- O ATENDENTE DE IA NO SITE DO CLIENTE (fase 0 do plano da plataforma do atendente; Decisões 28/10 e 30/10): um balão
-- que se cola no site do CLIENTE da Beyon e responde só com a base daquele negócio. Sem Meta, sem API de WhatsApp, sem CNPJ.
-- Reaproveita o banco da fundação (plano: "reaproveita Banco"): mesma organização (dona do cliente), mesmo RLS fechado.
--
-- • ISOLAMENTO é o ponto central: cada tabela leva cliente_id (e org_id, menos as mensagens, que herdam pela FK da conversa); toda função recebe o id PÚBLICO do cliente (ou
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
  msgs       integer not null default 0,   -- turnos do visitante já aceitos (contados na abertura do turno, com trava)
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
  usd        numeric(10,4) not null default 0 check (usd >= 0),   -- gasto REAL já acertado
  reservado  numeric(10,4) not null default 0 check (reservado >= 0),   -- reservas de turnos em andamento; vencem em 60 s sozinhas
  reservado_em timestamptz,
  avisado    boolean not null default false,                     -- o aviso de teto batido (ntfy) já saiu hoje
  primary key (cliente_id, dia),
  foreign key (org_id, cliente_id) references app.atendente_clientes (org_id, id) on delete cascade
);

-- o gasto do dia de TODOS os clientes somados (teto global do atendente)
create table app.atendente_gasto_global (
  dia     date primary key,
  usd     numeric(10,4) not null default 0 check (usd >= 0),
  reservado numeric(10,4) not null default 0 check (reservado >= 0),
  reservado_em timestamptz,
  avisado boolean not null default false
);

do $$
declare t text;
begin
  foreach t in array array['atendente_clientes', 'atendente_dominios', 'atendente_base', 'atendente_conversas', 'atendente_mensagens', 'atendente_contatos', 'atendente_gasto', 'atendente_gasto_global'] loop
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

-- abre o turno, ATÔMICO. A trava por cliente (advisory, até o fim da transação) serializa quem disputa o mesmo teto; dentro dela o IP, as
-- mensagens da conversa e o gasto são contados na MESMA operação. O gasto é RESERVADO aqui, ANTES de a IA ser chamada, e acertado em
-- atendente_turno_gravar com o custo real; reserva perdida (função que caiu) erra para o lado seguro. Dois tetos: o do cliente no dia
-- (atendente_clientes.teto_dia_usd) e o global de todos os clientes (p.teto_global_usd, que o backend lê de variável de ambiente).
-- O dia é o de Brasília, como o resto do projeto.
-- motivo: 'ip' | 'conversa' | 'gasto' | 'global' (a API responde com honestidade e passa para pessoa);
-- avisar: 'cliente' | 'global', UMA vez por dia, na primeira recusa por gasto (o backend manda o ntfy, sem dado pessoal).
create function app.atendente_turno_abrir(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.atendente_clientes;
  v_conv uuid;
  v_n integer;
  v_max_msgs integer := least(greatest(coalesce((p ->> 'max_msgs')::integer, 30), 1), 200);
  v_max_ip integer := least(greatest(coalesce((p ->> 'max_ip_hora')::integer, 40), 1), 1000);
  v_reserva numeric := greatest(least(greatest(coalesce((p ->> 'reserva_usd')::numeric, 0), 0), 10), 0.0001);
  v_teto_global numeric := coalesce((p ->> 'teto_global_usd')::numeric, 1000000);
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hist jsonb := '[]'::jsonb;
  v_ok integer;
  v_aviso integer;
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico' and ativo;
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('atendente|' || c.id::text, 0));
  if coalesce(p ->> 'chave_ip', '') ~ '^[0-9a-f]{64}$' and not privado.freio_hora('atendente|ip|' || c.id || '|' || (p ->> 'chave_ip'), v_max_ip) then
    return jsonb_build_object('ok', false, 'motivo', 'ip');
  end if;
  if coalesce(p ->> 'conversa_id', '') ~ '^[0-9a-f-]{36}$' then
    select id into v_conv from app.atendente_conversas where id = (p ->> 'conversa_id')::uuid and cliente_id = c.id;   -- só se for DESTE cliente
  end if;
  if v_conv is not null then
    update app.atendente_conversas set msgs = msgs + 1 where id = v_conv and cliente_id = c.id and msgs < v_max_msgs returning msgs into v_n;
    if v_n is null then return jsonb_build_object('ok', false, 'motivo', 'conversa', 'conversa_id', v_conv); end if;
  end if;
  -- reserva VENCIDA (a IA tem teto de 15 s; aqui 60 s) sai da conta sozinha: uma execução que caiu não deixa dinheiro preso até o fim do dia
  update app.atendente_gasto set reservado = 0 where cliente_id = c.id and dia = v_dia and reservado > 0 and reservado_em < now() - interval '60 seconds';
  update app.atendente_gasto_global set reservado = 0 where dia = v_dia and reservado > 0 and reservado_em < now() - interval '60 seconds';
  -- o gasto do cliente: reserva só se (gasto real + reservas vigentes + esta) couber no teto, na mesma instrução
  if v_reserva <= c.teto_dia_usd then
    insert into app.atendente_gasto (cliente_id, org_id, dia, usd, reservado, reservado_em) values (c.id, c.org_id, v_dia, 0, v_reserva, now())
      on conflict (cliente_id, dia) do update set reservado = app.atendente_gasto.reservado + excluded.reservado, reservado_em = now()
      where app.atendente_gasto.usd + app.atendente_gasto.reservado + excluded.reservado <= c.teto_dia_usd
      returning 1 into v_ok;
  end if;
  if v_ok is null then
    if v_conv is not null then update app.atendente_conversas set msgs = msgs - 1 where id = v_conv; end if;
    insert into app.atendente_gasto (cliente_id, org_id, dia, usd, avisado) values (c.id, c.org_id, v_dia, 0, true)
      on conflict (cliente_id, dia) do update set avisado = true where not app.atendente_gasto.avisado returning 1 into v_aviso;
    return jsonb_build_object('ok', false, 'motivo', 'gasto') || case when v_aviso is not null then jsonb_build_object('avisar', 'cliente') else '{}'::jsonb end;
  end if;
  -- o teto global, de todos os clientes somados
  v_ok := null;
  insert into app.atendente_gasto_global as g (dia, usd, reservado, reservado_em) values (v_dia, 0, v_reserva, now())
    on conflict (dia) do update set reservado = g.reservado + excluded.reservado, reservado_em = now()
    where g.usd + g.reservado + excluded.reservado <= v_teto_global
    returning 1 into v_ok;
  if v_ok is null then
    update app.atendente_gasto set reservado = greatest(reservado - v_reserva, 0) where cliente_id = c.id and dia = v_dia;
    if v_conv is not null then update app.atendente_conversas set msgs = msgs - 1 where id = v_conv; end if;
    insert into app.atendente_gasto_global as g (dia, usd, avisado) values (v_dia, 0, true)
      on conflict (dia) do update set avisado = true where not g.avisado returning 1 into v_aviso;
    return jsonb_build_object('ok', false, 'motivo', 'global') || case when v_aviso is not null then jsonb_build_object('avisar', 'global') else '{}'::jsonb end;
  end if;
  if v_conv is null then
    insert into app.atendente_conversas (cliente_id, org_id, msgs) values (c.id, c.org_id, 1) returning id into v_conv;
  else
    select coalesce(jsonb_agg(jsonb_build_object('papel', papel, 'texto', texto) order by id), '[]'::jsonb) into v_hist
      from (select * from app.atendente_mensagens where conversa_id = v_conv and cliente_id = c.id order by id desc limit 12) m;
  end if;
  return jsonb_build_object('ok', true, 'conversa_id', v_conv, 'historico', v_hist, 'reservado_usd', v_reserva);
end $$;

-- grava o turno (visitante e atendente) e ACERTA o gasto: soma o custo real e tira o que foi reservado; a conversa tem de ser deste cliente
create function app.atendente_turno_gravar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.atendente_clientes; v_conv uuid := (p ->> 'conversa_id')::uuid;
  v_usd numeric := least(greatest(coalesce((p ->> 'custo_usd')::numeric, 0), 0), 100);
  v_res numeric := least(greatest(coalesce((p ->> 'reservado_usd')::numeric, 0), 0), 10);
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico' and ativo;
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  if not exists (select 1 from app.atendente_conversas where id = v_conv and cliente_id = c.id) then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  insert into app.atendente_mensagens (conversa_id, cliente_id, papel, texto) values
    (v_conv, c.id, 'visitante', left(p ->> 'texto_visitante', 4000)), (v_conv, c.id, 'atendente', left(p ->> 'texto_atendente', 4000));
  update app.atendente_conversas set ultima_em = now() where id = v_conv;
  insert into app.atendente_gasto (cliente_id, org_id, dia, usd) values (c.id, c.org_id, v_dia, v_usd)
    on conflict (cliente_id, dia) do update set usd = app.atendente_gasto.usd + v_usd, reservado = greatest(app.atendente_gasto.reservado - v_res, 0);
  insert into app.atendente_gasto_global as g (dia, usd) values (v_dia, v_usd)
    on conflict (dia) do update set usd = g.usd + v_usd, reservado = greatest(g.reservado - v_res, 0);
  return jsonb_build_object('ok', true);
end $$;

-- a IA ou a gravação falhou: devolve a reserva (e soma o custo real, se a IA chegou a cobrar); o backend chama em TODA falha
create function app.atendente_turno_desfazer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c app.atendente_clientes; v_usd numeric := least(greatest(coalesce((p ->> 'custo_usd')::numeric, 0), 0), 100);
  v_res numeric := least(greatest(coalesce((p ->> 'reservado_usd')::numeric, 0), 0), 10);
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico';
  if not found then return jsonb_build_object('ok', false); end if;
  update app.atendente_gasto set usd = usd + v_usd, reservado = greatest(reservado - v_res, 0) where cliente_id = c.id and dia = v_dia;
  update app.atendente_gasto_global set usd = usd + v_usd, reservado = greatest(reservado - v_res, 0) where dia = v_dia;
  return jsonb_build_object('ok', true);
end $$;

-- contato deixado pelo visitante (nome e telefone). A conversa é OPCIONAL: quando o teto bate não existe conversa, e o contato é a única saída de
-- quem não tem WhatsApp. Freios próprios: 5 por hora por IP e por cliente, 200 por dia por cliente, 3 por conversa (com a trava do cliente).
create function app.atendente_contato_criar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.atendente_clientes; v_conv uuid; v_tel text := regexp_replace(coalesce(p ->> 'telefone', ''), '[^0-9]', '', 'g'); v_nome text := btrim(coalesce(p ->> 'nome', ''));
begin
  select * into c from app.atendente_clientes where publico = p ->> 'publico' and ativo;
  if not found then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  if char_length(v_nome) not between 1 and 80 or v_tel !~ '^[0-9]{10,15}$' then raise exception 'contato inválido' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('atendente|' || c.id::text, 0));
  if coalesce(p ->> 'conversa_id', '') <> '' then
    if p ->> 'conversa_id' ~ '^[0-9a-f-]{36}$' then
      select id into v_conv from app.atendente_conversas where id = (p ->> 'conversa_id')::uuid and cliente_id = c.id;
    end if;
    if v_conv is null then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
    if (select count(*) from app.atendente_contatos where conversa_id = v_conv and cliente_id = c.id) >= 3 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  end if;
  if coalesce(p ->> 'chave_ip', '') ~ '^[0-9a-f]{64}$' and not privado.freio_hora('atendente|contato|' || c.id || '|' || (p ->> 'chave_ip'), 5) then
    return jsonb_build_object('ok', false, 'motivo', 'ip');
  end if;
  if not privado.freio_dia('atendente|contato|dia|' || c.id || '|' || (now() at time zone 'America/Sao_Paulo')::date, least(greatest(coalesce((p ->> 'max_dia')::integer, 200), 1), 1000)) then
    -- o dia encheu: o dono é avisado UMA vez (o backend manda o ntfy)
    return jsonb_build_object('ok', false, 'motivo', 'cheio')
      || case when privado.freio_dia('atendente|contato|aviso|' || c.id || '|' || (now() at time zone 'America/Sao_Paulo')::date, 1) then jsonb_build_object('avisar', true) else '{}'::jsonb end;
  end if;
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
    'gasto_hoje_usd', coalesce((select usd from app.atendente_gasto where cliente_id = c.id and dia = (now() at time zone 'America/Sao_Paulo')::date), 0));
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
  delete from app.atendente_gasto where dia < (now() at time zone 'America/Sao_Paulo')::date - (v_dias + 30);
  get diagnostics v_gasto = row_count;
  return jsonb_build_object('conversas', v_conv, 'contatos', v_cont, 'gasto', v_gasto, 'dias', v_dias);
end $$;

do $$
declare f text;
begin
  foreach f in array array['atendente_config', 'atendente_turno_abrir', 'atendente_turno_gravar', 'atendente_turno_desfazer', 'atendente_contato_criar', 'atendente_cliente_salvar',
      'atendente_painel_clientes', 'atendente_painel_cliente', 'atendente_painel_conversas', 'rotinas_atendente'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
