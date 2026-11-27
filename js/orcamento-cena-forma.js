/* A FORMA DA CENA DO CASO (Mapa vivo v2, Fase 2; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 2"). UM arquivo para a tela e
   para o servidor, no molde de js/orcamento-mapa-forma.js: script clássico (window.BZCenaForma), CommonJS no Node. ES5, sem DOM.
   Cena = { lugar, gente, canais, oferta, destaque }: o tipo de lugar, quantas pessoas ela DISSE que são (6 = "6 ou mais"), até 3 canais (os
   códigos das origens do mapa do caso), o que vende como peça e um destaque. Só códigos de listas fechadas e um número: nenhum texto. A
   unicidade vem da combinação, nunca de sorteio. validar() nunca lança e devolve uma CÓPIA congelada. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZCenaForma = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = function (l) { return Object.freeze(l.slice()); };
  var LUGARES = congelar(['consultorio', 'salao', 'cozinha', 'loja', 'oficina', 'escritorio', 'sala_aula', 'sede', 'estudio', 'obra']);
  var OFERTAS = congelar(['cardapio', 'encomenda', 'entrega', 'reserva', 'agenda', 'orcamento', 'vitrine', 'catalogo', 'aulas', 'galeria', 'loja_online', 'projeto']);
  var DESTAQUES = congelar(['fotos', 'depoimentos', 'localizacao', 'horarios']);
  /* os mesmos códigos de ORIGENS_MAPA (js/orcamento-mapa-forma.js); o teste prende as duas listas */
  var CANAIS = congelar(['instagram', 'whatsapp', 'google_busca', 'google_mapa', 'indicacao', 'passa_na_frente', 'facebook', 'tiktok', 'site_atual', 'outro']);
  var GENTE_MAX = 6, CANAIS_MAX = 3;
  var CAMPOS = congelar(['lugar', 'gente', 'canais', 'oferta', 'destaque']);
  var PROIBIDO = /[<>]/;

  var ehObjeto = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var naLista = function (lista, v) { return typeof v === 'string' && lista.indexOf(v) >= 0; };

  /* um código de lista: '' se bom, senão o código do erro */
  function conferirCodigo(lista, v, obrigatorio) {
    if (v === null || v === undefined) return obrigatorio ? 'obrigatorio' : '';
    if (typeof v !== 'string') return 'tipo';
    if (PROIBIDO.test(v)) return 'caractere_proibido';
    return naLista(lista, v) ? '' : 'fora_da_lista';
  }
  function conferirCanais(v, erros) {
    if (!Array.isArray(v)) { erros.push({ caminho: 'canais', codigo: 'tipo' }); return; }
    if (v.length > CANAIS_MAX) { erros.push({ caminho: 'canais', codigo: 'fora_do_limite' }); return; }
    for (var i = 0; i < v.length; i++) {
      var e = conferirCodigo(CANAIS, v[i], true);
      if (!e && v.indexOf(v[i]) !== i) e = 'repetido';
      if (e) erros.push({ caminho: 'canais.' + i, codigo: e });
    }
  }
  /* a cópia: cada campo PRÓPRIO lido uma vez só (getter que muda ou campo herdado não enganam a validação; revisões do PR 1) */
  function copiar(c) {
    var d = {}, i, v;
    for (i = 0; i < CAMPOS.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(c, CAMPOS[i])) continue;
      v = c[CAMPOS[i]];
      d[CAMPOS[i]] = Array.isArray(v) ? v.slice() : v;
    }
    return d;
  }
  /* original: só para achar campo desconhecido; c: a cópia, que é o que se confere */
  function conferir(original, c) {
    var erros = [], k, e;
    for (k in original) if (Object.prototype.hasOwnProperty.call(original, k) && CAMPOS.indexOf(k) < 0) erros.push({ caminho: k, codigo: 'campo_desconhecido' });
    if ((e = conferirCodigo(LUGARES, c.lugar, true))) erros.push({ caminho: 'lugar', codigo: e });
    if (typeof c.gente !== 'number' || c.gente % 1 !== 0 || c.gente < 0 || c.gente > GENTE_MAX) erros.push({ caminho: 'gente', codigo: 'fora_do_limite' });
    conferirCanais(c.canais, erros);
    if ((e = conferirCodigo(OFERTAS, c.oferta, false))) erros.push({ caminho: 'oferta', codigo: e });
    if ((e = conferirCodigo(DESTAQUES, c.destaque, false))) erros.push({ caminho: 'destaque', codigo: e });
    return erros;
  }

  /* validar(c) -> { ok: true, cena } | { ok: false, erros }. Nunca lança */
  function validar(c) {
    try {
      if (!ehObjeto(c)) return { ok: false, erros: [{ caminho: '', codigo: 'objeto' }] };
      var d = copiar(c), erros = conferir(c, d);
      if (erros.length) return { ok: false, erros: erros };
      return { ok: true, cena: Object.freeze({
        lugar: d.lugar, gente: d.gente, canais: Object.freeze(d.canais),
        oferta: d.oferta === undefined ? null : d.oferta, destaque: d.destaque === undefined ? null : d.destaque
      }) };
    } catch (x) {
      return { ok: false, erros: [{ caminho: '', codigo: 'objeto' }] };
    }
  }

  return Object.freeze({ LUGARES: LUGARES, OFERTAS: OFERTAS, DESTAQUES: DESTAQUES, CANAIS: CANAIS, GENTE_MAX: GENTE_MAX, CANAIS_MAX: CANAIS_MAX, validar: validar });
});
