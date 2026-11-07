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

/* 6. "Ver o preço" com o servidor lento: as perguntas saem NO TOQUE (dentro da janela de 500 ms que o navegador perdoa depois de uma ação), e o painel
   com o radar ("Identificando", pelo bz:calculando) é o que a pessoa vê enquanto a conta voa. Antes elas só saíam com a resposta: com mais de 500 ms, a
   mesa subia sem toque recente e o CLS ia a 0,32 (base) / 0,43 (com as etapas compactas), medido com 900 ms de atraso. Na FALHA, tudo volta como hoje:
   as perguntas à vista, a mensagem de sempre no #o-p-erro e o foco no botão. Roda o js/orcamento-perguntas.js REAL numa página de mentira. */
function paginaDasPerguntas() {
  const fonte = ler('js/orcamento-perguntas.js');
  const els = {}, ouvintes = {}, eventos = [];
  let foco = null;
  const el = (id) => {
    const escutas = {};
    const e = {
      id, hidden: false, textContent: '', value: '', disabled: false, tabIndex: 0, attrs: {}, children: [], classes: new Set(),
      classList: { add: (c) => e.classes.add(c), remove: (c) => e.classes.delete(c), contains: (c) => e.classes.has(c) },
      addEventListener: (t, f) => { (escutas[t] = escutas[t] || []).push(f); },
      clicar() { return Promise.all((escutas.click || []).map((f) => f.call(e, { preventDefault() {} }))); },
      setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute: (k) => (k in e.attrs ? e.attrs[k] : null), removeAttribute(k) { delete e.attrs[k]; }, hasAttribute: (k) => k in e.attrs,
      focus() { foco = e.id; }, scrollIntoView() {}, appendChild(c) { e.children.push(c); return c; }, remove() {},
      closest: () => $('o-painel-falso'), querySelector: () => el('h2-falso'), querySelectorAll: () => []
    };
    return e;
  };
  const $ = (id) => els[id] || (els[id] = el(id));
  ['o-perguntas', 'o-ajustar', 'o-est-acoes', 'o-diagnostico', 'o-est-inclui-caixa'].forEach((id) => { $(id); });
  $('o-ajustar').hidden = true; $('o-est-acoes').hidden = true;
  const telas = [1, 2, 3].map((n) => { const t = el('tela' + n); t.attrs['data-p'] = String(n); t.hidden = n !== 3; return t; });
  const servidor = { pendente: null };
  const API = {
    simular: () => new Promise((ok, falha) => { servidor.pendente = { ok, falha }; }),
    catalogo: () => Promise.resolve({ formatos: [{ chave: 'institucional', nome: 'Site institucional', a_partir_de: 7900, paginas_incluidas: 5, inclui: ['Até 5 páginas'] }], extras: { principais: [], mais: [] }, urgencia: null })
  };
  const doc = {
    getElementById: $, createElement: () => el('novo'),
    querySelectorAll: (s) => (s === '#o-perguntas .orc-p' ? telas : []), querySelector: () => null,
    dispatchEvent: (ev) => { eventos.push(ev.type + (ev.detail && 'ativo' in ev.detail ? ':' + ev.detail.ativo : '')); (ouvintes[ev.type] || []).forEach((f) => f(ev)); return true; },
    addEventListener: (t, f) => { (ouvintes[t] = ouvintes[t] || []).push(f); }
  };
  const painel = { focavel: 0 };
  const win = { BZOrcamento: API, document: doc, BZPainel: { focavel: () => { painel.focavel++; } } };
  win.window = win;
  vm.runInNewContext(fonte, { window: win, document: doc, setTimeout, clearTimeout, console, Object, Number, String, JSON, CustomEvent: function (tipo, o) { this.type = tipo; this.detail = o && o.detail; } });
  return { $, eventos, servidor, painel, foco: () => foco, assentar: async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); } };
}
const RESPOSTA = { estimativa: { valor_total: 8350, sinal: 3340, prazo_dias: 9, itens: [] }, recomendacao: { formato: 'institucional', motivo: 'm', assumido: [] }, versao: 1 };

