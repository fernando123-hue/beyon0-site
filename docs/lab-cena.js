/* laboratório da cena (fora do deploy): os casos passam pelo dicionário real, pela geometria e pelo desenho reais */
(function () {
  'use strict';
  var CASOS = [
    ['alimentacao', 'Somos 4, vendemos marmitas', ['instagram'], [], 'Peça agora pelo celular'],
    ['alimentacao', 'Só eu, faço bolos sob encomenda', ['whatsapp'], [], 'Peça agora pelo celular'],
    ['saude', 'Clínica odontológica, somos 3 dentistas', ['instagram'], ['agendamentos'], 'Agende em 1 toque'],
    ['saude', 'Estúdio de pilates, só eu', ['indicacao'], ['agendamentos'], 'Agende em 1 toque'],
    ['beleza', 'Barbearia, somos 2', ['instagram', 'passa_na_frente'], ['agendamentos'], 'Seu horário, sem espera'],
    ['beleza', 'Salão com 6 cabeleireiras', ['whatsapp'], ['apresentar'], 'Seu horário, sem espera'],
    ['servicos', 'Oficina mecânica, 3 funcionários', ['google_mapa'], ['achado_google'], 'Peça o seu orçamento em 1 toque'],
    ['servicos', 'Faço reformas de casas, equipe de 5, orçamento grátis', ['indicacao', 'whatsapp', 'google_busca'], [], 'Peça o seu orçamento em 1 toque'],
    ['servicos', 'Escritório de contabilidade', ['indicacao'], ['apresentar'], 'Peça o seu orçamento em 1 toque'],
    ['comercio', 'Loja de roupas, vitrine no centro', ['instagram', 'passa_na_frente'], [], 'Veja e peça pelo celular'],
    ['educacao', 'Curso de inglês, turmas pequenas', ['facebook'], [], 'Conheça e faça a matrícula'],
    ['associacao', 'Associação de moradores', ['whatsapp'], ['apresentar'], 'Faça parte e participe']
  ];
  var main = document.getElementById('casos');
  CASOS.forEach(function (c) {
    var cena = window.BZCenaDicionario.cenaDoCaso({ ramo: c[0], texto: c[1], canais: c[2], objetivos: c[3], regulado: false });
    var caso = document.createElement('section');
    caso.className = 'caso';
    var legenda = document.createElement('p');
    legenda.className = 'caso__legenda';
    legenda.textContent = c[1] + ' → ' + JSON.stringify(cena);
    var vitrine = document.createElement('div');
    vitrine.className = 'caso__vitrine';
    var nasce = document.createElement('div');
    nasce.className = 'caso__nasce';
    var titulo = document.createElement('p');
    titulo.className = 'caso__titulo';
    titulo.textContent = c[4];
    var alvo = document.createElement('div');
    nasce.appendChild(titulo);
    nasce.appendChild(alvo);
    vitrine.appendChild(nasce);
    caso.appendChild(legenda);
    caso.appendChild(vitrine);
    main.appendChild(caso);
    window.BZCenaDesenho.desenhar(document, alvo, window.BZCenaTracos.tracosDaCena(cena));
  });
})();
