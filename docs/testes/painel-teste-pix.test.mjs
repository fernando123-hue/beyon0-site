/* A tela do teste do Pix de R$ 0,01 (js/painel-teste-pix.js): gera, mostra QR e copia-e-cola, atualiza até "pago", devolve o centavo.
   O valor nunca sai do navegador; os dados de quem paga só ficam nos campos e somem ao sair; tudo por textContent.
   JS de navegador (IIFE) rodando com um DOM de mentira e relógio controlado.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const FONTE = readFileSync(new URL('../../js/painel-teste-pix.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../../painel.html', import.meta.url), 'utf8');
const ORDER = 'ORD01234567890ABCDEF';

function no() {
  const n = { hidden: false, disabled: false, value: '', attrs: {}, ouvintes: {}, textContent: '',
    addEventListener(t, f) { n.ouvintes[t] = f; }, removeAttribute(a) { delete n.attrs[a]; if (a === 'src') delete n.src; }, clicar() { return n.ouvintes.click(); } };
  Object.defineProperty(n, 'innerHTML', { set() { throw new Error('innerHTML proibido'); } });
  return n;
}

function montar(respostas) {
  const ids = {};
  for (const i of ['teste-pix', 'tp-desligado', 'tp-form', 'tp-nome', 'tp-sobrenome', 'tp-email', 'tp-doc-tipo', 'tp-doc', 'tp-gerar', 'tp-estado', 'tp-pix', 'tp-qr', 'tp-copia', 'tp-copiar', 'tp-devolver']) ids[i] = no();
  ids['tp-desligado'].hidden = true; ids['tp-pix'].hidden = true; ids['tp-qr'].hidden = true; ids['tp-devolver'].hidden = true;
  ids['tp-doc-tipo'].value = 'CPF';
  const chamadas = [], timers = [], docs = {}, copiados = [];
  let agora = 1_000_000;
  const P = { recusada: e => e.status === 401,
    pedir(caminho, opc) {
      chamadas.push({ caminho, metodo: (opc && opc.method) || 'GET', corpo: opc && opc.body ? JSON.parse(opc.body) : null });
      const r = respostas.shift();
      if (r instanceof Error) return Promise.reject(r);
      return Promise.resolve({ json: () => Promise.resolve(r) });
    } };
  const ctx = vm.createContext({
    window: { BZPainel: P }, document: { getElementById: i => ids[i], addEventListener: (t, f) => { docs[t] = f; } },
    navigator: { clipboard: { writeText: t => { copiados.push(t); return Promise.resolve(); } } },
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: n => { if (n) timers[n - 1] = null; },
    Date: { now: () => agora }, encodeURIComponent
  });
  vm.runInContext(FONTE, ctx);
  const passar = async (ms = 4000) => { agora += ms; const t = timers.filter(Boolean); timers.length = 0; for (const f of t) f(); await esperar(); };
  return { ids, chamadas, copiados, sair: () => docs['bz-painel:saiu'](), passar, pendentes: () => timers.filter(Boolean).length };
}
const esperar = () => new Promise(r => setTimeout(r, 0));
const preencher = m => { m.ids['tp-nome'].value = ' Ana '; m.ids['tp-sobrenome'].value = 'Souza'; m.ids['tp-email'].value = 'ana@exemplo.com'; m.ids['tp-doc'].value = '529.982.247-25'; };
const criada = (extra = {}) => ({ ok: true, order_id: ORDER, valor: '0.01', qr: '00020126580014br.gov.bcb.pix0136abc', qr_base64: 'iVBORw0KGgo=', estado: 'aguardando', texto: 'Aguardando o pagamento.', ...extra });

test('o cartão está no painel, em Ferramentas, com o texto simples e o script carregado', () => {
  assert.match(HTML, /id="teste-pix"/);
  assert.match(HTML, /Gerar Pix de R\$ 0,01/);
  assert.match(HTML, /o valor é R\$ 0,01 e o nome que aparece/);
  assert.match(HTML, /Devolver o centavo/);
  assert.match(HTML, /<script src="js\/painel-teste-pix\.js" defer><\/script>/);
  assert.ok(!/style="/.test(HTML.slice(HTML.indexOf('id="teste-pix"'), HTML.indexOf('t-ads'))), 'CSP sem inline');
});

test('gera: manda só os dados do pagador (nenhum valor), mostra QR e código, e pergunta de 4 em 4 segundos até pagar', async () => {
  const m = montar([criada(), { ok: true, estado: 'aguardando', texto: 'Aguardando.' }, { ok: true, estado: 'pago', pago: true, texto: 'Pagamento recebido pelo Mercado Pago: a cadeia funciona.' }]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar();
  assert.deepEqual(m.chamadas[0].corpo, { teste_pix: { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento_tipo: 'CPF', documento: '529.982.247-25' } });
  assert.ok(!/valor|amount|total|0[.,]01/i.test(JSON.stringify(m.chamadas[0].corpo)), 'o navegador não manda valor');
  assert.equal(m.ids['tp-pix'].hidden, false);
  assert.equal(m.ids['tp-qr'].src, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(m.ids['tp-copia'].textContent, '00020126580014br.gov.bcb.pix0136abc');
  assert.equal(m.ids['tp-gerar'].disabled, true);
  await m.passar();
  assert.equal(m.chamadas[1].caminho, '?teste_pix=' + ORDER);
  assert.equal(m.ids['tp-devolver'].hidden, true);
  await m.passar();
  assert.equal(m.ids['tp-estado'].textContent, 'Pagamento recebido pelo Mercado Pago: a cadeia funciona.');
  assert.equal(m.ids['tp-devolver'].hidden, false, 'pago: aparece "Devolver o centavo"');
  assert.equal(m.pendentes(), 0, 'pago: para de perguntar');
});

test('devolver o centavo: manda só a order, mostra o texto e esconde o botão', async () => {
  const m = montar([criada(), { ok: true, estado: 'pago', pago: true, texto: 'pago' }, { ok: true, estado: 'devolvido', texto: 'O centavo foi devolvido.' }]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar(); await m.passar();
  m.ids['tp-devolver'].clicar(); await esperar();
  assert.deepEqual(m.chamadas[2].corpo, { teste_pix_reembolsar: ORDER });
  assert.equal(m.ids['tp-estado'].textContent, 'O centavo foi devolvido.');
  assert.equal(m.ids['tp-devolver'].hidden, true);
});

test('copiar põe o código do Pix na área de transferência', async () => {
  const m = montar([criada(), { ok: true, estado: 'aguardando', texto: 'x' }]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar();
  m.ids['tp-copiar'].clicar(); await esperar();
  assert.deepEqual(m.copiados, ['00020126580014br.gov.bcb.pix0136abc']);
  assert.match(m.ids['tp-estado'].textContent, /copiado/i);
});

test('QR com base64 estranho não vira imagem (só o código fica)', async () => {
  const m = montar([criada({ qr_base64: '" onerror="alert(1)' })]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar();
  assert.equal(m.ids['tp-qr'].src, undefined);
  assert.equal(m.ids['tp-qr'].hidden, true);
});

test('expirou no servidor: para de perguntar e libera para gerar outro', async () => {
  const m = montar([criada(), { ok: true, estado: 'expirou', texto: 'O Pix expirou sem pagamento. Gere outro para testar de novo.' }]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar(); await m.passar();
  assert.equal(m.ids['tp-gerar'].disabled, false);
  assert.equal(m.pendentes(), 0);
});

test('passou de 10 minutos sem resposta final: para sozinho', async () => {
  const m = montar([criada(), ...Array.from({ length: 200 }, () => ({ ok: true, estado: 'aguardando', texto: 'Aguardando.' }))]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar();
  await m.passar(10 * 60e3 + 5000);
  assert.match(m.ids['tp-estado'].textContent, /expirou/);
  assert.equal(m.pendentes(), 0);
  assert.equal(m.ids['tp-gerar'].disabled, false);
});

test('desligado (403) mostra o aviso; erro do servidor aparece em português; nada vira innerHTML', async () => {
  const off = Object.assign(new Error('O teste do Pix está desligado.'), { status: 403 });
  const m = montar([off]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar();
  assert.equal(m.ids['tp-desligado'].hidden, false);
  assert.equal(m.ids['tp-gerar'].disabled, false);
  const m2 = montar([Object.assign(new Error('Informe um e-mail válido.'), { status: 400 })]);
  preencher(m2);
  m2.ids['tp-gerar'].clicar(); await esperar();
  assert.equal(m2.ids['tp-estado'].textContent, 'Informe um e-mail válido.');
});

test('sair do painel apaga os dados de quem paga, o QR e o código, e para o relógio', async () => {
  const m = montar([criada(), { ok: true, estado: 'aguardando', texto: 'x' }]);
  preencher(m);
  m.ids['tp-gerar'].clicar(); await esperar();
  m.sair();
  for (const i of ['tp-nome', 'tp-sobrenome', 'tp-email', 'tp-doc']) assert.equal(m.ids[i].value, '');
  assert.equal(m.ids['tp-copia'].textContent, '');
  assert.equal(m.ids['tp-pix'].hidden, true);
  assert.equal(m.pendentes(), 0);
  const antes = m.chamadas.length;
  await m.passar();
  assert.equal(m.chamadas.length, antes, 'nenhuma pergunta depois de sair');
});

test('o script não usa innerHTML, localStorage nem guarda dado do pagador', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie/.test(FONTE.replace(/\/\*[\s\S]*?\*\//g, '')));
});
