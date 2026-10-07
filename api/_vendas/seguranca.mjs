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
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CARTAO = /\b(?:\d[ -]?){13,19}\b/g;
const CPF_CNPJ = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const TELEFONE = /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g;

export function redigir(texto) {
  return String(texto)
    .replace(EMAIL, '[e-mail]')
    .replace(CPF_CNPJ, '[documento]')
    .replace(CARTAO, '[número]')
    .replace(TELEFONE, '[telefone]');
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
