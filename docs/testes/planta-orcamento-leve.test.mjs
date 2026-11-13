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

/* (orçamento como conversa, spec 2026-11-13 §1) a tela de perguntas saiu: a conversa É a página e nasce à vista, sem esperar script (nada pula
   na 1ª pintura). As perguntas fixas são falas do Zero com opções, dentro da caixa (js/orcamento-toques.js) */
test('a conversa nasce à vista no HTML (sem hidden) e não há mais tela de perguntas nem "Prefere conversar?"', () => {
  const html = ler('orcamento.html');
  assert.match(html, /<section class="orc-conversa" id="o-conversa"[^>]*aria-labelledby="o-conversa-titulo">/);
  assert.doesNotMatch(html, /<section class="orc-conversa" id="o-conversa"[^>]* hidden>/);
  assert.doesNotMatch(html, /id="o-perguntas"|id="o-conversar"|id="o-p-ver-preco"/);
  assert.match(html, /<script src="js\/orcamento-rotulos\.js" defer><\/script>\s*<script src="js\/orcamento-toques\.js" defer><\/script>\s*<script src="js\/orcamento-perguntas\.js" defer><\/script>/, 'os toques antes dos controles e da página');
  assert.match(html, /<script src="js\/ancoras\.js" data-orcamento><\/script>/);
});

/* 3. A 1ª tela do celular: as etapas numa linha só (os números e o nome da etapa atual); os seis nomes seguem no DOM para o leitor de tela */
test('etapas: cada uma com o número e o nome em <span> próprios; os cinco nomes no HTML (o preço mora na conversa)', () => {
  const html = ler('orcamento.html');
  const ol = html.match(/<ol class="orc-etapas" id="o-etapas"[^>]*>([\s\S]*?)<\/ol>/)[1];
  const itens = [...ol.matchAll(/<li data-passo="(\w+)"[^>]*><span class="orc-etapas__n">(\d\d)<\/span><span class="orc-etapas__nome">([^<]+)<\/span><\/li>/g)].map((m) => m[1] + ':' + m[2] + ':' + m[3]);
  assert.deepEqual(itens, ['conversa:01:Conversa', 'direcoes:02:Modelos', 'ajustes:03:Ajustes', 'escopo:04:Resumo', 'pagamento:05:Entrada']);
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

/* 5. "Já vem no pacote" depois de recarregar um pedido salvo: antes só as perguntas o enchiam (pelo catálogo, js/orcamento-perguntas.js incluidos()).
   Com o pacote gravado, a fonte é a estimativa salva: E.estimativa.detalhes.formato.inclui (api/_vendas/precos.mjs; a mesma lista fmt.inclui da tabela
   que o catálogo devolve). Sem a lista na estimativa, nada é inventado: a caixa segue como estava. Roda o js/orcamento.js REAL na página falsa. */
const DETALHES = { formato: { chave: 'institucional', nome: 'Site institucional', paginas_incluidas: 5, inclui: ['Até 5 páginas', 'Formulário de contato'] }, itens: [{ chave: 'agendamento', nome: 'Agendamento online', qtd: 1, valor: 450 }], valor_total: 8350, sinal: 4175, prazo_dias: 9 };
const textos = (el) => el.children.map((li) => li.textContent);
async function paginaSalva(detalhes) {
  const { criarPagina } = await import('./planta-pagina-falsa.mjs');
  const p = criarPagina({ estimativa: { valor_total: detalhes.valor_total, prazo_dias: detalhes.prazo_dias, detalhes }, escondidos: ['o-est-inclui-caixa'] });
  assert.ok(await p.pronta(), 'a página leu o estado e desenhou');
  return p;
}
test('pedido salvo recarregado: "Já vem no pacote" vem da estimativa salva (formato.inclui), na ordem dela', async () => {
  const p = await paginaSalva(DETALHES);
  assert.deepEqual(textos(p.doc.getElementById('o-est-inclui')), ['Até 5 páginas', 'Formulário de contato']);
  assert.equal(p.doc.getElementById('o-est-inclui-caixa').hidden, false);
});
test('pedido salvo SEM a lista na estimativa (a tabela não abate nada no formato): nada inventado, a caixa segue escondida', async () => {
  const semLista = { ...DETALHES, formato: { chave: 'institucional', nome: 'Site institucional', paginas_incluidas: 5 } };
  const p = await paginaSalva(semLista);
  assert.deepEqual(textos(p.doc.getElementById('o-est-inclui')), []);
  assert.equal(p.doc.getElementById('o-est-inclui-caixa').hidden, true);
  const vazia = await paginaSalva({ ...DETALHES, formato: { ...DETALHES.formato, inclui: [] } });
  assert.equal(vazia.doc.getElementById('o-est-inclui-caixa').hidden, true, 'lista vazia: idem');
});
test('a lista gravada em todo formato (formato.no_pacote, 07/11) vence a do contrato (formato.inclui); a estimativa antiga só com inclui segue igual', async () => {
  const p = await paginaSalva({ ...DETALHES, formato: { ...DETALHES.formato, inclui: ['Do contrato'], no_pacote: ['Até 5 páginas', 'Celular primeiro'] } });
  assert.deepEqual(textos(p.doc.getElementById('o-est-inclui')), ['Até 5 páginas', 'Celular primeiro']);
  const so = await paginaSalva({ ...DETALHES, formato: { chave: 'institucional', nome: 'Site institucional', paginas_incluidas: 5, no_pacote: ['Até 5 páginas', 7, ''] } });
  assert.deepEqual(textos(so.doc.getElementById('o-est-inclui')), ['Até 5 páginas'], 'só texto vira item');
  assert.equal(so.doc.getElementById('o-est-inclui-caixa').hidden, false);
  const vazia = await paginaSalva({ ...DETALHES, formato: { ...DETALHES.formato, inclui: ['  Até 5 páginas  '], no_pacote: [] } });
  assert.deepEqual(textos(vazia.doc.getElementById('o-est-inclui')), ['Até 5 páginas'], 'no_pacote vazio não apaga a lista antiga, e o item sai sem espaço nas pontas');
});
test('a lista da estimativa só aceita texto (lixo no dado não vira item na tela)', async () => {
  const p = await paginaSalva({ ...DETALHES, formato: { ...DETALHES.formato, inclui: ['Até 5 páginas', 42, null, '  ', { x: 1 }] } });
  assert.deepEqual(textos(p.doc.getElementById('o-est-inclui')), ['Até 5 páginas']);
});

test('o js/orcamento.js tira a classe ao assumir, ANTES da guarda dos scripts (sem módulo, as perguntas mortas não ficam à vista)', () => {
  const js = semComentarios(ler('js/orcamento.js'));
  const tira = js.indexOf("classList.remove('orc-nova')");
  const guarda = js.indexOf('semScripts(); return;');
  assert.ok(tira > 0 && guarda > 0 && tira < guarda, 'remove antes da guarda');
});

/* 6. ("Ver o preço" saiu com a tela de perguntas, orçamento como conversa 13/11: o 1º preço agora é o turno do valor, dentro da conversa) */
test('a reserva de altura do 1º preço existe no CSS (sem ela o rodapé sobe e desce de novo)', () => {
  assert.match(semComentarios(ler('css/orcamento.css')), /\.orc-painel\.is-1o-preco \{ min-height: 100vh; \}/);
});
