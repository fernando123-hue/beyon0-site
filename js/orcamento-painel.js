/* ==========================================================================
   AS PEÇAS DA CONVERSA (fatia 1): "o que já anotamos", a ficha do pedido e os três quadros do caso, ao lado da conversa
   com o Zero. O servidor manda `painel` no estado (api/_vendas/painel.mjs, derivado do briefing, esquema fechado); aqui o
   objeto é validado DE NOVO (o navegador não confia no formato) e o DOM é montado só por textContent: nada do que a pessoa
   contou entra como HTML. Só classes (CSP sem inline). A entrada de um item novo é um fade curto de opacidade, desligado em
   prefers-reduced-motion (css/orcamento-painel.css). Sem JS, ou sem painel, o bloco fica escondido e a conversa segue igual.
   Nada aqui toca no DOM ao carregar (o teste roda o arquivo sem document).
   ========================================================================== */
(function () {
  'use strict';
  var LIM = { itens: 5, ficha: 6, texto: 110 };
  var QUADROS = [['cenario', 'O cenário'], ['trava', 'O que trava'], ['destino', 'Onde quer chegar']];
  var ROTULOS_DA_FICHA = ['Empresa', 'Segmento', 'Cidade', 'O que quer resolver', 'Procura', 'Prazo'];

  /* o mesmo corte do servidor: sem controle nem < >, espaço simples, curto */
  function texto(v) {
    return typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIM.texto) : '';
  }

  /* devolve só o que cabe no esquema (chaves conhecidas, strings curtas) ou null quando não há o que mostrar */
  function validar(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    var saida = {};
    var anotamos = Array.isArray(p.anotamos) ? p.anotamos.map(texto).filter(Boolean).slice(0, LIM.itens) : [];
    if (anotamos.length) saida.anotamos = anotamos;
    var ficha = Array.isArray(p.ficha) ? p.ficha.map(function (f) {
      return f && typeof f === 'object' && ROTULOS_DA_FICHA.indexOf(f.rotulo) >= 0 ? { rotulo: f.rotulo, valor: texto(f.valor) } : null;
    }).filter(function (f) { return f && f.valor; }).slice(0, LIM.ficha) : [];
    if (ficha.length) saida.ficha = ficha;
    var caso = {};
    if (p.caso && typeof p.caso === 'object') QUADROS.forEach(function (q) { var v = texto(p.caso[q[0]]); if (v) caso[q[0]] = v; });
    if (Object.keys(caso).length) saida.caso = caso;
    return Object.keys(saida).length ? saida : null;
  }

  function criar(doc, raiz) {
    var vistos = {};   /* o que já foi desenhado: só o item NOVO faz o fade de entrada */
    var ultima = null;
    function el(tag, classe, conteudo) {
      var e = doc.createElement(tag);
      if (classe) e.className = classe;
      if (conteudo !== undefined) e.textContent = conteudo;
      return e;
    }
    function bloco(titulo) {
      var b = el('section', 'orc-peca__bloco');
      b.appendChild(el('h3', 'orc-peca__titulo', titulo));
      return b;
    }
    function marcarNovo(li, chave) {
      if (!vistos[chave]) li.className += ' is-novo';
      vistos[chave] = true;
    }
    function desenhar(p) {
      while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
      if (p.anotamos) {
        var b1 = bloco('O que já anotamos'), ul = el('ul', 'orc-peca__lista');
        p.anotamos.forEach(function (t) { var li = el('li', 'orc-peca__item', t); marcarNovo(li, 'a:' + t); ul.appendChild(li); });
        b1.appendChild(ul); raiz.appendChild(b1);
      }
      if (p.ficha) {
        var b2 = bloco('A ficha do seu pedido'), dl = el('dl', 'orc-peca__ficha');
        p.ficha.forEach(function (f) {
          var linha = el('div', 'orc-peca__linha');
          linha.appendChild(el('dt', null, f.rotulo)); linha.appendChild(el('dd', null, f.valor));
          marcarNovo(linha, 'f:' + f.rotulo + ':' + f.valor); dl.appendChild(linha);
        });
        b2.appendChild(dl); raiz.appendChild(b2);
      }
      if (p.caso) {
        var b3 = bloco('O seu caso'), grade = el('div', 'orc-peca__caso');
        QUADROS.forEach(function (q) {
          if (!p.caso[q[0]]) return;
          var quadro = el('div', 'orc-peca__quadro orc-peca__quadro--' + q[0]);
          quadro.appendChild(el('span', 'orc-peca__rotulo', q[1])); quadro.appendChild(el('span', 'orc-peca__valor', p.caso[q[0]]));
          marcarNovo(quadro, 'c:' + q[0] + ':' + p.caso[q[0]]); grade.appendChild(quadro);
        });
        b3.appendChild(grade); raiz.appendChild(b3);
      }
    }
    return {
      atualizar: function (bruto) {
        var p = validar(bruto);
        if (!p) { ultima = null; raiz.hidden = true; return; }
        var chave = JSON.stringify(p);
        if (chave === ultima) return;   /* nada mudou: o DOM e o foco ficam como estão */
        ultima = chave;
        desenhar(p);
        raiz.hidden = false;
      }
    };
  }

  window.BZPainel = {
    validar: validar,
    LIMITES: LIM,
    /* a tela chama atualizar(E.painel) a cada leitura do estado; o elemento é #o-peca (orcamento.html) */
    atualizar: function (bruto) {
      var raiz = document.getElementById('o-peca');
      if (!raiz) return;
      if (!window.BZPainel._tela) window.BZPainel._tela = criar(document, raiz);
      window.BZPainel._tela.atualizar(bruto);
    },
    _criar: criar
  };
})();
