/* ==========================================================================
   A CAMADA DE TEXTO DA PLANTA VIVA (spec §2.3 e §2.4, passos 2 e 4). A FORMA do plano mora em js/orcamento-planta-forma.js (a mesma da tela);
   aqui moram só as travas de TEXTO, que são do servidor: o que NUNCA pode estar em título, frase, rótulo ou fecho de uma planta.

   Duas camadas, nesta ordem, sobre o texto JÁ NORMALIZADO (invisíveis fora, NFKC, "<" e ">" fora, controles fora, espaço simples):
     1) a LISTA DURA própria (esta): alfabeto, emoji, dígito, símbolo de dinheiro, URL e e-mail, markdown, caractere fora do português, preço, prazo,
        numeral por extenso de dois em diante, promessa de resultado, garantia, suporte, ordem ao sistema, negar ser IA, marca e nome de terceiro,
        e, em nicho regulado, depoimento e "antes e depois";
     2) as DEZ TRAVAS que o Zero já tem (resultado, garantia, suporte, mensalidade do atendente, desconto, negar ser IA, recado, preço no texto,
        preço com marca, promessa de pagamento): qualquer uma que MUDE o texto recusa o plano inteiro (a frase fixa da trava é longa e quebraria
        o desenho). Medido em 05/11 contra os 53 textos do protótipo + 6 do ajuste: 0 falso positivo nas dez.
   As travas são a 1ª camada que já existia; elas deixam passar "Enche a agenda da clínica toda semana", "Entrega em dois dias úteis", "Vende
   sozinho e sem esforço", "Mais clientes todo mês", "Pagamento sem taxa" e "Faixa de preço pela tabela": por isso a lista própria é mais dura.
   Aqui um falso positivo só custa cair no plano padrão (o desenho não some); um falso negativo põe promessa na tela da pessoa. Na dúvida, recusa.

   Nunca lança: devolve { ok: true, texto } (o texto normalizado, que é o que se grava) ou { ok: false, motivo } com um código (sem o texto, cabe
   no banco). Só o nome do negócio que a PESSOA deu tem passe na regra da inicial maiúscula; ele não abre nenhuma outra porta.
   ========================================================================== */
import { paraBusca, textoProibido, semPromessaDeRecado, semPromessaDeDesconto } from './zero.mjs';
import { semPrecoNoTexto, semPrecoComMarca } from './seguranca.mjs';
import { semPromessaDePagamento } from './promessa.mjs';
import { semPromessaDeResultado, semGarantia } from './travas-resultado.mjs';
import { semPromessaDeSuporte, semMensalidadeDoAtendente } from './travas-promessa.mjs';
import { semNegarSerIA } from './travas-identidade.mjs';

/* os textos da planta cabem em 110 caracteres; o que passa muito disso nem entra na conta (o NFKC pode alongar um caractere em poucos) */
const TEXTO_MAX_ENTRADA = 400;
const NOME_MAX = 60, NOME_PALAVRAS_MAX = 6;

/* as dez travas existentes, sobre o texto normalizado; "rodar" devolve o texto que a trava deixaria sair (igual ao de entrada = passou) */
export const TRAVAS = Object.freeze([
  { nome: 'resultado', rodar: t => semPromessaDeResultado(t).texto },
  { nome: 'garantia', rodar: t => semGarantia(t).texto },
  { nome: 'suporte', rodar: t => semPromessaDeSuporte(t).texto },
  { nome: 'mensalidade', rodar: t => semMensalidadeDoAtendente(t).texto },
  { nome: 'desconto', rodar: t => semPromessaDeDesconto(t).texto },
  { nome: 'negarIA', rodar: t => semNegarSerIA(t).texto },
  { nome: 'recado', rodar: t => semPromessaDeRecado(t).texto },
  { nome: 'precoNoTexto', rodar: t => semPrecoNoTexto(t) },
  { nome: 'precoComMarca', rodar: t => semPrecoComMarca(t) },
  { nome: 'pagamento', rodar: t => semPromessaDePagamento(t) }
]);

/* ---------- a normalização ---------- */
const IGNORAVEIS = /[\p{Default_Ignorable_Code_Point}\u2800]/gu;   /* (o braille em branco não está na propriedade, mas é um vazio visual) */
const QUEBRAS = /[\t\n\v\f\r\p{Zl}\p{Zp}]/gu;
const CONTROLES = /\p{Cc}/gu;
const ANGULOS = /[<>]/g;
const PASSADAS = 3;

