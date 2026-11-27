/* Mede a linha da anotação da IA (mapa vivo 1b, js/orcamento-anotacao.js) no navegador de verdade, sem servidor de API: abre /orcamento,
   mostra a caixa, liga o módulo com um estado de mentira (reacao: true) e uma `reagir` de mentira, e mede em cada largura:
   a altura do lugar no aviso e com a anotação mais longa (90 caracteres), se a caixa se moveu quando a linha chegou (CLS fora da interação)
   e se o lugar e a caixa cabem na tela com o teclado aberto (altura visível simulada). Salva os PNG em docs/olhar-anotacao/.
   BASE=http://127.0.0.1:8899 CHROMIUM=... node docs/olhar-anotacao.mjs */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PASTA = 'docs/olhar-anotacao';
const LONGA = 'clínica de odontologia em Niterói, quer mais pacientes agendando pelo Instagram e WhatsApp';   /* 90 caracteres, o teto do servidor */
const ALTURAS_COM_TECLADO = { 390: 508, 320: 400 };   /* a janela encolhida pelo teclado virtual: as mesmas medidas de docs/zoom-planta.mjs (390x844 e 320x640) */
mkdirSync(PASTA, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const saida = [];
for (const largura of [390, 320]) {
  for (const reduzido of [false, true]) {
    const altura = ALTURAS_COM_TECLADO[largura];
    const page = await browser.newPage({ viewport: { width: largura, height: altura }, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
    await page.goto(BASE + '/orcamento', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.BZOrcAnotacao);
    await page.evaluate(async (longa) => {
      const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
      const form = document.getElementById('o-form');
      let el = form; while (el) { el.hidden = false; el = el.parentElement; }
      form.classList.remove('is-recolhido');
      let resolver;
      window.BZOrcamento.temSessao = () => true;
      window.BZOrcamento.reagir = () => new Promise((ok) => { resolver = ok; });
      /* o CLS é observado DESDE ANTES do render com reacao: true (revisão técnica do #276, achado 3): o lugar só pode entrar colado a uma ação */
      window.__cls = { semInteracao: 0, comInteracao: 0 };
      new PerformanceObserver((l) => { l.getEntries().forEach((e) => { window.__cls[e.hadRecentInput ? 'comInteracao' : 'semInteracao'] += e.value; }); }).observe({ type: 'layout-shift', buffered: false });
      const campo = document.getElementById('o-texto');
      campo.scrollIntoView({ block: 'end', behavior: 'instant' });
      await espera(100);
      window.BZOrcAnotacao.atualizar({ reacao: true, planta_editavel: true, mensagens: [], conversa: { id: 'c1' } });
      await espera(600);
      window.__olhar = { resolver: (r) => resolver(r), montadoSemToque: !!document.getElementById('o-anota') };
      return null;
    }, LONGA);
    await page.click('#o-texto');   /* a pessoa toca a caixa: é aí que o lugar entra */
    await page.evaluate(async () => {
      const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
      await espera(700);
      const lugar = document.getElementById('o-anota'), texto = lugar.querySelector('.orc-anota__texto');
      const tres = parseFloat(getComputedStyle(texto).minHeight);   /* (as linhas reservadas: 3, ou 4 abaixo de 360 px) */
      Object.assign(window.__olhar, { hAviso: lugar.getBoundingClientRect().height, avisoCabe: texto.getBoundingClientRect().height <= tres + 1, tres,
        topoAviso: lugar.querySelector('.orc-anota__topo').getBoundingClientRect().height });
    });
    await page.screenshot({ path: `${PASTA}/aviso-${largura}${reduzido ? '-reduzido' : ''}.png` });
    /* digitado com teclas de verdade: a caixa que cresce enquanto ela digita é interação dela (um valor posto por código contaria como CLS falso) */
    await page.keyboard.type('Tenho uma clínica de odontologia em Niterói e quero mais agendamentos pelo Instagram e pelo WhatsApp');
    const r = await page.evaluate(async (longa) => {
      const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
      const { hAviso, avisoCabe, topoAviso, tres, montadoSemToque } = window.__olhar;
      const lugar = document.getElementById('o-anota'), campo = document.getElementById('o-texto');
      await espera(900);   /* a pausa de 700 ms passou: a chamada saiu; a linha chega 1,5 s depois, sem interação no meio */
      const topoCaixa = campo.getBoundingClientRect().top;
      await espera(1500);
      window.__olhar.resolver({ reacao: { anotacao: longa }, seq: 1, motivo: 'ok' });
      await espera(2500);
      const texto = lugar.querySelector('.orc-anota__texto');
      return {
        hAviso, avisoCabe, topoAviso, topoAnota: lugar.querySelector('.orc-anota__topo').getBoundingClientRect().height, hAnota: lugar.getBoundingClientRect().height,
        anotaCabe: texto.getBoundingClientRect().height <= tres + 1, montadoSemToque,
        caixaMoveu: Math.round(campo.getBoundingClientRect().top - topoCaixa),
        cls: Number(window.__cls.semInteracao.toFixed(4)), clsColadoAoToque: Number(window.__cls.comInteracao.toFixed(4)),
        lugarVisivel: lugar.querySelector('.orc-anota__quem').getBoundingClientRect().top >= (document.getElementById('nav') ? document.getElementById('nav').getBoundingClientRect().bottom : 0) - 1,   /* (o rótulo de IA, que abre a frase, abaixo do topo fixo e não só do zero da tela) */
        caixaVisivel: campo.getBoundingClientRect().bottom <= window.innerHeight + 1,
        frase: texto.textContent
      };
    }, LONGA);
    await page.screenshot({ path: `${PASTA}/anotacao-${largura}${reduzido ? '-reduzido' : ''}.png` });
    saida.push({ largura, reduzido, ...r });
    /* o envio: a anotação vira a 1ª linha do cartão de espera (o mesmo evento que js/orcamento.js dispara em ocupado(true)) */
    await page.evaluate(() => { const p = document.getElementById('o-pensando'); p.hidden = false; document.dispatchEvent(new CustomEvent('bz:pensando', { detail: { ativo: true } })); p.scrollIntoView({ block: 'center', behavior: 'instant' }); });
    await page.screenshot({ path: `${PASTA}/espera-${largura}${reduzido ? '-reduzido' : ''}.png` });
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(saida, null, 1));
const ruim = saida.filter((s) => s.montadoSemToque || !s.avisoCabe || !s.anotaCabe || s.caixaMoveu !== 0 || s.cls > 0 || s.hAviso !== s.hAnota || s.topoAviso > 30 || s.topoAnota > 30 || !s.lugarVisivel || !s.caixaVisivel);
if (ruim.length) { console.log('FALHOU em', ruim.map((s) => s.largura + (s.reduzido ? ' reduzido' : '')).join(', ')); process.exit(1); }
console.log('ok: o lugar só entra no toque; o aviso e a anotação de 90 caracteres cabem no mesmo lugar; a caixa não se move e CLS 0 sem interação');
