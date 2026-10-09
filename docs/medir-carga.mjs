/* Carga em rede e processador limitados, com A/B intercalado (auditoria 2026-10-09, desempenho #8).
   O medir.mjs mede o site parado e rolando sem limite nenhum; este mede o CAMINHO DA CARGA como o celular
   do visitante o vê: cache frio, rede "Slow 4G" do DevTools e processador 4x mais lento.

   Uso:
     node docs/medir-carga.mjs A=<pasta> [B=<pasta>]          (cada pasta é um checkout do site)
   Variáveis:
     N=7               rodadas por página e versão (A e B se alternam: A B A B…, para a máquina pesar igual)
     PAGINAS=index.html,sites.html,automacao.html
     PERFIL=lento      lento (562 ms, 1,4 Mbps, CPU 4x) | medio (165 ms, 9 Mbps, CPU 4x) | livre
     H2=1              HTTP/2 com TLS (certificado próprio, gerado pelo openssl), como a Vercel; sem isso, HTTP/1.1
     GPU=1             placa de vídeo de verdade (sem isso o headless é SwiftShader e o porteiro barra a esfera)
     ESPERA=6000       ms depois do load, para o LCP assentar e a esfera montar
     CHROMIUM          executável (como no verificador)

   Cada versão é servida por docs/servidor.mjs com COMPRIMIR=1 (gzip, como a Vercel), numa porta própria.
   Saída: a mediana de cada número por página e versão, e cada rodada em docs/medida-carga-<data>.json (fora do Git, como as outras medidas).
   Rode com a máquina livre: outro teste ao mesmo tempo distorce tudo (PLANO da auditoria). */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PERFIS = {
  lento: { rede: { latency: 562.5, downloadThroughput: 1.4e6 / 8, uploadThroughput: 675e3 / 8 }, cpu: 4 },
  medio: { rede: { latency: 165, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 }, cpu: 4 },
  livre: { rede: null, cpu: 1 }
};
const PERFIL = process.env.PERFIL || 'lento';
const N = +(process.env.N || 7);
const ESPERA = +(process.env.ESPERA || 6000);
const PAGINAS = (process.env.PAGINAS || 'index.html,sites.html,automacao.html').split(',');
const GPU = process.env.GPU === '1';
const H2 = process.env.H2 === '1';
const CELULAR = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SERVIDOR = fileURLToPath(new URL('./servidor.mjs', import.meta.url));
const SAIDA = fileURLToPath(new URL('./medida-carga-' + new Date().toISOString().slice(0, 10) + '.json', import.meta.url));
const registro = existsSync(SAIDA) ? JSON.parse(readFileSync(SAIDA, 'utf8')) : [];   /* (vários A/B no mesmo dia vão para o mesmo arquivo) */

if (!PERFIS[PERFIL]) throw new Error('PERFIL desconhecido: ' + PERFIL);
const versoes = process.argv.slice(2).map(a => a.match(/^([A-Z])=(.+)$/)).filter(Boolean).map(([, nome, pasta]) => ({ nome, pasta: resolve(pasta) }));
if (!versoes.length) throw new Error('uso: node docs/medir-carga.mjs A=<pasta> [B=<pasta>]');

/* um servidor por versão, com gzip; espera a linha "servindo" */
/* H2=1: certificado de uma vez, na pasta temporária (só vale para 127.0.0.1; o navegador ignora o erro de certificado) */
const TLS = {};
if (H2) {
  TLS.TLS_CERT = resolve(tmpdir(), 'bz-medir-cert.pem'); TLS.TLS_CHAVE = resolve(tmpdir(), 'bz-medir-chave.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=127.0.0.1', '-keyout', TLS.TLS_CHAVE, '-out', TLS.TLS_CERT], { stdio: 'ignore' });
}

function servir(pasta, porta) {
  return new Promise((ok, falha) => {
    const p = spawn(process.execPath, [SERVIDOR, pasta, String(porta)], { env: { ...process.env, COMPRIMIR: '1', ...TLS }, stdio: ['ignore', 'pipe', 'pipe'] });
    const prazo = setTimeout(() => falha(new Error('servidor não subiu: ' + pasta)), 60000);
    p.stdout.on('data', d => { if (/servindo/.test(String(d))) { clearTimeout(prazo); ok(p); } });
    p.stderr.resume();
    p.on('exit', c => falha(new Error('servidor saiu (' + c + '): ' + pasta)));
  });
}

