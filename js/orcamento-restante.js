/* ==========================================================================
   O PASSO 4 (PR 3b-3; spec §3, §4, §5; D4): o site no ar, o Pix do restante, o pedido concluído e o encerrado.
   • O endereço do site só vira link se passar na MESMA regra do servidor (problemaDoSite em api/_entrega/enderecos.mjs: a regra de link do esquema + https puro, sem caminho);
     o que se abre é a origem. Sem o esquema carregado, nada abre. Só a.href e textContent.
   • O restante é o registro que o banco criou, quando ele já existe; senão total − entrada PAGA, em centavos exatos (o banco faz a mesma conta e é quem cobra). Sem a proposta,
     sem o percentual dela ou sem a entrada paga, a tela NÃO cobra (a falha fechada do 3b-1).
   • O Pix é o MESMO componente da entrada (js/orcamento-pagamento.js): a seção #o-pagamento muda de lugar, não se copia. Só Pix: o componente RECEBE `metodos: ['pix']`
     (B6), qualquer que seja MP_METODOS; o seletor de cartão nunca aparece (nada de mostrar e esconder depois, que pisca). O que só vale antes da entrada some pela classe
     `is-restante` do #o-pagamento (css/orcamento-previa.css).
   • Os 3 dias do restante contam do aviso "seu site está no ar" REGISTRADO pelo dono (22/10): a tela mostra o prazo a partir do 2º dia (os lembretes do 2º e do 3º dia o dono manda
     por fora, com a mensagem pronta do painel; a tela só acompanha). D4: a frase dos 3 dias está sempre.
   Tudo que vem do servidor entra por textContent. Global: BZRestante.
   ========================================================================== */
