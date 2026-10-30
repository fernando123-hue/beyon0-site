/* ==========================================================================
   PAINEL › o que os cartões de pedido têm em comum (js/painel-fila.js; PR 2a): o selo de
   texto suspeito, o WhatsApp formatado, os links das redes do cliente, as ações do dono e o aviso com o link de retomada. Os links são montados
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
  var CODIGO_RETOMADA = /^[A-Za-z0-9_-]{32}$/;   /* o servidor devolve 32 caracteres; qualquer outra coisa não vira link */

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

  /* (PR 2b-2) o aviso leva o LINK DE RETOMADA: o código só existe depois do toque ("Preparar"), sai do servidor uma
     vez e vale 7 dias, um por vez (preparar de novo invalida o anterior não usado). Primeiro o link, depois o botão
     que abre o WhatsApp: abrir uma aba depois de esperar a resposta seria barrado pelo navegador. O código fica só
     na caixa de leitura com a mensagem pronta (o dono copia e cola): nunca num href, nem num ?text= do wa.me, e não
     vai para console, para o armazenamento do navegador nem para a lista */
  var NOME_OK = /^[\p{L}'-]{1,20}$/u;
  var EMAIL_OK = /^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var TELEFONE_MIN_DIGITOS = 10;
  var AVISO_LINHAS = 12;   /* (altura da caixa da mensagem pronta; o texto maior rola dentro dela) */
  function primeiroNome(n) { var p = String(n || '').trim().split(/\s+/)[0] || ''; return NOME_OK.test(p) ? p : ''; }
  function oi(nome) { return primeiroNome(nome) ? 'Oi, ' + primeiroNome(nome) + '!' : 'Oi!'; }
  /* o aviso pronto (Task 11, 3b-3c; spec §1 item 3 e R2-4): a mensagem numa caixa só de leitura com "Copiar a mensagem", e o botão que abre a conversa SEM o texto.
     O link de retomada é segredo de uso único e nunca vai num href (um wa.me/?text= o passaria a terceiros e aos registros deles): o dono cola. */
  function copiarMensagem(msg, estado) {
    var feito = function () { estado.textContent = 'Mensagem copiada. Cole na conversa e envie.'; };
    var falhou = function () {
      msg.focus();
      try { msg.setSelectionRange(0, msg.value.length); } catch (e) { msg.select(); }
      estado.textContent = 'Selecionei a mensagem: copie com o dedo (ou Ctrl+C).';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg.value).then(feito, falhou); else falhou();
  }
  function botaoDeContato(o, digitos, email, texto, quem) {
    var caixa = el('div', 'pn__aviso-pronto');
    var msg = el('textarea', 'pn__aviso-texto');
    msg.readOnly = true; msg.rows = AVISO_LINHAS; msg.value = texto;
    msg.setAttribute('aria-label', 'Mensagem pronta: ' + o.rotulo + ' para ' + quem);
    var copiar = el('button', 'pn__btn', 'Copiar a mensagem');
    copiar.type = 'button';
    var estado = el('p', 'pn__fila-meta');
    estado.setAttribute('role', 'status');
    copiar.addEventListener('click', function () { copiarMensagem(msg, estado); });
    var a = el('a', 'pn__btn pn__btn--fino');
    if (digitos) {
      a.href = 'https://wa.me/' + digitos;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Abrir a conversa no WhatsApp';
      a.setAttribute('aria-label', 'Abrir a conversa no WhatsApp com ' + quem + ' (abre em nova aba; cole a mensagem copiada)');
    } else {
      a.href = 'mailto:' + email;
      a.textContent = 'Abrir o e-mail';
      a.setAttribute('aria-label', 'Abrir o e-mail para ' + quem + ' (cole a mensagem copiada)');
    }
    caixa.appendChild(msg); caixa.appendChild(copiar); caixa.appendChild(a);
    if (!digitos) caixa.appendChild(el('p', 'pn__fila-meta', 'Assunto do e-mail: ' + o.assunto));   /* (o e-mail abre sem assunto nem corpo: o dono cola os dois) */
    caixa.appendChild(estado);
    return { caixa: caixa, msg: msg };
  }
  function avisoComLink(o) {
    var caixa = el('div', 'pn__aviso');
    var contato = o.contato || {}, email = contato.email;
    var digitos = String(contato.telefone || '').replace(/\D/g, '');
    if (digitos.length < TELEFONE_MIN_DIGITOS) digitos = '';
    var quem = contato.nome || 'o cliente';
    if (!digitos && !(email && EMAIL_OK.test(email))) { caixa.appendChild(el('p', 'pn__fila-meta', 'Sem contato para avisar (apagado pela retenção?).')); return caixa; }
    var preparar = el('button', 'pn__btn', 'Preparar ' + o.rotulo);
    preparar.type = 'button';
    preparar.setAttribute('aria-label', 'Preparar ' + o.rotulo + ' para ' + quem);
    var estado = el('p', 'pn__fila-meta');
    estado.setAttribute('role', 'status');
    preparar.addEventListener('click', function () {
      preparar.disabled = true;
      estado.textContent = 'Gerando o link…';
      P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link_retomada: o.conversaId }) })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r || typeof r.codigo !== 'string' || !CODIGO_RETOMADA.test(r.codigo)) { estado.textContent = 'Não deu para gerar o link agora.'; preparar.disabled = false; return; }
          var texto = oi(contato.nome) + ' ' + o.texto(location.origin + '/orcamento#retomar=' + r.codigo);
          var pronto = botaoDeContato(o, digitos, email, texto, quem);
          caixa.replaceChild(pronto.caixa, preparar);
          estado.textContent = 'Link pronto (vale 7 dias e abre uma vez). Preparar de novo invalida este.';
          pronto.msg.focus();
        })
        .catch(function (e) { if (P.recusada(e)) return; estado.textContent = e.status ? e.message : 'Sem conexão com o servidor. Tente de novo.'; preparar.disabled = false; });
    });
    caixa.appendChild(preparar);
    caixa.appendChild(estado);
    return caixa;
  }

  window.BZPainelPedido = { telefone: telefone, selo: selo, redes: redes, negocio: negocio, agir: agir, botaoDuplo: botaoDuplo, avisoComLink: avisoComLink };
})();
