/* ==========================================================================
   A FORMA DA PLANTA VIVA (spec docs/superpowers/specs/2026-11-05-planta-viva-design.md §2.2, §2.4 passo 1, §3.4 passo 1).
   UM arquivo só, para a tela e para o servidor: o navegador o carrega como script clássico (window.BZPlantaForma); o servidor o
   importa como módulo CommonJS (o mesmo desenho de js/orcamento-material-esquema.js). ES5 sintático, sem DOM, sem node:, sem import.

   O que mora aqui: as LISTAS FECHADAS (topologias, tipos, verbos, origens, eixos e níveis do radar), os LIMITES e a validação de
   FORMA (tipos, contagens, regras por topologia, limpeza de caracteres, comprimentos). O que NÃO mora aqui: as travas de TEXTO
   (número, preço, prazo, marca, promessa...), que são só do servidor (api/_vendas/planta-textos.mjs, PR 2a). A forma deixa
   passar "Responde em 5 minutos"; quem barra é a camada de texto.

   As funções NUNCA lançam. Devolvem { ok, plano|leitura, motivos, erros }:
     motivos = códigos sem repetição (cabem no banco, sem texto do visitante); erros = [{ caminho, codigo }] com o caminho
     legível ("etapas[2].titulo"), no máximo LIMITES.erros_max, para o servidor montar a volta ao modelo.
   A validação trabalha sobre um INSTANTÂNEO (JSON.stringify e JSON.parse): getters, toJSON e protótipos de fora do objeto
   original não enganam nem alteram nada, o bruto nunca é tocado, e o que volta é uma cópia nova.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZPlantaForma = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = function (lista) { return Object.freeze(lista.slice()); };

  /* ---------- as listas fechadas ---------- */
  var TOPOLOGIAS = congelar(['laco', 'bifurca', 'espinha']);
  /* 28 tipos de etapa + "chegada" (o ícone da caixa de chegada: só por esse papel, nunca como etapa) = 29 desenhos (spec Anexo A) */
  var TIPOS_ETAPA = congelar([
    'pagina', 'conversa', 'agenda', 'lembrete', 'retoma', 'sinal', 'vitrine', 'cabide', 'produto', 'guia', 'carrinho', 'pagamento', 'caixa', 'tabela',
    'briefing', 'amostra', 'proposta', 'acabamento', 'aviso', 'formulario', 'mapa', 'galeria', 'catalogo', 'cardapio', 'aula', 'documento', 'confirmacao', 'mensagem'
  ]);
  var TIPOS = congelar(['chegada'].concat(TIPOS_ETAPA));
  var VERBOS = congelar([
    'Recebe', 'Mostra', 'Conduz', 'Decide', 'Agenda', 'Lembra', 'Cobra', 'Calcula', 'Levanta', 'Combina', 'Propõe', 'Retoma', 'Reativa', 'Mede',
    'Convence', 'Reúne', 'Avisa', 'Escolhe', 'Confirma', 'Responde', 'Registra', 'Organiza', 'Explica', 'Orienta', 'Envia', 'Guarda', 'Separa',
    'Apresenta', 'Aprova', 'Entrega', 'Sugere', 'Chama', 'Pergunta', 'Mantém'
  ]);
  var ORIGENS = congelar(['busca', 'mapa', 'indicacao', 'rede', 'anuncio', 'direto', 'email']);
  var EIXOS = congelar(['volume', 'repeticao', 'urgencia', 'pessoas', 'informacao']);
  var NIVEIS = congelar(['nao_falou', 'comentou', 'deixou_claro']);
  /* as chaves do briefing que só a ferramenta escreve e que nunca saem para o modelo, o gerador nem o navegador sem passar pelo estado */
  var PLANTA_CHAVES = congelar(['planta', 'leitura', 'planta_pedidos']);

  /* ---------- os limites (escolha da spec §2.2; moram SÓ aqui) ---------- */
  var LIMITES = Object.freeze({
    titulo_min: 3, titulo_max: 40, frase_min: 20, frase_max: 110, rotulo_min: 3, rotulo_max: 28,
    etapas_min: 7, etapas_max: 8,                      /* + a chegada = 8 ou 9 caixas */
    origens_min: 1, origens_max: 4,
    ramo_min: 1, ramo_max: 2, saida_min: 1, saida_max: 2,
    /* (com 7 a 8 etapas no total, tronco_min e tronco_max já decidem quase tudo; satelites_min e satelites_max só valem como rede de segurança,
       para o dia em que o limite de etapas mudar) */
    tronco_min: 4, tronco_max: 5, satelites_min: 2, satelites_max: 4,
    plano_bytes: 8192, leitura_bytes: 2048, evidencia_max: 60, erros_max: 20
  });
  /* o id vai para data-id e nunca para um seletor sem CSS.escape; "nucleo", "led" e "chegada" são das caixas fixas do desenho */
  var ID_ETAPA = /^[a-z0-9-]{2,24}$/;
  /* (os ids que o desenho usa para as caixas fixas e os nomes que um objeto comum já tem. O desenho guarda o id só em data-id, num Map ou num
     Object.create(null), e num seletor só passa por CSS.escape; o regex acima é o da spec e não muda: "--" e "00" passam nele.) */
  var IDS_RESERVADOS = ['nucleo', 'led', 'chegada', 'constructor', 'prototype', 'proto'];
  var CHAVES_DE_PROTOTIPO = ['__proto__', 'constructor', 'prototype'];

  var CHAVES_RAIZ = ['topologia', 'chegada', 'etapas', 'fim', 'fecho', 'rotulo_retorno', 'rotulos_ramos'];
  var OBRIGATORIAS_RAIZ = ['topologia', 'chegada', 'etapas', 'fim', 'fecho'];
  var CHAVES_ETAPA = ['id', 'tipo', 'verbo', 'titulo', 'frase', 'decisao', 'ramo', 'satelite_de', 'lado', 'laco', 'retorno'];
  var OBRIGATORIAS_ETAPA = ['id', 'tipo', 'verbo', 'titulo', 'frase'];

  /* O que nunca entra num texto da planta (a forma RECUSA; quem normaliza e limpa é o servidor, PR 2a):
       - "<" e ">" e os dois equivalentes que o NFKC leva a eles (largura total U+FF1C/FF1E e versão pequena U+FE64/FE65);
       - controles C0 e C1 (quebra de linha e tabulação incluídas), separadores de linha e parágrafo;
       - os que não se veem (a lista de api/_vendas/promessa.mjs, INVISIVEIS): soft hyphen, marca de direção, espaços de largura zero,
         isolados bidirecionais, BOM, e os "preenchimentos" que parecem vazios dentro de uma palavra: U+034F, U+115F/1160, U+17B4/17B5,
         seletores de variação U+FE00 a U+FE0F, U+3164, U+FFA0, o braille em branco U+2800 e os caracteres de etiqueta U+E0000 a U+E007F;
       - substituto UTF-16 solto (sem par).
     Espaço sem quebra, acentos e um par substituto válido (emoji) passam: a camada de texto do servidor decide o que fazer com eles.
     Tudo por código numérico: o arquivo não carrega caractere invisível nenhum, e a expressão sai sem a opção "u" (ES5). */
  var CARACTERE_PROIBIDO_G = (function () {
    var faixas = [[0x3c, 0x3c], [0x3e, 0x3e], [0xff1c, 0xff1c], [0xff1e, 0xff1e], [0xfe64, 0xfe65], [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad],
      [0x34f, 0x34f], [0x61c, 0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f],
      [0x2800, 0x2800], [0x3164, 0x3164], [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff9, 0xfffb]];
    var cod = function (n) { var h = n.toString(16); while (h.length < 4) h = '0' + h; return String.fromCharCode(92, 117) + h; };   /* barra, "u" e 4 dígitos */
    var faixa = function (a, b) { return a === b ? cod(a) : cod(a) + '-' + cod(b); };
    var corpo = '', i;
    for (i = 0; i < faixas.length; i++) corpo += faixa(faixas[i][0], faixas[i][1]);
    var alto = '[' + faixa(0xd800, 0xdbff) + ']', baixo = '[' + faixa(0xdc00, 0xdfff) + ']';
    var etiqueta = cod(0xdb40) + '[' + faixa(0xdc00, 0xdc7f) + ']';                          /* U+E0000 a U+E007F em UTF-16 */
    var altoSolto = alto + '(?!' + baixo + ')';                                              /* substituto alto sem o baixo logo depois */
    var baixoSolto = '(?:^|[^' + faixa(0xd800, 0xdbff) + '])' + baixo;                       /* substituto baixo sem o alto logo antes */
    return new RegExp('[' + corpo + ']|' + etiqueta + '|' + altoSolto + '|' + baixoSolto, 'g');
  })();
  var CARACTERE_PROIBIDO = new RegExp(CARACTERE_PROIBIDO_G.source);
  var proibido = function (v) {
    if (CARACTERE_PROIBIDO.test(v)) return true;
    /* e o texto já normalizado em NFKC (onde houver String.prototype.normalize): o que vira "<" ou ">" depois da normalização também é recusado */
    if (typeof v.normalize === 'function') {
      try { return CARACTERE_PROIBIDO.test(v.normalize('NFKC')); } catch (e) { return false; }
    }
    return false;
  };
  /* o nome de uma chave só entra num caminho de erro se for curto e simples; senão "?" (nunca texto livre do visitante) */
  var NOME_DE_CHAVE = /^[A-Za-z0-9_$-]{1,32}$/;

  var tem = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var ehObjeto = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var naLista = function (lista, v) { return typeof v === 'string' && lista.indexOf(v) >= 0; };

  function bytesUtf8(s) {
    var n = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }   /* par substituto = 4 bytes */
      else n += 3;
    }
    return n;
  }

  /* o instantâneo: texto -> JSON -> objeto novo. Falha em silêncio como { codigo }. */
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
      erros: erros,
      codigos: codigos,
      add: function (caminho, codigo) {
        if (codigos.indexOf(codigo) < 0) codigos.push(codigo);
        if (erros.length < LIMITES.erros_max) erros.push({ caminho: caminho, codigo: codigo });
      },
      vazio: function () { return codigos.length === 0; }
    };
  }

  function falha(codigo, c) {
    if (c) return { ok: false, motivos: c.codigos.slice(), erros: c.erros.slice() };
    return { ok: false, motivos: [codigo], erros: [{ caminho: '', codigo: codigo }] };
  }

  function caminhoDaChave(caminho, chave) {
    var nome = NOME_DE_CHAVE.test(chave) ? chave : '?';
    return caminho ? caminho + '.' + nome : nome;
  }

  /* chaves do objeto: as de protótipo são "chave_proibida"; as fora do esquema, "chave_extra"; as que faltam, "chave_faltando" */
  function conferirChaves(obj, permitidas, obrigatorias, caminho, c) {
    var chaves = Object.keys(obj), i;
    for (i = 0; i < chaves.length; i++) {
      if (CHAVES_DE_PROTOTIPO.indexOf(chaves[i]) >= 0) c.add(caminhoDaChave(caminho, chaves[i]), 'chave_proibida');
      else if (permitidas.indexOf(chaves[i]) < 0) c.add(caminhoDaChave(caminho, chaves[i]), 'chave_extra');
    }
    for (i = 0; i < obrigatorias.length; i++) {
      if (!tem(obj, obrigatorias[i])) c.add(caminho ? caminho + '.' + obrigatorias[i] : obrigatorias[i], 'chave_faltando');
    }
  }

  /* um texto: string, sem caractere proibido, dentro do tamanho. O mínimo conta o texto visível (aparado, sem invisíveis); o máximo, como veio. */
  function conferirTexto(v, caminho, min, max, codMin, codMax, c) {
    if (typeof v !== 'string') { c.add(caminho, 'texto'); return; }
    if (proibido(v)) c.add(caminho, 'caractere');
    /* o mínimo só conta o que se vê: sem espaços (trim, linear) e sem os caracteres proibidos (invisíveis, preenchimentos) */
    if (v.replace(CARACTERE_PROIBIDO_G, '').trim().length < min) c.add(caminho, codMin);
    else if (v.length > max) c.add(caminho, codMax);
  }
  var titulo = function (v, caminho, c) { conferirTexto(v, caminho, LIMITES.titulo_min, LIMITES.titulo_max, 'titulo_curto', 'titulo_longo', c); };
  var frase = function (v, caminho, c) { conferirTexto(v, caminho, LIMITES.frase_min, LIMITES.frase_max, 'frase_curta', 'frase_longa', c); };
  var rotulo = function (v, caminho, c) { conferirTexto(v, caminho, LIMITES.rotulo_min, LIMITES.rotulo_max, 'rotulo', 'rotulo', c); };

  /* ---------- as partes do plano ---------- */
  function conferirChegada(ch, c) {
    var i, vistas = [];
    if (!ehObjeto(ch)) { c.add('chegada', 'chegada'); return; }
    conferirChaves(ch, ['origens', 'titulo', 'frase'], ['origens', 'titulo', 'frase'], 'chegada', c);
    if (tem(ch, 'titulo')) titulo(ch.titulo, 'chegada.titulo', c);
    if (tem(ch, 'frase')) frase(ch.frase, 'chegada.frase', c);
    if (!tem(ch, 'origens')) return;
    var o = ch.origens, ruim = !Array.isArray(o) || o.length < LIMITES.origens_min || o.length > LIMITES.origens_max;
    if (!ruim) {
      for (i = 0; i < o.length; i++) {
        if (!naLista(ORIGENS, o[i]) || vistas.indexOf(o[i]) >= 0) { ruim = true; break; }
        vistas.push(o[i]);
      }
    }
    if (ruim) c.add('chegada.origens', 'origens');
  }

  function conferirFim(fim, c) {
    if (!ehObjeto(fim)) { c.add('fim', 'fim'); return; }
    conferirChaves(fim, ['titulo', 'frase'], ['titulo', 'frase'], 'fim', c);
    if (tem(fim, 'titulo')) titulo(fim.titulo, 'fim.titulo', c);
    if (tem(fim, 'frase')) frase(fim.frase, 'fim.frase', c);
  }

  /* os campos de uma etapa que não dependem da topologia */
  function conferirEtapa(e, i, vistos, c) {
    var cam = 'etapas[' + i + ']';
    if (!ehObjeto(e)) { c.add(cam, 'etapa'); return; }
    conferirChaves(e, CHAVES_ETAPA, OBRIGATORIAS_ETAPA, cam, c);
    if (tem(e, 'id')) {
      if (typeof e.id !== 'string' || !ID_ETAPA.test(e.id)) c.add(cam + '.id', 'id');
      else if (IDS_RESERVADOS.indexOf(e.id) >= 0) c.add(cam + '.id', 'id_reservado');
      else if (vistos.indexOf(e.id) >= 0) c.add(cam + '.id', 'id_repetido');
      else vistos.push(e.id);
    }
    if (tem(e, 'tipo') && !naLista(TIPOS_ETAPA, e.tipo)) c.add(cam + '.tipo', 'tipo');
    if (tem(e, 'verbo') && !naLista(VERBOS, e.verbo)) c.add(cam + '.verbo', 'verbo');
    if (tem(e, 'titulo')) titulo(e.titulo, cam + '.titulo', c);
    if (tem(e, 'frase')) frase(e.frase, cam + '.frase', c);
    if (tem(e, 'decisao') && typeof e.decisao !== 'boolean') c.add(cam + '.decisao', 'decisao');
  }

  /* campos que pertencem a OUTRA topologia */
  var FORA_DA_TOPOLOGIA = {
    laco: ['ramo', 'satelite_de', 'lado', 'laco'],
    bifurca: ['satelite_de', 'lado', 'laco', 'retorno'],
    espinha: ['ramo', 'retorno']
  };

  function conferirCamposDeFora(topologia, etapas, c) {
    var fora = FORA_DA_TOPOLOGIA[topologia], i, j;
    for (i = 0; i < etapas.length; i++) {
      if (!ehObjeto(etapas[i])) continue;
      for (j = 0; j < fora.length; j++) if (tem(etapas[i], fora[j])) c.add('etapas[' + i + '].' + fora[j], 'campo_fora_da_topologia');
    }
  }

  function contarDecisoes(etapas) {
    var n = 0, i;
    for (i = 0; i < etapas.length; i++) if (ehObjeto(etapas[i]) && etapas[i].decisao === true) n++;
    return n;
  }

  /* laço: só a ÚLTIMA etapa tem a chave "retorno", e vale true. Em qualquer outra, a chave não pode existir (nem "false"). */
  function conferirLaco(etapas, c) {
    var i, ultimo = etapas.length - 1;
    for (i = 0; i < etapas.length; i++) {
      if (!ehObjeto(etapas[i])) continue;
      if (i === ultimo ? etapas[i].retorno !== true : tem(etapas[i], 'retorno')) c.add('etapas[' + i + '].retorno', 'retorno');
    }
    if (contarDecisoes(etapas) > 1) c.add('etapas', 'decisao');
  }

  /* bifurca: entrada, ramo 0, ramo 1, saída, nessa ordem; a decisão é a última da entrada */
  function conferirBifurca(etapas, c) {
    var lugar = [], i, e, r, qtd = { entrada: 0, r0: 0, r1: 0, saida: 0 }, primeiro = -1, ultimo = -1, vistoR1 = false, ruim = false;
    for (i = 0; i < etapas.length; i++) {
      e = etapas[i];
      r = ehObjeto(e) && tem(e, 'ramo') ? e.ramo : undefined;
      if (r !== undefined && r !== 0 && r !== 1) { c.add('etapas[' + i + '].ramo', 'ramo'); ruim = true; r = undefined; lugar.push('x'); continue; }
      lugar.push(r === undefined ? 'e' : String(r));
      if (r !== undefined) { if (primeiro < 0) primeiro = i; ultimo = i; }
    }
    if (primeiro < 0) { if (!ruim) c.add('etapas', 'ramo'); return; }
    for (i = 0; i < etapas.length; i++) {
      if (lugar[i] === 'x') continue;
      if (lugar[i] === 'e') {
        if (i < primeiro) qtd.entrada++;
        else if (i > ultimo) qtd.saida++;
        else { c.add('etapas[' + i + ']', 'ramo'); }   /* etapa sem ramo no meio dos ramos */
      } else if (lugar[i] === '0') {
        if (vistoR1) c.add('etapas[' + i + '].ramo', 'ramo');   /* o ramo 0 vem inteiro antes do ramo 1 */
        qtd.r0++;
      } else { vistoR1 = true; qtd.r1++; }
    }
    if (qtd.entrada < 1 || qtd.r0 < LIMITES.ramo_min || qtd.r0 > LIMITES.ramo_max || qtd.r1 < LIMITES.ramo_min || qtd.r1 > LIMITES.ramo_max ||
        qtd.saida < LIMITES.saida_min || qtd.saida > LIMITES.saida_max) c.add('etapas', 'ramo');
    /* a decisão: uma só, e é a última da entrada */
    var ult = qtd.entrada - 1;
    if (contarDecisoes(etapas) !== 1 || !(ult >= 0 && ehObjeto(etapas[ult]) && etapas[ult].decisao === true)) c.add('etapas', 'decisao');
  }

  /* espinha: 4 a 5 de tronco e 2 a 4 satélites, cada um preso a uma etapa de tronco (no máximo um por etapa), um laço curto no máximo */
  function conferirEspinha(etapas, c) {
    var i, e, tronco = [], ids = [], satelites = 0, pais = [], lacos = 0;
    for (i = 0; i < etapas.length; i++) {
      e = etapas[i];
      if (!ehObjeto(e)) continue;
      if (!tem(e, 'satelite_de')) { tronco.push(e); if (typeof e.id === 'string') ids.push(e.id); }
    }
    for (i = 0; i < etapas.length; i++) {
      e = etapas[i];
      if (!ehObjeto(e)) continue;
      var cam = 'etapas[' + i + ']';
      if (tem(e, 'laco')) {
        if (typeof e.laco !== 'boolean' || !tem(e, 'satelite_de')) c.add(cam + '.laco', 'laco');
        else if (e.laco === true) lacos++;
      }
      if (!tem(e, 'satelite_de')) {
        if (tem(e, 'lado')) c.add(cam + '.lado', 'campo_fora_da_topologia');
        continue;
      }
      satelites++;
      if (typeof e.satelite_de !== 'string' || ids.indexOf(e.satelite_de) < 0 || pais.indexOf(e.satelite_de) >= 0) c.add(cam + '.satelite_de', 'satelite');
      else pais.push(e.satelite_de);
      if (!naLista(['cima', 'baixo'], e.lado)) c.add(cam + '.lado', 'lado');
    }
    if (lacos > 1) c.add('etapas', 'laco');
    if (tronco.length < LIMITES.tronco_min || tronco.length > LIMITES.tronco_max) c.add('etapas', 'tronco');
    if (satelites < LIMITES.satelites_min || satelites > LIMITES.satelites_max) c.add('etapas', 'satelite');
    if (contarDecisoes(etapas) > 1) c.add('etapas', 'decisao');
  }

  function conferirRotulosDaTopologia(raizPlano, topologia, c) {
    if (tem(raizPlano, 'rotulo_retorno')) {
      if (topologia !== 'laco') c.add('rotulo_retorno', 'campo_fora_da_topologia');
      else rotulo(raizPlano.rotulo_retorno, 'rotulo_retorno', c);
    }
    if (tem(raizPlano, 'rotulos_ramos')) {
      var r = raizPlano.rotulos_ramos;
      if (topologia !== 'bifurca') c.add('rotulos_ramos', 'campo_fora_da_topologia');
      else if (!Array.isArray(r) || r.length !== 2) c.add('rotulos_ramos', 'rotulo');
      else { rotulo(r[0], 'rotulos_ramos[0]', c); rotulo(r[1], 'rotulos_ramos[1]', c); }
    }
  }

  function validarPlano(bruto) {
    var snap = instantaneo(bruto, LIMITES.plano_bytes);
    if (snap.codigo) return falha(snap.codigo);
    var p = snap.valor;
    if (!ehObjeto(p)) return falha('nao_objeto');
    var c = coletor(), topologia = naLista(TOPOLOGIAS, p.topologia) ? p.topologia : null, i, vistos = [];
    conferirChaves(p, CHAVES_RAIZ, OBRIGATORIAS_RAIZ, '', c);
    if (tem(p, 'topologia') && !topologia) c.add('topologia', 'topologia');
    if (tem(p, 'chegada')) conferirChegada(p.chegada, c);
    if (tem(p, 'fim')) conferirFim(p.fim, c);
    if (tem(p, 'fecho')) frase(p.fecho, 'fecho', c);
    if (tem(p, 'etapas')) {
      if (!Array.isArray(p.etapas) || p.etapas.length < LIMITES.etapas_min || p.etapas.length > LIMITES.etapas_max) c.add('etapas', 'etapas_qtd');
      if (Array.isArray(p.etapas)) {
        for (i = 0; i < p.etapas.length; i++) conferirEtapa(p.etapas[i], i, vistos, c);
        if (topologia) {
          conferirCamposDeFora(topologia, p.etapas, c);
          if (topologia === 'laco') conferirLaco(p.etapas, c);
          else if (topologia === 'bifurca') conferirBifurca(p.etapas, c);
          else conferirEspinha(p.etapas, c);
        }
      }
    }
    if (topologia) conferirRotulosDaTopologia(p, topologia, c);
    return c.vazio() ? { ok: true, plano: p, motivos: [], erros: [] } : falha(null, c);
  }

  function validarFormaPlano(bruto) {
    try { return validarPlano(bruto); } catch (e) { return falha('interno'); }
  }

  /* ---------- o radar: a leitura do caso (spec §3.2, §3.3, §3.4 passo 1) ---------- */
  function validarLeitura(bruto) {
    var snap = instantaneo(bruto, LIMITES.leitura_bytes);
    if (snap.codigo) return falha(snap.codigo);
    var l = snap.valor;
    if (!ehObjeto(l)) return falha('nao_objeto');
    var c = coletor(), i, item, cam, vistos = [], porEixo = {};
    conferirChaves(l, ['eixos'], ['eixos'], '', c);
    if (tem(l, 'eixos')) {
      if (!Array.isArray(l.eixos) || l.eixos.length !== EIXOS.length) c.add('eixos', 'eixos_qtd');
      else {
        for (i = 0; i < l.eixos.length; i++) {
          item = l.eixos[i]; cam = 'eixos[' + i + ']';
          if (!ehObjeto(item)) { c.add(cam, 'eixo'); continue; }
          conferirChaves(item, ['eixo', 'nivel', 'evidencia'], ['eixo', 'nivel'], cam, c);
          if (tem(item, 'eixo')) {
            if (!naLista(EIXOS, item.eixo)) c.add(cam + '.eixo', 'eixo');
            else if (vistos.indexOf(item.eixo) >= 0) c.add(cam + '.eixo', 'eixo_repetido');
            else { vistos.push(item.eixo); porEixo[item.eixo] = item; }
          }
          if (tem(item, 'nivel') && !naLista(NIVEIS, item.nivel)) c.add(cam + '.nivel', 'nivel');
          if (tem(item, 'evidencia')) conferirTexto(item.evidencia, cam + '.evidencia', 1, LIMITES.evidencia_max, 'evidencia', 'evidencia_longa', c);
        }
      }
    }
    if (!c.vazio()) return falha(null, c);
    /* ordem canônica dos eixos: o desenho não depende da ordem em que o modelo escreveu */
    var eixos = [];
    for (i = 0; i < EIXOS.length; i++) eixos.push(porEixo[EIXOS[i]]);
    return { ok: true, leitura: { eixos: eixos }, motivos: [], erros: [] };
  }

  function validarFormaLeitura(bruto) {
    try { return validarLeitura(bruto); } catch (e) { return falha('interno'); }
  }

  return Object.freeze({
    TOPOLOGIAS: TOPOLOGIAS, TIPOS: TIPOS, TIPOS_ETAPA: TIPOS_ETAPA, VERBOS: VERBOS, ORIGENS: ORIGENS, EIXOS: EIXOS, NIVEIS: NIVEIS,
    PLANTA_CHAVES: PLANTA_CHAVES, LIMITES: LIMITES, ID_ETAPA: ID_ETAPA,
    validarFormaPlano: validarFormaPlano, validarFormaLeitura: validarFormaLeitura
  });
});
