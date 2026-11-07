/* MEDIR OS SONS (2026-11-07): o nível de cada voz do site (js/som.js, pelo gancho B.somTeste) contra a mesma voz da
   prévia que o dono ouviu (docs/sons/previa.html), renderizadas em OfflineAudioContext (24 kHz, estéreo) com o MESMO
   sorteio (Math.random semeado) nas duas. Pico e RMS de 50 ms em dBFS; falha se alguma voz se afastar mais de 1 dB da
   prévia ou se a VISITA (clique, travessia, 3 cards, carga, 2 pulsos, ignição, com o fundo por baixo) passar de -3 dBFS.
   COMO RODAR (servidor local ligado):
     node docs/servidor.mjs . 8983
     BASE=http://127.0.0.1:8983 CHROMIUM=".../chrome-headless-shell.exe" node docs/sons/medir.mjs */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8983';
const EXEC = process.env.CHROMIUM || undefined;
const TOLERANCIA = 1, TETO_VISITA = -3;

/* roda DENTRO da página: cada voz renderizada sozinha; `lado` diz de onde vem o motor */
function medirNaPagina(lado) {
  function semente(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const SR = 24000;
  const site = lado === 'site';
  const motorDe = c => (site ? window.BEYON.somTeste.criarMotor(c, c.destination) : window.__criarMotor(c, c.destination).prop);
  /* as vozes como a prévia as toca; no site, a mesma sequência montada com as vozes dele */
  const VOZES = {
    card: [0.6, (m, t) => (site ? m.card(t, 0, 0) : m.tic(t, 0, 0))],
    cardB: [0.6, (m, t) => (site ? m.cardSeco(t, 0, 0) : m.ticSeco(t, 0, 0))],
    clique: [0.6, (m, t) => m.clique(t)],
    pulso: [1.4, (m, t) => m.pulso(t)],
    pulsoB: [1.8, (m, t) => m.pulsoSuave(t)],
    cargaTrava: [2.6, (m, t) => m.carga(t, 0.55).cheio(t + 0.55)],
    ouro: [13, (m, t) => ouro(m, t, false)],
    ouroB: [13, (m, t) => ouro(m, t, true)],
    travessia: [2.6, (m, t) => { if (!site) return m.passagem(t); m.clique(t); m.passagem(t); m.pouso(t + 0.82); }]
  };
  function ouro(m, t, contido) {
    if (!site) return contido ? m.ouroContido(t) : m.ouro(t);
    const tI = t + 1.8, tR = tI + 0.3, tE = tR + 5;   /* (os tempos da prévia: reinado de 5 s) */
    const s = m.ouroCarga(t, contido); if (s) s.parar(tI - 0.02);
    m.ouroIgnicao(tI, contido);
    m.ouroReinado(tR, 40).esfriar(tE);
    m.ouroEsfria(tE);
  }
  async function render(dura, tocar, comFundo) {
    /* o mesmo sorteio nas duas páginas, só enquanto a voz é montada (tudo síncrono); depois o da página volta */
    const original = Math.random;
    Math.random = semente(20261107);
    const c = new OfflineAudioContext(2, Math.round(SR * dura), SR);
    try {
      const m = motorDe(c);
      if (comFundo) window.BEYON.somTeste.montarFundo(c, c.destination);
      tocar(m, 0.05);
    } finally { Math.random = original; }
    const b = await c.startRendering();
    const chs = [b.getChannelData(0), b.getChannelData(1)], jan = Math.round(SR * 0.05);
    let pico = 0, rms = 0;
    for (const d of chs) {
      let soma = 0;
      for (let i = 0; i < d.length; i++) {
        const v = d[i]; if (Math.abs(v) > pico) pico = Math.abs(v);
        soma += v * v; if (i >= jan) soma -= d[i - jan] * d[i - jan];
        if (i >= jan - 1) rms = Math.max(rms, Math.sqrt(Math.max(0, soma) / jan));
      }
    }
    const db = v => Math.round(20 * Math.log10(Math.max(v, 1e-9)) * 10) / 10;
    return { pico: db(pico), rms: db(rms) };
  }
  return (async () => {
    const r = {};
    for (const [nome, [dura, tocar]] of Object.entries(VOZES)) r[nome] = await render(dura, tocar, false);
    if (site) {
      /* A VISITA, com o fundo por baixo (o fundo da prévia não passava pelo mesmo destino; aqui conta) */
      r.visita = await render(24, (m, t) => {
        let d = 0;
        m.clique(t); m.passagem(t); m.pouso(t + 0.82); d += 1.4;
        [0, 1, 2].forEach(i => m.card(t + d + i * 0.22, i, -0.4 + i * 0.4)); d += 1.0;
        m.carga(t + d, 0.55).cheio(t + d + 0.55); d += 1.6;
        m.pulso(t + d); d += 2.2;
        m.pulso(t + d); d += 1.6;
        ouro(m, t + d, false);
      }, true);
    }
    return r;
  })();
}

const navegador = await chromium.launch({ executablePath: EXEC, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let falhou = false;
try {
  /* (a prévia tem script e estilo no próprio HTML: fora do site, então fora da CSP dele) */
  const ctx = await navegador.newContext({ bypassCSP: true });
  const pagina = await ctx.newPage();
  await pagina.goto(BASE + '/sites?som=teste', { waitUntil: 'load', timeout: 90000 });
  await pagina.waitForFunction(() => window.BEYON && window.BEYON.somTeste, null, { timeout: 15000 });
  const site = await pagina.evaluate(medirNaPagina, 'site');
  await pagina.goto(BASE + '/docs/sons/previa.html', { waitUntil: 'load', timeout: 90000 });
  const previa = await pagina.evaluate(medirNaPagina, 'previa');
  console.log('voz'.padEnd(12), 'site pico/rms'.padEnd(16), 'prévia pico/rms'.padEnd(18), 'Δ pico  Δ rms');
  for (const nome of Object.keys(previa)) {
    const s = site[nome], p = previa[nome], dp = +(s.pico - p.pico).toFixed(1), dr = +(s.rms - p.rms).toFixed(1);
    const ok = Math.abs(dp) <= TOLERANCIA && Math.abs(dr) <= TOLERANCIA;
    if (!ok) falhou = true;
    console.log((ok ? '  ' : '✗ ') + nome.padEnd(10), (s.pico + ' / ' + s.rms).padEnd(16), (p.pico + ' / ' + p.rms).padEnd(18), String(dp).padStart(5), String(dr).padStart(6));
  }
  const v = site.visita, okV = v.pico <= TETO_VISITA;
  if (!okV) falhou = true;
  console.log((okV ? '  ' : '✗ ') + 'visita'.padEnd(10), (v.pico + ' / ' + v.rms).padEnd(16), '(teto ' + TETO_VISITA + ' dBFS de pico, com o fundo)');
} finally {
  await navegador.close();
}
console.log(falhou ? '\nFALHA: alguma voz fora da calibração.' : '\nTudo dentro da calibração.');
process.exit(falhou ? 1 : 0);
