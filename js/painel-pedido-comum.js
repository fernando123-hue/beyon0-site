/* ==========================================================================
   PAINEL › o que os cartões de pedido têm em comum (js/painel-pedidos.js e js/painel-fila.js; PR 2a): o selo de
   texto suspeito, o WhatsApp formatado, os links das redes do cliente e as ações do dono. Os links são montados
   AQUI, num domínio fixo, só a partir do usuário que passa no MESMO formato do servidor (api/_vendas/pedido.mjs,
   REDES). Tudo que veio do visitante entra por textContent.
   ========================================================================== */
(function () {
  var P = window.BZPainel;
  if (!P) return;
  var el = P.el;
  var REDES = {
    instagram: { nome: 'Instagram', ok: /^[A-Za-z0-9._]{1,30}$/, url: function (u) { return 'https://www.instagram.com/' + u + '/'; } },
    facebook: { nome: 'Facebook', ok: /^[A-Za-z0-9.]{5,50}$/, reservados: ['profile.php', 'pages', 'people', 'groups'], url: function (u) { return 'https://www.facebook.com/' + u; } },
    tiktok: { nome: 'TikTok', ok: /^[A-Za-z0-9._]{2,24}$/, url: function (u) { return 'https://www.tiktok.com/@' + u; } },
    youtube: { nome: 'YouTube', ok: /^[A-Za-z0-9._-]{3,30}$/, url: function (u) { return 'https://www.youtube.com/@' + u; } },
    linkedin: { nome: 'LinkedIn', ok: /^[A-Za-z0-9-]{3,100}$/, url: function (u) { return 'https://www.linkedin.com/company/' + u; } }
  };
  var TEM_LETRA_OU_NUMERO = /[A-Za-z0-9]/;   /* (só pontos ou traços não são um perfil: nada de "../" no caminho) */
  var ARMADO_MS = 4000;

  /* o usuário só vira link se passa no formato do servidor; qualquer outra coisa fica de fora */
  function usuarioValido(rede, u) {
    var def = REDES[rede];
    return typeof u === 'string' && def.ok.test(u) && TEM_LETRA_OU_NUMERO.test(u) && !(def.reservados && def.reservados.indexOf(u.toLowerCase()) >= 0);
  }

  /* o telefone do banco (E.164) como se lê: +55 21 99999-0000 */
  function telefone(e164) {
    var d = String(e164 || '').replace(/\D/g, '');
    if (d.length === 13 && d.slice(0, 2) === '55') return '+55 ' + d.slice(2, 4) + ' ' + d.slice(4, 9) + '-' + d.slice(9);
    if (d.length === 12 && d.slice(0, 2) === '55') return '+55 ' + d.slice(2, 4) + ' ' + d.slice(4, 8) + '-' + d.slice(8);
    return d ? '+' + d : 'sem WhatsApp (apagado pela retenção?)';
  }
  function selo(suspeito) { return suspeito ? el('p', 'pn__selo', 'Texto suspeito: leia antes de produzir') : null; }
  function redes(r) {
    if (!r || typeof r !== 'object') return null;
    var ul = el('ul', 'pn__redes');
    Object.keys(REDES).forEach(function (k) {
      var u = Object.prototype.hasOwnProperty.call(r, k) ? r[k] : null;
      if (!usuarioValido(k, u)) return;
      var li = el('li'), a = el('a', null, REDES[k].nome + ': ' + u);
      a.href = REDES[k].url(u);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
      ul.appendChild(li);
    });
    return ul.childNodes.length ? ul : null;
  }
  function negocio(n) { n = n || {}; return [n.nome, n.segmento, n.cidade].filter(Boolean).join(' · ') || 'Negócio sem descrição'; }

  /* uma ação do dono num pedido: POST, e as duas listas recarregam (o aviso vai junto). codigo: o do pedido, para o aviso de conflito */
  function agir(corpo, botao, saida, aviso, codigo) {
    botao.disabled = true;
    return P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (r) { return r.json(); })
      .then(function () { document.dispatchEvent(new CustomEvent('bz-painel:pedidos-mudaram', { detail: { aviso: aviso } })); })
      .catch(function (e) {
        if (P.recusada(e)) return;   /* (a chave não vale mais: volta para a entrada) */
        /* 404/409: o pedido já mudou (expirou, foi confirmado em outra aba): as listas recarregam com o motivo e o código */
        if (e.status === 404 || e.status === 409) { document.dispatchEvent(new CustomEvent('bz-painel:pedidos-mudaram', { detail: { aviso: (codigo ? 'Pedido ' + codigo + ': ' : '') + e.message } })); return; }
        saida.textContent = e.message;
        botao.disabled = false;
      });
  }
  /* um botão que pede um segundo toque, sem janela do navegador: "Descartar" → "Toque de novo para descartar"
     (verbo: o que o 2º toque faz, quando o texto do botão não é só o verbo: "Chegou: confirmar" → "confirmar") */
  function botaoDuplo(classe, texto, rotulo, aoConfirmar, verbo) {
    var b = el('button', classe, texto), armado = null, deNovo = 'Toque de novo para ' + (verbo || texto.toLowerCase());
    b.type = 'button';
    b.setAttribute('aria-label', texto + ' ' + rotulo);
    b.addEventListener('click', function () {
      if (armado) {   /* (volta ao texto de antes de agir: se a ação falhar, o botão não fica pedindo um 2º toque que já foi dado) */
        clearTimeout(armado); armado = null;
        b.textContent = texto;
        b.setAttribute('aria-label', texto + ' ' + rotulo);
        aoConfirmar(b);
        return;
      }
      b.textContent = deNovo;
      b.setAttribute('aria-label', deNovo + ' ' + rotulo);
      armado = setTimeout(function () { armado = null; b.textContent = texto; b.setAttribute('aria-label', texto + ' ' + rotulo); }, ARMADO_MS);
    });
    return b;
  }

  window.BZPainelPedido = { telefone: telefone, selo: selo, redes: redes, negocio: negocio, agir: agir, botaoDuplo: botaoDuplo };
})();
