/* Mapa vivo v2, FASE 4, parte 2 (servidor): a coerência que o ESTADO devolve. O servidor confere de novo (revisão de segurança do #289): a tela
   nunca manda o palpite; ele sai daqui, só do ramo que a pessoa TOCOU (fluxo_toques: texto livre sem toque não grava ramo, aceite 4) contra o
   que ela escreveu nas mensagens dela. npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerenciaDaConversa } from '../../api/_vendas/coerencia.mjs';

const visitante = conteudo => ({ papel: 'visitante', conteudo });
const agente = conteudo => ({ papel: 'agente', conteudo });
const tocou = ramo => ({ fluxo_conversa: true, fluxo_toques: { ramo } });

test('ramo tocado saúde + mensagem de padaria: devolve o palpite e os dois nomes, da tabela', () => {
  const r = coerenciaDaConversa(tocou('saude'), [visitante('tenho uma padaria no centro, fazemos pão e bolo todo dia')]);
  assert.deepEqual(r, { palpite: 'alimentacao', nome: 'Alimentação', tocado: 'Saúde' });
});

test('coerente, sem ramo tocado, ramo "outro" ou sem mensagem da pessoa: null', () => {
  assert.equal(coerenciaDaConversa(tocou('alimentacao'), [visitante('tenho uma padaria no centro, fazemos pão e bolo')]), null);
  assert.equal(coerenciaDaConversa({ fluxo_conversa: true }, [visitante('tenho uma padaria no centro, fazemos pão e bolo')]), null);
  assert.equal(coerenciaDaConversa({ fluxo_conversa: true, ramo: 'saude' }, [visitante('tenho uma padaria no centro, fazemos pão')]), null, 'ramo sem toque não vale');
  assert.equal(coerenciaDaConversa(tocou('outro'), [visitante('tenho uma padaria no centro, fazemos pão e bolo')]), null);
  assert.equal(coerenciaDaConversa(tocou('saude'), []), null);
  assert.equal(coerenciaDaConversa(tocou('saude'), [agente('Uma padaria? Que bom, conte mais sobre o negócio.')]), null, 'fala do Zero não conta');
});

test('só as falas da pessoa contam, juntas, e cada uma fecha a sua oração', () => {
  const r = coerenciaDaConversa(tocou('educacao'), [visitante('oi, tudo bem?'), agente('Tudo! Me conta do negócio.'), visitante('barbearia com 3 cadeiras')]);
  assert.equal(r && r.palpite, 'beleza');
  /* "não é" na 1ª mensagem não nega a palavra da 2ª */
  const r2 = coerenciaDaConversa(tocou('saude'), [visitante('não é'), visitante('padaria do bairro, pão e bolo todo dia')]);
  assert.equal(r2 && r2.palpite, 'alimentacao');
});

test('nunca lança, e nada do texto da pessoa sai no retorno', () => {
  for (const b of [null, undefined, 'x', [], { fluxo_toques: 'saude' }, { fluxo_toques: { ramo: '__proto__' } }]) {
    for (const m of [null, undefined, 'x', [null], [{ papel: 'visitante', conteudo: 42 }], [visitante('<b>padaria</b> pão e bolo todo dia no centro')]]) {
      const r = coerenciaDaConversa(b, m);
      assert.ok(r === null || (typeof r === 'object' && !JSON.stringify(r).includes('<')));
    }
  }
});
