/* (PR 3b-3c, Task 11) o botão agora abre a conversa SEM o texto: a mensagem pronta (com o link de uso único) vai numa caixa só de leitura com "Copiar a mensagem" e o dono cola.
   O link de retomada é segredo e nunca vai num ?text= (endereço de terceiro).
   O AVISO COM O LINK (PR 2b-2, painel): js/painel-pedido-comum.js (avisoComLink) e a página do painel. O módulo é JS de
   navegador (IIFE): roda aqui com um window e um DOM de mentira, só o bastante para o botão "Preparar", o POST do link
   e o botão que abre o WhatsApp (ou o e-mail). Também guarda o que não pode mudar: o link de retomada é segredo de uso
   único e nunca vai para console nem para o armazenamento do navegador; a página não ganha estilo inline (CSP).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = caminho => readFileSync(new URL('../../' + caminho, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FONTE = ler('js/painel-pedido-comum.js');
const CODIGO = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';   /* 32 caracteres, como o servidor devolve */
const ORIGEM = 'https://exemplo.test';

/* um DOM mínimo: elementos com filhos, atributos e ouvintes; "clicar" chama os ouvintes */
function no(tag, classe, texto) {
  const n = {
    tag, className: classe || '', textContent: texto === undefined || texto === null ? '' : String(texto), children: [], attrs: {}, ouvintes: {}, disabled: false, focado: false,
    appendChild(f) { n.children.push(f); return f; },
    replaceChild(novo, velho) { n.children[n.children.indexOf(velho)] = novo; return velho; },
    setAttribute(k, v) { n.attrs[k] = String(v); },
    addEventListener(t, f) { (n.ouvintes[t] = n.ouvintes[t] || []).push(f); },
    focus() { n.focado = true; },
    select() { n.selecionado = true; },
    setSelectionRange() { n.selecionado = true; },
    clicar() { (n.ouvintes.click || []).forEach(f => f()); }
  };
  return n;
}
const achar = (raiz, pred) => { if (pred(raiz)) return raiz; for (const f of raiz.children) { const r = achar(f, pred); if (r) return r; } return null; };
const esperar = () => new Promise(r => setTimeout(r, 0));

function montar(resposta, { clipboard = true } = {}) {
  const chamadas = [], registros = [];
  const P = {
    el: no,
    recusada: e => !!(e && e.status === 401),
    pedir(caminho, opcoes) {
      chamadas.push({ caminho, corpo: JSON.parse(opcoes.body), metodo: opcoes.method });
      return resposta();
    }
  };
  const consoleEspia = { log: (...a) => registros.push(a.join(' ')), error: (...a) => registros.push(a.join(' ')), warn: (...a) => registros.push(a.join(' ')) };
  const armazenamento = { setItem: (k, v) => registros.push('storage:' + k + '=' + v) };
  const janela = { BZPainel: P };
  const copiados = [];
  const navegador = clipboard ? { clipboard: { writeText: t => { copiados.push(t); return Promise.resolve(); } } } : {};
  const contexto = vm.createContext({ window: janela, navigator: navegador, location: { origin: ORIGEM }, document: { dispatchEvent() {} }, CustomEvent: function () {}, console: consoleEspia, localStorage: armazenamento, sessionStorage: armazenamento, setTimeout, clearTimeout });
  vm.runInContext(FONTE, contexto);
  return { C: janela.BZPainelPedido, chamadas, registros, copiados };
}
const ok = (corpo, status = 200) => () => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(corpo) });
const falha = (mensagem, status = 409) => () => Promise.reject(Object.assign(new Error(mensagem), { status }));

const aviso = (C, contato, extra = {}) => C.avisoComLink({
  conversaId: '11111111-1111-4111-8111-111111111111', contato, rotulo: 'aviso', assunto: 'Os modelos do seu site estão prontos',
  texto: link => 'Aqui é da Beyon Zero. Abra: ' + link, ...extra
});

