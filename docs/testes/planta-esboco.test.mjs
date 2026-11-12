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
