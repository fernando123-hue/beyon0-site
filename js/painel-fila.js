/* ==========================================================================
   PAINEL › DIREÇÕES NA FILA (decisão do dono, 2026-10-08: as três direções
   são produzidas por ele no Claude Code, em até 24 horas úteis, e o cliente
   é avisado pelo WhatsApp com um toque). Lê GET /api/painel?fila=direcoes,
   mostra cada pedido e, com as TRÊS prontas, o "Preparar aviso" (PR 2b-2: um
   toque gera o link de retomada e libera o WhatsApp do dono com a mensagem
   pronta, em js/painel-pedido-comum.js) e o "Já avisei" (POST avisado). Tudo
   que veio do visitante entra por textContent.
   ========================================================================== */
(function () {
  var P = window.BZPainel, C = window.BZPainelPedido;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !C || !$('fila')) return;
  var el = P.el;
  var ALERTA_H = 20;   /* horas corridas: perto do prazo de 24 horas úteis */
  var NOMES = { conversao: 'conversão', autoridade: 'autoridade', experiencia: 'experiência' };
  /* os nomes de formato, os mesmos da tela de perguntas (js/orcamento-perguntas.js, NOMES) */
  var FORMATOS = { landing_page: 'Site de uma página', institucional: 'Site com várias páginas', sob_medida: 'Site com visual exclusivo', loja_plataforma: 'Loja virtual' };

  var idCurto = function (id) { return String(id).slice(0, 8); };
  var horasDesde = function (iso) { return Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5); };
  /* corta no último espaço antes do limite, com reticências (texto livre do visitante) */
  var curto = function (t, max) {
    t = String(t);
    if (t.length <= max) return t;
    var c = t.slice(0, max), espaco = c.lastIndexOf(' ');
    return c.slice(0, espaco > 40 ? espaco : max).replace(/[\s,.;:]+$/, '') + '…';
  };
  var negocio = function (b) {
    var n = (b && b.negocio) || {};
    return [n.nome, n.segmento, n.cidade].filter(Boolean).join(' · ') || (n.descricao ? curto(n.descricao, 90) : 'Negócio sem descrição');
  };
  function marcarAvisado(pedido, botao) {
    botao.disabled = true;
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avisado: pedido.conversa_id }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        carregar(r.avisadas ? null : 'Nada marcado: o pedido já tinha sido avisado (em outra aba?) ou ainda não está pronto.');
        $('t-fila').focus();
      })
      .catch(function (e) { if (P.recusada(e)) return; $('fila-estado').textContent = e.message; botao.disabled = false; });
  }

  function botaoAviso(p) {
    return C.avisoComLink({ conversaId: p.conversa_id, contato: p.contato || {}, rotulo: 'aviso', assunto: 'Os modelos do seu site estão prontos',
      texto: function (link) { return 'Aqui é o Fernando, da Beyon Zero. Os três modelos do seu site ficaram prontos. Abra este link para ver, comparar e escolher (vale por 7 dias e abre em qualquer aparelho): ' + link; } });
  }

  function acoesDe(p, prontas) {
    var acoes = el('div', 'pn__fila-acoes');
    var naFila = p.direcoes.some(function (d) { return d.status === 'gerando'; });
    if (naFila) acoes.appendChild(el('p', 'pn__fila-meta', 'No Claude Code: "produzir as direções do pedido ' + idCurto(p.conversa_id) + '".'));
    else if (!p.direcoes.length) acoes.appendChild(el('p', 'pn__fila-meta', 'Nenhuma direção neste pedido ainda: não há o que avisar.'));   /* (sem direção, "prontas = total = 0" não pode virar um aviso falso) */
    else if (prontas < p.direcoes.length) acoes.appendChild(el('p', 'pn__fila-meta', 'Uma direção falhou (no modo da API): o cliente pode gerar de novo na página dele. Não avise ainda.'));
    else {
      acoes.appendChild(botaoAviso(p));
      var feito = el('button', 'pn__btn pn__btn--fino', 'Já avisei');
      feito.type = 'button';
      feito.setAttribute('aria-label', 'Já avisei ' + ((p.contato && p.contato.nome) || 'o cliente'));
      feito.addEventListener('click', function () { marcarAvisado(p, feito); });
      acoes.appendChild(feito);
    }
    /* (PR 2a) tirar da fila: arquivar (resolvido por fora) ou descartar (encerra e para a geração), com um segundo toque */
    var rotulo = 'o pedido ' + (p.codigo || idCurto(p.conversa_id));
    acoes.appendChild(C.botaoDuplo('pn__btn pn__btn--fino', 'Arquivar', rotulo, function (b) { C.agir({ arquivar_pedido: p.conversa_id }, b, $('fila-estado'), 'Pedido ' + (p.codigo || '') + ' arquivado.', p.codigo); }));
    acoes.appendChild(C.botaoDuplo('pn__btn pn__btn--fino', 'Descartar', rotulo, function (b) { C.agir({ descartar_pedido: p.conversa_id }, b, $('fila-estado'), 'Pedido ' + (p.codigo || '') + ' descartado.', p.codigo); }));
    return acoes;
  }

  function cartao(p) {
    var prontas = p.direcoes.filter(function (d) { return d.status === 'pronta'; }).length;
    var horas = horasDesde(p.pedido_em);
    var atrasando = prontas < p.direcoes.length && horas >= ALERTA_H;
    var c = el('div', 'pn__alerta pn__fila' + (atrasando ? ' pn__alerta--urgente' : ''));
    var texto = el('div', 'pn__fila-texto');
    if (p.codigo) {
      texto.appendChild(el('p', 'pn__codigo', p.codigo));
      texto.appendChild(el('p', 'pn__status', p.prioridade === 1 ? 'Pronto para avisar' : 'A produzir'));
    }
    var selo = C.selo(p.suspeito);
    if (selo) texto.appendChild(selo);
    texto.appendChild(el('p', 'pn__fila-nome', (p.contato && p.contato.nome) || 'Sem nome'));
    var formato = p.fatores && Object.prototype.hasOwnProperty.call(FORMATOS, p.fatores.formato) ? FORMATOS[p.fatores.formato] : '';
    texto.appendChild(el('p', null, negocio(p.briefing) + (formato ? ' · ' + formato : '')));
    var andamento = prontas + ' de ' + p.direcoes.length + ' prontas' + (p.direcoes.length
      ? ': ' + p.direcoes.map(function (d) { return (NOMES[d.estrategia] || d.estrategia) + (d.status === 'pronta' ? ' ✓' : d.status === 'falhou' ? ' ✗' : ''); }).join(', ')
      : '.');
    texto.appendChild(el('p', 'pn__fila-meta', (atrasando ? 'Passa de ' + ALERTA_H + ' h · ' : '') + 'Pedido em ' + P.data(p.pedido_em) + ' (há ' + Math.floor(horas) + ' h) · ' + andamento));
    texto.appendChild(el('p', 'pn__dado', 'WhatsApp ' + C.telefone(p.contato && p.contato.telefone)));
    texto.appendChild(el('p', 'pn__fila-id', 'Pedido ' + idCurto(p.conversa_id)));
    var redes = C.redes(p.redes);
    if (redes) texto.appendChild(redes);
    c.appendChild(texto);
    c.appendChild(acoesDe(p, prontas));
    return c;
  }

  /* cada leitura tem a sua vez: resposta que chega depois de sair (ou de uma leitura mais nova) é descartada */
  var vez = 0;
  function carregar(aviso) {
    var minha = ++vez;
    $('fila-estado').textContent = 'Carregando a fila…';
    P.pedir('?fila=direcoes').then(function (r) { return r.json(); }).then(function (r) {
      if (minha !== vez) return;
      var alvo = $('fila');
      alvo.textContent = '';
      $('bloco-fila').hidden = false;
      $('fila-alarme').hidden = !r.alarme;
      r.fila.forEach(function (p) { alvo.appendChild(cartao(p)); });
      var contagem = !r.fila.length ? 'Nenhum pedido confirmado na fila.'
        : r.total + (r.total === 1 ? ' pedido confirmado' : ' pedidos confirmados') + ', por prioridade.';
      $('fila-estado').textContent = (typeof aviso === 'string' ? aviso + ' ' : '') + contagem;
    }).catch(function (e) { if (minha !== vez) return; if (P.recusada(e)) return; $('bloco-fila').hidden = false; $('fila-estado').textContent = e.message; });
  }
  /* saiu do painel: nome e telefone dos clientes não ficam na página (e nenhuma leitura em voo os traz de volta) */
  function esvaziar() { vez++; $('fila').textContent = ''; $('fila-estado').textContent = ''; $('fila-alarme').hidden = true; $('bloco-fila').hidden = true; }

  document.addEventListener('bz-painel:entrou', function () { carregar(); });
  document.addEventListener('bz-painel:saiu', esvaziar);
  document.addEventListener('bz-painel:pedidos-mudaram', function (ev) { carregar(ev.detail && ev.detail.aviso); });
  $('fila-atualizar').addEventListener('click', function () { carregar(); });
})();