test('"Ver o preço": as perguntas saem NO TOQUE (antes da resposta) e o foco vai para o título do painel, com o radar calculando', async () => {
  const p = paginaDasPerguntas();
  const clique = p.$('o-p-ver-preco').clicar();
  assert.equal(p.$('o-perguntas').hidden, true, 'escondidas antes de o servidor responder');
  assert.equal(p.foco(), 'o-est-titulo', 'o foco não cai no body: vai ao título do painel');
  assert.ok(p.eventos.includes('bz:calculando:true'), 'o radar recebe a conta em voo');
  assert.ok(p.$('o-painel-falso').classList.contains('is-1o-preco') && p.$('o-est').hidden, 'em voo: o painel guarda a altura da tela e o cartão de baixo sai (o preço entra no vão)');
  p.servidor.pendente.ok(RESPOSTA);
  await clique; await p.assentar();
  assert.equal(p.$('o-perguntas').hidden, true);
  assert.equal(p.$('o-est-acoes').hidden, false, 'o preço chegou: as ações do preço aparecem');
  assert.ok(!p.$('o-painel-falso').classList.contains('is-1o-preco') && !p.$('o-est').hidden, 'o cartão volta e a reserva de altura sai');
  assert.ok(p.painel.focavel > 0, 'a altura mudou: o tabindex do painel que rola por dentro é refeito (BZPainel.focavel)');
  assert.equal(p.$('o-p-ver-preco').textContent, 'Ver o preço');
});

test('"Ver o preço" que FALHA: as perguntas voltam como hoje, com a mensagem de sempre no lugar de sempre e o foco no botão', async () => {
  const p = paginaDasPerguntas();
  /* o #o-p-erro é role="alert": escrito com as perguntas ainda escondidas, o leitor de tela não anuncia. Registra se elas estavam à vista quando a mensagem entrou */
  const alerta = p.$('o-p-erro'); let texto = '', escritoEscondido = null;
  Object.defineProperty(alerta, 'textContent', { get: () => texto, set: (v) => { texto = String(v); if (texto) escritoEscondido = p.$('o-perguntas').hidden; } });
  const clique = p.$('o-p-ver-preco').clicar();
  assert.equal(p.$('o-perguntas').hidden, true);
  p.servidor.pendente.falha(Object.assign(new Error('Sem conexão. Confira a internet e tente de novo.'), { status: 0 }));
  await clique; await p.assentar();
  assert.equal(p.$('o-perguntas').hidden, false, 'as perguntas voltam');
  assert.equal(p.$('o-p-erro').textContent, 'Sem conexão. Confira a internet e tente de novo.', 'a mensagem nas perguntas, como hoje');
  assert.equal(escritoEscondido, false, 'a mensagem entra com as perguntas já à vista (o role="alert" é anunciado)');
  assert.equal(p.$('o-est-erro').textContent, '', 'nada no cartão (que nem está à vista)');
  assert.equal(p.foco(), 'o-p-ver-preco', 'o foco volta ao botão');
  assert.equal(p.$('o-p-ver-preco').getAttribute('aria-disabled'), null, 'o botão volta a funcionar');
  assert.equal(p.$('o-p-ver-preco').textContent, 'Ver o preço');
  assert.ok(p.eventos.includes('bz:calculando:false'), 'o radar para de varrer');
  assert.ok(!p.$('o-painel-falso').classList.contains('is-1o-preco') && !p.$('o-est').hidden, 'o painel volta como era');
});
test('a reserva de altura do 1º preço existe no CSS (sem ela o rodapé sobe e desce de novo)', () => {
  assert.match(semComentarios(ler('css/orcamento.css')), /\.orc-painel\.is-1o-preco \{ min-height: 100vh; \}/);
});
