/* ==========================================================================
   O RECADO: o único lugar de feedback do site (decisão do dono, 28/10: sem botão de WhatsApp e sem acesso direto; o consultor de IA é
   o contato, e "no máximo um local para feedback" é este). Um formulário curto: o texto e o e-mail (opcional, para a resposta).
   • Dois jeitos, o mesmo miolo: INLINE, num elemento <... data-recado data-recado-origem="sites"> da página (monta sozinho), ou em JANELA
     (<dialog>), aberta por BZRecado.abrir({ origem, quem }) ou por qualquer [data-recado-abrir]. A janela é criada aqui, não precisa de HTML.
   • Estados: pronto → enviando (botão travado, aria-busy) → enviado (a mensagem recebe o foco) ou erro (frase em português, o texto fica,
     o foco vai para o aviso). Tudo com rótulo, teclado e leitor de tela; campos de 16px (o iPhone não dá zoom).
   • O envio: dentro do orçamento usa BZOrcamento.recado (leva a conversa como referência e o anti-robô da página); nas outras páginas, o
     próprio fetch para /api/vendas?acao=recado, com o Turnstile (js/orcamento-turnstile.js, carregado aqui quando faltar). O servidor
     decide tudo (api/_vendas/fluxo-recado.mjs): aqui só se confere o óbvio para não gastar uma viagem.
   • Sem blur e sem brilho: o estilo é css/recado.css, que este script puxa sozinho quando a página não o linkou.
   Dados do texto: nunca vão para console nem para armazenamento.
   ========================================================================== */
