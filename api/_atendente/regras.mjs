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

/* texto sem acento e em minúsculas: o \b do JavaScript só enxerga letras ASCII (revisão de segurança A3), então toda regra de texto roda aqui.
   Não muda o tamanho do texto (os índices valem para o original). */
export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PERGUNTA_IA = [
  /\b(voce|voces|vc|vcs|tu|isso|esse chat|esse atendimento|ai)\s+(e|eh|sao|seria|ser)\s+(mesmo\s+|realmente\s+|de verdade\s+)?(um[a]?\s+|uns\s+)?(robo|robos|bot|bots|chatbot|ia|i\.a\.|inteligencia artificial|humano|humana|humanos|pessoa|pessoas|gente|maquina|real|programa)\b/,
  /^\s*(e|eh|sao)\s+(um[a]?\s+)?(robo|robos|bot|chatbot|ia|humano|humana|pessoa|real|inteligencia artificial)\s*\??\s*$/,
  /\b(estou|to)\s+falando\s+com\s+(um[a]?\s+)?(pessoa|humano|humana|robo|bot|ia|maquina|gente|alguem)/,
  /\btem\s+alguem\s+(ai|ae|de verdade|real)\b/
];
export const perguntaSeEhIA = t => { const n = norm(t); return PERGUNTA_IA.some(r => r.test(n)); };

const ALVO_PESSOA = 'atendente|pessoa|humano|humana|alguem|equipe|time|dono|dona|gerente|responsavel|vendedor|vendedora|secretaria|secretario|recepcao|recepcionista|doutor|doutora|dr|dra|medico|medica|dentista|advogado|advogada|funcionario|funcionaria|gente';
const PEDE_PESSOA = [
  new RegExp('\\b(quero|preciso|posso|gostaria|queria|pode|poderia|da|vou querer|prefiro|tem como)\\b.{0,30}\\b(falar|conversar|passar|chamar|ligar)\\b.{0,25}\\b(' + ALVO_PESSOA + ')\\b'),
  /\b(atendente|atendimento)\s+(humano|humana|de verdade)\b/,
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

/* ---------- a conferência da resposta: LISTA DE PERMISSÃO (revisão de segurança A4) ---------- */

const NUM = /\d+(?:[.,]\d+)*/g;
/* "1.200,50" → 1200.5; "180.50" → 180.5; "1.200" → 1200; "100" → 100 */
export const canon = t => (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(',', '.')));
const numerosDe = texto => (String(texto).match(NUM) || []).map(canon);

/* termos que mudam o que o cliente promete: só passam se o PRÓPRIO dono os escreveu na base */
const RISCO = [/%|\bpor ?cento\b/, /\bgratis\b|\bgratuit[oa]s?\b|\bde graca\b|\bcortesia\b/, /\bdescont/, /\bmetade\b/, /\bpromoc/, /\bconto\b|\bpila\b|\bpilas\b/, /\bmil\b/, /\d\s*k\b/,
  /\bdolar|\bbrl\b|\brs\b|\bus\$|\$/, /\d\s*x\b|\bparcel/,
  /\b(dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|milhao|milhoes)\b/,
  /\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\s+(reais|real)\b/];

const textoDaBase = base => base.map(b => [b.pergunta, b.resposta, b.item].filter(Boolean).join(' ')).join('\n');
const palavrasDoItem = item => norm(item).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
const MONEY = /(?:r\$\s?(\d+(?:[.,]\d+)*)|(\d+(?:[.,]\d+)*)\s?(?:reais|real)\b)/g;

/* { ok } ou { ok:false, motivo }. Barra: termo de risco fora da base; número que não está na base daquele cliente; valor da tabela sem o
   nome do item antes dele na mesma frase, ou com o nome de OUTRO item. Em dúvida, barra (a resposta cai na fixa com passagem para pessoa). */
export function conferirResposta(resposta, base) {
  const original = norm(resposta);
  const semReal = original.replace(/r\$\s?(?=\d)/g, 'r ');   /* "R$ 180" é o formato normal; "R $ 90", "$90" e "US$" ainda caem no risco */
  const b = norm(textoDaBase(base));
  for (const re of RISCO) if (re.test(semReal) && !re.test(b)) return { ok: false, motivo: 'termo fora da base' };
  const permitidos = new Set([...numerosDe(textoDaBase(base)), ...base.filter(x => x.tipo === 'preco').map(x => x.preco_centavos / 100)]);
  for (const n of numerosDe(original)) if (!permitidos.has(n)) return { ok: false, motivo: 'número fora da base' };
  const tabela = base.filter(x => x.tipo === 'preco').map(x => ({ valor: x.preco_centavos / 100, palavras: palavrasDoItem(x.item) }));
  for (const m of original.matchAll(MONEY)) {
    const v = canon(m[1] ?? m[2]);
    const donos = tabela.filter(t => t.valor === v);
    if (!donos.length) continue;   /* o valor veio de um texto do dono, não da tabela */
    let melhor = null;   /* o nome de item mais perto ANTES do valor, na mesma frase */
    for (const t of tabela) {
      for (const w of t.palavras) {
        const pos = original.lastIndexOf(w, m.index);
        if (pos < 0 || /[.!?]\s/.test(original.slice(pos, m.index))) continue;
        if (!melhor || pos > melhor.pos) melhor = { pos, t };
      }
    }
    if (!melhor || !donos.includes(melhor.t)) return { ok: false, motivo: 'valor sem o item certo' };
  }
  return { ok: true };
}

const NEGA_IA = [
  /\b(eu\s+)?sou\s+(uma?\s+)?(pessoa|humano|humana|ser humano|gente|atendente|recepcionista|secretaria|secretario|de carne e osso|real|de verdade)\b/,
  /\bsou\s+(a|o)\s+(?!assistente|inteligencia|ia\b|atendente virtual|bot|robo)[a-z]{2,}/,
  /\bnao\s+sou\s+(um[a]?\s+)?(robo|bot|chatbot|ia|inteligencia|assistente virtual|maquina|programa)/,
  /\b(meu nome e|me chamo|pode me chamar de|aqui e (a|o)|quem fala e|falando e (a|o))\b/,
  /\bcarne e osso\b|\bi am (a )?human\b/
];
export const negaSerIA = t => { const n = norm(t); return NEGA_IA.some(r => r.test(n)); };

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

/* "1.234,56" → 123456; "180" → 18000; "180,5" → 18050; "1.200" → 120000; "180.50" → 18050. null se não for número (o painel converte o preço em reais) */
export function centavosDe(txt) {
  const s = String(txt).trim().replace(/[.,]+$/, '');
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}
