-- ==========================================================================
-- FASE 2 — 1/3: AS TABELAS DO AGENTE DE VENDAS (docs/fase2/01-ARQUITETURA.md)
-- Visitante → conversa → briefing → estimativa → 3 direções → escolha →
-- alterações → escopo final (app.propostas) → pagamento → projeto.
-- Mesmo molde da Fase 1: org_id em tudo, UNIQUE (org_id, id), chaves
-- compostas, autoria e datas por gatilho, auditoria sem dado pessoal.
-- O VISITANTE é um usuário anônimo do Supabase Auth (auth.users), criado pelo
-- backend; ele só LÊ o que é dele (RLS em …_vendas_rls.sql). Toda escrita do
-- fluxo passa pelas funções de …_vendas_funcoes.sql, chamadas pelo backend.
-- ==========================================================================

-- ---------- regras comerciais (o motor de preço lê; o modelo de IA nunca cria) ----------
create table app.regras_comerciais (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  versao       integer not null check (versao between 1 and 9999),
  status       text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'arquivada')),
  regras       jsonb not null check (jsonb_typeof(regras) = 'object' and pg_column_size(regras) <= 262144),
  fontes       text check (char_length(fontes) <= 8000),   -- de onde vieram os valores (pesquisa, decisão do dono)
  aprovada_em  timestamptz,
  aprovada_por uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  unique (org_id, versao),
  check (status <> 'ativa' or aprovada_em is not null)    -- ativa só com aprovação registrada
);
-- uma tabela ativa por organização
create unique index regras_uma_ativa on app.regras_comerciais (org_id) where status = 'ativa';

-- uma versão aprovada não muda: para mudar preço, nova versão (a estimativa antiga continua explicável)
create function privado.regras_imutaveis() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'rascunho' and new.regras is distinct from old.regras then
    raise exception 'regras aprovadas não mudam: crie uma nova versão' using errcode = '23514';
  end if;
  if old.status = 'arquivada' and new.status <> 'arquivada' then
    raise exception 'versão arquivada não volta' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger regras_imutaveis before update on app.regras_comerciais
  for each row execute function privado.regras_imutaveis();

-- ---------- conversas (uma por visitante e por sessão de descoberta) ----------
create table app.conversas (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references app.organizacoes (id) on delete cascade,
  visitante_id       uuid not null references auth.users (id) on delete cascade,
  lead_id            uuid,
  etapa              text not null default 'descoberta' check (etapa in (
                       'descoberta', 'estimativa', 'contato', 'gerando', 'direcoes', 'escolhida',
                       'alteracoes', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada')),
  briefing           jsonb not null default '{}' check (jsonb_typeof(briefing) = 'object' and pg_column_size(briefing) <= 65536),
  confianca          numeric(3, 2) not null default 0 check (confianca between 0 and 1),
  origem_meio        text check (origem_meio ~ '^[a-z0-9-]{1,30}$'),
  origem_fonte       text check (char_length(origem_fonte) <= 80),
  campanha           text check (char_length(campanha) <= 80),
  termo              text check (char_length(termo) <= 80),
  codigo_visita      text check (codigo_visita ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),
  turnos             integer not null default 0 check (turnos between 0 and 400),
  custo_ia_usd       numeric(10, 4) not null default 0 check (custo_ia_usd >= 0),
  ia_ate             timestamptz,   -- uma chamada de IA por vez por conversa (trava com prazo: app.vendas_reservar_ia)
  contato_aceite_em  timestamptz,   -- quando a pessoa concordou com o uso dos dados (LGPD: prova do consentimento)
  ultima_atividade   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  updated_by         uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  foreign key (org_id, lead_id) references app.leads (org_id, id) on delete set null (lead_id)
);
create index conversas_visitante on app.conversas (visitante_id, ultima_atividade desc);
create index conversas_org_etapa on app.conversas (org_id, etapa, ultima_atividade desc);
create index conversas_lead on app.conversas (org_id, lead_id) where lead_id is not null;

-- ---------- mensagens (só o que a pessoa escreveu no site e o que o agente respondeu) ----------
create table app.mensagens (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id  uuid not null,
  papel        text not null check (papel in ('visitante', 'agente')),
  conteudo     text not null check (char_length(conteudo) between 1 and 8000),
  created_at   timestamptz not null default now(),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade
);
create index mensagens_conversa on app.mensagens (conversa_id, created_at);

-- ---------- estimativas (o código calcula; a linha guarda a versão das regras usada) ----------
create table app.estimativas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id  uuid not null,
  regras_id    uuid not null,
  fatores      jsonb not null check (jsonb_typeof(fatores) = 'object' and pg_column_size(fatores) <= 16384),
  valor_total  numeric(12, 2) not null check (valor_total >= 0),
  sinal        numeric(12, 2) not null check (sinal >= 0),
  prazo_dias   integer not null check (prazo_dias between 1 and 60),
  fase         text not null default 'unica' check (fase in ('unica', 'fase1')),
  detalhes     jsonb not null default '{}' check (jsonb_typeof(detalhes) = 'object' and pg_column_size(detalhes) <= 16384),
  created_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade,
  foreign key (org_id, regras_id) references app.regras_comerciais (org_id, id),
  check (sinal <= valor_total)
);
create index estimativas_conversa on app.estimativas (conversa_id, created_at desc);

-- ---------- as 3 direções de site (estrutura validada, nunca HTML do modelo) ----------
create table app.direcoes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id  uuid not null,
  geracao      integer not null default 1 check (geracao between 1 and 20),
  numero       integer not null check (numero between 1 and 3),
  estrategia   text not null check (estrategia in ('conversao', 'autoridade', 'experiencia')),
  status       text not null default 'gerando' check (status in ('gerando', 'pronta', 'falhou')),
  conteudo     jsonb check (conteudo is null or (jsonb_typeof(conteudo) = 'object' and pg_column_size(conteudo) <= 262144)),
  modelo       text check (char_length(modelo) <= 60),
  erro         text check (char_length(erro) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  unique (conversa_id, geracao, numero),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade,
  check (status <> 'pronta' or conteudo is not null)
);

-- ---------- a escolha (histórico: quem, qual, quando, de qual geração) ----------
create table app.escolhas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id   uuid not null,
  direcao_id    uuid not null,
  visitante_id  uuid not null references auth.users (id) on delete cascade,
  lead_id       uuid,
  geracao       integer not null,
  created_at    timestamptz not null default now(),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade,
  foreign key (org_id, direcao_id) references app.direcoes (org_id, id) on delete cascade,
  foreign key (org_id, lead_id) references app.leads (org_id, id) on delete set null (lead_id)
);
create index escolhas_conversa on app.escolhas (conversa_id, created_at desc);

