/* O SITE E A CAPTAÇÃO DIZEM O MESMO (PR 3b-2; spec §6, §12 e revisão da captação): as regras do formulário, a conferência
   de bytes e (Task 3) o prazo. Com a pasta da captação ao lado, o teste importa o código DELA e compara; sem ela, ele
   pula COM AVISO (as fixtures de docs/testes/fixtures/captacao continuam valendo nos outros testes). A pasta é só lida.
   BZ_CAPTACAO muda o caminho.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ESQ from '../../js/orcamento-material-esquema.js';
import { tipoPorBytes } from '../../api/_material/bytes.mjs';

const PASTA = process.env.BZ_CAPTACAO || path.resolve(import.meta.dirname, '../../../captacao');
const TEM = fs.existsSync(path.join(PASTA, 'entrega', 'material.mjs'));
const fixture = n => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'captacao', n), 'utf8'));
const importar = async rel => import(pathToFileURL(path.join(PASTA, rel)).href);
const opcoes = { skip: TEM ? false : 'pasta da captação não encontrada (' + PASTA + '): igualdade NÃO conferida' };

test('captação: o envio de exemplo passa na lerFormulario e no validarDados do site', opcoes, async () => {
  const { lerFormulario } = await importar('entrega/material.mjs');
  const ex = fixture('formulario-exemplo.json');
  assert.doesNotThrow(() => lerFormulario(ex));
  assert.deepEqual(ESQ.validarDados(ex.dados), []);
});

test('captação: o mesmo veredito campo a campo (valores bons e ruins)', opcoes, async () => {
  const { validarDadosMaterial } = await importar('entrega/material.mjs');
  const casos = [
    { whatsapp: '+5567999990001' }, { whatsapp: '67999990001' }, { telefone: '+552133334444' },
    { servicos: [{ nome: 'Ab' }] }, { servicos: [] }, { servicos: [{ nome: 'A' }] }, { horario: [{ dias: 'Seg a sex', horas: '8h às 18h' }] },
    { bairros: ['Centro'] }, { bairros: ['x'] }, { endereco: 'Rua A, 10' }, { endereco: 'Rua' }, { provas: ['garantia'] }, { provas: ['x'] },
    { depoimentos: [{ texto: 'Muito bom', autor: 'Ana' }] }, { depoimentos: [{ texto: 'bom', autor: 'Ana' }] },
    { cor: '#1a7f5a' }, { cor: '1a7f5a' }, { emails: ['a@b.co'] }, { emails: ['a@b'] }, { redes: ['https://instagram.com/x'] }, { redes: ['http://x.com'] },
    { provas: ['CPF 123.456.789-09'] }, { fotos_com_pessoas: true }, { fotos_com_pessoas: false }, { como_funciona: true }, { inventado: 1 }
  ];
  for (const d of casos) {
    const captacao = validarDadosMaterial(d).length === 0;
    const site = ESQ.validarDados(d).length === 0;
    if (Object.hasOwn(d, 'como_funciona')) { assert.equal(captacao, true, 'a captação aceita como_funciona'); assert.equal(site, false, 'o site nunca o manda'); continue; }
    assert.equal(site, captacao, JSON.stringify(d));
  }
});

test('captação: os links de redes, o CPF_CNPJ e o alfabeto do id de cliente', opcoes, async () => {
  const { problemaDoLink } = await importar('entrega/material.mjs');
  for (const [link] of fixture('redes-casos.json')) assert.equal(ESQ.problemaDoLink(link) === null, problemaDoLink(link) === null, link);
  const esq = await importar('clientes/esquema.mjs');
  assert.equal(ESQ.CPF_CNPJ.source, esq.CPF_CNPJ.source);
  assert.equal(ESQ.ALFABETO_ID, esq.ALFABETO_ID);
  assert.equal(ESQ.ID_CLIENTE.source, esq.ID_CLIENTE.source);
});

test('captação: tipoPorBytes lado a lado (PNG, JPEG e WebP iguais; SVG o Worker não vê)', opcoes, async () => {
  const { tipoPorBytes: deles } = await importar('entrega/imagens.mjs');
  for (const c of fixture('bytes-casos.json')) {
    const b = Buffer.from(c.hex, 'hex');
    assert.equal(deles(b), c.captacao, c.nome + ' (captação)');
    assert.equal(tipoPorBytes(Uint8Array.from(b)), c.site, c.nome + ' (site)');
    if (c.captacao !== 'svg') assert.equal(tipoPorBytes(Uint8Array.from(b)), deles(b), c.nome + ': iguais');
  }
});
