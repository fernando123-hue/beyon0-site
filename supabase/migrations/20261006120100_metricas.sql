-- ==========================================================================
-- 2/6 — MÉTRICAS PRÓPRIAS DO SITE (docs/metricas/README.md)
-- Analytics anônimo: sem cookie, sem IP. Só o backend (service_role) lê e
-- escreve; anon e authenticated não têm concessão nenhuma. O RLS fica ligado
-- e sem política: se um dia alguém conceder acesso por engano, continua fechado.
-- Era docs/metricas/esquema.sql (no public); agora vive no esquema metricas.
-- ==========================================================================

create table metricas.paginas (
  id           text primary key check (id ~ '^[A-Za-z0-9-]{8,40}$'),   -- uma página vista (aleatório, da aba)
  visita       text not null check (visita ~ '^[A-Za-z0-9-]{8,40}$'),
  codigo       text not null check (codigo ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),   -- vai na mensagem do WhatsApp
  pagina       text not null check (char_length(pagina) <= 80),
  inicio       timestamptz not null,
  entrada      boolean not null default false,
  fonte        text not null default 'direto' check (char_length(fonte) <= 40),
  meio         text not null default 'direto' check (meio ~ '^[a-z0-9-]{1,30}$'),
  campanha     text check (char_length(campanha) <= 80),
  termo        text check (char_length(termo) <= 80),
  dispositivo  text not null check (dispositivo in ('celular', 'tablet', 'computador')),
  largura      integer check (largura between 0 and 8000),
  carga_ms     integer check (carga_ms between 0 and 120000),
  secoes       text[] not null default '{}' check (cardinality(secoes) <= 30),
  rolagem      integer not null default 0 check (rolagem between 0 and 100),
  ativo_s      integer not null default 0 check (ativo_s between 0 and 86400),
  contato      text check (contato ~ '^[a-z0-9-]{1,30}$'),
  contato_s    integer check (contato_s between 0 and 86400),
  form         text check (form in ('abriu', 'enviou')),
  form_campo   text check (form_campo ~ '^[a-z0-9-]{1,30}$'),
  ouro         boolean not null default false
);
create index paginas_inicio on metricas.paginas (inicio desc);
create index paginas_visita on metricas.paginas (visita);
create index paginas_codigo on metricas.paginas (codigo);

create table metricas.contatos (
  codigo       text primary key check (codigo ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{5}$'),
  visita       text not null,
  pagina_id    text,
  quando       timestamptz not null,
  botao        text check (botao ~ '^[a-z0-9-]{1,30}$'),
  pagina       text check (char_length(pagina) <= 80),
  fonte        text check (char_length(fonte) <= 40),
  meio         text check (meio ~ '^[a-z0-9-]{1,30}$'),
  campanha     text check (char_length(campanha) <= 80),
  termo        text check (char_length(termo) <= 80),
  dispositivo  text check (dispositivo in ('celular', 'tablet', 'computador')),
  gclid        text check (gclid ~ '^[A-Za-z0-9_-]{10,200}$'),   -- só com o aceite de cookies
  status       text not null default 'clicou' check (status in ('clicou', 'conversa', 'cliente', 'descartado')),
  valor        numeric(12, 2) check (valor >= 0),
  nota         text check (char_length(nota) <= 200),
  atualizado   timestamptz
);
create index contatos_quando on metricas.contatos (quando desc);

alter table metricas.paginas  enable row level security;
alter table metricas.contatos enable row level security;

revoke all on all tables in schema metricas from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema metricas to service_role;
