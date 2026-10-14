/* ==========================================================================
   PAINEL › ESPERANDO CONFIRMAÇÃO (orçamento sem IA, PR 2a; spec §0 e §3). Os pedidos ainda não confirmados pelo
   WhatsApp, numa lista separada da fila de trabalho. O dono PROCURA o código que chegou ("Meu pedido é BZ-…"),
   confere se a mensagem veio do WhatsApp informado e toca em "Chegou: confirmar" (o pedido entra na fila e as
   três direções nascem) ou em "Descartar". Lê GET /api/painel?fila=pendentes[&codigo=]. O alarme aparece
   quando a lista cresce além do normal. Tudo que veio do visitante entra por textContent.
   ========================================================================== */
(function () {
  var P = window.BZPainel, C = window.BZPainelPedido;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !C || !$('pendentes')) return;
  var el = P.el;
  var busca = '';

  function cartao(p) {
    var c = el('div', 'pn__alerta pn__fila' + (p.suspeito ? ' pn__alerta--urgente' : ''));
    var texto = el('div', 'pn__fila-texto');
    texto.appendChild(el('p', 'pn__codigo', p.codigo));
    var s = C.selo(p.suspeito);
    if (s) texto.appendChild(s);
    texto.appendChild(el('p', 'pn__fila-nome', ((p.contato && p.contato.nome) || 'Sem nome') + ' · ' + C.negocio(p.negocio)));
    if (p.negocio && p.negocio.descricao) texto.appendChild(el('p', null, p.negocio.descricao));
    texto.appendChild(el('p', 'pn__dado', 'WhatsApp informado: ' + C.telefone(p.contato && p.contato.telefone) + '. Confira se a mensagem veio deste número.'));
    texto.appendChild(el('p', 'pn__dado', 'Pedido em ' + P.data(p.pedido_em) + ' · expira em ' + P.data(p.expira_em)));
    var r = C.redes(p.redes);
    if (r) texto.appendChild(r);
    c.appendChild(texto);
    var acoes = el('div', 'pn__fila-acoes');
    /* 2 toques, como Descartar e Arquivar (dono, 2026-10-14): confirmar põe o pedido na fila e, com a IA ligada, gasta
       (o aria-label começa pelo texto visível: WCAG 2.5.3) */
    acoes.appendChild(C.botaoDuplo('pn__btn', 'Chegou: confirmar', 'o pedido ' + p.codigo, function (b) {
      C.agir({ confirmar_whatsapp: p.conversa_id }, b, $('pendentes-estado'), 'Pedido ' + p.codigo + ' confirmado: entrou na fila.', p.codigo);
    }, 'confirmar'));
    acoes.appendChild(C.botaoDuplo('pn__btn pn__btn--fino', 'Descartar', 'o pedido ' + p.codigo, function (b) {
      C.agir({ descartar_pedido: p.conversa_id }, b, $('pendentes-estado'), 'Pedido ' + p.codigo + ' descartado.', p.codigo);
    }));
    c.appendChild(acoes);
    return c;
  }

  /* cada leitura tem a sua vez: resposta que chega depois de sair (ou de uma leitura mais nova) é descartada */
  var vez = 0;
  function carregar(aviso) {
    var minha = ++vez;
    $('pendentes-estado').textContent = 'Carregando…';
    P.pedir('?fila=pendentes' + (busca ? '&codigo=' + encodeURIComponent(busca) : '')).then(function (r) { return r.json(); }).then(function (r) {
      if (minha !== vez) return;
      var alvo = $('pendentes');
      alvo.textContent = '';
      $('bloco-pendentes').hidden = false;
      $('pendentes-alarme').hidden = !r.alarme;
      r.pendentes.forEach(function (p) { alvo.appendChild(cartao(p)); });
      var contagem = busca
        ? (r.pendentes.length ? 'Pedido ' + r.pendentes[0].codigo + ' esperando confirmação.' : 'Nenhum pedido esperando com esse código (pode ter expirado ou já ter sido confirmado).')
        : !r.pendentes.length ? 'Nenhum pedido esperando confirmação.'
        : r.total + (r.total === 1 ? ' pedido esperando' : ' pedidos esperando') + (r.truncada ? ' (mostrando os ' + r.pendentes.length + ' mais novos; procure pelo código)' : '') + '.';
      $('pendentes-estado').textContent = (typeof aviso === 'string' ? aviso + ' ' : '') + contagem;
    }).catch(function (e) {
      if (minha !== vez) return;
      if (P.recusada(e)) return;
      if (busca) $('pendentes').textContent = '';   /* (busca recusada, ex.: código mal formado: nada da lista de antes fica parecendo o resultado) */
      $('bloco-pendentes').hidden = false;
      $('pendentes-estado').textContent = e.message;
    });
  }
  /* o dono pode colar a mensagem inteira ("Meu pedido é BZ-K7M3Q"): fica só o código; sem "BZ" (digitado à mão), vale como está */
  var CODIGO_NO_TEXTO = /BZ-?([A-Z0-9]{5})/i;
  function codigoDoTexto(v) {
    var m = String(v).match(CODIGO_NO_TEXTO);
    return m ? 'BZ-' + m[1].toUpperCase() : String(v).trim();
  }
  /* saiu do painel: nome e telefone dos clientes não ficam na página */
  function esvaziar() {
    vez++;
    busca = '';
    $('pendentes-codigo').value = '';
    $('pendentes').textContent = '';
    $('pendentes-estado').textContent = '';
    $('pendentes-alarme').hidden = true;
    $('bloco-pendentes').hidden = true;
  }

  $('pendentes-busca').addEventListener('submit', function (ev) { ev.preventDefault(); busca = codigoDoTexto($('pendentes-codigo').value); $('pendentes-codigo').value = busca; carregar(); });
  $('pendentes-atualizar').addEventListener('click', function () { busca = ''; $('pendentes-codigo').value = ''; carregar(); });
  document.addEventListener('bz-painel:entrou', function () { carregar(); });
  document.addEventListener('bz-painel:saiu', esvaziar);
  document.addEventListener('bz-painel:pedidos-mudaram', function (ev) { busca = ''; $('pendentes-codigo').value = ''; carregar(ev.detail && ev.detail.aviso); });
})();
