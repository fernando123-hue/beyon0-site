/* A CONSAGRAÇÃO NA PÁGINA DE ORÇAMENTO (planta viva v2, PR da consagração): js/orcamento-planta.js + js/orcamento-planta-esboco.js com os módulos REAIS
   (forma, peças, layout, desenho, crescimento, relógio, esboço) num DOM de mentira. Decisões do dono de 12/11:
   - celular (< 960 px): a planta consagra NO CARTÃO da conversa (a faixa #o-planta não é usada); o voo sai do esboço; "Ver a planta do seu site"
     rola a CAIXA até o cartão; a caixa rola sozinha até o cartão só se a pessoa não rolou a caixa à mão nos últimos ~3 s; nunca a página;
   - computador (>= 960 px): a faixa larga, como hoje; o voo só sai do esboço se ele estiver à vista quando a entrada começa;
   - a planta que some do estado devolve o cartão ao esboço; o formulário de contato não recolhe o cartão.
   node --test docs/testes/planta-consagracao-pagina.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { criarJanela } from './planta-dom-falso.mjs';

const require = createRequire(import.meta.url);
const Forma = require('../../js/orcamento-planta-forma.js');
const Pecas = require('../../js/planta-pecas.js');
const Layout = require('../../js/planta-layout.js');
const Desenho = require('../../js/planta-desenho.js');
const Cresce = require('../../js/planta-cresce.js');
const Relogio = require('../../js/planta-relogio.js');
const Esboco = require('../../js/planta-esboco.js');
const Faixa = require('../../js/orcamento-planta.js');
const Ligacao = require('../../js/orcamento-planta-esboco.js');
const fx = (n) => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));

function ambiente({ largura = 390, recusar = false } = {}) {
  const w = criarJanela({ largura });
  const doc = w.document;
  const ids = {};
  const novo = (tag, id) => { const n = doc.createElement(tag); if (id) ids[id] = n; return n; };
  doc.getElementById = (id) => ids[id] || null;
  doc.head = novo('head');
  const main = novo('main');
  const mesa = novo('div'); mesa.getBoundingClientRect = () => ({ top: 100, bottom: 1500, height: 1400, left: 0, right: largura, width: largura }); main.appendChild(mesa);
  const caixa = novo('div', 'o-log-caixa'); mesa.appendChild(caixa);
  /* a caixa cobre a área do esboço no DOM de mentira (onde todo retângulo começa em 0): as estações imprimem */
  caixa.getBoundingClientRect = () => ({ top: 0, bottom: 2000, left: 0, right: largura, width: largura, height: 2000 });
  caixa.scrollTop = 0;
  const log = novo('ol', 'o-log'); caixa.appendChild(log);
  const abertura = novo('li'); abertura.className = 'msg msg--agente'; log.appendChild(abertura);
  const faixa = novo('section', 'o-planta'); faixa.hidden = true; faixa.clientWidth = largura; main.appendChild(faixa);
  novo('textarea', 'o-texto'); novo('form', 'o-form');
  /* as falas, como o js/orcamento.js desenha (antes do cartão, que fica por último) */
  const falas = (E) => {
    [...log.filhos].filter((f) => f !== abertura && !('data-fica' in f.attrs)).forEach((f) => log.removeChild(f));
    const fica = log.filhos.find((f) => 'data-fica' in f.attrs) || null;
    E.mensagens.forEach((m) => { const li = doc.createElement('li'); li.className = 'msg msg--' + (m.papel === 'agente' ? 'agente' : 'visitante'); li.appendChild(doc.createElement('p')); log.insertBefore(li, fica); });
  };
  const anexarLog = log.appendChild.bind(log);
  log.appendChild = (c) => { anexarLog(c); c.clientWidth = largura - 2; return c; };
  /* o carregador: cada <script>/<link> "baixa" no próximo tique */
  const sons = [];
  const fonte = {
    'js/orcamento-planta-forma.js': () => { w.BZPlantaForma = Forma; }, 'js/planta-pecas.js': () => { w.BZPlantaPecas = Pecas; },
    'js/planta-layout.js': () => { w.BZPlantaLayout = Layout; }, 'js/planta-desenho.js': () => { w.BZPlanta = Desenho.criar(w); if (recusar) w.BZPlanta.montar = () => ({ ok: false, motivos: ['sem_largura'] }); },
    'js/planta-cresce.js': () => { w.BZPlantaCresce = Cresce; }, 'js/planta-relogio.js': () => { w.BZPlantaRelogio = Relogio.para(w); },
    'js/planta-som.js': () => { w.BZPlantaSom = { tocar: (n) => sons.push(n), mostrarBotoes() {}, preparar() {} }; },
    'js/planta-esboco.js': () => { w.BZPlantaEsboco = Esboco.para(w); }
  };
  const anexar = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (s) => { anexar(s); const url = String(s.tagName).toLowerCase() === 'link' ? s.href : s.src; w.setTimeout(() => { if (fonte[url]) fonte[url](); s.disparar('load'); }, 0); return s; };
  const avisos = [];
  w.console = { warn: (...a) => avisos.push(a.join(' ')) };
  w.innerHeight = 844;
  const rolouPagina = [];
  w.BZOrcEsboco = Ligacao.criar(w);
  const P = Faixa.criar(w);
  const deps = { rolarAte: (el) => rolouPagina.push(el), enviar: () => Promise.resolve(true) };
  const render = (E) => { falas(E); P.atualizar(E, deps); w.BZOrcEsboco.atualizar(E); };
  return { w, doc, log, caixa, faixa, render, sons, avisos, rolouPagina, ids };
}
const BRIEF = { negocio: { nome: 'Clínica Aurora', segmento: 'clínica odontológica', descricao: 'implantes' }, situacao_atual: { como_chegam: 'Google e indicação', o_que_se_perde: 'somem' }, objetivos: ['agendamentos'], funcionalidades: ['agendamento', 'whatsapp'] };
function estado(nZero, planta) {
  const mensagens = [];
  for (let i = 0; i < nZero; i++) mensagens.push({ papel: 'visitante', conteudo: 'oi ' + i }, { papel: 'agente', conteudo: 'resposta ' + i });
  const E = { conversa: { etapa: 'estimativa', briefing: BRIEF }, mensagens, planta_editavel: true };
  if (planta) E.planta = { versao: 1, origem: 'modelo', n_mensagens: mensagens.length - 1, plano: fx('clinica') };
  return E;
}
const cartao = (amb) => amb.log.filhos.find((f) => 'data-fica' in f.attrs);
const ate = (amb, ms) => amb.w.avancar(ms);
/* o esboço crescendo ao vivo (como numa conversa nova) */
function comEsboco(amb) {
  amb.render(estado(0));
  amb.render(estado(1)); ate(amb, 20);
  amb.render(estado(2)); amb.w.mostrar(1); ate(amb, 20000);
  assert.ok(cartao(amb).porClasse('lv').length === 1, 'o esboço cresceu no cartão');
}

