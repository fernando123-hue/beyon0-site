/* ==========================================================================
   VERIFICADOR — abre o site num navegador de verdade e confere.

   POR QUE ESTE ARQUIVO EXISTE
   Até 2026-09-22 nenhuma sessão de agente tinha conseguido VER este site
   rodando (ver HANDOFF seção 7: `document.hidden`, rAF que nunca dispara,
   servidor inalcançável). Todo o design era verificado por leitura de código e
   dependia do olho do dono. Num ambiente com Chromium + Playwright isso deixou
   de ser verdade, e seis bugs de render apareceram no primeiro uso — nenhum
   deles visível na leitura.

   Não é dependência do site: `docs/` está no .vercelignore, nada disto é
   publicado. O projeto continua com ZERO dependência de runtime.

   COMO RODAR
     npx --yes http-server -p 8080 -c-1 -a 127.0.0.1 &
     npm install playwright        # só a lib; o navegador já existe no ambiente
     node docs/verificar.mjs

   Se o Playwright reclamar que falta navegador, aponte o que já está instalado:
     CHROMIUM=/opt/pw-browsers/chromium node docs/verificar.mjs
   ========================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const EXEC = process.env.CHROMIUM || undefined;

const ALVOS = [
  ['/index.html',     'hub',       { width: 1440, height: 900 }],
  ['/sites.html',     'sites',     { width: 1440, height: 900 }],
  ['/automacao.html', 'automacao', { width: 1440, height: 900 }],
  ['/index.html',     'hub-390',   { width: 390,  height: 844 }],
  ['/sites.html',     'sites-390', { width: 390,  height: 844 }]
];

/* fps por contagem de rAF — o número que importa, medido como o olho mede */
const medirFps = (page, seg = 3) => page.evaluate(s => new Promise(ok => {
  let n = 0; const t0 = performance.now();
  (function volta() {
    n++;
    performance.now() - t0 < s * 1000 ? requestAnimationFrame(volta)
                                      : ok(+(n / ((performance.now() - t0) / 1000)).toFixed(1));
  })();
}), seg);

const navegador = await chromium.launch({
  executablePath: EXEC,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']   /* sem GPU no container */
});

let falhou = false;

for (const [rota, nome, viewport] of ALVOS) {
  const ctx = await navegador.newContext({ viewport });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await page.goto(BASE + rota, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  const d = await page.evaluate(() => {
    const B = window.BEYON;
    const wa = [...document.querySelectorAll('[data-wa]')];
    return {
      boot: !!B,
      /* ROLAGEM LATERAL: zero, sempre. Já quebrou duas vezes — uma pelas
         folhas de vidro do palco, outra pelo retângulo de medida do portal. */
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      waProntos: wa.filter(a => (a.getAttribute('href') || '').startsWith('https://wa.me/')).length,
      waTotal: wa.length,
      tem3d: document.body.classList.contains('tem-3d'),
      /* o AI Core precisa de caixa: sem ela js/field.js não desenha nada */
      reator: !!document.querySelector('.hero__reactor'),
      titulo: document.title
    };
  });

  const fps = await medirFps(page);

  /* ruído do ambiente, não do site: a CSP do proxy bloqueia o Google Fonts e
     o driver de software avisa sobre ReadPixels. Nenhum dos dois é bug nosso. */
  const reais = erros.filter(e => !/ERR_CERT|fonts\.googleapis|GPU stall|Failed to load resource/.test(e));

  const ok = d.boot && d.overflowX === 0 && d.waProntos === d.waTotal && reais.length === 0 && fps > 45;
  if (!ok) falhou = true;

  console.log(
    (ok ? 'OK  ' : 'FALHA ') + nome.padEnd(11),
    'fps=' + String(fps).padStart(5),
    'rolagemX=' + d.overflowX,
    'wa=' + d.waProntos + '/' + d.waTotal,
    '3d=' + d.tem3d,
    reais.length ? '\n     erros: ' + reais.join('\n     ') : ''
  );

  await ctx.close();
}

await navegador.close();
console.log(falhou ? '\nAlguma coisa falhou — leia acima.' : '\nTudo certo.');
process.exit(falhou ? 1 : 0);
