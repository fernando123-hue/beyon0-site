/* ==========================================================================
   TRAVAS CONTRA PROMESSA DE RESULTADO E DE GARANTIA (o Zero, consultor de IA do site de vendas).

   O prompt (consultor.mjs) já manda: "Nunca invente portfólio, depoimento, número de clientes, resultado nem posição no Google;
   não prometa mais vendas, retorno nem 'o melhor'" e "garantia: você não confirma". Mas o modelo pode escorregar numa frase
   afirmativa, e o que o Zero diz vale como promessa da empresa (CDC art. 30 e 37). Estas travas seguem o molde de
   travas-promessa.mjs: olham ORAÇÃO por oração, trocam só a promessa AFIRMATIVA por um texto fixo e deixam passar a negação ("não
   garanto"), a possibilidade ("pode ajudar"), a pergunta de interesse ("quer vender mais?") e o que a empresa de fato disse.

   • semPromessaDeResultado: mais clientes/vendas/faturamento, posição no Google, retorno do investimento, "resultado garantido".
     O dado inventado sobre os clientes da Beyon ("todos os nossos clientes cresceram", "fizemos sites para dezenas de empresas";
     a Beyon ainda não tem casos publicados) sai com um texto fixo PRÓPRIO (DADO_FIXO), que não inventa nada além de "não há casos".
   • semGarantia: "garantia de N meses", "satisfação garantida", "garantimos que você vai gostar", "dinheiro de volta", "não gostou,
     não paga". NÃO corta o que está em condicoes.html e no prompt, e só nestas duas formas exatas: "7 dias para desistir" com a
     entrada de volta (CDC art. 49) e devolver a entrada se a Beyon atrasar a entrega. Qualquer outro prazo ("30 dias para
     desistir"), "a qualquer momento", "quando quiser", "depois dos 7 dias ... devolvemos" ou "não gostou ... devolvemos" CORTA.
     Também não corta a garantia do negócio do CLIENTE (lista fechada: loja, empresa, produto, serviço...; o resto é nosso e corta).

   Diferença do molde: aqui só a FRASE que promete é trocada (como em semPromessaDeRecado) e o resto da resposta fica. Num turno de
   venda o resto costuma ter o marcador do valor [[total]] e a pergunta seguinte; jogar a resposta toda fora custaria a conversa.

   COMO O CONTEXTO VALE (rodada 2, depois das revisões): negação e "pode ajudar" NÃO valem "em qualquer lugar da oração", só colados
   à promessa. A negação vale se vier até 3 palavras antes do trecho que promete, ou se a oração abrir com uma fala negada ("não
   vou prometer que...", "ninguém sério garante...", "sem garantia de que..."); o "pode/talvez/se/ajuda a" vale até 4 palavras antes.
   Dito DEPOIS ("para você não ficar parado", "ajudando os clientes", "de quem precisa") não desfaz a promessa. Terceira pessoa
   ("quem promete que o site vai dobrar suas vendas está mentindo", "alguns dizem que...") é crítica ao mercado e passa.

   FRONTEIRA "pode ajudar" x "vai trazer": o que AFIRMA o resultado (vai trazer/dobrar/vender mais, traz mais clientes, o faturamento
   vai subir) é cortado; a possibilidade (pode, poderia, ajuda a, facilita, costuma, tende a, depende) e o objetivo da pessoa passam.
   O verbo de resultado só vale colado a um objeto de resultado (clientes, vendas...) por artigos e quantificadores, nunca por
   qualquer palavra, para "vai trazer os dados do orçamento" não ser cortado.

   AVISO HONESTO SOBRE A MEDIDA: o 100% no gabarito do classificador (promete_resultado) é REGRESSÃO, não qualidade: o autor viu
   os 14 positivos ao escrever os padrões. O número que vale é o de frases que o autor NÃO tinha visto ao escrever:
     • revisores (283 promessas e 139 honestas): recall de ~45% antes da rodada 2; depois, 97%, mas aí o autor já viu todas
       (viraram teste), então esse 97% também é regressão;
     • três levas de frases novas do autor (120 promessas, 140 honestas), medidas ANTES de ajustar a trava a cada leva:
       ~49% de recall com a trava do primeiro commit e ~60% com a da rodada 2, com ZERO frase honesta cortada nas 140.
   Em português claro: a trava pega pouco mais da metade do que um visitante hostil ou um modelo distraído consegue dizer, e
   quase nunca corta resposta boa. Em compensação, o que ela pega vira um texto fixo seguro. A defesa de verdade é o prompt e a rodada
   com o modelo real; esta trava é a segunda camada. É um filtro de lista, e nenhuma lista cobre todo jeito de dizer. Por isso as
   travas priorizam PRECISÃO: um falso positivo corta uma resposta boa. Os furos que sobram ficam em
   docs/testes/travas-resultado-casos.mjs (FUROS_RESULTADO_CONHECIDOS e FUROS_DA_RODADA_2), com o motivo; outro idioma além do
   conjunto mínimo de inglês e espanhol também é furo conhecido.

   LIMITES CONHECIDOS: (1) promessa.mjs corta cada frase em 2.000 caracteres (TETO) ao normalizar, e estas travas examinam no máximo
   1.200 frases ou 6.000 caracteres por texto (MAX_FRASES, MAX_CARACTERES: 25 mil linhas curtas custavam ~4 s): o que vier depois não
   é visto. Não é um furo aberto, porque o agente já corta o texto do modelo em 1.100 caracteres (TEXTO_DO_MODELO_MAX) antes das
   travas; se esse corte subir para perto de 6.000, estes limites têm de subir junto (há um teste que fixa a folga). (2) travas-resultado depende de PONTUACAO, CONTRASTE e limpa
   exportados por travas-promessa.mjs: há um teste em zero.test.mjs que fixa esse acoplamento.
   Todas as janelas das expressões são limitadas ({0,n}): nenhuma entrada de 50 mil caracteres gera backtracking.
   ========================================================================== */
import { frasesDe, paraBusca } from './zero.mjs';
import { PONTUACAO, CONTRASTE, limpa } from './travas-promessa.mjs';

export const DADO_FIXO = 'Ainda não tenho casos publicados para mostrar.';
export const RESULTADO_FIXO = 'Resultado, como mais clientes, mais vendas ou posição no Google, não dá para garantir, e a gente não promete isso. O que a gente faz é um site claro, para a pessoa encontrar você, entender o que você faz e decidir com tranquilidade.';
export const GARANTIA_FIXO = 'Garantia eu não consigo confirmar. O que existe está nas condições: depois de aceitar, você tem 7 dias para desistir e receber a entrada de volta. Se a gente atrasar a entrega, a gente devolve a entrada.';

/* ---------- apoio: texto, orações e variantes ---------- */
const rx = (partes, ...vs) => new RegExp(String.raw(partes, ...vs), 'g');
/* (as listas de padrões são globais, para matchAll; para só perguntar "tem?" use tem(), que não guarda estado) */
const tem = (re, s) => s.search(re) !== -1;
const W = '[a-z0-9%]+';
const SEP = '%%';
const SEP_G = new RegExp(SEP, 'g');
const PONT_G = new RegExp(PONTUACAO.source, 'g');
const CONTR_G = new RegExp(CONTRASTE.source, 'gi');
const ultimas = (s, n) => s.trim().split(' ').slice(-n).join(' ');

/* o texto sem acento e caixa, com a pontuação e o contraste trocados por um marcador (%%) que sobrevive à normalização */
const preparar = raw => paraBusca(String(raw).replace(CONTR_G, ' ' + SEP + ' ').replace(PONT_G, ' ' + SEP + ' '));
const oracoes = norm => norm.split(SEP).map(s => s.trim()).filter(Boolean);

/* letras espaçadas ("v a i  d o b r a r", "v-e-n-d-a-s"): separador igual em tudo vira uma palavra só; mistura de 1 e 2 espaços
   marca a fronteira entre palavras. Só serve para PROCURAR (a resposta mostrada nunca é reescrita assim) */
