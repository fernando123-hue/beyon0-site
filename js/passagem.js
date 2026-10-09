/* ==========================================================================
   A PASSAGEM — a transição entre as páginas do site (css/passagem.css).

   A View Transition entre documentos do navegador falhava quase sempre aqui
   (Chrome real, 2026-10-04: 0 de 14 trocas), então a transição é do site.
   A TRAVESSIA (2026-10-09): sem painel e sem rótulo, a própria página se
   move, e cada destino tem a sua viagem (css/passagem-destinos.css: o
   núcleo, a janela, o fluxo, a régua). No clique num link para outra página
   do site, o conteúdo faz a viagem de saída do destino, a rede do fundo vem
   junto, e só então navega. A página nova (js/ancoras.js põe `passagem-chega`
   e `chega-<página>` no <head>) faz a viagem de chegada e assenta.
   Enquanto isso o destino já foi pedido ao servidor: a intenção (cursor em
   cima, dedo encostado, foco) pré-carrega a página.

   Fica de fora: link com modificador (nova aba), outra origem, âncora na
   mesma página, movimento reduzido. Voltar pelo histórico com a página
   guardada (bfcache) devolve a página no lugar.
   ========================================================================== */
(function () {
  'use strict';
  var html = document.documentElement;
  var B = window.BEYON || {};
  var el = document.querySelector('.passagem');
  if (!el) return;
  var riscos = el.querySelector('.passagem__riscos');
  var SAI_MS = 600;            /* = as viagens de saída (.58s, css/passagem-destinos.css) */
  var DESISTE_MS = 2000;       /* a navegação não aconteceu (Parar, Esc, o navegador cancelou): a página volta.
                                  Curto: sem painel, a página sumida por muito tempo parece travada (revisão do PR #23) */
  var CHEGADA_MS = 1050;       /* as viagens de chegada: a página assenta em .92s; o anel do Início e a rede, em 1,05s */
  /* cada destino tem a sua viagem (css/passagem-destinos.css); o mesmo mapa está no js/ancoras.js, que roda no <head>
     antes deste e marca a chegada */
  var DESTINOS = { '/': 'inicio', '/sites': 'sites', '/automacao': 'automacao', '/orcamento': 'orcamento' };
  var CLASSES_SAIDA = ['sai-inicio', 'sai-sites', 'sai-automacao', 'sai-orcamento'];
  var CLASSES_CHEGADA = ['chega-inicio', 'chega-sites', 'chega-automacao', 'chega-orcamento'];
  /* de onde a viagem parte: o centro da tela (Início, o núcleo; Sites, a janela) ou nenhum ponto (Automação e
     Orçamento só deslizam, sem escala: a origem não importa e não se mede nada no toque; os riscos ficam nas
     trilhas do CSS). (O ponto tocado das primeiras versões saiu: nenhum destino usa mais) */
  var PARTIDA = { inicio: 'centro', sites: 'centro', automacao: 'nenhum', orcamento: 'nenhum' };
  var saindo = false;
  var mexidos = [];            /* quem recebeu origem e classe na saída: tudo volta como estava se desistir */
  var chegada = 0;             /* o timer do fim da chegada */
  var desiste = 0;             /* o timer do desfazer: cancelado ao desfazer (um timer velho, congelado no bfcache,
                                  não pode desfazer o voo seguinte) */

  function caminho(u) {
    var p = u.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1');
    return p || '/';
  }
  function reduzido() { return !!B.reduced || html.classList.contains('menos-movimento'); }
  function ehPagina(u) { return u.origin === location.origin && Object.prototype.hasOwnProperty.call(DESTINOS, caminho(u)) && caminho(u) !== caminho(location); }

  /* o fim da chegada. Enquanto <main> está em escala, quem mede pelo getBoundingClientRect (o ScrollTrigger, as
     entradas por seção) mediria errado: o js/anima.js espera 'passagem:chegou' para ligar, e aqui o ScrollTrigger
     mede de novo. (Âncora: js/ancoras.js põe passagem-ancora e a página só aparece, sem escala.) */
  function fimDaChegada() {
    clearTimeout(chegada);
    if (!html.classList.contains('passagem-chega')) return;
    html.classList.remove('passagem-espera');
    html.classList.remove.apply(html.classList, ['passagem-chega', 'passagem-ancora'].concat(CLASSES_CHEGADA));
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    if (B.pausar) B.pausar(false);
    if (B.emit) B.emit('passagem:chegou');
  }
  /* enquanto a página chega, os canvases esperam (js/core.js, pausar): o compositor fica só com o voo */
  if (html.classList.contains('passagem-chega')) {
    if (B.pausar) B.pausar(true);
    /* solta a chegada (passagem-espera) dois quadros depois de o DOM ficar pronto (com `defer`, este script já roda
       com ele pronto): aí a página já desenha, e o voo começa do 1º quadro em vez de pular os que caíram carregando.
       O relógio do fim conta dali */
    var soltar = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          html.classList.remove('passagem-espera');
          chegada = setTimeout(fimDaChegada, CHEGADA_MS);
        });
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', soltar, { once: true });
    else soltar();
  }

  /* o link que vira passagem: mesma origem, página do site, outra página */
  function destinoDe(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.hasAttribute('data-sem-passagem')) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return null; }
    return ehPagina(u) ? { href: u.href, nome: DESTINOS[caminho(u)] } : null;
  }

  /* quem mergulha: <main> e o rodapé. Se o palco do desktop estiver FIXADO (pin do GSAP, position: fixed dentro
     de <main>), um transform em <main> o tiraria do lugar; aí só ele mergulha e o resto de <main> esmaece. */
  function alvos() {
    var main = document.querySelector('main');
    var fixo = null;
    document.querySelectorAll('.pin-spacer > *').forEach(function (n) { if (getComputedStyle(n).position === 'fixed') fixo = n; });
    var lista = fixo ? [{ n: fixo, c: 'passagem-voa' }, { n: main, c: 'passagem-esmaece' }] : [{ n: main, c: 'passagem-mergulha' }];
    var rodape = document.querySelector('.footer');
    if (rodape) lista.push({ n: rodape, c: 'passagem-mergulha' });
    return lista.filter(function (a) { return a.n; });
  }

  function desfazer() {
    clearTimeout(desiste);
    soltarCamadas();
    if (B.pausar) B.pausar(false);
    saindo = false;
    html.classList.remove.apply(html.classList, ['passagem-sai'].concat(CLASSES_SAIDA));
    mexidos.forEach(function (a) { a.n.classList.remove(a.c); a.n.style.transformOrigin = ''; });
    mexidos = [];
    try { sessionStorage.removeItem('bz-passagem'); } catch (err) { /* sem armazenamento: nada a apagar */ }
    if (B.emit) B.emit('passagem:desfeita');   /* o menu do celular termina de fechar (js/pagina.js) */
  }

  function sair(d) {
    saindo = true;
    fimDaChegada();   /* clicou com a página ainda chegando: ela assenta antes de medir */
    var centro = PARTIDA[d.nome] !== 'nenhum';
    var p = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    riscos.style.left = centro ? p.x + 'px' : '';
    riscos.style.top = centro ? p.y + 'px' : '';
    mexidos = alvos();
    mexidos.forEach(function (a) {
      if (centro) {
        var r = a.n.getBoundingClientRect();
        a.n.style.transformOrigin = (p.x - r.left) + 'px ' + (p.y - r.top) + 'px';
      }
      a.n.classList.add(a.c);
    });
    try { sessionStorage.setItem('bz-passagem', String(Date.now())); } catch (err) { /* sem armazenamento: chega sem a travessia */ }
    html.classList.add('passagem-sai', 'sai-' + d.nome);
    if (B.pausar) B.pausar(true);   /* os canvases param enquanto a página voa (js/core.js) */
    if (B.emit) B.emit('passagem', d);   /* o mini guarda o centro da tela como posição de saída (js/mini.js): com o laço
                                            pausado ele não anda, e reaparece do centro na página nova */
    setTimeout(function () { location.href = d.href; }, SAI_MS);
    desiste = setTimeout(desfazer, SAI_MS + DESISTE_MS);
  }

  /* na CAPTURA: decide antes de quem ouve o clique no caminho (o menu do celular, js/pagina.js, vê o clique já
     cancelado e só recolhe, sem soltar a página). Por isso um link interno com manipulador próprio (um modal, por
     exemplo) não consegue mais cancelar a passagem pela bolha: ele leva data-sem-passagem */
  document.addEventListener('click', function (e) {
    var d = destinoDe(e);
    if (!d || reduzido()) return;
    e.preventDefault();
    if (!saindo) sair(d);
  }, true);

  /* voltou pelo histórico com a página guardada: ela estava no meio do voo; volta inteira */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    desfazer();
    fimDaChegada();
  });

  /* a camada pronta antes do clique: no começo do toque (ou do clique do mouse) num link de passagem, <main> e o
     rodapé ganham will-change (css/passagem.css, .passagem-pronta) e o navegador monta a camada nos ~100 ms até o
     clique. Sem clique, sai em 1,5 s; se o toque virar rolagem, sai na hora (um pin do GSAP que se fixasse com
     <main> preparado sairia do lugar) */
  var prontos = [], soltaCamadas = 0;
  function soltarCamadas() {
    clearTimeout(soltaCamadas);
    prontos.forEach(function (n) { n.classList.remove('passagem-pronta'); });
    prontos = [];
  }
  function preparar(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || saindo || reduzido()) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (!ehPagina(u)) return;
    soltarCamadas();
    /* só quem vai voar por transform: com o palco do desktop fixado (pin do GSAP), will-change em <main> o tiraria do
       lugar já no toque (o mesmo motivo do alvos()); aí ganham ele e o rodapé, e <main> só esmaece */
    prontos = alvos().filter(function (a) { return a.c !== 'passagem-esmaece'; }).map(function (a) { return a.n; });
    prontos.forEach(function (n) { n.classList.add('passagem-pronta'); });
    soltaCamadas = setTimeout(function () { if (!saindo) soltarCamadas(); }, 1500);
  }
  document.addEventListener('pointerdown', preparar, { passive: true });
  document.addEventListener('touchstart', preparar, { passive: true });
  var desistirDoToque = function () { if (!saindo && prontos.length) soltarCamadas(); };
  document.addEventListener('touchmove', desistirDoToque, { passive: true });
  document.addEventListener('pointercancel', desistirDoToque, { passive: true });

  /* pré-carga na intenção: o HTML do destino chega enquanto a página voa */
  var pedidos = {};
  var economia = !!(navigator.connection && navigator.connection.saveData);
  function precarregar(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || economia) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    var p = caminho(u);
    if (!ehPagina(u) || pedidos[p]) return;
    pedidos[p] = true;
    var l = document.createElement('link');
    l.rel = 'prefetch'; l.href = u.pathname;
    document.head.appendChild(l);
  }
  document.addEventListener('pointerover', precarregar, { passive: true });
  document.addEventListener('touchstart', precarregar, { passive: true });
  document.addEventListener('focusin', precarregar);
})();
