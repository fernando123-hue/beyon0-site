/* A rolagem da conversa no celular (js/orcamento-rolagem.js; dono, 25/11, opção A: a conversa cresce junto com a página, sem caixa com
   rolagem própria). As contas puras, o comportamento com uma tela falsa, e a fiação (CSS, HTML, quem chama). node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CAMINHO = require.resolve('../../js/orcamento-rolagem.js');
const lerTexto = (c) => fs.readFileSync(new URL('../../' + c, import.meta.url), 'utf8');
const carregar = () => { delete require.cache[CAMINHO]; return require(CAMINHO); };

/* ---------- as contas ---------- */
test('alvoDaPagina: onde o item está no documento, menos o que cobre o alto e a folga; nunca antes do começo nem depois do fim', () => {
  const R = carregar();
  assert.equal(R.alvoDaPagina({ rolagem: 100, topo: 500, topoUtil: 64, folga: 8, maximo: 2000 }), 528);
  assert.equal(R.alvoDaPagina({ rolagem: 0, topo: 10, topoUtil: 64, folga: 8, maximo: 2000 }), 0, 'não passa do começo');
  assert.equal(R.alvoDaPagina({ rolagem: 1900, topo: 600, topoUtil: 64, folga: 8, maximo: 2000 }), 2000, 'não passa do fim');
  assert.equal(R.alvoDaPagina({ rolagem: 1900, topo: 600, topoUtil: 64, folga: 8 }), 2428, 'sem o máximo, só a conta');
  for (const ruim of [null, undefined, {}, { rolagem: 'x', topo: 1 }, { rolagem: NaN, topo: 1, topoUtil: 1, folga: 1 }]) assert.equal(R.alvoDaPagina(ruim), null, JSON.stringify(ruim));
});

test('jaBemPosicionada: na parte de cima com o que entrou cabendo na tela, ou já colada no alto, fica quieta; fora disso, é puxada', () => {
  const R = carregar();
  assert.equal(R.jaBemPosicionada(130, 400, 120, 844), true, 'em cima e cabe');
  assert.equal(R.jaBemPosicionada(300, 700, 120, 844), true, 'nos 40% de cima e cabe');
  assert.equal(R.jaBemPosicionada(300, 1100, 120, 844), false, 'em cima, mas as opções passam da tela: sobe para mostrá-las');
  assert.equal(R.jaBemPosicionada(128, 2000, 120, 844), true, 'já no alto: o que passa da tela rola com o dedo');
  assert.equal(R.jaBemPosicionada(500, 600, 120, 844), false, 'embaixo demais');
  assert.equal(R.jaBemPosicionada(90, 400, 120, 844), false, 'por baixo da barra de cima');
  assert.equal(R.jaBemPosicionada(300, undefined, 120, 844), true, 'sem o fim, só o topo conta');
  assert.equal(R.jaBemPosicionada(NaN, 400, 120, 844), false);
  assert.equal(R.jaBemPosicionada(100, 400, 900, 800), false, 'tela menor que o que cobre o alto');
});

test('acompanhando: sem item anterior sim; com ele, só se ainda toca a tela (com 24 px de margem)', () => {
  const R = carregar();
  assert.equal(R.acompanhando(null, null, 64, 844), true);
  assert.equal(R.acompanhando({ top: 600, bottom: 700 }, null, 64, 844), true);
  assert.equal(R.acompanhando({ top: 860, bottom: 900 }, null, 64, 844), true, 'a 16 px da borda de baixo ainda conta');
  assert.equal(R.acompanhando({ top: 900, bottom: 950 }, null, 64, 844), false, 'abaixo da tela: a pessoa não estava ali');
  assert.equal(R.acompanhando({ top: -400, bottom: -100 }, null, 64, 844), false, 'acima da tela: foi ver outra coisa');
  assert.equal(R.acompanhando({ top: "x", bottom: "y" }, null, 64, 844), true, 'sem medida: como antes, acompanha');
  /* quem acabou de digitar está no campo de escrever, que mora ABAIXO da lista: a lista ficou acima da tela e a pessoa segue na conversa */
  assert.equal(R.acompanhando({ top: -900, bottom: -700 }, { top: 300, bottom: 500 }, 64, 844), true, 'o campo de escrever está à vista');
  assert.equal(R.acompanhando({ top: -900, bottom: -700 }, { top: -300, bottom: -100 }, 64, 844), false, 'desceu além do campo: foi ver o preço');
  assert.equal(R.acompanhando({ top: 1200, bottom: 1300 }, { top: 1500, bottom: 1700 }, 64, 844), false, 'subiu: o anterior começa abaixo da tela');
});

