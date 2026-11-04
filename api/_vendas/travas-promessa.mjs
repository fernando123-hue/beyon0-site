/* ==========================================================================
   TRAVAS CONTRA PROMESSA (pendências do #75): suporte pós-entrega e mensalidade do atendente de IA.

   O prompt já diz "depois da entrega não há suporte contínuo" e "o atendente ainda não tem preço nem mensalidade", mas o
   modelo pode escorregar numa frase afirmativa (CDC art. 30 e 37: o que o Zero diz vale como promessa da empresa). Como a trava
   de desconto, estas só trocam a promessa AFIRMATIVA por um texto fixo, e olham ORAÇÃO por oração (vírgula, dois-pontos, "mas",
   "e", "que"): "o site não tem mensalidade e damos suporte contínuo" tem uma negação e uma promessa.

   LIMITE DECLARADO: é um filtro de lista, e nenhuma lista cobre todo jeito de dizer. A defesa de verdade é o prompt
   (consultor.mjs) e a rodada com o modelo real; estas travas pegam o óbvio e o que um visitante hostil consegue induzir com
   facilidade. Por isso priorizam precisão: um falso positivo corta uma resposta boa ("qualquer dúvida é só chamar" não é
   promessa de suporte e NÃO é tratada como tal). Os casos de teste, com as frases que as revisões mostraram, ficam em
   docs/testes/travas-promessa-casos.mjs.
   ========================================================================== */
import { frasesDe, paraBusca } from './zero.mjs';

/* ---------- apoio: orações ---------- */
const PONTUACAO = /[,;:()|/—–]|\s-\s/;
/* (cortes no texto CRU: no normalizado o verbo "é" viraria "e" e seria cortado como conectivo) */
const CONTRASTE = /\s(?:mas|porém|porem|só que|so que|embora|contudo|entretanto)\s/i;
const CONECTIVO = /\s(?:e|que|porque|pois)\s/i;
/* "sem dúvida damos suporte", "não se preocupe, damos", "não fica sem suporte": a palavra de negação aqui NÃO nega o que vem depois */
const NAO_NEGA = /\bsem duvida\b|\bnao se preocup\w*\b|\bnao e mentira\b|\bnao (?:tem|ha) problema\b|\bnao precisa se preocupar\b/g;
const DUPLA_NEGACAO = /\bnao (?:vai |va |iremos |vamos )?(?:fic\w+|deix\w+) (?:\w+ ){0,2}sem\b/g;
const NEGA = /\b(?:nao|nunca|jamais|nenhum|nenhuma|nem)\b|\bsem (?:\w+ ){0,2}(?:suporte|manutencao|assistencia|mensalidade|assinatura|cobranca|taxa|custo mensal)\b|\bpor (?:sua|tua) conta\b|\bfic(?:a|am) com (?:voce|o cliente)\b/;
const limpa = o => o.replace(DUPLA_NEGACAO, ' temos ').replace(NAO_NEGA, ' ');
const negada = o => NEGA.test(limpa(o));
const palavras = o => o.split(' ').filter(Boolean).length;

/* a frase em "orações maiores" (pontuação e contraste); cada uma é a lista das suas "orações menores" (cortadas em e, que) */
function oracoesDe(frase) {
  return String(frase).split(PONTUACAO).flatMap(o => o.split(CONTRASTE)).filter(o => o.trim())
    .map(maior => ({ texto: paraBusca(maior), menores: maior.split(CONECTIVO).map(o => paraBusca(o)).filter(Boolean) }))
    .filter(M => M.texto);
}

/* a pergunta com o assunto ("Suporte contínuo? Não temos.") se junta à frase seguinte */
function unidades(texto, temAssunto) {
  const frases = frasesDe(texto);
  const saida = [];
  for (let i = 0; i < frases.length; i++) {
    const crua = frases[i];
    const ehPergunta = /\?\s*$/.test(crua.trim());
    if (ehPergunta && temAssunto(paraBusca(crua)) && i + 1 < frases.length) {
      saida.push({ cru: crua + ' ' + frases[i + 1], pergunta: false });
      i += 1;
    } else {
      saida.push({ cru: crua, pergunta: ehPergunta });
    }
  }
  return saida;
}
/* a pergunta de oferta ou interesse ("quer suporte contínuo?") não afirma nada */
const PERGUNTA_DE_INTERESSE = /^(?:voce )?(?:quer|precisa|gostaria|deseja|pretende|procura|busca|tem interesse|ja tem|sua \w+ (?:tem|oferece|faz|presta))\b/;

