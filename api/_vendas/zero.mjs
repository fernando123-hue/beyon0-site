/* ==========================================================================
   O ZERO — as travas de CÓDIGO da personificação da Beyon Zero (dono, 2026-10-31).
   O prompt (api/_vendas/consultor.mjs) diz o que o Zero faz; aqui está o que o
   código GARANTE mesmo que o modelo erre (relatório de 31/10: "Pode incluir, com
   cuidado" para antes e depois de dentista; "Deixei o recado" sem recado nenhum;
   o valor nunca escrito no chat). Cada trava olha só a resposta que vai para a
   tela, em português do Brasil, com a mesma normalização da promessa.mjs
   (acentos, caixa, letras soltas), e troca por TEXTO FIXO: nunca tenta
   "consertar" a frase do modelo.
   • recado: o Zero não envia, não deixa, não avisa nem anota nada a ninguém;
     só a pessoa, no botão DEIXAR UM RECADO, deixa um recado;
   • saúde e regulados: nunca depoimento, antes e depois, preço ou promoção de
     procedimento; vale a sessão inteira (briefing e histórico), não só a última
     mensagem; veterinária e estética automotiva não travam (o prompt manda
     perguntar antes);
   • valor: o modelo escreve [[total]], [[sinal]] e [[restante]] e o número
     exato vem do motor de preços, DEPOIS de todos os filtros (um "R$" escrito
     pelo modelo já foi apagado antes). É uma lista: nunca fecha. É uma camada a
     mais; a tela e o motor continuam sendo a verdade.
   ========================================================================== */
import { normalizar } from './promessa.mjs';

/* ---------- textos fixos ---------- */
export const RECADO_FIXO = 'Se quiser, toque em DEIXAR UM RECADO aqui embaixo. O dono lê e responde por e-mail.';
const SEM_VALOR = 'Esse valor eu ainda não tenho aqui.';

/* a primeira fala (texto fixo e aprovado; sem chamar o modelo até a pessoa escrever) e as variantes por página de origem.
   A etiqueta fixa da interface é ETIQUETA. O texto vai ao modelo no estado como "a pessoa já viu isto" */
export const NOME = 'Zero';
export const ETIQUETA = 'Zero, assistente virtual (IA) da Beyon Zero';
export const ABERTURA_PADRAO = 'Oi, eu sou o Zero, a IA da Beyon Zero. Me conta o que você faz que eu te digo qual formato de site serve pro seu negócio e quanto fica.';
export const ABERTURAS = Object.freeze({
  padrao: ABERTURA_PADRAO,
  sites: 'Oi, eu sou o Zero, a IA da Beyon Zero. Pra qual tipo de negócio você está pensando em site?',
  atendente: 'Oi, eu sou o Zero, a IA da Beyon Zero. Hoje, quem responde seus clientes quando eles chamam?',
  retorno: 'Oi de novo, o Zero aqui, a IA da Beyon Zero. Você parou na escolha dos modelos. Quer continuar de onde parou?'
});

