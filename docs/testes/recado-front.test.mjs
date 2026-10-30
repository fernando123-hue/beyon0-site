/* O FORMULÁRIO DO RECADO NA TELA (js/recado.js + css/recado.css): as regras puras (validar, corpo, frase da falha), os estados
   (pronto → enviando → enviado | erro), o foco, a janela (<dialog>) e o envio das duas formas (dentro do orçamento e sozinho, com o
   Turnstile). O módulo é JS de navegador (IIFE): roda aqui com um DOM de mentira, só o bastante.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FONTE = ler('js/recado.js');
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ativo = { atual: null };
/* um DOM mínimo */
function no(tag) {
  const n = {
    tag, className: '', textContent: '', children: [], attrs: {}, ouvintes: {}, hidden: false, disabled: false, value: '', parentNode: null, focado: 0,
    appendChild(f) { f.parentNode = n; n.children.push(f); return f; },
    removeChild(f) { n.children = n.children.filter(x => x !== f); f.parentNode = null; return f; },
    setAttribute(k, v) { n.attrs[k] = String(v); },
    getAttribute(k) { return Object.hasOwn(n.attrs, k) ? n.attrs[k] : null; },
    removeAttribute(k) { delete n.attrs[k]; },
    hasAttribute(k) { return Object.hasOwn(n.attrs, k); },
    addEventListener(t, f) { (n.ouvintes[t] = n.ouvintes[t] || []).push(f); },
    emitir(t, ev = {}) { (n.ouvintes[t] || []).forEach(f => f({ preventDefault() { n.padraoEvitado = true; }, target: n, ...ev })); },
    focus() { n.focado++; ativo.atual = n; },
    classList: { add(c) { n.className += ' ' + c; } }
  };
  if (tag === 'dialog') {
    n.showModal = () => { n.aberto = true; n.modal = true; };
    n.close = () => { n.aberto = false; n.emitir('close'); };
  }
  return n;
}
const achar = (raiz, pred) => { if (pred(raiz)) return raiz; for (const f of raiz.children) { const r = achar(f, pred); if (r) return r; } return null; };
const todos = (raiz, pred, acc = []) => { if (pred(raiz)) acc.push(raiz); raiz.children.forEach(f => todos(f, pred, acc)); return acc; };
const tick = () => new Promise(r => setTimeout(r, 0));

function montar({ orcamento = null, turnstile = null, fetch = null } = {}) {
  const head = no('head'), body = no('body'), registros = [];
  const doc = {
    head, body, readyState: 'complete', createElement: no,
    getElementById: id => achar(body, n => n.id === id) || achar(head, n => n.id === id),
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    get activeElement() { return ativo.atual; }
  };
  const janela = { BZOrcamento: orcamento, BZTurnstile: turnstile };
  const espia = (...a) => registros.push(a.join(' '));
  const ctx = vm.createContext({
    window: janela, document: doc, Promise, Array, Object, String, Number, setTimeout, clearTimeout, fetch,
    console: { log: espia, error: espia, warn: espia },
    localStorage: { setItem: k => registros.push('storage:' + k) }, sessionStorage: { setItem: k => registros.push('storage:' + k) }
  });
  vm.runInContext(FONTE, ctx);
  return { R: janela.BZRecado, janela, doc, body, head, registros };
}
const campos = raiz => ({
  texto: achar(raiz, n => n.tag === 'textarea'), email: achar(raiz, n => n.tag === 'input'), form: achar(raiz, n => n.tag === 'form'),
  botao: achar(raiz, n => n.tag === 'button' && n.type === 'submit'), erro: achar(raiz, n => /recado__erro/.test(n.className)),
  feito: achar(raiz, n => /recado__feito/.test(n.className)), miolo: achar(raiz, n => /recado__miolo/.test(n.className)),
  contador: achar(raiz, n => /recado__contador/.test(n.className))
});
const preencher = (c, texto, email = '') => { c.texto.value = texto; c.email.value = email; c.texto.emitir('input'); };
const secao = (body, origem) => { const a = no('section'); if (origem) a.setAttribute('data-recado-origem', origem); body.appendChild(a); return a; };

test('validar: texto obrigatório (espaços não contam), até 1.000 caracteres inteiros, e-mail opcional mas conferido', () => {
  const { R } = montar();
  assert.equal(R.validar('Oi, tudo bem?', ''), null);
  assert.equal(R.validar('Oi', 'ana@exemplo.com.br'), null);
  assert.deepEqual({ ...R.validar('   ', '') }, { campo: 'texto', erro: 'Escreva o seu recado antes de enviar.' });
  assert.equal(R.validar('x'.repeat(1000), ''), null, '1000 cabe');
  assert.equal(R.validar('x'.repeat(1001), '').campo, 'texto');
  assert.equal(R.validar('😀'.repeat(1000), ''), null, 'conta caractere inteiro, não unidade UTF-16');
  for (const m of ['a@b', 'a b@c.com', 'sem-arroba', '@x.com']) assert.equal(R.validar('Oi', m).campo, 'email', m);
});

