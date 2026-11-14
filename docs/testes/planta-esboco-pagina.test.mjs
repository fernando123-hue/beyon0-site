/* O ESBOÇO NA PÁGINA DE ORÇAMENTO (planta viva v2, PR do crescimento): js/orcamento-planta-esboco.js (BZOrcEsboco) num DOM de mentira com os
   módulos REAIS do esboço (peças, crescimento, relógio, esboço) e um som de espia. O que se prova:
   - flag desligada (sem planta_editavel) ou sem fala do Zero: nada é baixado, nada é criado, nenhum ouvinte (a tela é a de hoje);
   - a 1ª resposta do Zero baixa o CSS e os 6 módulos UMA vez, pela lista constante, e põe o cartão como ÚLTIMO item da conversa (data-fica);
   - conversa retomada: o esboço nasce pronto, sem semente nem som; ao vivo, a semente toca;
   - cada turno cresce o esboço pelo briefing; a flag que some tira tudo; girar/redimensionar refaz na largura nova, sem som;
   - falha de download: nada aparece, um aviso [beyon], e não tenta de novo a cada render;
   - fonte e página: ES5, sem portas de HTML, o script vem antes do orcamento.js, o botão de som nasce escondido; orcamento.js mantém o cartão por último.
   node --test docs/testes/planta-esboco-pagina.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { criarJanela } from './planta-dom-falso.mjs';
import { criarPagina } from './planta-pagina-falsa.mjs';

const require = createRequire(import.meta.url);
const Pecas = require('../../js/planta-pecas.js');
const Cresce = require('../../js/planta-cresce.js');
const Relogio = require('../../js/planta-relogio.js');
const Esboco = require('../../js/planta-esboco.js');
const Ligacao = require('../../js/orcamento-planta-esboco.js');
const lerFonte = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/* (nós do DOM de mentira comparados por assert.ok(a === b): numa falha o assert.equal tentaria imprimir a árvore inteira, que tem ciclos, e pararia o teste) */

const MODULOS = ['js/planta-pecas.js', 'js/mapa-saber.js', 'js/planta-cresce.js', 'js/planta-relogio.js', 'js/planta-som.js', 'js/planta-esboco.js'];
const CSS = 'css/planta-esboco.css';

