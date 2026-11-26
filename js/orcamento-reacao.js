/* MAPA VIVO v2, fase 1a NA PÁGINA: enquanto a pessoa digita, as peças do que ela conta (Instagram, WhatsApp, agenda, sinal...) acendem numa
   fileira logo acima da caixa, só no aparelho, sem rede e sem IA (especificação no cofre: 01 Empresa/Mapa vivo v2 - especificação
   2026-11-21.md, "Fase 1a"). js/orcamento.js chama BZOrcReacao.atualizar(E) a cada render().
   - Só com a flag BZ_PLANTA ligada (o estado traz planta_editavel; hoje só na prévia) e com as peças e o leitor de canais já na página (o
     esboço, js/orcamento-planta-esboco.js, os baixa depois da 1ª fala do Zero). Desligada, nada é baixado nem ouvido: a tela é a de hoje.
   - O leitor (js/mapa-vivo-ler.js) vem sob demanda, de URL CONSTANTE, uma vez.
   - A fileira é decoração do que a pessoa mesma escreveu: aria-hidden (o leitor de tela já lê a caixa).
   - Lê com 250 ms de pausa na digitação; caixa vazia (depois de enviar) apaga a fileira.
   - Falha fechada: qualquer erro tira a fileira, com aviso "[beyon] reacao". ES5. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcReacao = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var LEITOR = 'js/mapa-vivo-ler.js';
  var ESPERA = 250, NOVA_MS = 1200;
  var NS = 'http://www.w3.org/2000/svg';
  var ehObjeto = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
  /* a flag: com ela ligada o estado sempre traz planta_editavel (api/_vendas/fluxo.mjs); desligada, a chave nem existe */
  var ligada = function (E) { return ehObjeto(E) && typeof E.planta_editavel === 'boolean'; };

  function criar(win) {
    var doc = win.document;
    var st = { carga: 'nao', fila: null, campo: null, timer: 0, ouvindo: false, falhou: false };
    var $ = function (id) { return doc.getElementById(id); };

    function falhar(e) {
      st.falhou = true;
      tirar();
      if (win.console) win.console.warn('[beyon] reacao', e && e.message ? e.message : e);
    }
    function tirar() {
      if (st.fila && st.fila.parentNode) st.fila.parentNode.removeChild(st.fila);
      st.fila = null;
      if (st.campo && st.ouvindo) st.campo.removeEventListener('input', aoDigitar);
      st.ouvindo = false;
      win.clearTimeout(st.timer);
    }
    /* uma peça: o ícone de js/planta-pecas.js (traço) e o nome curto */
    function pecaEl(p) {
      var li = doc.createElement('li'), svg = doc.createElementNS(NS, 'svg');
      li.className = 'orc-reacao__peca';
      li.setAttribute('data-codigo', p.codigo);
      svg.setAttribute('viewBox', '0 0 40 40');
      svg.setAttribute('focusable', 'false');
      (win.BZPlantaPecas.desenhar(p.peca) || []).forEach(function (tr) {
        var path = doc.createElementNS(NS, 'path');
        path.setAttribute('d', tr.d);
        if (tr.ac) path.setAttribute('class', 'ac');
        svg.appendChild(path);
      });
      li.appendChild(svg);
      li.appendChild(doc.createTextNode(p.nome));
      return li;
    }
    /* lê a caixa e acende o que é novo; o que deixou de valer sai */
    function reagir() {
      try {
        if (!st.fila || !win.BZMapaVivoLer) return;
        var agora = win.BZMapaVivoLer.ler(st.campo.value).pecas;
        var cods = agora.map(function (p) { return p.codigo; });
        var acesas = [];
        [].slice.call(st.fila.children).forEach(function (li) {
          var c = li.getAttribute('data-codigo');
          if (cods.indexOf(c) < 0) st.fila.removeChild(li); else acesas.push(c);
        });
        agora.forEach(function (p) {
          if (acesas.indexOf(p.codigo) >= 0) return;
          var li = pecaEl(p);
          li.classList.add('is-nova');
          st.fila.appendChild(li);
          win.setTimeout(function () { li.classList.remove('is-nova'); }, NOVA_MS);
        });
      } catch (e) { falhar(e); }
    }
    function aoDigitar() { win.clearTimeout(st.timer); st.timer = win.setTimeout(reagir, ESPERA); }

    function carregarLeitor() {
      if (win.BZMapaVivoLer) { st.carga = 'pronta'; return; }
      if (st.carga !== 'nao') return;
      st.carga = 'baixando';
      var s = doc.createElement('script');
      s.src = LEITOR;
      s.async = true;
      s.onload = function () { st.carga = win.BZMapaVivoLer ? 'pronta' : 'falhou'; if (st.carga === 'pronta') reagir(); };
      s.onerror = function () { st.carga = 'falhou'; };
      doc.head.appendChild(s);
    }

    function montar() {
      var form = $('o-form');
      st.campo = $('o-texto');
      if (!form || !st.campo || !form.parentNode) return false;
      var ul = doc.createElement('ul');
      ul.className = 'orc-reacao';
      ul.id = 'o-reacao';
      ul.setAttribute('aria-hidden', 'true');
      form.parentNode.insertBefore(ul, form);
      st.fila = ul;
      st.campo.addEventListener('input', aoDigitar);
      st.ouvindo = true;
      return true;
    }

    function atualizar(E) {
      if (st.falhou) return;
      try {
        /* precisa da flag e das peças e dos canais que o esboço já trouxe; sem isso, a página de hoje */
        if (!ligada(E) || !win.BZPlantaPecas || !win.BZMapaSaber) { tirar(); return; }
        if (!st.fila && !montar()) return;
        carregarLeitor();
        if (!st.campo.value.trim()) { while (st.fila.firstChild) st.fila.removeChild(st.fila.firstChild); }
      } catch (e) { falhar(e); }
    }

    return { atualizar: atualizar, _estado: st, _reagir: reagir };
  }

  return { criar: criar, ESPERA: ESPERA, LEITOR: LEITOR, ligada: ligada };
});
