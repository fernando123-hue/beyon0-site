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

  /* minúsculas, sem acento, no máximo TEXTO_MAX caracteres; o que não é texto vira '' */
  function semAcento(t) {
    return typeof t === 'string' ? t.slice(0, TEXTO_MAX).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
  }
  /* a 1ª ocorrência de re (flag g) que não está negada na sua oração, ou null. texto: já passado por semAcento */
  function achaSemNegar(texto, re) {
    if (typeof texto !== 'string' || !(re instanceof RegExp) || !re.global) return null;
    var m, achou = null;
    re.lastIndex = 0;
    while ((m = re.exec(texto))) {
      var antes = texto.slice(0, m.index).split(FIM_DA_ORACAO).pop().trim();
      var depois = texto.slice(m.index + m[0].length).split(FIM_DA_ORACAO)[0];
      if (!NEGACAO.test(antes) && !NEGACAO_DEPOIS.test(depois)) { achou = m; break; }
      if (m[0] === '') re.lastIndex++;
    }
    re.lastIndex = 0;
    return achou;
  }

  return Object.freeze({ TEXTO_MAX: TEXTO_MAX, semAcento: semAcento, achaSemNegar: achaSemNegar });
});
