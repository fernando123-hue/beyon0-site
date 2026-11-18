/* ==========================================================================
   PRÉVIA — desenha uma direção de site a partir do JSON estruturado que o
   servidor já higienizou (api/_vendas/direcao.mjs). Segurança em camadas:
   • nada de innerHTML: todo texto entra por textContent;
   • cor só se for #RRGGBB; fonte só de uma lista fechada (pilhas locais, a
     CSP é font-src 'self'); tipo e variante de seção só de listas fechadas;
   • a cor entra por el.style.setProperty (a CSP proíbe style="" no HTML,
     não o estilo posto por script).
   "[ … ]" no texto é ESPAÇO RESERVADO (dado que o cliente ainda vai mandar):
   aparece marcado, nunca como fato.
   Uso: BZPrevia.desenhar(direcao) devolve o elemento; BZPrevia.encaixar(
   janela, tela, larguraBase) escala a tela para caber na janela.
   ========================================================================== */
(function () {
  'use strict';

  var FONTES = {
    sans_geometrica: "'Sora', 'Sora Reserva', ui-sans-serif, system-ui, sans-serif",
    sans_humanista: "'DM Sans', 'Segoe UI', 'Helvetica Neue', Roboto, 'Noto Sans', system-ui, sans-serif",
    serif_classica: "'Lora', Georgia, 'Times New Roman', 'Noto Serif', serif",
    serif_moderna: "'Fraunces', 'Didot', 'Bodoni 72', 'Bodoni MT', Georgia, serif",
    mono_tecnica: "'JetBrains Mono', ui-monospace, Menlo, monospace"
  };
  var TIPOS = ['hero', 'servicos', 'sobre', 'diferenciais', 'processo', 'depoimentos', 'numeros', 'galeria', 'faq', 'cta', 'contato', 'equipe', 'destaque', 'localizacao'];
  var VARIANTES = ['split', 'centro', 'cartoes', 'lista', 'faixa', 'grade', 'linha_do_tempo'];
  var VARIANTES_TOPO = ['split', 'centro', 'faixa'];
  var ESTRATEGIAS = ['conversao', 'autoridade', 'experiencia'];
  var SVG = 'http://www.w3.org/2000/svg';
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var RESERVADO = /(\[[^\]]{1,160}\])/;
  var PALETA = { fundo: '--pv-fundo', superficie: '--pv-sup', texto: '--pv-texto', texto_suave: '--pv-suave', destaque: '--pv-dest', destaque_texto: '--pv-dest-texto' };

  var umDe = function (lista, v, padrao) { return lista.indexOf(v) >= 0 ? v : padrao; };
  var str = function (v) { return typeof v === 'string' ? v : ''; };

  function el(tag, classe, conteudo) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (conteudo) escrever(e, conteudo);
    return e;
  }

  /* texto com os espaços reservados marcados */
  function escrever(alvo, s) {
    str(s).split(RESERVADO).forEach(function (parte) {
      if (!parte) return;
      if (RESERVADO.test(parte) && parte.charAt(0) === '[') {
        var r = el('span', 'pv-reservado');
        r.textContent = parte;
        r.title = 'Espaço reservado: entra o dado real do seu negócio';
        alvo.appendChild(r);
      } else {
        alvo.appendChild(document.createTextNode(parte));
      }
    });
  }

  function itens(lista, tipo) {
    var ul = el('ul', 'pv-itens');
    lista.slice(0, 8).forEach(function (i, n) {
      var li = el('li', 'pv-item');
      if (tipo === 'processo') li.appendChild(el('span', 'pv-item__n', String(n + 1).padStart(2, '0')));
      if (tipo === 'depoimentos') {
        var q = el('blockquote', 'pv-citacao', str(i.texto));
        li.appendChild(q);
        if (i.titulo) li.appendChild(el('p', 'pv-item__autor', i.titulo));
      } else {
        if (i.titulo) li.appendChild(el(tipo === 'numeros' ? 'p' : 'h5', tipo === 'numeros' ? 'pv-numero' : 'pv-item__t', i.titulo));
        if (i.texto) li.appendChild(el('p', 'pv-item__x', i.texto));
      }
      ul.appendChild(li);
    });
    return ul;
  }

  /* ---------- a arte do topo: desenhada por código na paleta do modelo (traço nítido; sem filtro, sem blur, sem brilho) ----------
     Cada motivo devolve formas [tag, atributos, classe]; a cor vem da classe no CSS (a CSP proíbe style=""): a-forte (traço na cor de destaque),
     a-fraco (traço fino na cor do texto), a-cheio (preenchimento de destaque), a-vazio (contorno na cor do texto). Seis motivos; o motivo vem de
     um hash da marca somado à ordem da estratégia, então os 3 modelos do mesmo negócio nunca repetem o desenho e a mesma entrada dá sempre o mesmo. */
  var MOTIVOS = [
    function veios() {
      var f = [];
      for (var i = 0; i < 17; i++) {
        var y = 20 + i * 17;
        f.push(['path', { d: 'M0 ' + y + ' C 90 ' + (y - 26) + ', 150 ' + (y + 30) + ', 240 ' + (y - 6) + ' S 360 ' + (y + 22) + ', 420 ' + (y - 10) }, i % 5 === 0 ? 'a-forte' : 'a-fraco']);
      }
      f.push(['circle', { cx: 290, cy: 150, r: 64 }, 'a-cheio'], ['circle', { cx: 298, cy: 158, r: 64 }, 'a-vazio']);
      return f;
    },
    function arcos() {
      var f = [];
      for (var i = 0; i < 6; i++) f.push(['circle', { cx: 195, cy: 330, r: 50 + i * 36 }, i % 2 ? 'a-fraco' : 'a-forte']);
      f.push(['circle', { cx: 320, cy: 70, r: 26 }, 'a-cheio']);
      return f;
    },
    function trama() {
      var f = [];
      for (var i = 0; i <= 13; i++) f.push(['line', { x1: i * 30, y1: 0, x2: i * 30, y2: 300 }, i % 4 === 0 ? 'a-forte' : 'a-fraco']);
      for (var j = 0; j <= 10; j++) f.push(['line', { x1: 0, y1: j * 30, x2: 390, y2: j * 30 }, j % 4 === 0 ? 'a-forte' : 'a-fraco']);
      f.push(['rect', { x: 150, y: 90, width: 120, height: 120 }, 'a-cheio'], ['rect', { x: 162, y: 102, width: 120, height: 120 }, 'a-vazio']);
      return f;
    },
    function diagonais() {
      var f = [];
      for (var i = -6; i < 20; i++) f.push(['line', { x1: i * 28, y1: 300, x2: i * 28 + 300, y2: 0 }, i % 4 === 0 ? 'a-forte' : 'a-fraco']);
      f.push(['circle', { cx: 110, cy: 170, r: 52 }, 'a-cheio']);
      return f;
    },
    function ondas() {
      var f = [];
      for (var i = 0; i < 8; i++) {
        var y = 40 + i * 32;
        f.push(['path', { d: 'M0 ' + y + ' Q 49 ' + (y - 34) + ' 98 ' + y + ' T 195 ' + y + ' T 293 ' + y + ' T 390 ' + y }, i % 3 === 0 ? 'a-forte' : 'a-fraco']);
      }
      f.push(['circle', { cx: 60, cy: 60, r: 30 }, 'a-cheio']);
      return f;
    },
    function losangos() {   /* quadrados girados e encaixados (nada que lembre gráfico de barras: a arte não "mostra dado") */
      var f = [];
      for (var i = 6; i >= 1; i--) f.push(['rect', { x: 195 - i * 24, y: 150 - i * 24, width: i * 48, height: i * 48, transform: 'rotate(45 195 150)' }, i % 2 ? 'a-forte' : 'a-fraco']);
      f.push(['rect', { x: 171, y: 126, width: 48, height: 48, transform: 'rotate(45 195 150)' }, 'a-cheio']);
      return f;
    }
  ];
  function hash(texto) {
    var h = 5381;
    for (var i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
    return h;
  }
  function arteDoTopo(d) {
    var marca = str(d && d.navegacao && d.navegacao.marca);
    var ordem = Math.max(0, ESTRATEGIAS.indexOf(d && d.estrategia));
    var formas = MOTIVOS[(hash(marca) + ordem) % MOTIVOS.length]();
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 390 300');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('aria-hidden', 'true');
    formas.forEach(function (f) {
      var n = document.createElementNS(SVG, f[0]);
      Object.keys(f[1]).forEach(function (k) { n.setAttribute(k, f[1][k]); });
      n.setAttribute('class', f[2]);
      svg.appendChild(n);
    });
    var arte = el('div', 'pv-arte');
    arte.appendChild(svg);
    arte.appendChild(el('span', 'pv-arte__leg', 'Aqui entra a foto do seu negócio'));   /* o lugar da imagem do cliente */
    return arte;
  }

  function secao(s, primeira, d) {
    var tipo = umDe(TIPOS, s.tipo, 'destaque');
    var sec = el('section', 'pv-sec pv-sec--' + tipo + ' pv-v--' + umDe(VARIANTES, s.variante, 'centro') +
      (primeira ? ' pv-hero--' + umDe(VARIANTES_TOPO, s.variante, 'split') : ''));
    var cab = el('div', 'pv-cab');
    if (s.rotulo) cab.appendChild(el('p', 'pv-rotulo', s.rotulo));
    if (s.titulo) cab.appendChild(el(primeira ? 'h3' : 'h4', primeira ? 'pv-h1' : 'pv-h2', s.titulo));
    if (s.subtitulo) cab.appendChild(el('p', 'pv-sub', s.subtitulo));
    if (s.texto) cab.appendChild(el('p', 'pv-texto', s.texto));
    if (s.cta) cab.appendChild(el('span', 'pv-btn', s.cta));
    sec.appendChild(cab);
    if (primeira) sec.appendChild(arteDoTopo(d));   /* a arte vem logo depois do título; os itens (se o modelo pôs) ficam abaixo dela */
    if (Array.isArray(s.itens) && s.itens.length) sec.appendChild(itens(s.itens, tipo));
    return sec;
  }

  function desenhar(d) {
    var id = (d && d.identidade) || {};
    var est = id.estilo || {};
    var raiz = el('div', 'pv pv--' + (est.tema === 'escuro' ? 'escuro' : 'claro') +
      ' pv-cantos--' + umDe(['retos', 'suaves', 'redondos'], est.cantos, 'suaves') +
      ' pv-dens--' + umDe(['arejada', 'equilibrada', 'compacta'], est.densidade, 'equilibrada'));
    var paleta = id.paleta || {};
    Object.keys(PALETA).forEach(function (k) { if (HEX.test(str(paleta[k]))) raiz.style.setProperty(PALETA[k], paleta[k]); });
    var tip = id.tipografia || {};
    raiz.style.setProperty('--pv-f-tit', FONTES[tip.titulos] || FONTES.sans_geometrica);
    raiz.style.setProperty('--pv-f-txt', FONTES[tip.texto] || FONTES.sans_humanista);

    var nav = d.navegacao || {};
    var barra = el('div', 'pv-nav');
    barra.appendChild(el('span', 'pv-marca', nav.marca || 'Sua marca'));
    var menu = el('ul', 'pv-menu');
    (Array.isArray(nav.itens) ? nav.itens : []).slice(0, 6).forEach(function (i) { menu.appendChild(el('li', '', i)); });
    barra.appendChild(menu);
    if (nav.cta) barra.appendChild(el('span', 'pv-btn pv-btn--nav', nav.cta));
    raiz.appendChild(barra);

    (Array.isArray(d.secoes) ? d.secoes : []).slice(0, 12).forEach(function (s, n) { raiz.appendChild(secao(s || {}, n === 0, d)); });
    if (d.rodape && d.rodape.texto) raiz.appendChild(el('footer', 'pv-rodape', d.rodape.texto));
    return raiz;
  }

  /* a "tela" tem a largura de um aparelho (390 ou 1280); a janela, a do espaço disponível */
  function encaixar(janela, tela, larguraBase, ajustarAltura) {
    var escala = Math.min(1, janela.clientWidth / larguraBase) || 1;
    tela.style.transform = escala < 1 ? 'scale(' + escala + ')' : '';
    if (ajustarAltura) janela.style.height = Math.ceil(tela.offsetHeight * escala) + 'px';
    return escala;
  }

  window.BZPrevia = { desenhar: desenhar, encaixar: encaixar, FONTES: FONTES };
})();