function ambiente({ reduzido = false, falhar = null, largura = 390 } = {}) {
  const w = criarJanela({ reduzido, largura });
  const doc = w.document;
  const ids = {};
  const novo = (tag, id) => { const n = doc.createElement(tag); if (id) ids[id] = n; return n; };
  doc.getElementById = (id) => ids[id] || null;
  doc.head = novo('head');
  const caixa = novo('div', 'o-log-caixa');
  caixa.getBoundingClientRect = () => ({ top: 0, bottom: 2000, left: 0, right: 390, width: 390, height: 2000 });
  const log = novo('ol', 'o-log'); caixa.appendChild(log);
  /* o painel do computador (a coluna presa, que rola por dentro): o radar, as ações dele e o resto */
  const painel = novo('aside'); painel.className = 'orc-painel';
  painel.getBoundingClientRect = () => ({ top: 0, bottom: 2000, left: 0, right: 420, width: 420, height: 2000 });
  const radar = novo('section', 'o-rde'); painel.appendChild(radar);
  const acoes = novo('div', 'o-est-acoes'); painel.appendChild(acoes);
  const resto = novo('div', 'o-diagnostico'); painel.appendChild(resto);
  const anexarPainel = painel.insertBefore.bind(painel);
  painel.insertBefore = (c, ref) => { anexarPainel(c, ref); c.clientWidth = 420; return c; };
  const abertura = novo('li'); abertura.className = 'msg msg--agente'; log.appendChild(abertura);
  const sons = [], baixados = [], avisos = [];
  let mostrou = 0, preparou = 0;
  w.console = { warn: (...a) => avisos.push(a.join(' ')) };
  const fonte = {
    'js/planta-pecas.js': () => { w.BZPlantaPecas = Pecas; },
    'js/mapa-saber.js': () => { w.BZMapaSaber = require('../../js/mapa-saber.js'); },
    'js/planta-cresce.js': () => { w.BZPlantaCresce = Cresce; },
    'js/planta-relogio.js': () => { w.BZPlantaRelogio = Relogio.para(w); },
    'js/planta-som.js': () => { w.BZPlantaSom = { tocar: (n) => sons.push(n), mostrarBotoes: () => { mostrou++; }, preparar: () => { preparou++; } }; },
    'js/planta-esboco.js': () => { w.BZPlantaEsboco = Esboco.para(w); }
  };
  const anexar = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (s) => {
    anexar(s);
    const url = String(s.tagName).toLowerCase() === 'link' ? s.href : s.src;
    baixados.push(url);
    w.setTimeout(() => { if (falhar === url) { s.disparar('error'); return; } if (fonte[url]) fonte[url](); s.disparar('load'); }, 0);
    return s;
  };
  /* o cartão (li) ganha a largura da lista quando entra nela */
  const anexarLog = log.appendChild.bind(log);
  log.appendChild = (c) => { anexarLog(c); c.clientWidth = log.largura === undefined ? 390 : log.largura; return c; };
  const L = Ligacao.criar(w);
  return { w, doc, L, log, caixa, painel, acoes, resto, sons, baixados, avisos, mostrou: () => mostrou, preparou: () => preparou };
}
const BRIEF_1 = { negocio: { segmento: 'clínica odontológica' } };
const BRIEF_2 = { negocio: { segmento: 'clínica odontológica', descricao: 'implantes' }, situacao_atual: { como_chegam: 'Google e indicação' } };
const BRIEF_3 = { negocio: { segmento: 'clínica odontológica', descricao: 'implantes' }, situacao_atual: { como_chegam: 'Google e indicação', o_que_se_perde: 'somem' }, objetivos: ['agendamentos'], funcionalidades: ['agendamento', 'whatsapp'] };
function estado(briefing, nZero, extra) {
  const mensagens = [];
  for (let i = 0; i < nZero; i++) mensagens.push({ papel: 'visitante', conteudo: 'oi ' + i }, { papel: 'agente', conteudo: 'resposta ' + i });
  return Object.assign({ conversa: { etapa: 'conversa', briefing }, mensagens, planta_editavel: true }, extra || {});
}
const cartao = (amb) => amb.log.porClasse('lv-item')[0];
const acesas = (amb) => amb.log.porClasse('lv-txt').filter((li) => li._classes.has('is-aceso')).length;
const prontos = (amb) => amb.w.avancar(20);

test('flag desligada (sem planta_editavel), sem fala do Zero ou estado torto: nada é baixado, nada criado, nenhum ouvinte', () => {
  const amb = ambiente();
  const antes = amb.doc.todos.length;
  for (const E of [null, undefined, {}, 'x', [], estado(BRIEF_3, 2, { planta_editavel: undefined }), estado(BRIEF_3, 0), estado(BRIEF_3, 2, { planta_editavel: 'sim' })]) {
    assert.doesNotThrow(() => amb.L.atualizar(E));
  }
  prontos(amb);
  assert.deepEqual(amb.baixados, []);
  assert.equal(amb.doc.todos.length, antes, 'nenhum elemento criado');
  assert.equal(Object.keys(amb.w.ouvintes).length, 0, 'nenhum ouvinte na janela');
  assert.equal(amb.w.pendentes(), 0);
});

test('a 1ª resposta do Zero ao vivo: baixa o CSS e os 5 módulos UMA vez, na ordem; o cartão é o último item da conversa; a semente toca', () => {
  const amb = ambiente();
  amb.L.atualizar(estado({}, 0));            /* a página abriu com a conversa vazia */
  amb.L.atualizar(estado(BRIEF_1, 1));       /* a 1ª resposta do Zero */
  amb.L.atualizar(estado(BRIEF_1, 1));       /* outro render enquanto baixa: não baixa de novo */
  prontos(amb);
  assert.deepEqual(amb.baixados, [CSS, ...MODULOS]);
  assert.deepEqual(amb.doc.head.porTag('script').map((s) => s.async), MODULOS.map(() => false));
  const li = cartao(amb);
  assert.ok(li, 'o cartão existe');
  assert.ok(amb.log.lastElementChild === li, 'é o último item');
  assert.ok('data-fica' in li.attrs, 'marcado para o orcamento.js manter por último');
  amb.L.atualizar(estado(BRIEF_1, 1));
  amb.w.mostrar(1);
  amb.w.avancar(3000);
  assert.ok(amb.sons.includes('semente'), 'a semente tocou');
  assert.equal(amb.mostrou(), 1, 'o botão de som da página aparece');
  assert.equal(amb.preparou(), 1, 'o áudio é preparado no ócio, uma vez');
  assert.ok(li.porClasse('lv')[0]._classes.has('is-semeado'));
});

