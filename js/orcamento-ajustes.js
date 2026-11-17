/* ==========================================================================
   OS AJUSTES SEM IA (PR 3a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §4): opções prontas de uma lista fechada (as
   cores ou as fontes de outro modelo; subir, descer, tirar ou acrescentar uma seção que existe nos outros modelos),
   desfazer o último ajuste e o pedido livre (até 3, vai para a fila do dono e não atrasa o início). O servidor confere tudo
   de novo: daqui só sai { operacao, direcao } ou { operacao, secao, referencia }. Antes do 1º ajuste, um aviso na própria
   página (um <dialog>, nunca window.confirm): depois dele não dá para trocar de modelo. Todo texto do visitante e do banco
   entra por textContent; nada de estilo inline (CSP). opcoesDe(E) não toca no DOM (o teste roda o arquivo sem document).
   ========================================================================== */
(function () {
  'use strict';
  /* (MAX_SECOES = o de api/_vendas/direcao.mjs; docs/testes/orcamento-ajustes.test.mjs prende os dois) */
  var LIMITE_OPCOES = 30, LIMITE_LIVRES = 3, LIVRE_MAX = 300, MAX_SECOES = 12;
  var NOMES = { hero: 'Abertura', servicos: 'Serviços', sobre: 'Sobre', diferenciais: 'Diferenciais', processo: 'Como funciona', depoimentos: 'Depoimentos',
    numeros: 'Números', galeria: 'Galeria', faq: 'Perguntas frequentes', cta: 'Chamada para contato', contato: 'Contato', equipe: 'Equipe',
    destaque: 'Destaque', localizacao: 'Localização' };
  var tem = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var nome = function (tipo) { return tem(NOMES, tipo) ? NOMES[tipo] : 'Seção'; };
  var minusculo = function (t) { return t.charAt(0).toLowerCase() + t.slice(1); };
  /* o pedido livre na lista: a situação dele na fila do dono */
  var LIVRE = { na_fila: ['is-fila', 'Aguardando: '], aplicada: ['is-ok', 'Feito pela Beyon Zero: '], recusada: ['is-nao', 'Não incluído: '] };

  function textoDaConta(n) {
    if (n <= 0) return 'Você já fez os 3 pedidos escritos deste orçamento.';
    return 'Você pode fazer mais ' + n + (n === 1 ? ' pedido.' : ' pedidos.');
  }
  /* o pedido da opção pronta é um rótulo feito pelo servidor; o do pedido livre é o texto da própria pessoa */
  function linhaDaLista(a) {
    if (a.origem === 'livre') return tem(LIVRE, a.status) ? { classe: LIVRE[a.status][0], texto: LIVRE[a.status][1] + a.pedido } : null;
    if (a.origem === 'opcao') return a.status === 'desfeita' ? { classe: 'is-nao is-desfeita', texto: 'Desfeito: ' + a.pedido } : { classe: 'is-ok', texto: a.pedido };
    /* (os ajustes antigos, do tempo da IA: o texto que a própria pessoa escreveu) */
    return { classe: a.status === 'aplicada' ? 'is-ok' : 'is-nao', texto: (a.status === 'aplicada' ? 'Feito: ' : 'Não aplicado: ') + a.pedido };
  }

  /* Só rede caída (0), tempo esgotado (0) ou erro do servidor (5xx) podem ter gravado antes de falhar; 400, 404, 409, 422 e 429
     o servidor recusou antes de gravar (o mesmo critério de "repetivel" de js/orcamento.js) */
  function talvezGravou(e) { return !!e && (e.status === 0 || e.status >= 500); }

  /* O limite de 30: com pedidos escritos sobrando, a saída é escrever; sem eles, só o recado (nunca manda escrever o que não dá) */
  function textoDoLimite(livresRestantes) {
    return 'Você chegou ao limite de 30 ajustes neste pedido. Para mudar mais, ' + (livresRestantes > 0 ? 'escreva o seu pedido abaixo ou ' : '') + 'deixe um recado para a equipe.';
  }

  /* Quantas alterações cada ação já deixou no estado. Uma chamada que dá erro de rede ou de tempo pode ter entrado no servidor:
     a tela relê o estado e compara com a contagem de ANTES; se subiu, a ação valeu (repetir gastaria um dos 3 pedidos
     escritos e um dos 30 ajustes, auditoria 2026-10-09, F2). "desfazer" conta as desfeitas */
  function contagem(E, tipo) {
    var alts = (E && E.alteracoes) || [];
    return alts.filter(function (a) {
      if (tipo === 'livre') return a.origem === 'livre';
      return a.origem === 'opcao' && (tipo !== 'desfazer' || a.status === 'desfeita');
    }).length;
  }
  /* a frase de uma ação que deu certo; sem a resposta do servidor (r nulo), sai do estado já relido */
  function frase(E, tipo, r) {
    if (tipo === 'desfazer') return 'Desfeito: a versão anterior voltou.';
    if (tipo === 'livre') {
      var m = opcoesDe(E);
      return 'Pedido enviado. ' + textoDaConta(r ? r.restantes : (m ? m.livresRestantes : 0));
    }
    if (r) return 'Feito: ' + r.rotulo + '.';
    var opcoes = ((E && E.alteracoes) || []).filter(function (a) { return a.origem === 'opcao'; });
    return opcoes.length ? 'Feito: ' + opcoes[opcoes.length - 1].pedido + '.' : 'Feito.';
  }

  function opcoesDe(E) {
    if (!E || !E.conversa || !E.escolha) return null;
    var prontas = (E.direcoes || []).filter(function (d) { return d.status === 'pronta' && d.conteudo; });
    var escolhida = prontas.filter(function (d) { return d.id === E.escolha.direcao_id; })[0];
    if (!escolhida) return null;
    var outras = prontas.filter(function (d) { return d.id !== escolhida.id; }).sort(function (a, b) { return a.numero - b.numero; });
    var atual = (E.versao_final || escolhida.conteudo).secoes || [];
    var alts = E.alteracoes || [];
    var ja = Object.create(null);
    atual.forEach(function (s) { ja[s.tipo] = true; });
    var adicionar = [];
    /* (com o máximo de seções não se acrescenta nenhuma: o servidor recusaria, e a seção nem caberia no modelo) */
    if (atual.length < MAX_SECOES) {
      outras.forEach(function (d) {
        (d.conteudo.secoes || []).forEach(function (s) {
          if (ja[s.tipo] || !tem(NOMES, s.tipo)) return;
          ja[s.tipo] = true;
          adicionar.push({ rotulo: 'Adicionar ' + minusculo(nome(s.tipo)), opcao: { operacao: 'adicionar_secao', secao: s.tipo } });
        });
      });
    }
    /* subir só da 3ª em diante (a 2ª já está logo abaixo da abertura); tirar só com mais de três (o site precisa de três) */
    var secoes = atual.map(function (s, i) {
      var item = { tipo: s.tipo, nome: nome(s.tipo), fixa: s.tipo === 'hero' };
      if (item.fixa) return item;
      if (i > 1) item.subir = { operacao: 'mover_antes_de', secao: s.tipo, referencia: atual[i - 1].tipo };
      if (i < atual.length - 1) item.descer = { operacao: 'mover_depois_de', secao: s.tipo, referencia: atual[i + 1].tipo };
      if (atual.length > 3) item.tirar = { operacao: 'remover_secao', secao: s.tipo };
      return item;
    });
    var contar = function (origem) { return alts.filter(function (a) { return a.origem === origem; }).length; };
    return {
      confirmar: E.conversa.etapa === 'escolhida',
      limite: contar('opcao') >= LIMITE_OPCOES,
      cores: outras.map(function (d) { return { rotulo: 'Usar as cores do modelo ' + d.numero, opcao: { operacao: 'usar_paleta_de', direcao: d.numero } }; }),
      fontes: outras.map(function (d) { return { rotulo: 'Usar as fontes do modelo ' + d.numero, opcao: { operacao: 'usar_tipografia_de', direcao: d.numero } }; }),
      secoes: secoes,
      adicionar: adicionar,
      /* (o banco decide: o último aplicado tem de ser uma opção pronta; o "feito" do dono não se desfaz) */
      desfazer: E.conversa.etapa === 'alteracoes' && E.pode_desfazer === true,
      livresRestantes: Math.max(0, LIMITE_LIVRES - contar('livre')),
      /* o pedido escrito só vale com o pedido confirmado (arquivado, ou uma conversa antiga sem pedido: todo envio daria 409);
         no lugar do formulário vai a frase fixa com o recado */
      livreFora: !E.pedido || E.pedido.status !== 'confirmado',
      lista: alts.map(linhaDaLista).filter(Boolean)
    };
  }

  function criar(o) {
    var $ = function (id) { return document.getElementById(id); };
    var E = null, visto = null, pendente = null, voltarPara = null;
    var aviso = $('o-aj-aviso');
    function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
    function botao(texto, aoClicar, rotulo) {
      var b = el('button', 'btn btn--sm', texto);
      b.type = 'button';
      b.setAttribute('data-acao', '');   /* (a trava de "uma ação por vez" de js/orcamento.js) */
      if (rotulo) b.setAttribute('aria-label', rotulo);
      b.addEventListener('click', function () { if (b.getAttribute('aria-disabled') !== 'true') aoClicar(b); });
      return b;
    }
    /* a frase de resultado: a do pedido escrito fica perto do formulário (quem está lá embaixo não vê a de cima) */
    function responder(t, tipo) {
      $('o-aj-resposta').textContent = tipo === 'livre' ? '' : t;
      $('o-livre-resposta').textContent = tipo === 'livre' ? t : '';
    }

    /* o 1º ajuste (opção pronta ou pedido livre) trava a troca de modelo, no servidor também: pergunta antes, na página */
    function depoisDoAviso(origem, fazer) {
      if (!E || E.conversa.etapa !== 'escolhida') { fazer(); return; }
      pendente = fazer;
      voltarPara = origem;
      aviso.showModal();
      $('o-aj-aviso-nao').focus();
    }
    function fecharAviso(seguir) {
      var fazer = pendente;
      pendente = null;
      if (aviso.open) aviso.close();
      if (voltarPara && voltarPara.isConnected) voltarPara.focus({ preventScroll: true });
      if (seguir && fazer) fazer();
    }
    $('o-aj-aviso-sim').addEventListener('click', function () { fecharAviso(true); });
    $('o-aj-aviso-nao').addEventListener('click', function () { fecharAviso(false); });
    aviso.addEventListener('cancel', function (ev) { ev.preventDefault(); fecharAviso(false); });   /* (Esc = Voltar) */

    /* uma ação por vez; a tela segue o servidor depois, dê certo ou não (sem "Tentar de novo": repetir aplicaria duas vezes).
       Se a chamada falhou mas o servidor já tinha gravado (a rede caiu na volta), a releitura mostra a contagem maior: vale
       como feito, sem aviso de erro (F2) */
    function executar(tipo, chamada, aoConcluir) {
      return o.umaAcao(async function () {
        o.limparAviso();
        responder('');
        var antes = contagem(E, tipo), r = null, relido = false;
        try { r = await chamada(); }
        catch (e) {
          /* a tela segue o servidor; mas só uma falha que pode ter gravado (rede, tempo, 5xx) é conferida pela contagem: com
             400, 409, 422 ou 429 nada foi gravado, e outra aba que ajustou no mesmo segundo viraria um "Feito" falso aqui */
          await o.recarregar().catch(function () {});
          if (!talvezGravou(e) || contagem(E, tipo) <= antes) { o.falhou(e, null); return; }
          relido = true;
        }
        if (!relido) await o.recarregar().catch(function () {});
        if (aoConcluir) aoConcluir();
        responder(frase(E, tipo, r), tipo);
      });
    }
    function ajustar(opcao, origem) {
      depoisDoAviso(origem, function () {
        executar('ajustar', function () { return o.API.ajustar(opcao); });
      });
    }
    $('o-aj-desfazer').addEventListener('click', function () {
      if (this.getAttribute('aria-disabled') === 'true') return;
      executar('desfazer', function () { return o.API.desfazer(); });
    });
    $('o-livre-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var campo = $('o-livre-texto'), erro = $('o-livre-erro'), texto = campo.value.trim();
      if (ev.submitter && ev.submitter.getAttribute('aria-disabled') === 'true') return;   /* (uma ação por vez) */
      if (!texto) { erro.textContent = 'Escreva o que você quer mudar.'; campo.focus(); return; }
      erro.textContent = '';
      depoisDoAviso(ev.submitter || campo, function () {
        executar('livre', function () { return o.API.pedidoLivre(texto.slice(0, LIVRE_MAX)); }, function () { campo.value = ''; });
      });
    });

    function grupo(titulo, itens) {
      var g = el('div', 'orc-aj__grupo');
      g.appendChild(el('h3', 'orc-aj__titulo', titulo));
      var linha = el('div', 'orc-aj__botoes');
      itens.forEach(function (i) { linha.appendChild(botao(i.rotulo, function (b) { ajustar(i.opcao, b); })); });
      g.appendChild(linha);
      return g;
    }
    function grupoDasSecoes(m) {
      var g = el('div', 'orc-aj__grupo');
      g.appendChild(el('h3', 'orc-aj__titulo', 'Seções'));
      var ol = el('ol', 'orc-aj__secoes');
      m.secoes.forEach(function (s) {
        var li = el('li', 'orc-aj__secao');
        li.appendChild(el('span', 'orc-aj__nome', s.nome));
        if (s.fixa) { li.appendChild(el('span', 'orc-aj__fixa', 'Fica no topo')); ol.appendChild(li); return; }
        var linha = el('span', 'orc-aj__botoes');
        if (s.subir) linha.appendChild(botao('Subir', function (b) { ajustar(s.subir, b); }, 'Subir a seção ' + s.nome));
        if (s.descer) linha.appendChild(botao('Descer', function (b) { ajustar(s.descer, b); }, 'Descer a seção ' + s.nome));
        if (s.tirar) linha.appendChild(botao('Tirar', function (b) { ajustar(s.tirar, b); }, 'Tirar a seção ' + s.nome));
        li.appendChild(linha);
        ol.appendChild(li);
      });
      g.appendChild(ol);
      return g;
    }
    /* o foco estava num botão que vai ser refeito: volta para o botão de mesmo nome, ou para o título da seção */
    function devolverFoco(rotulo) {
      var alvo = [].slice.call($('o-ajustes').querySelectorAll('button')).filter(function (b) { return !b.hidden && (b.getAttribute('aria-label') || b.textContent) === rotulo; })[0];
      (alvo || $('o-aj-titulo')).focus({ preventScroll: true });
    }
    function desenhar() {
      var m = opcoesDe(E), alvo = $('o-aj-opcoes'), lista = $('o-mudancas'), versao = $('o-versao');
      var ativo = document.activeElement, desfazer = $('o-aj-desfazer'), livre = $('o-livre-campos');
      var foco = ativo && ativo.tagName === 'BUTTON' && (alvo.contains(ativo) || versao.contains(ativo)) ? (ativo.getAttribute('aria-label') || ativo.textContent) : null;
      /* o foco estava num controle que vai sumir (Desfazer sem nada para desfazer; o formulário no 3º pedido): vai para perto dele */
      var emDesfazer = ativo === desfazer, emLivre = livre.contains(ativo);
      alvo.textContent = ''; lista.textContent = ''; versao.textContent = '';
      $('o-aj-desfazer').hidden = !(m && m.desfazer);
      if (!m) return;
      if (E.versao_final) {
        var v = el('button', 'btn btn--sm', 'Abrir a sua versão');
        v.type = 'button';
        v.setAttribute('data-abrir', 'final');
        v.addEventListener('click', o.abrirVersao);
        versao.appendChild(v);
      }
      m.lista.forEach(function (l) { lista.appendChild(el('li', l.classe, l.texto)); });
      var podeEscrever = !m.livreFora && m.livresRestantes > 0;
      if (m.limite) alvo.appendChild(el('p', 'orc-aj__limite', textoDoLimite(podeEscrever ? m.livresRestantes : 0)));
      else {
        if (m.cores.length) alvo.appendChild(grupo('Cores e fontes', m.cores.concat(m.fontes)));
        alvo.appendChild(grupoDasSecoes(m));
        if (m.adicionar.length) alvo.appendChild(grupo('Acrescentar uma seção dos outros modelos', m.adicionar));
      }
      var fora = $('o-livre-fora');
      fora.hidden = !m.livreFora;
      livre.hidden = m.livreFora || m.livresRestantes === 0;
      $('o-livre-conta').hidden = m.livreFora;
      $('o-livre-conta').textContent = m.livreFora ? '' : textoDaConta(m.livresRestantes);
      if (emDesfazer && desfazer.hidden) $('o-aj-titulo').focus({ preventScroll: true });
      else if (emLivre && livre.hidden) (m.livreFora ? fora : $('o-livre-conta')).focus({ preventScroll: true });
      else if (foco) devolverFoco(foco);
    }
    return {
      /* redesenha só quando o que aparece mudou (a leitura do estado chega várias vezes) */
      atualizar: function (novo) {
        E = novo;
        var s = JSON.stringify([E.conversa.etapa, E.escolha, E.alteracoes, E.pode_desfazer, E.versao_final ? E.versao_final.secoes : null,
          E.direcoes.map(function (d) { return [d.id, d.status]; })]);
        if (s === visto) return;
        visto = s;
        desenhar();
      }
    };
  }

  window.BZAjustes = { criar: criar, opcoesDe: opcoesDe, textoDaConta: textoDaConta, textoDoLimite: textoDoLimite, contagem: contagem, frase: frase,
    talvezGravou: talvezGravou, MAX_SECOES: MAX_SECOES };
})();
