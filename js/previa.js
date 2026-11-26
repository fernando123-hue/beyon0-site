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

  /* (lapidação 26/11, achado 4 dos modelos) a palavra com hífen não se parte no hífen ("ar- / condicionado"): ela vai inteira num span que não
     quebra. As outras quebras ficam com o text-wrap do css/previa.css (balance nos títulos, pretty no texto) */
  /* palavra por palavra (separadas por espaço), com a regex ANCORADA no pedaço: tempo linear. A busca solta no texto inteiro era
     quadrática numa sequência longa de letras sem hífen (revisão de segurança do #260: 200 mil letras levavam mais de 60 s) */
  var COM_HIFEN = /^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)+)([^A-Za-zÀ-ÿ]*)$/;
  function semPartir(alvo, texto) {
    var solto = '';
    texto.split(/(\s+)/).forEach(function (p) {
      var m = p.length <= 80 ? COM_HIFEN.exec(p) : null;
      if (!m) { solto += p; return; }
      solto += m[1];
      if (solto) alvo.appendChild(document.createTextNode(solto));
      var s = document.createElement('span'); s.className = 'pv-inteira'; s.textContent = m[2]; alvo.appendChild(s);
      solto = m[3];
    });
    if (solto) alvo.appendChild(document.createTextNode(solto));
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
        semPartir(alvo, parte);
      }
    });
  }

  /* o jeito de desenhar uma lista de itens: pelo TIPO da seção (galeria, números, depoimentos) e, nos demais, pela VARIANTE que o modelo escolheu
     (linha_do_tempo = passos com linha; lista = linhas editoriais numeradas; o resto = cartões). Tudo entra por textContent. */
  function modoDosItens(tipo, variante) {
    if (tipo === 'galeria' || tipo === 'numeros' || tipo === 'depoimentos') return tipo;
    if (tipo === 'processo' || variante === 'linha_do_tempo') return 'passos';
    if (variante === 'lista') return 'linhas';
    return 'cartoes';
  }
  /* ---------- os ícones dos itens: biblioteca FECHADA, traço de 1,75 em grade 24 (a mesma lista de api/_vendas/direcao.mjs: ICONES) ----------
     Só o nome da lista chega à tela; o desenho é nosso, em formas simples; a cor vem da classe .pv-icone (a CSP proíbe style="") */
  var ICONES_SVG = {
    calendario: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }], ['path', { d: 'M3 10h18M8 3v4M16 3v4' }]],
    relogio: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7v5l3.5 2' }]],
    local: [['path', { d: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z' }], ['circle', { cx: 12, cy: 10, r: 2.5 }]],
    mensagem: [['path', { d: 'M4 5h16v11H9l-5 4z' }]],
    telefone: [['path', { d: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z' }]],
    escudo: [['path', { d: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' }], ['path', { d: 'M8.5 12l2.5 2.5 4.5-5' }]],
    estrela: [['path', { d: 'M12 3l2.8 6 6.2.7-4.6 4.3 1.3 6.5-5.7-3.3-5.7 3.3 1.3-6.5L3 9.7 9.2 9z' }]],
    coracao: [['path', { d: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z' }]],
    casa: [['path', { d: 'M4 11l8-7 8 7v9H4z' }], ['path', { d: 'M10 20v-6h4v6' }]],
    raio: [['path', { d: 'M13 2L5 13.5h6L10 22l9-12h-6z' }]],
    folha: [['path', { d: 'M5 19C5 10 10 5 20 5c0 10-5 15-15 14z' }], ['path', { d: 'M5 19l7-7' }]],
    gota: [['path', { d: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' }]],
    floco: [['path', { d: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9' }], ['path', { d: 'M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5' }]],
    sol: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4' }]],
    bolo: [['path', { d: 'M5 20v-7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v7z' }], ['path', { d: 'M5 16c2 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 5 0' }], ['path', { d: 'M12 12V8M12 5.5V6' }]],
    documento: [['path', { d: 'M7 3h8l4 4v14H7z' }], ['path', { d: 'M15 3v4h4M10 12h6M10 16h6' }]],
    caixa: [['path', { d: 'M4 8l8-4 8 4v8l-8 4-8-4z' }], ['path', { d: 'M4 8l8 4 8-4M12 12v8' }]],
    equipe: [['circle', { cx: 9, cy: 8, r: 3 }], ['path', { d: 'M3 20a6 6 0 0 1 12 0' }], ['circle', { cx: 17, cy: 9, r: 2.5 }], ['path', { d: 'M17 14a5 5 0 0 1 4 5' }]],
    check: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M8 12l3 3 5-6' }]],
    lampada: [['path', { d: 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z' }], ['path', { d: 'M10 19h4M10.5 21h3' }]],
    regua: [['path', { d: 'M3 15L15 3l6 6L9 21z' }], ['path', { d: 'M7 11l2 2M10 8l2 2M13 5l2 2' }]],
    /* (lapidação 26/11) os ramos mais comuns, para a arte do topo e os cartões não caírem em ícone genérico */
    dente: [['path', { d: 'M7.5 3.5C5 3.5 4 5.5 4 7.5c0 3 1.2 5.2 2 8.5l.8 3.6c.3 1.2 1.9 1.2 2.2 0l.9-3.9c.3-1.2.9-1.7 2.1-1.7s1.8.5 2.1 1.7l.9 3.9c.3 1.2 1.9 1.2 2.2 0l.8-3.6c.8-3.3 2-5.5 2-8.5 0-2-1-4-3.5-4-1.9 0-2.9 1-4.5 1s-2.6-1-4.5-1z' }]],
    tesoura: [['circle', { cx: 6, cy: 6.5, r: 2.5 }], ['circle', { cx: 6, cy: 17.5, r: 2.5 }], ['path', { d: 'M8.2 7.8L20 17M8.2 16.2L20 7' }]],
    ferramenta: [['path', { d: 'M14.7 3.3a5 5 0 0 0-4.4 6.9L3.6 17a2 2 0 0 0 2.8 2.8l6.8-6.7a5 5 0 0 0 6.9-4.4l-3 3-2.8-.8-.8-2.8z' }]],
    pata: [['circle', { cx: 6.5, cy: 10, r: 1.8 }], ['circle', { cx: 10, cy: 6, r: 1.8 }], ['circle', { cx: 14, cy: 6, r: 1.8 }], ['circle', { cx: 17.5, cy: 10, r: 1.8 }], ['path', { d: 'M12 12c-3 0-5.5 3.4-5.5 6 0 1.6 1.2 2.5 2.7 2.5 1.2 0 1.8-.6 2.8-.6s1.6.6 2.8.6c1.5 0 2.7-.9 2.7-2.5 0-2.6-2.5-6-5.5-6z' }]],
    haltere: [['path', { d: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12' }]],
    talher: [['path', { d: 'M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 3v18' }], ['path', { d: 'M17 21V3c2 1.2 3 4 3 8h-3' }]],
    camera: [['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }], ['path', { d: 'M8 7l1.5-3h5L16 7' }], ['circle', { cx: 12, cy: 13.5, r: 3.5 }]],
    carro: [['path', { d: 'M5 17H3v-3.5l2.5-1L8 8h7.5l3 4.5 2.5 1V17h-2M9 17h6' }], ['path', { d: 'M8.5 12.5h9' }], ['circle', { cx: 7, cy: 17, r: 2 }], ['circle', { cx: 17, cy: 17, r: 2 }]],
    livro: [['path', { d: 'M4 19V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0 0 4h14v-4' }], ['path', { d: 'M8 7h8' }]],
    martelo: [['path', { d: 'M11 6l3-3 7 7-3 3z' }], ['path', { d: 'M12.5 8.5L4 17a2.1 2.1 0 0 0 3 3l8.5-8.5' }]],
    balanca: [['path', { d: 'M12 3v18M7 21h10M5 7h14' }], ['path', { d: 'M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z' }]],
    pincel: [['path', { d: 'M19 3l2 2-8.5 8.5-2-2z' }], ['path', { d: 'M10.5 11.5c-2.5-.5-5 1.2-5 4 0 1.8-1 3-2.5 3.5 3.5 1.5 8 .5 9.2-2 .8-1.7.5-3.6-1.7-5.5z' }]],
    cifrao: [['path', { d: 'M12 3v18M17 7.5C16.2 6 14.3 5 12 5c-3 0-5 1.5-5 3.5 0 4.5 10 2.5 10 7 0 2-2 3.5-5 3.5-2.3 0-4.2-1-5-2.5' }]],
    musica: [['path', { d: 'M9 18V5.5l11-2V16' }], ['circle', { cx: 6, cy: 18, r: 3 }], ['circle', { cx: 17, cy: 16, r: 3 }]],
    saude: [['path', { d: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z' }]]
  };
  function icone(nome) {
    if (typeof nome !== 'string' || !Object.prototype.hasOwnProperty.call(ICONES_SVG, nome)) return null;
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'pv-icone');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    ICONES_SVG[nome].forEach(function (f) {
      var e = document.createElementNS(SVG, f[0]);
      Object.keys(f[1]).forEach(function (k) { e.setAttribute(k, String(f[1][k])); });
      svg.appendChild(e);
    });
    return svg;
  }

  /* "1. ", "3) ", "Passo 2 - ": número, pontuação e ESPAÇO; sem o espaço é conteúdo ("10-20 minutos", "5–10 dias", "12:30") */
  var SEM_NUMERO = /^\s*(?:passo\s+)?\d{1,2}\s*[.)–—-]\s+/i;
  function semNumero(titulo) {
    var t = str(titulo).replace(SEM_NUMERO, '');
    return t.trim() ? t : str(titulo);   /* o título que era só o número fica como veio: passo sem título não */
  }
  function titulado(li, i) {
    if (i.titulo) li.appendChild(el('h5', 'pv-item__t', i.titulo));
    if (i.texto) li.appendChild(el('p', 'pv-item__x', i.texto));
  }
  /* devolve null quando não sobra item para desenhar (a lista vazia desenharia só a régua de cima) */
  /* os itens que vão para a tela: a numeração (passos 1, 2, 3; linhas 01, 02, 03) conta só eles */
  function itensValidos(lista, modo) {
    return (Array.isArray(lista) ? lista : []).slice(0, 8).filter(function (i) { return i && (str(i.titulo) || str(i.texto)) && (modo !== 'depoimentos' || str(i.texto)); });
  }
  function itens(lista, tipo, variante) {
    var modo = modoDosItens(tipo, variante);
    var validos = itensValidos(lista, modo);
    /* os números levam a contagem: o CSS do desktop escolhe as colunas (3 ou 4) sem deixar item solto na última linha */
    var ul = el('ul', 'pv-itens pv-itens--' + modo + (modo === 'numeros' ? ' pv-n' + validos.length : ''));
    validos.forEach(function (i, n) {
      var li = el('li', 'pv-item');
      if (modo === 'galeria') {   /* a moldura é o espaço da foto do cliente; a legenda é o título (o "[Foto de…]" do modelo não vira texto solto) */
        li.className = 'pv-item pv-foto';
        var leg = el('span', 'pv-foto__leg', i.titulo || i.texto);
        /* uma descrição de verdade do cliente aparece embaixo do título; o espaço reservado ("[Foto de…]") não */
        if (i.titulo && i.texto && !RESERVADO.test(str(i.texto))) leg.appendChild(el('span', 'pv-foto__x', i.texto));
        li.appendChild(leg);
      } else if (modo === 'numeros') {
        li.className = 'pv-item pv-num';
        if (i.titulo) li.appendChild(el('p', 'pv-numero' + (RESERVADO.test(str(i.titulo)) ? ' pv-numero--texto' : ''), i.titulo));
        if (i.texto) li.appendChild(el('p', 'pv-item__x', i.texto));
      } else if (modo === 'depoimentos') {
        li.className = 'pv-item pv-cit';
        li.appendChild(el('blockquote', 'pv-citacao', str(i.texto)));
        if (i.titulo) li.appendChild(el('p', 'pv-item__autor', i.titulo));
      } else if (modo === 'passos') {
        li.className = 'pv-item pv-passo';
        var num = el('span', 'pv-passo__n', String(n + 1));
        num.setAttribute('aria-hidden', 'true');
        li.appendChild(num);
        /* (achado 11 dos modelos) a numeração é do desenho: o "1." que o modelo escreveu no título sai (o círculo já diz 1) */
        titulado(li, { titulo: semNumero(i.titulo), texto: i.texto });
      } else if (modo === 'linhas') {
        li.className = 'pv-item pv-linha';
        var marca = icone(i.icone);   /* com ícone, ele ocupa o lugar do índice numérico */
        if (!marca) {
          marca = el('span', 'pv-linha__i', String(n + 1).padStart(2, '0'));
          marca.setAttribute('aria-hidden', 'true');
        }
        li.appendChild(marca);
        titulado(li, i);
      } else {
        var simbolo = icone(i.icone);
        if (simbolo) li.appendChild(simbolo);
        titulado(li, i);
      }
      ul.appendChild(li);
    });
    return validos.length ? ul : null;
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
      f.push(['circle', { cx: 320, cy: 120, r: 26 }, 'a-cheio']);   /* as marcas de destaque ficam na faixa y 90–210: o topo largo corta o resto (slice) */
      return f;
    },
    function trama() {
      var f = [];
      for (var i = 0; i <= 13; i++) f.push(['line', { x1: i * 30, y1: 0, x2: i * 30, y2: 300 }, i % 4 === 0 ? 'a-forte' : 'a-fraco']);
      for (var j = 0; j <= 10; j++) f.push(['line', { x1: 0, y1: j * 30, x2: 390, y2: j * 30 }, j % 4 === 0 ? 'a-forte' : 'a-fraco']);
      /* (achado 3 dos modelos) o quadrado cheio lia como foto que não carregou: virou dois contornos deslocados */
      f.push(['rect', { x: 150, y: 90, width: 120, height: 120 }, 'a-forte'], ['rect', { x: 162, y: 102, width: 120, height: 120 }, 'a-vazio']);
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
      f.push(['circle', { cx: 60, cy: 110, r: 30 }, 'a-cheio']);
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
  /* ---------- (lapidação 26/11, achados 2 e 3 dos modelos) a arte nasce do NEGÓCIO: os ícones que a IA escolheu para os itens dele
     (bolo, régua, floco...) entram grandes, em traço, com um eco deslocado; o FUNDO vem da estratégia (vender mais = diagonais, autoridade =
     trama, encantar = ondas). Assim a confeitaria nunca recebe os veios da marcenaria. Sem ícone nenhum, o desenho antigo (por marca) segue.
     As formas ficam na faixa y 90–210 e x 25–365: é o que sobra visível na tira do celular e no topo largo (slice). */
  var GENERICOS = ['check', 'estrela', 'mensagem', 'telefone', 'calendario', 'relogio', 'local', 'documento', 'equipe'];
  var FUNDO_DA_ESTRATEGIA = { conversao: 3, autoridade: 2, experiencia: 4 };   /* índices de MOTIVOS: diagonais, trama, ondas */
  /* [x, y] do canto do principal, do 2º e do 3º ícone: vender mais = principal à direita (o olho vai ao botão); autoridade = principal no
     centro, os outros nas laterais (simetria, ordem); encantar = principal à esquerda, os outros soltos à direita */
  var COMPOSICAO = {
    conversao: [[200, 90], [70, 96], [96, 162]],
    autoridade: [[135, 90], [48, 120], [302, 126]],
    experiencia: [[52, 90], [236, 100], [300, 164]]
  };
  function iconesDoNegocio(d) {
    var vistos = [];
    ((d && d.secoes) || []).forEach(function (s) {
      ((s && s.itens) || []).forEach(function (i) {
        var nome = i && i.icone;
        if (typeof nome === 'string' && Object.prototype.hasOwnProperty.call(ICONES_SVG, nome) && vistos.indexOf(nome) < 0) vistos.push(nome);
      });
    });
    var doOficio = vistos.filter(function (n) { return GENERICOS.indexOf(n) < 0; });
    return doOficio.concat(vistos.filter(function (n) { return GENERICOS.indexOf(n) >= 0; })).slice(0, 3);
  }
  /* um ícone da grade de 24 como grupo da arte, na posição e no tamanho pedidos; a cor vem da classe (a CSP proíbe style="") */
  function iconeNaArte(nome, x, y, escala, classe, papel) {
    var g = document.createElementNS(SVG, 'g');
    g.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + escala + ')');
    g.setAttribute('class', classe);
    g.setAttribute('data-icone', nome);
    g.setAttribute('data-papel', papel);
    ICONES_SVG[nome].forEach(function (f) {
      var e = document.createElementNS(SVG, f[0]);
      Object.keys(f[1]).forEach(function (k) { e.setAttribute(k, String(f[1][k])); });
      e.setAttribute('class', classe);
      g.appendChild(e);
    });
    return g;
  }
  function formasNaArte(svg, formas) {
    formas.forEach(function (f) {
      var n = document.createElementNS(SVG, f[0]);
      Object.keys(f[1]).forEach(function (k) { n.setAttribute(k, f[1][k]); });
      n.setAttribute('class', f[2]);
      svg.appendChild(n);
    });
  }
  function arteDoTopo(d) {
    var marca = str(d && d.navegacao && d.navegacao.marca);
    var ordem = Math.max(0, ESTRATEGIAS.indexOf(d && d.estrategia));
    var icones = iconesDoNegocio(d);
    var svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 390 300');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('aria-hidden', 'true');
    if (!icones.length) {
      formasNaArte(svg, MOTIVOS[(hash(marca) + ordem) % MOTIVOS.length]());
    } else {
      /* a estratégia vem da IA: só uma das 3 da lista ("__proto__" ou "constructor" achariam o Object e quebrariam a prévia) */
      var est = ESTRATEGIAS.indexOf(d && d.estrategia) >= 0 ? d.estrategia : 'conversao';
      /* o fundo só com traço (as formas chapadas dos motivos saem: com o ícone na frente, elas brigariam com ele) */
      formasNaArte(svg, MOTIVOS[FUNDO_DA_ESTRATEGIA[est]]().filter(function (f) { return f[2] === 'a-fraco'; }));
      /* a composição também muda com a estratégia (nunca o mesmo arranjo nos três): o principal de 120 px, o eco fino 8 px atrás,
         os outros menores (60 e 48 px) */
      var c = COMPOSICAO[est];
      svg.appendChild(iconeNaArte(icones[0], c[0][0] + 8, c[0][1] + 8, 5, 'a-fraco', 'pv-arte__icone--eco'));
      svg.appendChild(iconeNaArte(icones[0], c[0][0], c[0][1], 5, 'a-forte', 'pv-arte__icone--grande'));
      if (icones[1]) svg.appendChild(iconeNaArte(icones[1], c[1][0], c[1][1], 2.5, 'a-forte', 'pv-arte__icone'));
      if (icones[2]) svg.appendChild(iconeNaArte(icones[2], c[2][0], c[2][1], 2, 'a-vazio', 'pv-arte__icone'));
    }
    var arte = el('div', 'pv-arte');
    arte.appendChild(svg);
    return arte;
  }

  function secao(s, primeira, d, varianteDosItens) {
    var tipo = umDe(TIPOS, s.tipo, 'destaque');
    var sec = el('section', 'pv-sec pv-sec--' + tipo + ' pv-v--' + umDe(VARIANTES, s.variante, 'centro') +
      (primeira ? ' pv-hero--' + umDe(VARIANTES_TOPO, s.variante, 'split') : '') +
      (!primeira && (tipo === 'cta' || tipo === 'contato') ? ' pv-sec--fecho' : ''));   /* a página fecha em bloco de cor */
    var cab = el('div', 'pv-cab');
    if (s.rotulo) {   /* o texto vai num span só: no flex do rótulo cada pedaço (e cada "[espaço reservado]") viraria um item solto com vão */
      var rot = el('p', 'pv-rotulo');
      rot.appendChild(el('span', 'pv-rotulo__t', s.rotulo));
      cab.appendChild(rot);
    }
    if (s.titulo) cab.appendChild(el(primeira ? 'h3' : 'h4', primeira ? 'pv-h1' : 'pv-h2', s.titulo));
    if (s.subtitulo) cab.appendChild(el('p', 'pv-sub', s.subtitulo));
    if (s.texto) cab.appendChild(el('p', 'pv-texto', s.texto));
    if (s.cta) cab.appendChild(el('span', 'pv-btn', s.cta));
    sec.appendChild(cab);
    if (primeira) sec.appendChild(arteDoTopo(d));   /* a arte vem logo depois do título; os itens (se o modelo pôs) ficam abaixo dela */
    var lista = Array.isArray(s.itens) && s.itens.length ? itens(s.itens, tipo, varianteDosItens || umDe(VARIANTES, s.variante, 'centro')) : null;
    if (lista) sec.appendChild(lista);
    return sec;
  }

  /* o servidor só garante destaque_texto sobre destaque e texto sobre fundo; o destaque como COR DE TEXTO (números grandes, índice das linhas)
     sobre o fundo e a superfície não é garantido: um destaque claro (amarelo) some. Abaixo de 3:1 (texto grande) o desenho usa a cor do texto. */
  function luminancia(hex) {
    var c = [1, 3, 5].map(function (p) {
      var v = parseInt(hex.slice(p, p + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var x = luminancia(a), y = luminancia(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function corDeLeituraDoDestaque(raiz, paleta) {
    var dest = str(paleta.destaque);
    if (!HEX.test(dest) || !HEX.test(str(paleta.texto))) return;
    /* paleta sem fundo ou superfície: o CSS usa #FFFFFF e #F4F4F4, e é contra eles que se confere */
    var bases = [HEX.test(str(paleta.fundo)) ? paleta.fundo : '#FFFFFF', HEX.test(str(paleta.superficie)) ? paleta.superficie : '#F4F4F4'];
    var minimo = Math.min(contraste(dest, bases[0]), contraste(dest, bases[1]));
    if (minimo < 3) raiz.style.setProperty('--pv-dest-leitura', paleta.texto);
    else if (minimo < 4.5) raiz.style.setProperty('--pv-dest-leitura-fina', paleta.texto);   /* serve ao número grande, não ao índice pequeno */
  }

  /* ---------- o ritmo da página (dono, 19/11): nunca dois blocos de itens iguais em sequência e no máximo 3 botões de seção ----------
     Vale também para o modelo já gravado (é só o desenho; o JSON do cliente não muda). */
  var MAX_BOTOES = 3;
  function botoesQueFicam(secoes) {
    var comBotao = [];
    secoes.forEach(function (s, n) { if (str(s.cta)) comBotao.push(n); });
    if (comBotao.length <= MAX_BOTOES) return null;
    var fica = {}, total = 0;
    var manter = function (n) { if (!fica[n] && total < MAX_BOTOES) { fica[n] = true; total++; } };
    if (comBotao.indexOf(0) >= 0) manter(0);   /* o do topo */
    var fecho = -1;
    comBotao.forEach(function (n) { if (n > 0 && (secoes[n].tipo === 'cta' || secoes[n].tipo === 'contato')) fecho = n; });
    if (fecho < 0 && comBotao[comBotao.length - 1] > 0) fecho = comBotao[comBotao.length - 1];   /* sem cta/contato com botão: o último da página */
    if (fecho >= 0) manter(fecho);   /* o do fecho */
    comBotao.forEach(manter);   /* e os primeiros dos demais */
    return fica;
  }
  /* o jeito dos itens da seção, com a troca quando é igual ao da anterior: devolve { itens, assinatura }. `itens` é a variante só dos ITENS ('' = a da seção):
     a seção segue com a sua variante (cabeçalho centralizado, 2 colunas do split) e só a lista troca de desenho. assinatura '' = sem lista */
  function comRitmo(s, anterior) {
    var tipo = umDe(TIPOS, s.tipo, 'destaque');
    var variante = umDe(VARIANTES, s.variante, 'centro');
    var modo = modoDosItens(tipo, variante);
    if (!itensValidos(s.itens, modo).length) return { itens: '', assinatura: '' };
    var assinatura = variante === 'faixa' ? modo + '|faixa' : modo;   /* a faixa de cor cheia é um bloco próprio: não se confunde com cartões comuns */
    var troca = '';
    if (assinatura === anterior && variante !== 'faixa') {
      if (modo === 'cartoes') troca = 'lista';
      else if (modo === 'linhas') troca = 'cartoes';
    }
    return { itens: troca, assinatura: troca ? modoDosItens(tipo, troca) : assinatura };
  }

  function desenhar(d) {
    var id = (d && d.identidade) || {};
    var est = id.estilo || {};
    var raiz = el('div', 'pv pv--' + (est.tema === 'escuro' ? 'escuro' : 'claro') +
      ' pv-cantos--' + umDe(['retos', 'suaves', 'redondos'], est.cantos, 'suaves') +
      ' pv-dens--' + umDe(['arejada', 'equilibrada', 'compacta'], est.densidade, 'equilibrada'));
    var paleta = id.paleta || {};
    Object.keys(PALETA).forEach(function (k) { if (HEX.test(str(paleta[k]))) raiz.style.setProperty(PALETA[k], paleta[k]); });
    corDeLeituraDoDestaque(raiz, paleta);
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

    var secoes = (Array.isArray(d.secoes) ? d.secoes : []).slice(0, 12).map(function (s) { return s && typeof s === 'object' ? s : {}; });
    var fica = botoesQueFicam(secoes), anterior = '';
    secoes.forEach(function (s, n) {
      var sec = fica && !fica[n] && str(s.cta) ? Object.assign({}, s, { cta: '' }) : s;
      var r = comRitmo(sec, anterior);
      anterior = r.assinatura;
      raiz.appendChild(secao(sec, n === 0, d, r.itens));
    });
    if (d.rodape && d.rodape.texto) raiz.appendChild(el('footer', 'pv-rodape', d.rodape.texto));
    return raiz;
  }

  /* a "tela" tem a largura de um aparelho (390 ou 1280); a janela, a do espaço disponível */
  function encaixar(janela, tela, larguraBase, ajustarAltura) {
    var escala = Math.min(1, janela.clientWidth / larguraBase) || 1;
    tela.style.transform = escala < 1 ? 'scale(' + escala + ')' : '';
    var medir = function () { janela.style.height = Math.ceil(tela.offsetHeight * escala) + 'px'; };
    if (ajustarAltura) {
      medir();
      /* as fontes hospedadas chegam depois do primeiro desenho e mudam a altura do conteúdo: mede de novo quando assentarem */
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') document.fonts.ready.then(medir);
    }
    return escala;
  }

  window.BZPrevia = { desenhar: desenhar, encaixar: encaixar, FONTES: FONTES };
})();
