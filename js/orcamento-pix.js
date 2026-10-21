/* ==========================================================================
   A ENTRADA POR PIX na página /orcamento (PR 3b-1; spec 2026-10-21 §3 e §4):
   as contas e as decisões que a tela tira da proposta, sem DOM (testadas em
   docs/testes/orcamento-pix.test.mjs).
   • O percentual da entrada vem SEMPRE da proposta (sinal_percentual, inteiro
     de 1 a 100). Sem ele, a tela não cobra: nada de número de reserva (era 50).
     É a mesma falha fechada do banco (pagamentos_iniciar_tentativa, 23514).
   • O QR Code fica em "Pagar por outro aparelho": fechado no celular, aberto a
     partir de 768 px (no computador, o QR é o caminho natural).
   Uso: window.BZPix.percentuais(proposta), .valorDaEntrada(proposta),
        .linhaDoValor(valor, pct, dinheiro), .qrAbertoEm(largura)
   ========================================================================== */
(function () {
  'use strict';
  var QR_ABERTO_DESDE_PX = 768;
  function percentuais(pr) {
    var p = pr ? pr.sinal_percentual : null;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 100) return null;
    return { entrada: p, restante: 100 - p };
  }
  /* a mesma conta do banco, round(total × pct / 100, 2), feita em CENTAVOS inteiros: em ponto flutuante, 10,05 × 50
     dava 502,4999… e virava 5,02 (o banco dá 5,03) */
  function valorDaEntrada(pr) {
    var pc = percentuais(pr), total = pr ? Number(pr.valor_total) : NaN;
    if (!pc || !(total > 0)) return null;
    return Math.round(Math.round(total * 100) * pc.entrada / 100) / 100;
  }
  function linhaDoValor(valor, pct, dinheiro) {
    return dinheiro(valor) + (pct ? ' · ' + pct + '% do total, por Pix' : ', por Pix');
  }
  function qrAbertoEm(larguraPx) { return Number(larguraPx) >= QR_ABERTO_DESDE_PX; }
  window.BZPix = { percentuais: percentuais, valorDaEntrada: valorDaEntrada, linhaDoValor: linhaDoValor, qrAbertoEm: qrAbertoEm };
})();
