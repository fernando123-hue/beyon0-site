/* Carga em rede e processador limitados, com A/B intercalado (auditoria 2026-10-09, desempenho #8).
   O medir.mjs mede o site parado e rolando sem limite nenhum; este mede o CAMINHO DA CARGA como o celular
   do visitante o vê: cache frio, rede "Slow 4G" do DevTools e processador 4x mais lento.

   Uso:
     node docs/medir-carga.mjs A=<pasta> [B=<pasta>]          (cada pasta é um checkout do site)
   Variáveis:
     N=7               rodadas por página e versão (A e B se alternam: A B, B A…, para a máquina pesar igual)
     PAGINAS=index.html,sites.html,automacao.html
     PERFIL=lento      lento (562 ms, 1,4 Mbps, CPU 4x) | medio (165 ms, 9 Mbps, CPU 4x) | livre
     H2=1              HTTP/2 com TLS (certificado próprio, gerado pelo openssl), como a Vercel; sem isso, HTTP/1.1
     OPENSSL           caminho do openssl, se ele não estiver no PATH (no Git Bash está)
     GPU=1             placa de vídeo de verdade (sem isso o headless é SwiftShader e o porteiro barra a esfera)
     ESPERA=6000       ms depois do load, para o LCP assentar e a esfera montar
     CHROMIUM          executável (como no verificador)

   Cada versão é servida por docs/servidor.mjs com COMPRIMIR=1 (gzip, como a Vercel), numa porta própria.
   Saída: a mediana de cada número por página e versão, e cada rodada em docs/medida-carga-<data>.json (fora do Git,
   como as outras medidas). Os números absolutos saem um pouco otimistas: o emulador de rede do DevTools atrasa os
   pedidos, não o aperto de mão TCP/TLS. O A/B vale, porque as duas versões pagam igual.
   Rode com a máquina livre: outro teste ao mesmo tempo distorce tudo (PLANO da auditoria). */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
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
const PORTA_INICIAL = 8890;
const PRAZO_SERVIDOR_MS = 60000;
const CELULAR = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SERVIDOR = fileURLToPath(new URL('./servidor.mjs', import.meta.url));
const SAIDA = fileURLToPath(new URL('./medida-carga-' + new Date().toISOString().slice(0, 10) + '.json', import.meta.url));
const registro = existsSync(SAIDA) ? JSON.parse(readFileSync(SAIDA, 'utf8')) : [];   /* (vários A/B no mesmo dia vão para o mesmo arquivo) */

if (!PERFIS[PERFIL]) throw new Error('PERFIL desconhecido: ' + PERFIL);
const versoes = process.argv.slice(2).map(a => a.match(/^([A-Z])=(.+)$/)).filter(Boolean).map(([, nome, pasta]) => ({ nome, pasta: resolve(pasta) }));
if (!versoes.length) throw new Error('uso: node docs/medir-carga.mjs A=<pasta> [B=<pasta>]');

/* o servidor filho roda o api/*.mjs da pasta medida: leva só o necessário para o Node funcionar, nunca os
   segredos que estiverem no shell (VERCEL_TOKEN, GH_TOKEN…) */
const AMBIENTE = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA']
  .filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));

/* H2=1: o certificado numa pasta temporária PRÓPRIA, apagada no fim (só vale para 127.0.0.1; o navegador ignora o
   erro de certificado). O openssl roda com essa pasta como diretório atual: no Windows o executável é procurado
   primeiro ali, então um openssl.exe plantado no repositório nunca é o que roda (revisão de segurança) */
function certificado(pasta) {
  const tls = { TLS_CERT: join(pasta, 'cert.pem'), TLS_CHAVE: join(pasta, 'chave.pem') };
  try {
    execFileSync(process.env.OPENSSL || 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=127.0.0.1',
      '-keyout', tls.TLS_CHAVE, '-out', tls.TLS_CERT], { stdio: 'ignore', cwd: pasta });
  } catch (e) {
    throw new Error('H2=1 precisa do openssl (' + e.code + '): rode pelo Git Bash, ou aponte OPENSSL para o executável');
  }
  return tls;
}

/* um servidor por versão; espera a linha "servindo". Em qualquer falha o filho morre junto (senão fica órfão
   segurando a porta) */
function servir(pasta, porta, tls) {
  return new Promise((ok, falha) => {
    const p = spawn(process.execPath, [SERVIDOR, pasta, String(porta)], { env: { ...AMBIENTE, COMPRIMIR: '1', ...tls }, stdio: ['ignore', 'pipe', 'pipe'] });
    const desistir = motivo => { clearTimeout(prazo); p.kill(); falha(new Error(motivo + ': ' + pasta)); };
    const prazo = setTimeout(() => desistir('servidor não subiu em ' + PRAZO_SERVIDOR_MS / 1000 + ' s'), PRAZO_SERVIDOR_MS);
    p.stdout.on('data', d => { if (/servindo/.test(String(d))) { clearTimeout(prazo); ok(p); } });
    p.stderr.resume();
    p.on('exit', c => desistir('servidor saiu (' + c + ')'));
  });
}

