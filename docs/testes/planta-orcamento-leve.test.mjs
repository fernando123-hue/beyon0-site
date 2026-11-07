/* O ORÇAMENTO LEVE (2026-11-07): a carga do /orcamento sem salto e mais leve.
   1. As perguntas desde a 1ª pintura numa visita NOVA: o js/ancoras.js (head) decide pela mesma chave do js/orcamento-api.js ('bz-orcamento',
      menos a conversa esquecida) e pelo hash da retomada (#retomar= / #pedido=), e põe html.orc-nova; o CSS mostra as perguntas; o js/orcamento.js
      tira a classe ao assumir (antes da guarda dos scripts), e o load tira se ele nunca rodou. Sem JS, nada muda (o hidden do HTML fica).
   Roda pelo agregador docs/testes/planta-todos.test.mjs (importado por docs/testes/zero.test.mjs, que está no `testar`).
     node --test docs/testes/planta-orcamento-leve.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ler = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ANCORAS = ler('js/ancoras.js');

/* um navegador de mentira, o bastante para a cabeça (js/ancoras.js) */
function cabeca({ hash = '', local = {}, quebrado = false, orcamento = true, perguntasEscondidas = true } = {}) {
  const s = new Set();
  const classList = { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c) };
  const m = new Map(Object.entries(local));
  const armazem = { getItem: (k) => { if (quebrado) throw new Error('bloqueado'); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { if (quebrado) throw new Error('bloqueado'); m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
  const ouvintes = {};
  const perguntas = { hidden: perguntasEscondidas };
  const win = {
    JSON, String, Number, Object, Date, Math, URLSearchParams, Error,
    location: { pathname: '/orcamento', hash, search: '', replace() {} },
    localStorage: armazem, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false }),
    addEventListener: (ev, fn) => { (ouvintes[ev] || (ouvintes[ev] = [])).push(fn); },
    setTimeout: () => 0, clearTimeout() {},
    document: {
      documentElement: { classList },
      currentScript: { getAttribute: (k) => (k === 'data-orcamento' && orcamento ? '' : null), hasAttribute: (k) => k === 'data-orcamento' && orcamento },
      querySelector: () => null,
      getElementById: (id) => (id === 'o-perguntas' ? perguntas : null)
    }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(ANCORAS, win);
  return { tem: (c) => s.has(c), carregar: () => (ouvintes.load || []).forEach((f) => f({})), perguntas };
}
const SESSAO = JSON.stringify({ conversa_id: 'c-123', token: 't' });

test('1ª pintura: visita nova no /orcamento ganha html.orc-nova (as perguntas aparecem já)', () => {
  assert.ok(cabeca().tem('orc-nova'));
  assert.ok(cabeca({ local: { 'bz-orcamento': 'null' } }).tem('orc-nova'), 'chave vazia = sem pedido');
  assert.ok(cabeca({ local: { 'bz-orcamento': '{quebrado' } }).tem('orc-nova'), 'JSON malformado: o js/orcamento-api.js também lê como sem sessão');
  assert.ok(cabeca({ local: { 'bz-orcamento': JSON.stringify({ token: 't' }) } }).tem('orc-nova'), 'sem conversa_id não é sessão (API.temSessao)');
  assert.ok(cabeca({ quebrado: true }).tem('orc-nova'), 'armazenamento bloqueado: a API também começa sem sessão');
  assert.ok(cabeca({ local: { 'bz-orcamento': SESSAO, 'bz-orcamento-esquecida': 'c-123' } }).tem('orc-nova'), 'a conversa esquecida (Recomeçar) a API apaga: visita nova');
});

test('1ª pintura: pedido salvo, retomada pelo link ou outra página NÃO ganham a classe', () => {
  assert.ok(!cabeca({ local: { 'bz-orcamento': SESSAO } }).tem('orc-nova'), 'pedido salvo: quem decide é o render');
  assert.ok(!cabeca({ local: { 'bz-orcamento': SESSAO, 'bz-orcamento-esquecida': 'outra' } }).tem('orc-nova'));
  const ret = cabeca({ hash: '#retomar=' + 'a'.repeat(32) });
  assert.ok(!ret.tem('orc-nova') && ret.tem('orc-retomando'), '#retomar=: a retomada esconde a página de trás, sem as perguntas');
  assert.ok(!cabeca({ hash: '#pedido=' + 'a'.repeat(32) }).tem('orc-nova'), '#pedido=: idem');
  assert.ok(!cabeca({ orcamento: false }).tem('orc-nova'), 'outra página (sem data-orcamento no <script>): nada');
});

test('rede: se o js/orcamento.js não abriu as perguntas até o load, a classe sai (nada de pergunta sem botão funcionando)', () => {
  const sem = cabeca();
  sem.carregar();
  assert.ok(!sem.tem('orc-nova'));
  const com = cabeca({ perguntasEscondidas: false });
  com.carregar();
  assert.ok(com.tem('orc-nova'), 'com as perguntas já abertas pelo script, a classe pode ficar (não muda nada)');
});

test('o CSS mostra as perguntas só com a classe; o HTML segue com hidden (sem JS nada muda) e o <script> da cabeça marca a página', () => {
  const css = semComentarios(ler('css/orcamento.css'));
  assert.match(css, /html\.orc-nova #o-perguntas\[hidden\]\s*\{\s*display:\s*block\s*!important;?\s*\}/);   /* (o [hidden] de css/tokens.css é !important) */
  const html = ler('orcamento.html');
  assert.match(html, /<section class="orc-perguntas" id="o-perguntas"[^>]* hidden>/);
  assert.match(html, /<script src="js\/ancoras\.js" data-orcamento><\/script>/);
});

/* 3. A 1ª tela do celular: as etapas numa linha só (os números e o nome da etapa atual); os seis nomes seguem no DOM para o leitor de tela */
test('etapas: cada uma com o número e o nome em <span> próprios; os seis nomes no HTML', () => {
  const html = ler('orcamento.html');
  const ol = html.match(/<ol class="orc-etapas" id="o-etapas"[^>]*>([\s\S]*?)<\/ol>/)[1];
  const itens = [...ol.matchAll(/<li data-passo="(\w+)"[^>]*><span class="orc-etapas__n">(\d\d)<\/span><span class="orc-etapas__nome">([^<]+)<\/span><\/li>/g)].map((m) => m[1] + ':' + m[2] + ':' + m[3]);
  assert.deepEqual(itens, ['conversa:01:Perguntas', 'estimativa:02:Preço', 'direcoes:03:Modelos', 'ajustes:04:Ajustes', 'escopo:05:Resumo', 'pagamento:06:Entrada']);
  assert.match(ol, /<li data-passo="conversa" aria-current="step">/, 'a 1ª etapa nasce atual (o E2E do CI lê #o-etapas [aria-current])');
});
test('etapas no celular: o nome das outras etapas sai da VISTA, não do leitor de tela (clip, nunca display:none/visibility)', () => {
  const css = semComentarios(ler('css/orcamento.css'));
  const bloco = css.match(/@media \(max-width: 599px\) \{([\s\S]*?)\n\}/);
  assert.ok(bloco, 'o bloco do celular das etapas');
  const regra = bloco[1].match(/\.orc-etapas li:not\(\[aria-current="step"\]\) \.orc-etapas__nome \{([^}]*)\}/);
  assert.ok(regra, 'a regra que esconde o nome das outras etapas');
  assert.match(regra[1], /clip: rect\(0 0 0 0\)/);
  assert.match(regra[1], /position: absolute/);
  assert.doesNotMatch(regra[1], /display:\s*none|visibility:\s*hidden/);
  assert.match(bloco[1], /\.orc-etapas \{[^}]*flex-wrap: wrap/, 'uma linha (o flex da régua), e quebra em vez de passar da tela (fonte grande)');
  assert.doesNotMatch(bloco[1], /\.orc-etapas \{[^}]*display: grid/, 'nada de 3 colunas × 2 linhas');
});

test('o js/orcamento.js tira a classe ao assumir, ANTES da guarda dos scripts (sem módulo, as perguntas mortas não ficam à vista)', () => {
  const js = semComentarios(ler('js/orcamento.js'));
  const tira = js.indexOf("classList.remove('orc-nova')");
  const guarda = js.indexOf('semScripts(); return;');
  assert.ok(tira > 0 && guarda > 0 && tira < guarda, 'remove antes da guarda');
});
