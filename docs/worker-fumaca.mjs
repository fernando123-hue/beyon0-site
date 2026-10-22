/* ==========================================================================
   FUMAÇA NO RUNTIME DE VERDADE (workerd, o mesmo motor da Cloudflare). Roda no CI (job "Worker"); no PC só serve para
   ensaio. Não publica nada: `wrangler deploy --dry-run` só empacota e `wrangler dev --local` roda aqui.
     node docs/worker-fumaca.mjs
   O Wrangler lê .dev.vars e .env da pasta onde roda: por isso a fumaça copia para uma pasta temporária SÓ o que vai ao
   ar (publico/, cloudflare/, api/, wrangler.jsonc, package*.json) e usa o node_modules daqui por junção. Sem segredo
   nenhum, o Worker é a produção sem chaves: tudo tem de fechar.
   DATA DE COMPATIBILIDADE: o workerd que vem dentro de cada versão do Wrangler só aceita datas até a dele (o 4.136.3
   aceita até 2026-09-28; o wrangler.jsonc pede 2026-10-21, que a Cloudflare de verdade aceita). Se o workerd local
   recusar, a fumaça repete com a data máxima que ele disse aceitar (só aqui, no ensaio local; o arquivo não muda) e
   avisa. Subir a versão do Wrangler (decisão do dono) faz esse caminho deixar de ser usado.
   ========================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const IP_DE_TESTE = '203.0.113.7';
const LIMITE_STARTUP_MS = 400;
const PEDIDOS_DO_FREIO = 60;
const DATA_RECUSADA = /newest date supported by this server binary is "(\d{4}-\d{2}-\d{2})"/;
const CRONS = [{ cron: '41 6 * * *', esperado: /rotina desligada/ }];
const falhas = [];
const ok = (nome) => console.log('  ok     ' + nome);
const falha = (nome, detalhe) => { falhas.push(nome); console.log('  FALHOU ' + nome + (detalhe ? ' — ' + detalhe : '')); };
const confere = (nome, condicao, detalhe) => (condicao ? ok(nome) : falha(nome, detalhe));
const dormir = ms => new Promise(r => setTimeout(r, ms));

function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

const ambiente = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
function wrangler(args, cwd) {
  return spawnSync(process.execPath, [WRANGLER, ...args], { cwd, encoding: 'utf8', env: ambiente, timeout: 180000 });
}

function montarPasta() {
  const montar = spawnSync(process.execPath, [path.join(RAIZ, 'cloudflare', 'montar-publico.mjs')], { cwd: RAIZ, encoding: 'utf8' });
  if (montar.status !== 0) throw new Error('montar-publico falhou: ' + montar.stderr);
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'bz-fumaca-'));
  for (const item of ['publico', 'cloudflare', 'api', 'wrangler.jsonc', 'package.json', 'package-lock.json']) fs.cpSync(path.join(RAIZ, item), path.join(pasta, item), { recursive: true });
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(pasta, 'node_modules'), 'junction');
  return pasta;
}

/* o login é pedido só fora do CI: aqui anota e segue (o CI não tem login e o dry-run não deveria pedir) */
const pedeLogin = r => /log ?in|authenticat|CLOUDFLARE_API_TOKEN|API token/i.test((r.stdout || '') + (r.stderr || ''));

function empacotar(pasta) {
  console.log('empacotamento (dry-run, sem publicar)');
  for (const [rotulo, extra] of [['produção', ['--env=']], ['prévia', ['--env', 'previa']]]) {
    const saida = '.wrangler/saida-' + (extra[0] === '--env=' ? 'prod' : 'previa');
    const r = wrangler(['deploy', '--dry-run', '--outdir', saida, ...extra], pasta);
    if (r.status !== 0 && pedeLogin(r) && !process.env.CI) { console.log('  PULADO ' + rotulo + ': o Wrangler pediu login (só no CI)'); continue; }
    const texto = (r.stdout || '') + (r.stderr || '');
    confere('dry-run ' + rotulo, r.status === 0, texto.slice(-400));
    if (r.status !== 0) continue;
    const tam = /Total Upload:[^\n]*/.exec(texto);
    if (tam) console.log('         ' + rotulo + ': ' + tam[0].trim());
    if (extra[0] === '--env') confere('dry-run da prévia sem rota nem domínio personalizado', !/routes?:|custom_domain|beyonzero\.com\.br/i.test(texto.replace(/workers\.dev/g, '')), texto.slice(-300));
  }
}

