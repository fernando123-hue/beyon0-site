/* ==========================================================================
   SEU PEDIDO (PR 3b-2; spec §1 e §3), no bloco #o-pronto de /orcamento.
   • Os 4 passos (entrada, material, prévia, no ar e restante) com a data que o SERVIDOR calculou (a regra da captação,
     fuso de Campo Grande); a tela nunca calcula prazo.
   • "Guarde o link do seu pedido": o servidor sorteia o código e o devolve UMA vez; aqui ele só vive na memória da página e
     num campo de leitura. Copiar usa a área de transferência; "Mandar para mim" usa o compartilhamento do próprio aparelho
     (navigator.share). NUNCA um href, um wa.me/?text= ou qualquer endereço de terceiro com o código dentro.
   • "Pôr na minha agenda": o arquivo .ics é feito AQUI, no aparelho, com a data prevista (sem nome nem contato).
   • "Gerar um link novo", "Continuar no computador" (retomada de 7 dias, uso único) e "Sair deste aparelho".
   Tudo que vem do servidor entra por textContent. Estado próprio: o código em memória, se já mostrou o cartão, se já pediu.
   ========================================================================== */
(function () {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var FUSO = 'America/Campo_Grande';
  var INDICE = { material: 2, producao: 3, previa: 3, ajustes: 3, aprovada: 4, no_ar: 4, suspensa: 4, concluida: 5, encerrada: 0 };
  var NOMES = ['Entrada paga', 'Seu material', 'Prévia do site', 'No ar e o restante'];
  var $ = function (id) { return document.getElementById(id); };

  /* "5 de novembro": o dia vem pronto do servidor (AAAA-MM-DD); o fuso do aparelho não entra */
  function dataPorExtenso(dia) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia || ''));
    return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] : '';
  }
  /* o dia de um instante, no fuso da captação (o aparelho pode estar em outro fuso) */
  function diaDoInstante(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  var linkDoPedido = function (origem, codigo) { return origem + '/orcamento#pedido=' + codigo; };
  var CHAVE_GUARDADO = 'bz-link-guardado';
  var FRASE_DESLIGADA = 'Recebemos a sua entrada. A Beyon Zero fala com você pelo WhatsApp para o próximo passo.';   /* = api/_material/interruptor.mjs */
  var TEXTO_COPIAR = 'Se o celular apagar os dados do site, é por este link que você volta ao pedido. Mande para você mesmo no WhatsApp ou salve nos favoritos.';
  var TEXTO_GERAR = 'Por segurança, o link só aparece uma vez, e este aparelho não o guardou. Gere um novo e guarde: o anterior deixa de valer.';
  /* o que o cartão do link mostra (M4): copiar o código que está na página; gerar outro se o link existe mas o código se perdeu; nada se já guardou */
  function modoDoCartao(o) {
    if (o.guardado) return 'nenhum';
    if (o.codigo) return 'copiar';
    return o.linkPedido ? 'gerar' : 'nenhum';
  }

  /* A1 (revisão): o material "aqui mesmo" só é prometido antes do pagamento quando o servidor diz que a entrega está ligada */
  function promessasVisiveis(E) { return !!E && E.entrega_ligada === true; }
  var PROMESSAS = ['o-antes-passos', 'o-faq-fotos', 'o-atalho-fotos'];

  function passos(e, valores) {
    var atual = INDICE[e.passo] || 2, v = valores || {};
    var enviado = e.material && e.material.enviado_em ? dataPorExtenso(diaDoInstante(e.material.enviado_em)) : '';
    var previsao = e.entrega_ate ? dataPorExtenso(e.entrega_ate) : '';
    var notas = ['',
      atual === 2 ? 'O prazo começa quando você enviar.' : 'Enviado' + (enviado ? ' em ' + enviado : '') + '.',
      atual === 3 ? (previsao ? 'Previsão do seu site: ' + previsao + '. Você vê a prévia aqui mesmo.' : 'Estamos preparando o seu site. Você vê a prévia aqui mesmo.') : '',
      ''];
    return NOMES.map(function (nome, i) {
      var n = i + 1;
      return { n: n, nome: nome, estado: n < atual ? 'feito' : n === atual ? 'agora' : 'depois', nota: notas[i],
        valor: n === 1 ? (v.entrada != null ? v.entrada : null) : n === 4 ? (v.restante != null ? v.restante : null) : null };
    });
  }

  /* a agenda: um evento de dia inteiro na data prevista (iCalendar). Sem nome, telefone ou e-mail */
  function arquivoCalendario(e, codigo, agora) {
    var dia = e && e.entrega_ate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return null;
    var seguinte = new Date(Date.parse(dia + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    var carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Beyon Zero//Pedido//PT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + e.id + '@beyonzero', 'DTSTAMP:' + carimbo, 'DTSTART;VALUE=DATE:' + dia.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + seguinte.replace(/-/g, ''),
      'SUMMARY:Previsão do site (Beyon Zero)', 'DESCRIPTION:Pedido ' + codigo + '. A prévia aparece na página do pedido.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  function criar(o) {
    var API = o.API, dinheiro = o.dinheiro;
    var codigo = null, pedindo = false, tentou = false, guardado = false, confirmando = null, jaTem = false, conversaId = null, marcaLida = false;
    var anunciar = function (t) { $('o-link-aviso').textContent = t; };
    /* "este aparelho já guardou o link" (M4): só a id da conversa no localStorage; sem armazenamento, o cartão aparece (no pior caso, a pessoa gera outro) */
    function lerMarca() { try { return localStorage.getItem(CHAVE_GUARDADO) === conversaId; } catch (e) { return false; } }
    function marcarGuardado() { guardado = true; try { localStorage.setItem(CHAVE_GUARDADO, conversaId); } catch (e) { /* sem armazenamento */ } }
    function desmarcarGuardado() { guardado = false; try { localStorage.removeItem(CHAVE_GUARDADO); } catch (e) { /* sem armazenamento */ } }

    function valoresDe(E) {
      var Pix = window.BZPix, pr = E.proposta;
      var entrada = Pix && pr ? Pix.valorDaEntrada(pr) : null;
      return entrada == null ? null : { entrada: entrada, restante: Math.round((Number(pr.valor_total) - entrada) * 100) / 100 };
    }
    function desenharPassos(lista) {
      var lis = $('o-ped-passos').children;
      lista.forEach(function (p, i) {
        var li = lis[i];
        li.className = 'orc-passo is-' + p.estado;
        if (p.estado === 'agora') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.children[0].textContent = p.estado === 'feito' ? '✓' : String(p.n);
        li.children[1].textContent = p.nome + (p.valor != null ? ' · ' + dinheiro(p.valor) : '');
        li.children[2].textContent = p.estado === 'feito' ? 'feito' : p.estado === 'agora' ? 'agora' : 'depois';
        li.children[3].textContent = p.nota;
      });
    }
    function copiar(texto, campo) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto);
      return new Promise(function (ok, no) { campo.focus(); campo.select(); try { document.execCommand('copy') ? ok() : no(new Error('copy')); } catch (e) { no(e); } });
    }
    function mostrarCartao() {
      var modo = modoDoCartao({ codigo: codigo, guardado: guardado, linkPedido: jaTem });
      $('o-link').hidden = modo === 'nenhum';
      if (modo === 'nenhum') return;
      var copiar = modo === 'copiar';
      $('o-link-titulo').textContent = copiar ? 'Guarde o link do seu pedido' : 'Você ainda não guardou o link do seu pedido';
      $('o-link-texto').textContent = copiar ? TEXTO_COPIAR : TEXTO_GERAR;
      $('o-link-campo').hidden = !copiar; $('o-link-acoes').hidden = !copiar; $('o-link-gerar').hidden = copiar;
      if (copiar) {
        $('o-link-campo').value = linkDoPedido(location.origin, codigo);
        $('o-link-enviar').hidden = typeof navigator.share !== 'function';
      }
    }    async function garantirLink(E) {
      if (E.entrega.link_pedido || pedindo || tentou) return;   /* já existe: o código em claro não volta */
      pedindo = tentou = true;
      try { var r = await API.linkPedido(false); if (r.criado) codigo = r.codigo; } catch (e) { /* sem link agora: o cartão não aparece; as outras ações seguem */ } finally { pedindo = false; }
      mostrarCartao();
    }
    function agenda(e, E) {
      var temData = /^\d{4}-\d{2}-\d{2}$/.test(String(e.entrega_ate));
      $('o-ped-agenda').hidden = !temData;
      $('o-agenda').onclick = function () {
        var texto = arquivoCalendario(e, E.pedido ? E.pedido.codigo : '', new Date());
        if (!texto) return;
        var url = URL.createObjectURL(new Blob([texto], { type: 'text/calendar;charset=utf-8' }));
        var a = document.createElement('a');
        a.href = url; a.download = 'previsao-do-site.ics';   /* (blob: do próprio aparelho; nenhum código nele) */
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      };
    }
    /* duas etapas para o que apaga acesso: o 1º toque pede a confirmação (lida pelo leitor de tela), o 2º executa */
    function comConfirmacao(botao, texto, fazer) {
      var original = botao.textContent;
      botao.onclick = async function () {
        if (confirmando !== botao) {
          if (confirmando) confirmando.textContent = confirmando.dataset.rotulo;
          confirmando = botao; botao.dataset.rotulo = original; botao.textContent = 'Confirmar: ' + original.toLowerCase();
          anunciar(texto); return;
        }
        confirmando = null; botao.textContent = original; anunciar('');
        try { await fazer(); } catch (e) { anunciar(e && e.message ? e.message : 'Não foi possível agora.'); }
      };
    }
    function ligarBotoes(E) {
      $('o-link-copiar').onclick = async function () {
        try { await copiar($('o-link-campo').value, $('o-link-campo')); marcarGuardado(); mostrarCartao(); anunciar('Link copiado. Cole numa conversa com você mesmo ou nos favoritos.'); }
        catch (e) { $('o-link-campo').focus(); $('o-link-campo').select(); anunciar('Não consegui copiar sozinho: o link está selecionado, copie com o dedo.'); }
      };
      $('o-link-enviar').onclick = async function () {
        try { await navigator.share({ title: 'Meu pedido na Beyon Zero', url: $('o-link-campo').value }); marcarGuardado(); mostrarCartao(); anunciar('Link enviado para você.'); }
        catch (e) { if (!e || e.name !== 'AbortError') anunciar('Não consegui abrir o compartilhamento: use "Copiar o link".'); }
      };
      comConfirmacao($('o-link-novo'), 'O link que você guardou deixa de funcionar. Toque de novo para gerar o novo.', async function () {
        var r = await API.linkPedido(true);
        codigo = r.codigo; desmarcarGuardado(); jaTem = true; mostrarCartao();
        anunciar('Link novo gerado. Guarde-o: o anterior não vale mais.');
        $('o-link').scrollIntoView({ block: 'start' });
      });
      $('o-link-gerar').onclick = async function () {   /* o link existe mas o código se perdeu: gera outro (o anterior deixa de valer) */
        try {
          var r = await API.linkPedido(true);
          codigo = r.codigo; desmarcarGuardado(); jaTem = true; mostrarCartao();
          anunciar('Link novo gerado. Guarde-o: o anterior não vale mais.');
        } catch (e) { anunciar(e && e.message ? e.message : 'Não foi possível agora.'); }
      };
      $('o-link-outro').onclick = async function () {
        try {
          var r = await API.outroAparelho(), campo = $('o-link-outro-campo');
          campo.hidden = false; campo.value = location.origin + '/orcamento#retomar=' + r.codigo;
          await copiar(campo.value, campo);
          anunciar('Link para o computador copiado. Vale 7 dias e abre uma vez só. Cole no navegador do computador.');
        } catch (e) { anunciar(e && e.message ? e.message : 'Não foi possível agora.'); }
      };
      comConfirmacao($('o-link-sair'), 'O link guardado deixa de funcionar e este aparelho esquece o pedido. Só faça isto num aparelho que não é seu. Para voltar depois, peça um link novo à Beyon Zero. Toque de novo para sair.', async function () {
        await API.sairDoAparelho();
        API.esquecer();
        location.reload();
      });
    }
    var ligado = false;
    function atualizar(E) {
      var e = E.entrega, pronto = !!e && E.conversa.etapa === 'em_producao';
      preencherAntes(E);
      PROMESSAS.forEach(function (id) { var el = $(id); if (el) el.hidden = !promessasVisiveis(E); });
      /* M5: o interruptor do servidor está desligado: nada de "Seu pedido" nem de material; o recibo diz o que acontece */
      var lead = document.querySelector('#o-recibo .recibo__lead');
      if (lead && !lead.dataset.padrao) lead.dataset.padrao = lead.textContent;
      if (E.entrega_ligada === false && E.conversa.etapa === 'em_producao') {
        $('o-pedido').hidden = true; $('o-material').hidden = true;
        if (lead) lead.textContent = FRASE_DESLIGADA;
        return;
      }
      if (lead && lead.dataset.padrao) lead.textContent = lead.dataset.padrao;
      if (!pronto) { $('o-pedido').hidden = true; $('o-material').hidden = true; return; }
      jaTem = !!e.link_pedido; conversaId = E.conversa.id;
      if (!marcaLida) { marcaLida = true; guardado = lerMarca(); }
      $('o-pedido').hidden = false;
      $('o-ped-codigo').textContent = E.pedido ? E.pedido.codigo : '';
      desenharPassos(passos(e, valoresDe(E)));
      agenda(e, E);
      if (!ligado) { ligado = true; ligarBotoes(E); }
      garantirLink(E);
      mostrarCartao();
      if (window.BZMaterial) window.BZMaterial.atualizar(E);
    }
    /* os passos ANTES de pagar (Task 17): a entrada e o restante saem da proposta, nunca de um número escrito à mão */
    function preencherAntes(E) {
      var Pix = window.BZPix, p = Pix && E.proposta ? Pix.percentuais(E.proposta) : null, ent = $('o-ap-entrada'), resto = $('o-ap-resto');
      if (!ent || !resto) return;
      var v = Pix && E.proposta ? Pix.valorDaEntrada(E.proposta) : null;
      ent.textContent = p && v != null ? '(' + p.entrada + '%: ' + dinheiro(v) + ')' : '';
      resto.textContent = p && v != null ? '(' + p.restante + '%: ' + dinheiro(Math.round((Number(E.proposta.valor_total) - v) * 100) / 100) + ')' : '';
    }
    return { atualizar: atualizar };
  }

  window.BZEntrega = { criar: criar, passos: passos, dataPorExtenso: dataPorExtenso, diaDoInstante: diaDoInstante, arquivoCalendario: arquivoCalendario, linkDoPedido: linkDoPedido,
    modoDoCartao: modoDoCartao, promessasVisiveis: promessasVisiveis, FRASE_DESLIGADA: FRASE_DESLIGADA };
})();