const LETRA = 'A-Za-zÀ-ÿ';
const CORRIDA = new RegExp('(?<![' + LETRA + '])[' + LETRA + '](?:[ \\-_*]{1,2}[' + LETRA + '](?![' + LETRA + '])){2,}', 'g');
function desespacar(raw) {
  return String(raw).replace(CORRIDA, corrida => {
    const larguras = (corrida.match(/[ \-_*]{1,2}/g) || []).map(s => s.length);
    const maior = Math.max(...larguras);
    if (larguras.every(l => l === maior)) return corrida.replace(/[ \-_*]/g, '');
    return corrida.split(new RegExp('[ \\-_*]{' + maior + '}')).map(p => p.replace(/[ \-_*]/g, '')).join(' ');
  });
}
/* aposto curto entre duas pontuações ("vai, sim, dobrar", "vai – e muito – trazer", "vai (com certeza) dobrar") não quebra o padrão afirmativo */
const APOSTO = new RegExp('(?<=^| )' + SEP + ' ((?:' + W + ' ){0,4}' + W + ') ' + SEP + '(?= |$)', 'g');
const APOSTO_NAO = /\b(?:nao|nunca|jamais|nem|nenhum\w*|talvez|pode\w*|se|caso|geral|vezes|depende\w*|tende\w*|costuma\w*|quando|apenas|so)\b/;
const semApostos = norm => norm.replace(APOSTO, (todo, miolo) => (APOSTO_NAO.test(miolo) ? todo : ' '));
/* "vai: dobrar suas vendas", "garantia: 12 meses": a pontuação colada ao verbo/ao substantivo também some */
const COLADO = new RegExp('\\b(vai|vao|ira|irao|va|vamos|vou|deve|devera|dobrar|triplicar|trazer|atrair|gerar|aumentar|vender|faturar|garanto|garantimos|garantir|garantia) ' + SEP + ' ', 'g');
const variantes = raw => {
  const base = preparar(desespacar(raw));
  return [...new Set([base, semApostos(base), base.replace(COLADO, '$1 '), semApostos(base).replace(COLADO, '$1 ')])];
};

const ehPergunta = f => /\?\s*$/.test(String(f).trim());
/* a pergunta retórica ("o site vai dobrar suas vendas, certo?", "sabia que temos garantia?") afirma; não é pergunta de interesse */
const TAG_FINAL = /,\s*(?:certo|ne|né|ta|tá|ok|combinado|entendeu|viu|não é|nao e)\s*\?\s*$/i;
const RETORICA = /^(?:voce sabia que|sabia que|nao e (?:otimo|bom|incrivel|legal|maravilhoso|demais)|ja pensou|imagina|e (?:otimo|bom) saber)\b/;
const eRetorica = f => TAG_FINAL.test(String(f).trim()) || RETORICA.test(paraBusca(f));

/* quanto do texto as travas examinam: 25 mil linhas curtas custavam ~4 s, e o agente só entrega 1.100 caracteres de texto do modelo
   (TEXTO_DO_MODELO_MAX em agente.mjs) a estas travas; examinar 1.200 frases ou 6.000 caracteres é folga de mais de 5 vezes */
const MAX_FRASES = 1200;
const MAX_CARACTERES = 6000;

/* troca as frases marcadas pelo texto fixo de cada uma (cada texto fixo entra uma vez só); o resto da resposta fica */
function trocarFrases(texto, decidir) {
  const original = String(texto ?? '');
  const frases = frasesDe(original);
  const marcas = new Map();
  let vistos = 0;
  for (let i = 0; i < frases.length && i < MAX_FRASES; i++) {
    vistos += frases[i].length;
    if (vistos > MAX_CARACTERES) break;
    const d = decidir(frases, i);
    if (!d) continue;
    for (let k = 0; k < d.n; k++) marcas.set(i + k, d.fixo);
    i += d.n - 1;
  }
  if (!marcas.size) return { texto: original, trocou: false };
  const usados = new Set();
  const saida = [];
  frases.forEach((f, i) => {
    if (!marcas.has(i)) { saida.push(f); return; }
    const fixo = marcas.get(i);
    if (usados.has(fixo)) return;
    usados.add(fixo);
    saida.push(fixo + (/\s$/.test(f) ? f.match(/\s+$/)[0] : ''));
  });
  return { texto: saida.join('').trim(), trocou: true };
}

/* ---------- o contexto que desfaz (ou não) uma promessa ---------- */
/* a negação: "sem dúvida (nenhuma)" e "não se preocupe" não negam (limpa, do molde); "não tenha dúvida", "não tem erro" também não */
const FALSA_NEGACAO = /\bsem (?:nenhuma )?duvidas?(?: nenhuma)?\b|\bnao (?:tenha|tem|ha) duvidas?\b|\bnao duvide\b|\bnao se engane\b|\bnao tem erro\b|\bsem erro\b|\bnao e so\b/g;
const NEGA_PERTO = /\b(?:nao|nunca|jamais|nem|nenhum|nenhuma|ninguem)\b/;
/* a fala negada que cobre o resto da oração: "não vou prometer que...", "não tem como garantir que...", "sem garantia de que...", "ninguém sério garante..." */
const FRAME = /\b(?:nao|nunca|jamais)\s+(?:\w+\s+){0,3}?(?:prometer|prometo|prometemos|promete|garantir|garanto|garantimos|garantid\w+|afirmar|afirmo|dizer|digo|assegurar|asseguro|jurar|juro|cravar|posso|consigo|podemos|conseguimos|sei|saber|quer dizer|significa|implica|e verdade)\b|\bnao\s+(?:existe|ha)\b|\bnao tem (?:como|garantia|certeza)\b|\bsem (?:nenhuma )?(?:garantia|certeza|promessas?|como)\b|\bninguem\b|\b(?:impossivel|mentira|falso|duvido|dificil)\b/;
const negadoAntes = antes => {
  const a = limpa(antes.replace(FALSA_NEGACAO, ' '));
  return FRAME.test(a) || NEGA_PERTO.test(ultimas(a, 3));
};
/* "garantia de 12 meses a gente não oferece": a negação logo DEPOIS do trecho, seguida de um verbo de oferta ou de promessa */
const DEPOIS_NEGA = /^\s*(?:\w+\s+){0,2}nao\s+(?:oferec\w+|damos|temos|garant\w+|prometo|prometemos|afirm\w+|posso|consigo|existe|ha|tem)\b/;
/* o possível, a tentativa, a condição, colados ANTES da promessa. "pode apostar/ficar tranquilo/esperar" é reforço, não dúvida */
const HEDGE_PERTO = /\b(?:pode(?! (?:apostar|ficar|confiar|ter certeza|contar|acreditar|escrever|esperar|jurar|anotar|crer))|podem|poderia|poderiam|poder|talvez|quem sabe|chance|possivel|possibilidade|tende|tendem|costuma|costumam|se|caso|imagine|suponha|supondo|ajuda|ajudar|ajudando|facilita|facilitar|contribui|tentar|buscar|depende|dependendo|quando)\b/;
/* terceira pessoa e crítica ao mercado: o Zero está dizendo que NÃO se deve acreditar nisso */
const REPORTADA = /\b(?:quem|existe quem|ha quem|tem quem)\s+(?:promete|prometem|garante|garantem|diz|dizem|afirma|afirmam|jura|juram|fala|falam)\b|\b(?:alguns|muitos|outros|muita gente|o pessoal)\s+(?:\w+\s+){0,1}(?:dizem|diz|falam|prometem|garantem|acham|acreditam|afirmam)\b|\b(?:dizem|falam|afirmam|acreditam|prometem) que\b|\bdesconfie\b|\bcuidado com\b|\bfuja d[aeo]s?\b/;
/* descrição de função, não resultado: "vai receber novos pedidos por e-mail", "atende muitos clientes ao mesmo tempo", "quando alguém buscar o nome" */
const DEPOIS_OPERACIONAL = /^\s*(?:por|via|pelo|pela)\s+(?:e mail|email|whatsapp|painel|formulario|chat|mensagem)\b|^\s*(?:ao mesmo tempo|simultaneamente|de uma vez|fora do horario|a qualquer hora|24 ?h|vinte e quatro)\b|^\s+(?:da|do|das|dos)\s+(?:previa|estimativa|busca|pesquisa|calculo|tabela|conversa|escopo|orcamento|teste|formulario|simulacao)\b|^\s+(?:do|da)\s+(?:site|resumo|orcamento|conversa|formulario|pagina|previa|atendente)\b/;
const DEPOIS_CONDICIONAL = /^\s*(?:se|caso|quando|desde que|a menos que|contanto que)\b/;
/* o vendedor/equipe/atendente fazendo o trabalho dele não é promessa do site */
const SUJEITO_PESSOA = /\b(?:vendedor|vendedores|equipe|time|funcionario|funcionarios|gerente|atendente)\s+(?:\w+\s+){0,1}$/;

