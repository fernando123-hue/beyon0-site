/* ==========================================================================
   O VISOR das prévias (/orcamento): abrir uma direção em tela cheia, trocar
   entre elas, ver como celular (390) ou computador (1280) e escolher.
   • Só redesenha quando o que está aberto MUDOU (a espera de 5 s da página
     não tira a rolagem nem o foco de quem está olhando).
   • Diálogo modal: foco vai para o fechar, fica preso dentro, Escape fecha e
     devolve o foco a quem abriu (ou ao botão "Abrir prévia" daquela direção,
     se o cartão foi refeito).
   • As direções são botões com aria-pressed (não abas sem setas).
   Uso: BZVisor.criar({ lista, podeEscolher, escolhida, aoEscolher })
   ========================================================================== */
(function () {
  'use strict';
  var PV = window.BZPrevia;
  if (!PV) return;
  var $ = function (id) { return document.getElementById(id); };
  var NOMES = { conversao: 'Conversão', autoridade: 'Autoridade', experiencia: 'Experiência' };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }

  function criar(o) {
    var estado = { id: null, largura: 390, origem: null, assinatura: '' };
    var raiz = $('o-visor'), palco = $('o-visor-palco'), abas = $('o-visor-abas'), botaoEscolher = $('o-visor-escolher');
    var aberto = function () { return !raiz.hidden; };

    function atual() {
      var lista = o.lista();
      return { lista: lista, d: lista.filter(function (x) { return x.id === estado.id; })[0] || lista[0] };
    }

    function desenharAbas(lista, d) {
      var focoNaAba = document.activeElement && document.activeElement.parentNode === abas ? document.activeElement.getAttribute('data-id') : null;
      abas.textContent = '';
      lista.forEach(function (x) {
        var b = el('button', 'chip', x.id === 'final' ? 'Sua versão' : String(x.numero));
        b.type = 'button';
        b.setAttribute('data-id', x.id);
        b.setAttribute('aria-pressed', String(x.id === d.id));
        b.setAttribute('aria-label', x.id === 'final' ? 'Sua versão, com os ajustes' : 'Direção ' + x.numero + ': ' + (NOMES[x.estrategia] || ''));
        b.addEventListener('click', function () { estado.id = x.id; desenhar(true); b = abas.querySelector('[data-id="' + x.id + '"]'); if (b) b.focus(); });
        abas.appendChild(b);
      });
      if (focoNaAba) { var f = abas.querySelector('[data-id="' + focoNaAba + '"]'); if (f) f.focus(); }
    }

    /* forcar: troca de direção ou de aparelho (volta ao topo); senão, só se o conteúdo mudou */
    function desenhar(forcar) {
      var a = atual();
      if (!a.d) return fechar();
      estado.id = a.d.id;
      var assinatura = JSON.stringify([a.lista.map(function (x) { return x.id; }), a.d.id, estado.largura, a.d.conteudo, o.podeEscolher(), o.escolhida()]);
      if (!forcar && assinatura === estado.assinatura) return;
      var rolagem = forcar ? 0 : palco.scrollTop;
      estado.assinatura = assinatura;
      var d = a.d;
      $('o-visor-titulo').textContent = d.id === 'final' ? 'Sua versão, com os ajustes' : 'Direção ' + d.numero + ' · ' + (NOMES[d.estrategia] || '') + ' · ' + d.conteudo.nome_conceito;
      $('o-visor-resumo').textContent = d.conteudo.resumo || '';
      desenharAbas(a.lista, d);
      botaoEscolher.hidden = d.id === 'final' || !o.podeEscolher() || o.escolhida() === d.id;
      palco.textContent = '';
      var janela = el('div', 'visor__janela visor__janela--' + estado.largura);
      var tela = el('div', 'pv-tela' + (estado.largura === 1280 ? ' pv-tela--1280' : ''));
      tela.appendChild(PV.desenhar(d.conteudo));
      janela.appendChild(tela);
      palco.appendChild(janela);
      PV.encaixar(janela, tela, estado.largura, true);   /* (síncrono: rAF não roda em aba oculta) */
      palco.scrollTop = rolagem;
    }

    function abrir(id) {
      estado.id = id;
      estado.origem = document.activeElement;
      raiz.hidden = false;
      document.documentElement.classList.add('visor-aberto');
      desenhar(true);
      $('o-visor-fechar').focus();
    }
    function fechar() {
      if (!aberto()) return;
      raiz.hidden = true;
      document.documentElement.classList.remove('visor-aberto');
      var volta = estado.origem && estado.origem.isConnected ? estado.origem : document.querySelector('[data-abrir="' + estado.id + '"]') || $('o-dir-titulo');
      if (volta) { if (!volta.hasAttribute('tabindex') && volta.tagName === 'H2') volta.setAttribute('tabindex', '-1'); volta.focus(); }
    }

    $('o-visor-fechar').addEventListener('click', fechar);
    botaoEscolher.addEventListener('click', function () { o.aoEscolher(estado.id); });
    [].forEach.call(document.querySelectorAll('[data-aparelho]'), function (b) {
      b.addEventListener('click', function () {
        estado.largura = Number(b.getAttribute('data-aparelho'));
        [].forEach.call(document.querySelectorAll('[data-aparelho]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        desenhar(true);
      });
    });
    document.addEventListener('keydown', function (ev) {
      if (!aberto()) return;
      if (ev.key === 'Escape') { ev.preventDefault(); fechar(); return; }
      if (ev.key !== 'Tab') return;
      var f = [].filter.call(raiz.querySelectorAll('button, [tabindex="0"]'), function (x) { return !x.hidden && x.offsetParent !== null; });
      if (!f.length) return;
      var dentro = raiz.contains(document.activeElement);
      if (!dentro) { ev.preventDefault(); f[0].focus(); return; }
      if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
    });
    var adiado = null;
    window.addEventListener('resize', function () { clearTimeout(adiado); adiado = setTimeout(function () { if (!aberto()) return; estado.assinatura = ''; desenhar(false); }, 150); });   /* (nova escala, mesma rolagem) */

    return { abrir: abrir, fechar: fechar, aberto: aberto, atualizar: function () { if (aberto()) desenhar(false); } };
  }

  window.BZVisor = { criar: criar };
})();
