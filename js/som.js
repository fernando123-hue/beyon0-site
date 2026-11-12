/* ==========================================================================
   OS SONS (2026-10-28, pedido do dono: "Sons, para ambientação do site,
   selecionar card, botão e para clicar"; começa ligado, "bem baixo e irá se
   estabilizando, não irá assustar ninguém"; desenho:
   docs/superpowers/specs/2026-10-28-sons-design.md). A IMERSÃO (2026-11-07,
   dono: "muito simples, quase imperceptíveis [...] cada pulso, a transformação
   pro estado dourado, manter o cursor em cima de um card ou clicar nele [...]
   minimalista porém aparente"): as vozes de docs/sons/previa.html, onde o dono
   ouve as opções e onde o volume de cada uma foi medido (pico dBFS:
   card -22, clique -18, pulso -14, carga+trava -13, ouro -9, travessia -18).

   Tudo GERADO no navegador (Web Audio), nenhum arquivo de áudio. Cada voz
   nasce de um evento que se VÊ:
   - o FUNDO: o zumbido do reator respirando com o fôlego (B.relogio/B.FOLEGO);
   - o PULSO: a onda que sai do núcleo a cada expiração (js/rede.js solta a
     onda quando a fase do fôlego cruza FOLEGO.inspira; aqui, o mesmo relógio);
   - o CARD: o mouse que entra num card ou botão (cada card a sua nota, o lado
     da tela no estéreo); no celular, tocar no card;
   - a CARGA: o cursor parado no card carrega (js/carga.js) e, cheio
     ('carga:cheio'), trava; saindo antes, descarrega;
   - o CLIQUE: clicar ou tocar em link, botão ou pergunta;
   - o OURO (js/ouro.js, 'ouro'): carga, ignição, o reinado com um acorde
     baixinho por baixo (dura o que o ouro durar) e o resfriamento;
   - a TRAVESSIA (js/passagem.js): o ar que passa ('passagem') e o pouso da
     página nova ('passagem:chegou'). Chegando com o som tocando, o áudio da
     página nova só nasce nesse pouso, não no meio do voo (fim do arquivo).
   O navegador só deixa tocar depois de um gesto (toque, clique, tecla; rolar
   não conta). O fundo sobe de quase nada (8 s na 1ª página da visita, 2 s nas
   seguintes) e o pulso espera ele chegar; as respostas à pessoa soam já.
   Os botões [data-som] ligam e desligam TUDO ('bz-som' = '0' é desligado).
   Sem compressor: o do Chrome aplica ganho de compensação sozinho e desfaz a
   calibração. Nada por frame: tudo agendado no relógio do áudio.
   ========================================================================== */