function promessasEm(m, lista, { hedge = true, negacao = true, ctx = '' } = {}) {
  for (const re of lista) {
    for (const x of m.matchAll(re)) {
      const idx = x.index;
      const fim = idx + x[0].length;
      /* o trecho que abre a oração herda as 1 ou 2 orações curtas (até 3 palavras) logo antes: "Nenhum site, nem o nosso, garante vendas" */
      const antes = (m.slice(0, idx).trim() === '' ? ctx + ' ' : '') + m.slice(0, idx);
      const depois = m.slice(fim);
      if (DEPOIS_OPERACIONAL.test(depois) || DEPOIS_CONDICIONAL.test(depois)) continue;
      if (REPORTADA.test(m.slice(0, fim)) || SUJEITO_PESSOA.test(antes)) continue;
      if (negacao && (negadoAntes(antes) || DEPOIS_NEGA.test(depois))) continue;
      /* (sem as expressões que só parecem negação ou dúvida: "não se preocupe" tem um "se" que não é condição) */
      if (hedge && HEDGE_PERTO.test(ultimas(limpa(antes.replace(FALSA_NEGACAO, ' ')), 4))) continue;
      return true;
    }
  }
  return false;
}
/* o que AFIRMA negando ("nunca vai deixar de trazer", "nenhum cliente nosso deixou de crescer"): só a crítica ao mercado salva */
const afirmaNegando = (m, lista) => lista.some(re => [...m.matchAll(re)].some(x => !REPORTADA.test(m.slice(0, x.index + x[0].length))));

/* ---------- 1. promessa de resultado ---------- */
const NUMW = '(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quinhentos|mil)';
const VEZES = '(?:(?:\\d+(?:[.,]\\d+)?|' + NUMW + '(?: e ' + NUMW + ')?)\\s*(?:x|vezes))';
const PCT = '(?:\\d+(?:[.,]\\d+)?\\s?%|' + NUMW + '(?: e ' + NUMW + ')?\\s+por\\s*cento)';
const NUM = '(?:' + PCT + '|' + VEZES + '|o dobro|o triplo|o quadruplo|em dobro)';
/* o que é resultado: os fortes valem com artigo ("vai trazer os clientes"); os fracos só com "mais"/quantidade ("vai trazer mais contatos") */
const FORTE = '(?:clientes|vendas|faturamento|lucros?|receitas?|conversoes|conversao|retorno|roi|resultados|pacientes|alunos|fregueses|compradores)';
const FRACO = '(?:contatos|orcamentos|pedidos|visitas|visitantes|acessos|trafego|reservas|encomendas|agendamentos|consultas|matriculas|mensagens|ligacoes|seguidores|curtidas|publico|audiencia|procura|demanda|movimento|oportunidades|indicacoes|negocios|inscricoes|cadastros|leads|gente|contratos|propostas|fechamentos)';
const DE_RESULTADO = '(?:' + FORTE + '|' + FRACO + ')';
const ARTIGO = '(?:mais|muito|muitos|muitas|bem|bastante|novos|novas|varios|varias|diversos|grande|grandes|bons|otimos|excelentes|maiores|melhores|bom|boa|otimo|otima|excelente|os|as|o|a|um|uns|uma|seus|suas|seu|sua|todos|todas|todo|toda|esses|essas|esse|essa|estes|estas|este|esta|milhares de|centenas de|dezenas de|mil|cem|cento|dois|duas|tres|quatro|cinco|dez|vinte|trinta|cinquenta|\\d+%?)';
const ART = '(?:' + ARTIGO + '\\s+){0,3}';
const QUANT = '(?:(?:muito|bem|os|as|seus|suas)\\s+)?(?:(?:mais|muitos|muitas|novos|novas|varios|varias|diversos|bastante|mil|milhares|centenas|dezenas|cem|cento|\\d+%?)\\s+){1,2}';
const AUX = '(?:vai|vao|ira|irao|va|iremos|vamos|vou|deve|devera|deverao|devem|passara a|vai passar a|vao passar a)';
const ADV = '(?:(?:ja|tambem|sim|certamente|realmente|sempre|logo|muito|bastante|ainda|so|mesmo|te|lhe|nos|facilmente|automaticamente|com certeza|com toda certeza|de fato|rapidinho|rapido|rapidamente|definitivamente|inevitavelmente|infalivelmente|obviamente|garantidamente|literalmente|sem duvida)\\s+){0,3}';
const AUXV = '(?:(?:conseguir|comecar a|voltar a|passar a)\\s+)?';
const LEAD = AUX + '\\s+' + ADV + AUXV;
const CL = '(?:(?:te|lhe|nos|voce|para voce|pra voce|a voce)\\s+)?';
const SOBE_INF = '(?:dobrar|triplicar|quadruplicar|multiplicar|aumentar|elevar|impulsionar|turbinar|disparar|alavancar)';
const SOBE_PRES = '(?:dobra|dobram|triplica|triplicam|multiplica|multiplicam|aumenta|aumentam|eleva|elevam|impulsiona|turbina|dispara|alavanca)';
const TRAZ_INF = '(?:gerar|trazer|atrair|captar|conquistar|garantir|render|converter|dar|proporcionar|fechar)';
const TRAZ_PRES = '(?:traz|trazem|atrai|atraem|gera|geram|rende|rendem|converte|convertem|garante|garantem|capta|conquista|fecha|fecham)';
const GANHA_INF = '(?:ganhar|receber|ter|fechar|atender|fazer|vender|conseguir|ver|obter|alcancar)';
const V_VENDE = '(?:vender|faturar|lucrar|converter|crescer|render|arrecadar)';
const DO_NEGOCIO = '(?:' + DE_RESULTADO + '|agenda|caixa|negocio|loja|empresa|clinica|consultorio|restaurante|telefone|whatsapp|salao|oficina|academia|escritorio|marca|faturamento)';
const SOBE_VERBO = '(?:subir|crescer|aumentar|dobrar|triplicar|multiplicar|disparar|explodir|decolar|bombar|lotar|chover|melhorar|se multiplicar|se multiplicarem)';
const CONCORRENTE = '(?:concorrentes?|concorrencia|rivais)';
const GARANTE = '(?:(?:posso|consigo|vou|vamos|da pra|da para)\\s+)?(?:garantir|garanto|garantimos|garante|garantem|asseguro|asseguramos|prometo|prometemos|promete|prometem)';
const NOVOS = '(?:novos|novas|nova|qualificados|qualificadas|certos|certo|certas|todo dia|todos os dias|toda semana|todo mes|de outras cidades|de fora)';

