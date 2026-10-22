/* O MATERIAL pela API (PR 3b-2; spec §7, §8, §9): sessão de outro visitante recusada em toda ação; corpo acima de 16 KB;
   o arquivo nunca passa pelo Worker (o teste manda os bytes direto ao armazém, como o navegador); a conferência pelos
   bytes e pelo tamanho; o servidor grava o texto da autorização; nenhum log com link assinado; a IA nunca é chamada.
   Banco real (PGlite) e armazém local.  node --test */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { montarLocal } from '../banco-local.mjs';
import { criarCenario, BASE } from './_ajustes.mjs';
import { ateEntregaCriada } from './_entrega.mjs';
import { ACOES, LIMITE_BYTES } from '../../api/vendas.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

let local, cen;
before(async () => { local = await montarLocal({ base: BASE }); cen = criarCenario(local); });
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(100, 7)]);
const JPG = Buffer.concat([Buffer.from('ffd8ffe000104a46494600010100000100', 'hex'), Buffer.alloc(100, 7)]);
const HTML = Buffer.from('<html><body>não sou foto</body></html>' + ' '.repeat(100));
const rel = url => url.replace(BASE, '');
const subir = (url, bytes, tipo) => local.armazem.gravarPorUrl(rel(url), bytes, tipo).status;
const material = async (n, c) => (await cen.estado(n, c)).entrega.material;
async function foto(n, c, bytes = JPG, tipo = 'image/jpeg', declarado = bytes.length) {
  const r = await n.chamar('POST', 'material-reservar', { conversa_id: c, papel: 'foto', tipo, tamanho: declarado });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return r.corpo;
}

test('as ações novas existem, são POST e nenhuma devolve bytes nem link de leitura ao navegador', () => {
  for (const a of ['material-salvar', 'material-reservar', 'material-conferir', 'material-remover', 'material-enviar']) assert.ok(Object.hasOwn(ACOES.POST, a), a);
  assert.deepEqual(Object.keys(ACOES.GET).filter(k => /material|arquivo|ler|baixar/.test(k)), [], 'o cliente nunca lê arquivo de volta');
  assert.deepEqual(Object.keys(ACOES.POST).filter(k => /^(ler|baixar|leitura|link-leitura)/.test(k) || /material-(ler|baixar|leitura)/.test(k)), []);
});

test('salvar: o campo vale pelo esquema; desconhecido, valor ruim e CPF são recusados; telefone e e-mail no texto viram marcador', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const salvar = (campo, valor) => n.chamar('POST', 'material-salvar', { conversa_id: c, campo, valor });
  assert.equal((await salvar('servicos', [{ nome: 'Fisioterapia', descricao: 'Sessões de 50 min' }])).status, 200);
  assert.equal((await salvar('whatsapp', '+5521999990001')).status, 200);
  assert.equal((await salvar('whatsapp', '21 99999-0001')).status, 400);   /* (sem o +55 e com máscara; 11 dígitos colados leriam como CPF: 422) */
  assert.equal((await salvar('campo_que_nao_existe', 'x')).status, 400);
  assert.equal((await salvar('negocio.uf', 'ZZ')).status, 400);
  const cpf = await salvar('provas', ['CPF 123.456.789-09']);
  assert.equal(cpf.status, 422); assert.match(cpf.corpo.erro, /CPF/);
  assert.equal((await salvar('provas', ['ligue (21) 99999-0001 ou a@b.com'])).status, 200);
  const m = await material(n, c);
  assert.ok(!/99999-0001|a@b\.com/.test(JSON.stringify(m.dados.provas)), JSON.stringify(m.dados.provas));
  assert.equal((await salvar('bairros', null)).status, 200);
  assert.equal((await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'whatsapp', usar_numero_do_pedido: true })).status, 200);
  assert.match((await material(n, c)).dados.whatsapp, /^\+55\d{10,11}$/);
  assert.equal((await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'servicos', usar_numero_do_pedido: true })).status, 400);
  assert.equal((await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'cor', valor: '#1a7f5a', extra: 1 })).status, 400, 'chave a mais no corpo');
});

test('o texto da autorização é o do servidor: o cliente só diz "marcada"', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const r = await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'autorizacao.marcada', valor: true });
  assert.equal(r.status, 200);
  const a = (await material(n, c)).autorizacao;
  assert.equal(a.marcada, true); assert.equal(a.texto, ESQ.AUTORIZACAO.texto); assert.equal(a.versao, ESQ.AUTORIZACAO.versao);
  assert.match(a.marcada_em, /-04:00$/);
  const forjado = await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'autorizacao.marcada', valor: { texto: 'forjado' } });
  assert.equal(forjado.status, 400);
});

