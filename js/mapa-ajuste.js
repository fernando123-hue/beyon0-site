/* O AJUSTE DO MAPA NO APARELHO (Mapa vivo v2, Fase 3, PR 1; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 3";
   plano docs/superpowers/plans/2026-11-28-mapa-vivo-fase3-pr1-ajuste.md). Quando ela pede "quero também um formulário" ou "tira o
   agendamento", o mapa na tela ganha (ou perde) o nó em esboço antes do Zero responder. Aqui moram só as partes PURAS:
     - PECAS: a tabela fixa da Beyon (opção A da spec, seção 5, item 5): título, frase e rótulo de cada peça, só das que a Beyon vende
       (FUNCIONALIDADES de api/_vendas/briefing.mjs, sem área restrita, loja, IA, automação, integração, idioma nem depoimentos);
     - rotear(texto): as palavras dela viram { acao: 'entra' | 'sai', peca } só quando há UMA peça e nada ambíguo; senão null;
     - aplicarAjuste(plano, ajuste): um plano NOVO (o de entrada não muda), revalidado pela forma (js/orcamento-mapa-forma.js). Se não
       couber (6 nós, 5 camadas, 2 ajustados, estrutura), não há rascunho: o Zero decide no turno, como hoje.
   O rascunho é cosmético e local: nunca vai ao servidor como plano. PURO, ES5: window.BZMapaAjuste na tela (depois de js/oracao.js e
   js/orcamento-mapa-forma.js), CommonJS no Node. Nunca lança. */
