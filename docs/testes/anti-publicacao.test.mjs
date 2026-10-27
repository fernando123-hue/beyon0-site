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
    `${W} secret put X`, `${W} secret bulk f.json`, `${W} triggers deploy`, `${GIT} push origin main:${PRODUCAO}`, `ref: refs/heads/${PRODUCAO}`];
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
  assert.deepEqual(achados({ 'wrangler.jsonc': '{ // "build": só comentário\n "name": "a", "workers_dev": false, "preview_urls": false, "vars": { "texto": "// \\"build\\": { fica" } }' }), []);
});
test('exceções: só os três .md, um a um; um .mjs ou .yml na pasta dos planos é achado', () => {
  const texto = `use ${W} deploy e main:${PRODUCAO}\n`;
  for (const ok of ['docs/superpowers/plans/2026-10-21-migracao-cloudflare.md', 'docs/PROCESSO.md', 'CLAUDE.md'])
    assert.deepEqual(achados({ [ok]: texto }), [], ok);
  for (const ruim of ['docs/superpowers/plans/x.mjs', 'docs/superpowers/plans/x.yml', 'docs/superpowers/plans/outro.md', 'docs/outro.md', 'README.md'])
    assert.ok(pegou({ [ruim]: texto }, ruim), ruim);
});
/* ---- revisão do PR B, ALTO-2: as formas comuns de publicar que a primeira versão deixava passar ---- */
const GIT = 'gi' + 't';
const PUSH = GIT + ' pu' + 'sh';
test('Wrangler com versão no meio, opção antes do comando, --dry-run=false ou outros subcomandos que publicam: achado', () => {
  const ruins = [`npx ${W}@4.136.3 deploy`, `npx ${W}@latest deploy`, `npx ${W}@4 delete`, `npx ${W} --env previa deploy`, `npx ${W} deploy --dry-run=false`,
    `npx ${W} deploy --dry-run false`, `npx ${W} deploy --no-dry-run`, `npx ${W} delete`, `${W} delete --name x`, `npx ${W} preview`, `${W} publish`, `${W} pages deploy publico`,
    `${W}@4.136.3 versions upload --env previa`, `npx ${W} versions secret put X`, `${W} secret delete X`, `npx ${W}@4 rollback`, `npx ${W}@4 triggers deploy`,
    `npx ${W} deploy --dry-run && npx ${W} delete`, `node node_modules/${W}/bin/${W}.js deploy`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.sh': 'echo ok\n' + r + '\n' }, 'scripts/x.sh'), r);
});
test('Wrangler em lista de argumentos (spawn, execFile): achado', () => {
  const ruins = [`spawnSync('npx', ['${W}', 'deploy'])`, `spawn("npx", ["${W}","delete"])`, `execFileSync('npx', ['${W}', 'versions', 'upload'])`,
    `run(['${W}', 'secret', 'put', 'X'])`, `cp.spawn('npx',['${W}','preview'])`, `spawnSync('npx', ['${W}', 'triggers', 'deploy'])`, `spawnSync('npx', ['${W}@4.136.3', 'deploy'])`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.mjs': r + '\n' }, 'scripts/x.mjs'), r);
  assert.deepEqual(achados({ 'scripts/x.mjs': `spawnSync('npx', ['${W}', 'deploy', '--dry-run'])\nspawnSync('npx', ['${W}', 'dev', '--local'])\n` }), []);
});
test('o push com a branch de produção em qualquer posição, todas as branches ou espelho: achado; push de outra branch passa', () => {
  const ruins = [`${PUSH} origin ${PRODUCAO}`, `${PUSH} -f origin ${PRODUCAO}`, `${PUSH} origin HEAD:${PRODUCAO}`, `${PUSH} origin main:refs/heads/${PRODUCAO}`,
    `${PUSH} ${PRODUCAO}`, `${PUSH} --force-with-lease origin +${PRODUCAO}`, `${PUSH} --all`, `${PUSH} --mirror origin`, `${PUSH} origin --all`,
    `run(['${GIT}', 'push', 'origin', '${PRODUCAO}'])`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.sh': r + '\n' }, 'scripts/x.sh'), r);
  for (const b of [`${PUSH} -u origin cf-pr-b`, `${PUSH} origin main`, `${PUSH}`, `${GIT} pull origin ${PRODUCAO}`, `${GIT} log ${PRODUCAO}`])
    assert.deepEqual(achados({ 'scripts/x.sh': b + '\n' }), [], b);
});
const WF = '.github/workflows/x.yml';
const CABECALHO_WF = 'name: x\non: push\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n';
test('workflow: a action oficial do Wrangler, o token e a conta da Cloudflare, qualquer escopo de escrita ou sem permissions no topo: achado', () => {
  const ruins = {
    'a action do Wrangler': CABECALHO_WF + `      - uses: cloudflare/${W}-action@v3\n`,
    'outra action da Cloudflare': CABECALHO_WF + '      - uses: cloudflare/pages-action@v1\n',
    'CLOUDFLARE_API_TOKEN': CABECALHO_WF + '      - run: echo\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n',
    'CLOUDFLARE_ACCOUNT_ID': CABECALHO_WF + '        env:\n          CLOUDFLARE_ACCOUNT_ID: abc\n',
    'actions: write': CABECALHO_WF.replace('contents: read', 'contents: read\n  actions: write'),
    'pull-requests: write': CABECALHO_WF.replace('contents: read', 'pull-requests: write'),
    'id-token: write': CABECALHO_WF.replace('contents: read', 'id-token: write'),
    'escrita em linha': CABECALHO_WF.replace('permissions:\n  contents: read', 'permissions: { contents: write }'),
    'escrita no job': CABECALHO_WF.replace('    runs-on: ubuntu-latest', '    runs-on: ubuntu-latest\n    permissions:\n      issues: write'),
    'sem permissions no topo (herda o padrão do repositório)': CABECALHO_WF.replace('permissions:\n  contents: read\n', '')
  };
  for (const [nome, texto] of Object.entries(ruins)) assert.ok(pegou({ [WF]: texto }, WF), nome);
  for (const ok of [CABECALHO_WF + '      - run: npm test\n', CABECALHO_WF.replace('permissions:\n  contents: read', 'permissions: {}'),
    CABECALHO_WF.replace('contents: read', 'contents: read\n  id-token: none')])
    assert.deepEqual(achados({ [WF]: ok }), [], ok);
  assert.deepEqual(achados({ 'scripts/nao-e-workflow.txt': 'CLOUDFLARE_API_TOKEN\n' }), [], 'as regras de workflow valem só para .github/workflows');
});
const WRANGLER_BOM = JSON.stringify({ name: 'beyon-zero-site', main: 'cloudflare/worker.mjs', workers_dev: false, preview_urls: false,
  env: { previa: { routes: [], workers_dev: true, preview_urls: true, vars: { A: '1' }, previews: { vars: { A: '1' } } } } }, null, 2);
const comMudanca = fn => { const c = JSON.parse(WRANGLER_BOM); fn(c); return JSON.stringify(c, null, 2); };
test('wrangler.jsonc: a estrutura que aponta o deploy da main para a produção é achado (trava 2 do plano); a boa passa', () => {
  assert.deepEqual(achados({ 'wrangler.jsonc': WRANGLER_BOM }), []);
  const ruins = {
    'env.previa.name': c => { c.env.previa.name = 'beyon-zero-site'; },
    'env.previa.build': c => { c.env.previa.build = { command: 'x' }; },
    'build no topo': c => { c.build = { command: 'x' }; },
    'build fundo': c => { c.env.previa.previews.build = { command: 'x' }; },
    'env.previa.route': c => { c.env.previa.route = 'beyonzero.com.br/*'; },
    'env.previa.routes de produção': c => { c.env.previa.routes = ['beyonzero.com.br/*']; },
    'env.previa.routes com domínio': c => { c.env.previa.routes = [{ pattern: 'beyonzero.com.br', custom_domain: true }]; },
    'env.previa.account_id': c => { c.env.previa.account_id = 'abc'; },
    'outro env com name': c => { c.env.teste = { name: 'x' }; },
    'account_id no topo': c => { c.account_id = 'abc'; },
    'workers_dev true no topo': c => { c.workers_dev = true; },
    'workers_dev ausente no topo': c => { delete c.workers_dev; },
    'preview_urls true no topo': c => { c.preview_urls = true; },
    'preview_urls ausente no topo': c => { delete c.preview_urls; },
    'routes no topo (é do PR C)': c => { c.routes = ['beyonzero.com.br/*']; },
    'route no topo': c => { c.route = 'beyonzero.com.br/*'; }
  };
  for (const [nome, fn] of Object.entries(ruins)) assert.ok(pegou({ 'wrangler.jsonc': comMudanca(fn) }, 'wrangler.jsonc'), nome);
  assert.deepEqual(achados({ 'wrangler.jsonc': comMudanca(c => { c.env.previa.routes = []; }) }), [], 'routes vazio no env é o que fecha a herança');
});

/* ---- recheque de 26/10: a trava normaliza o texto antes de casar (continuação de linha, &, aspas, .cmd, maiúsculas, git com opções) ---- */
test('recheque: git com opções antes do push (-C pasta, -c chave=valor, --no-pager) pega a branch de produção', () => {
  const ruins = [`${GIT} -C ../site push origin ${PRODUCAO}`, `${GIT} -c user.name=x push origin HEAD:${PRODUCAO}`,
    `${GIT} --no-pager push --force origin ${PRODUCAO}`, `${GIT}.exe -C x push --all`, `${GIT.toUpperCase()} -C x PUSH origin ${PRODUCAO}`, `"${GIT}" -C x push --mirror`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.sh': r + '\n' }, 'scripts/x.sh'), r);
  for (const b of [`${GIT} -C ../site push origin cf-pr-b`, `${GIT} -C ../site log ${PRODUCAO}`, `digit push origin ${PRODUCAO}`])
    assert.deepEqual(achados({ 'scripts/x.sh': b + '\n' }), [], b);
});
test('recheque: comando quebrado em várias linhas (barra invertida do shell, ^ do cmd, crase do PowerShell) é juntado antes de casar', () => {
  const ruins = [`npx ${W} \\\n  deploy`, `npx ${W} \\\r\n  --env previa \\\r\n  deploy`, `${W} ^\n deploy`, `${W} \`\n deploy`,
    `${GIT} push \\\n  origin ${PRODUCAO}`, `npx ${W} deploy --dry-run && npx ${W} \\\n  delete`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.sh': r + '\n' }, 'scripts/x.sh'), r);
  assert.ok(pegou({ '.github/workflows/x.yml': CABECALHO_WF + `      - run: |\n          npx ${W} \\\n            deploy\n` }, '.github/workflows/x.yml'));
  assert.deepEqual(achados({ 'scripts/x.sh': `npx ${W} deploy \\n  --dry-run \\n  --outdir x\n` }), [], 'o --dry-run na linha de baixo continua dispensando');
});
test('recheque: o & simples separa comandos (o --dry-run de um não dispensa o outro)', () => {
  const ruins = [`npx ${W} deploy --dry-run & npx ${W} deploy`, `npx ${W} deploy & npx ${W} deploy --dry-run`, `echo a &npx ${W} delete`,
    `${GIT} status & ${GIT} push origin ${PRODUCAO}`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.sh': r + '\n' }, 'scripts/x.sh'), r);
  for (const b of [`npx ${W} deploy --dry-run 2>&1`, `npx ${W} deploy --dry-run > saida.txt 2>&1`, `npx ${W} deploy --dry-run`])
    assert.deepEqual(achados({ 'scripts/x.sh': b + '\n' }), [], b);
});
test('recheque: Wrangler com .cmd/.exe/.ps1, maiúsculas ou aspas em volta do nome', () => {
  const ruins = [`node_modules/.bin/${W}.cmd deploy`, `.\\node_modules\\.bin\\${W}.cmd deploy`, `${W}.exe deploy`, `${W}.ps1 delete`, `${W.toUpperCase()} deploy`,
    `Npx ${W[0].toUpperCase() + W.slice(1)} Deploy`, `"${W}" deploy`, `'${W}' deploy`, `npx "${W}@4" deploy`, `npx "${W}" "deploy"`, `\`${W}\` deploy`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.sh': r + '\n' }, 'scripts/x.sh'), r);
  assert.deepEqual(achados({ 'scripts/x.sh': `${W.toUpperCase()} deploy --DRY-RUN\n"${W}" deploy --dry-run\n${W}.cmd dev\n` }), []);
});
test('recheque: lista com crase, com .cmd ou em várias linhas', () => {
  const ruins = [`spawnSync('npx', [\`${W}\`, \`deploy\`])`, `spawnSync("npx", [\`${W}\`, 'versions', \`upload\`])`, `spawnSync(['${W}.cmd', 'deploy'])`,
    `spawnSync('npx', [\n  '${W}',\n  'deploy'\n])`, `spawn('npx', ['${W.toUpperCase()}', 'DEPLOY'])`, `run([\`${GIT}\`, \`push\`, \`origin\`, \`${PRODUCAO}\`])`];
  for (const r of ruins) assert.ok(pegou({ 'scripts/x.mjs': r + '\n' }, 'scripts/x.mjs'), r);
  assert.deepEqual(achados({ 'scripts/x.mjs': `spawnSync('npx', [\`${W}\`, \`deploy\`, \`--dry-run\`])\n` }), []);
});
test('recheque: wrangler.json e wrangler.toml também são conferidos', () => {
  assert.deepEqual(achados({ 'wrangler.json': WRANGLER_BOM }), []);
  assert.ok(pegou({ 'wrangler.json': comMudanca(c => { c.workers_dev = true; }) }, 'wrangler.json'));
  assert.ok(pegou({ 'wrangler.json': comMudanca(c => { c.routes = ['beyonzero.com.br/*']; }) }, 'wrangler.json'));
  assert.ok(pegou({ 'sub/wrangler.json': '{ ilegivel' }, 'sub/wrangler.json'));
  assert.ok(pegou({ 'wrangler.toml': 'name = "x"\nworkers_dev = false\n' }, 'wrangler.toml'), 'o .toml não é lido: acusa a existência');
  assert.ok(pegou({ 'cloudflare/wrangler.toml': 'name = "x"\n' }, 'cloudflare/wrangler.toml'));
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

test('recheque: prosa com "Wrangler" e "deploy" soltos (sem ser comando) não é achado', () => {
  for (const b of ['Aviso do Wrangler no deploy do topo', 'o Wrangler faz o deploy so depois do dono', `rodar ${W} dev; depois o deploy`])
    assert.deepEqual(achados({ 'scripts/x.sh': b + '\n' }), [], b);
});
