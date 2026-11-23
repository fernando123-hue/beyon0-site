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
    if (raiz.document) { api.ligar(raiz.document, function () { return raiz.BZOrcNasce; }, function () { return raiz.BZOrcRotulos; }); api.ligarCaixa(raiz.document, raiz); }
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

  /* ---------- A CAIXA DA CONVERSA PARA NO COMEÇO DE UMA FALA (dono, 24/11: o "ZERO" saía atravessado pela régua de cima) ----------
     O CSS faz a caixa parar a rolagem no começo de cada item (scroll-snap). Mas quando o que vem depois da última fala do Zero é curto, a
     rolagem acaba antes de a fala chegar ao topo, e o topo cortava a fala anterior. Aqui a lista ganha embaixo a folga que falta para a
     última fala poder ficar no topo, inteira (como num app de conversa: a pergunta nova em cima, o espaço livre embaixo). A folga muda
     por evento (a conversa mudou, a tela mudou de tamanho), nunca por quadro. Sem fala do Zero, folga zero. */
  function folgaNecessaria(alturaUtil, daFalaAoFim) {
    var a = Number(alturaUtil), b = Number(daFalaAoFim);
    if (!isFinite(a) || !isFinite(b) || a <= 0 || b < 0) return 0;
    return Math.max(0, Math.round(a - b));
  }
  function ligarCaixa(doc, win) {
    var caixa = doc && doc.getElementById && doc.getElementById('o-log-caixa'), lista = doc && doc.getElementById && doc.getElementById('o-log');
    if (!caixa || !lista || !win || typeof win.MutationObserver !== 'function' || typeof win.getComputedStyle !== 'function') return;
    var visivel = function (el) { return el.getClientRects().length > 0; };
    function ultimaFala() { var f = lista.querySelectorAll(':scope > .msg--agente'), i; for (i = f.length - 1; i >= 0; i--) if (visivel(f[i])) return f[i]; return null; }
    function ultimoItem() { var i, c = lista.children; for (i = c.length - 1; i >= 0; i--) if (visivel(c[i])) return c[i]; return null; }
    function medirEAjustar(trazerFala) {
      var fala = ultimaFala(), fim = ultimoItem(), cs = win.getComputedStyle(caixa);
      var util = caixa.clientHeight - (parseFloat(cs.scrollPaddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      var folga = fala && fim ? folgaNecessaria(util, fim.getBoundingClientRect().bottom - fala.getBoundingClientRect().top) : 0;
      var atual = lista.style.paddingBottom;
      if (atual !== folga + 'px') lista.style.paddingBottom = folga + 'px';
      if (!trazerFala || !fala) return;
      /* a fala nova vai para o topo da caixa, inteira (o mesmo lugar que js/orcamento-toques.js e js/orcamento.js pedem; agora a rolagem alcança) */
      var topo = caixa.getBoundingClientRect().top + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.scrollPaddingTop) || 0);
      caixa.scrollTop = caixa.scrollTop + fala.getBoundingClientRect().top - topo;
    }
    new win.MutationObserver(function (mudancas) {
      var falaNova = mudancas.some(function (m) { return [].some.call(m.addedNodes || [], function (n) { return n.nodeType === 1 && n.classList && n.classList.contains('msg--agente'); }); });
      medirEAjustar(falaNova);
    }).observe(lista, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-feito', 'hidden'] });
    win.addEventListener('resize', function () { medirEAjustar(false); });
    medirEAjustar(false);
  }

  return Object.freeze({ VAZIO: VAZIO, partes: partes, inteiro: inteiro, valor: valor, ligar: ligar, folgaNecessaria: folgaNecessaria, ligarCaixa: ligarCaixa });
});
