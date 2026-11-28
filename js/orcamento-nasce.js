/* ==========================================================================
   O SITE NASCE ENQUANTO VOCÊ RESPONDE (remodelação do orçamento, 18/11, direção B; dono: "as pessoas não gostam de ler").
   Em cima da conversa mora a miniatura do site da pessoa. A cada toque (o ramo, os objetivos, o logo e os textos) uma peça
   nasce nela: o cliente VÊ o que está montando, em vez de ler uma lista. É só desenho do que ela escolheu:
   nada de dado inventado (nome de empresa, número, depoimento), e o que a pessoa escreveu só entra por textContent.
   A miniatura é decorativa (aria-hidden): quem usa leitor de tela segue pela conversa, que continua inteira.
   Escuta o evento "bz:respostas" que js/orcamento-toques.js dispara a cada toque (detail = as respostas até agora).
   Movimento é acréscimo: a peça nova só ganha o "pop" com movimento liberado (css/orcamento-casca.css); sem JS, a
   miniatura nem existe (hidden). Um módulo só, para a tela e para o teste (docs/testes/orcamento-nasce.test.mjs).
   ES5 sintático (var, function), como os módulos da planta.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  /* (os rótulos carregam DEPOIS deste script: a leitura é na hora do evento, quando já estão lá) */
  if (raiz) { raiz.BZOrcNasce = api; if (raiz.document) api.ligar(raiz.document, function () { return raiz.BZOrcRotulos; }); }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  /* a chamada de cada ramo: uma frase curta que um site desse tipo diria (texto de modelo, não dado do cliente). A linha só quebra pelo sentido
     (regra do dono): "em 1 toque" e "a matrícula" presos por espaço que não quebra; "Peça o seu orçamento" inteiro (revisão visual da Fase 2) */
  var TITULOS = Object.freeze({
    servicos: 'Peça o seu orçamento em 1 toque',
    saude: 'Agende em 1 toque',
    beleza: 'Seu horário, sem espera',
    alimentacao: 'Peça agora pelo celular',
    comercio: 'Veja e peça pelo celular',
    educacao: 'Conheça e faça a matrícula',
    associacao: 'Faça parte e participe',
    outro: 'O seu negócio, no ar'
  });
  /* a peça que cada objetivo acrescenta ao site */
  var PECAS = Object.freeze({
    pedidos_whatsapp: 'Botão do WhatsApp',
    achado_google: 'Aparece no Google e no mapa',
    agendamentos: 'Agenda de horários',
    vender_online: 'Loja com pedido online',
    apresentar: 'Quem somos e o que fazemos',
    campanha: 'Página da campanha'
  });
  var PECA_MATERIAL = 'Seu logo e seus textos';
  var MAX_NOME = 40;
  var MAX_OBJETIVOS = 20;   /* (a lista fechada tem 6; o teto só protege de um evento forjado com lista gigante) */

  /* o desenho do site a partir das respostas até agora. null = ainda não há ramo (a miniatura fica escondida).
     rotulos: o BZOrcRotulos (os nomes dos ramos); sem ele o nome do ramo fica vazio */
  function planoDoSite(r, rotulos) {
    if (!r || typeof r !== 'object' || !Object.prototype.hasOwnProperty.call(TITULOS, r.ramo)) return null;
    var nome = '';
    if (r.ramo === 'outro' && typeof r.outro === 'string') nome = r.outro.slice(0, 200).replace(/\s+/g, ' ').trim().slice(0, MAX_NOME);   /* (corta ANTES: um texto gigante não custa CPU) */
    else if (rotulos && rotulos.RAMOS && Object.prototype.hasOwnProperty.call(rotulos.RAMOS, r.ramo)) nome = rotulos.RAMOS[r.ramo];
    var pecas = [];
    (Array.isArray(r.objetivos) ? r.objetivos.slice(0, MAX_OBJETIVOS) : []).forEach(function (o) {
      if (Object.prototype.hasOwnProperty.call(PECAS, o) && !pecas.some(function (p) { return p.chave === o; })) pecas.push({ chave: o, texto: PECAS[o] });
    });
    if (r.material === 'tenho' || r.material === 'parte') pecas.push({ chave: 'material', texto: PECA_MATERIAL });
    return { ramo: r.ramo, nome: nome, titulo: TITULOS[r.ramo], pecas: pecas };
  }

  /* pinta o plano no que já está na página (#o-nasce e filhos). Só as peças NOVAS ganham a classe do pop */
  function pintar(doc, plano) {
    var caixa = doc.getElementById('o-nasce');
    if (!caixa) return;
    if (!plano) { caixa.hidden = true; return; }
    var nome = doc.getElementById('o-nasce-nome'), titulo = doc.getElementById('o-nasce-titulo'), lista = doc.getElementById('o-nasce-pecas');
    if (!nome || !titulo || !lista) return;
    var fim = plano.nome ? 'Seu site · ' + plano.nome : 'Seu site';
    if (nome.textContent !== fim) nome.textContent = fim;
    if (titulo.textContent !== plano.titulo) {
      titulo.textContent = plano.titulo;
      titulo.classList.remove('is-nova'); void titulo.offsetWidth; titulo.classList.add('is-nova');
    }
    var chaves = plano.pecas.map(function (p) { return p.chave; });
    [].slice.call(lista.children).forEach(function (li) { if (chaves.indexOf(li.getAttribute('data-peca')) < 0) lista.removeChild(li); });
    plano.pecas.forEach(function (p, i) {
      var li = [].filter.call(lista.children, function (x) { return x.getAttribute('data-peca') === p.chave; })[0];
      if (!li) {
        li = doc.createElement('li');
        li.className = 'nasce__peca is-nova';
        li.setAttribute('data-peca', p.chave);
        li.textContent = p.texto;
      }
      if (lista.children[i] !== li) lista.insertBefore(li, lista.children[i] || null);   /* (a ordem é a do plano, também depois do "Mudar") */
    });
    caixa.hidden = false;
    caixa.setAttribute('data-pecas', String(plano.pecas.length));
  }

  function ligar(doc, rotulos) {
    if (!doc || typeof doc.addEventListener !== 'function' || !doc.getElementById('o-nasce')) return;
    doc.addEventListener('bz:respostas', function (ev) { pintar(doc, planoDoSite(ev && ev.detail, typeof rotulos === 'function' ? rotulos() : rotulos)); });
  }

  return Object.freeze({ TITULOS: TITULOS, PECAS: PECAS, planoDoSite: planoDoSite, pintar: pintar, ligar: ligar });
});
