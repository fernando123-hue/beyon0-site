-- ==========================================================================
-- 4/6 — O NEGÓCIO: clientes, leads, projetos, briefings, propostas, revisões
-- (docs/fundacao/01-ARQUITETURA.md §2–§3).
-- Toda tabela tem org_id e UNIQUE (org_id, id); as chaves estrangeiras entre
-- elas são COMPOSTAS (org_id, x_id): um registro nunca aponta para o de outra
-- organização, mesmo com o ID certo enviado de propósito.
-- Contato: e-mail minúsculo; telefone no formato E.164 (+5521977167944),
-- normalizado pela API antes de chegar aqui.
-- ==========================================================================

-- ---------- clientes ----------
create table app.clientes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references app.organizacoes (id) on delete cascade,
  nome          text not null check (char_length(btrim(nome)) between 1 and 160),
  tipo          text not null default 'empresa' check (tipo in ('pessoa', 'empresa', 'entidade')),
  contato_nome  text check (char_length(contato_nome) <= 120),
  email         text check (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone      text check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  cidade        text check (char_length(cidade) <= 80),
  uf            text check (uf ~ '^[A-Z]{2}$'),
  observacoes   text check (char_length(observacoes) <= 4000),
  arquivado_em  timestamptz,   -- tira da lista sem perder o histórico dos projetos (não é soft delete)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  unique (org_id, id)
);
create index clientes_org on app.clientes (org_id, created_at desc);

-- ---------- leads ----------
create table app.leads (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references app.organizacoes (id) on delete cascade,
  nome           text check (char_length(btrim(nome)) between 1 and 160),
  empresa        text check (char_length(empresa) <= 160),
  email          text check (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefone       text check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  interesse      text not null default 'site' check (interesse in ('site', 'automacao', 'outro')),
  status         text not null default 'novo' check (status in ('novo', 'em_conversa', 'proposta', 'ganho', 'perdido', 'descartado')),
  motivo_perda   text check (char_length(motivo_perda) <= 500),
  -- a origem, no mesmo vocabulário das métricas próprias (metricas.paginas.meio)
  origem_meio    text check (origem_meio in ('anuncio', 'busca', 'social', 'mensagem', 'email', 'referencia', 'direto', 'indicacao', 'prospeccao', 'outro')),
  origem_fonte   text check (char_length(origem_fonte) <= 80),
  campanha       text check (char_length(campanha) <= 80),
  termo          text check (char_length(termo) <= 80),
  -- o código da visita que veio na mensagem do WhatsApp (metricas.contatos.codigo). Referência solta, sem chave
  -- estrangeira: as métricas são apagadas em ~13 meses e o lead continua
  codigo_visita  text check (codigo_visita ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),
  cliente_id     uuid,
  observacoes    text check (char_length(observacoes) <= 4000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  -- cliente que um lead "ganhou" não se apaga enquanto o lead existir (arquive o cliente, ou apague o lead antes)
  -- (NO ACTION, o padrão, e não RESTRICT: confere no FIM do comando, então apagar a organização inteira em cascata passa)
  foreign key (org_id, cliente_id) references app.clientes (org_id, id),
  -- um lead tem por onde ser encontrado
  check (num_nonnulls(nome, email, telefone, codigo_visita) >= 1),
  -- "ganho" só com o cliente que ele virou
  check (status <> 'ganho' or cliente_id is not null)
);
create unique index leads_codigo_visita on app.leads (org_id, codigo_visita) where codigo_visita is not null;
create index leads_org_status on app.leads (org_id, status, created_at desc);
create index leads_org_data on app.leads (org_id, created_at desc);
create index leads_cliente on app.leads (org_id, cliente_id) where cliente_id is not null;

-- ---------- projetos ----------
create table app.projetos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references app.organizacoes (id) on delete cascade,
  cliente_id     uuid not null,
  lead_id        uuid,
  nome           text not null check (char_length(btrim(nome)) between 1 and 160),
  tipo           text not null check (tipo in ('site_institucional', 'landing_page', 'site_sob_medida', 'automacao', 'outro')),
  status         text not null default 'briefing' check (status in ('briefing', 'proposta', 'em_producao', 'em_revisao', 'entregue', 'pausado', 'cancelado')),
  dominio        text check (char_length(dominio) <= 253 and dominio ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
  inicio_em      date,
  previsto_para  date,
  entregue_em    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  -- cliente com projeto não é apagado (arquive); lead apagado só solta a referência
  -- (NO ACTION: conferido no fim do comando; a cascata da organização passa, apagar só o cliente não)
  foreign key (org_id, cliente_id) references app.clientes (org_id, id),
  foreign key (org_id, lead_id) references app.leads (org_id, id) on delete set null (lead_id),
  check (previsto_para is null or inicio_em is null or previsto_para >= inicio_em),
  check (status <> 'entregue' or entregue_em is not null)
);
create index projetos_org_status on app.projetos (org_id, status);
create index projetos_cliente on app.projetos (org_id, cliente_id);
create index projetos_lead on app.projetos (org_id, lead_id) where lead_id is not null;

-- ---------- briefings (a coleta estruturada) ----------
create table app.briefings (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references app.organizacoes (id) on delete cascade,
  lead_id            uuid,
  projeto_id         uuid,
  versao_formulario  text not null default 'site-v1' check (versao_formulario ~ '^[a-z0-9-]{1,40}$'),
  respostas          jsonb not null default '{}' check (jsonb_typeof(respostas) = 'object' and pg_column_size(respostas) <= 65536),
  status             text not null default 'rascunho' check (status in ('rascunho', 'completo')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  foreign key (org_id, lead_id) references app.leads (org_id, id) on delete set null (lead_id),
  foreign key (org_id, projeto_id) references app.projetos (org_id, id) on delete cascade,
  check (num_nonnulls(lead_id, projeto_id) >= 1)
);
create index briefings_lead on app.briefings (org_id, lead_id) where lead_id is not null;
create index briefings_projeto on app.briefings (org_id, projeto_id) where projeto_id is not null;

-- ---------- propostas ----------
create table app.propostas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references app.organizacoes (id) on delete cascade,
  lead_id        uuid,
  projeto_id     uuid,
  versao         integer not null default 1 check (versao between 1 and 999),
  titulo         text not null check (char_length(btrim(titulo)) between 1 and 160),
  escopo         text not null check (char_length(btrim(escopo)) between 1 and 20000),
  valor_total    numeric(12, 2) not null check (valor_total >= 0),
  moeda          text not null default 'BRL' check (moeda ~ '^[A-Z]{3}$'),
  validade       date,
  status         text not null default 'rascunho' check (status in ('rascunho', 'enviada', 'aceita', 'recusada', 'expirada', 'substituida')),
  enviada_em     timestamptz,
  respondida_em  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  foreign key (org_id, lead_id) references app.leads (org_id, id) on delete set null (lead_id),
  foreign key (org_id, projeto_id) references app.projetos (org_id, id) on delete cascade,
  check (num_nonnulls(lead_id, projeto_id) >= 1),
  check (status = 'rascunho' or enviada_em is not null),
  check (status not in ('aceita', 'recusada') or respondida_em is not null)
);
-- uma versão por projeto (ou por lead, antes de existir projeto)
create unique index propostas_versao_projeto on app.propostas (org_id, projeto_id, versao) where projeto_id is not null;
create unique index propostas_versao_lead on app.propostas (org_id, lead_id, versao) where projeto_id is null and lead_id is not null;
create index propostas_lead on app.propostas (org_id, lead_id) where lead_id is not null;

-- o que o cliente recebeu não muda em silêncio: depois de enviada, o conteúdo é
-- imutável (mudar = nova versão) e a situação só anda para a frente
create function privado.proposta_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'rascunho' and (
       (new.titulo, new.escopo, new.valor_total, new.moeda, new.validade, new.versao, new.projeto_id)
         is distinct from (old.titulo, old.escopo, old.valor_total, old.moeda, old.validade, old.versao, old.projeto_id)
       -- o lead só pode SAIR (o lead foi apagado e a proposta fica com o projeto): nunca trocar por outro
       or (new.lead_id is distinct from old.lead_id and new.lead_id is not null)
       -- as datas de envio e de resposta, uma vez gravadas, são o histórico: não voltam no tempo
       or (old.enviada_em is not null and new.enviada_em is distinct from old.enviada_em)
       or (old.respondida_em is not null and new.respondida_em is distinct from old.respondida_em)) then
    raise exception 'proposta enviada não muda: crie uma nova versão' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'rascunho' and new.status = 'enviada') or
       (old.status = 'enviada' and new.status in ('aceita', 'recusada', 'expirada', 'substituida'))) then
    raise exception 'mudança de situação inválida: % para %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
