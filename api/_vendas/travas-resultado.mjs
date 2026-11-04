/* ==========================================================================
   TRAVAS CONTRA PROMESSA DE RESULTADO E DE GARANTIA (o Zero, consultor de IA do site de vendas).

   O prompt (consultor.mjs) já manda: "Nunca invente portfólio, depoimento, número de clientes, resultado nem posição no Google;
   não prometa mais vendas, retorno nem 'o melhor'" e "garantia: você não confirma". Mas o modelo pode escorregar numa frase
   afirmativa, e o que o Zero diz vale como promessa da empresa (CDC art. 30 e 37). Estas duas travas seguem o molde de
   travas-promessa.mjs: olham ORAÇÃO por oração, trocam só a promessa AFIRMATIVA por um texto fixo e deixam passar a negação ("não
   garanto"), a possibilidade ("pode ajudar"), a pergunta de interesse ("quer vender mais?") e o que a empresa de fato disse.

   • semPromessaDeResultado: mais clientes/vendas/faturamento, posição no Google, retorno do investimento, "resultado garantido" e o
     dado inventado sobre os clientes da Beyon ("todos os nossos clientes cresceram"; a Beyon ainda não tem casos publicados).
   • semGarantia: "garantia de N meses", "satisfação garantida", "garantimos que você vai gostar", "dinheiro de volta". NÃO corta o que
     está em condicoes.html e no prompt: 7 dias para desistir com a entrada de volta (CDC art. 49) e devolução da entrada se a Beyon
     atrasar a entrega; e não corta a garantia do negócio do cliente ("a garantia da sua loja aparece no site").

   Diferença do molde: aqui só a FRASE que promete é trocada (como em semPromessaDeRecado) e o resto da resposta fica. Num turno de
   venda o resto costuma ter o marcador do valor [[total]] e a pergunta seguinte; jogar a resposta toda fora custaria a conversa.

   FRONTEIRA "pode ajudar" x "vai trazer": o que AFIRMA o resultado (vai trazer/dobrar/vender mais, traz mais clientes, o faturamento
   vai subir) é cortado; a possibilidade (pode, poderia, ajuda a, facilita, costuma, tende a, depende) e o objetivo da pessoa passam.
   Isso vem das listas fechadas abaixo: o verbo de resultado só vale colado a um objeto de resultado (clientes, vendas...) por
   artigos e quantificadores, nunca por qualquer palavra, para "vai trazer os dados do orçamento" não ser cortado.

   LIMITE DECLARADO: é um filtro de lista, e nenhuma lista cobre todo jeito de dizer. A defesa de verdade é o prompt e a rodada com
   o modelo real. Por isso priorizam PRECISÃO: um falso positivo corta uma resposta boa. Os furos conhecidos ficam em
   docs/testes/travas-resultado-casos.mjs (FUROS_RESULTADO_CONHECIDOS), junto com os casos.
   Todas as janelas das expressões são limitadas ({0,n}): nenhuma entrada de 50 mil caracteres gera backtracking.
   ========================================================================== */
import { frasesDe, paraBusca } from './zero.mjs';
import { PONTUACAO, CONTRASTE, limpa } from './travas-promessa.mjs';

export const RESULTADO_FIXO = 'Resultado de vendas não dá para garantir, e a gente não promete isso. O que a gente faz é um site claro, para a pessoa encontrar você, entender o que você faz e decidir com tranquilidade.';
export const GARANTIA_FIXO = 'Garantia eu não consigo confirmar. O que existe está nas condições: depois de aceitar, você tem 7 dias para desistir e receber a entrada de volta, e, se a gente atrasar a entrega, devolvemos a entrada.';

/* ---------- apoio: orações e frases ---------- */
/* (o corte em e/ou é no texto CRU: no normalizado o verbo "é" viraria "e" e seria cortado). "que" NÃO corta: "não vou dizer que vai vender mais" é uma negação só */
const CORTE_MENOR = /\s(?:e|ou|pois|porque)\s/i;
function oracoesDe(frase) {
  return String(frase).split(PONTUACAO).flatMap(o => o.split(CONTRASTE)).filter(o => o.trim())
    .map(raw => ({ texto: paraBusca(raw), menores: raw.split(CORTE_MENOR).map(o => paraBusca(o)).filter(Boolean) }))
    .filter(M => M.texto);
}
const ehPergunta = f => /\?\s*$/.test(String(f).trim());