/* a promessa dita no AFIRMATIVO. Cada padrão ancora num verbo ou numa expressão e olha uma janela curta */
const PROMESSAS_DE_RESULTADO = [
  /* "vai dobrar/aumentar os clientes", "vai trazer mais contatos", "vai te dar mais clientes", "vai ganhar mais clientes", "vai vender mais" */
  rx`\b${LEAD}${SOBE_INF}\s+${ART}${DE_RESULTADO}\b`,
  rx`\b${LEAD}${TRAZ_INF}\s+${CL}(?:${ART}${FORTE}|${QUANT}${DE_RESULTADO})\b`,
  rx`\b${LEAD}${GANHA_INF}\s+${CL}${QUANT}${DE_RESULTADO}\b`,
  rx`\b${LEAD}(?:${TRAZ_INF}|${GANHA_INF})\s+${CL}(?:o |a |os |as )?(?:clientes|pacientes|gente|publico|pedidos|visitantes|contatos|leads)\s+${NOVOS}\b`,
  rx`\b${LEAD}${GANHA_INF}\s+${CL}${QUANT}(?:\w+\s+){0,1}(?:e|ou)\s+${QUANT}${DE_RESULTADO}\b`,
  rx`\b${LEAD}${V_VENDE}\s+(?:mais|muito|bastante|bem mais|o dobro|o triplo|dobrado|triplicado)\b`,
  rx`\b${LEAD}${V_VENDE}\s+(?:\w+\s+){0,1}${VEZES}\s+mais\b`,
  rx`\b${LEAD}fazer\s+(?:(?!(?:para|pra|a|de|que|se)\s)\w+\s+){1,3}${V_VENDE}\s+(?:mais|muito|bastante|bem mais|o dobro|o triplo)\b`,
  rx`\b${LEAD}(?:ganhar|faturar|lucrar)\s+(?:mais |muito |bastante )?(?:dinheiro|grana)\b`,
  rx`\b${LEAD}(?:converter|transformar)\s+(?:\w+\s+){0,2}em\s+(?:clientes|vendas|compradores|pacientes)\b`,
  rx`\b${LEAD}(?:aumentar|elevar)\s+(?:o |a |os |as )?(?:numero|quantidade|volume|fluxo)\s+(?:de\s+)?${DE_RESULTADO}\b`,
  rx`\b${LEAD}(?:ter|receber|atender|ganhar|fechar|vender|faturar|conseguir|alcancar|atrair|trazer|gerar|captar)\s+(?:\w+\s+){0,1}(?:o dobro|o triplo|o quadruplo)\s+d[eo]s?\s+(?:\w+\s+){0,1}${DE_RESULTADO}\b`,
  rx`\b${LEAD}(?:ter|obter|conseguir|alcancar)\s+(?:(?:mais|muito|muitos|bom|bons|otimo|otimos|um|uns|seu|seus|esse|esses)\s+){0,2}(?:retorno|lucros?)\b`,
  rx`\b${LEAD}(?:ter|obter|conseguir)\s+(?:(?:mais|muito|muitos|bom|bons|otimo|otimos|rapido|rapidos)\s+){1,2}resultados?\b`,
  rx`\b${LEAD}(?:ter|formar|ver|ficar com)\s+(?:uma |a |sua |a sua )?(?:fila de (?:clientes|pacientes|espera)|casa cheia|loja cheia|clinica cheia|agenda (?:cheia|lotada|sempre cheia))\b`,
  /* futuro simples: "terá mais clientes", "dobrará as vendas", "terá triplicado o faturamento" */
  rx`\b(?:dobrara|triplicara|multiplicara|aumentara|atraira|trara|gerara|elevara|impulsionara|conquistara|garantira)\s+${ART}${DE_RESULTADO}\b`,
  rx`\b(?:tera|terao|recebera|ganhara|fechara|atendera|vendera|faturara|lucrara|conseguira|vera)\s+${QUANT}${DE_RESULTADO}\b`,
  rx`\b(?:tera|terao|vai ter|vao ter)\s+(?:\w+\s+){0,1}(?:dobrado|triplicado|multiplicado|aumentado|crescido)\s+${ART}${DE_RESULTADO}\b`,
  /* presente: "o site aumenta as suas vendas", "traz mais clientes" (a descrição da função, como "gera leads" ou "aumenta o prazo", não entra) */
  rx`\b${SOBE_PRES}\s+${ART}${DE_RESULTADO}\b`,
  rx`\b${TRAZ_PRES}\s+${CL}(?:${ART}${FORTE}|${QUANT}${DE_RESULTADO})\b`,
  rx`\b(?:esta|estao)\s+(?:\w+\s+){0,1}(?:dobrando|triplicando|multiplicando|aumentando|trazendo|gerando|atraindo)\s+(?:\w+\s+){0,3}${FORTE}\b`,
  rx`\b(?:site|pagina|loja|sistema|atendente|ele|ela|isso|formato|modelo)\s+(?:\w+\s+){0,1}(?:vende|vendem|fatura|fecha)\s+(?:sozinho|sozinha|por voce|pra voce|enquanto voce dorme|24 ?h\w*|vinte e quatro horas)\b`,
  rx`\b(?:fatura|vende|lucra|converte)\s+(?:muito |bem |bastante )?mais\s+com\s+(?:esse|este|o|a|um|uma)\s+\w+`,
  /* "o faturamento vai subir", "a agenda vai lotar", "as vendas aumentam", "seu negócio vai decolar", "os pedidos vão explodir" */
  rx`\b${DO_NEGOCIO}\s+(?:\w+\s+){0,2}${LEAD}${SOBE_VERBO}\b`,
  rx`\b${DO_NEGOCIO}\s+(?:\w+\s+){0,2}(?:sobe|aumenta|cresce|dobra|dispara|explode|triplica|decola)\s+(?:\w+\s+){0,3}(?:ja|logo|no primeiro|nos primeiros|em \d+|em (?:um|uma|dois|duas|tres|quatro|cinco|seis)|todo mes|todos os meses)\b`,
  rx`\b(?:vendas|faturamento|lucros?|clientes|pedidos|contatos|movimento|procura)\s+(?:aumentam|sobem|crescem|dobram|disparam|triplicam|explodem|aumenta|sobe|cresce|dobra|dispara|triplica|explode)\b(?!\s+(?:o |a |os |as )?(?:prazo|valor|preco|custo|custos|tempo))`,
  rx`\b${LEAD}(?:lotar|encher|bombar|explodir|disparar|decolar)\b`,
  rx`\b${LEAD}(?:ficar|estar)\s+(?:\w+\s+){0,1}(?:cheio|cheia|lotad[oa]|lotando)\b`,
  rx`\b${LEAD}estar\s+(?:recebendo|vendendo|faturando|ganhando|atendendo)\s+(?:\w+\s+){0,2}${DE_RESULTADO}\s+(?:o dia (?:todo|inteiro)|toda hora|sem parar|todos os dias)\b`,
  rx`\b(?:telefone|whatsapp|caixa|agenda)\s+(?:\w+\s+){0,2}nao parar de (?:tocar|apitar|chegar|encher)\b`,
  rx`\b(?:consegue|conseguimos|conseguem|consigo)\s+${SOBE_INF}\s+${ART}${DE_RESULTADO}\b`,
  rx`\bcolocar\s+(?:\w+\s+){0,1}(?:a frente|na frente)\s+d[eo]\s+(?:todo mundo|todos|qualquer)\b`,
  rx`\b${TRAZ_PRES}\s+(?:bons |otimos |excelentes |muitos |mais |grandes |rapidos )?resultados?\b(?!\s+(?:da|do|das|dos)\b)`,
  rx`\bclientes\s+(?:\w+\s+){0,1}(?:vai|vao|ira|irao)\s+${ADV}(?:(?:comecar a )?(?:comprar|ligar)|surgir|fechar|lotar|encher|nao parar|chegar (?:sozinhos|aos montes|de todo lado|(?:\w+\s+){0,2}(?:pelo|pelas|via) (?:google|buscas|internet)))\b`,
  rx`\b${LEAD}dar certo\b`,
  /* famílias de jeito de dizer que a medição independente mostrou faltar */
  rx`\b${LEAD}fazer\s+(?:(?!(?:para|pra|a|de|que|se)\s)\w+\s+){1,4}(?:ganhar|receber|ter|atrair|fechar)\s+${QUANT}${DE_RESULTADO}\b`,
  rx`\bchegar\s+(?:cliente|clientes|pedidos|gente|contatos)\s+(?:de todo lado|aos montes|todo dia|toda hora)\b`,
  rx`\bvender\s+(?:por|pra)\s+voce\s+enquanto\s+voce\b`,
  rx`\b(?:investimento|site|pagina|negocio)\s+(?:\w+\s+){0,2}${LEAD}(?:se )?pagar\b`,
  rx`\b(?:explosao|enxurrada|avalanche|onda|chuva)\s+de\s+${DE_RESULTADO}\b`,
  rx`\b${LEAD}(?:\w+\s+){0,3}(?:escolher|preferir|procurar|contratar)\s+(?:\w+\s+){0,3}(?:no lugar d[eo]s?|em vez d[eo]s?)\s+(?:outros|concorrentes|concorrencia|demais)\b`,
  rx`\b(?:maquina|fabrica|motor|ima)\s+de\s+(?:gerar|atrair|trazer|vender|captar|fechar)\b`,
  rx`\b(?:muita gente|muitos clientes|varias pessoas|muitas pessoas|todo mundo)\s+(?:\w+\s+){0,1}(?:vai|vao)\s+${ADV}(?:pedir|procurar|ligar|chamar|comprar|contratar|entrar em contato|fechar)\b`,
  rx`\b(?:estara|esta|vai estar|vao estar)\s+(?:\w+\s+){0,1}(?:dando|gerando|trazendo|rendendo)\s+(?:\w+\s+){0,1}(?:lucro|retorno|resultado|dinheiro)\b`,
  rx`\b${LEAD}ser\s+(?:encontrad[oa]|visto|vista|procurad[oa]|conhecid[oa]|visitad[oa])\s+(?:\w+\s+){0,2}(?:muito mais|mais|milhares|centenas)\s+(?:de\s+)?(?:gente|pessoas|clientes)\b`,
  /* o Google: "primeiro lugar no Google", "no topo das buscas", "na primeira página do Google", "vai aparecer no Google", "vai ranquear bem" */
  rx`\b(?:primeiro lugar|1 lugar|primeira posicao|primeira pagina|topo|top 1|top 3|numero 1|numero um|primeiras posicoes|em primeiro)\s+(?:\w+\s+){0,3}(?:google|buscas?|pesquisas?|buscador)\b`,
  rx`\b(?:google|buscas?|pesquisas?)\s+(?:\w+\s+){0,3}(?:primeiro lugar|primeira pagina|topo|primeira posicao)\b`,
  rx`\b(?:primeiros?|primeiras)\s+d[oa]s?\s+(?:google|buscas?|pesquisas?)\b`,
  rx`\b(?:pedidos|clientes|contatos|ligacoes|orcamentos)\s+(?:\w+\s+){0,1}(?:vao|vai)\s+(?:\w+\s+){0,2}(?:chegar|entrar|aparecer|pingar|cair)\s+(?:\w+\s+){0,5}(?:sem parar|o dia todo|o dia inteiro|toda hora)\b`,
  rx`\b${LEAD}(?:ranquear|rankear|posicionar)\b`,
  rx`\b${LEAD}(?:aparecer|ficar|estar|chegar)\s+(?:\w+\s+){0,3}(?:bem|melhor|sempre)\s+(?:\w+\s+){0,2}(?:no|nas|na|nos)\s+(?:google|buscas?|pesquisas?|primeira pagina)\b`,
  rx`\b${LEAD}aparecer\s+(?:\w+\s+){0,2}(?:no|nas|na)\s+(?:google|buscas?|pesquisas?)\b`,
  rx`\b(?:aparece|aparecem)\s+(?:\w+\s+){0,2}(?:no|nas|na)\s+(?:google|buscas?|pesquisas?)\s+(?:rapido|rapidinho|rapidamente|logo|ja|em (?:poucos|poucas|\d+|um|uma|dois|duas|tres) \w+)\b`,
  rx`\b${LEAD}(?:\w+\s+){0,2}(?:ficar|estar|aparecer|chegar|ir)\s+(?:\w+\s+){0,2}(?:na|a)\s+primeira\s+(?:pagina|posicao)\b`,
  rx`\b(?:pessoas|clientes|gente|todos|quem busca)\s+(?:\w+\s+){0,1}(?:vai|vao)\s+(?:te |lhe |o |a )?(?:encontrar|achar)\s+(?:\w+\s+){0,2}(?:no|nas|pelo|pelas)\s+(?:google|buscas?|buscador|pesquisas?)\b`,
  /* retorno do investimento: "em 30 dias você já terá o retorno", "o investimento volta", "o site se paga em dois meses" */
  rx`\b(?:tera|vai ter|terao|vera|vai ver|recupera\w*|vai recuperar|recebe|recebera)\s+(?:\w+\s+){0,3}retorno\s+(?:do|de|sobre)\s+(?:o |seu |um )?investimento\b`,
  rx`\b(?:investimento|site|negocio|pagina)\s+(?:\w+\s+){0,1}(?:se paga|se pagara|se pagam|volta|retorna)\b`,
  rx`\bpaga a si mesm[oa]\b`,
  rx`\b${LEAD}recuperar\s+(?:\w+\s+){0,2}investimento\b`,
  /* "vai ver o movimento aumentar", "vai fazer as vendas decolarem", "vai fazer você faturar o dobro" */
  rx`\b${LEAD}(?:ver|notar|sentir|perceber|fazer)\s+(?:\w+\s+){0,1}${ART}${DO_NEGOCIO}\s+(?:aumentar|crescer|subir|dobrar|triplicar|multiplicar|disparar|explodir|decolar|bombar)\w*\b`,
  rx`\b${LEAD}(?:(?!(?:para|pra|a|de|que|se)\s)\w+\s+){0,3}(?:faturar|vender|lucrar|ganhar)\s+(?:o dobro|o triplo|muito mais|bem mais)\b`,
  rx`\b(?:resultados?|vendas|clientes|retorno)\s+(?:\w+\s+){0,1}(?:aparecem|chegam|surgem|aparece|chega|surge|vem|voltam|volta)\s+(?:\w+\s+){0,3}(?:rapido|logo|semanas?|dias|meses|mes)\b`,
  /* se destacar da concorrência, passar na frente, deixar para trás */
  rx`\b${LEAD}(?:se )?(?:destacar|diferenciar|sobressair)\s+(?:\w+\s+){0,3}(?:concorrencia|concorrentes|mercado)\b`,
  rx`\b${CONCORRENTE}\s+(?:\w+\s+){0,4}(?:vao|vai|ira|irao)\s+(?:\w+\s+){0,1}(?:ficar|ficarao)\s+(?:\w+\s+){0,1}(?:para tras|atras|na poeira|no chinelo|pra tras)\b`,
  rx`\b(?:vai|vao|vamos|ira|irao)\s+(?:\w+\s+){0,2}(?:deixar|passar|ultrapassar|superar|bater|esmagar|derrotar|vencer|humilhar|colocar|botar)\s+(?:\w+\s+){0,7}${CONCORRENTE}\b`,
  rx`\b(?:vai|vao|ira|irao)\s+(?:\w+\s+){0,2}(?:ficar|estar)\s+(?:na frente|a frente)\s+d[aoe]s?\s+(?:\w+\s+){0,1}${CONCORRENTE}\b`,
  /* garantido: "resultado garantido", "vendas garantidas", "o retorno é certo", "garanto mais clientes", "garantimos que o faturamento vai crescer" */
  rx`\b(?:resultados?|retorno|lucros?|sucesso|vendas|clientes|faturamento|pedidos|contatos|crescimento|aumento)\s+(?:\w+\s+){0,3}(?:garantid[oa]s?|assegurad[oa]s?)\b`,
  rx`\b(?:resultados?|retorno|lucros?|sucesso)\s+(?:e|sao|esta|estao|sera|serao)\s+(?:certo|certa|certos|certas)\b`,
  rx`\b${GARANTE}\s+(?:te\s+|lhe\s+)?(?:${ART}(?:${FORTE}|resultado|retorno|lucro|sucesso|aumento|crescimento)|${QUANT}${DE_RESULTADO})\b`,
  rx`\b${GARANTE}\s+que\s+(?:\w+\s+){0,5}(?:vai|vao|ira|irao|va)\s+(?:\w+\s+){0,3}(?:crescer|subir|aumentar|dobrar|vender|faturar|lucrar|atrair|trazer|aparecer|dar certo|encher|lotar|bombar|decolar)\b`,
  rx`\b${GARANTE}\s+que\s+(?:voce|vc|seu \w+|sua \w+|o site|a pagina)\s+(?:\w+\s+){0,1}(?:aparece|vende|cresce|fatura|lucra)\b`,
  rx`\b${GARANTE}\s+\d+ ?%? de certeza\b`,
  rx`\b(?:e|sera|com|tem|temos|dou|damos|oferecemos|inclui)\s+(?:\w+\s+){0,1}garantia de\s+(?:${QUANT}|${ART})${DE_RESULTADO}\b`,
  /* os números: "50% mais clientes", "vinte por cento mais clientes", "converte cinco vezes mais", "aumento de 40% nas vendas" */
  rx`\b${NUM}\s+(?:de\s+)?(?:\w+\s+){0,1}mais\s+(?:\w+\s+){0,1}${DE_RESULTADO}\b`,
  rx`\baumento\s+de\s+${NUM}\s+(?:\w+\s+){0,2}${DE_RESULTADO}\b`,
  rx`\b(?:converte|vende|rende|traz|gera|atrai|fatura|cresce|aumenta|sobe|dobra)\w*\s+(?:\w+\s+){0,2}${NUM}\s+(?:\w+\s+)?mais\b`
];

