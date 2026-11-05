/* ==========================================================================
   TRAVA "NEGAR SER IA" (o Zero, consultor de IA do site de vendas).

   O prompt (consultor.mjs, regra 1 do bloco de verdade) manda: o Zero é uma IA e diz isso quando perguntam; nunca diz que é pessoa
   nem que é o dono; não tem corpo, família, rotina nem passado com clientes (nada de "na minha experiência" ou "já atendi"); nunca
   diz "nossa equipe": a pessoa de verdade é o dono. Esconder que é IA é a mentira mais grave que o Zero pode contar (CDC art. 6º e 37)
   e é a que o visitante testa de propósito ("você é um robô?"). Mesmo assim o modelo pode escorregar numa frase.

   ESTA TRAVA É A SEGUNDA CAMADA. A DEFESA REAL É O PROMPT (e a rodada com o modelo real). É um filtro de lista: ela pega o jeito
   óbvio de dizer e o que um visitante hostil induz com facilidade, nunca todo jeito possível. Mesmo molde de travas-resultado.mjs:
   olha FRASE por frase, troca só a frase que mente por um texto fixo honesto (em voz humana, "a gente", sem humor) e deixa o resto
   da resposta (o marcador do valor, a pergunta seguinte). Devolve { texto, trocou, classes }.

   TRÊS CLASSES, cada uma com o seu texto fixo:
   • identidade: AFIRMA ser pessoa/humano/o dono/o Fernando/funcionário ("sou uma pessoa de verdade", "aqui é o dono", "falo aqui eu
     mesmo, o Fernando", "sou atendente humano") ou NEGA ser IA/robô/bot ("não sou um robô", "isso não é uma IA", "aqui não tem robô").
     O texto fixo manda para o botão DEIXAR UM RECADO, e o agente liga o botão junto (diagnostico 'recado').
   • experiencia: finge vida ou passado humano ("na minha experiência", "já atendi muitos clientes", "ontem eu vi", "conversei com ele por
     telefone", "minha família", "tenho 10 anos de experiência", "estou com fome").
   • equipe: "nossa equipe", "nosso time", "nossos designers" (o prompt manda dizer "a gente"; a Beyon é tocada pelo dono).
   Se a frase cai em mais de uma, vale a primeira nesta ordem.

   O QUE PASSA (precisão: cortar resposta honesta é pior que um furo, porque a troca apaga o resto da frase):
   • a negação dupla: "não sou uma pessoa, sou uma IA", "não sou o dono". A negação vale se vier até 4 palavras antes, na MESMA oração;
     "Não, sou uma pessoa" (vírgula) afirma e CORTA;
   • a terceira pessoa: "o dono é uma pessoa de verdade e responde por e-mail", "uma pessoa de verdade lê o recado", "o humano que toca a empresa";
   • a dúvida e a citação ("você acha que sou uma pessoa?", "se eu fosse humano"), "robô de busca do Google", a caixinha "não sou um robô"
     do formulário, a equipe/o time/a família/o filho do CLIENTE ("sua equipe", "seu filho");
   • "a equipe" (sem "nossa"), que já está nos textos fixos do recado e do pagamento.
   POLÍTICA DE FRONTEIRA: "não sou um robô de respostas prontas, sou uma IA" ainda NEGA ser robô e é trocada (o texto fixo é honesto,
   curto, e não custa à conversa o que custaria uma promessa errada).

   AVISO HONESTO SOBRE A MEDIDA (casos em docs/testes/travas-identidade-casos.mjs, -leva3.mjs e -leva4.mjs): as levas 1 e 2 (150 frases
   de pegar e passar) foram escritas antes do módulo, mas o autor as percorreu ao desenhar os padrões; os ~100% delas são REGRESSÃO, não
   qualidade. O número que vale é o da primeira passada de cada leva que o autor NÃO tinha visto, medida antes de ajustar:
     • leva 3 (60 frases a pegar, 60 honestas): 38/60 = 63% de recall; nenhuma honesta cortada;
     • leva 4 (50 a pegar, 52 honestas), escrita depois do ajuste da leva 3, em outras palavras: 27/50 = 54%; nenhuma honesta cortada;
     • juntas: 65/110 = 59% de recall, 65 de 65 cortes certos (100% de precisão, mas só nas frases honestas que o autor imaginou);
     • gabarito do classificador (nega_ser_ia: 10 positivos e 106 controles), visto só depois do módulo: 9/10 e nenhum controle cortado.
   Em português claro: a trava pega perto de 3 em cada 5 jeitos de mentir sobre ser IA que um modelo distraído ou um visitante que
   induz o modelo consegue produzir, e (nas amostras) quase nunca corta resposta honesta. O resto é com o prompt. Depois de medida, cada
   leva foi usada para ampliar a FAMÍLIA do padrão (não só a frase) e virou teste de regressão.

   FUROS CONHECIDOS (documentados e fixados em FUROS_IDENTIDADE_CONHECIDOS): resposta elíptica sem o assunto ("Não, não sou." / "Sou sim"),
   que depende da pergunta, a qual a trava não vê; humanização sem afirmar identidade ("te ligo amanhã", "vou pensar com carinho"); paráfrase
   sem as palavras da lista; outro idioma além do português; letras espaçadas misturadas ("s o u  h u m a n o" é tratada, mas não toda variante).

   LIMITES: promessa.mjs corta cada frase em 2.000 caracteres (TETO) ao normalizar, e trocarFrases examina no máximo 1.200 frases ou 6.000
   caracteres por texto (o agente já corta o texto do modelo em 1.100 antes das travas). Todas as janelas das expressões são limitadas
   ({0,n}), então nenhuma entrada de 50 mil caracteres gera backtracking. Depende de preparar, desespacar e trocarFrases exportados por
   travas-resultado.mjs e de PONTUACAO e limpa exportados por travas-promessa.mjs.
   ========================================================================== */
