/* ==========================================================================
   OS SONS (2026-10-28, pedido do dono: "Sons, para ambientação do site,
   selecionar card, botão e para clicar"; "Não só o de fundo, mas os sons em
   geral", com opção para deixar ligado ou desligar; começa ligado, "bem baixo
   e irá se estabilizando, não irá assustar ninguém"). Desenho:
   docs/superpowers/specs/2026-10-28-sons-design.md.

   Tudo GERADO no navegador (Web Audio), nenhum arquivo de áudio:
   - o FUNDO: o zumbido do reator, três notas por um passa-baixa, respirando
     com o fôlego do AI Core (B.relogio/B.FOLEGO). Notas acima de ~150 Hz de
     propósito: alto-falante de celular não toca grave abaixo disso;
   - o SINO: o card do desktop que chega a 100% de carga (js/carga.js avisa
     'carga:cheio');
   - o TIC: mouse que entra num card ou num botão; no celular, tocar num card;
   - o CLIQUE: clicar ou tocar em link, botão ou pergunta.
   O navegador só deixa tocar depois de um gesto (toque, clique, tecla; rolar
   não conta): o contexto de áudio nasce nesse gesto e o volume sobe de quase
   nada até o nível do fundo (8 s na 1ª página da visita, 2 s nas seguintes).
   Os botões [data-som] (cabeçalho e rodapé) ligam e desligam TUDO; a escolha
   fica no aparelho ('bz-som' = '0' é desligado; sem nada, ligado).
   Nada por frame: a respiração é agendada no relógio do áudio, uma vez por
   fôlego (docs/HANDOFF.md §4: um rAF só, o do core).
   ========================================================================== */
