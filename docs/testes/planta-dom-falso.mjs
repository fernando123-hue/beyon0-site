/* UM DOM DE MENTIRA, o mínimo para rodar js/planta-desenho.js em Node (não é teste: o agregador só importa planta-*.test.mjs).
   O que ele registra, para os testes olharem: a árvore de elementos, atributos, classes, textContent, as animações pedidas (animate),
   os temporizadores, os ouvintes de evento e o IntersectionObserver. innerHTML, outerHTML e insertAdjacentHTML LANÇAM: se o módulo os
   tocasse, o teste quebraria na hora. Tempo falso: `janela.avancar(ms)` roda os temporizadores em ordem. */

export class Texto { constructor(t) { this.nodeType = 3; this.texto = String(t); this.pai = null; } get textContent() { return this.texto; } }

export class No {
  constructor(doc, ns, tag) {
    this.ownerDocument = doc; this.namespaceURI = ns; this.tagName = ns ? tag : String(tag).toUpperCase(); this.nodeType = 1;
    this.attrs = {}; this.filhos = []; this.pai = null; this.dataset = {}; this.estilo = {}; this.ouvintes = {}; this.animacoes = [];
    this._classes = new Set(); this._valor = {};
    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => self._classes.add(c)); }, remove(...cs) { cs.forEach((c) => self._classes.delete(c)); },
      contains(c) { return self._classes.has(c); },
      toggle(c, f) { const quer = f === undefined ? !self._classes.has(c) : !!f; if (quer) self._classes.add(c); else self._classes.delete(c); return quer; }
    };
    this.style = new Proxy(this.estilo, { set: (o, k, v) => { o[k] = v; return true; } });
    this.clientWidth = 0;
    if (doc.semAnimate) this.animate = undefined;
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  appendChild(c) { if (c.pai) c.pai.removeChild(c); c.pai = this; this.filhos.push(c); return c; }
  removeChild(c) { const i = this.filhos.indexOf(c); if (i >= 0) { this.filhos.splice(i, 1); c.pai = null; } return c; }
  remove() { if (this.pai) this.pai.removeChild(this); }
  get firstChild() { return this.filhos[0] || null; }
  get parentNode() { return this.pai; }
  get children() { return this.filhos.filter((f) => f.nodeType === 1); }
  get textContent() { return this.filhos.map((f) => f.textContent).join(''); }
  set textContent(v) { this.filhos.forEach((f) => { f.pai = null; }); this.filhos = []; if (v !== '' && v != null) { const t = new Texto(v); t.pai = this; this.filhos.push(t); } }
  get innerHTML() { throw new Error('innerHTML é proibido nos módulos da planta'); }
  set innerHTML(v) { throw new Error('innerHTML é proibido nos módulos da planta: ' + v); }
  get outerHTML() { throw new Error('outerHTML é proibido nos módulos da planta'); }
  set outerHTML(v) { throw new Error('outerHTML é proibido nos módulos da planta: ' + v); }
  insertAdjacentHTML() { throw new Error('insertAdjacentHTML é proibido nos módulos da planta'); }
  addEventListener(t, f) { (this.ouvintes[t] = this.ouvintes[t] || []).push(f); }
  removeEventListener(t, f) { this.ouvintes[t] = (this.ouvintes[t] || []).filter((x) => x !== f); }
  disparar(t, ev) { (this.ouvintes[t] || []).slice().forEach((f) => f(Object.assign({ type: t, target: this }, ev || {}))); }
  focus() { this.ownerDocument.ativo = this; }
  getBoundingClientRect() { return { top: 0, left: 0, width: this.clientWidth, height: 0, bottom: 0, right: this.clientWidth }; }
  animate(keyframes, opcoes) {
    const a = {
      elemento: this, keyframes, opcoes: opcoes || {}, estado: 'running', cancelado: false, pausas: 0, plays: 0,
      get playState() { return this.estado; },
      pause() { if (this.cancelado) return; this.estado = 'paused'; this.pausas++; },
      play() { if (this.cancelado) return; this.estado = 'running'; this.plays++; },
      cancel() { this.estado = 'idle'; this.cancelado = true; },
      finish() { this.estado = 'finished'; if (this.onfinish) this.onfinish(); }
    };
    this.animacoes.push(a); this.ownerDocument.animacoes.push(a);
    return a;
  }
  /* utilitários dos testes */
  achar(fn, saida) {
    const out = saida || [];
    if (fn(this)) out.push(this);
    this.filhos.forEach((f) => { if (f.nodeType === 1) f.achar(fn, out); });
    return out;
  }
  porClasse(c) { return this.achar((n) => n._classes.has(c)); }
  /* só seletor simples: tag ou .classe */
  querySelector(sel) { return sel[0] === '.' ? this.porClasse(sel.slice(1))[0] || null : this.porTag(sel)[0] || null; }
  porTag(t) { const T = t.toLowerCase(); return this.achar((n) => String(n.tagName).toLowerCase() === T); }
}

