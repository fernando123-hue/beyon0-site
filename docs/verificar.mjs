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
     npm install                   # só a lib; o navegador já existe no ambiente
     npm run verificar

   O Playwright está declarado como devDependency, nunca como dependency: o
   site publicado continua sem passo de instalação e sem dependência de
   runtime. O three.js também não vem do npm — está vendorado em
   vendor/three/ e é carregado direto pelo navegador.

   Se o Playwright reclamar que falta navegador, aponte o que já está instalado:
     CHROMIUM=/opt/pw-browsers/chromium node docs/verificar.mjs
   ========================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const EXEC = process.env.CHROMIUM || undefined;

/* Os alvos de celular simulam TOQUE, não só a largura. Só estreitar a janela
   deixa `(pointer: fine)` verdadeiro, o 3D carrega, e o verificador mede um
   caminho que nenhum celular percorre — foi assim que 163px de vão no hero do
   Hub, em todo celular, passaram como OK. Achado na quarta revisão. */
const CELULAR = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
/* OS ALVOS -3d FORÇAM A CAMADA 3D (`?3d=forcar`).
   Desde a sétima sessão, js/cena.js não monta o 3D quando o WebGL seria
   desenhado pela CPU (failIfMajorPerformanceCaveat) — e este verificador roda
   justamente em SwiftShader. Sem estes alvos, o 3D sairia da cobertura em
   silêncio. Neles a exigência é o 3D MONTAR e CONTINUAR montado durante a
   medição, sem erro de console; o fps é só informativo, porque mede WebGL
   por software, não o que um visitante com placa de vídeo vê (sétima sessão:
   ~38fps aqui, contra 60 na GPU).
   E O CONTRÁRIO TAMBÉM É EXIGIDO: nos alvos normais o 3D NÃO pode montar —
   é o contrato "software e toque ficam sem 3D". Se o porteiro regredir, o
   alvo falha dizendo isso, em vez de cair num fps baixo sem explicação. */
const ALVOS = [
  ['/index.html',            'hub',        DESKTOP],
  ['/sites.html',            'sites',      DESKTOP],
  ['/automacao.html',        'automacao',  DESKTOP],
  ['/index.html',            'hub-cel',    CELULAR],
  ['/sites.html',            'sites-cel',  CELULAR],
  ['/automacao.html',        'autom-cel',  CELULAR],
  ['/index.html?3d=forcar',  'hub-3d',     DESKTOP, { exige3d: true }],
  ['/sites.html?3d=forcar',  'sites-3d',   DESKTOP, { exige3d: true }]
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

for (const [rota, nome, opcoes, { exige3d = false } = {}] of ALVOS) {
  const ctx = await navegador.newContext(opcoes);
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
      /* o AI Core precisa de caixa: sem ela js/field.js não desenha nada.
         Este campo ERA coletado e nunca conferido — o verificador dizia OK
         para uma página sem AI Core, exatamente a classe de bug que ele
         existe para pegar. Achado na segunda revisão. */
      reator: !!document.querySelector('.hero__reactor'),
      /* as caixas `.cena` são só MEDIDA: nenhuma pode ocupar espaço no
         layout. Uma delas em fluxo empurrou o título do Hub 163px para baixo
         em todo celular. */
      cenaForaDoFluxo: [...document.querySelectorAll('.cena')]
        .every(e => getComputedStyle(e).position === 'absolute')
    };
  });

  const fps = await medirFps(page);
  /* relido DEPOIS da medição: se o 3D montar e se desligar sozinho durante
     ela (`desligar()` tira a classe), a leitura de antes não veria. */
  d.tem3d = await page.evaluate(() => document.body.classList.contains('tem-3d'));

  /* Ruído do ambiente, não do site: a CSP do proxy bloqueia o Google Fonts
     (ERR_CERT) e o driver de software avisa sobre ReadPixels.

     `Failed to load resource` NÃO entra nesta lista. Ele é o prefixo genérico
     de toda falha de rede do Chromium — filtrá-lo fazia um 404 numa folha de
     estilo, num script ou no módulo do three passar como OK e sair com código
     0. Um verificador que esconde 404 é pior que não ter verificador. A linha
     do Google Fonts já é pega pelo ERR_CERT que vem junto dela. */
  const reais = erros.filter(e => !/ERR_CERT|fonts\.googleapis|GPU stall/.test(e));

  const ok = d.boot && d.reator && d.cenaForaDoFluxo && d.overflowX === 0 && d.waProntos === d.waTotal && reais.length === 0 &&
    (exige3d ? d.tem3d : (!d.tem3d && fps > 45));
  if (!ok) falhou = true;

  console.log(
    (ok ? 'OK  ' : 'FALHA ') + nome.padEnd(11),
    'fps=' + String(fps).padStart(5) + (exige3d ? '(info)' : ''),
    'rolagemX=' + d.overflowX,
    'wa=' + d.waProntos + '/' + d.waTotal,
    'nucleo=' + d.reator,
    'cenaFora=' + d.cenaForaDoFluxo,
    '3d=' + d.tem3d,
    reais.length ? '\n     erros: ' + reais.join('\n     ') : ''
  );

  await ctx.close();
}

await navegador.close();
console.log(falhou ? '\nAlguma coisa falhou — leia acima.' : '\nTudo certo.');
process.exit(falhou ? 1 : 0);
