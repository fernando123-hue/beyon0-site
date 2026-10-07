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
/* Todos os padrões têm tamanho limitado e começam num ponto fixo: a mensagem tem até 2.000 caracteres e redigir roda
   em até 14 mensagens por turno — nada de "\s*" encadeado (backtracking explosivo, ReDoS). Teste de tempo em
   docs/testes/agente.test.mjs. A redação é um cuidado a mais, não garantia (escrever de propósito para driblar passa). */
const EMAIL = /(?<![\w.%+-])[A-Za-z0-9._%+-]{1,64}(?:@|\s{1,3}@\s{1,3})[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,4}\.[A-Za-z]{2,24}\b/g;
/* e-mail por extenso: "ana arroba gmail ponto com", "ana (arroba) clinica.com.br", "ana@gmail ponto com". O ponto
   literal vem colado no domínio: "o preço da arroba subiu. Preciso…" não é e-mail */
const EMAIL_EXTENSO = /(?<![\w.+-])[\w.+-]{1,64}(?:[\s([]{0,4}\barroba\b[\s)\]]{0,4}|@)[\w-]{1,63}(?:\.[a-z]{2,24}|\s{1,3}ponto\s{1,3}[a-z]{2,24}){1,5}\b/gi;
/* em inglês, só com "at" E "dot" ("joao at empresa dot com", "joao [at] empresa [dot] com"): "look at this.site" fica */
const EMAIL_EXTENSO_EN = /(?<![\w.+-])[\w.+-]{1,64}[\s([]{1,3}at[\s)\]]{1,3}[\w-]{1,63}(?:[\s([]{1,3}dot[\s)\]]{1,3}[a-z]{2,24}){1,5}\b/gi;
/* CPF/CNPJ com a pontuação oficial; sem pontuação, quem pega é NUMERO_LONGO (que distingue celular de CPF) */
const CPF_CNPJ = /(?<!\d)(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})(?!\d)/g;
const TELEFONE = /(?<!\d)(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}(?!\d)/g;
/* o que é número do NEGÓCIO e não pode sumir (o agente precisa do prazo, do faturamento, da meta): data, valor com
   milhar e faixa crescente ("50000-100000"). Ficam guardados enquanto os padrões de número longo rodam */
const DATA = /(?<!\d)(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})(?!\d)/g;
const MILHAR = /(?<![\d.])\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?(?![\d.])/g;
const FAIXA = /(?<![\d.])(\d{4,9})\s?-\s?(\d{4,9})(?![\d.])/g;
/* qualquer sequência de 10 a 19 dígitos com espaço, ponto, hífen ou barra entre eles: telefone com DDD (10–11),
   CPF (11), CNPJ (14) ou cartão (13–19), escritos de qualquer jeito ("11 9 8765 4321", "123 456 789 09") */
const NUMERO_LONGO = /(?<![\d+])\+?(?:\d[\s.\-/]?){9,18}\d(?!\d)/g;
/* celular sem DDD: 9 + 8 dígitos ("98765-4321", "9 9999-9999", "99999.9999"); fixo sem DDD fica de fora (confunde
   com faixa de preço "2000-3000") */
const CELULAR_SEM_DDD = /(?<!\d)9\s?\d{4}[-.\s]?\d{4}(?!\d)/g;
/* invisíveis e a área de uso privado (onde ficam os marcadores de guarda) saem; NFKC traz dígito e @ de largura
   total para o normal */
const INVISIVEIS = /[­​-‏⁠﻿-]/g;
const rotuloDoNumero = trecho => {
  const d = trecho.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '[telefone]';   /* +55 DDD número */
  if (d.length === 14) return '[documento]';
  if (d.length === 11) return d[2] === '9' ? '[telefone]' : '[documento]';   /* DDD + 9 = celular; senão, CPF */
  if (d.length === 10) return '[telefone]';
  return '[número]';
};

export function redigir(texto) {
  const guardados = [];
  const guardar = trecho => { guardados.push(trecho); return String.fromCharCode(0xe100 + guardados.length - 1); };
  return String(texto).normalize('NFKC').replace(INVISIVEIS, '')
    .replace(EMAIL, '[e-mail]')
    .replace(EMAIL_EXTENSO, '[e-mail]')
    .replace(EMAIL_EXTENSO_EN, '[e-mail]')
    .replace(CPF_CNPJ, '[documento]')
    .replace(TELEFONE, '[telefone]')
    .replace(DATA, guardar)
    .replace(MILHAR, guardar)
    .replace(FAIXA, (trecho, a, b) => (Number(b) > Number(a) ? guardar(trecho) : trecho))
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
  /(outro cliente|outros clientes|projeto de outr[oa]|dados de outr)/i
];
export function pareceInjecao(texto) { return INJECAO.some(r => r.test(String(texto))); }

/* texto livre do visitante: tamanho e caracteres de controle */
export const MSG_MAX = 2000;
export function limparMensagem(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return s && s.length <= MSG_MAX ? s : null;
}
