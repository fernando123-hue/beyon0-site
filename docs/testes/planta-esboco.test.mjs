/* O ESBOÇO DA PLANTA VIVA v2 (js/planta-esboco.js) num DOM de mentira (docs/testes/planta-dom-falso.mjs). O que se prova:
   - a estação só se imprime com ela à vista DENTRO da caixa que rola (opcoes.rolagem, a caixa da conversa no celular), e a planta nunca rola nada;
   - refazer (opcoes.inicial, ao girar o celular ou redimensionar): o que já estava entendido aparece inteiro de uma vez, sem som e sem animação;
   - o texto da pessoa nunca entra no desenho: só frases das listas fechadas, sempre por textContent.
   node --test docs/testes/planta-esboco.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { criarJanela, textosDe } from './planta-dom-falso.mjs';

const require = createRequire(import.meta.url);
const Pecas = require('../../js/planta-pecas.js');
const Cresce = require('../../js/planta-cresce.js');
const Relogio = require('../../js/planta-relogio.js');
const Esboco = require('../../js/planta-esboco.js');

function ambiente(opcoes) {
  const w = criarJanela(opcoes);
  w.BZPlantaPecas = Pecas; w.BZPlantaCresce = Cresce;
  w.BZPlantaRelogio = Relogio.para(w);
  const E = Esboco.para(w);
  return { w, E, raiz: w.raiz() };
}
const BRIEFING_CHEIO = {
  negocio: { nome: 'Clínica Sorriso', segmento: 'clínica odontológica', descricao: 'implantes e clareamento' },
  situacao_atual: { como_chegam: 'Google e indicação', o_que_se_perde: 'gente pergunta preço e some' },
  objetivos: ['agendamentos'], funcionalidades: ['agendamento', 'whatsapp']
};
const acesas = (raiz) => raiz.porClasse('lv-txt').filter((li) => li._classes.has('is-aceso')).length;
const caixaDe = (topo, fundo) => ({ getBoundingClientRect: () => ({ top: topo, bottom: fundo, left: 0, right: 390, width: 390, height: fundo - topo }) });

test('com opcoes.rolagem, a estação fora da vista da caixa espera; quando a caixa rola até ela, imprime (a planta não rola a caixa)', () => {
  const { w, E, raiz } = ambiente();
  /* a caixa mostra só os primeiros 250 px do quadro: as estações 1 a 3 (centro em 84, 142 e 200) cabem; a 4ª (258 ± 18) não */
  const caixa = caixaDe(0, 250);
  let rolou = 0;
  caixa.scrollTop = 0; Object.defineProperty(caixa, 'scrollTop', { set() { rolou++; }, get() { return 0; } });
  const esb = E.criar(raiz, { rolagem: caixa });
  esb.crescer(Cresce.derivar(BRIEFING_CHEIO));
  w.mostrar(1);
  w.avancar(20000);
  assert.equal(acesas(raiz), 3, 'só as três estações à vista dentro da caixa');
  assert.equal(rolou, 0, 'a planta nunca mexe na rolagem');
  /* a pessoa rola a caixa: a caixa agora mostra o quadro inteiro */
  caixa.getBoundingClientRect = () => ({ top: -400, bottom: 500, left: 0, right: 390, width: 390, height: 900 });
  w.mostrar(1);
  w.avancar(20000);
  assert.equal(acesas(raiz), 6, 'as cinco estações e o objetivo');
  esb.parar();
});

test('opcoes.inicial: o esboço refeito (giro, nova largura) já nasce com tudo o que estava entendido, sem som e sem animação', () => {
  const { w, E, raiz } = ambiente();
  const sons = [];
  const esb = E.criar(raiz, { inicial: Cresce.derivar(BRIEFING_CHEIO), som: (n) => sons.push(n) });
  assert.equal(acesas(raiz), 6);
  assert.deepEqual(sons, []);
  assert.equal(w.document.animacoes.length, 0, 'nenhuma animação');
  assert.ok(raiz.porClasse('lv')[0]._classes.has('is-semeado'));
  /* e depois cresce normalmente: uma origem a mais na chegada é refeita com o sino mais baixo */
  const mais = JSON.parse(JSON.stringify(BRIEFING_CHEIO)); mais.situacao_atual.como_chegam = 'Google, indicação e Instagram';
  w.mostrar(1);
  esb.crescer(Cresce.derivar(mais));
  w.avancar(5000);
  assert.deepEqual(sons, ['refaz']);
  esb.parar();
});

