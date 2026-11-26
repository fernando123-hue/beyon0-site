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
    var st = { carga: 'nao', fila: null, campo: null, timer: 0, ouvindo: false, falhou: false, E: null, espera: 0, tentativas: 0, novas: [] };
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
      st.novas.forEach(function (id) { win.clearTimeout(id); });   /* (os timers da peça nova saem com a fileira) */
      st.novas = [];
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
      var nome = doc.createElement('span');
      nome.className = 'orc-reacao__nome';
      nome.textContent = p.nome;
      li.appendChild(nome);
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
          var id = win.setTimeout(function () { li.classList.remove('is-nova'); st.novas = st.novas.filter(function (x) { return x !== id; }); }, NOVA_MS);
          st.novas.push(id);
        });
        caber();
      } catch (e) { falhar(e); }
    }
    /* numa linha só: se as peças com o nome não cabem (320 px com 3 ou mais), ficam só os ícones; nenhuma peça cortada na borda */
    function caber() {
      st.fila.classList.remove('is-compacta');
      if ((st.fila.scrollWidth || 0) > (st.fila.clientWidth || 0) + 1) st.fila.classList.add('is-compacta');
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

    /* as peças e os canais chegam pelo esboço, que os baixa no MESMO render da 1ª fala do Zero: com a flag ligada e sem eles ainda, confere de
       novo a cada ESPERA_PECAS ms, até TENTATIVAS vezes (~10 s); a flag que some no meio cancela */
    var ESPERA_PECAS = 400, TENTATIVAS = 25;
    function esperarPecas(E) {
      win.clearTimeout(st.espera);
      if (st.tentativas >= TENTATIVAS) return;
      st.tentativas++;
      st.espera = win.setTimeout(function () { if (st.E === E) atualizar(E); }, ESPERA_PECAS);
    }

    function atualizar(E) {
      if (st.falhou) return;
      if (E !== st.E) st.tentativas = 0;   /* um render novo (outro turno) ganha as tentativas de volta; a reconferência repete o mesmo E */
      st.E = E;
      try {
        if (!ligada(E)) { win.clearTimeout(st.espera); st.tentativas = 0; tirar(); return; }
        /* precisa das peças e dos canais que o esboço traz; sem eles (ainda), a página de hoje */
        if (!win.BZPlantaPecas || !win.BZMapaSaber) { tirar(); esperarPecas(E); return; }
        win.clearTimeout(st.espera);
        /* a caixa refeita por outro código: a fileira e o ouvinte vão para a nova */
        if (st.fila && st.campo !== $('o-texto')) tirar();
        if (!st.fila && !montar()) return;
        carregarLeitor();
        /* a fileira acompanha a caixa: conversa fechada (form escondido) ou passo que recolhe a caixa (is-recolhido) a escondem */
        var form = $('o-form');
        var semCaixa = !form || form.hidden || form.classList.contains('is-recolhido');
        if (st.fila.hidden !== semCaixa) st.fila.hidden = semCaixa;
        if (semCaixa || !st.campo.value.trim()) { while (st.fila.firstChild) st.fila.removeChild(st.fila.firstChild); }
      } catch (e) { falhar(e); }
    }

    return { atualizar: atualizar, _estado: st, _reagir: reagir };
  }

  return { criar: criar, ESPERA: ESPERA, LEITOR: LEITOR, ligada: ligada };
});