/* ---------- com uma tela falsa ---------- */
function tela({ overflowY = 'visible', anterior = { top: 500, bottom: 560 }, topoFala = 700, altura = 844, y = 0, max = 3000, reduzir = false } = {}) {
  const ouvintes = {}, rolou = [], janela = {}, pos = { top: topoFala }, estilo = { overflowY };
  const botao = { hidden: true, ouvintes: {}, addEventListener(t, f) { this.ouvintes[t] = f; } };
  const seta = { textContent: '↓' };
  const caixa = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, scrollTop: 0, scrollHeight: 900, clientHeight: 400, getBoundingClientRect: () => ({ top: 100 }) };
  const classes = (...c) => ({ contains: (x) => c.includes(x) });
  const falaAnterior = { previousElementSibling: null, getClientRects: () => [1], getBoundingClientRect: () => anterior };
  const fala = { classList: classes('msg', 'msg--agente'), isConnected: true, previousElementSibling: anterior ? falaAnterior : null, focada: false, setAttribute() {}, focus() { this.focada = true; }, getClientRects: () => [1], getBoundingClientRect: () => ({ top: pos.top, bottom: pos.top + 80 }) };
  const raiz = { scrollTop: 0, scrollHeight: max + altura, classList: classes(reduzir ? 'menos-movimento' : '') };
  const doc = {
    documentElement: raiz,
    getElementById: (id) => ({ 'o-log-caixa': caixa, 'o-voltar': botao, 'o-voltar-seta': seta, 'o-log': { querySelectorAll: () => [fala] } }[id] || null),
    querySelector: () => null, querySelectorAll: (s) => (s === '#o-log .msg--agente' ? [fala] : []),
    addEventListener: (t, f) => { ouvintes[t] = f; }, removeEventListener() {}
  };
  const win = {
    document: doc, innerHeight: altura, pageYOffset: y, visualViewport: null,
    getComputedStyle: (el) => (el === caixa ? { overflowY: estilo.overflowY } : { getPropertyValue: () => '64px' }),
    matchMedia: () => ({ matches: false }), scrollTo(o) { rolou.push(o); }, addEventListener: (t, f) => { janela[t] = f; }, setTimeout: (f) => f(), requestAnimationFrame: (f) => f()
  };
  return { doc, win, fala, botao, seta, caixa, rolou, ouvintes, janela, pos, estilo };
}
function ligada(opcoes, tocar = true) {
  const R = carregar(), t = tela(opcoes);
  R.ligar(t.doc, t.win);
  if (tocar) t.ouvintes.pointerdown();
  return { R, ...t };
}

test('caixa que rola por dentro (computador): levar e descerAte devolvem false e não tocam na página', () => {
  const { R, fala, rolou, caixa } = ligada({ overflowY: 'auto' });
  assert.equal(R.porDentro(), true);
  assert.equal(R.levar(fala, fala), false);
  assert.equal(R.descerAte(fala), false);
  assert.deepEqual(rolou, []);
  assert.equal(caixa.attrs.tabindex, '0', 'a caixa que rola é focável (o teclado alcança)');
});

test('sem a janela ligada (outro ambiente), vale o jeito de antes: a caixa rola por dentro', () => {
  const R = carregar();
  assert.equal(R.porDentro(), true);
  assert.equal(R.levar({}, {}), false);
});

test('celular: a fala nova abaixo da área boa leva a PÁGINA até ela (suave), com a folga de 8 px abaixo da barra', () => {
  const { R, fala, rolou, botao, caixa } = ligada({ topoFala: 700, y: 200 });
  assert.equal(R.levar(fala, fala), true);
  assert.equal(rolou.length, 1);
  assert.deepEqual(rolou[0], { top: 200 + 700 - 120 - 8, left: 0, behavior: 'smooth' });
  assert.equal(botao.hidden, true);
  assert.equal(caixa.attrs.tabindex, '-1', 'a caixa que não rola não entra na ordem do Tab');
});

test('celular com movimento reduzido: a rolagem é instantânea', () => {
  const { R, fala, rolou } = ligada({ topoFala: 700, reduzir: true });
  R.levar(fala, fala);
  assert.equal(rolou[0].behavior, 'auto');
});