test('corpoDoEnvio: só o que foi preenchido, texto aparado; origem é rótulo', () => {
  const { R } = montar();
  assert.deepEqual({ ...R.corpoDoEnvio('  Oi  ', '', 'sites') }, { texto: 'Oi', origem: 'sites' });
  assert.deepEqual({ ...R.corpoDoEnvio('Oi', ' ana@exemplo.com.br ') }, { texto: 'Oi', email: 'ana@exemplo.com.br' });
});

test('fraseDaFalha: a frase do servidor quando há; rede e tempo esgotado têm a sua; nunca "Erro interno." cru', () => {
  const { R } = montar();
  const f429 = 'Você já deixou vários recados nesta hora. Tente de novo mais tarde.';
  assert.equal(R.fraseDaFalha({ status: 429, dados: { erro: f429 } }), f429);
  assert.equal(R.fraseDaFalha({ status: 503, dados: { erro: 'Estamos recebendo muitos recados agora. Tente de novo mais tarde.' } }), 'Estamos recebendo muitos recados agora. Tente de novo mais tarde.');
  assert.match(R.fraseDaFalha({ status: 0, dados: {} }), /Sem conexão/);
  assert.match(R.fraseDaFalha({ status: 0, dados: { tempo: true } }), /demorou/);
  assert.match(R.fraseDaFalha({ status: 500, dados: { erro: 'Erro interno.' } }), /Não consegui enviar agora/);
  assert.match(R.fraseDaFalha({ tipo: 'carga' }), /verificação de segurança/);
  assert.match(R.fraseDaFalha({ tipo: 'desafio' }), /robô/);
  assert.match(R.fraseDaFalha(null), /Não consegui enviar agora/);
});

test('inline: rótulos ligados aos campos, e-mail com autocomplete, aviso de guarda e contador', () => {
  const { R, body } = montar();
  const alvo = secao(body, 'sites');
  R.montar(alvo);
  const c = campos(alvo);
  const rotulos = todos(alvo, n => n.tag === 'label');
  assert.equal(rotulos.length, 2);
  for (const r of rotulos) assert.ok(achar(alvo, n => n.id === r.attrs.for), 'o label aponta para um campo existente');
  assert.equal(c.email.type, 'email'); assert.equal(c.email.attrs.autocomplete, 'email');
  assert.equal(c.erro.attrs.role, 'alert'); assert.equal(c.erro.hidden, true);
  assert.match(achar(alvo, n => /recado__aviso/.test(n.className)).textContent, /apagado em 60 dias/);
  assert.equal(c.contador.textContent, '0 / 1000');
  preencher(c, 'Olá');
  assert.equal(c.contador.textContent, '3 / 1000');
  assert.equal(R.montar(alvo), null, 'montar duas vezes não duplica');
});

test('enviar vazio: avisa, devolve o foco ao campo e não chama a rede', async () => {
  let chamadas = 0;
  const { R, body } = montar({ orcamento: { recado: async () => { chamadas++; return { ok: true }; } } });
  const alvo = secao(body); R.montar(alvo);
  const c = campos(alvo);
  c.form.emitir('submit');
  await tick();
  assert.equal(chamadas, 0);
  assert.equal(c.erro.hidden, false); assert.match(c.erro.textContent, /Escreva o seu recado/);
  assert.equal(c.texto.attrs['aria-invalid'], 'true'); assert.ok(c.texto.focado > 0);
  preencher(c, 'ok');
  assert.equal(c.erro.hidden, true, 'digitar limpa o aviso');
});

test('e-mail ruim: aviso no e-mail, foco nele, nada enviado', async () => {
  let chamadas = 0;
  const { R, body } = montar({ orcamento: { recado: async () => { chamadas++; } } });
  const alvo = secao(body); R.montar(alvo);
  const c = campos(alvo);
  preencher(c, 'Oi', 'isso-nao-e-email');
  c.form.emitir('submit'); await tick();
  assert.equal(chamadas, 0); assert.match(c.erro.textContent, /e-mail não parece certo/);
  assert.ok(c.email.focado > 0); assert.equal(c.email.attrs['aria-invalid'], 'true');
});