(function (raiz, fabrica) {
  'use strict';
  var cjs = typeof module === 'object' && module && module.exports;
  var api = fabrica(cjs ? require('./oracao.js') : raiz && raiz.BZOracao, cjs ? require('./orcamento-mapa-forma.js') : raiz && raiz.BZMapaForma);
  if (cjs) module.exports = api;
  if (raiz) raiz.BZMapaAjuste = api;
})(typeof window !== 'undefined' ? window : null, function (O, F) {
  'use strict';

  var tabela = function (o) { var t = Object.create(null), k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = Object.freeze(o[k]); return Object.freeze(t); };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  var falha = function (motivo) { return { ok: false, motivo: motivo }; };

  /* id do nó novo (aj_ + curto, até 12 caracteres, a regra da forma); icone: o desenho do nó novo; icones: os que contam como esta peça
     num mapa que já existe (para "já tem" e para "sai"); a frase é da Beyon, na voz das BASES de api/_vendas/mapa-padrao.mjs */
  var PECAS = tabela({
    whatsapp: { id: 'aj_conversa', icone: 'conversa', icones: ['conversa', 'mensagem'], titulo: 'Conversa direto do site', frase: 'Um toque no site abre a conversa já com o assunto', rotulo: 'chama para conversar' },
    formulario: { id: 'aj_form', icone: 'formulario', icones: ['formulario', 'briefing'], titulo: 'Formulário de pedido', frase: 'Os dados chegam organizados, sem ida e volta', rotulo: 'preenche' },
    agendamento: { id: 'aj_agenda', icone: 'agenda', icones: ['agenda'], titulo: 'Agenda no site', frase: 'Vê os horários livres e marca ali mesmo', rotulo: 'marca o horário' },
    mapa: { id: 'aj_mapa', icone: 'mapa', icones: ['mapa'], titulo: 'Como chegar', frase: 'O endereço com o mapa, para achar sem perguntar', rotulo: 'acha o endereço' },
    catalogo: { id: 'aj_catalogo', icone: 'catalogo', icones: ['catalogo', 'cardapio'], titulo: 'Catálogo no site', frase: 'Cada item com foto e descrição, fácil de escolher', rotulo: 'escolhe' },
    galeria: { id: 'aj_galeria', icone: 'galeria', icones: ['galeria'], titulo: 'Galeria de trabalhos', frase: 'As fotos do que já foi feito, antes de decidir', rotulo: 'vê os trabalhos' },
    blog: { id: 'aj_blog', icone: 'documento', icones: ['documento'], titulo: 'Artigos no site', frase: 'Textos que respondem as dúvidas mais comuns', rotulo: 'lê e entende' }
  });
  var ACOES = ['entra', 'sai'];
  /* só estes papéis podem sair: o site, o hoje, a trava e a origem são o caso dela, não uma peça */
  var PODEM_SAIR = ['acao', 'conversa', 'volta', 'ajustado'];
  var OBJETIVO = 'objetivo';

  /* ---------- o roteador por palavras (texto já pode vir cru: passa por O.semAcento) ---------- */
  var PALAVRAS = tabela({
    whatsapp: '(?:whats\\w*|zap\\w*|wpp)',
    formulario: 'formularios?',
    agendamento: '(?:agend\\w*|marcar horarios?)',
    mapa: '(?:mapa|como chegar|localizacao)',
    catalogo: 'catalogos?',
    galeria: '(?:galeria|portfolio)',
    blog: '(?:blog|artigos?)'
  });
  var SAI_ANTES = '\\b(?:tir\\w*|remov\\w*|sem|nao (?:quero|preciso|precisa)(?: de)?)\\s+(?:(?:o|a|os|as|de|do|da|mais|um|uma)\\s+){0,2}';
  var RE_ACHA = {}, RE_SAI = {};
  Object.keys(PALAVRAS).forEach(function (k) {
    RE_ACHA[k] = new RegExp('\\b' + PALAVRAS[k] + '\\b', 'g');
    RE_SAI[k] = new RegExp(SAI_ANTES + PALAVRAS[k] + '\\b');
  });
  function rotear(bruto) {
    if (!O || typeof bruto !== 'string') return null;
    var texto = O.semAcento(bruto), sai = [], entra = [];
    Object.keys(PALAVRAS).forEach(function (k) {
      if (RE_SAI[k].test(texto)) sai.push(k);
      else if (O.achaSemNegar(texto, RE_ACHA[k])) entra.push(k);
    });
    if (sai.length + entra.length !== 1) return null;
    return sai.length ? { acao: 'sai', peca: sai[0] } : { acao: 'entra', peca: entra[0] };
  }

  /* ---------- aplicarAjuste ---------- */
  var copiar = function (p) { return JSON.parse(JSON.stringify(p)); };
  function valido(plano) { var v = F.validarFormaMapa(plano); return v.ok ? v.plano : null; }
  function daPeca(peca, n) { return n.icone && peca.icones.indexOf(n.icone) >= 0; }

  /* entra: o nó novo corta UMA seta (de -> novo -> para), tentando primeiro as que chegam ao objetivo; a 1ª que a forma aceita vale */
  function entrar(plano, peca) {
    if (plano.nos.some(function (n) { return daPeca(peca, n); })) return falha('ja_tem');
    if (plano.nos.some(function (n) { return n.id === peca.id; })) return falha('ja_tem');
    var ordem = plano.setas.map(function (s, i) { return i; }).filter(function (i) { return plano.setas[i].de !== OBJETIVO; });
    ordem.sort(function (a, b) { return (plano.setas[b].para === OBJETIVO) - (plano.setas[a].para === OBJETIVO) || a - b; });
    for (var k = 0; k < ordem.length; k++) {
      var novo = copiar(plano), s = novo.setas[ordem[k]];
      novo.nos.push({ id: peca.id, papel: 'ajustado', icone: peca.icone, titulo: peca.titulo, frase: peca.frase });
      novo.setas.splice(ordem[k], 1, { de: s.de, para: peca.id, rotulo: peca.rotulo }, { de: peca.id, para: s.para, rotulo: s.rotulo });
      var v = valido(novo);
      if (v) return { ok: true, plano: v, mudou: [peca.id] };
    }
    return falha('nao_cabe');
  }

  /* sai: tira o 1º nó da peça (só papéis que podem sair) e liga cada um que chegava nele a cada um aonde ele ia, com o rótulo da saída */
  function sair(plano, peca) {
    var alvo = null;
    plano.nos.forEach(function (n) { if (!alvo && daPeca(peca, n) && PODEM_SAIR.indexOf(n.papel) >= 0) alvo = n.id; });
    if (!alvo) return falha('nao_tem');
    var novo = copiar(plano), chegam = [], vao = [], setas = [], visto = {};
    novo.setas.forEach(function (s) { if (s.para === alvo) chegam.push(s); else if (s.de === alvo) vao.push(s); else setas.push(s); });
    setas.forEach(function (s) { visto[s.de + '>' + s.para] = 1; });
    chegam.forEach(function (c) {
      vao.forEach(function (v) {
        if (c.de === v.para || visto[c.de + '>' + v.para]) return;
        visto[c.de + '>' + v.para] = 1;
        setas.push({ de: c.de, para: v.para, rotulo: v.rotulo });
      });
    });
    novo.nos = novo.nos.filter(function (n) { return n.id !== alvo; });
    novo.setas = setas;
    var ok = valido(novo);
    return ok ? { ok: true, plano: ok, mudou: [alvo] } : falha('nao_cabe');
  }

  function aplicarAjuste(plano, ajuste) {
    try {
      if (!F || !ajuste || typeof ajuste !== 'object' || ACOES.indexOf(ajuste.acao) < 0 || !tem(PECAS, ajuste.peca)) return falha('invalido');
      var base = valido(plano);
      if (!base) return falha('invalido');
      return ajuste.acao === 'entra' ? entrar(base, PECAS[ajuste.peca]) : sair(base, PECAS[ajuste.peca]);
    } catch (e) { return falha('invalido'); }
  }

  return Object.freeze({ PECAS: PECAS, rotear: rotear, aplicarAjuste: aplicarAjuste });
});