/* o dado inventado sobre os clientes da Beyon (ela não tem casos publicados). Fora do filtro de possibilidade: "ajudamos dezenas de
   empresas" é afirmação mesmo com o verbo "ajudar"; a negação ("não atendemos dezenas de clientes") continua valendo */
const SATISF = '(?:satisfeit\\w+|feliz|felizes|encantad\\w+|contentes?)';
const RAMOS = '(?:clientes|empresas|negocios|clinicas|restaurantes|dentistas|advogados|lojas|escritorios|saloes|academias|oficinas|empreendedores|profissionais|varias|diversas|muitos|muitas|dezenas|centenas)';
const DADO_INVENTADO = [
  rx`\b(?:nossos|nossas) (?:\w+ ){0,1}clientes\s+(?:\w+\s+){0,5}(?:cresc\w+|aument\w+|dobr\w+|triplic\w+|multiplic\w+|vendem|venderam|vend\w+ mais|fatur\w+|lucr\w+|ganh\w+ (?:\w+ ){0,1}(?:dinheiro|clientes|vendas|mais|visibilidade|destaque)|conquist\w+|bateram|superaram|tiveram (?:\w+ ){0,1}(?:resultado\w*|retorno|aumento|crescimento|sucesso)|tem (?:\w+ ){0,1}(?:resultado\w*|retorno|sucesso)|(?:sairam|ficaram|estao|ficam|saem) (?:\w+ ){0,1}${SATISF}|amam|adoram|aprovam|recomendam|elogiam|indicam)\b`,
  rx`\b(?:clientes da beyon|clientes da beyon zero|quem ja (?:fez|fechou|contratou) (?:\w+ ){0,2}(?:com a gente|conosco|com a beyon)|todo cliente nosso|cada cliente nosso)\s+(?:\w+\s+){0,4}(?:cresc\w+|aument\w+|dobr\w+|triplic\w+|multiplic\w+|vendem|venderam|vend\w+ mais|fatur\w+|lucr\w+|conquist\w+|tiveram (?:\w+ ){0,1}(?:resultado\w*|retorno|aumento|crescimento|sucesso)|(?:ficam|ficaram|estao) (?:\w+ ){0,1}${SATISF})\b`,
  rx`\b(?:fizemos|ajudamos|entregamos|atendemos|criamos|produzimos|desenvolvemos|montamos|publicamos|fechamos|temos|tivemos)\s+(?:\w+\s+){0,1}?(?:\d+|dezenas|centenas|milhares|dezena|centena|varios|diversos|muitos|muitas|mais de \w+)\s+(?:de\s+)?(?:\w+\s+){0,1}(?:sites?|clientes?|projetos?|empresas|negocios|empreendedores|marcas|lojas)\b`,
  rx`\b(?:fizemos|fiz|criamos|entregamos|produzimos|desenvolvemos|montamos|publicamos)\s+(?:\w+\s+){0,1}(?:sites?|paginas|projetos)\s+(?:para|de|pra)\s+(?:\w+\s+){0,1}${RAMOS}\b`,
  rx`\b(?:atendemos|atendi|ajudamos|ajudei|trabalhamos com|trabalhei com)\s+(?:\w+\s+){0,2}${RAMOS}\b`,
  rx`\b(?:temos|tivemos|tenho|tive)\s+(?:\w+\s+){0,2}(?:casos?|cases?|exemplos?|historias?|clientes?)\s+(?:\w+\s+){0,2}(?:de sucesso|que (?:dobraram|cresceram|aumentaram|triplicaram|venderam|faturaram|multiplicaram)|${SATISF})\b`,
  rx`\bclientes que (?:atendemos|temos|ja atendemos|ja fizemos)\s+(?:\w+\s+){0,2}(?:recomend\w+|ador\w+|aprov\w+|gost\w+|indic\w+|elogi\w+)\b`,
  rx`\b(?:temos|tenho|tivemos)\s+(?:\w+\s+){0,1}(?:depoimentos|avaliacoes|cases|casos|portfolio)\b`,
  rx`\btodos\s+(?:\w+\s+){0,1}(?:ficam|ficaram|estao|saem|sairam)\s+(?:muito |bem |super )?${SATISF}\b`
];
/* nega no texto e afirma no sentido (por isso fica fora do teste de negação): só a crítica ao mercado salva. O primeiro é dado inventado */
const AFIRMA_NEGANDO_DADO = [
  rx`\bnenhum\w*\s+(?:\w+\s+){0,4}(?:deixou|deixa|deixam|deixaram|ficou|fica)\s+(?:\w+\s+){0,1}(?:de crescer|de vender|de faturar|de lucrar|sem (?:resultado|retorno|cliente|venda)|no prejuizo|insatisfeit\w+)\b`
];
const AFIRMA_NEGANDO = [
  rx`\bninguem\s+(?:\w+\s+){0,2}(?:vai|vao|ira|fica|ficara)\s+(?:\w+\s+){0,1}(?:ficar\s+)?(?:para tras|atras|de fora|na mao)\b`,
  rx`\b(?:voce|seu \w+|sua \w+)\s+(?:\w+\s+){0,1}nao\s+(?:vai\s+|vao\s+)?ficar\s+(?:para tras|atras)\b`,
  rx`\bnao\s+(?:vai\s+|vao\s+|ira\s+)?(?:ficar|fica|ficam)\s+sem\s+(?:cliente\w*|venda\w*|resultado\w*|pedido\w*|movimento)\b`,
  rx`\bnao\s+(?:vai\s+|vao\s+|ira\s+)?(?:perder|perde|perdem)\s+(?:\w+\s+){0,1}(?:cliente\w*|venda\w*)\b`,
  rx`\bnao tem como (?:nao )?(?:vender|crescer|dar certo|dar errado|funcionar)\b`,
  rx`\bnunca mais\s+(?:vai\s+|vao\s+)?(?:ficar|fica)\s+sem\s+(?:cliente\w*|venda\w*|pedido\w*|movimento)\b`,
  rx`\b(?:nunca|jamais)\s+(?:vai|vao|ira)\s+(?:\w+\s+){0,1}deixar de\s+(?:trazer|vender|dar|render|crescer|funcionar|atrair|gerar|dobrar)\b`
];
/* inglês e espanhol (conjunto pequeno e conservador: o Zero fala português; idioma é furo conhecido e o prompt é a defesa) */
const OUTRO_IDIOMA_NEGA = /\b(?:not|never|cannot|cant|don t|dont|no|sin|nunca|ni)\b/;
const PROMESSAS_OUTRO_IDIOMA = [
  rx`\bwill\s+(?:\w+\s+){0,2}(?:double|triple|quadruple|boost|increase|multiply|grow|bring|get|generate|attract)\b[^]{0,30}\b(?:sales|customers|clients|revenue|leads|profit|profits|traffic|business)\b`,
  rx`\bguaranteed\s+(?:results?|sales|success|roi|customers|clients|income|returns?)\b`,
  rx`\bwe\s+(?:guarantee|promise)\b`,
  rx`\b(?:va|vas|vamos)\s+a\s+(?:duplicar|triplicar|aumentar|multiplicar|traer|generar|conseguir|atraer)\b[^]{0,30}\b(?:ventas|clientes|ingresos|resultados)\b`,
  rx`\b(?:garantizo|garantizamos|aseguro|aseguramos)\b`
];