test('enviando: botão travado com aria-busy, um só envio mesmo com dois toques; depois, a mensagem de recebido ganha o foco e o formulário some', async () => {
  const pedidos = []; let liberar;
  const orcamento = { recado: corpo => { pedidos.push(corpo); return new Promise(r => { liberar = r; }); } };
  const { R, body } = montar({ orcamento });
  const alvo = secao(body, 'automacao'); R.montar(alvo);
  const c = campos(alvo);
  preencher(c, '  Quanto tempo leva?  ', 'Ana@Exemplo.com.br');
  c.form.emitir('submit'); await tick();
  assert.equal(c.botao.disabled, true); assert.equal(c.botao.textContent, 'Enviando…'); assert.equal(c.form.attrs['aria-busy'], 'true');
  c.form.emitir('submit'); await tick();
  assert.equal(pedidos.length, 1, 'o segundo toque não envia de novo');
  assert.deepEqual({ ...pedidos[0] }, { texto: 'Quanto tempo leva?', email: 'Ana@Exemplo.com.br', origem: 'automacao' });
  liberar({ ok: true }); await tick(); await tick();
  assert.equal(c.miolo.hidden, true); assert.equal(c.feito.hidden, false);
  assert.match(c.feito.children.map(p => p.textContent).join(' '), /Recebemos o seu recado\. A resposta chega por e-mail\./);
  assert.ok(c.feito.focado > 0, 'o foco vai para a mensagem');
  assert.equal(c.texto.value, '', 'o texto enviado não fica na tela');
});

test('sem e-mail a mensagem diz que não dá para responder (honesto)', async () => {
  const { R, body } = montar({ orcamento: { recado: async () => ({ ok: true }) } });
  const alvo = secao(body); R.montar(alvo);
  const c = campos(alvo);
  preencher(c, 'Só um aviso');
  c.form.emitir('submit'); await tick(); await tick();
  assert.match(c.feito.children.map(p => p.textContent).join(' '), /não vamos conseguir responder/);
});

test('erro do servidor: a frase aparece, o texto fica, o botão volta e dá para tentar de novo', async () => {
  let n = 0;
  const frase = 'Você já deixou vários recados nesta hora. Tente de novo mais tarde.';
  const orcamento = { recado: async () => { n++; if (n === 1) throw { status: 429, dados: { erro: frase } }; return { ok: true }; } };
  const { R, body } = montar({ orcamento });
  const alvo = secao(body); R.montar(alvo);
  const c = campos(alvo);
  preencher(c, 'Meu recado', 'a@b.com.br');
  c.form.emitir('submit'); await tick(); await tick();
  assert.equal(c.erro.hidden, false); assert.equal(c.erro.textContent, frase);
  assert.equal(c.botao.disabled, false); assert.equal(c.botao.textContent, 'Enviar recado');
  assert.equal(c.texto.value, 'Meu recado', 'o que a pessoa escreveu não se perde');
  assert.equal(c.miolo.hidden, false);
  c.form.emitir('submit'); await tick(); await tick();
  assert.equal(c.feito.hidden, false, 'a segunda tentativa passa');
});

test('a janela: abrir cria um <dialog> modal com o foco no texto; fechar o remove e devolve o foco a quem pediu; abrir de novo nasce limpo', () => {
  const { R, body } = montar({ orcamento: { recado: async () => ({ ok: true }) } });
  const botao = no('a'); body.appendChild(botao);
  const d = R.abrir({ origem: 'orcamento', quem: botao });
  assert.equal(d.tag, 'dialog'); assert.equal(d.aberto, true); assert.equal(d.modal, true);
  assert.equal(d.parentNode, body);
  assert.ok(/recado--janela/.test(d.className));
  const c = campos(d);
  assert.ok(c.texto.focado > 0);
  achar(d, n => n.tag === 'button' && n.textContent === 'Fechar').emitir('click');
  assert.equal(d.aberto, false); assert.equal(body.children.includes(d), false, 'a janela sai da página'); assert.equal(botao.focado, 1, 'o foco volta ao botão que abriu');
  preencher(c, 'rascunho antigo');
  const d2 = R.abrir({ quem: botao });
  assert.notEqual(d2, d); assert.equal(campos(d2).texto.value, '');
});

test('clicar no fundo da janela fecha; depois de enviado, a janela tem o botão Fechar', async () => {
  const { R, body } = montar({ orcamento: { recado: async () => ({ ok: true }) } });
  const d = R.abrir({});
  d.emitir('mousedown', { target: d }); d.emitir('click', { target: d });
  assert.equal(d.aberto, false);
  const d2 = R.abrir({});
  const c = campos(d2); preencher(c, 'Oi'); c.form.emitir('submit'); await tick(); await tick();
  assert.ok(achar(c.feito, n => n.tag === 'button' && n.textContent === 'Fechar'));
  assert.equal(body.children.includes(d2), true);
});

test('arrastar a seleção do campo até o fundo NÃO fecha (o clique só fecha quando começa e termina no fundo)', () => {
  const { R } = montar({ orcamento: { recado: async () => ({ ok: true }) } });
  const d = R.abrir({});
  const c = campos(d); preencher(c, 'texto comprido que a pessoa selecionou');
  d.emitir('mousedown', { target: c.texto }); d.emitir('click', { target: d });
  assert.equal(d.aberto, true);
  d.emitir('mousedown', { target: d }); d.emitir('click', { target: d });
  assert.equal(d.aberto, false);
});