/* troca a primeira frase marcada pelo texto fixo e tira as outras marcadas; o resto da resposta fica */
function trocarFrases(texto, fixo, quantasMarca) {
  const original = String(texto ?? '');
  const frases = frasesDe(original);
  const marcadas = new Set();
  for (let i = 0; i < frases.length; i++) {
    const n = quantasMarca(frases, i);
    for (let k = 0; k < n; k++) marcadas.add(i + k);
    if (n > 1) i += n - 1;
  }
  if (!marcadas.size) return { texto: original, trocou: false };
  let jaPos = false;
  const saida = [];
  frases.forEach((f, i) => {
    if (!marcadas.has(i)) { saida.push(f); return; }
    if (jaPos) return;
    jaPos = true;
    saida.push(fixo + (/\s$/.test(f) ? f.match(/\s+$/)[0] : ''));
  });
  return { texto: saida.join('').trim(), trocou: true };
}

/* ---------- 1. promessa de resultado ---------- */
/* o que é resultado: os fortes valem com artigo ("vai trazer os clientes"); os fracos só com "mais"/quantidade ("vai trazer mais contatos") */
const FORTE = '(?:clientes|vendas|faturamento|lucros?|receitas?|conversoes|conversao|leads|retorno|roi|resultados|pacientes|alunos|fregueses|compradores)';
const FRACO = '(?:contatos|orcamentos|pedidos|visitas|visitantes|acessos|trafego|reservas|encomendas|agendamentos|consultas|matriculas|mensagens|ligacoes|seguidores|curtidas|publico|audiencia|procura|demanda|movimento|oportunidades|indicacoes|negocios|inscricoes|cadastros)';
const DE_RESULTADO = '(?:' + FORTE + '|' + FRACO + ')';
const ARTIGO = '(?:mais|muito|muitos|muitas|bem|bastante|novos|novas|varios|varias|diversos|grande|grandes|bons|otimos|excelentes|maiores|melhores|os|as|o|a|um|uns|uma|seus|suas|seu|sua|todos|todas|todo|toda|esses|essas|esse|essa|estes|estas|este|esta|\\d+%?)';
const ART = '(?:' + ARTIGO + '\\s+){0,3}';
const QUANT = '(?:(?:muito|bem|os|as|seus|suas)\\s+)?(?:(?:mais|muitos|muitas|novos|novas|varios|varias|diversos|bastante|\\d+%?)\\s+){1,2}';
const AUX = '(?:vai|vao|ira|irao|va|iremos|vamos|vou|passara a|vai passar a|vao passar a)';
const ADV = '(?:(?:ja|tambem|sim|certamente|realmente|sempre|logo|muito|bastante|ainda|so|mesmo|te|lhe|nos|facilmente|automaticamente|com certeza|de fato|rapidinho|rapido)\\s+){0,3}';
const SOBE_INF = '(?:dobrar|triplicar|quadruplicar|multiplicar|aumentar|elevar|impulsionar|turbinar|disparar|alavancar)';
const SOBE_PRES = '(?:dobra|dobram|triplica|triplicam|multiplica|multiplicam|aumenta|aumentam|eleva|elevam|impulsiona|turbina|dispara|alavanca)';
const TRAZ_INF = '(?:gerar|trazer|atrair|captar|conquistar|garantir|render|converter)';
const TRAZ_PRES = '(?:traz|trazem|atrai|atraem|gera|geram|rende|rendem|converte|convertem|garante|garantem|capta|conquista)';
const GANHA_INF = '(?:ganhar|receber|ter|fechar|atender|fazer|vender|conseguir|ver)';
const NUM = '(?:\\d+(?:[.,]\\d+)? ?%|\\d+ ?x|\\d+ vezes|(?:duas|tres|quatro|cinco|seis|sete|oito|nove|dez|vinte|cem) vezes|o dobro|o triplo|em dobro)';
/* quem "sobe, lota, bomba": os negócios e as coisas do negócio */
const DO_NEGOCIO = '(?:' + DE_RESULTADO + '|agenda|caixa|negocio|loja|empresa|clinica|consultorio|restaurante|telefone|whatsapp|salao|oficina|academia|escritorio|marca|faturamento)';
/* (a ordem importa: DADO_INVENTADO e AFIRMA_NEGANDO, mais abaixo, ficam fora do filtro de possibilidade) */
const CONCORRENTE = '(?:concorrentes?|concorrencia|rivais)';
const GARANTE = '(?:(?:posso|consigo|vou|vamos|da pra|da para)\\s+)?(?:garantir|garanto|garantimos|garante|garantem|asseguro|asseguramos|prometo|prometemos|promete|prometem)';
const R = s => new RegExp(s);