-- ---------- alterações pedidas (o texto da pessoa e as mudanças estruturadas) ----------
create table app.alteracoes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id  uuid not null,
  direcao_id   uuid not null,
  pedido       text not null check (char_length(pedido) between 1 and 2000),
  mudancas     jsonb not null default '[]' check (jsonb_typeof(mudancas) = 'array' and pg_column_size(mudancas) <= 32768),
  status       text not null default 'interpretada' check (status in ('interpretada', 'aplicada', 'recusada')),
  -- a direção com as mudanças aplicadas (o código aplica; o modelo só descreve as mudanças)
  resultado    jsonb check (resultado is null or (jsonb_typeof(resultado) = 'object' and pg_column_size(resultado) <= 262144)),
  created_at   timestamptz not null default now(),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade,
  foreign key (org_id, direcao_id) references app.direcoes (org_id, id) on delete cascade,
  check (status <> 'aplicada' or resultado is not null)
);
create index alteracoes_conversa on app.alteracoes (conversa_id, created_at);

-- ---------- o escopo final é a PROPOSTA da Fase 1 (versionada e imutável depois de enviada) ----------
alter table app.propostas
  add column conversa_id         uuid,
  add column direcao_id          uuid,
  add column sinal_percentual    integer check (sinal_percentual between 0 and 100),
  add column prazo_dias          integer check (prazo_dias between 1 and 60),
  add column inicio_imediato_em  timestamptz,   -- concordância expressa para começar dentro dos 7 dias (CDC, art. 49)
  add foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete set null (conversa_id),
  add foreign key (org_id, direcao_id) references app.direcoes (org_id, id) on delete set null (direcao_id);
create index propostas_conversa on app.propostas (org_id, conversa_id) where conversa_id is not null;

-- a proposta aceita ganha o projeto UMA vez (criado no pagamento): o projeto_id pode sair do nulo, nunca trocar
create or replace function privado.proposta_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'rascunho' and (
       (new.titulo, new.escopo, new.valor_total, new.moeda, new.validade, new.versao, new.sinal_percentual, new.prazo_dias)
         is distinct from (old.titulo, old.escopo, old.valor_total, old.moeda, old.validade, old.versao, old.sinal_percentual, old.prazo_dias)
       or (new.lead_id is distinct from old.lead_id and new.lead_id is not null)
       or (old.projeto_id is not null and new.projeto_id is distinct from old.projeto_id)
       or (old.enviada_em is not null and new.enviada_em is distinct from old.enviada_em)
       or (old.respondida_em is not null and new.respondida_em is distinct from old.respondida_em)
       or (old.inicio_imediato_em is not null and new.inicio_imediato_em is distinct from old.inicio_imediato_em)) then
    raise exception 'proposta enviada não muda: crie uma nova versão' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'rascunho' and new.status = 'enviada') or
       (old.status = 'enviada' and new.status in ('aceita', 'recusada', 'expirada', 'substituida'))) then
    raise exception 'mudança de situação inválida: % para %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------- pagamentos (o gateway confirma; o navegador nunca) ----------
