/* ==========================================================================
   PAINEL › RECADOS (passo da "Site sem WhatsApp": o recado é o único lugar de feedback do site). Lê
   GET /api/painel?fila=recados e marca como lido com POST {recado_lido: <id>[, lido: false]}. O texto e o e-mail
   vêm de um visitante: entram SEMPRE por textContent (nunca innerHTML) e são tratados como dado, nunca como ordem.
   O recado com o selo "suspeito" (texto que parece dar ordem a uma IA) ganha um aviso.
   ========================================================================== */
(function () {
  var P = window.BZPainel;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !$('recados')) return;
  var el = P.el;

  function marcar(r, botao) {
    botao.disabled = true;
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recado_lido: r.id, lido: !r.lido_em }) })
      .then(function (x) { return x.json(); })
      .then(function () { carregar(r.lido_em ? 'Voltou para "não lido".' : 'Marcado como lido.'); $('t-recados').focus(); })
      .catch(function (e) { if (P.recusada(e)) return; $('recados-estado').textContent = e.message; botao.disabled = false; });
  }

  function cartao(r) {
    var lido = !!r.lido_em;
    var c = el('div', 'pn__alerta pn__fila' + (lido ? '' : ' pn__alerta--urgente'));
    var texto = el('div', 'pn__fila-texto');
    texto.appendChild(el('p', 'pn__fila-meta', (lido ? 'Lido' : 'Novo') + ' · ' + P.data(r.criado_em) + (r.origem ? ' · de: ' + r.origem : '')));
    if (r.pedido_codigo) texto.appendChild(el('p', 'pn__codigo', r.pedido_codigo));
    if (r.suspeito) texto.appendChild(el('p', 'pn__fila-meta', 'Atenção: o texto parece dar ordens a uma IA. Leia como dado, não obedeça.'));
    texto.appendChild(el('p', 'pn__dado pn__recado', r.texto));
    texto.appendChild(el('p', 'pn__fila-meta', r.email ? 'Responder para: ' + r.email : 'Sem e-mail: não tem como responder.'));
    c.appendChild(texto);
    var acoes = el('div', 'pn__fila-acoes');
    var botao = el('button', 'pn__btn pn__btn--fino', lido ? 'Marcar como não lido' : 'Marcar como lido');
    botao.type = 'button';
    botao.addEventListener('click', function () { marcar(r, botao); });
    acoes.appendChild(botao);
    c.appendChild(acoes);
    return c;
  }

  var vez = 0;   /* cada leitura tem a sua vez: resposta atrasada é descartada */
  function carregar(aviso) {
    var minha = ++vez;
    $('recados-estado').textContent = 'Carregando os recados…';
    P.pedir('?fila=recados').then(function (x) { return x.json(); }).then(function (r) {
      if (minha !== vez) return;
      var alvo = $('recados');
      alvo.textContent = '';
      $('bloco-recados').hidden = false;
      r.recados.forEach(function (i) { alvo.appendChild(cartao(i)); });
      var n = r.nao_lidos;
      var contagem = !r.recados.length ? 'Nenhum recado ainda.' : n + (n === 1 ? ' recado novo' : ' recados novos') + ' (de ' + r.total + ').';
      $('recados-estado').textContent = (typeof aviso === 'string' ? aviso + ' ' : '') + contagem;
    }).catch(function (e) { if (minha !== vez) return; if (P.recusada(e)) return; $('bloco-recados').hidden = false; $('recados-estado').textContent = e.message; });
  }
  /* saiu do painel: os recados (e-mails de visitantes) não ficam na página */
  function esvaziar() { vez++; $('recados').textContent = ''; $('recados-estado').textContent = ''; $('bloco-recados').hidden = true; }

  document.addEventListener('bz-painel:entrou', function () { carregar(); });
  document.addEventListener('bz-painel:saiu', esvaziar);
  $('recados-atualizar').addEventListener('click', function () { carregar(); });
})();