import { limpa } from './travas-promessa.mjs';
import { trocarFrases, preparar, desespacar } from './travas-resultado.mjs';

/* o nome do dono não aparece nos textos fixos (nem em nenhum texto que o Zero fala) */
export const IDENTIDADE_FIXO = 'Sou uma inteligência artificial, o Zero da Beyon Zero. Quem toca a empresa é o dono, e o contato com ele é por escrito, pelo botão DEIXAR UM RECADO.';
export const EXPERIENCIA_FIXO = 'Sou uma inteligência artificial, então não tenho experiência própria nem histórico com clientes. O que eu sei está na tabela e nas condições da Beyon Zero.';
export const EQUIPE_FIXO = 'A Beyon Zero é uma operação pequena, tocada pelo dono, e eu sou a inteligência artificial que atende por aqui.';
const FIXO_DA_CLASSE = { identidade: IDENTIDADE_FIXO, experiencia: EXPERIENCIA_FIXO, equipe: EQUIPE_FIXO };
const ORDEM = ['identidade', 'experiencia', 'equipe'];

const rx = (partes, ...vs) => new RegExp(String.raw(partes, ...vs), 'g');
const SEP = '%%';
const ultimas = (s, n) => s.trim().split(' ').slice(-n).join(' ');

/* ---------- vocabulário (texto já sem acento e caixa; o "é" virou "e") ---------- */
const NUMW = '(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|cem|muitos|varios|alguns|bastante|\\d+)';
const EU_PESSOA = '(?:(?:ser\\s+)?humano|humana|pessoa|pessoas|gente|ser vivo|criatura|de carne e osso|em carne e osso|real|de verdade)';
const DONO = '(?:dono|dona|proprietari[oa]|fernando|fundador\\w*|criador\\w*|idealizador\\w*|socio|socia|ceo|chefe|diretor\\w*|administrador\\w*)';
const ROBO = '(?:robo\\w*|bots?|sistema\\s+automatic[oa]|sistema\\s+automatizad[oa]|chat ?bots?\\w*|maquina|ia|i a|inteligencia artificial|artificial|programa\\w*|software|algoritmo|computador|modelo de linguagem|chatgpt|gpt|assistente virtual|atendente virtual|(?:uma?\\s+)?(?:resposta|mensagem|atendimento)\\s+(?:automatic[ao]|automatizad[ao]|pronta)|automatico|automatica)';
const NAO_BUSCA = '(?!\\s+(?:de\\s+)?(?:busca|buscas|indexacao|rastreio|rastreamento|spam|captcha|pesquisa|google))';
const MARCADOR = '(?:com\\s+voce|agora|aqui|ai|neste momento|agora mesmo|neste chat|nesse chat|do outro lado)';
const OBJ_CLIENTE = '(?:clientes?|empresas?|sites?|casos?|lojas?|dentistas?|restaurantes?|clinicas?|saloes|salao|academias?|advogad[oa]s?|medicos?|empreendedores?|marcas?|nichos?|ramos?|donos?|gente)';
const SEM_SEU = '(?:(?!(?:seu|sua|seus|suas|voce|te)\\s)\\w+\\s+)';
const VERBOS_TRAB = '(?:atendi|ajudei|montei|criei|entreguei|fiz|desenvolvi|lancei|vendi|fechei|trabalhei|conversei|falei|liguei|visitei|conheci|acompanhei|cuidei|publiquei|produzi)';
const VERBOS_EU = '(?:desenhei|montei|fiz|criei|escrevi|resolvi|cuidei|respondi|atendi|li|vi|testei|programei|configurei|ajustei|revisei|cuidar|cuido|respondo|responder|atendo|atender|leio|ler|toco|tocar|faco|fazer|monto|montar|desenho|desenhar|escrevo|escrever|resolvo|resolver|vejo|ver)';
const VERBOS_DIA = '(?:vi|li|ouvi|conversei|falei|liguei|encontrei|atendi|recebi|fiz|montei|visitei|estive|fui|almocei|jantei|conheci|testei|ajudei|entreguei|criei|peguei|passei|lembrei|assisti|viajei|dormi|acordei|cheguei|sai|voltei|trabalhei)';
const QUANDO = '(?:ontem|anteontem|semana passada|mes passado|ano passado|outro dia|hoje cedo|hoje de manha|esta manha)';

