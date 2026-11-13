/* ==========================================================================
   OS TOQUES NA CONVERSA (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md, seções 1, 2, 3 e 4).
   A página abre na conversa com o Zero; as perguntas fixas (ramo, objetivos, site, logo e textos, e a dor) são falas dele com
   opções para tocar, dentro da própria caixa da conversa (#o-log). Nada vai ao banco antes da 1ª mensagem de texto: os toques
   ficam aqui (pendentes) e seguem junto dela (js/orcamento.js, enviar). A cada toque a conta silenciosa (js/orcamento-perguntas.js,
   BZPerguntas.definir) preenche os cantos do radar; o VALOR espera o caso (reterValor), até a página liberá-lo (liberarValor).
   Sem o consultor (sem chave, ou "Seguir tocando" depois de uma falha), a dor também é por toques e o passo 6 é o resumo fixo,
   montado só de listas fechadas (js/orcamento-rotulos.js); então o valor da conta aparece.
   Acessibilidade (revisão de 13/11): cada fala nova é anunciada (#o-voz, pela página), o grupo é rotulado pela própria fala, o foco
   nunca se perde quando um grupo respondido sai de cena (vai ao próximo grupo, à caixa de texto ou à conversa) e segue os toques
   sempre que eles vieram do teclado; o "Pronto" vazio fica focável (aria-disabled) e diz o que falta.
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
  var PRONTO = 'Pronto', NAO_SEI = 'Não sei, escolha por mim', OUTRO_MAX = 60, FALTA_ESCOLHER = 'Escolha ao menos uma opção.';
  var ESPERA_RESUMO_MS = 1200;   /* (o respiro entre o resumo fixo e o valor, o mesmo do cartão da planta) */

  var s = { iniciado: false, consultor: true, passo: null, respostas: { objetivos: [] }, situacao: [], entregue: false, liberado: false, aEnviar: null };
  var ultimoE = null, nFala = 0, ultimaFala = null, porTeclado = false, focoPendente = false, mudanca = null;

  /* ---------- a caixa da conversa ---------- */
  function el(tag, classe, texto) { var e = doc.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function ficaNoFim() { var u = $('o-log').lastElementChild; return u && u.hasAttribute('data-fica') ? u : null; }
  function rolar() { var c = $('o-log-caixa'); if (c) c.scrollTop = c.scrollHeight; }
  /* (o que nasce DEPOIS de a conversa ir ao servidor é tardio: a página o recoloca depois das falas do servidor, js/orcamento.js conversa()) */
  function inserir(li) { li.setAttribute('data-toque', ''); if (s.entregue) li.setAttribute('data-toque-tardio', ''); $('o-log').insertBefore(li, ficaNoFim()); rolar(); return li; }
  function anunciar(texto) { var c = window.BZOrcConversa; if (c && typeof c.anunciar === 'function') c.anunciar(texto); }
  /* semVoz: o foco vai direto a um campo rotulado por esta fala (o leitor a lê pelo foco; anunciar de novo a repetiria) */
  function fala(texto, semVoz) {
    var li = el('li', 'msg msg--agente'), p = el('p', '', texto);
    p.id = 'o-toque-fala-' + (++nFala);
    ultimaFala = p.id;
    li.appendChild(p);
    inserir(li);
    if (!semVoz) anunciar('Zero: ' + texto);
    return li;
  }
  function bolha(texto) { var li = el('li', 'msg msg--visitante'); li.appendChild(el('p', '', texto)); return inserir(li); }
  /* o foco: segue os toques quando vieram do teclado (ou com mouse); no toque com o dedo, só se o grupo que tinha o foco saiu de cena */
  function podeFocar() { return !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches); }
  function focar(alvo) { if (alvo && typeof alvo.focus === 'function') alvo.focus({ preventScroll: true }); }
  /* para onde o foco vai quando não há grupo novo: a caixa de texto (com o consultor) ou a própria conversa */
  function focarSaida() {
    if (!focoPendente && !porTeclado) return;
    focoPendente = false;
    var t = $('o-texto'), form = $('o-form');
    focar(s.consultor && t && form && !form.hidden ? t : $('o-log-caixa'));
  }
  /* um grupo de opções. multi: botões de alternar (aria-pressed) e "Pronto"; senão, o toque já responde. O grupo é rotulado pela fala logo acima */
  function opcoes(rotulo, itens, aoEscolher, o) {
    o = o || {};
    var li = el('li', 'orc-toque'), grupo = el('div', 'orc-toque__ops'), escolhidos = (o.marcados || []).slice(), botoes = [], pronto = null;
    grupo.setAttribute('role', 'group');
    if (o.falaId) grupo.setAttribute('aria-labelledby', o.falaId); else grupo.setAttribute('aria-label', rotulo);
    function atualizarPronto() { if (pronto) pronto.setAttribute('aria-disabled', String(!escolhidos.length && !o.prontoVazio)); }
    itens.forEach(function (it) {
      var b = el('button', 'orc-op orc-op--toque', it.rotulo);
      b.type = 'button';
      b.setAttribute('data-valor', it.valor);
      if (o.multi) b.setAttribute('aria-pressed', String(escolhidos.indexOf(it.valor) >= 0));
      b.addEventListener('click', function (ev) {
        if (li.hasAttribute('data-feito')) return;
        porTeclado = !!ev && ev.detail === 0;
        if (!o.multi) { fechar(li, b); aoEscolher(it.valor, it.rotulo); return; }
        var i = escolhidos.indexOf(it.valor);
        if (i >= 0) escolhidos.splice(i, 1); else escolhidos.push(it.valor);
        b.setAttribute('aria-pressed', String(i < 0));
        atualizarPronto();
      });
      botoes.push(b);
      grupo.appendChild(b);
    });
    li.appendChild(grupo);
    if (o.multi) {
      pronto = el('button', 'btn btn--primary btn--sm orc-toque__pronto', o.textoPronto || PRONTO);
      pronto.type = 'button';
      if (o.falaId) pronto.setAttribute('aria-describedby', o.falaId);
      atualizarPronto();
      pronto.addEventListener('click', function (ev) {
        if (li.hasAttribute('data-feito')) return;
        porTeclado = !!ev && ev.detail === 0;
        if (!escolhidos.length && !o.prontoVazio) { anunciar(FALTA_ESCOLHER); return; }
        var rotulos = itens.filter(function (it) { return escolhidos.indexOf(it.valor) >= 0; }).map(function (it) { return it.rotulo; });
        fechar(li, null);
        aoEscolher(escolhidos.slice(), rotulos);
      });
      li.appendChild(pronto);
    }
    if (o.naoSei) {
      var ns = el('button', 'orc-toque__naosei', NAO_SEI);
      ns.type = 'button';
      ns.addEventListener('click', function (ev) { if (li.hasAttribute('data-feito')) return; porTeclado = !!ev && ev.detail === 0; fechar(li, null); aoEscolher(null, null); });
      li.appendChild(ns);
    }
    inserir(li);
    if (botoes[0] && !o.semFoco && (focoPendente || porTeclado || (o.focar !== false && podeFocar()))) { focoPendente = false; focar(botoes[0]); }
    return li;
  }
  /* depois do toque o grupo vira registro e sai de cena (a resposta fica na bolha da pessoa). Se o foco estava nele, o próximo passo o recebe */
  function fechar(li, escolhido) {
    if (doc.activeElement && li.contains(doc.activeElement)) focoPendente = true;
    li.setAttribute('data-feito', '');
    [].forEach.call(li.querySelectorAll('button, input'), function (b) { b.disabled = true; });
    if (escolhido) escolhido.classList.add('is-escolhida');
  }
  /* (os passos do pedido, data-pedido, são do js/orcamento-pedido.js: seguem abertos quando a conversa vai ao servidor ou o consultor cai) */
  function fecharAbertos() { [].forEach.call($('o-log').querySelectorAll('[data-toque].orc-toque:not([data-feito]):not([data-pedido])'), function (li) { fechar(li, null); }); }
  var itensDe = function (mapa, chaves) { return (chaves || Object.keys(mapa)).map(function (k) { return { valor: k, rotulo: mapa[k] }; }); };

  /* ---------- a conta silenciosa: o radar se preenche a cada toque ---------- */
  function contar() {
    if (window.BZPerguntas && typeof window.BZPerguntas.definir === 'function') window.BZPerguntas.definir(s.respostas);
  }

  /* ---------- os passos ---------- */
  function passoRamo() {
    s.passo = 'ramo';
    /* (a pergunta do ramo é a abertura fixa da página, o 1º item da caixa) */
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
    campo.maxLength = OUTRO_MAX; campo.autocomplete = 'off'; campo.setAttribute('aria-labelledby', ultimaFala);
    seguir.type = 'button';
    function ir() {
      var t = campo.value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, OUTRO_MAX);
      if (li.hasAttribute('data-feito')) return;
      if (!t) { anunciar('Escreva o tipo do seu negócio.'); return; }
      fechar(li, null);
      s.respostas = comCampo(comCampo(s.respostas, 'ramo', 'outro'), 'outro', t);
      bolha(t);
      contar();
      passoObjetivos();
    }
    seguir.addEventListener('click', function (ev) { porTeclado = !!ev && ev.detail === 0; ir(); });
    campo.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); porTeclado = true; ir(); } });
    li.appendChild(campo); li.appendChild(seguir);
    inserir(li);
    focoPendente = false;
    focar(campo);
  }
  function passoObjetivos() {
    s.passo = 'objetivos';
    fala(FALAS.objetivos);
    opcoes('O que o site precisa trazer', itensDe(R.OBJETIVOS), function (lista, rotulos) {
      s.respostas = comCampo(s.respostas, 'objetivos', lista || []);
      bolha(lista && lista.length ? rotulos.join(' · ') : NAO_SEI);
      contar();
      passoSite();
    }, { multi: true, naoSei: true, falaId: ultimaFala });
  }
  function passoSite() {
    s.passo = 'site';
    fala(FALAS.site);
    opcoes('Já tem site ou endereço próprio?', itensDe(R.SITE_ATUAL), function (v, rotulo) {
      s.respostas = v ? comCampo(s.respostas, 'site_atual', v) : semCampo(s.respostas, 'site_atual');
      bolha(rotulo || NAO_SEI);
      contar();
      passoMaterial();
    }, { naoSei: true, falaId: ultimaFala });
  }
  function passoMaterial() {
    s.passo = 'material';
    fala(FALAS.material);
    opcoes('Logo e textos', itensDe(R.MATERIAL), function (v, rotulo) {
      s.respostas = v ? comCampo(s.respostas, 'material', v) : semCampo(s.respostas, 'material');
      bolha(rotulo || NAO_SEI);
      contar();
      passoDor();
    }, { naoSei: true, falaId: ultimaFala });
  }
  /* a dor: com o consultor, escrever é o caminho principal e as sugestões ajudam (o "Pronto" manda os rótulos como a fala dela);
     sem ele, só as sugestões, e depois o resumo fixo */
  function passoDor() {
    s.passo = 'dor';
    fala(s.consultor ? FALAS.dor : FALAS.dorSem);
    opcoesDor([]);
  }
  function opcoesDor(marcados) {
    var ramo = s.respostas.ramo && R.SUGESTOES_POR_RAMO[s.respostas.ramo] ? s.respostas.ramo : 'outro';
    var itens = R.SUGESTOES_POR_RAMO[ramo].map(function (c) { return { valor: c, rotulo: R.SUGESTOES[c].rotulo }; });
    var consultor = s.consultor;
    opcoes('Como os clientes chegam e o que dá trabalho', itens, function (cods, rotulos) {
      s.situacao = cods || [];
      if (consultor && s.consultor) {
        var c = window.BZOrcConversa;
        if (!c || typeof c.enviar !== 'function') return;
        /* (o envio não entrou: a conversa estava ocupada ou a falha não gravou. As sugestões voltam, com o que ela tinha marcado) */
        Promise.resolve(c.enviar(rotulos.join('; '))).then(function (entrou) { if (entrou === false && !s.entregue) opcoesDor(s.situacao); }, function () { if (!s.entregue) opcoesDor(s.situacao); });
        focarSaida();
        return;
      }
      bolha(rotulos && rotulos.length ? rotulos.join(' · ') : NAO_SEI);
      resumoSemConsultor();
    }, { multi: true, naoSei: !consultor, focar: !consultor, semFoco: consultor, falaId: ultimaFala, marcados: marcados });
    /* com o consultor, escrever é o caminho principal da dor: o foco (do teclado, do grupo que saiu de cena ou do mouse) vai à caixa de texto */
    if (consultor && $('o-texto') && (focoPendente || porTeclado || podeFocar())) { focoPendente = false; focar($('o-texto')); }
  }
  /* o passo 6 sem o consultor: o que o site faz por ela (listas fechadas), e então o valor da conta */
  function resumoSemConsultor() {
    s.passo = 'resumo';
    fala(R.resumoFixo(s.respostas, s.situacao));
    focarSaida();
    setTimeout(liberarValor, ESPERA_RESUMO_MS);
  }

  /* ---------- a conta ou o anti-robô falhou durante os toques (spec §1: nunca há falha muda) ----------
     A fala do Zero diz o que houve, com "Tentar de novo" (refaz a conta com as respostas de agora) e "Deixar um recado". Uma por vez.
     O texto entra DEPOIS de o alerta estar na página (alguns leitores de tela não anunciam um alerta que já nasce com o texto) */
  doc.addEventListener('bz:conta-falhou', function (ev) {
    if (s.liberado) return;
    var velho = $('o-log').querySelector('.orc-toque--erro:not([data-feito])');
    if (velho) fechar(velho, null);
    var texto = ev && ev.detail && ev.detail.mensagem ? ev.detail.mensagem : 'Não consegui calcular agora.';
    var li = el('li', 'orc-toque orc-toque--erro'), p = el('p', 'msg msg--agente orc-toque__erro'), acoes = el('div', 'orc-toque__ops');
    p.setAttribute('role', 'alert');
    var tentar = el('button', 'orc-op orc-op--toque', 'Tentar de novo');
    tentar.type = 'button';
    tentar.addEventListener('click', function () { if (li.hasAttribute('data-feito')) return; fechar(li, null); contar(); });
    var recado = el('a', 'orc-op orc-op--toque', 'Deixar um recado');
    recado.href = '#recado';
    recado.setAttribute('data-recado-abrir', '');
    recado.setAttribute('data-recado-origem', 'orcamento');
    acoes.appendChild(tentar); acoes.appendChild(recado);
    li.appendChild(p); li.appendChild(acoes);
    inserir(li);
    setTimeout(function () { p.textContent = texto; }, 0);
  });

  /* ---------- "Mudar o que eu respondi": as perguntas fixas de novo, dentro da conversa, com as respostas de agora marcadas ---------- */
  function reabrir() {
    /* (um bloco por vez: o segundo toque em "Mudar as respostas" leva ao que já está aberto) */
    var aberto = $('o-log').querySelector('.orc-toque--mudar:not([data-feito])');
    if (aberto) { focar(aberto.querySelector('button')); return; }
    var novas = copiar(s.respostas);
    var f = fala(FALAS.mudar);
    /* (os quatro grupos ficam abertos juntos: um "Pronto" no fim fecha todos) */
    var li = el('li', 'orc-toque orc-toque--mudar');
    li.appendChild(grupoMarcavel('Tipo de negócio', itensDe(R.RAMOS, Object.keys(R.RAMOS).filter(function (k) { return k !== 'outro' || novas.ramo === 'outro'; })), [novas.ramo], false, function (v) { novas.ramo = v[0]; }));
    li.appendChild(grupoMarcavel('O que o site precisa trazer', itensDe(R.OBJETIVOS), novas.objetivos || [], true, function (v) { novas.objetivos = v; }));
    li.appendChild(grupoMarcavel('Já tem site?', itensDe(R.SITE_ATUAL), [novas.site_atual], false, function (v) { novas.site_atual = v[0]; }));
    li.appendChild(grupoMarcavel('Logo e textos', itensDe(R.MATERIAL), [novas.material], false, function (v) { novas.material = v[0]; }));
    var pronto = el('button', 'btn btn--primary btn--sm orc-toque__pronto', PRONTO);
    pronto.type = 'button';
    pronto.addEventListener('click', function (ev) { if (li.hasAttribute('data-feito')) return; porTeclado = !!ev && ev.detail === 0; fechar(li, null); concluirMudanca(novas); });
    li.appendChild(pronto);
    inserir(li);
    mudanca = { fala: f, li: li };
    focar(li.querySelector('button'));
  }
  /* um grupo de marcar (um ou vários) sem fechar sozinho: o "Pronto" do bloco fecha */
  function grupoMarcavel(rotulo, itens, marcados, multi, aoMudar) {
    var grupo = el('div', 'orc-toque__ops'), atual = marcados.filter(Boolean), titulo = el('p', 'orc-toque__titulo', rotulo);
    titulo.id = 'o-toque-titulo-' + (++nFala);
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-labelledby', titulo.id);
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
    bloco.appendChild(titulo);
    bloco.appendChild(grupo);
    return bloco;
  }
  function concluirMudanca(novas) {
    var texto = R.falaDoMudar(novas);
    s.respostas = novas;
    contar();
    if (!texto) { focarSaida(); return; }
    /* com o consultor e a conversa já no servidor, a mudança vai como a fala montada (o servidor confere o molde e a grava): a pergunta e o bloco
       saem da tela, porque a fala dela e a resposta do Zero entram na conversa na ordem certa; antes disso, ou sem ele, fica tudo aqui */
    if (s.consultor && s.entregue && window.BZOrcConversa && typeof window.BZOrcConversa.enviar === 'function') {
      s.aEnviar = { respostas: soMudanca(novas) };
      var m = mudanca;
      focarSaida();
      /* a pergunta e o bloco só saem depois de o envio ENTRAR; se não entrou (conversa ocupada, falha que não gravou), a mudança não fica pendurada
         para ir escondida na próxima mensagem: o bloco volta, com o que ela tinha marcado */
      Promise.resolve(window.BZOrcConversa.enviar(texto)).then(function (entrou) {
        if (entrou === false) { s.aEnviar = null; if (m) { m.fala.remove(); m.li.remove(); } mudanca = null; reabrir(); return; }
        if (m) { m.fala.remove(); m.li.remove(); }
        if (mudanca === m) mudanca = null;
      }, function () { s.aEnviar = null; });
      return;
    }
    bolha(texto.slice(R.MOLDE_MUDAR.length));
    focarSaida();
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
      if (o && o.consultor === false) s.consultor = false;
      passoRamo();
    },
    /* a configuração do servidor chegou (há consultor?): vale também para a conversa retomada, em que os toques não começam */
    configurar: function (o) { if (!s.iniciado && o && typeof o.consultor === 'boolean') s.consultor = o.consultor; },
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
      fecharAbertos();
      focarSaida();
    },
    /* o estado do servidor: numa conversa retomada (os toques não começaram aqui), o que ela tocou volta do briefing, e a conversa já foi entregue */
    atualizar: function (E) {
      ultimoE = E || null;
      if (s.iniciado || !E || !E.conversa) return;
      var b = E.conversa.briefing || {}, t = b.fluxo_toques;
      if (t && typeof t === 'object') s.respostas = soMudanca(copiar(t));
      if (b.fluxo_conversa === true && E.mensagens && E.mensagens.length) s.entregue = true;
    },
    comConsultor: function () { return s.consultor; },
    ativo: function () { return s.iniciado; },
    reterValor: reterValor,
    liberarValor: liberarValor,
    reabrir: reabrir,
    /* "Seguir tocando nas opções" (a IA caiu): daqui em diante, sem consultor. A dor que ainda não foi volta por toques (sem repetir a pergunta);
       a que já foi por escrito leva direto ao resumo fixo */
    semConsultor: function () {
      if (!s.consultor) return;
      s.consultor = false;
      if (!s.iniciado && !s.entregue) { s.iniciado = true; passoRamo(); return; }
      if (s.liberado) return;
      fecharAbertos();
      if (s.entregue) { s.iniciado = true; resumoSemConsultor(); return; }
      if (s.passo === 'dor') opcoesDor(s.situacao);
    },
    situacao: function () { return s.situacao.slice(); },
    respostas: function () { return copiar(s.respostas); },
    /* o kit da conversa para os outros passos dentro da caixa (o pedido, js/orcamento-pedido.js): as mesmas falas, bolhas, grupos, foco e anúncios */
    kit: { el: el, fala: fala, bolha: bolha, inserir: inserir, opcoes: opcoes, fechar: fechar, anunciar: anunciar, focar: focar, focarSaida: focarSaida,
      ultimaFala: function () { return ultimaFala; }, teclado: function (sim) { if (typeof sim === 'boolean') porTeclado = sim; return porTeclado; } }
  };
})();
