/* O QUE SE SABE DAS ORIGENS DO CASO (desenho do PR 5, docs/superpowers/specs/2026-11-14-mapa-desenho-design.md §3 e §6). Um módulo só para o servidor
   (o mapa padrão, api/_vendas/mapa-padrao.mjs) e para a tela (o esboço que cresce, js/planta-cresce.js): os dois leem o mesmo "como chegam" e dão as
   mesmas origens, por CÓDIGO (a lista fechada de js/orcamento-mapa-forma.js). O nome e o "pelo …" de cada código também moram aqui: a tela nunca
   mostra o código cru. PURO (sem DOM), ES5: window.BZMapaSaber na tela, CommonJS no Node.
   A regra (PR 4, revisões): o rótulo tocado vale como trecho exato; a palavra-chave do texto livre vale se alguma ocorrência não estiver negada na
   MESMA oração (vírgula, ponto, "mas", "só" e "porém" fecham a oração; "não", "nunca", "nem", "sem" e "nada de" até 3 palavras antes negam); o Google
   do texto com mapa e sem falar de busca é só o mapa, decidido ANTES do teto de 3. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZMapaSaber = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = function (o) { return Object.freeze(o); };
  /* tabela sem protótipo: "constructor" ou "__proto__" nunca casam por herança */
  var tabela = function (o) { var t = Object.create(null), k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = o[k]; return congelar(t); };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };

  var ORIGENS_MAX = 3;
  var TEXTO_MAX = 2000;
  /* o código do rótulo tocado (js/orcamento-rotulos.js, campo como_chegam) -> o código da origem */
  var ORIGEM_DA_SUGESTAO = tabela({ instagram: 'instagram', whatsapp: 'whatsapp', indicacao: 'indicacao', google: 'google_busca', passa_na_frente: 'passa_na_frente' });
  /* o nome que a tela escreve, e o "pelo …" da frase da chegada */
  var NOMES = tabela({
    instagram: 'Instagram', whatsapp: 'WhatsApp', google_busca: 'Busca no Google', google_mapa: 'Mapa do Google', indicacao: 'Indicação',
    passa_na_frente: 'Passa na frente', facebook: 'Facebook', tiktok: 'TikTok', site_atual: 'Site atual', outro: 'Outro canal'
  });
  var PELO = tabela({
    instagram: 'pelo Instagram', whatsapp: 'pelo WhatsApp', google_busca: 'pela busca no Google', google_mapa: 'pelo mapa do Google', indicacao: 'por indicação',
    passa_na_frente: 'passando na frente', facebook: 'pelo Facebook', tiktok: 'pelo TikTok', site_atual: 'pelo site de hoje', outro: 'por outro canal'
  });
  /* as palavras-chave do texto livre (minúsculas, sem acento), na ordem em que entram */
  var POR_PALAVRA = [
    ['instagram', /\b(?:instagram|insta|direct|reels?)\b/g],
    ['whatsapp', /\b(?:whatsapp|whats|zap|zapzap|wpp)\b/g],
    ['google_mapa', /\b(?:mapas?|maps|endereco)\b/g],
    ['google_busca', /\b(?:google|busca|buscando|pesquisa\w*)\b/g],
    ['indicacao', /\b(?:indica\w*|boca a boca)\b/g],
    ['passa_na_frente', /\bpass\w* na frente\b|\bfachada\b/g]
  ];
  var NEGACAO = /\b(?:nao|nunca|nem|sem|nada de)(?: \w+){0,3}$/;
  var FIM_DA_ORACAO = /[,;.!?\n]|\b(?:mas|so|porem)\b/;

  var semAcento = function (t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var unicos = function (l) { return l.filter(function (o, i) { return l.indexOf(o) === i; }); };

  /* origensDoCaso(comoChegam, sugestoes) -> [códigos], no máximo ORIGENS_MAX. sugestoes = BZOrcRotulos.SUGESTOES (opcional: sem ela, só o texto livre) */
  function origensDoCaso(comoChegam, sugestoes) {
    var chegam = typeof comoChegam === 'string' ? comoChegam.slice(0, TEXTO_MAX) : '';
    if (!chegam) return [];
    var tocadas = [], doTexto = [], cod, i;
    if (sugestoes && typeof sugestoes === 'object') {
      for (cod in sugestoes) {
        if (!tem(sugestoes, cod)) continue;
        var sug = sugestoes[cod];
        if (sug && sug.campo === 'como_chegam' && typeof sug.rotulo === 'string' && chegam.indexOf(sug.rotulo) >= 0 && tem(ORIGEM_DA_SUGESTAO, cod)) tocadas.push(ORIGEM_DA_SUGESTAO[cod]);
      }
    }
    var texto = semAcento(chegam);
    for (i = 0; i < POR_PALAVRA.length; i++) {
      var re = POR_PALAVRA[i][1], m;
      re.lastIndex = 0;
      while ((m = re.exec(texto))) {
        var oracao = texto.slice(0, m.index).split(FIM_DA_ORACAO).pop().trim();
        if (!NEGACAO.test(oracao)) { doTexto.push(POR_PALAVRA[i][0]); break; }
      }
    }
    var soMapa = doTexto.indexOf('google_mapa') >= 0 && /\bgoogle\b/.test(texto) && !/\bbusca\w*|pesquisa\w*/.test(texto);
    var todas = tocadas.concat(doTexto.filter(function (o) { return !(soMapa && o === 'google_busca' && tocadas.indexOf(o) < 0); }));
    return unicos(todas).slice(0, ORIGENS_MAX);
  }

  return congelar({ ORIGENS_MAX: ORIGENS_MAX, ORIGEM_DA_SUGESTAO: ORIGEM_DA_SUGESTAO, NOMES: NOMES, PELO: PELO, origensDoCaso: origensDoCaso });
});
