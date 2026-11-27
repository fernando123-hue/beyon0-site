/* A ORAÇÃO E A NEGAÇÃO (Mapa vivo v2, Fase 2; a mesma regra de js/mapa-saber.js e js/orcamento-coerencia.js, revisões dos PRs 4, 5a e #289):
   uma palavra do texto livre vale se alguma ocorrência não estiver negada na MESMA oração. Vírgula, ponto, "mas", "só" e "porém" fecham a
   oração; "não", "nunca", "nem", "sem" e "nada de" até 3 palavras antes negam, e "não"/"nunca" até 2 palavras depois também ("e"/"ou" no meio
   abrem outra oração). PURO (sem DOM), ES5: window.BZOracao na tela, CommonJS no Node. Nunca lança. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOracao = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var TEXTO_MAX = 2000;
  var NEGACAO = /\b(?:nao|nunca|nem|sem|nada de)(?: \w+){0,3}$/;
  var NEGACAO_DEPOIS = /^ *(?:(?!(?:e|ou) )\w+ +){0,2}(?:nao|nunca)\b/;
  var FIM_DA_ORACAO = /[,;.!?\n]|\b(?:mas|so|porem)\b/;

  /* a negação olha no máximo 4 palavras antes e 3 depois: janelas fixas dão o mesmo resultado que a oração inteira (salvo 4 palavras com mais de
     JANELA_ANTES caracteres) e deixam o custo linear no tamanho do texto (revisão de segurança do PR 1 da Fase 2) */
  var JANELA_ANTES = 200, JANELA_DEPOIS = 100;

  /* minúsculas, sem acento, no máximo TEXTO_MAX caracteres DEPOIS de normalizar (o NFD pode crescer o texto); o que não é texto vira '' */
  function semAcento(t) {
    return typeof t === 'string' ? t.slice(0, 2 * TEXTO_MAX).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, TEXTO_MAX) : '';
  }
  /* a 1ª ocorrência de re (flag g) que não está negada na sua oração, ou null. texto: já passado por semAcento. recusa (opcional, RegExp sem
     flag g): a ocorrência cuja oração, ANTES dela, casa a recusa também é pulada ("já tive 10 funcionários", "quero contratar 5") */
  function achaSemNegar(texto, re, recusa) {
    if (typeof texto !== 'string' || !(re instanceof RegExp) || !re.global) return null;
    var m, achou = null;
    re.lastIndex = 0;
    while ((m = re.exec(texto))) {
      var fim = m.index + m[0].length;
      var antes = texto.slice(Math.max(0, m.index - JANELA_ANTES), m.index).split(FIM_DA_ORACAO).pop().trim();
      var depois = texto.slice(fim, fim + JANELA_DEPOIS).split(FIM_DA_ORACAO)[0];
      var recusada = recusa instanceof RegExp && !recusa.global && recusa.test(antes);
      if (!recusada && !NEGACAO.test(antes) && !NEGACAO_DEPOIS.test(depois)) { achou = m; break; }
      if (m[0] === '') re.lastIndex++;
    }
    re.lastIndex = 0;
    return achou;
  }

  return Object.freeze({ TEXTO_MAX: TEXTO_MAX, semAcento: semAcento, achaSemNegar: achaSemNegar });
});
