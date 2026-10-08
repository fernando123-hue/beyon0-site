/* ==========================================================================
   PAINEL › DIREÇÕES NA FILA (decisão do dono, 2026-10-08: as três direções
   são produzidas por ele no Claude Code, em até 24 horas úteis, e o cliente
   é avisado pelo WhatsApp com um toque). Lê GET /api/painel?fila=direcoes,
   mostra cada pedido e, com as três prontas, o link do WhatsApp do dono com
   a mensagem pronta e o "Já avisei" (POST avisado). Tudo que veio do
   visitante entra por textContent; o link do WhatsApp só leva dígitos.
   ========================================================================== */
(function () {
  var P = window.BZPainel;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !$('fila')) return;
  var el = P.el;
  var ALERTA_H = 20;   /* horas corridas: perto do prazo de 24 horas úteis */
  var NOMES = { conversao: 'conversão', autoridade: 'autoridade', experiencia: 'experiência' };

  var primeiroNome = function (n) { return String(n || '').trim().split(/\s+/)[0] || ''; };
  /* corta no último espaço antes do limite, com reticências (texto livre do visitante) */
  var curto = function (t, max) {
    t = String(t);
    if (t.length <= max) return t;
    var c = t.slice(0, max), espaco = c.lastIndexOf(' ');
    return c.slice(0, espaco > 40 ? espaco : max).replace(/[\s,.;:]+$/, '') + '…';
  };
  var horasDesde = function (iso) { return Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5); };
  var negocio = function (b) {
    var n = (b && b.negocio) || {};
    return [n.nome, n.segmento, n.cidade].filter(Boolean).join(' · ') || (n.descricao ? curto(n.descricao, 90) : 'Negócio sem descrição');
  };
  function mensagem(nome) {
    var oi = primeiroNome(nome) ? 'Oi, ' + primeiroNome(nome) + '!' : 'Oi!';
    return oi + ' Aqui é da Beyon Zero. As três direções do seu site ficaram prontas. É só abrir ' + location.origin +
      '/orcamento no mesmo aparelho em que você fez o orçamento, comparar e escolher a sua.';
  }
  /* telefone do banco em E.164 (+5521…): o link só leva os dígitos */
  var linkWhatsApp = function (tel, texto) { return 'https://wa.me/' + String(tel).replace(/\D/g, '') + '?text=' + encodeURIComponent(texto); };
  var linkEmail = function (email, texto) { return 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent('Suas direções de site estão prontas') + '&body=' + encodeURIComponent(texto); };

  function marcarAvisado(pedido, botao) {
    botao.disabled = true;
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avisado: pedido.conversa_id }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.avisadas) { $('fila-estado').textContent = 'Nada marcado: as direções desse pedido ainda não estão prontas.'; botao.disabled = false; return; }
        carregar();
      })
      .catch(function (e) { $('fila-estado').textContent = e.message; botao.disabled = false; });
  }

  function cartao(p) {
    var prontas = p.direcoes.filter(function (d) { return d.status === 'pronta'; }).length;
    var naFila = p.direcoes.some(function (d) { return d.status === 'gerando'; });
    var horas = horasDesde(p.pedido_em);
    var c = el('div', 'pn__alerta pn__fila' + (naFila && horas >= ALERTA_H ? ' pn__alerta--urgente' : ''));
    var texto = el('div', 'pn__fila-texto');
    texto.appendChild(el('p', 'pn__fila-nome', (p.contato && p.contato.nome) || 'Sem nome'));
    texto.appendChild(el('p', null, negocio(p.briefing) + (p.fatores && p.fatores.formato ? ' · ' + p.fatores.formato.replace('_', ' ') : '')));
    texto.appendChild(el('p', 'pn__fila-meta', 'Pedido em ' + P.data(p.pedido_em) + ' (há ' + Math.floor(horas) + ' h) · ' + prontas + ' de ' + p.direcoes.length + ' prontas: ' +
      p.direcoes.map(function (d) { return (NOMES[d.estrategia] || d.estrategia) + (d.status === 'pronta' ? ' ✓' : d.status === 'falhou' ? ' ✗' : ''); }).join(', ')));
    texto.appendChild(el('p', 'pn__fila-meta', 'Pedido ' + p.conversa_id.slice(0, 8)));
    c.appendChild(texto);
    var acoes = el('div', 'pn__fila-acoes');
    if (naFila) {
      acoes.appendChild(el('p', 'pn__fila-meta', 'No Claude Code: "produzir as direções do pedido ' + p.conversa_id.slice(0, 8) + '".'));
    } else {
      var tel = p.contato && p.contato.telefone, email = p.contato && p.contato.email;
      var aviso = el('a', 'pn__btn');
      aviso.rel = 'noopener noreferrer';
      aviso.target = '_blank';
      if (tel) { aviso.href = linkWhatsApp(tel, mensagem(p.contato.nome)); aviso.textContent = 'Avisar no WhatsApp'; }
      else if (email) { aviso.href = linkEmail(email, mensagem(p.contato.nome)); aviso.textContent = 'Avisar por e-mail'; }
      if (tel || email) acoes.appendChild(aviso);
      else acoes.appendChild(el('p', 'pn__fila-meta', 'Sem contato para avisar (apagado pela retenção?).'));
      var feito = el('button', 'pn__btn pn__btn--fino', 'Já avisei');
      feito.type = 'button';
      feito.addEventListener('click', function () { marcarAvisado(p, feito); });
      acoes.appendChild(feito);
    }
    c.appendChild(acoes);
    return c;
  }

  function carregar() {
    $('fila-estado').textContent = 'Carregando a fila…';
    P.pedir('?fila=direcoes').then(function (r) { return r.json(); }).then(function (r) {
      var alvo = $('fila');
      alvo.textContent = '';
      $('bloco-fila').hidden = false;
      if (!r.fila.length) { $('fila-estado').textContent = 'Nenhum pedido na fila.'; return; }
      r.fila.forEach(function (p) { alvo.appendChild(cartao(p)); });
      $('fila-estado').textContent = r.total + (r.total === 1 ? ' pedido' : ' pedidos') + (r.truncada ? ' (mostrando os ' + r.fila.length + ' mais antigos)' : '') + '.';
    }).catch(function (e) { $('bloco-fila').hidden = false; $('fila-estado').textContent = e.message; });
  }

  document.addEventListener('bz-painel:entrou', carregar);
  $('fila-atualizar').addEventListener('click', carregar);
})();