test('celular: fala que já está na parte de cima da tela não é puxada (nada de pulinho)', () => {
  const { R, fala, rolou } = ligada({ topoFala: 150 });
  assert.equal(R.levar(fala, fala), true);
  assert.deepEqual(rolou, []);
});

test('celular: sem nenhum toque da pessoa a página não se move (abrir a página é só ver)', () => {
  const { R, fala, rolou, botao } = ligada({ topoFala: 700 }, false);
  assert.equal(R.levar(fala, fala), true, 'tratou (a caixa não rola), sem mexer em nada');
  assert.deepEqual(rolou, []);
  assert.equal(botao.hidden, true);
});

test('celular: "quieto" (conversa refeita, chegada) não move a página', () => {
  const { R, fala, rolou } = ligada({ topoFala: 700 });
  assert.equal(R.levar(fala, fala, true), true);
  assert.deepEqual(rolou, []);
});

test('celular: a pessoa foi ver outra coisa (o item anterior saiu da tela): a página NÃO foge, aparece o botão com a seta certa', () => {
  const a = ligada({ anterior: { top: -900, bottom: -700 }, topoFala: 1500 });
  assert.equal(a.R.levar(a.fala, a.fala), true);
  assert.deepEqual(a.rolou, []);
  assert.equal(a.botao.hidden, false);
  const b = ligada({ anterior: { top: 2000, bottom: 2100 }, topoFala: 2100 });
  b.R.levar(b.fala, b.fala);
  assert.equal(b.botao.hidden, false);
  assert.equal(b.seta.textContent, '↓', 'a fala está abaixo da tela');
});

test('celular: a mesma rolagem pedida duas vezes seguidas não reinicia a animação', () => {
  const { R, fala, rolou } = ligada({ topoFala: 700 });
  R.levar(fala, fala);
  R.levar(fala, fala);
  assert.equal(rolou.length, 1);
});

test('descerAte desce só o que falta para o fim aparecer, e não mexe se já está à vista', () => {
  const { R, rolou } = ligada({ y: 100 });
  const alvo = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom }) });
  assert.equal(R.descerAte(alvo(100, 500)), true);
  assert.deepEqual(rolou, [], 'já à vista');
  R.descerAte(alvo(400, 1000));
  assert.equal(rolou.length, 1);
  assert.equal(rolou[0].top, 100 + 1000 - (844 - 8), 'o fim do alvo encosta na folga de baixo');
});

test('quem aciona só por clique (leitor de tela, comando de voz) também libera a rolagem automática', () => {
  for (const gesto of ['click', 'touchstart', 'keydown']) {
    const t = ligada({ topoFala: 700 }, false);
    t.ouvintes[gesto]();
    t.R.levar(t.fala, t.fala);
    assert.equal(t.rolou.length, 1, gesto);
  }
});

test('botão "Zero respondeu": toque leva à fala, passa o foco a ela (não cai no body) e some', () => {
  const t = ligada({ anterior: { top: -900, bottom: -700 }, topoFala: 1500 });
  t.R.levar(t.fala, t.fala);
  assert.equal(t.botao.hidden, false);
  assert.equal(t.seta.textContent, '↓');
  t.doc.activeElement = t.botao;
  t.botao.ouvintes.click();
  assert.equal(t.botao.hidden, true);
  assert.equal(t.fala.focada, true, 'o foco segue para a fala');
  assert.deepEqual(t.rolou[0], { top: 1500 - 120 - 8, left: 0, behavior: 'smooth' });
});

test('botão: some quando qualquer parte da fala (mesmo maior que a tela) chega à área útil; a seta aponta para o lado em que a fala ficou', () => {
  const t = ligada({ anterior: { top: -900, bottom: -700 }, topoFala: 1500 });
  t.R.levar(t.fala, t.fala);
  assert.equal(t.botao.hidden, false);
  t.pos.top = -400;   /* a pessoa rolou além: a fala (80 px) ficou acima da tela */
  t.janela.scroll();
  assert.equal(t.botao.hidden, false);
  assert.equal(t.seta.textContent, '↑');
  t.pos.top = 300;
  t.janela.scroll();
  assert.equal(t.botao.hidden, true, 'a fala está na área útil');
  t.pos.top = -2000;   /* uma fala mais alta que a tela, a pessoa no meio dela: nada de botão sobre o texto */
  t.fala.getBoundingClientRect = () => ({ top: -2000, bottom: 600 });
  t.R.levar(t.fala, t.fala);
  t.janela.scroll();
  assert.equal(t.botao.hidden, true);
});

