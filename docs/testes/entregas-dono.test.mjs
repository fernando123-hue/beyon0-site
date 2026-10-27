/* O COMANDO DO DONO (PR 3b-2; spec §6): listar mostra o próximo comando pronto e os alertas; baixar grava as DUAS pastas
   (pedido-site/ com os dois JSON; material/ só com imagens), confere de novo os bytes, o tamanho e a ESTRUTURA da imagem,
   baixa só de https do Supabase (a chave do painel nunca sai para lá) e NÃO marca nada; importado é um comando à parte.
   Fetch e disco de mentira (pasta temporária).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listar, baixar, marcarImportado, proximoComando, alertasDe } from '../../scripts/entregas-lib.mjs';
import { estruturaCompleta } from '../../scripts/imagem-estrutura.mjs';

const CHAVE = 'k'.repeat(40);
const BASE = 'http://127.0.0.1:8899';
const png = (fim = true) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.from('0000000d49484452' + '00000001000000010802000000' + '00000000', 'hex'),   /* IHDR (13 bytes de dados + CRC de mentira) */
  ...(fim ? [Buffer.from('0000000049454e44ae426082', 'hex')] : [])]);                   /* IEND */
const jpg = (fim = true) => Buffer.from(fim ? 'ffd8ffe000040000ffda00' : 'ffd8ffe000100000', 'hex');   /* SOI, APP0 de 4 bytes, SOS  |  APP0 que promete 16 bytes e não tem */
const pacote = (arquivos, extra = {}) => ({ pedido: { versao: 1, codigo: 'BZ-K7M3Q' }, formulario: { versao: 1, arquivos: arquivos.map(a => a.nome) },
  arquivos: arquivos.map(a => ({ nome: a.nome, papel: a.nome.startsWith('logo') ? 'logo' : 'foto', tipo_real: a.tipo_real, tamanho: a.bytes.length, url: 'https://projeto.supabase.co/storage/v1/object/sign/material/x?token=T' })), ...extra });
function mundo(arquivos, { corpoPorUrl = {} } = {}) {
  const chamadas = [];
  const buscar = async (url, o = {}) => {
    chamadas.push({ url: String(url), cab: o.headers || {}, metodo: o.method || 'GET' });
    if (String(url).startsWith(BASE + '/api/painel?material=')) return Response.json(pacote(arquivos));
    if (String(url).startsWith(BASE + '/api/painel?fila=entregas')) return Response.json({ entregas: [], total: 0 });
    const a = arquivos.find(x => String(url).includes('x?token=T'));
    return new Response(corpoPorUrl[url] || (a && a.bytes), { status: 200 });
  };
  return { buscar, chamadas };
}

test('estruturaCompleta: PNG e JPEG inteiros passam; cortados no meio não', () => {
  assert.equal(estruturaCompleta(png(true)), true);
  assert.equal(estruturaCompleta(png(false)), false, 'PNG sem IEND');
  assert.equal(estruturaCompleta(jpg(true)), true);
  assert.equal(estruturaCompleta(jpg(false)), false, 'JPEG com o segmento cortado');
  assert.equal(estruturaCompleta(Buffer.from('não sou imagem')), false);
});

