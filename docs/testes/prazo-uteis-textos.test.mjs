/* O PRAZO DE ENTREGA É EM DIAS ÚTEIS no que o orçamento diz (decisão do dono de 21/10, que revê a de 09/10): contrato, consultor,
   recibo, resumo e a pergunta "Quando fica pronto?". Prazo que não é de entrega (desistência 7 dias, 30 dias sem material, 10 dias
   sem o restante, teste de 10 dias do atendente) segue em dias corridos.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
const SUPERFICIES = ['api/_vendas/escopo.mjs', 'api/_vendas/consultor.mjs', 'api/_vendas/agente.mjs', 'js/orcamento.js', 'js/orcamento-recibo.js', 'orcamento.html'];
const OUTRO_PRAZO = /atendente|teste gr[aá]tis|desist|restante|sai do ar|30 dias|7 dias|10 dias sem/i;

test('nenhum prazo de ENTREGA diz "dias corridos" nas telas e textos do orçamento', () => {
  for (const f of SUPERFICIES) {
    const t = semComentario(ler(f));
    for (const m of t.matchAll(/dias? corridos?/gi)) {
      const contexto = t.slice(Math.max(0, m.index - 220), m.index + 60);
      assert.ok(OUTRO_PRAZO.test(contexto), f + ': "dias corridos" num prazo de entrega: ...' + contexto.slice(-120).replace(/\s+/g, ' '));
    }
  }
});

test('o contrato diz "dias úteis, contados do sinal pago e do material recebido" (a mesma regra do consultor e da tela)', () => {
  const e = semComentario(ler('api/_vendas/escopo.mjs'));
  assert.match(e, /' dias úteis, contados do sinal pago e do material recebido\.'/);
  assert.match(e, /dias úteis' \+ \(estimativa\.fase_seguinte\.fases > 1/, 'a fase seguinte também');
  const c = semComentario(ler('api/_vendas/consultor.mjs'));
  assert.match(c, /dias úteis depois do sinal pago e do material recebido/);
  assert.match(c, /dias úteis, contados do sinal pago e do material recebido/);
});

test('o recibo, o resumo e o agente escrevem "dia útil" / "dias úteis"', () => {
  assert.match(ler('js/orcamento-recibo.js'), /' dia útil' : ' dias úteis'/);
  assert.match(ler('js/orcamento.js'), /' dia útil' : ' dias úteis'/);
  assert.match(ler('api/_vendas/agente.mjs'), /' dia útil' : ' dias úteis'/);
});

test('"Quando fica pronto?": dias úteis, e as outras regras do lançamento (30 dias sem material) intactas', () => {
  const h = semComentario(ler('orcamento.html')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(h.includes('O prazo está no resumo do seu pedido, em dias úteis, contados do pagamento da entrada e do envio do seu material. Se o material não chegar em 30 dias, o site sai com as imagens do modelo.'), h.slice(h.indexOf('O prazo está'), h.indexOf('O prazo está') + 240));
});
