/* ==========================================================================
   O NÚMERO DO RESUMO (remodelação do orçamento, 18/11, direção B, parte 3; dono: "as pessoas não gostam de ler").
   No topo do "Resumo do que será feito" mora um cartão com UM número grande (o investimento total), a entrada para
   destravar o site e o prazo. É só o que a proposta já diz: nada é calculado de cabeça nem inventado. O texto do escopo
   segue inteiro e à vista logo abaixo (é ele que a pessoa confirma). A entrada vem da mesma conta do banco (BZPix.valorDaEntrada);
   sem percentual na proposta, a entrada some e a tela não chuta valor. Tudo por textContent.
   Um módulo só, para a tela e para o teste (docs/testes/orcamento-resumo.test.mjs). ES5 sintático (var, function).
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcResumo = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function diasUteis(n) {
    if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '';
    return n + (n === 1 ? ' dia útil' : ' dias úteis');
  }

  /* os fatos do cartão a partir da proposta. pix: o BZPix (ou null); dinheiro: o formatador da página.
     null = sem total válido (o cartão fica escondido) */
  function fatos(pr, pix, dinheiro) {
    if (!pr || typeof pr.valor_total !== 'number' || !isFinite(pr.valor_total) || pr.valor_total <= 0) return null;
    var pct = pix && pix.percentuais ? pix.percentuais(pr) : null;
    var entrada = pix && pix.valorDaEntrada ? pix.valorDaEntrada(pr) : null;
    return {
      total: dinheiro(pr.valor_total),
      entrada: entrada == null ? '' : dinheiro(entrada),
      pct: pct ? pct.entrada : null,
      prazo: diasUteis(pr.prazo_dias)
    };
  }

  function por(doc, id) { return doc && doc.getElementById ? doc.getElementById(id) : null; }
  function texto(doc, id, valor) { var el = por(doc, id); if (el) el.textContent = valor; }
  function mostrar(doc, id, sim) { var el = por(doc, id); if (el) el.hidden = !sim; }

  function pintar(doc, f) {
    if (!doc) return;
    mostrar(doc, 'o-esc-numero', !!f);
    texto(doc, 'o-esc-total', f ? f.total : '');
    texto(doc, 'o-esc-entrada', f ? f.entrada : '');
    texto(doc, 'o-esc-prazo', f ? f.prazo : '');
    mostrar(doc, 'o-esc-entrada-caixa', !!(f && f.entrada));
    mostrar(doc, 'o-esc-prazo-caixa', !!(f && f.prazo));
  }

  /* a tela chama isto com a proposta; o formatador é o da própria página */
  function atualizar(pr, pix, dinheiro) {
    if (typeof document === 'undefined') return;
    pintar(document, fatos(pr, pix, dinheiro));
  }

  return { fatos: fatos, pintar: pintar, atualizar: atualizar };
});
