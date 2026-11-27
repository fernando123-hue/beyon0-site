/* QUEM PREENCHE A CENA POR CÓDIGO, NO APARELHO (Mapa vivo v2, Fase 2; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 2").
   Do ramo tocado, das respostas (objetivos), das origens já lidas (BZMapaSaber.origensDoCaso) e do que ela escreveu: o lugar, quantas pessoas
   (só quando ela DIZ), o que vende e um destaque. 0 ms, sem rede, determinístico (a mesma entrada, a mesma cena). Na dúvida, nada: o lugar
   só sai de palavra que combina com o ramo; a equipe só vira número dita; nicho regulado nunca recebe depoimentos. Faturamento não é lido.
   Usa js/oracao.js (a oração e a negação) e js/orcamento-cena-forma.js (a forma). PURO, ES5: window.BZCenaDicionario na tela (os dois
   antes, na ordem), CommonJS no Node. Nunca lança; nenhum texto dela sai daqui, só códigos e números. */
(function (raiz, fabrica) {
  'use strict';
  var cjs = typeof module === 'object' && module && module.exports;
  var api = fabrica(cjs ? require('./oracao.js') : raiz && raiz.BZOracao, cjs ? require('./orcamento-cena-forma.js') : raiz && raiz.BZCenaForma);
  if (cjs) module.exports = api;
  if (raiz) raiz.BZCenaDicionario = api;
})(typeof window !== 'undefined' ? window : null, function (O, F) {
  'use strict';

  var tabela = function (o) { var t = Object.create(null), k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = o[k]; return Object.freeze(t); };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  var lista = function (v) { return Array.isArray(v) ? v : []; };

  var LUGAR_DO_RAMO = tabela({
    servicos: 'escritorio', saude: 'consultorio', beleza: 'salao', alimentacao: 'cozinha', comercio: 'loja', educacao: 'sala_aula', associacao: 'sede', outro: 'escritorio'
  });
  /* os lugares que uma palavra pode trocar, por ramo ("outro": qualquer um) */
  var COMBINAM = tabela({
    servicos: ['escritorio', 'oficina', 'obra', 'estudio'], saude: ['consultorio', 'estudio'], beleza: ['salao', 'estudio'], alimentacao: ['cozinha', 'loja'],
    comercio: ['loja', 'oficina'], educacao: ['sala_aula', 'estudio'], associacao: ['sede'], outro: F.LUGARES
  });
  /* palavra -> lugar (minúsculas, sem acento), na ordem de preferência */
  var LUGAR_POR_PALAVRA = [
    ['oficina', /\b(?:oficina|mecanic\w*|funilaria|borracharia|autoeletrica|auto eletrica)\b/g],
    ['obra', /\b(?:obras?|reformas?|construc\w*|pedreir\w*|marcenari\w*|marceneir\w*|eletricist\w*|encanador\w*)\b/g],
    ['estudio', /\b(?:estudio|academia|pilates|crossfit|yoga|fotograf\w*|tatuage\w*|tattoo)\b/g],
    ['salao', /\b(?:barbearia|barbeir\w*|salao|manicure|cabeleireir\w*)\b/g],
    ['consultorio', /\b(?:consultorio|clinica|odonto\w*|dentist\w*|psicolog\w*|fisioterap\w*|nutricionist\w*)\b/g],
    ['cozinha', /\b(?:padaria|confeitaria|restaurante|lanchonete|hamburgueria|pizzaria|marmit\w*|doceria|cozinha)\b/g],
    ['loja', /\b(?:loja|boutique|mercado|mercearia|papelaria|petshop|pet shop)\b/g],
    ['sala_aula', /\b(?:escola|cursos?|aulas?|professor\w*|reforco)\b/g],
    ['escritorio', /\b(?:escritorio|advocacia|advogad\w*|contabil\w*|consultoria|imobiliaria)\b/g]
  ];
  /* palavra -> o que vende; vale a que aparece primeiro no texto */
  var OFERTA_POR_PALAVRA = [
    ['cardapio', /\b(?:cardapio|menu|pratos?|lanches?|pizzas?|marmitas?)\b/g],
    ['encomenda', /\b(?:encomendas?|bolos?|doces)\b/g],
    ['entrega', /\b(?:delivery|entregas?|tele ?entrega)\b/g],
    ['reserva', /\b(?:reservas?|reservar)\b/g],
    ['agenda', /\b(?:agend\w*|horarios? marcados?|marcar horario)\b/g],
    ['orcamento', /\b(?:orcamentos?|cotac\w*|visita tecnica)\b/g],
    ['vitrine', /\b(?:vitrine|roupas?|colec\w*)\b/g],
    ['catalogo', /\b(?:catalogo|linha de produtos)\b/g],
    ['aulas', /\b(?:aulas?|turmas?|matricul\w*)\b/g],
    ['galeria', /\b(?:portfolio|trabalhos feitos|galeria)\b/g],
    ['loja_online', /\b(?:loja (?:online|virtual)|vender online|e-?commerce|pagamento online)\b/g],
    ['projeto', /\b(?:projetos?|sob medida)\b/g]
  ];
  var OFERTA_DO_OBJETIVO = tabela({ agendamentos: 'agenda', vender_online: 'loja_online' });
  var DEPOIMENTO = /\b(?:depoimentos?|avaliac\w*|o que (?:os )?clientes dizem)\b/g;

  /* ---------- equipe ---------- */
  var EXTENSO = tabela({
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30
  });
  var N = '(\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta)';
  var CERCA = '(?:uns |umas |cerca de |quase |mais de )?';
  var GENTE = '(?:funcionari[oa]s|colaborador(?:es|as)|profissionais|atendentes|dentistas|cabeleireir[oa]s|professor(?:es|as))';
  /* [regex, número fixo ou null = o grupo 1] */
  var EQUIPE = [
    [new RegExp('\\bsomos (?:em )?' + CERCA + N + '\\b', 'g'), null],
    [new RegExp('\\b(?:equipe|time) de ' + CERCA + N + '\\b', 'g'), null],
    [new RegExp('\\b' + CERCA + N + ' ' + GENTE + '\\b', 'g'), null],
    [new RegExp('\\b' + N + ' pessoas? (?:na|no) (?:equipe|time)\\b', 'g'), null],
    [new RegExp('\\btrabalham (?:aqui )?' + CERCA + N + ' pessoas\\b', 'g'), null],
    [/\b(?:so eu|sou so eu|sozinh[oa])\b/g, 1],
    [/\beu e (?:o |a )?(?:meu |minha )?(?:socio|socia|espos[oa]|marido|mulher|irma|irmao|filh[oa]|mae|pai|namorad[oa])\b/g, 2]
  ];
  var numero = function (s) { return /^\d+$/.test(s) ? parseInt(s, 10) : (tem(EXTENSO, s) ? EXTENSO[s] : 0); };

  /* equipeDoTexto(texto) -> 1..999 ou null: só o que ela DISSE; a ocorrência mais à esquerda vale */
  function equipeDoTexto(texto) {
    try {
      var t = O.semAcento(texto), melhor = null, i;
      if (!t) return null;
      for (i = 0; i < EQUIPE.length; i++) {
        var m = O.achaSemNegar(t, EQUIPE[i][0]);
        if (m && (!melhor || m.index < melhor.indice)) melhor = { indice: m.index, n: EQUIPE[i][1] === null ? numero(m[1]) : EQUIPE[i][1] };
      }
      return melhor && melhor.n >= 1 && melhor.n <= 999 ? melhor.n : null;
    } catch (x) { return null; }
  }

  /* ---------- lugar, oferta, destaque ---------- */
  function lugarDoCaso(ramo, texto) {
    try {
      if (!tem(LUGAR_DO_RAMO, ramo)) return null;
      var t = O.semAcento(texto), i;
      for (i = 0; t && i < LUGAR_POR_PALAVRA.length; i++) {
        var lugar = LUGAR_POR_PALAVRA[i][0];
        if (COMBINAM[ramo].indexOf(lugar) >= 0 && O.achaSemNegar(t, LUGAR_POR_PALAVRA[i][1])) return lugar;
      }
      return LUGAR_DO_RAMO[ramo];
    } catch (x) { return null; }
  }
  function ofertaDoCaso(texto, objetivos) {
    try {
      var t = O.semAcento(texto), melhor = null, i, obj = lista(objetivos);
      for (i = 0; t && i < OFERTA_POR_PALAVRA.length; i++) {
        var m = O.achaSemNegar(t, OFERTA_POR_PALAVRA[i][1]);
        if (m && (!melhor || m.index < melhor.indice)) melhor = { indice: m.index, oferta: OFERTA_POR_PALAVRA[i][0] };
      }
      if (melhor) return melhor.oferta;
      for (i = 0; i < obj.length; i++) if (tem(OFERTA_DO_OBJETIVO, obj[i])) return OFERTA_DO_OBJETIVO[obj[i]];
      return null;
    } catch (x) { return null; }
  }
  function destaqueDoCaso(texto, objetivos, regulado) {
    try {
      var obj = lista(objetivos);
      if (regulado !== true && O.achaSemNegar(O.semAcento(texto), DEPOIMENTO)) return 'depoimentos';
      if (obj.indexOf('achado_google') >= 0) return 'localizacao';
      if (obj.indexOf('apresentar') >= 0) return 'fotos';
      return null;
    } catch (x) { return null; }
  }

  /* cenaDoCaso({ ramo, texto, canais, objetivos, regulado }) -> a cena congelada (BZCenaForma.validar) ou null */
  function cenaDoCaso(caso) {
    try {
      if (!caso || typeof caso !== 'object' || Array.isArray(caso)) return null;
      var lugar = lugarDoCaso(caso.ramo, caso.texto);
      if (!lugar) return null;
      var equipe = equipeDoTexto(caso.texto), canais = [], c = lista(caso.canais), i;
      for (i = 0; i < c.length && canais.length < F.CANAIS_MAX; i++) if (F.CANAIS.indexOf(c[i]) >= 0 && canais.indexOf(c[i]) < 0) canais.push(c[i]);
      var r = F.validar({
        lugar: lugar, gente: equipe ? Math.min(equipe, F.GENTE_MAX) : 0, canais: canais,
        oferta: ofertaDoCaso(caso.texto, caso.objetivos), destaque: destaqueDoCaso(caso.texto, caso.objetivos, caso.regulado === true)
      });
      return r.ok ? r.cena : null;
    } catch (x) { return null; }
  }

  return Object.freeze({
    LUGAR_DO_RAMO: LUGAR_DO_RAMO, lugarDoCaso: lugarDoCaso, ofertaDoCaso: ofertaDoCaso, destaqueDoCaso: destaqueDoCaso, equipeDoTexto: equipeDoTexto, cenaDoCaso: cenaDoCaso
  });
});