/* antes de qualquer script da página: LCP, FCP, tarefas longas e o instante em que cada classe aparece no <html>
   (tem-nucleo = a esfera montou; has-gsap etc.) */
function sondas() {
  window.__m = { lcp: 0, lcpEl: '', long: 0, classes: {} };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = e.element ? e.element.tagName + (e.element.className ? '.' + String(e.element.className).split(' ')[0] : '') : ''; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* sem LCP */ }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.long += e.duration; }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* sem longtask */ }
  const marcar = () => { for (const c of document.documentElement.classList) if (!(c in window.__m.classes)) window.__m.classes[c] = Math.round(performance.now()); };
  const ligar = () => { new MutationObserver(marcar).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); marcar(); };
  if (document.documentElement) ligar();
  else { const espera = new MutationObserver(() => { if (document.documentElement) { espera.disconnect(); ligar(); } }); espera.observe(document, { childList: true }); }   /* (o init roda antes de o <html> existir) */
}

async function rodada(nav, base, pagina) {
  const ctx = await nav.newContext({ ...CELULAR, ignoreHTTPSErrors: H2 });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.addInitScript(sondas);
  const cdp = await ctx.newCDPSession(page);
  const { rede, cpu } = PERFIS[PERFIL];
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (rede) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...rede });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto(base + '/' + pagina, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(ESPERA);
  const r = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const recursos = performance.getEntriesByType('resource');
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null, lcp: Math.round(window.__m.lcp), lcpEl: window.__m.lcpEl,
      dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), long: Math.round(window.__m.long),
      kb: Math.round((recursos.reduce((s, x) => s + (x.transferSize || 0), 0) + (nav.transferSize || 0)) / 1024),
      pedidos: recursos.length + 1, protocolo: nav.nextHopProtocol, classes: window.__m.classes
    };
  });
  await ctx.close();
  return { ...r, erros };
}

const mediana = v => { const s = v.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

const servidores = [];
try {
  for (const [i, v] of versoes.entries()) { v.base = (H2 ? 'https' : 'http') + '://127.0.0.1:' + (8890 + i); servidores.push(await servir(v.pasta, 8890 + i)); }
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const todas = [];
  for (const pagina of PAGINAS) {
    await rodada(nav, versoes[0].base, pagina);   /* aquecimento: a 1ª carga do headless sobe o processo de GPU (CLAUDE.md) */
    for (let k = 0; k < N; k++) {
      for (const v of (k % 2 ? [...versoes].reverse() : versoes)) {
        const r = { versao: v.nome, pagina, perfil: PERFIL, gpu: GPU, ...(await rodada(nav, v.base, pagina)) };
        todas.push(r);
        registro.push({ quando: new Date().toISOString(), pasta: v.pasta, ...r });
        writeFileSync(SAIDA, JSON.stringify(registro, null, 1));
        process.stdout.write('.');
      }
    }
  }
  await nav.close();
  console.log('\nperfil ' + PERFIL + (GPU ? ' com GPU' : '') + ', ' + [...new Set(todas.map(r => r.protocolo))].join('/') + ', ' + N + ' rodadas, medianas (ms; kb transferidos)');
  for (const pagina of PAGINAS) for (const v of versoes) {
    const rs = todas.filter(r => r.pagina === pagina && r.versao === v.nome);
    const nucleo = mediana(rs.map(r => r.classes['tem-nucleo']));
    const lcpEls = [...new Set(rs.map(r => r.lcpEl))].join(' | ');
    console.log([pagina.padEnd(15), v.nome, 'FCP', mediana(rs.map(r => r.fcp)), 'LCP', mediana(rs.map(r => r.lcp)), 'DCL', mediana(rs.map(r => r.dcl)),
      'load', mediana(rs.map(r => r.load)), 'longas', mediana(rs.map(r => r.long)), 'kb', mediana(rs.map(r => r.kb)), 'pedidos', mediana(rs.map(r => r.pedidos)),
      nucleo == null ? '' : 'esfera ' + nucleo, '(' + lcpEls + ')', rs.some(r => r.erros.length) ? 'ERROS: ' + rs.flatMap(r => r.erros).slice(0, 2).join('; ') : ''].join(' '));
  }
} finally {
  for (const p of servidores) p.kill();
}
