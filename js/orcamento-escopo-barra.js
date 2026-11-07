/* ==========================================================================
   A BARRA DO ESCOPO NO CELULAR (< 900 px; direção docs/design/radar-escopo-2026-11-07.md). Uma faixa fina presa logo abaixo do menu, com o
   anel do progresso, o estado, o valor e "Ver radar" (rola até o cartão do radar e põe o foco no título dele). Aparece SÓ quando: a conversa
   ou o preço está ativo, o cartão do radar saiu da tela, a mesa do orçamento está na tela e a pessoa não está escrevendo na conversa (no
   celular o teclado já come a tela; a barra não cobre a caixa de texto). Nasce sob demanda (o HTML não tem a barra), em position: fixed,
   e entra por transform: nada empurra a página (sem CLS) e nada passa da largura da tela (regra 10). Sem IntersectionObserver, não aparece.
   Script clássico (window.BZEscopoBarra), ES5. Todo texto por textContent.
   ========================================================================== */
(function () {
  'use strict';
  var W = window, doc = document;
  var LIMIAR_PX = 120;   /* o radar conta como "à vista" com pelo menos isto dele na tela (o cartão inteiro pode não caber, com a lupa) */
  var LIMIARES = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1];
  var ATIVOS = { identificando: 1, analise: 1, estimativa: 1, proposta: 1, confirmacao: 1, confirmada: 1 };

  function criar(o) {
    var el = null, anel = null, estadoEl = null, valorEl = null;
    var radarVisto = true, mesaVista = false, escrevendo = false, ativo = false, st = null;
    var mq = W.matchMedia ? W.matchMedia('(max-width: 899px)') : null;
    var mesa = doc.querySelector('.orc-mesa'), form = doc.getElementById('o-form');

    function montar() {
      el = doc.createElement('div');
      el.className = 'rde-barra';
      anel = o.Desenho.montarAnel(doc);
      var txt = doc.createElement('p'), ver = doc.createElement('button');
      txt.className = 'rde-barra__txt';
      estadoEl = doc.createElement('span'); estadoEl.className = 'rde-barra__estado';
      valorEl = doc.createElement('span'); valorEl.className = 'rde-barra__valor';
      txt.appendChild(estadoEl); txt.appendChild(doc.createTextNode(' ')); txt.appendChild(valorEl);
      ver.type = 'button'; ver.className = 'rde-barra__ver'; ver.textContent = 'Ver radar';
      ver.addEventListener('click', function () { o.focar(); });
      el.appendChild(anel.svg); el.appendChild(txt); el.appendChild(ver);
      doc.body.appendChild(el);
      escrever();
    }
    function escrever() {
      if (!el || !st) return;
      o.Desenho.aplicarAnel(anel, st);
      estadoEl.textContent = st.rotulo;
      valorEl.textContent = st.valor === null ? '—' : o.dinheiro(st.valor);
      el.classList.toggle('is-ouro', !!st.ouro);
    }
    function decidir() {
      var mostrar = ativo && !radarVisto && mesaVista && !escrevendo && !!(mq && mq.matches);
      if (!el && !mostrar) return;
      if (!el) montar();
      el.classList.toggle('is-visivel', mostrar);
      doc.documentElement.classList.toggle('tem-barra-escopo', mostrar);
    }

    if (typeof W.IntersectionObserver === 'function' && mesa) {
      var io = new W.IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.target === mesa) mesaVista = e.isIntersecting;
          else radarVisto = e.isIntersecting && e.intersectionRect.height >= Math.min(LIMIAR_PX, e.boundingClientRect.height);
        });
        decidir();
      }, { rootMargin: '-72px 0px 0px 0px', threshold: LIMIARES });
      io.observe(o.alvo); io.observe(mesa);
    }
    if (form) {
      form.addEventListener('focusin', function () { escrevendo = true; decidir(); });
      form.addEventListener('focusout', function () { escrevendo = false; decidir(); });
    }
    if (mq && mq.addEventListener) mq.addEventListener('change', decidir);

    return {
      /* o estado do radar e se a conversa está aberta (a barra vale na conversa e enquanto o preço das perguntas está na tela) */
      atualizar: function (novo, conversaAberta) {
        st = novo;
        ativo = !!ATIVOS[novo.estado] && (conversaAberta || novo.estado === 'estimativa' || novo.ativo);
        escrever();
        decidir();
      }
    };
  }

  W.BZEscopoBarra = { criar: criar };
})();
