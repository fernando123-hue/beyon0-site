/* A TRAVA ANTI-PUBLICAÇÃO (scripts/processo/anti-publicacao.mjs): o que, escrito no repositório, publicaria produção
   da Cloudflare sem o dono (plano da migração, § 5.3/§ 5.5, tarefa B8). Varredura de texto: pega erro e instrução
   óbvia. Os termos proibidos são montados por partes para este arquivo não precisar de exceção.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { conferirAntiPublicacao } from '../../scripts/processo/anti-publicacao.mjs';

const W = 'wrang' + 'ler';
const PRODUCAO = 'pro' + 'ducao';
const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

/* monta uma pasta temporária com os arquivos dados e devolve os achados */
function achados(arquivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-pub-'));
  for (const [nome, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, nome)), { recursive: true });
    fs.writeFileSync(path.join(raiz, nome), texto);
  }
  return conferirAntiPublicacao(raiz, Object.keys(arquivos));
}
const pegou = (arquivos, nome) => achados(arquivos).some(a => a.startsWith(nome + ':'));

test('workflow com contents: write ou permissions: write-all é achado; só leitura passa', () => {
  assert.ok(pegou({ '.github/workflows/x.yml': 'permissions:\n  contents: write\n' }, '.github/workflows/x.yml'));
  assert.ok(pegou({ '.github/workflows/x.yaml': 'permissions: write-all\n' }, '.github/workflows/x.yaml'));
  assert.deepEqual(achados({ '.github/workflows/x.yml': 'permissions:\n  contents: read\n' }), []);
});
test('comandos que publicam, mexem em versão ou segredo: achado em qualquer arquivo versionado', () => {
  const ruins = [`npx ${W} deploy`, `${W} deploy --env previa`, `${W} versions deploy`, `${W} versions upload`, `${W} rollback`,
    `${W} secret put X`, `${W} secret bulk f.json`, `${W} triggers deploy`, `git push origin main:${PRODUCAO}`, `ref: refs/heads/${PRODUCAO}`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.sh': 'echo ok\n' + r + '\n' }, 'scripts/x.sh'), r);
});
test('o que não publica passa: deploy --dry-run, dev, types, check startup, a palavra solta', () => {
  const bons = [`npx ${W} deploy --dry-run --outdir x`, `npx ${W} deploy --env previa --dry-run`, `${W} dev --local`, `${W} types`,
    `${W} check startup`, 'um rollback do banco', 'a branch de ' + PRODUCAO + ' do dono'];
  for (const b of bons) assert.deepEqual(achados({ 'scripts/x.sh': b + '\n' }), [], b);
});
test('package.json com preinstall, install, postinstall ou prepare é achado; sem eles passa', () => {
  for (const s of ['preinstall', 'install', 'postinstall', 'prepare'])
    assert.ok(pegou({ 'package.json': JSON.stringify({ scripts: { [s]: 'node x.js' } }) }, 'package.json'), s);
  assert.deepEqual(achados({ 'package.json': JSON.stringify({ scripts: { testar: 'node --test' } }) }), []);
});
test('wrangler.jsonc com "build" é achado (o Builds não o honra e ele rodaria código no deploy); sem ele passa', () => {
  assert.ok(pegou({ 'wrangler.jsonc': '{ "build": { "command": "x" } }' }, 'wrangler.jsonc'));
  assert.deepEqual(achados({ 'wrangler.jsonc': '{ // "build": só comentário\n "name": "a", "vars": { "texto": "// \\"build\\": { fica" } }' }), []);
});
test('exceções: só os três .md, um a um; um .mjs ou .yml na pasta dos planos é achado', () => {
  const texto = `use ${W} deploy e main:${PRODUCAO}\n`;
  for (const ok of ['docs/superpowers/plans/2026-10-21-migracao-cloudflare.md', 'docs/PROCESSO.md', 'CLAUDE.md'])
    assert.deepEqual(achados({ [ok]: texto }), [], ok);
  for (const ruim of ['docs/superpowers/plans/x.mjs', 'docs/superpowers/plans/x.yml', 'docs/superpowers/plans/outro.md', 'docs/outro.md', 'README.md'])
    assert.ok(pegou({ [ruim]: texto }, ruim), ruim);
});
test('o repositório real passa limpo (git ls-files)', () => {
  const arquivos = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.deepEqual(conferirAntiPublicacao(RAIZ, arquivos), []);
});

/* ---- os níveis (scripts/processo/niveis.json): deploy e cabeçalhos da Cloudflare são nível 3 ---- */
import { nivelDoArquivo } from '../../scripts/processo/nivel-de-risco.mjs';
test('níveis: wrangler.jsonc, _headers, cloudflare/ e a trava anti-publicação são nível 3', () => {
  for (const a of ['wrangler.jsonc', '_headers', 'cloudflare/rotas.mjs', 'cloudflare/worker.mjs', 'cloudflare/montar-publico.mjs', 'scripts/processo/anti-publicacao.mjs'])
    assert.equal(nivelDoArquivo(a).nivel, 3, a);
  assert.equal(nivelDoArquivo('wrangler.jsonc').motivo, 'deploy e cabeçalhos da Cloudflare');
  assert.equal(nivelDoArquivo('docs/testes/worker.test.mjs').nivel, 2, 'testes continuam nível 2');
});
