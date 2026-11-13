/* ==========================================================================
   OS TOQUES NA CONVERSA (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md, seções 1, 2, 3 e 4).
   A página abre na conversa com o Zero; as perguntas fixas (ramo, objetivos, site, logo e textos, e a dor) são falas dele com
   opções para tocar, dentro da própria caixa da conversa (#o-log). Nada vai ao banco antes da 1ª mensagem de texto: os toques
   ficam aqui (pendentes) e seguem junto dela (js/orcamento.js, enviar). A cada toque a conta silenciosa (js/orcamento-perguntas.js,
   BZPerguntas.definir) preenche os cantos do radar; o VALOR espera o caso (reterValor), até a página liberá-lo (liberarValor).
   Sem o consultor (sem chave, ou "Seguir tocando" depois de uma falha), a dor também é por toques e o passo 6 é o resumo fixo,
   montado só de listas fechadas (js/orcamento-rotulos.js); então o valor da conta aparece.
   Todo texto por textContent. ES5 sintático, como os módulos da planta.
   ========================================================================== */
(function () {
  'use strict';
  var R = window.BZOrcRotulos;
  var doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  if (!R || !$('o-log')) return;

  var FALAS = {
    objetivos: 'E o que o site precisa trazer para você? Pode tocar em mais de um.',
    site: 'Duas coisas práticas. Já tem site ou endereço próprio?',
    material: 'E logo e textos, você já tem?',
    dor: 'Agora me conta como os clientes chegam até você hoje e o que mais dá trabalho no dia a dia. Pode escrever do seu jeito ou tocar no que for a sua cara.',
    dorSem: 'Agora me conta como os clientes chegam até você hoje e o que mais dá trabalho. Toque no que for a sua cara.',
    outro: 'Qual é o seu negócio, em poucas palavras?',
    mudar: 'Claro. Toque no que mudou e depois em "Pronto".'
  };
  var PRONTO = 'Pronto', NAO_SEI = 'Não sei, escolha por mim', OUTRO_MAX = 60;

  var s = { iniciado: false, consultor: true, passo: null, respostas: { objetivos: [] }, situacao: [], entregue: false, liberado: false, aEnviar: null };
  var ultimoE = null;

  /* ---------- a caixa da conversa ---------- */
  function el(tag, classe, texto) { var e = doc.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function ficaNoFim() { var u = $('o-log').lastElementChild; return u && u.hasAttribute('data-fica') ? u : null; }
  function rolar() { var c = $('o-log-caixa'); if (c) c.scrollTop = c.scrollHeight; }
  function inserir(li) { li.setAttribute('data-toque', ''); $('o-log').insertBefore(li, ficaNoFim()); rolar(); return li; }
  function fala(texto) { var li = el('li', 'msg msg--agente'); li.appendChild(el('p', '', texto)); return inserir(li); }
  function bolha(texto) { var li = el('li', 'msg msg--visitante'); li.appendChild(el('p', '', texto)); return inserir(li); }
  /* um grupo de opções. multi: botões de alternar (aria-pressed) e "Pronto"; senão, o toque já responde */
  function opcoes(rotulo, itens, aoEscolher, o) {
    o = o || {};
    var li = el('li', 'orc-toque'), grupo = el('div', 'orc-toque__ops'), escolhidos = (o.marcados || []).slice(), botoes = [];
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', rotulo);
    itens.forEach(function (it) {
      var b = el('button', 'orc-op orc-op--toque', it.rotulo);
      b.type = 'button';
      b.setAttribute('data-valor', it.valor);
      if (o.multi) b.setAttribute('aria-pressed', String(escolhidos.indexOf(it.valor) >= 0));
      b.addEventListener('click', function () {
        if (li.hasAttribute('data-feito')) return;
        if (!o.multi) { fechar(li, b); aoEscolher(it.valor, it.rotulo); return; }
        var i = escolhidos.indexOf(it.valor);
        if (i >= 0) escolhidos.splice(i, 1); else escolhidos.push(it.valor);
        b.setAttribute('aria-pressed', String(i < 0));
        if (pronto) pronto.disabled = !escolhidos.length && !o.prontoVazio;
      });
      botoes.push(b);
      grupo.appendChild(b);
    });
    li.appendChild(grupo);
    var pronto = null;
    if (o.multi) {
      pronto = el('button', 'btn btn--primary btn--sm orc-toque__pronto', o.textoPronto || PRONTO);
      pronto.type = 'button';
      pronto.disabled = !escolhidos.length && !o.prontoVazio;
      pronto.addEventListener('click', function () {
        if (li.hasAttribute('data-feito')) return;
        var rotulos = itens.filter(function (it) { return escolhidos.indexOf(it.valor) >= 0; }).map(function (it) { return it.rotulo; });
        fechar(li, null);
        aoEscolher(escolhidos.slice(), rotulos);
      });
      li.appendChild(pronto);
    }
    if (o.naoSei) {
      var ns = el('button', 'orc-toque__naosei', NAO_SEI);
      ns.type = 'button';
      ns.addEventListener('click', function () { if (li.hasAttribute('data-feito')) return; fechar(li, null); aoEscolher(null, null); });
      li.appendChild(ns);
    }
    inserir(li);
    if (o.focar !== false && botoes[0] && podeFocar()) botoes[0].focus({ preventScroll: true });
    return li;
  }
  /* depois do toque o grupo vira registro: tudo desligado, o escolhido marcado (o leitor de tela lê a resposta na bolha da pessoa) */
  function fechar(li, escolhido) {
    li.setAttribute('data-feito', '');
    [].forEach.call(li.querySelectorAll('button, input'), function (b) { b.disabled = true; });
    if (escolhido) escolhido.classList.add('is-escolhida');
  }
  /* o foco só segue os toques com mouse ou teclado; no toque, focar um botão rolaria a página (a caixa já rola sozinha) */
  function podeFocar() { return !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches); }
  var itensDe = function (mapa, chaves) { return (chaves || Object.keys(mapa)).map(function (k) { return { valor: k, rotulo: mapa[k] }; }); };

  /* ---------- a conta silenciosa: o radar se preenche a cada toque ---------- */
  function contar() {
    if (window.BZPerguntas && typeof window.BZPerguntas.definir === 'function') window.BZPerguntas.definir(s.respostas);
  }

  /* ---------- os passos ---------- */
  function passoRamo() {
    s.passo = 'ramo';
    opcoes('Que tipo de negócio é o seu?', itensDe(R.RAMOS), function (ramo, rotulo) {
      if (ramo === 'outro') { passoOutro(); return; }
      s.respostas = comCampo(s.respostas, 'ramo', ramo);
      bolha(rotulo);
      contar();
      passoObjetivos();
    }, { focar: false });
  }
  /* "Outro": uma escrita curta, que vai só ao briefing (nunca como mensagem) e no tamanho que o servidor guarda */
  function passoOutro() {
    s.passo = 'outro';
    fala(FALAS.outro);
    var li = el('li', 'orc-toque orc-toque--outro'), campo = el('input', 'orc-toque__campo'), seguir = el('button', 'btn btn--primary btn--sm', 'Seguir');
    campo.maxLength = OUTRO_MAX; campo.autocomplete = 'off'; campo.setAttribute('aria-label', 'Qual é o seu negócio');
    seguir.type = 'button';
    function ir() {
      var t = campo.value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, OUTRO_MAX);
      if (!t || li.hasAttribute('data-feito')) return;
      fechar(li, null);
      s.respostas = comCampo(comCampo(s.respostas, 'ramo', 'outro'), 'outro', t);
      bolha(t);
      contar();
      passoObjetivos();
    }
    seguir.addEventListener('click', ir);
    campo.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); ir(); } });
    li.appendChild(campo); li.appendChild(seguir);
    inserir(li);
    campo.focus({ preventScroll: true });
  }
  function passoObjetivos() {
    s.passo = 'objetivos';
    fala(FALAS.objetivos);
    opcoes('O que o site precisa trazer', itensDe(R.OBJETIVOS), function (lista, rotulos) {
      s.respostas = comCampo(s.respostas, 'objetivos', lista || []);
      bolha(lista && lista.length ? rotulos.join(' · ') : NAO_SEI);
      contar();
      passoSite();
    }, { multi: true, naoSei: true });
  }
  function passoSite() {
    s.passo = 'site';
    fala(FALAS.site);
    opcoes('Já tem site ou endereço próprio?', itensDe(R.SITE_ATUAL), function (v, rotulo) {
      s.respostas = v ? comCampo(s.respostas, 'site_atual', v) : semCampo(s.respostas, 'site_atual');
      bolha(rotulo || NAO_SEI);
      contar();
      passoMaterial();
    }, { naoSei: true });
  }
  function passoMaterial() {
    s.passo = 'material';
    fala(FALAS.material);
    opcoes('Logo e textos', itensDe(R.MATERIAL), function (v, rotulo) {
      s.respostas = v ? comCampo(s.respostas, 'material', v) : semCampo(s.respostas, 'material');
      bolha(rotulo || NAO_SEI);
      contar();
      passoDor();
    }, { naoSei: true });
  }
  /* a dor: com o consultor, escrever é o caminho principal e as sugestões ajudam (o "Pronto" manda os rótulos como a fala dela);
     sem ele, só as sugestões, e depois o resumo fixo */
  function passoDor() {
    s.passo = 'dor';
    fala(s.consultor ? FALAS.dor : FALAS.dorSem);
    var ramo = s.respostas.ramo && R.SUGESTOES_POR_RAMO[s.respostas.ramo] ? s.respostas.ramo : 'outro';
    var itens = R.SUGESTOES_POR_RAMO[ramo].map(function (c) { return { valor: c, rotulo: R.SUGESTOES[c].rotulo }; });
    opcoes('Como os clientes chegam e o que dá trabalho', itens, function (cods, rotulos) {
      s.situacao = cods || [];
      if (s.consultor) {
        if (window.BZOrcConversa && typeof window.BZOrcConversa.enviar === 'function') window.BZOrcConversa.enviar(rotulos.join('; '));
        return;
      }
      bolha(rotulos && rotulos.length ? rotulos.join(' · ') : NAO_SEI);
      resumoSemConsultor();
    }, { multi: true, naoSei: !s.consultor, focar: !s.consultor });
    if (s.consultor && $('o-texto') && podeFocar()) $('o-texto').focus({ preventScroll: true });
  }
  /* o passo 6 sem o consultor: o que o site faz por ela (listas fechadas), e então o valor da conta */
  function resumoSemConsultor() {
    s.passo = 'resumo';
    fala(R.resumoFixo(s.respostas, s.situacao));
    setTimeout(liberarValor, ESPERA_VALOR_MS);
  }
  var ESPERA_VALOR_MS = 1200;

  /* ---------- "Mudar o que eu respondi": as perguntas fixas de novo, dentro da conversa, com as respostas de agora marcadas ---------- */
  function reabrir() {
    var novas = copiar(s.respostas);
    fala(FALAS.mudar);
    /* (os quatro grupos ficam abertos juntos: um "Pronto" no fim fecha todos) */
    var li = el('li', 'orc-toque orc-toque--mudar');
    li.appendChild(grupoMarcavel('Tipo de negócio', itensDe(R.RAMOS, Object.keys(R.RAMOS).filter(function (k) { return k !== 'outro' || novas.ramo === 'outro'; })), [novas.ramo], false, function (v) { novas.ramo = v[0]; }));
    li.appendChild(grupoMarcavel('O que o site precisa trazer', itensDe(R.OBJETIVOS), novas.objetivos || [], true, function (v) { novas.objetivos = v; }));
    li.appendChild(grupoMarcavel('Já tem site?', itensDe(R.SITE_ATUAL), [novas.site_atual], false, function (v) { novas.site_atual = v[0]; }));
    li.appendChild(grupoMarcavel('Logo e textos', itensDe(R.MATERIAL), [novas.material], false, function (v) { novas.material = v[0]; }));
    var pronto = el('button', 'btn btn--primary btn--sm orc-toque__pronto', PRONTO);
    pronto.type = 'button';
    pronto.addEventListener('click', function () { if (li.hasAttribute('data-feito')) return; fechar(li, null); concluirMudanca(novas); });
    li.appendChild(pronto);
    inserir(li);
  }
  /* um grupo de marcar (um ou vários) sem fechar sozinho: o "Pronto" do bloco fecha */
  function grupoMarcavel(rotulo, itens, marcados, multi, aoMudar) {
    var grupo = el('div', 'orc-toque__ops'), atual = marcados.filter(Boolean);
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-label', rotulo);
    var botoes = itens.map(function (it) {
      var b = el('button', 'orc-op orc-op--toque', it.rotulo);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(atual.indexOf(it.valor) >= 0));
      b.addEventListener('click', function () {
        if (multi) { var i = atual.indexOf(it.valor); if (i >= 0) atual.splice(i, 1); else atual.push(it.valor); }
        else atual = [it.valor];
        botoes.forEach(function (x, j) { x.setAttribute('aria-pressed', String(atual.indexOf(itens[j].valor) >= 0)); });
        aoMudar(atual.slice());
      });
      grupo.appendChild(b);
      return b;
    });
    var bloco = el('div', 'orc-toque__bloco');
    bloco.appendChild(el('p', 'orc-toque__titulo', rotulo));
    bloco.appendChild(grupo);
    return bloco;
  }
  function concluirMudanca(novas) {
    var fala = R.falaDoMudar(novas);
    s.respostas = novas;
    contar();
    if (!fala) return;
    /* com o consultor e a conversa já no servidor, a mudança vai como a fala montada (o servidor confere o molde); antes disso, ou sem ele, fica aqui */
    if (s.consultor && s.entregue && window.BZOrcConversa && typeof window.BZOrcConversa.enviar === 'function') {
      s.aEnviar = { respostas: soMudanca(novas) };
      window.BZOrcConversa.enviar(fala);
      return;
    }
    bolha(fala.slice(R.MOLDE_MUDAR.length));
    if (!s.consultor && s.liberado) document.dispatchEvent(new CustomEvent('bz:valor-liberado'));
  }
  var soMudanca = function (r) { var o = {}; ['ramo', 'outro', 'objetivos', 'site_atual', 'material'].forEach(function (k) { if (r[k] !== undefined && r[k] !== '') o[k] = r[k]; }); return o; };

  /* ---------- utilidades sem mutação ---------- */
  function copiar(o) { return JSON.parse(JSON.stringify(o || {})); }
  function comCampo(o, k, v) { var c = copiar(o); c[k] = v; return c; }
  function semCampo(o, k) { var c = copiar(o); delete c[k]; return c; }

  /* ---------- o valor ---------- */
  function fluxoNovo(E) { return s.iniciado || !!(E && E.conversa && E.conversa.briefing && E.conversa.briefing.fluxo_conversa === true); }
  function reterValor(E) { var e = E || ultimoE; return !s.liberado && fluxoNovo(e); }
  function liberarValor() {
    if (s.liberado) return;
    s.liberado = true;
    document.dispatchEvent(new CustomEvent('bz:valor-liberado'));
  }

  window.BZToques = {
    /* numa conversa nova: o 1º passo (a fala do ramo é a abertura fixa da página, o 1º item da caixa) */
    iniciar: function (o) {
      if (s.iniciado) return;
      s.iniciado = true;
      s.consultor = !(o && o.consultor === false);
      passoRamo();
    },
    /* o que segue junto da próxima mensagem (null: nada). Na 1ª, os toques (e, no passo da dor, responde: 'dor' e as sugestões tocadas) */
    pendentes: function () {
      if (s.aEnviar) return s.aEnviar.respostas;
      if (!s.iniciado || s.entregue) return null;
      var r = soMudanca(s.respostas);
      if (s.passo === 'dor') { r.responde = 'dor'; if (s.situacao.length) r.situacao = s.situacao.slice(); }
      return r;
    },
    /* a mensagem entrou: os toques foram junto; as perguntas fixas que faltavam saem de cena (o Zero pergunta conversando) */
    entregues: function () {
      s.aEnviar = null;
      if (s.entregue) return;
      s.entregue = true;
      [].forEach.call($('o-log').querySelectorAll('[data-toque].orc-toque:not([data-feito])'), function (li) { fechar(li, null); });
    },
    atualizar: function (E) { ultimoE = E || null; },
    comConsultor: function () { return s.consultor; },
    ativo: function () { return s.iniciado; },
    reterValor: reterValor,
    liberarValor: liberarValor,
    reabrir: reabrir,
    /* "Seguir tocando nas opções" (a IA caiu): daqui em diante, sem consultor. Se a dor ainda não foi, ela vem por toques; se já foi, o resumo fixo */
    semConsultor: function () {
      if (!s.consultor) return;
      s.consultor = false;
      if (!s.iniciado) { s.iniciado = true; passoRamo(); return; }
      if (s.liberado) return;
      if (s.passo === 'dor' || s.entregue) {
        [].forEach.call($('o-log').querySelectorAll('[data-toque].orc-toque:not([data-feito])'), function (li) { fechar(li, null); });
        s.entregue = false;
        passoDor();
      }
    },
    situacao: function () { return s.situacao.slice(); }
  };
})();
