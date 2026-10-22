/* ==========================================================================
   O ESQUEMA DO MATERIAL (PR 3b-2; spec §3, §6, §7). UM arquivo só, para a tela e para o servidor: o navegador o
   carrega como script clássico (window.BZMaterialEsquema); o servidor o importa como módulo CommonJS. Sem DOM, sem
   node:, sem import. As regras de campo são as de CAMPOS_DADOS da captação (captacao/entrega/material.mjs; versão 1 do
   formato, captacao/docs/parte6/para-o-site.md §3); docs/testes/captacao-igual.test.mjs confere as duas lado a lado.
   Os limites de envio são escolha do agente (spec §7) e moram SÓ aqui.
   ========================================================================== */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZMaterialEsquema = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var MB = 1024 * 1024;
  var LIMITES = Object.freeze({
    tipos: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
    logo_max: 1, logo_bytes: 5 * MB, fotos_max: 20, foto_bytes: 10 * MB, reservas_max: 30, pedido_bytes: 150 * MB,
    balde_bytes: 800 * MB, balde_alarme: 0.7, reserva_horas: 24, guarda_importado_dias: 7, guarda_nunca_importado_dias: 30,
    corpo_bytes: 16384, link_envio_horas: 2, lado_max_px: 2560, reduzir_acima_bytes: 3 * MB
  });
  /* o texto da caixa de autorização: o servidor grava ESTE texto (o cliente só diz "marcada"); versionado */
  var AUTORIZACAO = Object.freeze({ versao: '2026-10-22', texto: 'Autorizo a Beyon Zero a usar este material (logo, fotos, contatos e textos) para fazer o meu site.' });
  var UFS = Object.freeze(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);
  var RESPOSTAS_FOTOS = Object.freeze(['sim', 'nao_tem', 'nao_sei']);
  var ALFABETO_ID = 'abcdefghjkmnpqrstuvwxyz23456789';   /* o da captação (clientes/esquema.mjs) */
  var ID_CLIENTE = new RegExp('^c-[' + ALFABETO_ID + ']{6}$');
  var WHATSAPP = /^\+55\d{10,11}$/;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var COR = /^#[0-9a-fA-F]{6}$/;
  var LINK = /^https:\/\/[^\s"'<>]+$/i;
  var IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;   /* (o new URL já devolve o IP em notação de pontos: "2130706433" vira 127.0.0.1) */
  var CPF_CNPJ = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

  var tem = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var texto = function (min, max) { return function (v) { return typeof v === 'string' && v.trim().length >= min && v.length <= max; }; };
  var lista = function (max, item) { return function (v) { return Array.isArray(v) && v.length >= 1 && v.length <= max && v.every(item); }; };
  var objeto = function (obrig, opc) {
    opc = opc || {};
    return function (v) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
      return Object.keys(v).every(function (k) { return tem(obrig, k) || tem(opc, k); })
        && Object.keys(obrig).every(function (k) { return tem(v, k) && obrig[k](v[k]); })
        && Object.keys(opc).every(function (k) { return !tem(v, k) || v[k] === undefined || opc[k](v[k]); });
    };
  };

  /* o motivo da recusa de um link de rede social, ou null (a problemaDoLink da captação; sem node:net) */
  function problemaDoLink(valor) {
    if (typeof valor !== 'string') return 'não é um endereço válido';
    var url;
    try { url = new URL(valor); } catch (e) { return 'não é um endereço válido'; }
    if (url.protocol !== 'https:') return 'só https';
    if (!LINK.test(valor)) return 'não é um endereço válido (espaço, aspas ou < >)';
    if (url.username || url.password) return 'com usuário ou senha no endereço';
    if (url.port) return 'porta ' + url.port + ': só a padrão do https (443)';
    var host = url.hostname.toLowerCase().replace(/\.+$/, '');
    if (host === 'localhost' || /\.localhost$/.test(host)) return 'endereço local (localhost)';
    if (host.charAt(0) === '[' || IPV4.test(host)) return 'IP no lugar do nome';
    if (host.indexOf('.') < 0) return 'nome sem ponto (não é endereço público)';
    return null;
  }
  var linkBom = function (v) { return problemaDoLink(v) === null; };

  /* os 11 campos que a tela salva (o pacote ainda leva fotos_com_pessoas, que sai da resposta à pergunta das fotos) */
  var CAMPOS = {
    whatsapp: function (v) { return typeof v === 'string' && WHATSAPP.test(v); },
    telefone: function (v) { return typeof v === 'string' && WHATSAPP.test(v); },
    servicos: lista(12, objeto({ nome: texto(2, 60) }, { descricao: texto(2, 140) })),
    horario: lista(7, objeto({ dias: texto(2, 40), horas: texto(2, 40) })),
    bairros: lista(20, texto(2, 40)),
    endereco: texto(5, 120),
    provas: lista(4, texto(2, 60)),
    depoimentos: lista(3, objeto({ texto: texto(5, 300), autor: texto(2, 60) })),
    cor: function (v) { return typeof v === 'string' && COR.test(v); },
    emails: lista(2, function (v) { return typeof v === 'string' && EMAIL.test(v); }),
    redes: lista(4, linkBom)
  };
  var CAMPOS_SALVOS = Object.freeze(Object.keys(CAMPOS));
  var CAMPOS_DO_PACOTE = CAMPOS_SALVOS.concat(['fotos_com_pessoas']);

  function validarCampo(campo, valor) {
    if (!tem(CAMPOS, campo) || !CAMPOS[campo](valor)) return false;
    return !CPF_CNPJ.test(JSON.stringify(valor));
  }

  /* o `dados` do formulario.json: as mesmas conferências da validarDadosMaterial da captação (lista de problemas) */
  function validarDados(d) {
    if (d === null || typeof d !== 'object' || Array.isArray(d)) return ['dados: esperava um objeto'];
    var problemas = [];
    Object.keys(d).forEach(function (campo) {
      if (CAMPOS_DO_PACOTE.indexOf(campo) < 0) problemas.push('dados: campo a mais: ' + String(campo).slice(0, 60));
      else if (campo === 'fotos_com_pessoas' ? d[campo] !== true : !CAMPOS[campo](d[campo])) problemas.push('dados: ' + campo + ' fora do formato');
    });
    if (CPF_CNPJ.test(JSON.stringify(d))) problemas.push('dados: CPF ou CNPJ não entra no site');
    return problemas;
  }

  /* classifica o nome de campo que a tela manda: { onde, chave } ou null */
  function classificar(campo) {
    if (typeof campo !== 'string') return null;
    if (tem(CAMPOS, campo)) return { onde: 'dados', chave: campo };
    if (campo === 'negocio.cidade' || campo === 'negocio.uf') return { onde: 'negocio', chave: campo.slice(8) };
    if (/^autorizacao\.(fotos_com_pessoas|depoimentos_autorizados|marcada)$/.test(campo)) return { onde: 'autorizacao', chave: campo.slice(12) };
    return null;
  }
  var um = function (onde, chave, valor) { var o = {}, p = {}; o[chave] = valor; p[onde] = o; return { ok: true, patch: p }; };

  /* o pedaço que o servidor grava para UM campo salvo: valor null limpa. O texto da autorização é sempre a constante */
  function prepararPatch(campo, valor, agoraIso) {
    var c = classificar(campo);
    if (!c) return { ok: false, erro: 'campo' };
    if (c.onde === 'autorizacao' && c.chave === 'marcada') {
      if (valor === true) return { ok: true, patch: { autorizacao: { marcada: true, texto: AUTORIZACAO.texto, versao: AUTORIZACAO.versao, marcada_em: agoraIso } } };
      if (valor === false || valor === null) return um('autorizacao', 'marcada', false);
      return { ok: false, erro: 'valor' };
    }
    if (valor === null) return um(c.onde, c.chave, null);
    if (c.onde === 'dados') return validarCampo(c.chave, valor) ? um('dados', c.chave, valor) : { ok: false, erro: 'valor' };
    if (c.onde === 'negocio') {
      var bom = c.chave === 'uf' ? UFS.indexOf(valor) >= 0 : texto(2, 80)(valor) && !CPF_CNPJ.test(valor);
      return bom ? um('negocio', c.chave, c.chave === 'uf' ? valor : String(valor).trim()) : { ok: false, erro: 'valor' };
    }
    if (c.chave === 'fotos_com_pessoas') return RESPOSTAS_FOTOS.indexOf(valor) >= 0 ? um('autorizacao', c.chave, valor) : { ok: false, erro: 'valor' };
    return typeof valor === 'boolean' ? um('autorizacao', c.chave, valor) : { ok: false, erro: 'valor' };
  }

  /* o que ainda impede o envio (a tela mostra "Falta: …"; o servidor recusa o mesmo) */
  function faltas(m) {
    var f = [], dados = (m && m.dados) || {}, aut = (m && m.autorizacao) || {};
    if (!dados.whatsapp) f.push({ bloco: 2, texto: 'o WhatsApp dos botões' });
    if (aut.marcada !== true) f.push({ bloco: 6, texto: 'marcar a autorização' });
    return f;
  }
  /* o telefone como o usuário digita ("(21) 99999-0001") → "+5521999990001"; null se não tem DDD e 8 ou 9 dígitos */
  function telefoneE164(t) {
    var d = String(t == null ? '' : t).replace(/\D/g, '');
    var completo = (d.length === 12 || d.length === 13) && d.slice(0, 2) === '55' ? d : d.length === 10 || d.length === 11 ? '55' + d : null;
    return completo ? '+' + completo : null;
  }
  function tipoDoMime(mime) { return mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : null; }

  return { LIMITES: LIMITES, AUTORIZACAO: AUTORIZACAO, UFS: UFS, RESPOSTAS_FOTOS: RESPOSTAS_FOTOS, ALFABETO_ID: ALFABETO_ID, ID_CLIENTE: ID_CLIENTE,
    CPF_CNPJ: CPF_CNPJ, CAMPOS_SALVOS: CAMPOS_SALVOS, CAMPOS_DO_PACOTE: Object.freeze(CAMPOS_DO_PACOTE), problemaDoLink: problemaDoLink,
    validarCampo: validarCampo, validarDados: validarDados, prepararPatch: prepararPatch, faltas: faltas, tipoDoMime: tipoDoMime, telefoneE164: telefoneE164 };
});
