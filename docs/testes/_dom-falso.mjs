/* Um DOM de mentira mínimo para os módulos da conversa do orçamento (js/orcamento-toques.js, js/orcamento-pedido.js): só o que eles usam
   (elementos, atributos, classes, lista de filhos, seletores simples, cliques e teclas, foco) e uma página com a caixa da conversa. Os módulos
   rodam de verdade, num vm. O comportamento na página real é provado pelo E2E (docs/e2e-orcamento.mjs). */
import fs from 'node:fs';
import vm from 'node:vm';

const ler = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
export const tique = () => new Promise(r => setTimeout(r, 0));
export const puro = v => JSON.parse(JSON.stringify(v));   /* (o que vem do vm tem outro protótipo) */

function casa(no, simples) {
  const m = simples.trim().match(/^([a-z]+)?((?:\.[\w-]+|\[[\w-]+\]|:not\(\[[\w-]+\]\))*)$/);
  if (!m) throw new Error('seletor não suportado: ' + simples);
  if (m[1] && no.tagName !== m[1]) return false;
  for (const p of m[2].match(/\.[\w-]+|\[[\w-]+\]|:not\(\[[\w-]+\]\)/g) || []) {
    if (p[0] === '.' && !no.classList.contains(p.slice(1))) return false;
    if (p[0] === '[' && !no.hasAttribute(p.slice(1, -1))) return false;
    if (p[0] === ':' && no.hasAttribute(p.slice(6, -2))) return false;
  }
  return true;
}
export function criarDoc() {
  const porId = {};
  const doc = {
    activeElement: null, ouvintes: {},
    getElementById: id => porId[id] || null,
    createElement: tag => elemento(tag, doc, porId),
    addEventListener(t, f) { (doc.ouvintes[t] = doc.ouvintes[t] || []).push(f); },
    removeEventListener(t, f) { doc.ouvintes[t] = (doc.ouvintes[t] || []).filter(x => x !== f); },
    dispatchEvent(ev) { (doc.ouvintes[ev.type] || []).slice().forEach(f => f(ev)); return true; }
  };
  return doc;
}
function elemento(tag, doc, porId) {
  const attrs = {}, classes = new Set(), ouvintes = {};
  const e = {
    tagName: tag, children: [], parentNode: null, disabled: false, hidden: false, value: '', type: '', scrollTop: 0, scrollHeight: 0,
    _texto: '', _id: '',
    get id() { return e._id; }, set id(v) { e._id = v; porId[v] = e; },
    get textContent() { return e._texto + e.children.map(c => c.textContent).join(''); }, set textContent(v) { e._texto = String(v); e.children = []; },
    get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    setAttribute(k, v) { attrs[k] = String(v); if (k === 'id') e.id = v; }, getAttribute: k => (k in attrs ? attrs[k] : null), hasAttribute: k => k in attrs, removeAttribute(k) { delete attrs[k]; },
    get lastElementChild() { return e.children[e.children.length - 1] || null; },
    appendChild(c) { return e.insertBefore(c, null); },
    insertBefore(c, ref) { if (c.parentNode) c.remove(); const i = ref ? e.children.indexOf(ref) : -1; if (i >= 0) e.children.splice(i, 0, c); else e.children.push(c); c.parentNode = e; return c; },
    remove() { if (e.parentNode) { e.parentNode.children = e.parentNode.children.filter(x => x !== e); e.parentNode = null; } },
    contains(o) { return o === e || e.children.some(c => c.contains(o)); },
    todos() { return e.children.flatMap(c => [c, ...c.todos()]); },
    querySelectorAll(sel) { const partes = sel.split(','); return e.todos().filter(n => partes.some(p => casa(n, p))); },
    querySelector(sel) { return e.querySelectorAll(sel)[0] || null; },
    addEventListener(t, f) { (ouvintes[t] = ouvintes[t] || []).push(f); },
    clicar(detail = 1) { if (e.disabled) return; (ouvintes.click || []).forEach(f => f({ type: 'click', detail, preventDefault() {} })); },
    tecla(key) { (ouvintes.keydown || []).forEach(f => f({ key, preventDefault() {} })); },
    digitar(v) { e.value = v; (ouvintes.input || []).forEach(f => f({ type: 'input' })); },
    focus() { doc.activeElement = e; }
  };
  return e;
}

/* a página: a caixa, a lista com a abertura fixa, a caixa de texto, o aviso de fila cheia; os módulos rodam por cima (rótulos e toques sempre;
   `modulos` a mais, como o pedido). detalhes: a resposta do API.detalhes de mentira */
export function montarConversa({ ponteiroFino = false, enviar = async () => true, modulos = [], detalhes = async () => ({ codigo: 'BZ-K7M3Q', status: 'confirmado' }) } = {}) {
  const doc = criarDoc();
  const caixa = doc.createElement('div'); caixa.id = 'o-log-caixa';
  const log = doc.createElement('ol'); log.id = 'o-log';
  const abertura = doc.createElement('li'); abertura.className = 'msg msg--agente'; log.appendChild(abertura);
  const form = doc.createElement('form'); form.id = 'o-form';
  const texto = doc.createElement('textarea'); texto.id = 'o-texto';
  const fila = doc.createElement('div'); fila.id = 'o-fila-cheia'; fila.hidden = true;
  const anuncios = [], definidos = [], enviados = [], eventos = [], pedidos = [];
  const win = {
    matchMedia: () => ({ matches: ponteiroFino }),
    BZPerguntas: { definir: r => { definidos.push(JSON.parse(JSON.stringify(r))); } },
    BZOrcConversa: { anunciar: t => anuncios.push(t), enviar: t => { enviados.push(t); return enviar(t); } },
    BZOrcamento: { detalhes: d => { pedidos.push(JSON.parse(JSON.stringify(d))); return detalhes(d); } }
  };
  ['bz:valor-liberado', 'bz:detalhes-enviados'].forEach(t => doc.addEventListener(t, ev => eventos.push(t + (ev && ev.detail && ev.detail.codigo ? ':' + ev.detail.codigo : ''))));
  const ctx = { window: win, document: doc, setTimeout, clearTimeout, Promise, JSON, String, Object, CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; } };
  win.window = win;
  vm.runInNewContext(['js/orcamento-rotulos.js', 'js/orcamento-toques.js', ...modulos].map(ler).join('\n'), ctx);
  const abertos = () => log.querySelectorAll('.orc-toque:not([data-feito])');
  const botao = txt => { const b = abertos().flatMap(li => li.querySelectorAll('button')).find(x => x.textContent === txt); if (!b) throw new Error('sem botão "' + txt + '"'); return b; };
  const falas = () => log.children.filter(li => li.classList.contains('msg--agente')).map(li => li.textContent);
  const bolhas = () => log.children.filter(li => li.classList.contains('msg--visitante')).map(li => li.textContent);
  return { doc, log, texto, form, fila, T: win.BZToques, win, anuncios, definidos, enviados, eventos, pedidos, abertos, botao, falas, bolhas, tocar: (t, d) => botao(t).clicar(d) };
}