/* a promessa dita no AFIRMATIVO. Cada padrão ancora num verbo ou numa expressão e olha uma janela curta */
const PROMESSAS_DE_RESULTADO = [
  /* "vai dobrar/aumentar os clientes", "vai trazer mais contatos", "vai ganhar mais clientes", "vai vender mais" */
  R('\\b' + AUX + '\\s+' + ADV + SOBE_INF + '\\s+' + ART + DE_RESULTADO + '\\b'),
  R('\\b' + AUX + '\\s+' + ADV + TRAZ_INF + '\\s+(?:' + ART + FORTE + '|' + QUANT + DE_RESULTADO + ')\\b'),
  R('\\b' + AUX + '\\s+' + ADV + GANHA_INF + '\\s+' + QUANT + DE_RESULTADO + '\\b'),
  R('\\b' + AUX + '\\s+' + ADV + '(?:vender|faturar|lucrar|converter|crescer|render|arrecadar)\\s+(?:mais|muito|bastante|bem mais|o dobro|o triplo|dobrado|triplicado)\\b'),
  R('\\b' + AUX + '\\s+' + ADV + '(?:ganhar|faturar|lucrar)\\s+(?:mais |muito |bastante )?(?:dinheiro|grana)\\b'),
  R('\\b' + AUX + '\\s+' + ADV + 'converter\\s+(?:\\w+\\s+){0,2}em\\s+(?:clientes|vendas|compradores|pacientes)\\b'),
  /* futuro simples: "terá mais clientes", "dobrará as vendas", "terá triplicado o faturamento" */
  R('\\b(?:dobrara|triplicara|multiplicara|aumentara|atraira|trara|gerara|elevara|impulsionara|conquistara|garantira)\\s+' + ART + DE_RESULTADO + '\\b'),
  R('\\b(?:tera|terao|recebera|ganhara|fechara|atendera|vendera|faturara|lucrara|conseguira|vera)\\s+' + QUANT + DE_RESULTADO + '\\b'),
  R('\\b(?:tera|terao|vai ter|vao ter)\\s+(?:\\w+\\s+){0,1}(?:dobrado|triplicado|multiplicado|aumentado|crescido)\\s+' + ART + DE_RESULTADO + '\\b'),
  /* presente: "o site aumenta as suas vendas", "traz mais clientes" (a descrição da função, como "gera um pedido", não entra) */
  R('\\b' + SOBE_PRES + '\\s+' + ART + DE_RESULTADO + '\\b'),
  R('\\b' + TRAZ_PRES + '\\s+(?:' + ART + FORTE + '|' + QUANT + DE_RESULTADO + ')\\b'),
  /* "o faturamento vai subir", "a agenda vai lotar", "seu negócio vai decolar", "os pedidos vão explodir" */
  R('\\b' + DO_NEGOCIO + '\\s+(?:\\w+\\s+){0,2}(?:vai|vao|ira|irao)\\s+' + ADV + '(?:subir|crescer|aumentar|dobrar|triplicar|multiplicar|disparar|explodir|decolar|bombar|lotar)\\b'),
  R('\\b' + DO_NEGOCIO + '\\s+(?:\\w+\\s+){0,2}(?:sobe|aumenta|cresce|dobra|dispara|explode|triplica|decola)\\s+(?:\\w+\\s+){0,3}(?:ja|logo|no primeiro|nos primeiros|em \\d+|em (?:um|uma|dois|duas|tres|quatro|cinco|seis)|todo mes|todos os meses)\\b'),
  R('\\b' + AUX + '\\s+' + ADV + '(?:lotar|bombar|explodir|disparar|decolar)\\b'),
  R('\\bclientes\\s+(?:\\w+\\s+){0,1}(?:vai|vao|ira|irao)\\s+' + ADV + '(?:comprar|ligar|surgir|fechar|lotar|encher|nao parar|chegar (?:sozinhos|aos montes|de todo lado))\\b'),
  /* o Google: "primeiro lugar no Google", "no topo das buscas", "na primeira página do Google" */
  R('\\b(?:primeiro lugar|1 lugar|primeira posicao|primeira pagina|topo|top 1|top 3|numero 1|numero um|primeiras posicoes)\\s+(?:\\w+\\s+){0,3}(?:google|buscas?|pesquisas?|buscador)\\b'),
  R('\\b(?:google|buscas?|pesquisas?)\\s+(?:\\w+\\s+){0,3}(?:primeiro lugar|primeira pagina|topo|primeira posicao)\\b'),
  /* retorno do investimento: "em 30 dias você já terá o retorno", "o investimento volta", "o site se paga em dois meses" */
  R('\\b(?:tera|vai ter|terao|vera|vai ver|recupera\\w*|vai recuperar|recebe|recebera)\\s+(?:\\w+\\s+){0,3}retorno\\s+(?:do|de|sobre)\\s+(?:o |seu |um )?investimento\\b'),
  R('\\b(?:investimento|site|negocio|pagina)\\s+(?:\\w+\\s+){0,1}(?:se paga|se pagara|se pagam|volta|retorna)\\b'),
  R('\\bpaga a si mesm[oa]\\b'),
  R('\\b' + AUX + '\\s+' + ADV + 'recuperar\\s+(?:\\w+\\s+){0,2}investimento\\b'),
  /* "vai ver o movimento aumentar", "vai fazer as vendas decolarem", "vai fazer você faturar o dobro", "agenda cheia" */
  R('\\b' + AUX + '\\s+' + ADV + '(?:ver|notar|sentir|perceber|fazer)\\s+(?:\\w+\\s+){0,1}' + ART + DO_NEGOCIO + '\\s+(?:aumentar|crescer|subir|dobrar|triplicar|multiplicar|disparar|explodir|decolar|bombar)\\w*\\b'),
  R('\\b' + AUX + '\\s+(?:(?!(?:para|pra|a|de|que|se)\\s)\\w+\\s+){0,3}(?:faturar|vender|lucrar|ganhar)\\s+(?:o dobro|o triplo|muito mais|bem mais)\\b'),
  R('\\b' + AUX + '\\s+(?:\\w+\\s+){0,1}(?:ter|ficar com|estar com)\\s+(?:a |sua |a sua )?(?:agenda|casa|loja|caixa) (?:cheia|cheio|lotada|lotado)\\b'),
  R('\\b(?:resultados?|vendas|clientes)\\s+(?:\\w+\\s+){0,1}(?:aparecem|chegam|surgem|aparece|chega|surge)\\s+(?:\\w+\\s+){0,3}(?:rapido|logo|semanas?|dias|meses|mes)\\b'),
  /* garantido: "resultado garantido", "vendas garantidas", "o retorno é certo", "garanto mais clientes", "garantimos que o faturamento vai crescer" */
  R('\\b(?:resultados?|retorno|lucros?|sucesso|vendas|clientes|faturamento|pedidos|contatos|crescimento|aumento)\\s+(?:\\w+\\s+){0,3}(?:garantid[oa]s?|assegurad[oa]s?)\\b'),
  R('\\b(?:resultados?|retorno|lucros?|sucesso)\\s+(?:e|sao|esta|estao|sera|serao)\\s+(?:certo|certa|certos|certas)\\b'),
  R('\\b' + GARANTE + '\\s+(?:te\\s+|lhe\\s+)?(?:' + ART + '(?:' + FORTE + '|resultado|retorno|lucro|sucesso|aumento|crescimento)|' + QUANT + DE_RESULTADO + ')\\b'),
  R('\\b' + GARANTE + '\\s+que\\s+(?:\\w+\\s+){0,5}(?:vai|vao|ira|irao|va)\\s+(?:\\w+\\s+){0,3}(?:crescer|subir|aumentar|dobrar|vender|faturar|lucrar|atrair|trazer|aparecer|dar certo)\\b'),
  R('\\b' + GARANTE + '\\s+que\\s+(?:voce|vc|seu \\w+|sua \\w+|o site|a pagina)\\s+(?:\\w+\\s+){0,1}(?:aparece|vende|cresce|fatura|lucra)\\b'),
  /* os números: "50% mais clientes", "converte cinco vezes mais", "aumento de 40% nas vendas" */
  R('\\b' + NUM + '\\s+(?:de\\s+)?(?:\\w+\\s+){0,1}mais\\s+(?:\\w+\\s+){0,1}' + DE_RESULTADO + '\\b'),
  R('\\baumento\\s+de\\s+' + NUM + '\\s+(?:\\w+\\s+){0,2}' + DE_RESULTADO + '\\b'),
  R('\\b(?:converte|vende|rende|traz|gera|atrai|fatura|cresce|aumenta|sobe|dobra)\\w*\\s+(?:\\w+\\s+){0,2}' + NUM + '\\s+(?:\\w+\\s+)?mais\\b'),
  /* os concorrentes: "vão ficar para trás", "vai deixar a concorrência para trás", "vai passar na frente dos concorrentes" */
  R('\\b' + CONCORRENTE + '\\s+(?:\\w+\\s+){0,4}(?:vao|vai|ira|irao)\\s+(?:\\w+\\s+){0,1}(?:ficar|ficarao)\\s+(?:\\w+\\s+){0,1}(?:para tras|atras|na poeira|no chinelo|pra tras)\\b'),
  R('\\b(?:vai|vao|vamos|ira|irao)\\s+(?:\\w+\\s+){0,2}(?:deixar|passar|ultrapassar|superar|bater|esmagar|derrotar|vencer|humilhar|colocar|botar)\\s+(?:\\w+\\s+){0,7}' + CONCORRENTE + '\\b'),
  R('\\b(?:vai|vao|ira|irao)\\s+(?:\\w+\\s+){0,2}(?:ficar|estar)\\s+(?:na frente|a frente)\\s+d[aoe]s?\\s+(?:\\w+\\s+){0,1}' + CONCORRENTE + '\\b'),
];

