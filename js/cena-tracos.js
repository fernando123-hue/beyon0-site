/* A GEOMETRIA DA CENA (Mapa vivo v2, Fase 2, PR 2; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 2"). PURO, sem DOM.
   A cena (js/orcamento-cena-forma.js) vira o CORTE ARQUITETÔNICO do lugar, em traço de 1px numa grade de 320 x 120: o piso, as paredes com a
   porta à esquerda, o móvel que diz o lugar (cadeira de atendimento, bancada, prateleira, quadro…), as pessoas de pé no piso (traço mínimo, sem
   rosto), os canais entrando pela esquerda por uma linha fina até a porta, a OFERTA na parede (a única peça com acento) e o destaque pequeno no
   alto. Sem texto: só caminhos com números. Cada grupo traz posição, escala e a ORDEM de entrada (sala, móvel, pessoas uma a uma, canais,
   oferta, destaque) para a única sequência de movimento. Determinístico: a mesma cena, o mesmo desenho; nada de sorteio.
   Usa js/orcamento-cena-forma.js (só cena válida desenha) e js/planta-pecas.js (os ícones da oferta). ES5: window.BZCenaTracos na tela (os dois
   antes), CommonJS no Node. Nunca lança. */
(function (raiz, fabrica) {
  'use strict';
  var cjs = typeof module === 'object' && module && module.exports;
  var api = fabrica(cjs ? require('./orcamento-cena-forma.js') : raiz && raiz.BZCenaForma, cjs ? require('./planta-pecas.js') : raiz && raiz.BZPlantaPecas);
  if (cjs) module.exports = api;
  if (raiz) raiz.BZCenaTracos = api;
})(typeof window !== 'undefined' ? window : null, function (F, P) {
  'use strict';

  if (!F || !P) return Object.freeze({ tracosDaCena: function () { return null; } });

  var t = function (d, ac) { return { d: d, ac: !!ac }; };
  var R = function (x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) + 'V' + (y + h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' +
      (x + w - r) + ' ' + (y + h) + 'H' + (x + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) + 'V' + (y + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z';
  };
  var C = function (cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0Z'; };

  /* os ícones dos canais: os MESMOS das origens do mapa do caso (js/mapa-desenho.js, grade de 40); o teste prende as duas tabelas */
  var CANAIS = {
    instagram: [t(R(9, 9, 22, 22, 6)), t(C(20, 20, 5), 1), t(C(26, 14, 1))],
    whatsapp: [t('M12.5 27.5A11 11 0 1 1 16 30L9 32Z'), t('M16 17c0 4 3 7 7 7', 1)],
    google_busca: [t(C(17, 17, 8)), t('M23 23L31 31', 1)],
    google_mapa: [t('M20 32C14 25 11 21 11 17a9 9 0 0 1 18 0c0 4-3 8-9 15Z'), t(C(20, 17, 3), 1)],
    indicacao: [t(C(14, 14, 4)), t('M7 29c0-6 3-8 7-8s7 2 7 8'), t(C(27, 16, 3.5), 1), t('M23 23c1-1 2-2 4-2 4 0 6 2 6 8', 1)],
    passa_na_frente: [t('M8 16H32L30 10H10Z'), t('M10 16V31H30V16'), t(R(17, 22, 6, 9, 0), 1)],
    facebook: [t(C(12, 20, 3)), t(C(28, 12, 3)), t(C(28, 28, 3)), t('M15 19L25 13M15 21L25 27', 1)],
    tiktok: [t(R(9, 10, 22, 20, 4)), t('M18 15L25 20L18 25Z', 1)],
    site_atual: [t(R(7, 9, 26, 22, 2)), t('M7 15H33'), t('M11 21H25M11 25H21', 1)],
    outro: [t(C(20, 20, 9)), t('M16 20H24M21 17L24 20L21 23', 1)]
  };

  /* ---------- a sala (grade 320 x 120): piso em y 104, teto em y 28, parede esquerda em x 60 com a porta de 64 a 104, parede direita em x 304 ---------- */
  var PISO = [t('M44 104H316')];
  /* a porta: batente e a folha entreaberta (revisão visual: o "⊥" solto não lia como porta) */
  var PORTA = [t('M60 64H70'), t('M60 104L70 100V64')];
  var SALA = [t('M60 64V28H304V104')].concat(PORTA);
  /* a obra não é sala fechada: paredes por terminar e sem teto (revisão visual: diferencia o nicho) */
  var SALA_DA_OBRA = [t('M60 64V44'), t('M304 104V58')].concat(PORTA);
  /* o móvel de cada lugar, de pé no piso, do lado direito da sala (x 196 a 300). Nenhuma linha horizontal a menos de 8 do piso (y 104) nem
     vertical a menos de 8 da parede (x 304): linha dupla empilhada é proibida (revisão visual) */
  var MOVEIS = {
    /* cadeira de atendimento sobre coluna central, encosto reclinado com apoio de cabeça; luminária de braço com cabeça chata */
    consultorio: [t('M212 94H248L256 76'), t('M256 76L261 72'), t('M232 104V94'), t('M224 104L232 98L240 104'), t('M236 28V42L250 48'), t(R(244, 48, 14, 6, 3))],
    /* espelho em arco fora do eixo; a cadeira de salão com pé central, assento e encosto alto, com vão claro até o espelho */
    salao: [t('M262 66V48a14 14 0 0 1 28 0V66Z'), t('M236 104V94'), t('M230 104L236 99L242 104'), t('M222 94H250'), t('M226 94V80Q236 76 246 80V94')],
    /* bancada com a porta do forno, coifa no teto, as bocas do fogão */
    cozinha: [t(R(200, 84, 96, 20, 0)), t(R(214, 90, 22, 10, 1)), t('M232 28V36H220L214 46H274L268 36H256V28'), t('M216 84V80H232V84M252 84V80H268V84')],
    /* arara com cabides e roupas; balcão pequeno no canto */
    loja: [t('M204 50H268'), t('M204 50V104M268 50V104'), t('M214 50V54M214 54L208 60H220ZM208 60L207 78H221L220 60'),
      t('M230 50V54M230 54L224 60H236ZM224 60L223 74H237L236 60'), t('M246 50V54M246 54L240 60H252ZM240 60L239 80H253L252 60'),
      t(R(276, 84, 20, 20, 1))],
    /* carrinho de ferramentas com gavetas e o pneu */
    oficina: [t(R(206, 70, 32, 34, 1)), t('M206 80H238M206 90H238'), t('M218 75H226M218 85H226M218 95H226'), t(C(270, 90, 14)), t(C(270, 90, 6))],
    escritorio: [t('M200 84H280'), t('M208 84V104M272 84V104'), t(R(226, 62, 28, 18, 1)), t('M240 80V84'), t('M286 104V90M286 94H296V104')],
    /* o quadro e duas carteiras de perfil (assento e encosto), mesmo sem alunos não vira sala de reunião */
    sala_aula: [t(R(196, 36, 100, 32, 1)), t('M206 48H250M206 56H238'), t('M214 104V92H228M214 92V80'), t('M248 104V92H262M248 92V80'), t('M232 86H240M266 86H274')],
    /* mesa longa de reunião com dois pés, uma cadeira de perfil e o mural de avisos */
    sede: [t('M200 86H280'), t('M206 86V104M274 86V104'), t(R(214, 38, 56, 28, 1)), t(R(220, 44, 12, 9, 0)), t(R(238, 44, 12, 9, 0)), t(R(256, 46, 8, 13, 0)),
      t('M286 104V94H294M286 94V80')],
    /* aparelho de pilates (reformer) visto de lado: base, pés, carrinho e a haste com alça */
    estudio: [t('M200 92H272'), t('M206 92V104M266 92V104'), t(R(214, 86, 24, 6, 1)), t('M272 92L282 70'), t('M278 70H286')],
    /* andaime leve de 2 vãos e 2 níveis, uma diagonal e a escada */
    obra: [t('M216 104V48M246 104V48M276 104V48'), t('M216 48H276M216 76H276'), t('M216 76L246 48'), t('M254 104V76M262 104V76M254 96H262M254 86H262')]
  };
  /* a pessoa: cabeça e tronco, sem rosto; x = o centro. A equipe fica perto do móvel, com espaçamento irregular (revisão visual: em fila na porta
     parecia fila de clientes) */
  var pessoa = function (x) { return [t(C(x, 80, 4.5)), t('M' + (x - 7) + ' 104V96a7 7 0 0 1 14 0V104')]; };
  var PESSOA_X = [182, 160, 140, 117, 98, 80];
  /* a oferta: o ícone de js/planta-pecas.js na moldura da parede (grade 40, escala 0,7) */
  var ICONE_DA_OFERTA = {
    cardapio: 'cardapio', encomenda: 'caixa', entrega: 'chegada', reserva: 'confirmacao', agenda: 'agenda', orcamento: 'proposta', vitrine: 'vitrine',
    catalogo: 'catalogo', aulas: 'aula', galeria: 'galeria', loja_online: 'carrinho', projeto: 'documento'
  };
  /* (revisão visual) moldura mais alta e menor: 12 de folga até as cabeças */
  var MOLDURA = { x: 120, y: 33, lado: 30 }, ICONE_ESCALA = 0.6;
  /* o destaque, pequeno, no alto à direita (fora da sala) */
  var DESTAQUES = {
    localizacao: [t('M290 22C286 17 284 14 284 11a6 6 0 0 1 12 0c0 3-2 6-6 11Z'), t(C(290, 11, 2))],
    fotos: [t(R(282, 8, 18, 14, 1)), t('M282 19L288 14L292 17L295 14L300 19')],
    depoimentos: [t('M285 9h4v5l-2 4M293 9h4v5l-2 4')],
    horarios: [t(C(291, 15, 7)), t('M291 11V15H295')]
  };
  /* os canais: até 3 ícones na coluna da esquerda (grade 40, escala 0,6) e a linha fina de cada um até a porta (60, 86) */
  var CANAL_ESCALA = 0.6, CANAL_Y = [[74], [56, 84], [38, 64, 90]];

  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  function grupo(papel, ordem, tracos, x, y, escala) {
    return Object.freeze({ papel: papel, ordem: ordem, x: x || 0, y: y || 0, escala: escala || 1, tracos: Object.freeze(tracos.map(function (tr) { return Object.freeze({ d: tr.d, ac: tr.ac }); })) });
  }
  var acento = function (lista) { return lista.map(function (tr) { return t(tr.d, true); }); };
  var semAcento = function (lista) { return lista.map(function (tr) { return t(tr.d, false); }); };

  /* um grupo por canal: o ícone escalado na coluna da esquerda (a linha até a porta vai com a sala, na grade sem escala) */
  function canais(lista, ordem) {
    var ys = CANAL_Y[lista.length - 1] || [];
    return lista.map(function (codigo, i) { return grupo('canal', ordem + i, semAcento(CANAIS[codigo]), 6, ys[i] - 12, CANAL_ESCALA); });
  }
  function linhasDosCanais(lista) {
    var ys = CANAL_Y[lista.length - 1] || [];
    return ys.slice(0, lista.length).map(function (y) { return t('M32 ' + y + 'C46 ' + y + ' 46 86 60 86'); });
  }

  /* tracosDaCena(cena) -> { viewBox, grupos } congelado, ou null se a cena não for válida */
  function tracosDaCena(c) {
    try {
      var r = F.validar(c);
      if (!r.ok) return null;
      var cena = r.cena, gs = [], ordem = 0, i;
      gs.push(grupo('piso', ordem++, PISO));
      gs.push(grupo('sala', ordem++, (cena.lugar === 'obra' ? SALA_DA_OBRA : SALA).concat(linhasDosCanais(cena.canais))));
      gs.push(grupo('movel', ordem++, MOVEIS[cena.lugar]));
      for (i = 0; i < cena.gente; i++) gs.push(grupo('gente', ordem++, pessoa(PESSOA_X[i])));
      gs = gs.concat(canais(cena.canais, ordem));
      ordem += cena.canais.length;
      if (cena.oferta && tem(ICONE_DA_OFERTA, cena.oferta)) {
        var icone = P.desenhar(ICONE_DA_OFERTA[cena.oferta]) || [];
        gs.push(grupo('oferta', ordem, [t(R(MOLDURA.x, MOLDURA.y, MOLDURA.lado, MOLDURA.lado, 2), true)]));
        gs.push(grupo('oferta', ordem, acento(icone), MOLDURA.x + 3, MOLDURA.y + 3, ICONE_ESCALA));
        ordem++;
      }
      /* (revisão visual) o canal do mapa já desenha o pino: o destaque de localização não repete */
      var repete = cena.destaque === 'localizacao' && cena.canais.indexOf('google_mapa') >= 0;
      if (cena.destaque && tem(DESTAQUES, cena.destaque) && !repete) gs.push(grupo('destaque', ordem, DESTAQUES[cena.destaque]));
      return Object.freeze({ viewBox: '0 0 320 120', grupos: Object.freeze(gs) });
    } catch (x) { return null; }
  }

  return Object.freeze({ tracosDaCena: tracosDaCena });
});
