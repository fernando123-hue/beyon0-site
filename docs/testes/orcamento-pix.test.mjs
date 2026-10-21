/* A ENTRADA POR PIX (PR 3b-1; spec 2026-10-21 §3 e §4): o percentual sai da proposta, sem número de reserva. O módulo
   é JS de navegador (IIFE): roda aqui com um window de mentira e sem document (ele não toca no DOM).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fonte = fs.readFileSync(new URL('../../js/orcamento-pix.js', import.meta.url), 'utf8');
const janela = {};
new Function('window', fonte)(janela);
const P = janela.BZPix;
const reais = v => 'R$ ' + v.toFixed(2);

test('a tela diz o que a proposta cobra: uma a 40 e outra a 50', () => {
  assert.deepEqual(P.percentuais({ valor_total: 3000, sinal_percentual: 40 }), { entrada: 40, restante: 60 });
  assert.equal(P.valorDaEntrada({ valor_total: 3000, sinal_percentual: 40 }), 1200);
  assert.deepEqual(P.percentuais({ valor_total: 3000, sinal_percentual: 50 }), { entrada: 50, restante: 50 });
  assert.equal(P.valorDaEntrada({ valor_total: 3000, sinal_percentual: 50 }), 1500);
  assert.equal(P.valorDaEntrada({ valor_total: 1999.99, sinal_percentual: 33 }), 660, 'arredonda como o banco (round(…, 2))');
  assert.equal(P.valorDaEntrada({ valor_total: 10.05, sinal_percentual: 50 }), 5.03, 'meio centavo: em centavos inteiros, como o banco (em ponto flutuante dava 5,02)');
  assert.equal(P.linhaDoValor(1200, 40, reais), 'R$ 1200.00 · 40% do total, por Pix');
});

test('sem o percentual na proposta, a tela não cobra (falha fechada, nunca 50)', () => {
  for (const pct of [null, undefined, 0, -10, 101, 40.5, '40', NaN]) {
    assert.equal(P.percentuais({ valor_total: 3000, sinal_percentual: pct }), null, String(pct));
    assert.equal(P.valorDaEntrada({ valor_total: 3000, sinal_percentual: pct }), null, String(pct));
  }
  assert.equal(P.percentuais(null), null);
  assert.equal(P.valorDaEntrada({ valor_total: 0, sinal_percentual: 40 }), null, 'total zero também não cobra');
  assert.equal(P.linhaDoValor(1200, null, reais), 'R$ 1200.00, por Pix', 'sem percentual, a linha não inventa um');
});

test('o QR Code: fechado no celular, aberto a partir de 768 px', () => {
  assert.equal(P.qrAbertoEm(390), false);
  assert.equal(P.qrAbertoEm(767), false);
  assert.equal(P.qrAbertoEm(768), true);
  assert.equal(P.qrAbertoEm(1440), true);
});

test('a página não tem mais o 50 de reserva e lê o percentual pelo BZPix', () => {
  const pagina = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8');
  assert.ok(!/sinal_percentual\s*==\s*null\s*\?\s*50/.test(pagina), 'js/orcamento.js ainda cai para 50 quando falta o percentual');
  assert.ok(pagina.includes('var PIX = window.BZPix || null;') && pagina.includes('PIX.percentuais') && pagina.includes('PIX.valorDaEntrada'), 'js/orcamento.js lê o percentual pelo BZPix, com guarda (sem o módulo, não cobra)');
  const html = fs.readFileSync(new URL('../../orcamento.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('js/orcamento-pix.js') > 0 && html.indexOf('js/orcamento-pix.js') < html.indexOf('js/orcamento-pagamento.js'), 'o módulo carrega antes da tela de pagamento');
  assert.ok(!/\b\d{1,3}\s?%/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'nenhum percentual escrito à mão no HTML do orçamento');
});

/* revisão do 3b-1, BAIXO-3: sem a entrada conhecida, o recibo não desenha "0%" nem um restante igual ao total */
test('o recibo só recebe os valores quando a entrada é conhecida', () => {
  const pr = { id: 'p1', valor_total: '3000', sinal_percentual: 40, prazo_dias: 10 };
  assert.deepEqual(P.dadosDoRecibo(pr, 1200), { id: 'p1', total: 3000, sinal: 1200, prazo: 10 });
  assert.equal(P.dadosDoRecibo(pr, null), null, 'sem a entrada: sem valores (só o selo e o título)');
  assert.equal(P.dadosDoRecibo(pr, undefined), null);
  assert.equal(P.dadosDoRecibo(null, 1200), null);
  const pagina = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8');
  assert.ok(pagina.includes('PIX.dadosDoRecibo('), 'js/orcamento.js monta o recibo pelo BZPix');
});