test('baixar: grava pedido-site/ (2 JSON) e material/ (só imagens), sem marcar nada; a chave só vai ao painel', async () => {
  const a = [{ nome: 'logo.png', tipo_real: 'png', bytes: png() }];
  const w = mundo(a);
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'entregas-'));
  const r = await baixar({ base: BASE, chave: CHAVE, buscar: w.buscar, codigo: 'BZ-K7M3Q', destino: pasta });
  assert.deepEqual(fs.readdirSync(pasta).sort(), ['material', 'pedido-site']);
  assert.deepEqual(fs.readdirSync(path.join(pasta, 'pedido-site')).sort(), ['formulario.json', 'pedido.json']);
  assert.deepEqual(fs.readdirSync(path.join(pasta, 'material')), ['logo.png'], 'nenhum JSON em material/');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pasta, 'pedido-site', 'pedido.json'), 'utf8')).codigo, 'BZ-K7M3Q');
  assert.ok(fs.readFileSync(path.join(pasta, 'material', 'logo.png')).equals(a[0].bytes));
  const painel = w.chamadas.filter(c => c.url.startsWith(BASE + '/api/painel'));
  const arquivos = w.chamadas.filter(c => !c.url.startsWith(BASE));
  assert.ok(painel.every(c => c.cab.authorization === 'Bearer ' + CHAVE));
  assert.ok(arquivos.every(c => !c.cab.authorization && !JSON.stringify(c.cab).includes(CHAVE)), 'a chave do painel nunca vai ao armazém');
  assert.ok(!w.chamadas.some(c => c.metodo === 'POST'), 'baixar não marca nada (nenhum POST)');
  assert.match(r.comandos[0], /importe a pasta/, 'primeiro a importação da captação');
  assert.match(r.comandos[1], /SÓ depois.*importado BZ-K7M3Q <id do cliente.*c-xxxxxx>/, 'e só depois o importado');
});

test('baixar recusa: arquivo cortado, tipo diferente do declarado, tamanho diferente e endereço que não é do Supabase; nada fica gravado', async () => {
  const caso = async (arq, extra) => {
    const w = mundo([arq], extra);
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'entregas-'));
    await assert.rejects(baixar({ base: BASE, chave: CHAVE, buscar: w.buscar, codigo: 'BZ-K7M3Q', destino: pasta }));
    assert.deepEqual(fs.existsSync(path.join(pasta, 'material')) ? fs.readdirSync(path.join(pasta, 'material')) : [], [], 'nada gravado');
  };
  await caso({ nome: 'logo.png', tipo_real: 'png', bytes: png(false) });
  await caso({ nome: 'foto-01.jpg', tipo_real: 'jpg', bytes: png() });
  await caso({ nome: 'foto-01.jpg', tipo_real: 'jpg', bytes: jpg() }, { corpoPorUrl: { 'https://projeto.supabase.co/storage/v1/object/sign/material/x?token=T': Buffer.concat([jpg(), Buffer.alloc(9)]) } });
  const w = mundo([{ nome: 'logo.png', tipo_real: 'png', bytes: png() }]);
  const b = async (url, o) => (String(url).startsWith(BASE) ? Response.json({ ...pacote([{ nome: 'logo.png', tipo_real: 'png', bytes: png() }]), arquivos: [{ nome: 'logo.png', papel: 'logo', tipo_real: 'png', tamanho: png().length, url: 'https://atacante.exemplo/x' }] }) : w.buscar(url, o));
  await assert.rejects(baixar({ base: BASE, chave: CHAVE, buscar: b, codigo: 'BZ-K7M3Q', destino: fs.mkdtempSync(path.join(os.tmpdir(), 'entregas-')) }), /Supabase|endereço/);
});

test('B7: o "baixar" devolve os campos suspeitos para o dono ver antes de abrir a sessão da produção', async () => {
  const a = [{ nome: 'logo.png', tipo_real: 'png', bytes: png() }];
  const w = mundo(a);
  const buscar = async (url, o) => (String(url).startsWith(BASE + '/api/painel?material=') ? Response.json(pacote(a, { suspeitos: ['provas'] })) : w.buscar(url, o));
  const r = await baixar({ base: BASE, chave: CHAVE, buscar, codigo: 'BZ-K7M3Q', destino: fs.mkdtempSync(path.join(os.tmpdir(), 'entregas-')) });
  assert.deepEqual(r.suspeitos, ['provas']);
  assert.deepEqual((await baixar({ base: BASE, chave: CHAVE, buscar: w.buscar, codigo: 'BZ-K7M3Q', destino: fs.mkdtempSync(path.join(os.tmpdir(), 'entregas-')) })).suspeitos, []);
});

