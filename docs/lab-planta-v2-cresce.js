/* PLANTA VIVA v2 (laboratório): o CRESCIMENTO derivado do briefing, sem IA. PURO (sem DOM nem relógio), ES5: window.BZPlantaCresce na tela,
   CommonJS no Node. Entra o briefing que o servidor já monta (as mesmas chaves de api/_vendas/painel.mjs: negocio, situacao_atual, objetivos,
   funcionalidades); sai o ESBOÇO: a chegada, quatro estações fixas e o objetivo, cada uma conhecida ou fantasma. A ordem e o número de
   lugares nunca mudam (a altura do esboço só depende da largura); o que muda é o que já foi entendido. Os textos são de LISTAS FECHADAS:
   o texto da pessoa nunca aparece no desenho (nada a limpar, nada a inventar), só escolhe qual frase vale. Sem número, preço, prazo nem
   resultado (regra de 04/11): a planta mostra o mecanismo.
   Para o PR do crescimento: este arquivo é a derivação; o servidor a roda a cada turno e manda o esboço junto do painel. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZPlantaCresce = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* as origens que o código reconhece no "como chegam" (texto livre). As chaves são as de BZPlantaForma.ORIGENS, na ordem do desenho */
  var ORIGENS = [
    ['busca', /google|busca|pesquis|procura/i, 'busca'],
    ['mapa', /mapa|maps|perto|bairro|endere/i, 'mapa'],
    ['indicacao', /indica|boca a boca|amig|conhecid|paciente.{0,12}traz|cliente.{0,12}traz/i, 'indicação'],
    ['rede', /instagram|insta\b|direct|rede social|redes sociais|facebook|tiktok/i, 'rede social'],
    ['anuncio', /an[uú]ncio|patrocin|tr[aá]fego pago/i, 'anúncio']
  ];
  var ROT_CHEGADA = { busca: 'Busca', mapa: 'Mapa', indicacao: 'Indicação', rede: 'Rede social', anuncio: 'Anúncio' };
  var FRASE_CHEGADA = { busca: 'pela busca', mapa: 'pelo mapa', indicacao: 'por indicação', rede: 'pela rede social', anuncio: 'por um anúncio' };

  var LUGARES = ['chegada', 'pagina', 'conversa', 'acao', 'volta'];
  /* o que o Zero ainda vai entender: o rótulo do fantasma */
  var FALTA = { chegada: 'de onde o seu cliente vem', pagina: 'o que você faz', conversa: 'o que trava hoje', acao: 'como a pessoa fecha', volta: 'como ela fala com você', objetivo: 'onde você quer chegar' };

  var lista = function (v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : []; };
  var texto = function (v) { return typeof v === 'string' ? v.trim() : ''; };
  var tem = function (l, k) { return l.indexOf(k) >= 0; };

  function juntar(partes, e) {
    if (partes.length < 2) return partes.join('');
    return partes.slice(0, -1).join(', ') + ' ' + e + ' ' + partes[partes.length - 1];
  }

  function origensDe(comoChegam) {
    var t = texto(comoChegam), o = [];
    ORIGENS.forEach(function (x) { if (x[1].test(t)) o.push(x[0]); });
    return o.slice(0, 4);
  }

  /* a venda acontece no site (loja) ou a pessoa marca (agenda)? Cada um olha objetivos e funcionalidades */
  function modo(b) {
    var obj = lista(b.objetivos), fun = lista(b.funcionalidades);
    if (tem(obj, 'vender') || tem(fun, 'loja')) return 'loja';
    if (tem(obj, 'agendamentos') || tem(fun, 'agendamento')) return 'agenda';
    if (tem(obj, 'gerar_leads')) return 'orcamento';
    return '';
  }

  function chegada(b) {
    var o = origensDe((b.situacao_atual || {}).como_chegam);
    if (!o.length) return { lugar: 'chegada', tipo: 'chegada', n: 1, conhecido: true, provisorio: true, verbo: 'Chega', titulo: 'De onde o seu cliente vem', frase: 'O primeiro traço: é por aqui que a pessoa entra no seu site.' };
    var rot = o.map(function (k, i) { var r = ROT_CHEGADA[k]; return i ? r.toLowerCase() : r; });
    return { lugar: 'chegada', tipo: 'chegada', n: o.length, origens: o, conhecido: true, verbo: 'Chega', titulo: juntar(rot, 'e'), frase: 'A pessoa chega ' + juntar(o.map(function (k) { return FRASE_CHEGADA[k]; }), 'ou') + '.' };
  }

  /* o que a pessoa vende é produto? (o segmento diz antes de o objetivo "vender" aparecer) */
  var PRODUTO = /loja|moda|roupa|cal[cç]ado|acess[oó]rio|cosm[eé]tic|produto/i;
  function pagina(b, m) {
    var n = b.negocio || {};
    if (!texto(n.descricao)) return null;
    if (m === 'loja' || PRODUTO.test(texto(n.segmento))) return { tipo: 'vitrine', verbo: 'Mostra', titulo: 'Vitrine com as suas peças', frase: 'Quem chega vê as peças organizadas e acha logo o que procura.' };
    return { tipo: 'pagina', verbo: 'Mostra', titulo: 'Uma página para cada serviço', frase: 'Quem chega encontra logo o serviço que procurava, explicado do jeito dela.' };
  }
  function conversa(b) {
    if (!texto((b.situacao_atual || {}).o_que_se_perde)) return null;
    return { tipo: 'conversa', verbo: 'Responde', titulo: 'Tira a dúvida que hoje trava', frase: 'A pergunta que hoje fica sem resposta e faz a pessoa sumir ganha resposta ali mesmo.' };
  }
  function acao(b, m) {
    if (m === 'agenda') return { tipo: 'agenda', verbo: 'Agenda', titulo: 'Escolhe o horário sozinha', frase: 'Mostra só os horários livres e a pessoa marca ali mesmo, sem esperar retorno.' };
    if (m === 'loja') return { tipo: 'carrinho', verbo: 'Reúne', titulo: 'Sacola com o frete na hora', frase: 'A sacola junta as peças e mostra o frete antes de a pessoa decidir.' };
    if (m === 'orcamento') return { tipo: 'formulario', verbo: 'Recebe', titulo: 'Pedido de orçamento completo', frase: 'O pedido chega com o que você precisa saber para responder de primeira.' };
    return null;
  }
  function volta(b) {
    if (!tem(lista(b.funcionalidades), 'whatsapp')) return null;
    return { tipo: 'mensagem', verbo: 'Responde', titulo: 'Segue no WhatsApp, com o assunto', frase: 'Quem prefere falar com gente segue para o seu WhatsApp com o assunto já escrito.' };
  }
  var OBJETIVOS = {
    agenda: { titulo: 'Horário marcado', frase: 'O horário já entra na sua agenda, com quem vem e o que procura.' },
    loja: { titulo: 'Pedido pago', frase: 'O pedido entra pago e segue para a separação.' },
    orcamento: { titulo: 'Pedido de orçamento na mão', frase: 'O pedido chega completo, pronto para você responder.' }
  };
  function objetivo(b, m) {
    if (!m || !lista(b.objetivos).length) return { lugar: 'objetivo', conhecido: false, falta: FALTA.objetivo };
    return { lugar: 'objetivo', conhecido: true, titulo: OBJETIVOS[m].titulo, frase: OBJETIVOS[m].frase };
  }

  /* o esboço inteiro: { estacoes: [5 lugares], objetivo }. Cada estação conhecida tem tipo, verbo, titulo, frase; a fantasma, só falta */
  function derivar(briefing) {
    var b = briefing && typeof briefing === 'object' && !Array.isArray(briefing) ? briefing : {};
    var m = modo(b);
    var feitas = { chegada: chegada(b), pagina: pagina(b, m), conversa: conversa(b), acao: acao(b, m), volta: volta(b) };
    var estacoes = LUGARES.map(function (lugar) {
      var e = feitas[lugar];
      if (!e) return { lugar: lugar, conhecido: false, falta: FALTA[lugar] };
      e.lugar = lugar; e.conhecido = true;
      return e;
    });
    return { estacoes: estacoes, objetivo: objetivo(b, m) };
  }

  /* a assinatura de uma estação: muda quando o desenho dela muda (a chegada ganha uma origem, o fantasma vira estação) */
  var assinatura = function (e) { return e.conhecido ? [e.tipo || '', e.n || 0, e.titulo || ''].join('|') : ''; };

  /* o que mudou de um esboço para o outro, na ordem do desenho: [{ lugar, tipo: 'nova' | 'refeita' }] */
  function diferenca(antes, depois) {
    var o = [], i;
    for (i = 0; i < depois.estacoes.length; i++) {
      var a = antes ? antes.estacoes[i] : null, d = depois.estacoes[i];
      if (!d.conhecido) continue;
      if (!a || !a.conhecido) o.push({ lugar: d.lugar, tipo: 'nova' });
      else if (assinatura(a) !== assinatura(d)) o.push({ lugar: d.lugar, tipo: 'refeita' });
    }
    var ao = antes ? antes.objetivo : null;
    if (depois.objetivo.conhecido && (!ao || !ao.conhecido || ao.titulo !== depois.objetivo.titulo)) o.push({ lugar: 'objetivo', tipo: ao && ao.conhecido ? 'refeita' : 'nova' });
    return o;
  }

  return Object.freeze({ LUGARES: LUGARES, FALTA: FALTA, derivar: derivar, diferenca: diferenca, origensDe: origensDe });
});
