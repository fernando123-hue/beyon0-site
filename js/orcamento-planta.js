/* A PLANTA NA PÁGINA DE ORÇAMENTO (PR 2c; spec §1.2, §1.3, §4.4): a cola entre o estado e os módulos do desenho. js/orcamento.js chama
   BZOrcPlanta.atualizar(E, { rolarAte, enviar }) a cada render(), depois de conversa(). Sem E.planta (flag desligada) nada acontece: nada é baixado nem ouvido.
   Módulos e CSS vêm sob demanda de URLs CONSTANTES. O botão "Ver a planta do seu site" mora na fala do Zero de índice n_mensagens (a abertura fixa soma 1).
   A faixa só sai de hidden abaixo da dobra ou num gesto da pessoa (spec §4.4). Falha fechada, com aviso "[beyon] planta". O texto do modelo não passa por aqui. ES5. */
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
  /* a planta viva v2 (decisões do dono de 12/11): abaixo de 960 px a planta consagra NO CARTÃO da conversa (js/orcamento-planta-esboco.js) e a faixa
     não é usada; a caixa da conversa (nunca a página) rola até o cartão, ESPERA_CARTAO depois da fala aparecer, se a pessoa não rolou a caixa à mão
     nos últimos MAO_NA_CAIXA ms; a fala fica a FOLGA px do topo */
  var COMPUTADOR = '(min-width: 960px)', ESPERA_CARTAO = 1200, MAO_NA_CAIXA = 3000, FOLGA = 8;

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
    var st = { carga: 'nao', versaoFalha: 0, pegos: {}, elementos: {}, E: null, deps: {}, versao: 0, json: '', assin: '', mostrada: 0, valido: false, recusas: 0, avisouModulos: false, naTela: false, recolhida: false, ouveForm: false, pendente: false, gestos: false, botao: null, certoVersao: 0, timer: 0,
      lugar: '', raiz: null, maoNaCaixa: -1e9, ouveCaixa: false, timerCartao: 0 };

    var $ = function (id) { return doc.getElementById(id); };
    function aviso(e) {
      try { if (win.console && win.console.warn) win.console.warn('[beyon] planta: ' + (e && e.message ? e.message : e)); } catch (x) { /* sem console */ }
    }

    /* ---- o botão no chat ---- */
    function tirarBotao() {
      if (st.botao && st.botao.parentNode) st.botao.parentNode.removeChild(st.botao);
      st.botao = null;
    }
    /* a fala do Zero de índice n_mensagens (a abertura fixa é o 1º item do DOM); se aquela posição não é fala do Zero, a mais próxima antes, ou a 1ª depois */
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
      var o = { origem: p.origem, editavel: E.planta_editavel === true, aoCerto: aoCerto, aoAjustar: aoAjustar, notaEmbaixo: true, som: tocar };
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
      win.addEventListener('scroll', aoRolar, { passive: true });
      win.addEventListener('resize', aoRolar);
    }
    function esconder() {
      soltarGestos();
      soltarCaixa();
      var faixa = $('o-planta');
      if (st.naTela && win.BZPlanta && win.BZPlanta.parar) { try { win.BZPlanta.parar(); } catch (e) { aviso(e); } }
      if (st.lugar === 'cartao') devolverCartao();
      if (faixa) faixa.hidden = true;
      st.naTela = false; st.pendente = false; st.recolhida = false; st.lugar = ''; st.raiz = null;
    }

    /* ---- o cartão da conversa (celular) ---- */
    var computador = function () { return !!(win.matchMedia && win.matchMedia(COMPUTADOR).matches); };
    var esboco = function () { return win.BZOrcEsboco && typeof win.BZOrcEsboco.paraConsagrar === 'function' ? win.BZOrcEsboco : null; };
    /* abaixo de 960 px, com o esboço na página: a planta vai para o cartão. Sem ele (ou no computador), a faixa de sempre */
    var noCartao = function () { return !computador() && !!esboco(); };
    function tocar(nome) { if (win.BZPlantaSom && typeof win.BZPlantaSom.tocar === 'function') win.BZPlantaSom.tocar(nome); }
    function devolverCartao() { var e = esboco(); if (e && e.devolver) { try { e.devolver(); } catch (x) { aviso(x); } } }
    function marcarMao() { st.maoNaCaixa = Date.now(); }
    var GESTOS_NA_CAIXA = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'];
    function ouvirCaixa() {
      var caixa = $('o-log-caixa');
      if (!caixa || st.ouveCaixa) return;
      st.ouveCaixa = true;
      GESTOS_NA_CAIXA.forEach(function (t) { caixa.addEventListener(t, marcarMao, { passive: true }); });
    }
    function soltarCaixa() {
      var caixa = $('o-log-caixa');
      if (st.timerCartao) { win.clearTimeout(st.timerCartao); st.timerCartao = 0; }
      if (!st.ouveCaixa || !caixa) return;
      st.ouveCaixa = false;
      GESTOS_NA_CAIXA.forEach(function (t) { caixa.removeEventListener(t, marcarMao, { passive: true }); });
    }
    /* a caixa da conversa rola até o topo do cartão (a rolagem suave é a do CSS da caixa; com movimento reduzido ela é instantânea). Só a caixa */
    function rolarCaixaAoCartao() {
      var caixa = $('o-log-caixa'), raiz = st.raiz;
      if (!caixa || !raiz) return;
      caixa.scrollTop = Math.max(0, caixa.scrollTop + raiz.getBoundingClientRect().top - caixa.getBoundingClientRect().top - FOLGA);
    }
    /* depois de a fala aparecer: se a pessoa não mexeu na caixa à mão nos últimos 3 s, mostra o desenho; se mexeu, a entrada espera a vista */
    function talvezRolarAoCartao() {
      if (st.timerCartao) win.clearTimeout(st.timerCartao);
      st.timerCartao = win.setTimeout(function () {
        st.timerCartao = 0;
        try { if (st.lugar === 'cartao' && Date.now() - st.maoNaCaixa >= MAO_NA_CAIXA) rolarCaixaAoCartao(); } catch (e) { aviso(e); }
      }, ESPERA_CARTAO);
    }
    /* a faixa é o último bloco do <main>: nasce onde termina o último bloco visível antes dela (escondido ou sem altura não conta) */
    function referencia() {
      var faixa = $('o-planta'), el = faixa ? faixa.previousElementSibling : null;
      while (el) {
        if (!el.hidden) { var r = el.getBoundingClientRect(); if (r.height > 0) return r; }
        el = el.previousElementSibling;
      }
      return null;
    }
    function nasceFora() {
      var r = referencia(), alto = win.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 0;
      return !!r && r.bottom > alto;
    }
    function inserir() {
      var E = st.E, p = leve(E), faixa = $('o-planta');
      if (st.naTela && !st.recolhida) return true;
      if (st.naTela) {   /* recolhida: volta já montada */
        if (!faixa) return false;
        faixa.hidden = false; st.recolhida = false; st.pendente = false; soltarGestos();
        reconciliar();
        return true;
      }
      if (!p || !faixa || !st.valido || !win.BZPlanta) return false;
      /* celular: o cartão da conversa (o esboço entrega o lugar e os pontos para o voo); computador: a faixa, com o voo só se o esboço estiver à vista */
      var c = null, op = opcoes(E, p, false), r = null;
      if (noCartao()) { try { c = esboco().paraConsagrar(p.plano); } catch (e) { aviso(e); } }
      if (c && c.raiz) op.esboco = c.pontos;
      else { c = null; faixa.hidden = false; if (esboco() && esboco().pontosAVista) op.esboco = esboco().pontosAVista(p.plano); }
      try { r = win.BZPlanta.montar(c ? c.raiz : faixa, p.plano, op); } catch (e) { aviso(e); }
      if (!r || !r.ok) {
        if (c) devolverCartao(); else faixa.hidden = true;
        st.recusas++;
        if (r) aviso('montar recusou (' + (r.motivos || []).join(',') + ')');
        /* uma recusa pode ser só uma janela sem largura; na 2a (ou se lançou) o botão que leva a uma faixa que não nasce sai, e os gestos deixam de tentar */
        if (!r || st.recusas >= 2) { st.valido = false; st.pendente = false; tirarBotao(); soltarGestos(); }
        return false;
      }
      st.naTela = true; st.pendente = false; st.lugar = c ? 'cartao' : 'faixa'; st.raiz = c ? c.raiz : faixa;
      if (c) { ouvirCaixa(); talvezRolarAoCartao(); } else ouvirFormulario();
      st.assin = st.versao + '|' + p.origem + '|' + (E.planta_editavel === true) + '|' + st.json; st.mostrada = p.versao;
      soltarGestos();
      return true;
    }
    function tentar() {
      if (!st.pendente || (st.naTela && !st.recolhida)) return;
      if (noCartao()) { inserir(); return; }   /* o cartão já está na conversa: o desenho entra nele e a entrada espera a vista */
      if (nasceFora()) inserir();
      else esperarGestos();
    }
    function aoGesto() { if (st.pendente && (!st.naTela || st.recolhida) && !enviando()) inserir(); }
    function aoRolar() {
      if (st.timer) win.clearTimeout(st.timer);
      st.timer = win.setTimeout(function () { st.timer = 0; try { if (st.pendente && (!st.naTela || st.recolhida) && nasceFora()) inserir(); } catch (e) { aviso(e); } }, ESPERA_ROLAGEM);
    }
    function verAPlanta() {
      try {
        if ((!st.naTela || st.recolhida) && !inserir()) return;
        var faixa = st.raiz || $('o-planta');
        if (st.lugar === 'cartao') rolarCaixaAoCartao();   /* no celular quem rola é a caixa da conversa */
        else if (typeof st.deps.rolarAte === 'function') st.deps.rolarAte(faixa);
        var titulo = faixa.querySelector('h2');
        if (titulo) {
          if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
          titulo.focus({ preventScroll: true });
        }
      } catch (e) { aviso(e); }
    }

    /* Enviar o formulário troca o bloco acima da faixa (CLS 0,9 se à vista): recolhe no envio; volta quando a posição sai da tela ou num gesto (não durante o envio).
       DEPENDE DA ORDEM: o handler de js/orcamento-detalhes.js roda antes e marca aria-busy síncrono só se aceita o envio. */
    function enviando() { var form = $('o-detalhes-form'); return !!form && form.getAttribute('aria-busy') === 'true'; }
    function aoEnviarFormulario() {
      var faixa = $('o-planta');
      if (!st.naTela || st.lugar !== 'faixa' || st.recolhida || !faixa || !enviando()) return;
      faixa.hidden = true; st.recolhida = true; st.pendente = true;
      tentar();
    }
    function ouvirFormulario() {
      var form = $('o-detalhes-form');
      if (form && !st.ouveForm) { st.ouveForm = true; form.addEventListener('submit', aoEnviarFormulario); }
    }

    /* ---- os botões da faixa ---- */
    var editavel = function () { return !!st.E && st.E.planta_editavel === true; };
    /* o servidor já tem o texto do botão DEPOIS da fala desta planta: a versão está confirmada, mesmo que esta página nunca tenha visto o envio acabar (F5, rede que voltou, releitura de fundo) */
    function jaConfirmada() {
      var p = leve(st.E), m = p && st.E.mensagens, i;
      if (!Array.isArray(m)) return false;
      for (i = p.n_mensagens + 1; i < m.length; i++) if (m[i] && m[i].papel !== 'agente' && limpo(m[i].conteudo, 60) === TEXTO_CERTO) return true;
      return false;
    }
    /* enviar() devolve false se não aceitou (conversa ocupada) ou falhou sem gravar: só o envio aceito gasta a versão. Marca já (dois cliques = um envio) e solta se recusar,
       rejeitar ou lançar; sem retorno vale como aceito */
    /* devolve ao desenho: false (não vai), 'duplicada', uma promessa do envio ou true */
    function aoCerto() {
      if (!editavel()) return false;
      if (st.certoVersao === st.versao || jaConfirmada()) return 'duplicada';
      if (typeof st.deps.enviar !== 'function') return false;
      var versao = st.versao, r;
      st.certoVersao = versao;
      function liberar() { if (st.certoVersao === versao) st.certoVersao = 0; }
      try { r = st.deps.enviar(TEXTO_CERTO); } catch (e) { aviso(e); liberar(); return false; }
      if (r && typeof r.then === 'function') {
        return r.then(function (aceitou) { if (aceitou === false) liberar(); return aceitou !== false; }, function (e) { aviso(e); liberar(); return false; });
      }
      if (r === false) liberar();
      return r !== false;
    }
    function aoAjustar() {
      if (!editavel()) return;
      var t = $('o-texto'), form = $('o-form');
      if (!t) return;
      t.placeholder = DICA_AJUSTE;
      /* a faixa fica longe da conversa: rola como "Perguntar ao consultor" e foca sem rolar de novo */
      if (form && typeof form.scrollIntoView === 'function') form.scrollIntoView({ block: 'center' });
      t.focus({ preventScroll: true });
    }

    /* ---- o carregamento sob demanda ---- */
    /* O desenho lê os outros três ao carregar: a ordem é a da lista. Depois de uma falha só baixa o que falta (do módulo que falhou em diante e o CSS se não chegou), tirando
       o elemento velho do <head>; a nova tentativa só começa quando todo o lote anterior se resolveu. */
    function anexar(url, tipo, aoFim) {
      var velho = st.elementos[url];
      if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
      var e = doc.createElement(tipo);
      if (tipo === 'link') {
        e.rel = 'stylesheet';
        e.href = CSS_DA_FAIXA;
      } else {
        e['async'] = false;
        e.src = url;
      }
      e.addEventListener('load', function () { st.pegos[url] = true; aoFim(true); });
      e.addEventListener('error', function () {
        if (e.parentNode) e.parentNode.removeChild(e);
        delete st.elementos[url];
        aoFim(false);
      });
      st.elementos[url] = e;
      doc.head.appendChild(e);
    }
    function carregar() {
      st.carga = 'indo';
      var primeira = -1, i, falta = 0, falhou = false;
      for (i = 0; i < MODULOS.length && primeira < 0; i++) if (!st.pegos[MODULOS[i]]) primeira = i;
      if (primeira >= 0) for (i = primeira; i < MODULOS.length; i++) delete st.pegos[MODULOS[i]];
      var lista = [];
      if (!st.pegos[CSS_DA_FAIXA]) lista.push([CSS_DA_FAIXA, 'link']);   /* o CSS vem junto, sob demanda: com a flag desligada a página não paga nem o CSS bloqueante nem os bytes */
      if (primeira >= 0) for (i = primeira; i < MODULOS.length; i++) lista.push([MODULOS[i], 'script']);
      if (!lista.length) { st.carga = 'ok'; seguir(); return; }
      falta = lista.length;
      function fim(deuCerto) {
        if (!deuCerto) falhou = true;
        if (--falta > 0) return;
        if (falhou) {
          st.carga = 'falhou'; st.versaoFalha = st.versao;
          aviso('não consegui baixar os módulos ou o CSS');
          recolher();
        } else { st.carga = 'ok'; seguir(); }
      }
      for (i = 0; i < lista.length; i++) anexar(lista[i][0], lista[i][1], fim);
    }

    /* ---- o fluxo ---- */
    function seguir() {
      var E = st.E, p = leve(E);
      if (!p) return sumir();
      var Forma = win.BZPlantaForma;
      if (!Forma || !win.BZPlanta) {
        if (!st.avisouModulos) { st.avisouModulos = true; aviso('módulos incompletos'); }
        return recolher();
      }
      var json = JSON.stringify(p.plano);
      if (json !== st.json) {
        var v = Forma.validarFormaPlano(p.plano);
        st.json = json; st.valido = !!(v && v.ok); st.recusas = 0;
        if (!st.valido) aviso('planta recusada pela forma (' + ((v && v.motivos) || []).join(',') + ')');
      }
      if (!st.valido) return recolher();   /* a planta recusada fica anotada (st.json): esconde e cala, sem revalidar nem avisar a cada render */
      st.versao = p.versao;
      colocarBotao(E, p);
      if (st.naTela) {
        if (st.recolhida) { st.pendente = true; tentar(); return; }
        reconciliar();
        return;
      }
      st.pendente = true;
      tentar();
    }
    /* leva ao desenho o estado de agora, ao ler o estado ou na volta de recolhida (escondida não tem largura); versão ainda não mostrada = ajuste */
    function reconciliar() {
      var E = st.E, p = leve(E);
      if (!p || !st.valido || !st.naTela || st.recolhida || !win.BZPlanta) return;
      var assin = p.versao + '|' + p.origem + '|' + (E.planta_editavel === true) + '|' + st.json;
      if (assin === st.assin) return;   /* nada mudou para o desenho: não o chama de novo a cada leitura do estado */
      var nova = p.versao !== st.mostrada;
      st.assin = assin; st.mostrada = p.versao;
      var r = win.BZPlanta.atualizar(p.plano, opcoes(E, p, nova));
      if (r && r.ok === false) aviso('atualizar recusou (' + (r.motivos || []).join(',') + ')');
    }
    /* esconde e tira o botão, mas lembra o que já foi julgado (planta recusada não é revalidada nem avisada de novo) */
    function recolher() { esconder(); tirarBotao(); }
    /* a planta saiu do estado: esquece tudo o que valia para ela */
    function sumir() {
      recolher();
      st.json = ''; st.valido = false; st.recusas = 0; st.avisouModulos = false; st.assin = '';
    }

    function atualizar(E, deps) {
      try {
        if (deps && typeof deps === 'object') st.deps = deps;
        var p = leve(E);
        st.E = E;   /* sempre o estado mais novo: se a planta some durante o download, quando os módulos chegam não há o que montar */
        if (!p) { if (st.naTela || st.botao || st.pendente || st.gestos || st.json) sumir(); return; }
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
