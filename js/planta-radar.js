/* ==========================================================================
   O RADAR "COMO LEMOS O SEU CASO" (spec docs/superpowers/specs/2026-11-05-planta-viva-design.md §3; plano "PR 2d-front").
   Mostra o que a PESSOA disse sobre cinco assuntos, em três níveis escritos por extenso. Não é nota do negócio: sem número,
   sem porcentagem, sem comparação. Script clássico (window.BZRadar) e CommonJS (os testes), ES5, sem dependência além de
   window.BZPlantaForma (js/orcamento-planta-forma.js), que valida a leitura antes de qualquer desenho.

   API:  BZRadar.montar(contêiner, leitura?)  -> instância { atualizar(leitura), desmontar(), alvo } | null
         BZRadar.atualizar(contêiner|instância, leitura) -> true se desenhou, false se recusou (e a tela fica como estava)
         BZRadar.alturaRadar(largura) -> altura em px da caixa do desenho (300 em 390), a MESMA que css/orcamento-radar.css reserva
   Mais as funções puras que os testes provam: geometria, vertice, pontos, raioDoNivel, fatoresDaLeitura, interpolar, suave.

   Regras que moram aqui (CLAUDE.md):
   - O texto só entra por textContent/createTextNode, nunca por HTML. A evidência do eixo "não falou" NÃO é desenhada.
   - A altura é reservada pelo CSS (aspect-ratio + mínimo e máximo = alturaRadar); o JS só põe atributos no SVG e posiciona rótulos
     (position: absolute), então nada empurra a página quando a leitura chega ou muda.
   - Movimento é acréscimo: os vértices andam 450 ms pelo laço ÚNICO window.BEYON.add (nenhum requestAnimationFrame aqui); sem
     BEYON, ou com BEYON.reduced, o polígono salta e o texto já está inteiro. Nenhuma variável de CSS muda por quadro.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica(raiz);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZRadar = api;
})(typeof window !== 'undefined' ? window : null, function (raiz) {
  'use strict';

  /* ---------- o que é fixo (rótulos escritos pelo código, nunca pelo modelo) ---------- */
  var EIXOS = Object.freeze(['volume', 'repeticao', 'urgencia', 'pessoas', 'informacao']);
  var ROTULOS = Object.freeze({ volume: 'Volume', repeticao: 'Repetição', urgencia: 'Urgência', pessoas: 'Depende de pessoas', informacao: 'Informação espalhada' });
  var NIVEL_RAIO = Object.freeze({ nao_falou: 0.15, comentou: 0.5, deixou_claro: 0.85 });
  var PALAVRAS_NIVEL = Object.freeze({ nao_falou: 'não falou', comentou: 'comentou', deixou_claro: 'deixou claro' });
  var TITULO = 'Como lemos o seu caso';
  var LEGENDA = 'É o que você contou, não uma nota do seu negócio.';
  var DURACAO_MS = 450;

  var LARGURA_PADRAO = 390;     /* sem largura medida (contêiner escondido) vale a do celular */
  var ALTURA_POR_100 = 77;      /* altura = 77% da largura, entre 240 e 320 px: o CSS repete estes números (aspect-ratio 100 / 77) */
  var ALTURA_MIN = 240, ALTURA_MAX = 320;
  var RAIO_EXTERNO = 0.85;      /* o anel de fora é o nível mais alto */
  var MARGEM_TOPO = 22, MARGEM_BASE = 40, FOLGA_ROTULO = 8, ENCOSTO = 10;
  var COS = [0, 0, 0, 0, 0], SIN = [-1, 0, 0, 0, 0];   /* volume no topo, sentido horário; o topo é exato (sem 6e-17) */
  (function () { for (var i = 1; i < 5; i++) { var a = (-90 + 72 * i) * Math.PI / 180; COS[i] = Math.cos(a); SIN[i] = Math.sin(a); } })();
  var COS_LADO = COS[1], COS_BAIXO = COS[2], SEN_LADO = SIN[1], SEN_BAIXO = SIN[2];

  function proprio(obj, chave) { return Object.prototype.hasOwnProperty.call(obj, chave); }
  function nivelSeguro(n) { return typeof n === 'string' && proprio(NIVEL_RAIO, n) ? n : 'nao_falou'; }
  function limitar(n, a, b) { return n < a ? a : n > b ? b : n; }
  function larguraUtil(l) { var n = +l; return n > 0 && n < Infinity ? n : LARGURA_PADRAO; }

  /* ---------- escala ---------- */
  function raioDoNivel(nivel) { return NIVEL_RAIO[nivelSeguro(nivel)]; }

  function itemDoEixo(leitura, eixo) {
    var lista = leitura && leitura.eixos, i;
    if (!lista || typeof lista.length !== 'number') return null;
    for (i = 0; i < lista.length; i++) if (lista[i] && lista[i].eixo === eixo) return lista[i];
    return null;
  }
  /* os 5 raios na ordem canônica, venha a leitura na ordem que vier */
  function fatoresDaLeitura(leitura) {
    var f = [], i, item;
    for (i = 0; i < EIXOS.length; i++) { item = itemDoEixo(leitura, EIXOS[i]); f.push(raioDoNivel(item && item.nivel)); }
    return f;
  }

  /* ---------- geometria (px) ---------- */
  function alturaRadar(largura) { return Math.round(limitar(larguraUtil(largura) * ALTURA_POR_100 / 100, ALTURA_MIN, ALTURA_MAX)); }

  function geometria(largura) {
    var l = larguraUtil(largura), h = alturaRadar(l), cx = l / 2, lado = limitar(Math.round(l * 0.22), 68, 92);
    var raioH = (cx - lado - FOLGA_ROTULO) / COS_LADO;
    var raioV = (h - MARGEM_TOPO - MARGEM_BASE) / (1 + SEN_BAIXO);   /* do topo ao fundo do pentágono: 1 + 0,809 raios */
    var raio = Math.floor(Math.min(raioH, raioV));
    var miolo = MARGEM_TOPO + (1 + SEN_BAIXO) * raio + MARGEM_BASE;
    var cy = Math.round((h - miolo) / 2 + MARGEM_TOPO + raio);
    var xl = COS_LADO * raio, xb = COS_BAIXO * raio, yb = SEN_BAIXO * raio;
    var rotulos = [
      { ancora: 'cima', x: cx, y: cy - raio - FOLGA_ROTULO, max: Math.min(160, l - 4) },
      { ancora: 'direita', x: cx + xl + FOLGA_ROTULO, y: cy + SEN_LADO * raio, max: 0 },
      { ancora: 'baixo-dir', x: cx + xb - ENCOSTO, y: cy + yb + FOLGA_ROTULO, max: 0 },
      { ancora: 'baixo-esq', x: cx - xb + ENCOSTO, y: cy + yb + FOLGA_ROTULO, max: 0 },
      { ancora: 'esquerda', x: cx - xl - FOLGA_ROTULO, y: cy + SEN_LADO * raio, max: 0 }
    ];
    rotulos[1].max = Math.floor(Math.min(120, l - rotulos[1].x - 2));
    rotulos[4].max = Math.floor(Math.min(120, rotulos[4].x - 2));
    /* os de baixo crescem para fora (um para a direita, o outro para a esquerda): nunca se encontram, e há espaço até a borda */
    rotulos[2].max = Math.floor(Math.min(140, l - rotulos[2].x - 2));
    rotulos[3].max = Math.floor(Math.min(140, rotulos[3].x - 2));
    return {
      largura: l, altura: h, cx: cx, cy: cy, raio: raio,
      aneis: [0.15, 0.5, RAIO_EXTERNO].map(function (f) { return raio * f / RAIO_EXTERNO; }),
      rotulos: rotulos.map(function (r) { return { ancora: r.ancora, x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, max: r.max }; })
    };
  }

  /* o vértice i (0 = topo) no raio `fator` (0,15 / 0,5 / 0,85 da escala dos níveis) */
  function vertice(g, i, fator) {
    var r = g.raio * fator / RAIO_EXTERNO;
    return { x: g.cx + r * COS[i], y: g.cy + r * SIN[i] };
  }
  function decimo(n) { return Math.round(n * 10) / 10; }
  function pontos(g, fatores) {
    var p = [], i, v;
    for (i = 0; i < 5; i++) { v = vertice(g, i, fatores[i]); p.push(decimo(v.x) + ',' + decimo(v.y)); }
    return p.join(' ');
  }

  /* ---------- tempo ---------- */
  function suave(t) { var k = 1 - limitar(+t || 0, 0, 1); return 1 - k * k * k; }
  function interpolar(de, para, t) {
    var k = +t || 0, r = [], i;
    if (k <= 0) return de.slice();
    if (k >= 1) return para.slice();
    for (i = 0; i < para.length; i++) r.push(de[i] + (para[i] - de[i]) * k);
    return r;
  }
  function igual(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return a.length === b.length; }
  function agora() { return raiz && raiz.performance && raiz.performance.now ? raiz.performance.now() : +new Date(); }

  /* ---------- a leitura passa pela forma antes de tudo; sem o módulo de forma, nada é desenhado ---------- */
  function validar(bruto) {
    var F = raiz && raiz.BZPlantaForma, r;
    if (!F || typeof F.validarFormaLeitura !== 'function') return null;
    try { r = F.validarFormaLeitura(bruto); } catch (e) { return null; }
    return r && r.ok && r.leitura ? r.leitura : null;
  }
  /* movimento só com o laço único do site e sem "menos movimento" */
  function comMovimento() { var B = raiz && raiz.BEYON; return !!(B && typeof B.add === 'function' && !B.reduced); }

  /* ---------- DOM (só createElement/NS, atributos e textContent) ---------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var instancias = [], contador = 0;

  function el(doc, tag, classe, texto) {
    var n = doc.createElement(tag);
    if (classe) n.setAttribute('class', classe);
    if (texto) n.textContent = texto;
    return n;
  }
  function elSvg(doc, tag, classe) { var n = doc.createElementNS(SVG_NS, tag); n.setAttribute('class', classe); return n; }
  function larguraDe(no) { var w = no.clientWidth; return w > 0 ? w : LARGURA_PADRAO; }

  /* posiciona o que depende da largura: SVG, anéis, raios, rótulos, polígono */
  function desenhar(inst, largura) {
    var g = inst.geo = geometria(largura), svg = inst.svg, i, v;
    inst.largura = largura;
    svg.setAttribute('width', String(g.largura)); svg.setAttribute('height', String(g.altura));
    svg.setAttribute('viewBox', '0 0 ' + g.largura + ' ' + g.altura);
    for (i = 0; i < 3; i++) { v = [NIVEL_RAIO.nao_falou, NIVEL_RAIO.comentou, NIVEL_RAIO.deixou_claro][i]; inst.aneis[i].setAttribute('points', pontos(g, [v, v, v, v, v])); }
    for (i = 0; i < 5; i++) {
      v = vertice(g, i, RAIO_EXTERNO);
      inst.raios[i].setAttribute('x1', String(g.cx)); inst.raios[i].setAttribute('y1', String(g.cy));
      inst.raios[i].setAttribute('x2', String(decimo(v.x))); inst.raios[i].setAttribute('y2', String(decimo(v.y)));
      inst.rotulos[i].setAttribute('class', 'plr-rot plr-rot--' + g.rotulos[i].ancora);
      inst.rotulos[i].style.left = g.rotulos[i].x + 'px'; inst.rotulos[i].style.top = g.rotulos[i].y + 'px';
      inst.rotulos[i].style.maxWidth = g.rotulos[i].max + 'px';
    }
    pintar(inst);
  }
  function pintar(inst) {
    var i, v;
    inst.poli.setAttribute('points', pontos(inst.geo, inst.atual));
    for (i = 0; i < 5; i++) { v = vertice(inst.geo, i, inst.atual[i]); inst.pontos[i].setAttribute('cx', String(decimo(v.x))); inst.pontos[i].setAttribute('cy', String(decimo(v.y))); }
  }

  function construir(alvo, doc) {
    var inst = { alvo: alvo, doc: doc, aneis: [], raios: [], pontos: [], rotulos: [], linhas: [], atual: fatoresDaLeitura(null), meta: fatoresDaLeitura(null), anim: null, noLaco: false };
    var idTitulo = 'plr-t' + (++contador), grupo = el(doc, 'div', 'plr'), quadro = el(doc, 'div', 'plr-quadro'), rots = el(doc, 'div', 'plr-rots');
    var svg = doc.createElementNS(SVG_NS, 'svg'), lista = el(doc, 'dl', 'plr-lista'), i, linha, dt;
    var titulo = el(doc, 'p', 'plr-titulo', TITULO);
    titulo.setAttribute('id', idTitulo);
    grupo.setAttribute('role', 'group'); grupo.setAttribute('aria-labelledby', idTitulo);
    svg.setAttribute('class', 'plr-svg'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    for (i = 0; i < 3; i++) { inst.aneis.push(elSvg(doc, 'polygon', 'plr-anel')); svg.appendChild(inst.aneis[i]); }
    for (i = 0; i < 5; i++) { inst.raios.push(elSvg(doc, 'line', 'plr-raio')); svg.appendChild(inst.raios[i]); }
    inst.poli = elSvg(doc, 'polygon', 'plr-leitura'); svg.appendChild(inst.poli);
    for (i = 0; i < 5; i++) { inst.pontos.push(elSvg(doc, 'circle', 'plr-ponto')); inst.pontos[i].setAttribute('r', '2.5'); svg.appendChild(inst.pontos[i]); }
    for (i = 0; i < 5; i++) {
      inst.rotulos.push(el(doc, 'span', 'plr-rot', ROTULOS[EIXOS[i]])); inst.rotulos[i].setAttribute('aria-hidden', 'true'); rots.appendChild(inst.rotulos[i]);
      linha = { no: el(doc, 'div', 'plr-linha'), nivel: el(doc, 'dd', 'plr-nivel plr-nivel--nao_falou', PALAVRAS_NIVEL.nao_falou), evidencia: null, textoNivel: 'nao_falou', textoEvid: '' };
      dt = el(doc, 'dt', 'plr-eixo', ROTULOS[EIXOS[i]]);
      linha.no.appendChild(dt); linha.no.appendChild(linha.nivel); lista.appendChild(linha.no); inst.linhas.push(linha);
    }
    quadro.appendChild(svg); quadro.appendChild(rots);
    grupo.appendChild(titulo); grupo.appendChild(quadro); grupo.appendChild(lista); grupo.appendChild(el(doc, 'p', 'plr-legenda', LEGENDA));
    alvo.appendChild(grupo);
    inst.svg = svg; inst.quadro = quadro; inst.grupo = grupo;
    desenhar(inst, larguraDe(quadro));
    if (raiz && typeof raiz.ResizeObserver === 'function') {
      inst.obs = new raiz.ResizeObserver(function () { var w = larguraDe(quadro); if (w !== inst.largura) desenhar(inst, w); });
      inst.obs.observe(quadro);
    }
    return inst;
  }

  /* troca o texto das 5 linhas (nível por extenso e a evidência, só por textContent); devolve as linhas que mudaram */
  function escreverLinhas(inst, leitura) {
    var mudou = [], i, item, nivel, evid, l;
    for (i = 0; i < 5; i++) {
      item = itemDoEixo(leitura, EIXOS[i]); nivel = nivelSeguro(item && item.nivel); l = inst.linhas[i];
      /* a evidência do eixo "não falou" não é desenhada, venha o que vier */
      evid = nivel !== 'nao_falou' && item && typeof item.evidencia === 'string' ? item.evidencia : '';
      if (nivel === l.textoNivel && evid === l.textoEvid) continue;
      l.textoNivel = nivel; l.nivel.textContent = PALAVRAS_NIVEL[nivel]; l.nivel.setAttribute('class', 'plr-nivel plr-nivel--' + nivel);
      if (evid !== l.textoEvid) {
        if (l.evidencia) { l.no.removeChild(l.evidencia); l.evidencia = null; }
        if (evid) { l.evidencia = el(inst.doc, 'dd', 'plr-evidencia'); l.evidencia.appendChild(inst.doc.createTextNode('“' + evid + '”')); l.no.appendChild(l.evidencia); }
        l.textoEvid = evid;
      }
      mudou.push(l.no);
    }
    return mudou;
  }

  function sairDoLaco(inst) {
    if (inst.noLaco && raiz && raiz.BEYON && typeof raiz.BEYON.remove === 'function') raiz.BEYON.remove(inst.nome);
    inst.noLaco = false; inst.anim = null;
  }
  function passo(inst, S) {
    var a = inst.anim, t;
    if (!a) { sairDoLaco(inst); return; }
    t = (S.now - a.inicio) / DURACAO_MS;
    if (t >= 1) { inst.atual = a.para.slice(); sairDoLaco(inst); } else inst.atual = interpolar(a.de, a.para, suave(t));
    pintar(inst);
  }

  function aplicar(inst, leitura, ehMontagem) {
    var meta = fatoresDaLeitura(leitura), mudou = escreverLinhas(inst, leitura), i;
    if (igual(meta, inst.meta) && !mudou.length) return true;
    inst.meta = meta;
    if (!comMovimento()) { sairDoLaco(inst); inst.atual = meta.slice(); pintar(inst); return true; }
    if (igual(meta, inst.atual)) sairDoLaco(inst);   /* voltou para onde o polígono já está: cancela o que estava indo para outro lado */
    else {
      inst.anim = { inicio: agora(), de: inst.atual.slice(), para: meta };
      if (!inst.noLaco) { inst.noLaco = true; raiz.BEYON.add(inst.nome, function (S) { passo(inst, S); }); if (typeof raiz.BEYON.iniciar === 'function') raiz.BEYON.iniciar(); }
    }
    /* a linha que mudou pisca (opacity, Web Animations API); na montagem o polígono que cresce já chama a atenção */
    if (!ehMontagem) for (i = 0; i < mudou.length; i++) {
      if (typeof mudou[i].animate === 'function') mudou[i].animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: DURACAO_MS, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
    return true;
  }

  /* ---------- API ---------- */
  function achar(x) {
    var i;
    for (i = 0; i < instancias.length; i++) if (instancias[i].alvo === x || instancias[i].publica === x) return instancias[i];
    return null;
  }
  function desmontar(inst) {
    var i;
    sairDoLaco(inst);
    if (inst.obs) inst.obs.disconnect();
    while (inst.alvo.firstChild) inst.alvo.removeChild(inst.alvo.firstChild);
    i = instancias.indexOf(inst); if (i >= 0) instancias.splice(i, 1);
  }
  function atualizar(x, bruto) {
    var inst = achar(x), leitura;
    if (!inst) return false;
    leitura = validar(bruto);
    if (!leitura) return false;
    return aplicar(inst, leitura, false);
  }
  function montar(alvo, bruto) {
    var doc, inst, velho;
    if (!alvo || typeof alvo.appendChild !== 'function') return null;
    doc = alvo.ownerDocument || (raiz && raiz.document);
    if (!doc) return null;
    velho = achar(alvo); if (velho) desmontar(velho);
    while (alvo.firstChild) alvo.removeChild(alvo.firstChild);
    inst = construir(alvo, doc);
    inst.nome = 'plr-' + contador;
    inst.publica = { alvo: alvo, atualizar: function (l) { return atualizar(inst.publica, l); }, desmontar: function () { desmontar(inst); } };
    instancias.push(inst);
    if (bruto !== undefined && bruto !== null) { var leitura = validar(bruto); if (leitura) aplicar(inst, leitura, true); }
    return inst.publica;
  }

  return Object.freeze({
    montar: montar, atualizar: atualizar, alturaRadar: alturaRadar,
    geometria: geometria, vertice: vertice, pontos: pontos, raioDoNivel: raioDoNivel, fatoresDaLeitura: fatoresDaLeitura, interpolar: interpolar, suave: suave,
    EIXOS: EIXOS, ROTULOS: ROTULOS, NIVEL_RAIO: NIVEL_RAIO, PALAVRAS_NIVEL: PALAVRAS_NIVEL, DURACAO_MS: DURACAO_MS, RAZAO_ALTURA: ALTURA_POR_100 / 100
  });
});
