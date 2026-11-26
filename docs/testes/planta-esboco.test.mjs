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
   corta (min(60vh, 620px): 459 px numa tela de 768, 431 de conteúdo tirando o respiro de 14 + 14). Medido em 1366x768: 76 px do quadro e a legenda
   inteira fora, e o objetivo preso na fila (fora da vista da caixa) mesmo depois de o mapa ficar pronto na faixa */
const CAIXA_768 = 459 - 28, ROTULO = 24, LEGENDA_COMPUTADOR = 64 + 10;
test('computador: o esboço compacto (a caixa que rola e corta) cabe inteiro na caixa de uma janela de 768 de alto; onde a caixa não corta, nada muda', () => {
  for (const larg of [470, 535, 620]) {
    const g = ambiente().E.geometria(larg, true);
    assert.ok(ROTULO + g.H + LEGENDA_COMPUTADOR <= CAIXA_768, larg + ' px: o cartão tem ' + (ROTULO + g.H + LEGENDA_COMPUTADOR) + ' px, a caixa ' + CAIXA_768);
    g.estacoes.forEach((e, k) => { if (k) assert.ok(e.texto.y >= g.estacoes[k - 1].texto.y + g.estacoes[k - 1].texto.h, 'os textos não se sobrepõem'); });
    assert.ok(g.led.cy + g.led.r <= g.H, 'o objetivo cabe no quadro');
  }
  for (const larg of [276, 346, 800]) assert.equal(ambiente().E.geometria(larg).H, 408, larg + ' px: celular e tablet (a caixa não corta), a geometria de sempre');
  const { E, raiz } = ambiente({ largura: 620 });
  E.criar(raiz, { compacto: true }).parar();
  assert.ok(raiz.porClasse('lv')[0]._classes.has('lv--compacto'), 'a classe do título numa linha (reticências no CSS)');
});

test('marcarPronta: a planta ficou pronta (a faixa do computador): o que esperava na fila imprime de uma vez, sem som nem animação, e o rótulo deixa "em construção"', () => {
  const { w, E, raiz } = ambiente({ largura: 620 });
  const sons = [];
  /* a caixa mostra só o alto do quadro: o objetivo e as últimas estações esperam na fila (o que se mediu em 1366x768) */
  const esb = E.criar(raiz, { rolagem: caixaDe(0, 150), som: (n) => sons.push(n), compacto: true });
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
  const esb = E.criar(raiz, { compacto: true });
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
