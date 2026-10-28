/* ==========================================================================
   A PRÉVIA, passo 3 (PR 3b-3; spec §3). "Ver a prévia" (outra aba, rel noopener noreferrer, endereço montado AQUI só se passar na regra da captação), "Está bom: aprovar"
   (um <dialog>, nunca window.confirm) e "Quero ajustes" (um campo só, até 1.500 caracteres, "esta é a lista N de 2"). Sem resposta, o projeto PARA (D5): a tela diz "Seu site só
   segue depois da sua resposta." e NÃO promete aprovação automática, prazo para responder ou lembrete. A parte pura (fase, hrefDaPrevia, validarLista, validarContato) não toca no DOM.
   Tudo que vem do servidor entra por textContent. O texto da lista de ajustes não é guardado em lugar nenhum (só no campo, até ser enviado) e não volta do servidor.
   Só UM link de WhatsApp na seção ("Outra dúvida?"): aparece quando as duas listas acabaram ou quando a API manda a saída pelo WhatsApp (resposta com `whatsapp: true`).
   ========================================================================== */
(function () {
  'use strict';
  var MAX_LISTA = 1500;
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var FALHA_AJUSTES = 'Não foi possível mandar agora. Tente de novo.', FALHA_APROVAR = 'Não foi possível aprovar agora. Tente de novo.';
  var $ = function (id) { return document.getElementById(id); };

  /* a regra da captação (URL_PREVIA de api/_entrega/enderecos.mjs), sem a barra final; o alfabeto vem do esquema. Sem o esquema carregado, nada abre */
  function hrefDaPrevia(url) {
    var ESQ = window.BZMaterialEsquema;
    if (typeof url !== 'string' || !ESQ) return null;
    return new RegExp('^https://v\\d{1,2}\\.bz-c-[' + ESQ.ALFABETO_ID + ']{6}\\.pages\\.dev$').test(url) ? url : null;
  }
  function dia(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1] : ''; }

  /* o que a seção mostra, a partir da entrega que o servidor mandou */
  function fase(e) {
    if (!e) return { fase: 'nenhuma' };
    var r = e.rodadas || { usadas: 0, max: 2 }, max = r.max == null ? null : r.max;
    var listaN = r.usadas + 1, ultima = max != null && listaN === max;
    var ate = e.entrega_ate ? dia(e.entrega_ate) : '';
    if (e.passo === 'previa') {
      return { fase: 'pronta', titulo: 'Sua prévia está pronta', texto: 'Seu site só segue depois da sua resposta.', href: hrefDaPrevia(e.previa && e.previa.url),
        listaN: listaN, listaMax: max, ultima: ultima, podeAjustes: max == null || r.usadas < max };
    }
    if (e.passo === 'ajustes') {
      return { fase: 'ajustes', titulo: 'Recebemos a sua lista', texto: 'Recebido. A nova prévia aparece aqui.' + (ate ? ' Previsão: ' + ate + '.' : ''), href: null, listaN: r.usadas, listaMax: max, ultima: false, podeAjustes: false };
    }
    if (e.passo === 'aprovada') {
      return { fase: 'aprovada', titulo: 'Prévia aprovada', texto: 'O próximo passo é pôr o site no ar. Quando ele entrar no ar, o endereço e o restante aparecem aqui.', href: null, listaN: r.usadas, listaMax: max, ultima: false, podeAjustes: false };
    }
    return { fase: 'nenhuma' };
  }

  /* a lista do cliente: o servidor confere de novo; aqui só avisa antes. `temContato`: o telefone ou o e-mail do site foi preenchido (uma lista pode ter só o contato) */
  function validarLista(texto, temContato) {
    var t = String(texto == null ? '' : texto).trim();
    if (!t) return temContato ? null : 'Escreva a lista de ajustes.';
    if (t.length > MAX_LISTA) return 'A lista passou de 1.500 caracteres. Resuma ou tire o que não for essencial.';
    var ESQ = window.BZMaterialEsquema;
    if (ESQ && ESQ.CPF_CNPJ.test(t)) return 'Não escreva CPF nem CNPJ aqui.';
    return null;
  }

  /* (M3, 22/10) o telefone/WhatsApp e o e-mail DO SITE: a MESMA regra do servidor e do banco (ESQ.contatoDoSite) e a mesma autorização de uso do material, obrigatória quando algum dos dois vem.
     As frases são as da API (FRASES em api/_vendas/fluxo-previa.mjs; um teste confere que são iguais) */
  function validarContato(whatsapp, email, autorizo) {
    var ESQ = window.BZMaterialEsquema;
    var w = String(whatsapp == null ? '' : whatsapp).trim(), m = String(email == null ? '' : email).trim();
    if (!w && !m) return null;
    var c = ESQ ? ESQ.contatoDoSite(w, m) : { ok: true };
    if (!c.ok) return c.erro === 'whatsapp' ? 'O WhatsApp ou telefone do site não parece certo. Use o DDD e o número (ex.: (21) 99999-0001).' : 'O e-mail do site não parece certo. Confira (ex.: contato@seusite.com.br).';
    if (!autorizo) return 'Para trocar o telefone ou o e-mail do site, marque a autorização de uso.';
    return null;
  }

  function criar(o) {
    var API = o.API, enviando = false, ultimaFase = '', base = 0, abridor = null, formAberto = false, saidaWa = false;
    function recarregar() { return window.BZMaterialRecarregar ? window.BZMaterialRecarregar() : Promise.resolve(); }
    function falhou(e, padrao, idDoErro) {
      $(idDoErro).textContent = (e && e.message) || padrao;
      saidaWa = !!(e && e.dados && e.dados.whatsapp);   /* a API mandou a saída pelo WhatsApp: o único link da seção aparece */
      $('o-prv-duvida').hidden = !(saidaWa || !$('o-prv-sem-listas').hidden);
    }
    function limparErro() { $('o-prv-erro').textContent = ''; $('o-prv-erro-form').textContent = ''; saidaWa = false; $('o-prv-duvida').hidden = $('o-prv-sem-listas').hidden; }
    function mostrarForm(aberto) { formAberto = aberto; $('o-prv-form').hidden = !aberto; $('o-prv-botoes').hidden = aberto; }

    function atualizar(E) {
      var f = fase(E.entrega), s = $('o-previa');
      var ativa = E.conversa.etapa === 'em_producao' && f.fase !== 'nenhuma';
      s.hidden = !ativa;
      if (!ativa) { formAberto = false; return; }
      var chave = f.fase + '|' + (E.entrega.rodadas && E.entrega.rodadas.usadas);
      if (chave !== ultimaFase) formAberto = false;   /* outra prévia ou outro passo: o formulário aberto não vale mais */
      $('o-prv-titulo').textContent = f.titulo;
      $('o-prv-texto').textContent = f.texto;
      /* uma leitura de fundo (volta à aba) NÃO fecha a lista que a pessoa está escrevendo: o formulário só some por mudança de prévia ou de passo */
      var pronta = f.fase === 'pronta';
      var a = $('o-prv-ver');
      $('o-prv-ver-acoes').hidden = !(pronta && f.href); if (pronta && f.href) a.href = f.href;
      $('o-prv-botoes').hidden = !pronta || formAberto;
      $('o-prv-ajustes').hidden = !(pronta && f.podeAjustes);
      $('o-prv-sem-listas').hidden = !(pronta && !f.podeAjustes);
      $('o-prv-duvida').hidden = !(pronta && (!f.podeAjustes || saidaWa));
      $('o-prv-form').hidden = !(pronta && formAberto);
      if (pronta) {
        base = E.entrega.rodadas.usadas;
        $('o-prv-lista-n').textContent = f.listaMax == null ? 'Esta é a sua lista.' : 'Esta é a lista ' + f.listaN + ' de ' + f.listaMax + '.' + (f.ultima ? ' É a última: o que passar disso é orçado à parte.' : '');
      }
      if (chave !== ultimaFase) { ultimaFase = chave; if (!pronta && document.activeElement === document.body) $('o-prv-titulo').focus(); }
    }

    function contar() { $('o-prv-contador').textContent = $('o-prv-lista').value.length + ' de 1.500 caracteres'; }
    $('o-prv-lista').addEventListener('input', contar);
    $('o-prv-ajustes').addEventListener('click', function () { limparErro(); mostrarForm(true); contar(); $('o-prv-lista').focus(); });
    $('o-prv-cancelar').addEventListener('click', function () { mostrarForm(false); $('o-prv-ajustes').focus(); });

    /* a frase da autorização é a do material (a MESMA constante que o servidor grava): o texto vem do esquema, nunca escrito à mão */
    if (window.BZMaterialEsquema && !$('o-prv-autoriza-texto').textContent) $('o-prv-autoriza-texto').textContent = window.BZMaterialEsquema.AUTORIZACAO.texto;
    function contatoDigitado() { return { whatsapp: $('o-prv-wa').value.trim(), email: $('o-prv-email').value.trim(), autorizo: $('o-prv-autoriza').checked }; }
    function limparForm() { $('o-prv-lista').value = ''; $('o-prv-wa').value = ''; $('o-prv-email').value = ''; $('o-prv-autoriza').checked = false; }
    function campoDoErro(frase) { return /autoriza/i.test(frase) ? $('o-prv-autoriza') : /e-mail/.test(frase) ? $('o-prv-email') : $('o-prv-wa'); }

    $('o-prv-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (enviando) return;
      var c = contatoDigitado(), temContato = !!(c.whatsapp || c.email), alvo = $('o-prv-lista');
      var ruim = validarLista($('o-prv-lista').value, temContato);
      if (!ruim) { ruim = validarContato(c.whatsapp, c.email, c.autorizo); if (ruim) alvo = campoDoErro(ruim); }
      if (ruim) { limparErro(); $('o-prv-erro-form').textContent = ruim; alvo.focus(); return; }
      limparErro();
      enviando = true; $('o-prv-form').setAttribute('aria-busy', 'true'); $('o-prv-enviar').setAttribute('aria-disabled', 'true');
      try {
        await API.previaAjustes($('o-prv-lista').value.trim(), base, temContato ? c : null);
        limparForm(); mostrarForm(false);
        await recarregar();
        $('o-prv-titulo').focus();
      } catch (e) {
        falhou(e, FALHA_AJUSTES, 'o-prv-erro-form');
        if (e && e.status === 409) recarregar().catch(function () {});   /* a prévia mudou (outra aba): a tela se atualiza */
      } finally { enviando = false; $('o-prv-form').removeAttribute('aria-busy'); $('o-prv-enviar').removeAttribute('aria-disabled'); }
    });

    /* aprovar: o <dialog> (o fundo escurece sem desfoque); Esc e "Voltar" devolvem o foco ao botão */
    $('o-prv-aprovar').addEventListener('click', function () { limparErro(); abridor = $('o-prv-aprovar'); $('o-prv-dialogo').showModal(); $('o-prv-voltar').focus(); });
    $('o-prv-voltar').addEventListener('click', function () { $('o-prv-dialogo').close(); });
    $('o-prv-dialogo').addEventListener('close', function () { if (abridor && !$('o-previa').hidden && !$('o-prv-botoes').hidden) abridor.focus(); });
    $('o-prv-confirmar').addEventListener('click', async function () {
      if (enviando) return;
      enviando = true; $('o-prv-confirmar').setAttribute('aria-disabled', 'true');
      try {
        await API.previaAprovar();
        $('o-prv-dialogo').close();
        await recarregar();
        $('o-prv-titulo').focus();
      } catch (e) {
        $('o-prv-dialogo').close();
        falhou(e, FALHA_APROVAR, 'o-prv-erro');
        recarregar().catch(function () {});
      } finally { enviando = false; $('o-prv-confirmar').removeAttribute('aria-disabled'); }
    });
    return { atualizar: atualizar };
  }

  window.BZPrevia = { criar: criar, fase: fase, hrefDaPrevia: hrefDaPrevia, validarLista: validarLista, validarContato: validarContato, MAX_LISTA: MAX_LISTA };
})();
