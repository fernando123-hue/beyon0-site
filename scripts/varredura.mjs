/* ==========================================================================
   A VARREDURA do que sai da fila manual (spec docs/specs/2026-10-11-orcamento-sem-ia.md §4). Uma direção é só texto
   de site (nome, títulos, itens): nela não cabe endereço de site, caminho de arquivo, chave, e-mail nem telefone. Se
   um aparecer, é vazamento (o modelo copiou algo da máquina) ou injeção (o briefing veio de um desconhecido), e nada
   sai. O contato do cliente entra no site depois, pelo dono, nunca por aqui.
   Cada tipo é uma lista de detectores; um detector devolve o trecho achado ou null. A varredura olha uma cópia
   normalizada do texto (largura total vira normal, caracteres invisíveis somem), e o e-mail sai do texto antes dos
   outros tipos, para o domínio dele não virar um segundo achado.
   ========================================================================== */
const INVISIVEIS = /[​-‏‪-‮⁠-⁤﻿\u007F-\u009F]/g;
const normalizar = texto => texto.replace(INVISIVEIS, '').normalize('NFKC').replace(INVISIVEIS, '');

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const EMAIL_GLOBAL = new RegExp(EMAIL.source, 'gi');
const TLDS = 'com\\.br|com|net|org|io|app|dev|site|br|xyz|co|info|store|shop|online|ai|tv|me|ly|link|biz|top|club';
/* parece ano - ano (2020-2024), não telefone fixo sem DDD */
const DOIS_ANOS = /^(19|20)\d\d-(19|20)\d\d$/;

const por = re => texto => (texto.match(re) || [null])[0];

/* a corrida longa só é chave se misturar dígitos e letras ("Pediatria/Ortopedia/Cardiologia/..." é texto) */
function corridaDeChave(texto) {
  for (const [corrida] of texto.matchAll(/[A-Za-z0-9+/=_-]{32,}/g)) {
    if ((corrida.match(/\d/g) || []).length >= 3 && (corrida.match(/[a-z]/gi) || []).length >= 4) return corrida;
  }
  return null;
}

/* fixo sem DDD (2133-4455), menos quando as duas metades parecem anos */
function fixoSemDdd(texto) {
  for (const [achado] of texto.matchAll(/\b[2-5]\d{3}-\d{4}\b/g)) if (!DOIS_ANOS.test(achado)) return achado;
  return null;
}

/* [tipo, detectores, mascarar]: o trecho de chave e telefone sai só com os 4 primeiros caracteres */
const PADROES = [
  ['endereço de site', [
    por(/\b[a-z][a-z0-9+.-]{1,9}:\/\//i), /* qualquer esquema (https://, ftp://, file://, hxxp://) */
    por(/(?:^|[\s"'(])\/\/[a-z0-9]/i), por(/\bwww\./i), por(/\bwa\.me\b|\bbit\.ly\b|\blocalhost\b/i),
    por(/\b\d{1,3}(?:\.\d{1,3}){3}\b/), por(/[a-z][[(]\.[\])][a-z]/i),
    por(new RegExp('\\b[a-z0-9][a-z0-9-]*\\.(?:' + TLDS + ')\\b', 'i'))
  ], false],
  ['caminho de arquivo', [
    por(/\b[a-z]:[\\/]/i), por(/(?:^|[\s"'(])~[\\/]/), por(/(?:^|[\s"'(])\/(?:home|users|etc|tmp|var|root)\b/i),
    por(/\\\\[a-z0-9]/i), por(/\.\.[\\/]/)
  ], false],
  ['chave', [
    por(/\bsk-[a-z0-9_-]{8,}/i), por(/\b[sprk]k_(?:live|test)_\w{8,}/i), por(/\beyJ[a-z0-9_-]{10,}/i), por(/\bghp_\w{20,}/),
    por(/\bxox[abpr]-[\w-]{10,}/), por(/\bAKIA[0-9A-Z]{16}\b/), por(/\bAIza[\w-]{20,}/), por(/\bBearer\s+[\w.-]{16,}/i),
    por(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i), por(/\b[0-9a-f]{32,}\b/i), corridaDeChave
  ], true],
  ['telefone', [
    /* celular e fixo com DDD válido, com ou sem pontuação, com ou sem +55 */
    por(/(?<!\d)(?:\+?55[\s.-]?)?\(?[1-9][1-9]\)?[\s.-]?9\d{4}[\s.-]?\d{4}(?!\d)/),
    por(/(?<!\d)(?:\+?55[\s.-]?)?\(?[1-9][1-9]\)?[\s.-]?[2-5]\d{3}[\s.-]?\d{4}(?!\d)/),
    por(/\b9\d{4}[\s.-]\d{4}\b/), fixoSemDdd, por(/\b0[58]00[\s.-]?\d{3}[\s.-]?\d{4}\b/), por(/(?<!\d)\+?55\s?\d{10,11}\b/),
    por(/\b\d{2}\s9\s\d{4}\s\d{4}\b/), por(/\+\d{1,3}[\s.-]\d{2,4}[\s.-]\d{3,4}[\s.-]\d{4}/)
  ], true]
];

/* toda string de um valor, com o caminho dela (secoes[2].itens[0].texto) */
export function textosDe(valor, caminho = '') {
  if (typeof valor === 'string') return [{ caminho, texto: valor }];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => textosDe(v, caminho + '[' + i + ']'));
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([k, v]) => textosDe(v, caminho ? caminho + '.' + k : k));
  return [];
}

const trechoDe = (achado, mascarar) => (mascarar ? achado.slice(0, 4) + '…' : achado.slice(0, 40));

/* os achados de uma direção já higienizada: vazio = pode sair (um achado por tipo em cada texto) */
export function varrer(direcao) {
  const achados = [];
  for (const { caminho, texto } of textosDe(direcao)) {
    const limpo = normalizar(texto);
    const email = limpo.match(EMAIL);
    if (email) achados.push({ caminho, tipo: 'e-mail', trecho: trechoDe(email[0], false) });
    const resto = limpo.replace(EMAIL_GLOBAL, ' ');
    for (const [tipo, detectores, mascarar] of PADROES) {
      for (const detectar of detectores) {
        const achado = detectar(resto);
        if (achado) { achados.push({ caminho, tipo, trecho: trechoDe(achado, mascarar) }); break; }
      }
    }
  }
  return achados;
}