/* antes de qualquer script da página: LCP, FCP, tarefas longas e o instante em que cada classe aparece no <html>
   (tem-nucleo = a esfera montou; has-gsap etc.) */
function sondas() {
  window.__m = { lcp: 0, lcpEl: '', long: 0, classes: {} };
  const rotulo = el => el.tagName + (el.getAttribute('class') ? '.' + el.getAttribute('class').split(' ')[0] : '');   /* (getAttribute: no SVG, className não é texto) */
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = e.element ? rotulo(e.element) : ''; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* sem LCP */ }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.long += e.duration; }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* sem longtask */ }
  const marcar = () => { for (const c of document.documentElement.classList) if (!(c in window.__m.classes)) window.__m.classes[c] = Math.round(performance.now()); };
  const ligar = () => { new MutationObserver(marcar).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); marcar(); };
  if (document.documentElement) ligar();
  else { const espera = new MutationObserver(() => { if (document.documentElement) { espera.disconnect(); ligar(); } }); espera.observe(document, { childList: true }); }   /* (o init roda antes de o <html> existir) */
}

async function rodada(nav, base, pagina) {
  const ctx = await nav.newContext({ ...CELULAR, ignoreHTTPSErrors: H2 });
  /* só o servidor local: nada de fora entra na medida (e o ignoreHTTPSErrors não vale para outro destino) */
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, r => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  /* pedidos locais que falharam ou voltaram >= 400: uma pasta errada ou um preload com caminho errado aparecem
     aqui, e não só como números estranhos */
  const local = u => u.startsWith(base);
  page.on('pageerror', e => erros.push(e.message));
  page.on('response', r => { if (local(r.url()) && r.status() >= 400) erros.push(r.status() + ' ' + new URL(r.url()).pathname); });
  page.on('requestfailed', r => { if (local(r.url())) erros.push('falhou ' + new URL(r.url()).pathname); });
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

/* mediana de verdade (com N par, a média dos dois do meio); valores ausentes ficam de fora, e quem imprime diz quantos */
function mediana(v) {
  const s = v.filter(x => typeof x === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function relatorio(todas) {
  console.log('\nperfil ' + PERFIL + (GPU ? ' com GPU' : '') + ', ' + [...new Set(todas.map(r => r.protocolo))].join('/') + ', ' + N + ' rodadas, medianas (ms; kb transferidos)');
  for (const pagina of PAGINAS) for (const v of versoes) {
    const rs = todas.filter(r => r.pagina === pagina && r.versao === v.nome);
    const nucleos = rs.map(r => r.classes['tem-nucleo']).filter(x => typeof x === 'number');
    const esfera = nucleos.length ? 'esfera ' + mediana(nucleos) + ' (montou ' + nucleos.length + '/' + rs.length + ')' : '';
    const lcpEls = [...new Set(rs.map(r => r.lcpEl))].join(' | ');
    const erros = rs.flatMap(r => r.erros);
    console.log([pagina.padEnd(15), v.nome, 'FCP', mediana(rs.map(r => r.fcp)), 'LCP', mediana(rs.map(r => r.lcp)), 'DCL', mediana(rs.map(r => r.dcl)),
      'load', mediana(rs.map(r => r.load)), 'longas', mediana(rs.map(r => r.long)), 'kb', mediana(rs.map(r => r.kb)), 'pedidos', mediana(rs.map(r => r.pedidos)),
      esfera, '(' + lcpEls + ')', erros.length ? 'ERROS (' + erros.length + '): ' + [...new Set(erros)].slice(0, 3).join('; ') : ''].join(' '));
  }
}

/* Ctrl-C: sai pelo exit do Node, que leva os filhos junto (no Windows eles ficariam segurando as portas) */
const servidores = [];
const encerrar = () => { for (const p of servidores) p.kill(); };
process.on('SIGINT', () => { encerrar(); process.exit(130); });

const pastaTls = H2 ? mkdtempSync(join(tmpdir(), 'bz-medir-')) : null;
let nav = null;
try {
  const tls = H2 ? certificado(pastaTls) : {};
  for (const [i, v] of versoes.entries()) {
    v.base = (H2 ? 'https' : 'http') + '://127.0.0.1:' + (PORTA_INICIAL + i);
    servidores.push(await servir(v.pasta, PORTA_INICIAL + i, tls));
  }
  nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const todas = [];
  for (const pagina of PAGINAS) {
    /* aquecimento em cada versão: a 1ª carga do headless sobe o processo de GPU (CLAUDE.md) e o servidor de cada
       uma monta o banco local no primeiro pedido */
    for (const v of versoes) await rodada(nav, v.base, pagina);
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
  relatorio(todas);
} finally {
  if (nav) await nav.close();
  encerrar();
  if (pastaTls) rmSync(pastaTls, { recursive: true, force: true });   /* (a chave não fica para trás) */
}