/* ---------- 1. suporte e manutenção depois da entrega ---------- */
const COISA = '(?:suporte|manutencao|assistencia tecnica|pos venda)';
const COISA_RE = new RegExp('\\b' + COISA + '\\b');
const COISA_FRACA = '(?:atualizacoes?|correcoes|ajustes)';
const VERBO = '(?:(?:gente|beyon zero|beyon|zero|ela|empresa|te|lhe|sempre|tambem|ainda) da|dou|damos|dar|daremos|vou dar|vamos dar|tem|tenho|temos|tera|teras|ter|havera|ha|faco|fazemos|fazer|vem|recebe|recebera|ganha|leva|entregamos|oferec\\w+|incluimos|inclui|incluem|incluo|prest\\w+|garantimos|garanto|cuid\\w+|continuamos|continuaremos|mantemos|mantenho|mantem|conta(?:r|mos)? com|fic\\w+ responsavel pel[ao])';
const VERBO_RE = new RegExp('\\b' + VERBO + '\\b');
const SUPORTE_VERBO = new RegExp('\\b' + VERBO + '\\s+(?:\\w+\\s+){0,4}' + COISA + '\\b');
/* "Manutenção: a gente faz.", "Suporte? Tem sim.": o assunto vem antes do verbo */
const SUPORTE_POSPOSTO = new RegExp('\\b' + COISA + '\\s+(?:\\w+\\s+){0,4}(?:a gente (?:faz|da|cuida|mantem)|fazemos|damos|oferecemos|cuidamos|temos sim|tem sim|damos sim)\\b');
const CUE = '(?:incluso|inclusa|incluidos?|incluidas?|inclusos|gratis|gratuito|gratuita|de graca|sem custo|continuo|continua|vitalicio|vitalicia|mensal|permanente|pos entrega|depois da entrega|apos a entrega|garantido|garantida|a disposicao|24 ?h|24 horas|junto|no pacote|por nossa conta|com a gente|conosco|por (?:um|1|seis|doze|\\d+) (?:dias?|meses|mes|anos?)|\\d+ (?:dias|meses|anos))';
const SUPORTE_FORTE = new RegExp('\\b' + COISA + '\\b(?:\\s+\\w+){0,6}?\\s+' + CUE + '\\b|\\b' + CUE + '\\s+(?:\\w+\\s+){0,5}' + COISA + '\\b|\\b\\d+ (?:dias|meses|anos) de ' + COISA + '\\b|\\b' + COISA_FRACA + '\\b(?:\\s+\\w+){0,5}?\\s+(?:depois da entrega|apos a entrega|pos entrega|todo mes|sempre|gratis|sem custo|incluidas?|incluidos?)\\b');
const SUPORTE_SITE = /\b(?:cuidamos|cuido|atualizamos|mantemos|mantenho|acompanhamos) (?:\w+ ){0,4}site (?:\w+ ){0,3}(?:todo mes|sempre|mensalmente|depois|apos|sem custo|de graca)\b|\b(?:mantemos|mantem) (?:o|seu) site (?:\w+ ){0,3}(?:funcionando|atualizado|no ar)\b/;
const AJUDA = /\b(?:a gente|nos|ja|vamos|seguimos|continuamos|estamos|ficamos|estaremos)\b.*\b(?:resolve\w*|conserta\w*|corrig\w+|arruma\w*|ajud\w+|atend\w+|cuid\w+|disponive\w+|a disposicao)\b/;
const POS_ENTREGA = /\b(?:depois da entrega|apos a entrega|pos entrega|depois do site no ar|depois que o site (?:ficar|estiver) (?:pronto|no ar))\b/;
/* a conversa de agora ou o negócio do cliente, não o pós-entrega */
const DE_AGORA_ESTRITO = /\b(?:suporte|manutencao) (?:de quem|da previa|dos? ajustes)\b|\b(?:suporte|manutencao|assistencia tecnica) (?:tecnic[oa] )?(?:d[eoa]s?|em) (?!(?:seu|sua|o|a) (?:site|pagina)\b|site\b|pagina\b)\w+|\bsuporte (?:da|do) (?:sua|seu|proprio|propria)\b|\b(?:secao|pagina|botao|area|menu|link|canal|formulario|email) (?:de|do|para) (?:suporte|manutencao)\b/;
const DE_AGORA_LARGO = /\b(?:suporte|manutencao) (?:para|pra) (?:voce )?(?:duvidas?|escolh\w+|tirar|entender|montar|decidir|o orcamento)\b|\b(?:suporte|manutencao) (?:\w+ ){0,2}(?:na|no|nos|nas|aqui|nesta|neste|durante|ate)\b/;
const DO_CLIENTE = /\b(?:voce|voces|sua \w+|seu \w+|suas \w+|seus \w+)\s+(?:\w+\s+)?(?:oferece|oferecem|presta|prestam|faz|fazem|vende|vendem)\b/;
export const SUPORTE_FIXO = 'Depois da entrega não há suporte contínuo nem manutenção incluída: o que cabe são os ajustes da prévia, antes de você fechar.';