test('fechar sem enviar (Esc, fundo, Fechar) guarda o rascunho: reabrir traz o texto e o e-mail; depois de enviado, nasce limpo', async () => {
  const { R } = montar({ orcamento: { recado: async () => ({ ok: true }) } });
  const d = R.abrir({});
  preencher(campos(d), 'meu recado pela metade', 'eu@empresa.com.br');
  d.close();
  const c2 = campos(R.abrir({}));
  assert.equal(c2.texto.value, 'meu recado pela metade'); assert.equal(c2.email.value, 'eu@empresa.com.br');
  assert.match(c2.contador.textContent, /^22 \//);
  c2.form.emitir('submit'); await tick(); await tick();
  R.fechar ? R.fechar() : achar(c2.feito, n => n.tag === 'button' && n.textContent === 'Fechar').emitir('click');
  assert.equal(campos(R.abrir({})).texto.value, '');
});

test('sozinho (fora do orçamento): cria a caixa do Turnstile e manda JSON com o token para /api/vendas?acao=recado', async () => {
  const visto = [];
  const fetch = async (url, op) => { visto.push({ url, op }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const { R, body, doc } = montar({ turnstile: { token: async () => 'token-do-turnstile' }, fetch });
  const alvo = secao(body); R.montar(alvo);
  const c = campos(alvo);
  preencher(c, 'Oi', 'a@b.com.br');
  c.form.emitir('submit'); await tick(); await tick(); await tick();
  assert.ok(doc.getElementById('o-turnstile'), 'a caixa do Turnstile foi criada dentro do formulário');
  assert.equal(visto.length, 1);
  assert.equal(visto[0].url, '/api/vendas?acao=recado'); assert.equal(visto[0].op.method, 'POST');
  assert.equal(visto[0].op.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(visto[0].op.body), { texto: 'Oi', email: 'a@b.com.br', turnstile: 'token-do-turnstile' });
  assert.equal(c.feito.hidden, false);
});

test('sozinho: resposta de erro do servidor vira a frase dele; o JSON quebrado não derruba a tela', async () => {
  const resposta = (status, corpo) => async () => ({ ok: false, status, json: corpo });
  const casos = [
    [429, async () => ({ erro: 'Você já deixou vários recados nesta hora. Tente de novo mais tarde.' }), /vários recados/],
    [500, async () => { throw new SyntaxError('html'); }, /Não consegui enviar agora/]
  ];
  for (const [status, corpo, esperado] of casos) {
    const { R, body } = montar({ turnstile: { token: async () => null }, fetch: resposta(status, corpo) });
    const alvo = secao(body); R.montar(alvo);
    const c = campos(alvo); preencher(c, 'Oi');
    c.form.emitir('submit'); await tick(); await tick(); await tick();
    assert.match(c.erro.textContent, esperado, String(status));
    assert.equal(c.botao.disabled, false);
  }
});

test('sem rede: "Sem conexão" e o texto fica', async () => {
  const { R, body } = montar({ turnstile: { token: async () => null }, fetch: async () => { throw new TypeError('fetch failed'); } });
  const alvo = secao(body); R.montar(alvo);
  const c = campos(alvo); preencher(c, 'Oi');
  c.form.emitir('submit'); await tick(); await tick(); await tick();
  assert.match(c.erro.textContent, /Sem conexão/); assert.equal(c.texto.value, 'Oi');
});

test('o que não pode mudar: nada de console, armazenamento, innerHTML, estilo inline, nem desfoque/sombra/brilho no CSS', () => {
  const js = semComentario(FONTE);
  for (const proibido of [/\bconsole\./, /localStorage|sessionStorage/, /innerHTML|insertAdjacentHTML|outerHTML/, /\.style\b|setAttribute\('style'/, /document\.write/, /\beval\(/]) {
    assert.ok(!proibido.test(js), String(proibido));
  }
  const css = semComentario(ler('css/recado.css'));
  for (const proibido of [/blur\(/, /backdrop-filter/, /box-shadow/, /text-shadow/, /drop-shadow/, /filter\s*:/]) assert.ok(!proibido.test(css), String(proibido));
  assert.match(css, /font-size:\s*1rem/, 'campos de 16px (sem zoom no iPhone)');
  assert.match(css, /min-height:\s*3rem/, 'alvo de toque de 48px');
  assert.match(css, /::backdrop\s*\{\s*background:\s*rgb\(0 0 0/, 'o fundo da janela é cor lisa');
  assert.match(css, /@media \(min-width: 520px\)/, 'mobile primeiro: só cresce');
});
