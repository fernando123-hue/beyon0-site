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
const NOME_MAX = 80, NOME_PALAVRAS_MAX = 8;

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
/* marca combinante FORA de U+0300 a U+036F: o `normalizar()` do Zero só tira essas, e em `paraBusca` as outras (2.149 de 2.290) viram espaço e partem a palavra
   ("d҃ois", "garan҃tia"). O português usa letra composta, não marca solta: recusa. Escrito por código numérico (o arquivo não leva caractere invisível) */
const MARCA_FORA_DO_BLOCO = new RegExp('(?![' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + '])\\p{M}', 'u');
/* três ou mais palavras de UMA letra seguidas ("p r e c o", "d e z", "a d o i s"): o `paraBusca` as junta, mas engole o "a/o/e" vizinho; recusa antes */
const LETRAS_SOLTAS = /(?:^|\s)\p{L}(?:\s\p{L}){2,}(?=\s|$|[.,;:!?])/u;
const DIGITO = /\p{Nd}/u;
const SIMBOLO_DE_VALOR = /[%\p{Sc}‰‱]/u;
const EMAIL = /@|\barroba\b|[(\[]\s*at\s*[)\]]/i;
const URL = /\bhttps?\b|\bwww\b|[a-z0-9-]\.[a-z]{2,}|\bponto (?:com|br|net|org)\b/i;
const MARKDOWN = /[*_#`~|\[\]{}\\=^]|^\s*[-+•]\s|\s[-+•]\s/u;
const CARACTERE_DE_FORA = /[^\p{L}\p{M}\s.,:;!?'’"“”()\-–—]/u;

/* sobre o texto em "busca" (paraBusca: minúscula, sem acento, letras soltas juntas, pontuação vira espaço) e sobre a versão "colada" (abaixo) */
const RAIZES = {
  preco: /\b(?:precos?|valor|valores|custos?|custa\w*|custar|barat\w+|gratis|gratuit\w+|descontos?|taxas?|mensalidades?|investiment\w+|parcelas?|parcelad\w+|promocao|promocoes|ofertas?|reais|de graca|por menos|pa(?:ga|gar|gue) menos|abatimentos?|abate\w*|economiz\w+|bolso|cobranc\w+|cobrar|cobrando|sem cobr\w+|pa(?:gue|ga|gar) (?:\w+ ){0,3}(?:so|nada|depois|sem)|(?:so|nada|depois|sem) (?:\w+ ){0,2}pa(?:gue|ga|gar))\b/,
  numeral: /\b(?:dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|duzentas|trezentos|trezentas|quatrocentos|quatrocentas|quinhentos|quinhentas|seiscentos|seiscentas|setecentos|setecentas|oitocentos|oitocentas|novecentos|novecentas|mil|milhao|milhoes|bilhao|bilhoes)\b/,
  promessa: new RegExp([
    '\\b(?:enche|encher|enchem|lota|lotar|lotam|lotad\\w+|dobra|dobrar|dobram|dobro|triplo|triplica\\w*|quadruplo|quadruplica\\w*|multiplica\\w*|aumenta\\w*|cresc\\w+|dispara\\w*|lucr\\w+|faturamento|faturar|resultados?(?! d[oae]s? (?:exames?|orcamentos?|pedidos?|consultas?|testes?|formularios?|buscas?)\\b)|dobre|dobrem|venda mais|vendem mais|sem esforcos?|primeiro lugar|primeira pagina|topo d[oa]|milhar|milhares|centenas?|dezenas?|duzia|duzias|metade|nunca mais)\\b',
    '\\bvend\\w+ sozinh\\w+',
    '\\benquanto (?:\\w+ ){0,4}(?:dorme|dormem|vende|vendem|descansa|trabalha|trabalham)\\b',
    '\\b(?:client\\w*|pedidos?|vendas?|contatos?|agenda|pacientes|alunos) (?:\\w+ ){0,3}sozinh\\w+|\\bsozinh\\w+ (?:\\w+ ){0,3}(?:client\\w*|pedidos?|vendas?|contatos?|agenda|pacientes|alunos)',
    '\\bmais (?:\\w+ )?(?:clientes|vendas|pedidos|agendamentos|contatos|consultas|pacientes|orcamentos|leads|visitas|lucros?|faturamento|movimento|seguidores|alunos|matriculas|reservas|encomendas)\\b'
  ].join('|')),
  prazo: new RegExp([
    '\\b(?:prazos?|imediat\\w+|instantane\\w+|minutos?|segundos|horas|dias|semanas|meses|anos|mesmo dia|mesma hora|rapid\\w+|tempo real|instantes?|diariamente|semanalmente|mensalmente|em instantes|agora mesmo|hoje mesmo|ainda hoje|amanha|sem demora|numa tarde|quinzenas?|trimestres?|semestres?|a qualquer hora|de madrugada|24 ?h)\\b',
    '\\bem (?:\\w+ ){0,2}(?:minuto|segundo|hora)\\b',
    '\\b(?:em|por|de) (?:um|uma|outro|outra) (?:dia|hora|minuto|mes|ano|semana|tarde)\\b|\\b(?:num|numa) (?:dia|hora|minuto|mes|ano|semana|tarde)\\b',
    '\\b(?:todo|cada) dia\\b|\\bpor (?:mes|ano)\\b|\\bao (?:mes|ano)\\b|\\btodo ano\\b|\\b(?:toda|cada|por) semana\\b',
    '\\bde um dia (?:pro|para o) outro\\b',
    '\\bantes de (?:segunda|terca|quarta|quinta|sexta|sabado|domingo)\\b',
    '\\bde (?:segunda|terca|quarta|quinta|sexta) a (?:terca|quarta|quinta|sexta|sabado|domingo)\\b',
    '\\bna hora\\b(?! (?:d[aeo]s?|em que|que|certa|exata|marcada|combinada|agendada)\\b)'   /* ("na hora da marcação" e "na hora certa" são o momento; "chega na hora" é prazo) */
  ].join('|')),
  garantia: /\b(?:garant\w*|certezas?|sem risco|reembolso|dinheiro de volta|devolv\w+ (?:o )?dinheiro|satisfacao)\b/,
  suporte: /\b(?:suporte|manutencao|assistencia|plantao|sla)\b/,
  ordem: /\b(?:ignor\w+|desconsider\w+|prompts?|system|esqueca (?:tudo|as|o que)|instrucao|instrucoes (?:do sistema|internas?|anteriores|acima)|(?:novas|suas|essas|minhas) instruc\w+|regras? (?:internas?|do sistema|acima|anteriores))\b/,
  negar_ia: /\b(?:sou|nao sou (?:uma? )?(?:ia|robo|bot|maquina|inteligencia artificial)|atendente humano|pessoa de verdade|humano de verdade|humana de verdade|por gente|carne e osso|ninguem aqui e (?:robo|maquina|bot|ia)|eu (?:respondo|atendo|escrevo|falo))\b/
};
/* a evidência do radar é a fala da PESSOA, em primeira pessoa ("sou eu", "eu atendo"): o "sou" solto e o "eu <verbo>" não valem para ela, mas NEGAR ser IA vale
   ("sou humano", "não sou robô", "sou pessoa de verdade", "ninguém aqui é robô", "eu sou humano de verdade"): senão o modelo forjaria uma "citação" dessas */
const NEGAR_IA_FORTE = /\b(?:nao sou (?:uma? )?(?:ia|robo|bot|maquina|inteligencia artificial)|sou (?:uma? )?(?:pessoa|humano|humana|gente|dono|dona)|eu sou (?:uma? )?(?:pessoa|humano|humana|gente|dono|dona)|atendente humano|pessoa de verdade|humano de verdade|humana de verdade|por gente|carne e osso|ninguem aqui e (?:robo|maquina|bot|ia)|nao e (?:um |uma )?(?:robo|bot|ia|maquina))\b/;
/* A fala da PESSOA (evidência do radar) descreve o negócio dela: "a avenida fica lotada", "tenho que ignorar mensagens fora do horário" são honestas. As raízes de PROMESSA de enchimento (enche, lota) e de ORDEM com o verbo
   solto (ignor-, desconsider-) são para texto de MODELO e saem daqui; a forma de ordem ("ignore as instruções", "desconsidere") é da defesa do visitante em api/_vendas/leitura.mjs (HOSTIL). Idioma: só as palavras
   de inglês e espanhol; a fração de palavras funcionais do português não vale ("minha loja da rua principal vende bastante" tem 14%) */
const SEM_PRIMEIRA_PESSOA = { ...RAIZES, negar_ia: NEGAR_IA_FORTE,
  promessa: new RegExp(RAIZES.promessa.source.replace('enche|encher|enchem|lota|lotar|lotam|lotad\\w+|', '')),
  ordem: new RegExp(RAIZES.ordem.source.replace('ignor\\w+|desconsider\\w+|', '')) };
/* à prova de no-op silencioso: se alguém mexer nas raízes e o replace deixar de achar o trecho, o módulo nem carrega (as duas pontas da exceção têm teste) */
if (SEM_PRIMEIRA_PESSOA.promessa.source === RAIZES.promessa.source || SEM_PRIMEIRA_PESSOA.ordem.source === RAIZES.ordem.source) throw new Error('planta-textos: a exceção da fala da pessoa não foi aplicada (o texto das raízes mudou)');
const REGULADO = {
  depoimento: /\b(?:depoiment\w*|testemunh\w*|antes (?:e |\/ )?depois|avaliacoes (?:de|dos|das) (?:pacientes|clientes)|casos? de sucesso|historias? de (?:pacientes|clientes)|fotos? de (?:pacientes|clientes)|relatos?|transformac\w+)\b/,
  resultado_regulado: /\b(?:cura\w*|curar|milagr\w*|tratamento garantido|emagrec\w*)\b/
};

/* ---------- idioma ---------- */
/* palavras funcionais do português (sem acento, como a busca as vê). Texto de 5 palavras ou mais (e que não seja uma lista de substantivos) precisa ter uma fração mínima delas (o menor texto honesto medido é 0,17; o corte é 0,15); abaixo disso, ou com uma
   palavra funcional de inglês ou espanhol que o português não tem, é "idioma". Na dúvida, recusa. O nome do negócio não conta como palavra do texto */
const FUNCIONAIS_PT = new Set(('de da do das dos em na no nas nos ao aos a o as os um uma uns umas e ou mas se que quem como quando onde para por pela pelo pelas pelos com sem sobre entre ate ja so nao ' +
  'mais menos muito pouco ele ela eles elas seu sua seus suas lhe te me voce cada todo toda todos todas tudo nada esse essa esses essas este esta isso isto outro outra vai vao sao foi tem ter ha pode ' +
  'depois antes assim aqui ali la tambem sempre ainda so tal mesmo mesma onde porque pois qual quais ate ou').split(' '));
/* palavras de inglês e de espanhol que o português NÃO tem (sem "for", "real", "zero", "entrega", "gratis", que também são nossas): uma só basta para recusar */
const ESTRANHAS = new Set(('the and with you your our from this will are is to of in on at by it i am not call us now free ready every first month best cheap price ever more get risk guaranteed guarantee instant fast ' +
  'human person being robot sales clients monthly refund offered automatically while sleeping full discount el los las del una con muy al es y precio sin costo inmediata inmediato was say tell them payment received okay please thanks confirm').split(' '));
export const FRACAO_PORTUGUES_MIN = 0.15;
export const PALAVRAS_MIN_IDIOMA = 5;
/* a fala da PESSOA: o corte cai de 0,15 para 0,05 (a menor fala honesta medida é 0,14); texto sem português nenhum, em inglês, continua caindo */
export const FRACAO_PORTUGUES_MIN_DA_PESSOA = 0.05;
const VIRGULAS_DE_LISTA = 3;   /* lista de substantivos ("Cardápio, mesas, reservas, pedidos...") não tem palavra funcional e é português: a fração não vale para ela */
const palavrasDe = busca => busca.split(' ').filter(Boolean);
/* a fração de palavras funcionais do português, ou null se o texto tem menos de PALAVRAS_MIN_IDIOMA palavras (fora as do nome do negócio) ou é uma lista */
export function fracaoPortugues(texto, nome = new Set()) {
  const palavras = palavrasDe(paraBusca(texto)).filter(p => !nome.has(p));
  if (palavras.length < PALAVRAS_MIN_IDIOMA || (texto.match(/,/g) || []).length >= VIRGULAS_DE_LISTA) return null;
  return palavras.filter(p => FUNCIONAIS_PT.has(p)).length / palavras.length;
}
function idiomaRuim(texto, nome, fracaoMin = FRACAO_PORTUGUES_MIN) {
  const palavras = palavrasDe(paraBusca(texto)).filter(p => !nome.has(p));
  if (palavras.some(p => ESTRANHAS.has(p))) return true;
  const f = fracaoPortugues(texto, nome);
  return f !== null && f < fracaoMin;
}

/* ---------- palavra cortada ou repetida ---------- */
/* a versão "colada": QUALQUER sinal entre letras sai, de hífen a parêntese ("pre-ço", "pre–ço", "pre,ço", "g(r)atis", "g.r.a.t.i.s", "D.E.Z", "gra- tis"), letra repetida 3 ou mais vezes vira uma ("preeeço"); depois, a mesma busca */
function colada(texto) {
  return paraBusca(texto.replace(/(?<=\p{L})(?:[^\p{L}\s]+|[-–—]\s)(?=\p{L})/gu, '').replace(/(\p{L})\1{2,}/giu, '$1'));
}

/* ---------- marcas ---------- */
/* as plataformas e os meios de pagamento de terceiros que o código do repositório já cita */
export const PLATAFORMAS = Object.freeze(['whatsapp', 'instagram', 'facebook', 'google', 'tiktok', 'youtube', 'linkedin', 'telegram', 'shopify', 'nuvemshop', 'wix',
  'mercado pago', 'mercadopago', 'mercado livre', 'paypal', 'picpay', 'nubank', 'chatgpt', 'openai', 'anthropic', 'claude']);
/* apelidos e marcas comuns de consumo (lista defensiva, sem pesquisa de marca): o que o visitante e o modelo escrevem no dia a dia */
export const APELIDOS_E_MARCAS = Object.freeze(['insta', 'zap', 'zapzap', 'wpp', 'whats', 'tik tok', 'you tube', 'ifood', 'uber', 'itau', 'bradesco', 'santander', 'rolex', 'nike', 'adidas', 'shopee',
  'canva', 'gmail', 'hotmail', 'outlook', 'twitter', 'kwai', 'pinterest', 'snapchat', 'netflix', 'spotify', 'amazon', 'apple', 'samsung', 'magalu', 'shein', 'olx', 'hotmart', 'stripe', 'skype', 'slack']);
const MARCAS_RE = new RegExp('\\b(?:' + [...PLATAFORMAS, ...APELIDOS_E_MARCAS].map(p => p.replace(/ /g, ' ?')).join('|') + ')\\b');
/* siglas de CONSELHO profissional (não são marca de ninguém): a rodada real 8 recusou "o número da OAB" e "o CREFITO" em plano honesto. Só estas, em caixa alta e escritas inteiras;
   "CRM" fica de fora de propósito (é também o software de relacionamento) e qualquer outra sigla continua marca */
export const SIGLAS_DE_CONSELHO = Object.freeze(['OAB', 'CREFITO', 'CRO', 'CRP', 'CRN', 'CREA', 'CREF', 'CRF', 'CRMV', 'CRECI']);
const SIGLAS_PERMITIDAS = new Set(SIGLAS_DE_CONSELHO);
const MEIO_DE_PAGAMENTO = new Set(['pix']);   /* o Pix é o meio de pagamento da Beyon Zero: passa em maiúscula e em caixa alta */

/* palavras comuns que podem abrir uma 2ª frase (ou mais) com inicial maiúscula: funcionais, verbos da ferramenta e os substantivos e verbos que uma planta usa.
   Capitalizada fora dessa lista, no começo de uma frase que não é a primeira, é nome próprio */
const COMUNS_NO_INICIO = new Set([...FUNCIONAIS_PT, ...F.VERBOS.map(v => paraBusca(v)),
  ...('pessoa pessoas cliente clientes site pagina conversa negocio empresa equipe loja servico servicos produto produtos pedido pedidos horario agenda aviso lembrete confirmacao resposta duvida duvidas caminho passo ' +
  'etapa fim comeco tela mensagem contato proposta orcamento catalogo cardapio curso cursos aluno turma aula fabrica comprador comercial medida material amostra acabamento sacola peca tamanho frete pagamento entrega ' +
  'retirada atendimento visita fotos foto vitrine guia busca mapa indicacao chega chegou cai vai volta fica ficou faz sai entra passa segue leva traz abre ve marca marcou pede pediu paga pagou quer precisa sabe ' +
  'fala conta ajuda resolve muda atende quem quando se cada todo toda assim depois antes entao logo a gente nenhum alguem alguns algumas varios varias outros outras primeiro primeira ultimo ultima proximo proxima ' +
  'um uma o a os as ao na no em agora hoje tudo tambem apenas somente enfim cozinha estoque salao mesa mesas reserva reservas casa escola obra pecas tecido oficina projeto ambiente cores cor fotos ' +
  'tratamento consulta exame exames convenio profissional paciente pacientes consultorio clinica vaga vagas matricula prato pratos balcao carrinho pix cartao nota recibo dados formulario link ' +
  'acompanha confere separa tira usa sobe desce escreve cancela remarca fecha compara monta produz prepara cuida define decide informa gera retorna repete renova reativa lista tabela preparo ' +
  'cuidados orientacoes instrucoes regras historico lembrancas novidades promocoes vagas vendas saida fila grupo cada nome telefone endereco bairro servico urgencia modalidade nivel inicio professor ' +
  'professora aluna alunos equipes estilo corte cabelo unha pele sessao sessoes plano planos pacote pacotes modelo modelos amostras tamanhos cores peso medidas tiragem cotas').split(' ')]);

/* o nome do negócio que a pessoa deu: só as palavras (letras), até 8, e só se o nome todo for curto E sem marca conhecida; senão ninguém tem passe */
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
    if (ehSigla) { if (SIGLAS_PERMITIDAS.has(p)) continue; return true; }
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
export function textoDoPlanoPermitido(bruto, { nomeDoNegocio = '', regulado = false, travas = true, primeiraPessoa = false, cidade = '' } = {}) {
  try {
    if (typeof bruto !== 'string') return { ok: false, motivo: 'texto' };
    if (bruto.length > TEXTO_MAX_ENTRADA) return { ok: false, motivo: 'longo' };
    /* "<" e ">" não são limpos em silêncio: um texto com tag é recusado (a forma já o faz; aqui vale para quem chamar sozinho) */
    if (/[<>]/.test(bruto.normalize('NFKC'))) return { ok: false, motivo: 'markdown' };
    let t = normalizarTexto(bruto);
    if (!t) return { ok: false, motivo: 'vazio' };
    /* nome do negócio com "&" ("Estética Bella & Cia"): o nome inteiro, escrito igual, vira "Estética Bella e Cia" (o "&" solto continua proibido) */
    const nomeComE = normalizarTexto(nomeDoNegocio);
    if (nomeComE.length >= 3 && nomeComE.includes('&')) t = t.split(nomeComE).join(nomeComE.split('&').join('e'));
    if (LETRA_FORA_DA_LISTA.test(t)) return { ok: false, motivo: 'alfabeto' };
    if (EMOJI.test(bruto) || EMOJI.test(t)) return { ok: false, motivo: 'emoji' };   /* (o bruto também: o NFKC leva o símbolo de marca registrada a "TM") */
    if (MARCAS_DEMAIS.test(t.normalize('NFD')) || MARCA_SOLTA.test(t) || MARCA_FORA_DO_BLOCO.test(t)) return { ok: false, motivo: 'caractere' };
    if (DIGITO.test(t)) return { ok: false, motivo: 'digito' };
    if (EMAIL.test(t)) return { ok: false, motivo: 'email' };
    if (URL.test(t)) return { ok: false, motivo: 'url' };
    if (SIMBOLO_DE_VALOR.test(t)) return { ok: false, motivo: 'simbolo' };
    if (MARKDOWN.test(t)) return { ok: false, motivo: 'markdown' };
    if (CARACTERE_DE_FORA.test(t)) return { ok: false, motivo: 'caractere' };
    if (LETRAS_SOLTAS.test(t)) return { ok: false, motivo: 'letras_soltas' };
    /* o nome do negócio e a cidade que a PESSOA deu (mesmas regras: curtos, sem marca conhecida) valem como nome próprio; nada além */
    const nome = new Set([...palavrasDoNome(nomeDoNegocio), ...palavrasDoNome(cidade)]);
    if (MARCAS_RE.test(paraBusca(t)) || MARCAS_RE.test(colada(t))) return { ok: false, motivo: 'marca' };   /* (antes do idioma: "you tube" é marca, não inglês) */
    if (idiomaRuim(t, nome, primeiraPessoa ? FRACAO_PORTUGUES_MIN_DA_PESSOA : FRACAO_PORTUGUES_MIN)) return { ok: false, motivo: 'idioma' };
    const busca = paraBusca(t), cola = colada(t);
    const lexico = achar(primeiraPessoa ? SEM_PRIMEIRA_PESSOA : RAIZES, busca, cola) || (regulado ? achar(REGULADO, busca, cola) : null);
    if (lexico) return { ok: false, motivo: lexico };
    if (regulado && pedeItemProibido(t)) return { ok: false, motivo: 'depoimento' };
    if (MARCAS_RE.test(busca) || MARCAS_RE.test(cola) || temNomeProprio(t, nome)) return { ok: false, motivo: 'marca' };
    if (regulado && textoProibido(t)) return { ok: false, motivo: 'depoimento' };
    /* a trava negarIA é para a voz do Zero (finge vida humana: "na minha cabeça", "eu atendo"); a fala da PESSOA (primeiraPessoa) tem a regra própria NEGAR_IA_FORTE acima, que derruba "sou humano" e "não sou robô" */
    if (travas) for (const trava of TRAVAS) if (!(primeiraPessoa && trava.nome === 'negarIA') && trava.rodar(t) !== t) return { ok: false, motivo: 'trava_' + trava.nome };
    return { ok: true, texto: t };
  } catch {
    return { ok: false, motivo: 'interno' };   /* falha fechado */
  }
}