function menorPrometeSuporte(m) {
  if (negada(m) || DO_CLIENTE.test(m)) return false;
  const l = limpa(m);
  if (DE_AGORA_ESTRITO.test(l)) return false;
  if (SUPORTE_FORTE.test(l) || SUPORTE_SITE.test(l) || SUPORTE_POSPOSTO.test(l)) return true;
  return SUPORTE_VERBO.test(l) && !DE_AGORA_LARGO.test(l);
}
/* o assunto sozinho ("Suporte contínuo", "Manutenção e suporte") vale junto com o que vem depois, e com a negação que vem depois */
function juntaAssuntos(maiores) {
  const saida = [];
  let anteriorNegada = false;
  for (let i = 0; i < maiores.length; i++) {
    const m = maiores[i];
    const soAssunto = COISA_RE.test(m.texto) && !VERBO_RE.test(m.texto) && palavras(m.texto) <= 8;
    /* ("Isso a gente não faz: suporte contínuo." o assunto curto herda a negação; "Não cobramos nada: o suporte está incluído" não) */
    if (soAssunto && anteriorNegada && palavras(m.texto) <= 3) { continue; }
    if (soAssunto && i + 1 < maiores.length) {
      let texto = m.texto + ' ' + maiores[i + 1].texto;
      let ate = i + 1;
      if (i + 2 < maiores.length && palavras(maiores[i + 1].texto) <= 2) { texto += ' ' + maiores[i + 2].texto; ate = i + 2; }
      saida.push({ texto, menores: [texto] });
      anteriorNegada = negada(texto);
      i = ate;
      continue;
    }
    saida.push(m);
    anteriorNegada = negada(m.texto);
  }
  return saida;
}
function frasePrometeSuporte(unidade) {
  if (unidade.pergunta && PERGUNTA_DE_INTERESSE.test(paraBusca(unidade.cru))) return false;
  const maiores = juntaAssuntos(oracoesDe(unidade.cru));
  if (maiores.some(M => M.menores.some(menorPrometeSuporte))) return true;
  /* "se der problema depois da entrega, a gente resolve": a condição e a ajuda ficam em orações diferentes; vale a frase inteira, sem nenhuma negação */
  const inteira = maiores.map(M => M.texto).join(' ');
  return POS_ENTREGA.test(inteira) && AJUDA.test(inteira) && !negada(inteira);
}
export function semPromessaDeSuporte(texto) {
  const original = String(texto ?? '');
  const ruim = unidades(original, n => COISA_RE.test(n)).some(frasePrometeSuporte);
  return ruim ? { texto: SUPORTE_FIXO, trocou: true } : { texto: original, trocou: false };
}

