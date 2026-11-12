/* A PLANTA VIVA v2 NA CONVERSA (direção 12/11, docs/design/planta-espetaculo-2026-11-12.md): o ESBOÇO que nasce na 1ª resposta do Zero e cresce a
   cada coisa que a pessoa conta. js/orcamento.js chama BZOrcEsboco.atualizar(E) a cada render(), depois da conversa.
   - Só com a flag BZ_PLANTA ligada (o estado traz planta_editavel, true ou false) e com uma fala do Zero na conversa. Desligada, nada acontece:
     nada é baixado nem ouvido, e a tela é a de hoje.
   - Os módulos e o CSS vêm sob demanda, de URLs CONSTANTES, uma vez.
   - O cartão é o ÚLTIMO item da conversa (li com data-fica: js/orcamento.js põe as falas antes dele e o mantém ao refazer a lista; decisão de 12/11).
     Ele só imprime uma estação quando ela está à vista dentro da caixa da conversa. A planta nunca rola nada.
   - O esboço sai do briefing que o estado já traz (js/planta-cresce.js, listas fechadas): o texto da pessoa nunca entra no desenho, e nenhuma IA a mais.
   - Ao girar o celular ou mudar a largura da janela, o esboço é refeito na largura nova, com o que já estava entendido, sem animação nem som.
   - Ao voltar para a página com a conversa em andamento, o esboço nasce pronto, sem refazer a semente.
   - Falha fechada: qualquer erro tira o cartão, com aviso "[beyon] planta". ES5. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcEsboco = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* na ordem em que se leem: o esboço precisa dos quatro antes dele */
  var MODULOS = ['js/planta-pecas.js', 'js/planta-cresce.js', 'js/planta-relogio.js', 'js/planta-som.js', 'js/planta-esboco.js'];
  var CSS = 'css/planta-esboco.css';
  /* o global que cada módulo publica: o que já está na página (o planta-pecas.js, se a faixa veio antes) não é baixado de novo */
  var GLOBAIS = { 'js/planta-pecas.js': 'BZPlantaPecas', 'js/planta-cresce.js': 'BZPlantaCresce', 'js/planta-relogio.js': 'BZPlantaRelogio', 'js/planta-som.js': 'BZPlantaSom', 'js/planta-esboco.js': 'BZPlantaEsboco' };
  var ESPERA_RESIZE = 160, TOLERANCIA_LARGURA = 6, FOLGA_FALA = 8;

  var ehObjeto = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
  /* a flag: com ela ligada o estado sempre traz planta_editavel (api/_vendas/fluxo.mjs); desligada, a chave nem existe */
  var ligada = function (E) { return ehObjeto(E) && typeof E.planta_editavel === 'boolean'; };
  var falasDoZero = function (E) { return Array.isArray(E.mensagens) ? E.mensagens.filter(function (m) { return m && m.papel === 'agente'; }).length : 0; };
  var falouOZero = function (E) { return falasDoZero(E) > 0; };
  var briefingDe = function (E) { return ehObjeto(E.conversa) && ehObjeto(E.conversa.briefing) ? E.conversa.briefing : {}; };

  function criar(win) {
    var doc = win.document;
    var st = { carga: 'nao', elementos: {}, E: null, item: null, esb: null, largura: 0, timer: 0, ouveResize: false, nasceuPronta: null };
    var $ = function (id) { return doc.getElementById(id); };
    function aviso(e) {
      try { if (win.console && win.console.warn) win.console.warn('[beyon] planta: ' + (e && e.message ? e.message : e)); } catch (x) { /* sem console */ }
    }

    /* ---- o carregamento sob demanda (uma vez; falhou, a planta não aparece nesta visita) ---- */
    function carregar() {
      st.carga = 'indo';
      var lista = [[CSS, 'link']], falta, falhou = false, i;
      for (i = 0; i < MODULOS.length; i++) if (!win[GLOBAIS[MODULOS[i]]]) lista.push([MODULOS[i], 'script']);
      falta = lista.length;
      function fim(deuCerto) {
        if (!deuCerto) falhou = true;
        if (--falta > 0) return;
        if (falhou) { st.carga = 'falhou'; aviso('não consegui baixar o esboço'); return; }
        st.carga = 'ok';
        seguir();
      }
      lista.forEach(function (x) {
        var e = doc.createElement(x[1]);
        if (x[1] === 'link') { e.rel = 'stylesheet'; e.href = CSS; } else { e['async'] = false; e.src = x[0]; }
        e.addEventListener('load', function () { fim(true); });
        e.addEventListener('error', function () { if (e.parentNode) e.parentNode.removeChild(e); fim(false); });
        st.elementos[x[0]] = e;
        doc.head.appendChild(e);
      });
    }

    /* roda quando a página está ociosa (requestIdleCallback; sem ele, logo depois) */
    function ocioso(fn) {
      var seguro = function () { try { fn(); } catch (e) { aviso(e); } };
      if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(seguro, { timeout: 2000 }); else win.setTimeout(seguro, 200);
    }

    /* ---- o cartão ---- */
    function largura() { return st.item ? st.item.clientWidth : 0; }
    function novoEsboco(inicial) {
      var op = { rolagem: $('o-log-caixa'), som: function (nome) { if (win.BZPlantaSom) win.BZPlantaSom.tocar(nome); } };
      if (inicial) op.inicial = inicial;
      st.esb = win.BZPlantaEsboco.criar(st.item, op);
      st.largura = largura();
    }
    function colocar() {
      var log = $('o-log');
      if (!log) return false;
      if (!st.item) {
        st.item = doc.createElement('li');
        st.item.className = 'lv-item';
        st.item.setAttribute('data-fica', '');
      }
      if (st.item.parentNode !== log || log.lastElementChild !== st.item) log.appendChild(st.item);
      return true;
    }
    /* o esboço que acabou de nascer: a caixa rola sozinha até a última fala ficar no topo dela, com o cartão logo abaixo (como js/orcamento.js faz a
       cada fala nova com o cartão na lista). Só a caixa; a página nunca. Depois de o esboço existir: antes, sem a altura dele, a caixa não tem o que
       rolar e o navegador prende a rolagem em 0 (visto no Chromium em 12/11) */
    function alinharUltimaFala() {
      var caixa = $('o-log-caixa'), fala = st.item ? st.item.previousElementSibling : null;
      if (!caixa || !fala) return;
      caixa.scrollTop = Math.max(0, caixa.scrollTop + fala.getBoundingClientRect().top - caixa.getBoundingClientRect().top - FOLGA_FALA);
    }
    function tirar() {
      soltarResize();
      if (st.esb) { try { st.esb.parar(); } catch (e) { aviso(e); } }
      st.esb = null;
      if (st.item && st.item.parentNode) st.item.parentNode.removeChild(st.item);
      st.item = null; st.largura = 0;
    }

    /* ---- girar o celular / mudar a largura: refaz na largura nova com o que já estava entendido ---- */
    function aoResize() {
      if (st.timer) win.clearTimeout(st.timer);
      st.timer = win.setTimeout(function () {
        st.timer = 0;
        try {
          if (!st.esb || !st.item) return;
          var l = largura();
          if (l <= 0 || Math.abs(l - st.largura) <= TOLERANCIA_LARGURA) return;
          var feito = st.esb.interno.esboco;
          st.esb.parar();
          while (st.item.firstChild) st.item.removeChild(st.item.firstChild);
          novoEsboco(feito || null);
        } catch (e) { aviso(e); tirar(); }
      }, ESPERA_RESIZE);
    }
    function ouvirResize() { if (!st.ouveResize) { st.ouveResize = true; win.addEventListener('resize', aoResize); } }
    function soltarResize() {
      if (st.ouveResize) { st.ouveResize = false; win.removeEventListener('resize', aoResize); }
      if (st.timer) { win.clearTimeout(st.timer); st.timer = 0; }
    }

    /* ---- o fluxo ---- */
    function seguir() {
      var E = st.E;
      if (!ligada(E) || !falouOZero(E)) { tirar(); return; }
      if (!win.BZPlantaEsboco || !win.BZPlantaCresce) { aviso('módulos do esboço incompletos'); tirar(); return; }
      if (!colocar()) return;
      var esboco = win.BZPlantaCresce.derivar(briefingDe(E));
      if (!st.esb) {
        if (largura() <= 0) return;   /* a conversa ainda escondida: nasce quando ela aparecer (num próximo render) */
        /* voltando à página com a conversa andando, o esboço nasce pronto; a semente só toca ao vivo, na 1ª resposta do Zero */
        novoEsboco(st.nasceuPronta ? esboco : null);
        alinharUltimaFala();
        if (win.BZPlantaSom) { win.BZPlantaSom.mostrarBotoes(); ocioso(win.BZPlantaSom.preparar); }   /* o áudio nasce no ócio, nunca num toque (js/planta-som.js) */
        ouvirResize();
      }
      st.esb.crescer(esboco);
    }

    function atualizar(E) {
      try {
        st.E = E;
        if (!ligada(E) || !falouOZero(E)) { if (st.item) tirar(); return; }
        /* a 1ª vez que esta página vê fala do Zero: com 2 ou mais, a conversa já vinha andando (retomada) e o esboço nasce pronto; com uma só, é a
           1ª resposta chegando agora e a semente toca (uma retomada logo depois da 1ª resposta só repete a semente, que é curta) */
        if (st.nasceuPronta === null) st.nasceuPronta = falasDoZero(E) >= 2;
        if (st.carga === 'nao') { carregar(); return; }
        if (st.carga === 'ok') seguir();
      } catch (e) {
        aviso(e);
        try { tirar(); } catch (e2) { /* nada mais a fazer */ }
      }
    }

    return { atualizar: atualizar };
  }

  return { criar: criar, MODULOS: MODULOS, CSS: CSS };
});