(function () {
  'use strict';
  var Ctx = window.AudioContext || window.webkitAudioContext;
  /* sem Web Audio os botões ficam escondidos (nascem hidden no HTML): um botão que não liga nada mentiria */
  if (!Ctx) return;
  var B = window.BEYON;

  /* AS ESCOLHAS DO DONO: trocar = mudar uma linha (ouvir as opções em docs/sons/previa.html).
     fundo 'cabine' (2026-11-10, o acorde aberto) | 'hoje' (o zumbido de 110 Hz, "pesado") ·
     pulso 'luzSonar' (2026-11-10: uma batida só, o corpo macio e o ping de vidro com eco) | 'A' batida grave | 'B' pulso de vidro · card 'A' vidro | 'B' seco · carga 'proposta' (sobe e trava) |
     'hoje' (só o sino no cheio) · clique 'proposta' (tecla) | 'hoje' · ouro 'A' ignição completa | 'B' contida ·
     travessia true | false · intensidade 0,5–1,5 (todas as vozes; o fundo fica como está) */
  var ESCOLHA = { fundo: 'cabine', pulso: 'luzSonar', card: 'A', carga: 'proposta', clique: 'proposta', ouro: 'A', travessia: true, intensidade: 1 };

  var CHAVE = 'bz-som', VISITA = 'bz-som-visita', VIVO = 'bz-som-vivo';
  /* o ganho de cada voz, calibrado por medida na prévia (pico e RMS de 50 ms; docs/sons/medir.mjs confere) */
  var VOL = { pulso: 0.22, pulsoLuz: 0.45, estacao: 0.32, ignicao: 0.32, descarga: 0.22, pulsoSuave: 0.66, tic: 0.8, ticSeco: 1.4, carga: 1.5, trava: 0.25, clique: 0.32, ouro: 0.34, passagem: 1.5 };
  var SOBE = { primeira: 8, seguintes: 2, travessia: 0.8 };   /* s da subida do fundo: 1ª página, as outras, chegando pela travessia */
  var DESCE = 0.4;                            /* s até o silêncio ao desligar */
  var PISO = 0.0001;                          /* "quase nada": a rampa exponencial não parte do zero */
  var ACORDA_MS = 500;                        /* ms em que o contexto ainda acordando conta como tocando (tocando) */
  var ADIANTE = 0.01;                         /* s: a voz é agendada um pouco à frente (começar no passado estala) */
  /* O FUNDO (prévia: docs/sons/previa-2.html). Cada nota: [Hz, forma, peso, desafinação em cents, s do balanço (0 =
     parado)]; coro: as duas vozes de cada nota, a ±coro cents (o batimento lento que dá o "vivo"); ar: o ruído
     filtrado bem baixo; filtro: Hz do passa-baixa ao expirar e ao inspirar. A cabine (dono, 2026-11-10: "Sci-Fi
     confortador") troca o grave de 110 Hz, o "pesado", por um acorde aberto em lá maior no meio */
  var FUNDOS = {
    hoje:   { vol: 0.05, notas: [[110, 'triangle', 1, 0, 0], [165, 'sine', 0.5, 3, 0], [220, 'sine', 0.35, -4, 0]], filtro: { expira: 600, inspira: 900 }, ar: 0, coro: 0 },
    cabine: { vol: 0.034, notas: [[220, 'sine', 1, 0, 0], [329.63, 'sine', 0.7, 0, 11], [493.88, 'sine', 0.32, 0, 13], [554.37, 'sine', 0.22, 0, 17]], filtro: { expira: 1500, inspira: 2400 }, ar: 0.006, coro: 5 }
  };
  var FUNDO = FUNDOS[ESCOLHA.fundo] || FUNDOS.cabine;
  var FOLEGO_VOL = { inspira: 1.15, expira: 0.85 };   /* volume do fundo relativo a FUNDO.vol */
  /* o PULSO: a nota anda por uma frase de 4 (lá, si, fá#, ré: sem tensão) e o 4º acentua; nunca o mesmo som em loop */
  var FRASE = [1, 1.122, 0.891, 1.335], ACENTO = 1.35;
  /* por tipo: [s mínimos entre duas, quantas soam juntas, s que cada uma ocupa]. Passar o mouse por dez cards não
     vira ruído nem estoura; os quatro cards de uma estação que enchem juntos travam uma vez só */
  var LIMITE = { card: [0.06, 3, 0.3], clique: [0.04, 3, 0.3], trava: [0.15, 2, 1], pulso: [2, 1, 0.7], carga: [0.06, 1, 0.1],
    estacaoEnche: [0.5, 1, 2], estacaoConecta: [1, 1, 1.5], estacaoSurto: [0.5, 1, 0.6], estacaoSolta: [0.5, 1, 0.6], ignicao: [0.3, 1, 0.4], descarga: [1.2, 1, 0.5] };
  var UMA = [0, 1, 0.3];                      /* o resto (ouro, travessia): uma de cada vez */
  var ENCHE = 3.2, CHEIO = 0.995;             /* os de js/carga.js: a carga segue o alvo a 3,2/s e enche em 99,5% */
  var OURO_CARGA = 1.8, OURO_ESFRIA = 2.2;    /* s, os de js/ouro.js (T.carga, T.esfria): na página vale o B.ouro.T de agora */
  var CARDS = '.painel:not(:where(.console, .instrumento)), .celula, .laudo__row, .spec__item, .cenario';   /* os mesmos de js/carga.js */
  var OCUPADO = '.is-carregando, .is-carregado';   /* o cursor parado num card (js/carga.js); o mesmo de js/pulso.js */
  var CLICAVEIS = 'a, button, summary, [role="button"]';

  var html = document.documentElement;
  var botoes = [].slice.call(document.querySelectorAll('[data-som]'));
  var desktop = window.matchMedia('(min-width: 721px) and (hover: hover) and (pointer: fine)');
  var ligado = lerPreferencia();
  var ctx = null, mestre = null, sobe = null, fundo = null, motor = null;
  var subiu = false, semAudio = false, saindo = false, timerFolego = 0, timerPulso = 0, pulsoDepois = 0, acordaAte = 0;
  var ultimo = {}, vivas = {}, carga = null, enche = null, ouro = { sobe: null, reina: null };
  /* o gancho dos testes (docs/testes/som-imersao.test.mjs, docs/sons/medir.mjs, docs/sons/contar.mjs): só com
     ?som=teste na URL, e nas páginas seguintes da mesma aba (a travessia é contada na página que chega) */
  var teste = null;
  try { if (/[?&]som=teste\b/.test(location.search)) sessionStorage.setItem('bz-som-teste', '1'); teste = sessionStorage.getItem('bz-som-teste') === '1'; } catch (e) { teste = /[?&]som=teste\b/.test(location.search); }
  teste = B && teste ? (B.somTeste = { vozes: {}, log: [], criarMotor: criarMotor, montarFundo: montarFundo, VOL: VOL, ctx: function () { return ctx; }, estado: function () { return { ligado: ligado, subiu: subiu, saindo: saindo, audio: ctx && ctx.state }; } }) : null;

  function lerPreferencia() { try { return localStorage.getItem(CHAVE) !== '0'; } catch (e) { return true; } }
  function gravar(sim) { try { localStorage.setItem(CHAVE, sim ? '1' : '0'); } catch (e) { /* sem armazenamento: vale só nesta página */ } }
  function primeiraDaVisita() {
    try { if (sessionStorage.getItem(VISITA)) return false; sessionStorage.setItem(VISITA, '1'); } catch (e) { /* sem armazenamento */ }
    return true;
  }
  /* sem gesto ativo o navegador recusa e reclama no console: só tenta quando há gesto (onde dá para saber) */
  function temGesto() { var u = navigator.userActivation; return !u || u.isActive; }
  function reduzido() { return !!(B && B.reduced) || html.classList.contains('menos-movimento'); }

  /* ---------- O MOTOR (o mesmo da prévia): destino recebe tudo; uma parte vai para um espaço curto ---------- */
  function criarMotor(c, destino) {
    function buffer(canais, dura, f) {
      var n = Math.round(c.sampleRate * dura), b = c.createBuffer(canais, n, c.sampleRate);
      for (var ch = 0; ch < canais; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = f(i / n); }
      return b;
    }
    var ruidoBuf = buffer(1, 2, function () { return Math.random() * 2 - 1; });
    var vozes = c.createGain(), espaco = c.createConvolver(), escuro = c.createBiquadFilter(), envio = c.createGain();
    vozes.gain.value = ESCOLHA.intensidade; vozes.connect(destino);
    /* o eco gerado (1,6 s, escuro): sem ele os sons secos soavam de brinquedo */
    espaco.buffer = buffer(2, 1.6, function (k) { return (Math.random() * 2 - 1) * Math.pow(1 - k, 3); });
    escuro.type = 'lowpass'; escuro.frequency.value = 4200; envio.gain.value = 0.5;
    envio.connect(espaco); espaco.connect(escuro); escuro.connect(vozes);
    /* saturação leve: dá ao grave os harmônicos que o alto-falante do celular toca */
    var curva = new Float32Array(1024);
    for (var i = 0; i < 1024; i++) curva[i] = Math.tanh(2.2 * (i / 1023 * 2 - 1)) / Math.tanh(2.2);

    function saida(molhado, pan, vol) {
      var g = c.createGain(), no = g;
      g.gain.value = vol;
      if (c.createStereoPanner && pan) { var p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); no = p; }
      no.connect(vozes);
      if (molhado) { var s = c.createGain(); s.gain.value = molhado; no.connect(s); s.connect(envio); }
      return g;
    }
    function saturado(para) { var w = c.createWaveShaper(); w.curve = curva; w.oversample = '2x'; w.connect(para); return w; }
    function env(g, t, ataque, pico, queda) {
      g.gain.setValueAtTime(PISO, t);
      g.gain.exponentialRampToValueAtTime(Math.max(pico, PISO * 2), t + ataque);
      g.gain.exponentialRampToValueAtTime(PISO, t + ataque + queda);
    }
    function osc(tipo, f, t, ataque, pico, queda, para, fFim) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = tipo; o.frequency.setValueAtTime(f, t);
      if (fFim) o.frequency.exponentialRampToValueAtTime(fFim, t + ataque + queda);
      env(g, t, ataque, pico, queda); o.connect(g); g.connect(para);
      o.start(t); o.stop(t + ataque + queda + 0.05);
    }
    function ruido(t, ataque, pico, queda, para, filtro) {
      var s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = ruidoBuf; fl.type = filtro.tipo || 'bandpass'; fl.frequency.setValueAtTime(filtro.f, t); fl.Q.value = filtro.q || 1;
      if (filtro.fFim) fl.frequency.exponentialRampToValueAtTime(filtro.fFim, t + ataque + queda);
      env(g, t, ataque, pico, queda); s.connect(fl); fl.connect(g); g.connect(para);
      s.start(t, Math.random()); s.stop(t + ataque + queda + 0.05);
    }
    /* uma fonte contínua (oscilador ou ruído) que sobe do ganho de a 1 em [t, ate] e para quando mandarem:
       nivel(tt) é o ganho calculado (ler .value fora da renderização devolve o valor errado) */
    function subida(g, t, ate, de) {
      g.gain.setValueAtTime(de, t); g.gain.exponentialRampToValueAtTime(1, ate);
      return function (tt) { return tt >= ate ? 1 : de * Math.pow(1 / de, Math.max(0, tt - t) / (ate - t)); };
    }
    function fechar(g, fontes, nivel, piso, tt, em) {
      g.gain.cancelScheduledValues(tt); g.gain.setValueAtTime(Math.max(nivel(tt), piso), tt); g.gain.exponentialRampToValueAtTime(piso, tt + em);
      fontes.forEach(function (f) { f.stop(tt + em + 0.03); });
    }

    var NOTAS = [1568, 1760, 2093, 2349, 2637];   /* G6 A6 C7 D7 E7: uma escala sem tensão, de cards vizinhos */
    var m = {
      /* A: batida grave. Corpo que cai de 120 para 55 Hz, saturado */
      pulso: function (t) {
        var out = saida(0.22, 0, VOL.pulso), w = saturado(out);
        osc('sine', 120, t, 0.006, 0.55, 0.5, w, 55);
        osc('triangle', 240, t, 0.004, 0.10, 0.22, out, 120);
        ruido(t, 0.002, 0.10, 0.045, out, { f: 1400, q: 0.8 });
      },
      /* B: pulso de vidro. Sobe devagar e some, como a onda que sai do núcleo */
      pulsoSuave: function (t) {
        var out = saida(0.45, 0, VOL.pulsoSuave);
        osc('sine', 220, t, 0.05, 0.16, 0.9, out, 196);
        osc('sine', 440, t, 0.04, 0.05, 0.6, out, 392);
        ruido(t, 0.08, 0.035, 0.5, out, { tipo: 'lowpass', f: 900, q: 0.5, fFim: 300 });
      },
      /* luzSonar (dono, 2026-11-10: "misture os melhores elementos do 1 e 2, sem o tum-tum"): UMA batida, o corpo
         macio do batimento de luz (196 Hz que cai pouco) e o ping de vidro do sonar com o eco longo; k: a nota da frase */
      pulsoLuz: function (t, k, forte) {
        var out = saida(0.6, 0, VOL.pulsoLuz * (forte ? ACENTO : 1));
        osc('sine', 196 * k, t, 0.012, 0.28, 0.45, out, 174.6 * k);
        osc('sine', 880 * k, t, 0.004, 0.14, 1.2, out);
        osc('sine', 1320 * k, t, 0.004, 0.03, 0.6, out);
      },
      /* O AI CORE MÉDIO (js/estacao.js). Acopla e enche: um tom que sobe com a carga; quem o corta é a conexão ou a soltura */
      estacaoEnche: function (t, dura) {
        var out = saida(0.35, 0, VOL.estacao), fl = c.createBiquadFilter(), g = c.createGain();
        fl.type = 'lowpass'; fl.frequency.setValueAtTime(500, t); fl.frequency.exponentialRampToValueAtTime(2600, t + dura); fl.connect(g); g.connect(out);
        var nivel = subida(g, t, t + dura * 0.8, PISO);
        g.gain.setValueAtTime(1, t + dura); g.gain.exponentialRampToValueAtTime(PISO, t + dura + 0.15);
        var os = [[220, 'triangle'], [221.2, 'sine']].map(function (n) {
          var o = c.createOscillator(), gv = c.createGain(); gv.gain.value = 0.12;
          o.type = n[1]; o.frequency.setValueAtTime(n[0], t); o.frequency.exponentialRampToValueAtTime(n[0] * 2, t + dura);
          o.connect(gv); gv.connect(fl); o.start(t); o.stop(t + dura + 0.2); return o;
        });
        return { parar: function (tt) { fechar(g, os, nivel, PISO, tt, 0.12); } };
      },
      /* conectada: o acorde que abre (lá maior com 9ª), sem pressa */
      estacaoConecta: function (t) {
        var out = saida(0.55, 0, VOL.estacao * 1.3);
        [[440, 0], [554.37, 0.05], [659.25, 0.1], [987.77, 0.16]].forEach(function (n, i) { osc('sine', n[0], t + n[1], 0.01, 0.09 - i * 0.015, 1.4, out); });
        osc('sine', 220, t, 0.02, 0.07, 1.2, out);
      },
      /* o pulso chega aos cards dela: um tique de vidro por card, do mais perto ao mais longe, alternando o lado */
      estacaoSurto: function (t, n) {
        for (var i = 0; i < Math.min(n || 4, 6); i++) osc('sine', NOTAS[i % NOTAS.length], t + i * 0.07, 0.003, 0.05, 0.22, saida(0.4, (i % 2 ? 1 : -1) * 0.5, VOL.estacao * 0.8));
      },
      /* solta: a carga desce e apaga */
      estacaoSolta: function (t) {
        var out = saida(0.3, 0, VOL.estacao);
        osc('sine', 659.25, t, 0.01, 0.07, 0.5, out, 329.63);
        osc('triangle', 329.63, t, 0.01, 0.04, 0.45, out, 164.81);
      },
      /* o mini encaixa na borda do botão (js/mini-docas.js): o zip curto e o ping da ignição */
      ignicao: function (t) {
        var out = saida(0.3, 0, VOL.ignicao);
        ruido(t, 0.005, 0.06, 0.12, out, { f: 1800, q: 2, fFim: 6000 });
        osc('sine', 1318.5, t + 0.1, 0.004, 0.07, 0.35, out);
        osc('sine', 1975.5, t + 0.13, 0.004, 0.03, 0.3, out);
      },
      /* a descarga da palavra (js/energia-texto.js): faíscas curtas, altas e baixinhas */
      descarga: function (t) {
        var out = saida(0.25, 0, VOL.descarga);
        for (var i = 0; i < 7; i++) ruido(t + i * 0.045 + Math.random() * 0.02, 0.001, 0.035 + Math.random() * 0.02, 0.03, out, { f: 4000 + Math.random() * 3000, q: 6 });
        osc('sine', 2637, t + 0.34, 0.004, 0.03, 0.25, out);
      },
      /* o card: A vidro, com a nota do card e o lado da tela; B seco */
      card: function (t, i, pan) {
        var f = NOTAS[i % NOTAS.length], out = saida(0.28, pan, VOL.tic);
        osc('sine', f, t, 0.002, 0.075, 0.13, out);
        osc('sine', f * 2.01, t, 0.002, 0.018, 0.05, out);
        ruido(t, 0.001, 0.025, 0.012, out, { tipo: 'highpass', f: 6000, q: 0.7 });
      },
      cardSeco: function (t, i, pan) {
        var f = NOTAS[i % NOTAS.length] / 1.5, out = saida(0.08, pan, VOL.ticSeco);
        ruido(t, 0.001, 0.12, 0.016, out, { f: 3600, q: 2 });
        osc('triangle', f, t, 0.002, 0.05, 0.035, out, f * 0.8);
      },
      /* a carga sobe uma quinta e abre o filtro em dura; cheia, trava; solta antes, desce */
      carga: function (t, dura) {
        var out = saida(0.25, 0, VOL.carga), fl = c.createBiquadFilter(), g = c.createGain(), base = [330, 331.5];
        fl.type = 'lowpass'; fl.frequency.setValueAtTime(380, t); fl.frequency.exponentialRampToValueAtTime(2600, t + dura); fl.Q.value = 2;
        g.gain.setValueAtTime(PISO, t); g.gain.exponentialRampToValueAtTime(0.06, t + dura);
        fl.connect(g); g.connect(out);
        var os = [['sine', 330], ['triangle', 331.5]].map(function (v) {
          var o = c.createOscillator(); o.type = v[0]; o.frequency.setValueAtTime(v[1], t); o.frequency.exponentialRampToValueAtTime(v[1] * 1.5, t + dura);
          o.connect(fl); o.start(t); o.stop(t + dura + 1.5); return o;   /* (sem cheio nem soltura, para sozinha) */
        });
        g.gain.setValueAtTime(0.06, t + dura + 1.3); g.gain.exponentialRampToValueAtTime(PISO, t + dura + 1.5);
        function k(tt) { return Math.max(0, Math.min(1, (tt - t) / dura)); }
        function nivel(tt) { return PISO * Math.pow(0.06 / PISO, k(tt)); }
        return {
          soltar: function (tt) {
            fechar(g, os, nivel, PISO, tt, 0.18);
            os.forEach(function (o, i) { var f = base[i] * Math.pow(1.5, k(tt)); o.frequency.cancelScheduledValues(tt); o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 0.7, tt + 0.18); });
          },
          cheio: function (tt) { fechar(g, os, nivel, PISO, tt, 0.06); m.trava(tt); }
        };
      },
      trava: function (t) {
        var out = saida(0.45, 0, VOL.trava);
        osc('sine', 1318.5, t, 0.003, 0.08, 0.9, out);
        osc('sine', 1975.5, t + 0.025, 0.003, 0.05, 0.7, out);
        osc('sine', 2637, t + 0.05, 0.003, 0.018, 0.4, out);
        osc('sine', 170, t, 0.003, 0.22, 0.12, saturado(out), 85);
      },
      /* as vozes de antes (ESCOLHA 'hoje'), nos volumes de antes */
      sino: function (t) { var out = saida(0, 0, 1); osc('sine', 880, t, 0.005, 0.07, 0.445, out); osc('sine', 1320, t + 0.06, 0.005, 0.056, 0.395, out); },
      cliqueHoje: function (t) { var out = saida(0, 0, 1); ruido(t, 0.001, 0.08, 0.011, out, { f: 2500 }); osc('sine', 160, t, 0.005, 0.048, 0.035, out, 90); },
      /* clique: tecla. Toque curto, corpo e um brilho mínimo de confirmação */
      clique: function (t) {
        var out = saida(0.12, 0, VOL.clique);
        ruido(t, 0.001, 0.22, 0.009, out, { f: 3200, q: 1.2 });
        osc('triangle', 240, t, 0.002, 0.22, 0.07, saturado(out), 120);
        osc('sine', 2093, t + 0.012, 0.002, 0.028, 0.05, out);
      },
      /* o OURO em quatro vozes, uma por fase de js/ouro.js. CARGA: serra e ruído que sobem até a ignição (1,8 s);
         a ignição de verdade é quem a corta (parar), e sem ela a subida some sozinha */
      ouroCarga: function (t, contido, dura) {
        var tI = t + (dura || OURO_CARGA);
        if (contido) { osc('sine', 523.25, t + 0.6, 1.1, 0.03, 0.15, saida(0.4, 0, VOL.ouro)); return null; }
        var out = saida(0.3, 0, VOL.ouro), g = c.createGain(), fl = c.createBiquadFilter(), gs = c.createGain(), s = c.createBufferSource(), fr = c.createBiquadFilter(), gr = c.createGain();
        g.connect(out);
        fl.type = 'lowpass'; fl.frequency.setValueAtTime(250, t); fl.frequency.exponentialRampToValueAtTime(3200, tI); fl.Q.value = 3;
        gs.gain.value = 0.1; fl.connect(gs); gs.connect(g);
        var fontes = [110, 110.8].map(function (f) { var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2, tI); o.connect(fl); o.start(t); return o; });
        s.buffer = ruidoBuf; fr.type = 'bandpass'; fr.Q.value = 1.4; fr.frequency.setValueAtTime(400, t); fr.frequency.exponentialRampToValueAtTime(4200, tI);
        gr.gain.value = 0.06; s.connect(fr); fr.connect(gr); gr.connect(g); s.start(t); fontes.push(s);
        var nivel = subida(g, t, tI - 0.02, 0.001);
        g.gain.setValueAtTime(1, tI + 0.6); g.gain.exponentialRampToValueAtTime(0.001, tI + 0.66);
        fontes.forEach(function (f) { f.stop(tI + 0.7); });
        return { parar: function (tt) { fechar(g, fontes, nivel, 0.001, tt, 0.06); } };
      },
      /* IGNIÇÃO: o impacto e o acorde dourado */
      ouroIgnicao: function (t, contido) {
        var imp = saida(0.5, 0, VOL.ouro), acorde = saida(0.6, 0, VOL.ouro);
        osc('sine', 90, t, 0.004, contido ? 0.35 : 0.6, 0.9, saturado(imp), 40);
        ruido(t, 0.002, contido ? 0.08 : 0.18, 0.28, imp, { tipo: 'lowpass', f: 3000, q: 0.5 });
        [[523.25, 0.09], [783.99, 0.07], [1046.5, 0.06], [1318.5, 0.04], [1444.2, 0.018]].forEach(function (n, i) {
          osc('sine', n[0], t + i * 0.012, 0.004, n[1] * (contido ? 0.8 : 1), 2.8, acorde);
        });
      },
      /* REINADO: um acorde baixinho por baixo, que respira, pelo tempo que o ouro reinar (no máximo teto s) */
      ouroReinado: function (t, teto) {
        var pad = saida(0.35, 0, VOL.ouro), pf = c.createBiquadFilter(), pg = c.createGain(), pt = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        pf.type = 'lowpass'; pf.frequency.setValueAtTime(1800, t); pf.connect(pg); pg.connect(pt); pt.connect(pad);
        /* a respiração (±24%, os ±0,012 da prévia no pico) num estágio próprio: some junto com o acorde, sem estalo no fim */
        lfo.frequency.value = 0.14; lg.gain.value = 0.24; lfo.connect(lg); lg.connect(pt.gain);
        var os = [lfo].concat([261.63, 392, 523.25].map(function (f) { var o = c.createOscillator(); o.frequency.setValueAtTime(f, t); o.connect(pf); return o; }));
        pg.gain.setValueAtTime(PISO, t); pg.gain.exponentialRampToValueAtTime(0.05, t + 1.6);
        var nivel = function (tt) { return tt >= t + 1.6 ? 0.05 : PISO * Math.pow(0.05 / PISO, Math.max(0, tt - t) / 1.6); };
        pg.gain.setValueAtTime(0.05, t + teto - 1); pg.gain.exponentialRampToValueAtTime(PISO, t + teto);
        os.forEach(function (o) { o.start(t); o.stop(t + teto + 0.05); });
        return {
          /* esfriando: o filtro fecha e o acorde desafina para baixo enquanto some */
          esfriar: function (tt, dura) {
            var d = dura || OURO_ESFRIA;
            pf.frequency.cancelScheduledValues(tt); pf.frequency.setValueAtTime(1800, tt); pf.frequency.exponentialRampToValueAtTime(280, tt + d);
            os.slice(1).forEach(function (o) { o.detune.setValueAtTime(0, tt); o.detune.linearRampToValueAtTime(-40, tt + d); });
            fechar(pg, os, nivel, PISO, tt, d);
          },
          parar: function (tt) { fechar(pg, os, nivel, PISO, tt, 0.3); }
        };
      },
      /* RESFRIAMENTO: três notas que descem */
      ouroEsfria: function (t) {
        var res = saida(0.6, 0, VOL.ouro);
        [1046.5, 783.99, 523.25].forEach(function (f, i) { osc('sine', f, t + i * 0.5, 0.004, 0.03, 0.7, res); });
      },
      /* TRAVESSIA: o ar que passa de um lado ao outro (a página sai em 0,6 s) */
      passagem: function (t) {
        var out = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
        out.gain.value = VOL.passagem;
        if (p) { p.pan.setValueAtTime(-0.7, t); p.pan.linearRampToValueAtTime(0.7, t + 0.65); out.connect(p); p.connect(vozes); var s = c.createGain(); s.gain.value = 0.25; p.connect(s); s.connect(envio); }
        else out.connect(vozes);
        var fl = c.createBiquadFilter(), g = c.createGain(), src = c.createBufferSource();
        src.buffer = ruidoBuf; fl.type = 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
        g.gain.setValueAtTime(PISO, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.45); g.gain.exponentialRampToValueAtTime(PISO, t + 0.68);
        src.connect(fl); fl.connect(g); g.connect(out); src.start(t); src.stop(t + 0.72);
      },
      /* e a página nova que pousa */
      pouso: function (t) {
        var out = saida(0.5, 0, VOL.passagem);
        osc('sine', 392, t, 0.01, 0.035, 0.5, out);
        osc('sine', 587.33, t + 0.02, 0.01, 0.025, 0.45, out);
      }
    };
    return m;
  }

  /* ---------- montar: o mestre (liga/desliga), o fundo com a sua subida e o motor ---------- */
  /* o navegador pode recusar o contexto (limite de contextos, áudio bloqueado): desiste uma vez, quieto, e esconde
     os botões; sem isso o erro voltava ao console a cada gesto e o fôlego quebrava com o fundo pela metade */
  function montar() {
    try {
      ctx = new Ctx();
      mestre = ctx.createGain();
      mestre.gain.value = PISO;
      mestre.connect(ctx.destination);
      sobe = ctx.createGain();
      sobe.gain.value = PISO;
      sobe.connect(mestre);
      fundo = montarFundo(ctx, sobe);
      motor = criarMotor(ctx, mestre);
      return true;
    } catch (e) {
      if (ctx && ctx.close) ctx.close().catch(function () { /* já fechado */ });
      ctx = mestre = sobe = fundo = motor = null;
      semAudio = true;
      botoes.forEach(function (b) { b.hidden = true; });
      return false;
    }
  }

  function montarFundo(c, para) {
    var saida = c.createGain(), filtro = c.createBiquadFilter();
    saida.gain.value = FUNDO.vol;
    filtro.type = 'lowpass';
    filtro.frequency.value = FUNDO.filtro.expira;
    filtro.Q.value = FUNDO.coro ? 0.5 : 0.7;
    filtro.connect(saida);
    saida.connect(para);
    FUNDO.notas.forEach(function (n) {
      var cents = FUNDO.coro ? [-FUNDO.coro, FUNDO.coro] : [n[3]], g = c.createGain();
      g.gain.value = n[2] / cents.length;
      g.connect(filtro);
      /* o balanço: a nota sobe e desce devagar (um LFO no ganho), cada uma no seu tempo, para o acorde nunca parar igual */
      if (n[4]) {
        var lfo = c.createOscillator(), prof = c.createGain();
        lfo.frequency.value = 1 / n[4]; prof.gain.value = g.gain.value * 0.45;
        lfo.connect(prof); prof.connect(g.gain); lfo.start();
      }
      cents.forEach(function (d) {
        var o = c.createOscillator();
        o.type = n[1]; o.frequency.value = n[0]; o.detune.value = d;
        o.connect(g); o.start();
      });
    });
    if (FUNDO.ar) {   /* o ar: ruído em faixa larga, muito baixo, que dá o espaço sem chiar */
      var n = Math.round(c.sampleRate * 2), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var s = c.createBufferSource(), bp = c.createBiquadFilter(), ga = c.createGain();
      s.buffer = b; s.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.6; ga.gain.value = FUNDO.ar / FUNDO.vol;
      s.connect(bp); bp.connect(ga); ga.connect(saida); s.start();
    }
    return { saida: saida, filtro: filtro };
  }

  /* (o contexto que nasce no gesto pode começar suspenso e só rodar um instante depois: o que for agendado nessa
     janela toca quando ele rodar; sem ela, o 1º toque no celular e o pouso da travessia se perdiam) */
  function tocando() { return ligado && subiu && ctx && !document.hidden && (ctx.state === 'running' || (ctx.state === 'suspended' && Date.now() < acordaAte)); }
  /* TODA voz passa por aqui: só com o som ligado e acordado, e dentro do limite do tipo dela */
  function soa(tipo, toca, info) {
    if (!tocando()) return false;
    var lim = LIMITE[tipo] || UMA, agora = ctx.currentTime, v = vivas[tipo] || (vivas[tipo] = []);
    while (v.length && v[0] <= agora) v.shift();
    if (agora - (tipo in ultimo ? ultimo[tipo] : -1e9) < lim[0] || v.length >= lim[1]) return false;
    ultimo[tipo] = agora; v.push(agora + lim[2]);
    if (teste) { teste.vozes[tipo] = (teste.vozes[tipo] || 0) + 1; if (teste.log.push(Object.assign({ tipo: tipo, t: agora, relogio: B.relogio ? B.relogio() : 0 }, info)) > 500) teste.log.shift(); }
    toca(agora + ADIANTE);
    return true;
  }

  /* ---------- o fôlego e o pulso: agendados no relógio do reator, um ciclo por vez ---------- */
  function periodo() { return (B && B.FOLEGO && B.FOLEGO.periodo) || 7; }
  function inspira() { return (B && B.FOLEGO && B.FOLEGO.inspira) || 0.42; }
  function respirar() {
    clearTimeout(timerFolego);
    if (!ligado || !subiu || document.hidden) return;
    /* contexto ainda acordando (Safari) ou interrompido (ligação no iPhone): o statechange religa o ciclo */
    if (ctx.state !== 'running') return;
    var t = ctx.currentTime, tIn = periodo() * inspira(), tEx = periodo() - tIn;
    fundo.filtro.frequency.setTargetAtTime(FUNDO.filtro.inspira, t, tIn / 3);
    fundo.saida.gain.setTargetAtTime(FUNDO.vol * FOLEGO_VOL.inspira, t, tIn / 3);
    fundo.filtro.frequency.setTargetAtTime(FUNDO.filtro.expira, t + tIn, tEx / 3);
    fundo.saida.gain.setTargetAtTime(FUNDO.vol * FOLEGO_VOL.expira, t + tIn, tEx / 3);
    respirarEmFase();
  }
  /* cada fôlego começa quando o do reator recomeça (recalculado a cada ciclo: timers encadeados derivavam) */
  function respirarEmFase() {
    clearTimeout(timerFolego);
    var falta = B && B.relogio ? periodo() - (B.relogio() % periodo()) : periodo();
    timerFolego = setTimeout(respirar, falta * 1000);
  }
  /* o PULSO: no instante em que js/rede.js solta a onda (a fase do fôlego cruza inspira), com o mesmo relógio.
     Não pulsa sem onda para ver: movimento reduzido (o campo fica parado), página saindo ou ainda chegando (o laço
     está pausado), nem antes de o fundo subir (o 1º som automático não chega do nada) */
  function pulsarEmFase() {
    clearTimeout(timerPulso);
    if (!B || !B.relogio) return;
    var P = periodo(), falta = P * inspira() - B.relogio() % P;
    if (falta < 0.02) falta += P;
    timerPulso = setTimeout(pulsar, falta * 1000);
  }
  /* o número deste pulso no relógio do reator (B.pulso, js/core.js: o mesmo da página e do reator): a vez dele na frase
     de 4 e o forte. (Sem B.pulso, a mesma conta aqui) */
  function numeroDoPulso() { var P = periodo(); return B.pulso ? B.pulso.numero(B.relogio()) : Math.round((B.relogio() - P * inspira()) / P); }
  function pulsar() {
    pulsarEmFase();
    /* (com o cursor carregando um card, ou o card já cheio sob ele, a vez é da pessoa: o pulso cala. O sinal é o
       mesmo da página, js/pulso.js: as classes de js/carga.js; a voz da carga cobre o instante antes delas) */
    if (reduzido() || saindo || carga || document.querySelector(OCUPADO) || html.classList.contains('passagem-chega') || !ctx || ctx.currentTime < pulsoDepois) return;
    var n = numeroDoPulso(), i = ((n % 4) + 4) % 4, forte = i === 3, k = FRASE[i];
    soa('pulso', function (t) {
      if (ESCOLHA.pulso === 'B') motor.pulsoSuave(t); else if (ESCOLHA.pulso === 'A') motor.pulso(t); else motor.pulsoLuz(t, k, forte);
    }, { forte: forte, nota: k });
  }
  /* resume() fora de gesto pode falhar no Safari: sem reclamar, o próximo gesto tenta de novo */
  function retomar() { if (ctx.state !== 'running') { acordaAte = Date.now() + ACORDA_MS; ctx.resume().catch(function () { /* o próximo gesto tenta */ }); } }
  /* segura a rampa onde ela está (sem o salto de volta ao último valor marcado); sem o método, marca o valor de agora */
  function segurar(g, t) {
    if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t);
    else { var v = g.gain.value; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(v, PISO), t); }
  }

  /* ---------- liga, desliga ---------- */
  /* travessia: a página chegou pela travessia com o som tocando na anterior: o gesto foi o clique de lá */
  function acordar(e, travessia) {
    /* o gesto no próprio botão de som é dele: ligar ou desligar decide o que acontece (antes, o toque para
       desligar criava o áudio e gastava a subida longa da 1ª página) */
    if (!ligado || semAudio || (!travessia && !temGesto()) || (e && e.target && e.target.closest && e.target.closest('[data-som]'))) return;
    if (!ctx) {
      if (!montar()) return;
      /* acordou (no Safari o contexto novo começa suspenso) ou voltou de uma interrupção: o fôlego recomeça */
      ctx.addEventListener('statechange', function () { if (ctx.state === 'running' && ligado && subiu) { respirarEmFase(); pulsarEmFase(); } });
    }
    retomar();
    if (subiu) return;
    subiu = true;
    var t = ctx.currentTime, dura = primeiraDaVisita() ? SOBE.primeira : travessia ? SOBE.travessia : SOBE.seguintes;
    /* o mestre abre já (as respostas à pessoa soam no primeiro clique); o fundo sobe devagar */
    segurar(mestre, t);
    mestre.gain.exponentialRampToValueAtTime(1, t + 0.05);
    /* (do piso, sempre: ao religar, o fundo de antes não volta de uma vez) */
    sobe.gain.cancelScheduledValues(t); sobe.gain.setValueAtTime(PISO, t);
    sobe.gain.exponentialRampToValueAtTime(1, t + dura);
    pulsoDepois = t + dura;
    respirarEmFase();
    pulsarEmFase();
    /* o ouro já reinava quando o som acordou (a página chegou no meio dele): o acorde entra por baixo */
    if (B && B.ouro && B.ouro.estado === 'reinado') reinar();
  }

  function calar() {
    subiu = false;
    clearTimeout(timerFolego);
    clearTimeout(timerPulso);
    soltarCarga();
    pararOuro();   /* (religado no meio do reinado, o acorde recomeça: acordar) */
    if (!ctx) return;
    var t = ctx.currentTime;
    segurar(mestre, t);
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

  /* ---------- o card: cada um a sua nota (a vez dele na fileira) e o lado da tela ---------- */
  function tocarCard(el) {
    soa('card', function (t) {
      var i = 0, r = el.getBoundingClientRect(), pan = ((r.left + r.width / 2) / (window.innerWidth || 1)) * 1.2 - 0.6;
      /* (card sozinho no seu invólucro, li > .painel: vale a vez do invólucro) */
      var na = el.previousElementSibling || el.nextElementSibling || !el.parentElement ? el : el.parentElement;
      for (var s = na.previousElementSibling; s; s = s.previousElementSibling) i++;
      if (ESCOLHA.card === 'B') motor.cardSeco(t, i, pan); else motor.card(t, i, pan);
    });
  }
  /* a CARGA (só onde js/carga.js carrega: desktop com mouse, sem movimento reduzido). O tempo até encher sai da
     conta da própria carga (segue o alvo a ENCHE/s até CHEIO), a partir de onde ela está */
  function carregar(el) {
    var c = el._carga;
    if (ESCOLHA.carga !== 'proposta' || !c || c.cheio || c.sobre || reduzido() || !desktop.matches) return;
    soltarCarga();
    var p = Math.min(0.99, Math.max(0, c.p || 0)), dura = Math.min(2.5, Math.max(0.25, Math.log((1 - p) / (1 - CHEIO)) / ENCHE));
    soa('carga', function (t) { carga = { el: el, voz: motor.carga(t, dura) }; });
  }
  function soltarCarga() { if (carga && ctx) carga.voz.soltar(ctx.currentTime + ADIANTE); carga = null; }

  /* pointerenter não sobe, mas passa pela captura do documento: um ouvinte só para todos os cards e botões */
  document.addEventListener('pointerenter', function (e) {
    var el = e.target;
    if (e.pointerType !== 'mouse' || !el.matches) return;
    if (el.matches(CARDS)) { tocarCard(el); carregar(el); }
    else if (el.matches('.btn')) tocarCard(el);
  }, true);
  document.addEventListener('pointerleave', function (e) { if (carga && e.target === carga.el) soltarCarga(); }, true);

  document.addEventListener('click', function (e) {
    var alvo = e.target.closest ? e.target : e.target.parentElement;
    if (!alvo || alvo.closest('[data-som]')) return;
    if (alvo.closest(CLICAVEIS)) soa('clique', function (t) { if (ESCOLHA.clique === 'hoje') motor.cliqueHoje(t); else motor.clique(t); });
    else if (alvo.closest(CARDS)) tocarCard(alvo.closest(CARDS));
  }, true);

  if (B && B.on) {
    /* cheio: a carga deste card trava; sem carga tocando (a estação encheu os cards), só a trava */
    B.on('carga:cheio', function (el) {
      var v = carga && carga.el === el ? carga.voz : null;
      if (v) carga = null;
      var tocou = soa('trava', function (t) { if (v) v.cheio(t); else if (ESCOLHA.carga === 'hoje') motor.sino(t); else motor.trava(t); });
      if (!tocou && v && ctx) v.soltar(ctx.currentTime + ADIANTE);
    });

    /* O OURO, fase a fase (js/ouro.js) */
    B.on('ouro', function (d) {
      var f = d && d.fase, contido = ESCOLHA.ouro === 'B';
      if (f === 'carga') { pararOuro(); soa('ouroCarga', function (t) { ouro.sobe = motor.ouroCarga(t, contido, tempoOuro('carga')); }); }
      else if (f === 'ignicao') { pararSubida(); soa('ouroIgnicao', function (t) { motor.ouroIgnicao(t, contido); }); }
      else if (f === 'reinado') { pararSubida(); if (!saindo) reinar(); }
      else if (f === 'esfria') {
        var r = ouro.reina; ouro.reina = null;
        /* (com a aba escondida o relógio do áudio está parado e o ouro segue no relógio real: a queda longa tocaria
           inteira na volta, com o ouro já apagado; ali o acorde só fecha) */
        if (r && ctx) { if (document.hidden) r.parar(ctx.currentTime + ADIANTE); else r.esfriar(ctx.currentTime + ADIANTE, tempoOuro('esfria')); }
        soa('ouroEsfria', function (t) { motor.ouroEsfria(t); });
      } else if (f === 'fim') pararOuro();
    });

    /* A TRAVESSIA: o ar que passa na saída; a página nova pousa ao assentar */
    B.on('passagem', function () {
      saindo = true;
      soltarCarga();
      if (!tocando()) return;
      try { sessionStorage.setItem(VIVO, String(Date.now())); } catch (e) { /* sem armazenamento: a página nova espera o gesto */ }
      if (ESCOLHA.travessia) soa('passagem', function (t) { motor.passagem(t); });
    });
    B.on('passagem:desfeita', function () { saindo = false; });

    /* O AI CORE MÉDIO (js/estacao.js) e as interações especiais (js/mini-docas.js, js/energia-texto.js) */
    B.on('estacao:acopla', function (d) { pararEnche(); soa('estacaoEnche', function (t) { enche = motor.estacaoEnche(t, (d && d.dura) || 2); }); });
    B.on('estacao:conecta', function () { pararEnche(); soa('estacaoConecta', function (t) { motor.estacaoConecta(t); }); });
    B.on('estacao:surto', function (d) { soa('estacaoSurto', function (t) { motor.estacaoSurto(t, d && d.n); }); });
    B.on('estacao:solta', function () { pararEnche(); soa('estacaoSolta', function (t) { motor.estacaoSolta(t); }); });
    B.on('mini:ignicao', function () { soa('ignicao', function (t) { motor.ignicao(t); }); });
    B.on('energia:descarga', function () { soa('descarga', function (t) { motor.descarga(t); }); });
    B.on('passagem:chegou', function () {
      acordarNoPouso();   /* (o áudio da página nova nasce aqui, não no meio do voo: ver o fim do arquivo) */
      if (ESCOLHA.travessia && veioComSom) soa('pouso', function (t) { motor.pouso(t); });
    });
  }
  function pararEnche() { if (enche && ctx) enche.parar(ctx.currentTime + ADIANTE); enche = null; }
  function tempoOuro(k) { return B.ouro && B.ouro.T && B.ouro.T[k] > 0 ? B.ouro.T[k] : 0; }
  function pararSubida() { if (ouro.sobe && ctx) ouro.sobe.parar(ctx.currentTime + ADIANTE); ouro.sobe = null; }
  function pararOuro() { pararSubida(); if (ouro.reina && ctx) ouro.reina.parar(ctx.currentTime + ADIANTE); ouro.reina = null; }
  function reinar() {
    if (ouro.reina) return;
    var teto = (tempoOuro('reinado') || 30) + 5;   /* (o reinado de js/ouro.js, com folga: quem o encerra é o 'esfria') */
    soa('ouroReinado', function (t) { ouro.reina = motor.ouroReinado(t, teto); });
  }

  /* aba escondida: silêncio (o contexto para); de volta, retoma no mesmo nível */
  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { clearTimeout(timerFolego); clearTimeout(timerPulso); if (ctx.state === 'running') ctx.suspend(); }
    else if (ligado && subiu) { retomar(); respirarEmFase(); pulsarEmFase(); }
  });

  /* CHEGOU PELA TRAVESSIA com o som tocando na página de antes (há menos de 10 s: num aparelho lento a página nova
     demora): o clique de lá foi o gesto. Só onde o navegador conta esse gesto nesta página (o Chrome passa a ativação
     adiante na mesma origem: userActivation.hasBeenActive); nos outros, quieto, espera o primeiro gesto daqui */
  var veioComSom = false;
  try { veioComSom = html.classList.contains('passagem-chega') && Date.now() - (+sessionStorage.getItem(VIVO) || 0) < 10000; } catch (e) { /* sem armazenamento */ }
  /* ...mas só no POUSO ('passagem:chegou'), não na carga deste script: criar o AudioContext trava a página (75 a 103 ms
     medidos no Chrome do dono, 2026-11-12), e na carga isso caía no meio do voo de chegada. O fundo sobe a partir do
     pouso. Rede de segurança: se a passagem não avisar (falhou ao carregar, aba escondida), acorda em 3 s */
  var POUSO_MAX_MS = 3000;
  var esperaPouso = false, timerPouso = 0;
  function acordarNoPouso() {
    if (!esperaPouso) return;
    esperaPouso = false;
    clearTimeout(timerPouso);
    acordar(null, true);
  }
  if (veioComSom && navigator.userActivation && navigator.userActivation.hasBeenActive) {
    if (B && B.on) { esperaPouso = true; timerPouso = setTimeout(acordarNoPouso, POUSO_MAX_MS); } else acordar(null, true);
  }
})();
