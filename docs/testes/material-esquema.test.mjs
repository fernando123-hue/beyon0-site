/* O ESQUEMA DO MATERIAL (PR 3b-2; spec §3, §6 e §7). Uma fonte só: o mesmo arquivo vale na tela e no servidor.
   Estes testes carregam o módulo DOS DOIS JEITOS (como o navegador e como o servidor) e conferem os limites da spec,
   as regras da captação (docs/testes/fixtures/captacao) e a conferência dos primeiros bytes.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ESQ from '../../js/orcamento-material-esquema.js';
import { tipoPorBytes, BYTES_DO_INICIO } from '../../api/_material/bytes.mjs';

const fonte = fs.readFileSync(new URL('../../js/orcamento-material-esquema.js', import.meta.url), 'utf8');
const lerJson = nome => JSON.parse(fs.readFileSync(new URL('./fixtures/captacao/' + nome, import.meta.url), 'utf8'));

test('o módulo carrega como no navegador (window) e como no servidor (módulo), com a mesma API', () => {
  const janela = {};
  new Function('window', fonte)(janela);
  assert.deepEqual(Object.keys(janela.BZMaterialEsquema).sort(), Object.keys(ESQ).sort());
  assert.ok(!/node:|require\(|import\s/.test(fonte.replace(/\/\*[\s\S]*?\*\//g, '')), 'nada de node: nem import no arquivo do navegador');
});

test('os limites são os da spec §7 (e nenhum outro lugar os repete)', () => {
  const L = ESQ.LIMITES, MB = 1024 * 1024;
  assert.deepEqual([...L.tipos], ['image/png', 'image/jpeg', 'image/webp']);
  assert.deepEqual([L.logo_max, L.logo_bytes, L.fotos_max, L.foto_bytes, L.reservas_max, L.pedido_bytes, L.balde_bytes, L.balde_alarme, L.reserva_horas, L.corpo_bytes],
    [1, 5 * MB, 20, 10 * MB, 30, 150 * MB, 800 * MB, 0.7, 24, 16384]);
  assert.ok(!L.tipos.includes('image/svg+xml'), 'SVG nunca');
});

test('campo a campo: os limites de CAMPOS_DADOS da captação (para-o-site.md §3)', () => {
  const ok = (campo, v) => assert.equal(ESQ.validarCampo(campo, v), true, campo + ' ' + JSON.stringify(v));
  const ruim = (campo, v) => assert.equal(ESQ.validarCampo(campo, v), false, campo + ' ' + JSON.stringify(v));
  ok('whatsapp', '+5567999990001'); ok('whatsapp', '+552133334444'); ruim('whatsapp', '67999990001'); ruim('whatsapp', '+5567999'); ruim('whatsapp', '+55679999900012');
  ok('telefone', '+552133334444'); ruim('telefone', '(21) 3333-4444');
  ok('servicos', [{ nome: 'Ab' }]); ok('servicos', [{ nome: 'Instalação', descricao: 'ok' }]); ruim('servicos', []); ruim('servicos', [{ nome: 'A' }]);
  ruim('servicos', [{ nome: 'A'.repeat(61) }]); ruim('servicos', [{ nome: 'Ab', descricao: 'x'.repeat(141) }]); ruim('servicos', [{ nome: 'Ab', outro: 1 }]);
  ruim('servicos', Array.from({ length: 13 }, () => ({ nome: 'Serviço' }))); ok('servicos', Array.from({ length: 12 }, () => ({ nome: 'Serviço' })));
  ok('horario', [{ dias: 'Seg a sex', horas: '8h às 18h' }]); ruim('horario', [{ dias: 'x', horas: '8h' }]); ruim('horario', Array.from({ length: 8 }, () => ({ dias: 'Seg', horas: '8h' })));
  ok('bairros', ['Centro']); ruim('bairros', ['x']); ruim('bairros', Array.from({ length: 21 }, () => 'Centro'));
  ok('endereco', 'Rua A, 10'); ruim('endereco', 'Rua'); ruim('endereco', 'x'.repeat(121));
  ok('provas', ['garantia']); ruim('provas', ['x']); ruim('provas', Array.from({ length: 5 }, () => 'garantia'));
  ok('depoimentos', [{ texto: 'Muito bom', autor: 'Ana' }]); ruim('depoimentos', [{ texto: 'bom', autor: 'Ana' }]); ruim('depoimentos', Array.from({ length: 4 }, () => ({ texto: 'Muito bom', autor: 'Ana' })));
  ok('cor', '#1a7f5A'); ruim('cor', '#1a7f5'); ruim('cor', '1a7f5a');
  ok('emails', ['a@b.co']); ruim('emails', ['a@b']); ruim('emails', ['a@b.co', 'c@d.co', 'e@f.co']);
  ok('redes', ['https://instagram.com/x']); ruim('redes', Array.from({ length: 5 }, () => 'https://instagram.com/x'));
  ruim('fotos_com_pessoas', true);          /* (não é campo salvo pela tela: sai da resposta à pergunta das fotos) */
  ruim('como_funciona', true);              /* (é do modelo da captação: nunca sai do site) */
  ruim('campo_que_nao_existe', 'x');
});

test('CPF e CNPJ em qualquer campo são recusados', () => {
  assert.equal(ESQ.validarCampo('provas', ['CPF 123.456.789-09']), false);
  assert.equal(ESQ.validarCampo('servicos', [{ nome: 'Serviço', descricao: 'CNPJ 12.345.678/0001-95' }]), false);
  assert.equal(ESQ.validarCampo('bairros', ['12345678909']), false);
  assert.ok(ESQ.validarDados({ provas: ['CPF 123.456.789-09'] }).some(p => /CPF ou CNPJ/.test(p)));
});