test('cada turno cresce o esboço pelo briefing (sino por estação), sem refazer o cartão', () => {
  const amb = ambiente();
  amb.L.atualizar(estado({}, 0));
  amb.L.atualizar(estado(BRIEF_1, 1));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_1, 1));
  amb.w.mostrar(1);
  amb.w.avancar(5000);
  const li = cartao(amb);
  amb.L.atualizar(estado(BRIEF_3, 3));
  amb.w.mostrar(1);
  amb.w.avancar(20000);
  assert.ok(cartao(amb) === li, 'o mesmo cartão');
  assert.equal(acesas(amb), 6, 'as cinco estações e o objetivo');
  assert.ok(amb.sons.filter((s) => s === 'estacao').length >= 4);
});

test('conversa retomada (o 1º estado da visita já tem fala do Zero): o esboço nasce pronto, sem semente e sem som', () => {
  const amb = ambiente();
  amb.L.atualizar(estado(BRIEF_3, 3));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 3));
  assert.equal(acesas(amb), 6);
  amb.w.mostrar(1);
  amb.w.avancar(10000);
  assert.deepEqual(amb.sons, []);
});

test('a flag some (ou a conversa recomeça): o cartão sai, o esboço para e o ouvinte de redimensionar é solto', () => {
  const amb = ambiente();
  amb.L.atualizar(estado(BRIEF_3, 3));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 3));
  assert.ok(cartao(amb));
  assert.equal((amb.w.ouvintes.resize || []).length, 1);
  amb.L.atualizar(estado(BRIEF_3, 3, { planta_editavel: undefined }));
  assert.ok(!cartao(amb));
  assert.equal((amb.w.ouvintes.resize || []).length, 0);
  assert.equal(amb.w.ativas().filter((a) => a.opcoes.iterations > 1).length, 0, 'nenhum repouso ficou rodando');
});

test('girar o celular / mudar a largura: refaz na largura nova com o que já estava entendido, sem som; mudança pequena não refaz', () => {
  const amb = ambiente();
  amb.L.atualizar(estado(BRIEF_3, 3));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 3));
  const li = cartao(amb), velho = li.porClasse('lv')[0];
  li.clientWidth = 393; amb.w.disparar('resize'); amb.w.avancar(200);
  assert.ok(li.porClasse('lv')[0] === velho, '3 px não refaz');
  li.clientWidth = 700; amb.w.disparar('resize'); amb.w.avancar(200);
  const novoCartao = li.porClasse('lv')[0];
  assert.ok(novoCartao !== velho, 'refez');
  assert.equal(li.porClasse('lv').length, 1, 'um cartão só');
  assert.equal(acesas(amb), 6);
  assert.equal(novoCartao.porTag('svg')[0].attrs.width, '700');
  assert.deepEqual(amb.sons, []);
});

test('o que já está na página (o planta-pecas.js, se a faixa veio antes) não é baixado de novo', () => {
  const amb = ambiente();
  amb.w.BZPlantaPecas = Pecas;
  amb.L.atualizar(estado(BRIEF_1, 1));
  prontos(amb);
  assert.deepEqual(amb.baixados, [CSS, ...MODULOS.filter((m) => m !== 'js/planta-pecas.js')]);
  amb.L.atualizar(estado(BRIEF_1, 1));
  assert.ok(cartao(amb), 'e o cartão nasce');
});

test('falha de download: nada aparece, um aviso [beyon], e os renders seguintes não baixam de novo', () => {
  const amb = ambiente({ falhar: 'js/planta-relogio.js' });
  amb.L.atualizar(estado(BRIEF_1, 1));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 2));
  amb.L.atualizar(estado(BRIEF_3, 3));
  prontos(amb);
  assert.ok(!cartao(amb));
  assert.equal(amb.baixados.length, 1 + MODULOS.length, 'baixou uma vez só');
  assert.equal(amb.avisos.filter((a) => a.startsWith('[beyon] planta')).length, 1);
});

