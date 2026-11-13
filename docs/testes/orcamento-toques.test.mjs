/* OS TOQUES NA CONVERSA (js/orcamento-toques.js; spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §1–§4), num DOM de mentira mínimo:
   os passos fixos, as pendentes que seguem com a 1ª mensagem, o valor retido e liberado, o modo sem consultor, a dor que volta se o envio não
   entrou, o "Mudar" (inclusive na conversa retomada), a falha que vira fala e o foco que nunca se perde. O comportamento na página real é provado
   pelo E2E (docs/e2e-orcamento.mjs, com e sem consultor). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ler = rel => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const ROTULOS = ler('js/orcamento-rotulos.js'), TOQUES = ler('js/orcamento-toques.js');
const tique = () => new Promise(r => setTimeout(r, 0));
const puro = v => JSON.parse(JSON.stringify(v));   /* (o que vem do vm tem outro protótipo) */

/* ---------- um DOM de mentira, só o que o módulo usa ---------- */
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
function criarDoc() {
  const porId = {};
  const doc = {
    activeElement: null, ouvintes: {},
    getElementById: id => porId[id] || null,
    createElement: tag => elemento(tag, doc, porId),
    addEventListener(t, f) { (doc.ouvintes[t] = doc.ouvintes[t] || []).push(f); },
    removeEventListener(t, f) { doc.ouvintes[t] = (doc.ouvintes[t] || []).filter(x => x !== f); },
    dispatchEvent(ev) { (doc.ouvintes[ev.type] || []).slice().forEach(f => f(ev)); return true; },
    registrar(e) { if (e.id) porId[e.id] = e; }
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
    focus() { doc.activeElement = e; }
  };
  return e;
}

/* ---------- a página: a caixa, a lista com a abertura fixa, a caixa de texto ---------- */
function montar({ consultor = true, ponteiroFino = false, enviar = async () => true } = {}) {
  const doc = criarDoc();
  const caixa = doc.createElement('div'); caixa.id = 'o-log-caixa';
  const log = doc.createElement('ol'); log.id = 'o-log';
  const abertura = doc.createElement('li'); abertura.className = 'msg msg--agente'; log.appendChild(abertura);
  const form = doc.createElement('form'); form.id = 'o-form';
  const texto = doc.createElement('textarea'); texto.id = 'o-texto';
  const anuncios = [], definidos = [], enviados = [], eventos = [];
  const win = {
    matchMedia: () => ({ matches: ponteiroFino }),
    BZPerguntas: { definir: r => { definidos.push(JSON.parse(JSON.stringify(r))); } },
    BZOrcConversa: { anunciar: t => anuncios.push(t), enviar: t => { enviados.push(t); return enviar(t); } }
  };
  doc.addEventListener('bz:valor-liberado', () => eventos.push('bz:valor-liberado'));
  const ctx = { window: win, document: doc, setTimeout, clearTimeout, Promise, JSON, String, Object, CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; } };
  win.window = win;
  vm.runInNewContext(ROTULOS + '\n' + TOQUES, ctx);
  const T = win.BZToques;
  const abertos = () => log.querySelectorAll('.orc-toque:not([data-feito])');
  const botao = txt => { const b = abertos().flatMap(li => li.querySelectorAll('button')).find(x => x.textContent === txt); if (!b) throw new Error('sem botão "' + txt + '"'); return b; };
  const falas = () => log.children.filter(li => li.classList.contains('msg--agente')).map(li => li.textContent);
  const bolhas = () => log.children.filter(li => li.classList.contains('msg--visitante')).map(li => li.textContent);
  return { doc, log, texto, form, T, win, anuncios, definidos, enviados, eventos, abertos, botao, falas, bolhas, tocar: (t, d) => botao(t).clicar(d) };
}
const ate = async (p, ...toques) => { for (const t of toques) { p.tocar(t); await tique(); } };
const ATE_DOR = ['Saúde', 'Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho'];

test('os passos fixos: cada toque vira a bolha da pessoa, pede a conta (o radar) e traz a próxima fala, anunciada e rotulando o grupo', async () => {
  const p = montar();
  p.T.iniciar({ consultor: true });
  assert.equal(p.abertos().length, 1, 'o 1º grupo (o ramo), logo abaixo da abertura fixa');
  await ate(p, 'Saúde');
  assert.deepEqual(p.bolhas(), ['Saúde']);
  assert.deepEqual(p.definidos.at(-1), { ramo: 'saude', objetivos: [] });
  assert.match(p.falas().at(-1), /precisa trazer/);
  assert.ok(p.anuncios.some(a => /^Zero: E o que o site precisa trazer/.test(a)), 'a fala nova é anunciada');
  const grupo = p.abertos()[0].querySelector('div');
  const rotulo = grupo.getAttribute('aria-labelledby');
  assert.ok(rotulo && p.doc.getElementById(rotulo).textContent === p.falas().at(-1), 'o grupo é rotulado pela própria fala');
  await ate(p, 'Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho');
  assert.deepEqual(p.bolhas(), ['Saúde', 'Agendamentos', 'Só o Instagram', 'Tenho']);
  assert.match(p.falas().at(-1), /como os clientes chegam/);
});

