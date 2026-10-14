/* ==========================================================================
   OS DETALHES E A CONFIRMAÇÃO PELO WHATSAPP (spec docs/specs/2026-10-11-orcamento-sem-ia.md §3 e §0; PR 2a).
   Depois de "Quero os três modelos": uma tela com o nome do negócio, o que vende (sugestões pelo ramo) e o
   WhatsApp, mais o que a pessoa quiser contar. O servidor redige, confere e grava o pedido com um código
   (BZ-K7M3Q); a pessoa confirma escrevendo para o WhatsApp da Beyon Zero com o texto pronto, e o dono marca
   "confirmado" no painel. O link leva só o número de js/tel.js e o código que o servidor devolveu.
   Nada digitado aqui fica guardado no navegador (decisão D7). Todo texto por textContent.
   ========================================================================== */
(function () {
  'use strict';
  var API = window.BZOrcamento;
  var $ = function (id) { return document.getElementById(id); };
  if (!API || !$('o-detalhes-form')) return;
  var TEL = window.BEYON_TEL || '5521977167944';   /* (reserva consciente, como em js/pagina.js: grep 5521977167944) */
  var CODIGO = /^BZ-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/;
  /* sugestões pelo ramo das perguntas (o "segmento" do briefing é o nome de tela do ramo, api/_vendas/catalogo.mjs) */
  var SUGESTOES = {
    'serviços': ['Conserto e manutenção', 'Consultoria', 'Instalação', 'Atendimento em casa'],
    'saúde': ['Consultas', 'Exames', 'Fisioterapia', 'Tratamentos estéticos'],
    'beleza': ['Corte e escova', 'Unhas', 'Barba', 'Estética facial'],
    'alimentação': ['Marmitas', 'Doces e bolos', 'Lanches', 'Encomendas para festas'],
    'comércio': ['Roupas', 'Material de construção', 'Presentes', 'Peças e acessórios'],
    'educação': ['Aulas particulares', 'Cursos livres', 'Reforço escolar', 'Idiomas'],
    'associação': ['Atividades para associados', 'Eventos', 'Cursos', 'Atendimento jurídico']
  };
  var GERAIS = ['Serviços', 'Produtos', 'Encomendas'];
  var REDES = { instagram: 'o-d-instagram', facebook: 'o-d-facebook', tiktok: 'o-d-tiktok', youtube: 'o-d-youtube', linkedin: 'o-d-linkedin' };
  var CAMPOS = ['o-d-negocio', 'o-d-vende', 'o-tel', 'o-nome', 'o-d-publico', 'o-d-diferencial', 'o-d-admira', 'o-d-redes-ok', 'o-aceite']
    .concat(Object.keys(REDES).map(function (k) { return REDES[k]; }));
  var FIM = {
    expirado: 'Passaram 72 horas sem a confirmação pelo WhatsApp, então o pedido saiu da fila. Faça um orçamento novo ou fale com a Beyon Zero pelo WhatsApp.',
    descartado: 'Este pedido foi encerrado. Se quiser seguir, faça um orçamento novo ou fale com a Beyon Zero pelo WhatsApp.'
  };
  var segmentoVisto = null;
  /* a sessão recusada de vez (401): a página avisa "Sua sessão terminou" e oferece recomeçar, como no contato antigo */
  var ganchos = { sessaoTerminou: function () { return false; }, avisarSessao: function () {} };

  function valor(id) { return $(id).value.trim(); }
  /* o erro ligado ao campo: só ele ganha aria-invalid e aponta para a mensagem; ao corrigir, solta */
  function marcarErro(id, msg) {
    CAMPOS.forEach(function (c) { $(c).removeAttribute('aria-invalid'); $(c).removeAttribute('aria-describedby'); });
    $('o-contato-erro').textContent = msg || '';
    if (!id) return;
    $(id).setAttribute('aria-invalid', 'true');
    $(id).setAttribute('aria-describedby', 'o-contato-erro');
    var dentro = $(id).closest('details');   /* (o campo de uma rede fica dentro de "Outras redes": abre antes de focar) */
    if (dentro) dentro.open = true;
    $(id).focus();
  }
  CAMPOS.forEach(function (c) {
    var soltar = function () { if ($(c).getAttribute('aria-invalid') === 'true') { $(c).removeAttribute('aria-invalid'); $(c).removeAttribute('aria-describedby'); } };
    $(c).addEventListener('input', soltar);
    $(c).addEventListener('change', soltar);
  });

  function sugestoes(segmento) {
    if (segmento === segmentoVisto) return;
    segmentoVisto = segmento;
    var caixa = $('o-d-sugestoes');
    caixa.textContent = '';
    (Object.prototype.hasOwnProperty.call(SUGESTOES, segmento) ? SUGESTOES[segmento] : GERAIS).forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = s;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var atual = valor('o-d-vende'), partes = atual ? atual.split(/,\s*/) : [];
        var i = partes.indexOf(s);
        if (i >= 0) partes.splice(i, 1); else partes.push(s);
        var novo = partes.join(', ');
        if (novo.length > 200) return;
        $('o-d-vende').value = novo;
        b.setAttribute('aria-pressed', String(i < 0));
      });
      caixa.appendChild(b);
    });
  }
  function redes() {
    var r = {};
    Object.keys(REDES).forEach(function (k) { var v = valor(REDES[k]); if (v) r[k] = v; });
    return r;
  }
  function dados() {
    return { negocio: valor('o-d-negocio'), vende: valor('o-d-vende'), telefone: valor('o-tel'), nome: valor('o-nome'),
      publico: valor('o-d-publico'), diferencial: valor('o-d-diferencial'), admira: valor('o-d-admira'),
      redes: redes(), autoriza_redes: $('o-d-redes-ok').checked, aceite: $('o-aceite').checked };
  }
  /* o que a tela já sabe recusar (o servidor confere tudo de novo) */
  function recusa(d) {
    if (d.negocio.length < 2) return ['o-d-negocio', 'Informe o nome do negócio.'];
    if (d.vende.length < 3) return ['o-d-vende', 'Conte o que você vende (pode tocar numa sugestão).'];
    if (d.telefone.replace(/\D/g, '').length < 10) return ['o-tel', 'Informe o seu WhatsApp com DDD: é por ele que você confirma o pedido.'];
    if (Object.keys(d.redes).length && !d.autoriza_redes) return ['o-d-redes-ok', 'Para eu olhar as suas redes, marque a autorização (ou deixe as redes em branco).'];
    if (!d.aceite) return ['o-aceite', 'É preciso concordar com o uso dos dados para receber os modelos.'];
    return null;
  }
  /* a recusa do servidor também aponta o campo, quando diz qual. A ordem importa: os nomes mais específicos
     ("o que diferencia o seu negócio", "para quem você vende") vêm antes de "negócio" e "vende" */
  var CAMPO_DA_REDE = [[/instagram/i, 'o-d-instagram'], [/facebook/i, 'o-d-facebook'], [/tiktok/i, 'o-d-tiktok'], [/youtube/i, 'o-d-youtube'], [/linkedin/i, 'o-d-linkedin']];
  var CAMPO_DO_TEXTO = [[/whatsapp|telefone/i, 'o-tel'], [/autoriza/i, 'o-d-redes-ok'], [/diferencia/i, 'o-d-diferencial'], [/para quem/i, 'o-d-publico'],
    [/chamado/i, 'o-nome'], [/admira/i, 'o-d-admira'], [/redes?/i, 'o-d-instagram'], [/vende/i, 'o-d-vende'], [/neg[óo]cio/i, 'o-d-negocio'], [/concordar/i, 'o-aceite']];
  function campoDaMensagem(m) {
    var lista = CAMPO_DA_REDE.concat(CAMPO_DO_TEXTO);
    for (var i = 0; i < lista.length; i++) if (lista[i][0].test(m)) return lista[i][1];
    return null;
  }

  $('o-detalhes-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var form = this;
    if (form.getAttribute('aria-busy') === 'true') return;
    var d = dados(), ruim = recusa(d);
    if (ruim) { marcarErro(ruim[0], ruim[1]); return; }
    marcarErro(null, '');
    form.setAttribute('aria-busy', 'true');
    try {
      var r = await API.detalhes(d);
      document.dispatchEvent(new CustomEvent('bz:detalhes-enviados', { detail: { codigo: r.codigo } }));
    } catch (e) {
      if (ganchos.sessaoTerminou(e)) { ganchos.avisarSessao(); return; }
      if (e && e.dados && e.dados.fila_cheia) { $('o-fila-cheia').hidden = false; form.hidden = true; $('o-fila-cheia').focus(); return; }   /* (o foco não se perde com o formulário escondido) */
      var m = (e && e.message) || 'Não consegui guardar agora. Tente de novo ou fale com a Beyon Zero pelo WhatsApp.';
      marcarErro(e && e.status === 400 ? campoDaMensagem(m) : null, m);
    } finally { form.removeAttribute('aria-busy'); }
  });

  function prazo(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return 'Você tem 72 horas: sem a confirmação até ' + d.toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ', o pedido expira e sai da fila.';
  }
  /* a tela segue o estado do servidor: o formulário (antes do pedido), a confirmação (aguardando) ou o fim */
  function atualizar(E) {
    var pedido = E && E.pedido;
    var formulario = !!E && !E.conversa.tem_contato && !!E.estimativa && !pedido;
    $('o-contato').hidden = !formulario;
    $('o-fila-cheia').hidden = !(formulario && E.fila_cheia);
    $('o-detalhes-form').hidden = formulario && !!E.fila_cheia;
    if (formulario) sugestoes((E.conversa.briefing && E.conversa.briefing.negocio && E.conversa.briefing.negocio.segmento) || '');
    var aguardando = !!pedido && pedido.status === 'aguardando' && CODIGO.test(pedido.codigo);
    $('o-confirmar').hidden = !aguardando;
    if (aguardando) {
      $('o-confirmar-codigo').textContent = pedido.codigo;
      $('o-confirmar-wa').href = 'https://wa.me/' + String(TEL).replace(/\D/g, '') + '?text=' + encodeURIComponent('Meu pedido é ' + pedido.codigo);
      $('o-confirmar-prazo').textContent = prazo(pedido.expira_em);
    }
    var fim = !!pedido && Object.prototype.hasOwnProperty.call(FIM, pedido.status);
    $('o-pedido-fim').hidden = !fim;
    if (fim) $('o-pedido-fim-texto').textContent = FIM[pedido.status];
  }
  /* o pedido ainda não pode gerar modelos (esperando a confirmação, vencido ou encerrado) */
  function pendente(E) { return !!(E && E.pedido && E.pedido.status !== 'confirmado' && E.pedido.status !== 'arquivado'); }
  function iniciar(g) { if (g && typeof g.sessaoTerminou === 'function' && typeof g.avisarSessao === 'function') ganchos = g; }

  window.BZDetalhes = { iniciar: iniciar, atualizar: atualizar, pendente: pendente };
})();
