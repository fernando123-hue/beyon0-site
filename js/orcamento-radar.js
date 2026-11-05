/* O RADAR NA PÁGINA DE ORÇAMENTO (PR 2d-ligação, spec §3.5): js/orcamento.js chama BZOrcRadar.atualizar(E) a cada render(). Sem E.leitura (flag BZ_PLANTA desligada) nada é
   baixado, criado nem ouvido. Com ela, baixa sob demanda (URLs constantes) o radar, a forma (se a planta não a trouxe) e o CSS; só com tudo na mão tira #o-radar de hidden e monta.
   Falha fechada ("[beyon] radar" no console). Sem região viva: a única é o #o-voz do chat. ES5. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcRadar = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var FORMA = 'js/orcamento-planta-forma.js', RADAR = 'js/planta-radar.js', CSS = 'css/orcamento-radar.css';

  /* a forma LEVE do que o servidor manda; a completa é do BZPlantaForma */
  function leve(E) {
    var l = E && typeof E === 'object' ? E.leitura : null;
    return l && typeof l === 'object' && l.eixos && l.eixos.length === 5 ? l : null;
  }

  function criar(win) {
    var doc = win.document;
    var st = { carga: 'nao', pegos: {}, E: null, json: '', recusada: '', falhou: '', inst: null, pagina: false };
    function aviso(e) {
      try { win.console.warn('[beyon] radar: ' + (e && e.message ? e.message : e)); } catch (x) { /* sem console */ }
    }

    /* o radar sai do laço único do site, o contêiner some e a ligação esquece */
    function sumir() {
      var c = doc.getElementById('o-radar');
      if (st.inst) { try { st.inst.desmontar(); } catch (e) { aviso(e); } }
      st.inst = null; st.json = ''; st.recusada = '';
      if (c) c.hidden = true;
    }

    function seguir() {
      var l = leve(st.E), c = doc.getElementById('o-radar'), json, v, inst = null;
      if (!l || !c) return sumir();
      json = JSON.stringify(l);
      if (st.inst) {
        if (json !== st.json) { st.json = json; try { st.inst.atualizar(l); } catch (e) { aviso(e); } }
        return;
      }
      if (json === st.recusada) return;   /* a leitura que não deu certo não é tentada a cada render */
      st.recusada = json;
      if (!win.BZPlantaForma || !win.BZRadar) return aviso('módulos incompletos');
      v = win.BZPlantaForma.validarFormaLeitura(l);
      if (!v || !v.ok) return;
      c.hidden = false;
      try { inst = win.BZRadar.montar(c, l); } catch (e) { aviso(e); }
      if (!inst) { c.hidden = true; return; }
      st.inst = inst; st.json = json; st.recusada = '';
      if (!st.pagina) {   /* sai com a página (e volta se ela voltar do cache) */
        st.pagina = true;
        win.addEventListener('pagehide', sumir);
        win.addEventListener('pageshow', function () { if (!st.inst && st.E) seguir(); });
      }
    }

    function anexar(url, tipo, aoFim) {
      var e = doc.createElement(tipo);
      if (tipo === 'link') { e.rel = 'stylesheet'; e.href = url; } else { e['async'] = false; e.src = url; }
      e.addEventListener('load', function () { st.pegos[url] = true; aoFim(true); });
      e.addEventListener('error', function () { if (e.parentNode) e.parentNode.removeChild(e); aoFim(false); });
      doc.head.appendChild(e);
    }
    /* só o que falta */
    function carregar() {
      var lista = [], falta, falhou = false, i;
      st.carga = 'indo';
      if (!st.pegos[CSS]) lista.push([CSS, 'link']);
      if (!win.BZPlantaForma && !st.pegos[FORMA]) lista.push([FORMA, 'script']);
      if (!win.BZRadar && !st.pegos[RADAR]) lista.push([RADAR, 'script']);
      if (!lista.length) { st.carga = 'ok'; seguir(); return; }
      falta = lista.length;
      function fim(deuCerto) {
        if (!deuCerto) falhou = true;
        if (--falta > 0) return;
        if (falhou) { st.carga = 'falhou'; aviso('não consegui baixar o radar'); return; }
        st.carga = 'ok'; seguir();
      }
      for (i = 0; i < lista.length; i++) anexar(lista[i][0], lista[i][1], fim);
    }

    function atualizar(E) {
      try {
        var l = leve(E);
        st.E = E;   /* o estado mais novo: se a leitura some durante o download, nada é montado */
        if (!l) { if (st.inst || st.json) sumir(); if (st.carga === 'falhou') st.carga = 'nao'; return; }
        if (st.carga === 'falhou') {
          if (JSON.stringify(l) === st.falhou) return;   /* a mesma leitura não insiste; uma nova tenta só o que faltou */
          st.carga = 'nao';
        }
        if (st.carga === 'nao') { st.falhou = JSON.stringify(l); carregar(); return; }
        if (st.carga === 'ok') seguir();
      } catch (e) {
        aviso(e);
        try { sumir(); } catch (e2) { /* nada mais a fazer */ }
      }
    }

    return { atualizar: atualizar };
  }

  return { criar: criar };
});
