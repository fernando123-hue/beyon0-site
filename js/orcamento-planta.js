/* ==========================================================================
   A PLANTA NA PÁGINA DE ORÇAMENTO (PR 2c; spec §1.2, §1.3, §4.4). A cola entre o `estado` e os módulos do desenho (js/planta-desenho.js e os três que ele
   usa). js/orcamento.js chama BZOrcPlanta.atualizar(E, { rolarAte, enviar }) a cada render(), depois de conversa().
   • O `estado` só traz `planta` com a flag BZ_PLANTA ligada: sem ela (ou com planta de forma errada) nada acontece, nada é baixado, nenhum ouvinte nasce.
   • Os 4 módulos (forma, peças, layout, desenho) e o CSS da faixa são baixados sob demanda, UMA vez, de URLs CONSTANTES (nunca src montado com dado do estado);
     o botão e a faixa só nascem depois que tudo chegou, então nunca aparecem sem estilo.
   • O botão "Ver a planta do seu site" mora dentro da fala do Zero de índice `planta.n_mensagens` (a abertura fixa da lista soma 1) e é recolocado a cada
     render, porque conversa() refaz a lista inteira; um botão só, sob a fala da versão mais nova.
   • REGRA DE INSERÇÃO (spec §4.4): a faixa só sai de `hidden` quando a posição dela nasce abaixo da área visível (a base da mesa passa da tela) ou num gesto
     da pessoa (clique, tecla, toque no botão): o navegador não conta deslocamento logo depois de uma ação dela. Não há área vazia reservada.
   • Falha fechada e silenciosa: qualquer erro aqui esconde a faixa, tira o botão e deixa um aviso "[beyon] planta" no console; a conversa nunca depende disto.
   • "Está certo" manda "A planta está certa." pelo envio normal da tela (uma vez por versão); "Quero ajustar algo" só foca a caixa de texto. Os dois só valem
     com `planta_editavel`. Texto do modelo nunca passa por aqui: quem o põe na tela é o desenho, por textContent. ES5 sintático.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcPlanta = api.criar(raiz);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var MODULOS = ['js/orcamento-planta-forma.js', 'js/planta-pecas.js', 'js/planta-layout.js', 'js/planta-desenho.js'];
  var CSS_DA_FAIXA = 'css/orcamento-planta.css';
  var TEXTO_CERTO = 'A planta está certa.';
  var DICA_AJUSTE = 'Diga o que mudar na planta.';
  var ROTULO_BOTAO = 'Ver a planta do seu site';
  var ESPERA_ROLAGEM = 150, FALA_MAX = 120, NOME_MAX = 40;

  var ehInteiro = function (n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; };
  var ehObjeto = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
  var limpo = function (t, max) { return typeof t === 'string' ? t.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; };

  /* a forma LEVE do que o servidor manda; a validação completa é do BZPlantaForma, depois que ele chega */
  function leve(E) {
    var p = ehObjeto(E) ? E.planta : null;
    if (!ehObjeto(p) || !ehObjeto(p.plano)) return null;
    if (!ehInteiro(p.versao) || p.versao < 1 || !ehInteiro(p.n_mensagens) || p.n_mensagens < 0) return null;
    if (p.origem !== 'modelo' && p.origem !== 'padrao') return null;
    return p;
  }

  function criar(win) {
    var doc = win.document;
    var st = { carga: 'nao', versaoFalha: 0, E: null, deps: {}, versao: 0, json: '', assin: '', valido: false, naTela: false, pendente: false, gestos: false, botao: null, certoVersao: 0, timer: 0 };

    var $ = function (id) { return doc.getElementById(id); };
    function aviso(e) {
      try { if (win.console && win.console.warn) win.console.warn('[beyon] planta: ' + (e && e.message ? e.message : e)); } catch (x) { /* sem console */ }
    }

    /* ---- o botão no chat ---- */
    function tirarBotao() {
      if (st.botao && st.botao.parentNode) st.botao.parentNode.removeChild(st.botao);
      st.botao = null;
    }
    /* a fala do Zero que trouxe a versão: índice n_mensagens da lista do estado; a abertura fixa é o 1º item do DOM. Se aquela posição não é fala do Zero
       (a fala saiu da janela de 60, posição 0), vale a mais próxima antes dela, e a 1ª depois dela se não houver antes */
    function falaDoZero(E, p) {
      var log = $('o-log');
      if (!log) return null;
      var m = Array.isArray(E.mensagens) ? E.mensagens : [], itens = log.children, i = Math.min(p.n_mensagens, m.length - 1), alvo = -1;
      if (m.length === 0) return null;
      for (var j = i; j >= 0 && alvo < 0; j--) if (m[j] && m[j].papel === 'agente') alvo = j;
      for (var k = i + 1; k < m.length && alvo < 0; k++) if (m[k] && m[k].papel === 'agente') alvo = k;
      if (alvo < 0) return null;
      var li = itens[alvo + 1];
      return li && li.classList && li.classList.contains('msg--agente') ? li : null;
    }
    function colocarBotao(E, p) {
      var li = falaDoZero(E, p);
      if (st.botao && st.botao.parentNode === li) return;
      tirarBotao();
      if (!li) return;
      var caixa = $('o-log-caixa');
      var colado = !!caixa && caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 8;
      var b = doc.createElement('button');
      b.className = 'btn btn--sm btn--ghost plv-ver';
      b.setAttribute('type', 'button');
      b.textContent = ROTULO_BOTAO;
      b.addEventListener('click', verAPlanta);
      li.appendChild(b);
      st.botao = b;
      if (colado) caixa.scrollTop = caixa.scrollHeight;   /* o balão cresceu: quem lia o fim continua no fim */
    }

    /* ---- a faixa ---- */
    function opcoes(E, p, comFala) {
      var nome = E.conversa && E.conversa.briefing && E.conversa.briefing.negocio ? limpo(E.conversa.briefing.negocio.nome, NOME_MAX) : '';
      var o = { origem: p.origem, editavel: E.planta_editavel === true, aoCerto: aoCerto, aoAjustar: aoAjustar };
      if (nome) o.nome = nome;
      if (comFala && Array.isArray(E.mensagens)) {
        var m = E.mensagens[p.n_mensagens - 1];
        var fala = m && m.papel !== 'agente' ? limpo(m.conteudo, FALA_MAX) : '';
        if (fala) o.fala = fala;
      }
      return o;
    }
    function soltarGestos() {
      if (!st.gestos) return;
      st.gestos = false;
      doc.removeEventListener('click', aoGesto, true);
      doc.removeEventListener('keydown', aoGesto, true);
      win.removeEventListener('scroll', aoRolar);
      win.removeEventListener('resize', aoRolar);
      if (st.timer) { win.clearTimeout(st.timer); st.timer = 0; }
    }
    function esperarGestos() {
      if (st.gestos) return;
      st.gestos = true;
      doc.addEventListener('click', aoGesto, true);
      doc.addEventListener('keydown', aoGesto, true);
      win.addEventListener('scroll', aoRolar);
      win.addEventListener('resize', aoRolar);
    }
    function esconder() {
      soltarGestos();
      var faixa = $('o-planta');
      if (st.naTela && win.BZPlanta && win.BZPlanta.parar) { try { win.BZPlanta.parar(); } catch (e) { aviso(e); } }
      if (faixa) faixa.hidden = true;
      st.naTela = false; st.pendente = false;
    }
    /* a faixa nasceria abaixo da dobra: a base da mesa passa da tela (e a mesa existe na página) */
    function nasceFora() {
      var mesa = doc.querySelector('.orc-mesa');
      if (!mesa) return false;
      var r = mesa.getBoundingClientRect(), alto = win.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 0;
      return r.height > 0 && r.bottom > alto;
    }
    function inserir() {
      var E = st.E, p = leve(E), faixa = $('o-planta');
      if (st.naTela) return true;
      if (!p || !faixa || !st.valido || !win.BZPlanta) return false;
      faixa.hidden = false;
      var r = null;
      try { r = win.BZPlanta.montar(faixa, p.plano, opcoes(E, p, false)); } catch (e) { aviso(e); }
      if (!r || !r.ok) {
        faixa.hidden = true;
        if (r) aviso('montar recusou (' + (r.motivos || []).join(',') + ')');
        else { st.valido = false; tirarBotao(); soltarGestos(); }
        return false;
      }
      st.naTela = true; st.pendente = false;
      st.assin = st.versao + '|' + p.origem + '|' + (E.planta_editavel === true) + '|' + st.json;
      soltarGestos();
      return true;
    }
    function tentar() {
      if (st.naTela || !st.pendente) return;
      if (nasceFora()) inserir();
      else esperarGestos();
    }
    function aoGesto() { if (st.pendente && !st.naTela) inserir(); }
    function aoRolar() {
      if (st.timer) win.clearTimeout(st.timer);
      st.timer = win.setTimeout(function () { st.timer = 0; try { if (st.pendente && nasceFora()) inserir(); } catch (e) { aviso(e); } }, ESPERA_ROLAGEM);
    }
    function verAPlanta() {
      try {
        if (!st.naTela && !inserir()) return;
        var faixa = $('o-planta');
        if (typeof st.deps.rolarAte === 'function') st.deps.rolarAte(faixa);
        var titulo = faixa.querySelector('h2');
        if (titulo) {
          if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
          titulo.focus({ preventScroll: true });
        }
      } catch (e) { aviso(e); }
    }

    /* ---- os botões da faixa ---- */
    var editavel = function () { return !!st.E && st.E.planta_editavel === true; };
    function aoCerto() {
      if (!editavel() || st.certoVersao === st.versao) return;
      if (typeof st.deps.enviar !== 'function') return;
      st.certoVersao = st.versao;
      st.deps.enviar(TEXTO_CERTO);
    }
    function aoAjustar() {
      if (!editavel()) return;
      var t = $('o-texto');
      if (!t) return;
      t.placeholder = DICA_AJUSTE;
      t.focus();
    }

    /* ---- o carregamento sob demanda ---- */
    function carregar() {
      st.carga = 'indo';
      var falta = MODULOS.length + 1, falhou = false;
      function chegou() { if (--falta === 0 && !falhou) { st.carga = 'ok'; seguir(); } }
      function quebrou() {
        if (falhou) return;
        falhou = true; st.carga = 'falhou'; st.versaoFalha = st.versao;
        aviso('não consegui baixar os módulos ou o CSS');
        esconder(); tirarBotao();
      }
      /* o CSS vem junto, sob demanda: com a flag desligada a página não paga nem o CSS bloqueante nem os bytes */
      var l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = CSS_DA_FAIXA;
      l.addEventListener('load', chegou);
      l.addEventListener('error', quebrou);
      doc.head.appendChild(l);
      for (var i = 0; i < MODULOS.length; i++) {
        var s = doc.createElement('script');
        s.async = false;   /* a ordem de execução é a da lista: o desenho lê os outros três quando carrega */
        s.src = MODULOS[i];
        s.addEventListener('load', chegou);
        s.addEventListener('error', quebrou);
        doc.head.appendChild(s);
      }
    }

    /* ---- o fluxo ---- */
    function seguir() {
      var E = st.E, p = leve(E);
      if (!p) return sumir();
      var Forma = win.BZPlantaForma;
      if (!Forma || !win.BZPlanta) { aviso('módulos incompletos'); return sumir(); }
      var json = JSON.stringify(p.plano);
      if (json !== st.json) {
        var v = Forma.validarFormaPlano(p.plano);
        st.json = json; st.valido = !!(v && v.ok);
        if (!st.valido) aviso('planta recusada pela forma (' + ((v && v.motivos) || []).join(',') + ')');
      }
      if (!st.valido) return sumir();
      var versaoNova = st.naTela && p.versao !== st.versao;
      st.versao = p.versao;
      colocarBotao(E, p);
      if (st.naTela) {
        var assin = p.versao + '|' + p.origem + '|' + (E.planta_editavel === true) + '|' + json;
        if (assin === st.assin) return;   /* nada mudou para o desenho: não o chama de novo a cada leitura do estado */
        st.assin = assin;
        var r = win.BZPlanta.atualizar(p.plano, opcoes(E, p, versaoNova));
        if (r && r.ok === false) aviso('atualizar recusou (' + (r.motivos || []).join(',') + ')');
        return;
      }
      st.pendente = true;
      tentar();
    }
    function sumir() {
      esconder(); tirarBotao();
      st.json = ''; st.valido = false;
    }

    function atualizar(E, deps) {
      try {
        if (deps && typeof deps === 'object') st.deps = deps;
        var p = leve(E);
        if (!p) { if (st.naTela || st.botao || st.pendente || st.gestos) sumir(); return; }
        st.E = E;
        if (st.carga === 'falhou' && p.versao !== st.versaoFalha) st.carga = 'nao';
        if (st.carga === 'nao') { st.versao = p.versao; carregar(); return; }
        if (st.carga === 'ok') seguir();
      } catch (e) {
        aviso(e);
        try { sumir(); } catch (e2) { /* nada mais a fazer */ }
      }
    }

    return { atualizar: atualizar };
  }

  return { criar: criar, MODULOS: MODULOS };
});
