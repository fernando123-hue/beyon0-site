/* Laboratório da planta viva v2: ENCENA a conversa com o Zero, turno a turno (roteiro em lab-planta-v2-roteiro.js), e entrega a cada turno o
   esboço derivado do briefing (lab-planta-v2-cresce.js) para a planta crescer; no fim, a consagração com o plano do desenhar_planta.
   No celular a planta é um item da conversa, sempre o último (as falas novas entram ANTES dela); no computador ela vive no painel ao lado.
   Com ?auto=1 o roteiro anda sozinho e faz também o papel da pessoa: digita, envia e ROLA a página como o dedo dela rolaria (só no laboratório;
   a planta em si nunca rola a página, ela espera estar à vista). ES5, sem dependência além dos módulos da planta. */
(function () {
  'use strict';
  var Rot = window.BZPlantaRoteiro, Cresce = window.BZPlantaCresce, Esb = window.BZPlantaEsboco, Cons = window.BZPlantaConsagra, Som = window.BZPlantaSom;
  if (!Rot || !Cresce || !Esb || !Cons) return;
  var q = new URLSearchParams(location.search), html = document.documentElement;
  var nicho = Rot.NICHOS.indexOf(q.get('nicho')) >= 0 ? q.get('nicho') : 'clinica', R = Rot[nicho];
  var auto = q.get('auto') === '1', ritmo = Math.min(2, Math.max(0.5, Number(q.get('ritmo')) || 1)), semPlanta = q.get('semplanta') === '1';
  var desktop = window.matchMedia('(min-width: 960px)').matches;
  if (q.get('captura') === '1') html.classList.add('lab-captura');
  if (q.get('estatico') === '1') html.classList.add('menos-movimento');

  var $ = function (id) { return document.getElementById(id); };
  var log = $('log'), caixa = $('log-caixa'), campo = $('campo'), form = $('entrada'), painel = $('painel'), palco = $('palco');
  var estado = { turno: 0, briefing: {}, planta: null, item: null, ocupado: false, consagrada: false, fim: false, timers: [] };
  var som = function (n) { if (Som) Som.tocar(n); };
  var ms = function (n) { return Math.round(n / ritmo); };
  var depois = function (n, fn) { estado.timers.push(window.setTimeout(fn, n)); };

  function mesclar(a, b) {
    var o = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) {
      var v = b[k];
      o[k] = v && typeof v === 'object' && !Array.isArray(v) ? mesclar(a[k] || {}, v) : v;
    }
    return o;
  }

  /* ---------- o papel do dedo da pessoa (só ?auto=1): rola para a fala nova e para a planta, sem passar da fala do Zero ---------- */
  function rolar(alvoBaixo, limiteTopo) {
    if (!auto) return;
    if (desktop) { caixa.scrollTo({ top: caixa.scrollHeight, behavior: 'smooth' }); return; }
    var barra = form.getBoundingClientRect().height, sobra = alvoBaixo - (window.innerHeight - barra - 12);
    if (limiteTopo != null) sobra = Math.min(sobra, limiteTopo - 12);
    if (sobra > 4) window.scrollBy({ top: sobra, behavior: 'smooth' });
  }
  function seguirPlanta(fala) {
    if (!estado.item) return rolar(fala.getBoundingClientRect().bottom);
    var r = estado.item.getBoundingClientRect(), quadro = estado.item.querySelector('.lv-quadro, .plv-quadro');
    var alvo = quadro ? quadro.getBoundingClientRect().bottom : r.bottom;
    rolar(alvo, fala ? fala.getBoundingClientRect().top : null);
  }

  /* ---------- as falas ---------- */
  function fala(quem, texto) {
    var li = document.createElement('li'), p = document.createElement('p');
    li.className = 'msg msg--entra ' + (quem === 'zero' ? 'msg--agente' : 'msg--visitante');
    p.textContent = texto; li.appendChild(p);
    log.insertBefore(li, estado.item && estado.item.parentNode === log ? estado.item : null);
    if (desktop) caixa.scrollTo({ top: caixa.scrollHeight, behavior: auto ? 'smooth' : 'auto' });
    return li;
  }
  function pensando(sim) {
    var p = $('pensando');
    if (!sim) { if (p) p.parentNode.removeChild(p); return null; }
    p = document.createElement('li'); p.id = 'pensando'; p.className = 'orc-pensando msg--entra';
    var fio = document.createElement('span'); fio.className = 'orc-pensando__fio'; p.appendChild(fio);
    p.appendChild(document.createTextNode('Zero está pensando'));
    log.insertBefore(p, estado.item && estado.item.parentNode === log ? estado.item : null);
    return p;
  }

  /* a planta: no computador, no painel desde o início (dormente); no celular, nasce na conversa com a semente */
  function garantirPlanta(antesDe) {
    if (semPlanta || estado.planta) return;
    var raiz;
    if (desktop) raiz = painel;
    else { raiz = document.createElement('li'); raiz.className = 'lv-item'; log.insertBefore(raiz, antesDe ? antesDe.nextSibling : null); estado.item = raiz; }
    estado.planta = Esb.criar(raiz, { som: som });
  }

  function digitar(texto, pronto) {
    if (!auto) { campo.value = texto; pronto(); return; }
    var i = 0;
    campo.value = '';
    (function letra() {
      campo.value = texto.slice(0, ++i);
      if (i < texto.length) depois(ms(texto.charAt(i - 1) === ' ' ? 34 : 22), letra); else depois(ms(320), pronto);
    })();
  }
  var leitura = function (t) { return ms(Math.max(1900, t.split(/\s+/).length * 230)); };

  function turno() {
    var t = R.turnos[estado.turno];
    estado.ocupado = true;
    var vis = fala('pessoa', t.pessoa);
    campo.value = '';
    rolar(vis.getBoundingClientRect().bottom);
    depois(ms(250), function () {
      var p = pensando(true);
      rolar(p.getBoundingClientRect().bottom);
      depois(ms(1100), function () {
        pensando(false);
        var z = fala('zero', t.zero);
        estado.briefing = mesclar(estado.briefing, t.briefing);
        estado.turno++;
        garantirPlanta(z);
        depois(60, function () { seguirPlanta(z); });
        if (estado.planta) estado.planta.crescer(Cresce.derivar(estado.briefing));
        esperarPlanta(function () { depois(leitura(t.zero), proximoAuto); });
      });
    });
  }
  function esperarPlanta(fn) {
    if (!estado.planta || estado.planta.ocioso()) { estado.ocupado = false; preparar(); fn(); return; }
    depois(120, function () { esperarPlanta(fn); });
  }
  function preparar() {
    if (estado.turno < R.turnos.length) campo.value = auto ? '' : R.turnos[estado.turno].pessoa;
  }

  function consagrar() {
    estado.ocupado = true;
    var p = pensando(true);
    rolar(p.getBoundingClientRect().bottom);
    depois(ms(1400), function () {
      pensando(false);
      var z = fala('zero', R.fim.zero);
      depois(60, function () { seguirPlanta(z); });
      depois(ms(900), function () {
        if (!estado.planta) { estado.fim = true; return; }
        var r = Cons.consagrar(estado.planta, R.fim.plano, {
          som: som, nome: R.fim.nome,
          preparar: function () { if (desktop) { palco.classList.add('is-faixa'); caixa.scrollTop = caixa.scrollHeight; } },
          aoAcender: function (caixaNaTela) {
            if (!auto) return;
            if (desktop) {
              var c = estado.planta.interno.card.getBoundingClientRect();
              if (c.bottom > window.innerHeight) window.scrollBy({ top: Math.min(c.bottom - window.innerHeight + 16, c.top - 8), behavior: 'smooth' });
              return;
            }
            var barra = form.getBoundingClientRect().height;
            if (caixaNaTela.bottom > window.innerHeight - barra - 24) window.scrollBy({ top: caixaNaTela.bottom - (window.innerHeight - barra) * 0.62, behavior: 'smooth' });
          },
          aoFim: function () {
            estado.consagrada = true;
            depois(ms(1200), function () {
              if (auto && !desktop) { var c = estado.item.querySelector('.plv-acoes'); if (c) rolar(c.getBoundingClientRect().bottom + 8); }
              depois(ms(3000), function () { estado.fim = true; });
            });
          }
        });
        if (!r.ok && window.console) window.console.warn('[lab-planta-v2] plano recusado: ' + (r.motivos || []).join(','));
        if (r.ok && !r.animada) { estado.consagrada = true; estado.fim = true; }
        if (desktop && auto) depois(80, function () { var c = estado.planta.interno.card.getBoundingClientRect(); if (c.bottom > window.innerHeight) window.scrollBy({ top: Math.min(c.bottom - window.innerHeight + 16, c.top - 8), behavior: 'smooth' }); });
      });
    });
  }

  function proximo() {
    if (estado.ocupado || estado.fim || estado.consagrada) return;
    if (estado.turno < R.turnos.length) {
      var t = R.turnos[estado.turno];
      estado.ocupado = true;
      digitar(t.pessoa, turno);
    } else consagrar();
  }
  function proximoAuto() { if (auto) proximo(); }

  /* ?passo=N: o estado depois de N turnos, já pronto (sem animação), para foto e medida */
  function pular(n) {
    var tinha = html.classList.contains('menos-movimento');
    html.classList.add('menos-movimento');
    var k = Math.min(n, R.turnos.length), i;
    for (i = 0; i < k; i++) {
      var t = R.turnos[i];
      fala('pessoa', t.pessoa); var z = fala('zero', t.zero);
      estado.briefing = mesclar(estado.briefing, t.briefing); estado.turno++;
      garantirPlanta(z);
      if (estado.planta) estado.planta.crescer(Cresce.derivar(estado.briefing));
    }
    if (n > R.turnos.length && estado.planta) {
      fala('zero', R.fim.zero);
      Cons.consagrar(estado.planta, R.fim.plano, { som: function () {}, nome: R.fim.nome, preparar: function () { if (desktop) palco.classList.add('is-faixa'); } });
      if (desktop) caixa.scrollTop = caixa.scrollHeight;
      estado.consagrada = true; estado.fim = true;
    }
    Array.prototype.forEach.call(log.querySelectorAll('.msg--entra'), function (m) { m.classList.remove('msg--entra'); });
    if (!tinha) html.classList.remove('menos-movimento');
    preparar();
  }

  /* ---------- a página ---------- */
  html.style.setProperty('--lab-barra', document.querySelector('.lab-barra').getBoundingClientRect().height + 'px');
  Array.prototype.forEach.call(document.querySelectorAll('[data-nicho]'), function (b) {
    b.setAttribute('aria-pressed', b.getAttribute('data-nicho') === nicho ? 'true' : 'false');
    b.addEventListener('click', function () { q.set('nicho', b.getAttribute('data-nicho')); q.delete('passo'); location.search = q.toString(); });
  });
  var bAuto = document.querySelector('[data-acao="auto"]');
  if (bAuto) bAuto.addEventListener('click', function () { q.set('auto', '1'); q.delete('passo'); location.search = q.toString(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); proximo(); });

  fala('zero', R.abertura);
  if (desktop && !semPlanta) garantirPlanta(null);
  var passo = parseInt(q.get('passo'), 10);
  if (passo > 0) pular(passo); else preparar();
  if (auto && !(passo > 0)) depois(ms(1600), proximo);
  window.LAB = { estado: estado, proximo: proximo, nicho: nicho, desktop: desktop };
})();
