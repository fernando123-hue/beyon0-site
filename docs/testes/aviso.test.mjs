/* O aviso ao dono (api/_aviso.mjs): e-mail pelo binding send_email da Cloudflare até existir o app do dono com push (dono, 10/11).
   Textos fixos, sem dado de cliente; sem canal ou com endereço estranho não envia; falha nunca lança.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { avisarDono, AVISOS } from '../../api/_aviso.mjs';
import { criarAcoesDoRecado } from '../../api/_vendas/fluxo-recado.mjs';

test('aviso: os textos são fixos e não carregam dado de ninguém', () => {
  for (const t of Object.values(AVISOS)) assert.ok(!/[@\d]|BZ-|\+55/.test(t.replace(/\./g, '')), t);
  assert.deepEqual(Object.keys(AVISOS).sort(), ['atendente_cliente', 'atendente_contatos', 'atendente_global', 'custo_dia', 'fila_cheia', 'pedido', 'recado']);
});

/* canal de e-mail (dono, 10/11: "Primeiro e mail até termos o APP, depois disso exclua o email"): binding send_email da Cloudflare */
class EmailFalso { constructor(de, para, bruto) { Object.assign(this, { de, para, bruto }); } }
const canalFalso = () => { const enviados = []; return { enviados, send: async m => { enviados.push(m); } }; };
const ENV_OK = (canal) => ({ AVISO_EMAIL: canal, AVISO_PARA: 'dono@exemplo.com' });
const corpoDe = bruto => Buffer.from(bruto.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');

test('aviso: sem o canal configurado não envia nada, não faz fetch e devolve false', async () => {
  const salvo = globalThis.fetch;
  let rede = 0;
  globalThis.fetch = async () => { rede++; return new Response('x'); };
  try {
    const canal = canalFalso();
    for (const env of [undefined, {}, { AVISO_EMAIL: canal }, { AVISO_EMAIL: canal, AVISO_PARA: '' }, { AVISO_PARA: 'c@d.com' }]) {
      for (const tipo of Object.keys(AVISOS)) assert.equal(await avisarDono(env, tipo, { EmailMessage: EmailFalso }), false, tipo);
    }
    assert.equal(canal.enviados.length, 0);
    assert.equal(rede, 0, 'nenhum fetch');
  } finally { globalThis.fetch = salvo; }
});

test('aviso: com o canal, manda UM e-mail com o texto fixo e o link do painel, sem dado de cliente', async () => {
  for (const tipo of Object.keys(AVISOS)) {
    const canal = canalFalso();
    assert.equal(await avisarDono(ENV_OK(canal), tipo, { EmailMessage: EmailFalso, agora: () => Date.UTC(2026, 10, 10, 12) }), true, tipo);
    assert.equal(canal.enviados.length, 1);
    const m = canal.enviados[0];
    assert.equal(m.de, 'avisos@beyonzero.com.br'); assert.equal(m.para, 'dono@exemplo.com');
    assert.match(m.bruto, /^From: Beyon Zero <avisos@beyonzero\.com\.br>\r\n/m);
    assert.match(m.bruto, /^To: dono@exemplo\.com\r\n/m);
    assert.match(m.bruto, /^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/m);
    assert.match(m.bruto, /^Message-ID: <[a-z0-9.-]+@beyonzero\.com\.br>\r\n/m);
    assert.match(m.bruto, /^Date: Tue, 10 Nov 2026 12:00:00 GMT\r\n/m);
    assert.match(m.bruto, /^Content-Type: text\/plain; charset=utf-8\r\n/m);
    const corpo = corpoDe(m.bruto);
    assert.ok(corpo.startsWith(AVISOS[tipo]), corpo);
    assert.match(corpo, /https:\/\/beyonzero\.com\.br\/painel/);
  }
});

test('aviso: fila cheia e alertas de teto mandam no máximo 1 e-mail por hora por tipo; recado e pedido não têm freio (revisão técnica)', async () => {
  let t = Date.UTC(2026, 10, 10, 12);
  const canal = canalFalso();
  const deps = { EmailMessage: EmailFalso, agora: () => t, memoria: new Map() };
  assert.equal(await avisarDono(ENV_OK(canal), 'fila_cheia', deps), true);
  assert.equal(await avisarDono(ENV_OK(canal), 'fila_cheia', deps), false, 'segundo no mesmo hora: não manda');
  assert.equal(await avisarDono(ENV_OK(canal), 'atendente_global', deps), true, 'outro tipo tem o seu próprio freio');
  assert.equal(await avisarDono(ENV_OK(canal), 'recado', deps), true);
  assert.equal(await avisarDono(ENV_OK(canal), 'recado', deps), true, 'cada recado avisa');
  t += 61 * 60e3;
  assert.equal(await avisarDono(ENV_OK(canal), 'fila_cheia', deps), true, 'passada a hora, avisa de novo');
  assert.equal(canal.enviados.length, 5);
  for (const m of canal.enviados) {
    const palavra = m.bruto.match(/^Subject: (\S+)\r\n/m)[1];
    assert.ok(palavra.length <= 75, 'assunto cabe numa palavra codificada da RFC 2047: ' + palavra.length);
  }
});

test('aviso: tipo desconhecido, endereço com quebra de linha ou envio que falha: devolve false e nunca lança', async () => {
  const canal = canalFalso();
  assert.equal(await avisarDono(ENV_OK(canal), 'qualquer', { EmailMessage: EmailFalso }), false);
  for (const ruim of ['a@b.com\r\nBcc: x@y.com', 'sem-arroba', 'a@b.com, c@d.com']) {
    assert.equal(await avisarDono({ ...ENV_OK(canal), AVISO_PARA: ruim }, 'recado', { EmailMessage: EmailFalso }), false, ruim);
  }
  assert.equal(canal.enviados.length, 0);
  const quebrado = { send: async () => { throw new Error('destino não verificado'); } };
  const quebradoComEndereco = { send: async () => { throw new Error('destination dono@exemplo.com not verified'); } };
  const erros = []; const salvo = console.error; console.error = (...a) => erros.push(a.join(' '));
  try { assert.equal(await avisarDono(ENV_OK(quebrado), 'recado', { EmailMessage: EmailFalso }), false); assert.equal(await avisarDono(ENV_OK(quebradoComEndereco), 'recado', { EmailMessage: EmailFalso }), false); } finally { console.error = salvo; }
  assert.equal(erros.length, 2); for (const e of erros) assert.doesNotMatch(e, /dono@exemplo/, 'o log não leva o endereço');
});

test('aviso: o código da API não fala mais com ntfy.sh nem lê as variáveis antigas', () => {
  const raiz = new URL('../../api/', import.meta.url);
  const arquivos = readdirSync(raiz, { recursive: true }).filter(a => String(a).endsWith('.mjs'));
  assert.ok(arquivos.length > 10, 'a varredura achou os arquivos da API');
  for (const arq of arquivos) {
    const codigo = readFileSync(new URL(String(arq).split('\\').join('/'), raiz), 'utf8');
    assert.doesNotMatch(codigo, /ntfy\.sh|process\.env\.ALERTA|env\.ALERTA_/i, String(arq));
  }
});

test('recado: grava, chama o aviso com o tipo fixo (sem o conteúdo) e o aviso sem canal não muda a resposta', async () => {
  const vistos = [];
  const mk = avisar => criarAcoesDoRecado({ banco: async () => ({ ok: true }), visitantes: () => null, segredoFreio: 'x'.repeat(32), env: { BZ_LOCAL: '1', VERCEL: '' }, avisar });
  const corpo = { texto: 'Meu telefone é 21 99999-0000, ana@exemplo.com', email: 'ana@exemplo.com', origem: 'orcamento' };
  const req = { headers: new Headers({ 'x-forwarded-for': '203.0.113.9' }) };
  const r = await mk((env, tipo) => vistos.push(tipo)).recado({ request: req, corpo });
  assert.deepEqual(r, { ok: true }); assert.deepEqual(vistos, ['recado']);
  const r2 = await mk(avisarDono).recado({ request: req, corpo: { ...corpo, texto: 'Outro recado' } });
  assert.deepEqual(r2, { ok: true });
});

/* o pedido: o aviso sai depois de gravar; a recusa por fila cheia/limite avisa com o texto urgente; recusa comum não avisa; o aviso sem canal não muda a resposta */
import { criarAcoesDoPedido } from '../../api/_vendas/fluxo-pedido.mjs';
const UUID = '11111111-1111-4111-8111-111111111111';
const corpoPedido = () => ({ conversa_id: UUID, negocio: 'Clínica Sol', vende: 'Consultas e exames', telefone: '(21) 98765-4321', nome: 'Rita', aceite: true });
/* o aviso vai em segundo plano: aqui o segundo plano é uma lista, e cada chamada espera a lista antes de devolver (para conferir os tipos) */
function pedidoCom(resposta, avisar) {
  const fundo = [];
  const acoes = criarAcoesDoPedido({ banco: async () => resposta, visitante: async () => UUID, segredoFreio: 'x'.repeat(40), env: { BZ_LOCAL: '1' }, avisar, segundoPlano: p => fundo.push(p) });
  return { detalhes: async x => { try { return await acoes.detalhes(x); } finally { await Promise.all(fundo); } } };
}
const req = { headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }) };