create trigger proposta_imutavel before update on app.propostas
  for each row execute function privado.proposta_imutavel();

-- proposta nasce rascunho: "aceita" só depois de passar por "enviada" (o sistema e a restauração podem gravar o histórico)
create function privado.proposta_nasce_rascunho() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'rascunho' and auth.uid() is not null then
    raise exception 'proposta nova começa como rascunho' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger proposta_nasce_rascunho before insert on app.propostas
  for each row execute function privado.proposta_nasce_rascunho();

-- ---------- revisões (pedidos de alteração) ----------
create table app.revisoes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references app.organizacoes (id) on delete cascade,
  projeto_id    uuid not null,
  descricao     text not null check (char_length(btrim(descricao)) between 1 and 4000),
  origem        text not null default 'cliente' check (origem in ('cliente', 'interna')),
  status        text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'concluida', 'recusada')),
  concluida_em  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  foreign key (org_id, projeto_id) references app.projetos (org_id, id) on delete cascade,
  check (status not in ('concluida', 'recusada') or concluida_em is not null)
);
create index revisoes_projeto on app.revisoes (org_id, projeto_id, status);

-- ---------- apagar um lead leva o que só existia por ele ----------
-- (briefing e proposta ligados SÓ ao lead; os que também têm projeto ficam, só soltam o lead_id)
create function privado.lead_leva_os_seus() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from app.briefings b where b.org_id = old.org_id and b.lead_id = old.id and b.projeto_id is null;
  delete from app.propostas p where p.org_id = old.org_id and p.lead_id = old.id and p.projeto_id is null;
  return old;
end $$;
create trigger lead_leva_os_seus before delete on app.leads
  for each row execute function privado.lead_leva_os_seus();

-- ---------- autoria, datas e tenant imutável em todas ----------
do $$
declare t text;
begin
  foreach t in array array['clientes', 'leads', 'projetos', 'briefings', 'propostas', 'revisoes'] loop
    execute format('create trigger carimbar before insert or update on app.%I for each row execute function privado.carimbar()', t);
    execute format('create trigger org_imutavel before update on app.%I for each row execute function privado.org_imutavel()', t);
  end loop;
end $$;

revoke all on function privado.proposta_imutavel() from public, anon, authenticated;
revoke all on function privado.proposta_nasce_rascunho() from public, anon, authenticated;
revoke all on function privado.lead_leva_os_seus() from public, anon, authenticated;
