/* ==========================================================================
   SEGURANÇA DO AGENTE (OWASP Top 10 para LLM, 2025: LLM01 injeção, LLM02
   dado sensível, LLM05 saída mal tratada, LLM06 agência excessiva, LLM07
   vazamento do prompt, LLM10 consumo sem limite).
   A defesa principal é de ARQUITETURA, não de prompt: o modelo não tem
   ferramenta que mude preço, dê desconto, leia dado de outro cliente ou
   execute ação administrativa; o prompt de sistema é tratado como público.
   Este módulo é a camada de reforço:
   • redigir: e-mail, telefone, CPF/CNPJ e cartão saem do texto antes de ir
     para o modelo (o contato vem pelo formulário, não pela conversa);
   • preço no texto: o agente não escreve valores — o cartão da estimativa
     (calculado pelo motor) é que mostra; um "R$" que escapar é removido;
   • tentativa de injeção: detectada só para MEDIR (evento no funil); a
     recusa é do modelo e, sobretudo, da falta de ferramentas perigosas.
   ========================================================================== */
import { normalizar, DIGITO_LETRA } from './promessa.mjs';

/* Todos os padrões têm tamanho limitado e começam num ponto fixo: a mensagem tem até 2.000 caracteres e redigir roda
   em até 14 mensagens por turno — nada de "\s*" encadeado (backtracking explosivo, ReDoS). Teste de tempo em
   docs/testes/agente.test.mjs. A redação é um cuidado a mais, não garantia (escrever de propósito para driblar passa). */
const EMAIL = /(?<![\w.%+-])[A-Za-z0-9._%+-]{1,64}(?:@|\s{1,3}@\s{1,3})[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,4}\.[A-Za-z]{2,24}\b/g;
/* e-mail por extenso: "ana arroba gmail ponto com", "ana (arroba) clinica.com.br", "ana@gmail ponto com". O ponto
   literal vem colado no domínio e o que vem depois dele é minúsculo: "o preço da arroba subiu. Preciso…" e
   "…subiu.Preciso" não são e-mail */
const EMAIL_EXTENSO = /(?<![\w.+-])[\w.+-]{1,64}(?:[\s([]{0,4}\b[Aa][Rr][Rr][Oo][Bb][Aa]\b[\s)\]]{0,4}|@)[\w-]{1,63}(?:\.[a-z]{2,24}|\s{1,3}[Pp][Oo][Nn][Tt][Oo]\s{1,3}[a-zA-Z]{2,24}){1,5}\b/g;
/* em inglês, só com "at" E "dot" ("joao at empresa dot com", "joao [at] empresa [dot] com"): "look at this.site" fica */
const EMAIL_EXTENSO_EN = /(?<![\w.+-])[\w.+-]{1,64}[\s([]{1,3}at[\s)\]]{1,3}[\w-]{1,63}(?:[\s([]{1,3}dot[\s)\]]{1,3}[a-z]{2,24}){1,5}\b/gi;
/* CPF/CNPJ com a pontuação oficial; sem pontuação, quem pega é NUMERO_LONGO (que distingue celular de CPF) */
const CPF_CNPJ = /(?<!\d)(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})(?!\d)/g;
const TELEFONE = /(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s.-]?9?[\s.-]?\d{4}[-.\s]?\d{4}(?!\d)/g;
/* o que é número do NEGÓCIO e não pode sumir (o agente precisa do prazo, do faturamento, da meta): data, valor com
   milhar e faixa crescente ("50000-100000"). Ficam guardados enquanto os padrões de número longo rodam */
const DATA = /(?<!\d)(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})(?!\d)/g;
const MILHAR = /(?<![\d.])\d{1,3}(?:\.\d{3}){1,2}(?:,\d{1,2})?(?![\d.]|[\s/-]\d)/g;
const FAIXA = /(?<![\d.]|\d[\s.-])(\d{1,3}(?:\.\d{3}){1,2}|\d{4,9})\s?-\s?(\d{1,3}(?:\.\d{3}){1,2}|\d{4,9})(?![\d.]|[\s/-]\d)/g;
/* qualquer sequência de 10 a 19 dígitos com espaço, ponto, hífen ou barra entre eles: telefone com DDD (10–11),
   CPF (11), CNPJ (14) ou cartão (13–19), escritos de qualquer jeito ("11 9 8765 4321", "123 456 789 09") */
