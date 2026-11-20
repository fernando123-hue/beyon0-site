/* ==========================================================================
   PAINEL › TESTE DO PIX DE R$ 0,01 (api/_pagamentos/teste-pix.mjs). O dono gera um Pix de um centavo, paga pelo app do banco
   e vê o Mercado Pago confirmar: prova a cadeia de pagamento sem pagar o valor de um pedido.
   • o valor NÃO sai daqui: o servidor cobra sempre R$ 0,01 (este arquivo nem manda valor);
   • o nome, o e-mail e o documento ficam só nos campos da tela: nada é guardado (nem localStorage) e tudo é limpo ao sair do painel;
   • tudo entra por textContent (nunca innerHTML); a imagem do QR só aceita base64 puro.
   ========================================================================== */
(function () {
  var P = window.BZPainel;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !$('teste-pix')) return;

  var INTERVALO_MS = 4000;          /* de quanto em quanto tempo pergunta se foi pago */
  var VALIDADE_MS = 10 * 60e3;      /* o QR vale 10 minutos (o servidor cria com PT10M) */
  var BASE64 = /^[A-Za-z0-9+\/]+={0,2}$/;
  var FINAIS = { pago: 1, expirou: 1, cancelado: 1, devolvido: 1, falhou: 1 };

  var vez = 0;          /* cada Pix gerado tem a sua vez: resposta e relógio de um Pix antigo são descartados */
  var relogio = null;
  var orderId = null;
  var terminaEm = 0;

  var estado = function (texto) { $('tp-estado').textContent = texto || ''; };
  function parar() { if (relogio) { clearTimeout(relogio); relogio = null; } }

  function limparPix() {
    parar(); vez++; orderId = null;
    $('tp-pix').hidden = true; $('tp-qr').hidden = true; $('tp-qr').removeAttribute('src');
    $('tp-copia').textContent = '';
    $('tp-devolver').hidden = true; $('tp-devolver').disabled = false;
    $('tp-gerar').disabled = false;
  }

  function limparTudo() {
    limparPix(); estado('');
    ['tp-nome', 'tp-sobrenome', 'tp-email', 'tp-doc'].forEach(function (id) { $(id).value = ''; });
    $('tp-desligado').hidden = true;
  }

  /* o servidor recusa com o motivo em português (erro.message); o "desligado" ganha o aviso próprio */
  function falhou(e) {
    /* o limite de 5 testes por hora também é 429, mas NÃO é a chave recusada: o dono continua dentro do painel */
    if (e.status === 429) { estado(e.message); return; }
    if (P.recusada(e)) return;
    if (e.status === 403) { $('tp-desligado').hidden = false; estado(''); return; }
    estado(e.message);
  }

  function aplicar(r, minha) {
    if (minha !== vez) return;
    estado(r.texto);
    $('tp-devolver').hidden = r.estado !== 'pago';
    if (FINAIS[r.estado]) { parar(); $('tp-gerar').disabled = false; return; }
    agendar(minha);
  }

  function perguntar(minha) {
    if (minha !== vez) return;
    if (Date.now() > terminaEm + INTERVALO_MS) { parar(); estado('O Pix expirou sem pagamento. Gere outro para testar de novo.'); $('tp-gerar').disabled = false; return; }
    P.pedir('?teste_pix=' + encodeURIComponent(orderId))
      .then(function (x) { return x.json(); })
      .then(function (r) { aplicar(r, minha); })
      .catch(function (e) { if (minha !== vez) return; if (e.status === 401 || e.status === 403 || e.status === 404) return falhou(e); agendar(minha); });   /* (falha de rede: tenta de novo) */
  }
  function agendar(minha) { parar(); relogio = setTimeout(function () { perguntar(minha); }, INTERVALO_MS); }

  function mostrarPix(r) {
    orderId = r.order_id;
    terminaEm = Date.now() + VALIDADE_MS;
    $('tp-copia').textContent = r.qr;
    if (typeof r.qr_base64 === 'string' && BASE64.test(r.qr_base64)) { $('tp-qr').src = 'data:image/png;base64,' + r.qr_base64; $('tp-qr').hidden = false; }
    $('tp-pix').hidden = false;
    estado(r.texto);
    agendar(vez);
  }

  function gerar() {
    limparPix();
    var minha = vez;
    $('tp-desligado').hidden = true;
    $('tp-gerar').disabled = true;
    estado('Gerando o Pix…');
    var corpo = { teste_pix: { nome: $('tp-nome').value.trim(), sobrenome: $('tp-sobrenome').value.trim(), email: $('tp-email').value.trim(), documento_tipo: $('tp-doc-tipo').value, documento: $('tp-doc').value.trim() } };
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (x) { return x.json(); })
      .then(function (r) { if (minha !== vez) return; mostrarPix(r); })
      .catch(function (e) { if (minha !== vez) return; $('tp-gerar').disabled = false; falhou(e); });
  }

  function copiar() {
    var codigo = $('tp-copia').textContent;
    if (!codigo) return;
    var ok = function () { estado('Código copiado. Cole no app do seu banco, em "Pix copia e cola".'); };
    var nao = function () { estado('Não deu para copiar sozinho. Selecione o código acima e copie.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(codigo).then(ok, nao); else nao();
  }

  function devolver() {
    if (!orderId) return;
    var minha = vez;
    $('tp-devolver').disabled = true;
    estado('Devolvendo o centavo…');
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teste_pix_reembolsar: orderId }) })
      .then(function (x) { return x.json(); })
      .then(function (r) { if (minha !== vez) return; estado(r.texto); $('tp-devolver').hidden = r.estado === 'devolvido'; $('tp-devolver').disabled = false; $('tp-gerar').disabled = false; })
      .catch(function (e) { if (minha !== vez) return; $('tp-devolver').disabled = false; falhou(e); });
  }

  $('tp-gerar').addEventListener('click', gerar);
  $('tp-copiar').addEventListener('click', copiar);
  $('tp-devolver').addEventListener('click', devolver);
  /* saiu do painel: os dados de quem paga e o QR não ficam na página */
  document.addEventListener('bz-painel:saiu', limparTudo);
})();
