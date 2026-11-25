/* ==========================================================================
   OS EXTRAS NA CONVERSA COM O ZERO (dono, 24/11, opção A). Com o consultor, o preço é a estimativa que o Zero gravou e os cartões de extras da
   tela de toques ficam escondidos (js/orcamento-perguntas.js). Logo depois que o Zero dá o preço (o valor liberado), entram na conversa 2 ou 3
   extras como cartões: um toque inclui, outro tira, e o total se atualiza. O momento é o da decisão (o preço acabou de aparecer); nada de
   pressa nem de oferta: a fala é curta, cada cartão só tem o nome curto e o preço, e o total fica à vista.
   O preço é SEMPRE do servidor (api/_vendas/fluxo-extras.mjs): daqui só saem a chave do extra, o sim ou não e a versão da tabela que a tela
   mostrou; o servidor recalcula, regrava a estimativa (a que o pedido usa) e devolve o total novo. A página relê o estado (o cartão do preço
   acompanha). Um toque por vez. Sem o consultor, nada disto existe: o fluxo de toques segue com os extras dele.
   Acessibilidade: o grupo é rotulado pela fala; os cartões são botões com aria-pressed; o foco fica no cartão tocado (nunca disabled durante a
   conta, só aria-disabled); o total novo é anunciado. Usa o kit da conversa de js/orcamento-toques.js. Todo texto por textContent. ES5.
   ========================================================================== */