/* o dado inventado sobre os clientes da Beyon (ela não tem casos publicados). Fica fora do HEDGE: "ajudamos dezenas de empresas" é
   uma afirmação mesmo com o verbo "ajudar"; a negação ("não atendemos dezenas de clientes") continua valendo */
const DADO_INVENTADO = [
  R('\\b(?:nossos|nossas) clientes\\s+(?:\\w+\\s+){0,5}(?:cresc\\w+|aument\\w+|dobr\\w+|triplic\\w+|multiplic\\w+|vendem|venderam|vend\\w+ mais|fatur\\w+|lucr\\w+|ganh\\w+ (?:\\w+ ){0,1}(?:dinheiro|clientes|vendas|mais|visibilidade|destaque)|conquist\\w+|bateram|superaram|tiveram (?:\\w+ ){0,1}(?:resultado\\w*|retorno|aumento|crescimento|sucesso)|tem (?:\\w+ ){0,1}(?:resultado\\w*|retorno|sucesso)|(?:sairam|ficaram|estao|ficam|saem) (?:\\w+ ){0,1}(?:satisfeit\\w+|feliz|felizes|encantad\\w+|contentes?)|amam|adoram|aprovam|recomendam|elogiam|indicam)\\b'),
  R('\\b(?:clientes da beyon|clientes da beyon zero|quem ja (?:fez|fechou|contratou) (?:\\w+ ){0,2}(?:com a gente|conosco|com a beyon)|todo cliente nosso|cada cliente nosso)\\s+(?:\\w+\\s+){0,4}(?:cresc\\w+|aument\\w+|dobr\\w+|triplic\\w+|multiplic\\w+|vendem|venderam|vend\\w+ mais|fatur\\w+|lucr\\w+|conquist\\w+|tiveram (?:\\w+ ){0,1}(?:resultado\\w*|retorno|aumento|crescimento|sucesso)|(?:ficam|ficaram|estao) (?:\\w+ ){0,1}(?:satisfeit\\w+|feliz|felizes|encantad\\w+))\\b'),
  R('\\b(?:fizemos|ajudamos|entregamos|atendemos|criamos|produzimos|desenvolvemos|montamos|publicamos|fechamos|temos|tivemos)\\s+(?:\\w+\\s+){0,1}?(?:\\d+|dezenas|centenas|milhares|dezena|centena|varios|diversos|muitos|muitas|mais de \\w+)\\s+(?:de\\s+)?(?:\\w+\\s+){0,1}(?:sites?|clientes?|projetos?|empresas|negocios|empreendedores|marcas|lojas)\\b')
];