test('o texto da pessoa nunca entra no desenho: um briefing com <img onerror> só escolhe frases das listas fechadas', () => {
  const { w, E, raiz } = ambiente({ reduzido: true });
  const sujo = {
    negocio: { nome: '<img src=x onerror=alert(1)>', segmento: '<script>alert(1)</script>', descricao: '<b>oi</b>' },
    situacao_atual: { como_chegam: 'pelo Google <img src=x onerror=alert(2)>', o_que_se_perde: '"><svg onload=alert(3)>' },
    objetivos: ['agendamentos'], funcionalidades: ['whatsapp']
  };
  const esb = E.criar(raiz, {});
  esb.crescer(Cresce.derivar(sujo));
  const tudo = textosDe(raiz).join(' ');
  assert.ok(!/<|onerror|onload|alert|oi<\/b>/.test(tudo), 'nada do texto da pessoa');
  assert.equal(w.document.todos.filter((n) => ['img', 'script', 'b'].includes(String(n.tagName).toLowerCase()) && n.textContent.includes('alert')).length, 0);
  esb.parar();
});

test('uma estação que lança não trava a fila: as outras seguem e a planta chega ao objetivo', () => {
  const { w, E, raiz } = ambiente();
  const avisos = [];
  w.console = { warn: (m) => avisos.push(m) };
  const original = Pecas.desenhar;
  w.BZPlantaPecas = Object.assign({}, Pecas, { desenhar: (tipo, n) => { if (tipo === 'conversa') throw new Error('peça quebrada'); return original(tipo, n); } });
  const E2 = Esboco.para(w);
  const esb = E2.criar(raiz, {});
  esb.crescer(Cresce.derivar(BRIEFING_CHEIO));
  w.mostrar(1);
  w.avancar(30000);
  assert.ok(avisos.some((m) => /peça quebrada/.test(m)), 'o erro é avisado');
  assert.ok(raiz.porClasse('lv-txt--led')[0]._classes.has('is-aceso'), 'o objetivo acendeu');
  assert.equal(esb.ocioso(), true);
  esb.parar();
  void E;
});

test('tocar no cartão com o repouso rodando não recria as animações (cada toque ao rolar a caixa somava animações no relógio)', () => {
  const { w, E, raiz } = ambiente();
  const esb = E.criar(raiz, {});
  esb.crescer(Cresce.derivar(BRIEFING_CHEIO));
  w.mostrar(1);
  w.avancar(30000);
  const card = raiz.porClasse('lv')[0];
  const antes = w.document.animacoes.length;
  for (let i = 0; i < 20; i++) card.disparar('pointerdown');
  assert.equal(w.document.animacoes.length, antes, 'nenhuma animação nova enquanto o repouso roda');
  /* o repouso acabou (10 voltas): o toque o traz de volta */
  w.ativas().forEach((a) => { if (a.opcoes.iterations === 10) a.finish(); });
  card.disparar('pointerdown');
  assert.ok(w.document.animacoes.length > antes, 'acabado, o toque o reinicia');
  esb.parar();
});

test('o relógio solta as animações canceladas (não guarda para sempre o que já não roda)', () => {
  const w = criarJanela();
  const rel = Relogio.para(w).criar();
  const el = w.document.createElement('div');
  const a = rel.anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
  const b = rel.anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
  assert.ok(typeof rel.quantas === 'function', 'o relógio diz quantas animações guarda');
  assert.equal(rel.quantas(), 2);
  b.cancel();
  assert.equal(rel.quantas(), 1, 'a cancelada saiu');
  void a;
});

