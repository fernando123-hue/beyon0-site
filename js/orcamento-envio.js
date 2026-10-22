/* ==========================================================================
   O MOTOR DE ENVIO DE ARQUIVOS (PR 3b-2; spec §3 e §7). Lógica pura e testável sem DOM; a redução (canvas) e o PUT (XHR)
   são funções injetáveis (as padrão estão no fim). Um arquivo por vez:
     escolher → (foto) reduzir no aparelho → reservar (o servidor devolve o link assinado) → PUT direto no armazém → conferir.
   • A redução é um ACRÉSCIMO: foto acima de 3 MB ou de 2560 px é redesenhada em JPEG 0,85 (economiza os dados do celular e
     tira os metadados); a logo vai como está; se o navegador não conseguir, vai o original dentro do limite. O tamanho
     declarado é o do que vai MESMO.
   • O NOME do arquivo do aparelho só aparece na tela: nunca vai ao servidor.
   • Estados: fila → reduzindo → reservando → enviando → conferindo → enviado | erro. Erro em palavra simples, na linha.
   ========================================================================== */
(function () {
  'use strict';
  var ESQ = window.BZMaterialEsquema, L = ESQ.LIMITES;
  var FRASES = {
    tipo: 'Esse arquivo não é uma foto que o site aceita. Use JPG, PNG ou WebP.',
    foto: 'Foto grande demais (até 10 MB).', logo: 'Logo grande demais (até 5 MB).',
    fotos: 'Você chegou ao limite de 20 fotos.', logoJa: 'Já há uma logo. Tire a atual para trocar.',
    envio: 'O envio não terminou. Toque em "Tentar de novo".', rede: 'Sem conexão. Confira a internet e tente de novo.',
    abandonado: 'Este envio não terminou. Tire e escolha de novo.'
  };
  var EM_ANDAMENTO = { fila: 1, reduzindo: 1, reservando: 1, enviando: 1, conferindo: 1 };
  var ESPERA_FREIO_MS = 11000, ESPERAS_MAX = 3;      /* o freio geral do servidor é por minuto (90 por IP): 11 s dão uma folga curta; os por hora (reservar 40, conferir 60) não passam com esperar */
  var LINK_VALE_MS = 110 * 60 * 1000;                /* o link assinado vale 2 h; com 10 min de folga */
  var REFAZ_RESERVA = { 403: 1, 410: 1, 422: 1 };    /* o que obriga a reservar de novo */
  var mb = function (n) { return Math.round(n / (1024 * 1024) * 10) / 10; };

  /* null se cabe; senão a frase. Linha com erro não conta no limite */
  function problemaDaEscolha(a, papel, itens) {
    if (L.tipos.indexOf(a.type) < 0) return FRASES.tipo;
    var vivos = itens.filter(function (i) { return i.papel === papel && i.estado !== 'erro'; }).length;
    if (papel === 'logo' && vivos >= L.logo_max) return FRASES.logoJa;
    if (papel === 'foto' && vivos >= L.fotos_max) return FRASES.fotos;
    if (papel === 'logo' && a.size > L.logo_bytes) return FRASES.logo;   /* a logo vai como está */
    return null;
  }
  function problemaDoTamanho(papel, tamanho) {
    if (papel === 'logo') return tamanho > L.logo_bytes ? FRASES.logo : null;
    return tamanho > L.foto_bytes ? FRASES.foto : null;
  }
  function precisaReduzir(d) { return d.size > L.reduzir_acima_bytes || Math.max(d.largura, d.altura) > L.lado_max_px; }
  function escalaFinal(w, h) { return Math.min(1, L.lado_max_px / Math.max(w, h)); }

  /* a redução padrão (canvas). Devolve { blob, tipo }; qualquer falha devolve o original */
  async function reduzirNoAparelho(arq, papel) {
    var original = { blob: arq, tipo: arq.type };
    if (papel === 'logo' || typeof createImageBitmap !== 'function') return original;
    var bmp = null;
    try {
      bmp = await createImageBitmap(arq);
      if (!precisaReduzir({ size: arq.size, largura: bmp.width, altura: bmp.height })) { bmp.close(); return original; }
      var f = escalaFinal(bmp.width, bmp.height), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * f)); c.height = Math.max(1, Math.round(bmp.height * f));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); });
      return blob && blob.size < arq.size ? { blob: blob, tipo: 'image/jpeg' } : original;
    } catch (e) { if (bmp && bmp.close) bmp.close(); return original; }
  }
  /* M1 (revisão): o objeto já está no armazém (o PUT anterior gravou e a resposta se perdeu): o upsert desligado responde 409,
     ou 400 com "Duplicate" / "already exists" no corpo. Não é falha: a conferência decide se o objeto serve */
  function jaGravado(status, corpo) {
    return status === 409 || (status === 400 && /duplicate|already exists|"statusCode"s*:s*"?409/i.test(String(corpo || '')));
  }
  /* o PUT no link assinado (XHR: o fetch não mostra o progresso do envio). O armazém não precisa de chave nem do nome do arquivo */
  function enviarPut(url, corpo, tipo, aoProgresso) {
    return new Promise(function (ok, falha) {
      var x = new XMLHttpRequest();
      x.open('PUT', url);
      x.setRequestHeader('content-type', tipo);
      x.upload.onprogress = function (ev) { if (ev.lengthComputable) aoProgresso(ev.loaded / ev.total); };
      x.onload = function () { if (x.status >= 200 && x.status < 300) ok(); else { var er = new Error(FRASES.envio); er.status = x.status; er.corpo = String(x.responseText || '').slice(0, 300); falha(er); } };
      x.onerror = x.ontimeout = function () { falha(new Error(FRASES.rede)); };
      x.timeout = 120000;
      x.send(corpo);
    });
  }

  function criar(o) {
    var API = o.API, reduzir = o.reduzir || reduzirNoAparelho, subir = o.enviarPut || enviarPut, aoMudar = o.aoMudar || function () {};
    var esperar = o.esperar || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }, agora = o.agora || Date.now;
    var itens = [], rodando = false, seq = 0;
    var mudou = function () { aoMudar(itens.slice()); };
    /* o freio do servidor (429/503): espera e repete o MESMO passo, sem a pessoa tocar em nada (M6). Recusa de regra que manda
       "tentar depois" (balde cheio: dados.tentarDepois) não repete: esperar 33 s não muda nada (B9 da revisão) */
    async function comEspera(passo) {
      for (var t = 0; ; t++) {
        try { return await passo(); }
        catch (e) {
          var repetivel = e && (e.status === 429 || e.status === 503) && !(e.dados && e.dados.tentarDepois);
          if (!repetivel || t >= ESPERAS_MAX) throw e;
          await esperar(ESPERA_FREIO_MS);
        }
      }
    }

    function adicionar(arquivos, papel) {
      for (var k = 0; k < arquivos.length; k++) {
        var a = arquivos[k], p = problemaDaEscolha(a, papel, itens);
        itens.push({ id: 'l' + (++seq), papel: papel, nome: a.name, tamanho: a.size, arquivo: a, estado: p ? 'erro' : 'fila', progresso: 0, erro: p, arquivoId: null,
          blob: null, tipoFinal: null, url: null, subiu: false, reservadoEm: 0, refazer: false });
      }
      mudou(); andar();
    }
    /* cada passo só roda se ainda não foi feito: é o que deixa o "Tentar de novo" retomar de onde parou (M6) */
    async function processar(it) {
      try {
        if (!it.blob) {
          it.estado = 'reduzindo'; mudou();
          var r = await reduzir(it.arquivo, it.papel);
          var ruim = problemaDoTamanho(it.papel, r.blob.size);
          if (ruim) throw new Error(ruim);
          it.blob = r.blob; it.tipoFinal = r.tipo;
        }
        if (!it.arquivoId || !it.url) {
          it.estado = 'reservando'; mudou();
          var res = await comEspera(function () { return API.materialReservar(it.papel, it.tipoFinal, it.blob.size); });   /* só papel, tipo e tamanho: nunca o nome */
          it.arquivoId = res.arquivo_id; it.url = res.url_envio; it.reservadoEm = agora(); it.subiu = false; it.refazer = false;
        }
        if (!it.subiu) {
          it.estado = 'enviando'; mudou();
          try { await comEspera(function () { return subir(it.url, it.blob, it.tipoFinal, function (f) { it.progresso = f; mudou(); }); }); }
          catch (ep) { if (!jaGravado(ep && ep.status, ep && ep.corpo)) throw ep; }   /* M1: já gravado antes */
          it.subiu = true;
        }
        it.estado = 'conferindo'; mudou();
        await comEspera(function () { return API.materialConferir(it.arquivoId); });
        it.estado = 'enviado'; it.progresso = 1; it.blob = null;   /* solta a memória */
      } catch (e) {
        it.estado = 'erro'; it.erro = (e && e.message) || FRASES.envio;
        if (e && REFAZ_RESERVA[e.status]) it.refazer = true;
        if (e && e.status === 409 && it.subiu) it.subiu = false;   /* "o arquivo não chegou": repete só o envio, no mesmo link */
      }
      mudou();
    }
    async function andar() {
      if (rodando) return;
      rodando = true;
      try { for (var it = itens.filter(function (i) { return i.estado === 'fila'; })[0]; it; it = itens.filter(function (i) { return i.estado === 'fila'; })[0]) await processar(it); }
      finally { rodando = false; }
    }
    function achar(id) { return itens.filter(function (i) { return i.id === id; })[0]; }
    function remover(id) {
      var it = achar(id);
      if (!it || EM_ANDAMENTO[it.estado]) return;
      itens = itens.filter(function (i) { return i !== it; });
      if (it.arquivoId) API.materialRemover(it.arquivoId).catch(function () { /* a reconciliação diária apaga o que sobrar */ });
      mudou();
    }
    function tentarDeNovo(id) {
      var it = achar(id);
      if (!it || it.estado !== 'erro' || !it.arquivo) return;
      var velha = it.arquivoId && (it.refazer || agora() - it.reservadoEm > LINK_VALE_MS);
      if (velha) {   /* a reserva antiga não serve mais: desfaz e reserva outra (a foto reduzida continua guardada) */
        API.materialRemover(it.arquivoId).catch(function () { /* a reconciliação diária apaga o que sobrar */ });
        it.arquivoId = null; it.url = null; it.subiu = false; it.refazer = false;
      }
      it.estado = 'fila'; it.erro = null; it.progresso = it.subiu ? 1 : 0;
      mudou(); andar();
    }
    /* o que o servidor já tem (outra aba, volta ao pedido): linhas "enviada" sem miniatura; reserva abandonada vira erro */
    function hidratar(arquivos) {
      (arquivos || []).forEach(function (a) {
        if (itens.some(function (i) { return i.arquivoId === a.id; })) return;
        /* B2 (revisão): a reserva que ESTE aparelho está fazendo agora ainda não tem arquivoId aqui: não a tome por abandonada */
        if (a.status === 'reservado' && itens.some(function (i) { return i.estado === 'reservando'; })) return;
        var ok = a.status === 'conferido';
        itens.push({ id: 's' + a.id, papel: a.papel, nome: a.papel === 'logo' ? 'Logo' : 'Foto', tamanho: a.tamanho, arquivo: null, estado: ok ? 'enviado' : 'erro', progresso: ok ? 1 : 0, erro: ok ? null : FRASES.abandonado, arquivoId: a.id });
      });
      mudou();
    }
    function resumo() {
      return {
        logo: itens.some(function (i) { return i.papel === 'logo' && i.estado !== 'erro'; }),
        fotos: itens.filter(function (i) { return i.papel === 'foto' && i.estado === 'enviado'; }).length,
        emAndamento: itens.some(function (i) { return EM_ANDAMENTO[i.estado]; }),
        /* B1 (revisão): linha em erro que ainda tem reserva no servidor: o Enviar recusa até ela ser tirada ou refeita */
        presos: itens.filter(function (i) { return i.estado === 'erro' && i.arquivoId; }).length
      };
    }
    return { adicionar: adicionar, remover: remover, tentarDeNovo: tentarDeNovo, hidratar: hidratar, itens: function () { return itens.slice(); }, resumo: resumo };
  }

  window.BZEnvio = { criar: criar, problemaDaEscolha: problemaDaEscolha, problemaDoTamanho: problemaDoTamanho, precisaReduzir: precisaReduzir, escalaFinal: escalaFinal, jaGravado: jaGravado, mb: mb, FRASES: FRASES };
})();