test('celular: a planta consagra NO CARTÃO (a faixa fica escondida), o voo sai do esboço e termina em ouro com "Planta pronta"', () => {
  const amb = ambiente();
  comEsboco(amb);
  amb.render(estado(3, true)); ate(amb, 20);
  amb.render(estado(3, true));
  const li = cartao(amb);
  assert.ok(li.porClasse('plv').length === 1, 'o desenho final está no cartão');
  assert.equal(li.porClasse('lv').length, 0, 'o esboço saiu do cartão');
  assert.equal(amb.faixa.hidden, true, 'a faixa não é usada no celular');
  assert.ok(amb.log.lastElementChild === li, 'o cartão segue o último item');
  amb.w.mostrar(1);
  const voos = li.achar((n) => n._classes && n._classes.has('plv-mov')).filter((m) => m.animacoes.some((a) => /scale\(/.test(a.keyframes[0].transform || '')));
  assert.ok(voos.length >= 3, 'as estações do esboço voam: ' + voos.length);
  ate(amb, 15000);
  assert.equal(li.porClasse('plv-leitura__tag')[0].textContent, 'Planta pronta');
  assert.ok(amb.sons.includes('ouro'));
  assert.equal(amb.rolouPagina.length, 0, 'a página nunca rola');
});

test('celular: a caixa rola sozinha até o cartão depois da fala, se a pessoa não mexeu na caixa à mão nos últimos 3 s', () => {
  const amb = ambiente();
  comEsboco(amb);
  amb.caixa.scrollTop = 0;
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  const li = cartao(amb);
  li.getBoundingClientRect = () => ({ top: 700, bottom: 1700, left: 0, right: 390, width: 390, height: 1000 });
  ate(amb, 1300);
  assert.equal(amb.caixa.scrollTop, 700 - 0 - 8, 'o topo do cartão a 8 px do topo da caixa');
  assert.equal(amb.rolouPagina.length, 0);
});

test('celular: com a pessoa rolando a caixa à mão (nos últimos 3 s), a caixa NÃO rola sozinha', () => {
  const amb = ambiente();
  comEsboco(amb);
  amb.caixa.scrollTop = 123;
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  cartao(amb).getBoundingClientRect = () => ({ top: 700, bottom: 1700, left: 0, right: 390, width: 390, height: 1000 });
  amb.caixa.disparar('wheel');
  ate(amb, 1300);
  assert.equal(amb.caixa.scrollTop, 123);
});

test('celular: "Ver a planta do seu site" rola a CAIXA até o cartão (não a página) e leva o foco ao título', () => {
  const amb = ambiente();
  comEsboco(amb);
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  const li = cartao(amb);
  li.getBoundingClientRect = () => ({ top: 900, bottom: 1900, left: 0, right: 390, width: 390, height: 1000 });
  amb.caixa.disparar('wheel'); ate(amb, 1300);   /* a rolagem automática não aconteceu: a pessoa estava rolando */
  amb.caixa.scrollTop = 0;
  const botao = amb.log.achar((n) => n._classes && n._classes.has('plv-ver'))[0];
  assert.ok(botao, 'o botão está na fala do Zero');
  botao.disparar('click');
  assert.equal(amb.caixa.scrollTop, 900 - 0 - 8);
  assert.equal(amb.rolouPagina.length, 0, 'a página não rola');
  assert.ok(amb.doc.ativo && amb.doc.ativo._classes.has('plv-titulo'), 'o foco vai ao título');
});

test('celular: a planta que some do estado devolve o cartão ao esboço (pronto, sem semente nem som)', () => {
  const amb = ambiente();
  comEsboco(amb);
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  const sons = amb.sons.length;
  amb.render(estado(3, false));
  const li = cartao(amb);
  assert.equal(li.porClasse('plv').length, 0, 'o desenho final saiu');
  assert.equal(li.porClasse('lv').length, 1, 'o esboço voltou');
  ate(amb, 5000);
  assert.equal(amb.sons.length, sons, 'sem som');
});

test('celular: conversa retomada já com a planta: o desenho final nasce no cartão, sem esboço e sem voo', () => {
  const amb = ambiente();
  amb.render(estado(3, true)); ate(amb, 20);
  amb.render(estado(3, true)); ate(amb, 20);
  amb.render(estado(3, true));
  const li = cartao(amb);
  assert.ok(li && li.porClasse('plv').length === 1);
  assert.equal(li.porClasse('lv').length, 0);
  amb.w.mostrar(1);
  assert.ok(!li.achar((n) => n._classes && n._classes.has('plv-mov')).some((m) => m.animacoes.some((a) => /scale\(/.test(a.keyframes[0].transform || ''))), 'sem voo');
  ate(amb, 15000);
  assert.equal(li.porClasse('plv-leitura__tag')[0].textContent, 'Planta pronta');
});

test('computador: a planta abre na FAIXA (o esboço segue na conversa); com o esboço fora da tela, sem voo', () => {
  const amb = ambiente({ largura: 1280 });
  comEsboco(amb);
  /* o esboço lá em cima, fora da tela, e a faixa abaixo da dobra */
  cartao(amb).porClasse('lv-quadro')[0].getBoundingClientRect = () => ({ top: -3000, bottom: -2592, left: 0, right: 700, width: 700, height: 408 });
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  assert.equal(amb.faixa.hidden, false, 'a faixa abriu');
  assert.equal(amb.faixa.porClasse('plv').length, 1);
  assert.equal(cartao(amb).porClasse('lv').length, 1, 'o esboço segue na conversa');
  amb.w.mostrar(1);
  assert.ok(!amb.faixa.achar((n) => n._classes && n._classes.has('plv-mov')).some((m) => m.animacoes.some((a) => /scale\(/.test(a.keyframes[0].transform || ''))), 'sem voo');
  ate(amb, 15000);
  assert.equal(amb.faixa.porClasse('plv-leitura__tag')[0].textContent, 'Planta pronta');
});

test('computador: com o esboço à vista quando a entrada começa, o voo sai dele até a faixa', () => {
  const amb = ambiente({ largura: 1280 });
  comEsboco(amb);
  cartao(amb).porClasse('lv-quadro')[0].getBoundingClientRect = () => ({ top: 100, bottom: 508, left: 0, right: 700, width: 700, height: 408 });
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  amb.w.mostrar(1);
  const voos = amb.faixa.achar((n) => n._classes && n._classes.has('plv-mov')).filter((m) => m.animacoes.some((a) => /scale\(/.test(a.keyframes[0].transform || '')));
  assert.ok(voos.length >= 3, 'voou: ' + voos.length);
});

function consagrado(amb) {
  comEsboco(amb);
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  amb.w.mostrar(1); ate(amb, 15000);
  return cartao(amb);
}
const plv = (li) => li.porClasse('plv')[0];

test('celular: uma 2ª versão do plano (ajuste) é desenhada NO MESMO cartão, sem montar de novo nem abrir a faixa', () => {
  const amb = ambiente();
  const li = consagrado(amb);
  const antes = plv(li);
  const E = estado(4, true); E.planta = { versao: 2, origem: 'modelo', n_mensagens: E.mensagens.length - 1, plano: fx('clinica') };
  E.planta.plano.etapas[1].id = 'nova-etapa';
  amb.render(E);
  assert.ok(plv(cartao(amb)) === antes, 'o mesmo desenho, ajustado');
  assert.equal(amb.faixa.hidden, true);
  ate(amb, 8000);
  assert.ok(cartao(amb).achar((n) => n.attrs && n.attrs['data-id'] === 'nova-etapa').length > 0, 'a etapa nova está no cartão');
});

test('celular: "Rever a montagem" refaz no cartão', () => {
  const amb = ambiente();
  const li = consagrado(amb);
  li.porClasse('plv-btn--txt')[0].disparar('click');
  amb.w.mostrar(1); ate(amb, 15000);
  assert.equal(li.porClasse('plv-leitura__tag')[0].textContent, 'Planta pronta');
  assert.equal(amb.faixa.hidden, true);
});

test('celular: se o desenho recusa a montagem, o cartão volta ao esboço e nada fica pela metade', () => {
  const amb = ambiente({ recusar: true });
  comEsboco(amb);
  amb.render(estado(3, true)); ate(amb, 20);
  amb.render(estado(3, true));
  assert.equal(cartao(amb).porClasse('plv').length, 0);
  assert.equal(cartao(amb).porClasse('lv').length, 1, 'o esboço voltou');
  assert.equal(amb.faixa.hidden, true);
  assert.ok(amb.avisos.some((a) => /montar recusou/.test(a)), 'o aviso [beyon]');
});

test('celular: esconder (a planta some) solta os ouvintes da caixa e o tempo da rolagem automática', () => {
  const amb = ambiente();
  comEsboco(amb);
  amb.render(estado(3, true)); ate(amb, 20); amb.render(estado(3, true));
  assert.ok((amb.caixa.ouvintes.wheel || []).length > 0, 'ouve a mão na caixa');
  amb.render(estado(3, false));
  assert.equal((amb.caixa.ouvintes.wheel || []).length, 0);
  assert.equal((amb.caixa.ouvintes.touchmove || []).length, 0);
  const st = amb.caixa.scrollTop;
  ate(amb, 2000);
  assert.equal(amb.caixa.scrollTop, st, 'a rolagem automática agendada não acontece mais');
});

test('a planta consagrada fica onde nasceu ao cruzar 960 px (no cartão continua no cartão; a faixa não abre): o módulo refaz na largura nova ali mesmo', () => {
  const amb = ambiente();
  const li = consagrado(amb);
  amb.w.innerWidth = 1280; amb.w.disparar('resize'); ate(amb, 400);
  assert.ok(plv(li), 'segue no cartão');
  assert.equal(amb.faixa.hidden, true);
});
