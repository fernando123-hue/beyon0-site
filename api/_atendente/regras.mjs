/* ==========================================================================
   REGRAS PURAS DO ATENDENTE DE IA NO SITE DO CLIENTE (sem banco, sem rede): a origem conferida contra os domínios do cliente,
   o texto do visitante, as perguntas que o código resolve sozinho (é robô? quero uma pessoa), a conferência da resposta da IA
   (preço só da tabela, nunca nega ser IA, nada do prompt vaza) e o link do WhatsApp do CLIENTE (wa.me, sem API).
   ========================================================================== */
import { semInvisiveis, redigir } from '../_vendas/seguranca.mjs';

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

/* texto sem acento e em minúsculas: o \b do JavaScript só enxerga letras ASCII (revisão de segurança A3), então toda regra de texto roda aqui.
   Não muda o tamanho do texto (os índices valem para o original). */
export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PERGUNTA_IA = [
  /\b(voce|voces|vc|vcs|tu|esse chat|esse atendimento|ai)\s+(e|eh|sao|seria|ser)\s+(mesmo\s+|realmente\s+|de verdade\s+)?(um[a]?\s+|uns\s+)?(robo|robos|bot|bots|chatbot|ia|i\.a\.|inteligencia artificial|humano|humana|humanos|pessoa|pessoas|gente|maquina|real|programa)\b/,
  /\bisso\s+(e|eh|seria)\s+(mesmo\s+)?(um[a]?\s+)?(robo|bot|chatbot|ia|i\.a\.|inteligencia artificial|maquina)\b/,
  /^\s*(e|eh|sao)\s+(um[a]?\s+)?(robo|robos|bot|chatbot|ia|humano|humana|pessoa|real|inteligencia artificial)\s*\??\s*$/,
  /\b(estou|to)\s+falando\s+com\s+(um[a]?\s+)?(pessoa|humano|humana|robo|bot|ia|maquina|gente|alguem)/,
  /\btem\s+alguem\s+(ai|ae|de verdade|real)\b/
];
export const perguntaSeEhIA = t => { const n = norm(t); return PERGUNTA_IA.some(r => r.test(n)); };

const ALVO_PESSOA = 'atendente|pessoa|humano|humana|alguem|equipe|time|dono|dona|gerente|responsavel|vendedor|vendedora|secretaria|secretario|recepcao|recepcionista|doutor|doutora|dr|dra|medico|medica|dentista|advogado|advogada|funcionario|funcionaria|gente';
const PEDE_PESSOA = [
  new RegExp('\\b(quero|preciso|posso|gostaria|queria|pode|poderia|da|vou querer|prefiro|tem como)\\b.{0,30}\\b(falar|conversar|passar|chamar|ligar)\\b.{0,25}\\b(' + ALVO_PESSOA + ')\\b'),
  /\b(atendente|atendimento)\s+(humano|humana|de verdade)\b/,
  /\b(quero|queria|preciso)\s+(de\s+)?(um|uma)\s+(humano|humana|pessoa|atendente)\b/,
  /\balguem\s+(para|pra)\s+me\s+(atender|ajudar)\b/,
  new RegExp('\\b(me\\s+)?(passa|transfere|encaminha)\\b.{0,20}\\b(atendente|pessoa|humano|equipe|dono|secretaria|recepcao)')
];
export const pedePessoa = t => { const n = norm(t); return PEDE_PESSOA.some(r => r.test(n)); };

/* só o que dá ORDEM ao modelo (ignorar regras, revelar o prompt, mudar de papel, ler dado de outro cliente). Pergunta de venda
   ("desconto à vista", "de graça", "senha do portal", "secretária") NÃO entra: vai ao modelo e a resposta é conferida depois */
const INSTRUCAO = [
  /ignor(e|ar|a)\s+(as\s+|suas\s+|todas\s+as\s+)?(instruc|regras|ordens)/,
  /(mostre|revele|imprima|repita|diga|exiba)\s+(o\s+|seu\s+|suas\s+|as\s+)?(prompt|instrucoes|regras internas|system)/,
  /voce agora e\b|a partir de agora voce|finja (que )?(voce|ser)\b|aja como (se voce|um|o|a)\s+(admin|administrador|dono|gerente|desenvolvedor|sistema)/,
  /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+|my\s+)?(previous\s+|prior\s+|above\s+|earlier\s+|system\s+)?(instructions?|rules|prompts?|guidelines)\b/,
  /\b(reveal|show|print|repeat|output)\s+(me\s+)?(your\s+|the\s+)?(system\s+prompt|prompt|instructions|hidden\s+rules)\b/,
  /\b(you are now|pretend (you are|to be)|act as (an?\s+|the\s+)?(admin|owner|manager|developer|system))\b/,
  /jailbreak|developer mode|system prompt|prompt de sistema/,
  /(mostre|me de|liste|revele|veja|acesse|me passe).{0,30}(conversas?|dados|mensagens?|base)\s+(de|do|da|dos)\s+outr[oa]s?\s+(cliente|empresa|negocio)/
];
export const pareceInstrucaoAoModelo = t => { const n = norm(t); return INSTRUCAO.some(r => r.test(n)); };