test('pendentes: os toques (e, no passo da dor, responde dor e as sugestões) seguem com a 1ª mensagem; depois de entregues, nada', async () => {
  const p = montar();
  p.T.iniciar({ consultor: true });
  await ate(p, ...ATE_DOR);
  assert.deepEqual(puro(p.T.pendentes()), { ramo: 'saude', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho', responde: 'dor' });
  p.tocar('Pelo Instagram');
  p.tocar('Pronto');
  await tique();
  assert.deepEqual(p.enviados, ['Pelo Instagram'], 'com o consultor, o "Pronto" da dor manda os rótulos como a fala dela');
  assert.deepEqual(puro(p.T.pendentes().situacao), ['instagram']);
  p.T.entregues();
  assert.equal(p.T.pendentes(), null);
  assert.equal(p.abertos().length, 0, 'as perguntas fixas que faltavam saem de cena');
});

test('"Pronto" vazio: focável e lido (aria-disabled), diz o que falta e não fecha o grupo', async () => {
  const p = montar();
  p.T.iniciar();
  await ate(p, 'Saúde');
  const pronto = p.botao('Pronto');
  assert.equal(pronto.getAttribute('aria-disabled'), 'true');
  assert.equal(pronto.disabled, false, 'nunca disabled: sairia do Tab e da leitura');
  pronto.clicar();
  assert.equal(p.anuncios.at(-1), 'Escolha ao menos uma opção.');
  assert.equal(p.abertos().length, 1);
  p.tocar('Agendamentos');
  assert.equal(pronto.getAttribute('aria-disabled'), 'false');
});

test('o valor: retido desde o 1º passo, liberado uma vez só (o evento da página)', () => {
  const p = montar();
  assert.equal(p.T.reterValor(null), false, 'antes de começar e sem o fluxo novo no estado: nada retido (a página de hoje)');
  assert.equal(p.T.reterValor({ conversa: { briefing: { fluxo_conversa: true } } }), true, 'conversa do fluxo novo vinda do servidor: retido');
  p.T.iniciar();
  assert.equal(p.T.reterValor(null), true);
  p.T.liberarValor(); p.T.liberarValor();
  assert.equal(p.T.reterValor(null), false);
  assert.deepEqual(p.eventos, ['bz:valor-liberado']);
});

test('sem consultor: a dor por toques e "Não sei", depois o resumo fixo das listas fechadas e o valor liberado', async () => {
  const p = montar({ consultor: false });
  p.T.iniciar({ consultor: false });
  await ate(p, ...ATE_DOR);
  assert.match(p.falas().at(-1), /Toque no que for a sua cara/);
  await ate(p, 'Pelo Instagram', 'Paciente marca e falta', 'Pronto');
  assert.deepEqual(p.enviados, [], 'nada vai à conversa com a IA');
  assert.match(p.falas().at(-1), /^Pelo que você contou, quem chega pelo Instagram cai numa página sua que deixa a pessoa marcar/);
  assert.deepEqual(puro(p.T.situacao()), ['instagram', 'falta_consulta']);
  await new Promise(r => setTimeout(r, 1300));
  assert.deepEqual(p.eventos, ['bz:valor-liberado']);
});

test('a dor com o consultor: se o envio não entrou, as sugestões voltam com o que ela tinha marcado', async () => {
  const p = montar({ enviar: async () => false });
  p.T.iniciar();
  await ate(p, ...ATE_DOR, 'Pelo Instagram', 'Pronto');
  await tique(); await tique();
  const de = p.abertos().at(-1);
  assert.ok(de, 'o grupo da dor voltou');
  assert.equal(de.querySelectorAll('button').find(b => b.textContent === 'Pelo Instagram').getAttribute('aria-pressed'), 'true');
});

test('"Seguir tocando" no passo da dor: as sugestões voltam sem repetir a pergunta; depois de a dor ir por escrito, o resumo fixo', async () => {
  const p = montar();
  p.T.iniciar();
  await ate(p, ...ATE_DOR);
  const antes = p.falas().length;
  p.T.semConsultor();
  assert.equal(p.falas().length, antes, 'nenhuma fala repetida');
  assert.ok(p.abertos().at(-1).querySelectorAll('button').some(b => b.textContent === 'Não sei, escolha por mim'), 'sem consultor, com "Não sei"');
  const q = montar();
  q.T.iniciar();
  await ate(q, ...ATE_DOR);
  q.T.entregues();
  q.T.semConsultor();
  assert.match(q.falas().at(-1), /^Pelo que você contou/);
});

test('conversa retomada: o que ela tocou volta do briefing; o "Mudar" abre marcado, uma vez só, e a mudança vai como a fala montada', async () => {
  const p = montar();
  p.T.configurar({ consultor: true });
  p.T.atualizar({ conversa: { briefing: { fluxo_conversa: true, fluxo_toques: { ramo: 'saude', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' } } }, mensagens: [{ papel: 'visitante', conteudo: 'x' }] });
  p.T.reabrir();
  p.T.reabrir();
  assert.equal(p.log.querySelectorAll('.orc-toque--mudar').length, 1, 'um bloco por vez');
  const bloco = p.log.querySelector('.orc-toque--mudar');
  const marcado = txt => bloco.querySelectorAll('button').find(b => b.textContent === txt).getAttribute('aria-pressed');
  assert.equal(marcado('Saúde'), 'true');
  assert.equal(marcado('Agendamentos'), 'true');
  bloco.querySelectorAll('button').find(b => b.textContent === 'Beleza').clicar();
  bloco.querySelectorAll('button').find(b => b.textContent === 'Pronto').clicar();
  assert.deepEqual(p.enviados, ['Mudei minhas respostas: Beleza · Agendamentos · Só o Instagram · Logo e textos: tenho']);
  assert.deepEqual(puro(p.T.pendentes()), { ramo: 'beleza', objetivos: ['agendamentos'], site_atual: 'instagram', material: 'tenho' });
  await tique(); await tique();
  assert.equal(p.log.querySelectorAll('.orc-toque--mudar').length, 0, 'o envio entrou: a pergunta e o bloco saem (a fala dela e a resposta entram na conversa na ordem certa)');
});

test('"Mudar" com o envio que NÃO entrou: o bloco volta e a mudança não fica pendurada para a próxima mensagem', async () => {
  const p = montar({ enviar: async () => false });
  p.T.configurar({ consultor: true });
  p.T.atualizar({ conversa: { briefing: { fluxo_conversa: true, fluxo_toques: { ramo: 'saude', objetivos: ['agendamentos'] } } }, mensagens: [{ papel: 'visitante', conteudo: 'x' }] });
  p.T.reabrir();
  const bloco = p.log.querySelector('.orc-toque--mudar');
  bloco.querySelectorAll('button').find(b => b.textContent === 'Beleza').clicar();
  bloco.querySelectorAll('button').find(b => b.textContent === 'Pronto').clicar();
  await tique(); await tique();
  assert.equal(p.T.pendentes(), null, 'nada pendurado');
  assert.equal(p.log.querySelectorAll('.orc-toque--mudar:not([data-feito])').length, 1, 'o bloco voltou, aberto');
});

test('o foco nunca se perde: com o teclado ele segue para o próximo grupo; sem próximo grupo, vai à caixa de texto', async () => {
  const p = montar();
  p.T.iniciar();
  const saude = p.botao('Saúde');
  saude.focus();
  saude.clicar(0);   /* (detail 0: Enter ou espaço no botão) */
  await tique();
  assert.equal(p.doc.activeElement, p.abertos()[0].querySelectorAll('button')[0], 'o 1º botão do grupo seguinte');
  for (const t of ['Agendamentos', 'Pronto', 'Só o Instagram', 'Tenho', 'Pelo Instagram', 'Pronto']) { p.botao(t).clicar(0); await tique(); }
  assert.equal(p.doc.activeElement, p.texto, 'depois do "Pronto" da dor: a caixa de texto');
});

test('a falha da conta durante os toques vira fala do Zero (alerta com o texto depois de estar na página) e "Tentar de novo" refaz a conta', async () => {
  const p = montar();
  p.T.iniciar();
  await ate(p, 'Saúde');
  p.doc.dispatchEvent({ type: 'bz:conta-falhou', detail: { mensagem: 'Não foi possível confirmar que você não é um robô.' } });
  const erro = p.log.querySelector('.orc-toque--erro');
  const alerta = erro.children[0];
  assert.equal(alerta.getAttribute('role'), 'alert');
  assert.equal(alerta.textContent, '', 'o alerta nasce vazio');
  await tique();
  assert.equal(alerta.textContent, 'Não foi possível confirmar que você não é um robô.');
  const n = p.definidos.length;
  erro.querySelectorAll('button').find(b => b.textContent === 'Tentar de novo').clicar();
  assert.equal(p.definidos.length, n + 1);
  assert.ok(erro.hasAttribute('data-feito'));
});

test('o "Outro": a escrita curta, limpa e no tamanho do servidor; vazio diz o que falta', async () => {
  const p = montar();
  p.T.iniciar();
  p.tocar('Outro');
  const campo = p.abertos()[0].querySelectorAll('input')[0];
  assert.equal(campo.maxLength, 60);
  p.botao('Seguir').clicar();
  assert.equal(p.anuncios.at(-1), 'Escreva o tipo do seu negócio.');
  campo.value = '  pet\nshop <b>  ';
  campo.tecla('Enter');
  assert.deepEqual(p.bolhas(), ['pet shop b']);
  assert.deepEqual(p.definidos.at(-1), { ramo: 'outro', outro: 'pet shop b', objetivos: [] });
});