test('pedido: grava e depois avisa "pedido" uma vez; o corpo do aviso não leva dado (só o tipo)', async () => {
  const tipos = [];
  const r = await pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado' }, (env, tipo) => { tipos.push(tipo); }).detalhes({ request: req, corpo: corpoPedido() });
  assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' });
  assert.deepEqual(tipos, ['pedido']);
});

test('pedido: fila cheia e limite por hora avisam "fila_cheia" e dão a saída do recado; recusa comum não avisa', async () => {
  for (const motivo of ['fila_cheia', 'limite_hora']) {
    const tipos = [];
    await assert.rejects(pedidoCom({ ok: false, motivo }, (e, t) => { tipos.push(t); }).detalhes({ request: req, corpo: corpoPedido() }), e => e.status === 503 && e.extra.recado === true && e.extra.fila_cheia === true);
    assert.deepEqual(tipos, ['fila_cheia'], motivo);
  }
  const tipos = [];
  await assert.rejects(pedidoCom({ ok: false, motivo: 'telefone_dia' }, (e, t) => { tipos.push(t); }).detalhes({ request: req, corpo: corpoPedido() }), e => e.status === 409);
  assert.deepEqual(tipos, []);
});

test('pedido rápido: a resposta ao cliente não espera o e-mail de aviso (vai em segundo plano) e a falha dele não derruba o pedido', async () => {
  const fundo = []; let soltar, avisou = false;
  const lento = () => new Promise(r => { soltar = () => { avisou = true; r(true); }; });
  const a = criarAcoesDoPedido({ banco: async () => ({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado' }), visitante: async () => UUID, segredoFreio: 'x'.repeat(40), env: { BZ_LOCAL: '1' }, avisar: lento, segundoPlano: p => fundo.push(p) });
  assert.deepEqual(await a.detalhes({ request: req, corpo: corpoPedido() }), { codigo: 'BZ-K7M3Q', status: 'confirmado' });
  assert.equal(avisou, false); assert.equal(fundo.length, 1);
  soltar(); await fundo[0]; assert.equal(avisou, true);
  const b2 = criarAcoesDoPedido({ banco: async () => ({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado' }), visitante: async () => UUID, segredoFreio: 'x'.repeat(40), env: { BZ_LOCAL: '1' }, avisar: async () => { throw new Error('caiu'); }, segundoPlano: p => fundo.push(p) });
  assert.deepEqual(await b2.detalhes({ request: req, corpo: corpoPedido() }), { codigo: 'BZ-K7M3Q', status: 'confirmado' });
  await assert.doesNotReject(fundo[1]);
});

test('pedido: com o aviso real sem canal configurado o pedido grava e a resposta não muda, sem nenhum fetch', async () => {
  const salvo = globalThis.fetch;
  let rede = 0;
  globalThis.fetch = async () => { rede++; return new Response('x'); };
  try {
    const r = await pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado' }, avisarDono).detalhes({ request: req, corpo: corpoPedido() });
    assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' });
    assert.equal(rede, 0);
  } finally { globalThis.fetch = salvo; }
});

test('pedido: o que ENCHE a fila avisa "fila_cheia" (com a fila no teto a página esconde o formulário, então quase ninguém chega a ser recusado)', async () => {
  const tipos = [];
  const r = await pedidoCom({ ok: true, codigo: 'BZ-K7M3Q', status: 'confirmado', fila_cheia: true }, (e, t) => { tipos.push(t); }).detalhes({ request: req, corpo: corpoPedido() });
  assert.deepEqual(r, { codigo: 'BZ-K7M3Q', status: 'confirmado' }, 'a resposta ao cliente não muda nem vaza o estado da fila');
  assert.deepEqual(tipos, ['fila_cheia']);
});