/* ---------- apoio: frases e normalização ---------- */
/* a frase com o que a separa da seguinte (espaço ou quebra), para remontar o texto sem perder parágrafo */
export function frasesDe(texto) {
  return String(texto).match(/(?:[^.!?\n]|(?<=\d)\.(?=\d))+(?:[.!?]+|\n)?\s*|\s+/g)?.filter(f => f.trim()) ?? [];
}
const DIGITO_LETRA = { 0: 'o', 1: 'i', 3: 'e', 4: 'a' };
/* para procurar palavras: sem acento e caixa, dígito no meio de palavra vira letra, letras soltas se juntam, pontuação some */
export function paraBusca(frase, { soltaFinal = false } = {}) {
  return normalizar(frase)
    .replace(/(?<=[a-z])[0134](?=[a-z])/g, d => DIGITO_LETRA[d])
    /* ("d e i x e i o recado": a última letra pode ser a palavra "o"; a segunda leitura a deixa solta) */
    .replace(/\b(?:[a-z] ){3,}[a-z]\b/g, s => { const j = s.replace(/ /g, ''); return soltaFinal && /[aoe]$/.test(j) ? j.slice(0, -1) + ' ' + j.slice(-1) : j; })
    .replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
/* ("não deixei": o que vem negado não é promessa) */
/* (o "não" só vale colado ao verbo, com no máximo um pronome ou advérbio curto no meio: "não te deixei" é negação;
   "não se preocupe, deixei" e "não tem problema, mandei" não são) */
const negado = (frase, m) => /\b(?:nao|nunca|jamais)\b/.test(m[0]) || /\b(?:nao|nunca|jamais)\s+(?:(?:te|lhe|se|o|a|eu|ainda|mais|a gente)\s+)?$/.test(frase.slice(0, m.index));

/* ---------- 1. o recado ---------- */
const ALVO = '(?:recado|mensagem|equipe|dono|fernando|responsavel|(?:pra|para|pro|com) ele)';
const ALVO_FECHADO = '(?:recado|mensagem|equipe|(?:pro|para o|pra o|ao|com o) (?:dono|fernando)|(?:pra|para|pro|com) ele)';
const ENVIO = '(?:deixei|deixamos|enviei|enviamos|mandei|mandamos|passei|passamos|repassei|repassamos|comuniquei|notifiquei|protocolei)';
const REGISTRO = '(?:anotei|anotamos|registrei|registramos|gravei|guardei)';
const PROMESSAS_DE_RECADO = [
  /* "deixei o recado", "mandei pro dono a sua dúvida", "enviei a mensagem para a equipe" */
  new RegExp('\\b' + ENVIO + '\\b(?:\\s+\\w+){0,8}?\\s+' + ALVO + '\\b'),
  /* "anotei pro dono", "registrei o recado": o ramo anotado no briefing não conta, só o que vai para alguém */
  new RegExp('\\b' + REGISTRO + '\\b(?:\\s+\\w+){0,8}?\\s+' + ALVO_FECHADO + '\\b'),
  /* sempre sobre passar adiante */
  /\b(?:avisei|avisamos|encaminhei|encaminhamos|notifiquei)\b/,
  /* "o recado foi enviado", "seu recado já foi registrado" */
  /\b(?:recado|mensagem|duvida)\s+(?:\w+\s+){0,2}(?:foi|foram|esta|ficou)\s+(?:\w+\s+)?(?:enviad|registrad|anotad|encaminhad|deixad|repassad|entregue)/,
  /* "a equipe já foi avisada", "o dono já foi notificado" */
  /\b(?:equipe|dono|fernando|time)\s+(?:\w+\s+){0,2}(?:foi|foram|esta|ficou)\s+(?:\w+\s+)?(?:avisad|notificad|informad|ciente)/,
  /\bja (?:esta|ficou) com (?:ele|o dono|a equipe|o fernando)\b/,
  /\b(?:dono|equipe|fernando|time)\s+ja\s+(?:recebeu|viu|leu|sabe|esta ciente)\b/,
  /* "vou passar pra ele", "vou avisar o dono", "vou deixar o recado" */
  new RegExp('\\bvou\\s+(?:\\w+\\s+){0,2}(?:avisar|passar|repassar|encaminhar|mandar|enviar|deixar|registrar|anotar|comunicar|notificar)\\b(?:\\s+\\w+){0,6}?\\s+' + ALVO + '\\b'),
  /* prazo de resposta que ninguém prometeu */
  /\brespond\w*\s+(?:\w+\s+){0,4}(?:hoje|amanha|em breve|logo|rapido|rapidinho|ainda hoje|em ate|em \d|ate \d|dentro de|no mesmo dia|em algumas horas)/,
  /\bretorn\w*\s+(?:\w+\s+){0,4}(?:hoje|amanha|em breve|em ate|em \d|ate \d|dentro de|no mesmo dia)/
];
function prometeRecado(frase) {
  return [paraBusca(frase), paraBusca(frase, { soltaFinal: true })].some(t =>
    PROMESSAS_DE_RECADO.some(r => { const m = t.match(r); return !!m && !negado(t, m); }));
}
/* a primeira frase com promessa vira o texto fixo; as outras com promessa saem; o resto da resposta fica */
export function semPromessaDeRecado(texto) {
  const frases = frasesDe(texto);
  if (!frases.some(prometeRecado)) return { texto: String(texto), trocou: false };
  let jaPos = false;
  const saida = [];
  for (const f of frases) {
    if (!prometeRecado(f)) { saida.push(f); continue; }
    if (jaPos) continue;
    jaPos = true;
    saida.push(RECADO_FIXO + (/\s$/.test(f) ? f.match(/\s+$/)[0] : ''));
  }
  return { texto: saida.join('').trim(), trocou: true };
}

/* ---------- 2. saúde e regulados ---------- */
/* cada nicho: o que a pessoa diz, o nome dela, o conselho e o que cabe num site informativo (todos com "como marcar") */
const CABE = 'quem você é, o número do {R}, as especialidades, como marcar e onde fica';
const NICHOS = [
  { chave: 'odontologia', re: /\b(?:dentist\w*|odontolog\w*|ortodont\w*|implantodont\w*|endodont\w*|periodont\w*)\b/, site: 'dentista', conselho: 'CRO', registro: 'CRO' },
  { chave: 'psicologia', re: /\b(?:psicolog\w*|psicanalis\w*|terapeuta\w*)\b/, site: 'psicologia', conselho: 'CRP', registro: 'CRP' },
  { chave: 'nutricao', re: /\b(?:nutricionist\w*|nutrolog\w*)\b/, site: 'nutrição', conselho: 'CRN', registro: 'CRN' },
  { chave: 'fisioterapia', re: /\b(?:fisioterap\w*|fisiatra)\b/, site: 'fisioterapia', conselho: 'CREFITO', registro: 'CREFITO' },
  { chave: 'medicina', re: /\b(?:medic[oa]s?|clinica medica|dermatolog\w*|cardiolog\w*|pediatr\w*|ginecolog\w*|ortoped\w*|oftalmolog\w*|urolog\w*|psiquiatr\w*|neurolog\w*|endocrinolog\w*|cirurgi[ao] plastic\w*)\b/, site: 'médico', conselho: 'CRM', registro: 'CRM' },
  { chave: 'fonoaudiologia', re: /\bfonoaudiolog\w*\b/, site: 'fonoaudiologia', conselho: 'CREFONO', registro: 'CREFONO' },
  { chave: 'enfermagem', re: /\benfermeir\w*\b/, site: 'enfermagem', conselho: 'COREN', registro: 'COREN' },
  { chave: 'biomedicina', re: /\bbiomedic\w*\b/, site: 'biomedicina', conselho: 'CRBM', registro: 'CRBM' },
  { chave: 'estetica', re: /\b(?:estetic\w*|esteticista\w*|harmonizacao|botox|preenchimento facial|micropigmentacao)\b/, site: 'estética', conselho: 'conselho', registro: 'registro profissional', procedimento: 'procedimento' },
  { chave: 'advocacia', re: /\b(?:advogad\w*|advocacia|oab|escritorio juridico)\b/, site: 'advocacia', conselho: 'OAB', registro: 'OAB', procedimento: 'serviço', cabe: 'quem você é, o número da OAB, as áreas de atuação, como marcar uma conversa e onde fica' }
];
/* o que desfaz o sinal: médico veterinário e pet não são saúde humana; estética de carro não é estética (o prompt manda perguntar) */
const VETERINARIO = /\b(?:medic[oa]s? veterinari\w*|veterinari\w*|vet|pets?|pet shop|petshop|banho e tosa|animais|animal)\b/g;
const AUTOMOTIVO = /\b(?:automotiv\w*|carros?|veiculos?|lava ?jato|funilaria|motos?|auto ?(?:center|pecas)|oficina)\b/;
/* "meu dentista", "minha advogada": é o profissional de outra pessoa, não o ramo dela */
const DE_OUTRO = /\b(?:meu|minha|meus|minhas|seu|sua|nosso|nossa)\s+(?:advogad|medic|dentist|psicolog|nutricionist|fisioterapeut|terapeut|esteticist)\w*/g;

function descreverNicho(n) {
  const registro = n.registro;
  return Object.freeze({
    chave: n.chave, site: n.site, conselho: n.conselho,
    conselhoTexto: n.conselho === 'conselho' ? 'o conselho da sua profissão' : 'o seu ' + n.conselho,
    procedimento: n.procedimento || 'procedimento',
    cabe: n.cabe || CABE.replace('{R}', registro)
  });
}
/* o nicho regulado que o texto indica, ou null (ambíguo também é null: o Zero pergunta antes de aplicar a regra) */
export function nichoRegulado(texto) {
  let t = paraBusca(texto);
  if (!t) return null;
  t = t.replace(VETERINARIO, ' ').replace(DE_OUTRO, ' ');
  const auto = AUTOMOTIVO.test(t);
  for (const n of NICHOS) {
    const re = n.chave === 'estetica' && auto ? null : n.re;
    if (re && re.test(t)) return descreverNicho(n);
  }
  return null;
}

/* o que a Beyon não faz em site desses negócios, quando pedido */
const PEDIDOS_PROIBIDOS = [
  /\b(?:depoiment\w*|testemunh\w*)\b/,
  /\bantes (?:e )?depois\b/,
  /\bavaliac(?:ao|oes)\s+(?:\w+\s+){0,2}(?:de|dos|das)\s+(?:meus\s+|minhas\s+)?(?:paciente|cliente)s?\b/,
  /\b(?:resultados?|fotos?)\s+(?:de|dos|das)\s+(?:pacientes?|casos|tratamentos)\b/,
  /\btabela de precos?\b/,
  /\b(?:preco|valor|promocao|desconto|pacote|oferta)s?\s+(?:\w+\s+){0,3}(?:procediment\w*|clareamento\w*|consulta\w*|sessa[oe]s?|tratamento\w*|botox|preenchimento\w*|limpeza|harmonizacao|implante\w*|cirurgia\w*|honorario\w*|aparelho|lentes?)\b/,
  /\b(?:procediment\w*|clareamento|botox|preenchimento|implante|sessao|consulta|tratamento|limpeza)s?\s+(?:\w+\s+){0,3}(?:com )?(?:preco|valor|promocao|desconto)\b/,
  /\b(?:sessao|consulta|avaliacao|primeira \w+|1a \w+)\s+(?:gratis|gratuit\w*)\b/,
  /\bsorteio\w*\b/
];
/* ("valor do site para tratamento de pacientes" é o preço do site, não de procedimento) */
const DO_SITE = /\b(?:site|pagina|paginas|landing|loja|orcamento|sinal)\b/;
export function pedeItemProibido(texto) {
  const t = paraBusca(texto);
  return PEDIDOS_PROIBIDOS.some(r => { const g = new RegExp(r.source, 'g'); return [...t.matchAll(g)].some(m => !DO_SITE.test(m[0])); });
}

/* a resposta do modelo, em nicho regulado: libera o proibido ou desvia do pedido sem recusar = texto fixo */
const LIBERA = /\b(?:pode\w*|posso|da (?:pra|para)|vamos|vou|inclu\w+|colo(?:co|camos|ca\w*)|fazemos|faco|entra\w*|cabe\w*|tranquilo|sem problema|claro|sim|com cuidado|combinado)\b/;
const RECUSA = /\bnao\s+(?:(?:a gente|eu|te|lhe|se|ainda|mais)\s+)?(?:colo\w+|inclu\w+|faz\w*|fazemos|aceit\w+|entra\w*|cabe\w*|trabalh\w+|public\w+|oferec\w+|poe|ponho|posso|podemos|vou|vamos|consigo|da (?:pra|para)|e (?:permitid|possivel))\w*\b|\bnunca\b|\bsem\s+(?:depoiment|antes)|\bficam? de fora\b|\bpolitica da beyon\b|\brecuso\b/;
const PROIBIDO_NA_RESPOSTA = [...PEDIDOS_PROIBIDOS];
const citaProibido = f => PROIBIDO_NA_RESPOSTA.some(r => r.test(f));

export function respostaRegulado(nicho, { insistencia = false } = {}) {
  if (insistencia) return `Isso a Beyon não faz em site de ${nicho.site}, e isso não muda. O que cabe, a gente faz.`;
  return `Entendo a vontade. Só que em site de ${nicho.site} a Beyon não coloca depoimento, antes e depois nem preço ou promoção de ${nicho.procedimento}, e vale conferir também com ${nicho.conselhoTexto}. O que cabe bem: ${nicho.cabe}. Seguimos assim?`;
}
export function garantirRegulado(texto, { nicho, pediuAgora = false, insistencia = false } = {}) {
  const original = String(texto);
  if (!nicho) return { texto: original, trocou: false };
  const buscas = frasesDe(original).map(paraBusca);
  const libera = buscas.some(f => citaProibido(f) && LIBERA.test(f) && !RECUSA.test(f));
  const recusou = buscas.some(f => RECUSA.test(f));
  if (!libera && !(pediuAgora && !recusou)) return { texto: original, trocou: false };
  return { texto: respostaRegulado(nicho, { insistencia }), trocou: true };
}

/* o briefing desses negócios nunca guarda "depoimentos" nem antes e depois (nem as direções saem com eles) */
const TEXTO_PROIBIDO = /depoiment|testemunh|antes (?:e )?depois/;
export const textoProibido = t => TEXTO_PROIBIDO.test(paraBusca(t));   /* (o painel da conversa não repete o proibido na voz da Beyon) */
const semItensProibidos = lista => { const l = lista.filter(x => !TEXTO_PROIBIDO.test(paraBusca(x))); return l.length ? l : undefined; };
export function briefingSemProibidos(briefing) {
  const b = JSON.parse(JSON.stringify(briefing || {}));
  if (Array.isArray(b.funcionalidades)) { b.funcionalidades = b.funcionalidades.filter(x => x !== 'depoimentos'); if (!b.funcionalidades.length) delete b.funcionalidades; }
  if (b.conteudo && typeof b.conteudo === 'object') { delete b.conteudo.depoimentos; if (!Object.keys(b.conteudo).length) delete b.conteudo; }
  for (const k of ['servicos', 'preferencias', 'referencias']) {
    if (!Array.isArray(b[k])) continue;
    const l = semItensProibidos(b[k]);
    if (l) b[k] = l; else delete b[k];
  }
  if (Array.isArray(b.posicionamento?.diferenciais)) {
    const l = semItensProibidos(b.posicionamento.diferenciais);
    if (l) b.posicionamento.diferenciais = l; else delete b.posicionamento.diferenciais;
  }
  return b;
}

/* o aviso do código ao modelo no estado ATUAL (o prompt já manda; isto faz o nicho valer a sessão toda) */
export function avisoRegulado(nicho, { pediuAgora = false } = {}) {
  if (!nicho) return null;
  return {
    nicho: nicho.site, conselho: nicho.conselho === 'conselho' ? 'o conselho da profissão da pessoa' : nicho.conselho,
    nunca: ['depoimento de paciente ou cliente', 'antes e depois', `preço ou promoção de ${nicho.procedimento}`, 'promessa de resultado', 'sessão grátis ou sorteio'],
    cabe: nicho.cabe, pediu_item_proibido_agora: pediuAgora,
    orientacao: 'Só site informativo. Recuse como política da Beyon, sem citar a lei, ofereça o que cabe e mande conferir com o conselho. Não registre depoimentos no briefing.'
  };
}

/* ---------- 3. o valor: os marcadores do modelo viram o número do motor ---------- */
/* o modelo às vezes escreve [[valor]], [[ entrada ]] ou [total]: sinônimos viram o número certo; qualquer outro marcador some e nunca vaza cru */
const MARCADOR = /\[\[\s*([^\[\]\n]{1,30}?)\s*\]\]|\[\s*(total|sinal|restante)\s*\]/gi;
const TEM_MARCADOR = /\[\[\s*[^\[\]\n]{1,30}?\s*\]\]|\[\s*(?:total|sinal|restante)\s*\]/i;
const CAMPO = { total: 'total', valor: 'total', 'valor total': 'total', preco: 'total', 'preço': 'total', sinal: 'sinal', entrada: 'sinal', restante: 'restante', resto: 'restante' };
const dinheiro = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ');
function valoresDe(e) {
  const total = Number(e?.valor_total), sinal = Number(e?.sinal);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(sinal) || sinal < 0 || sinal > total) return null;
  return { total, sinal, restante: Math.round((total - sinal) * 100) / 100 };
}
/* a resposta traz marcador, mas não há estimativa válida: o agente dá ao modelo mais uma volta para chamar estimar */
export const marcadorSemValor = (texto, e) => TEM_MARCADOR.test(String(texto ?? '')) && !valoresDe(e);