(function () {
  'use strict';
  var MAX = 1000;
  var ENDERECO = '/api/vendas?acao=recado';
  var LIMITE_MS = 20000;   /* o servidor confere o anti-robô na Cloudflare: dá tempo, mas não para sempre */
  /* o mesmo formato do e-mail do site (api/_vendas/fluxo-recado.mjs → ESQ.contatoDoSite); o servidor confere de novo */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var T = {
    titulo: 'Deixe um recado',
    intro: 'Escreva o que você precisa. A equipe da Beyon Zero lê e responde por e-mail.',
    rotuloTexto: 'O seu recado',
    rotuloEmail: 'Seu e-mail, para a resposta (opcional)',
    dicaEmail: 'Sem e-mail a gente não consegue responder.',
    aviso: 'Usamos o e-mail só para responder. O recado é apagado em 60 dias.',
    enviar: 'Enviar recado',
    enviando: 'Enviando…',
    fechar: 'Fechar',
    feito: 'Recebemos o seu recado.',
    feitoComEmail: 'A resposta chega por e-mail.',
    feitoSemEmail: 'Como você não deixou e-mail, não vamos conseguir responder.',
    semTexto: 'Escreva o seu recado antes de enviar.',
    grande: 'O recado passou de 1.000 caracteres. Resuma um pouco.',
    emailRuim: 'O e-mail não parece certo. Confira (ex.: nome@empresa.com.br) ou deixe o campo vazio.',
    semRede: 'Sem conexão. Confira a internet e tente de novo.',
    demorou: 'A resposta demorou mais que o normal. Tente de novo em instantes.',
    generico: 'Não consegui enviar agora. Tente de novo em instantes.',
    cargaAntirobo: 'A verificação de segurança não carregou. Tente de novo em instantes.',
    desafio: 'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.'
  };

  /* ---------- as regras que não dependem da tela (testadas em docs/testes/recado-front.test.mjs) ---------- */
  function contar(texto) { return Array.from(String(texto == null ? '' : texto)).length; }
  /* null se está tudo certo; senão { campo: 'texto' | 'email', erro: <frase> } */
  function validar(texto, email) {
    var t = String(texto == null ? '' : texto).trim(), m = String(email == null ? '' : email).trim();
    if (!t) return { campo: 'texto', erro: T.semTexto };
    if (contar(t) > MAX) return { campo: 'texto', erro: T.grande };
    if (m && (m.length > 120 || !EMAIL.test(m))) return { campo: 'email', erro: T.emailRuim };
    return null;
  }
  /* o corpo que vai ao servidor: só o que foi preenchido; a origem e a conversa são rótulos, nunca texto livre */
  function corpoDoEnvio(texto, email, origem) {
    var corpo = { texto: String(texto).trim() };
    var m = String(email == null ? '' : email).trim();
    if (m) corpo.email = m;
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
  function enviarProprio(corpo, form) {
    garantirCaixa(form);
    return carregarTurnstile().then(function (ts) { return ts.token(); }).then(function (token) {
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
    var rotuloEmail = el('label', 'recado__rotulo', T.rotuloEmail); rotuloEmail.setAttribute('for', 'recado-email-' + n);
    var email = el('input', 'recado__entrada'); email.id = 'recado-email-' + n; email.name = 'email'; email.type = 'email';
    email.setAttribute('autocomplete', 'email'); email.setAttribute('inputmode', 'email'); email.setAttribute('autocapitalize', 'off'); email.setAttribute('spellcheck', 'false');
    email.setAttribute('aria-describedby', 'recado-dica-' + n);
    var dica = el('span', 'recado__dica', T.dicaEmail); dica.id = 'recado-dica-' + n;
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
      email.setAttribute('aria-invalid', campo === 'email' ? 'true' : 'false');
      (campo === 'email' ? email : campo === 'texto' ? texto : erro).focus();
    }
    function limparErro() { erro.hidden = true; erro.textContent = ''; texto.removeAttribute('aria-invalid'); email.removeAttribute('aria-invalid'); }
    function travar(sim) {
      enviando = sim;
      botao.disabled = sim;
      botao.textContent = sim ? T.enviando : T.enviar;
      form.setAttribute('aria-busy', sim ? 'true' : 'false');
    }
    function concluir(comEmail) {
      miolo.hidden = true;
      feito.textContent = '';
      feito.appendChild(el('p', null, T.feito));
      feito.appendChild(el('p', null, comEmail ? T.feitoComEmail : T.feitoSemEmail));
      if (opcoes && typeof opcoes.aoFechar === 'function') {
        var ok = el('button', 'recado__botao', T.fechar); ok.type = 'button';
        ok.addEventListener('click', function () { opcoes.aoFechar(); });
        feito.appendChild(ok);
      }
      feito.hidden = false;
      feito.focus();
    }
    texto.addEventListener('input', function () { atualizarContador(); if (!erro.hidden) limparErro(); });
    email.addEventListener('input', function () { if (!erro.hidden) limparErro(); });
    form.addEventListener('submit', function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (enviando) return;
      var v = validar(texto.value, email.value);
      if (v) { mostrarErro(v.erro, v.campo); return; }
      limparErro();
      travar(true);
      var comEmail = !!String(email.value).trim();
      Promise.resolve().then(function () { return enviar(corpoDoEnvio(texto.value, email.value, origem), form); })
        .then(function () { travar(false); texto.value = ''; email.value = ''; atualizarContador(); concluir(comEmail); },
          function (e) { travar(false); mostrarErro(fraseDaFalha(e), null); });
    });
    return { raiz: raiz, focar: function () { (feito.hidden ? texto : feito).focus(); } };
  }

  /* ---------- a janela e a montagem ---------- */
  function puxarEstilo() {
    if (document.querySelector('link[href$="recado.css"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/css/recado.css';
    document.head.appendChild(l);
  }
  var janela = null, quemAbriu = null;
  function fechar() {
    if (!janela) return;
    if (typeof janela.close === 'function') janela.close(); else janela.removeAttribute('open');
  }
  function aoFecharJanela() {
    var alvo = quemAbriu; quemAbriu = null;
    if (janela && janela.parentNode) janela.parentNode.removeChild(janela);   /* a próxima abertura nasce limpa: o texto que ficou não reaparece */
    janela = null;
    if (alvo && typeof alvo.focus === 'function') alvo.focus();
  }
  /* abre a janela do recado. opcoes: { origem, quem } (quem = o elemento que pediu, para devolver o foco ao fechar) */
  function abrir(opcoes) {
    puxarEstilo();
    if (janela) { fechar(); aoFecharJanela(); }
    quemAbriu = (opcoes && opcoes.quem) || document.activeElement || null;
    var d = document.createElement('dialog');
    d.className = 'recado recado--janela';
    var m = criarMiolo({ origem: opcoes && opcoes.origem, aoFechar: fechar });
    d.setAttribute('aria-label', T.titulo);
    d.appendChild(m.raiz);
    d.addEventListener('close', aoFecharJanela);
    d.addEventListener('click', function (ev) { if (ev.target === d) fechar(); });   /* clicar no fundo fecha */
    document.body.appendChild(d);
    janela = d;
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