/* o que vem no negativo mas AFIRMA ("você não vai ficar sem clientes", "nenhum cliente nosso deixou de crescer"): testado antes da negação */
const AFIRMA_NEGANDO = [
  R('\\bnenhum\\w*\\s+(?:\\w+\\s+){0,4}(?:deixou|deixa|deixam|deixaram|ficou|fica)\\s+(?:\\w+\\s+){0,1}(?:de crescer|de vender|de faturar|de lucrar|sem (?:resultado|retorno|cliente|venda)|no prejuizo|insatisfeit\\w+)\\b'),
  R('\\bninguem\\s+(?:\\w+\\s+){0,2}(?:vai|vao|ira|fica|ficara)\\s+(?:\\w+\\s+){0,1}(?:ficar\\s+)?(?:para tras|atras|de fora|na mao)\\b'),
  R('\\b(?:voce|seu \\w+|sua \\w+)\\s+(?:\\w+\\s+){0,1}nao\\s+(?:vai\\s+|vao\\s+)?ficar\\s+(?:para tras|atras)\\b'),
  R('\\bnao\\s+(?:vai\\s+|vao\\s+|ira\\s+)?(?:ficar|fica|ficam)\\s+sem\\s+(?:cliente\\w*|venda\\w*|resultado\\w*|pedido\\w*|movimento)\\b'),
  R('\\bnao\\s+(?:vai\\s+|vao\\s+|ira\\s+)?(?:perder|perde|perdem)\\s+(?:\\w+\\s+){0,1}(?:cliente\\w*|venda\\w*)\\b'),
  R('\\bnao tem como (?:nao )?(?:vender|crescer|dar certo|dar errado|funcionar)\\b')
];