/* invisíveis fora, NFKC, quebra vira espaço, controles e "<" ">" fora, espaço simples, aparado. Repete até estabilizar (tirar um invisível pode
   juntar duas marcas que o NFKC compõe; o NFKC pode trazer um "<" de volta). Nunca lança: texto que não é texto vira ''. */
export function normalizarTexto(bruto) {
  if (typeof bruto !== 'string') return '';
  let t = bruto;
  try {
    for (let i = 0; i < PASSADAS; i++) {
      const antes = t;
      t = t.replace(IGNORAVEIS, '').normalize('NFKC').replace(QUEBRAS, ' ').replace(CONTROLES, '').replace(ANGULOS, '').replace(/\s+/g, ' ').trim();
      if (t === antes) break;
    }
  } catch { return ''; }
  return t;
}

/* ---------- a lista dura ---------- */
const NAO_LATINA = /(?!\p{Script=Latin})\p{L}/u;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const DIGITO = /\p{Nd}/u;
const SIMBOLO_DE_VALOR = /[%\p{Sc}‰‱]/u;
const EMAIL = /@|\barroba\b|[(\[]\s*at\s*[)\]]/i;
const URL = /\bhttps?\b|\bwww\b|[a-z0-9-]\.[a-z]{2,}|\bponto (?:com|br|net|org)\b/i;
const MARKDOWN = /[*_#`~|\[\]{}\\=^]|^\s*[-+•]\s|\s[-+•]\s/u;
const CARACTERE_DE_FORA = /[^\p{L}\p{M}\s.,:;!?'’"“”()\-–—]/u;

/* sobre o texto em "busca" (paraBusca: minúscula, sem acento, letras soltas juntas, pontuação vira espaço) */
const RAIZES = {
  preco: /\b(?:precos?|valor|valores|custos?|custa\w*|custar|barat\w+|gratis|gratuit\w+|descontos?|taxas?|mensalidades?|investiment\w+|parcelas?|parcelad\w+|promocao|promocoes|ofertas?|reais|de graca)\b/,
  numeral: /\b(?:dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|duzentas|trezentos|trezentas|quatrocentos|quatrocentas|quinhentos|quinhentas|seiscentos|seiscentas|setecentos|setecentas|oitocentos|oitocentas|novecentos|novecentas|mil|milhao|milhoes|bilhao|bilhoes|zero)\b/,
  promessa: /\b(?:enche|encher|enchem|lota|lotar|lotam|lotad\w+|dobra|dobrar|dobram|triplica\w*|quadruplica\w*|multiplica\w*|aumenta\w*|dispara\w*|lucr\w+|faturamento|faturar|resultados?|vend\w+ sozinh\w+|sem esforco|sem esforcos|primeiro lugar|primeira pagina|topo d[oa])\b|\bmais (?:\w+ )?(?:clientes|vendas|pedidos|agendamentos|contatos|consultas|pacientes|orcamentos|leads|visitas|lucros?|faturamento|movimento|seguidores|alunos|matriculas|reservas|encomendas)\b/,
  prazo: /\b(?:prazos?|imediat\w+|instantane\w+|minutos?|segundos|horas|dias|semanas?|mes|meses|anos?|mesmo dia|diariamente|semanalmente|mensalmente|em instantes|agora mesmo|24 ?h)\b|\bem (?:\w+ ){0,2}(?:minuto|segundo|hora)\b/,
  garantia: /\b(?:garant\w*|certezas?|sem risco|reembolso|dinheiro de volta|devolv\w+ (?:o )?dinheiro|satisfacao)\b/,
  suporte: /\b(?:suporte|manutencao|assistencia|plantao|sla)\b/,
  ordem: /\b(?:ignor\w*|desconsider\w*|instruc\w*|prompts?|regras?|system|esqueca (?:tudo|as|o que))\b/,
  negar_ia: /\b(?:sou|nao sou (?:uma? )?(?:ia|robo|bot|maquina|inteligencia artificial)|atendente humano|pessoa de verdade)\b/
};
const REGULADO = {
  depoimento: /\b(?:depoiment\w*|testemunh\w*|antes (?:e |\/ )?depois|avaliacoes (?:de|dos|das) (?:pacientes|clientes))\b/,
  resultado_regulado: /\b(?:cura\w*|curar|milagr\w*|tratamento garantido|emagrec\w*)\b/
};

/* as plataformas e os meios de pagamento de terceiros que o código do repositório já cita (o repositório é público: nada além disso) */
export const PLATAFORMAS = Object.freeze(['whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube', 'linkedin', 'telegram', 'shopify', 'nuvemshop', 'wix',
  'mercado pago', 'mercadopago', 'mercado livre', 'paypal', 'picpay', 'nubank', 'chatgpt', 'openai', 'anthropic', 'claude']);
const PLATAFORMAS_RE = new RegExp('\\b(?:' + PLATAFORMAS.map(p => p.replace(/ /g, '\\s')).join('|') + ')\\b');
const MEIO_DE_PAGAMENTO = new Set(['pix']);   /* o Pix é o meio de pagamento da Beyon Zero: passa em maiúscula e em caixa alta */

/* o nome do negócio que a pessoa deu: só as palavras (letras), até 6, e só se o nome todo for curto; senão ninguém tem passe */
function palavrasDoNome(nome) {
  const n = normalizarTexto(nome);
  if (!n || n.length > NOME_MAX) return new Set();
  const palavras = n.match(/\p{L}[\p{L}'’-]*/gu) || [];
  if (!palavras.length || palavras.length > NOME_PALAVRAS_MAX) return new Set();
  return new Set(palavras.map(p => paraBusca(p)));
}

/* palavra com inicial maiúscula fora do começo de frase, ou sigla em caixa alta: nome próprio. Só o nome dado e o Pix passam */
function temNomeProprio(t, permitidas) {
  const re = /\p{L}[\p{L}'’-]*/gu;
  let m;
  while ((m = re.exec(t))) {
    const p = m[0], busca = paraBusca(p);
    if (MEIO_DE_PAGAMENTO.has(busca) || permitidas.has(busca)) continue;
    const ehSigla = p.length >= 2 && p === p.toUpperCase() && p !== p.toLowerCase();
    if (ehSigla) return true;
    const inicial = p.charAt(0);
    if (inicial === inicial.toLowerCase()) continue;
    const antes = t.slice(0, m.index);
    const comecoDeFrase = antes.trim() === '' || /[.!?]\s*$/.test(antes);
    if (!comecoDeFrase) return true;
  }
  return false;
}

function achar(mapa, busca) {
  for (const [codigo, re] of Object.entries(mapa)) if (re.test(busca)) return codigo;
  return null;
}

/* texto -> { ok: true, texto } | { ok: false, motivo }. A ordem é a do motivo mais útil para quem corrige. */
export function textoDoPlanoPermitido(bruto, { nomeDoNegocio = '', regulado = false } = {}) {
  try {
    if (typeof bruto !== 'string') return { ok: false, motivo: 'texto' };
    if (bruto.length > TEXTO_MAX_ENTRADA) return { ok: false, motivo: 'longo' };
    /* "<" e ">" não são limpos em silêncio: um texto com tag é recusado (a forma já o faz; aqui vale para quem chamar sozinho) */
    if (/[<>]/.test(bruto.normalize('NFKC'))) return { ok: false, motivo: 'markdown' };
    const t = normalizarTexto(bruto);
    if (!t) return { ok: false, motivo: 'vazio' };
    if (NAO_LATINA.test(t)) return { ok: false, motivo: 'alfabeto' };
    if (EMOJI.test(bruto) || EMOJI.test(t)) return { ok: false, motivo: 'emoji' };   /* (o bruto também: o NFKC leva "\u2122" a "TM") */
    if (DIGITO.test(t)) return { ok: false, motivo: 'digito' };
    if (EMAIL.test(t)) return { ok: false, motivo: 'email' };
    if (URL.test(t)) return { ok: false, motivo: 'url' };
    if (SIMBOLO_DE_VALOR.test(t)) return { ok: false, motivo: 'simbolo' };
    if (MARKDOWN.test(t)) return { ok: false, motivo: 'markdown' };
    if (CARACTERE_DE_FORA.test(t)) return { ok: false, motivo: 'caractere' };
    const busca = paraBusca(t);
    const lexico = achar(RAIZES, busca) || (regulado ? achar(REGULADO, busca) : null);
    if (lexico) return { ok: false, motivo: lexico };
    if (PLATAFORMAS_RE.test(busca) || temNomeProprio(t, palavrasDoNome(nomeDoNegocio))) return { ok: false, motivo: 'marca' };
    if (regulado && textoProibido(t)) return { ok: false, motivo: 'depoimento' };
    for (const trava of TRAVAS) if (trava.rodar(t) !== t) return { ok: false, motivo: 'trava_' + trava.nome };
    return { ok: true, texto: t };
  } catch {
    return { ok: false, motivo: 'interno' };   /* falha fechado */
  }
}
