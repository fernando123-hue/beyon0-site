/* MAPA VIVO v2, fase 0 (laboratório, fora do deploy): a LEITURA do que a pessoa digita, só no aparelho, sem rede e sem IA
   (especificação no cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, fase 1a). PURO (sem DOM), ES5: window.BZMapaVivoLer na tela,
   CommonJS no Node. É o rascunho do módulo real (js/orcamento-reacao.js) que entra na fase 1a se o dono aprovar os quadros.
   Os canais vêm do mesmo leitor do servidor e do esboço (js/mapa-saber.js: palavra inteira, negação na mesma oração); os pedidos (agenda,
   sinal, orçamento, venda) de uma tabela curta daqui, com a mesma regra de negação. Lê no máximo LER_MAX caracteres. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica(raiz && raiz.BZMapaSaber ? raiz.BZMapaSaber : (typeof require === 'function' ? require('../js/mapa-saber.js') : null));
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZMapaVivoLer = api;
})(typeof window !== 'undefined' ? window : null, function (Saber) {
  'use strict';
  var LER_MAX = 600;
  /* o canal -> a peça (js/planta-pecas.js) e o nome curto que aparece ao lado dela */
  var PECA_DO_CANAL = Object.freeze({
    instagram: 'chegada', whatsapp: 'mensagem', google_busca: 'pagina', google_mapa: 'mapa', indicacao: 'conversa', passa_na_frente: 'vitrine'
  });
  /* os pedidos que o texto livre já deixa ver: [código, peça, nome curto, palavras (minúsculas, sem acento)] */
  var PEDIDOS = [
    ['agenda', 'agenda', 'agenda', /\b(?:agend\w*|horarios?|marcar|marca[mr]?|consultas?)\b/g],
    ['sinal', 'sinal', 'sinal', /\b(?:sinal|adiantad\w*)\b/g],
    ['orcamento', 'tabela', 'orçamento', /\b(?:orcamentos?|cotac\w*)\b/g],
    ['venda', 'carrinho', 'venda online', /\b(?:vender online|loja virtual|vendas? pela internet|carrinho)\b/g]
  ];
  var NEGACAO = /\b(?:nao|nunca|nem|sem|nada de)(?: \w+){0,3}$/;
  var FIM_DA_ORACAO = /[,;.!?\n]|\b(?:mas|so|porem)\b/;
  var semAcento = function (t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };

  /* a palavra conta se alguma ocorrência não estiver negada na mesma oração (as 3 palavras antes dela, sem atravessar vírgula ou ponto) */
  function apareceSemNegar(texto, re) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(texto))) {
      var partes = texto.slice(0, m.index).split(FIM_DA_ORACAO), oracao = partes[partes.length - 1].trim();
      if (!NEGACAO.test(oracao)) return true;
    }
    return false;
  }

  /* ler(texto) -> { pecas: [{ codigo, peca, nome }] } na ordem: canais (até 3) e depois pedidos. Nunca lança */
  function ler(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return { pecas: [] };
    var t = texto.slice(0, LER_MAX), limpo = semAcento(t), pecas = [];
    var canais = Saber && typeof Saber.origensDoCaso === 'function' ? Saber.origensDoCaso(t) : [];
    canais.forEach(function (c) { if (PECA_DO_CANAL[c]) pecas.push({ codigo: c, peca: PECA_DO_CANAL[c], nome: Saber.CURTO[c] || c }); });
    PEDIDOS.forEach(function (p) { if (apareceSemNegar(limpo, p[3])) pecas.push({ codigo: p[0], peca: p[1], nome: p[2] }); });
    return { pecas: pecas };
  }

  return Object.freeze({ LER_MAX: LER_MAX, PECA_DO_CANAL: PECA_DO_CANAL, ler: ler });
});
