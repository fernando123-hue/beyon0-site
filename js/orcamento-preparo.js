/* ==========================================================================
   A ESPERA ÚTIL (PR 2b-2; spec docs/specs/2026-10-11-orcamento-sem-ia.md §3): com o pedido confirmado e os modelos
   na fila manual, a pessoa vê QUANDO ficam prontos (24 horas úteis, de segunda a sexta, contadas da confirmação) e
   o que já pode separar, com o WhatsApp da Beyon Zero. Feriado não entra na conta: a data é um teto honesto e o dono
   avisa antes se atrasar. "Quem está desenhando" (nome e foto) é DADO DO DONO (spec §10): fica de fora até ele mandar.
   Nada aqui toca no DOM ao carregar (o teste roda o arquivo sem document).
   ========================================================================== */
(function () {
  'use strict';
  var HORAS_UTEIS = 24;
  var TEL = window.BEYON_TEL || '5521977167944';   /* (reserva consciente, como em js/orcamento-detalhes.js: grep 5521977167944) */
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var SEPARAR = ['Fotos do seu negócio e do que você faz', 'A logo, se tiver', 'A lista de serviços ou produtos, com os preços',
    'O horário de atendimento', 'O endereço, se você atende no local'];
  /* O TEXTO DO PRAZO VENCIDO (I1) é do dono: ele confirma a frase depois. Se o prazo já passou (feriado, atraso), a data não
     pode seguir como promessa; troca só essa frase e o resto do bloco continua. A data vai entre as duas partes (em negrito) */
  var PRAZO_VENCIDO = ['O prazo era ', '. Os seus modelos ainda estão em produção; avisamos pelo seu WhatsApp assim que ficarem prontos.'];
  var PRAZO_NORMAL = ['Seus três modelos ficam prontos até ', '.'];
  var dois = function (n) { return String(n).padStart(2, '0'); };

  /* soma horas contando só de segunda a sexta, no fuso do aparelho (o Brasil não tem horário de verão desde 2019) */
  function prazoUtil(inicio, horas) {
    var t = new Date(inicio.getTime()), resto = horas * 36e5;
    while (resto > 0) {
      var amanha = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      if (t.getDay() === 0 || t.getDay() === 6) { t = amanha; continue; }
      var passo = Math.min(resto, amanha.getTime() - t.getTime());
      t = new Date(t.getTime() + passo);
      resto -= passo;
    }
    return t;
  }
  /* "sexta, 16/10, às 15h": a hora quebrada sobe para a seguinte (prometer 14h20 soa falso; 15h é um teto).
     Se isso cai na meia-noite, "às 0h" já é o dia seguinte (sábado ou terça, contradizendo "de segunda a sexta"):
     mostra então o fim do dia anterior, sem hora ("o fim de sexta, 16/10"). O espaço entre "às" e a hora, e entre "de"
     e o dia, não quebra (\u00a0): no 320 px a hora não fica sozinha na linha de baixo */
  function paraCima(d) {
    var h = new Date(d.getTime());
    if (h.getMinutes() || h.getSeconds() || h.getMilliseconds()) h = new Date(h.getFullYear(), h.getMonth(), h.getDate(), h.getHours() + 1);
    return h;
  }
  function dataDoPrazo(d) {
    var h = paraCima(d);
    if (h.getHours() === 0) {
      var ontem = new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1);
      return 'o fim de\u00a0' + DIAS[ontem.getDay()] + ', ' + dois(ontem.getDate()) + '/' + dois(ontem.getMonth() + 1);
    }
    return DIAS[h.getDay()] + ', ' + dois(h.getDate()) + '/' + dois(h.getMonth() + 1) + ', às\u00a0' + h.getHours() + 'h';
  }
  /* as duas partes da frase do prazo, com a data no meio; "agora" é injetável só para o teste */
  function partesDoPrazo(confirmadoEm, agora) {
    var prazo = prazoUtil(new Date(confirmadoEm), HORAS_UTEIS);
    var vencido = (agora == null ? Date.now() : new Date(agora).getTime()) > paraCima(prazo).getTime();   /* vence quando passa a hora que a tela prometeu, não a exata */
    var m = vencido ? PRAZO_VENCIDO : PRAZO_NORMAL;
    return [m[0], dataDoPrazo(prazo), m[1]];
  }
  function deveMostrar(E) {
    return !!(E && E.modo_direcoes === 'manual' && E.pedido && E.pedido.status === 'confirmado' && E.pedido.confirmado_em && !isNaN(Date.parse(E.pedido.confirmado_em)) &&
      Array.isArray(E.direcoes) && E.direcoes.some(function (d) { return d.status === 'gerando'; }));
  }

  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  var visto = null;   /* (redesenha só quando o que aparece mudou: a leitura do estado chega várias vezes) */
  function atualizar(E) {
    var alvo = document.getElementById('o-preparo');
    if (!alvo) return;
    var mostrar = deveMostrar(E);
    var partes = mostrar ? partesDoPrazo(E.pedido.confirmado_em) : null;
    var chave = mostrar ? E.pedido.confirmado_em + '|' + E.pedido.codigo + '|' + partes[0] : '';
    if (chave === visto) return;
    visto = chave;
    alvo.textContent = '';
    alvo.hidden = !mostrar;
    if (!mostrar) return;
    var prazo = el('p', 'orc-preparo__prazo', partes[0]);
    prazo.appendChild(el('strong', null, partes[1]));
    prazo.appendChild(document.createTextNode(partes[2]));
    alvo.appendChild(prazo);
    alvo.appendChild(el('h3', 'orc-preparo__titulo', 'Enquanto isso, já separe'));
    var ul = el('ul', 'orc-preparo__lista');
    SEPARAR.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    alvo.appendChild(ul);
    var wa = el('a', 'btn btn--sm', 'Mandar pelo WhatsApp');
    wa.href = 'https://wa.me/' + String(TEL).replace(/\D/g, '') + '?text=' + encodeURIComponent('Pedido ' + E.pedido.codigo + ': vou mandar o material do site.');
    wa.target = '_blank';
    wa.rel = 'noopener noreferrer';
    alvo.appendChild(wa);
  }

  window.BZPreparo = { atualizar: atualizar, prazoUtil: prazoUtil, partesDoPrazo: partesDoPrazo, dataDoPrazo: dataDoPrazo, deveMostrar: deveMostrar };
})();
