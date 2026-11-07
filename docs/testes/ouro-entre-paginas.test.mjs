/* O OURO ENTRE PÁGINAS (2026-11-07). Dono: "quando trocamos de página ele simplesmente some, deve ser algo natural no
   site inteiro". O reinado guarda um PRAZO absoluto na sessão (bz-ouro-ate); o <head> da página seguinte (js/ancoras.js)
   pinta html.is-ouro antes do 1º quadro e o js/ouro.js retoma o reinado com o tempo que falta. Aqui: o prazo guardado,
   lido, vencido e malformado; a cabeça só pinta com prazo válido e sem movimento reduzido; a retomada; o orçamento só
   retoma; a travessia segue os tokens; os avisos do orçamento continuam distintos no ouro.
   O `testar` do package.json é uma lista fechada (mexer nele pede o "sim" do dono): este arquivo roda importado no fim
   de docs/testes/heroes.test.mjs, que já está na lista.  node --test docs/testes/ouro-entre-paginas.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ler = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ANCORAS = ler('js/ancoras.js'), OURO = ler('js/ouro.js');
const T0 = 1800000000000;

/* ---------- um navegador de mentira, o bastante para js/ancoras.js e js/ouro.js ---------- */
function classes(iniciais) {
  const s = new Set(iniciais || []);
  return {
    add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c),
    toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; }, _s: s
  };
}
function armazem(inicial, quebrado) {
  const m = new Map(Object.entries(inicial || {}));
  const q = () => { if (quebrado) throw new Error('SecurityError: armazenamento bloqueado'); };
  return { getItem: (k) => { q(); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { q(); m.set(k, String(v)); }, removeItem: (k) => { q(); m.delete(k); }, _m: m };
}
function elemento() {
  return { style: { setProperty() {}, transform: '' }, classList: classes(), setAttribute() {}, appendChild() {}, className: '', textContent: '' };
}
function navegador({ sessao = {}, local = {}, reduz = false, quebrado = false, html = [], dataOuro = null, B = true, agora = T0 } = {}) {
  const relogio = { agora, perf: 1000 };
  const timers = [];
  let proxId = 1;
  const ouvintes = {}, ouvintesB = {}, subs = [];
  const raiz = { classList: classes(html) };
  const FakeDate = class extends Date { static now() { return relogio.agora; } };
  const win = {
    Date: FakeDate, Math, JSON, String, Number, Object, Array, URLSearchParams, Error,
    console: { warn() {}, log() {}, error() {} },
    innerHeight: 800, innerWidth: 390, scrollY: 0, scrollX: 0,
    location: { pathname: '/', hash: '', search: '', replace() {} },
    sessionStorage: armazem(sessao, quebrado), localStorage: armazem(local, quebrado),
    performance: { now: () => relogio.perf },
    matchMedia: (q) => ({ matches: /reduce/.test(q) ? reduz : false, addEventListener() {} }),
    addEventListener: (ev, fn) => { (ouvintes[ev] || (ouvintes[ev] = [])).push(fn); },
    removeEventListener: (ev, fn) => { const l = ouvintes[ev] || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    setTimeout: (fn, ms) => { const id = proxId++; timers.push({ id, quando: relogio.agora + (ms || 0), fn, cada: 0 }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { const id = proxId++; timers.push({ id, quando: relogio.agora + ms, fn, cada: ms }); return id; },
    clearInterval: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
    requestAnimationFrame: () => 0,
    document: {
      documentElement: raiz, body: elemento(), hidden: false, readyState: 'complete',
      currentScript: dataOuro === null ? null : { getAttribute: (k) => (k === 'data-ouro' ? dataOuro : null) },
      createElement: () => elemento(), createTextNode: () => ({ nodeValue: '' }),
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {}
    }
  };
  win.window = win;
  if (B) {
    win.BEYON = {
      ouro: { k: 0, h: 0, carga: 0, estado: 'frio' }, reduced: false, iniciou: 0, emitidos: [],
      add: (n, f) => subs.push(f), on: (ev, f) => (ouvintesB[ev] || (ouvintesB[ev] = [])).push(f),
      emit: (ev, d) => { win.BEYON.emitidos.push([ev, d]); (ouvintesB[ev] || []).forEach((f) => f(d)); },
      iniciar: () => { win.BEYON.iniciou++; }
    };
  }
  vm.createContext(win);
  const api = {
    win, html: raiz.classList, sessao: win.sessionStorage._m, relogio,
    rodar: (src) => vm.runInContext(src, win),
    disparar: (ev, dados) => (ouvintes[ev] || []).slice().forEach((f) => f(dados || {})),
    gesto: () => (ouvintes.pointermove || []).slice().forEach((f) => f({ pointerType: 'touch' })),
    /* o tempo passa em quadros de 50 ms: os timers vencidos rodam e o laço (B.add) recebe o quadro */
    passar(ms) {
      const fim = relogio.agora + ms;
      while (relogio.agora < fim) {
        const passo = Math.min(50, fim - relogio.agora);
        relogio.agora += passo; relogio.perf += passo;
        for (const tm of timers.slice().sort((a, b) => a.quando - b.quando)) {
          if (tm.quando > relogio.agora || !timers.includes(tm)) continue;
          if (tm.cada) tm.quando += tm.cada; else timers.splice(timers.indexOf(tm), 1);
          tm.fn();
        }
        subs.forEach((f) => f({ dt: passo }));
      }
    }
  };
  return api;
}
const cabeca = (op) => { const n = navegador({ B: false, ...op }); n.rodar(ANCORAS); return n; };
const pagina = (op) => { const n = navegador(op); n.rodar(OURO); return n; };
const prazo = (n) => n.sessao.get('bz-ouro-ate');

/* ---------- o prazo ---------- */
test('o prazo do ouro: guardado ao acender e no reinado, lido na página seguinte; o vencido e o malformado saem', () => {
  const n = pagina();
  assert.equal(n.win.BEYON.ouro.acender(), true);
  const aoAcender = +prazo(n) - n.relogio.agora;
  assert.ok(aoAcender >= 33000 && aoAcender <= 34000, 'ao acender: carga + ignição + reinado à frente (' + aoAcender + ' ms)');
  n.passar(3600);
  assert.equal(n.win.BEYON.ouro.estado, 'reinado');
  const noReinado = +prazo(n) - n.relogio.agora;
  assert.ok(noReinado > 29000 && noReinado <= 30000, 'no reinado: os 30 s contados de agora (' + noReinado + ' ms)');
  for (const lixo of [String(T0 - 1), 'abc', '', '-5', String(T0 + 3600000), '1e400']) {
    const c = cabeca({ sessao: { 'bz-ouro-ate': lixo } });
    assert.ok(!c.html.contains('is-ouro'), 'a cabeça pintou o ouro com ' + JSON.stringify(lixo));
    assert.equal(prazo(c), undefined, 'a cabeça deixou o valor ' + JSON.stringify(lixo) + ' na sessão');
    const p = pagina({ sessao: { 'bz-ouro-ate': lixo } });
    assert.equal(p.win.BEYON.ouro.estado, 'frio', 'o ouro.js retomou com ' + JSON.stringify(lixo));
    assert.equal(prazo(p), undefined, 'o ouro.js deixou o valor ' + JSON.stringify(lixo) + ' na sessão');
  }
});

test('o mesmo teto do prazo na cabeça e no ouro.js, e ele cobre os três atos', () => {
  const tetoCabeca = +(ANCORAS.match(/OURO_TETO_MS = (\d+)/) || [])[1];
  const tetoOuro = +(OURO.match(/TETO_MS = (\d+)/) || [])[1];
  assert.ok(tetoCabeca > 0 && tetoCabeca === tetoOuro, 'os tetos divergem: cabeça ' + tetoCabeca + ', ouro.js ' + tetoOuro);
  const n = pagina(), T = n.win.BEYON.ouro.T;
  assert.ok(tetoOuro >= (T.carga + T.ignicao + T.reinado) * 1000, 'o teto corta o prazo guardado ao acender');
});

/* ---------- a cabeça ---------- */
test('a cabeça pinta html.is-ouro antes do 1º quadro só com prazo válido e sem movimento reduzido', () => {
  const valido = { 'bz-ouro-ate': String(T0 + 12000) };
  assert.ok(cabeca({ sessao: valido }).html.contains('is-ouro'), 'prazo válido: a página nasce em ouro');
  assert.ok(!cabeca({ sessao: valido, reduz: true }).html.contains('is-ouro'), 'prefers-reduced-motion: nada de ouro');
  assert.ok(!cabeca({ sessao: valido, local: { 'bz-menos-movimento': '1' } }).html.contains('is-ouro'), 'o interruptor "menos movimento": nada de ouro');
  assert.ok(!cabeca().html.contains('is-ouro'), 'sem prazo: ciano, como sempre');
  assert.doesNotThrow(() => cabeca({ sessao: valido, quebrado: true }), 'armazenamento bloqueado não pode derrubar a cabeça');
  assert.ok(!cabeca({ sessao: valido, quebrado: true }).html.contains('is-ouro'));
  assert.ok(cabeca({ sessao: valido }).html.contains('js'), 'o resto da cabeça segue (html.js)');
});

test('página sem o ouro.js (privacidade, condições, 404): o ouro some sozinho no prazo, em silêncio', () => {
  const c = cabeca({ sessao: { 'bz-ouro-ate': String(T0 + 8000) } });
  c.disparar('load');
  c.passar(7900);
  assert.ok(c.html.contains('is-ouro'), 'antes do prazo, segue em ouro');
  c.passar(200);
  assert.ok(!c.html.contains('is-ouro'), 'no prazo, o ouro sai');
  assert.ok(c.html.contains('is-ouro-fim'), 'sai pela transição da troca (is-ouro-fim), não de estalo');
  assert.equal(prazo(c), undefined, 'o prazo sai da sessão');
  assert.ok(+c.sessao.get('bz-ouro-fim') > 0, 'o fim fica anotado (o intervalo mínimo vale entre páginas)');
  c.passar(1000);
  assert.ok(!c.html.contains('is-ouro-fim'));
  /* com o ouro.js na página, a cabeça não mexe */
  const d = cabeca({ sessao: { 'bz-ouro-ate': String(T0 + 8000) } });
  d.win.BEYON = { ouro: { dono: true } };
  d.disparar('load'); d.passar(9000);
  assert.ok(d.html.contains('is-ouro'), 'a cabeça tirou o ouro de uma página que o ouro.js comanda');
});

/* ---------- a retomada ---------- */
test('a retomada: a página nova abre no reinado com o tempo que falta, e o resfriamento acontece nela', () => {
  const n = pagina({ sessao: { 'bz-ouro-ate': String(T0 + 12000) }, html: ['is-ouro'] });
  const o = n.win.BEYON.ouro;
  assert.equal(o.estado, 'reinado'); assert.equal(o.k, 1, 'B.ouro.k = 1 desde o 1º quadro (canvases e reator)');
  assert.ok(n.html.contains('is-ouro'));
  assert.ok(!n.html.contains('is-ouro-carga') && !n.html.contains('is-ouro-ignicao'), 'os cinco atos não se repetem na chegada');
  assert.ok(Math.abs(o.resta() - 12000) <= 50, 'resta ' + o.resta());
  assert.ok(n.win.BEYON.iniciou > 0, 'o laço é ligado (páginas sem js/pagina.js)');
  assert.ok(n.win.BEYON.emitidos.some(([ev, d]) => ev === 'ouro' && d.fase === 'reinado' && d.retomado), 'avisa o reinado retomado');
  n.passar(6000);
  assert.ok(Math.abs(o.resta() - 6000) <= 100, 'o tempo que falta diminui: ' + o.resta());
  n.passar(6100);
  assert.equal(o.estado, 'esfria', 'no prazo, o resfriamento nesta página');
  assert.equal(prazo(n), undefined, 'resfriando: a página seguinte já abre em ciano');
  n.passar(2400);
  assert.equal(o.estado, 'frio'); assert.ok(!n.html.contains('is-ouro')); assert.equal(o.k, 0);
  assert.ok(+n.sessao.get('bz-ouro-fim') > 0);
});

test('saiu na carga ou na ignição: a página seguinte abre no reinado (sem repetir os cinco atos), no máximo 30 s', () => {
  const a = pagina();
  a.win.BEYON.ouro.acender(); a.passar(500);
  assert.equal(a.win.BEYON.ouro.estado, 'carga');
  const b = pagina({ sessao: { 'bz-ouro-ate': prazo(a) } });
  assert.equal(b.win.BEYON.ouro.estado, 'reinado');
  assert.ok(b.win.BEYON.ouro.resta() <= 30000, 'o reinado retomado nunca passa de 30 s: ' + b.win.BEYON.ouro.resta());
  assert.ok(+prazo(b) - b.relogio.agora <= 30000, 'e o prazo guardado concorda');
});

test('na travessia (clique num link do site): o ouro que acendia assenta no reinado; o que esfriava termina', () => {
  const a = pagina();
  a.win.BEYON.ouro.acender(); a.passar(400);
  a.win.BEYON.emit('passagem', { nome: 'sites' });
  assert.equal(a.win.BEYON.ouro.estado, 'reinado', 'a saída já é dourada');
  assert.ok(a.html.contains('is-ouro') && !a.html.contains('is-ouro-carga'));
  assert.equal(a.win.BEYON.ouro.k, 1);
  const b = pagina({ sessao: { 'bz-ouro-ate': String(T0 + 1000) } });
  b.passar(1100);
  assert.equal(b.win.BEYON.ouro.estado, 'esfria');
  b.win.BEYON.emit('passagem', { nome: 'inicio' });
  assert.equal(b.win.BEYON.ouro.estado, 'frio');
  assert.equal(prazo(b), undefined);
});

test('voltar pelo histórico (bfcache): a página guardada acerta o relógio com a sessão', () => {
  const a = pagina();
  a.disparar('pageshow', { persisted: true });
  assert.equal(a.win.BEYON.ouro.estado, 'frio', 'sem prazo, nada muda');
  a.sessao.set('bz-ouro-ate', String(a.relogio.agora + 9000));
  a.disparar('pageshow', { persisted: true });
  assert.equal(a.win.BEYON.ouro.estado, 'reinado', 'o ouro acendeu em outra página: esta volta nele');
  a.sessao.delete('bz-ouro-ate');
  a.disparar('pageshow', { persisted: true });
  assert.equal(a.win.BEYON.ouro.estado, 'esfria', 'o ouro acabou em outra página: esta resfria');
});

test('nasceu dourada mas o prazo venceu antes de o ouro.js rodar (aparelho lento): resfria nesta página', () => {
  const n = pagina({ html: ['is-ouro'] });
  n.passar(100);
  assert.equal(n.win.BEYON.ouro.estado, 'esfria', 'a página não pode ficar dourada com o laço parado');
  n.passar(2400);
  assert.equal(n.win.BEYON.ouro.estado, 'frio'); assert.ok(!n.html.contains('is-ouro')); assert.equal(n.win.BEYON.ouro.k, 0);
});

test('voltar pelo histórico no meio da carga: com prazo, assenta no reinado dele; sem prazo, termina sem repetir o evento', () => {
  const a = pagina();
  a.win.BEYON.ouro.acender(); a.passar(300);
  const ate = +prazo(a);
  a.disparar('pageshow', { persisted: true });
  assert.equal(a.win.BEYON.ouro.estado, 'reinado');
  assert.ok(+prazo(a) <= ate, 'o prazo da sessão vale, não 30 s novos');
  const b = pagina();
  b.win.BEYON.ouro.acender(); b.passar(300);
  b.sessao.delete('bz-ouro-ate');
  b.disparar('pageshow', { persisted: true });
  assert.equal(b.win.BEYON.ouro.estado, 'frio', 'o ouro acabou em outra página: esta não acende de novo');
});

test('quem sai no meio do resfriamento leva o fim junto (o intervalo mínimo não se perde)', () => {
  const n = pagina({ sessao: { 'bz-ouro-ate': String(T0 + 500) } });
  n.passar(600);
  assert.equal(n.win.BEYON.ouro.estado, 'esfria');
  assert.ok(+n.sessao.get('bz-ouro-fim') > 0, 'o fim já está na sessão no começo do resfriamento');
  assert.equal(pagina({ sessao: Object.fromEntries(n.sessao), agora: n.relogio.agora + 300 }).win.BEYON.ouro.acender(), false, 'a página seguinte respeita os 30 s');
});

test('página sem o ouro.js, de volta pelo histórico: o relógio é a sessão', () => {
  const c = cabeca();
  c.disparar('load');
  c.sessao.set('bz-ouro-ate', String(c.relogio.agora + 4000));
  c.disparar('pageshow', { persisted: true });
  assert.ok(c.html.contains('is-ouro'), 'o ouro começou em outra página: esta volta dourada');
  c.sessao.delete('bz-ouro-ate');
  c.disparar('pageshow', { persisted: true });
  assert.ok(!c.html.contains('is-ouro'), 'o ouro acabou em outra página: esta sai dele');
  assert.equal(c.sessao.get('bz-ouro-fim'), undefined, 'e não anota um fim que não foi aqui');
  c.passar(5000);
  assert.equal(c.sessao.get('bz-ouro-fim'), undefined, 'o timer velho não apaga nem anota nada');
});

test('as páginas que ganharam a cabeça só pelo ouro não escondem nada sob html.js (o contrato de revelação mora no motion.css)', () => {
  for (const f of ['css/tokens.css', 'privacidade.css']) assert.doesNotMatch(semComentarios(ler(f)), /html\.js\b/, f);
});

test('movimento reduzido: nada de ouro, nem o que a cabeça tiver pintado; armazenamento bloqueado não derruba', () => {
  const n = navegador({ sessao: { 'bz-ouro-ate': String(T0 + 12000) }, html: ['is-ouro'], reduz: true });
  n.rodar(OURO);
  assert.ok(!n.html.contains('is-ouro'));
  assert.equal(n.win.BEYON.ouro.estado, 'frio');
  const r = pagina({ sessao: { 'bz-ouro-ate': String(T0 + 12000) } });
  r.win.BEYON.reduced = true; r.win.BEYON.emit('reduzir', true);
  assert.equal(r.win.BEYON.ouro.estado, 'frio'); assert.equal(prazo(r), undefined, 'desligou no meio: a próxima página não volta em ouro');
  assert.doesNotThrow(() => pagina({ quebrado: true }));
  const q = pagina({ quebrado: true });
  assert.equal(q.win.BEYON.ouro.acender(), true, 'sem armazenamento, o ouro ainda acontece nesta página');
});

test('o intervalo mínimo de 30 s vale entre páginas (medido do fim)', () => {
  assert.equal(pagina({ sessao: { 'bz-ouro-fim': String(T0 - 10000) } }).win.BEYON.ouro.acender(), false, '10 s depois do fim, em outra página');
  assert.equal(pagina({ sessao: { 'bz-ouro-fim': String(T0 - 31000) } }).win.BEYON.ouro.acender(), true, '31 s depois');
  assert.equal(pagina({ sessao: { 'bz-ouro-fim': String(T0 + 99999) } }).win.BEYON.ouro.acender(), true, 'um fim no futuro é lixo');
});

/* ---------- o orçamento ---------- */
test('no orçamento o ouro só retoma: nunca acende sozinho nem por chamada', () => {
  const html = ler('orcamento.html');
  assert.match(html, /<script src="js\/ouro\.js" data-ouro="retoma" defer><\/script>/, 'orcamento.html carrega o ouro em modo só retomada');
  const n = pagina({ dataOuro: 'retoma', sessao: { 'bz-atencao': '41' } });
  for (let i = 0; i < 90; i++) { n.gesto(); n.passar(1000); }
  assert.equal(n.win.BEYON.ouro.estado, 'frio', 'acendeu sozinho no orçamento');
  assert.equal(n.win.BEYON.ouro.acender(), false, 'acender() no orçamento');
  const r = pagina({ dataOuro: 'retoma', sessao: { 'bz-ouro-ate': String(T0 + 9000) } });
  assert.equal(r.win.BEYON.ouro.estado, 'reinado', 'mas retoma o ouro que veio de outra página');
  /* nas páginas de conteúdo o sozinho segue: uma vez por visita, aos 42 s somados */
  const c = pagina({ sessao: { 'bz-atencao': '41' } });
  c.gesto(); c.passar(1000); c.gesto(); c.passar(1000);
  assert.equal(c.win.BEYON.ouro.estado, 'carga', 'o sozinho das páginas de conteúdo');
  assert.equal(c.sessao.get('bz-ouro'), '1');
});

/* ---------- as páginas ---------- */
test('toda página pública com a cabeça do site carrega o ouro; o resumo e o painel ficam de fora', () => {
  for (const p of ['index.html', 'sites.html', 'automacao.html', 'orcamento.html']) {
    const h = ler(p);
    const core = h.indexOf('src="js/core.js"'), ouro = h.indexOf('src="js/ouro.js"'), metr = h.indexOf('src="js/metricas.js"');
    assert.ok(core > 0 && ouro > core, p + ': o ouro.js depois do core.js');
    assert.ok(metr > 0 && ouro > metr, p + ': o ouro.js depois do metricas.js (ele ouve o reinado retomado)');
    assert.ok(h.indexOf('js/ancoras.js') < h.indexOf('</head>'), p + ': a cabeça no <head>');
  }
  for (const [p, src] of [['privacidade.html', 'js/ancoras.js'], ['condicoes.html', 'js/ancoras.js'], ['404.html', '/js/ancoras.js']]) {
    const h = ler(p), cab = h.slice(0, h.indexOf('</head>'));
    assert.ok(cab.includes('<script src="' + src + '"></script>'), p + ': sem a cabeça (' + src + ') no <head>');
  }
  for (const p of ['resumo.html', 'painel.html']) assert.ok(!/ancoras\.js|ouro\.js/.test(ler(p)), p + ': fica isolado de propósito');
});

/* ---------- as cores ---------- */
test('os tokens do ouro moram no <body>: o <html> segue ciano e quem lê a paleta no boot (core.js, rede, mini) lê o ciano', () => {
  const tokens = semComentarios(ler('css/tokens.css'));
  assert.match(tokens, /html\.is-ouro > body, \.is-brasa \{[^}]*--ac-rgb: 255 190 60/, 'tokens.css: o ouro em html.is-ouro > body');
  assert.doesNotMatch(tokens, /html\.is-ouro\s*[,{]/, 'tokens.css: token de ouro direto no <html> (o boot leria o ouro como ciano)');
  const core = ler('js/core.js');
  assert.match(core, /var ouro = \{ k: naVolta \? 1 : 0/, 'core.js: k = 1 desde o 1º quadro numa página que abre em ouro');
});

test('a travessia segue os tokens: nenhuma cor fixa em css/passagem*.css', () => {
  for (const f of ['css/passagem.css', 'css/passagem-destinos.css']) {
    const css = semComentarios(ler(f));
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, f + ': cor em hexadecimal (no ouro ficaria ciano)');
    assert.doesNotMatch(css, /rgba?\(\s*\d/, f + ': rgb() com número fixo');
    assert.match(css, /var\(--ac-rgb\)/, f + ': os riscos e as réguas pintam por --ac-rgb');
  }
});

test('no ouro, aviso e erro do orçamento e do recado não se confundem com a energia', () => {
  const tokens = semComentarios(ler('css/tokens.css'));
  assert.match(tokens, /:root \{[^}]*--aviso-rgb: var\(--ouro-rgb\)/, 'fora do ouro, o aviso é o ouro de sempre');
  const noOuro = (tokens.match(/html\.is-ouro > body, \.is-brasa \{([^}]*)\}/) || [])[1] || '';
  assert.doesNotMatch(noOuro, /--aviso-rgb/, 'uma peça em brasa não troca o aviso');
  const corpo = (tokens.match(/html\.is-ouro > body \{([^}]*)\}/) || [])[1] || '';
  const aviso = (corpo.match(/--aviso-rgb: ([\d ]+);/) || [])[1];
  assert.ok(aviso && aviso !== '255 190 60', 'no ouro, o aviso precisa de outra cor');
  for (const f of ['css/orcamento.css', 'css/recado.css']) {
    const css = semComentarios(ler(f));
    assert.doesNotMatch(css, /rgb\(var\(--ouro-rgb/, f + ': aviso/erro direto no --ouro-rgb (no ouro some no meio da energia)');
    assert.match(css, /--aviso-rgb/, f);
  }
});
