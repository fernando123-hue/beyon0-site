/* ==========================================================================
   DOM E EVENTOS

   Regra que este arquivo respeita à risca: o CSS só é tocado em EVENTOS
   discretos — uma classe que entra ou sai, poucas vezes por minuto. O Pulso e o
   Estado Singular escrevem NÚMEROS no estado compartilhado, e quem os desenha
   é o canvas. Nenhuma variável de CSS muda por frame.
   ========================================================================== */
(function () {
  'use strict';

  var B = window.BEYON;
  if (!B) return;
  var S = B.S;

  /* ---------- WhatsApp: o número vive num lugar só ----------
     O valor de data-wa vira o assunto da mensagem, então a conversa já chega
     qualificada ("quero recuperar oportunidades perdidas com IA" em vez de
     "quero IA"). Sem valor, cai na mensagem genérica — que pergunta pelo
     PROBLEMA, não pela tecnologia. */
  var FONE = '5521977167944';
  function linkWA(assunto) {
    var txt = assunto
      ? 'Oi! Vim pelo site da Beyon Zero e quero falar sobre ' + assunto + '.'
      : 'Oi! Vim pelo site da Beyon Zero e quero entender onde a IA pode ajudar no meu negócio.';
    return 'https://wa.me/' + FONE + '?text=' + encodeURIComponent(txt);
  }
  var links = document.querySelectorAll('[data-wa]');
  for (var i = 0; i < links.length; i++) {
    links[i].href = linkWA(links[i].getAttribute('data-wa'));
    links[i].rel = 'noopener noreferrer';
    links[i].target = '_blank';
  }

  var ano = document.getElementById('year');
  if (ano) ano.textContent = new Date().getFullYear();

  /* painéis que fecham com Escape. Cada bloco registra o seu; o listener único
     que percorre esta lista está no fim do arquivo. */
  var aoEscapar = [];

  /* ---------- ESTÁTICA — a marca de transição, reutilizável ----------
     Um flash de ruído sobre um elemento: "o sinal está sendo reescrito aqui".
     A palavra do hero usa a PRÓPRIA variação do efeito (embaralhamento de
     caracteres — ver `morph`, abaixo) porque ali o TEXTO muda de verdade; aqui
     o elemento não muda de conteúdo, só pisca — a leitura de um instrumento
     registrando um evento, não de um texto sendo reescrito.

     Exposta em `B.estatica` porque js/anima.js (carregado depois deste
     arquivo, mas executando no mesmo documento) dispara em cima do PRÓPRIO
     caminho de revelação — sem isto o kicker só piscaria no caminho de
     fallback sem GSAP, que é justamente o que quase ninguém usa. */
  B.estatica = function (el) {
    if (!el || B.reduced) return;
    el.classList.remove('is-registrando');
    void el.offsetWidth;                  /* reinicia se já estava piscando */
    el.classList.add('is-registrando');
  };

  /* ---------- reveals — nível 2: o fade sutil da navegação ----------
     Uma transição, disparada uma vez ao entrar na viewport. Só LIGA depois
     de 'entrada-pronta' (js/entrada.js): assim não revela nada por baixo do
     overlay de vídeo, e a seção que a LINHA (nível 1) já revelou é pulada
     aqui — os dois níveis não competem pelo mesmo conteúdo. */
  var reveals = document.querySelectorAll('.reveal');
  function ligarReveals() {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        for (var k = 0; k < ents.length; k++) {
          if (!ents[k].isIntersecting) continue;
          var alvo = ents[k].target;
          io.unobserve(alvo);                        /* cumpriu o papel, sai da lista */
          if (alvo.closest('.revelando')) continue;  /* a linha cuida desses */
          alvo.classList.add('is-in');
          if (alvo.classList.contains('section__head')) B.estatica(alvo.querySelector('.kicker'));
        }
      }, { rootMargin: '0px 0px -8% 0px' });
      for (var r = 0; r < reveals.length; r++) io.observe(reveals[r]);
    } else {
      for (var r2 = 0; r2 < reveals.length; r2++) reveals[r2].classList.add('is-in');
    }
  }

  var reveladoLigado = false;
  function ligarUmaVez() { if (reveladoLigado) return; reveladoLigado = true; ligarReveals(); }

  /* quando o GSAP+ScrollTrigger estão presentes (e sem reduced-motion), quem
     revela é js/anima.js, com cascata e easing melhores. dom.js CEDE — não arma
     o IO, senão os dois competiriam pelo mesmo `.reveal`. Se o GSAP não vier, ou
     em reduced-motion, dom.js continua sendo o dono (fallback garantido). */
  var gsapReveal = !!(window.gsap && window.ScrollTrigger) && !B.reduced;

  if (B.reduced) {
    ligarUmaVez();                       /* sem linha, sem espera: revela tudo */
  } else if (gsapReveal) {
    /* o anima.js cuida (via 'entrada-pronta'); dom.js não faz nada aqui */
  } else {
    B.on('entrada-pronta', ligarUmaVez);
    /* rede de segurança: se js/entrada.js sumir/falhar e nunca emitir
       'entrada-pronta', não deixa os reveals presos escondidos. Presa ao
       'booted' (não ao 'load'): 'booted' só dispara DEPOIS da intro, então
       o fallback nunca ganha a corrida do caminho normal — entrada.js emite
       'entrada-pronta' em booted+2rAF, bem antes destes 4s. Assim o IO nunca
       arma antes de `.revelando`, e a garantia de não-flicker não depende do
       overlay opaco. `reveladoLigado` faz o perdedor virar no-op. */
    var comBooted = function () { setTimeout(ligarUmaVez, 4000); };
    if (document.body.classList.contains('booted')) comBooted();
    else B.on('booted', comBooted);
  }

  /* ---------- borda de energia: pausa fora da viewport ----------
     A borda de luz dos cards anima um @property em CSS. Fora da tela ela não
     precisa pintar: o IO marca .is-idle e o CSS pausa (animation-play-state).
     Discreto — dispara no cruzamento do limiar, nada por frame. Ao voltar,
     retoma de onde parou, sem pipocar. */
  if ('IntersectionObserver' in window) {
    var ioBorda = new IntersectionObserver(function (ents) {
      for (var b = 0; b < ents.length; b++) {
        ents[b].target.classList.toggle('is-idle', !ents[b].isIntersecting);
      }
    }, { rootMargin: '140px 0px 140px 0px' });
    var cardsBorda = document.querySelectorAll('.card, .cta');
    for (var cb = 0; cb < cardsBorda.length; cb++) ioBorda.observe(cardsBorda[cb]);
  }

  /* ---------- proximidade: a ESTRUTURA do card reage ao cursor ----------
     O dono não quer luz em volta — quer o próprio card acendendo conforme o
     cursor chega. Este bloco escreve `--near` (0..1) no card, e o CSS usa isso
     para subir a borda, o vidro e os acentos. O hover/foco é o pico (CSS puro).

     Por que isto NÃO é a var-CSS-por-frame que causou os 76ms:
       · roda só quando o mouse MOVE (pointermove), no máximo 1x por frame (rAF);
         mouse parado = zero trabalho.
       · escreve só nos cards cujo valor MUDOU (quantizado em passos de .05).
       · o recálculo atinge o card e seus filhos — não o :root lido por 126
         regras. São 1-3 cards por movimento, não 205 spans.
     Só com ponteiro fino: no toque não há cursor a seguir. */
  /* preenchido pelo bloco de proximidade abaixo quando há ponteiro fino; fica
     visível aqui em cima porque o ÚNICO listener de scroll do arquivo (mais
     abaixo) precisa chamá-lo. No toque continua nulo e o listener nem tenta. */
  var pedirNear = null;

  if (B.fine) {
    /* `.app` entra junto: a camada de instrumentação acende a fronteira de cada
       célula de malha conforme o cursor chega, e as aplicações são uma malha
       igual à das capacidades. Sem isto o seletor `.apps > .app::after` leria
       `--near: 0` para sempre e aquela metade da regra seria letra morta.
       São 3 elementos a mais num total de 9 — o custo do laço não muda. */
    var cardsNear = document.querySelectorAll('.card, .app');
    /* CENTROS EM CACHE, em coordenadas de DOCUMENTO. Antes, varrer() lia
       getBoundingClientRect de todos os cards a CADA frame de movimento — e logo
       depois de escrever --near, forçando layout síncrono (read-after-write). O
       centro em coordenadas de documento não muda com o scroll: guardo uma vez e
       no frame só subtraio o scroll. Zero leitura de layout por frame. */
    var centros = [];
    var medirCentros = function () {
      centros.length = 0;
      var sx = window.pageXOffset, sy = window.pageYOffset;
      for (var i = 0; i < cardsNear.length; i++) {
        var r = cardsNear[i].getBoundingClientRect();
        centros.push({ el: cardsNear[i], dcx: r.left + sx + r.width / 2,
                       dcy: r.top + sy + r.height / 2, h: r.height });
      }
    };
    /* OS CONTROLES têm o próprio cache, com o mesmo princípio: centro em
       coordenadas de documento, medido só quando o layout muda. Eles não
       acendem — eles são ATRAÍDOS (ver o bloco do ímã dentro de varrer). */
    /* em movimento reduzido a lista fica VAZIA e o laço do ímã não roda —
       deslocar um controle sob o cursor é exatamente o tipo de movimento não
       solicitado que essa preferência pede para não existir. */
    var botoes = B.reduced ? [] : document.querySelectorAll('.btn');
    var centrosBtn = [];
    var medirBotoes = function () {
      centrosBtn.length = 0;
      var sx = window.pageXOffset, sy = window.pageYOffset;
      for (var i = 0; i < botoes.length; i++) {
        var r = botoes[i].getBoundingClientRect();
        if (!r.width) continue;
        /* CONTROLE FIXO guarda coordenada de VIEWPORT; o resto guarda coordenada
           de DOCUMENTO. Sem esta distinção o cache mentia: `getBoundingClientRect`
           de um elemento fixo já vem em viewport, e somar o scroll a ele produz
           um ponto de documento que anda junto com a página. O CTA da nav e o
           botão do medidor (ambos dentro de contêineres `position: fixed`) eram
           medidos uma vez no topo e depois ficavam com o alvo do ímã centenas de
           pixels acima da tela — na prática o ímã morria assim que a pessoa
           rolava, exatamente nos dois controles que existem em todas as telas. */
        var fixo = !!botoes[i].closest('.nav, .medidor');
        centrosBtn.push({ el: botoes[i], fixo: fixo,
                          dcx: r.left + (fixo ? 0 : sx) + r.width / 2,
                          dcy: r.top + (fixo ? 0 : sy) + r.height / 2, h: r.height });
      }
    };

    var mx = -9999, my = -9999, agendado = false;
    var RAIO = 340;
    /* ÍMÃ: alcance curto e deslocamento minúsculo, de propósito. A 110px o
       controle só reage quando a intenção de clicar já existe, e 4px é o
       limite em que o olho percebe "ele veio até mim" sem o botão parecer
       solto da página. Passar disso vira brinquedo. */
    var RAIO_IMA = 110, PUXA = 4;
    var varrer = function () {
      agendado = false;
      var sx = window.pageXOffset, sy = window.pageYOffset, vh = window.innerHeight;
      var maiorPerto = 0;
      for (var i = 0; i < centros.length; i++) {
        var c = centros[i], vy = c.dcy - sy, n = 0;   /* centro no viewport */
        if (vy > -c.h && vy < vh + c.h) {
          var dx = mx - (c.dcx - sx), dy = my - vy, d = Math.sqrt(dx * dx + dy * dy);
          if (d < RAIO) { n = 1 - d / RAIO; n = n * n; }
        }
        if (n > maiorPerto) maiorPerto = n;
        var q = Math.round(n * 20) / 20;               /* passos de .05: menos escritas */
        if (q !== c.el._near) {
          c.el._near = q;
          if (q > 0) c.el.style.setProperty('--near', String(q));
          else c.el.style.removeProperty('--near');
        }
      }
      /* alimenta o REGIME: "focused" é o cursor pousado sobre algo que
         responde. Quem define o estado é o núcleo (js/core.js); aqui só se
         publica a medida, que já estava sendo calculada de qualquer forma. */
      S.focus = maiorPerto;

      /* ---- O ÍMÃ ----
         O controle se desloca na direção do cursor quando ele chega perto. Vai
         em `translate` e NÃO em `transform` de propósito: o GSAP dirige
         `transform` na entrada do hero, e as duas propriedades são canais
         separados que o navegador compõe — assim o ímã nunca disputa valor com
         a animação de entrada nem é zerado por ela. Quantizado em passos de 1px:
         o estilo só é reescrito quando o valor de fato muda. */
      for (var b = 0; b < centrosBtn.length; b++) {
        var cb = centrosBtn[b];
        var bx = cb.fixo ? cb.dcx : cb.dcx - sx;
        var by = cb.fixo ? cb.dcy : cb.dcy - sy;
        var ux = 0, uy = 0;
        if (by > -cb.h && by < vh + cb.h) {
          var ex = mx - bx, ey = my - by;
          var ed = Math.sqrt(ex * ex + ey * ey);
          if (ed < RAIO_IMA && ed > .5) {
            var forca = (1 - ed / RAIO_IMA) * PUXA;
            ux = Math.round(ex / ed * forca); uy = Math.round(ey / ed * forca);
          }
        }
        if (ux !== cb.el._ix || uy !== cb.el._iy) {
          cb.el._ix = ux; cb.el._iy = uy;
          if (ux || uy) cb.el.style.translate = ux + 'px ' + uy + 'px';
          else cb.el.style.translate = '';
        }
      }
    };
    var pedir = function () { if (!agendado) { agendado = true; requestAnimationFrame(varrer); } };
    pedirNear = pedir;                    /* o listener único de scroll chama por aqui */
    var medirTudo = function () { medirCentros(); medirBotoes(); };
    medirTudo();
    window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; pedir(); }, { passive: true });
    window.addEventListener('pointerleave', function () { mx = -9999; my = -9999; pedir(); }, { passive: true });
    /* os centros só mudam quando o LAYOUT muda: recalcula aí, nunca por frame. */
    window.addEventListener('resize', medirTudo, { passive: true });
    window.addEventListener('load', medirTudo, { passive: true });
    B.on('entrada-pronta', medirTudo);
    B.on('remedir', medirTudo);           /* a palavra viva pode reflowar o hero */
  }

  /* ---------- menu do celular: uma classe, por clique ----------
     O botão nasce [hidden] e só é revelado aqui: se este script falhar, ninguém
     vê um controle inerte (o CSS sozinho deixaria os links fechados e sem saída). */
  var navEl = document.getElementById('nav');
  var navBtn = document.querySelector('.nav__toggle');
  var navLista = document.getElementById('nav-links');
  if (navEl && navBtn && navLista) {
    navBtn.hidden = false;
    var fecharMenu = function (devolverFoco) {
      if (!navEl.classList.contains('is-open')) return;
      navEl.classList.remove('is-open');
      navBtn.setAttribute('aria-expanded', 'false');
      navBtn.setAttribute('aria-label', 'Abrir menu');
      if (devolverFoco) navBtn.focus();
    };
    navBtn.addEventListener('click', function () {
      var abrindo = !navEl.classList.contains('is-open');
      navEl.classList.toggle('is-open', abrindo);
      navBtn.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
      navBtn.setAttribute('aria-label', abrindo ? 'Fechar menu' : 'Abrir menu');
    });
    /* escolher um destino fecha o menu — senão ele tampa a seção recém-aberta */
    navLista.addEventListener('click', function (e) {
      if (e.target.closest('a')) fecharMenu(false);
    });
    aoEscapar.push(function () { fecharMenu(true); });
  }

  /* ---------- o ÚNICO listener de scroll do arquivo ----------
     Eram dois (a nav e a proximidade dos cards), cada um com o seu handler. Um
     caminho só: nada aqui mede layout, então a ordem não importa e o custo é o
     de uma comparação. `navEl` é reaproveitado — antes este bloco fazia um
     segundo getElementById('nav') e usava o resultado SEM guarda de nulo, então
     um HTML sem #nav lançava a cada scroll (e derrubava com ele o resto do
     arquivo). */
  var presa = false;
  window.addEventListener('scroll', function () {
    if (navEl) {
      var quer = window.scrollY > 40;
      if (quer !== presa) { presa = quer; navEl.classList.toggle('is-stuck', quer); }
    }
    if (pedirNear) pedirNear();          /* cards passam sob o cursor parado */
  }, { passive: true });

  /* ---------- onde estou: a seção atual acende na nav ----------
     Num site de página única a pessoa perde a referência de lugar. O
     IntersectionObserver só dispara ao cruzar o limiar — nada por frame. A
     faixa de leitura é o terço superior da tela, logo abaixo da nav. */
  if (navEl && 'IntersectionObserver' in window) {
    var doNav = {};
    var ancoras = navEl.querySelectorAll('.nav__links a[href^="#"]');
    for (var a = 0; a < ancoras.length; a++) {
      var alvo = ancoras[a].getAttribute('href').slice(1);
      if (alvo) doNav[alvo] = ancoras[a];
    }
    var visiveis = {};
    var atual = null;
    var ioSecao = new IntersectionObserver(function (ents) {
      for (var i = 0; i < ents.length; i++) visiveis[ents[i].target.id] = ents[i].isIntersecting;
      /* a primeira seção visível na ordem do documento manda */
      var novo = null;
      for (var id in doNav) if (visiveis[id]) { novo = id; break; }
      if (novo === atual) return;
      if (atual && doNav[atual]) {
        doNav[atual].classList.remove('is-current');
        doNav[atual].removeAttribute('aria-current');
      }
      atual = novo;
      if (atual) {
        doNav[atual].classList.add('is-current');
        doNav[atual].setAttribute('aria-current', 'true');
      }
    }, { rootMargin: '-80px 0px -66% 0px' });   /* -80px = altura da nav fixa */
    for (var idSec in doNav) {
      var sec = document.getElementById(idSec);
      if (sec) ioSecao.observe(sec);
    }
  }

  /* ---------- reescrita de texto pelo glitch ----------
     Um elemento só. O efeito custa o que custa mexer em um textContent. */
  var GL = '01<>/\\[]{}=+*#%&ABCDEF';
  function morph(de, para, p) {
    var L = Math.max(de.length, para.length), out = '';
    for (var i = 0; i < L; i++) {
      var r = (p - (i / (L || 1)) * .5) / .4;
      if (r >= 1) out += para.charAt(i);
      else if (r <= -.35) out += de.charAt(i);
      else out += (para.charAt(i) === ' ' && de.charAt(i) === ' ')
        ? ' ' : GL.charAt((Math.random() * GL.length) | 0);
    }
    return out;
  }

  var navWordmark = document.querySelector('.nav__logo .wordmark');
  var stEl = document.querySelector('.hero__status-txt');
  var stDe = 'Sistema online · Beyon Zero', stPara = stDe, stP = 1, stMostrado = stDe;
  function anunciar(txt) {
    if (txt === stPara) return;
    stDe = stMostrado; stPara = txt; stP = 0;
  }
  function driveStatus(dt) {
    if (!stEl || stP >= 1) return;
    stP = Math.min(1, stP + dt / 700);
    var s = stP >= 1 ? stPara : morph(stDe, stPara, stP);
    if (s !== stMostrado) { stMostrado = s; stEl.textContent = s; }
  }

  /* ---------- A PALAVRA VIVA — o núcleo do hero muda de leitura ----------
     "aplicada" não é a única leitura da frase. O sistema cicla por um
     vocabulário pequeno do MESMO campo semântico — particípios que fecham com
     "ao que" sem forçar a gramática — e no Estado Singular troca para um
     vocabulário mais assertivo: o momento em que o site já está fazendo o
     espetáculo é o momento certo pra copy mais confiante. Nenhuma das palavras
     do Singular evoca medo, ameaça ou dano — são palavras de PRECISÃO e
     DECISÃO, não de pressão. O pedido era agressivo sem gerar atrito, e a
     linha entre os dois é exatamente essa.

     A TRANSIÇÃO reaproveita `morph()` (acima): o mesmo embaralhamento por
     glifos de sinal — binário, hex, símbolo — que já troca o status do hero.
     Não é um efeito novo, é o mesmo mecanismo testado, só mais visível porque
     o alvo agora é a palavra que carrega a frase inteira. */
  var PALAVRAS = ['aplicada', 'calibrada', 'direcionada', 'ajustada', 'voltada'];
  var PALAVRAS_SINGULAR = ['implacável', 'decisiva', 'inevitável', 'imparável'];
  var pwDe = '', pwPara = '', pwP = 1, pwMostrado = '', pwIdx = 0;
  var emHero = null;
  var drivePalavra = function () {};        /* no-op até o hero assentar (ver iniciarPalavra) */
  var trocarPalavra = function () {};
  var reiniciarCicloPalavra = function () {};

  function iniciarPalavra() {
    /* buscado só AGORA, depois do hero assentado — não no load do script — de
       propósito: o SplitText do título (js/anima.js, `mask:'lines'`) manipula
       e depois RESTAURA o DOM do h1 durante a entrada, e capturar a referência
       cedo demais apostaria em como exatamente essa restauração se comporta.
       Buscar depois que tudo já assentou remove a aposta por completo. */
    emHero = document.querySelector('.hero__title em');
    if (!emHero) return;
    pwDe = pwPara = pwMostrado = emHero.textContent;

    trocarPalavra = function () {
      var lista = document.body.classList.contains('is-singular') ? PALAVRAS_SINGULAR : PALAVRAS;
      pwIdx = (pwIdx + 1) % lista.length;
      var alvo = lista[pwIdx];
      if (alvo === pwMostrado) { pwIdx = (pwIdx + 1) % lista.length; alvo = lista[pwIdx]; }
      pwDe = pwMostrado; pwPara = alvo; pwP = 0;
    };
    drivePalavra = function (dt) {
      if (pwP >= 1) return;
      pwP = Math.min(1, pwP + dt / 620);
      var s = pwP >= 1 ? pwPara : morph(pwDe, pwPara, pwP);
      if (s !== pwMostrado) { pwMostrado = s; emHero.textContent = s; }
      /* a palavra assentou: o comprimento pode ter mudado a quebra do título,
         que empurra tudo abaixo do hero — remede o que está em cache, sem
         resemear o campo (ver `remedir` em field.js e dom.js). */
      if (pwP >= 1) B.emit('remedir');
    };
    var ciclo = null;
    reiniciarCicloPalavra = function () {
      if (ciclo) clearInterval(ciclo);
      ciclo = setInterval(trocarPalavra, 5200 + Math.random() * 2600);
    };
    reiniciarCicloPalavra();
  }
  /* mesmo atraso de segurança que a entrada do hero já usa em outros lugares
     deste arquivo (booted+4000/4500): tempo de sobra para a timeline do GSAP
     (status, título em linhas, subtítulo, ações) terminar de vez. */
  if (document.body.classList.contains('booted')) setTimeout(iniciarPalavra, 5200);
  else B.on('booted', function () { setTimeout(iniciarPalavra, 5200); });

  /* ---------- PULSO ----------
     Uma onda que atravessa a cadeia. O canvas lê S.pulse e S.pulseFront; o DOM
     recebe UMA classe no começo e perde no fim. */
  var pulsoAte = 0, proxPulso = 0, DUR = 2600;
  function agendarPulso(now) {
    proxPulso = now + 9000 + Math.random() * 11000;
  }
  /* um caminho só para começar um Pulso, porque agora existem DOIS motivos
     para ele acontecer: o relógio interno e o reconhecimento das capacidades
     (ver RECONHECIMENTO). Duplicar o corpo aqui era como as duas versões
     saíam de sincronia. */
  function dispararPulso(now, anuncio) {
    if (pulsoAte > now || S.singular) return false;
    pulsoAte = now + DUR;
    document.body.classList.add('is-pulse');
    anunciar(anuncio || 'Ressonância em curso');
    return true;
  }

  function drivePulso(now, dt) {
    if (now < pulsoAte) {
      var u = 1 - (pulsoAte - now) / DUR;                 /* 0..1 */
      S.pulseFront = u;
      S.pulse = Math.sin(u * Math.PI) * .9;              /* sobe e volta */
      return;
    }
    if (S.pulse !== 0) {
      S.pulse = 0; S.pulseFront = 0;
      document.body.classList.remove('is-pulse');
      anunciar('Sistema online · Beyon Zero');
      agendarPulso(now);
    }
    if (proxPulso && now > proxPulso && !S.singular) dispararPulso(now);
  }

  /* ---------- RECONHECIMENTO — a descoberta para quem presta atenção --------
     Quem passa o cursor por todas as seis capacidades recebe uma resposta: o
     AI Core reconhece, e a ressonância atravessa o site inteiro. É a única
     recompensa escondida da página, e ela existe porque o argumento central da
     seção é "seis capacidades, um núcleo" — a pessoa que percorre as seis está
     literalmente completando essa frase com o cursor.

     Acontece UMA vez por visita. Repetir tiraria o caráter de descoberta e
     viraria um Pulso barato a cada passada de mouse. Custo: um listener `once`
     por card, que se remove sozinho ao disparar. */
  var reconhecidas = 0, jaReconheceu = false;
  var cardsServ = document.querySelectorAll('.card--service');
  if (B.fine && cardsServ.length) {
    var marcarServico = function () {
      if (jaReconheceu) return;
      reconhecidas++;
      if (reconhecidas < cardsServ.length) return;
      jaReconheceu = true;
      /* `S.now` é o relógio do loop (o mesmo `performance.now` do rAF), então
         o disparo entra na mesma linha do tempo do agendamento automático. */
      dispararPulso(S.now, 'Seis capacidades reconhecidas');
      /* e o sistema se abre para quem demonstrou interesse: o próximo Singular
         é antecipado para daqui a ~12s. Nunca ADIA — se o relógio já ia
         disparar antes disso, o agendamento dele continua valendo. */
      var cedo = S.now + 12000;
      if (proxSing > cedo) proxSing = cedo;
    };
    for (var cs = 0; cs < cardsServ.length; cs++) {
      cardsServ[cs].addEventListener('pointerenter', marcarServico, { once: true, passive: true });
    }
  }

  /* ---------- ESTADO SINGULAR — o espetáculo ----------
     Raro e caro de assistir: quem vê tem que querer um site que faça isso.
     Quatro fases, e o DOM só recebe CLASSES (nenhum estilo por frame):

       CARGA (0–7%)        o sistema puxa energia; o branco começa a nascer
       IGNIÇÃO (7–13%)     estouro BRANCO + onda de choque saindo do reator
       REINADO (13–76%)    dourado plasma com núcleos brancos
       RESFRIAMENTO (76%+) volta ao ciano

     Publica em S: `singular` (intensidade), `warmth` (ciano→dourado),
     `whiteHot` (mistura de branco) e `shock` (0..1 da onda; -1 desligada).
     Quem desenha é o canvas. */
  var singAte = 0, proxSing = 0, SDUR = 18000;
  /* NÃO existe mais uma classe `is-igniting`: o dono removeu o estouro branco
     que ela acendia (lia como flash, não como luz), e sem regra de CSS do outro
     lado ela era escrita e apagada por ninguém. As fases seguem intactas — quem
     desenha a ignição é o canvas, por S.whiteHot e S.shock. */
  function driveSingular(now) {
    if (now < singAte) {
      var u = 1 - (singAte - now) / SDUR;

      if (u < .07) {                                  /* CARGA */
        var c = u / .07;
        S.singular = c * .55; S.whiteHot = c * c; S.warmth = 0; S.shock = -1;
      } else if (u < .13) {                           /* IGNIÇÃO */
        var g = (u - .07) / .06;
        S.singular = .55 + g * .45;
        S.whiteHot = 1;                               /* branco no auge */
        S.warmth = g * .35;
        S.shock = g;                                  /* a onda atravessa a tela */
      } else if (u < .76) {                           /* REINADO */
        var r = (u - .13) / .63;
        S.singular = 1;
        S.warmth = Math.min(1, .35 + r * 1.6);        /* fecha no dourado cedo */
        /* o branco DECAI do auge, não cai de uma vez: sem isto ele saltava de
           1,0 para 0,3 entre dois frames e a cena inteira "pipocava" do branco
           para o ouro — a medição por simulação pegou o salto. Aqui ele desce
           do estouro até o núcleo em ~11% do evento e só então começa a
           respirar. O respiro entra na mesma proporção em que o decaimento
           sai, então a soma nunca dá um degrau. */
        var decai = Math.max(0, 1 - r / .18);
        S.whiteHot = .3 + .7 * decai + Math.sin(r * 9) * .1 * (1 - decai);
        S.shock = -1;
      } else {                                        /* RESFRIAMENTO */
        var f = Math.max(0, (1 - u) / .24);
        /* .34 é o valor EXATO em que o reinado termina (.3 + sen(9)·.1): com
           .3 aqui, o branco dava um degrau de 4% ao entrar no resfriamento. */
        S.singular = f; S.warmth = f; S.whiteHot = f * .34; S.shock = -1;
      }
      return;
    }
    if (S.singular !== 0) {
      S.singular = 0; S.warmth = 0; S.whiteHot = 0; S.shock = -1;
      document.body.classList.remove('is-singular');
      anunciar('Sistema online · Beyon Zero');
      proxSing = now + 70000 + Math.random() * 60000;
      /* o regime volta ao ciano: a palavra volta ao vocabulário normal na
         hora, não espera o próximo ciclo. `B.estatica` no wordmark marca a
         própria identidade registrando a volta ao regime — mesmo gesto do
         início, ver abaixo. */
      trocarPalavra(); reiniciarCicloPalavra();
      B.estatica(navWordmark);
    }
    if (proxSing && now > proxSing && !S.pulse) {
      singAte = now + SDUR;
      document.body.classList.add('is-singular');
      anunciar('AI Core no comando');
      /* o Singular começa: a palavra pula direto pro vocabulário assertivo —
         é o momento de maior confiança do site, não faz sentido esperar. */
      trocarPalavra(); reiniciarCicloPalavra();
      B.estatica(navWordmark);
    }
  }

  var iniciou = 0;
  B.add('eventos', function (s) {
    if (!iniciou) {
      iniciou = s.now;
      agendarPulso(s.now);
      /* O PRIMEIRO Singular vem cedo, de propósito. Ele é o argumento de venda
         mais forte do site — quem vê quer uma página que faça aquilo. Antes o
         primeiro caía entre 45s e 85s, e a sessão típica numa landing page é
         mais curta que isso: a maioria dos visitantes ia embora sem ver o
         espetáculo. Agora ele acontece por volta dos 22-30s (já rolando, com o
         conteúdo entendido), e os seguintes voltam a ser raros. */
      proxSing = s.now + 22000 + Math.random() * 8000;
    }
    drivePulso(s.now, s.dt);
    driveSingular(s.now);
    driveStatus(s.dt);
    drivePalavra(s.dt);
  });

  /* ---------- medidor: números reais, atualizado 2x por segundo ---------- */
  var med = document.querySelector('.medidor__txt');
  var led = document.querySelector('.medidor__led');
  var ultMed = 0, ultTxt = '', ultCor = '';
  if (med) {
    B.add('medidor', function (s) {
      if (s.now - ultMed < 500) return;
      ultMed = s.now;
      /* só escreve quando o valor MUDA: escrever a mesma string 2x por segundo
         sujava o elemento à toa. */
      var txt = Math.round(s.fps) + ' fps · ' + Math.round(s.budget * 100) + '%';
      if (txt !== ultTxt) { ultTxt = txt; med.textContent = txt; }
      /* `--ac`/`--warm`, não os antigos `--glow`/`--gold`: a reformulação de
         2026-08-20 renomeou os tokens da paleta, e uma var() inexistente aqui
         resolveria para valor inválido — o LED ficaria preso na última cor
         válida em vez de reportar o estado medido. */
      var cor = s.fps > 50 ? 'var(--ac)' : (s.fps > 35 ? 'var(--warm)' : 'var(--led)');
      if (cor !== ultCor) { ultCor = cor; led.style.background = cor; }
    });
  }

  /* a nota do medidor: o número sozinho não diz nada a quem não é técnico.
     Uma classe, por clique — nada por frame. */
  var medBtn = document.querySelector('.medidor__btn');
  var medNota = document.getElementById('medidor-nota');
  var medCaixa = document.querySelector('.medidor');
  if (medBtn && medNota) {
    if (medCaixa) medCaixa.hidden = false;   /* só aparece depois de ligado */
    medBtn.addEventListener('click', function () {
      var abrindo = medNota.hidden;
      medNota.hidden = !abrindo;
      medBtn.setAttribute('aria-expanded', abrindo ? 'true' : 'false');
    });
    /* Esc fecha, como qualquer painel sobreposto */
    aoEscapar.push(function () {
      if (medNota.hidden) return;
      medNota.hidden = true;
      medBtn.setAttribute('aria-expanded', 'false');
      medBtn.focus();
    });
  }

  /* ---------- ESCAPE: um caminho só ----------
     Havia DOIS `document.addEventListener('keydown')` neste arquivo, cada um
     testando a mesma tecla para fechar o seu próprio painel — o menu do celular
     e a nota do medidor. Dois handlers no documento para uma tecla é o mesmo
     problema que o arquivo já tinha resolvido com o scroll (havia dois, viraram
     um): cada painel novo somaria mais um, e a ORDEM entre eles passa a
     importar sem que nada no código diga qual é. Aqui a lista é explícita e a
     ordem é a de declaração. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    for (var i = 0; i < aoEscapar.length; i++) aoEscapar[i]();
  });

  /* ---------- REGIME → uma classe no <body> ----------
     O núcleo resolve QUAL é o estado (js/core.js); aqui ele vira uma classe,
     e só quando muda — um punhado de vezes por visita. `is-pulse` e
     `is-singular` continuam sendo escritas pelas próprias máquinas acima,
     porque são eventos com começo e fim próprios.

     Só DORMANT vira classe. `focused` existe e é usado — mas dentro do canvas,
     onde a resposta certa é o ambiente se aquietar para o elemento apontado
     ganhar a atenção; no CSS ele não teria nada honesto para mudar, e inventar
     uma regra só para "usar o estado" é como uma camada de efeitos vira
     enfeite. `active` é o repouso do site: a ausência das outras classes. */
  var dormindo = false;
  B.on('regime', function (r) {
    var d = r === 'dormant';
    if (d === dormindo) return;
    dormindo = d;
    document.body.classList.toggle('is-dormant', d);
  });

  B.iniciar();
})();