const NUMERO_LONGO = /(?<![\d+])\+?(?:\d[\s.\-/]?){9,18}\d(?!\d)/g;
/* celular sem DDD: 9 + 8 dígitos ("98765-4321", "9 9999-9999", "99999.9999"); fixo sem DDD fica de fora (confunde
   com faixa de preço "2000-3000") */
const CELULAR_SEM_DDD = /(?<!\d)9\s?\d{4}[-.\s]?\d{4}(?!\d)/g;
/* invisíveis, controles bidirecionais e a área de uso privado (onde ficam os marcadores de guarda) saem. Dígitos de
   outros alfabetos e o @ de largura total viram os comuns, um por um (o texto não cresce; "m²" fica como está) */
const INVISIVEIS = /[­​-‏‪-‮⁠-⁩﻿-]/g;
const ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0xff10];   /* árabe, persa, devanágari, bengali, largura total */
const DIGITO_OU_ARROBA = /[٠-٩۰-۹०-९০-৯０-９＠]/g;
const comum = c => {
  const n = c.charCodeAt(0);
  if (n === 0xff20) return '@';
  const zero = ZEROS.find(z => n >= z && n <= z + 9);
  return String(n - zero);
};
const rotuloDoNumero = trecho => {
  const d = trecho.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '[telefone]';   /* +55 DDD número */
  if (d.length === 14) return '[documento]';
  if (d.length === 11) return d[2] === '9' ? '[telefone]' : '[documento]';   /* DDD + 9 = celular; senão, CPF */
  if (d.length === 10) return '[telefone]';
  return '[número]';
};

/* dados do cartão além do número, que a pessoa pode colar perto do pagamento (revisões de segurança do PR 34, M2).
   O código de segurança sai sempre; a validade e "segurança 123", só quando a mensagem fala de cartão: "promoção com
   validade até 30/11" é briefing (revisão técnica do PR 34, rodada 2) */
const CARTAO_CODIGO = /\b(c\s?v\s?[vc]2?|csc|c[óo]d(?:igo|\.)?\s*(?:de\s+)?seguran[çc]a)(?:\b|(?=\d))\D{0,30}?\d{3,4}\b/gi;
const CONTEXTO_CARTAO = /cart[ãa]o|cvv|cvc|cr[ée]dito|d[ée]bito|visa|master|\belo\b|amex|titular/i;
const MESES = 'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
const CARTAO_VALIDADE = new RegExp('\\b(validade|vencimento|venc\\.?|val\\.?|vence(?:\\s+em)?|expira(?:\\s+em)?|v[áa]lid[oa]\\s+at[ée])(?=\\W)\\D{0,20}?(?:\\d{1,2}\\s?[/.-]\\s?\\d{2,4}|\\d{4}|(?:' + MESES + ')(?:\\s+de)?\\s+\\d{2,4})\\b', 'gi');
const CARTAO_SEGURANCA = /\b(seguran[çc]a)\b\D{0,10}\d{3,4}\b/gi;
function semDadosDoCartao(t) {
  const semCodigo = t.replace(CARTAO_CODIGO, (_, rotulo) => rotulo + ' [cartão]');
  if (!CONTEXTO_CARTAO.test(t)) return semCodigo;
  return semCodigo.replace(CARTAO_VALIDADE, (_, rotulo) => rotulo + ' [cartão]').replace(CARTAO_SEGURANCA, (_, rotulo) => rotulo + ' [cartão]');
}

export function redigir(texto) {
  const guardados = [];
  const guardar = trecho => { guardados.push(trecho); return String.fromCharCode(0xe100 + guardados.length - 1); };
  return semDadosDoCartao(String(texto).replace(INVISIVEIS, '').replace(DIGITO_OU_ARROBA, comum))
    .replace(EMAIL, '[e-mail]')
    .replace(EMAIL_EXTENSO, '[e-mail]')
    .replace(EMAIL_EXTENSO_EN, '[e-mail]')
    .replace(CPF_CNPJ, '[documento]')
    .replace(TELEFONE, '[telefone]')
    .replace(DATA, guardar)
    .replace(MILHAR, guardar)
    .replace(FAIXA, (trecho, a, b) => (Number(b.replace(/\./g, '')) > Number(a.replace(/\./g, '')) ? guardar(trecho) : trecho))
    .replace(NUMERO_LONGO, rotuloDoNumero)
    .replace(CELULAR_SEM_DDD, '[telefone]')
    .replace(/[-]/g, c => guardados[c.charCodeAt(0) - 0xe100] ?? '');
}