test('outro visitante, em toda ação, não alcança a conversa (404) e nada muda; corpo acima de 16 KB é 413', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const outro = cen.navegador({ env: { BZ_ENTREGA: 'ligada' }, armazem: local.armazem }); await outro.iniciar();
  const f = await foto(n, c);
  for (const [acao, corpo] of [['material-salvar', { campo: 'cor', valor: '#1a7f5a' }], ['material-reservar', { papel: 'foto', tipo: 'image/jpeg', tamanho: 1000 }],
    ['material-conferir', { arquivo_id: f.arquivo_id }], ['material-remover', { arquivo_id: f.arquivo_id }], ['material-enviar', {}]]) {
    const r = await outro.chamar('POST', acao, { conversa_id: c, ...corpo });
    assert.equal(r.status, 404, acao + ' ' + JSON.stringify(r.corpo));
  }
  assert.equal((await material(n, c)).arquivos.length, 1);
  const grande = await n.chamar('POST', 'material-salvar', JSON.stringify({ conversa_id: c, campo: 'endereco', valor: 'x'.repeat(LIMITE_BYTES) }));
  assert.equal(grande.status, 413);
});

test('o caminho feliz de um arquivo: reservar → o navegador envia ao armazém → conferir; a resposta nunca leva o caminho do balde', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const f = await foto(n, c, PNG, 'image/png');
  assert.deepEqual(Object.keys(f).sort(), ['arquivo_id', 'url_envio']);
  assert.ok(f.url_envio.includes('/_armazem-local/') && f.url_envio.includes('token='));
  assert.equal(subir(f.url_envio, PNG, 'image/png'), 200);
  const ok = await n.chamar('POST', 'material-conferir', { conversa_id: c, arquivo_id: f.arquivo_id });
  assert.deepEqual([ok.status, ok.corpo], [200, { status: 'conferido' }]);
  assert.equal((await n.chamar('POST', 'material-conferir', { conversa_id: c, arquivo_id: f.arquivo_id })).corpo.status, 'conferido', 'idempotente');
  const arqs = (await material(n, c)).arquivos;
  assert.deepEqual(arqs.map(a => [a.papel, a.status, a.tamanho]), [['foto', 'conferido', PNG.length]]);
  assert.ok(!JSON.stringify(await cen.estado(n, c)).includes('_armazem-local'), 'o estado não leva link nem caminho');
});

test('conferir: HTML com tipo de foto, SVG e tamanho diferente do declarado são recusados e o objeto some do armazém', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  for (const [bytes, declarado, frase] of [[HTML, HTML.length, /não é uma foto que o site aceita/], [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>' + ' '.repeat(80)), 120, /não é uma foto/], [PNG, PNG.length + 50, /não é o que você escolheu/]]) {
    const antes = local.armazem.objetos.size;
    const f = await foto(n, c, bytes, 'image/png', declarado);
    assert.equal(subir(f.url_envio, bytes, 'image/png'), 200, 'o balde só confere o tipo DECLARADO');
    assert.equal(local.armazem.objetos.size, antes + 1);
    const r = await n.chamar('POST', 'material-conferir', { conversa_id: c, arquivo_id: f.arquivo_id });
    assert.equal(r.status, 422); assert.match(r.corpo.erro, frase);
    assert.equal(local.armazem.objetos.size, antes, 'o objeto recusado foi apagado do armazém');
  }
  assert.deepEqual((await material(n, c)).arquivos, [], 'recusadas não aparecem na lista da tela');
  assert.equal((await local.db.query("select count(*)::int n from app.material_arquivos where status = 'recusado'")).rows[0].n >= 3, true);
});

test('conferir sem o arquivo ter chegado: 409 com a frase, e a linha continua em "reservado" para tentar de novo', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const f = await foto(n, c);
  const r = await n.chamar('POST', 'material-conferir', { conversa_id: c, arquivo_id: f.arquivo_id });
  assert.equal(r.status, 409); assert.match(r.corpo.erro, /não chegou/);
  assert.equal((await material(n, c)).arquivos[0].status, 'reservado');
});

test('reservar: tipo fora da lista, tamanho e cotas voltam com a frase da tela (e nenhum link é criado)', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const r = (papel, tipo, tamanho) => n.chamar('POST', 'material-reservar', { conversa_id: c, papel, tipo, tamanho });
  const tipo = await r('foto', 'image/svg+xml', 1000);
  assert.equal(tipo.status, 422); assert.match(tipo.corpo.erro, /Use JPG, PNG ou WebP/);
  assert.match((await r('foto', 'image/jpeg', 10 * 1024 * 1024 + 1)).corpo.erro, /até 10 MB/);
  assert.match((await r('logo', 'image/png', 5 * 1024 * 1024 + 1)).corpo.erro, /até 5 MB/);
  assert.equal((await r('foto', 'image/jpeg', 0)).status, 400);
  assert.equal((await r('banner', 'image/jpeg', 10)).status, 400);
  for (let i = 0; i < 20; i++) assert.equal((await r('foto', 'image/jpeg', 1000)).status, 200);
  const cheio = await r('foto', 'image/jpeg', 1000);
  assert.equal(cheio.status, 409); assert.match(cheio.corpo.erro, /limite de 20 fotos/);
});

