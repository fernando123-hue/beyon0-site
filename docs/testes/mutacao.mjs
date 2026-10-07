/* Teste de mutação da fundação: sabota as migrations de propósito e confere que os testes de banco FALHAM.
   Um teste que nunca fica vermelho não prova nada.   node docs/testes/mutacao.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGEM = path.join(RAIZ, 'supabase', 'migrations');
const SABOTAGENS = [
  { nome: 'RLS de leitura aberta para todos', arquivo: '20261006120500_app_rls.sql',
    de: "for select to authenticated using (org_id in (select privado.minhas_orgs()))', t || '_ler'", para: "for select to authenticated using (true)', t || '_ler'" },
  /* (as três camadas abertas: só a concessão da tabela não basta, o anon nem tem USAGE no esquema app) */
  { nome: 'anon com leitura nos clientes', arquivo: '20261006120500_app_rls.sql', acrescentar: '\ngrant usage on schema app to anon;\ngrant select on app.clientes to anon;\ncreate policy anon_ve on app.clientes for select to anon using (true);\n' },
  { nome: 'chave estrangeira simples (sem org_id) no projeto', arquivo: '20261006120300_app_comercial.sql',
    de: 'foreign key (org_id, cliente_id) references app.clientes (org_id, id),\n  foreign key (org_id, lead_id) references app.leads', para: 'foreign key (cliente_id) references app.clientes (id),\n  foreign key (org_id, lead_id) references app.leads' },
  { nome: 'membro pode apagar', arquivo: '20261006120500_app_rls.sql',
    de: "using (org_id in (select privado.minhas_orgs(array[''dono'', ''admin''])))', t || '_apagar'", para: "using (org_id in (select privado.minhas_orgs()))', t || '_apagar'" },
  { nome: 'função nova sem revogar o EXECUTE de PUBLIC', arquivo: '20261006120500_app_rls.sql',
    acrescentar: '\ncreate function privado.esquecida() returns int language sql as $$ select 1 $$;\n' },
  { nome: 'auditoria copiando todos os valores', arquivo: '20261006120400_app_auditoria.sql', de: 'where k = any (seguros);', para: 'where true;' }
];

let pegas = 0;
for (const s of SABOTAGENS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bz-mutacao-'));
  for (const f of fs.readdirSync(ORIGEM)) fs.copyFileSync(path.join(ORIGEM, f), path.join(dir, f));
  const alvo = path.join(dir, s.arquivo);
  let sql = fs.readFileSync(alvo, 'utf8');
  if (s.acrescentar) sql += s.acrescentar;
  else { if (!sql.includes(s.de)) { console.log('SABOTAGEM NÃO APLICADA (texto mudou):', s.nome); process.exitCode = 1; continue; } sql = sql.replace(s.de, s.para); }
  fs.writeFileSync(alvo, sql);
  const r = spawnSync(process.execPath, ['--test', path.join(RAIZ, 'docs/testes/banco.test.mjs')], { env: { ...process.env, BZ_MIGRATIONS: dir }, encoding: 'utf8' });
  const falhas = (r.stdout.match(/^✖ .+$/gm) || []).filter(l => !/failing tests/.test(l));
  const pegou = r.status !== 0;
  if (pegou) pegas++;
  console.log((pegou ? 'PEGOU ' : 'ESCAPOU') + '  ' + s.nome + (pegou ? '  ← ' + [...new Set(falhas)].slice(0, 2).join(' | ').replace(/\s*\(\d+(\.\d+)?ms\)/g, '') : ''));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(pegas + ' de ' + SABOTAGENS.length + ' sabotagens pegas pelos testes');
if (pegas < SABOTAGENS.length) process.exitCode = 1;
