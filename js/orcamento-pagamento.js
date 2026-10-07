/* ==========================================================================
   PAGAMENTO DO SINAL na página /orcamento — Pix ou cartão, no próprio site.
   O que esta tela NÃO faz (de propósito):
   • não define valor: o servidor tira da proposta aceita;
   • não decide "pago": só mostra o que o servidor diz (que consultou o
     Mercado Pago); voltar para a página ou um redirecionamento não liberam nada;
   • não vê o cartão: número, validade e código ficam em iframes do Mercado
     Pago (campos seguros); daqui sai só um token de uso único.
   O SDK do Mercado Pago (sdk.mercadopago.com/js/v2) só é carregado quando a
   pessoa escolhe cartão. No servidor local ("simulado"), não há SDK: o nome
   do titular de teste decide o resultado (APRO, OTHE, FUND, CONT, CHAL).
   Uso: BZPagamentoTela.criar({ API, avisar, mensagemDe, dinheiro, aoPagar })
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SDK = 'https://sdk.mercadopago.com/js/v2';
  var ESPERA_MS = 5000;
  var MENSAGENS = {
    bad_filled_card_data: 'Algum dado do cartão não confere. Confira e tente de novo.',
    insufficient_amount: 'O cartão não tem limite para este valor.',
    card_insufficient_amount: 'O cartão não tem limite para este valor.',
    rejected_by_issuer: 'O banco do cartão recusou. Tente outro cartão ou o Pix.',
    required_call_for_authorize: 'O banco pede que você autorize o pagamento com ele antes.',
    card_disabled: 'Este cartão está bloqueado. Tente outro cartão ou o Pix.',
    high_risk: 'O pagamento não passou na análise de segurança. Tente o Pix.',
    max_attempts_exceeded: 'Muitas tentativas com este cartão. Tente outro ou o Pix.',
    invalid_installments: 'Esse número de parcelas não está disponível para este cartão.',
    '3ds_challenge_expired': 'A confirmação com o banco expirou. Tente de novo.'
  };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function mostrar(id, sim) { $(id).hidden = !sim; }

  function criar(o) {
    var trocando = false, cfg = null, valor = 0, metodo = 'pix', espera = null, mp = null, campos = null, cartaoInfo = null, enviando = false, ultimoEstado = '';

    /* ---------- configuração pública (Public Key e ambiente) ---------- */
    async function configurar() {
      if (cfg) return cfg;
      try { cfg = await o.API.pagamentoConfig(); } catch (e) { cfg = { ativo: false }; }
      return cfg;
    }

    /* ---------- escolha do meio ---------- */
    function escolherMetodo(m) {
      metodo = m;
      [].forEach.call(document.querySelectorAll('[data-metodo]'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-metodo') === m)); });
      mostrar('o-pag-cartao', m === 'cartao');
      $('o-pag-enviar').textContent = m === 'pix' ? 'Gerar o Pix de ' + o.dinheiro(valor) : 'Pagar ' + o.dinheiro(valor) + ' no cartão';
      $('o-pag-erro').textContent = '';
      if (m === 'cartao') prepararCartao();
    }
    [].forEach.call(document.querySelectorAll('[data-metodo]'), function (b) {
      b.addEventListener('click', function () { escolherMetodo(b.getAttribute('data-metodo')); });
      b.addEventListener('keydown', function (ev) {   /* grupo de rádio: setas trocam */
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft' && ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
        ev.preventDefault();
        var outro = document.querySelector('[data-metodo="' + (b.getAttribute('data-metodo') === 'pix' ? 'cartao' : 'pix') + '"]');
        outro.focus(); escolherMetodo(outro.getAttribute('data-metodo'));
      });
    });

    /* ---------- cartão: campos seguros do Mercado Pago (ou o modo local) ---------- */
    function carregarSdk() {
      if (window.MercadoPago) return Promise.resolve();
      return new Promise(function (ok, falha) {
        var s = document.createElement('script');
        s.src = SDK; s.async = true;
        s.onload = ok; s.onerror = function () { falha(new Error('sdk')); };
        document.head.appendChild(s);
      });
    }
    async function prepararCartao() {
      if (campos || !cfg || !cfg.ativo) return;
      if (cfg.ambiente === 'simulado') { campos = 'simulado'; mostrar('o-pag-local', true); mostrar('o-pag-campos', false); parcelasLocais(); return; }
      mostrar('o-pag-local', false);
      $('o-pag-carregando').textContent = 'Carregando os campos seguros do Mercado Pago…';
      try { await carregarSdk(); } catch (e) { $('o-pag-carregando').textContent = 'Não foi possível carregar o pagamento com cartão. Use o Pix ou tente de novo.'; return; }
      /* advancedFraudPrevention injeta script inline (medido: bloqueado pela CSP sem 'unsafe-inline'); trackingDisabled: sem métrica de uso do SDK */
      mp = new window.MercadoPago(cfg.publicKey, { locale: 'pt-BR', advancedFraudPrevention: false, trackingDisabled: true });
      var estilo = { color: '#F2F4F4', placeholderColor: '#858C8C', fontSize: '16px' };
      campos = {
        numero: mp.fields.create('cardNumber', { placeholder: '0000 0000 0000 0000', style: estilo, srLabel: 'Número do cartão', ariaRequired: true }).mount('o-mp-numero'),
        validade: mp.fields.create('expirationDate', { placeholder: 'MM/AA', mode: 'short', style: estilo, srLabel: 'Validade', ariaRequired: true }).mount('o-mp-validade'),
        cvv: mp.fields.create('securityCode', { placeholder: 'CVV', style: estilo, srLabel: 'Código de segurança', ariaRequired: true }).mount('o-mp-cvv')
      };
      $('o-pag-carregando').textContent = '';
      campos.numero.on('binChange', async function (d) {
        cartaoInfo = null;
        if (!d.bin) { $('o-parcelas').textContent = ''; return; }
        try {
          var pm = (await mp.getPaymentMethods({ bin: d.bin })).results[0];
          if (!pm) return;
          cartaoInfo = { meio: pm.id, tipo: pm.payment_type_id };
          var cs = pm.settings && pm.settings[0] && pm.settings[0].security_code;
          if (cs) campos.cvv.update({ settings: { mode: cs.mode, length: cs.length } });
          var opcoes = await mp.getInstallments({ amount: Number(valor).toFixed(2), bin: d.bin, paymentTypeId: pm.payment_type_id });
          var sel = $('o-parcelas'); sel.textContent = '';
          ((opcoes[0] && opcoes[0].payer_costs) || []).filter(function (c) { return c.installments <= 12; }).forEach(function (c) {
            var op = el('option', '', c.recommended_message); op.value = String(c.installments); sel.appendChild(op);
          });
        } catch (e) { $('o-pag-erro').textContent = 'Não foi possível reconhecer o cartão. Confira o número.'; }
      });
    }
    function parcelasLocais() {
      var sel = $('o-parcelas'); sel.textContent = '';
      [1, 2, 3].forEach(function (n) { var op = el('option', '', n + 'x de ' + o.dinheiro(valor / n) + ' (simulado)'); op.value = String(n); sel.appendChild(op); });
    }
    async function tokenDoCartao(pagador) {
      if (campos === 'simulado') {
        var nome = ($('o-titular').value || '').trim().toUpperCase();
        if (!/^[A-Z]{4}$/.test(nome)) throw new Error('No modo local, use um nome de teste: APRO, OTHE, FUND, CONT ou CHAL.');
        return { token: 'local-' + nome + '-' + Math.random().toString(36).slice(2, 10), meio: 'visa', tipo: 'credit_card', parcelas: Number($('o-parcelas').value || 1) };
      }
      if (!campos || !cartaoInfo) throw new Error('Confira o número do cartão.');
      var titular = ($('o-titular').value || '').trim();
      if (titular.length < 3) throw new Error('Informe o nome impresso no cartão.');
      var tk = await mp.fields.createCardToken({ cardholderName: titular, identificationType: pagador.documento.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ', identificationNumber: pagador.documento.replace(/\D/g, '') });
      if (!tk || !tk.id) throw new Error('Os dados do cartão não foram validados. Confira e tente de novo.');
      return { token: tk.id, meio: cartaoInfo.meio, tipo: cartaoInfo.tipo, parcelas: cartaoInfo.tipo === 'debit_card' ? 1 : Number($('o-parcelas').value || 1) };
    }

    /* ---------- enviar ---------- */
    function pagadorDoFormulario() {
      return { nome: $('o-pag-nome').value.trim(), sobrenome: $('o-pag-sobrenome').value.trim(), email: $('o-pag-email').value.trim(), documento: $('o-pag-doc').value.trim() };
    }
    function validarLocal(p) {
      if (p.nome.length < 2) return ['o-pag-nome', 'Informe o nome.'];
      if (p.sobrenome.length < 1) return ['o-pag-sobrenome', 'Informe o sobrenome.'];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(p.email)) return ['o-pag-email', 'Informe um e-mail válido.'];
      var d = p.documento.replace(/\D/g, '');
      if (d.length !== 11 && d.length !== 14) return ['o-pag-doc', 'Informe o CPF ou o CNPJ.'];
      return null;
    }
    $('o-pag-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (enviando) return;
      var erro = $('o-pag-erro'), pagador = pagadorDoFormulario(), ruim = validarLocal(pagador);
      if (ruim) { erro.textContent = ruim[1]; $(ruim[0]).focus(); return; }
      erro.textContent = '';
      enviando = true; $('o-pag-enviar').disabled = true; $('o-pag-form').setAttribute('aria-busy', 'true');
      $('o-pag-status').textContent = metodo === 'pix' ? 'Gerando o Pix…' : 'Enviando ao Mercado Pago…';
      try {
        var cartao = metodo === 'cartao' ? await tokenDoCartao(pagador) : undefined;
        desenhar(await o.API.pagar(metodo, pagador, cartao));
      } catch (e) {
        $('o-pag-status').textContent = '';
        if (e && e.status === 503 && e.dados && e.dados.aguarde) { $('o-pag-status').textContent = e.message; esperar(); }
        else erro.textContent = (e && e.message) || 'Não foi possível concluir agora. Tente de novo.';
      } finally { enviando = false; $('o-pag-enviar').disabled = false; $('o-pag-form').removeAttribute('aria-busy'); }
    });

    /* ---------- o estado (vem do servidor) ---------- */
    function minutosAte(iso) {
      var ms = new Date(iso).getTime() - Date.now();
      if (!(ms > 0)) return 'expirado';
      var m = Math.ceil(ms / 60000);
      return 'expira em ' + m + (m === 1 ? ' minuto' : ' minutos');
    }
    function desenharPix(t) {
      var img = $('o-pix-qr');
      if (t.pix_qr_base64 && /^[A-Za-z0-9+/=]+$/.test(t.pix_qr_base64)) { img.src = 'data:image/png;base64,' + t.pix_qr_base64; img.hidden = false; }
      else img.hidden = true;
      $('o-pix-codigo').value = t.pix_qr || '';
      $('o-pix-expira').textContent = t.expira_em ? minutosAte(t.expira_em) : '';
      mostrar('o-pix-simular', cfg && cfg.ambiente === 'simulado');
    }
    function desenhar(e) {
      if (!e || !e.pagamento) { mostrar('o-pix', false); mostrar('o-desafio', false); mostrar('o-pag-form', true); return; }
      var t = e.tentativa;
      var chave = JSON.stringify([e.pagamento.status, t && t.status, t && t.id, t && t.expira_em]);
      if (e.pagamento.status === 'pago') { pararEspera(); $('o-pag-status').textContent = 'Pagamento confirmado pelo Mercado Pago.'; if (chave !== ultimoEstado) { ultimoEstado = chave; o.aoPagar(); } return; }
      ultimoEstado = chave;
      var ativo = t && ['criada', 'processando', 'aguardando', 'requer_acao'].indexOf(t.status) >= 0;
      mostrar('o-pix', !!(t && t.status === 'aguardando' && t.metodo === 'pix'));
      mostrar('o-desafio', !!(t && t.status === 'requer_acao' && t.desafio_url));
      var pixAberto = !!(t && t.status === 'aguardando' && t.metodo === 'pix');
      mostrar('o-pag-form', !ativo || (pixAberto && trocando));   /* com Pix aberto, o formulário só volta se a pessoa quiser o cartão */
      if (t && t.status === 'aguardando' && t.metodo === 'pix') desenharPix(t);
      if (t && t.status === 'requer_acao' && t.desafio_url) $('o-desafio-link').href = t.desafio_url;
      var st = $('o-pag-status');
      if (!t) st.textContent = '';
      else if (t.status === 'aguardando') st.textContent = 'Aguardando o pagamento do Pix. Esta tela atualiza sozinha quando o Mercado Pago confirmar.';
      else if (t.status === 'processando' || t.status === 'criada') st.textContent = 'O Mercado Pago está analisando o pagamento. Esta tela atualiza sozinha.';
      else if (t.status === 'requer_acao') st.textContent = 'Falta a confirmação no seu banco.';
      else if (t.status === 'recusada') st.textContent = MENSAGENS[t.detalhe] || 'O pagamento não foi aprovado. Tente de novo, use outro cartão ou o Pix.';
      else if (t.status === 'expirada') st.textContent = 'O Pix expirou. Gere um novo.';
      else if (t.status === 'cancelada') st.textContent = '';
      else st.textContent = 'Situação do pagamento em verificação. Fale com a Beyon Zero se precisar.';
      if (ativo) esperar(); else pararEspera();
    }
    function esperar() {
      if (espera) return;
      espera = setInterval(async function () {
        if (document.hidden) return;
        try { desenhar(await o.API.pagamento()); } catch (e) { /* tenta na próxima */ }
      }, ESPERA_MS);
    }
    function pararEspera() { clearInterval(espera); espera = null; }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && espera) o.API.pagamento().then(desenhar).catch(function () {});
    });

    $('o-pix-copiar').addEventListener('click', async function () {
      var b = this;
      try { await navigator.clipboard.writeText($('o-pix-codigo').value); b.textContent = 'Copiado'; }
      catch (e) { $('o-pix-codigo').select(); b.textContent = 'Selecionado: copie com Ctrl+C'; }
      setTimeout(function () { b.textContent = 'Copiar o código'; }, 2500);
    });
    /* modo local: o simulador "paga" o Pix (ou conclui o 3DS) e o aviso assinado passa pelo caminho real */
    async function simularLocal(acao) {
      var e = await o.API.pagamento();
      if (!e.tentativa) return;
      await fetch('/api/pagamentos?acao=simular', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tentativa_id: e.tentativa.id, acao: acao }) });
      desenhar(await o.API.pagamento());
    }
    $('o-pix-simular').addEventListener('click', function () { simularLocal('pix'); });
    $('o-pix-trocar').addEventListener('click', function () { trocando = true; mostrar('o-pag-form', true); escolherMetodo('cartao'); document.querySelector('[data-metodo="cartao"]').focus(); });
    $('o-desafio-simular').addEventListener('click', function () { simularLocal('desafio'); });

    return {
      /* chamado pela página quando a etapa é "aguardando pagamento" */
      async mostrar(valorSinal) {
        valor = Number(valorSinal) || 0;
        await configurar();
        mostrar('o-pag-indisponivel', !cfg.ativo);
        mostrar('o-pag-form', cfg.ativo);
        if (!cfg.ativo) return;
        mostrar('o-desafio-simular', cfg.ambiente === 'simulado');
        if (!$('o-pag-enviar').textContent.trim() || $('o-pag-enviar').dataset.valor !== String(valor)) { $('o-pag-enviar').dataset.valor = String(valor); escolherMetodo(metodo); }
        try { desenhar(await o.API.pagamento()); } catch (e) { /* o formulário segue disponível */ }
      },
      parar: pararEspera
    };
  }

  window.BZPagamentoTela = { criar: criar };
})();
