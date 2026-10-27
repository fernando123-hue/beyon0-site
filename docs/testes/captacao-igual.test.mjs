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

test('captação: o prazo em dias úteis dá a mesma data e o mesmo vencimento (clientes/prazos.mjs, para-o-site.md §6)', opcoes, async () => {
  const { calcularEntregarAte: deles, prazoVencido: vencidoDeles } = await importar('clientes/prazos.mjs');
  const { calcularEntregarAte: nosso, prazoVencido: vencidoNosso } = await import('../../api/_material/prazo.mjs');
  const lerConfig = n => JSON.parse(fs.readFileSync(path.join(PASTA, 'config', n), 'utf8'));
  const entrega = { ...lerConfig('entrega.json'), feriados: lerConfig('feriados.json') };
  const C = fixture('prazo-casos.json');
  const feriados = new Set(C.feriados_nacionais);   /* (a lista dela tem também os móveis e os de Campo Grande: nenhum cai nestas datas) */
  const cliente = c => ({ estado: 'em_producao', prazo: { dias: c.prazo_dias, contagem: 'uteis', pausas: [], novas_datas: [], entregar_ate: null, ...c.prazo } });
  for (const c of C.calcular) {
    assert.equal(nosso(c.prazo, { prazoDias: c.prazo_dias, feriados }, new Date(c.agora)), deles(cliente(c), entrega, new Date(c.agora)), c.nome);
  }
  for (const c of C.vencido) {
    assert.equal(vencidoNosso(c.prazo, { prazoDias: c.prazo_dias, feriados }, new Date(c.agora)), vencidoDeles(cliente(c), entrega, new Date(c.agora)), c.nome);
  }
});

test('captação: o formulario.json que o site monta passa na lerFormulario', opcoes, async () => {
  const { lerFormulario } = await importar('entrega/material.mjs');
  const { montarFormulario } = await import('../../api/_material/pacote.mjs');
  const ex = fixture('formulario-exemplo.json');
  const arquivos = [{ papel: 'logo', ordem: 1, tipo_real: 'png' }, { papel: 'foto', ordem: 1, tipo_real: 'jpg' }, { papel: 'foto', ordem: 2, tipo_real: 'webp' }];
  const { fotos_com_pessoas: _, ...dados } = ex.dados;
  const f = montarFormulario({ material: { dados, autorizacao: { marcada: true, texto: ex.autorizacao.texto, fotos_com_pessoas: 'sim' }, enviado_em: '2026-10-22T13:00:00Z' }, arquivos });
  const lido = lerFormulario(f);
  assert.deepEqual(lido.arquivos, ['logo.png', 'foto-01.jpg', 'foto-02.webp']);
  assert.equal(lido.autorizacao.resposta, 'marcada');
});

test('captação: URL_PREVIA e os limites de dias que não mudaram são os dela (config/entrega.json)', opcoes, async () => {
  const esq = await importar('clientes/esquema.mjs');
  const { URL_PREVIA } = await import('../../api/_entrega/enderecos.mjs');
  const { LIMITES } = await import('../../api/_entrega/alarmes.mjs');
  assert.equal(URL_PREVIA.source, esq.URL_PREVIA.source);
  const cfg = JSON.parse(fs.readFileSync(path.join(PASTA, 'config', 'entrega.json'), 'utf8'));
  assert.deepEqual([LIMITES.material_dias, LIMITES.max_rodadas], [cfg.material_dias, cfg.max_rodadas]);
});

/* 22/10: o dono mudou o restante (3 dias do aviso "no ar", lembretes no 2º e no 3º dia). A captação já aplicou (config/entrega.json: restante_fora_do_ar_dias 3, lembretes_restante [2, 3]): o `todo` do plano foi tirado */
test('captação: o restante em 3 dias e os lembretes do 2º e do 3º dia são os dela (config/entrega.json)', opcoes, async () => {
  const { LIMITES } = await import('../../api/_entrega/alarmes.mjs');
  const cfg = JSON.parse(fs.readFileSync(path.join(PASTA, 'config', 'entrega.json'), 'utf8'));
  assert.equal(LIMITES.restante_dias, cfg.restante_fora_do_ar_dias);
  assert.deepEqual(LIMITES.lembretes_restante, cfg.lembretes_restante);
});