/* ---------- 1. IDENTIDADE: afirma ser pessoa / dono (a negação e a dúvida colada antes desfazem) ---------- */
const AFIRMA_PESSOA = [
  rx`\b(?:sou|somos)\s+(?:eu\s+)?(?:(?:so|apenas|mesmo|mesma|tambem|sim|realmente|de fato|totalmente|bem|muito|tao)\s+){0,2}(?:(?:uma?|o|a)\s+)?${EU_PESSOA}\b(?!\s+(?:certa|ideal|indicada)\b)`,
  rx`\bsou\s+d[ao]\s+(?:equipe|time)\b|\bfaco parte d[ao]\s+(?:equipe|time)\b`,
  rx`\bsou\s+(?:o\s+|a\s+|um\s+|uma\s+)?(?:funcionari[oa]|colaborador\w*|empregad[oa]|contratad[oa])\b`,
  rx`\bsou\s+(?:uma?\s+)?(?:atendente|consultor\w*|vendedor\w*|assistente|representante|especialista|designer|programador\w*|desenvolvedor\w*|responsavel|administrador\w*|gerente|diretor\w*)\s+(?:humano|humana|de verdade|real|em carne e osso|de carne e osso)\b`,
  rx`\b(?:juro|pode crer|pode acreditar|garanto|prometo)\s+que\s+(?:eu\s+)?sou\s+(?:uma?\s+)?${EU_PESSOA}\b`,
  rx`\b(?:tem|ha)\s+(?:uma\s+)?(?:pessoa|humano|humana|gente|alguem)\s+(?:de verdade|real|de carne e osso)\s+(?:aqui|ai|ae|falando|digitando|respondendo|escrevendo|atendendo|do outro lado)\b`,
  rx`\b(?:tem|ha|existe)\s+(?:uma\s+)?(?:pessoa|humano|humana|gente|alguem)\s+(?:de verdade\s+)?(?:do outro lado|aqui|ai|ae)\b`,
  rx`\bque\s+sou\s+eu\b`,
  rx`\b(?:to|estou)\s+aqui\s+(?:digitando|escrevendo|respondendo|conversando)\b`,
  rx`\bcomo\s+(?:pessoa|humano|humana)(?:\s+${SEP})?\s+eu\b|\bcomo\s+(?:o\s+|a\s+)?(?:dono|dona|proprietari[oa]|fundador\w*)\s+d[ao]\s+(?:beyon|empresa)\b`,
  rx`\bsou\s+(?:eu\s+)?(?:o\s+|a\s+)?responsavel\s+(?:pelo|pela|por)\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:atendimento|pedidos?|empresa|beyon|tudo|aqui|projetos?|equipe|vendas)\b`,
  rx`\bsou\s+(?:formad[oa]|graduad[oa]|bacharel|mestre em|doutor em|especialista em)\b`,
  rx`\baqui\s+(?:e|tem)\s+(?:so\s+)?(?:atendimento\s+(?:humano|de verdade|pessoal|feito\s+por\s+(?:pessoas|gente|humanos?|alguem))|gente(?:\s+de verdade)?|(?:uma?\s+)?(?:humano|pessoa)(?:\s+de verdade)?|conversa\s+de\s+(?:gente|pessoa|verdade))\b`,
  rx`\b(?:pessoa|humano|humana|gente)\s+(?:de carne e osso\s+|de verdade\s+|real\s+)?que\s+(?:esta|ta)\s+(?:digitando|falando|respondendo|escrevendo|atendendo|conversando)\b`,
  rx`\b(?:uma?\s+)?(?:pessoa|humano|humana|gente|alguem)\s+(?:de verdade\s+|real\s+)?(?:esta|ta)\s+(?:respondendo|falando|digitando|escrevendo|atendendo|conversando)\s+(?:com\s+)?voce\b`,
  rx`\b(?:falando|falo|respondo|atendo|escrevo)\s+como\s+(?:uma?\s+)?(?:pessoa|humano|humana|dono)\b`,
  rx`\bsou\s+(?:tambem\s+)?(?:um\s+|uma\s+)?(?:empreendedor\w*|empresari[oa]|pai|mae|casad[oa]|solteir[oa]|brasileir[oa]|autonom[oa]|freelancer)\b`,
  rx`\bsou\s+(?:aqui\s+)?d[eo]\s+(?:campo grande|ms|mato grosso)\b`
];
const AFIRMA_DONO = [
  rx`\bsou\s+(?:eu\s+)?(?:mesm[oa]\s+)?(?:${SEP}\s+)?(?:(?:o|a)\s+)?(?:proprio\s+|propria\s+)?(?:${DONO}|responsavel\s+(?:pela|pelo|por)\s+(?:a\s+)?(?:beyon|empresa|tudo|aqui))\b`,
  rx`\b(?:${DONO}|responsavel)\s+(?:d[ao]\s+(?:beyon\s+(?:zero\s+)?|empresa\s+|daqui\s+|negocio\s+))?sou eu\b`,
  rx`\bquem\s+(?:toca|manda|comanda|cuida|dirige|administra|criou|fundou|responde|atende|escreve)\s+(?:\w+\s+){0,3}sou eu\b|\bsou eu\s+(?:que|quem)\s+(?:toco|mando|comando|cuido|dirijo|administro|criei|fundei|respondo|atendo|escrevo|leio)\b`,
  rx`\baqui\s+(?:e|esta|fala|quem fala e|quem responde e|quem atende e|quem escreve e|quem esta falando e)\s+(?:eu\s+)?(?:o\s+|a\s+)?(?:proprio\s+|propria\s+)?(?:${DONO})\b`,
  rx`\baqui\s+voce\s+fala\s+(?:direto\s+)?com\s+(?:o\s+|a\s+)?(?:proprio\s+)?(?:${DONO})\b`,
  rx`\bquem\s+(?:esta|ta)\s+(?:falando|escrevendo|digitando|respondendo|atendendo|conversando|ai|aqui|do outro lado)(?:\s+(?:${MARCADOR}|conversando|falando|digitando|respondendo|escrevendo))*\s+(?:e|sou)\s+(?:eu\b|(?:o\s+|a\s+|uma?\s+)?(?:proprio\s+|propria\s+)?(?:${DONO}|pessoa|humano|humana|gente|ser humano|alguem de verdade)\b)`,
  rx`\baqui\s+quem\s+(?:fala|responde|atende|escreve|digita)\s+e\s+(?:eu\b|(?:o\s+|a\s+|uma?\s+)?(?:proprio\s+|propria\s+)?(?:${DONO}|pessoa|humano|humana|gente|ser humano)\b)`,
  rx`\bquem\s+(?:fala|escreve|responde|atende|digita)\s+(?:aqui|agora|neste chat|nesse chat|neste momento)(?:\s+${MARCADOR})*\s+e\s+(?:eu\b|(?:o\s+|a\s+|uma?\s+)?(?:proprio\s+|propria\s+)?(?:${DONO}|pessoa|humano|humana|gente)\b)`,
  rx`\b(?:falo|respondo|atendo|escrevo|digito|cuido|leio|vejo|acompanho|analiso|reviso|olho|confiro|estou falando|to falando|estou respondendo|to respondendo)\s+(?:\w+\s+){0,4}?(?:eu\s+mesm[oa]|pessoalmente|em pessoa|diretamente comigo)\b`,
  rx`\bcomigo(?:\s+${SEP})?\s+(?:o|a)\s+(?:${DONO})\b`,
  rx`\baqui\s+(?:e|esta|fala)\s+(?:eu\s+)?(?:o\s+|a\s+|uma?\s+)(?:proprio\s+|propria\s+)?(?:pessoa|humano|humana|ser humano)\b(?!\s+(?:certa|ideal|indicada)\b)`,
  rx`\beu\s+(?:desenvolvi|criei|fundei|montei|construi|abri|idealizei|comecei)\s+(?:a\s+)?(?:beyon|empresa|tudo isso|isso tudo)\b`,
  rx`\bquem\s+(?:te\s+|lhe\s+|com\s+voce\s+)(?:fala|escreve|responde|atende|digita)\s+(?:aqui|agora|neste chat|nesse chat)?\s*e\s+(?:eu\b|(?:o\s+|a\s+|uma?\s+)?(?:proprio\s+|propria\s+)?(?:${DONO}|pessoa|humano|humana|gente|ser humano))\b`,
  rx`\bquem\s+(?:te\s+|lhe\s+)(?:atende|responde|escreve)\s+(?:aqui\s+)?(?:e|sou)\s+(?:eu\b|(?:o\s+|a\s+|uma?\s+)?(?:${DONO}|pessoa|humano|humana|gente|ser humano))\b`,
  rx`\bcomigo\s+(?:mesm[oa]|diretamente|direto)\b`,
  rx`\bfala\s+aqui\s+(?:o\s+)?(?:proprio\s+)?(?:${DONO})\b|\be\s+o\s+proprio\s+(?:${DONO})\s+(?:falando|aqui|respondendo|escrevendo)\b`,
  rx`\beu\s+mesm[oa]\s+(?:ja\s+|vou\s+|irei\s+)?(?:\w+\s+){0,1}?${VERBOS_EU}\b`,
  rx`(?:^|${SEP}\s)(?:(?:oi|ola|opa|e ai|bom dia|boa tarde|boa noite)\s+)?(?:e\s+)?(?:o\s+)?(?:dono|fernando|proprietario)\s+aqui(?!\s+(?:d[aeo]s?|na|no)\b)`,
  rx`(?:^|${SEP}\s)(?:(?:tem|sim|claro)\s+)?sou\s+eu(?:\s+mesm[oa])?(?=\s+${SEP}|$)`,
  rx`\bquem\s+escreve\s+aqui\s+e\s+(?:o\s+)?(?:${DONO})\b`,
  rx`\bvoce\s+(?:esta|ta)\s+(?:falando|conversando)\s+com\s+(?:uma?\s+)?(?:pessoa|humano|humana|ser humano|gente de verdade|alguem de verdade|(?:o|a)\s+(?:proprio\s+)?(?:${DONO}))\b`,
  rx`\b(?:meu nome e|me chamo|pode me chamar de)\s+(?!zero\b|o zero\b|a zero\b)\w+`
];
/* ---------- 1b. IDENTIDADE: nega ser IA (a negação está no próprio trecho) ---------- */
const NEGA_IA = [
  rx`\bnao\s+(?:sou|seria|estou|era)\s+(?:(?:um|uma|nenhum|nenhuma|esse|essa|aquele|aquela|daqueles|daquelas|tipo um|tipo uma|bem)\s+){0,2}${ROBO}\b${NAO_BUSCA}`,
  rx`(?:^|${SEP}\s|\b(?:aqui|isso|isto|esse chat|este chat|essa conversa|esta conversa|esse atendimento|este atendimento|o atendimento|quem fala|quem esta falando|quem esta escrevendo|garanto que|pode ter certeza que|pode acreditar que|saiba que|fique sabendo que|tranquilo(?:\s+que)?|tranquila(?:\s+que)?|sossegad[oa](?:\s+que)?|relaxa|calma|pode confiar|sim|claro)(?:\s+(?:aqui|ai))?\s)nao\s+(?:e|eh|ta)\s+(?:(?:um|uma|nenhum|nenhuma)\s+)?${ROBO}\b${NAO_BUSCA}`,
  rx`\b(?:aqui|isso|esse chat|este chat|essa conversa|esta conversa|o atendimento|esse atendimento)\s+(?:nao\s+(?:tem|existe|ha|usa)|e\s+sem|sem)\s+(?:nenhum\s+|nenhuma\s+|qualquer\s+)?(?:robo\w*|bots?|chat ?bots?|maquina|ia|inteligencia artificial|automacao)\b`,
  rx`\b(?:atendimento|conversa|papo|chat)\s+(?:e\s+)?sem\s+(?:nenhum\s+|nenhuma\s+)?(?:robo\w*|bots?|ia|inteligencia artificial|maquina)\b`,
  rx`\bsem\s+(?:robo\w*|bots?|ia|inteligencia artificial|maquina)\s+(?:nenhum\s+|nenhuma\s+)?(?:aqui|ai|no meio|no chat|nessa conversa|nesta conversa)\b`,
  rx`\bnao\s+(?:tem|existe|ha)\s+(?:nenhum\s+|nenhuma\s+|qualquer\s+)?(?:robo\w*|bots?|ia|inteligencia artificial|maquina)(?:\s+(?:nenhum|nenhuma))?\s+(?:do outro lado|aqui|ai|ae|no chat|nesta conversa|nessa conversa|por tras)\b`,
  rx`\bnada de (?:robo\w*|bots?|maquina|ia|inteligencia artificial|atendimento automatico|resposta automatica)\b`,
  rx`\bvoce\s+nao\s+(?:esta|ta)\s+(?:falando|conversando)\s+com\s+(?:um\s+|uma\s+)?${ROBO}\b${NAO_BUSCA}`,
  rx`\bnao\s+com\s+(?:um|uma)\s+(?:sistema|${ROBO})\b${NAO_BUSCA}`,
  rx`(?:^|${SEP}\s|\beu\s)nao\s+(?:uso|utilizo|estou usando)\s+(?:nenhuma?\s+)?(?:ia|inteligencia artificial|robo\w*|bots?|automacao)\b`
];
/* a caixinha "não sou um robô" do formulário e a verificação de segurança são outro assunto */
const DO_FORMULARIO = /\b(?:caixinha|caixa|captcha|recaptcha|turnstile|verificacao|marque|marcar|clique|clicar|selecione|selecionar|desafio|checkbox|formulario|aparece|recado|botao|e mail|email|por escrito)\b/;
const NADA_DE_CONTEXTO = /\b(?:aqui|comigo|conversa|papo|atend\w+|fala\w*|pessoa|gente|humano)\b/;