test('só uma fala nova do Zero merece o botão (a fala do visitante, não)', () => {
  const t = ligada({ anterior: { top: -900, bottom: -700 }, topoFala: 1500 });
  t.fala.classList = { contains: (c) => c === 'msg--visitante' };
  t.R.levar(t.fala, t.fala);
  assert.equal(t.botao.hidden, true);
});

test('virar computador (>= 900 px) com a conversa longa: a caixa volta no fim da conversa, não no começo; e o botão some', () => {
  const t = ligada({ anterior: { top: -900, bottom: -700 }, topoFala: 1500 });
  t.R.levar(t.fala, t.fala);
  assert.equal(t.botao.hidden, false);
  t.estilo.overflowY = 'auto';
  t.pos.top = 400;
  t.janela.resize();
  assert.equal(t.caixa.attrs.tabindex, '0');
  assert.equal(t.botao.hidden, true);
  assert.equal(t.caixa.scrollTop, 400 - 100 - 8, 'a caixa desce até a última fala (topo dela 400, topo da caixa 100, folga 8)');
});

/* ---------- a fiação ---------- */
test('o CSS tira a rolagem própria da conversa até 899 px e deixa no computador; o botão some no computador e não usa sombra nem desfoque', () => {
  const css = lerTexto('css/orcamento-palco.css');
  assert.match(css, /@media \(max-width: 899px\) \{\s*\.orc-conversa \.orc-log \{[^}]*max-height: none;[^}]*overflow: visible;[^}]*overscroll-behavior: auto;[^}]*scroll-snap-type: none;/);
  assert.match(css, /@media \(min-width: 900px\) \{ \.orc-voltar \{ display: none; \} \}/);
  const botao = css.slice(css.indexOf('.orc-voltar {'));
  assert.doesNotMatch(botao, /blur|box-shadow|text-shadow|filter/i, 'sem desfoque nem luz difusa (regra do dono)');
  assert.match(lerTexto('css/orcamento.css'), /\.orc-log \{ max-height: min\(56vh, 520px\); overflow-y: auto;/, 'a regra base da caixa (computador) segue');
});

test('o HTML tem o botão escondido, no corpo da página (fora de qualquer caixa transformada), e o script antes do palco', () => {
  const html = lerTexto('orcamento.html');
  assert.match(html, /<button class="orc-voltar" id="o-voltar" type="button" aria-label="Ir até a resposta do Zero" hidden>/);
  assert.match(html, /<span id="o-voltar-seta" aria-hidden="true">/, 'a seta é enfeite: o leitor de tela lê só o texto');
  assert.ok(html.indexOf('id="o-voltar"') > html.indexOf('</footer>'), 'o botão fica depois do rodapé, direto no <body>');
  assert.match(html, /orcamento-rolagem\.js" defer><\/script>\s*<script src="js\/orcamento-palco\.js"/);
});

test('quem rolava a caixa pergunta primeiro à página: conversa, toques, cartão da planta, esboço e a folga do palco', () => {
  for (const [arq, trecho] of [['js/orcamento.js', 'BZOrcRolagem.levar(li, li, quieto)'], ['js/orcamento-toques.js', 'BZOrcRolagem.levar(f, inserido || f)'], ['js/orcamento-planta.js', 'BZOrcRolagem.levar(raiz, raiz)'],
    ['js/orcamento-planta.js', 'BZOrcRolagem.descerAte(a)'], ['js/orcamento-planta-esboco.js', 'BZOrcRolagem.levar(fala, fala)'], ['js/orcamento-palco.js', 'BZOrcRolagem.porDentro()']]) {
    assert.ok(lerTexto(arq).includes(trecho), arq + ' deveria chamar ' + trecho);
  }
  assert.match(lerTexto('js/orcamento.js'), /rolarConversa\(ultima, retomando\)/, 'só a chegada com a conversa salva fica quieta');
});

test('o módulo não usa innerHTML nem estilo inline (CSP) e só escreve texto fixo no botão', () => {
  const js = lerTexto('js/orcamento-rolagem.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|\.style\.|\beval\b|new Function|\bfetch\b|localStorage|sessionStorage|document\.cookie|\blocation\b/);
});
