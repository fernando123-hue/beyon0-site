-- ==========================================================================
-- 1/6 — ESQUEMAS (docs/fundacao/01-ARQUITETURA.md §1)
-- app       o negócio, multi-organização, sempre com RLS
-- metricas  analytics anônimo do site, só o backend (chave secreta)
-- privado   funções de segurança e gatilhos; nunca exposto pela API
-- O public fica vazio de propósito: é o esquema que o Supabase expõe e onde
-- dá concessões automáticas para anon e authenticated.
-- ==========================================================================

create schema if not exists app;
create schema if not exists metricas;
create schema if not exists privado;

-- ninguém herda nada por padrão; cada concessão abaixo é explícita
revoke all on schema app, metricas, privado from public;
revoke all on schema app, metricas, privado from anon, authenticated;

grant usage on schema app to authenticated, service_role;
grant usage on schema metricas to service_role;
-- (as políticas de RLS chamam funções de privado como o próprio usuário: precisa de USAGE, não de acesso pela API)
grant usage on schema privado to authenticated, service_role;

-- FUNÇÕES: o Postgres dá EXECUTE a PUBLIC em toda função nova, e um ALTER DEFAULT PRIVILEGES ... IN SCHEMA não
-- consegue revogar isso. Por isso cada função destas migrations tem o seu "revoke ... from public" explícito, e o
-- teste "nenhuma função executável por PUBLIC" (docs/testes/banco.test.mjs) falha se alguma nova esquecer.