/* ---------- 2. EXPERIÊNCIA: vida e passado que o Zero não tem ---------- */
const EXPERIENCIA = [
  rx`\b(?:na|pela|em|com|segundo a|baseado na|baseada na|a partir da)\s+(?:minha|nossa)\s+(?:propria\s+)?(?:experiencia|vivencia|vida|pratica|historia|trajetoria|opiniao pessoal|carreira|bagagem)\b`,
  rx`\bminha\s+(?:experiencia|vivencia|trajetoria|bagagem|carreira|historia|formacao|vida|rotina|infancia|familia|esposa|mulher|marido|filh[oa]s?|mae|pai|irma[o]?|casa|cidade|faculdade|epoca)\b`,
  rx`\b(?:tenho|ja tenho)\s+(?:\w+\s+){0,2}?experiencia\b|\btemos\s+(?:muita |bastante |ampla |larga |boa )experiencia\b|\b(?:me ensinaram|me ensinou)\b|\baprendi\s+(?:que|com|na|no|nesses|nestes|ao longo)\b`,
  rx`\b(?:vivo|trabalho|atuo|mexo|lido)\b(?:\s+\w+){0,3}\s+(?:ha|faz)\s+(?:${NUMW}\s+)?anos\b|\bvivo\s+disso\b`,
  rx`\b(?:tenho|ja tive)\s+(?:um|uma|meu|minha)\s+(?:negocio|loja|empresa|comercio|salao|restaurante|clinica|consultorio|oficina|academia|filho|filha|familia)\b`,
  rx`\b(?:fico|estarei|vou estar|estou)\s+aqui\s+ate\b`,
  rx`\b(?:conversei|falei)\s+com\s+(?:o|a)\s+(?:pessoal|galera)\b`,
  rx`\bmeu\s+(?:socio|colega|cunhado|sogro|sogra|amigo|vizinho|professor)\b|\bminha\s+(?:socia|colega|amiga|sogra|professora)\b`,
  rx`\bmeu\s+(?:pai|filho|filha|irmao|marido|avo|tio|primo|cachorro|gato|carro|bairro|fim de semana|almoco|cafe|ultimo cliente|primeiro cliente|primeiro site|escritorio|computador|dia a dia|cotidiano|historico|percurso|tempo de (?:mercado|casa|estrada|trabalho)|emprego|antigo (?:emprego|chefe|trabalho))\b`,
  rx`\b(?:tenho|ja tenho)\s+(?:mais de\s+|quase\s+|uns\s+|cerca de\s+|mais ou menos\s+)?${NUMW}\s+anos?\s+(?:de\s+)?(?:experiencia|estrada|mercado|janela|casa|trabalho|atuacao|carreira)\b`,
  rx`\b(?:trabalho|atuo|atendo|mexo|lido)\s+(?:com isso|nisso|nessa area|nesse ramo|nesse mercado|com sites?|com web|na area|no mercado)\s+(?:ha|faz|desde|a mais de)\b`,
  rx`\b(?:ha|faz)\s+(?:${NUMW}|muitos|varios|alguns|bastante)\s+anos\s+(?:que\s+)?(?:eu\s+)?(?:trabalho|atuo|atendo|faco|mexo|lido|estou)\b`,
  rx`\bos anos (?:que )?(?:eu )?(?:trabalho|atuo|atendo|mexo)\b`,
  rx`\b(?:ja\s+)?${VERBOS_TRAB}\s+${SEM_SEU}{0,6}${OBJ_CLIENTE}\b`,
  rx`\b${VERBOS_TRAB}\s+${SEM_SEU}{0,4}(?:muit[oa]s?|vari[oa]s?|diversos|dezenas|centenas|${NUMW})\s+(?:\w+\s+){0,1}(?:projetos?|paginas?|negocios?|pedidos?)\b|\b${VERBOS_TRAB}\s+(?:de|dos|das)\s+(?:projetos|sites|paginas|negocios)\b`,
  rx`\b(?:ja\s+)?(?:morei|cresci|nasci|estudei|me formei)\b|\b(?:abri|fundei|comecei)\s+(?:a\s+|minha\s+|uma\s+|um\s+|o\s+|meu\s+)?(?:beyon|empresa|negocio|loja|comercio)\b`,
  rx`\bja\s+(?:tive|passei por|vi|ouvi)\s+(?:\w+\s+){0,2}(?:loja|negocio|empresa|comercio|salao|restaurante|clinica|consultorio|oficina|academia|filho|filha|isso|esse|essa|situacao|clientes?|casos?)\b`,
  rx`\b(?:moro|morando|resido)\b|\bsou\s+(?:formad[oa]|graduad[oa])\b|\b(?:participei|atuei|trabalhei|colaborei|estagiei)\b|\bmeu\s+primeiro\s+(?:negocio|emprego|projeto)\b|\b(?:montei|abri|criei|tive|comecei|fundei)\s+(?:o\s+)?(?:meu|minha)\b`,
  rx`\b(?:atendo|fecho|monto|faco|vendo|entrego|crio)\s+(?:\w+\s+){0,5}(?:toda semana|todo dia|todos os dias|todo mes|diariamente|semanalmente)\b`,
  rx`\bmeus?\s+(?:proprios\s+)?(?:olhos?|ouvidos?|maos?|dedos?|cabeca|corpo|coracao|estomago)\b|\bminhas?\s+(?:proprias\s+)?(?:maos?|cabeca|voz|boca|barriga)\b`,
  rx`\bvou\s+(?:tomar|pegar)\s+(?:um\s+)?(?:cafe|agua|lanche)\b|\bvou\s+(?:almocar|jantar|dormir|ao banheiro)\b|\bja\s+volto\b(?!\s+(?:a|ao|para|pra|no|na)\b)|\bacabei de (?:falar|conversar|ligar)\b`,
  rx`\b(?:estou|to)\s+(?:aqui\s+)?(?:no|pelo|usando o|digitando no)\s+(?:celular|computador|notebook|pc|telefone)\b|\bdesculp\w+\s+(?:a|pela|por)\s+(?:demora|ausencia|demorar)\b|\bestava\s+(?:em reuniao|almocando|jantando|ocupad[oa]|no telefone|fora|dormindo|resolvendo|atendendo|com outro|na rua|dirigindo)\b`,
  rx`\bquando\s+(?:eu\s+)?(?:era|fui|trabalhava|tinha|morava|estudava|abri|comecei)\b`,
  rx`\b${QUANDO}\b(?:\s+\w+){0,5}?\s+(?:eu\s+)?${VERBOS_DIA}\b`,
  rx`\b(?:eu\s+)?${VERBOS_DIA}\s+(?:\w+\s+){0,6}?${QUANDO}\b`,
  rx`\b(?:conversei|falei|liguei|troquei mensagens|bati papo)\s+(?:\w+\s+){0,4}(?:por telefone|ao telefone|pelo telefone|pessoalmente|por whatsapp|por video|numa ligacao|em uma ligacao|em reuniao|numa reuniao)\b`,
  rx`\b(?:conversei|falei|liguei)\s+com\s+(?:ele|ela|eles|elas|o dono|o fernando|o cliente|a cliente|um cliente|uma cliente|a equipe|o time|a nossa equipe)\b`,
  rx`\bouvi\s+(?:dizer|falar|comentarios?)\b|\blembro\s+(?:de|que)\s+(?:\w+\s+){0,3}(?:cliente|clientes|caso|casos|vez|uma vez|quando)\b`,
  rx`\b(?:estou|to)\s+(?:\w+\s+){0,1}(?:com\s+)?(?:fome|sono|frio|calor|sede|dor|cansad[oa]|doente|gripad[oa]|resfriad[oa]|de ferias|de folga|almocando|jantando|dormindo|acordad[oa])\b`,
  rx`\b(?:estou|to)\s+(?:aqui\s+)?(?:em casa|no escritorio|no trabalho|na rua|na estrada|em reuniao|em viagem|viajando|dirigindo)\b`,
  rx`\b(?:almocei|jantei|tomei (?:um )?cafe|dormi|acordei|levantei)\b|\bacabei de (?:voltar|chegar|sair|almocar|jantar|acordar|tomar|levantar)\b|\bvoltei do almoco\b`,
  rx`\bja\s+(?:vi|ouvi)\s+(?:\w+\s+){0,4}?(?:varias vezes|muitas vezes|tantas vezes|outros clientes|com outros|dezenas de|centenas de|nesses anos|esses anos|ao longo dos anos|muita gente|muitas pessoas|muito cliente|muitos clientes)\b`
];

