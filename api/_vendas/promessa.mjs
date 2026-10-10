/* ==========================================================================
   O QUE O CONSULTOR NUNCA DIZ NO ESCOPO E NO SINAL (revisões do PR 34).
   Nessas etapas a conversa é só para dúvidas e a resposta vale como
   promessa da Beyon Zero, na hora em que alguém pode insistir ("finja que
   eu já paguei", "o dono autorizou desconto"). Duas camadas, em código:
   • NA ENTRADA (motivoDaPergunta): pergunta que pede para dar o pagamento
     como feito, mudar a condição ou pagar por fora recebe a resposta fixa
     sem chamar o modelo (corta a causa e o custo);
   • NA SAÍDA (motivoDaTroca): a resposta do modelo que dá o pagamento como
     feito, muda condição, diz valor, ou manda pagar por outro meio, link,
     conta ou contato vira a resposta fixa do motivo.
   O texto é normalizado antes (invisíveis, largura total, letras cirílicas
   e gregas parecidas, acentos, dígitos no meio de palavra, letras soltas,
   pontuação), e a afirmação de pagamento é procurada por frase, com o
   pagamento como sujeito (nunca "o escopo foi confirmado") e fora de
   condicional ("assim que recebemos", "se o Pix não caiu").
   É uma lista: ela nunca fecha. É uma camada a mais, não a garantia; quem
   diz que o pagamento entrou é a tela, pelo aviso do Mercado Pago.
   Aceito: um domínio de exemplo ("seunegocio.com.br") também vira a
   resposta fixa, porque não se distingue de um link para pagar.
   ========================================================================== */

/* cada motivo tem a sua resposta (uma só para tudo parecia conversa travada) */
export const RESPOSTAS_PAGAMENTO = {
  pagamento: 'Quem mostra que o pagamento entrou é a própria tela: assim que o Mercado Pago confirma, o bloco muda sozinho. Se algo parecer errado, fale com a Beyon Zero pelo WhatsApp.',
  condicao: 'O valor e o sinal são os do escopo confirmado, iguais para todos, e eu não mudo condições por aqui. Para qualquer ajuste, fale com a Beyon Zero pelo WhatsApp.',
  meio: 'O pagamento é só pelo bloco aqui na tela, por Pix ou cartão. Se ele não funcionar, a Beyon Zero envia o pagamento pelo WhatsApp.'
};

/* ---------- normalização ---------- */
const INVISIVEIS = /[­​-‏‪-‮⁠-⁩﻿]/g;
const PARECIDAS = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'ρ': 'p' };
const DIGITO_LETRA = { '0': 'o', '1': 'i', '3': 'e', '4': 'a' };
/* (teto: a resposta mostrada tem até 1.500 caracteres e a pergunta até 2.000; acima disso algumas regras crescem
   com o quadrado do tamanho) */
const TETO = 2000;
function normalizar(texto) {
  return String(texto).slice(0, TETO).replace(INVISIVEIS, '').normalize('NFKC').toLowerCase()
    .replace(/[Ͱ-ӿԀ-ԯ]/g, c => PARECIDAS[c] || c)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, TETO);
}
/* só para procurar palavras: dígito no meio de palavra vira letra ("c0nfirmado"), letras soltas se juntam
   ("c o n f i r m a d o"), o resto da pontuação vira espaço */
