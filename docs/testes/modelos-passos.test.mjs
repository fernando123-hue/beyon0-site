/* O passo a passo entre os três modelos de um cliente (achado 3 da rodada com IA real em 8 ramos, 27/11): as 24 direções saíram TODAS
   com a seção "processo" (ou a variante linha_do_tempo, que o desenhista também desenha como passos), e a 2ª e a 3ª repetiam os mesmos
   passos ("busca, banho com fotos, tosa, volta"): o cliente via três vezes a mesma página com outra roupa, e a de conversão saía com a
   mesma sequência de seções nos 8 ramos. O trilho libera o passo a passo para UMA estratégia só (sorteio próprio pela semente); nas outras
   duas o pedido o proíbe e o higienizar anota quando o modelo o usou mesmo assim. Mesmo desenho do molde "X, não Y". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trilhoDaDirecao, pedidoDoTrilho, secoesDePassos, ESTRATEGIAS, higienizar } from '../../api/_vendas/direcao.mjs';

const tres = s => Object.keys(ESTRATEGIAS).map(e => trilhoDaDirecao(null, e, s));

test('passos: em 2.000 sementes, exatamente uma das três direções pode ter o passo a passo, e ela não fica sempre na mesma estratégia', () => {
  const onde = [0, 0, 0];
  for (let k = 0; k < 2000; k++) {
    const t = tres('pedido-' + k);
    assert.equal(t.filter(x => x.passos === true).length, 1, 'semente ' + k);
    onde[t.findIndex(x => x.passos)]++;
  }
  for (const n of onde) assert.ok(n > 560 && n < 780, 'repartição ' + onde.join('/') + ' (esperado ~667 cada)');
});

test('passos: independe do molde "X, não Y" (sorteio próprio; se caíssem sempre juntos, um modelo ficaria com os dois recursos)', () => {
  let juntos = 0, total = 0;
  for (let k = 0; k < 6000; k++) for (const t of tres('pedido-' + k)) if (t.passos) { total++; if (t.contraste) juntos++; }
  const p = juntos / total;
  assert.ok(p > 0.29 && p < 0.38, 'P(molde | passos) = ' + p.toFixed(3) + ' (esperado ~0,33)');
});

test('passos: o pedido proíbe a seção processo e a linha do tempo nas duas direções sem o passo a passo e o permite na outra', () => {
  for (const t of tres('pedido-1')) {
    const p = pedidoDoTrilho(t);
    if (t.passos) assert.match(p, /pode ter UMA seção "processo"/);
    else {
      assert.match(p, /sem seção "processo" e sem a variante "linha_do_tempo"/);
      assert.match(p, /outro modelo do cliente mostra o passo a passo/);
    }
  }
});

test('secoesDePassos conta a seção processo e qualquer seção em linha_do_tempo; nada mais', () => {
  const d = { secoes: [
    { tipo: 'hero', variante: 'split' }, { tipo: 'processo', variante: 'lista' }, { tipo: 'sobre', variante: 'linha_do_tempo' },
    { tipo: 'servicos', variante: 'cartoes' }, { tipo: 'cta', variante: 'centro' }
  ] };
  assert.equal(secoesDePassos(d), 2);
  assert.equal(secoesDePassos({ secoes: [{ tipo: 'servicos' }] }), 0);
  assert.equal(secoesDePassos({}), 0);
  assert.equal(secoesDePassos(null), 0);
  assert.equal(secoesDePassos({ secoes: [null, 'x', { tipo: 1 }] }), 0);
});

test('higienizar: passo a passo numa direção que não podia fica anotado em ajustes; na que podia, não; sem trilho, nada muda', () => {
  const bruta = { navegacao: { marca: 'M' }, secoes: [{ tipo: 'hero', titulo: 'Doces de verdade' }, { tipo: 'processo', titulo: 'Como funciona', itens: [{ titulo: 'a', texto: 'b' }] }, { tipo: 'cta', titulo: 'c' }] };
  const tip = { titulos: 'serif_classica', texto: 'sans_geometrica' };
  assert.ok(higienizar(bruta, 'conversao', { trilho: { tipografia: tip, passos: false } }).ajustes.includes('passos_fora_do_trilho'));
  assert.ok(!higienizar(bruta, 'conversao', { trilho: { tipografia: tip, passos: true } }).ajustes.includes('passos_fora_do_trilho'));
  assert.ok(!higienizar(bruta, 'conversao').ajustes.includes('passos_fora_do_trilho'), 'sem trilho');
  const semPassos = { ...bruta, secoes: [bruta.secoes[0], { tipo: 'sobre', titulo: 'Quem faz' }, bruta.secoes[2]] };
  assert.ok(!higienizar(semPassos, 'conversao', { trilho: { tipografia: tip, passos: false } }).ajustes.includes('passos_fora_do_trilho'));
});

test('fila manual: a identidade fixada diz se a direção pode ter o passo a passo', async () => {
  const { pedidoParaModelo } = await import('../../scripts/direcoes.mjs');
  const id = '11111111-2222-4333-8444-555555555555';
  const p = pedidoParaModelo({ conversa_id: id, briefing: {}, fatores: {}, direcoes: Object.keys(ESTRATEGIAS).map((e, i) => ({ id: 'd' + i, numero: i + 1, estrategia: e, status: 'na_fila' })) });
  assert.equal(p.direcoes.filter(d => d.identidade_fixada.passo_a_passo === 'uma seção processo, se servir').length, 1);
  assert.equal(p.direcoes.filter(d => d.identidade_fixada.passo_a_passo === 'nenhum (sem processo e sem linha_do_tempo)').length, 2);
});

/* pedidos das revisões do PR (técnica e segurança, 27/11) */
test('passos: trilho antigo, sem a chave passos (direção já gravada, reserva), não ganha frase nenhuma nem anotação', () => {
  const antigo = { tipografia: { titulos: 'serif_classica', texto: 'sans_geometrica' }, tema: 'claro', temperatura: 'fria', contraste: false };
  const p = pedidoDoTrilho(antigo);
  assert.doesNotMatch(p, /processo|linha_do_tempo|passo a passo/);
  const bruta = { navegacao: { marca: 'M' }, secoes: [{ tipo: 'hero', titulo: 'a' }, { tipo: 'processo', titulo: 'b', itens: [{ titulo: 'x', texto: 'y' }] }, { tipo: 'cta', titulo: 'c' }] };
  assert.ok(!higienizar(bruta, 'conversao', { trilho: antigo }).ajustes.includes('passos_fora_do_trilho'));
});

test('higienizar: uma seção de outro tipo na variante linha_do_tempo também conta como passo a passo fora do trilho', () => {
  const tip = { titulos: 'serif_classica', texto: 'sans_geometrica' };
  const bruta = { navegacao: { marca: 'M' }, secoes: [{ tipo: 'hero', titulo: 'a' }, { tipo: 'sobre', variante: 'linha_do_tempo', titulo: 'Nossa história', itens: [{ titulo: '2010', texto: 'abrimos' }] }, { tipo: 'cta', titulo: 'c' }] };
  assert.ok(higienizar(bruta, 'experiencia', { trilho: { tipografia: tip, passos: false } }).ajustes.includes('passos_fora_do_trilho'));
});

test('passos: independe do tema escuro (o modelo escuro não leva sempre o passo a passo)', () => {
  let comPassos = 0, escuro = 0;
  for (let k = 0; k < 6000; k++) for (const t of tres('pedido-' + k)) if (t.passos) { comPassos++; if (t.tema === 'escuro') escuro++; }
  const p = escuro / comPassos;
  assert.ok(p > 0.29 && p < 0.38, 'P(escuro | passos) = ' + p.toFixed(3) + ' (esperado ~0,33)');
});
