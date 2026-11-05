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
import F from '../../js/orcamento-planta-forma.js';
import { paraBusca, textoProibido, pedeItemProibido, semPromessaDeRecado, semPromessaDeDesconto } from './zero.mjs';
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
const E_OU = /\be\/ou\b/gi;   /* ("e/ou" é português honesto; a barra sozinha não é) */
const PASSADAS = 3;

/* invisíveis fora, NFKC, quebra vira espaço, controles e "<" ">" fora, espaço simples, aparado. Repete até estabilizar (tirar um invisível pode
   juntar duas marcas que o NFKC compõe; o NFKC pode trazer um "<" de volta). Nunca lança: texto que não é texto vira ''. */
export function normalizarTexto(bruto) {
  if (typeof bruto !== 'string') return '';
  let t = bruto;
  try {
    for (let i = 0; i < PASSADAS; i++) {
      const antes = t;
      t = t.replace(IGNORAVEIS, '').normalize('NFKC').replace(E_OU, 'e ou').replace(QUEBRAS, ' ').replace(CONTROLES, '').replace(ANGULOS, '').replace(/\s+/g, ' ').trim();
      if (t === antes) break;
    }
  } catch { return ''; }
  return t;
}

/* ---------- a lista dura ---------- */
/* LISTA BRANCA de letras: só o alfabeto do português (A-Z e as acentuadas do Latin-1). Fora dela (ɡ, ı, ᴘ, ø, æ, ð, þ, ß, letras de outros alfabetos...) é "alfabeto":
   a barra "não latina" deixava passar os blocos latinos estendidos, que parecem letras comuns. Por isso não há dobrador de confusáveis: ele nunca teria o que dobrar. */
