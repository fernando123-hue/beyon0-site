/* A COERÊNCIA DO CASO (Mapa vivo v2, FASE 4, parte 1; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 4").
   Confere o ramo que a pessoa TOCOU contra o que ela ESCREVEU sobre o negócio. Quando o texto fala claramente de um negócio de OUTRO
   ramo, e só de um, devolve uma dúvida com palpite de lista fechada ("parece do ramo Alimentação, certo?"); em todo o resto fica quieta.
   Regra de ouro: melhor não perguntar do que perguntar errado. Não pergunta em texto curto (< 15 caracteres), com o ramo "outro", sem
   palavra de ramo, quando o texto confirma o ramo tocado (mesmo citando outro: "clínica de estética" é beleza), quando aponta para 2 ou
   mais ramos (ambíguo) nem com a palavra negada na mesma oração ("não é restaurante"). Nunca devolve texto da pessoa: a tela mostra
   só o nome do ramo, desta tabela. Esta parte é só a regra (i) da spec (palavra × ramo); equipe impossível, texto sem sentido e
   objetivo × formato vêm depois (a equipe nasce na Fase 2). PURO (sem DOM), ES5: window.BZOrcCoerencia na tela, CommonJS no Node. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcCoerencia = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = function (o) { return Object.freeze(o); };
  var tabela = function (o) { var t = Object.create(null), k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = o[k]; return congelar(t); };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };

  var TEXTO_MIN = 15;
  var TEXTO_MAX = 2000;
  /* os 7 ramos que podem virar palpite (os 8 de api/_classificador/contrato.mjs menos "outro") e o nome que a tela escreve */
  var NOMES = tabela({
    servicos: 'Serviços', saude: 'Saúde', beleza: 'Beleza', alimentacao: 'Alimentação', comercio: 'Comércio', educacao: 'Educação',
    associacao: 'Associação'
  });
  /* palavra (minúscula, sem acento) -> ramos a que ela pertence. Palavra de mais de um ramo leva todos: a estética é saúde E beleza,
     então "clínica de estética" com o ramo beleza confirma, e com o ramo comércio é ambígua (quieta) */
  var PALAVRAS = [
    [/\b(?:clinicas?|consultorios?|dentistas?|odonto\w*|psicolog\w*|nutricion\w*|nutrologia|fisioterap\w*|fonoaudiolog\w*|dermatolog\w*|medic[oa]s?|terapeutas?|psicanalis\w*|laboratori\w*|exames?|hospita\w*|pediatr\w*|cardiolog\w*|ortoped\w*|oftalmolog\w*)\b/g, ['saude']],
    [/\b(?:esteticas?|estetica\w*)\b/g, ['saude', 'beleza']],
    [/\b(?:farmacias?|drogarias?)\b/g, ['saude', 'comercio']],
    [/\b(?:academias?|pilates|yoga|ioga|personal|crossfit)\b/g, ['servicos', 'saude', 'beleza']],
    [/\b(?:saloes|salao|barbearias?|barbeir[oa]s?|cabeleireir\w*|manicures?|pedicures?|unhas?|sobrancelhas?|lash\w*|cilios|maquiag\w*|depilac\w*|tatuag\w*|tattoo|spa)\b/g, ['beleza']],
    [/\b(?:restaurantes?|confeitari\w*|pizzarias?|lanchonetes?|padarias?|paes|pao|cafeterias?|hamburguerias?|marmit\w*|docerias?|sorveterias?|buffet|cardapios?|bolos?|salgados?|acai|food ?truck|churrascarias?|bares?|botecos?)\b/g, ['alimentacao']],
    [/\b(?:lojas?|moda|roupas?|varejo|e-?commerce|boutiques?|acessorios|calcados|sapatos|joias|semijoias|cosmeticos?|perfumarias?|brechos?|papelarias?|oticas?|atacad\w*|distribuidoras?|vendo|revend\w*)\b/g, ['comercio']],
    [/\b(?:cursos?|escolas?|escolinhas?|aulas?|professor\w*|idiomas?|ingles|espanhol|treinamentos?|cursinhos?|reforco escolar|autoescolas?|auto escola|mentorias?|faculdades?|creches?|alfabetizac\w*)\b/g, ['educacao']],
    [/\b(?:reformas?|marcenari\w*|marceneir\w*|serralheri\w*|instalac\w*|ar condicionado|limpeza|pintura|pintor\w*|eletricistas?|encanador\w*|construc\w*|paisagismo|jardinag\w*|vidracari\w*|dedetizac\w*|mudancas?|gesso|pedreir\w*|obras?|advoc\w*|advogad\w*|contabil\w*|contador\w*|oficinas?|mecanic\w*|consultorias?|fotograf\w*|imobiliari\w*|corretor\w*|arquitet\w*|engenhari\w*)\b/g, ['servicos']],
    [/\b(?:pet ?shop|pets?|veterinari\w*|banho e tosa)\b/g, ['servicos', 'beleza', 'saude']],
    [/\b(?:associac\w*|ongs?|igrejas?|sindicatos?|cooperativas?|institutos?|fundac\w*|clubes?|projetos? sociais?|sem fins lucrativos)\b/g, ['associacao']]
  ];
  /* a negação ANTES da palavra, na mesma oração, até 3 palavras antes; e DEPOIS, até 2 (o mesmo jeito de js/mapa-saber.js) */
  var NEGACAO = /\b(?:nao|nunca|nem|sem|nada de)(?: \w+){0,3}$/;
  var NEGACAO_DEPOIS = /^ *(?:(?!(?:e|ou) )\w+ +){0,2}(?:nao|nunca)\b/;
  var FIM_DA_ORACAO = /[,;.!?\n]|\b(?:mas|so|porem)\b/;
  var semAcento = function (t) { return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };

  /* os grupos de ramos das palavras que o texto traz (não negadas), um grupo por linha de PALAVRAS */
  function gruposDoTexto(texto) {
    var grupos = [], i;
    for (i = 0; i < PALAVRAS.length; i++) {
      var re = PALAVRAS[i][0], m;
      re.lastIndex = 0;
      while ((m = re.exec(texto))) {
        var oracao = texto.slice(0, m.index).split(FIM_DA_ORACAO).pop().trim();
        var resto = texto.slice(m.index + m[0].length).split(FIM_DA_ORACAO)[0];
        if (!NEGACAO.test(oracao) && !NEGACAO_DEPOIS.test(resto)) { grupos.push(PALAVRAS[i][1]); break; }
      }
    }
    return grupos;
  }

  /* o ramo comum a TODOS os grupos ("fisioterapia" é saúde; "pilates" é serviços, saúde ou beleza: o comum é saúde); vazio ou mais de um
     = ambíguo */
  function comumATodos(grupos) {
    return grupos[0].filter(function (r) { return grupos.every(function (g) { return g.indexOf(r) >= 0; }); });
  }

  /* conferirCoerencia(respostas, texto) -> { ok: true } | { ok: false, duvida: 'ramo', palpite: <código> }. Nunca lança */
  function conferirCoerencia(respostas, texto) {
    var QUIETO = { ok: true };
    try {
      var ramo = respostas && typeof respostas === 'object' ? respostas.ramo : undefined;
      if (!tem(NOMES, ramo) || typeof texto !== 'string') return QUIETO;
      var limpo = semAcento(texto.slice(0, TEXTO_MAX)).replace(/\s+/g, ' ').trim();
      if (limpo.length < TEXTO_MIN) return QUIETO;
      var grupos = gruposDoTexto(limpo);
      /* nada de ramo no texto, ou alguma palavra confirma o ramo tocado: quieto */
      if (!grupos.length || grupos.some(function (g) { return g.indexOf(ramo) >= 0; })) return QUIETO;
      var comum = comumATodos(grupos);
      return comum.length === 1 ? { ok: false, duvida: 'ramo', palpite: comum[0] } : QUIETO;
    } catch (e) {
      return QUIETO;
    }
  }

  return congelar({ NOMES: NOMES, TEXTO_MIN: TEXTO_MIN, conferirCoerencia: conferirCoerencia });
});