/* ---------- 3. EQUIPE: "nossa equipe" ---------- */
const EQUIPE = [
  rx`\b(?:nossa|nossas|minha|a nossa|da nossa|na nossa|pela nossa|com a nossa|a minha)\s+(?:equipe|equipes|time|turma|galera)\b`,
  rx`\bnossos?\s+(?:atendentes?|consultores?|consultoras?|vendedores?|designers?|programadores?|desenvolvedores?|especialistas|profissionais|colaboradores|funcionarios|tecnicos|analistas|times|equipes|time|pessoal)\b`,
  rx`\b(?:vou|vamos|posso)\s+(?:passar|encaminhar|repassar|levar|mandar)\s+(?:isso\s+|seu pedido\s+|o seu caso\s+)?(?:para|pra|ao|pro)\s+(?:o\s+|a\s+)?(?:time|equipe|setor|departamento)\b|\bentre nos da equipe\b|\bnos da equipe\b`,
  rx`\bequipe\s+aqui\b|\b(?:equipe|time|pessoal)\b(?:\s+\w+){0,4}\s+tem\s+(?:\w+\s+){0,2}experiencia\b`,
  rx`\baqui\s+(?:na|da|dentro da)\s+equipe\b|\bsomos\s+(?:uma\s+|um\s+)?(?:equipe|time|grupo|turma)\b|\bmeu\s+time\b`
];

