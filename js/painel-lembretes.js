/* ==========================================================================
   PAINEL › LEMBRETES (PR 2b-2; spec §3: "um lembrete para 2 dias depois do 'pronto' (envio manual)"). Lê
   GET /api/painel?fila=lembretes: os pedidos avisados há 2 dias ou mais, ainda sem escolha e sem lembrete. Cada um
   tem o lembrete com um link de retomada NOVO (o do aviso pode ter vencido ou sido usado em outro aparelho) e o "Já
   lembrei" (POST lembrado). Tudo que veio do visitante entra por textContent.
   ========================================================================== */
(function () {
  var P = window.BZPainel, C = window.BZPainelPedido;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !C || !$('lembretes')) return;
  var el = P.el;

  function marcar(l, botao) {
    botao.disabled = true;
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lembrado: l.conversa_id }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { carregar(r.lembrados ? 'Lembrete marcado.' : 'Nada marcado: já estava lembrado (em outra aba?).'); $('t-lembretes').focus(); })
      .catch(function (e) { if (P.recusada(e)) return; $('lembretes-estado').textContent = e.message; botao.disabled = false; });
  }

  function cartao(l) {
    var c = el('div', 'pn__alerta pn__fila');
    var texto = el('div', 'pn__fila-texto');
    if (l.codigo) texto.appendChild(el('p', 'pn__codigo', l.codigo));
    texto.appendChild(el('p', 'pn__fila-nome', (l.contato && l.contato.nome) || 'Sem nome'));
    texto.appendChild(el('p', 'pn__fila-meta', 'Avisado em ' + P.data(l.avisado_em) + ', ainda sem escolha.'));
    texto.appendChild(el('p', 'pn__dado', 'WhatsApp ' + C.telefone(l.contato && l.contato.telefone)));
    c.appendChild(texto);
    var acoes = el('div', 'pn__fila-acoes');
    acoes.appendChild(C.avisoComLink({ conversaId: l.conversa_id, contato: l.contato || {}, rotulo: 'lembrete', assunto: 'Seus modelos de site estão esperando',
      texto: function (link) { return 'Aqui é da Beyon Zero. Passando para lembrar: os três modelos do seu site estão esperando a sua escolha. Este link abre o seu pedido em qualquer aparelho (vale por 7 dias): ' + link; } }));
    var feito = el('button', 'pn__btn pn__btn--fino', 'Já lembrei');
    feito.type = 'button';
    feito.setAttribute('aria-label', 'Já lembrei ' + ((l.contato && l.contato.nome) || 'o cliente'));
    feito.addEventListener('click', function () { marcar(l, feito); });
    acoes.appendChild(feito);
    c.appendChild(acoes);
    return c;
  }

  /* cada leitura tem a sua vez: resposta que chega depois de sair (ou de uma leitura mais nova) é descartada */
  var vez = 0;
  function carregar(aviso) {
    var minha = ++vez;
    $('lembretes-estado').textContent = 'Carregando os lembretes…';
    P.pedir('?fila=lembretes').then(function (r) { return r.json(); }).then(function (r) {
      if (minha !== vez) return;
      var alvo = $('lembretes');
      alvo.textContent = '';
      $('bloco-lembretes').hidden = false;
      r.lembretes.forEach(function (l) { alvo.appendChild(cartao(l)); });
      var contagem = !r.lembretes.length ? 'Nenhum lembrete para mandar hoje.' : r.total + (r.total === 1 ? ' lembrete para mandar.' : ' lembretes para mandar.');
      $('lembretes-estado').textContent = (typeof aviso === 'string' ? aviso + ' ' : '') + contagem;
    }).catch(function (e) { if (minha !== vez) return; if (P.recusada(e)) return; $('bloco-lembretes').hidden = false; $('lembretes-estado').textContent = e.message; });
  }
  /* saiu do painel: nome, telefone e links dos clientes não ficam na página (e nenhuma leitura em voo os traz de volta) */
  function esvaziar() { vez++; $('lembretes').textContent = ''; $('lembretes-estado').textContent = ''; $('bloco-lembretes').hidden = true; }

  document.addEventListener('bz-painel:entrou', function () { carregar(); });
  document.addEventListener('bz-painel:saiu', esvaziar);
  $('lembretes-atualizar').addEventListener('click', function () { carregar(); });
})();