/* "Active" do perfil de inicialização = CPU gasta ao subir o Worker (o "Profile window" inclui espera) */
function inicializacao(pasta, dataLocal) {
  console.log('inicialização (wrangler check startup)');
  const args = ['check', 'startup', '--outfile', '.wrangler/startup.cpuprofile'];
  if (dataLocal) args.push('--args=--compatibility-date=' + dataLocal);
  const r = wrangler(args, pasta);
  const texto = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 && pedeLogin(r) && !process.env.CI) { console.log('  PULADO: o Wrangler pediu login (só no CI)'); return; }
  confere('check startup roda', r.status === 0, texto.slice(-400));
  const ativo = /Active:\s*([\d.]+)\s*ms/.exec(texto);
  if (!ativo) { console.log('  (sem "Active" legível na saída do check startup; conferir à mão)'); return; }
  const janela = /Profile window:\s*([\d.]+)\s*ms/.exec(texto);
  console.log('         inicialização: ativa ' + ativo[1] + ' ms' + (janela ? ', janela ' + janela[1] + ' ms' : ''));
  confere('inicialização ativa ≤ ' + LIMITE_STARTUP_MS + ' ms', Number(ativo[1]) <= LIMITE_STARTUP_MS, ativo[1] + ' ms');
}

async function esperarPronto(base, filho, getLog) {
  const fim = Date.now() + 90000;
  while (Date.now() < fim) {
    if (filho.exitCode !== null) throw Object.assign(new Error('wrangler dev saiu cedo:\n' + getLog().slice(-800)), { log: getLog() });
    try { await fetch(base + '/robots.txt', { signal: AbortSignal.timeout(2000) }); return; } catch { await dormir(500); }
  }
  throw new Error('wrangler dev não ficou pronto em 90 s:\n' + getLog().slice(-800));
}

/* sobe o wrangler dev; se o workerd recusar a data, repete com a data máxima que ele aceita (ver o topo) */
async function subirDev(pasta) {
  let dataLocal = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const porta = await portaLivre();
    const base = 'http://127.0.0.1:' + porta;
    const estado = { log: '' };
    const args = [WRANGLER, 'dev', '--local', '--port', String(porta), '--ip', '127.0.0.1', '--test-scheduled'];
    if (dataLocal) args.push('--compatibility-date', dataLocal);
    const filho = spawn(process.execPath, args, { cwd: pasta, env: { ...ambiente, CI: '1' } });
    filho.stdout.on('data', d => { estado.log += d; });
    filho.stderr.on('data', d => { estado.log += d; });
    try {
      await esperarPronto(base, filho, () => estado.log);
      return { filho, base, estado, dataLocal };
    } catch (e) {
      filho.kill();
      const recusa = DATA_RECUSADA.exec(estado.log);
      if (!recusa || dataLocal) throw e;
      dataLocal = recusa[1];
      console.log('  AVISO  o workerd deste Wrangler só aceita compatibility_date até ' + dataLocal + ' (o arquivo pede mais); ensaio local com ' + dataLocal);
    }
  }
  throw new Error('wrangler dev não subiu');
}

