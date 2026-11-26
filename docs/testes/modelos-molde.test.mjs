/* O molde "X, não Y" entre os três modelos de um cliente (visto na rodada real de 26/11, depois do trilho): cada modelo respeitava o "no
   máximo um" da página, mas dois dos três abriam a mesma ideia ("Feito para a sua festa, não para a vitrine" / "Feito para a sua data,
   não para a vitrine"). O trilho libera o molde para UMA estratégia só; nas outras duas o pedido o proíbe, e o higienizar anota quando
   o modelo o usou mesmo assim. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trilhoDaDirecao, pedidoDoTrilho, titulosNoMolde, ESTRATEGIAS, higienizar } from '../../api/_vendas/direcao.mjs';

const tres = s => Object.keys(ESTRATEGIAS).map(e => trilhoDaDirecao(null, e, s));

test('molde: em 2.000 sementes, exatamente uma das três direções pode usar "X, não Y", e ela não fica sempre na mesma estratégia', () => {
  const onde = new Set();
  for (let k = 0; k < 2000; k++) {
    const t = tres('pedido-' + k);
    assert.equal(t.filter(x => x.contraste === true).length, 1, 'semente ' + k);
    onde.add(t.findIndex(x => x.contraste));
  }
  assert.equal(onde.size, 3);
});

test('molde: o pedido proíbe o molde nas duas direções sem ele e o permite (uma vez) na outra', () => {
  for (const t of tres('pedido-1')) {
    const p = pedidoDoTrilho(t);
    if (t.contraste) assert.match(p, /no máximo um título no molde "X, não Y"/);
    else assert.match(p, /nenhum título no molde "X, não Y"/);
  }
});

test('titulosNoMolde conta os títulos de contraste (vírgula + "não"), sem pegar "não" solto nem texto corrido', () => {
  const d = { secoes: [
    { titulo: 'Feito para a sua festa, não para a vitrine', texto: 'Bolo bom, não congelado.' },
    { titulo: 'Uma oficina, não um catálogo' },
    { titulo: 'Não espere o verão' },
    { titulo: 'Sem pressa e sem atalho' },
    { titulo: 'Começa no desenho — não na serra' }
  ] };
  assert.equal(titulosNoMolde(d), 3);
  assert.equal(titulosNoMolde({}), 0);
  assert.equal(titulosNoMolde(null), 0);
});

test('higienizar: o molde numa direção que não podia usá-lo fica anotado em ajustes; na que podia, não', () => {
  const bruta = { navegacao: { marca: 'M' }, secoes: [{ tipo: 'hero', titulo: 'Doces de verdade' }, { tipo: 'sobre', titulo: 'Feito para a festa, não para a vitrine' }, { tipo: 'cta', titulo: 'c' }] };
  const tip = { titulos: 'serif_classica', texto: 'sans_geometrica' };
  assert.ok(higienizar(bruta, 'conversao', { trilho: { tipografia: tip, contraste: false } }).ajustes.includes('molde_x_nao_y'));
  assert.ok(!higienizar(bruta, 'conversao', { trilho: { tipografia: tip, contraste: true } }).ajustes.includes('molde_x_nao_y'));
  assert.ok(!higienizar(bruta, 'conversao').ajustes.includes('molde_x_nao_y'), 'sem trilho, nada muda');
});

test('fila manual: a identidade fixada diz se a direção pode usar o molde', async () => {
  const { pedidoParaModelo } = await import('../../scripts/direcoes.mjs');
  const id = '11111111-2222-4333-8444-555555555555';
  const p = pedidoParaModelo({ conversa_id: id, briefing: {}, fatores: {}, direcoes: Object.keys(ESTRATEGIAS).map((e, i) => ({ id: 'd' + i, numero: i + 1, estrategia: e, status: 'na_fila' })) });
  assert.equal(p.direcoes.filter(d => d.identidade_fixada.molde_x_nao_y === 'no máximo um título').length, 1);
  assert.equal(p.direcoes.filter(d => d.identidade_fixada.molde_x_nao_y === 'nenhum título').length, 2);
});