/* ---------- 2. mensalidade do atendente de IA ---------- */
/* ("seu atendente", "sua recepcionista": é o do cliente, não o nosso) */
const ATENDENTE = /(?<!\b(?:seu|sua|seus|suas|meu|minha) )\b(?:atendente|chat ?bot|chat do site|chat do seu site|chat com ia|chat de ia|chat com inteligencia artificial|assistente (?:virtual|de ia|do site)|agente de ia|robo(?: de atendimento| do site)?|bot|ia do site|ia no site|ia do atendimento|inteligencia artificial do site|atendimento (?:com|por|automatico|automatizado)(?: ia)?)\b/;
const MENSALIDADE = /\b(?:mensalidade|plano mensal|assinatura (?:mensal|recorrente)|cobranca (?:mensal|recorrente)|taxa mensal|valor mensal|custo mensal|anuidade|mensalmente|mensais|recorrente|recorrencia)\b|\b(?:custa|cobra\w*|paga\w*|valor|preco|sai)\b.*\b(?:por mes|todo mes|ao mes)\b/;
const ASSINATURA = /\bassinatura\b/;
/* a oração diz que o atendente ainda não existe/está em preparo e NÃO afirma mensalidade nela */
const EM_PREPARO = /\b(?:em preparo|quando existir|se existir|se um dia existir|existiria)\b/;
const ASSERTA = /\b(?:tem|tera|teria|vai ter|ja tem|cobra\w*|custa|custara|exige|sera|vai ser|e de|fica em|e cobrado)\b/;
/* o negócio do cliente ("sua academia tem mensalidade"): a mensalidade não é do nosso atendente */
const DO_NEGOCIO = /\b(?:sua|seu|suas|seus) (?!atendente\b|site\b|chat\b|bot\b|robo\b|assistente\b)\w+ (?:tem|cobra\w*)\b/;
const atendenteNosso = t => ATENDENTE.test(t) && !DO_NEGOCIO.test(t);
export const ATENDENTE_FIXO = 'O atendente de IA ainda está em preparo, sem preço, mensalidade nem prazo definidos, então não consigo te passar isso agora.';

function menorAfirma(m) {
  const l = limpa(m);
  if (NEGA.test(l) || DO_NEGOCIO.test(l)) return false;
  if (EM_PREPARO.test(l) && !ASSERTA.test(l.replace(EM_PREPARO, ' '))) return false;
  return true;
}
const temMensalidade = m => MENSALIDADE.test(m) || (ASSINATURA.test(m) && ATENDENTE.test(m));
function janelaPrometeMensalidade(janela) {
  const maiores = oracoesDe(janela);
  const tudo = maiores.map(M => M.texto).join(' ');
  if (!ATENDENTE.test(tudo) || !(MENSALIDADE.test(tudo) || (ASSINATURA.test(tudo) && ATENDENTE.test(tudo)))) return false;
  for (let i = 0; i < maiores.length; i++) {
    const anterior = i > 0 ? maiores[i - 1].texto : '';
    const proxima = i + 1 < maiores.length ? maiores[i + 1].texto : '';
    const recentes = maiores.slice(Math.max(0, i - 2), i + 1).map(M => M.texto).join(' ');
    for (const m of maiores[i].menores) {
      if (!menorAfirma(m)) continue;
      /* "Mensalidade do atendente? Ainda não existe.": o assunto sozinho, negado logo em seguida */
      if (!ASSERTA.test(m) && proxima && negada(proxima)) continue;
      /* a mensalidade é afirmada numa oração em que fala do atendente (ou logo depois de uma que falava) */
      if (temMensalidade(m) && atendenteNosso(recentes)) return true;
      /* "o site não tem mensalidade, mas o atendente tem": o atendente afirma o que a oração anterior negou */
      if (ATENDENTE.test(m) && ASSERTA.test(m) && MENSALIDADE.test(anterior) && negada(anterior)) return true;
    }
  }
  return false;
}
export function semMensalidadeDoAtendente(texto) {
  const original = String(texto ?? '');
  const frases = frasesDe(original);
  const semFim = f => f.trim().replace(/[.!?]+$/, '');
  const ruim = frases.some((f, i) => {
    const temProxima = i + 1 < frases.length;
    const ehPergunta = /\?\s*$/.test(f.trim());
    /* pergunta de interesse não afirma; pergunta seguida de resposta só vale junto com a resposta */
    if (ehPergunta && (PERGUNTA_DE_INTERESSE.test(paraBusca(f)) || temProxima)) {
      return temProxima && !PERGUNTA_DE_INTERESSE.test(paraBusca(f)) && janelaPrometeMensalidade(semFim(f) + ', ' + frases[i + 1]);
    }
    return janelaPrometeMensalidade(f) || (temProxima && janelaPrometeMensalidade(semFim(f) + ', ' + frases[i + 1]));
  });
  return ruim ? { texto: ATENDENTE_FIXO, trocou: true } : { texto: original, trocou: false };
}
