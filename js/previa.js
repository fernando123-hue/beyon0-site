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
    sans_humanista: "'Segoe UI', 'Helvetica Neue', Roboto, 'Noto Sans', system-ui, sans-serif",
    serif_classica: "Georgia, 'Times New Roman', 'Noto Serif', serif",
    serif_moderna: "'Didot', 'Bodoni 72', 'Bodoni MT', Georgia, serif",
    mono_tecnica: "'JetBrains Mono', ui-monospace, Menlo, monospace"
  };
  var TIPOS = ['hero', 'servicos', 'sobre', 'diferenciais', 'processo', 'depoimentos', 'numeros', 'galeria', 'faq', 'cta', 'contato', 'equipe', 'destaque', 'localizacao'];
  var VARIANTES = ['split', 'centro', 'cartoes', 'lista', 'faixa', 'grade', 'linha_do_tempo'];
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

  function secao(s, primeira) {
    var tipo = umDe(TIPOS, s.tipo, 'destaque');
    var sec = el('section', 'pv-sec pv-sec--' + tipo + ' pv-v--' + umDe(VARIANTES, s.variante, 'centro'));
    var cab = el('div', 'pv-cab');
    if (s.rotulo) cab.appendChild(el('p', 'pv-rotulo', s.rotulo));
    if (s.titulo) cab.appendChild(el(primeira ? 'h3' : 'h4', primeira ? 'pv-h1' : 'pv-h2', s.titulo));
    if (s.subtitulo) cab.appendChild(el('p', 'pv-sub', s.subtitulo));
    if (s.texto) cab.appendChild(el('p', 'pv-texto', s.texto));
    if (s.cta) cab.appendChild(el('span', 'pv-btn', s.cta));
    sec.appendChild(cab);
    if (Array.isArray(s.itens) && s.itens.length) sec.appendChild(itens(s.itens, tipo));
    if (primeira) sec.appendChild(el('div', 'pv-arte'));   /* o lugar da imagem do cliente */
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

    (Array.isArray(d.secoes) ? d.secoes : []).slice(0, 12).forEach(function (s, n) { raiz.appendChild(secao(s || {}, n === 0)); });
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