test('a conversa ainda escondida (lista sem largura): o cartão espera e nasce quando ela aparece', () => {
  const amb = ambiente();
  amb.log.largura = 0;
  amb.L.atualizar(estado(BRIEF_3, 3));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 3));
  assert.equal(cartao(amb).porClasse('lv').length, 0, 'sem largura, sem desenho');
  cartao(amb).clientWidth = 390;
  amb.L.atualizar(estado(BRIEF_3, 3));
  assert.equal(cartao(amb).porClasse('lv').length, 1);
});

test('fonte: src só da lista constante, sem innerHTML/eval/estilo inline (ES5 e as outras portas: planta-es5 e planta-sem-html varrem este arquivo também)', () => {
  const src = lerFonte('js/orcamento-planta-esboco.js');
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function|setAttribute\(\s*'style'|cssText|requestAnimationFrame/.test(codigo));
  assert.deepEqual(Ligacao.MODULOS, MODULOS);
  assert.equal(Ligacao.CSS, CSS);
  assert.ok(/e\.src = x\[0\]/.test(codigo) && /e\.href = CSS/.test(codigo), 'só URLs da lista');
});

test('orcamento.html: o script do esboço vem antes do orcamento.js, sem style=""; o botão de som do rodapé nasce escondido', () => {
  const html = lerFonte('orcamento.html');
  const iEsb = html.indexOf('<script src="js/orcamento-planta-esboco.js" defer></script>'), iOrc = html.indexOf('<script src="js/orcamento.js" defer></script>');
  assert.ok(iEsb > 0 && iOrc > iEsb);
  assert.match(html, /<button class="footer__som" type="button" data-som aria-pressed="true" hidden>Som<\/button>/);
  assert.ok(!/class="nav__som"/.test(html), 'nada novo na barra do topo (a logo do celular depende dela)');
  assert.ok(!/style="/.test(html));
});

test('js/orcamento.js: as falas entram ANTES do cartão (data-fica) e refazer a lista não o tira de lá', async () => {
  const p = criarPagina({ mensagens: [{ papel: 'visitante', conteudo: 'oi' }, { papel: 'agente', conteudo: 'olá' }] });
  assert.ok(await p.pronta());
  const log = p.doc.getElementById('o-log');
  const fica = { attrs: { 'data-fica': '' }, hasAttribute: (k) => k === 'data-fica', children: [{ textContent: 'CARTÃO' }] };
  log.appendChild(fica);
  await p.enviar('minha clínica');
  assert.ok(log.children[log.children.length - 1] === fica, 'o cartão segue por último');
  assert.deepEqual(p.falas().slice(-3), ['minha clínica', 'Resposta ao: minha clínica', 'CARTÃO']);
});

test('a 1ª resposta do Zero no 1º estado que esta página vê (sem render antes) é AO VIVO: a semente toca; retomada é só com 2 ou mais falas do Zero', () => {
  const amb = ambiente();
  amb.L.atualizar(estado(BRIEF_3, 1));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 1));
  assert.ok(acesas(amb) < 6, 'não nasceu pronto');
  amb.w.mostrar(1);
  amb.w.avancar(20000);
  assert.ok(amb.sons.includes('semente'));
  assert.equal(acesas(amb), 6);
});

test('o cartão que nasce leva a última fala para o topo da caixa (a caixa rola sozinha, a página não): a fala fica legível e o cartão logo abaixo', () => {
  const amb = ambiente();
  let rolouPagina = 0;
  amb.w.scrollTo = () => { rolouPagina++; };
  const fala = amb.doc.createElement('li'); fala.className = 'msg msg--agente'; amb.log.appendChild(fala);
  /* como o navegador: a rolagem fica presa ao que a caixa tem para rolar. Antes do desenho do esboço (o cartão vazio) a conversa cabe na caixa e não
     rola nada; com ele, rola (visto no Chromium em 12/11: alinhar com o cartão ainda vazio deixava a fala no meio da caixa) */
  Object.defineProperty(amb.caixa, 'scrollTop', { get() { return this._st || 0; }, set(v) { this._st = Math.max(0, Math.min(v, amb.log.porClasse('lv').length ? 5000 : 0)); } });
  fala.getBoundingClientRect = () => ({ top: 570, bottom: 690, left: 0, right: 390, width: 390, height: 120 });
  amb.caixa.getBoundingClientRect = () => ({ top: 300, bottom: 772, left: 0, right: 390, width: 390, height: 472 });
  amb.L.atualizar(estado(BRIEF_1, 1));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_1, 1));
  assert.equal(amb.caixa.scrollTop, 570 - 300 - 8, 'a fala sobe até 8 px do topo da caixa');
  amb.caixa.scrollTop = 50;
  amb.L.atualizar(estado(BRIEF_1, 1));
  assert.equal(amb.caixa.scrollTop, 50, 'só quando o cartão nasce: o render seguinte não mexe na caixa');
  assert.equal(rolouPagina, 0);
});