/* ---------- preço por MARCA (re-revisão R2 e T1) ----------
   Conferir preço em texto livre não tem fim, então o desenho é outro: a IA NUNCA escreve valor. Para citar preço ela escreve [[preco:ID]]
   e o CÓDIGO troca pela tabela do cliente ("Limpeza: R$ 180,00"). O que sobrar de valor monetário escrito pela IA é rejeitado; o que não é
   preço (horário, endereço, telefone) só passa quando está literalmente na base e a frase não tem palavra de preço. Em dúvida, rejeita:
   a resposta cai na fixa com passagem para pessoa. */

const NUM = /\d+(?:[.,]\d+)*/g;
export const canon = t => (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(',', '.')));
const numerosDe = texto => (String(texto).replace(/:00\b/g, '').match(NUM) || []).map(canon);

/* id curto de cada item da tabela, na ordem em que a tabela vem: p1, p2... (o prompt mostra o id e o NOME do item, nunca o valor) */
export function idsDePrecos(base) {
  const ids = new Map();
  let n = 0;
  for (const b of base) if (b.tipo === 'preco') ids.set('p' + (++n), { item: b.item, centavos: b.preco_centavos });
  return ids;
}
export const formatarPreco = ({ item, centavos }) => item + ': R$ ' + (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* palavras que prometem ou mudam o que o cliente cobra: valem para a IA só na frase que o próprio dono escreveu */
const RISCO = [/%|\bpor ?cento\b/, /\bgratis\b|\bgratuit|\bde graca\b|\bsem custo\b|\bsem cobranca\b|\bbrinde|\bisento|\bisenc|\bcortesia\b|\bcupom\b|\bcupon/, /\bdescont/, /\bmetade\b|\bterco\b|\bmeio preco\b/,
  /\bpromoc|\bpromo\b|\bofert/, /\bcontos\b|\bpaus\b|\bpratas\b|\bpilas\b|\d\s*(conto|pau|prata|pila)\b/, /\bmil\b|\bmilhao|\bmilhoes/, /\d\s*k\b/, /\$|\bdolar|\bbrl\b|\brs\b|\beuro/,
  /\bparcel/, /\b(um|uma)\s+(real|reais)\b/];
const PRECO_PALAVRA = /\b(custa|custam|custo|custos|valor|valores|preco|precos|sai por|saem por|cobra|cobramos|cobrar|cobranca|por apenas|apenas|investimento|mensalidade|a partir de|fica em|fica por|total|reais|real|pagar|taxa|tarifa)\b/;
const NUMERO_PALAVRA = /\b(zero|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/;
const ROMANO = /\b[IVXLCDM]{2,}\b/;

const achatar = s => norm(s).replace(/[^a-z0-9%$]+/g, ' ').trim();

/* { ok:true, texto } com as marcas trocadas, ou { ok:false, motivo } */
export function processarResposta(resposta, base) {
  const bruto = String(resposta).normalize('NFKC');
  for (const ch of bruto) if (/\p{Nd}/u.test(ch) && !/[0-9]/.test(ch)) return { ok: false, motivo: 'dígito de outro alfabeto' };
  const ids = idsDePrecos(base);
  const partes = [];
  let fim = 0;
  for (const m of bruto.matchAll(/\[\[preco:([a-z0-9]{1,8})\]\]/g)) {
    const item = ids.get(m[1]);
    if (!item) return { ok: false, motivo: 'marca de preço desconhecida' };
    partes.push({ t: bruto.slice(fim, m.index) }, { preco: formatarPreco(item) });
    fim = m.index + m[0].length;
  }
  partes.push({ t: bruto.slice(fim) });
  const analise = partes.map(p => (p.t !== undefined ? p.t : ' § ')).join('');
  if (/\[\[|\]\]|\[preco/i.test(analise)) return { ok: false, motivo: 'marca quebrada' };

  const donos = achatar(base.map(b => [b.resposta, b.pergunta].filter(Boolean).join(' ')).join(' . '));
  const donoTexto = base.map(b => [b.pergunta, b.resposta, b.item].filter(Boolean).join(' ')).join('\n');
  const tabela = new Set(base.filter(b => b.tipo === 'preco').map(b => b.preco_centavos / 100));
  const permitidos = new Set(numerosDe(donoTexto).filter(n => !tabela.has(n)));
  for (const frase of analise.split(/(?<=[.!?])\s+|\n+/).map(f => f.trim()).filter(Boolean)) {
    const a = achatar(frase);
    if (!a || a === '§') continue;
    if (a.length >= 8 && donos.includes(a)) continue;   /* frase que o próprio dono escreveu, repetida literalmente */
    const n = norm(frase);
    if (RISCO.some(r => r.test(n))) return { ok: false, motivo: 'palavra de risco fora de frase do dono' };
    const temPreco = PRECO_PALAVRA.test(n);
    if (temPreco && (/\d/.test(n) || NUMERO_PALAVRA.test(n) || ROMANO.test(frase))) return { ok: false, motivo: 'valor escrito pela IA' };
    for (const num of numerosDe(frase)) if (!permitidos.has(num)) return { ok: false, motivo: 'número que não está na base' };
  }
  return { ok: true, texto: partes.map(p => (p.t !== undefined ? p.t : p.preco)).join('') };
}

const NEGA_IA = [
  /(?<!nao\s)\bsou\s+(?!(o\s+|um\s+|uma\s+)?(assistente|inteligencia artificial|ia\b|bot\b|robo|chatbot|atendente virtual|programa de computador|capaz|incapaz))/,
  /\bnao\s+sou\s+(um[a]?\s+|nenhum[a]?\s+)?(robo|bot|chatbot|ia\b|inteligencia|assistente virtual|maquina|programa)/,
  /\b(meu nome e|me chamo|pode me chamar de|aqui e|quem fala e|falando e)\s+(?!(o\s+|um\s+)?(assistente|atendente virtual|ia\b))(a\s+|o\s+)?[a-z]{2,}/,
  /\bvoce\s+esta\s+falando\s+com\s+(um[a]?\s+)?(pessoa|humano|gente)/,
  /\bsomos\s+(humanos|pessoas|gente|reais)/,
  /\bnao\s+(e|eh)\s+(um[a]?\s+)?(robo|bot|chatbot|ia\b|inteligencia artificial)/,
  /\bnao\s+tem\s+(robo|bot|ia)\b/,
  /\bn\s+sou\b/,
  /\bcarne e osso\b|\bi'?m\s+(a\s+)?(real|human)|\bi am (a )?(real|human)/
];
export const negaSerIA = t => { const n = norm(t); return NEGA_IA.some(r => r.test(n)); };

/* o interruptor: FECHADO por padrão para qualquer valor estranho; só vazio ou "ligado" (sem diferenciar maiúscula) liga */
export function interruptorLigado(v) {
  return String(v ?? '').trim().toLowerCase() === 'ligado';
}

/* o texto do visitante, sem dado pessoal, ANTES da IA, do banco e do link: redigir() do projeto mais o que ele deixa passar (dois espaços,
   e-mail disfarçado, CEP, RG, telefone sem DDD). Saúde não se detecta por regex: a defesa é o aviso do balão. */
export function redigirVisitante(texto) {
  const s = String(texto).normalize('NFKC').replace(/[ \t]{2,}/g, ' ')
    .replace(/[\w.+-]+\s*(?:@|\(at\)|\[at\])\s*[\w-]+(?:\s*(?:\.|\(dot\)|\[dot\])\s*[\w-]+)+/gi, '[e-mail]');
  return redigir(s)
    .replace(/\b\d{5}-\d{3}\b/g, '[cep]')
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}-[\dxX]\b/g, '[documento]')
    .replace(/\b\d{4,5}-\d{4}\b/g, '[telefone]')
    .trim();
}

/* o prompt vazou? alguma linha longa do sistema aparece na resposta */
export function vazouPrompt(resposta, sistema) {
  const r = String(resposta);
  return String(sistema).split('\n').map(l => l.trim()).some(l => l.length >= 30 && r.includes(l));
}

/* ---------- passagem para pessoa ---------- */


/* https://wa.me/<número do CLIENTE>?text=<resumo FIXO>; sem número cadastrado, sem link. O resumo não leva as falas do visitante (re-revisão R6):
   o link fica no histórico do navegador e passa pela Meta, e a conversa completa já está no painel do cliente */
export function linkWhatsapp(cliente) {
  if (!cliente.whatsapp || !/^\d{10,15}$/.test(cliente.whatsapp)) return null;
  return 'https://wa.me/' + cliente.whatsapp + '?text=' + encodeURIComponent('Olá! Vim pelo site e conversei com o assistente virtual. Pode me ajudar?');
}

/* "1.234,56" → 123456; "180" → 18000; "180,5" → 18050; "1.200" → 120000; "180.50" → 18050. null se não for número (o painel converte o preço em reais) */
export function centavosDe(txt) {
  const s = String(txt).trim().replace(/[.,]+$/, '');
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}