function classeDaOracao(m, ctx = '') {
  if (afirmaNegando(m, AFIRMA_NEGANDO_DADO)) return 'dado';
  if (promessasEm(m, DADO_INVENTADO, { hedge: false, ctx })) return 'dado';
  if (afirmaNegando(m, AFIRMA_NEGANDO)) return 'resultado';
  if (promessasEm(m, PROMESSAS_DE_RESULTADO, { ctx })) return 'resultado';
  return null;
}
const GARANTIDO_SOZINHO = /^(?:\w+ ){0,2}(?:garantid[oa]s?|assegurad[oa]s?)$/;
const REFORCO_SOZINHO = /^(?:pode apostar|pode ter certeza|tenho certeza|com certeza|certeza|sem duvida)$/;
const TEM_RESULTADO = new RegExp('\\b' + DE_RESULTADO + '\\b');
const MAIS_RESULTADO = new RegExp('^mais\\s+(?:\\w+\\s+){0,1}' + DE_RESULTADO + '\\b');
function classeDaFrase(crua) {
  let achada = null;
  for (const v of variantes(crua)) {
    const ors = oracoes(v);
    for (let i = 0; i < ors.length; i++) {
      const curtas = [ors[i - 2], ors[i - 1]].filter((o, k, a) => o && o.split(' ').length <= 3 && (k === a.length - 1 || a[k + 1].split(' ').length <= 3));
      const c = classeDaOracao(ors[i], curtas.join(' '));
      if (c === 'dado') return 'dado';
      if (c) achada = c;
      /* "É garantido: mais pedidos todo mês." / "Pode apostar: mais clientes todo mês.": o reforço sozinho vale com o resultado da oração vizinha */
      const vizinhas = [ors[i - 1], ors[i + 1]];
      const valida = (V, exige) => V && tem(exige, V) && !NEGA_PERTO.test(limpa(V)) && !HEDGE_PERTO.test(V);
      if (GARANTIDO_SOZINHO.test(ors[i]) && !NEGA_PERTO.test(ors[i]) && vizinhas.some(V => valida(V, TEM_RESULTADO))) achada = achada || 'resultado';
      if (REFORCO_SOZINHO.test(ors[i]) && vizinhas.some(V => valida(V, MAIS_RESULTADO))) achada = achada || 'resultado';
    }
    const inteiro = v.replace(SEP_G, ' ');
    if (!OUTRO_IDIOMA_NEGA.test(inteiro) && PROMESSAS_OUTRO_IDIOMA.some(re => tem(re, inteiro))) achada = achada || 'resultado';
  }
  return achada;
}
/* a pergunta só promete se a frase seguinte a confirma ("Vai trazer mais clientes? Vai sim.") ou se for retórica ("..., certo?") */
const CONFIRMA = /^(?:sim|claro|certamente|garantido|garanto|exato|exatamente|isso mesmo|com (?:toda )?certeza|sem duvida|a resposta e sim|e sim|tenho certeza|pode (?:apostar|confiar|ter certeza|acreditar)|vai|vao|traz|trazem|fica|tem|temos|damos|oferecemos|dobra|aumenta|sobe|incluso|inclusa)\b/;
const confirma = prox => CONFIRMA.test(prox) && !NEGA_PERTO.test(ultimas(limpa(prox), 5));
const FIXO_DA_CLASSE = { dado: DADO_FIXO, resultado: RESULTADO_FIXO };
function decidirResultado(frases, i) {
  const classe = classeDaFrase(frases[i]);
  if (!classe) return null;
  const fixo = FIXO_DA_CLASSE[classe];
  if (!ehPergunta(frases[i]) || eRetorica(frases[i])) return { n: 1, fixo };
  if (i + 1 >= frases.length) return null;
  return confirma(paraBusca(frases[i + 1])) ? { n: 2, fixo } : null;
}
export function semPromessaDeResultado(texto) {
  return trocarFrases(texto, decidirResultado);
}