test('_headers: cada módulo e o CSS que o esboço baixa sem ?v revalidam sempre (nunca peça velha com página nova)', () => {
  const cab = lerFonte('_headers');
  for (const u of [...MODULOS, CSS]) assert.match(cab, new RegExp('^/' + u.replace(/[.]/g, '\.') + '\n  ! Cache-Control\n  Cache-Control: public, max-age=0, must-revalidate$', 'm'), u);
});

test('computador (1280 px): o esboço cresce na CONVERSA, como no celular; o painel (o radar e as ações, onde se fecha a venda) não ganha nada (decisão de 12/11)', () => {
  const amb = ambiente({ largura: 1280 });
  const antes = amb.painel.children.length;
  amb.L.atualizar(estado({}, 0));
  amb.L.atualizar(estado(BRIEF_3, 1));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 1));
  assert.ok(cartao(amb) && amb.log.lastElementChild === cartao(amb), 'o último item da conversa');
  assert.equal(amb.painel.children.length, antes, 'o painel segue igual');
  assert.equal(amb.painel.porClasse('lv').length, 0);
});

test('js/orcamento.js rola a CAIXA: sem o cartão, até o fim (como sempre); com ele, a fala mais nova fica a 8 px do topo da caixa', async () => {
  const p = criarPagina({ mensagens: [{ papel: 'visitante', conteudo: 'oi' }, { papel: 'agente', conteudo: 'olá' }] });
  assert.ok(await p.pronta());
  const caixa = p.doc.getElementById('o-log-caixa');
  /* cada fala nova fica 100 px abaixo da anterior dentro da caixa; o retângulo dela depende de quanto a caixa rolou (como no navegador) */
  let n = 0;
  const criar = p.doc.createElement;
  p.doc.createElement = (t) => { const e = criar(t); if (t === 'li') { const pos = 100 * (++n); e.getBoundingClientRect = () => ({ top: pos - caixa.scrollTop, bottom: pos + 90 - caixa.scrollTop }); } return e; };
  caixa.getBoundingClientRect = () => ({ top: 0, bottom: 472 });
  caixa.scrollHeight = 999;
  await p.enviar('sem o cartão');
  assert.equal(caixa.scrollTop, 999, 'sem o cartão: até o fim');
  const log = p.doc.getElementById('o-log');
  log.appendChild({ attrs: { 'data-fica': '' }, hasAttribute: (k) => k === 'data-fica', children: [{ textContent: 'CARTÃO' }] });
  await p.enviar('com o cartão');
  assert.equal(caixa.scrollTop, 100 * n - 8, 'com o cartão: a última fala criada a 8 px do topo da caixa');
});

test('com a planta na conversa, a caixa marca com-planta (o CSS deixa a rolagem passar para a página no fim da caixa: com o desenho dentro, ela prendia o dedo); sem a planta, a marca sai', () => {
  const amb = ambiente();
  amb.L.atualizar(estado(BRIEF_3, 3));
  prontos(amb);
  amb.L.atualizar(estado(BRIEF_3, 3));
  assert.ok(amb.caixa._classes.has('com-planta'));
  amb.L.atualizar(estado(BRIEF_3, 3, { planta_editavel: undefined }));
  assert.ok(!amb.caixa._classes.has('com-planta'));
});

test('css/planta-esboco.css: a caixa com a planta deixa a rolagem passar para a página (overscroll-behavior-y: auto)', () => {
  assert.match(lerFonte('css/planta-esboco.css'), /\.orc-log\.com-planta\s*\{\s*overscroll-behavior-y:\s*auto;\s*\}/);
});
