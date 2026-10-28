/* ==========================================================================
   PAINEL › AVISOS DA D1 (PR 3b-3c; spec §1 item 3 e §11 D1): o dono avisa o cliente nos 2 momentos da D1 (prévia pronta, site no ar) e, desde 22/10, no aviso de material
   parado, no aviso prévio do apagamento do material e nos 2 lembretes do restante (2º e 3º dia). Lê GET /api/painel?fila=avisos e, para cada item, mostra a mensagem PRONTA
   com um link de retomada NOVO (uso único, 7 dias; o do PR 2b-2, gerado quando o dono toca "Preparar") e o "Já avisei" (POST aviso_feito com o momento). O link NUNCA vai
   num endereço: o dono copia a mensagem e cola (js/painel-pedido-comum.js). Tudo que veio do banco entra por textContent.
   O contato vem como o banco manda: { nome, telefone, email }.
   ========================================================================== */
(function () {
  /* os textos: o Fernando falando com o cliente no WhatsApp (o componente comum põe o "Oi, nome!" na frente). Sem preço, sem prazo inventado, sem prometer o que o código não faz.
     As frases do contrato ficam como estão ("Nada vai ao ar sem a sua autorização", o prazo de 3 dias do restante). O link vale 7 dias e abre uma vez (PR 2b-2). */
  var QUEM = 'Aqui é o Fernando, da Beyon Zero. ';
  var LINK_UNICO = ' vale por 7 dias e abre uma vez:\n';
  var TEXTOS = {
    previa: {
      titulo: 'Prévia pronta', rotulo: 'aviso da prévia', assunto: 'A prévia do seu site está pronta',
      texto: function (link) { return QUEM + 'A prévia do seu site está pronta.\nPara ver, abra o seu pedido por este link. Ele' + LINK_UNICO + link + '\nLá você aprova ou manda a sua lista de ajustes.'; }
    },
    no_ar: {
      titulo: 'Site no ar', rotulo: 'aviso do site no ar', assunto: 'Seu site está no ar',
      texto: function (link) { return QUEM + 'O seu site está no ar!\nPor este link você vê o endereço e paga o restante por Pix. Ele' + LINK_UNICO + link + '\nO restante tem 3 dias, contados desta mensagem. Sem o pagamento, o site sai do ar à meia-noite, no fim do 3º dia.'; }
    },
    material_parado: {
      titulo: 'Material parado', rotulo: 'aviso de material parado', assunto: 'Estou aguardando o material do seu site',
      texto: function (link) { return QUEM + 'Estou aguardando o material do seu site. Sem ele, o projeto fica parado. Nada vai ao ar sem a sua autorização.\nÉ só mandar por este link. Ele' + LINK_UNICO + link; }
    },
    material_apagar: {
      titulo: 'Material parado, aviso antes de apagar', rotulo: 'aviso antes de apagar o material', assunto: 'O material parado do seu site vai ser apagado',
      texto: function (link) { return QUEM + 'Faz meses que o material do seu site está parado.\nSe você mandar ou mexer no material por este link, eu não apago nada. Se não, eu apago o que você mandou (a logomarca, as fotos e os textos) 30 dias depois desta mensagem.\nO link' + LINK_UNICO + link + '\nO pedido e o pagamento não são apagados.'; }
    },
    restante_lembrete_1: {
      titulo: 'Lembrete do restante (2º dia)', rotulo: 'lembrete do restante', assunto: 'Lembrete do restante do seu site',
      texto: function (link) { return QUEM + 'Passando para lembrar do restante do seu site, que já está no ar. Você paga por Pix por este link. Ele' + LINK_UNICO + link + '\nSem o pagamento, o site sai do ar à meia-noite, no fim do 3º dia depois do meu aviso. Se você já pagou, pode ignorar esta mensagem.'; }
    },
    restante_lembrete_2: {
      titulo: 'Último lembrete do restante (3º dia)', rotulo: 'último lembrete do restante', assunto: 'Último lembrete do restante do seu site',
      texto: function (link) { return QUEM + 'Esse é o último lembrete do restante do seu site. Você paga por Pix por este link. Ele' + LINK_UNICO + link + '\nSem o pagamento, o site sai do ar à meia-noite, no fim do 3º dia depois do meu aviso. Se você já pagou, pode ignorar esta mensagem.'; }
    }
  };
  window.BZPainelEntregas = { TEXTOS: TEXTOS };   /* (exposto antes da guarda: o teste lê os textos sem o painel) */

  var P = window.BZPainel, C = window.BZPainelPedido;
  var $ = function (id) { return document.getElementById(id); };
  if (!P || !C || !$('avisos')) return;
  var el = P.el;

  function marcar(a, botao) {
    botao.disabled = true;
    P.pedir('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aviso_feito: a.codigo, momento: a.momento }) })
      .then(function (r) { return r.json(); })
      .then(function () { carregar('Aviso marcado.'); $('t-avisos').focus(); })
      .catch(function (e) { if (P.recusada(e)) return; $('avisos-estado').textContent = e.message; botao.disabled = false; });
  }
  function cartao(a) {
    var t = TEXTOS[a.momento];
    if (!t) return null;   /* (momento que este painel não conhece: não inventa mensagem) */
    var c = el('div', 'pn__alerta pn__fila');
    var texto = el('div', 'pn__fila-texto');
    texto.appendChild(el('p', 'pn__codigo', a.codigo));
    texto.appendChild(el('p', 'pn__fila-nome', (a.contato && a.contato.nome) || 'Sem nome'));
    texto.appendChild(el('p', 'pn__fila-meta', t.titulo + ' desde ' + P.data(a.desde) + '.'));
    var fone = C.telefone(a.contato && a.contato.telefone);
    texto.appendChild(el('p', 'pn__dado', fone.charAt(0) === '+' ? 'WhatsApp ' + fone : fone));   /* (sem número, o texto de C.telefone já diz o que houve) */
    c.appendChild(texto);
    var acoes = el('div', 'pn__fila-acoes');
    acoes.appendChild(C.avisoComLink({ conversaId: a.conversa_id, contato: a.contato || {}, rotulo: t.rotulo, assunto: t.assunto, texto: t.texto }));
    var feito = el('button', 'pn__btn pn__btn--fino', 'Já avisei');
    feito.type = 'button';
    feito.setAttribute('aria-label', 'Já avisei ' + ((a.contato && a.contato.nome) || 'o cliente') + ': ' + t.titulo.toLowerCase());
    feito.addEventListener('click', function () { marcar(a, feito); });
    acoes.appendChild(feito);
    c.appendChild(acoes);
    return c;
  }

  /* cada leitura tem a sua vez: resposta que chega depois de sair (ou de uma leitura mais nova) é descartada */
  var vez = 0;
  function carregar(aviso) {
    var minha = ++vez;
    $('avisos-estado').textContent = 'Carregando os avisos…';
    P.pedir('?fila=avisos').then(function (r) { return r.json(); }).then(function (r) {
      if (minha !== vez) return;
      var alvo = $('avisos');
      alvo.textContent = '';
      $('bloco-avisos').hidden = false;
      var itens = Array.isArray(r.itens) ? r.itens : [];
      itens.forEach(function (a) { var c = cartao(a); if (c) alvo.appendChild(c); });
      var total = alvo.childNodes.length;
      var contagem = !total ? 'Nenhum aviso para mandar hoje.' : total + (total === 1 ? ' aviso para mandar.' : ' avisos para mandar.');
      $('avisos-estado').textContent = (typeof aviso === 'string' ? aviso + ' ' : '') + contagem;
    }).catch(function (e) { if (minha !== vez) return; if (P.recusada(e)) return; $('bloco-avisos').hidden = false; $('avisos-estado').textContent = e.message; });
  }
  /* saiu do painel: nome, telefone e links dos clientes não ficam na página (e nenhuma leitura em voo os traz de volta) */
  function esvaziar() { vez++; $('avisos').textContent = ''; $('avisos-estado').textContent = ''; $('bloco-avisos').hidden = true; }

  document.addEventListener('bz-painel:entrou', function () { carregar(); });
  document.addEventListener('bz-painel:saiu', esvaziar);
  $('avisos-atualizar').addEventListener('click', function () { carregar(); });
})();
