/* Laboratório das 5 estruturas do mapa do caso (spec 2026-11-13, §7). Desenha cada caso de docs/lab-estruturas-casos.js nas 5 estruturas, no celular
   e no computador, para o dono aprovar o desenho ANTES de ele ir para js/planta-* (PR 5). Fora do deploy. ES5, como a planta.

   O desenho é um só para as 5: cada nó cai numa CAMADA (o passo da história, pelo caminho mais longo desde as origens) e numa FAIXA (a pista
   lateral: as duas do antes/depois, os dois ramos, a ordem no mapa). No celular as camadas são linhas e as faixas colunas; no computador, o
   contrário. A seta de volta do ciclo sai do laço e corre por fora (pela margem no celular, por baixo no computador).
   Regras da casa que valem aqui: só textContent (texto da pessoa nunca vai para atributo, classe ou seletor; papel e ícone passam por tabela);
   altura do quadro gravada antes de aparecer (sem CLS); movimento só em transform e opacity, uma vez; sem desfoque; movimento reduzido ou
   ?estatico=1 = o quadro final, parado e aceso. */
(function () {
  'use strict';
  var PECAS = window.BZPlantaPecas, CASOS = window.LAB_ESTRUTURAS_CASOS;
  var raiz = document.getElementById('estruturas');
  if (!PECAS || !CASOS || !raiz) return;
  var q = new URLSearchParams(location.search);
  var NS = 'http://www.w3.org/2000/svg';
  var parado = q.get('estatico') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* as tabelas fechadas só valem pela chave PRÓPRIA (?caso=toString ou papel "constructor" não passam pela herança do Object) */
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };

  var ESTRUTURAS = [
    { id: 'caminho', nome: 'Caminho', quando: 'Um fluxo direto: alguém procura, encontra e chama.' },
    { id: 'antes_depois', nome: 'Antes e depois', quando: 'A dor é o trabalho repetido ou a perda fora de hora.' },
    { id: 'ramos', nome: 'Ramos', quando: 'Dois públicos ou dois serviços que pedem caminhos diferentes.' },
    { id: 'ciclo', nome: 'Ciclo', quando: 'O ganho está na volta: recompra, retorno, revisão.' },
    { id: 'mapa', nome: 'Mapa', quando: 'Várias forças ao mesmo tempo: de onde chegam, o que trava, o que resolve.' }
  ];
  /* papel → classe (lista fechada; nada do plano vira classe) */
  var PAPEIS = { hoje: 'le-no--hoje', trava: 'le-no--trava', origem: 'le-no--origem', site: 'le-no--site', conversa: 'le-no--conversa', acao: 'le-no--acao', volta: 'le-no--volta', ajustado: 'le-no--ajustado' };
  var CINZA = { hoje: 1, trava: 1 };
  /* as origens por CÓDIGO (§7.3): nome e desenho postos pela tela; código desconhecido vira "outro" */
  var R = function (x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) + 'V' + (y + h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' +
      (x + w - r) + ' ' + (y + h) + 'H' + (x + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) + 'V' + (y + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z';
  };
  var C = function (cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0Z'; };
  var t = function (d, ac) { return { d: d, ac: !!ac }; };
  var ORIGENS = {
    instagram: { nome: 'Instagram', tracos: [t(R(9, 9, 22, 22, 6)), t(C(20, 20, 5), 1), t(C(26, 14, 1))] },
    whatsapp: { nome: 'WhatsApp', tracos: [t('M12.5 27.5A11 11 0 1 1 16 30L9 32Z'), t('M16 17c0 4 3 7 7 7', 1)] },
    google_busca: { nome: 'Busca no Google', tracos: [t(C(17, 17, 8)), t('M23 23L31 31', 1)] },
    google_mapa: { nome: 'Mapa do Google', tracos: [t('M20 32C14 25 11 21 11 17a9 9 0 0 1 18 0c0 4-3 8-9 15Z'), t(C(20, 17, 3), 1)] },
    indicacao: { nome: 'Indicação', tracos: [t(C(14, 14, 4)), t('M7 29c0-6 3-8 7-8s7 2 7 8'), t(C(27, 16, 3.5), 1), t('M23 23c1-1 2-2 4-2 4 0 6 2 6 8', 1)] },
    passa_na_frente: { nome: 'Passa na frente', tracos: [t('M8 16H32L30 10H10Z'), t('M10 16V31H30V16'), t(R(17, 22, 6, 9, 0), 1)] },
    facebook: { nome: 'Facebook', tracos: [t(C(12, 20, 3)), t(C(28, 12, 3)), t(C(28, 28, 3)), t('M15 19L25 13M15 21L25 27', 1)] },
    tiktok: { nome: 'TikTok', tracos: [t(R(9, 10, 22, 20, 4)), t('M18 15L25 20L18 25Z', 1)] },
    site_atual: { nome: 'Site atual', tracos: [t(R(7, 9, 26, 22, 2)), t('M7 15H33'), t('M11 21H25M11 25H21', 1)] },
    outro: { nome: 'Outro canal', tracos: [t(C(20, 20, 9)), t('M16 20H24M21 17L24 20L21 23', 1)] }
  };

  /* ---------- validação do esquema v3 PROPOSTO (o que o PR 4 vai fixar; aqui só para os casos do laboratório não fugirem dele) ---------- */
  var LIM = { titulo: 28, frase: 60, rotulo: 24, hoje: 60, fecho: 80, setas: 9, nosMin: 2, nosMax: 6 };
  function validar(caso, est) {
    var p = tem(caso.estruturas, est) ? caso.estruturas[est] : null, e = [], ids = { objetivo: 1 }, saem = {}, entram = {};
    var txt = function (v, max, onde) { if (typeof v !== 'string' || !v.trim() || v.length > max || /[<>[]|\d{4}|R\$/.test(v)) e.push(onde + ' (até ' + max + ')'); };
    if (!p) return ['estrutura ausente'];
    txt(caso.hoje.texto, LIM.hoje, 'hoje.texto'); txt(caso.hoje.trava, LIM.hoje, 'hoje.trava'); txt(caso.fecho, LIM.fecho, 'fecho');
    txt(caso.objetivo.titulo, LIM.titulo, 'objetivo.titulo'); txt(caso.objetivo.frase, LIM.frase, 'objetivo.frase');
    if (caso.hoje.origens.length > 3) e.push('mais de 3 origens');
    caso.hoje.origens.forEach(function (o) { if (!tem(ORIGENS, o)) e.push('origem ' + o); });
    if (p.nos.length < LIM.nosMin || p.nos.length > LIM.nosMax) e.push(est + ': ' + p.nos.length + ' nós (de ' + LIM.nosMin + ' a ' + LIM.nosMax + ', mais o objetivo)');
    p.nos.forEach(function (n) {
      if (!/^[a-z0-9_]{1,12}$/.test(n.id) || tem(ids, n.id)) e.push('id ' + n.id);
      ids[n.id] = 1;
      if (!tem(PAPEIS, n.papel)) e.push('papel ' + n.papel);
      if (PECAS.TIPOS.indexOf(n.icone) < 0) e.push('ícone ' + n.icone);
      if (n.papel === 'origem' && !tem(ORIGENS, n.origem)) e.push('origem ' + n.origem);
      txt(n.titulo, LIM.titulo, n.id + '.titulo'); txt(n.frase, LIM.frase, n.id + '.frase');
    });
    if (p.setas.length > LIM.setas) e.push(p.setas.length + ' setas');
    p.setas.forEach(function (s) {
      if (!tem(ids, s.de) || !tem(ids, s.para) || s.de === s.para) { e.push('seta ' + s.de + '→' + s.para); return; }
      txt(s.rotulo, LIM.rotulo, 'rótulo ' + s.de + '→' + s.para);
      saem[s.de] = (saem[s.de] || 0) + 1; entram[s.para] = (entram[s.para] || 0) + 1;
    });
    if (!entram.objetivo) e.push('nenhuma seta chega ao objetivo');
    if (e.length) return e;   /* o resto (camadas) só roda sobre um plano com ids e setas válidos */
    p.nos.forEach(function (n) { if (!saem[n.id] && !entram[n.id]) e.push(n.id + ' solto'); });
    var lay = camadas(p);
    if (est === 'ciclo' && lay.volta.length !== 1) e.push('ciclo: precisa de exatamente 1 seta de volta');
    if (est !== 'ciclo' && lay.volta.length) e.push(est + ': seta de volta só no ciclo');
    if (est === 'ramos' && !p.nos.some(function (n) { return saem[n.id] === 2; })) e.push('ramos: nenhum nó se divide em 2');
    if (est === 'antes_depois' && !(p.nos.some(function (n) { return n.papel === 'trava'; }) && p.nos.some(function (n) { return n.papel === 'site' || n.papel === 'acao'; }))) e.push('antes_depois: falta a trava ou o site');
    if (est === 'caminho' && p.nos.some(function (n) { return saem[n.id] > 1 || entram[n.id] > 1; })) e.push('caminho: não se divide');
    lay.porCamada.forEach(function (c, i) { if (c.length > 2) e.push(est + ': camada ' + i + ' com ' + c.length + ' nós (máximo 2)'); });
    return e;
  }

  /* ---------- camadas e faixas ---------- */
  function camadas(p) {
    var ids = p.nos.map(function (n) { return n.id; }).concat('objetivo'), filhos = {}, volta = [], estado = {}, camada = {};
    ids.forEach(function (id) { filhos[id] = []; });
    p.setas.forEach(function (s) { if (filhos[s.de]) filhos[s.de].push(s); });
    var temEntrada = {};
    p.setas.forEach(function (s) { temEntrada[s.para] = 1; });
    /* a seta de volta = a que fecha um laço na busca em profundidade a partir das origens (na ordem do plano) */
    function dfs(id) {
      estado[id] = 1;
      filhos[id].forEach(function (s) {
        if (estado[s.para] === 1) volta.push(s);
        else if (!estado[s.para]) dfs(s.para);
      });
      estado[id] = 2;
    }
    ids.forEach(function (id) { if (!temEntrada[id] && !estado[id]) dfs(id); });
    ids.forEach(function (id) { if (!estado[id]) dfs(id); });
    var diretas = p.setas.filter(function (s) { return volta.indexOf(s) < 0; });
    /* caminho mais longo: relaxa até estabilizar (grafo pequeno e sem laço depois de tirar a volta) */
    ids.forEach(function (id) { camada[id] = 0; });
    for (var k = 0; k < ids.length; k++) diretas.forEach(function (s) { if (camada[s.para] < camada[s.de] + 1) camada[s.para] = camada[s.de] + 1; });
    var porCamada = [];
    ids.forEach(function (id) { (porCamada[camada[id]] = porCamada[camada[id]] || []).push(id); });
    return { camada: camada, porCamada: porCamada, volta: volta, diretas: diretas };
  }

  /* faixa de cada nó: número (0, 1) ou -1 = ocupa a largura toda (centrado) */
  function faixas(est, p, lay) {
    var f = {}, papel = {};
    p.nos.forEach(function (n) { papel[n.id] = n.papel; });
    papel.objetivo = 'objetivo';
    var n = 1;
    if (est === 'antes_depois') {
      n = 2;
      Object.keys(lay.camada).forEach(function (id) { f[id] = CINZA[papel[id]] ? 0 : (papel[id] === 'objetivo' || papel[id] === 'origem') ? -1 : 1; });
    } else if (est === 'ramos') {
      n = 2;
      Object.keys(lay.camada).forEach(function (id) { f[id] = -1; });
      var div = null;
      p.nos.forEach(function (x) { if (!div && lay.diretas.filter(function (s) { return s.de === x.id; }).length === 2) div = x.id; });
      lay.diretas.filter(function (s) { return s.de === div; }).forEach(function (s, i) {
        var fila = [s.para];
        while (fila.length) {
          var id = fila.shift();
          if (id === 'objetivo' || f[id] !== -1) continue;
          f[id] = i;
          lay.diretas.forEach(function (x) { if (x.de === id) fila.push(x.para); });
        }
      });
    } else if (est === 'mapa') {
      n = 2;
      /* dentro da camada, a ordem pela média das faixas de quem aponta para o nó (menos cruzamento); empate: a ordem do plano */
      lay.porCamada.forEach(function (ids) {
        if (ids.length === 1) { f[ids[0]] = -1; return; }
        var peso = function (id) {
          var de = lay.diretas.filter(function (s) { return s.para === id && f[s.de] >= 0; });
          return de.length ? de.reduce(function (a, s) { return a + f[s.de]; }, 0) / de.length : 0.5;
        };
        ids.slice().sort(function (a, b) { return peso(a) - peso(b) || ids.indexOf(a) - ids.indexOf(b); }).forEach(function (id, i) { f[id] = i; });
      });
    } else {
      Object.keys(lay.camada).forEach(function (id) { f[id] = 0; });
    }
    return { f: f, n: n };
  }

  /* ---------- peças de DOM ---------- */
  function el(tag, cls, texto) { var x = document.createElement(tag); if (cls) x.className = cls; if (texto != null) x.textContent = texto; return x; }
  function svg(tag, cls) { var x = document.createElementNS(NS, tag); if (cls) x.setAttribute('class', cls); return x; }
  function icone(tracos) {
    var s = svg('svg', 'le-ico');
    s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('aria-hidden', 'true');
    tracos.forEach(function (tr) { var p = svg('path', tr.ac ? 'le-ico__ac' : ''); p.setAttribute('d', tr.d); s.appendChild(p); });
    return s;
  }
  function no(n) {
    var ehObj = n.papel === 'objetivo', caixa = el('div', 'le-no ' + (ehObj ? 'le-no--objetivo' : PAPEIS[n.papel]));
    var org = n.papel === 'origem' ? ORIGENS[tem(ORIGENS, n.origem) ? n.origem : 'outro'] : null;
    caixa.appendChild(icone(org ? org.tracos : PECAS.desenhar(ehObj ? 'confirmacao' : n.icone) || PECAS.desenhar('pagina')));
    var txt = el('div', 'le-no__txt');
    if (org) txt.appendChild(el('span', 'le-no__origem', org.nome));
    if (n.papel === 'ajustado') txt.appendChild(el('span', 'le-no__marca', 'Ajustado'));
    txt.appendChild(el('span', 'le-no__titulo', n.titulo));
    txt.appendChild(el('span', 'le-no__frase', n.frase));
    caixa.appendChild(txt);
    caixa.setAttribute('aria-hidden', 'true');
    return caixa;
  }

  /* ---------- geometria ---------- */
  var M = { gapX: 104, gapXJusto: 80, gapY: 36, celGapX: 14, celGapY: 34, celCab: 22, margemVolta: 104, noMax: 224, rotMax: 96 };
  /* com 5 camadas ou mais o vão encolhe (o rótulo quebra em mais linhas) para a caixa não ficar estreita demais */
  var vaoDe = function (nCam) { return nCam >= 5 ? M.gapXJusto : M.gapX; };
  function ponto(c, tt) {
    var u = 1 - tt;
    return [u * u * u * c[0][0] + 3 * u * u * tt * c[1][0] + 3 * u * tt * tt * c[2][0] + tt * tt * tt * c[3][0],
      u * u * u * c[0][1] + 3 * u * u * tt * c[1][1] + 3 * u * tt * tt * c[2][1] + tt * tt * tt * c[3][1]];
  }
  function amostrar(seta, n) {
    var out = [], i;
    if (seta.curva) { for (i = 0; i <= n; i++) out.push(ponto(seta.curva, i / n)); return out; }
    /* polilinha: n pontos pelo comprimento */
    var pts = seta.linha, tam = [0], tot = 0;
    for (i = 1; i < pts.length; i++) { tot += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]); tam.push(tot); }
    for (i = 0; i <= n; i++) {
      var alvo = tot * i / n, j = 1;
      while (j < pts.length - 1 && tam[j] < alvo) j++;
      var seg = tam[j] - tam[j - 1] || 1, f = (alvo - tam[j - 1]) / seg;
      out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
    }
    return out;
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* mede e posiciona: devolve { altura, caixas: {id: {x,y,w,h}}, setas: [...] } */
  function compor(est, p, caso, quadro, largura, celular) {
    var lay = camadas(p), fx = faixas(est, p, lay), nos = {}, cx = {}, nCam = lay.porCamada.length, dados = {};
    p.nos.forEach(function (n) { dados[n.id] = n; });
    dados.objetivo = { id: 'objetivo', papel: 'objetivo', titulo: caso.objetivo.titulo, frase: caso.objetivo.frase };
    Object.keys(lay.camada).forEach(function (id) { nos[id] = no(dados[id]); quadro.appendChild(nos[id]); });
    var cab = est === 'antes_depois' ? M.celCab : 0, volta = est === 'ciclo';

    if (celular) {
      var util = largura - (volta ? M.margemVolta : 0), col = fx.n > 1 ? (util - M.celGapX) / 2 : util, y = cab, alt = [];
      Object.keys(nos).forEach(function (id) {
        var f = fx.f[id], w = f < 0 ? util : col;
        nos[id].style.width = w + 'px';
        cx[id] = { x: f < 0 ? 0 : f * (col + M.celGapX), w: w };
      });
      lay.porCamada.forEach(function (ids, i) {
        var h = 0;
        ids.forEach(function (id) { h = Math.max(h, nos[id].offsetHeight); });
        ids.forEach(function (id) { cx[id].y = y; cx[id].h = h; nos[id].style.height = h + 'px'; });
        alt[i] = h; y += h + (i < nCam - 1 ? M.celGapY : 0);
      });
      var altura = y;
    } else {
      var gap = vaoDe(nCam), colW = Math.min(M.noMax, (largura - 40 - (nCam - 1) * gap) / nCam), total = nCam * colW + (nCam - 1) * gap, x0 = (largura - total) / 2;
      Object.keys(nos).forEach(function (id) { nos[id].style.width = colW + 'px'; });
      /* altura de cada faixa = o nó mais alto dela; o que ocupa a largura toda fica centrado na altura das faixas */
      var hF = [0, 0], hInteiro = 0;
      Object.keys(nos).forEach(function (id) {
        var h = nos[id].offsetHeight, f = fx.f[id];
        if (f < 0) hInteiro = Math.max(hInteiro, h); else hF[f] = Math.max(hF[f], h);
      });
      var topo = [cab, cab + hF[0] + M.gapY + cab], altFaixas = fx.n > 1 ? topo[1] + hF[1] : cab + Math.max(hF[0], hInteiro);
      /* o nó que ocupa as faixas todas fica centrado entre cab e o fim; se ele for mais alto que esse vão, as faixas descem e o quadro cresce */
      if (fx.n > 1 && hInteiro > altFaixas - cab) { var d = (hInteiro + cab - altFaixas) / 2; topo = [topo[0] + d, topo[1] + d]; altFaixas = hInteiro + cab; }
      /* as caixas de uma faixa ficam da mesma altura (a régua da linha); a que ocupa as faixas todas fica com a sua */
      Object.keys(nos).forEach(function (id) {
        var f = fx.f[id], h = f < 0 ? nos[id].offsetHeight : hF[f];
        if (f >= 0) nos[id].style.height = h + 'px';
        cx[id] = { x: x0 + lay.camada[id] * (colW + gap), w: colW, h: h, y: f < 0 ? (fx.n > 1 ? (cab + altFaixas - h) / 2 : cab) : topo[f] };
      });
      altura = altFaixas + (volta ? 64 : 0);
    }
    Object.keys(nos).forEach(function (id) { var b = cx[id]; nos[id].style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)'; });

    /* as setas */
    var setas = p.setas.map(function (s) {
      var a = cx[s.de], b = cx[s.para], ehVolta = lay.volta.indexOf(s) >= 0, r = { s: s, volta: ehVolta, cinza: tem(CINZA, dados[s.de].papel) || tem(CINZA, dados[s.para].papel) };
      if (ehVolta && celular) {
        var xm = largura - M.margemVolta + 26, ya = a.y + a.h / 2, yb = b.y + b.h / 2;
        r.linha = [[a.x + a.w, ya], [xm, ya], [xm, yb], [b.x + b.w, yb]];
        r.ponta = 'esq'; r.rot = { x: xm + 8, y: (ya + yb) / 2, lado: 'dir', max: largura - xm - 8 };
      } else if (ehVolta) {
        var yv = altura - 24, xa = a.x + a.w / 2, xb = b.x + b.w / 2;
        r.linha = [[xa, a.y + a.h], [xa, yv], [xb, yv], [xb, b.y + b.h]];
        r.ponta = 'cima'; r.rot = { x: (xa + xb) / 2, y: yv, lado: 'meio', max: Math.abs(xa - xb) - 40 };
      } else if (celular) {
        /* o trilho corre perto da borda esquerda da caixa mais estreita; o rótulo, à direita dele */
        var xr = Math.max(a.x, b.x) + 14, y0 = a.y + a.h, y1 = b.y;
        if (a.w === b.w && a.x !== b.x) { var x0c = a.x + 14, x1c = b.x + 14; r.curva = [[x0c, y0], [x0c, (y0 + y1) / 2], [x1c, (y0 + y1) / 2], [x1c, y1]]; xr = (x0c + x1c) / 2; }
        else r.curva = [[xr, y0], [xr, (y0 + y1) / 2], [xr, (y0 + y1) / 2], [xr, y1]];
        r.ponta = 'baixo'; r.rot = { x: xr + 8, y: (y0 + y1) / 2, lado: 'dir', max: Math.min(b.w, a.w) - 26 };
      } else {
        var xa2 = a.x + a.w, xb2 = b.x, ya2 = clamp(b.y + b.h / 2, a.y + 14, a.y + a.h - 14), yb2 = clamp(a.y + a.h / 2, b.y + 14, b.y + b.h - 14), mx = (xa2 + xb2) / 2;
        r.curva = [[xa2, ya2], [mx, ya2], [mx, yb2], [xb2, yb2]];
        var meio = ponto(r.curva, 0.5);
        r.ponta = 'dir'; r.rot = { x: meio[0], y: meio[1], lado: 'meio', max: Math.min(M.rotMax, xb2 - xa2 - 8) };
      }
      return r;
    });
    return { altura: altura, caixas: cx, setas: setas, nos: nos, ordem: ordem(lay, fx) };
  }
  /* a ordem da história: camada, depois faixa */
  function ordem(lay, fx) {
    var o = [];
    lay.porCamada.forEach(function (ids) { ids.slice().sort(function (a, b) { return fx.f[a] - fx.f[b]; }).forEach(function (id) { o.push(id); }); });
    return o;
  }

  function desenharSetas(quadro, svgEl, comp) {
    comp.setas.forEach(function (r, i) {
      var d, fim, ini;
      if (r.curva) { var c = r.curva; d = 'M' + c[0] + 'C' + c[1] + ' ' + c[2] + ' ' + c[3]; fim = c[3]; }
      else { d = 'M' + r.linha.map(function (pt) { return pt.join(' '); }).join('L'); fim = r.linha[r.linha.length - 1]; }
      ini = r.curva ? r.curva[0] : r.linha[0];
      var g = svg('g', 'le-seta' + (r.cinza ? ' le-seta--cinza' : '') + (r.volta ? ' le-seta--volta' : ''));
      var p = svg('path', 'le-seta__linha'); p.setAttribute('d', d); g.appendChild(p);
      var k = 5, ponta = { dir: [[-k, -k], [-k, k]], baixo: [[-k, -k], [k, -k]], cima: [[-k, k], [k, k]], esq: [[k, -k], [k, k]] }[r.ponta];
      var h = svg('path', 'le-seta__ponta');
      h.setAttribute('d', 'M' + (fim[0] + ponta[0][0]) + ' ' + (fim[1] + ponta[0][1]) + 'L' + fim[0] + ' ' + fim[1] + 'L' + (fim[0] + ponta[1][0]) + ' ' + (fim[1] + ponta[1][1]));
      g.appendChild(h);
      var o = svg('circle', 'le-seta__origem'); o.setAttribute('cx', ini[0]); o.setAttribute('cy', ini[1]); o.setAttribute('r', 2); g.appendChild(o);
      svgEl.appendChild(g);
      r.g = g;
      /* o rótulo: HTML (quebra de linha de verdade), medido e posto do lado da linha */
      var rot = el('span', 'le-rot' + (r.cinza ? ' le-rot--cinza' : ''), r.s.rotulo);
      rot.setAttribute('aria-hidden', 'true');
      rot.style.maxWidth = Math.max(60, r.rot.max) + 'px';
      quadro.appendChild(rot);
      var w = rot.offsetWidth, hh = rot.offsetHeight;
      var x = r.rot.lado === 'meio' ? r.rot.x - w / 2 : r.rot.x, y = r.rot.y - hh / 2;
      rot.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      r.el = rot;
      r.i = i;
    });
  }

  /* a leitura para o leitor de tela: um nó de texto oculto (nunca aria-label com texto da pessoa) */
  function leitura(est, p, caso) {
    var ol = el('ol', 'sr-only'), nomes = {};
    p.nos.forEach(function (n) { nomes[n.id] = n.titulo; });
    nomes.objetivo = caso.objetivo.titulo;
    p.nos.forEach(function (n) {
      var org = n.papel === 'origem' ? ORIGENS[tem(ORIGENS, n.origem) ? n.origem : 'outro'].nome + ': ' : '';
      ol.appendChild(el('li', null, org + n.titulo + '. ' + n.frase + '.'));
    });
    ol.appendChild(el('li', null, 'Objetivo: ' + caso.objetivo.titulo + '. ' + caso.objetivo.frase + '.'));
    p.setas.forEach(function (s) { ol.appendChild(el('li', null, nomes[s.de] + ' → ' + nomes[s.para] + ': ' + s.rotulo + '.')); });
    return ol;
  }

  /* ---------- a entrada: os nós acendem na ordem da história, a luz corre cada seta, o objetivo vira ouro ---------- */
  function animar(quadro, comp) {
    var t = 0, PASSO = 240, quando = {};
    comp.ordem.forEach(function (id) {
      var chega = comp.setas.filter(function (r) { return r.s.para === id && !r.volta && quando[r.s.de] != null; });
      var em = chega.length ? Math.max.apply(null, chega.map(function (r) { return quando[r.s.de]; })) + 520 : t;
      quando[id] = em; t = Math.max(t, em + PASSO);
    });
    /* o atraso vale só para a entrada (opacity; os filhos herdam para o transform): a borda que vira ouro não espera (transition: opacity, border-color) */
    Object.keys(comp.nos).forEach(function (id) { comp.nos[id].style.transitionDelay = quando[id] + 'ms, 0ms'; });
    comp.setas.forEach(function (r) {
      var em = r.volta ? quando[r.s.de] + 360 : quando[r.s.de] + 160;
      r.g.style.transitionDelay = em + 'ms'; r.el.style.transitionDelay = em + 'ms';
      /* a luz: um ponto em HTML (o compositor anima transform; SVG não), amostrado na própria curva, sem getPointAtLength */
      var luz = el('span', 'le-luz'); luz.setAttribute('aria-hidden', 'true');
      quadro.appendChild(luz);
      var pts = amostrar(r, 16);
      luz.animate(pts.map(function (pt, i) { return { transform: 'translate(' + (pt[0] - 3) + 'px,' + (pt[1] - 3) + 'px)', opacity: i === 0 || i === pts.length - 1 ? 0 : 1 }; }),
        { duration: r.volta ? 900 : 480, delay: em, easing: 'ease-in-out', fill: 'both' });
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () { quadro.classList.add('is-aceso'); }); });
    var ouro = quando.objetivo + 420;
    relogios.push(setTimeout(function () { quadro.classList.add('is-ouro'); }, ouro));
  }

  var relogios = [], atual = null, larguraFeita = 0;
  function montar(casoId) {
    var caso = CASOS[casoId], erros = [];
    /* a troca de caso (ou o giro da tela) desmonta tudo: os relógios do ouro e as luzes do desenho anterior param */
    relogios.forEach(clearTimeout); relogios = [];
    raiz.querySelectorAll('.le-luz').forEach(function (l) { l.getAnimations().forEach(function (a) { a.cancel(); }); });
    raiz.textContent = '';
    atual = casoId; larguraFeita = raiz.clientWidth;
    var hoje = document.getElementById('hoje');
    hoje.textContent = '';
    hoje.appendChild(el('span', 'lab-hoje__rot', 'Hoje:'));
    hoje.appendChild(document.createTextNode(' ' + caso.hoje.texto + '. ' + caso.hoje.trava.charAt(0).toUpperCase() + caso.hoje.trava.slice(1) + '. '));
    /* as origens do caso: o nome sai da tabela, pelo código (nunca o código cru) */
    hoje.appendChild(el('span', 'lab-hoje__origens', 'Chegam por: ' + caso.hoje.origens.map(function (o) { return ORIGENS[tem(ORIGENS, o) ? o : 'outro'].nome; }).join(' · ')));
    ESTRUTURAS.forEach(function (E) {
      var p = caso.estruturas[E.id], sec = el('section', 'le-estrutura');
      sec.setAttribute('data-estrutura', E.id);
      sec.appendChild(el('h2', 'le-h2', E.nome));
      sec.appendChild(el('p', 'le-quando', E.quando));
      var errs = validar(caso, E.id);
      if (errs.length) { erros.push(E.nome + ': ' + errs.join('; ')); raiz.appendChild(sec); return; }
      var quadro = el('div', 'le-quadro'), largura;
      sec.appendChild(quadro);
      raiz.appendChild(sec);
      largura = quadro.clientWidth;
      /* o desenho de computador só quando a coluna passa de 120 px (num tablet de 700 px, 5 camadas dariam caixas de 60 px) */
      var nCam = camadas(p).porCamada.length, celular = largura < 640 || (largura - 40 - (nCam - 1) * vaoDe(nCam)) / nCam < 120;
      quadro.classList.add(celular ? 'le-quadro--cel' : 'le-quadro--desk');
      if (E.id === 'antes_depois') {
        ['Hoje', 'Com o site'].forEach(function (c) { var h = el('span', 'le-cab', c); h.setAttribute('aria-hidden', 'true'); quadro.appendChild(h); });
      }
      var svgEl = svg('svg', 'le-svg'); svgEl.setAttribute('aria-hidden', 'true');
      quadro.appendChild(svgEl);
      var comp = compor(E.id, p, caso, quadro, largura, celular);
      quadro.style.height = Math.ceil(comp.altura) + 'px';
      svgEl.setAttribute('width', largura); svgEl.setAttribute('height', Math.ceil(comp.altura));
      if (E.id === 'antes_depois') {
        /* os títulos das faixas: no celular em cima de cada coluna; no computador em cima de cada faixa */
        var hs = quadro.querySelectorAll('.le-cab'), prim = {};
        Object.keys(comp.caixas).forEach(function (id) {
          var b = comp.caixas[id], f = p.nos.filter(function (n) { return n.id === id; })[0];
          if (!f || f.papel === 'origem') return;
          var faixa = CINZA[f.papel] ? 0 : 1;
          if (!prim[faixa] || b.x < prim[faixa].x || (celular && b.y < prim[faixa].y)) prim[faixa] = b;
        });
        Array.prototype.forEach.call(hs, function (h, i) {
          var b = prim[i] || { x: 0, y: M.celCab };
          h.style.transform = 'translate(' + b.x + 'px,' + (b.y - M.celCab) + 'px)';
        });
      }
      desenharSetas(quadro, svgEl, comp);
      sec.appendChild(leitura(E.id, p, caso));
      if (parado) quadro.classList.add('is-aceso', 'is-ouro', 'is-parado');
      else animar(quadro, comp);
    });
    var caixaErros = document.getElementById('erros');
    caixaErros.hidden = !erros.length;
    caixaErros.textContent = erros.join(' · ');
    window.LAB_ESTRUTURAS.erros = erros;
  }

  function escolher(id) {
    if (!tem(CASOS, id)) id = 'clinica';
    Array.prototype.forEach.call(document.querySelectorAll('[data-caso]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-caso') === id ? 'true' : 'false'); });
    montar(id);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-caso]'), function (b) { b.addEventListener('click', function () { escolher(b.getAttribute('data-caso')); }); });
  if (q.get('captura') === '1') document.documentElement.classList.add('lab-captura');
  window.LAB_ESTRUTURAS = { escolher: escolher, validar: validar, erros: [] };
  /* a fonte muda a altura das caixas: o desenho espera a Sora (as caixas são medidas uma vez, e a altura do quadro não muda depois) */
  var adiado = 0;
  addEventListener('resize', function () {
    clearTimeout(adiado);
    adiado = setTimeout(function () { if (atual && raiz.clientWidth !== larguraFeita) montar(atual); }, 200);
  });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { escolher(q.get('caso')); window.LAB_ESTRUTURAS.pronto = true; });
})();