/* o que desfaz a promessa: possibilidade, objetivo, tentativa, condição. "pode apostar/ficar tranquilo/confiar" é reforço, não dúvida */
const HEDGE = /\b(?:pode(?!m? (?:apostar|ficar|confiar|ter certeza|contar|acreditar|escrever))\w*|poder\w*|talvez|quem sabe|objetivo|meta|sonho|ideal|tentar|tento|tentamos|tentativa|buscar|busco|buscamos|ajud\w+|facilit\w+|contribu\w+|chance|possivel|possibilidade|depende\w*|costum\w+|tend\w+|quer\w*|queira\w*|imagin\w+|suponha\w*|exemplo|hipotese|se voce|precis\w+|tem que|ter que|deve\w*|vale)\b/;
/* a negação: "sem dúvida" e "não se preocupe" não negam (limpa, do molde); aqui entram os "não tenha dúvida", "não tem erro" */
const FALSA_NEGACAO = /\bnao (?:tenha|tem|ha) duvidas?\b|\bnao duvide\b|\bnao se engane\b|\bnao tem erro\b|\bsem erro\b|\bsem sombra de duvida\b|\bnao e so\b/g;
const NEGA = /\b(?:nao|nunca|jamais|nem|nenhum|nenhuma)\b|\bsem (?:\w+ ){0,1}(?:garantia|garantir|promessas?|prometer|certeza|nenhum\w*|nada|ter como)\b|\bninguem (?:serio|honesto|de verdade|consegue|pode|garante|promete|deveria|sabe)\b|\bimpossivel\b|\bseria mentira\b|\bmentira\b|\bfalso\b|\bdificil\b|\bduvido\b/;
const negada = m => NEGA.test(limpa(m).replace(FALSA_NEGACAO, ' '));
/* "não vou prometer X e Y": a negação da fala vale para o resto da oração maior */
const FALA_NEGADA = /\bnao\s+(?:\w+\s+){0,2}(?:prometer|prometo|prometemos|garantir|garanto|garantimos|afirmar|afirmo|dizer|digo|assegurar|asseguro|jurar|juro|posso|consigo|podemos|conseguimos|tem como|da pra|da para|sei dizer)\b/;

function maiorPrometeResultado(M) {
  let herdada = false;
  for (const m of M.menores) {
    if (!HEDGE.test(m) && AFIRMA_NEGANDO.some(r => r.test(m))) return true;
    if (negada(m)) { if (FALA_NEGADA.test(m)) herdada = true; continue; }
    if (herdada) continue;
    if (DADO_INVENTADO.some(r => r.test(m))) return true;
    if (HEDGE.test(m)) continue;
    if (PROMESSAS_DE_RESULTADO.some(r => r.test(m))) return true;
  }
  return false;
}
const TEM_RESULTADO = R('\\b' + DE_RESULTADO + '\\b');
const GARANTIDO_SOZINHO = /^(?:\w+ ){0,2}(?:garantid[oa]s?|assegurad[oa]s?)$/;
const REFORCO_SOZINHO = /^(?:pode apostar|pode ter certeza|tenho certeza|com certeza|certeza|sem duvida)$/;
const MAIS_RESULTADO = R('^mais\\s+(?:\\w+\\s+){0,1}' + DE_RESULTADO + '\\b');
function frasePrometeResultado(crua) {
  const maiores = oracoesDe(crua);
  if (maiores.some(maiorPrometeResultado)) return true;
  /* "É garantido: mais pedidos todo mês.": o "garantido" sozinho vale com o resultado da oração vizinha */
  const vizinhaValida = (V, exige) => V && exige.test(V.texto) && !negada(V.texto) && !HEDGE.test(V.texto);
  return maiores.some((M, i) => {
    const vizinhas = [maiores[i - 1], maiores[i + 1]];
    if (GARANTIDO_SOZINHO.test(M.texto) && !negada(M.texto)) return vizinhas.some(V => vizinhaValida(V, TEM_RESULTADO));
    /* "Pode apostar: mais clientes todo mês." (só com "mais": "Com certeza, os pedidos chegam por e-mail" não promete nada) */
    return REFORCO_SOZINHO.test(M.texto) && vizinhas.some(V => vizinhaValida(V, MAIS_RESULTADO));
  });
}
/* a pergunta só promete se a frase seguinte a confirma ("Vai trazer mais clientes? Vai sim.") */
const CONFIRMA = /^(?:sim|vai sim|vao sim|claro|com certeza|certamente|garantido|garanto|pode apostar|tenho certeza|traz sim|fica sim|e sim|e claro|isso mesmo|exato|exatamente)\b/;
function quantasDeResultado(frases, i) {
  if (!ehPergunta(frases[i])) return frasePrometeResultado(frases[i]) ? 1 : 0;
  if (i + 1 >= frases.length || !frasePrometeResultado(frases[i])) return 0;
  const prox = paraBusca(frases[i + 1]);
  return CONFIRMA.test(prox) && !negada(prox) ? 2 : 0;
}
export function semPromessaDeResultado(texto) {
  return trocarFrases(texto, RESULTADO_FIXO, quantasDeResultado);
}