export function criarJanela(opcoes) {
  const op = Object.assign({ reduzido: false, largura: 390, semAnimate: false, semIO: false, beyon: true }, opcoes || {});
  const doc = { animacoes: [], todos: [], hidden: false, ouvintes: {}, ativo: null };
  doc.createElement = (t) => { const n = new No(doc, null, t); doc.todos.push(n); return n; };
  doc.createElementNS = (ns, t) => { const n = new No(doc, ns, t); doc.todos.push(n); return n; };
  doc.createTextNode = (t) => new Texto(t);
  doc.documentElement = new No(doc, null, 'html');
  doc.addEventListener = (t, f) => { (doc.ouvintes[t] = doc.ouvintes[t] || []).push(f); };
  doc.removeEventListener = (t, f) => { doc.ouvintes[t] = (doc.ouvintes[t] || []).filter((x) => x !== f); };
  doc.disparar = (t) => (doc.ouvintes[t] || []).slice().forEach((f) => f({ type: t }));
  /* tempo falso */
  const w = { document: doc, agora: 0, timers: [], seq: 0, ouvintes: {}, observadores: [], innerWidth: op.largura, innerHeight: 800, opcoes: op };
  w.performance = { now: () => w.agora };
  w.setTimeout = (fn, ms) => { const id = ++w.seq; w.timers.push({ id, em: w.agora + Math.max(0, ms || 0), fn }); return id; };
  w.clearTimeout = (id) => { w.timers = w.timers.filter((t) => t.id !== id); };
  w.avancar = (ms) => {
    const fim = w.agora + ms;
    for (;;) {
      const prox = w.timers.filter((t) => t.em <= fim).sort((a, b) => a.em - b.em || a.id - b.id)[0];
      if (!prox) break;
      w.timers = w.timers.filter((t) => t !== prox);
      w.agora = Math.max(w.agora, prox.em);
      prox.fn();
    }
    w.agora = fim;
  };
  w.matchMedia = (q) => ({ matches: op.reduzido && /prefers-reduced-motion/.test(q), media: q });
  w.addEventListener = (t, f) => { (w.ouvintes[t] = w.ouvintes[t] || []).push(f); };
  w.removeEventListener = (t, f) => { w.ouvintes[t] = (w.ouvintes[t] || []).filter((x) => x !== f); };
  w.disparar = (t) => (w.ouvintes[t] || []).slice().forEach((f) => f({ type: t }));
  if (!op.semIO) {
    w.IntersectionObserver = function (cb, o) {
      this.cb = cb; this.opcoes = o; this.alvos = []; this.ativo = true; w.observadores.push(this);
      this.observe = (el) => { this.alvos.push(el); };
      this.unobserve = (el) => { this.alvos = this.alvos.filter((x) => x !== el); };
      this.disconnect = () => { this.ativo = false; this.alvos = []; };
    };
    /* o teste diz quando a faixa aparece: ratio = fração visível */
    w.mostrar = (ratio, alturaVisivel) => w.observadores.filter((o) => o.ativo).forEach((o) => o.cb(o.alvos.map((el) => ({ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio, intersectionRect: { height: alturaVisivel === undefined ? ratio * 900 : alturaVisivel } }))));
  }
  /* o laço e o barramento do site (js/core.js): BEYON.on / off / emit; o 'reduzir' é o que o interruptor "menos movimento" emite */
  if (op.beyon) w.BEYON = { handlers: {}, on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }, off(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter((x) => x !== fn); }, emit(ev, v) { (this.handlers[ev] || []).slice().forEach((f) => f(v)); } };
  w.pendentes = () => w.timers.length;
  w.ativas = () => doc.animacoes.filter((a) => !a.cancelado);
  w.rodando = () => doc.animacoes.filter((a) => !a.cancelado && a.estado === 'running');
  /* o elemento que o 2c entrega: já visível e com largura */
  w.raiz = (largura) => { const r = doc.createElement('section'); r.clientWidth = largura === undefined ? op.largura : largura; return r; };
  doc.semAnimate = op.semAnimate;   /* o teste "sem a API de animação" tira o animate dos elementos */
  return w;
}

/* a árvore de Nó do quadro, mais fácil de procurar */
export const textosDe = (no) => no.achar((n) => n.nodeType === 1).map((n) => n.textContent);

/* as chaves próprias que um nó do DOM de mentira pode ter: qualquer outra (onclick, href, title...) é propriedade que o módulo gravou à mão */
export const CHAVES_DO_NO = ['ownerDocument', 'namespaceURI', 'tagName', 'nodeType', 'attrs', 'filhos', 'pai', 'dataset', 'estilo', 'ouvintes', 'animacoes', '_classes', '_valor', 'classList', 'style', 'clientWidth', 'animate'];
export const chavesDeMais = (no) => Object.keys(no).filter((k) => !CHAVES_DO_NO.includes(k));