test('baixar recusa pasta de destino que não está vazia e nome de arquivo fora do padrão (nada de "../")', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'entregas-')); fs.writeFileSync(path.join(pasta, 'velho.txt'), 'x');
  await assert.rejects(baixar({ base: BASE, chave: CHAVE, buscar: mundo([]).buscar, codigo: 'BZ-K7M3Q', destino: pasta }), /vazia/);
  const mau = mundo([{ nome: '../fuga.png', tipo_real: 'png', bytes: png() }]);
  await assert.rejects(baixar({ base: BASE, chave: CHAVE, buscar: mau.buscar, codigo: 'BZ-K7M3Q', destino: fs.mkdtempSync(path.join(os.tmpdir(), 'entregas-')) }), /nome/);
});

test('importado: POST com o código e o id do cliente; o id fora do formato nem sai; sem a chave, não roda', async () => {
  const visto = [];
  const buscar = async (url, o) => { visto.push({ url: String(url), corpo: JSON.parse(o.body), cab: o.headers }); return Response.json({ ok: true }); };
  assert.deepEqual(await marcarImportado({ base: BASE, chave: CHAVE, buscar, codigo: 'BZ-K7M3Q', cliente: 'c-k7m3qa' }), { ok: true });
  assert.deepEqual(visto[0].corpo, { importado: 'BZ-K7M3Q', cliente: 'c-k7m3qa' });
  await assert.rejects(marcarImportado({ base: BASE, chave: CHAVE, buscar, codigo: 'BZ-K7M3Q', cliente: 'k7m3qa' }), /c-/);
  await assert.rejects(marcarImportado({ base: BASE, chave: 'curta', buscar, codigo: 'BZ-K7M3Q', cliente: 'c-k7m3qa' }), /PAINEL_CHAVE/);
});

test('listar: o próximo comando pronto e os alertas (30 dias sem material, prazo vencido), sem agir', async () => {
  const item = (o) => ({ codigo: 'BZ-K7M3Q', passo: 'material', material_status: 'rascunho', dias_desde_entrada: 3, arquivos: 0, entrega_ate: null, tem_whatsapp: false, ...o });
  assert.equal(proximoComando(item({}), '/repo'), null, 'esperando o cliente enviar');
  assert.match(proximoComando(item({ passo: 'producao', material_status: 'enviado' }), '/repo'), /entregas\.mjs" baixar BZ-K7M3Q --destino/);
  assert.match(proximoComando(item({ passo: 'producao', material_status: 'importado', cliente_captacao: 'c-k7m3qa' }), '/repo'), /previa BZ-K7M3Q <endereço da prévia>/, 'já importado: o próximo é a prévia (3b-3)');
  assert.equal(proximoComando(item({ passo: 'producao', material_status: 'importado' }), '/repo'), null, 'importado mas sem o id da captação: nada a sugerir');
  const trinta = alertasDe(item({ dias_desde_entrada: 31 }));
  assert.equal(trinta.length, 1); assert.match(trinta[0], /^30 dias sem o material e sem autorização: nada é publicado/);
  assert.deepEqual(alertasDe(item({ dias_desde_entrada: 29 })), []);
  const antigo = { prazo_dias: 5, entrega_ate: '2000-01-08', prazo: { conta_desde: '2000-01-01T12:00:00-04:00', pausas: [] } };
  assert.ok(alertasDe(item({ passo: 'producao', material_status: 'enviado', ...antigo }))[0].startsWith('prazo vencido'));
  assert.ok(alertasDe(item({ passo: 'producao', material_status: 'importado', ...antigo }))[0].startsWith('prazo vencido'), 'M9: depois do importado o alerta continua');
  assert.deepEqual(alertasDe(item({ passo: 'producao', material_status: 'enviado', entrega_ate: '2000-01-08' })), [], 'sem o prazo e os dias do prazo, nenhum vencimento é inventado');
  const buscar = async () => Response.json({ entregas: [item({ passo: 'producao', material_status: 'enviado', arquivos: 3 })], total: 1 });
  const linhas = await listar({ base: BASE, chave: CHAVE, buscar, raiz: '/repo' });
  assert.ok(linhas.join('\n').includes('BZ-K7M3Q') && linhas.join('\n').includes('baixar BZ-K7M3Q'));
});