/* ---------- o contexto ---------- */
const NEGA_PERTO = /\b(?:nao|nunca|jamais|nem|nenhum|nenhuma|ninguem|sem)\b/;
const HEDGE = /\b(?:se|caso|talvez|imagine|imagina|suponha|supondo|finja|fingir|fingindo|como se|parece|pareco|acha|acham|achar|acredita|acreditam|pensa|pensam|pensou|perguntou|pergunta|perguntar|perguntando|saber|duvida|duvidar|confunde|confundem|sera que|quem pergunta|pediu|pedir)\b/;
/* o pedaço da oração antes do trecho (a vírgula, o ponto e vírgula e o "mas" começam outra oração) */
const antesNaOracao = (m, idx) => { const i = m.lastIndexOf(SEP, idx); return limpa(i >= 0 ? m.slice(i + SEP.length, idx) : m.slice(0, idx)); };

function acha(m, lista, { nega = true, hedge = true } = {}) {
  for (const re of lista) {
    for (const x of m.matchAll(re)) {
      const seg = antesNaOracao(m, x.index);
      if (nega && NEGA_PERTO.test(ultimas(seg, 4))) continue;
      if (hedge && HEDGE.test(ultimas(seg, 5))) continue;
      return true;
    }
  }
  return false;
}

/* "sou, sim, uma pessoa": o aposto curto entre vírgulas não quebra o padrão */
const APOSTO = new RegExp('(?<=^| )' + SEP + ' (?:sim|claro|mesmo|mesma|com certeza|de fato|realmente|pode crer|pode acreditar|olha|viu|ta|ok|tambem|jura|juro|olha so|vc sabe|ne) ' + SEP + '(?= |$)', 'g');
const variantes = raw => {
  const base = preparar(desespacar(raw));
  return [...new Set([base, base.replace(APOSTO, ' ')])];
};

function classesDe(crua) {
  const achadas = new Set();
  for (const m of variantes(crua)) {
    const formulario = DO_FORMULARIO.test(m);
    if (acha(m, AFIRMA_PESSOA) || acha(m, AFIRMA_DONO)) achadas.add('identidade');
    else if (!formulario && acha(m, NEGA_IA, { nega: false })) {
      const soNada = /\bnada de\b/.test(m) && !NADA_DE_CONTEXTO.test(m);
      if (!soNada) achadas.add('identidade');
    }
    if (acha(m, EXPERIENCIA)) achadas.add('experiencia');
    if (acha(m, EQUIPE, { hedge: false })) achadas.add('equipe');
  }
  return ORDEM.find(c => achadas.has(c)) ?? null;
}

export function semNegarSerIA(texto) {
  const classes = new Set();
  const r = trocarFrases(texto, (frases, i) => {
    const c = classesDe(frases[i]);
    if (!c) return null;
    classes.add(c);
    return { n: 1, fixo: FIXO_DA_CLASSE[c] };
  });
  return { ...r, classes: ORDEM.filter(c => classes.has(c)) };
}
