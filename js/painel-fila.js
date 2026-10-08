/* ==========================================================================
   PAINEL › DIREÇÕES NA FILA (decisão do dono, 2026-10-08: as três direções
   são produzidas por ele no Claude Code, em até 24 horas úteis, e o cliente
   é avisado pelo WhatsApp com um toque). Lê GET /api/painel?fila=direcoes,
   mostra cada pedido e, com as TRÊS prontas, o link do WhatsApp do dono com
   a mensagem pronta e o "Já avisei" (POST avisado). Tudo que veio do
   visitante entra por textContent; o link do WhatsApp só leva dígitos; o
   nome só entra na mensagem se for um nome (sem link nem número).
   ========================================================================== */
(function () {
  var P = window.BZPainel;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !$('fila')) return;
  var el = P.el;
  var ALERTA_H = 20;   /* horas corridas: perto do prazo de 24 horas úteis */
  var NOMES = { conversao: 'conversão', autoridade: 'autoridade', experiencia: 'experiência' };
  var NOME_OK = /^[\p{L}'-]{1,20}$/u;
  var EMAIL_OK = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  var idCurto = function (id) { return String(id).slice(0, 8); };
  var primeiroNome = function (n) { var p = String(n || '').trim().split(/\s+/)[0] || ''; return NOME_OK.test(p) ? p : ''; };
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
  function mensagem(nome) {
    var oi = primeiroNome(nome) ? 'Oi, ' + primeiroNome(nome) + '!' : 'Oi!';
    return oi + ' Aqui é da Beyon Zero. As três direções do seu site ficaram prontas. É só abrir ' + location.origin +
      '/orcamento no mesmo aparelho em que você fez o orçamento, comparar e escolher a sua.';
  }
  /* telefone do banco em E.164 (+5521…): o link só leva os dígitos */
  var linkWhatsApp = function (tel, texto) { return 'https://wa.me/' + String(tel).replace(/\D/g, '') + '?text=' + encodeURIComponent(texto); };
  var linkEmail = function (email, texto) { return 'mailto:' + email + '?subject=' + encodeURIComponent('Suas direções de site estão prontas') + '&body=' + encodeURIComponent(texto); };

  function marcarAvisado(pedido, botao) {
    botao.disabled = true;
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avisado: pedido.conversa_id }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        carregar(r.avisadas ? null : 'Nada marcado: o pedido já tinha sido avisado (em outra aba?) ou ainda não está pronto.');
        $('t-fila').focus();
      })
      .catch(function (e) { $('fila-estado').textContent = e.message; botao.disabled = false; });
  }

  function botaoAviso(p) {
    var tel = p.contato && p.contato.telefone, email = p.contato && p.contato.email, quem = (p.contato && p.contato.nome) || 'o cliente';
    var a = el('a', 'pn__btn');
    if (tel) {
      a.href = linkWhatsApp(tel, mensagem(p.contato.nome));
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Avisar no WhatsApp';
      a.setAttribute('aria-label', 'Avisar ' + quem + ' no WhatsApp (abre em nova aba)');
      return a;
    }
    if (email && EMAIL_OK.test(email)) {
      a.href = linkEmail(email, mensagem(p.contato.nome));
      a.textContent = 'Avisar por e-mail';
      a.setAttribute('aria-label', 'Avisar ' + quem + ' por e-mail');
      return a;
    }
    return el('p', 'pn__fila-meta', 'Sem contato para avisar (apagado pela retenção?).');
  }

  function acoesDe(p, prontas) {
    var acoes = el('div', 'pn__fila-acoes');
    var naFila = p.direcoes.some(function (d) { return d.status === 'gerando'; });
    if (naFila) {
      acoes.appendChild(el('p', 'pn__fila-meta', 'No Claude Code: "produzir as direções do pedido ' + idCurto(p.conversa_id) + '".'));
      return acoes;
    }
    if (prontas < p.direcoes.length) {
      acoes.appendChild(el('p', 'pn__fila-meta', 'Uma direção falhou (no modo da API): o cliente pode gerar de novo na página dele. Não avise ainda.'));
      return acoes;
    }
    acoes.appendChild(botaoAviso(p));
    var feito = el('button', 'pn__btn pn__btn--fino', 'Já avisei');
    feito.type = 'button';
    feito.setAttribute('aria-label', 'Já avisei ' + ((p.contato && p.contato.nome) || 'o cliente'));
    feito.addEventListener('click', function () { marcarAvisado(p, feito); });
    acoes.appendChild(feito);
    return acoes;
  }

  function cartao(p) {
    var prontas = p.direcoes.filter(function (d) { return d.status === 'pronta'; }).length;
    var horas = horasDesde(p.pedido_em);
    var atrasando = prontas < p.direcoes.length && horas >= ALERTA_H;
    var c = el('div', 'pn__alerta pn__fila' + (atrasando ? ' pn__alerta--urgente' : ''));
    var texto = el('div', 'pn__fila-texto');
    texto.appendChild(el('p', 'pn__fila-nome', (p.contato && p.contato.nome) || 'Sem nome'));
    texto.appendChild(el('p', null, negocio(p.briefing) + (p.fatores && p.fatores.formato ? ' · ' + p.fatores.formato.replace('_', ' ') : '')));
    texto.appendChild(el('p', 'pn__fila-meta', (atrasando ? 'Passa de ' + ALERTA_H + ' h · ' : '') + 'Pedido em ' + P.data(p.pedido_em) + ' (há ' + Math.floor(horas) + ' h) · ' + prontas + ' de ' + p.direcoes.length + ' prontas: ' +
      p.direcoes.map(function (d) { return (NOMES[d.estrategia] || d.estrategia) + (d.status === 'pronta' ? ' ✓' : d.status === 'falhou' ? ' ✗' : ''); }).join(', ')));
    texto.appendChild(el('p', 'pn__fila-meta', 'Pedido ' + idCurto(p.conversa_id)));
    c.appendChild(texto);
    c.appendChild(acoesDe(p, prontas));
    return c;
  }

  function carregar(aviso) {
    $('fila-estado').textContent = 'Carregando a fila…';
    P.pedir('?fila=direcoes').then(function (r) { return r.json(); }).then(function (r) {
      var alvo = $('fila');
      alvo.textContent = '';
      $('bloco-fila').hidden = false;
      r.fila.forEach(function (p) { alvo.appendChild(cartao(p)); });
      var contagem = !r.fila.length ? 'Nenhum pedido na fila.'
        : r.total + (r.total === 1 ? ' pedido' : ' pedidos') + (r.truncada ? ' (mostrando os ' + r.fila.length + ' mais antigos)' : '') + '.';
      $('fila-estado').textContent = (typeof aviso === 'string' ? aviso + ' ' : '') + contagem;
    }).catch(function (e) { $('bloco-fila').hidden = false; $('fila-estado').textContent = e.message; });
  }
  /* saiu do painel: nome e telefone dos clientes não ficam na página */
  function esvaziar() { $('fila').textContent = ''; $('fila-estado').textContent = ''; $('bloco-fila').hidden = true; }

  document.addEventListener('bz-painel:entrou', function () { carregar(); });
  document.addEventListener('bz-painel:saiu', esvaziar);
  $('fila-atualizar').addEventListener('click', function () { carregar(); });
})();