/* achado 18 (26/11): no computador o cartão do esboço (rótulo 24 + quadro 408 + legenda 74 = 506 px) não cabia na caixa da conversa, que lá ROLA e
   corta (era min(60vh, 620px): 459 px numa tela de 768, 431 de conteúdo tirando o respiro de 14 + 14; desde 26/11 é min(max(60vh, 426px), 620px, calc(100vh - 224px)): o mesmo 431 em 768, 396 em 650). Medido em 1366x768: 76 px do quadro e a legenda
   inteira fora, e o objetivo preso na fila (fora da vista da caixa) mesmo depois de o mapa ficar pronto na faixa */
/* (26/11, dono: a legenda sem o rótulo repetido; no computador ela tem 2 linhas, 42 px, mais a margem de 10) */
const CAIXA_768 = 459 - 28, ROTULO = 24, LEGENDA_COMPUTADOR = 42 + 10;   /* (a caixa de 60vh numa janela de 768: 431 úteis, medido no E2E) */
test('computador: o esboço compacto (a caixa que rola e corta) cabe inteiro na caixa de uma janela de 768 de alto; onde a caixa não corta, nada muda', () => {
  for (const larg of [470, 535, 620]) {
    const g = ambiente().E.geometria(larg, CAIXA_768 - ROTULO - LEGENDA_COMPUTADOR);
    assert.ok(ROTULO + g.H + LEGENDA_COMPUTADOR <= CAIXA_768, larg + ' px: o cartão tem ' + (ROTULO + g.H + LEGENDA_COMPUTADOR) + ' px, a caixa ' + CAIXA_768);
    g.estacoes.forEach((e, k) => { if (k) assert.ok(e.texto.y >= g.estacoes[k - 1].texto.y + g.estacoes[k - 1].texto.h, 'os textos não se sobrepõem'); });
    assert.ok(g.led.cy + g.led.r <= g.H, 'o objetivo cabe no quadro');
  }
  for (const larg of [276, 346, 800]) assert.equal(ambiente().E.geometria(larg).H, 408, larg + ' px: celular e tablet (a caixa não corta), a geometria de sempre');
  const { E, raiz } = ambiente({ largura: 620 });
  E.criar(raiz, { compacto: CAIXA_768 }).parar();
  assert.ok(raiz.porClasse('lv')[0]._classes.has('lv--compacto'), 'a classe do título numa linha (reticências no CSS)');
});

test('marcarPronta: a planta ficou pronta (a faixa do computador): o que esperava na fila imprime de uma vez, sem som nem animação, e o rótulo deixa "em construção"', () => {
  const { w, E, raiz } = ambiente({ largura: 620 });
  const sons = [];
  /* a caixa mostra só o alto do quadro: o objetivo e as últimas estações esperam na fila (o que se mediu em 1366x768) */
  const esb = E.criar(raiz, { rolagem: caixaDe(0, 150), som: (n) => sons.push(n), compacto: CAIXA_768 });
  esb.crescer(Cresce.derivar(BRIEFING_CHEIO));
  w.mostrar(1);
  w.avancar(20000);
  const kicker = () => raiz.porClasse('lv-kicker')[0].textContent;
  assert.ok(acesas(raiz) < 6 && /em construção/.test(kicker()), 'antes: estações na fila e "em construção"');
  const nSons = sons.length, nAnim = w.document.animacoes.length;
  esb.marcarPronta(true);
  assert.equal(acesas(raiz), 6, 'as cinco estações e o objetivo');
  assert.ok(!/em construção/.test(kicker()) && /pronta/.test(kicker()), 'o rótulo: ' + kicker());
  assert.equal(sons.length, nSons, 'sem som (o ouro da faixa é o som da consagração)');
  assert.equal(w.document.animacoes.filter((a, i) => i >= nAnim && a.opcoes.iterations !== 10).length, 0, 'sem animação de estação');
  assert.equal(esb.ocioso(), true);
  esb.marcarPronta(false);
  assert.ok(/em construção/.test(kicker()), 'a planta saiu: volta a "em construção"');
  esb.parar();
});