/* ---------- 2. garantia ---------- */
const PRAZO_G = '(?:\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|doze|vinte|trinta|noventa|cem)\\s+(?:dias?|semanas?|meses|mes|anos?)';
const OFERTA = '(?:tem|temos|tenho|ha|existe|dou|damos|dar|oferec\\w+|inclu\\w+|incluimos|vem com|vai com|com|possui\\w*|possuimos|conta com|cobre|cobrem|coberto|cobertura)';
/* ("devolver" sozinho é verbo comum: "a estimativa devolveu 8 dias"; só vale com o dinheiro como objeto. Reembolso, estorno e ressarcimento são sempre dinheiro) */
const DINHEIRO = '(?:dinheiro|valor|entrada|sinal|pagamento|quantia|reais|pix|tudo|total|integral|100)';
const PROMESSAS_DE_GARANTIA = [
  /* o substantivo, afirmado: "garantia de 12 meses", "tem garantia", "garantia total", "nossa garantia é de 6 meses" */
  R('\\bgarantia\\s+(?:\\w+\\s+){0,1}(?:de|por|ate)\\s+' + PRAZO_G + '\\b'),
  R('\\b' + PRAZO_G + '\\s+de\\s+garantia\\b'),
  /* (só os adjetivos de oferta; "garantia de satisfação/resultado" sozinha pode ser o assunto de uma recusa e só vale com o verbo de oferta, na linha de baixo) */
  R('\\bgarantia\\s+(?:total|estendida|vitalicia|incondicional)\\b'),
  R('\\b' + OFERTA + '\\s+(?:\\w+\\s+){0,3}garantia\\b'),
  R('\\bgarantia\\s+(?:\\w+\\s+){0,2}(?:inclus[oa]|incluida|gratis|gratuita|cobre|cobrem|vale|valida)\\b'),
  R('\\bgarantia\\s+(?:e|sera|fica)\\s+de\\b'),
  /* o verbo e o adjetivo: "garantimos a sua satisfação", "garantimos que você vai gostar", "qualidade garantida" */
  R('\\b' + GARANTE + '\\s+(?:\\w+\\s+){0,2}(?:satisfacao|qualidade|funcionamento|perfeito|perfeicao|aprovacao|reembolso|devolucao|dinheiro)\\b'),
  R('\\b' + GARANTE + '\\s+que\\s+(?:voce|vc|ele|a pessoa)\\s+(?:vai|va|ira)\\s+(?:gostar|adorar|amar|aprovar|ficar (?:satisfeit\\w+|feliz|encantad\\w+|contente))\\b'),
  R('\\b' + GARANTE + '\\s+que\\s+(?:o site|seu site|tudo)\\s+(?:vai|va|ira|vao)\\s+(?:funcionar|dar certo|ficar (?:perfeit\\w+|lind\\w+|incrivel))\\b'),
  R('\\b(?:satisfacao|qualidade|funcionamento|reembolso|devolucao|dinheiro de volta)\\s+(?:\\w+\\s+){0,1}garantid[oa]s?\\b'),
  R('\\b100 ?%? (?:de )?(?:garantid\\w+|satisfeit\\w+|satisfacao)\\b'),
  R('\\brisco zero\\b')
];
/* devolver o dinheiro: só vale quando NÃO é o que a empresa disse (7 dias para desistir; devolução se a Beyon atrasar) */
const PROMESSAS_DE_REEMBOLSO = [
  R('\\b(?:reembols\\w+|estorn\\w+|ressarc\\w+)\\b'),
  R('\\b(?:devolv\\w+|devolucao)\\s+(?:\\w+\\s+){0,3}' + DINHEIRO + '\\b'),
  R('\\bdinheiro (?:de volta|volta)\\b'),
  R('\\bvolta (?:o |seu )?dinheiro\\b'),
  R('\\bvalor (?:de volta|volta)\\b')
];
const DO_QUE_A_EMPRESA_DISSE = /\b(?:desist\w*|arrepend\w*|atras\w*|prazo combinado|nao entreg\w+|(?:7|sete) dias)\b/;
const SETE_DIAS_PARA_DESISTIR = /\b(?:7|sete) dias\b[^]{0,80}\b(?:desist|arrepend|devol)|\b(?:desist|arrepend|devol)\w*[^]{0,80}\b(?:7|sete) dias\b/;
/* a garantia do negócio do cliente não é nossa: "a garantia da sua loja", "a garantia que você oferece" (mas "o seu site tem garantia" é nossa) */
const NAO_E_NOSSO = '(?:site|pagina|projeto|dominio|hospedagem|landing|atelier)';
const GARANTIA_DO_CLIENTE = R('\\b(?:sua|seu|suas|seus)\\s+(?!' + NAO_E_NOSSO + '\\b)\\w+\\s+(?:\\w+\\s+){0,2}garantia\\b|\\bgarantia\\s+(?:\\w+\\s+){0,3}(?:sua|seu|suas|seus)\\s+(?!' + NAO_E_NOSSO + '\\b)\\w+|\\bvoce\\s+(?:\\w+\\s+){0,1}(?:oferece|oferecem|presta|prestam|concede|da|dao)\\b[^]{0,30}garantia|\\bgarantia\\s+(?:\\w+\\s+){0,2}voce\\s+(?:oferece|presta|da|concede)\\b');
/* o reembolso dos clientes DELE ("o reembolso dos seus clientes na sua loja") e o "devolveu o valor" da ferramenta de preço não são promessa nossa */
const REEMBOLSO_DO_CLIENTE = /\b(?:de|dos|das|aos|para os) (?:seus|suas) (?:clientes|alunos|pacientes|compradores|consumidores|fregueses)\b|\b(?:da|na|de) sua (?:loja|empresa|clinica|oficina|academia|escola)\b|\b(?:do|no|de) seu (?:negocio|comercio|restaurante|consultorio|escritorio)\b/;
const REEMBOLSO_DE_FERRAMENTA = /\b(?:ferramenta|estimativa|tabela|sistema|calculo|motor|resumo|tela|cartao|simulacao)\b/;
const NEGA_G =/\b(?:nao|nunca|jamais|nem|nenhum|nenhuma|ninguem)\b|\bsem\s+(?:\w+\s+){0,2}(?:garantia|reembolso|devolucao)\b/;
/* "se você não gostar, devolvemos": o "não" da condição não nega a promessa */
const NAO_CONDICIONAL = /\b(se|caso)\s+(?:(?:voce|vc|ele|ela|a pessoa|o cliente|algo|tudo|ficar|isso|o site|a gente)\s+){0,2}nao\b/g;
const negadaG = m => NEGA_G.test(limpa(m).replace(NAO_CONDICIONAL, '$1'));