/* o agente não escreve valores em dinheiro (nem "uns 2 mil"): quem mostra o preço é o cartão da estimativa */
const DINHEIRO = /(R\$\s?\d[\d.,]*(?:\s?(?:mil|k))?|\d[\d.,]*\s?(?:reais|mil reais)|US\$\s?\d[\d.,]*)/gi;
/* (auditoria 2026-10-07) o valor por extenso também: "dois mil e quinhentos reais", "uns três mil reais" */
const PALAVRAS = 'um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milh[aã]o|milh[oõ]es';
const POR_EXTENSO = new RegExp('\\b(?:' + PALAVRAS + ')(?:\\s+(?:e\\s+)?(?:' + PALAVRAS + '))*\\s+(?:de\\s+)?reais\\b', 'gi');
export function semPrecoNoTexto(texto) {
  return String(texto).replace(DINHEIRO, 'o valor (no cartão da estimativa)').replace(POR_EXTENSO, 'o valor (no cartão da estimativa)');
}

const INJECAO = [
  /ignor(e|ar|a)\s+(as\s+|suas\s+|todas\s+as\s+)?(instru|regras|ordens)/i,
  /(mostre|revele|imprima|repita|diga)\s+(o\s+|seu\s+|suas\s+)?(prompt|instru[cç][õo]es|regras internas|system)/i,
  /(voc[eê] agora [ée]|finja que|aja como)\s/i,
  /(desconto|de gra[cç]a|zer[ao]\s+o\s+pre[cç]o|pre[cç]o\s+(de\s+)?r?\$?\s?1\b)/i,
  /(chave|api key|token|senha|secret|service.?role)/i,
  /(outro cliente|outros clientes|projeto de outr[oa]|dados de outr)/i,
  /* (revisão final do PR 2a, B5) as de sempre em inglês */
  /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+|my\s+)?(previous\s+|prior\s+|above\s+|earlier\s+|system\s+)?(instructions?|rules|prompts?|guidelines)\b/i,
  /\b(reveal|show|print|repeat|output)\s+(me\s+)?(your\s+|the\s+)?(system\s+prompt|prompt|instructions|hidden\s+rules)\b/i,
  /\b(you\s+are\s+now|pretend\s+(you\s+are|to\s+be)|act\s+as\s+(an?\s+|the\s+)?(admin|owner|manager|developer|system))\b/i,
  /\b(jailbreak|developer\s+mode|system\s+prompt)\b/i
];
/* o texto como quem escreve para driblar o deixaria: a mesma normalização da promessa (invisíveis, largura total, letras
   cirílicas e gregas parecidas, acentos), número no lugar de letra também no começo e no fim da palavra ("1gnore",
   "ign0r3") e letras soltas juntas ("i g n o r e"). As regras olham o original E o normalizado. (Duas passadas: na
   primeira, o "3" de "ign0r3" ainda não tem duas letras antes) */
const DIGITO_NA_PALAVRA = /(?<=[a-z])[0134](?=[a-z])|(?<![a-z0-9])[0134](?=[a-z]{2})|(?<=[a-z]{2})[0134](?![a-z0-9])/g;
const letra = d => DIGITO_LETRA[d];
function paraBusca(texto) {
  return normalizar(texto).replace(DIGITO_NA_PALAVRA, letra).replace(DIGITO_NA_PALAVRA, letra)
    .replace(/\b(?:[a-z] ){3,}[a-z]\b/g, s => s.replace(/ /g, ''));
}
export function pareceInjecao(texto) {
  const original = String(texto), normal = paraBusca(original);
  return INJECAO.some(r => r.test(original) || r.test(normal));
}

/* texto livre do visitante: tamanho e caracteres de controle */
export const MSG_MAX = 2000;
export function limparMensagem(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return s && s.length <= MSG_MAX ? s : null;
}

/* texto livre que vai a uma pessoa ou a uma fila: saem os caracteres de formato (Cf, inclusive as "tag characters" U+E0000 a U+E007F, que escondem texto a olho nu,
   e os controles de direção), o uso privado (Co, onde o redator guarda os marcadores de guarda) e o substituto solto (Cs, que o JSON deixa passar). O substituto solto sai
   ANTES do toWellFormed, que o trocaria por U+FFFD, um caractere visível. Uma só definição para o pedido livre (fluxo-ajustes.mjs) e a lista de ajustes da prévia (fluxo-previa.mjs) */
export const semInvisiveis = s => String(s).replace(/[\p{Cf}\p{Co}\p{Cs}]/gu, '').toWellFormed();