test('marcarPronta com uma estação no meio e o esboço fora da tela (o relógio pausado: a página foi até a faixa): a fila sai assim mesmo', () => {
  const { w, E, raiz } = ambiente({ largura: 620 });
  const esb = E.criar(raiz, { compacto: CAIXA_768 });
  esb.crescer(Cresce.derivar(BRIEFING_CHEIO));
  w.mostrar(1);
  w.avancar(100);   /* a semente no meio */
  w.mostrar(0);     /* a pessoa foi até a faixa: o esboço sai da tela e o relógio pausa */
  w.avancar(20000);
  assert.ok(acesas(raiz) < 6, 'parado no meio');
  esb.marcarPronta(true);
  assert.equal(acesas(raiz), 6, 'as cinco estações e o objetivo, mesmo fora da tela');
  assert.equal(esb.ocioso(), true);
  assert.ok(/pronta/.test(raiz.porClasse('lv-kicker')[0].textContent));
  esb.parar();
});

/* revisão do achado 18: num notebook 1366x768 de verdade (o navegador e a barra de tarefas) a janela útil tem ~650 px e a caixa, com 60vh, ~362 úteis (396 com o mínimo de 426 px): o
   cartão de 428 voltava a cortar. O passo do compacto sai da altura útil da caixa, entre 44 e 36; o chip encolhe junto, sem encostar no vizinho */
test('computador: o passo do compacto sai da altura da caixa (44 a 36); se nem no 36 couber, fica no 36, com o objetivo ainda à vista', () => {
  const { E } = ambiente();
  for (const [util, fora] of [[431, 76], [431, 97], [412, 76], [400, 76], [362, 76], [362, 97], [250, 76]]) {
    const g = E.geometria(600, util - fora), cartao = g.H + fora;
    assert.ok(g.passo <= 44 && g.passo >= 36, 'passo ' + g.passo);
    assert.ok(cartao <= util || g.passo === 36, util + ' úteis, ' + fora + ' de rótulo e legenda: cartão ' + cartao + ' com passo ' + g.passo);
    /* o MAIOR passo que cabe: com um a mais, já não cabe (H(p) = 54 + 5p + chip/2 + 34, o chip = min(36, p - 6)) */
    const H = (p) => 54 + 5 * p + Math.min(36, p - 6) / 2 + 34;
    assert.equal(H(g.passo), g.H, 'a conta do teste é a do módulo');
    if (g.passo < 44) assert.ok(fora + H(g.passo + 1) > util, 'passo ' + g.passo + ': com ' + (g.passo + 1) + ' caberia');
    g.estacoes.forEach((e, k) => { if (k) assert.ok(e.cy - g.estacoes[k - 1].cy >= g.chip + 6, 'os chips não se encostam'); });
    g.estacoes.forEach((e, k) => { if (k) assert.ok(e.texto.y >= g.estacoes[k - 1].texto.y + g.estacoes[k - 1].texto.h, 'os textos não se sobrepõem'); });
    assert.ok(g.estacoes[0].texto.h >= 36, 'cabe o verbo e uma linha de título');
    if (util >= 362) assert.ok(24 + g.led.cy + g.led.r <= util, 'o objetivo (o LED) fica dentro da caixa (num notebook de 768 com o navegador)');
  }
  assert.ok(E.geometria(600, 431 - 76).passo === 44, 'com folga, o passo de 44');
  assert.ok(E.geometria(600, 362 - 76).passo < 44, 'na caixa de 362, o passo encolhe');
  assert.equal(E.geometria(600, 396 - 99).passo, 38, 'na caixa de 426 px numa janela de 650 (396 úteis), com as falas acima do cartão (rótulo 24 + 75), o passo de 38');
});