test('remover apaga o objeto do armazém e a linha some da lista', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const f = await foto(n, c, PNG, 'image/png');
  subir(f.url_envio, PNG, 'image/png');
  await n.chamar('POST', 'material-conferir', { conversa_id: c, arquivo_id: f.arquivo_id });
  const antes = local.armazem.objetos.size;
  assert.equal((await n.chamar('POST', 'material-remover', { conversa_id: c, arquivo_id: f.arquivo_id })).status, 200);
  assert.equal(local.armazem.objetos.size, antes - 1);
  assert.deepEqual((await material(n, c)).arquivos, []);
  assert.equal((await n.chamar('POST', 'material-remover', { conversa_id: c, arquivo_id: f.arquivo_id })).status, 404, 'remover de novo: já não existe');
});

test('enviar: sem WhatsApp e sem a caixa, 409 com a lista do que falta; com tudo, o passo muda e a data prevista volta', async () => {
  const { n, c } = await ateEntregaCriada(cen, local);
  const vazio = await n.chamar('POST', 'material-enviar', { conversa_id: c });
  assert.equal(vazio.status, 409); assert.deepEqual(vazio.corpo.faltas, [{ bloco: 2, texto: 'o WhatsApp dos botões' }, { bloco: 4, texto: 'o estado do negócio' }, { bloco: 6, texto: 'marcar a autorização' }]);
  await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'whatsapp', valor: '+5521999990001' });
  await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'autorizacao.marcada', valor: true });
  const semUf = await n.chamar('POST', 'material-enviar', { conversa_id: c });
  assert.equal(semUf.status, 409); assert.deepEqual(semUf.corpo.faltas, [{ bloco: 4, texto: 'o estado do negócio' }], 'A2: só falta o estado, e o envio não passa sem ele');
  await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'negocio.uf', valor: 'RJ' });
  const f = await foto(n, c);
  assert.match((await n.chamar('POST', 'material-enviar', { conversa_id: c })).corpo.erro, /terminarem/, 'com arquivo ainda em envio, espera');
  subir(f.url_envio, JPG, 'image/jpeg');
  await n.chamar('POST', 'material-conferir', { conversa_id: c, arquivo_id: f.arquivo_id });
  const ok = await n.chamar('POST', 'material-enviar', { conversa_id: c });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.match(ok.corpo.entrega_ate, /^\d{4}-\d{2}-\d{2}$/);
  const e = (await cen.estado(n, c)).entrega;
  assert.equal(e.passo, 'producao'); assert.equal(e.entrega_ate, ok.corpo.entrega_ate); assert.equal(e.material.status, 'enviado');
  assert.equal((await n.chamar('POST', 'material-enviar', { conversa_id: c })).status, 409, 'enviar de novo: o passo já mudou');
  assert.equal((await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'cor', valor: '#1a7f5a' })).status, 409, 'depois do envio nada se salva');
});

test('armazém fora do ar: reservar dá 503 recuperável e a linha reservada é desfeita; sem armazém configurado, 503', async () => {
  const quebrado = { async linkDeEnvio() { throw new Error('quebrou com token=SEGREDO e caminho'); }, async remover() {} };
  const { n, c } = await ateEntregaCriada(cen, local, { armazem: quebrado });
  const logs = []; const orig = { e: console.error, l: console.log };
  console.error = (...a) => logs.push(a.join(' ')); console.log = (...a) => logs.push(a.join(' '));
  try {
    const r = await n.chamar('POST', 'material-reservar', { conversa_id: c, papel: 'foto', tipo: 'image/jpeg', tamanho: 1000 });
    assert.equal(r.status, 503); assert.equal(r.corpo.recuperavel, true);
  } finally { console.error = orig.e; console.log = orig.l; }
  assert.ok(!logs.join('\n').includes('SEGREDO') && !/token=/.test(logs.join('\n')), 'o log nunca leva link nem token: ' + logs.join(' | '));
  assert.deepEqual((await material(n, c)).arquivos, [], 'a reserva foi desfeita');
  const sem = await ateEntregaCriada(cen, local, { armazem: null });
  assert.equal((await sem.n.chamar('POST', 'material-reservar', { conversa_id: sem.c, papel: 'foto', tipo: 'image/jpeg', tamanho: 1000 })).status, 503);
});

test('nenhuma ação do material chama a IA', async () => {
  const antes = cen.contas.ia;
  const { n, c } = await ateEntregaCriada(cen, local);
  await n.chamar('POST', 'material-salvar', { conversa_id: c, campo: 'cor', valor: '#1a7f5a' });
  assert.equal(cen.contas.ia, antes);
});
