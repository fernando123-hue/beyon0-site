/* ==========================================================================
   O PALCO DO ORÇAMENTO (direção C "palco", escolhida pelo dono em 23/11: "C ficou muito bom"; desenho travado em
   06 Operação/Remodelação da conversa 2026-11-22/direcoes/C-palco.html). A conversa é branca e o site da pessoa nasce numa
   faixa preta de ponta a ponta, como numa vitrine (a miniatura de js/orcamento-nasce.js), com três contadores em verde-água:
   PARTES (as peças que a miniatura já mostra), INTEGRAÇÃO (o número que o radar do escopo já conhece) e VALOR (o investimento
   que o radar já mostra, que só existe depois que o Zero entende o caso).
   Nada é calculado nem inventado aqui: as partes saem da MESMA conta do desenho (BZOrcNasce.planoDoSite) e o resto chega pelo
   evento "bz:radar" de js/orcamento-escopo.js. Os contadores são aria-hidden (o radar é o texto de verdade). Só textContent.
   O número que muda ganha a classe do pulo (css/orcamento-palco.css, só com movimento liberado). ES5, como os vizinhos.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  /* (a miniatura e os rótulos são lidos na hora do evento: a ordem dos scripts não importa) */
  if (raiz) {
    raiz.BZOrcPalco = api;
    if (raiz.document) api.ligar(raiz.document, function () { return raiz.BZOrcNasce; }, function () { return raiz.BZOrcRotulos; });
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var VAZIO = '—';
  var MAX_CONTAGEM = 99;   /* (a lista fechada tem menos de 10; o teto só barra um evento forjado) */
  var NOVO = 'is-nova';   /* (o mesmo nome do pulo da miniatura) */

  function partes(respostas, nasce, rotulos) {
    if (!nasce || typeof nasce.planoDoSite !== 'function') return '0';
    var plano = nasce.planoDoSite(respostas, rotulos);
    return plano ? String(plano.pecas.length) : '0';
  }
  function inteiro(n) {
    return typeof n === 'number' && isFinite(n) && n >= 0 && n <= MAX_CONTAGEM && Math.floor(n) === n ? String(n) : VAZIO;
  }
  function valor(v) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) return VAZIO;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  /* escreve só o que mudou; o número novo (não o vazio) pula */
  function escrever(doc, id, texto) {
    var el = doc.getElementById(id);
    if (!el || el.textContent === texto) return;
    el.textContent = texto;
    if (!el.classList) return;
    el.classList.remove(NOVO);
    if (texto === VAZIO) return;
    void el.offsetWidth;   /* (recomeça a animação do pulo) */
    el.classList.add(NOVO);
  }

  function ligar(doc, nasce, rotulos) {
    if (!doc || typeof doc.addEventListener !== 'function' || !doc.getElementById('o-palco-partes')) return;
    var ler = function (f) { return typeof f === 'function' ? f() : f; };
    doc.addEventListener('bz:respostas', function (ev) {
      escrever(doc, 'o-palco-partes', partes(ev && ev.detail, ler(nasce), ler(rotulos)));
    });
    doc.addEventListener('bz:radar', function (ev) {
      var d = ev && ev.detail && typeof ev.detail === 'object' ? ev.detail : {};
      escrever(doc, 'o-palco-integracoes', inteiro(d.integracoes));
      escrever(doc, 'o-palco-valor', valor(d.valor));
    });
  }

  return Object.freeze({ VAZIO: VAZIO, partes: partes, inteiro: inteiro, valor: valor, ligar: ligar });
});