test('marcarPronta interrompendo uma estação no meio: a legenda termina com a estação que estava sendo impressa (o ler() dela era um timer do relógio velho)', () => {
  const { w, E, raiz } = ambiente({ largura: 620 });
  const esb = E.criar(raiz, { compacto: CAIXA_768 });
  esb.crescer(Cresce.derivar(BRIEFING_CHEIO));
  w.mostrar(1);
  w.avancar(30000);
  const legenda = () => raiz.porClasse('lv-leitura__txt')[0].textContent;
  const antes = legenda();
  /* uma origem a mais: a chegada é refeita, e a pessoa vai à faixa no meio da luz (antes do ler, aos 350 ms) */
  const mais = JSON.parse(JSON.stringify(BRIEFING_CHEIO)); mais.situacao_atual.como_chegam = 'Google, indicação e Instagram';
  esb.crescer(Cresce.derivar(mais));
  w.avancar(100);
  esb.marcarPronta(true);
  const chegada = Cresce.derivar(mais).estacoes[0].frase;
  assert.notEqual(chegada, antes);
  assert.equal(legenda(), E.semViuva(chegada), 'a legenda é a da chegada refeita, não a do objetivo');
  esb.parar();
});

/* 26/11, dono: "OBJETIVO" aparecia duas vezes, no nó e na legenda logo abaixo. A legenda explica a estação que acabou de aparecer: repetir o nome dela
   não acrescenta nada. Fica só a frase, e a legenda encolhe para a altura dela (3 linhas no celular, 2 no computador, de 21 px: Sora 14/1.5) */
test('a legenda é só a frase: sem o rótulo da estação (o nó já diz qual é)', () => {
  const { w, E, raiz } = ambiente({ largura: 346 });
  const esb = E.criar(raiz, {});
  assert.equal(raiz.porClasse('lv-leitura__tag').length, 0, 'sem o rótulo na legenda');
  esb.crescer(Cresce.derivar(BRIEFING_CHEIO));
  w.mostrar(1);
  w.avancar(30000);
  const esboco = Cresce.derivar(BRIEFING_CHEIO);
  assert.equal(raiz.porClasse('lv-leitura__txt')[0].textContent, E.semViuva(esboco.objetivo.frase), 'a frase da última estação');
  assert.equal(raiz.porClasse('lv-leitura')[0].attrs['aria-hidden'], 'true', 'segue fora do leitor de tela (o anúncio é o role=status)');
  assert.match(raiz.porClasse('lv-sr')[0].textContent, /Nova etapa na planta: /, 'o leitor de tela recebe o mesmo anúncio de antes');
  esb.parar();
  /* a altura da legenda é conferida por comportamento, não por regex no CSS: docs/e2e-planta.mjs mede as 835 frases no cartão de verdade, na Sora e na
     fonte de reserva, em 320, 390, 930 e 1366 (abaixo de 360 px, com uma linha de sobra) */
});

/* revisão da caixa (26/11): o quadro inteiro à vista com a pergunta do Zero no topo da caixa. opcoes.acima (o que as falas ocupam acima do cartão)
   entra no desconto quando passa da legenda; sem ele, o de sempre */
test('opcoes.acima: o passo do compacto desconta as falas acima do cartão quando elas pesam mais que a legenda', () => {
  const { E } = ambiente({ largura: 620 });
  const passo = (op) => { const r = ambiente({ largura: 620 }).raiz; const esb = E.criar(r, op); const p = esb.interno.g.passo; esb.parar(); return p; };
  /* (no DOM de mentira o cartão não tem layout: o rótulo e a legenda valem a reserva de 97, e o topo do quadro, 0) */
  assert.equal(passo({ compacto: 396 }), E.geometria(600, 396 - 97).passo, 'sem acima: o de sempre');
  assert.equal(passo({ compacto: 396, acima: 200 }), E.geometria(600, 396 - 200).passo, 'com as falas pesando mais: o desconto é o delas');
  assert.ok(passo({ compacto: 396, acima: 200 }) < passo({ compacto: 396 }));
});
