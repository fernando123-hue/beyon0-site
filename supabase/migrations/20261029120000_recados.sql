-- ==========================================================================
-- O RECADO (passo 1 do "Site sem WhatsApp", decisão do dono de 28/10): o site não tem botão de WhatsApp nem acesso direto
-- ao dono. O consultor de IA é o contato e existe NO MÁXIMO UM lugar de feedback: o recado. O dono lê pelo painel (e pelo
-- agente, que resume e repassa); a resposta, se houver, sai por e-mail.
--
-- • Tabela fechada: RLS ligado e SEM política, nenhum privilégio para ninguém; só as funções abaixo (service_role).
-- • texto: 1 a 1000 caracteres. email: opcional, pela MESMA regra do e-mail do site (20261024120100_pr3b3_previa.sql).
-- • conversa_id: só REFERÊNCIA (o código do pedido sai por join na lista); nunca dado copiado. A função só liga quando a
--   conversa é do visitante que mandou; senão o recado nasce sem ligação (e sem dizer que a conversa existe). Apagar a conversa
--   (ex.: pedido do titular) apaga os recados ligados a ela.
-- • origem: rótulo curto de onde a pessoa estava (orcamento, consultor, ...). Sem texto livre, sem endereço, sem IP.
-- • Freios: 5 por hora por IP (o HMAC do servidor, como o link do pedido) e 200 por dia na organização (uma enchente não
--   enche o banco).
-- • RETENÇÃO: 60 dias depois de criado (lido ou não), pela rotina diária (app.rotinas_recados). É o mesmo prazo do texto das
--   conversas de quem não fechou (privacidade.html: "2 meses"); o recado é texto livre da pessoa e o e-mail só serve para a
--   resposta. A política de privacidade passa a dizer isso no PR 4.
-- ==========================================================================

create table app.recados (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references app.organizacoes (id) on delete cascade,
  criado_em   timestamptz not null default now(),
  texto       text not null check (char_length(texto) between 1 and 1000 and texto = btrim(texto)),
  email       text check (email is null or (
                char_length(email) <= 120 and char_length(split_part(email, '@', 1)) <= 64
                and email ~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$')),
  origem      text check (origem is null or origem ~ '^[a-z0-9_-]{1,30}$'),
  conversa_id uuid,
  lido_em     timestamptz,
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade
);
create index recados_org_criado on app.recados (org_id, criado_em desc);
create index recados_nao_lidos on app.recados (org_id) where lido_em is null;

alter table app.recados enable row level security;   -- (sem política: só as funções do backend leem e escrevem)
revoke all on app.recados from public, anon, authenticated, service_role;

-- criar: valida, aplica os freios, liga a conversa se for do visitante
create function app.vendas_recado_criar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_texto text := btrim(coalesce(p ->> 'texto', ''));
  v_email text := nullif(lower(btrim(coalesce(p ->> 'email', ''))), '');
  v_origem text := nullif(btrim(coalesce(p ->> 'origem', '')), '');
  v_conversa uuid;
  v_id uuid;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  if char_length(v_texto) not between 1 and 1000 or v_texto ~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f]'
     or (v_email is not null and (char_length(v_email) > 120 or char_length(split_part(v_email, '@', 1)) > 64
         or v_email !~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'))
     or (v_origem is not null and v_origem !~ '^[a-z0-9_-]{1,30}$') then
    raise exception 'recado inválido' using errcode = '22023';
  end if;
  -- os freios: o do IP primeiro (quem passou da cota não gasta o teto do dia dos outros)
  if coalesce(p ->> 'chave_ip', '') ~ '^[0-9a-f]{64}$' and not privado.freio_hora('recado|ip|' || (p ->> 'chave_ip'), 5) then
    return jsonb_build_object('ok', false, 'motivo', 'freio');
  end if;
  if not privado.freio_dia('recado|dia|' || v_org, 200) then
    return jsonb_build_object('ok', false, 'motivo', 'cheio');
  end if;
  -- a conversa: só se for DESTE visitante; senão, sem ligação (nunca um erro que diga que a conversa existe)
  if coalesce(p ->> 'conversa_id', '') ~ '^[0-9a-f-]{36}$' and coalesce(p ->> 'visitante_id', '') ~ '^[0-9a-f-]{36}$' then
    select id into v_conversa from app.conversas
     where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid and org_id = v_org;
  end if;
  insert into app.recados (org_id, texto, email, origem, conversa_id) values (v_org, v_texto, v_email, v_origem, v_conversa) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- a lista do dono: do mais novo para o mais velho; o código do pedido e o id curto da conversa (o mesmo do painel) quando há
create function app.vendas_recados_listar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_limite integer := least(greatest(coalesce((p ->> 'limite')::integer, 50), 1), 100);
  v_so_nao_lidos boolean := coalesce((p ->> 'so_nao_lidos')::boolean, false);
  v_itens jsonb; v_total integer; v_nao_lidos integer;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  select count(*) filter (where not v_so_nao_lidos or lido_em is null), count(*) filter (where lido_em is null)
    into v_total, v_nao_lidos from app.recados where org_id = v_org;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'criado_em', x.criado_em, 'texto', x.texto, 'email', x.email, 'origem', x.origem,
           'conversa', left(x.conversa_id::text, 8), 'pedido_codigo', x.pedido_codigo, 'lido_em', x.lido_em) order by x.criado_em desc), '[]'::jsonb)
    into v_itens
    from (select r.*, pd.codigo as pedido_codigo from app.recados r left join app.pedidos pd on pd.org_id = r.org_id and pd.conversa_id = r.conversa_id
           where r.org_id = v_org and (not v_so_nao_lidos or r.lido_em is null) order by r.criado_em desc limit v_limite) x;
  return jsonb_build_object('itens', v_itens, 'total', v_total, 'nao_lidos', v_nao_lidos);
end $$;

-- lido / não lido (a hora de "lido" é a primeira; marcar de novo não a muda)
create function app.vendas_recado_marcar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lido boolean := coalesce((p ->> 'lido')::boolean, true); v_n integer;
begin
  update app.recados r set lido_em = case when v_lido then coalesce(r.lido_em, now()) else null end
   where r.id = (p ->> 'id')::uuid and r.org_id = (select id from app.organizacoes where slug = p ->> 'org_slug');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'recado não encontrado' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true, 'lido', v_lido);
end $$;

-- a retenção (rotina diária): 60 dias depois de criado, lido ou não; o mínimo aceito é 30
create function app.rotinas_recados(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dias integer := coalesce((p ->> 'dias')::integer, 60); v_n integer;
begin
  if v_dias < 30 then raise exception 'retenção mínima de 30 dias' using errcode = '22023'; end if;
  delete from app.recados where criado_em < now() - make_interval(days => v_dias);
  get diagnostics v_n = row_count;
  return jsonb_build_object('apagados', v_n, 'dias', v_dias);
end $$;

do $$
declare f text;
begin
  foreach f in array array['vendas_recado_criar', 'vendas_recados_listar', 'vendas_recado_marcar', 'rotinas_recados'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