/* ---------- 4. a anotação interna que vaza ---------- */
/* o modelo às vezes escreve a chamada de ferramenta ou o botão como texto ("[estimar: ...]", "[Botão DEIXAR UM RECADO apareceu...]"):
   nada disso é para a tela. Apaga o trecho entre colchetes que abre com o nome de uma ferramenta ou de um elemento da tela,
   com os colchetes de dentro (os marcadores [[total]]) e a quebra de linha que sobra */
const ABRE_NOTACAO = /\[\s*(?:estimar|atualizar_briefing|pedir_contato|sugerir_solucao_ia|encaminhar_diagnostico|cart[aã]o|bot[aã]o|formul[aá]rio|ferramenta)\b/giu;
export function semNotacaoInterna(texto) {
  let t = String(texto ?? '');
  for (let guarda = 0; guarda < 20; guarda++) {
    ABRE_NOTACAO.lastIndex = 0;
    const m = ABRE_NOTACAO.exec(t);
    if (!m) break;
    let fundo = 0, fim = -1;
    for (let i = m.index; i < t.length; i++) {
      if (t[i] === '[') fundo++;
      else if (t[i] === ']' && --fundo === 0) { fim = i + 1; break; }
    }
    if (fim < 0) { const quebra = t.indexOf('\n', m.index); fim = quebra < 0 ? t.length : quebra; }   /* (colchete que não fecha: vai até o fim da linha) */
    t = (t.slice(0, m.index) + t.slice(fim)).replace(/^[ \t]*\n/, '').replace(/\n{3,}/g, '\n\n');
  }
  return t.replace(/^\s+/, '');
}

/* e: a estimativa do motor (ou a linha do banco): valor_total e sinal. Sem estimativa válida, a frase com marcador sai e entra
   "esse valor eu ainda não tenho" com o recado; nunca um número, nunca o marcador cru */
export function comMarcadores(texto, e) {
  const original = String(texto);
  if (!TEM_MARCADOR.test(original)) return { texto: original, semEstimativa: false };
  const v = valoresDe(e);
  if (v) return { texto: original.replace(MARCADOR, (_, a, b) => { const campo = CAMPO[String(a || b).toLowerCase()]; return campo ? dinheiro(v[campo]) : ''; }).replace(/ {2,}/g, ' '), semEstimativa: false };
  let jaAvisou = false;
  const saida = [];
  for (const f of frasesDe(original)) {
    if (!TEM_MARCADOR.test(f)) { saida.push(f); continue; }
    if (jaAvisou) continue;
    jaAvisou = true;
    saida.push(`${SEM_VALOR} ${RECADO_FIXO}` + (f.match(/\s+$/)?.[0] ?? ''));
  }
  return { texto: saida.join('').trim(), semEstimativa: true };
}

/* ---------- 5. o valor que a pessoa pediu e não veio ---------- */
/* relatório da rodada 3 (31/10): em todo teste a pessoa pediu o valor de 3 a 4 vezes e nunca o viu. Se ela pede o valor (ou diz que
   não apareceu), há estimativa válida e a resposta que vai para a tela não traz nenhum "R$", o CÓDIGO acrescenta uma linha fixa
   com os números do motor (os mesmos do cartão). Não depende de o modelo lembrar dos marcadores, e nunca diz onde o valor "está". */
const PEDE_VALOR = [
  /\b(?:q(?:uan|n)to\s+(?:e|fica|custa|sai|seria|vai ficar|ficou)|qual\s+(?:e\s+)?o\s+(?:valor|preco|total)|(?:fala|diz|manda|me passa|passa)\s+(?:o\s+)?(?:valor|preco|numero)|valor\s+(?:em\s+)?reais|em\s+reais)\b/,
  /\bcolchetes?\b|\bnao\s+(?:\w+\s+){0,2}(?:apareceu|aparece|aparecem|vi|vejo|consigo ver)\s+(?:\w+\s+){0,2}(?:valor|preco|numero|nada)\b|\bsem\s+(?:o\s+)?valor\b/
];
const OUTRO_ASSUNTO = /\b(?:atendente|chat|automacao|automatizar|prazo|prazos|dominio|hospedagem|mensalidade|renovacao|nota fiscal)\b/;
export function pedeValor(mensagem) {
  const t = paraBusca(mensagem);
  return !!t && !OUTRO_ASSUNTO.test(t) && (String(mensagem).includes("[[") || PEDE_VALOR.some(r => r.test(t)));
}
export function garantirValor(texto, { mensagem, estimativa } = {}) {
  const original = String(texto);
  const v = valoresDe(estimativa);
  if (!v || /R\$/.test(original) || !pedeValor(mensagem)) return { texto: original, acrescentou: false };
  const linha = `Em resumo, o site fica ${dinheiro(v.total)}, com entrada de ${dinheiro(v.sinal)} no Pix e ${dinheiro(v.restante)} quando o site entrar no ar.`;
  return { texto: (original.trim() ? original.trimEnd() + '\n\n' : '') + linha, acrescentou: true };
}

/* ---------- 6. o corte e o desconto (revisão do PR 71, 02/11) ---------- */
/* corta em fim de frase (nunca no meio de um marcador ou de uma frase fixa); sem ponto no trecho, corte duro */
export function cortarEmFrase(texto, max = 1100) {
  const t = String(texto ?? '');
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const fim = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '), corte.lastIndexOf('\n'));
  return (fim > max * 0.4 ? corte.slice(0, fim + 1) : corte).trimEnd();
}
/* o modelo nunca promete desconto: a regra é "a mesma tabela para todo mundo". Só a promessa afirmativa é trocada */
const DESCONTO = /\b(?:te|lhe|vou te|posso te|consigo te|podemos|posso|consigo|vou|damos|dou|faco|fazemos|faremos)\s+(?:\w+\s+){0,3}(?:desconto|abatimento)\b|\b\d+ ?(?:%|por cento) de desconto\b|\bdesconto de \d+/;
export const DESCONTO_FIXO = 'Desconto eu não faço, a tabela é a mesma pra todo mundo. Mas dá pra começar menor e somar o resto depois, pagando só o que for pondo.';
export function semPromessaDeDesconto(texto) {
  const original = String(texto ?? '');
  const ruim = frasesDe(original).map(f => paraBusca(f)).some(f => { const m = DESCONTO.exec(f); return m && !negado(f, m) && !/\bnao (?:existe|tem|ha) desconto\b/.test(f); });
  return ruim ? { texto: DESCONTO_FIXO, trocou: true } : { texto: original, trocou: false };
}

/* ---------- o que o Zero JÁ DISSE nesta conversa (memória do código, rodada 4 da lapidação) ----------
   O modelo só vê as últimas 12 mensagens; numa conversa longa ele esquece que já falou do aviso de IA, dos três modelos, dos 7 dias
   ou do botão do recado e repete, e as regras de "não repita" no prompt não pegaram. O código lê as falas do Zero guardadas (o banco
   entrega as últimas 60 mensagens) e devolve uma lista de rótulos nossos para o ESTADO ("ja_dito"); o prompt diz que o que está lá só
   volta se a pessoa perguntar. Só rótulos fixos saem daqui: nada do texto da conversa chega ao ESTADO. Detecção por frase
   normalizada, como as outras travas; cada padrão exige o contexto que dá o sentido ("7 dias" só com desistir/devolver, "conselho" só
   como motivo da recusa, "deixar recado" sem negação), porque um falso "já disse" cala o Zero justo onde ele precisa falar. */
const JA_DITO = Object.freeze([
  ['aviso_de_ia', /(?<!nao )\bsou (?:(?:uma|um|a|o) )?(?:ia|inteligencia artificial|robo|assistente virtual)\b|\bsou o zero,? (?:(?:uma|a) )?(?:ia|inteligencia artificial)\b|\ba ia da beyon\b/],
  ['recado_oferecido', /(?<!nao )\bdeix(?:ar|e|o) (?:(?:um|o|seu|o seu) )?recado\b|\bescreva (?:(?:um|o|seu|o seu) )?recado\b|\bbotao (?:de |do )?(?:deixar um )?recado\b/],
  ['tres_modelos_antes_de_pagar', /\btres modelos\b|\bmodelos feitos\b|\bver os modelos\b/],
  ['sete_dias_para_desistir', /\b(?:7|sete) dias[^.!?]{0,40}\b(?:desist|devol|arrepend|reembols)|\b(?:desist|devol|arrepend|reembols)\w*[^.!?]{0,40}\b(?:7|sete) dias\b/],
  ['nome_no_pix', /\bnome de quem recebe\b|\bnome do recebedor\b|\bconferir o nome\b/],
  ['modelos_em_24_horas', /\b24 ?(?:horas|h)\b/],
  ['progresso_salvo', /\bvoltar a esta pagina\b|\bprogresso (?:fica )?salvo\b/],
  ['porque_da_recusa_em_saude', /\bregras de propaganda\b|\bresponsabilidade (?:e )?d[oa] profissional\b|\bconselho[^.!?]{0,40}\b(?:proib|veda|nao deix|regra)/],
  ['valor_dito', /\br\$ ?\d|\b\d[\d.,]* reais\b/]
]);
export function jaDito(mensagens) {
  if (!Array.isArray(mensagens)) return [];
  /* lista branca: só o que o banco grava como 'agente' (papel novo no futuro não passa a valer como fala do Zero) */
  const falas = mensagens.filter(m => m && m.papel === 'agente').map(m => normalizar(String(m.conteudo ?? '')));
  return JA_DITO.filter(([, r]) => falas.some(f => r.test(f))).map(([rotulo]) => rotulo);
}

/* ---------- a pergunta que volta com as mesmas palavras (teste com o modelo real no staging, 03/11) ----------
   Quando a pessoa não responde a pergunta do Zero, o modelo a repete palavra por palavra no turno seguinte (viu-se três vezes
   seguidas), apesar de o prompt mandar reformular mais curta uma vez e mudar de assunto. É o tique mais fácil de ver, então o
   código corta: a frase com "?" que é quase igual a uma pergunta das duas últimas falas do Zero sai. Pergunta reformulada
   (mais curta, outras palavras) passa; se sobrasse só a pergunta repetida, o texto fica como veio (nunca resposta vazia). */
const PERGUNTA_IGUAL_MIN = 0.8;   /* Jaccard das palavras com mais de 2 letras */
const palavrasDaFrase = f => new Set(paraBusca(f).split(' ').filter(p => p.length > 2));
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let comuns = 0; for (const p of a) if (b.has(p)) comuns++;
  return comuns / (a.size + b.size - comuns);
};
const ehPergunta = f => /\?\s*$/.test(f.trim());
export function semPerguntaRepetida(texto, falasAnteriores) {
  const original = String(texto ?? '');
  const anteriores = (Array.isArray(falasAnteriores) ? falasAnteriores : []).slice(-2)
    .flatMap(t => frasesDe(String(t ?? '')).filter(ehPergunta)).map(palavrasDaFrase).filter(s => s.size >= 3);
  if (!anteriores.length) return { texto: original, trocou: false };
  const frases = frasesDe(original);
  const mantidas = frases.filter(f => !(ehPergunta(f) && anteriores.some(p => jaccard(palavrasDaFrase(f), p) >= PERGUNTA_IGUAL_MIN)));
  const saida = mantidas.join('').trim();
  if (mantidas.length === frases.length || !saida) return { texto: original, trocou: false };
  return { texto: saida, trocou: true };
}
