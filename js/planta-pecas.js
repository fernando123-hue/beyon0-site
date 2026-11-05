/* PLANTA VIVA: as 29 peças (chegada + 28 tipos; spec Anexo A), 1 para 1 com orcamento-planta-forma.js. Traços { d, ac } numa grade de 40 x 40,
   só traço (sem preenchimento, filtro nem desfoque). ES5, sem DOM: window.BZPlantaPecas na tela, CommonJS no Node. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZPlantaPecas = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var R = function (x, y, w, h, r) {
    r = r || 0;
    if (!r) return 'M' + x + ' ' + y + 'H' + (x + w) + 'V' + (y + h) + 'H' + x + 'Z';
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) +
      'V' + (y + h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w - r) + ' ' + (y + h) + 'H' + (x + r) +
      'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) + 'V' + (y + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z';
  };
  var C = function (cx, cy, r) {
    return 'M' + (cx - r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + (cx + r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 1 0 ' + (cx - r) + ' ' + cy + 'Z';
  };
  var t = function (d, ac) { return { d: d, ac: !!ac }; };

  var arco = function (cx, cy, r, a0, a1) {
    var p = function (a) { return [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)]; };
    var s = p(a0), e = p(a1), grande = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return 'M' + s[0].toFixed(2) + ' ' + s[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + grande + ' ' + (a1 > a0 ? 1 : 0) + ' ' + e[0].toFixed(2) + ' ' + e[1].toFixed(2);
  };

  var PECAS = {
    chegada: function (n) {
      var ys = n <= 1 ? [20] : n === 2 ? [12, 28] : n === 3 ? [8, 20, 32] : [5, 14, 26, 35];
      var o = [];
      ys.forEach(function (y) { o.push(t(C(4, y, 2))); o.push(t('M6.3 ' + y + 'L23 20')); });
      o.push(t('M23 20H28'));
      o.push(t(C(33, 20, 5), true));
      o.push(t(C(33, 20, 1.2), true));
      return o;
    },
    pagina: function () {
      return [t(R(6, 4, 28, 32, 2)), t('M6 11H34'), t(R(10, 15, 20, 8)), t('M10 27H25'), t(R(10, 30, 10, 3), true)];
    },
    conversa: function () {
      return [
        t('M4 9a3 3 0 0 1 3-3H23a3 3 0 0 1 3 3V15a3 3 0 0 1-3 3H13L8 22V18H7a3 3 0 0 1-3-3Z'),
        t('M9 10.5H21M9 13.5H17'),
        t('M16 24a3 3 0 0 1 3-3H33a3 3 0 0 1 3 3V30a3 3 0 0 1-3 3H32V37L27 33H19a3 3 0 0 1-3-3Z', true),
        t('M21 26H31M21 29H27', true)
      ];
    },
    agenda: function () {
      return [t(R(5, 8, 30, 27, 2)), t('M5 15H35'), t('M12 4V11M28 4V11'),
        t(R(9.5, 19, 4, 3)), t(R(18, 19, 4, 3)), t(R(26.5, 19, 4, 3)), t(R(9.5, 26.5, 4, 3)),
        t(R(23.5, 24, 10, 8), true), t('M26 28L28 30L31.5 26', true)];
    },
    lembrete: function () {
      return [t(C(17, 23, 12)), t('M17 23V16M17 23L22 26'), t('M30 12a6 6 0 0 1 5 5', true), t('M30 6a12 12 0 0 1 10 10', true)];
    },
    retoma: function () {
      return [t(arco(20, 20, 13, -50, 250)), t('M31 6L33.5 13.5L26 13.5', true), t(C(20, 20, 2.5), true)];
    },
    sinal: function () {
      return [t(C(20, 20, 14)), t(C(20, 20, 8), true), t('M20 15.5V24.5M17.5 17.5a2.5 2 0 0 1 2.5-2h.5a2.5 2 0 0 1 0 4h-1a2.5 2 0 0 0 0 4h.5a2.5 2 0 0 0 2.5-2', true)];
    },
    vitrine: function () {
      return [t(R(5, 5, 13, 13)), t(R(22, 5, 13, 13), true), t('M22 11.5H35M28.5 5V18', true), t(R(5, 22, 13, 13)), t(R(22, 22, 13, 13)), t('M8 29H15M25 29H32')];
    },
    cabide: function () {
      return [t('M20 11a3.2 3.2 0 1 0-3.2-3.2', true), t('M20 11V15L5.5 26.5A2 2 0 0 0 6.8 30H33.2A2 2 0 0 0 34.5 26.5L20 15')];
    },
    produto: function () {
      return [t(R(4, 5, 21, 30, 2)), t('M4 28L12 19L18 25L21 22L25 27'), t(C(11, 12, 2.4)),
        t(R(29, 7, 8, 6)), t(R(29, 17, 8, 6), true), t(R(29, 27, 8, 6))];
    },
    guia: function () {
      return [t(R(3, 10, 34, 12, 1)), t('M8 10V15M13 10V13M18 10V15M23 10V13M28 10V15M33 10V13'),
        t('M3 30H37', true), t('M3 27V33M37 27V33', true), t('M7 28L3 30L7 32M33 28L37 30L33 32', true)];
    },
    carrinho: function () {
      return [t('M8 13H32L34 35H6Z'), t('M14 13V10a6 6 0 0 1 12 0V13'), t('M15 23L19 27L26 20', true)];
    },
    pagamento: function () {
      return [t(R(3, 9, 34, 22, 3)), t('M3 16H37'), t(R(8, 23, 9, 3), true), t('M22 24.5H32')];
    },
    caixa: function () {
      return [t('M20 5L34 12V28L20 35L6 28V12Z'), t('M6 12L20 19L34 12'), t('M20 19V35'),
        t('M37 12V28M35.5 12H38.5M35.5 28H38.5', true)];
    },
    tabela: function () {
      return [t(R(4, 7, 32, 26, 1)), t('M4 15H36M4 24H36M16 7V33'), t(R(17, 16, 19, 8), true), t('M20 20H33', true)];
    },
    briefing: function () {
      return [t(R(8, 7, 20, 16)), t('M8 7L13 3H33L28 7M33 3V19L28 23'), t('M8 30H28', true), t('M8 27.5V32.5M28 27.5V32.5', true), t('M34 24V35', true)];
    },
    amostra: function () {
      return [t(R(3, 15, 18, 16)), t('M3 21H21M10 15V21'), t('M25 23H37', true), t('M33 19L37 23L33 27', true)];
    },
    proposta: function () {
      return [t(R(7, 4, 24, 32, 2)), t('M12 11H26M12 16H26M12 21H20'), t(C(28, 29, 6), true), t('M25.2 29L27.4 31.2L31 27.2', true)];
    },
    acabamento: function () {
      return [t(R(4, 8, 9, 24)), t(R(15.5, 8, 9, 24), true), t(R(27, 8, 9, 24)), t('M6 14L11 12M6 20L11 18M6 26L11 24'), t('M17.5 14H22.5M17.5 20H22.5M17.5 26H22.5', true), t('M29 12L34 14M29 18L34 20M29 24L34 26')];
    },
    aviso: function () {
      return [t(R(4, 9, 32, 22, 2)), t('M4 11L20 22L36 11', true), t('M4 30L14 20M36 30L26 20')];
    },

    formulario: function () {
      return [t(R(7, 4, 26, 32, 2)), t('M11 9H18'), t(R(11, 11.5, 18, 5)), t('M11 21H17'), t(R(11, 23.5, 18, 5)), t(R(11, 31, 10, 3), true)];
    },
    mapa: function () {
      return [t('M4 9L14 5L26 9L36 5V31L26 35L14 31L4 35Z'), t('M14 5V31M26 9V35'),
        t('M21 15a6 6 0 0 1 12 0c0 3.5-3 7-6 9c-3-2-6-5.5-6-9Z', true), t(C(27, 15, 2), true)];
    },
    galeria: function () {
      return [t(R(4, 8, 22, 24, 1)), t('M4 26L11 18L16 23L20 19L26 25'), t(C(10, 14, 2)), t(R(29, 8, 7, 10), true), t(R(29, 22, 7, 10), true)];
    },
    catalogo: function () {
      return [t('M20 8C16 5.5 9 5.5 4 7.5V33C9 31 16 31 20 34C24 31 31 31 36 33V7.5C31 5.5 24 5.5 20 8Z'), t('M20 8V34'),
        t('M8 13H16M8 18H16M8 23H14'), t('M24 13H32M24 18H32', true)];
    },
    cardapio: function () {
      return [t(R(4, 4, 20, 32, 2)), t('M8 11H20M8 16H20M8 21H16M8 26H18'), t('M28 6V13a3 3 0 0 0 6 0V6', true), t('M31 16V35', true)];
    },
    aula: function () {
      return [t(R(4, 6, 32, 21, 2)), t('M16 11.5L25 16.5L16 21.5Z', true), t('M20 27V33M13 34H27')];
    },
    documento: function () {
      return [t('M13 4H31V30'), t('M9 8H24L29 13V36H9Z'), t('M24 8V13H29'), t('M13 20H25M13 25H25', true), t('M13 30H20')];
    },
    confirmacao: function () {
      return [t(C(20, 20, 14)), t('M13 20.5L18 25.5L27 15', true), t('M20 3V6M20 34V37M3 20H6M34 20H37')];
    },
    mensagem: function () {
      return [t('M5 7H35V27H17L10 34V27H5Z'), t(C(13.5, 17, 1.2), true), t(C(20, 17, 1.2), true), t(C(26.5, 17, 1.2), true)];
    }
  };

  var TIPOS = Object.keys(PECAS);

  function desenhar(tipo, n) {
    if (typeof tipo !== 'string' || !Object.prototype.hasOwnProperty.call(PECAS, tipo)) return null;
    var q = typeof n === 'number' && isFinite(n) ? Math.max(1, Math.min(4, Math.floor(n))) : 1;
    return PECAS[tipo](q);
  }

  return Object.freeze({ PECAS: PECAS, TIPOS: TIPOS, desenhar: desenhar });
});