const LETRA_FORA_DA_LISTA = /(?![A-Za-z\xC0-\xC5\xC7-\xCF\xD1-\xD6\xD9-\xDD\xE0-\xE5\xE7-\xEF\xF1-\xF6\xF9-\xFD\xFF])\p{L}/u;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Me}/u;
const MARCAS_DEMAIS = /\p{M}{3,}/u;                 /* (contada na forma decomposta: mais de 2 marcas por letra) */
const MARCA_SOLTA = /(?:^|[^\p{L}\p{M}])\p{M}/u;    /* (marca sem letra antes: sequência só de marcas ou marca no começo) */
const DIGITO = /\p{Nd}/u;
const SIMBOLO_DE_VALOR = /[%\p{Sc}‰‱]/u;
const EMAIL = /@|\barroba\b|[(\[]\s*at\s*[)\]]/i;
const URL = /\bhttps?\b|\bwww\b|[a-z0-9-]\.[a-z]{2,}|\bponto (?:com|br|net|org)\b/i;
const MARKDOWN = /[*_#`~|\[\]{}\\=^]|^\s*[-+•]\s|\s[-+•]\s/u;
const CARACTERE_DE_FORA = /[^\p{L}\p{M}\s.,:;!?'’"“”()\-–—]/u;

/* sobre o texto em "busca" (paraBusca: minúscula, sem acento, letras soltas juntas, pontuação vira espaço) e sobre a versão "colada" (abaixo) */
const RAIZES = {
  preco: /\b(?:precos?|valor|valores|custos?|custa\w*|custar|barat\w+|gratis|gratuit\w+|descontos?|taxas?|mensalidades?|investiment\w+|parcelas?|parcelad\w+|promocao|promocoes|ofertas?|reais|de graca|por menos|pa(?:ga|gar|gue) menos|abatimentos?|abate\w*)\b/,
  numeral: /\b(?:dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|duzentas|trezentos|trezentas|quatrocentos|quatrocentas|quinhentos|quinhentas|seiscentos|seiscentas|setecentos|setecentas|oitocentos|oitocentas|novecentos|novecentas|mil|milhao|milhoes|bilhao|bilhoes)\b/,
  promessa: new RegExp([
    '\\b(?:enche|encher|enchem|lota|lotar|lotam|lotad\\w+|dobra|dobrar|dobram|dobro|triplo|triplica\\w*|quadruplo|quadruplica\\w*|multiplica\\w*|aumenta\\w*|cresc\\w+|dispara\\w*|lucr\\w+|faturamento|faturar|resultados?|sem esforcos?|primeiro lugar|primeira pagina|topo d[oa]|milhar|milhares|centenas?|dezenas?|duzia|duzias|metade|nunca mais)\\b',
    '\\bvend\\w+ sozinh\\w+',
    '\\benquanto (?:\\w+ ){0,4}(?:dorme|dormem|vende|vendem|descansa|trabalha|trabalham)\\b',
    '\\b(?:client\\w*|pedidos?|vendas?|contatos?|agenda|pacientes|alunos) (?:\\w+ ){0,3}sozinh\\w+|\\bsozinh\\w+ (?:\\w+ ){0,3}(?:client\\w*|pedidos?|vendas?|contatos?|agenda|pacientes|alunos)',
    '\\bmais (?:\\w+ )?(?:clientes|vendas|pedidos|agendamentos|contatos|consultas|pacientes|orcamentos|leads|visitas|lucros?|faturamento|movimento|seguidores|alunos|matriculas|reservas|encomendas)\\b'
  ].join('|')),
  prazo: new RegExp([
    '\\b(?:prazos?|imediat\\w+|instantane\\w+|minutos?|segundos|horas|dias|semanas?|meses|anos|mesmo dia|diariamente|semanalmente|mensalmente|em instantes|agora mesmo|hoje mesmo|ainda hoje|amanha|sem demora|numa tarde|quinzenas?|trimestres?|semestres?|a qualquer hora|de madrugada|24 ?h)\\b',
    '\\bem (?:\\w+ ){0,2}(?:minuto|segundo|hora)\\b',
    '\\b(?:em|por|de) (?:um|uma|outro|outra) (?:dia|hora|minuto|mes|ano|semana|tarde)\\b|\\b(?:num|numa) (?:dia|hora|minuto|mes|ano|semana|tarde)\\b',
    '\\b(?:todo|cada) dia\\b|\\bpor (?:mes|ano)\\b|\\bao (?:mes|ano)\\b|\\btodo ano\\b',
    '\\bde um dia (?:pro|para o) outro\\b',
    '\\bantes de (?:segunda|terca|quarta|quinta|sexta|sabado|domingo)\\b',
    '\\bde (?:segunda|terca|quarta|quinta|sexta) a (?:terca|quarta|quinta|sexta|sabado|domingo)\\b',
    '\\bna hora\\b(?! (?:d[aeo]s?|em que|que)\\b)'   /* ("na hora da marcação" é o momento; "chega na hora" é prazo) */
  ].join('|')),
  garantia: /\b(?:garant\w*|certezas?|sem risco|reembolso|dinheiro de volta|devolv\w+ (?:o )?dinheiro|satisfacao)\b/,
  suporte: /\b(?:suporte|manutencao|assistencia|plantao|sla)\b/,
  ordem: /\b(?:ignor\w+|desconsider\w+|prompts?|system|esqueca (?:tudo|as|o que)|instrucao|instrucoes (?:do sistema|internas?|anteriores|acima)|(?:novas|suas|essas|minhas) instruc\w+|regras? (?:internas?|do sistema|acima|anteriores))\b/,
  negar_ia: /\b(?:sou|nao sou (?:uma? )?(?:ia|robo|bot|maquina|inteligencia artificial)|atendente humano|pessoa de verdade|humano de verdade|humana de verdade|por gente|carne e osso|ninguem aqui e (?:robo|maquina|bot|ia)|eu (?:respondo|atendo|escrevo|falo))\b/
};
/* a evidência do radar é a fala da PESSOA, em primeira pessoa ("eu atendo", "sou eu"): a regra de negar ser IA, que olha o texto do Zero, não vale para ela */
const SEM_PRIMEIRA_PESSOA = Object.fromEntries(Object.entries(RAIZES).filter(([k]) => k !== 'negar_ia'));
const REGULADO = {
  depoimento: /\b(?:depoiment\w*|testemunh\w*|antes (?:e |\/ )?depois|avaliacoes (?:de|dos|das) (?:pacientes|clientes)|casos? de sucesso|historias? de (?:pacientes|clientes)|fotos? de (?:pacientes|clientes)|relatos?|transformac\w+)\b/,
  resultado_regulado: /\b(?:cura\w*|curar|milagr\w*|tratamento garantido|emagrec\w*)\b/
};

/* ---------- idioma ---------- */
/* palavras funcionais do português (sem acento, como a busca as vê). Texto de 8 palavras ou mais precisa ter uma fração mínima delas (títulos de 5 palavras honestos chegam a 0,17, por isso o corte é de 8); abaixo disso, ou com uma
   palavra funcional de inglês ou espanhol que o português não tem, é "idioma". Na dúvida, recusa. O nome do negócio não conta como palavra do texto */
const FUNCIONAIS_PT = new Set(('de da do das dos em na no nas nos ao aos a o as os um uma uns umas e ou mas se que quem como quando onde para por pela pelo pelas pelos com sem sobre entre ate ja so nao ' +
  'mais menos muito pouco ele ela eles elas seu sua seus suas lhe te me voce cada todo toda todos todas tudo nada esse essa esses essas este esta isso isto outro outra vai vao sao foi tem ter ha pode ' +
  'depois antes assim aqui ali la tambem sempre ainda so tal mesmo mesma onde porque pois qual quais ate ou').split(' '));
const ESTRANHAS = new Set('the and with you your our from this will are is to of in on at by it free ready every first month el los las del una con muy al es y precio'.split(' '));
export const FRACAO_PORTUGUES_MIN = 0.2;
const PALAVRAS_MIN_IDIOMA = 8;
const palavrasDe = busca => busca.split(' ').filter(Boolean);
/* a fração de palavras funcionais do português, ou null se o texto tem menos de 5 palavras (fora as do nome do negócio) */
export function fracaoPortugues(texto, nome = new Set()) {
  const palavras = palavrasDe(paraBusca(texto)).filter(p => !nome.has(p));
  if (palavras.length < PALAVRAS_MIN_IDIOMA) return null;
  return palavras.filter(p => FUNCIONAIS_PT.has(p)).length / palavras.length;
}
function idiomaRuim(texto, nome) {
  const palavras = palavrasDe(paraBusca(texto)).filter(p => !nome.has(p));
  if (palavras.some(p => ESTRANHAS.has(p))) return true;
  const f = fracaoPortugues(texto, nome);
  return f !== null && f < FRACAO_PORTUGUES_MIN;
}

/* ---------- palavra cortada ou repetida ---------- */
/* a versão "colada": sinal entre letras sai ("pre-ço", "g.r.a.t.i.s", "D.E.Z"), letra repetida 3 ou mais vezes vira uma ("preeeço"); depois, a mesma busca */
function colada(texto) {
  return paraBusca(texto.replace(/(?<=\p{L})[-.'’·](?=\p{L})/gu, '').replace(/(\p{L})\1{2,}/giu, '$1'));
}

/* ---------- marcas ---------- */
/* as plataformas e os meios de pagamento de terceiros que o código do repositório já cita */
export const PLATAFORMAS = Object.freeze(['whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube', 'linkedin', 'telegram', 'shopify', 'nuvemshop', 'wix',
  'mercado pago', 'mercadopago', 'mercado livre', 'paypal', 'picpay', 'nubank', 'chatgpt', 'openai', 'anthropic', 'claude']);
/* apelidos e marcas comuns de consumo (lista defensiva, sem pesquisa de marca): o que o visitante e o modelo escrevem no dia a dia */
export const APELIDOS_E_MARCAS = Object.freeze(['insta', 'zap', 'zapzap', 'wpp', 'whats', 'tik tok', 'you tube', 'ifood', 'uber', 'itau', 'bradesco', 'santander', 'rolex', 'nike', 'adidas', 'shopee',
  'canva', 'gmail', 'hotmail', 'outlook', 'twitter', 'kwai', 'pinterest', 'snapchat', 'netflix', 'spotify', 'amazon', 'apple', 'samsung', 'magalu', 'shein', 'olx', 'hotmart', 'stripe', 'skype', 'slack']);
const MARCAS_RE = new RegExp('\\b(?:' + [...PLATAFORMAS, ...APELIDOS_E_MARCAS].map(p => p.replace(/ /g, ' ?')).join('|') + ')\\b');
const MEIO_DE_PAGAMENTO = new Set(['pix']);   /* o Pix é o meio de pagamento da Beyon Zero: passa em maiúscula e em caixa alta */

/* palavras comuns que podem abrir uma 2ª frase (ou mais) com inicial maiúscula: funcionais, verbos da ferramenta e os substantivos e verbos que uma planta usa.
   Capitalizada fora dessa lista, no começo de uma frase que não é a primeira, é nome próprio */
const COMUNS_NO_INICIO = new Set([...FUNCIONAIS_PT, ...F.VERBOS.map(v => paraBusca(v)),
  ...('pessoa pessoas cliente clientes site pagina conversa negocio empresa equipe loja servico servicos produto produtos pedido pedidos horario agenda aviso lembrete confirmacao resposta duvida duvidas caminho passo ' +
  'etapa fim comeco tela mensagem contato proposta orcamento catalogo cardapio curso cursos aluno turma aula fabrica comprador comercial medida material amostra acabamento sacola peca tamanho frete pagamento entrega ' +
  'retirada atendimento visita fotos foto vitrine guia busca mapa indicacao chega chegou cai vai volta fica ficou faz sai entra passa segue leva traz abre ve marca marcou pede pediu paga pagou quer precisa sabe ' +
  'fala conta ajuda resolve muda atende quem quando se cada todo toda assim depois antes entao logo a gente nenhum alguem alguns algumas varios varias outros outras primeiro primeira ultimo ultima proximo proxima ' +
  'um uma o a os as ao na no em').split(' ')]);

/* o nome do negócio que a pessoa deu: só as palavras (letras), até 6, e só se o nome todo for curto E sem marca conhecida; senão ninguém tem passe */
function palavrasDoNome(nome) {
  const n = normalizarTexto(nome);
  if (!n || n.length > NOME_MAX) return new Set();
  const palavras = n.match(/\p{L}[\p{L}'’-]*/gu) || [];
  if (!palavras.length || palavras.length > NOME_PALAVRAS_MAX) return new Set();
  if (MARCAS_RE.test(paraBusca(n)) || MARCAS_RE.test(colada(n))) return new Set();
  return new Set(palavras.map(p => paraBusca(p)));
}

/* palavra com inicial maiúscula fora do começo do texto, ou sigla em caixa alta: nome próprio. Só o nome dado e o Pix passam. No começo de uma 2ª frase (ou
   mais) a capitalizada só passa se for palavra comum (COMUNS_NO_INICIO); a 1ª palavra do texto é a maiúscula de praxe, e a lista de marcas a vigia */
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
    if (antes.trim() === '') continue;                                  /* a 1ª palavra do texto */
    if (/[.!?]\s*$/.test(antes)) { if (COMUNS_NO_INICIO.has(busca)) continue; return true; }   /* começo de uma 2ª frase */
    return true;                                                         /* no meio da frase */
  }
  return false;
}

function achar(mapa, ...buscas) {
  for (const busca of buscas) for (const [codigo, re] of Object.entries(mapa)) if (re.test(busca)) return codigo;
  return null;
}

/* texto -> { ok: true, texto } | { ok: false, motivo }. A ordem é a do motivo mais útil para quem corrige.
   travas: false roda só a lista dura (o `estado` revalida a cada leitura; as dez travas rodam ao GRAVAR, no turno do modelo: elas custam centenas de ms a frio) */
export function textoDoPlanoPermitido(bruto, { nomeDoNegocio = '', regulado = false, travas = true, primeiraPessoa = false } = {}) {
  try {
    if (typeof bruto !== 'string') return { ok: false, motivo: 'texto' };
    if (bruto.length > TEXTO_MAX_ENTRADA) return { ok: false, motivo: 'longo' };
    /* "<" e ">" não são limpos em silêncio: um texto com tag é recusado (a forma já o faz; aqui vale para quem chamar sozinho) */
    if (/[<>]/.test(bruto.normalize('NFKC'))) return { ok: false, motivo: 'markdown' };
    const t = normalizarTexto(bruto);
    if (!t) return { ok: false, motivo: 'vazio' };
    if (LETRA_FORA_DA_LISTA.test(t)) return { ok: false, motivo: 'alfabeto' };
    if (EMOJI.test(bruto) || EMOJI.test(t)) return { ok: false, motivo: 'emoji' };   /* (o bruto também: o NFKC leva o símbolo de marca registrada a "TM") */
    if (MARCAS_DEMAIS.test(t.normalize('NFD')) || MARCA_SOLTA.test(t)) return { ok: false, motivo: 'caractere' };
    if (DIGITO.test(t)) return { ok: false, motivo: 'digito' };
    if (EMAIL.test(t)) return { ok: false, motivo: 'email' };
    if (URL.test(t)) return { ok: false, motivo: 'url' };
    if (SIMBOLO_DE_VALOR.test(t)) return { ok: false, motivo: 'simbolo' };
    if (MARKDOWN.test(t)) return { ok: false, motivo: 'markdown' };
    if (CARACTERE_DE_FORA.test(t)) return { ok: false, motivo: 'caractere' };
    const nome = palavrasDoNome(nomeDoNegocio);
    if (MARCAS_RE.test(paraBusca(t)) || MARCAS_RE.test(colada(t))) return { ok: false, motivo: 'marca' };   /* (antes do idioma: "you tube" é marca, não inglês) */
    if (idiomaRuim(t, nome)) return { ok: false, motivo: 'idioma' };
    const busca = paraBusca(t), cola = colada(t);
    const lexico = achar(primeiraPessoa ? SEM_PRIMEIRA_PESSOA : RAIZES, busca, cola) || (regulado ? achar(REGULADO, busca, cola) : null);
    if (lexico) return { ok: false, motivo: lexico };
    if (regulado && pedeItemProibido(t)) return { ok: false, motivo: 'depoimento' };
    if (MARCAS_RE.test(busca) || MARCAS_RE.test(cola) || temNomeProprio(t, nome)) return { ok: false, motivo: 'marca' };
    if (regulado && textoProibido(t)) return { ok: false, motivo: 'depoimento' };
    if (travas) for (const trava of TRAVAS) if (trava.rodar(t) !== t) return { ok: false, motivo: 'trava_' + trava.nome };
    return { ok: true, texto: t };
  } catch {
    return { ok: false, motivo: 'interno' };   /* falha fechado */
  }
}
