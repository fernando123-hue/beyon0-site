/* ==========================================================================
   O RADAR DO ESCOPO NA PÁGINA (direção docs/design/radar-escopo-2026-11-07.md). O cartão #o-rde é a 1ª coisa do painel do orçamento:
   o progresso real do pedido, as 4 dimensões do projeto e o investimento no núcleo. Quem decide o que mostrar é a derivação pura
   (js/orcamento-escopo-estado.js); o desenho é js/orcamento-escopo-desenho.js; a barra fina do celular, js/orcamento-escopo-barra.js.

   De onde vem o dado (só leitura, nada é calculado aqui): js/orcamento.js chama BZOrcEscopo.atualizar(E) a cada render(); a simulação das
   perguntas chega por bz:preco (e sai por bz:perguntas, "Mudar as respostas"); a atividade real por bz:pensando (o Zero, js/orcamento.js)
   e bz:calculando (o preço, js/orcamento-perguntas.js). Todo texto entra por textContent.

   Movimento é acréscimo: a altura do cartão é reservada no CSS antes deste arquivo rodar; os estados aparecem inteiros sem animação. Com
   movimento: o ponteiro só gira (CSS, só transform) enquanto há atividade; o arco da dimensão que sobe se desenha; o aro anda até o marco
   novo; o valor conta até o novo pelo laço único do site (BEYON.add) e o selo diz "Proposta atualizada" por 2,5 s; o fecho em ouro só na
   proposta confirmada. Toda animação em voo é cancelada antes da próxima. Movimento reduzido (o sistema, BEYON.reduced, o interruptor do
   rodapé): nada se move, o estado novo aparece direto. Sem região viva: a única é o #o-voz do chat. ES5.
   DEPENDÊNCIA: o BZPainel (js/orcamento-painel.js, carregado antes) reavalia se o painel rola por dentro quando o cartão muda de altura.
   ========================================================================== */
