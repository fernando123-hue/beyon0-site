/* O MAPA DO CASO NA TELA (PR 5b, tarefas 3 e 4; plano docs/superpowers/plans/2026-11-14-pr5b-mapa-desenho.md). window.BZMapa = { montar(raiz, plano,
   opcoes), atualizar(plano, opcoes), parar() }: o MESMO contrato do BZPlanta (js/planta-desenho.js), para a cola (js/orcamento-planta.js) trocar de
   desenho pela versão do plano. Opções lidas: animar, esboco() (os pontos do esboço para o voo, lidos uma vez), som(nome).
   COMO MONTA (sem CLS, uma leitura só): valida a forma (BZMapaForma); escreve os nós e os rótulos no quadro ESCONDIDO, com a largura que cada um vai
   ter (BZMapaLayout.pedidos); lê as alturas uma vez; BZMapaLayout.compor dá a geometria; grava a altura do quadro e só então o mostra.
   MOVIMENTO: Web Animations pelo relógio que pausa (BZPlantaRelogio: aba escondida e quadro fora da tela); só transform e opacity, e o traço da
   seta uma vez por stroke-dashoffset. Movimento reduzido, html.menos-movimento ou sem a API: o quadro final, parado e aceso. No fim da entrada o
   objetivo vira ouro e sai "bz:planta-pronta" (o valor espera por ele: js/orcamento.js).
   SEGURANÇA: texto do plano só por textContent; papel, ícone, origem e estrutura passam por tabela com chave própria; o id do plano nunca vira
   classe, id, seletor nem atributo; a leitura para o leitor de tela é uma lista oculta de texto (nunca aria-label com texto da pessoa). ES5. */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) module.exports = { para: fabrica };
  if (raiz) raiz.BZMapa = fabrica(raiz);
})(typeof window !== 'undefined' ? window : null, function (win) {
  'use strict';
  var doc = win.document, NS = 'http://www.w3.org/2000/svg';
  var Forma = win.BZMapaForma, Layout = win.BZMapaLayout, Pecas = win.BZPlantaPecas, Relogio = win.BZPlantaRelogio, Saber = win.BZMapaSaber;
  if (!Forma || !Layout || !Pecas || !Relogio || !Saber) return null;

  /* a pele que o dono escolheu (14/11): o TRILHO, a estação é o chip de canto cortado com o ícone, o texto ao lado (celular) ou embaixo, e a
     linha passa pelos chips */
  var CHANFRO = 8;
  var TITULO = 'O mapa do seu caso';
  var PERGUNTA = 'Montei o mapa do seu caso. Ficou certo?', CERTO = 'Está certo', AJUSTAR = 'Quero ajustar algo';
  /* o nó em esboço da Fase 3 (o rascunho do aparelho): a mesma opacidade do esboço fantasma já aprovado; o CSS (.is-rascunho) usa o mesmo valor */
  var ESBOCO = 0.34;
  var T = { no: 320, passo: 240, seta: 480, volta: 900, chega: 520, ouro: 420, depoisSeta: 160, pausa: 420, pulso: 520, voo: 700, repouso: 6000, repousos: 8 };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  /* papel -> classe (lista fechada; nada do plano vira classe) */
  var PAPEL = { hoje: 'mpc-no--hoje', trava: 'mpc-no--trava', origem: 'mpc-no--origem', site: 'mpc-no--site', conversa: 'mpc-no--conversa', acao: 'mpc-no--acao', volta: 'mpc-no--volta', ajustado: 'mpc-no--ajustado', objetivo: 'mpc-no--objetivo' };
  var CINZA = { hoje: 1, trava: 1 };
  var CABECALHOS = ['Hoje', 'Com o site'];
  /* os desenhos das origens (grade de 40, só traço), por código; o desconhecido vira "outro" */
  var R = function (x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) + 'V' + (y + h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' +
      (x + w - r) + ' ' + (y + h) + 'H' + (x + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) + 'V' + (y + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z';
  };
  var C = function (cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0Z'; };
  var t = function (d, ac) { return { d: d, ac: !!ac }; };
  var ORIGENS = {
    instagram: [t(R(9, 9, 22, 22, 6)), t(C(20, 20, 5), 1), t(C(26, 14, 1))],
    whatsapp: [t('M12.5 27.5A11 11 0 1 1 16 30L9 32Z'), t('M16 17c0 4 3 7 7 7', 1)],
    google_busca: [t(C(17, 17, 8)), t('M23 23L31 31', 1)],
    google_mapa: [t('M20 32C14 25 11 21 11 17a9 9 0 0 1 18 0c0 4-3 8-9 15Z'), t(C(20, 17, 3), 1)],
    indicacao: [t(C(14, 14, 4)), t('M7 29c0-6 3-8 7-8s7 2 7 8'), t(C(27, 16, 3.5), 1), t('M23 23c1-1 2-2 4-2 4 0 6 2 6 8', 1)],
    passa_na_frente: [t('M8 16H32L30 10H10Z'), t('M10 16V31H30V16'), t(R(17, 22, 6, 9, 0), 1)],
    facebook: [t(C(12, 20, 3)), t(C(28, 12, 3)), t(C(28, 28, 3)), t('M15 19L25 13M15 21L25 27', 1)],
    tiktok: [t(R(9, 10, 22, 20, 4)), t('M18 15L25 20L18 25Z', 1)],
    site_atual: [t(R(7, 9, 26, 22, 2)), t('M7 15H33'), t('M11 21H25M11 25H21', 1)],
    outro: [t(C(20, 20, 9)), t('M16 20H24M21 17L24 20L21 23', 1)]
  };
  var codigoDaOrigem = function (c) { return tem(ORIGENS, c) ? c : 'outro'; };
  var aviso = function (e) { if (win.console && win.console.warn) win.console.warn('[planta] ' + (e && e.message ? e.message : e)); };

  function el(tag, cls, texto, pai) { var x = doc.createElement(tag); if (cls) x.className = cls; if (texto != null) x.textContent = texto; if (pai) pai.appendChild(x); return x; }
  function sv(tag, cls, pai) { var x = doc.createElementNS(NS, tag); if (cls) x.setAttribute('class', cls); if (pai) pai.appendChild(x); return x; }
  function tracos(lista, pai) { lista.forEach(function (tr) { var p = sv('path', tr.ac ? 'mpc-ac' : '', pai); p.setAttribute('d', tr.d); }); }
  function reduzido() {
    var m = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
    return !!((m && m.matches) || (doc.documentElement && doc.documentElement.classList.contains('menos-movimento')));
  }

  /* ---------- o nó: o chip e o texto ---------- */
  function desenhoDoNo(n) {
    if (n.papel === 'origem') return ORIGENS[codigoDaOrigem(n.origem)];
    return Pecas.desenhar(n.papel === 'objetivo' ? 'confirmacao' : n.icone) || Pecas.desenhar('pagina') || [];
  }
  function chip(n, pai) {
    var s = sv('svg', 'mpc-chip', pai);
    s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (n.papel === 'objetivo') {
      var a = sv('circle', 'mpc-chip__aro', s), d = sv('circle', 'mpc-chip__disco', s), r = sv('path', 'mpc-chip__rumos', s);
      a.setAttribute('cx', 20); a.setAttribute('cy', 20); a.setAttribute('r', 13);
      d.setAttribute('cx', 20); d.setAttribute('cy', 20); d.setAttribute('r', 5);
      r.setAttribute('d', 'M20 1V5M39 20H35M20 39V35M1 20H5');
      return s;
    }
    sv('path', 'mpc-chip__borda', s).setAttribute('d', 'M' + CHANFRO + ' .5H39.5V39.5H.5V' + CHANFRO + 'Z');
    var g = sv('g', 'mpc-ico', s);
    g.setAttribute('transform', 'translate(9 9) scale(.55)');
    tracos(desenhoDoNo(n), g);
    return s;
  }
  function noEl(n) {
    var caixa = el('div', 'mpc-no ' + PAPEL[tem(PAPEL, n.papel) ? n.papel : 'site']);
    caixa.setAttribute('aria-hidden', 'true');
    chip(n, caixa);
    var txt = el('div', 'mpc-no__txt', null, caixa);
    if (n.papel === 'origem') el('span', 'mpc-no__origem', Saber.NOMES[codigoDaOrigem(n.origem)], txt);
    if (n.papel === 'ajustado') el('span', 'mpc-no__marca', 'Ajustado', txt);
    el('span', 'mpc-no__titulo', n.titulo, txt);
    el('span', 'mpc-no__frase', n.frase, txt);
    return caixa;
  }
  /* polilinha com cantos arredondados (o raio encolhe no trecho curto) */
  function cantos(pts, raio) {
    var d = 'M' + pts[0][0] + ' ' + pts[0][1], i;
    for (i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var la = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), lc = Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1]), rr = Math.min(raio, la / 2, lc / 2);
      var ua = [(b[0] - a[0]) / (la || 1), (b[1] - a[1]) / (la || 1)], uc = [(c[0] - b[0]) / (lc || 1), (c[1] - b[1]) / (lc || 1)];
      d += 'L' + (b[0] - ua[0] * rr) + ' ' + (b[1] - ua[1] * rr) + 'Q' + b[0] + ' ' + b[1] + ' ' + (b[0] + uc[0] * rr) + ' ' + (b[1] + uc[1] * rr);
    }
    return d + 'L' + pts[pts.length - 1][0] + ' ' + pts[pts.length - 1][1];
  }
  var PONTAS = { dir: [[-5, -5], [-5, 5]], baixo: [[-5, -5], [5, -5]], cima: [[-5, 5], [5, 5]], esq: [[5, -5], [5, 5]] };

  /* a leitura para o leitor de tela: uma lista de texto, oculta na tela */
  function leitura(plano, pai) {
    var ol = el('ol', 'mpc-sr', null, pai), nomes = Object.create(null);
    plano.nos.forEach(function (n) { nomes[n.id] = n.titulo; });
    nomes.objetivo = plano.objetivo.titulo;
    plano.nos.forEach(function (n) {
      var org = n.papel === 'origem' ? Saber.NOMES[codigoDaOrigem(n.origem)] + ': ' : '';
      el('li', null, org + n.titulo + '. ' + n.frase + '.', ol);
    });
    el('li', null, 'Objetivo: ' + plano.objetivo.titulo + '. ' + plano.objetivo.frase + '.', ol);
    plano.setas.forEach(function (s) { el('li', null, nomes[s.de] + ', ' + s.rotulo + ', ' + nomes[s.para] + '.', ol); });
    return ol;
  }
  /* a linha "Hoje:" (a palavra é posta pela tela) e as origens pelo nome da tabela */
  function linhaDeHoje(plano, pai) {
    var h = plano.hoje;
    if (!h) return null;
    var p = el('p', 'mpc-hoje', null, pai);
    el('b', 'mpc-hoje__rot', 'Hoje:', p);
    var partes = [];
    if (h.texto) partes.push(h.texto);
    if (h.trava) partes.push(h.trava);
    if (partes.length) p.appendChild(doc.createTextNode(' ' + partes.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join('. ') + '.'));
    if (Array.isArray(h.origens) && h.origens.length) el('span', 'mpc-hoje__origens', ' Chegam por: ' + h.origens.map(function (o) { return Saber.NOMES[codigoDaOrigem(o)]; }).join(', ') + '.', p);
    return p;
  }

  /* ---------- montar: tudo numa chamada; o quadro só aparece com a geometria final ---------- */
  function compor(i) {
    var plano = i.plano, quadro = i.quadro, larg = quadro.clientWidth || i.raiz.clientWidth || 0;
    if (!(larg > 0)) return false;
    var pedidos = Layout.pedidos(plano, larg), nos = Object.create(null), rots = [], medidas = {};
    var dados = Object.create(null), esb = Object.create(null);
    plano.nos.forEach(function (n) { dados[n.id] = n; });
    (i.esboco || []).forEach(function (id) { esb[id] = true; });   /* (vale também ao recompor por largura nova e na espera das fontes) */
    dados.objetivo = { id: 'objetivo', papel: 'objetivo', titulo: plano.objetivo.titulo, frase: plano.objetivo.frase };
    while (quadro.firstChild) quadro.removeChild(quadro.firstChild);
    quadro.classList.add('is-medindo');
    quadro.classList.toggle('mpc-quadro--cel', !!(pedidos[0] && pedidos[0].celular));
    quadro.classList.toggle('mpc-quadro--desk', !(pedidos[0] && pedidos[0].celular));
    /* 1. escreve tudo */
    pedidos.forEach(function (p) {
      if (p.chave.indexOf('no:') === 0) { var e = noEl(dados[p.id]); if (esb[p.id]) e.classList.add('is-rascunho'); e.style.width = p.largura + 'px'; quadro.appendChild(e); nos[p.id] = e; }
      else { var r = el('span', 'mpc-rot', plano.setas[+p.chave.slice(4)].rotulo, quadro); r.setAttribute('aria-hidden', 'true'); r.style.maxWidth = p.larguraMax + 'px'; rots[+p.chave.slice(4)] = r; }
    });
    /* 2. lê tudo, uma vez */
    pedidos.forEach(function (p) {
      if (p.chave.indexOf('no:') === 0) medidas[p.chave] = nos[p.id].offsetHeight || 0;
      else { var r = rots[+p.chave.slice(4)]; medidas[p.chave] = { w: r.offsetWidth || 0, h: r.offsetHeight || 0 }; }
    });
    /* 3. a geometria, e só escrita daqui em diante */
    var g = Layout.compor(plano, larg, medidas);
    var svg = sv('svg', 'mpc-svg');
    svg.setAttribute('width', larg); svg.setAttribute('height', g.H); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    quadro.insertBefore(svg, quadro.firstChild);
    Object.keys(nos).forEach(function (id) {
      var b = g.caixas[id], e = nos[id];
      e.style.height = b.h + 'px';
      e.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
    });
    var setas = g.setas.map(function (r) {
      var fim = r.curva ? r.curva[3] : r.linha[r.linha.length - 1], ini = r.curva ? r.curva[0] : r.linha[0];
      var cinza = tem(CINZA, dados[r.de].papel) || tem(CINZA, dados[r.para].papel);
      var noEsboco = !!(esb[r.de] || esb[r.para]);
      var gg = sv('g', 'mpc-seta' + (cinza ? ' mpc-seta--cinza' : '') + (r.volta ? ' mpc-seta--volta' : '') + (noEsboco ? ' is-rascunho' : ''), svg);
      var linha = sv('path', 'mpc-seta__linha', gg);
      linha.setAttribute('d', r.curva ? 'M' + r.curva[0] + 'C' + r.curva[1] + ' ' + r.curva[2] + ' ' + r.curva[3] : cantos(r.linha, 6));
      linha.setAttribute('pathLength', '1');
      var k = PONTAS[r.ponta], ponta = sv('path', 'mpc-seta__ponta', gg);
      ponta.setAttribute('d', 'M' + (fim[0] + k[0][0]) + ' ' + (fim[1] + k[0][1]) + 'L' + fim[0] + ' ' + fim[1] + 'L' + (fim[0] + k[1][0]) + ' ' + (fim[1] + k[1][1]));
      var o = sv('circle', 'mpc-seta__origem', gg);
      o.setAttribute('cx', ini[0]); o.setAttribute('cy', ini[1]); o.setAttribute('r', 2);
      var rot = rots[r.i];
      if (cinza) rot.classList.add('mpc-rot--cinza');
      if (noEsboco) rot.classList.add('is-rascunho');
      /* no computador, o rótulo no meio de uma curva (ou da volta) fica SOBRE a linha: ganha o fundo da página para tapar o trecho */
      if (!g.celular && r.rot.lado === 'meio' && !r.rot.topo) rot.classList.add('mpc-rot--sobre');
      rot.style.transform = 'translate(' + r.rot.left + 'px,' + r.rot.top + 'px)';
      return { r: r, g: gg, linha: linha, rot: rot, esboco: noEsboco };
    });
    g.cabecalhos.forEach(function (c) {
      var h = el('span', 'mpc-cab', CABECALHOS[c.faixa], quadro);
      h.setAttribute('aria-hidden', 'true');
      h.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px)';
    });
    quadro.style.height = g.H + 'px';
    quadro.classList.remove('is-medindo');
    i.g = g; i.nos = nos; i.setas = setas; i.larg = larg;
    return true;
  }

  /* o valor espera o mapa (js/orcamento.js): uma vez por montagem */
  function pronta(i) {
    if (i.pronto) return;
    i.pronto = true;
    if (i.acoes) i.acoes.classList.remove('is-espera');
    i.status.textContent = 'O mapa do seu caso está pronto.';
    if (win.CustomEvent && doc.dispatchEvent) doc.dispatchEvent(new win.CustomEvent('bz:planta-pronta'));
    /* (teste com a IA real, 15/11) a cola mostra o "Ficou certo?" num mapa mais alto que a caixa da conversa */
    if (typeof i.opcoes.aoPronta === 'function') { try { i.opcoes.aoPronta(); } catch (e) { aviso(e); } }
  }
  function final(i) {
    i.quadro.classList.add('is-aceso', 'is-ouro');
    pronta(i);
  }
  /* "Ficou certo?" (spec §7.4; PR 5c): a pergunta e os dois toques moram DENTRO do mapa (a conversa é refeita a cada estado e levaria uma fala
     solta). O lugar existe desde a montagem, invisível (is-espera), e aparece quando o mapa fica pronto. "Está certo" é só uma fala na tela: não
     chama a cola, não gasta IA e nada é gravado (ao recarregar, a pergunta volta). "Quero ajustar algo" chama opcoes.aoAjustar (a cola foca a caixa
     com a dica) e só existe com a planta editável. */
  function acoes(i, pai) {
    var a = el('div', 'mpc-acoes is-espera', null, pai);
    el('p', 'mpc-pergunta', PERGUNTA, a);
    var botoes = el('div', 'mpc-botoes', null, a);
    var certo = el('button', 'btn btn--sm', CERTO, botoes), ajustar = el('button', 'btn btn--sm btn--ghost', AJUSTAR, botoes);
    certo.setAttribute('type', 'button'); ajustar.setAttribute('type', 'button');
    certo.addEventListener('click', function () {
      if (botoes.parentNode) botoes.parentNode.removeChild(botoes);
      /* (revisão do 5c) o botão com foco sai: o foco vai para a fala, e o status anuncia */
      var fala = el('p', 'mpc-fala', CERTO + '.', a);
      fala.setAttribute('tabindex', '-1');
      i.status.textContent = CERTO + '.';
      if (typeof fala.focus === 'function') fala.focus();
    });
    ajustar.addEventListener('click', function () { if (typeof i.opcoes.aoAjustar === 'function') { try { i.opcoes.aoAjustar(); } catch (e) { aviso(e); } } });
    i.acoes = a; i.btnAjustar = ajustar;
    editavel(i);
  }
  function editavel(i) { if (i.btnAjustar) i.btnAjustar.hidden = i.opcoes.editavel !== true; }
  /* (revisão do 5c) o mapa mudou: a pergunta volta (ninguém olhou o novo) */
  function refazerAcoes(i) {
    if (i.acoes && i.acoes.parentNode) i.acoes.parentNode.removeChild(i.acoes);
    acoes(i, i.lugarAcoes);
    if (i.pronto) i.acoes.classList.remove('is-espera');
  }
  /* o relógio novo nasce pausado se o quadro está fora da tela ou a aba escondida */
  function novoRelogio(i) {
    var r = Relogio.criar();
    if (i.naTela === false || doc.hidden) r.pausar();
    return r;
  }
  function trocarTextos(i, plano) {
    var hoje = linhaDeHoje(plano, null);
    if (i.hojeEl && i.hojeEl.parentNode) i.hojeEl.parentNode.removeChild(i.hojeEl);
    if (hoje) i.wrap.insertBefore(hoje, i.quadro);
    i.hojeEl = hoje;
    i.fechoEl.textContent = plano.fecho || '';
    var ol = leitura(plano, null);
    if (i.leituraEl && i.leituraEl.parentNode) i.leituraEl.parentNode.removeChild(i.leituraEl);
    i.wrap.insertBefore(ol, i.status);
    i.leituraEl = ol;
  }
  /* O AJUSTE (spec §7.4; PR 5c): um plano novo com nós em comum não refaz a entrada. Quem ficou desliza do lugar antigo para o novo (só transform);
     o nó novo (com "Ajustado") e as setas dele crescem pela luz depois do deslize; as outras setas reaparecem no lugar novo. Os textos (Hoje, fecho)
     e a leitura acompanham o plano. O valor não é liberado de novo (ele já foi, na entrada). Movimento reduzido: o quadro novo, direto. */
  /* (revisão do 5c) três casos: com as fontes ainda chegando, só troca o plano e os textos (a composição e a entrada esperam as fontes); no meio da
     entrada, vai direto ao quadro final do plano novo (e libera o valor que esperava); com o mapa pronto, o ajuste animado. A composição vem ANTES
     de qualquer troca: se ela falha (sem largura), o mapa de antes fica inteiro e a mesma versão pode entrar depois. */
  /* (Fase 3, PR 2) rascunho = o ajuste QUIETO do aparelho: o nó novo nasce em esboço (is-rascunho, parado, só aparece até ESBOCO depois do
     deslize), sem status, sem som, sem luz, e a pergunta "Ficou certo?" não volta (ninguém decidiu nada ainda). Quem fica desliza como sempre. */
  function ajuste(i, plano, novos, rascunho) {
    var antes = Object.create(null), novo = Object.create(null), velho = { plano: i.plano, json: i.json, esboco: i.esboco };
    i.esboco = rascunho ? novos.slice() : [];
    if (i.esperaFontes) { i.plano = plano; i.json = JSON.stringify(plano); trocarTextos(i, plano); if (!rascunho) refazerAcoes(i); return true; }
    Object.keys(i.g.caixas).forEach(function (id) { antes[id] = i.g.caixas[id]; });
    novos.forEach(function (id) { novo[id] = true; });
    i.plano = plano; i.json = JSON.stringify(plano);
    var deu = false;
    try { deu = compor(i); } catch (e) { aviso(e); }
    if (!deu) {
      i.plano = velho.plano; i.json = velho.json; i.esboco = velho.esboco;
      try { compor(i); } catch (e2) { aviso(e2); }
      return false;
    }
    try { i.rel.parar(); } catch (e3) { aviso(e3); }
    i.rel = novoRelogio(i);
    trocarTextos(i, plano);
    if (rascunho) return esbocar(i, antes, novo);
    refazerAcoes(i);
    if (!i.pronto) { final(i); return true; }
    i.quadro.classList.add('is-aceso', 'is-ouro');
    i.status.textContent = 'Ajustei o mapa do seu caso.';
    if (i.opcoes.animar === false || reduzido() || typeof i.quadro.animate !== 'function') return true;
    var rel = i.rel, cresce = T.voo + T.chega, som = typeof i.opcoes.som === 'function' ? i.opcoes.som : function () {};
    Object.keys(i.nos).forEach(function (id) {
      var b = i.g.caixas[id], pos = 'translate(' + b.x + 'px,' + b.y + 'px)', a = antes[id];
      if (novo[id] || !a) rel.anim(i.nos[id], [{ opacity: 0, transform: pos + ' translateY(5px)' }, { opacity: 1, transform: pos }], { duration: T.no, delay: cresce, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      else if (a.x !== b.x || a.y !== b.y) rel.anim(i.nos[id], [{ transform: 'translate(' + a.x + 'px,' + a.y + 'px)' }, { transform: pos }], { duration: T.voo, easing: 'cubic-bezier(.3,.1,.2,1)', fill: 'backwards' });
    });
    i.setas.forEach(function (x) {
      if (novo[x.r.de] || novo[x.r.para]) {
        rel.anim(x.linha, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: T.seta, delay: T.voo, easing: 'ease-in-out', fill: 'backwards' });
        rel.anim(x.rot, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: T.voo + T.seta * 0.5, fill: 'backwards' });
        luz(i, x.r, T.seta, T.voo, 1);
      } else {
        rel.anim(x.g, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: T.voo, fill: 'backwards' });
        rel.anim(x.rot, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: T.voo, fill: 'backwards' });
      }
    });
    rel.depois(cresce, function () { som('passa'); });
    return true;
  }
  /* (revisão do 5b) girar a tela ou mudar a largura: refaz na largura nova, já pronto, sem entrada nem som (como o esboço); a entrada que ainda
     corria para, e o valor que a esperava é liberado */
  function recompor(i) {
    try { i.rel.parar(); } catch (e) { aviso(e); }
    i.rel = novoRelogio(i);
    if (compor(i)) final(i);
  }
  /* ---------- o ROTEIRO de cada estrutura (puro: do plano e da geometria saem os instantes; desenho do PR 5 §5) ----------
     caminho: um nó por vez, na ordem. antes_depois: a faixa "Hoje" (e as origens) inteira, a trava pulsa, e só então a faixa "Com o site" até o
     objetivo. ramos: os dois filhos do nó que se divide acendem juntos (chegam da mesma luz). ciclo: o objetivo vira ouro e então a luz corre a
     volta; no repouso, um ponto percorre o laço. mapa: as origens (as raízes) acendem juntas. */
  function roteiro(plano, g) {
    var papel = Object.create(null), est = plano.estrutura, quando = Object.create(null), f = g.faixas.f, pulsos = [];
    plano.nos.forEach(function (n) { papel[n.id] = n.papel; });
    papel.objetivo = 'objetivo';
    var diretas = g.setas.filter(function (x) { return !x.volta; });
    var juntas = est === 'mapa' || est === 'ramos';
    function acender(ids, inicio) {
      var tAt = inicio;
      g.ordem.forEach(function (id) {
        if (ids.indexOf(id) < 0) return;
        var chegam = diretas.filter(function (x) { return x.para === id && quando[x.de] != null; });
        var em = chegam.length ? Math.max.apply(null, chegam.map(function (x) { return quando[x.de]; })) + T.chega : (juntas ? inicio : tAt);
        em = Math.max(em, inicio);
        quando[id] = em; tAt = Math.max(tAt, em + T.passo);
      });
      return tAt;
    }
    if (est === 'antes_depois') {
      var hoje = g.ordem.filter(function (id) { return f[id] !== 1 && id !== 'objetivo'; }), resto = g.ordem.filter(function (id) { return hoje.indexOf(id) < 0; });
      var fimHoje = acender(hoje, 0);
      hoje.forEach(function (id) { if (papel[id] === 'trava') pulsos.push({ id: id, em: quando[id] + T.no }); });
      acender(resto, fimHoje + (pulsos.length ? T.pulso : 0) + T.pausa);
    } else acender(g.ordem, 0);
    var ouro = quando.objetivo + T.ouro, fimTudo = ouro, repouso = null;
    var setas = g.setas.map(function (x) {
      var em = x.volta ? ouro + 360 : quando[x.de] + T.depoisSeta, dura = x.volta ? T.volta : T.seta;
      if (x.volta) repouso = x.i;
      fimTudo = Math.max(fimTudo, em + dura);
      return { i: x.i, de: x.de, para: x.para, volta: x.volta, em: em, dura: dura };
    });
    return { quando: quando, setas: setas, pulsos: pulsos, ouro: ouro, fim: fimTudo, repouso: repouso };
  }

  /* o voo: as estações que a pessoa viu nascer no esboço saem de onde estavam e pousam no mapa (os pontos são da tela; o centro do chip) */
  function voo(i) {
    var pontos = null;
    try { pontos = typeof i.opcoes.esboco === 'function' ? i.opcoes.esboco() : null; } catch (e) { aviso(e); }
    if (!pontos) return null;
    var q = i.quadro.getBoundingClientRect(), voaram = Object.create(null);
    Object.keys(i.nos).forEach(function (id) {
      if (id === 'led' || id === 'nucleo') return;   /* (os nomes dos pontos do núcleo e do LED do esboço não são de nó) */
      var p = pontos[id === 'objetivo' ? 'led' : id], b = i.g.caixas[id], meio = Layout.M.chip / 2;
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return;
      var dx = p.x - (q.left + b.x + meio), dy = p.y - (q.top + b.y + meio);
      if (!isFinite(dx) || !isFinite(dy)) return;
      i.rel.anim(i.nos[id], [{ transform: 'translate(' + (b.x + dx) + 'px,' + (b.y + dy) + 'px)' }, { transform: 'translate(' + b.x + 'px,' + b.y + 'px)' }], { duration: T.voo, easing: 'cubic-bezier(.3,.1,.2,1)', fill: 'backwards' });
      voaram[id] = true;
    });
    return voaram;
  }

  /* a entrada: o voo (se houver esboço à vista), depois o roteiro da estrutura pela luz; no fim, o ouro e o valor liberado */
  function entrada(i) {
    var rel = i.rel, som = typeof i.opcoes.som === 'function' ? i.opcoes.som : function () {};
    var voaram = voo(i), base = voaram ? T.voo : 0, r = roteiro(i.plano, i.g);
    i.quadro.classList.add('is-aceso');
    Object.keys(i.nos).forEach(function (id) {
      var em = base + r.quando[id], pos = i.nos[id].style.transform;
      if (!(voaram && voaram[id])) rel.anim(i.nos[id], [{ opacity: 0, transform: pos + ' translateY(5px)' }, { opacity: 1, transform: pos }], { duration: T.no, delay: em, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      rel.depois(em, function () { som('passa'); });
    });
    r.pulsos.forEach(function (p) {
      var alvo = i.nos[p.id] && i.nos[p.id].firstChild;
      if (alvo) rel.anim(alvo, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: T.pulso, delay: base + p.em, easing: 'ease-in-out' });
    });
    r.setas.forEach(function (x) {
      var s = i.setas[x.i], em = base + x.em;
      rel.anim(s.linha, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: x.dura, delay: em, easing: 'ease-in-out', fill: 'backwards' });
      rel.anim(s.rot, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: em + x.dura * 0.5, fill: 'backwards' });
      luz(i, s.r, x.dura, em, 1);
    });
    rel.depois(base + r.ouro, function () { i.quadro.classList.add('is-ouro'); som('ouro'); });
    rel.depois(base + r.fim + 200, function () {
      pronta(i);
      /* o repouso do ciclo: um ponto percorre o laço a cada 6 s, poucas vezes (o limite de vida do repouso da planta) */
      if (r.repouso !== null) luz(i, i.setas[r.repouso].r, T.repouso, 0, T.repousos, 0.18);
    });
  }
  /* o esboço na tela: quem ficou desliza; o nó em esboço e as setas dele esperam o deslize e só aparecem (até ESBOCO), sem crescer nem se desenhar.
     No meio da entrada ou com movimento reduzido: o quadro, parado. */
  function esbocar(i, antes, novo) {
    if (!i.pronto) { final(i); return true; }
    i.quadro.classList.add('is-aceso', 'is-ouro');
    if (i.opcoes.animar === false || reduzido() || typeof i.quadro.animate !== 'function') return true;
    var rel = i.rel, aparece = { duration: 240, delay: T.voo, fill: 'backwards' };
    Object.keys(i.nos).forEach(function (id) {
      var b = i.g.caixas[id], a = antes[id];
      if (novo[id] || !a) rel.anim(i.nos[id], [{ opacity: 0 }, { opacity: novo[id] ? ESBOCO : 1 }], aparece);
      else if (a.x !== b.x || a.y !== b.y) rel.anim(i.nos[id], [{ transform: 'translate(' + a.x + 'px,' + a.y + 'px)' }, { transform: 'translate(' + b.x + 'px,' + b.y + 'px)' }], { duration: T.voo, easing: 'cubic-bezier(.3,.1,.2,1)', fill: 'backwards' });
    });
    i.setas.forEach(function (x) {
      var ate = x.esboco ? ESBOCO : 1;
      rel.anim(x.g, [{ opacity: 0 }, { opacity: ate }], aparece);
      rel.anim(x.rot, [{ opacity: 0 }, { opacity: ate }], aparece);
    });
    return true;
  }
  /* FIRMAR (o Enter dela): o esboço vira nó do mapa ("Ajustado" já vem do papel), a luz passa pelas setas que o tocam e o status anuncia. O mapa
     mudou de verdade: a pergunta volta. Movimento reduzido: só a troca, sem animação. Devolve os ids firmados. */
  function firmar(i) {
    var ids = i.esboco, eram = Object.create(null);
    ids.forEach(function (id) { eram[id] = true; });
    /* o quadro se recompõe sem o esboço (o mesmo plano, a mesma largura: tudo no mesmo lugar); a classe nunca sai por texto montado */
    i.esboco = [];
    if (!compor(i)) { i.esboco = ids; return []; }
    try { i.rel.parar(); } catch (e1) { aviso(e1); }
    i.rel = novoRelogio(i);
    i.status.textContent = 'Ajustei o mapa do seu caso.';
    refazerAcoes(i);
    if (!i.pronto || i.opcoes.animar === false || reduzido() || typeof i.quadro.animate !== 'function') return ids;
    ids.forEach(function (id) { if (i.nos[id]) i.rel.anim(i.nos[id], [{ opacity: ESBOCO }, { opacity: 1 }], { duration: 300, fill: 'backwards' }); });
    i.setas.forEach(function (x) { if (eram[x.r.de] || eram[x.r.para]) luz(i, x.r, T.seta, 0, 1); });
    if (typeof i.opcoes.som === 'function') { try { i.opcoes.som('passa'); } catch (e) { aviso(e); } }
    return ids;
  }
  /* a luz: um ponto em HTML (o compositor anima transform; SVG não), amostrado na própria seta. "fração" < 1: corre só no começo de cada volta */
  function luz(i, seta, dura, atraso, vezes, fracao) {
    var ponto = el('span', 'mpc-luz', null, i.quadro), pts = Layout.amostrar(seta, 16), fr = fracao || 1;
    ponto.setAttribute('aria-hidden', 'true');
    var kf = pts.map(function (pt, k) { return { offset: (k / (pts.length - 1)) * fr, transform: 'translate(' + (pt[0] - 3) + 'px,' + (pt[1] - 3) + 'px)', opacity: k === 0 || k === pts.length - 1 ? 0 : 1 }; });
    if (fr < 1) kf.push({ offset: 1, transform: kf[kf.length - 1].transform, opacity: 0 });
    i.rel.anim(ponto, kf, { duration: dura, delay: atraso, easing: 'linear', fill: 'both', iterations: vezes });
  }

  function ligarPausa(i) {
    i.aoVisivel = function () { if (doc.hidden) i.rel.pausar(); else if (i.naTela !== false) i.rel.retomar(); };
    doc.addEventListener('visibilitychange', i.aoVisivel);
    if (win.IntersectionObserver) {
      i.io = new win.IntersectionObserver(function (ents) {
        ents.forEach(function (e) { i.naTela = e.isIntersecting; if (e.isIntersecting && !doc.hidden) i.rel.retomar(); else i.rel.pausar(); });
      }, { threshold: 0.35 });
      i.io.observe(i.quadro);
    }
  }

  /* uma instância por quadro: a página usa uma (window.BZMapa); o laboratório cria uma por estrutura (BZMapa.criar()) */
  function criar() {
  var inst = null;

  function montar(raizEl, plano, opcoes) {
    var v = Forma.validarFormaMapa(plano);
    if (!v || !v.ok) return { ok: false, motivos: (v && v.motivos) || ['forma'] };
    if (!raizEl) return { ok: false, motivos: ['sem_raiz'] };
    parar();
    var op = opcoes || {}, wrap = el('div', 'mpc');
    while (raizEl.firstChild) raizEl.removeChild(raizEl.firstChild);
    el('h2', 'mpc-titulo', TITULO, wrap);
    var hojeEl = linhaDeHoje(v.plano, wrap);
    var quadro = el('div', 'mpc-quadro', null, wrap);
    var fechoEl = el('p', 'mpc-fecho', v.plano.fecho || '', wrap);
    var lugarDasAcoes = el('div', 'mpc-lugar-acoes', null, wrap);
    var leituraEl = leitura(v.plano, wrap);
    var status = el('p', 'mpc-status', '', wrap);
    status.setAttribute('role', 'status');
    raizEl.appendChild(wrap);
    var i = { raiz: raizEl, wrap: wrap, quadro: quadro, status: status, plano: v.plano, json: JSON.stringify(v.plano), opcoes: op,
      hojeEl: hojeEl, fechoEl: fechoEl, leituraEl: leituraEl, rel: Relogio.criar(), io: null, aoVisivel: null, naTela: true, pronto: false, aoResize: null, timerResize: 0 };
    inst = i;
    i.lugarAcoes = lugarDasAcoes;
    acoes(i, lugarDasAcoes);
    var anima = op.animar !== false && !reduzido() && typeof quadro.animate === 'function';
    /* (revisão do 5b) a altura de cada caixa é medida: com a fonte ainda chegando, o quadro espera escondido (o lugar já reservado) e só então
       se mede, mostra e entra; uma exceção no meio não deixa nada vivo */
    var fontes = doc.fonts && doc.fonts.status === 'loading' && doc.fonts.ready && typeof doc.fonts.ready.then === 'function' ? doc.fonts.ready : null;
    function comecar() { if (anima) { ligarPausa(i); entrada(i); } else final(i); }
    try {
      if (!compor(i)) { parar(); return { ok: false, motivos: ['sem_largura'] }; }
      i.aoResize = function () {
        if (i.timerResize) win.clearTimeout(i.timerResize);
        i.timerResize = win.setTimeout(function () {
          i.timerResize = 0;
          var larg = i.quadro.clientWidth || i.raiz.clientWidth || 0;
          if (inst === i && larg > 0 && Math.abs(larg - i.larg) > 6) { try { recompor(i); } catch (e) { aviso(e); } }
        }, 200);
      };
      win.addEventListener('resize', i.aoResize);
      if (fontes) {
        quadro.classList.add('is-medindo');
        i.esperaFontes = true;
        fontes.then(function () { if (inst !== i) return; i.esperaFontes = false; try { if (compor(i)) comecar(); } catch (e) { aviso(e); parar(); } });
      } else comecar();
    } catch (e) { aviso(e); parar(); return { ok: false, motivos: ['excecao'] }; }
    return { ok: true, largura: i.larg, altura: i.g.H, animada: anima, etapas: i.g.ordem.length };
  }

  /* atualizar: o mesmo plano não refaz nada; outro plano v3 refaz com a entrada (o nó novo que cresce e o deslize vêm no PR 5c) */
  function atualizar(plano, opcoes) {
    if (!inst) return { ok: false, motivos: ['sem_faixa'] };
    var v = Forma.validarFormaMapa(plano);
    if (!v || !v.ok) return { ok: false, motivos: (v && v.motivos) || ['forma'] };
    /* (Fase 3, PR 2) rascunho vale SÓ nesta chamada: não entra nas opções guardadas (o próximo ajuste da cola é o de sempre) */
    var op = inst.opcoes, k, rascunho = !!opcoes && opcoes.rascunho === true;
    if (opcoes) for (k in opcoes) if (k !== 'rascunho' && Object.prototype.hasOwnProperty.call(opcoes, k)) op[k] = opcoes[k];
    editavel(inst);
    if (JSON.stringify(v.plano) === inst.json) {
      /* o mesmo plano sem rascunho, com um esboço na tela: é o Enter dela (firmar) */
      if (!rascunho && inst.esboco && inst.esboco.length) {
        try { return { ok: true, refeita: false, firmou: firmar(inst) }; } catch (e0) { aviso(e0); return { ok: false, motivos: ['excecao'] }; }
      }
      return { ok: true, refeita: false };
    }
    /* com nós em comum é o AJUSTE (o resto fica); sem nenhum, outro mapa: a entrada de novo */
    var antigos = Object.create(null), novos = [], comuns = 0;
    inst.plano.nos.forEach(function (n) { antigos[n.id] = true; });
    v.plano.nos.forEach(function (n) { if (antigos[n.id]) comuns++; else novos.push(n.id); });
    if (comuns) {
      try { if (!ajuste(inst, v.plano, novos, rascunho)) return { ok: false, motivos: ['sem_largura'] }; } catch (e) { aviso(e); return { ok: false, motivos: ['excecao'] }; }
      return { ok: true, refeita: false, novos: novos };
    }
    /* um esboço nunca refaz o mapa inteiro (seria outra entrada, com som e valor): sem nó em comum, recusa e o mapa de antes fica */
    if (rascunho) return { ok: false, motivos: ['rascunho_sem_comum'] };
    var r = montar(inst.raiz, v.plano, op);
    return r.ok ? { ok: true, refeita: true } : r;
  }

  function parar() {
    if (!inst) return;
    var i = inst;
    inst = null;
    try { i.rel.parar(); } catch (e) { aviso(e); }
    if (i.io) i.io.disconnect();
    if (i.aoVisivel) doc.removeEventListener('visibilitychange', i.aoVisivel);
    if (i.aoResize) win.removeEventListener('resize', i.aoResize);
    if (i.timerResize) win.clearTimeout(i.timerResize);
    while (i.raiz.firstChild) i.raiz.removeChild(i.raiz.firstChild);
  }

  return { montar: montar, atualizar: atualizar, parar: parar };
  }

  var api = criar();
  api.criar = criar;
  api.roteiro = roteiro;
  return api;
});
