-- ==========================================================================
-- MÉTRICAS PRÓPRIAS — as duas tabelas no Supabase (2026-10-06).
-- Rodar uma vez no SQL Editor do projeto. Ver docs/metricas/README.md.
-- RLS ligado e SEM política: ninguém lê nem escreve com a chave pública;
-- só a função da Vercel, com a chave secreta (SUPABASE_CHAVE).
-- ==========================================================================

create table if not exists public.paginas (
  id           text primary key,          -- uma página vista (aleatório, da aba)
  visita       text not null,             -- a aba inteira (some quando a aba fecha)
  codigo       text not null,             -- o código que vai na mensagem do WhatsApp
  pagina       text not null,             -- /, /sites, /automacao, /resumo
  inicio       timestamptz not null,
  entrada      boolean not null default false,   -- 1ª página da visita
  fonte        text not null default 'direto',   -- google, instagram, outro-site.com…
  meio         text not null default 'direto',   -- anuncio, busca, social, mensagem, email, referencia, direto
  campanha     text,
  termo        text,
  dispositivo  text not null,             -- celular, tablet, computador
  largura      integer,
  carga_ms     integer,                   -- maior pintura (LCP) neste aparelho
  secoes       text[] not null default '{}',
  rolagem      integer not null default 0,       -- % da página que apareceu
  ativo_s      integer not null default 0,       -- segundos com a aba à mostra
  contato      text,                      -- botão que abriu a conversa
  contato_s    integer,                   -- segundos até o clique
  form         text,                      -- abriu | enviou
  form_campo   text,                      -- último campo tocado
  ouro         boolean not null default false
);
create index if not exists paginas_inicio on public.paginas (inicio);
create index if not exists paginas_visita on public.paginas (visita);

create table if not exists public.contatos (
  codigo       text primary key,
  visita       text not null,
  pagina_id    text,
  quando       timestamptz not null,
  botao        text,
  pagina       text,
  fonte        text,
  meio         text,
  campanha     text,
  termo        text,
  dispositivo  text,
  gclid        text,                      -- só com o aceite de cookies; para importar a venda no Google Ads
  status       text not null default 'clicou' check (status in ('clicou', 'conversa', 'cliente', 'descartado')),
  valor        numeric(12, 2),
  nota         text check (char_length(nota) <= 200),
  atualizado   timestamptz
);
create index if not exists contatos_quando on public.contatos (quando);

alter table public.paginas  enable row level security;
alter table public.contatos enable row level security;