create table app.pagamentos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references app.organizacoes (id) on delete cascade,
  proposta_id   uuid not null,
  parcela       text not null check (parcela in ('sinal', 'saldo')),
  valor         numeric(12, 2) not null check (valor > 0),
  moeda         text not null default 'BRL' check (moeda ~ '^[A-Z]{3}$'),
  status        text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado', 'expirado', 'estornado')),
  gateway       text not null check (gateway ~ '^[a-z0-9_]{2,30}$'),
  gateway_ref   text check (char_length(gateway_ref) between 1 and 120),
  link          text check (char_length(link) <= 500 and (link ~ '^https://' or link ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{2,5})?/')),   -- (http só o servidor local de desenvolvimento)
  pago_em       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  unique (org_id, id),
  unique (gateway, gateway_ref),
  foreign key (org_id, proposta_id) references app.propostas (org_id, id),
  check (status <> 'pago' or pago_em is not null)
);
-- uma cobrança viva por parcela
create unique index pagamentos_parcela_viva on app.pagamentos (proposta_id, parcela) where status in ('pendente', 'pago');

-- a situação só anda para a frente: pendente → pago | cancelado | expirado; pago → estornado
create function privado.pagamento_transicao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'pendente' and new.status in ('pago', 'cancelado', 'expirado')) or
       (old.status = 'pago' and new.status = 'estornado')) then
    raise exception 'pagamento: % para % não é permitido', old.status, new.status using errcode = '23514';
  end if;
  if (new.valor, new.proposta_id, new.parcela, new.gateway) is distinct from (old.valor, old.proposta_id, old.parcela, old.gateway) then
    raise exception 'pagamento: valor, proposta, parcela e gateway não mudam' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger pagamento_transicao before update on app.pagamentos
  for each row execute function privado.pagamento_transicao();

-- ---------- eventos do gateway: o MESMO evento duas vezes é processado uma vez ----------
create table app.eventos_pagamento (
  id            uuid primary key default gen_random_uuid(),
  gateway       text not null check (gateway ~ '^[a-z0-9_]{2,30}$'),
  evento_id     text not null check (char_length(evento_id) between 1 and 200),
  tipo          text not null check (char_length(tipo) between 1 and 80),
  pagamento_id  uuid references app.pagamentos (id) on delete set null,
  resultado     text check (char_length(resultado) <= 300),
  recebido_em   timestamptz not null default now(),
  unique (gateway, evento_id)
);

-- ---------- o funil (métricas do agente, sem o conteúdo das mensagens) ----------
create table app.eventos_funil (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id  uuid not null,
  tipo         text not null check (tipo in (
                 'conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado',
                 'direcoes_solicitadas', 'direcoes_prontas', 'direcoes_falharam', 'direcao_escolhida',
                 'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado',
                 'pagamento_confirmado', 'ia_falhou', 'tentativa_bloqueada')),
  dados        jsonb not null default '{}' check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 2048),
  created_at   timestamptz not null default now(),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade
);
create index eventos_funil_org on app.eventos_funil (org_id, tipo, created_at desc);

-- ---------- gatilhos comuns ----------
do $$
declare t text;
begin
  foreach t in array array['regras_comerciais', 'conversas', 'direcoes', 'pagamentos'] loop
    execute format('create trigger carimbar before insert or update on app.%I for each row execute function privado.carimbar()', t);
    execute format('create trigger org_imutavel before update on app.%I for each row execute function privado.org_imutavel()', t);
  end loop;
end $$;

-- auditoria: o que muda de dinheiro e de situação (sem conteúdo de conversa)
create trigger auditar after insert or update or delete on app.regras_comerciais
  for each row execute function privado.auditar('versao', 'status', 'aprovada_em');
create trigger auditar after insert or update or delete on app.pagamentos
  for each row execute function privado.auditar('proposta_id', 'parcela', 'valor', 'moeda', 'status', 'gateway', 'pago_em');
create trigger auditar after insert or update or delete on app.conversas
  for each row execute function privado.auditar('etapa', 'lead_id', 'origem_meio', 'origem_fonte', 'campanha');

revoke all on function privado.regras_imutaveis() from public, anon, authenticated;
revoke all on function privado.pagamento_transicao() from public, anon, authenticated;
