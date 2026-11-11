/* ==========================================================================
   O RECADO: o único lugar de feedback do site (decisão do dono, 28/10: sem botão de WhatsApp e sem acesso direto; o consultor de IA é
   o contato, e "no máximo um local para feedback" é este). Um formulário curto: o texto e um contato opcional para a resposta, WhatsApp OU
   e-mail num campo só (dono, 10/11: "Não torne obrigatório o cliente por email. permita ele por o zap se desejar").
   • Dois jeitos, o mesmo miolo: INLINE, num elemento <... data-recado data-recado-origem="sites"> da página (monta sozinho), ou em JANELA
     (<dialog>), aberta por BZRecado.abrir({ origem, quem }) ou por qualquer [data-recado-abrir]. A janela é criada aqui, não precisa de HTML.
   • Estados: pronto → enviando (botão travado, aria-busy) → enviado (a mensagem recebe o foco) ou erro (frase em português, o texto fica,
     o foco vai para o aviso). Tudo com rótulo, teclado e leitor de tela; campos de 16px (o iPhone não dá zoom).
   • O envio: dentro do orçamento usa BZOrcamento.recado (leva a conversa como referência e o anti-robô da página); nas outras páginas, o
     próprio fetch para /api/vendas?acao=recado, com o Turnstile (js/orcamento-turnstile.js, carregado aqui quando faltar). O servidor
     decide tudo (api/_vendas/fluxo-recado.mjs): aqui só se confere o óbvio para não gastar uma viagem.
   • RÁPIDO (dono, 10/11: "a mensagem demora muito para ser enviada"): sozinho, abrir o recado já carrega a verificação (aquecer) e a
     primeira letra digitada já pede o token; o clique em Enviar só manda. O token vale uma vez e por 5 minutos: velho, usado ou que
     falhou, o envio pede outro na hora.
   • Sem blur e sem brilho: o estilo é css/recado.css, que este script puxa sozinho quando a página não o linkou.
   Dados do texto: nunca vão para console nem para armazenamento.
   ========================================================================== */
