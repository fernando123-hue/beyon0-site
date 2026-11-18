/* ==========================================================================
   OS ÍCONES DAS OPÇÕES DA CONVERSA (remodelação do orçamento, 18/11, direção B: "as pessoas não gostam de ler").
   Cada opção que a pessoa toca (ramo, objetivo, site, material, as dores do passo 4) ganha um desenho de traço de 1,6 px,
   para o olho achar a resposta antes de ler. Só traço (currentColor): sem preenchimento, sem desfoque, sem imagem externa.
   O SVG nasce por createElementNS e o caminho vem de uma lista fixa aqui: nenhum texto da pessoa vira desenho.
   Um módulo só, para a tela e para o teste (docs/testes/orcamento-icones.test.mjs confere que TODA opção tem o seu).
   ES5 sintático (var, function), como os módulos da planta.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOrcIcones = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  /* os traços, numa grade de 24 por 24 (cada item é um caminho; o arco "a1 1" faz os círculos pequenos) */
  var TRACOS = Object.freeze({
    ponto: ['M12 10.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z'],
    pontos: ['M6 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z', 'M12 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z', 'M18 10.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z'],
    conversa: ['M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z'],
    local: ['M12 20.5s6.2-5.4 6.2-10.2a6.2 6.2 0 1 0-12.4 0c0 4.8 6.2 10.2 6.2 10.2z', 'M12 8.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z'],
    agenda: ['M4.5 6.5h15v13h-15z', 'M4.5 10.5h15', 'M8.5 4v4', 'M15.5 4v4'],
    carrinho: ['M3 4.5h3l2.2 10.5h9.6l2-7.7H7', 'M9.6 18.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z', 'M16.6 18.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z'],
    loja: ['M4.5 20V9.5L12 4.5l7.5 5V20z', 'M10 20v-5.5h4V20'],
    megafone: ['M4 10v4h3l6.5 4V6L7 10z', 'M16.5 9a4.2 4.2 0 0 1 0 6'],
    ferramenta: ['M14.6 5.2a4.2 4.2 0 0 0 4.2 4.2l-9.3 9.3a2.3 2.3 0 0 1-3.2-3.2l9.3-9.3z'],
    coracao: ['M12 19.8s-7-4.4-7-9.9a4 4 0 0 1 7-2.3 4 4 0 0 1 7 2.3c0 5.5-7 9.9-7 9.9z'],
    tesoura: ['M6 5.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z', 'M6 14.8a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z', 'M7.6 8.6L19 16', 'M7.6 15.4L19 8'],
    copo: ['M5 8h11.5v5a5.2 5.2 0 0 1-5.2 5.2h-1.1A5.2 5.2 0 0 1 5 13z', 'M16.5 9.5h1.6a2 2 0 0 1 0 4h-1.6', 'M7 20.5h8'],
    sacola: ['M5.5 8h13l-1 12h-11z', 'M9 8V6.4a3 3 0 0 1 6 0V8'],
    livro: ['M4 5.5h5.5a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 0-2.5-2.5H4z', 'M20 5.5h-5.5A2.5 2.5 0 0 0 12 8v12a2.5 2.5 0 0 1 2.5-2.5H20z'],
    pessoas: ['M9 6.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z', 'M3 19.5a6 6 0 0 1 12 0', 'M16.2 6.6a2.7 2.7 0 1 1 0 5.4', 'M17.5 14.2a5 5 0 0 1 3.5 5.3'],
    camera: ['M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z', 'M12 8.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z', 'M16.6 7.6h.01'],
    globo: ['M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z', 'M3.5 12h17', 'M12 3.5c3.4 3.4 3.4 13.6 0 17', 'M12 3.5c-3.4 3.4-3.4 13.6 0 17'],
    elo: ['M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.7l-1 1', 'M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.7l1-1'],
    mais: ['M12 5v14', 'M5 12h14'],
    certo: ['M5 12.5l4.5 4.5L19 7.5'],
    metade: ['M12 4.5a7.5 7.5 0 1 0 0 15z', 'M12 4.5a7.5 7.5 0 0 1 0 15'],
    traco: ['M6 12h12'],
    relogio: ['M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z', 'M12 8v4.2l2.8 1.8'],
    caixa: ['M4 8l8-4 8 4v8l-8 4-8-4z', 'M4 8l8 4 8-4', 'M12 12v8'],
    paleta: ['M12 4.2c4.7 0 8 3 8 6.9 0 2.6-2 3.9-4 3.9h-1.3a1.6 1.6 0 0 0-1.1 2.7c.6.7.2 2.2-1.6 2.2-4.2 0-8-3.2-8-7.9S7 4.2 12 4.2z', 'M8.4 10.4h.01', 'M12 8.2h.01', 'M15.6 10.4h.01'],
    fonte: ['M3.5 19l5-13 5 13', 'M5.3 14.5h6.4', 'M16.5 11.8c1-1 3.5-1 3.5 1.5v5.7', 'M20 15.5c-2.3-.2-3.8.5-3.8 1.9s1.3 1.9 2.4 1.9c.8 0 1.4-.4 1.4-.4'],
    pergunta: ['M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z', 'M9.4 9.4a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.8', 'M12 17.1h.01']
  });

  /* qual desenho vai em qual opção. Chave "grupo:valor" (o mesmo valor pode querer coisas diferentes em grupos diferentes:
     "nao" é "não tenho site" num passo e "não tenho logo" no outro); sem grupo, vale o valor sozinho */
  var DE = Object.freeze({
    /* ramo */
    'ramo:servicos': 'ferramenta', 'ramo:saude': 'coracao', 'ramo:beleza': 'tesoura', 'ramo:alimentacao': 'copo',
    'ramo:comercio': 'sacola', 'ramo:educacao': 'livro', 'ramo:associacao': 'pessoas', 'ramo:outro': 'pontos',
    /* objetivos */
    'objetivos:pedidos_whatsapp': 'conversa', 'objetivos:achado_google': 'local', 'objetivos:agendamentos': 'agenda',
    'objetivos:vender_online': 'carrinho', 'objetivos:apresentar': 'loja', 'objetivos:campanha': 'megafone',
    /* o site de hoje */
    'site:nao': 'mais', 'site:instagram': 'camera', 'site:tenho_site': 'globo', 'site:so_endereco': 'elo',
    /* logo e textos */
    'material:tenho': 'certo', 'material:parte': 'metade', 'material:nao': 'traco',
    /* as dores do passo 4 (como chegam hoje e o que dá trabalho) */
    'dor:instagram': 'camera', 'dor:whatsapp': 'conversa', 'dor:indicacao': 'pessoas', 'dor:google': 'local',
    'dor:passa_na_frente': 'loja', 'dor:responde_na_mao': 'conversa', 'dor:pergunta_e_some': 'conversa',
    'dor:nao_me_acham': 'local', 'dor:falta_consulta': 'agenda', 'dor:horario_vago': 'relogio',
    'dor:visita_perdida': 'relogio', 'dor:pedido_perdido': 'sacola', 'dor:pergunta_estoque': 'caixa',
    'dor:matricula_demora': 'livro', 'dor:ninguem_sabe': 'megafone',
    /* os ajustes (js/orcamento-ajustes.js): usar as cores ou as fontes de outro modelo, e acrescentar uma seção */
    'ajuste:paleta': 'paleta', 'ajuste:fonte': 'fonte',
    'ajuste:sec_hero': 'loja', 'ajuste:sec_servicos': 'ferramenta', 'ajuste:sec_sobre': 'loja', 'ajuste:sec_diferenciais': 'certo',
    'ajuste:sec_processo': 'relogio', 'ajuste:sec_depoimentos': 'coracao', 'ajuste:sec_numeros': 'pontos', 'ajuste:sec_galeria': 'camera',
    'ajuste:sec_faq': 'pergunta', 'ajuste:sec_cta': 'megafone', 'ajuste:sec_contato': 'conversa', 'ajuste:sec_equipe': 'pessoas',
    'ajuste:sec_destaque': 'megafone', 'ajuste:sec_localizacao': 'local'
  });

  function nomeDe(valor, grupo) {
    var chave = (grupo ? grupo + ':' : '') + valor;
    return Object.prototype.hasOwnProperty.call(DE, chave) ? DE[chave] : '';
  }

  /* o <svg> de uma opção (decorativo: o rótulo da própria opção é o que o leitor de tela diz); null se a opção não tem desenho */
  function desenhar(valor, grupo, doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    var nome = nomeDe(valor, grupo);
    if (!d || !nome) return null;
    var svg = d.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'orc-ic');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    TRACOS[nome].forEach(function (dado) {
      var p = d.createElementNS(NS, 'path');
      p.setAttribute('d', dado);
      svg.appendChild(p);
    });
    return svg;
  }

  return Object.freeze({ TRACOS: TRACOS, DE: DE, nomeDe: nomeDe, desenhar: desenhar });
});