(function () {
  'use strict';
  var LEMBRETES = [2, 3];   /* = lembretes_restante (2º e 3º dia, decisão do dono de 22/10) */
  var LIMITE_PADRAO = 3;    /* os dias do restante; o servidor manda o seu em site.limite_dias */
  var $ = function (id) { return document.getElementById(id); };
  var nada = function () { /* a espera do Pix é do componente: se a chamada falhar, ele mostra o seu aviso */ };

  /* o mesmo veredito de problemaDoSite (api/_entrega/enderecos.mjs), com a regra de link do esquema; devolve a origem (sem a barra final) ou null */
  function hrefDoSite(url) {
    var ESQ = window.BZMaterialEsquema;
    if (typeof url !== 'string' || !url || !ESQ || ESQ.problemaDoLink(url)) return null;
    var u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    if (u.pathname !== '/' || u.search || u.hash) return null;
    return u.origin;
  }

  var centavos = function (v) { return Math.round(Number(v) * 100); };
  var daParcela = function (pagamentos, parcela, status) {
    return (pagamentos || []).filter(function (p) { return p.parcela === parcela && p.status === status; })[0] || null;
  };
  /* o que o Pix cobra: o registro do restante que o banco já criou (pendente) ou, antes dele, a mesma conta do banco: valor_total − entrada PAGA.
     Entrada registrada mas não paga (estornada, contestada…): o banco recusa, a tela não cobra. Sem registro nenhum da entrada, a conta da proposta */
  function valorDoRestante(pr, pagamentos) {
    var Pix = window.BZPix, total = pr ? Number(pr.valor_total) : NaN;
    if (!Pix || !pr || !Pix.percentuais(pr) || !(total > 0)) return null;
    var saldo = daParcela(pagamentos, 'saldo', 'pendente');
    if (saldo) return centavos(saldo.valor) > 0 ? centavos(saldo.valor) / 100 : null;
    var temEntrada = (pagamentos || []).some(function (p) { return p.parcela === 'sinal'; });
    var paga = daParcela(pagamentos, 'sinal', 'pago');
    if (temEntrada && !paga) return null;
    var resto = centavos(total) - (paga ? centavos(paga.valor) : centavos(Pix.valorDaEntrada(pr)));
    return resto > 0 ? resto / 100 : null;
  }

  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  /* o aviso da tela, a partir do aviso "no ar" REGISTRADO pelo dono (dias = dias corridos desde ele, o dia do aviso é 0; nulo = ainda não registrou): sem contagem antes do 2º dia */
  function avisoDoRestante(dias, limite, passo) {
    if (passo === 'suspensa') return 'Seu site saiu do ar porque o restante não foi pago em ' + limite + ' dias. Quando o pagamento cair, a Beyon Zero coloca o site no ar de novo.';
    if (dias == null || dias < LEMBRETES[0]) return '';
    if (dias > limite) return 'O prazo do restante terminou. Pague agora para o site não sair do ar.';
    if (dias === limite) return 'Hoje é o último dia do prazo do restante. À meia-noite, sem o pagamento, o site sai do ar.';
    var faltam = limite - dias + 1;   /* contando hoje */
    return (faltam === 1 ? 'Falta ' : 'Faltam ') + plural(faltam, 'dia', 'dias') + ' para o prazo do restante, contando hoje.';
  }

  /* o recibo final: só com a entrada E o restante pagos, os valores do banco */
  function dadosDoFim(pr, pagamentos) {
    var e = daParcela(pagamentos, 'sinal', 'pago'), r = daParcela(pagamentos, 'saldo', 'pago');
    return pr && e && r ? { total: Number(pr.valor_total), entrada: Number(e.valor), restante: Number(r.valor) } : null;
  }

  function criar(o) {
    var dinheiro = o.dinheiro, tela = o.telaPagamento || null, movido = false, chavePix = null, antes = null;

    function endereco(url, idTexto, idLink) {
      var href = hrefDoSite(url);
      $(idTexto).textContent = url || '';
      $(idLink).hidden = !href;
      if (href) $(idLink).href = href;
    }
    function pedirOPix(E, pag) {
      var valor = valorDoRestante(E.proposta, E.pagamentos), pct = window.BZPix && E.proposta ? window.BZPix.percentuais(E.proposta) : null;
      pag.hidden = false;
      $('o-pag-titulo').textContent = 'Falta o restante';
      if (valor == null || !pct || !tela) {   /* falha fechada: sem valor conferido ou sem a tela do Pix, não cobra */
        chavePix = null;
        $('o-pag-lead').textContent = 'Não consegui conferir o valor do restante agora. O WhatsApp está logo abaixo.';
        $('o-pag-form').hidden = true; $('o-pag-indisponivel').hidden = true;
        return;
      }
      $('o-pag-lead').textContent = dinheiro(valor) + ', ' + pct.restante + '% do total. O pagamento é só por Pix, aqui mesmo.';
      var chave = valor + '|' + pct.restante;
      if (chave === chavePix) return;   /* a mesma situação: o componente já está esperando (cada leitura da página não abre outra consulta) */
      chavePix = chave;
      var r = tela.mostrar(valor, pct.restante, { metodos: ['pix'] });   /* só Pix, qualquer que seja MP_METODOS: o componente já nasce sem o seletor (B6) */
      if (r && typeof r.catch === 'function') r.catch(nada);
    }
    function noAr(E) {
      var e = E.entrega, pag = $('o-pagamento');
      var ativo = !!e && E.conversa.etapa === 'em_producao' && (e.passo === 'no_ar' || e.passo === 'suspensa');
      $('o-noar').hidden = !ativo;
      pag.classList.toggle('is-restante', ativo);
      if (!ativo) { chavePix = null; return false; }
      if (!movido) { $('o-noar').after(pag); movido = true; }   /* decisão G: o mesmo componente da entrada, logo depois do "no ar" */
      var s = e.site || {};
      $('o-noar-titulo').textContent = e.passo === 'suspensa' ? 'Seu site saiu do ar' : 'Seu site está no ar';
      endereco(s.url, 'o-noar-endereco', 'o-noar-abrir');
      var aviso = avisoDoRestante(s.dias_do_aviso, Number(s.limite_dias) || LIMITE_PADRAO, e.passo);
      $('o-noar-aviso').textContent = aviso; $('o-noar-aviso').hidden = !aviso;
      pedirOPix(E, pag);
      return true;
    }
    /* o fim: concluído (as duas partes ✓) ou encerrado */
    function fim(E) {
      var e = E.entrega, encerrada = E.conversa.etapa === 'encerrada';
      var concluido = !!e && encerrada && e.passo === 'concluida', encerrado = !!e && encerrada && e.passo === 'encerrada';
      $('o-fim').hidden = !(concluido || encerrado);
      $('o-fim-concluido').hidden = !concluido; $('o-fim-encerrado').hidden = !encerrado;
      if (concluido) {
        var d = dadosDoFim(E.proposta, E.pagamentos);
        $('o-fim-entrada').textContent = d ? dinheiro(d.entrada) : ''; $('o-fim-restante').textContent = d ? dinheiro(d.restante) : ''; $('o-fim-total').textContent = d ? dinheiro(d.total) : '';
        $('o-fim-partes').hidden = !d;
        endereco((e.site || {}).url, 'o-fim-endereco', 'o-fim-abrir');
      }
      if (concluido || encerrado) {
        if (tela && typeof tela.parar === 'function') tela.parar();   /* o Pix pago já parou a espera; o fim garante */
        $('o-pagamento').hidden = true;
      }
      return concluido || encerrado;
    }
    /* o foco só se move na virada (o Pix que tinha o foco sumiu); numa página que já abre concluída, quem rola e foca é a retomada */
    function cuidarDoFoco(agora, titulo) {
      var a = document.activeElement;
      if (antes === 'noar' && agora === 'fim' && (!a || a === document.body || a.offsetParent === null)) $(titulo).focus();
      antes = agora;
    }

    /* devolve true quando o pedido terminou (concluído ou encerrado): a página esconde o resto */
    function atualizar(E) {
      var terminou = fim(E), no = noAr(E);
      if (terminou) cuidarDoFoco('fim', E.entrega.passo === 'concluida' ? 'o-fim-titulo' : 'o-fim-encerrado-titulo'); else cuidarDoFoco(no ? 'noar' : 'nada');
      return terminou;
    }
    return { atualizar: atualizar };
  }

  window.BZRestante = { criar: criar, hrefDoSite: hrefDoSite, valorDoRestante: valorDoRestante, avisoDoRestante: avisoDoRestante, dadosDoFim: dadosDoFim, LEMBRETES: LEMBRETES };
})();
