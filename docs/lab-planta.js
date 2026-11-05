/* Laboratório da planta viva: monta a faixa com os módulos REAIS (BZPlanta) a partir das fixtures. Os planos vêm por XMLHttpRequest SÍNCRONO
   de propósito: a faixa nasce na mesma tarefa do script, como o 2c a insere, sem esperar rede (o que se mede é o desenho, não o fetch).
   Fora do deploy. ES5 como o resto, para o laboratório rodar onde a planta roda. */
(function () {
  'use strict';
  var A = window.BZPlanta, raiz = document.getElementById('faixa');
  if (!A || !raiz) return;
  var q = new URLSearchParams(location.search);
  var NICHOS = ['clinica', 'embalagens', 'loja'];
  var estado = { nicho: 'clinica', ajustado: false };

  function ler(n) {
    var x = new XMLHttpRequest();
    x.open('GET', '/docs/testes/fixtures/planta/' + n + '.json', false);
    x.send();
    return JSON.parse(x.responseText);
  }
  var clonar = function (o) { return JSON.parse(JSON.stringify(o)); };
  function indice(p, id) { var i; for (i = 0; i < p.etapas.length; i++) if (p.etapas[i].id === id) return i; return -1; }

  /* o ajuste de cada nicho: a pessoa pede algo e o Zero devolve um plano novo (os ids que não mudam ficam) */
  var AJUSTES = {
    clinica: {
      fala: 'quero cobrar um sinal para segurar o horário',
      aplicar: function (p) {
        p.etapas.splice(indice(p, 'horario') + 1, 0, { id: 'sinal', tipo: 'sinal', verbo: 'Cobra', titulo: 'Cobra um sinal para segurar o horário', frase: 'Para segurar o horário, o site pede um sinal antes de confirmar a avaliação.' });
        p.etapas.splice(indice(p, 'pos'), 1);
        return p;
      }
    },
    embalagens: {
      fala: 'quero um formulário antes da conversa, para o comprador mandar o desenho',
      aplicar: function (p) {
        p.etapas.splice(indice(p, 'familias') + 1, 0, { id: 'desenho', tipo: 'formulario', verbo: 'Recebe', titulo: 'Formulário para mandar o desenho', frase: 'O comprador manda o desenho e as medidas por um formulário simples, sem cadastro.' });
        p.etapas.splice(indice(p, 'retoma'), 1);
        return p;
      }
    },
    loja: {
      fala: 'quero uma galeria de fotos de clientes usando as peças',
      aplicar: function (p) {
        p.etapas.splice(indice(p, 'peca') + 1, 0, { id: 'galeria', tipo: 'galeria', verbo: 'Mostra', titulo: 'Galeria de fotos de clientes', frase: 'A galeria mostra fotos enviadas por clientes usando a peça, para quem está em dúvida.' });
        return p;
      }
    }
  };

  /* ?longo=1: os textos mais compridos que a forma deixa passar (título de 40 caracteres, rótulos de 28), para ver se algum rótulo invade uma caixa */
  function alongar(p) {
    p.chegada.titulo = 'Busca, mapa e indicação de amigos da rua';
    p.fim.titulo = 'Avaliação marcada sem ninguém atender';
    if (p.rotulo_retorno) p.rotulo_retorno = 'o site continua trabalhando';
    if (p.rotulos_ramos) p.rotulos_ramos = ['medida de catálogo do cliente', 'sob medida com desenho'].map(function (t) { return t.slice(0, 28); });
    p.etapas.forEach(function (e) { e.titulo = (e.titulo + ' com mais texto para quebrar').slice(0, 40).replace(/\s+\S*$/, ''); });
    return p;
  }
  function planoAtual() {
    var p = ler(estado.nicho);
    if (q.get('longo') === '1') p = alongar(p);
    return estado.ajustado ? AJUSTES[estado.nicho].aplicar(clonar(p)) : p;
  }
  var opcoes = {
    origem: q.get('origem') === 'padrao' ? 'padrao' : 'modelo', nome: q.get('nome') || undefined, animar: q.get('estatico') !== '1',
    aoCerto: function () {},
    aoAjustar: function () {
      if (estado.ajustado) return;
      estado.ajustado = true;
      A.atualizar(planoAtual(), { fala: AJUSTES[estado.nicho].fala });
    }
  };

  function escolher(n) {
    estado.nicho = n; estado.ajustado = false;
    Array.prototype.forEach.call(document.querySelectorAll('[data-nicho]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-nicho') === n ? 'true' : 'false'); });
    var plano = planoAtual();   /* (a leitura síncrona do JSON fica fora da medida: só o montar conta) */
    void document.body.offsetHeight;   /* o 1º layout da página inteira não é custo da planta (na página real ele já aconteceu antes de a faixa chegar) */
    var t0 = performance.now(), r = A.montar(raiz, plano, opcoes);
    window.PLANTA_LAB.ultima = { resultado: r, ms: performance.now() - t0 };
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-nicho]'), function (b) { b.addEventListener('click', function () { escolher(b.getAttribute('data-nicho')); }); });
  if (q.get('captura') === '1') document.documentElement.classList.add('lab-captura');
  window.PLANTA_LAB = { escolher: escolher, estado: estado, ajustar: function () { opcoes.aoAjustar(); }, ultima: null };
  /* ?troca=1 (com ?origem=padrao): 1,2 s depois a nota troca do plano padrão para a do modelo e o nome do negócio aparece na cota (a mesma troca que o 2c faz quando o Zero devolve o plano) */
  if (q.get('troca') === '1') setTimeout(function () { A.atualizar(planoAtual(), { origem: 'modelo', nome: 'Clínica Sorriso Exemplo de Odontologia' }); }, 1200);
  var n = q.get('nicho');
  if (NICHOS.indexOf(n) < 0) n = 'clinica';
  if (q.get('ajuste') === '1') { escolher(n); opcoes.aoAjustar(); } else escolher(n);
})();
