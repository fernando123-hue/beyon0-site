/* O PACOTE VERSÃO 1 (PR 3b-2; spec §6; revisão da captação I1 e I3): pedido.json e formulario.json no formato que a
   captação aceita. Lista vazia = campo omitido (a captação exige ao menos 1 item); campo fora da lista nunca sai;
   depoimentos e fotos_com_pessoas só com o "sim" da pergunta; os nomes dos arquivos saem do papel, da ordem e do tipo.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nomesDosArquivos, podarDados, montarFormulario, montarPedido, ramoDe, RAMOS, PLANOS, telefoneE164 } from '../../api/_material/pacote.mjs';
import { NOME_RAMO } from '../../api/_vendas/catalogo.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

const EX = JSON.parse(fs.readFileSync(new URL('./fixtures/captacao/formulario-exemplo.json', import.meta.url), 'utf8'));
const ARQ = [
  { id: 'a2', papel: 'foto', ordem: 2, tipo_real: 'webp' }, { id: 'a1', papel: 'foto', ordem: 1, tipo_real: 'jpg' }, { id: 'l', papel: 'logo', ordem: 1, tipo_real: 'png' }
];
const DADOS = { ...EX.dados }; delete DADOS.fotos_com_pessoas;
const AUT = { marcada: true, texto: ESQ.AUTORIZACAO.texto, versao: ESQ.AUTORIZACAO.versao, fotos_com_pessoas: 'sim' };
const MATERIAL = { dados: DADOS, autorizacao: AUT, enviado_em: '2026-10-22T13:00:00+00:00' };

test('nomes: logo primeiro, fotos na ordem do cliente, extensão pelo tipo conferido (jpg, nunca jpeg)', () => {
  assert.deepEqual(nomesDosArquivos(ARQ).map(a => a.nome), ['logo.png', 'foto-01.jpg', 'foto-02.webp']);
  assert.deepEqual(nomesDosArquivos([]).map(a => a.nome), []);
});

test('o formulário sai igual ao exemplo que a captação aceita (enviado_em em -04:00)', () => {
  const f = montarFormulario({ material: MATERIAL, arquivos: ARQ });
  assert.deepEqual(f, EX);
  assert.deepEqual(Object.keys(f), ['versao', 'enviado_em', 'autorizacao', 'dados', 'arquivos']);
  assert.match(f.enviado_em, /-04:00$/);
});

test('lista vazia e texto vazio nunca saem; campo fora da lista nunca sai', () => {
  const p = podarDados({ ...DADOS, bairros: [], endereco: '', telefone: undefined, apelido: 'x', como_funciona: true }, AUT);
  assert.ok(!('bairros' in p) && !('endereco' in p) && !('telefone' in p) && !('apelido' in p) && !('como_funciona' in p), JSON.stringify(p));
  assert.ok(Object.values(p).every(v => !Array.isArray(v) || v.length >= 1), 'nenhuma lista vazia');
});

test('depoimentos só com o "sim" da pergunta deles; fotos_com_pessoas só com "Sim" nas fotos', () => {
  const dep = { depoimentos: [{ texto: 'Muito bom', autor: 'Ana' }] };
  assert.ok(!('depoimentos' in podarDados({ ...DADOS, ...dep }, { ...AUT, depoimentos_autorizados: false })));
  assert.ok(!('depoimentos' in podarDados({ ...DADOS, ...dep }, { ...AUT })));
  assert.deepEqual(podarDados({ ...DADOS, ...dep }, { ...AUT, depoimentos_autorizados: true }).depoimentos, dep.depoimentos);
  for (const r of ['nao_tem', 'nao_sei', undefined]) assert.ok(!('fotos_com_pessoas' in podarDados(DADOS, { ...AUT, fotos_com_pessoas: r })), String(r));
  assert.equal(podarDados(DADOS, { ...AUT, fotos_com_pessoas: 'sim' }).fotos_com_pessoas, true);
});

test('o formulário recusa o que a captação recusaria (sem caixa marcada, CPF, link ruim)', () => {
  assert.throws(() => montarFormulario({ material: { ...MATERIAL, autorizacao: { ...AUT, marcada: false } }, arquivos: ARQ }), /autoriza/i);
  assert.throws(() => montarFormulario({ material: { ...MATERIAL, dados: { ...DADOS, provas: ['CPF 123.456.789-09'] } }, arquivos: ARQ }), /CPF/);
  assert.throws(() => montarFormulario({ material: { ...MATERIAL, dados: { ...DADOS, redes: ['http://x.com'] } }, arquivos: ARQ }), /redes/);
  assert.throws(() => montarFormulario({ material: { ...MATERIAL, dados: { ...DADOS, whatsapp: undefined } }, arquivos: ARQ }), /whatsapp/i);
});

const PEDIDO = {
  codigo: 'BZ-K7M3Q',
  negocio: { nome: 'Clínica Sol', segmento: 'serviços', cidade: 'Niterói', uf: 'RJ' },
  proposta: { formato: 'institucional', valor_total: 3000, sinal_percentual: 40, prazo_dias: 8, aceita_em: '2026-10-20T15:00:00+00:00', escopo: 'Escopo confirmado pelo cliente.' },
  entradaPagaEm: '2026-10-21T13:30:00+00:00',
  whatsappContato: '(21) 99999-0001'
};

test('pedido.json v1 (contrato da captação de 21/10): valores preco/entrada/final, prazo da proposta em dias úteis, whatsapp, datas em -04:00', () => {
  const p = montarPedido(PEDIDO);
  assert.deepEqual(p, {
    versao: 1, codigo: 'BZ-K7M3Q',
    negocio: { nome_exibicao: 'Clínica Sol', tipo_exibicao: 'serviços', cidade: 'Niterói', uf: 'RJ', saude: false },
    plano: 'institucional',
    valores: { preco: 3000, entrada: 1200, final: 1800 },
    prazo: { dias: 8, contagem: 'uteis' },
    aceite: { em: '2026-10-20T11:00:00-04:00', texto: 'Escopo confirmado pelo cliente.' },
    entrada_paga_em: '2026-10-21T09:30:00-04:00',
    whatsapp: '+5521999990001'
  });
});

test('negocio: sem ramo da lista da captação vai "saude: false" explícito, nunca "ramo: null"; cliente de saúde é produção manual (captação, 21/10)', () => {
  const sem = montarPedido({ ...PEDIDO, negocio: { ...PEDIDO.negocio, segmento: 'comércio' } });
  assert.equal(sem.negocio.saude, false); assert.ok(!('ramo' in sem.negocio));
  assert.throws(() => montarPedido({ ...PEDIDO, negocio: { ...PEDIDO.negocio, segmento: 'saúde' } }), /saúde.*produção manual/);
});

test('pedido.json: sem UF, nome ou cidade o pacote não sai e diz o que falta; formato sem esteira é recusado', () => {
  assert.throws(() => montarPedido({ ...PEDIDO, negocio: { ...PEDIDO.negocio, uf: '' } }), /uf/i);
  assert.throws(() => montarPedido({ ...PEDIDO, negocio: { ...PEDIDO.negocio, nome: '' } }), /nome/i);
  assert.throws(() => montarPedido({ ...PEDIDO, proposta: { ...PEDIDO.proposta, formato: 'loja_plataforma' } }), /produção manual/);
  assert.throws(() => montarPedido({ ...PEDIDO, whatsappContato: '123' }), /WhatsApp/i);
  assert.throws(() => montarPedido({ ...PEDIDO, proposta: { ...PEDIDO.proposta, sinal_percentual: null } }), /entrada/i);
  assert.deepEqual(PLANOS, { landing_page: 'landing', institucional: 'institucional' });
});

test('prazo: o da proposta aceita, de 5 a 10 dias úteis; fora disso é produção manual', () => {
  for (const dias of [5, 10]) assert.deepEqual(montarPedido({ ...PEDIDO, proposta: { ...PEDIDO.proposta, prazo_dias: dias } }).prazo, { dias, contagem: 'uteis' });
  for (const dias of [4, 11, 0.5, null, '8']) assert.throws(() => montarPedido({ ...PEDIDO, proposta: { ...PEDIDO.proposta, prazo_dias: dias } }), /prazo.*produção manual/, String(dias));
});

test('valores em reais inteiros: preco = entrada + final; total ou entrada com centavos é produção manual (a captação só aceita inteiros)', () => {
  const p = montarPedido({ ...PEDIDO, proposta: { ...PEDIDO.proposta, valor_total: 1990, sinal_percentual: 40 } });
  assert.deepEqual(p.valores, { preco: 1990, entrada: 796, final: 1194 });
  assert.equal(p.valores.entrada + p.valores.final, p.valores.preco);
  assert.throws(() => montarPedido({ ...PEDIDO, proposta: { ...PEDIDO.proposta, valor_total: 1999.99 } }), /reais inteiros/);
  assert.throws(() => montarPedido({ ...PEDIDO, proposta: { ...PEDIDO.proposta, valor_total: 1999, sinal_percentual: 40 } }), /centavos/);
});
test('o mapa de ramos cobre todo ramo do orçamento; saúde vai saude:true; ramo livre vai null', () => {
  for (const nome of Object.values(NOME_RAMO).filter(n => n !== 'outro')) assert.ok(Object.hasOwn(RAMOS, nome), 'ramo sem par no mapa: ' + nome);
  assert.deepEqual(ramoDe('saúde'), { ramo: null, saude: true });
  assert.deepEqual(ramoDe('comércio'), { ramo: null, saude: false });
  assert.deepEqual(ramoDe('Oficina de bicicletas'), { ramo: null, saude: false });
  assert.deepEqual(ramoDe(undefined), { ramo: null, saude: false });
});

test('telefoneE164: +55 com DDD, de 10 ou 11 dígitos; o que não for isso dá null', () => {
  assert.equal(telefoneE164('(21) 99999-0001'), '+5521999990001');
  assert.equal(telefoneE164('+55 21 3333-4444'), '+552133334444');
  assert.equal(telefoneE164('5521999990001'), '+5521999990001');
  assert.equal(telefoneE164('99999-0001'), null);
  assert.equal(telefoneE164(null), null);
});

test('nenhum campo do pacote leva CPF ou CNPJ, e o pedido.json não tem dado a mais', () => {
  assert.ok(!ESQ.CPF_CNPJ.test(JSON.stringify(montarPedido(PEDIDO))));
  assert.deepEqual(Object.keys(montarPedido(PEDIDO)), ['versao', 'codigo', 'negocio', 'plano', 'valores', 'prazo', 'aceite', 'entrada_paga_em', 'whatsapp']);
});