function frasePrometeGarantia(crua) {
  const frase = paraBusca(crua);
  const tem7Dias = SETE_DIAS_PARA_DESISTIR.test(frase);
  const verdade = DO_QUE_A_EMPRESA_DISSE.test(frase);
  const doCliente = REEMBOLSO_DO_CLIENTE.test(frase);
  for (const M of oracoesDe(crua)) {
    for (const m of M.menores) {
      if (negadaG(m) || GARANTIA_DO_CLIENTE.test(m)) continue;
      if (!tem7Dias && PROMESSAS_DE_GARANTIA.some(r => r.test(m))) return true;
      if (tem7Dias && PROMESSAS_DE_GARANTIA.some(r => r.test(m) && !/\b(?:7|sete) dias\b/.test(m))) return true;
      if (!verdade && !doCliente && !REEMBOLSO_DE_FERRAMENTA.test(m) && PROMESSAS_DE_REEMBOLSO.some(r => r.test(m))) return true;
    }
  }
  return false;
}
/* a pergunta com garantia só promete se a frase seguinte confirma ("Tem garantia? Tem sim.") */
const CONFIRMA_GARANTIA = /^(?:sim|tem sim|tem|temos|claro|com certeza|certamente|damos|oferecemos|incluso|inclusa)\b/;
function quantasDeGarantia(frases, i) {
  if (!ehPergunta(frases[i])) return frasePrometeGarantia(frases[i]) ? 1 : 0;
  const q = paraBusca(frases[i]);
  if (i + 1 >= frases.length || !/\bgarantia\b/.test(q) || GARANTIA_DO_CLIENTE.test(q)) return 0;
  const prox = paraBusca(frases[i + 1]);
  return CONFIRMA_GARANTIA.test(prox) && !negadaG(prox) && !DO_QUE_A_EMPRESA_DISSE.test(prox) ? 2 : 0;
}
export function semGarantia(texto) {
  return trocarFrases(texto, GARANTIA_FIXO, quantasDeGarantia);
}