(function () {
  'use strict';
  var MAX = 1000;
  var ENDERECO = '/api/vendas?acao=recado';
  var LIMITE_MS = 20000;   /* o servidor confere o anti-robô na Cloudflare: dá tempo, mas não para sempre */
  var TOKEN_VALE_MS = 4 * 60e3;   /* o da Cloudflare vale 5 min: folga para a viagem */
  /* o mesmo formato do contato do site (api/_vendas/fluxo-recado.mjs → ESQ.contatoDoSite); o servidor confere de novo */
  var WHATSAPP = /^\+55[1-9][1-9](9[0-9]{8}|[2-8][0-9]{7})$/;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var T = {
    titulo: 'Deixe um recado',
    intro: 'Escreva o que você precisa. A equipe da Beyon Zero lê e responde.',
    rotuloTexto: 'O seu recado',
    rotuloContato: 'Seu WhatsApp ou e-mail, para a resposta (opcional)',
    dicaContato: 'Se quiser resposta, deixe um dos dois.',
    aviso: 'Usamos o contato só para responder. O recado é apagado em 60 dias.',
    enviar: 'Enviar recado',
    enviando: 'Enviando…',
    fechar: 'Fechar',
    feito: 'Recebemos o seu recado.',
    feitoComEmail: 'A resposta chega por e-mail.',
    feitoComWhatsapp: 'A gente responde pelo WhatsApp.',
    feitoSemContato: 'Como você não deixou WhatsApp nem e-mail, não vamos conseguir responder.',
    semTexto: 'Escreva o seu recado antes de enviar.',
    grande: 'O recado passou de 1.000 caracteres. Resuma um pouco.',
    contatoRuim: 'Confira o WhatsApp com DDD (ex.: 21 99999-0000) ou o e-mail (ex.: nome@empresa.com.br), ou deixe o campo vazio.',
    semRede: 'Sem conexão. Confira a internet e tente de novo.',
    demorou: 'A resposta demorou mais que o normal. Tente de novo em instantes.',
    generico: 'Não consegui enviar agora. Tente de novo em instantes.',
    cargaAntirobo: 'A verificação de segurança não carregou. Tente de novo em instantes.',
    desafio: 'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.'
  };

  /* ---------- as regras que não dependem da tela (testadas em docs/testes/recado-front.test.mjs) ---------- */
  function contar(texto) { return Array.from(String(texto == null ? '' : texto)).length; }
  /* o WhatsApp como a pessoa digita ("(21) 99999-0001", "+55 21 ...") → +55 com DDD; null se não fecha (a regra de ESQ.telefoneE164) */
  function whatsappE164(v) {
    if (v.length > 30 || !/^\+?[0-9\s().-]+$/.test(v)) return null;
    var d = v.replace(/\D/g, '');
    var completo = (d.length === 12 || d.length === 13) && d.slice(0, 2) === '55' ? d : d.length === 10 || d.length === 11 ? '55' + d : null;
    return completo && WHATSAPP.test('+' + completo) ? '+' + completo : null;
  }
  /* o tipo do contato: 'email', 'whatsapp', '' (vazio) ou null (não fecha) */
  function tipoDoContato(contato) {
    var c = String(contato == null ? '' : contato).trim();
    if (!c) return '';
    if (c.indexOf('@') >= 0) return c.length <= 120 && EMAIL.test(c) ? 'email' : null;
    return whatsappE164(c) ? 'whatsapp' : null;
  }
  /* null se está tudo certo; senão { campo: 'texto' | 'contato', erro: <frase> } */
  function validar(texto, contato) {
    var t = String(texto == null ? '' : texto).trim();
    if (!t) return { campo: 'texto', erro: T.semTexto };
    if (contar(t) > MAX) return { campo: 'texto', erro: T.grande };
    if (tipoDoContato(contato) === null) return { campo: 'contato', erro: T.contatoRuim };
    return null;
  }
  /* o corpo que vai ao servidor: só o que foi preenchido; a origem e a conversa são rótulos, nunca texto livre */
  function corpoDoEnvio(texto, contato, origem) {
    var corpo = { texto: String(texto).trim() };
    var c = String(contato == null ? '' : contato).trim();
    if (c) corpo.contato = c;
    if (origem) corpo.origem = origem;
    return corpo;
  }
  /* a frase da falha: a do servidor quando há (já é humana); senão a de rede ou a geral. Nunca "Erro interno." cru */
  function fraseDaFalha(e) {
    if (!e) return T.generico;
    if (e.tipo === 'carga') return T.cargaAntirobo;
    if (e.tipo === 'desafio') return T.desafio;
    var status = typeof e.status === 'number' ? e.status : -1;
    if (status === 0) return e.dados && e.dados.tempo ? T.demorou : T.semRede;
    var dados = e.dados || {};
    if (status >= 400 && status < 500 && typeof dados.erro === 'string' && dados.erro) return dados.erro;
    if (status === 503 && typeof dados.erro === 'string' && dados.erro) return dados.erro;
    return T.generico;
  }

  /* ---------- o envio ---------- */
  function Falha(status, dados) { this.name = 'Falha'; this.status = status; this.dados = dados || {}; this.message = (dados && dados.erro) || T.generico; }
  Falha.prototype = Object.create(Error.prototype);

  function carregarTurnstile() {
    if (window.BZTurnstile) return Promise.resolve(window.BZTurnstile);
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = '/js/orcamento-turnstile.js';
      s.async = true;
      s.onload = function () { if (window.BZTurnstile) ok(window.BZTurnstile); else falha({ tipo: 'carga' }); };
      s.onerror = function () { falha({ tipo: 'carga' }); };
      document.head.appendChild(s);
    });
  }
  /* o Turnstile procura #o-turnstile: cria a caixa dentro do formulário quando a página não a tem */
  function garantirCaixa(form) {
    if (document.getElementById('o-turnstile')) return;
    var caixa = document.createElement('div');
    caixa.id = 'o-turnstile';
    caixa.className = 'recado__antirobo';
    form.appendChild(caixa);
  }
  /* a verificação adiantada (só no envio próprio): { promessa, em } do token pedido antes do clique; vale uma vez */
  var adiantado = null;
  function aquecer(form) {
    garantirCaixa(form);
    carregarTurnstile().then(function (ts) { return typeof ts.aquecer === 'function' ? ts.aquecer() : null; }).catch(function () { /* o envio tenta de novo */ });
  }
  function adiantarToken(form) {
    if (adiantado) return;
    garantirCaixa(form);
    var p = carregarTurnstile().then(function (ts) { return ts.token(); });
    p.catch(function () { /* o envio pede outro */ });
    adiantado = { promessa: p, em: Date.now() };
  }
  function tokenParaEnvio() {
    var a = adiantado; adiantado = null;   /* (usado ou não, sai: o token vale uma vez) */
    var novo = function () { return carregarTurnstile().then(function (ts) { return ts.token(); }); };
    if (!a || Date.now() - a.em > TOKEN_VALE_MS) return novo();
    return a.promessa.catch(novo);
  }
  function enviarProprio(corpo, form) {
    garantirCaixa(form);
    return tokenParaEnvio().then(function (token) {
      var cab = { 'content-type': 'application/json' };
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var relogio = ctrl ? setTimeout(function () { ctrl.abort(); }, LIMITE_MS) : null;
      var envio = Object.assign({}, corpo, token ? { turnstile: token } : {});
      return fetch(ENDERECO, { method: 'POST', headers: cab, body: JSON.stringify(envio), cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .catch(function () { throw new Falha(0, ctrl && ctrl.signal.aborted ? { tempo: true } : {}); })
        .then(function (r) {
          clearTimeout(relogio);
          return r.json().catch(function () { return {}; }).then(function (dados) { if (!r.ok) throw new Falha(r.status, dados); return dados; });
        }, function (e) { clearTimeout(relogio); throw e; });
    });
  }
  function enviar(corpo, form) {
    if (window.BZOrcamento && typeof window.BZOrcamento.recado === 'function') return window.BZOrcamento.recado(corpo);
    return enviarProprio(corpo, form);
  }

  /* ---------- o desenho ---------- */
  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }
  var proximoId = 0;

  /* o miolo: devolve { raiz, focar }. opcoes: { origem, aoFechar (só na janela) } */
  function criarMiolo(opcoes) {
    var n = ++proximoId, origem = opcoes && opcoes.origem;
    var raiz = el('div', 'recado__corpo');
    var miolo = el('div', 'recado__miolo');
    var titulo = el('h2', 'recado__titulo', T.titulo); titulo.id = 'recado-titulo-' + n;
    var intro = el('p', 'recado__intro', T.intro); intro.id = 'recado-intro-' + n;
    var form = el('form', 'recado__form'); form.setAttribute('novalidate', ''); form.setAttribute('aria-labelledby', titulo.id); form.setAttribute('aria-describedby', intro.id);

    var campoTexto = el('div', 'recado__campo');
    var rotuloTexto = el('label', 'recado__rotulo', T.rotuloTexto); rotuloTexto.setAttribute('for', 'recado-texto-' + n);
    var texto = el('textarea', 'recado__entrada recado__entrada--texto'); texto.id = 'recado-texto-' + n; texto.name = 'recado'; texto.rows = 5;
    texto.setAttribute('maxlength', String(MAX + 200));   /* (o limite de verdade é o contador: colar um texto maior avisa em vez de cortar calado) */
    texto.setAttribute('autocomplete', 'off');
    texto.setAttribute('aria-describedby', 'recado-contador-' + n);
    var contador = el('p', 'recado__contador', '0 / ' + MAX); contador.id = 'recado-contador-' + n;
    campoTexto.appendChild(rotuloTexto); campoTexto.appendChild(texto); campoTexto.appendChild(contador);

    var campoEmail = el('div', 'recado__campo');
    var rotuloEmail = el('label', 'recado__rotulo', T.rotuloContato); rotuloEmail.setAttribute('for', 'recado-contato-' + n);
    /* (um campo só para WhatsApp ou e-mail: texto comum, sem corretor nem maiúscula automática) */
    var email = el('input', 'recado__entrada'); email.id = 'recado-contato-' + n; email.name = 'contato'; email.type = 'text';
    email.setAttribute('autocomplete', 'on'); email.setAttribute('autocapitalize', 'off'); email.setAttribute('spellcheck', 'false');
    email.setAttribute('aria-describedby', 'recado-dica-' + n);
    var dica = el('span', 'recado__dica', T.dicaContato); dica.id = 'recado-dica-' + n;
    campoEmail.appendChild(rotuloEmail); campoEmail.appendChild(email); campoEmail.appendChild(dica);

    var aviso = el('p', 'recado__aviso', T.aviso);
    var erro = el('p', 'recado__erro'); erro.setAttribute('role', 'alert'); erro.setAttribute('tabindex', '-1'); erro.hidden = true;
    var acoes = el('div', 'recado__acoes');
    var botao = el('button', 'recado__botao recado__botao--principal', T.enviar); botao.type = 'submit';
    acoes.appendChild(botao);
    if (opcoes && typeof opcoes.aoFechar === 'function') {
      var fechar = el('button', 'recado__botao', T.fechar); fechar.type = 'button';
      fechar.addEventListener('click', function () { opcoes.aoFechar(); });
      acoes.appendChild(fechar);
    }
    [campoTexto, campoEmail, aviso, erro, acoes].forEach(function (f) { form.appendChild(f); });
    miolo.appendChild(titulo); miolo.appendChild(intro); miolo.appendChild(form);

    var feito = el('div', 'recado__feito'); feito.hidden = true; feito.setAttribute('tabindex', '-1'); feito.setAttribute('role', 'status');
    raiz.appendChild(miolo); raiz.appendChild(feito);

    var enviando = false;
    function atualizarContador() {
      var c = contar(texto.value);
      contador.textContent = c + ' / ' + MAX;
      contador.className = 'recado__contador' + (c > MAX ? ' recado__contador--cheio' : '');
    }
    function mostrarErro(frase, campo) {
      erro.textContent = frase; erro.hidden = false;
      texto.setAttribute('aria-invalid', campo === 'texto' ? 'true' : 'false');
      email.setAttribute('aria-invalid', campo === 'contato' ? 'true' : 'false');
      (campo === 'contato' ? email : campo === 'texto' ? texto : erro).focus();
    }
    function limparErro() { erro.hidden = true; erro.textContent = ''; texto.removeAttribute('aria-invalid'); email.removeAttribute('aria-invalid'); }
    function travar(sim) {
      enviando = sim;
      botao.disabled = sim;
      botao.textContent = sim ? T.enviando : T.enviar;
      form.setAttribute('aria-busy', sim ? 'true' : 'false');
    }
    function concluir(tipo) {
      miolo.hidden = true;
      feito.textContent = '';
      feito.appendChild(el('p', null, T.feito));
      feito.appendChild(el('p', null, tipo === 'email' ? T.feitoComEmail : tipo === 'whatsapp' ? T.feitoComWhatsapp : T.feitoSemContato));
      if (opcoes && typeof opcoes.aoFechar === 'function') {
        var ok = el('button', 'recado__botao', T.fechar); ok.type = 'button';
        ok.addEventListener('click', function () { opcoes.aoFechar(); });
        feito.appendChild(ok);
      }
      feito.hidden = false;
      feito.focus();
    }
    if (opcoes && opcoes.rascunho) { texto.value = opcoes.rascunho.texto; email.value = opcoes.rascunho.email; atualizarContador(); }
    var proprio = !(window.BZOrcamento && typeof window.BZOrcamento.recado === 'function');   /* (no orçamento o anti-robô é da página) */
    if (proprio) aquecer(form);
    texto.addEventListener('input', function () {
      atualizarContador(); if (!erro.hidden) limparErro();
      if (proprio && String(texto.value).trim()) adiantarToken(form);
    });
    email.addEventListener('input', function () { if (!erro.hidden) limparErro(); });
    form.addEventListener('submit', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (enviando) return;
      var v = validar(texto.value, email.value);
      if (v) { mostrarErro(v.erro, v.campo); return; }
      limparErro();
      travar(true);
      var tipo = tipoDoContato(email.value);
      Promise.resolve().then(function () { return enviar(corpoDoEnvio(texto.value, email.value, origem), form); })
        .then(function () { travar(false); texto.value = ''; email.value = ''; atualizarContador(); concluir(tipo); },
          function (e) { travar(false); mostrarErro(fraseDaFalha(e), null); });
    });
    /* o que ficou digitado e não foi enviado (null se nada ou se já foi enviado) */
    function rascunho() {
      if (!feito.hidden || (!String(texto.value).trim() && !String(email.value).trim())) return null;
      return { texto: texto.value, email: email.value };
    }
    return { raiz: raiz, focar: function () { (feito.hidden ? texto : feito).focus(); }, rascunho: rascunho };
  }

  /* ---------- a janela e a montagem ---------- */
  function puxarEstilo() {
    if (document.querySelector('link[href*="css/recado.css"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/css/recado.css';
    document.head.appendChild(l);
  }
  /* (revisão técnica, M1) fechar sem enviar (Esc, fundo, Fechar) guarda o rascunho em memória, só nesta página: reabrir traz o texto de volta */
  var janela = null, quemAbriu = null, mioloDaJanela = null, rascunhoGuardado = null;
  function fechar() {
    if (!janela) return;
    if (typeof janela.close === 'function') janela.close(); else janela.removeAttribute('open');
  }
  function aoFecharJanela() {
    var alvo = quemAbriu; quemAbriu = null;
    rascunhoGuardado = mioloDaJanela ? mioloDaJanela.rascunho() : null;
    if (janela && janela.parentNode) janela.parentNode.removeChild(janela);
    janela = null; mioloDaJanela = null;
    if (alvo && typeof alvo.focus === 'function') alvo.focus();
  }
  /* abre a janela do recado. opcoes: { origem, quem } (quem = o elemento que pediu, para devolver o foco ao fechar) */
  function abrir(opcoes) {
    puxarEstilo();
    if (janela) { var velha = janela; aoFecharJanela(); if (typeof velha.close === 'function') velha.close(); }
    quemAbriu = (opcoes && opcoes.quem) || document.activeElement || null;
    var d = document.createElement('dialog');
    d.className = 'recado recado--janela';
    var m = criarMiolo({ origem: opcoes && opcoes.origem, aoFechar: fechar, rascunho: rascunhoGuardado });
    rascunhoGuardado = null;
    d.setAttribute('aria-label', T.titulo);
    d.appendChild(m.raiz);
    d.addEventListener('close', function () { if (janela === d) aoFecharJanela(); });   /* (o close chega depois: o de uma janela velha não mexe na nova) */
    /* clicar no fundo fecha, mas só se o clique COMEÇOU no fundo: arrastar a seleção do campo até o fundo não fecha */
    var apertouNoFundo = false;
    d.addEventListener('mousedown', function (ev) { apertouNoFundo = ev.target === d; });
    d.addEventListener('click', function (ev) { if (ev.target === d && apertouNoFundo) fechar(); apertouNoFundo = false; });
    document.body.appendChild(d);
    janela = d; mioloDaJanela = m;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    m.focar();
    return d;
  }
  /* monta o formulário dentro de um elemento da página (a seção do recado) */
  function montar(alvo, opcoes) {
    puxarEstilo();
    if (!alvo || alvo.getAttribute('data-recado-montado') === '1') return null;
    alvo.setAttribute('data-recado-montado', '1');
    alvo.classList.add('recado');
    var origem = (opcoes && opcoes.origem) || alvo.getAttribute('data-recado-origem') || undefined;
    var m = criarMiolo({ origem: origem });
    alvo.appendChild(m.raiz);
    return m;
  }
  function iniciar() {
    var alvos = document.querySelectorAll('[data-recado]');
    for (var i = 0; i < alvos.length; i++) montar(alvos[i]);
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('[data-recado-abrir]') : null;
      if (!a) return;
      ev.preventDefault();
      abrir({ origem: a.getAttribute('data-recado-origem') || undefined, quem: a });
    });
  }

  window.BZRecado = { MAX: MAX, validar: validar, corpoDoEnvio: corpoDoEnvio, fraseDaFalha: fraseDaFalha, contar: contar, abrir: abrir, fechar: fechar, montar: montar, Falha: Falha };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