/* ---------- 2. garantia ---------- */
const PRAZO_G = '(?:\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|doze|vinte|trinta|noventa|cem)\\s+(?:dias?|semanas?|meses|mes|anos?)';
const OFERTA = '(?:tem|temos|tenho|ha|existe|dou|damos|dar|oferec\\w+|inclu\\w+|incluimos|vem com|vai com|com|possui\\w*|possuimos|conta com|cobre|cobrem|coberto|cobertura)';
/* ("devolver" sozinho é verbo comum: "a estimativa devolveu 8 dias"; só vale com o dinheiro como objeto. Reembolso, estorno e ressarcimento são sempre dinheiro) */
const DINHEIRO = '(?:dinheiro|valor|entrada|sinal|pagamento|quantia|reais|tudo|total|integral|resto|restante|100|o que voce pagou)';
const PROMESSAS_DE_GARANTIA = [
  /* o substantivo, afirmado: "garantia de 12 meses", "tem garantia", "garantia total", "nossa garantia é de 6 meses" */
  rx`\bgarantia\s+(?:\w+\s+){0,1}(?:de|por|ate)\s+${PRAZO_G}\b`,
  rx`\b${PRAZO_G}\s+de\s+garantia\b`,
  /* (só os adjetivos de oferta; "garantia de satisfação/resultado" sozinha pode ser o assunto de uma recusa e só vale com o verbo de oferta) */
  rx`\bgarantia\s+(?:total|estendida|vitalicia|incondicional)\b`,
  rx`\b${OFERTA}\s+(?:\w+\s+){0,3}garantia\b`,
  rx`\bgarantia\s+(?:\w+\s+){0,2}(?:inclus[oa]|incluida|gratis|gratuita|cobre|cobrem|vale|valida)\b`,
  rx`\bgarantia\s+(?:\w+\s+){0,4}?(?:e|sera|fica)\s+de\s+${PRAZO_G}\b`,
  rx`\bgarantia de (?:satisfacao|reembolso|resultados?|qualidade)\s+ou\b`,
  rx`\bgarantia\s+(?:e|sera|fica)\s+(?:total|estendida|vitalicia|incondicional|completa|integral)\b`,
  rx`\bgarantia\s+${PRAZO_G}\b`,
  /* a frase nominal curta, sem negação: "Garantia de satisfação." (mas "Garantia de resultado ninguém dá" é recusa) */
  rx`^garantia de (?:satisfacao|qualidade|funcionamento|resultados?|reembolso)\b(?: (?!(?:nao|nunca|ninguem|jamais|nem)\b)${W}){0,3}$`,
  rx`\bcobertura\s+(?:total|completa|integral)\s+(?:por|de)\s+${PRAZO_G}\b`,
  rx`\b(?:site|servico|trabalho|projeto|produto)\s+(?:(?:e|esta|sera|fica)\s+(?:totalmente |100 ?%? )?)?garantid[oa]\b`,
  /* o verbo e o adjetivo: "garantimos a sua satisfação", "garantimos que você vai gostar", "qualidade garantida" */
  rx`\b${GARANTE}\s+(?:\w+\s+){0,2}(?:satisfacao|qualidade|funcionamento|perfeito|perfeicao|aprovacao|reembolso|devolucao|dinheiro)\b`,
  rx`\b${GARANTE}\s+que\s+(?:voce|vc|ele|a pessoa)\s+(?:vai|va|ira)\s+(?:gostar|adorar|amar|aprovar|ficar (?:satisfeit\w+|feliz|encantad\w+|contente))\b`,
  rx`\b${GARANTE}\s+que\s+(?:o site|seu site|tudo)\s+(?:vai|va|ira|vao)\s+(?:funcionar|dar certo|ficar (?:perfeit\w+|lind\w+|incrivel))\b`,
  rx`\b(?:satisfacao|qualidade|funcionamento|reembolso|devolucao|dinheiro de volta)\s+(?:\w+\s+){0,1}garantid[oa]s?\b`,
  rx`\b100 ?%? (?:de )?(?:garantid\w+|satisfeit\w+|satisfacao)\b`,
  rx`\b(?:risco zero|zero risco|sem risco(?: nenhum)?)\b`
];
/* devolver o dinheiro: só vale a forma exata da empresa (7 dias para desistir; devolução se a Beyon atrasar), tirada antes por mascarar() */
const ENTRADA = '(?:(?:devolv\\w+|devolucao d[ao])\\s+(?:(?:o |a )?(?:valor|dinheiro) d[ae]\\s+)?(?:a |o |sua |seu |toda a |todo o )?(?:entrada|sinal)(?: inteir[ao]| toda| total| integral)?(?:\\s+e\\s+(?:o |a )?(?:entrada|sinal))?|(?:recebe\\w*|receber|ter|tem|tera)\\s+(?:de volta\\s+)?(?:(?:o |a )?(?:valor|dinheiro) d[ae]\\s+)?(?:a |sua |toda a )?entrada(?: inteir[ao]| toda)?(?: de volta)?|(?:a |sua |toda a |o )?(?:entrada|sinal)(?: de \\d+ ?%)?(?: inteir[ao])? (?:volta|retorna|e devolvid[ao]|sera devolvid[ao]|devolvid[ao]|de volta)(?: inteir[ao])?)';
const TUDO_DE_VOLTA = '(?:devolv\\w+\\s+(?:o |todo o |tudo o |toda a )?(?:tudo|dinheiro|valor|que voce pagou)|recebe\\w*\\s+(?:de volta\\s+)?(?:tudo|todo o (?:valor|dinheiro)|o dinheiro|o valor)(?: de volta)?)';
const DES7 = '(?:(?:voce )?(?:tem|tera|pode|podera|possui) )?(?:(?:ate|em ate|dentro d[eo]s?) )?(?:7|sete) dias(?: de garantia(?: legal)?)? (?:para|pra) (?:voce |vc )?(?:desistir|se arrepender)|desist\\w+ (?:' + W + ' ){0,4}?(?:em ate|em|dentro d[eo]s?|ate) (?:7|sete) dias';
const ATRASO = '(?:atras\\w+|nao entreg\\w+|nao cumpr\\w+)(?: a entrega| o prazo| no prazo(?: combinado)?| do prazo)?';
const FOLGA = '(?:(?!(?:devolv|reembols|dinheiro|tudo|todo|gost|satisf|qualquer|quiser|momento|depois|mesmo|alem|apos|\\d{2,}))' + W + ' ){0,8}';
const MASCARAS = [
  rx`\b(?:${DES7}) ${FOLGA}(?:${ENTRADA}|${TUDO_DE_VOLTA})`,
  rx`\b(?:${ENTRADA}|${TUDO_DE_VOLTA}) ${FOLGA}(?:${DES7})`,
  rx`\b(?:se |caso |quando )?(?:a gente |nos |a beyon |eu )?${ATRASO} ${FOLGA}${ENTRADA}`,
  rx`\b${ENTRADA} ${FOLGA}(?:se |caso |quando )?(?:a gente |nos |a beyon |eu )?${ATRASO}`,
  /* por último: dizer só que há 7 dias para desistir é a verdade (o que vem junto e não é a entrada de volta continua sendo olhado) */
  rx`\b(?:${DES7})`
];
const mascarar = norm => MASCARAS.reduce((t, re) => t.replace(re, ' ' + SEP + ' '), norm);
/* o que a empresa NÃO diz: outro prazo, "a qualquer momento", "quando quiser", "não gostou, não paga", "refaz sem custo" */
const NAO_GOSTAR = '(?:nao\\s+(?:gostar|gostou|gosta|ficar (?:satisfeit\\w+|bom|bem|do jeito (?:que )?(?:voce )?(?:quer|queria|gosta))|agradar|aprovar|servir|funcionar|atender|resolver))';
const PROMESSAS_DE_REEMBOLSO = [
  rx`\b(?:reembols\w+|estorn\w+|ressarc\w+)\b`,
  rx`\b(?:devolv\w+|devolucao)\s+(?:\w+\s+){0,3}${DINHEIRO}\b`,
  rx`\bdinheiro (?:de volta|volta)\b`,
  rx`\bvolta (?:o |seu )?dinheiro\b`,
  rx`\bvalor (?:de volta|volta)\b`,
  rx`\btudo de volta\b`,
  rx`\b${TUDO_DE_VOLTA}`,
  rx`\b${ENTRADA}`,
  /* outro prazo de desistência, "a qualquer momento", "quando quiser" */
  rx`\b(?!(?:7|sete) dias)(?:\d+|${NUMW}) (?:dias|semanas|meses|mes|anos?) (?:para|pra) (?:desistir|se arrepender|testar|experimentar|cancelar|pedir (?:reembolso|devolucao|o dinheiro))\b`,
  rx`\b(?:desist\w+|cancel\w+|arrepend\w+)\s+(?:${W}\s+){0,4}?(?:em|ate|dentro d[eo]s?|nos?)\s+(?:ate\s+)?(?!(?:7|sete) dias)(?:\d+|${NUMW})\s+(?:dias|semanas|meses|anos?)\b`,
  rx`\b(?:desist\w+|cancel\w+)\s+(?:${W}\s+){0,3}?(?:a qualquer (?:momento|hora)|em qualquer (?:momento|hora)|quando (?:voce )?quiser)\b`,
  rx`\bcancelamento a qualquer (?:momento|hora)\b`,
  rx`\b(?:consert\w+|corrig\w+|ajust\w+|refaz\w*|refazemos|manutencao|correcao)\b[^]{0,25}?\b(?:de graca|gratis|gratuit\w+|sem custo|sem cobrar)\b[^]{0,25}?\b(?:\d+|${NUMW}) (?:dias|meses|mes|anos?)\b`
];
/* promessas condicionais que atravessam a vírgula ("se não gostar, não paga", "você não paga nada se não gostar", "se não funcionar, a gente refaz sem custo"):
   olhadas na frase inteira, sem o filtro de negação (o \"não\" faz parte da promessa). \"não gostar dos modelos\" é antes de pagar: verdade */
