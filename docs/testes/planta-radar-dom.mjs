/* DOM DE MENTIRA PARA OS TESTES DO RADAR (não é um teste: o nome não termina em ".test.mjs", então o agregador planta-todos.test.mjs
   não o importa). Só o que js/planta-radar.js usa: criar elementos (HTML e SVG), atributos, classes, filhos, textContent, style,
   ouvintes, animate e ResizeObserver. Tudo que o módulo faz fica registrado em `registro` para o teste conferir.
   `innerHTML`, `outerHTML` e `insertAdjacentHTML` LANÇAM: se o módulo os usasse, o teste cairia na hora (além da leitura do código). */
import vm from 'node:vm';
import fs from 'node:fs';

const NO_HTML = (nome) => () => { throw new Error('PROIBIDO: ' + nome); };

class No {
  constructor(tag, ns, doc) {
    this.tag = tag; this.ns = ns; this.doc = doc;
    this.atributos = {}; this.filhos = []; this.pai = null; this.ouvintes = {};
    this.style = {}; this._texto = null; this.animacoes = [];
    const self = this;
    this.classList = {
      add(...cs) { cs.forEach((c) => { if (!self.classes().includes(c)) self.atributos.class = (self.atributos.class ? self.atributos.class + ' ' : '') + c; }); },
      remove(...cs) { self.atributos.class = self.classes().filter((c) => !cs.includes(c)).join(' '); },
      contains(c) { return self.classes().includes(c); },
      toggle(c, f) { const tem = self.classes().includes(c); const quer = f === undefined ? !tem : !!f; if (quer && !tem) this.add(c); if (!quer && tem) this.remove(c); return quer; }
    };
    doc.registro.criados.push(this);
  }
  classes() { return (this.atributos.class || '').split(/\s+/).filter(Boolean); }
  get className() { return this.atributos.class || ''; }
  set className(v) { this.atributos.class = String(v); }
  setAttribute(k, v) { this.atributos[k] = String(v); }
  setAttributeNS(ns, k, v) { this.atributos[k] = String(v); }
  getAttribute(k) { return k in this.atributos ? this.atributos[k] : null; }
  removeAttribute(k) { delete this.atributos[k]; }
  hasAttribute(k) { return k in this.atributos; }
  appendChild(f) { if (f.pai) f.pai.removeChild(f); f.pai = this; this.filhos.push(f); this._texto = null; return f; }
  insertBefore(f, ref) { if (!ref) return this.appendChild(f); if (f.pai) f.pai.removeChild(f); f.pai = this; this.filhos.splice(this.filhos.indexOf(ref), 0, f); return f; }
  removeChild(f) { const i = this.filhos.indexOf(f); if (i < 0) throw new Error('removeChild: não é filho'); this.filhos.splice(i, 1); f.pai = null; return f; }
  remove() { if (this.pai) this.pai.removeChild(this); }
  get firstChild() { return this.filhos[0] || null; }
  get childNodes() { return this.filhos; }
  get children() { return this.filhos.filter((f) => f.tag !== '#texto'); }
  get textContent() { return this.tag === '#texto' ? this._valor : this.filhos.map((f) => f.textContent).join(''); }
  set textContent(v) { this.filhos.forEach((f) => { f.pai = null; }); this.filhos = []; if (v !== '' && v != null) this.appendChild(this.doc.createTextNode(String(v))); }
  get clientWidth() { return this.largura === undefined ? 0 : this.largura; }
  get clientHeight() { return this.altura === undefined ? 0 : this.altura; }
  getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight, left: 0, top: 0 }; }
  addEventListener(ev, fn) { (this.ouvintes[ev] = this.ouvintes[ev] || []).push(fn); }
  removeEventListener(ev, fn) { this.ouvintes[ev] = (this.ouvintes[ev] || []).filter((f) => f !== fn); }
  animate(quadros, opcoes) { const a = { quadros, opcoes, cancelado: false, cancel() { this.cancelado = true; } }; this.animacoes.push(a); this.doc.registro.animacoes.push({ no: this, ...a }); return a; }
  /* ajudas dos testes */
  todos(fn, acc = []) { if (fn(this)) acc.push(this); this.filhos.forEach((f) => f.todos(fn, acc)); return acc; }
  porClasse(c) { return this.todos((n) => n.tag !== '#texto' && n.classList.contains(c)); }
  porTag(t) { return this.todos((n) => n.tag === t); }
}
for (const nome of ['innerHTML', 'outerHTML']) Object.defineProperty(No.prototype, nome, { get: NO_HTML(nome), set: NO_HTML(nome), configurable: true });
No.prototype.insertAdjacentHTML = NO_HTML('insertAdjacentHTML');

export function criarDocumento() {
  const registro = { criados: [], animacoes: [], observadores: [] };
  const doc = { registro };
  doc.createElement = (tag) => new No(tag, 'html', doc);
  doc.createElementNS = (ns, tag) => new No(tag, ns, doc);
  doc.createTextNode = (v) => { const n = new No('#texto', 'html', doc); n._valor = String(v); return n; };
  doc.write = NO_HTML('document.write');
  return doc;
}

/* monta um "mundo" de navegador: janela + documento de mentira + (opcional) BZPlantaForma de verdade, e roda o js/planta-radar.js nele.
   opcoes: { forma: true|false|objeto, beyon: null|objeto, agora: () => ms, comAnimate: true, observador: true } */
export function carregarRadar(opcoes = {}) {
  const documento = criarDocumento();
  const relogio = { t: 1000 };
  const janela = { document: documento, performance: { now: () => relogio.t }, console };
  if (opcoes.observador !== false) {
    janela.ResizeObserver = class { constructor(fn) { this.fn = fn; this.alvos = []; documento.registro.observadores.push(this); } observe(a) { this.alvos.push(a); } unobserve() {} disconnect() { this.desligado = true; } };
  }
  if (opcoes.forma !== false) {
    if (typeof opcoes.forma === 'object' && opcoes.forma) janela.BZPlantaForma = opcoes.forma;
    else {
      const f = { window: {} };
      vm.runInNewContext(fs.readFileSync(new URL('../../js/orcamento-planta-forma.js', import.meta.url), 'utf8'), f);
      janela.BZPlantaForma = f.window.BZPlantaForma;
    }
  }
  if (opcoes.beyon) janela.BEYON = opcoes.beyon;
  const contexto = { window: janela, document: documento, performance: janela.performance, console };
  vm.runInNewContext(fs.readFileSync(new URL('../../js/planta-radar.js', import.meta.url), 'utf8'), contexto);
  return { janela, documento, relogio, radar: janela.BZRadar, registro: documento.registro };
}

/* um BEYON de mentira: guarda o que foi registrado no laço único e deixa o teste girar os quadros */
export function beyonDeMentira(reduced = false) {
  const b = { reduced, adds: [], removes: [], laco: [] };
  b.add = (nome, fn) => { b.adds.push(nome); b.laco.push({ nome, fn }); };
  b.remove = (nome) => { b.removes.push(nome); b.laco = b.laco.filter((s) => s.nome !== nome); };
  b.quadro = (now) => { const S = { now, dt: 16 }; b.laco.slice().forEach((s) => s.fn(S)); };
  b.on = () => {}; b.off = () => {};
  return b;
}

export { No };
