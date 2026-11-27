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

  /* na tela sem js/oracao.js ou js/orcamento-cena-forma.js antes: carrega sem lançar e nunca desenha (revisão técnica 10) */
  if (!O || !F) {
    var nada = function () { return null; };
    return Object.freeze({ LUGAR_DO_RAMO: Object.freeze(Object.create(null)), lugarDoCaso: nada, ofertaDoCaso: nada, destaqueDoCaso: nada, equipeDoTexto: nada, cenaDoCaso: nada });
  }

  var tabela = function (o) { var t = Object.create(null), k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = o[k]; return Object.freeze(t); };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  /* as listas recebidas (canais, objetivos) são cortadas antes de qualquer conta (revisão de segurança) */
  var LISTA_MAX = 20;
  var lista = function (v) { return Array.isArray(v) ? v.slice(0, LISTA_MAX) : []; };

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
    /* (revisão técnica 4) "reforma tributária/administrativa…" não é obra; "construção" só a civil */
    ['obra', /\b(?:obras?|reformas?(?! (?:tributari|administrativ|previdenciari|trabalhist|politic|fiscal)\w*)|construtora|construcao civil|construcoes|pedreir\w*|marcenari\w*|marceneir\w*|eletricist\w*|encanador\w*)\b/g],
    ['estudio', /\b(?:estudio|academia|pilates|crossfit|yoga|fotograf\w*|tatuage\w*|tattoo)\b/g],
    ['salao', /\b(?:barbearia|barbeir\w*|salao|manicure|cabeleireir\w*)\b/g],
    ['consultorio', /\b(?:consultorio|clinica|odonto\w*|dentist\w*|psicolog\w*|fisioterap\w*|nutricionist\w*)\b/g],
    ['cozinha', /\b(?:padaria|confeitaria|restaurante|lanchonete|hamburgueria|pizzaria|marmit\w*|doceria|cozinha)\b/g],
    /* (revisão técnica 5) "mercado" sozinho é quase sempre o de trabalho ("estou no mercado há 10 anos") */
    ['loja', /\b(?:loja|boutique|supermercado|minimercado|mercadinho|mercado de bairro|mercearia|papelaria|petshop|pet shop)\b/g],
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
    /* (revisão técnica 4) "meu projeto de abrir…" não é o que se vende */
    ['projeto', /\b(?:projetos? (?:de arquitetura|arquitetonic\w*|personalizad\w*|de interiores|de engenharia)|sob medida)\b/g]
  ];
  var OFERTA_DO_OBJETIVO = tabela({ agendamentos: 'agenda', vender_online: 'loja_online' });
  var DEPOIMENTO = /\b(?:depoimentos?|avaliac\w*|o que (?:os )?clientes dizem)\b/g;

  /* ---------- equipe ----------
     A conta é a quantidade que ela DISSE: "N funcionários" = N; "somos N" = N; "eu e minha sócia" = 2; "eu e mais N" = N + 1 (ela conta);
     "só eu"/"sozinha" = 1. Com mais de uma afirmação, vale a MAIOR ("sozinha, mas tenho 3 funcionários" = 3). Revisão técnica do PR 1: "somos
     uma clínica", "somos 5 anos no mercado" e "somos 10 mil clientes" não são gente; o número de "somos" vale com palavra de gente depois ou no
     fim da oração; "um/uma" só com "tenho/temos/com um funcionário" */
  var EXTENSO = tabela({
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30
  });
  var MAIS_DE_UM = '(\\d{1,3}|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta)';
  var QUALQUER = '(\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta)';
  var CERCA = '(?:uns |umas |cerca de |quase |mais de )?';
  var GENTE = '(?:funcionari[oa]s|colaborador(?:es|as)|profissionais|atendentes|dentistas|cabeleireir[oa]s|professor(?:es|as))';
  var GENTE_UM = '(?:funcionari[oa]|colaborador(?:a)?|profissional|atendente|dentista|cabeleireir[oa]|professor(?:a)?)';
  var PARENTE = '(?:o |a )?(?:meu |minha )?(?:socio|socia|espos[oa]|marido|mulher|irma|irmao|filh[oa]|mae|pai|namorad[oa])';
  /* depois do número de "somos": fim da oração, "e", palavra de gente ou "na/no" + o lugar de trabalho (nunca "anos", "mil", "clientes", nem
     lugar ou canal solto: "somos 3 em Curitiba", "somos 3 no Instagram", "somos 15 no mercado"; 2ª rodada da revisão técnica) */
  var GENTE_DEPOIS = '(?=$|[,;.!?\\n]| (?:e|aqui|ao todo|pessoas|socios|socias|irmaos|irmas|amigos|amigas|trabalhando|profissionais|funcionari\\w*|colaborador\\w*' +
    '|(?:na|no|nesta|neste) (?:equipe|time|total|loja|salao|empresa|escritorio|clinica|consultorio|cozinha|oficina|atendimento|estudio|obra|negocio))\\b)';
  /* passado e intenção COLADOS ao número (no máximo 2 palavras no meio) não contam: "já tive 10 funcionários", "quero contratar 5", "preciso
     de 3 atendentes". Só o verbo perto: o da oração inteira apagava o presente ("Quero um site e somos 4", "antes era sozinha e agora somos 4";
     3ª rodada da revisão técnica) */
  var NAO_E_HOJE = /\b(?:tive|tinha|tivemos|tinhamos|teve|era|eramos|eram|fomos|foram|havia|antes|antigamente|na epoca|cheguei a|chegamos a|sonho|sonhamos|meta|em breve|teremos|seremos|quero|queremos|queria|queriamos|pretendo|pretendemos|preciso|precisamos|planejo|planejamos|vou|vamos|contratar|chegar a)(?: \w+){0,2}$/;
  var grupo = function (m) { return numero(m[1]); };
  /* [regex, a conta a partir do achado] */
  var EQUIPE = [
    [new RegExp('\\bsomos (?:em )?' + CERCA + MAIS_DE_UM + '\\b' + GENTE_DEPOIS, 'g'), grupo],
    [new RegExp('\\b(?:equipe|time) de ' + CERCA + MAIS_DE_UM + '\\b', 'g'), grupo],
    [new RegExp('\\b' + CERCA + MAIS_DE_UM + ' ' + GENTE + '\\b', 'g'), grupo],
    [new RegExp('\\b(?:tenho|temos|com|conto com|contamos com) (?:so |apenas )?(?:um|uma|1) ' + GENTE_UM + '\\b', 'g'), function () { return 1; }],
    [new RegExp('\\b' + MAIS_DE_UM + ' pessoas (?:na|no) (?:equipe|time)\\b', 'g'), grupo],
    [new RegExp('\\btrabalham (?:aqui )?' + CERCA + MAIS_DE_UM + ' pessoas\\b', 'g'), grupo],
    [new RegExp('\\b(?:so eu|sozinh[oa])\\b(?! e ' + PARENTE + '\\b)(?! e mais\\b)', 'g'), function () { return 1; }],
    [new RegExp('\\beu e ' + PARENTE + '\\b', 'g'), function () { return 2; }],
    [new RegExp('\\beu e mais ' + QUALQUER + '\\b', 'g'), function (m) { return numero(m[1]) + 1; }],
    [new RegExp('\\beu e ' + PARENTE + ' e mais ' + QUALQUER + '\\b', 'g'), function (m) { return numero(m[1]) + 2; }]
  ];
  function numero(s) { return /^\d+$/.test(s) ? parseInt(s, 10) : (tem(EXTENSO, s) ? EXTENSO[s] : 0); }

  /* equipeDoTexto(texto) -> 1..999 ou null: só o que ela DISSE, e a maior quantidade dita */
  function equipeDoTexto(texto) {
    try {
      var t = O.semAcento(texto), maior = 0, i;
      if (!t) return null;
      for (i = 0; i < EQUIPE.length; i++) {
        var m = O.achaSemNegar(t, EQUIPE[i][0], NAO_E_HOJE), n = m ? EQUIPE[i][1](m) : 0;
        if (n >= 1 && n <= 999 && n > maior) maior = n;
      }
      return maior || null;
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
      /* depoimento só com regulado === false explícito: qualquer outro valor (esquecido, texto) bloqueia (revisões técnica e de segurança) */
      if (regulado === false && O.achaSemNegar(O.semAcento(texto), DEPOIMENTO)) return 'depoimentos';
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
        oferta: ofertaDoCaso(caso.texto, caso.objetivos), destaque: destaqueDoCaso(caso.texto, caso.objetivos, caso.regulado)
      });
      return r.ok ? r.cena : null;
    } catch (x) { return null; }
  }

  return Object.freeze({
    LUGAR_DO_RAMO: LUGAR_DO_RAMO, lugarDoCaso: lugarDoCaso, ofertaDoCaso: ofertaDoCaso, destaqueDoCaso: destaqueDoCaso, equipeDoTexto: equipeDoTexto, cenaDoCaso: cenaDoCaso
  });
});