async function disparar(base, cron) {
  /* Wrangler >= 4.139: /cdn-cgi/local/scheduled; antes: /cdn-cgi/handler/scheduled com --test-scheduled (o 4.136.3) */
  for (const caminho of ['/cdn-cgi/local/scheduled', '/cdn-cgi/handler/scheduled', '/__scheduled']) {
    try {
      const r = await fetch(base + caminho + '?cron=' + encodeURIComponent(cron), { signal: AbortSignal.timeout(15000) });
      if (r.status === 200) return caminho;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

async function noWorker(dev) {
  console.log('Worker no workerd (sem segredos = produção sem chaves)');
  const { base, estado } = dev;
  const get = (c, op = {}) => fetch(base + c, { redirect: 'manual', ...op });
  const orc = await get('/orcamento');
  confere('/orcamento 200', orc.status === 200, String(orc.status));
  const csp = orc.headers.get('content-security-policy') || '';
  confere('/orcamento com UMA CSP', (csp.match(/default-src/g) || []).length === 1 && !/google/i.test(csp), csp.slice(0, 160));
  const html = await get('/orcamento.html');
  confere('/orcamento.html redireciona (307) para /orcamento', html.status === 307 && /\/orcamento$/.test(html.headers.get('location') || ''), html.status + ' ' + html.headers.get('location'));
  for (const c of ['/docs/PROCESSO.md', '/_headers', '/publico/index.html', '/wrangler.jsonc', '/api/_freio', '/package.json', '/api/vendas.mjs'])
    confere(c + ' → 404', (await get(c)).status === 404);
  const cf = { 'cf-connecting-ip': IP_DE_TESTE };
  const cfg = await get('/api/vendas?acao=sessao-config', { headers: cf });
  const corpo = await cfg.json().catch(() => null);
  confere('sessao-config fechado (turnstile: null, consultor: false)', cfg.status === 200 && corpo && corpo.turnstile === null && corpo.consultor === false, JSON.stringify(corpo));
  const grande = await get('/api/vendas', { method: 'POST', headers: { ...cf, 'content-type': 'application/json' }, body: 'x'.repeat(70 * 1024) });
  confere('POST de 70 KB em /api/vendas → 413', grande.status === 413, String(grande.status));
  const evento = (xff) => get('/api/evento', { method: 'POST', headers: { ...cf, 'x-forwarded-for': xff, origin: base, 'user-agent': 'Mozilla/5.0 fumaca', 'content-type': 'application/json' }, body: '{}' });
  const primeiro = [];
  for (let i = 0; i < PEDIDOS_DO_FREIO; i++) primeiro.push((await evento('1.1.1.1')).status);
  confere('1º lote de ' + PEDIDOS_DO_FREIO + ' /api/evento sem 429', !primeiro.includes(429), [...new Set(primeiro)].join(','));
  const segundo = [];
  for (let i = 0; i < PEDIDOS_DO_FREIO; i++) segundo.push((await evento('2.2.2.2')).status);
  confere('2º lote (x-forwarded-for diferente, mesmo cf-connecting-ip) cai na mesma chave do freio: 429', segundo.every(s => s === 429), [...new Set(segundo)].join(','));
  for (const { cron, esperado } of CRONS) {
    const via = await disparar(base, cron);
    confere('cron ' + cron + ' disparável à mão', !!via, 'nenhum caminho de disparo respondeu');
    if (!via) continue;
    await dormir(1500);
    confere('cron ' + cron + ' loga ' + esperado, esperado.test(estado.log), estado.log.slice(-300));
  }
}

console.log('fumaça do Worker (workerd): nada é publicado');
const pasta = montarPasta();
let dev = null;
try {
  empacotar(pasta);
  dev = await subirDev(pasta);
  await noWorker(dev);
  dev.filho.kill();
  await dormir(1000);
  inicializacao(pasta, dev.dataLocal);
} catch (e) {
  falha('execução', e.message);
} finally {
  if (dev) dev.filho.kill();
  /* primeiro só a junção (sem recursão: o node_modules de verdade nunca é tocado), depois a pasta temporária */
  try { fs.rmSync(path.join(pasta, 'node_modules')); fs.rmSync(pasta, { recursive: true, force: true, maxRetries: 3 }); } catch { /* (sobra de pasta temporária: inofensiva) */ }
}
console.log(falhas.length ? '\n' + falhas.length + ' falha(s): ' + falhas.join(' | ') : '\nfumaça ok');
process.exit(falhas.length ? 1 : 0);