(function () {
  'use strict';
  var Ctx = window.AudioContext || window.webkitAudioContext;
  /* sem Web Audio os botões ficam escondidos (nascem hidden no HTML): um botão que não liga nada mentiria */
  if (!Ctx) return;
  var B = window.BEYON;

  var CHAVE = 'bz-som', VISITA = 'bz-som-visita';
  /* volumes (0-1) de cada voz depois da subida; o mestre vai de quase nada a 1 */
  var VOL = { fundo: 0.05, sino: 0.07, tic: 0.025, ticBotao: 0.03, clique: 0.08 };
  var SOBE = { primeira: 8, seguintes: 2 };   /* s da subida: a 1ª página da visita, as outras */
  var DESCE = 0.4;                            /* s até o silêncio ao desligar */
  var PISO = 0.0001;                          /* "quase nada": a rampa exponencial não parte do zero */
  var FUNDO = {
    notas: [[110, 'triangle', 1, 0], [165, 'sine', 0.5, 3], [220, 'sine', 0.35, -4]],   /* Hz, forma, peso, desafinação em cents */
    filtro: { inspira: 900, expira: 600 },   /* Hz do passa-baixa: abre ao inspirar, fecha ao expirar */
    folego: { inspira: 1.15, expira: 0.85 }  /* volume do fundo relativo a VOL.fundo */
  };
  var INTERVALO = { tic: 60, sino: 120 };     /* ms mínimos entre dois iguais: passar o mouse por uma fileira não vira metralhadora */
  var CARDS = '.painel:not(:where(.console, .instrumento)), .celula, .laudo__row, .spec__item, .cenario';   /* os mesmos de js/carga.js */
  var CLICAVEIS = 'a, button, summary, [role="button"]';

  var botoes = [].slice.call(document.querySelectorAll('[data-som]'));
  var ligado = lerPreferencia();
  var ctx = null, mestre = null, fundo = null, ruido = null;
  var subiu = false, semAudio = false, timerFolego = 0, ultimo = { tic: 0, sino: 0 };

  function lerPreferencia() { try { return localStorage.getItem(CHAVE) !== '0'; } catch (e) { return true; } }
  function gravar(sim) { try { localStorage.setItem(CHAVE, sim ? '1' : '0'); } catch (e) { /* sem armazenamento: vale só nesta página */ } }
  function primeiraDaVisita() {
    try { if (sessionStorage.getItem(VISITA)) return false; sessionStorage.setItem(VISITA, '1'); } catch (e) { /* sem armazenamento */ }
    return true;
  }
  /* sem gesto ativo o navegador recusa e reclama no console: só tenta quando há gesto (onde dá para saber) */
  function temGesto() { var u = navigator.userActivation; return !u || u.isActive; }

  /* ---------- as vozes ---------- */
  /* o navegador pode recusar o contexto (limite de contextos, áudio bloqueado): desiste uma vez, quieto, e esconde
     os botões; sem isso o erro voltava ao console a cada gesto e o fôlego quebrava com o fundo pela metade */
  function montar() {
    try {
      ctx = new Ctx();
      mestre = ctx.createGain();
      mestre.gain.value = PISO;
      mestre.connect(ctx.destination);
      fundo = montarFundo();
      ruido = montarRuido();
      return true;
    } catch (e) {
      if (ctx && ctx.close) ctx.close().catch(function () { /* já fechado */ });
      ctx = mestre = fundo = ruido = null;
      semAudio = true;
      botoes.forEach(function (b) { b.hidden = true; });
      return false;
    }
  }

  function montarFundo() {
    var saida = ctx.createGain(), filtro = ctx.createBiquadFilter();
    saida.gain.value = VOL.fundo;
    filtro.type = 'lowpass';
    filtro.frequency.value = FUNDO.filtro.expira;
    filtro.Q.value = 0.7;
    filtro.connect(saida);
    saida.connect(mestre);
    FUNDO.notas.forEach(function (n) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = n[1];
      o.frequency.value = n[0];
      o.detune.value = n[3];
      g.gain.value = n[2];
      o.connect(g);
      g.connect(filtro);
      o.start();
    });
    return { saida: saida, filtro: filtro };
  }

  function montarRuido() {
    var n = Math.round(ctx.sampleRate * 0.02), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* um tom curto: ataque de 5 ms e queda exponencial até o silêncio */
  function tom(freq, ate, dura, vol, atraso) {
    var t = ctx.currentTime + (atraso || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(freq, t);
    if (ate) o.frequency.exponentialRampToValueAtTime(ate, t + dura);
    g.gain.setValueAtTime(PISO, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(PISO, t + dura);
    o.connect(g);
    g.connect(mestre);
    o.start(t);
    o.stop(t + dura + 0.02);
  }

  function tocando() { return ligado && ctx && ctx.state === 'running'; }
  function cedo(tipo) { var agora = Date.now(); if (agora - ultimo[tipo] < INTERVALO[tipo]) return true; ultimo[tipo] = agora; return false; }

  function sino() { if (!tocando() || cedo('sino')) return; tom(880, 0, 0.45, VOL.sino); tom(1320, 0, 0.4, VOL.sino * 0.8, 0.06); }
  function tic(vol, freq) { if (!tocando() || cedo('tic')) return; tom(freq, freq * 0.85, 0.03, vol); }
  function clique() {
    if (!tocando()) return;
    var t = ctx.currentTime, fonte = ctx.createBufferSource(), banda = ctx.createBiquadFilter(), g = ctx.createGain();
    fonte.buffer = ruido;
    banda.type = 'bandpass';
    banda.frequency.value = 2500;
    banda.Q.value = 1;
    g.gain.setValueAtTime(VOL.clique, t);
    g.gain.exponentialRampToValueAtTime(PISO, t + 0.012);
    fonte.connect(banda);
    banda.connect(g);
    g.connect(mestre);
    fonte.start(t);
    tom(160, 90, 0.04, VOL.clique * 0.6);
  }

  /* ---------- o fôlego: um ciclo agendado por vez, em fase com o reator ---------- */
  function periodo() { return (B && B.FOLEGO && B.FOLEGO.periodo) || 7; }
  function respirar() {
    clearTimeout(timerFolego);
    if (!ligado || !subiu || document.hidden) return;
    /* contexto ainda acordando (Safari) ou interrompido (ligação no iPhone): o statechange religa o ciclo */
    if (ctx.state !== 'running') return;
    var inspira = (B && B.FOLEGO && B.FOLEGO.inspira) || 0.42;
    var t = ctx.currentTime, tIn = periodo() * inspira, tEx = periodo() - tIn;
    fundo.filtro.frequency.setTargetAtTime(FUNDO.filtro.inspira, t, tIn / 3);
    fundo.saida.gain.setTargetAtTime(VOL.fundo * FUNDO.folego.inspira, t, tIn / 3);
    fundo.filtro.frequency.setTargetAtTime(FUNDO.filtro.expira, t + tIn, tEx / 3);
    fundo.saida.gain.setTargetAtTime(VOL.fundo * FUNDO.folego.expira, t + tIn, tEx / 3);
    respirarEmFase();
  }
  /* cada fôlego começa quando o do reator recomeça (recalculado a cada ciclo: timers encadeados derivavam) */
  function respirarEmFase() {
    clearTimeout(timerFolego);
    var falta = B && B.relogio ? periodo() - (B.relogio() % periodo()) : periodo();
    timerFolego = setTimeout(respirar, falta * 1000);
  }
  /* resume() fora de gesto pode falhar no Safari: sem reclamar, o próximo gesto tenta de novo */
  function retomar() { if (ctx.state !== 'running') ctx.resume().catch(function () { /* o próximo gesto tenta */ }); }
  /* segura a rampa onde ela está (sem o salto de volta ao último valor marcado); sem o método, marca o valor de agora */
  function segurar(t) {
    if (mestre.gain.cancelAndHoldAtTime) mestre.gain.cancelAndHoldAtTime(t);
    else { var v = mestre.gain.value; mestre.gain.cancelScheduledValues(t); mestre.gain.setValueAtTime(Math.max(v, PISO), t); }
  }

  /* ---------- liga, desliga ---------- */
  function acordar(e) {
    /* o gesto no próprio botão de som é dele: ligar ou desligar decide o que acontece (antes, o toque para
       desligar criava o áudio e gastava a subida longa da 1ª página) */
    if (!ligado || semAudio || !temGesto() || (e && e.target.closest && e.target.closest('[data-som]'))) return;
    if (!ctx) {
      if (!montar()) return;
      /* acordou (no Safari o contexto novo começa suspenso) ou voltou de uma interrupção: o fôlego recomeça */
      ctx.addEventListener('statechange', function () { if (ctx.state === 'running' && ligado && subiu) respirarEmFase(); });
    }
    retomar();
    if (subiu) return;
    subiu = true;
    var t = ctx.currentTime, dura = primeiraDaVisita() ? SOBE.primeira : SOBE.seguintes;
    segurar(t);
    mestre.gain.exponentialRampToValueAtTime(1, t + dura);
    respirarEmFase();
  }

  function calar() {
    subiu = false;
    clearTimeout(timerFolego);
    if (!ctx) return;
    var t = ctx.currentTime;
    segurar(t);
    mestre.gain.setTargetAtTime(PISO, t, DESCE / 4);
    /* em silêncio, o contexto para de vez: não gasta bateria tocando nada */
    setTimeout(function () { if (!ligado && ctx.state === 'running') ctx.suspend(); }, DESCE * 1000 + 100);
  }

  function rotular() { botoes.forEach(function (b) { b.setAttribute('aria-pressed', ligado ? 'true' : 'false'); }); }

  botoes.forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      ligado = !ligado;
      gravar(ligado);
      rotular();
      if (ligado) { subiu = false; acordar(); } else calar();
    });
  });
  rotular();

  /* ---------- os gestos ---------- */
  /* o iOS antigo só destrava o áudio no touchend/click; onde o pointerup basta, os outros não fazem nada (subiu) */
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, acordar, { capture: true, passive: true });
  });

  /* pointerenter não sobe, mas passa pela captura do documento: um ouvinte só para todos os cards e botões */
  document.addEventListener('pointerenter', function (e) {
    if (e.pointerType !== 'mouse' || !e.target.matches) return;
    if (e.target.matches('.btn')) tic(VOL.ticBotao, 2200);
    else if (e.target.matches(CARDS)) tic(VOL.tic, 1800);
  }, true);

  document.addEventListener('click', function (e) {
    var alvo = e.target.closest ? e.target : e.target.parentElement;
    if (!alvo || alvo.closest('[data-som]')) return;
    if (alvo.closest(CLICAVEIS)) clique();
    else if (alvo.closest(CARDS)) tic(VOL.tic, 1800);
  }, true);

  if (B && B.on) B.on('carga:cheio', sino);

  /* aba escondida: pausa; de volta, retoma no mesmo nível */
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { clearTimeout(timerFolego); if (ctx.state === 'running') ctx.suspend(); }
    else if (ligado && subiu) { retomar(); respirarEmFase(); }
  });
})();
