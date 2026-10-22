/* O QUE SOBE COMO ASSET (cloudflare/montar-publico.mjs): lista de permissão, com paridade com o que a Vercel serve hoje.
   npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { montarPublico, ehPublico } from '../../cloudflare/montar-publico.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const versionados = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
/* o oráculo enquanto a Vercel existir (revisão M2): o que a Vercel serve hoje = versionado − .vercelignore − o que não é página */
const IGNORE = fs.readFileSync(path.join(RAIZ, '.vercelignore'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
/* o que a Vercel esconde por redirect (vercel.json → redirects, ex.: /.gitleaksignore, /.gitignore) também não é página */
const ESCONDIDOS = (JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8')).redirects || []).map(r => {
  const s = r.source.replace(/^\//, '');
  return s.includes(':') ? { prefixo: s.slice(0, s.indexOf(':')) } : { exato: s };   /* "/.github/:caminho*" → prefixo ".github/" */
});
const escondido = a => ESCONDIDOS.some(e => (e.exato !== undefined ? a === e.exato : e.prefixo && a.startsWith(e.prefixo)));
const NAO_PAGINA = [/^api\//, /^cloudflare\//, /^package(-lock)?\.json$/, /^vercel\.json$/, /^wrangler\.jsonc$/, /^\.env\.example$/, { test: escondido }];
const casa = (arq, p) => {
  const base = arq.split('/').pop();
  if (p.endsWith('/')) return arq.startsWith(p) || arq.includes('/' + p);
  if (p.includes('/')) return arq === p;
  if (p.includes('*')) return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(base);
  return base === p;
};
const esperado = versionados.filter(a => !IGNORE.some(p => casa(a, p)) && !NAO_PAGINA.some(r => r.test(a))).sort();

test('paridade com a Vercel: a saída == o que a Vercel serve hoje, nos dois sentidos', () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'publico-'));
  const saida = montarPublico({ raiz: RAIZ, destino, arquivos: versionados }).sort();
  assert.deepEqual(saida.filter(a => a !== '_headers'), esperado.filter(a => a !== '_headers'));
  assert.ok(saida.includes('_headers'), '_headers sobe com os assets');
  for (const a of ['painel.css', 'privacidade.css', 'resumo.css', '404.html', 'favicon.ico']) assert.ok(saida.includes(a), a);
});
test('nunca sobe: código, docs, banco, segredo, configuração', () => {
  for (const a of ['api/vendas.mjs', 'api/_freio.mjs', 'docs/PROCESSO.md', 'supabase/migrations/x.sql', 'scripts/direcoes.mjs', 'cloudflare/rotas.mjs',
    '.github/workflows/ci.yml', '.claude/x', '.superpowers/x', 'CLAUDE.md', 'package.json', 'vercel.json', 'wrangler.jsonc', '.env', '.env.local', '.dev.vars',
    'backup.sql', 'x.dump', 'x.7z', 'js/nucleo/lab.js', 'vendor/three/entrada.js', 'vendor/three/README.md', 'assets/README.txt', 'publico/x.html', 'node_modules/x.js'])
    assert.equal(ehPublico(a), false, a);
});