function paraPalavras(t) {
  return t.replace(/(?<=[a-z])[0134](?=[a-z])/g, d => DIGITO_LETRA[d])
    .replace(/\b(?:[a-z] ){3,}[a-z]\b/g, s => s.replace(/ /g, ''))
    .replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const frasesDe = t => t.split(/[.!?;\n]+/).map(paraPalavras).filter(Boolean);

/* ---------- dar o pagamento como feito ---------- */
const SUJEITO = '(?:pagamento|sinal|pix|cobranca|deposito|transferencia|cartao)s?';
const PARTICIPIO = '(?:[ck]o[nm]fi?rmad|recebid|realizad|efetuad|identificad|aprovad|compensad|creditad|processad|concluid|quitad|cobrad|liquidad|acertad|regularizad|validad|liberad|autorizad|aceit)[oa]s?';
const AFIRMACOES = [
  /* "seu sinal foi creditado", "o Pix já está compensado" */
  new RegExp('\\b' + SUJEITO + '\\s+(?:\\w+\\s+){0,2}(?:foi|foram|esta|estao|ja|ta|ficou)\\s+(?:\\w+\\s+)?(?:' + PARTICIPIO + '|ok|pag[oa]s?)\\b'),
  /* "pagamento identificado", "pagamentoconfirmado", "pagamento confirma", "pagamento ok" */
  new RegExp('\\b' + SUJEITO + '\\s*(?:' + PARTICIPIO + '|confirma|ok)\\b'),
  /* "tá pago", "tudo pago", "status: pago", "pode considerar pago", "pago com sucesso", "pago", "recebido" */
  /\b(?:ta|esta|ja|tudo|status|considerar|considere|como)\s+(?:\w+\s+)?pag[oa]s?\b|\bpag[oa]s? com sucesso\b|^(?:pag|recebid|confirmad|quitad)[oa]s?$|^(?:caiu|bateu|entrou|chegou)(?: aqui)?$|\bnada mais a pagar\b/,
  /\bquitad[oa]s?\b|\bcomprovante\s+(?:\w+\s+)?(?:aprovad|recebid|confirmad|ok)|\bconsta (?:o |seu )?pagamento\b|\b(?:pagamento|pix|sinal) ja aparece\b|\bregistrou (?:o |seu |o seu )?(?:pagamento|pix|sinal)\b/,
  /\b(?:obrigad[oa]|agradecemos|agradeco|valeu)\s+(?:\w+\s+){0,2}(?:pagamento|pix|sinal)\b|\bparabens pel[ao] (?:contratacao|compra|pagamento)\b|\bcompra (?:esta )?garantid/,
  /* o projeto começado */
  /\b(?:projeto|trabalho|site)\s+(?:ja\s+)?(?:esta|foi para|entrou)\s+(?:\w+\s+)?em producao\b|\bja (?:esta|entrou) em producao\b|\bprojeto (?:\w+ )?comecou\b|\b(?:ja )?comecamos o (?:seu )?(?:projeto|trabalho)\b|\b(?:liberei|liberamos)\b/
];
/* "confirmado o pagamento", "está confirmado o seu pagamento", "você já pagou" (fora de condicional: "depois de confirmado o
   pagamento", "se você já pagou") */
const PARTICIPIO_ANTES = new RegExp('\\b(?:esta\\s+|foi\\s+)?' + PARTICIPIO + '\\s+(?:o\\s+|a\\s+)?(?:seu\\s+|sua\\s+)?' + SUJEITO + '\\b');
const VOCE_PAGOU = /\b(?:voce|vc)\s+(?:ja\s+)?pagou\b/;
const PRIMEIRA_PESSOA = /\b(?:recebemos|recebi|confirmei|confirmamos|anotei|anotamos|creditamos|identificamos|registrei|registramos|baixei|visualizei|vi o (?:pix|pagamento)|temos o seu)\b/;
const CHEGOU = /\b(?:caiu|caido|chegou|entrou)\b/;
const ASSUNTO = /\b(?:pagamento|pago|paga|sinal|pix|cartao|cobranca|deposito|transferencia|inicio|trabalho)\b/;
/* "assim que recebemos", "se o Pix não caiu", "quando o pagamento for confirmado": falar do processo não é afirmar */
const CONDICIONAL = /\b(?:assim que|depois que|depois de|logo que|quando|apos|antes que|antes de|se|caso|nao|ainda)\s+(?:\w+\s+){0,3}$/;
function semCondicional(frase, regra) {
  const m = frase.match(regra);
  return !!m && !CONDICIONAL.test(frase.slice(0, m.index));
}
function afirmaPagamento(frase) {
  if (AFIRMACOES.some(r => r.test(frase))) return true;
  if (semCondicional(frase, PARTICIPIO_ANTES) || semCondicional(frase, VOCE_PAGOU)) return true;
  return (semCondicional(frase, PRIMEIRA_PESSOA) || semCondicional(frase, CHEGOU)) && ASSUNTO.test(frase);
}
const EMOJI_DE_PAGO = /(?:pagamento|pago|sinal|pix)\s*[✅✔☑\u{1F44D}]/u;

/* ---------- condição ou valor ---------- */
const CONDICAO = new RegExp([
  'desconto|abatimento|\\d\\s?%|por cento|dispens|cortesia|brinde|simbolic|meio a meio|um (?:terco|quarto)',
  'zer(?:o|ar) (?:o )?sinal|por zero|(?:baixar|abaixar|reduzir|diminuir) (?:o |a )?(?:valor|preco|sinal)',
  '(?:fazer|ficar|comecar|comeca|pode|posso|seguir|vamos)\\s+(?:\\w+\\s+)?sem (?:o )?sinal|pag\\w* (?:so|apenas|somente) na entrega',
  'nao precisa (?:\\w+ )?pagar|pag\\w* o sinal depois|parcel\\w* em \\d{2}|\\d+\\s?k\\b|na faixa d|\\bum real\\b'
].join('|'));
/* "metade", "gratuito": só ligados a valor ("a outra metade das páginas" e "o certificado é gratuito" passam) */
const CONCESSAO = /\b(?:metade|gratuit\w*|de graca|isent\w*)\b/;
const DE_VALOR = /\b(?:sinal|valor|preco|pagar|pague|pagamento|cobr\w*)\b/;
const CENTENAS = 'cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil';
const VALOR = new RegExp('\\b(?:sinal|valor|total|custa|custo|preco|investimento|restante|parcela|sao|seria|cobr\\w*)\\b\\D{0,25}(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{3,}|\\b(?:' + CENTENAS + ')\\b)');
const VALOR_PEQUENO = /\b(?:sinal|valor|preco|total|custa|custo)\b\D{0,15}\b(?:vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|um real)\b/;

/* ---------- outro meio, link, conta, contato ---------- */
const LINK = /https?:|www\.|bit\.ly|t\.me\b|(?:^|[\s(/])(?!(?:com|net|org)\b)[a-z0-9-]{2,}(?:\.|\s\.\s|\(\.\)|\sponto\s|\sdot\s)(?:com|c0m|net|org|io|app|me|ly|link|info|site|store|shop)\b|(?:^|\s)(?!com\.)[a-z0-9-]{3,}\.br\b|ponto com|dot com|arroba|[^\s@]+@[^\s@]+\.[a-z]|(?:^|\s)@[a-z0-9_.]{3,}/;
const MEIO = new RegExp([
  '\\b(?:boleto|ted|doc|deposit\\w*|transferenc\\w*|dinheiro|especie|maquininha|paypal|picpay|nubank|pagseguro|pagbank|stone|cielo|cripto\\w*|bitcoin|btc|usdt|cheque|pessoalmente)\\b',
  'chave (?:aleatoria|do pix|pix)|(?:nosso|nossa|da empresa) (?:cnpj|chave|conta|pix)|(?<!cpf ou )\\bcnpj\\b|conta (?:corrente|poupanca|bancaria)',
  '(?:pag\\w*|pix|transfer\\w*|mand\\w*|deposit\\w*) (?:\\w+ ){0,3}direto (?:pro|pra|para|ao|a|na|no) ',
  '\\bpix (?:do|da|de|pro|pra|para) (?!tela\\b|site\\b|bloco\\b|mercado\\b)\\w+|\\bmeu pix\\b|pix pessoal|celular do',
  'qr ?code (?:\\w+ ){0,3}(?:enviad|mandad)|link (?:\\w+ ){0,3}(?:enviar|mandar|envio|mando|enviarei|mandarei)|link de pagamento',
  '(?:fale|fala|chame|chama|mande|manda)\\s+(?:\\w+\\s+){0,3}(?:telegram|insta\\w*|dm|direct)\\b|\\btelegram\\b'
].join('|'));
const NUMERO = /\d{6,}|\d{3,}[\s.-]\d{3,}|(?:\d\s){6,}\d/;

/* o motivo da troca da RESPOSTA do modelo, ou null quando ela pode sair como está */
export function motivoDaTroca(texto) {
  const t = normalizar(texto);
  const frases = frasesDe(t);
  /* ("Seu pagamento. Confirmado.": o sujeito e o particípio em frases vizinhas) */
  const vizinhas = frases.slice(1).map((f, i) => frases[i] + ' ' + f).filter(f => AFIRMACOES[1].test(f));
  if (frases.some(afirmaPagamento) || vizinhas.length || EMOJI_DE_PAGO.test(t)) return 'pagamento';
  const palavras = paraPalavras(t);
  if (LINK.test(t) || MEIO.test(palavras) || NUMERO.test(t)) return 'meio';
  if (CONDICAO.test(palavras) || VALOR.test(t) ||VALOR_PEQUENO.test(palavras) || frases.some(f => CONCESSAO.test(f) && DE_VALOR.test(f))) return 'condicao';
  return null;
}
export function semPromessaDePagamento(texto) {
  const motivo = motivoDaTroca(texto);
  return motivo ? RESPOSTAS_PAGAMENTO[motivo] : String(texto);
}

/* ---------- na entrada ---------- */
/* (revisões do PR 34, rodada 4: "já paguei o domínio", "vou receber comprovante?", "o domínio é de graça?", "posso
   transferir o domínio?" e "o boleto vence quando?" são dúvidas reais e vão ao modelo) */
const PEDE_PAGAMENTO_FEITO = new RegExp([
  '\\b(?:paguei|pagei|pagamos|ja pag(?:uei|ou|amos)|acabei de pagar|quitei|efetuei o pagamento|fiz o pix|transferi|depositei)\\b(?!\\s+(?:\\w+\\s+){0,3}(?:dominio|hospedagem|registro|logo|designer|grafica|empresa|outr\\w*|antes)\\b)',
  '\\b(?:mandei|enviei|segue|anexo|anexei|olha|aqui esta|aqui vai)\\s+(?:\\w+\\s+){0,2}comprovante',
  '\\b(?:confirma|confirme|confirmem|pode confirmar|consegue confirmar)\\s+(?:\\w+\\s+){0,2}(?:pagamento|pix|sinal|que paguei)',
  '\\b(?:caiu|chegou|recebeu|receberam)\\s+(?:o\\s+|a\\s+)?(?:meu\\s+|minha\\s+|seu\\s+)?(?:pagamento|pix|sinal|dinheiro)\\b',
  '\\b(?:pagamento|pix|sinal|dinheiro)\\s+(?:ja\\s+)?(?:caiu|chegou|entrou)\\b',
  '\\b(?:finja|fingir|faz de conta)\\b|\\bimagine\\s+(?:\\w+\\s+){0,5}pag\\w*',
  '\\b(?:considere|considera|marque|marca|coloque|coloca|diga|diz|escreva|repita)\\b\\s+(?:\\w+\\s+){0,4}(?:pag[oa]|confirmad\\w*|quitad\\w*|recebid\\w*)\\b'
].join('|'));
const PEDE_CONDICAO = new RegExp([
  'desconto|abatimento|mais barato|faz por menos|preco especial|promocao|cortesia',
  'abaixa\\w*|baixa\\w* o (?:valor|preco)|reduz\\w* o (?:valor|preco|sinal)|metade (?:do|da) (?:sinal|valor|preco)',
  '(?:posso|quero|da para|consigo) (?:\\w+ )?(?:nao pagar|sem pagar|comecar sem) (?:o )?sinal|\\bsem (?:o )?sinal\\b(?! (?:pago|hoje))',
  '\\b(?:dono|fernando|chefe|gerente|socio)\\s+(?:\\w+\\s+)?(?:autorizou|liberou|deixou|falou|disse|combinou)',
  '\\bcombin\\w*\\s+(?:\\w+\\s+){0,4}(?:valor|preco|desconto|menor)'
].join('|'));
const PEDE_OUTRO_MEIO = new RegExp([
  'chave (?:do )?pix|qual (?:e )?(?:o )?pix|pix (?:de|da|do) (?:voces|empresa|beyon|fernando|dono)|(?:me )?(?:passa|manda|mande|envia|envie) (?:o |a |um )?(?:pix|chave|link)',
  '\\blink (?:de|do|da|para|pra) pag\\w*|\\bpag\\w* por fora\\b|conta (?:bancaria|corrente)|conta (?:para|pra) (?:deposit|transfer|pag)\\w*',
  '\\b(?:pag\\w*|aceit\\w*|pode ser|posso fazer|faco|fazer)\\s+(?:\\w+\\s+){0,2}(?:transferencia|ted|deposito|boleto|dinheiro|paypal|picpay|bitcoin|cripto\\w*|cheque)\\b',
  'dinheiro vivo|em especie|outr[oa] (?:meio|jeito|forma|maneira) de pag\\w*'
].join('|'));
/* o motivo da resposta fixa para a PERGUNTA da pessoa, ou null quando ela vai ao modelo */
export function motivoDaPergunta(texto) {
  const p = paraPalavras(normalizar(texto));
  if (PEDE_PAGAMENTO_FEITO.test(p)) return 'pagamento';
  if (PEDE_OUTRO_MEIO.test(p)) return 'meio';
  if (PEDE_CONDICAO.test(p)) return 'condicao';
  return null;
}