const SEM_PAGAR = '(?:nao paga\\w*|nao precisa pagar|nao cobramos|nao cobra|nao ha custo|nao tem custo|nao devolve nada|(?:a gente |nos )?(?:refaz\\w*|refazemos|refaco)|sem custo|de graca)';
const PROMESSAS_CONDICIONAIS = [
  rx`\b(?:se|caso)\s+(?:${W}\s+){0,3}?${NAO_GOSTAR}\b(?!\s+(?:${W}\s+){0,2}?(?:modelos|previas?|propostas|opcoes|rascunhos|layouts))(?:\s+${W}){0,4}?\s+(?:voce\s+)?${SEM_PAGAR}\b`,
  rx`\b(?:nao paga\w*|nao precisa pagar|nao cobramos)\s+(?:nada\s+)?(?:${W}\s+){0,2}?(?:se|caso)\s+(?:${W}\s+){0,3}?${NAO_GOSTAR}\b(?!\s+(?:${W}\s+){0,2}?(?:modelos|previas?|propostas|opcoes|rascunhos|layouts))`
];
/* o reembolso dos clientes DELE ("o reembolso dos seus clientes na sua loja") e o "devolveu o valor" da ferramenta de preço não são promessa nossa */
const REEMBOLSO_DO_CLIENTE = /\b(?:de|dos|das|aos|para os) (?:seus|suas) (?:clientes|alunos|pacientes|compradores|consumidores|fregueses)\b|\b(?:da|na|de) sua (?:loja|empresa|clinica|oficina|academia|escola)\b|\b(?:do|no|de) seu (?:negocio|comercio|restaurante|consultorio|escritorio)\b/;
const REEMBOLSO_DE_FERRAMENTA = /\b(?:ferramenta|estimativa|tabela|sistema|calculo|motor|resumo|tela|cartao|simulacao)\b/;
/* a garantia do negócio do CLIENTE é lista FECHADA do que é dele; todo o resto ("seu pedido", "sua compra", "seu atendimento") é nosso e corta */
const CLI_N = '(?:loja|lojas|empresa|empresas|negocio|negocios|produtos?|servicos?|marca|clinica|restaurante|oficina|consultorio|escritorio|comercio|salao|academia|fabricante|fornecedor|equipamentos?|pecas?|moveis|mercadorias?|clientes?|alunos?|pacientes?|marcenaria|padaria)';
const POSS = '(?:sua|seu|suas|seus)';
const GARANTIA_DO_CLIENTE = [
  rx`\bgarantia\s+(?:${W}\s+){0,2}(?:d[aoe]s?|n[aoe]s?|em|para|pra)\s+(?:${W}\s+){0,1}${POSS}\s+(?:${W}\s+){0,1}?${CLI_N}\b`,
  rx`\b${POSS}\s+(?:${W}\s+){0,1}?${CLI_N}\s+(?:${W}\s+){0,2}?(?:tem|oferece|da|inclui|possui|vem com|conta com|dao|oferecem)\s+(?:${W}\s+){0,2}garantia`,
  rx`\bgarantia\s+(?:${W}\s+){0,1}(?:d[oa]s?|n[ao]s?)\s+(?:os |as |o |a )?(?:moveis|produtos?|pecas?|servicos?|equipamentos?|mercadorias?|fabricante|fornecedor)\b`,
  rx`\bvoce\s+(?:${W}\s+){0,1}(?:oferece|oferecem|presta|prestam|concede|da|dao)\b[^]{0,30}garantia`,
  rx`\bgarantia\s+(?:${W}\s+){0,2}voce\s+(?:oferece|presta|da|concede)\b`,
  rx`\bgarantia (?:do|da) (?:fabricante|fornecedor|loja)\b`
];
const PRIMEIRA_PESSOA = /\b(?:damos|dou|oferecemos|ofereco|temos|tenho|incluimos|garantimos|garanto|nossa|nosso|nossos|nossas|a gente|beyon)\b/;
const doCliente = m => !PRIMEIRA_PESSOA.test(m) && GARANTIA_DO_CLIENTE.some(re => tem(re, m));
/* "se você não gostar, devolvemos": o "não" da condição não nega a promessa */
const NAO_CONDICIONAL = /\b(se|caso)\s+(?:(?:voce|vc|ele|ela|a pessoa|o cliente|algo|tudo|ficar|isso|o site|a gente)\s+){0,2}nao\b/g;
const negadoAntesG = antes => negadoAntes(antes.replace(NAO_CONDICIONAL, '$1'));

function promessasEmG(m, lista) {
  for (const re of lista) {
    for (const x of m.matchAll(re)) {
      const antes = m.slice(0, x.index);
      const depois = m.slice(x.index + x[0].length);
      if (DEPOIS_OPERACIONAL.test(depois) || REPORTADA.test(m.slice(0, x.index + x[0].length))) continue;
      if (negadoAntesG(antes) || DEPOIS_NEGA.test(depois)) continue;
      return true;
    }
  }
  return false;
}
function oracaoPrometeGarantia(m) {
  if (!doCliente(m) && promessasEmG(m, PROMESSAS_DE_GARANTIA)) return true;
  if (REEMBOLSO_DO_CLIENTE.test(m) || REEMBOLSO_DE_FERRAMENTA.test(m)) return false;
  return promessasEmG(m, PROMESSAS_DE_REEMBOLSO);
}
const PROMESSAS_GARANTIA_OUTRO_IDIOMA = [
  rx`\bmoney[ -]?back\b`,
  rx`\b(?:\d+|one|two|three|six|twelve)[ -]months?\s+(?:warranty|guarantee)\b`,
  rx`\bwe\s+(?:offer|give|provide)\b[^]{0,20}\b(?:warranty|guarantee)\b`,
  rx`\bsatisfaction\s+guaranteed\b|\b100 ?%\s+satisfaction\b`
];
function frasePrometeGarantia(crua) {
  return variantes(crua).some(v => {
    if (oracoes(mascarar(v)).some(oracaoPrometeGarantia)) return true;
    const inteiro = v.replace(SEP_G, ' ');
    if (PROMESSAS_CONDICIONAIS.some(re => tem(re, inteiro))) return true;
    return !OUTRO_IDIOMA_NEGA.test(inteiro) && PROMESSAS_GARANTIA_OUTRO_IDIOMA.some(re => tem(re, inteiro));
  });
}
/* a pergunta com garantia só promete se a frase seguinte confirma ("Tem garantia? Tem sim.") ou se for retórica ("Sabia que temos garantia?") */
function decidirGarantia(frases, i) {
  const f = frases[i];
  if (!ehPergunta(f) || eRetorica(f)) return frasePrometeGarantia(f) ? { n: 1, fixo: GARANTIA_FIXO } : null;
  const q = paraBusca(f);
  if (i + 1 >= frases.length || !/\bgarantia\b/.test(q) || doCliente(q)) return null;
  const prox = paraBusca(frases[i + 1]);
  return confirma(prox) && !/\b(?:desist\w*|arrepend\w*|atras\w*|(?:7|sete) dias)\b/.test(prox) ? { n: 2, fixo: GARANTIA_FIXO } : null;
}
export function semGarantia(texto) {
  return trocarFrases(texto, decidirGarantia);
}