test('aviso: com telefone, "Preparar aviso" gera o link e mostra a mensagem pronta numa caixa só de leitura; o WhatsApp abre SEM o texto', async () => {
  const { C, chamadas, copiados } = montar(ok({ codigo: CODIGO }));
  const caixa = aviso(C, { nome: 'Ana Souza', telefone: '+5521991234567' });
  const preparar = achar(caixa, n => n.tag === 'button');
  assert.equal(preparar.textContent, 'Preparar aviso');
  assert.equal(chamadas.length, 0, 'nada vai ao servidor antes do toque (o código só existe depois dele)');
  preparar.clicar();
  assert.equal(preparar.disabled, true, 'um toque só: o botão trava enquanto espera');
  await esperar();
  assert.deepEqual(chamadas, [{ caminho: '', metodo: 'POST', corpo: { link_retomada: '11111111-1111-4111-8111-111111111111' } }]);
  const a = achar(caixa, n => n.tag === 'a');
  assert.ok(a, 'o botão que abre o WhatsApp aparece');
  assert.equal(a.textContent, 'Abrir a conversa no WhatsApp');
  assert.equal(a.href, 'https://wa.me/5521991234567', 'só o número: o link de uso único nunca vai num endereço de terceiro');
  assert.ok(!/[?#=%]/.test(a.href), a.href);
  assert.equal(a.target, '_blank');
  assert.equal(a.rel, 'noopener noreferrer');
  const msg = achar(caixa, n => n.tag === 'textarea');
  assert.ok(msg, 'a mensagem completa está numa caixa de texto');
  assert.equal(msg.readOnly, true, 'só leitura');
  assert.equal(msg.value, 'Oi, Ana! Aqui é da Beyon Zero. Abra: ' + ORIGEM + '/orcamento#retomar=' + CODIGO);
  assert.equal(msg.attrs['aria-label'], 'Mensagem pronta: aviso para Ana Souza', 'a caixa tem nome para o leitor de tela');
  assert.ok(!achar(caixa, n => n.tag === 'button' && n.textContent === 'Preparar aviso'), '"Preparar" sai de cena: o link novo não é preparado duas vezes sem querer');
  assert.equal(msg.focado, true, 'o foco vai para a mensagem que acabou de aparecer');
  assert.ok(achar(caixa, n => n.attrs.role === 'status' && /7 dias/.test(n.textContent)), 'o estado diz que o link vale 7 dias');
  const copiar = achar(caixa, n => n.tag === 'button' && n.textContent === 'Copiar a mensagem');
  assert.ok(copiar, 'existe o botão "Copiar a mensagem"');
  assert.equal(copiar.type, 'button');
  copiar.clicar();
  await esperar();
  assert.deepEqual(copiados, [msg.value], 'copia a mensagem inteira');
  const status = caixa.children.map(f => achar(f, n => n.attrs.role === 'status' && /copiada/i.test(n.textContent))).find(Boolean);
  assert.ok(status, 'o estado "Mensagem copiada" é dito por um role=status');
});

test('aviso: se o navegador não deixa copiar, a mensagem fica selecionada e o texto manda copiar com o dedo', async () => {
  const { C } = montar(ok({ codigo: CODIGO }), { clipboard: false });
  const caixa = aviso(C, { nome: 'Ana', telefone: '5521991234567' });
  achar(caixa, n => n.tag === 'button').clicar();
  await esperar();
  const msg = achar(caixa, n => n.tag === 'textarea');
  achar(caixa, n => n.tag === 'button' && n.textContent === 'Copiar a mensagem').clicar();
  assert.equal(msg.selecionado, true, 'a mensagem fica selecionada');
  assert.ok(caixa.children.map(f => achar(f, n => n.attrs.role === 'status' && /copie com o dedo/.test(n.textContent))).find(Boolean));
});

test('aviso: nome que não é nome (link, número, vazio) cai em "Oi!" sem repetir o dado do visitante', async () => {
  for (const nome of ['http://golpe.example/x', '12345', '', null, undefined, 'Ana<img>']) {
    const { C } = montar(ok({ codigo: CODIGO }));
    const caixa = aviso(C, { nome, telefone: '5521991234567' });
    achar(caixa, n => n.tag === 'button').clicar();
    await esperar();
    const texto = achar(caixa, n => n.tag === 'textarea').value;
    assert.ok(texto.startsWith('Oi! Aqui'), JSON.stringify(nome) + ' → ' + texto);
  }
});

test('aviso: sem telefone, com e-mail válido, abre o e-mail SEM assunto nem corpo (o assunto aparece escrito para o dono colar)', async () => {
  const { C } = montar(ok({ codigo: CODIGO }));
  const caixa = aviso(C, { nome: 'Ana', email: 'ana@exemplo.com' });
  achar(caixa, n => n.tag === 'button').clicar();
  await esperar();
  const a = achar(caixa, n => n.tag === 'a');
  assert.equal(a.textContent, 'Abrir o e-mail');
  assert.equal(a.href, 'mailto:ana@exemplo.com', 'sem ?subject= e sem &body=: o link de uso único não vai num endereço');
  assert.ok(achar(caixa, n => n.tag === 'textarea').value.endsWith('/orcamento#retomar=' + CODIGO));
  assert.ok(caixa.children.map(f => achar(f, n => n.tag === 'p' && n.textContent === 'Assunto do e-mail: Os modelos do seu site estão prontos')).find(Boolean), 'o assunto aparece escrito');
  assert.equal(a.target, undefined, 'o e-mail não abre aba nova');
});

test('aviso: sem contato aproveitável, só diz isso (nem botão de preparar nem chamada ao servidor)', () => {
  for (const contato of [{}, { email: 'isto não é e-mail' }, { telefone: null, email: 'a@b' }]) {
    const { C, chamadas } = montar(ok({ codigo: CODIGO }));
    const caixa = aviso(C, contato);
    assert.equal(achar(caixa, n => n.tag === 'button'), null);
    assert.match(achar(caixa, n => n.tag === 'p').textContent, /Sem contato para avisar/);
    assert.equal(chamadas.length, 0);
  }
});

test('aviso: se o servidor recusa, mostra o motivo e libera o botão para tentar de novo', async () => {
  const { C } = montar(falha('Este pedido não está confirmado ou já passou do resumo: sem link de retomada.'));
  const caixa = aviso(C, { nome: 'Ana', telefone: '5521991234567' });
  const preparar = achar(caixa, n => n.tag === 'button');
  preparar.clicar();
  await esperar();
  assert.equal(achar(caixa, n => n.tag === 'a'), null, 'sem link, sem botão do WhatsApp');
  assert.match(achar(caixa, n => n.attrs.role === 'status').textContent, /sem link de retomada/);
  assert.equal(preparar.disabled, false);
});

test('aviso: o link de retomada nunca vai para console nem para o armazenamento do navegador', async () => {
  const { C, registros } = montar(ok({ codigo: CODIGO }));
  const caixa = aviso(C, { nome: 'Ana', telefone: '5521991234567' });
  achar(caixa, n => n.tag === 'button').clicar();
  await esperar();
  assert.ok(achar(caixa, n => n.tag === 'a'));
  assert.deepEqual(registros, []);
  assert.ok(!/console\.|localStorage|sessionStorage|innerHTML|\.style\b/.test(FONTE.replace(/\/\*[\s\S]*?\*\//g, '')), 'o módulo comum não usa console, armazenamento, innerHTML nem estilo inline');
});

test('painel.html: a seção dos lembretes nasce escondida, o script vem depois do dos pedidos e não há estilo inline', () => {
  const html = ler('painel.html');
  assert.match(html, /<section class="pn__bloco" aria-labelledby="t-lembretes" id="bloco-lembretes" hidden>/);
  for (const id of ['t-lembretes', 'lembretes-atualizar', 'lembretes-estado', 'lembretes']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.ok(html.includes('role="status"'));
  const scripts = [...html.matchAll(/<script src="js\/([\w-]+\.js)" defer><\/script>/g)].map(m => m[1]);
  assert.ok(scripts.indexOf('painel-lembretes.js') > scripts.indexOf('painel-fila.js') && scripts.indexOf('painel-fila.js') > scripts.indexOf('painel-pedido-comum.js'), scripts.join(', '));
  assert.ok(!/\sstyle=|<style/i.test(html), 'a CSP do painel não aceita estilo inline');
});

test('fila e lembretes usam o aviso com link: sem a mensagem antiga "no mesmo navegador" e sem montar o wa.me por conta própria', () => {
  const fila = ler('js/painel-fila.js'), lembretes = ler('js/painel-lembretes.js');
  assert.ok(!/mesmo navegador/.test(fila + lembretes));
  assert.ok(!/wa\.me|mailto:/.test(fila + lembretes), 'o link de contato nasce num lugar só (painel-pedido-comum.js)');
  assert.match(fila, /C\.avisoComLink\(/);
  assert.match(lembretes, /C\.avisoComLink\(/);
  for (const [nome, fonte] of [['fila', fila], ['lembretes', lembretes]]) {
    assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|console\.|\.style\b|localStorage|sessionStorage/.test(fonte.replace(/\/\*[\s\S]*?\*\//g, '')), nome + ': só textContent, sem console nem armazenamento');
  }
});

test('aviso: resposta 200 sem código válido não vira link com "undefined": diz que não deu e libera o botão', async () => {
  for (const corpo of [{}, { codigo: null }, { codigo: 'curto' }, { codigo: CODIGO + 'x' }, { codigo: 'AbCdEfGhIjKlMnOpQrStUvWxYz01234!' }, { codigo: 12345678901234567890123456789012 }]) {
    const { C } = montar(ok(corpo));
    const caixa = aviso(C, { nome: 'Ana', telefone: '5521991234567' });
    const preparar = achar(caixa, n => n.tag === 'button');
    preparar.clicar();
    await esperar();
    assert.equal(achar(caixa, n => n.tag === 'a'), null, JSON.stringify(corpo) + ': sem link, sem botão do WhatsApp');
    assert.equal(achar(caixa, n => n.attrs.role === 'status').textContent, 'Não deu para gerar o link agora.', JSON.stringify(corpo));
    assert.equal(preparar.disabled, false, JSON.stringify(corpo) + ': o botão volta para tentar de novo');
  }
});

test('aviso: erro de rede (rejeição sem status) fala português, não a mensagem crua do navegador', async () => {
  const { C } = montar(() => Promise.reject(new TypeError('Failed to fetch')));
  const caixa = aviso(C, { nome: 'Ana', telefone: '5521991234567' });
  const preparar = achar(caixa, n => n.tag === 'button');
  preparar.clicar();
  await esperar();
  assert.equal(achar(caixa, n => n.attrs.role === 'status').textContent, 'Sem conexão com o servidor. Tente de novo.');
  assert.equal(preparar.disabled, false);
});

test('aviso: o link já mandado não some sem aviso: a ajuda da fila e a dos lembretes dizem para não preparar de novo', () => {
  const html = ler('painel.html');
  assert.match(html, /Já mandou o link\? Não prepare de novo: o novo invalida o que o cliente recebeu\./);
  assert.match(html, /Já mandou o link\? Não prepare de novo: o novo invalida o que o cliente recebeu; toque em "Já lembrei"\./);
  assert.match(FONTE, /Link pronto \(vale 7 dias e abre uma vez\)\. Preparar de novo invalida este\./);
});

test('lembretes: não recarrega quando a fila muda (isso apagaria uma mensagem pronta (e o botão da conversa) preparada e não usado)', () => {
  assert.ok(!/pedidos-mudaram/.test(ler('js/painel-lembretes.js')));
});