test('redes: as mesmas regras de problemaDoLink da captação', () => {
  for (const [link, aceito] of lerJson('redes-casos.json')) assert.equal(ESQ.problemaDoLink(link) === null, aceito, link);
});

test('validarDados aceita o envio de exemplo da captação e recusa campo a mais e lista vazia', () => {
  const ex = lerJson('formulario-exemplo.json');
  assert.deepEqual(ESQ.validarDados(ex.dados), []);
  assert.ok(ESQ.validarDados({ ...ex.dados, apelido: 'x' }).some(p => /campo a mais/.test(p)));
  assert.ok(ESQ.validarDados({ ...ex.dados, bairros: [] }).some(p => /fora do formato/.test(p)), 'lista vazia: o site omite, nunca manda []');
  assert.ok(ESQ.validarDados({ ...ex.dados, como_funciona: true }).some(p => /campo a mais/.test(p)), 'como_funciona nunca sai do site');
  assert.ok(ESQ.validarDados({ ...ex.dados, fotos_com_pessoas: false }).some(p => /fora do formato/.test(p)), 'fotos_com_pessoas só vale true');
});

test('prepararPatch: cada campo vai para o lugar dele; null limpa; o texto da autorização é o da constante, nunca o do cliente', () => {
  const agora = '2026-10-22T09:00:00-04:00';
  assert.deepEqual(ESQ.prepararPatch('whatsapp', '+5567999990001', agora), { ok: true, patch: { dados: { whatsapp: '+5567999990001' } } });
  assert.deepEqual(ESQ.prepararPatch('bairros', null, agora), { ok: true, patch: { dados: { bairros: null } } });
  assert.deepEqual(ESQ.prepararPatch('negocio.uf', 'RJ', agora), { ok: true, patch: { negocio: { uf: 'RJ' } } });
  assert.equal(ESQ.prepararPatch('negocio.uf', 'XX', agora).ok, false);
  assert.equal(ESQ.prepararPatch('negocio.cidade', 'x', agora).ok, false);
  assert.deepEqual(ESQ.prepararPatch('autorizacao.fotos_com_pessoas', 'nao_sei', agora), { ok: true, patch: { autorizacao: { fotos_com_pessoas: 'nao_sei' } } });
  assert.equal(ESQ.prepararPatch('autorizacao.fotos_com_pessoas', 'talvez', agora).ok, false);
  assert.deepEqual(ESQ.prepararPatch('autorizacao.depoimentos_autorizados', true, agora), { ok: true, patch: { autorizacao: { depoimentos_autorizados: true } } });
  const marcar = ESQ.prepararPatch('autorizacao.marcada', true, agora);
  assert.deepEqual(marcar.patch.autorizacao, { marcada: true, texto: ESQ.AUTORIZACAO.texto, versao: ESQ.AUTORIZACAO.versao, marcada_em: agora });
  assert.deepEqual(ESQ.prepararPatch('autorizacao.marcada', false, agora).patch.autorizacao, { marcada: false });
  assert.ok(ESQ.AUTORIZACAO.texto.length >= 5 && ESQ.AUTORIZACAO.texto.length <= 600, 'a captação exige de 5 a 600 caracteres');
  assert.equal(ESQ.prepararPatch('dados', { x: 1 }, agora).ok, false, 'nome de bloco inteiro não é campo');
});

test('faltas: o que ainda impede o envio, com o número do bloco da tela', () => {
  assert.deepEqual(ESQ.faltas({ dados: {}, autorizacao: {} }), [{ bloco: 2, texto: 'o WhatsApp dos botões' }, { bloco: 4, texto: 'o estado do negócio' }, { bloco: 6, texto: 'marcar a autorização' }]);
  assert.deepEqual(ESQ.faltas({ dados: { whatsapp: '+5567999990001' }, negocio: { uf: 'MS' }, autorizacao: { marcada: true } }), []);
  /* A2 (revisão): sem a UF o pacote não monta (montarPedido recusa), então ela é obrigatória como o WhatsApp */
  assert.deepEqual(ESQ.faltas({ dados: { whatsapp: '+5567999990001' }, negocio: {}, autorizacao: { marcada: true } }), [{ bloco: 4, texto: 'o estado do negócio' }]);
  assert.deepEqual(ESQ.faltas({ dados: { whatsapp: '+5567999990001' }, negocio: { uf: 'XX' }, autorizacao: { marcada: true } }), [{ bloco: 4, texto: 'o estado do negócio' }], 'UF que não existe não vale');
});

test('a conferência de bytes: PNG, JPEG e WebP passam; SVG, HTML e tamanho curto não', () => {
  const casos = lerJson('bytes-casos.json');
  for (const c of casos) {
    const u8 = Uint8Array.from(Buffer.from(c.hex, 'hex')).subarray(0, BYTES_DO_INICIO);
    assert.equal(tipoPorBytes(u8), c.site, c.nome);
  }
  assert.equal(tipoPorBytes('texto'), null);
  assert.equal(BYTES_DO_INICIO, 16);
  assert.equal(ESQ.tipoDoMime('image/jpeg'), 'jpg');
  assert.equal(ESQ.tipoDoMime('image/svg+xml'), null);
});

test('telefoneE164: o telefone como se digita vira +55 com DDD; sem DDD ou curto demais dá null', () => {
  assert.equal(ESQ.telefoneE164('(21) 99999-0001'), '+5521999990001');
  assert.equal(ESQ.telefoneE164('+55 21 3333-4444'), '+552133334444');
  assert.equal(ESQ.telefoneE164('5521999990001'), '+5521999990001');
  assert.equal(ESQ.telefoneE164('99999-0001'), null);
  assert.equal(ESQ.telefoneE164(null), null);
});
