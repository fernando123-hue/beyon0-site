/* ==========================================================================
   O RECIBO do sinal pago (#o-pronto na página /orcamento).
   Referência do dono (2026-10-07): o cartão "Currency Transfer" do Kokonut UI,
   refeito com a identidade da Beyon Zero (docs/design/referencias-2026-10-07-recibo.md).
   As duas partes do valor (o sinal pago agora e o restante na entrega) chegam
   separadas e se encaixam num recibo só; a luz passa na junção.
   • Só anima quando o pagamento acaba de ser confirmado NESTA tela; quem volta
     depois vê o recibo pronto, parado. Movimento reduzido: parado (css).
   • Não decide nada: valores da proposta e do servidor; o meio de pagamento e o
     código só aparecem com a tentativa APROVADA (app.pagamentos_estado).
   Uso: BZRecibo.criar({ API, dinheiro }) → { desenhar({ id, total, sinal, prazo } | null, animar) }
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var METODOS = { pix: 'Pix', cartao: 'Cartão' };
  var BANDEIRA = /^[a-z]{2,16}$/;   /* o id do meio no Mercado Pago (visa, master, elo...) */
  var CHEGADA_MS = 6000;            /* rede de segurança: a coreografia (css/orcamento.css, .recibo.is-chegando) dura 2,5 s */

  function quando(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function meioDe(t) {
    var nome = METODOS[t.metodo];
    if (t.metodo === 'cartao' && typeof t.meio === 'string' && BANDEIRA.test(t.meio)) nome += ' ' + t.meio.charAt(0).toUpperCase() + t.meio.slice(1);
    if (t.metodo === 'cartao' && Number.isInteger(t.parcelas) && t.parcelas > 1) nome += ' em ' + t.parcelas + 'x';
    return nome;
  }
  /* o código que a pessoa cita ao falar com a Beyon Zero: o começo do id da tentativa */
  function codigoDe(t) { return typeof t.id === 'string' && /^[0-9a-f]{8}/i.test(t.id) ? 'BZ-' + t.id.slice(0, 8).toUpperCase() : ''; }

  function criar(o) {
    var assinatura = null, versao = 0;

    /* o que vem do servidor depois: meio, data e código (sem eles, o recibo continua certo).
       Só a resposta do ÚLTIMO desenho escreve (uma mais velha que chegue depois é descartada) */
    async function detalhes() {
      var minha = ++versao, e;
      try { e = await o.API.pagamento(); } catch (err) { return; }
      if (minha !== versao) return;
      var t = e && e.tentativa, pg = e && e.pagamento;
      if (!pg || pg.status !== 'pago' || !t || t.status !== 'aprovada' || !METODOS[t.metodo]) return;
      $('o-rec-meio').textContent = [meioDe(t), quando(pg.pago_em)].filter(Boolean).join(' · ');
      $('o-rec-codigo-v').textContent = codigoDe(t);
    }

    /* r = { id, total, sinal, prazo } (a página tira da proposta e do pagamento); sem r, só o selo e o título */
    function desenhar(r, animar) {
      var nova = JSON.stringify(r || null);
      if (nova !== assinatura) {
        assinatura = nova;
        $('o-rec-codigo-v').textContent = '';   /* nada da proposta anterior fica na tela */
        $('o-rec-partes').hidden = !r;
        $('o-rec-total').hidden = !r;
        if (r) partes(r);
        detalhes();
      }
      if (animar) chegar();
    }
    function partes(r) {
      var restante = Math.max(0, Math.round((r.total - r.sinal) * 100) / 100);
      var pct = r.total > 0 ? Math.round(r.sinal / r.total * 100) : 100;   /* o chip sai do que foi PAGO, não do combinado */
      $('o-rec-pct-sinal').textContent = pct + '%';
      $('o-rec-sinal').textContent = o.dinheiro(r.sinal);
      $('o-rec-meio').textContent = 'Sinal do projeto';
      $('o-rec-pct-resto').textContent = (100 - pct) + '%';
      $('o-rec-resto').textContent = o.dinheiro(restante);
      $('o-rec-prazo').textContent = 'quando o site for entregue';
      $('o-rec-entrega').hidden = !(restante > 0);
      $('o-rec-partes').classList.toggle('is-unica', !(restante > 0));
      $('o-rec-total-v').textContent = 'Total do projeto ' + o.dinheiro(r.total);
      $('o-rec-total-prazo').textContent = 'entrega em até ' + r.prazo + (Number(r.prazo) === 1 ? ' dia' : ' dias');
    }

    /* a chegada: uma vez, quando o pagamento acaba de ser confirmado com a tela aberta. A classe sai no fim
       da última animação (o total); o relógio é só a rede de segurança (aba escondida, total sem animar) */
    function chegar() {
      var r = $('o-recibo'), fim = function () { clearTimeout(rede); r.classList.remove('is-chegando'); };
      var rede = setTimeout(fim, CHEGADA_MS);
      r.classList.add('is-chegando');
      $('o-rec-total').addEventListener('animationend', fim, { once: true });
      $('o-pronto').scrollIntoView({ block: 'start' });
      $('o-pronto-titulo').focus({ preventScroll: true });   /* o aviso do pagamento sumiu com o bloco dele: o foco leva o leitor de tela ao recibo */
    }

    return { desenhar: desenhar };
  }

  window.BZRecibo = { criar: criar };
})();
