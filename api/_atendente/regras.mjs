/* ==========================================================================
   REGRAS PURAS DO ATENDENTE DE IA NO SITE DO CLIENTE (sem banco, sem rede): a origem conferida contra os domínios do cliente,
   o texto do visitante, as perguntas que o código resolve sozinho (é robô? quero uma pessoa), a conferência da resposta da IA
   (preço só da tabela, nunca nega ser IA, nada do prompt vaza) e o link do WhatsApp do CLIENTE (wa.me, sem API).
   ========================================================================== */
import { semInvisiveis } from '../_vendas/seguranca.mjs';

export const TEXTO_MAX = 1000;
const LOCAIS = new Set(['localhost', '127.0.0.1']);

/* Origin → hostname, ou null. Só https (http só em localhost, para a página de teste); sem caminho, sem credencial; porta só no local.
   O hostname tem de ser IGUAL a um domínio cadastrado: nada de curinga, nada de subdomínio por sufixo ("a.com.evil.com"). */
export function origemPermitida(origem, dominios) {
  if (typeof origem !== 'string' || origem.length > 300 || !Array.isArray(dominios)) return null;
  let u;
  try { u = new URL(origem); } catch { return null; }
  if (u.origin !== origem) return null;
  const local = LOCAIS.has(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  if (u.port && !local) return null;
  return dominios.includes(u.hostname) ? u.hostname : null;
}

const CONTROLES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
/* o texto do visitante: string, sem controles nem invisíveis, de 1 a TEXTO_MAX caracteres (contados como caracteres, não unidades UTF-16) */
export function textoDoVisitante(v) {
  if (typeof v !== 'string') return null;
  const s = semInvisiveis(v.replace(CONTROLES, '')).trim();
  const n = [...s].length;
  return n >= 1 && n <= TEXTO_MAX ? s : null;
}

/* o que vai ao modelo como DADO: as pontas de tag viram aspas angulares, então nenhum texto fecha ou abre os delimitadores do prompt */
export const neutralizar = s => String(s).replace(/</g, '‹').replace(/>/g, '›');

const PERGUNTA_IA = [
  /\b(voc[eê]|vc|isso|esse chat|esse atendimento)\s+(é|e|eh|ser[áa]|seria)\s+(mesmo\s+|realmente\s+)?(um[a]?\s+)?(rob[ôo]|bot|ia|i\.a\.|intelig[êe]ncia artificial|humano|humana|pessoa|gente|m[áa]quina)/i,
  /\b(estou|to|tô)\s+falando\s+com\s+(um[a]?\s+)?(pessoa|humano|humana|rob[ôo]|bot|ia|m[áa]quina|gente)/i,
  /\b(é|e)\s+(um[a]?\s+)?(rob[ôo]|bot|ia|intelig[êe]ncia artificial)\s*\?/i
];
export const perguntaSeEhIA = t => PERGUNTA_IA.some(r => r.test(t));

const PEDE_PESSOA = [
  /\b(quero|preciso|posso|gostaria|queria|pode(ria)?|d[áa]|vou querer|prefiro)\b.{0,30}\b(falar|conversar|passar|chamar|ligar)\b.{0,25}\b(atendente|pessoa|humano|humana|algu[ée]m|equipe|time|dono|dona|gerente|respons[áa]vel|vendedor|vendedora)/i,
  /\b(atendente|atendimento)\s+(humano|humana|de verdade)\b/i,
  /\b(me\s+)?(passa|transfere|encaminha)\b.{0,20}\b(atendente|pessoa|humano|equipe|dono)/i
];
export const pedePessoa = t => PEDE_PESSOA.some(r => r.test(t));

/* ---------- a conferência da resposta ---------- */

const PALAVRAS = 'um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milh[aã]o|milh[oõ]es';
const POR_EXTENSO = new RegExp('\\b(?:' + PALAVRAS + ')(?:\\s+(?:e\\s+)?(?:' + PALAVRAS + '))*\\s+(?:de\\s+)?reais\\b', 'i');
const DINHEIRO = /(?:R\$\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:reais|real)\b)/gi;
const PARTE_MIL = /^\d{1,3}(\.\d{3})+$/;

/* "1.234,56" → 123456; "180" → 18000; "180,5" → 18050; "1.200" → 120000; "180.50" → 18050. null se não for número */
export function centavosDe(txt) {
  let s = String(txt).replace(/[.,]+$/, '');
  if (!s) return null;
  if (PARTE_MIL.test(s)) return Number(s.replace(/\./g, '')) * 100;
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:[,.](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}

const valoresEm = texto => {
  const out = [];
  for (const m of String(texto).matchAll(DINHEIRO)) out.push(centavosDe(m[1] ?? m[2]));
  return out;
};

/* os valores que a resposta PODE citar: a tabela de preços do cliente e o que o próprio dono escreveu na base */
export function valoresPermitidos(base) {
  const ok = new Set();
  for (const b of base) {
    if (b.tipo === 'preco' && Number.isInteger(b.preco_centavos)) ok.add(b.preco_centavos);
    for (const v of valoresEm([b.pergunta, b.resposta, b.item].filter(Boolean).join(' '))) if (v !== null) ok.add(v);
  }
  return ok;
}

/* { ok } ou { ok:false, motivo }: valor em dinheiro fora da tabela, ou valor que não dá para conferir (por extenso, número estranho) */
export function conferirPrecos(resposta, base) {
  if (POR_EXTENSO.test(resposta)) return { ok: false, motivo: 'valor por extenso' };
  const permitidos = valoresPermitidos(base);
  for (const v of valoresEm(resposta)) if (v === null || !permitidos.has(v)) return { ok: false, motivo: 'valor fora da tabela' };
  return { ok: true };
}

const NEGA_IA = [
  /\b(eu\s+)?sou\s+(uma?\s+)?(pessoa|humano|humana|ser humano|gente de verdade|atendente humano|atendente de verdade)\b/i,
  /\bn[ãa]o\s+sou\s+(um[a]?\s+)?(rob[ôo]|bot|ia|intelig[êe]ncia artificial|assistente virtual|m[áa]quina)\b/i,
  /\bmeu\s+nome\s+[ée]\b/i,
  /\bme\s+chamo\b/i
];
export const negaSerIA = t => NEGA_IA.some(r => r.test(t));

/* o prompt vazou? alguma linha longa do sistema aparece na resposta */
export function vazouPrompt(resposta, sistema) {
  const r = String(resposta);
  return String(sistema).split('\n').map(l => l.trim()).some(l => l.length >= 30 && r.includes(l));
}

/* ---------- passagem para pessoa ---------- */

const corte = (s, n) => { const a = [...String(s).replace(/\s+/g, ' ').trim()]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };

/* https://wa.me/<número do CLIENTE>?text=<resumo curto>; sem número cadastrado, sem link */
export function linkWhatsapp(cliente, visitanteTextos) {
  if (!cliente.whatsapp || !/^\d{10,15}$/.test(cliente.whatsapp)) return null;
  const ultimas = visitanteTextos.slice(-2).map(t => corte(t, 120)).filter(Boolean);
  const resumo = 'Olá! Vim pelo site e conversei com o assistente virtual.' + (ultimas.length ? ' Minha dúvida: ' + ultimas.join(' / ') : '');
  return 'https://wa.me/' + cliente.whatsapp + '?text=' + encodeURIComponent(corte(resumo, 300));
}
