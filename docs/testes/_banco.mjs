/* ==========================================================================
   Banco de teste: Postgres de verdade (PGlite, Postgres em WebAssembly, só
   desenvolvimento) com uma camada que imita o Supabase, e as migrations
   REAIS de supabase/migrations por cima, na ordem.

   A camada imita exatamente o que o RLS usa no Supabase:
   - os papéis anon, authenticated e service_role (este com BYPASSRLS);
   - auth.users e auth.uid(), que lê o "sub" de request.jwt.claims, como o
     PostgREST faz a cada requisição.
   O usuário que roda as migrations é o dono das tabelas, como o postgres do
   Supabase.
   ========================================================================== */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/* (BZ_MIGRATIONS: só para o teste de mutação, que roda os testes contra migrations sabotadas de propósito) */
const MIGRATIONS = process.env.BZ_MIGRATIONS || path.join(RAIZ, 'supabase', 'migrations');

const SUPABASE_FALSO = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create schema storage;
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
    metadata jsonb not null default '{}', created_at timestamptz not null default now(), unique (bucket_id, name)
  );
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export function arquivosDeMigration() {
  return fs.readdirSync(MIGRATIONS).filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
}

export async function novoBanco() {
  const db = new PGlite();
  await db.exec(SUPABASE_FALSO);
  for (const f of arquivosDeMigration()) {
    try { await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')); }
    catch (e) { throw new Error('migration ' + f + ' falhou: ' + e.message); }
  }
  return db;
}

/* roda `fn(q)` numa transação como um papel: 'anon', 'service_role' ou um usuário (uuid) como authenticated.
   Sai desfazendo (rollback) quando `manter` é falso, para cada teste não sujar o próximo. */
export async function como(db, quem, fn, { manter = true } = {}) {
  return db.transaction(async tx => {
    const papel = quem === 'anon' || quem === 'service_role' ? quem : 'authenticated';
    await tx.exec('set local role ' + papel);
    if (papel === 'authenticated') await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: quem, role: 'authenticated' })]);
    const q = (sql, params) => tx.query(sql, params);
    const r = await fn(q);
    if (!manter) await tx.rollback();
    return r;
  });
}

/* o pedido CONFIRMADO de uma conversa, como o dono deixa no painel (PR 2a): sem ele, vendas_iniciar_geracao não gera
   (revisão final, B4). Para os testes de banco que montam o caminho até as direções à mão */
export function pedidoConfirmado(db, conversaId) {
  return db.query(`insert into app.pedidos (org_id, conversa_id, codigo, status, confirmado_em, expira_em)
    select org_id, id, privado.novo_codigo_pedido(), 'confirmado', now(), now() + interval '72 hours' from app.conversas where id = $1`, [conversaId]);
}

/* o erro do Postgres (código SQLSTATE e mensagem) de uma operação que deve falhar */
export async function erroDe(promessa) {
  try { await promessa; } catch (e) { return { codigo: e.code, msg: e.message }; }
  return null;
}

/* dentro de uma transação: um erro esperado não pode abortar o resto do teste (savepoint) */
export async function erroNaTx(tx, sql, params) {
  await tx.exec('savepoint esperado');
  try { await tx.query(sql, params); await tx.exec('release savepoint esperado'); return null; }
  catch (e) { await tx.exec('rollback to savepoint esperado'); return { codigo: e.code, msg: e.message }; }
}
