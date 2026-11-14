/* ==========================================================================
   A FORMA DO MAPA DO CASO, v3 (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §7; plano
   docs/superpowers/plans/2026-11-13-pr4-composicao-servidor.md §2 a §4). UM arquivo, para a tela e para o servidor, como
   js/orcamento-planta-forma.js: script clássico no navegador (window.BZMapaForma), CommonJS no servidor. ES5, sem DOM, sem node:.

   O plano v3: a estrutura (caminho, antes_depois, ramos, ciclo, mapa), o "hoje" (origens por código e as palavras da pessoa), 2 a 6 nós
   por PAPEL, setas com rótulo e o objetivo, que NÃO é nó: as setas o chamam pelo id reservado "objetivo". O desenho é um só para as 5
   estruturas: cada nó cai numa CAMADA (o passo da história, pelo caminho mais longo desde as origens) e numa FAIXA (a pista lateral);
   camadas() e faixas() são as do laboratório (docs/lab-estruturas.js) e o desenho do PR 5 usa as mesmas.

   Mora aqui a FORMA (tipos, listas, contagens, referências, o grafo). As travas de TEXTO (número, preço, prazo, marca, promessa) são só do
   servidor (api/_vendas/planta-textos.mjs). Por que um arquivo novo e não o v2: medido, a forma v2 mais os 3 módulos do desenho somam
   29.166 bytes com gzip -9, para um teto de 29.300; o v3 lá dentro estoura. As ferramentas de base (instantâneo, coletor, caracteres
   proibidos) repetem as do v2 de propósito: o PR 5 decide se a forma v2 sai, e esta não pode depender dela.

   As funções NUNCA lançam: { ok, plano, motivos, erros }, erros = [{ caminho, codigo }] (no máximo LIMITES.erros_max), sem texto do plano.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZMapaForma = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = function (lista) { return Object.freeze(lista.slice()); };
  var tabela = function (o) { var t = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = o[k]; return Object.freeze(t); };

  /* ---------- as listas fechadas ---------- */
  var ESTRUTURAS = congelar(['caminho', 'antes_depois', 'ramos', 'ciclo', 'mapa']);
  var PAPEIS = congelar(['hoje', 'trava', 'origem', 'site', 'conversa', 'acao', 'volta', 'ajustado']);
  /* os 29 desenhos de js/planta-pecas.js (o PR 5 acrescenta os de cena e de origem, com teste que prende as duas listas) */
  var ICONES = congelar([
    'chegada', 'pagina', 'conversa', 'agenda', 'lembrete', 'retoma', 'sinal', 'vitrine', 'cabide', 'produto', 'guia', 'carrinho', 'pagamento', 'caixa',
    'tabela', 'briefing', 'amostra', 'proposta', 'acabamento', 'aviso', 'formulario', 'mapa', 'galeria', 'catalogo', 'cardapio', 'aula', 'documento',
    'confirmacao', 'mensagem'
  ]);
  /* as origens por CÓDIGO (§7.3): o nome e o desenho são postos pela tela; código desconhecido, na tela, vira "outro" */
  var ORIGENS_MAPA = congelar(['instagram', 'whatsapp', 'google_busca', 'google_mapa', 'indicacao', 'passa_na_frente', 'facebook', 'tiktok', 'site_atual', 'outro']);
  /* os toques de "como chegam" (js/orcamento-rotulos.js) para o código do mapa: "google" é a busca (o mapa só quando ela escreveu mapa) */
  var ORIGEM_DA_SUGESTAO = tabela({ instagram: 'instagram', whatsapp: 'whatsapp', indicacao: 'indicacao', google: 'google_busca', passa_na_frente: 'passa_na_frente' });
  /* as origens do v2 (o esboço do PR 5 ainda as usa): as ambíguas viram "outro" (não se inventa canal) */
  var ORIGEM_DO_V2 = tabela({ busca: 'google_busca', mapa: 'google_mapa', indicacao: 'indicacao', rede: 'outro', anuncio: 'outro', direto: 'outro', email: 'outro' });

  /* ---------- os limites (plano do PR 4, §4; conferidos contra os 15 planos e o caso "limites" do laboratório) ---------- */
  var LIMITES_MAPA = Object.freeze({
    titulo_min: 3, titulo_max: 28, frase_min: 20, frase_max: 60, rotulo_min: 3, rotulo_max: 24, hoje_min: 10, hoje_max: 60,
    fecho_min: 20, fecho_max: 80, nos_min: 2, nos_max: 6, setas_min: 1, setas_max: 9, hoje_origens_max: 3,
    camadas_max: 5, por_camada_max: 2, origens_nos_max: 2, ajustados_max: 2, plano_bytes: 6144, erros_max: 20
  });
  /* o id vai para data-id e nunca para classe ou seletor; "objetivo" e "hoje" são do desenho; o resto, nomes que um objeto comum já tem */
  var ID_NO = /^[a-z0-9_]{1,12}$/;
  var IDS_RESERVADOS = congelar(['objetivo', 'hoje', '__proto__', 'constructor', 'prototype', 'proto']);
  var OBJETIVO = 'objetivo';
  var CHAVES_DE_PROTOTIPO = ['__proto__', 'constructor', 'prototype'];

  var CHAVES_RAIZ = ['estrutura', 'hoje', 'nos', 'setas', 'objetivo', 'fecho'];
  var OBRIGATORIAS_RAIZ = ['estrutura', 'nos', 'setas', 'objetivo', 'fecho'];
  var CHAVES_HOJE = ['origens', 'texto', 'trava'];
  var CHAVES_NO = ['id', 'papel', 'icone', 'origem', 'titulo', 'frase'];
  var OBRIGATORIAS_NO = ['id', 'papel', 'icone', 'titulo', 'frase'];
  var CHAVES_SETA = ['de', 'para', 'rotulo'];
  var CHAVES_OBJETIVO = ['titulo', 'frase'];

  /* o que nunca entra num texto (a mesma lista do v2, js/orcamento-planta-forma.js, por código numérico: "<", ">" e os equivalentes do NFKC,
     controles, separadores de linha, Default_Ignorable_Code_Point, braille em branco e substituto UTF-16 solto) */
  var CARACTERE_PROIBIDO_G = (function () {
    var faixas = [[0x3c, 0x3c], [0x3e, 0x3e], [0xff1c, 0xff1c], [0xff1e, 0xff1e], [0xfe64, 0xfe65], [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad],
      [0x34f, 0x34f], [0x61c, 0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180b, 0x180f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f],
      [0x2800, 0x2800], [0x3164, 0x3164], [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff0, 0xfffb]];
    var cod = function (n) { var h = n.toString(16); while (h.length < 4) h = '0' + h; return String.fromCharCode(92, 117) + h; };
    var faixa = function (a, b) { return a === b ? cod(a) : cod(a) + '-' + cod(b); };
    var corpo = '', i;
    for (i = 0; i < faixas.length; i++) corpo += faixa(faixas[i][0], faixas[i][1]);
    var alto = '[' + faixa(0xd800, 0xdbff) + ']', baixo = '[' + faixa(0xdc00, 0xdfff) + ']';
    var etiqueta = '[' + faixa(0xdb40, 0xdb43) + '][' + faixa(0xdc00, 0xdfff) + ']|' + cod(0xd82f) + '[' + faixa(0xdca0, 0xdca3) + ']|' + cod(0xd834) + '[' + faixa(0xdd73, 0xdd7a) + ']';
    return new RegExp('[' + corpo + ']|' + etiqueta + '|' + alto + '(?!' + baixo + ')|(?:^|[^' + faixa(0xd800, 0xdbff) + '])' + baixo, 'g');
  })();
  var CARACTERE_PROIBIDO = new RegExp(CARACTERE_PROIBIDO_G.source);
  var proibido = function (v) {
    if (CARACTERE_PROIBIDO.test(v)) return true;
    if (typeof v.normalize === 'function') { try { return CARACTERE_PROIBIDO.test(v.normalize('NFKC')); } catch (e) { return true; } }
    return false;
  };

  /* as tabelas só valem pela chave PRÓPRIA (um id "constructor" não passa pela herança do Object) */
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  var ehObjeto = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var naLista = function (lista, v) { return typeof v === 'string' && lista.indexOf(v) >= 0; };

  function bytesUtf8(s) {
    var n = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function instantaneo(bruto, maxBytes) {
    var json;
    try { json = JSON.stringify(bruto); } catch (e) { return { codigo: 'nao_serializavel' }; }
    if (typeof json !== 'string') return { codigo: 'nao_objeto' };
    if (bytesUtf8(json) > maxBytes) return { codigo: 'grande' };
    try { return { valor: JSON.parse(json) }; } catch (e2) { return { codigo: 'nao_serializavel' }; }
  }
  function coletor() {
    var erros = [], codigos = [];
    return {
      erros: erros, codigos: codigos,
      add: function (caminho, codigo) {
        if (codigos.indexOf(codigo) < 0) codigos.push(codigo);
        if (erros.length < LIMITES_MAPA.erros_max) erros.push({ caminho: caminho, codigo: codigo });
      },
      vazio: function () { return codigos.length === 0; }
    };
  }
  function falha(codigo, c) {
    if (c) return { ok: false, motivos: c.codigos.slice(), erros: c.erros.slice() };
    return { ok: false, motivos: [codigo], erros: [{ caminho: '', codigo: codigo }] };
  }
  function conferirChaves(obj, permitidas, obrigatorias, caminho, c) {
    var chaves = Object.keys(obj), i;
    for (i = 0; i < chaves.length; i++) {
      if (CHAVES_DE_PROTOTIPO.indexOf(chaves[i]) >= 0) c.add(caminho ? caminho + '.' + chaves[i] : chaves[i], 'chave_proibida');   /* (os nomes de protótipo são uma lista fixa nossa) */
      /* (revisão de segurança do PR 4, B2) o nome de uma chave desconhecida é texto do modelo: nunca volta a ele, nem no caminho do erro */
      else if (permitidas.indexOf(chaves[i]) < 0) c.add(caminho ? caminho + '.?' : '?', 'chave_extra');
    }
    for (i = 0; i < obrigatorias.length; i++) if (!tem(obj, obrigatorias[i])) c.add(caminho ? caminho + '.' + obrigatorias[i] : obrigatorias[i], 'chave_faltando');
  }
  /* um texto: string, sem caractere proibido, no tamanho (o mínimo conta só o que se vê; o máximo, como veio) */
  function texto(v, caminho, min, max, codMin, codMax, c) {
    if (typeof v !== 'string') { c.add(caminho, 'texto'); return; }
    if (proibido(v)) c.add(caminho, 'caractere');
    if (v.replace(CARACTERE_PROIBIDO_G, '').trim().length < min) c.add(caminho, codMin);
    else if (v.length > max) c.add(caminho, codMax);
  }
  var L = LIMITES_MAPA;
  var titulo = function (v, cam, c) { texto(v, cam, L.titulo_min, L.titulo_max, 'titulo_curto', 'titulo_longo', c); };
  var frase = function (v, cam, c) { texto(v, cam, L.frase_min, L.frase_max, 'frase_curta', 'frase_longa', c); };

  /* ---------- as partes ---------- */
  function conferirHoje(h, c) {
    var i, vistas = [];
    if (!ehObjeto(h)) { c.add('hoje', 'hoje'); return []; }
    conferirChaves(h, CHAVES_HOJE, ['origens'], 'hoje', c);
    if (tem(h, 'texto')) texto(h.texto, 'hoje.texto', L.hoje_min, L.hoje_max, 'hoje_curto', 'hoje_longo', c);
    if (tem(h, 'trava')) texto(h.trava, 'hoje.trava', L.hoje_min, L.hoje_max, 'hoje_curto', 'hoje_longo', c);
    var o = h.origens;
    if (!tem(h, 'origens')) return [];
    if (!Array.isArray(o) || o.length > L.hoje_origens_max) { c.add('hoje.origens', 'origem'); return []; }
    for (i = 0; i < o.length; i++) {
      if (!naLista(ORIGENS_MAPA, o[i]) || vistas.indexOf(o[i]) >= 0) c.add('hoje.origens[' + i + ']', 'origem');
      else vistas.push(o[i]);
    }
    /* "hoje" sem nada: ao menos um de origens, texto ou trava (o padrão sem nada conhecido deixa as origens vazias e NÃO manda texto) */
    if (!o.length && !tem(h, 'texto') && !tem(h, 'trava')) c.add('hoje', 'hoje_vazio');
    return vistas;
  }

  function conferirNo(n, i, ids, origensHoje, conta, c) {
    var cam = 'nos[' + i + ']';
    if (!ehObjeto(n)) { c.add(cam, 'no'); return; }
    conferirChaves(n, CHAVES_NO, OBRIGATORIAS_NO, cam, c);
    if (tem(n, 'id')) {
      if (typeof n.id !== 'string' || !ID_NO.test(n.id)) c.add(cam + '.id', 'id_no');
      else if (IDS_RESERVADOS.indexOf(n.id) >= 0) c.add(cam + '.id', 'id_reservado');
      else if (tem(ids, n.id)) c.add(cam + '.id', 'id_repetido');
      else ids[n.id] = n.papel;
    }
    if (tem(n, 'papel') && !naLista(PAPEIS, n.papel)) c.add(cam + '.papel', 'papel');
    if (tem(n, 'icone') && !naLista(ICONES, n.icone)) c.add(cam + '.icone', 'icone');
    /* a origem: só no papel "origem", e lá obrigatória, da lista, e uma das que estão no "hoje" (zero invenção) */
    if (n.papel === 'origem') {
      conta.origem++;
      if (!naLista(ORIGENS_MAPA, n.origem)) c.add(cam + '.origem', 'origem');
      else if (origensHoje.indexOf(n.origem) < 0) c.add(cam + '.origem', 'origem_fora_do_hoje');
    } else if (tem(n, 'origem')) c.add(cam + '.origem', 'origem');
    if (n.papel === 'ajustado') conta.ajustado++;
    if (tem(n, 'titulo')) titulo(n.titulo, cam + '.titulo', c);
    if (tem(n, 'frase')) frase(n.frase, cam + '.frase', c);
  }

  function conferirSetas(setas, ids, estrutura, c) {
    var i, s, cam, pares = {}, saiObjetivo = 0;
    for (i = 0; i < setas.length; i++) {
      s = setas[i]; cam = 'setas[' + i + ']';
      if (!ehObjeto(s)) { c.add(cam, 'seta'); continue; }
      conferirChaves(s, CHAVES_SETA, CHAVES_SETA, cam, c);
      if (tem(s, 'rotulo')) texto(s.rotulo, cam + '.rotulo', L.rotulo_min, L.rotulo_max, 'rotulo', 'rotulo', c);
      var deOk = s.de === OBJETIVO || tem(ids, s.de), paraOk = s.para === OBJETIVO || tem(ids, s.para);
      if (!deOk || !paraOk) { c.add(cam, 'seta_ref'); continue; }
      if (s.de === s.para) { c.add(cam, 'seta_propria'); continue; }
      if (tem(pares, s.de + '>' + s.para)) c.add(cam, 'seta_repetida');
      pares[s.de + '>' + s.para] = 1;
      if (s.para !== OBJETIVO && ids[s.para] === 'origem') c.add(cam, 'seta_para_origem');
      if (s.de === OBJETIVO) saiObjetivo++;
    }
    /* o objetivo só SAI no ciclo (a volta para o nó do retorno), uma vez */
    if (saiObjetivo && (estrutura !== 'ciclo' || saiObjetivo > 1)) c.add('setas', 'objetivo_sai');
  }

  /* ---------- camadas e faixas (as do laboratório, docs/lab-estruturas.js) ---------- */
  /* camada de cada nó = o caminho mais longo desde as origens, sem a seta de volta (a que fecha um laço na busca em profundidade, na ordem do plano) */
  function camadas(p) {
    var ids = p.nos.map(function (n) { return n.id; }).concat(OBJETIVO), filhos = {}, volta = [], estado = {}, camada = {}, temEntrada = {}, k;
    ids.forEach(function (id) { filhos[id] = []; });
    p.setas.forEach(function (s) { if (tem(filhos, s.de)) filhos[s.de].push(s); temEntrada[s.para] = 1; });
    function dfs(id) {
      estado[id] = 1;
      filhos[id].forEach(function (s) {
        if (estado[s.para] === 1) volta.push(s);
        else if (!estado[s.para] && tem(filhos, s.para)) dfs(s.para);
      });
      estado[id] = 2;
    }
    ids.forEach(function (id) { if (!temEntrada[id] && !estado[id]) dfs(id); });
    ids.forEach(function (id) { if (!estado[id]) dfs(id); });
    var diretas = p.setas.filter(function (s) { return volta.indexOf(s) < 0; });
    ids.forEach(function (id) { camada[id] = 0; });
    for (k = 0; k < ids.length; k++) diretas.forEach(function (s) { if (camada[s.para] < camada[s.de] + 1) camada[s.para] = camada[s.de] + 1; });
    var porCamada = [];
    ids.forEach(function (id) { (porCamada[camada[id]] = porCamada[camada[id]] || []).push(id); });
    return { camada: camada, porCamada: porCamada, volta: volta, diretas: diretas };
  }
  var CINZA = { hoje: 1, trava: 1 };
  /* faixa de cada nó: 0, 1 ou -1 (ocupa a largura toda, centrado) */
  function faixas(est, p, lay) {
    var f = {}, papel = {}, n = 1;
    p.nos.forEach(function (x) { papel[x.id] = x.papel; });
    papel[OBJETIVO] = OBJETIVO;
    if (est === 'antes_depois') {
      n = 2;
      Object.keys(lay.camada).forEach(function (id) { f[id] = tem(CINZA, papel[id]) ? 0 : (papel[id] === OBJETIVO || papel[id] === 'origem') ? -1 : 1; });
    } else if (est === 'ramos') {
      n = 2;
      Object.keys(lay.camada).forEach(function (id) { f[id] = -1; });
      var div = null, alcance = {};
      p.nos.forEach(function (x) { if (!div && lay.diretas.filter(function (s) { return s.de === x.id; }).length === 2) div = x.id; });
      lay.diretas.filter(function (s) { return s.de === div; }).forEach(function (s, i) {
        var fila = [s.para], visto = {};
        while (fila.length) {
          var id = fila.shift();
          if (id === OBJETIVO || visto[id]) continue;
          visto[id] = 1; alcance[id] = (alcance[id] || 0) + 1; f[id] = i;
          lay.diretas.forEach(function (x) { if (x.de === id) fila.push(x.para); });
        }
      });
      Object.keys(alcance).forEach(function (id) { if (alcance[id] > 1) f[id] = -1; });
    } else if (est === 'mapa') {
      n = 2;
      lay.porCamada.forEach(function (ids) {
        if (ids.length === 1) { f[ids[0]] = -1; return; }
        var peso = function (id) {
          var de = lay.diretas.filter(function (s) { return s.para === id && f[s.de] >= 0; });
          return de.length ? de.reduce(function (a, s) { return a + f[s.de]; }, 0) / de.length : 0.5;
        };
        ids.slice().sort(function (a, b) { return peso(a) - peso(b) || ids.indexOf(a) - ids.indexOf(b); }).forEach(function (id, i) { f[id] = i; });
      });
    } else Object.keys(lay.camada).forEach(function (id) { f[id] = 0; });
    if (n > 1) lay.porCamada.forEach(function (ids) {
      if (ids.length < 2) return;
      var usadas = {};
      ids.forEach(function (id) { if (f[id] >= 0) usadas[f[id]] = 1; });
      ids.forEach(function (id) {
        if (f[id] >= 0) return;
        for (var k = 0; k < n; k++) if (!usadas[k]) { f[id] = k; usadas[k] = 1; return; }
      });
    });
    return { f: f, n: n };
  }

  /* ---------- o grafo: só sobre um plano com ids e setas válidos ---------- */
  function conferirGrafo(p, c) {
    var est = p.estrutura, saem = {}, entram = {}, papeis = {}, alcanca = {}, mudou = true;
    p.nos.forEach(function (n) { papeis[n.id] = n.papel; });
    p.setas.forEach(function (s) { saem[s.de] = (saem[s.de] || 0) + 1; entram[s.para] = (entram[s.para] || 0) + 1; });
    if (!entram[OBJETIVO]) c.add('setas', 'sem_objetivo');
    p.nos.forEach(function (n, i) { if (!saem[n.id] && !entram[n.id]) c.add('nos[' + i + ']', 'no_solto'); });
    /* todo nó alcança o objetivo */
    alcanca[OBJETIVO] = true;
    while (mudou) {
      mudou = false;
      p.setas.forEach(function (s) { if (alcanca[s.para] && !alcanca[s.de]) { alcanca[s.de] = true; mudou = true; } });
    }
    p.nos.forEach(function (n, i) { if (saem[n.id] || entram[n.id]) { if (!alcanca[n.id]) c.add('nos[' + i + ']', 'nao_chega'); } });
    if (!c.vazio()) return;
    var lay = camadas(p), fx = faixas(est, p, lay);
    if (lay.porCamada.length > L.camadas_max) c.add('nos', 'camadas');
    lay.porCamada.forEach(function (ids, i) {
      if (ids.length > Math.min(fx.n, L.por_camada_max)) { c.add('camadas[' + i + ']', 'camada_cheia'); return; }
      if (ids.length < 2) return;
      var usadas = {};
      ids.forEach(function (id) { if (fx.f[id] < 0 || usadas[fx.f[id]]) c.add('camadas[' + i + ']', 'camada_cheia'); usadas[fx.f[id]] = 1; });
    });
    /* a seta que pula camada só passa por uma faixa VAZIA (a linha correria por baixo da caixa do meio) */
    lay.diretas.forEach(function (x) {
      var a = lay.camada[x.de], b = lay.camada[x.para], fa = fx.f[x.de], fb = fx.f[x.para], faixa = fa >= 0 ? fa : fb, k;
      if (b - a < 2) return;
      if ((fa >= 0 && fb >= 0 && fa !== fb) || faixa < 0) { c.add('setas', 'pulo'); return; }
      for (k = a + 1; k < b; k++) lay.porCamada[k].forEach(function (id) { if (fx.f[id] < 0 || fx.f[id] === faixa) c.add('setas', 'pulo'); });
    });
    if (est === 'ciclo' ? lay.volta.length !== 1 : lay.volta.length > 0) c.add('setas', 'volta');
    var temPapel = function (lista) { return p.nos.some(function (n) { return lista.indexOf(n.papel) >= 0; }); };
    if (est === 'ramos' && !p.nos.some(function (n) { return lay.diretas.filter(function (s) { return s.de === n.id; }).length === 2; })) c.add('nos', 'ramos');
    if (est === 'antes_depois' && !(temPapel(['trava']) && temPapel(['site', 'acao']))) c.add('nos', 'antes_depois');
    if (est === 'caminho' && p.nos.some(function (n) { return saem[n.id] > 1 || entram[n.id] > 1; })) c.add('setas', 'caminho_divide');
    if (est === 'mapa' && !(p.nos.length >= 4 && temPapel(['trava']) && temPapel(['origem']))) c.add('nos', 'mapa');
  }

  function validar(bruto) {
    var snap = instantaneo(bruto, L.plano_bytes);
    if (snap.codigo) return falha(snap.codigo);
    var p = snap.valor, c = coletor(), i, ids = {}, conta = { origem: 0, ajustado: 0 };
    if (!ehObjeto(p)) return falha('nao_objeto');
    /* as duas versões juntas: não se sabe qual valeria */
    if (tem(p, 'topologia')) c.add('topologia', 'versao');
    /* o 'hoje' é opcional na FORMA (o padrão sem nada conhecido vai sem ele) e obrigatório no esquema da ferramenta (plano do PR 4, §2.7) */
    conferirChaves(p, CHAVES_RAIZ.concat(tem(p, 'topologia') ? ['topologia'] : []), OBRIGATORIAS_RAIZ, '', c);
    if (tem(p, 'estrutura') && !naLista(ESTRUTURAS, p.estrutura)) c.add('estrutura', 'estrutura');
    var origensHoje = tem(p, 'hoje') ? conferirHoje(p.hoje, c) : [];
    if (tem(p, 'objetivo')) {
      if (!ehObjeto(p.objetivo)) c.add('objetivo', 'objetivo');
      else {
        conferirChaves(p.objetivo, CHAVES_OBJETIVO, CHAVES_OBJETIVO, 'objetivo', c);
        if (tem(p.objetivo, 'titulo')) titulo(p.objetivo.titulo, 'objetivo.titulo', c);
        if (tem(p.objetivo, 'frase')) frase(p.objetivo.frase, 'objetivo.frase', c);
      }
    }
    if (tem(p, 'fecho')) texto(p.fecho, 'fecho', L.fecho_min, L.fecho_max, 'fecho_curto', 'fecho_longo', c);
    var nosOk = Array.isArray(p.nos), setasOk = Array.isArray(p.setas);
    if (tem(p, 'nos') && (!nosOk || p.nos.length < L.nos_min || p.nos.length > L.nos_max)) c.add('nos', 'nos_qtd');
    if (tem(p, 'setas') && (!setasOk || p.setas.length < L.setas_min || p.setas.length > L.setas_max)) c.add('setas', 'setas_qtd');
    if (nosOk) for (i = 0; i < p.nos.length; i++) conferirNo(p.nos[i], i, ids, origensHoje, conta, c);
    if (conta.origem > L.origens_nos_max) c.add('nos', 'origens_nos');
    if (conta.ajustado > L.ajustados_max) c.add('nos', 'ajustado');
    if (setasOk) conferirSetas(p.setas, ids, p.estrutura, c);
    if (!c.vazio()) return falha(null, c);
    conferirGrafo(p, c);
    if (!c.vazio()) return falha(null, c);
    return { ok: true, plano: p, motivos: [], erros: [] };
  }
  function validarFormaMapa(bruto) {
    try { return validar(bruto); } catch (e) { return falha('interno'); }
  }

  return Object.freeze({
    ESTRUTURAS: ESTRUTURAS, PAPEIS: PAPEIS, ICONES: ICONES, ORIGENS_MAPA: ORIGENS_MAPA, ORIGEM_DA_SUGESTAO: ORIGEM_DA_SUGESTAO, ORIGEM_DO_V2: ORIGEM_DO_V2,
    LIMITES_MAPA: LIMITES_MAPA, ID_NO: ID_NO, IDS_RESERVADOS: IDS_RESERVADOS,
    camadas: camadas, faixas: faixas, validarFormaMapa: validarFormaMapa
  });
});