(function () {
  'use strict';
  var T = window.BZToques, API = window.BZOrcamento, doc = document;
  if (!T || !T.kit || !API || typeof API.extrasSugeridos !== 'function' || !doc.getElementById('o-log')) return;
  var K = T.kit;

  var FALA = 'Quer incluir algum destes no site?';
  var FALHA = 'Não consegui mudar agora. Tente de novo.';
  var INDICADO = ' Indicado para o seu caso.';
  var ETAPAS = ['descoberta', 'estimativa'];   /* (= api/_vendas/fluxo-extras.mjs, ETAPAS_EXTRAS: até os detalhes do pedido) */
  var ERRO_MS = 50;

  var s = { li: null, grupo: null, total: null, erro: null, cartoes: {}, versao: null, assinatura: null, carregando: false, emVoo: false, travado: false };
  var ganchos = { reler: function () { return Promise.resolve(); } };

  var dinheiro = function (n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  /* o mesmo JSON sem depender da ordem das chaves (o jsonb volta do banco com as chaves na ordem dele) */
  function canonico(v) {
    if (Array.isArray(v)) return v.map(canonico);
    if (!v || typeof v !== 'object') return v;
    var o = {};
    Object.keys(v).sort().forEach(function (k) { o[k] = canonico(v[k]); });
    return o;
  }
  function assinaturaDe(fatores) { return fatores ? JSON.stringify(canonico(fatores)) : null; }

  /* os cartões só com o Zero, com o valor liberado, com o preço gravado e antes dos detalhes do pedido */
  function abertos(E) {
    return !!(E && E.estimativa && E.conversa && ETAPAS.indexOf(E.conversa.etapa) >= 0 && !E.pedido && !E.conversa.tem_contato && T.comConsultor() && !T.reterValor(E));
  }

  /* ---------- o bloco na conversa ---------- */
  function montar() {
    var li = K.el('li', 'orc-xz'), fala = K.el('p', 'orc-xz__fala', FALA), grupo = K.el('div', 'orc-xz__ops');
    var total = K.el('p', 'orc-xz__total'), erro = K.el('p', 'orc-xz__erro');
    fala.id = 'o-xz-fala';
    grupo.setAttribute('role', 'group');
    grupo.setAttribute('aria-labelledby', fala.id);
    total.appendChild(K.el('span', 'orc-xz__total-rotulo', 'Total'));
    total.appendChild(K.el('span', '', ' '));   /* (o espaço que o leitor de tela lê entre a palavra e o número; o vão à vista é do CSS) */
    total.appendChild(K.el('b', 'orc-xz__total-valor'));
    erro.setAttribute('role', 'alert');
    li.appendChild(fala); li.appendChild(grupo); li.appendChild(total); li.appendChild(erro);
    K.inserir(li);
    li.setAttribute('data-toque-tardio', '');   /* (sempre depois das falas do servidor, também quando a página as redesenha) */
    s.li = li; s.grupo = grupo; s.total = total; s.erro = erro;
  }
  function cartao(x) {
    var b = K.el('button', 'orc-xz__op'), marca = K.el('span', 'orc-xz__marca'), nome = K.el('span', 'orc-xz__nome', x.nome), valor = K.el('span', 'orc-xz__valor');
    var frase = K.el('span', 'sr-only');
    b.type = 'button';
    b.setAttribute('data-extra', x.chave);
    marca.setAttribute('aria-hidden', 'true');
    nome.appendChild(frase);
    b.appendChild(marca); b.appendChild(nome); b.appendChild(valor);
    b.addEventListener('click', function () { alternar(x.chave); });
    return { botao: b, frase: frase, valor: valor, nome: x.nome, incluido: false };
  }
  /* desenha a resposta do servidor: os cartões que já existem ficam (o foco também); os que saíram da lista saem; os novos entram */
  function desenhar(r) {
    var extras = r && Array.isArray(r.extras) ? r.extras : [];
    s.versao = r ? r.versao : null;
    if (r && r.fatores) s.assinatura = assinaturaDe(r.fatores);
    if (!extras.length && !s.li) return;
    if (!s.li) montar();
    var vistos = {};
    extras.forEach(function (x, i) {
      var c = s.cartoes[x.chave] || (s.cartoes[x.chave] = cartao(x));
      vistos[x.chave] = true;
      c.incluido = x.incluido === true;
      c.botao.setAttribute('aria-pressed', String(c.incluido));
      c.botao.classList[x.indicado ? 'add' : 'remove']('is-indicado');
      c.valor.textContent = '+ ' + dinheiro(x.valor);
      c.frase.textContent = '. ' + (x.frase || '') + (x.indicado ? INDICADO : '');
      /* na ordem do servidor, mexendo no nó só se ele não está no lugar: mover o cartão tocado tiraria o foco dele */
      if (s.grupo.children[i] !== c.botao) s.grupo.insertBefore(c.botao, s.grupo.children[i] || null);
    });
    Object.keys(s.cartoes).forEach(function (k) { if (!vistos[k]) { s.cartoes[k].botao.remove(); delete s.cartoes[k]; } });
    s.li.hidden = !extras.length;
    if (r.total != null) mostrarTotal(dinheiro(r.total));
    s.total.hidden = r.total == null;
  }
  /* o número novo assenta com um passo curto (só transform/opacity, desligado com movimento reduzido, css/orcamento-extras-zero.css) */
  function mostrarTotal(texto) {
    var v = s.total.querySelector('.orc-xz__total-valor');
    var antes = v.textContent;
    v.textContent = texto;
    if (!antes || antes === texto) return;
    v.classList.remove('is-novo');
    void v.offsetWidth;   /* (recomeça a animação) */
    v.classList.add('is-novo');
  }
  function mostrarErro(texto) {
    s.erro.textContent = ' ';
    setTimeout(function () { if (s.erro.textContent === ' ') s.erro.textContent = texto; }, ERRO_MS);   /* (o alerta aparece e o texto entra depois: é lido) */
  }
  function ocupado(sim) {
    s.emVoo = sim;
    if (sim) s.grupo.setAttribute('aria-busy', 'true'); else s.grupo.removeAttribute('aria-busy');
    Object.keys(s.cartoes).forEach(function (k) { if (sim) s.cartoes[k].botao.setAttribute('aria-disabled', 'true'); else s.cartoes[k].botao.removeAttribute('aria-disabled'); });
  }

  /* ---------- a conversa com o servidor ---------- */
  function carregar() {
    if (s.carregando) return;
    s.carregando = true;
    API.extrasSugeridos().then(function (r) { s.carregando = false; if (!s.travado) desenhar(r); }, function () {
      /* (os extras são um acréscimo: sem eles, o preço e o "Quero" seguem. A próxima releitura do estado tenta de novo) */
      s.carregando = false; s.assinatura = null;
    });
  }
  function alternar(chave) {
    var c = s.cartoes[chave];
    if (!c || s.emVoo || s.travado) return;
    var incluir = !c.incluido;
    s.erro.textContent = '';
    c.botao.setAttribute('aria-pressed', String(incluir));   /* (o toque responde na hora; o preço só muda com a resposta do servidor) */
    ocupado(true);
    API.alternarExtra({ chave: chave, incluir: incluir, versao: s.versao }).then(function (r) {
      ocupado(false);
      desenhar(r);
      if (r && r.total != null) K.anunciar(c.nome + (incluir ? ' incluído' : ' retirado') + '. Total: ' + dinheiro(r.total) + '.');
      return ganchos.reler();
    }, function (e) {
      ocupado(false);
      c.botao.setAttribute('aria-pressed', String(c.incluido));
      mostrarErro((e && e.message) || FALHA);
      if (e && e.status === 409 && e.dados && e.dados.versao_nova !== undefined) carregar();   /* (a tabela mudou: os preços de agora) */
    });
  }
  /* depois dos detalhes do pedido (ou sem o consultor, ou fora das etapas do preço): os cartões ficam como registro do que foi incluído */
  function travar() {
    if (s.travado || !s.li) return;
    s.travado = true;
    Object.keys(s.cartoes).forEach(function (k) { s.cartoes[k].botao.disabled = true; });
  }

  window.BZExtrasZero = {
    /* a página (js/orcamento.js) chama a cada estado novo e quando o valor é liberado. g.reler: relê o estado depois de um toque que mudou o preço */
    atualizar: function (E, g) {
      if (g && typeof g.reler === 'function') ganchos = g;
      if (!abertos(E)) { if (E && E.conversa) travar(); return; }
      if (s.travado) return;
      var a = assinaturaDe(E.estimativa.fatores);
      if (a === s.assinatura || s.emVoo) return;   /* (a mesma estimativa que a tela já mostra; ou um toque em voo, que traz a dele) */
      s.assinatura = a;
      carregar();
    }
  };
})();