(function () {
  'use strict';
  var W = window, doc = document;
  var Estado = W.BZEscopoEstado, Desenho = W.BZEscopoDesenho;
  var $ = function (id) { return doc.getElementById(id); };
  var raiz = $('o-rde');
  if (!raiz || !Estado || !Desenho) return;

  var EASE = 'cubic-bezier(.16,1,.3,1)', EASE_4 = 'cubic-bezier(.25,1,.5,1)';
  var DUR = 1000, DUR_ARO = 1200, DUR_CONTA = 900, ATUALIZADA_MS = 2500, LACO = 'escopo-valor';
  var ATUALIZADA = 'Proposta atualizada';
  var NIVEL_SR = [' (pendente)', ' (identificado)', ' (confirmado no pedido)'];
  var MARCO_SR = { feito: ' (feito)', agora: ' (agora)' };
  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };

  var area = $('o-rde-desenho'), desenho = Desenho.montar(doc);
  area.insertBefore(desenho.svg, area.firstChild);
  var selo = $('o-rde-selo'), valorEl = $('o-rde-valor'), valorSr = $('o-rde-valor-sr'), estadoEl = $('o-rde-estado');
  var abrir = $('o-rde-abrir'), nota = $('o-rde-abrir-nota'), mais = $('o-est-mais');
  var marcos = [].slice.call(raiz.querySelectorAll('.rde-trilha li'));
  var cantos = {};
  Estado.DIMENSOES.forEach(function (q) { var c = $('o-rde-' + q); cantos[q] = { no: c, valor: c.querySelector('.rde-canto__valor'), sr: c.querySelector('.sr-only') }; });

  var E = null, sim = null, at = { zero: false, preco: false };
  var ultimo = null, assinatura = '', animacoes = [], seloAte = null, conta = null;
  var barra = W.BZEscopoBarra ? W.BZEscopoBarra.criar({ alvo: raiz, Desenho: Desenho, dinheiro: dinheiro, focar: focarRadar }) : null;

  function reduzido() {
    var B = W.BEYON;
    return !!(B && B.reduced) || doc.documentElement.classList.contains('menos-movimento') || !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function focavel() { if (W.BZPainel && W.BZPainel.focavel) W.BZPainel.focavel(); }

  /* ---------- as animações: uma lista só, cancelada inteira antes de começar outra ---------- */
  function animar(alvo, quadros, opcoes) {
    if (reduzido() || !alvo || typeof alvo.animate !== 'function') return;
    animacoes.push(alvo.animate(quadros, opcoes));   /* (cancelar uma que já terminou não faz nada: a lista se esvazia a cada desenho) */
  }
  function pararAnimacoes() {
    animacoes.forEach(function (a) { a.cancel(); });
    animacoes = [];
    pararContagem();
  }

  /* ---------- o valor: o texto visível conta; o leitor de tela ouve só o valor final (o número da tela é aria-hidden) ---------- */
  function escreverValor(v) {
    valorEl.textContent = v === null ? '—' : dinheiro(v);
    valorEl.classList.toggle('is-vazio', v === null);
    valorSr.textContent = 'Investimento estimado: ' + (v === null ? 'ainda sem valor' : dinheiro(v)) + '.';
  }
  function pararContagem() {
    if (!conta) return;
    var fim = conta.para;
    conta = null;
    if (W.BEYON && W.BEYON.remove) W.BEYON.remove(LACO);
    escreverValor(fim);
  }
  function contar(de, para) {
    var B = W.BEYON;
    escreverValor(para);
    if (reduzido() || !B || typeof B.add !== 'function') return;
    conta = { de: de, para: para, t0: null };
    valorEl.textContent = dinheiro(de);
    B.add(LACO, function (S) {
      if (!conta) return;
      var agora = S && S.now ? S.now : W.performance.now();
      if (conta.t0 === null) conta.t0 = agora;
      var k = Math.min(1, (agora - conta.t0) / DUR_CONTA), e = 1 - Math.pow(1 - k, 4);
      valorEl.textContent = dinheiro(Math.round(conta.de + (conta.para - conta.de) * e));
      if (k >= 1) pararContagem();
    });
  }

  /* ---------- o selo: o nome do estado; "Proposta atualizada" por um instante quando o valor do servidor mudou ---------- */
  function escreverSelo(st, pedeAtualizada) {
    /* sem valor não há o que dizer "atualizada"; no ouro o selo diz "Proposta confirmada", nunca "atualizada" */
    var atualizada = pedeAtualizada && !st.ouro;
    if (st.ouro || (st.valor === null && seloAte !== null)) { W.clearTimeout(seloAte); seloAte = null; }
    if (atualizada) {
      W.clearTimeout(seloAte);
      seloAte = W.setTimeout(function () { seloAte = null; if (ultimo) escreverSelo(ultimo, false); }, ATUALIZADA_MS);
    }
    var mostrando = atualizada || seloAte !== null;
    selo.textContent = mostrando ? ATUALIZADA : st.rotulo;
    selo.className = 'rde__selo' + (st.ouro ? ' is-ouro' : '') + (mostrando ? ' is-atualizada' : '');
  }

  /* movimento reduzido ligado no meio: o "Proposta atualizada" sai na hora */
  function largarSelo() { if (seloAte === null) return; W.clearTimeout(seloAte); seloAte = null; if (ultimo) escreverSelo(ultimo, false); }

  /* ---------- os textos (HTML de verdade: o que o leitor de tela e a lupa leem) ---------- */
  function textos(st, tr) {
    raiz.className = 'rde' + (st.ouro ? ' is-ouro' : '') + (st.ativo ? ' is-ativo' : '');
    raiz.setAttribute('data-estado', st.estado);
    estadoEl.textContent = st.rotulo;
    escreverSelo(st, tr.atualizada);
    if (tr.atualizada) contar(ultimo.valor, st.valor); else escreverValor(st.valor);
    Estado.DIMENSOES.forEach(function (q) {
      var d = st.dims[q], c = cantos[q];
      c.valor.textContent = d.texto;
      c.sr.textContent = NIVEL_SR[d.nivel] || '';
      c.no.className = 'rde-canto rde-canto--' + q + (d.nivel === 2 ? ' is-confirmada' : d.nivel === 1 ? ' is-identificada' : '');
    });
    marcos.forEach(function (li, i) {
      var feito = i < st.marco || st.ouro, agora = !feito && i === st.marco;
      li.className = feito ? 'is-feito' + (st.ouro ? ' is-ouro' : '') : agora ? 'is-agora' : '';
      li.querySelector('.sr-only').textContent = feito ? MARCO_SR.feito : agora ? MARCO_SR.agora : '';
    });
    detalhes(st);
  }
  function lista(ul, itens, desenhar) {
    ul.textContent = '';
    itens.forEach(function (it) { var li = doc.createElement('li'); desenhar(li, it); ul.appendChild(li); });
  }
  /* "Ver como o valor é formado" (só com valor) e os grupos que este módulo escreve; "Já vem no pacote", "Ainda a confirmar" e a fase
     seguinte são de quem já os escrevia (js/orcamento-perguntas.js e js/orcamento.js) */
  function detalhes(st) {
    var tem = st.valor !== null, n = st.detalhes.aConfirmar.length;
    abrir.classList.toggle('is-vazio', !tem);
    abrir.disabled = !tem;
    if (!tem && !mais.hidden) { mais.hidden = true; abrir.setAttribute('aria-expanded', 'false'); }
    nota.textContent = n ? (n === 1 ? '1 item a confirmar' : n + ' itens a confirmar') : '';
    $('o-est-muda').hidden = !st.detalhes.podeMudar.length;
    lista($('o-est-muda-itens'), st.detalhes.podeMudar, function (li, t) { li.textContent = t; });
    $('o-est-contou').hidden = !st.detalhes.contou.length;
    lista($('o-est-contou-itens'), st.detalhes.contou, function (li, c) {
      var cab = doc.createElement('span'), ev = doc.createElement('span');
      cab.className = 'orc-est__eixo'; cab.textContent = c.rotulo + ' · ' + c.nivel;
      ev.className = 'orc-est__evidencia'; ev.appendChild(doc.createTextNode('“' + c.evidencia + '”'));
      li.appendChild(cab); li.appendChild(ev);
    });
  }

  /* ---------- o movimento do que mudou ---------- */
  function movimento(antes, st, tr) {
    tr.subiram.forEach(function (q) {
      var d = desenho.dims[q];
      animar(d.arco, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: DUR, easing: EASE });
      animar(d.no, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 800, easing: EASE_4 });
      animar(cantos[q].no, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 800, easing: EASE_4 });
    });
    if (tr.marcoMudou) {
      animar(desenho.progresso, [{ strokeDashoffset: 1 - Desenho.fracao(antes.marco, antes.ouro) }, { strokeDashoffset: 1 - Desenho.fracao(st.marco, st.ouro) }], { duration: DUR_ARO, easing: EASE });
    }
    if (tr.virouOuro) {
      animar(desenho.fecho, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: DUR_ARO, easing: EASE });
      animar(selo, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, easing: EASE_4 });
    }
  }

  /* idempotente: o mesmo estado não redesenha nem anima de novo */
  function desenhar() {
    var st = Estado.estadoDoEscopo(E, sim, at), ass = JSON.stringify(st), antes = ultimo, tr;
    if (ass === assinatura) return;
    assinatura = ass;
    tr = Estado.transicao(antes, st);
    /* só a atividade mudou (o preço chegou e a conta terminou no mesmo instante): troca o ponteiro e segue; a contagem, os arcos e o
       selo que acabaram de começar continuam (revisão técnica: antes eram cancelados no mesmo tique) */
    if (tr.soAtividade) {
      Desenho.aplicar(desenho, st);
      raiz.classList.toggle('is-ativo', st.ativo);
      ultimo = st;
      if (barra) barra.atualizar(st, conversaAtiva());
      return;
    }
    pararAnimacoes();
    Desenho.aplicar(desenho, st);
    textos(st, tr);
    ultimo = st;
    movimento(antes, st, tr);
    if (barra) barra.atualizar(st, conversaAtiva());
    focavel();
  }
  function conversaAtiva() { var c = $('o-conversa'), f = $('o-form'); return !!(c && !c.hidden && f && !f.hidden); }

  function focarRadar() {
    var h = $('o-est-titulo');
    raiz.scrollIntoView({ block: 'start' });
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  abrir.addEventListener('click', function () {
    var abre = mais.hidden;
    mais.hidden = !abre;
    abrir.setAttribute('aria-expanded', String(abre));
    if (abre) mais.scrollIntoView({ block: 'nearest' });
    focavel();
  });
  function atividade(qual) {
    return function (ev) {
      var sim2 = !!(ev && ev.detail && ev.detail.ativo);
      at = qual === 'zero' ? { zero: sim2, preco: at.preco } : { zero: at.zero, preco: sim2 };
      desenhar();
    };
  }
  doc.addEventListener('bz:pensando', atividade('zero'));
  doc.addEventListener('bz:calculando', atividade('preco'));
  doc.addEventListener('bz:preco', function (ev) { sim = ev && ev.detail ? ev.detail : null; desenhar(); });
  doc.addEventListener('bz:perguntas', function () { sim = null; desenhar(); });
  if (W.BEYON && W.BEYON.on) W.BEYON.on('reduzir', function (sim3) { if (sim3) { pararAnimacoes(); largarSelo(); } });

  W.BZOrcEscopo = { atualizar: function (novo) { E = novo || null; desenhar(); } };
  desenhar();
})();
