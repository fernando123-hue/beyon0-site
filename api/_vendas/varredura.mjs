/* ==========================================================================
   A VARREDURA do que sai da fila manual (spec docs/specs/2026-10-11-orcamento-sem-ia.md §4). Uma direção é só texto
   de site (nome, títulos, itens): nela não cabe endereço de site, caminho de arquivo, chave, e-mail nem telefone. Se
   um aparecer, é vazamento (o modelo copiou algo da máquina) ou injeção (o briefing veio de um desconhecido), e nada
   sai. O contato do cliente entra no site depois, pelo dono, nunca por aqui.
   Cada tipo é uma lista de detectores; um detector devolve o trecho achado ou null. A varredura olha uma cópia
   normalizada do texto (largura total vira normal, caracteres invisíveis somem), e o e-mail sai do texto antes dos
   outros tipos, para o domínio dele não virar um segundo achado. Mas o invisível em si é um achado: um texto que traz
   controle de direção ou hífen mole não tem motivo de ser, e apagá-lo antes de olhar deixava passar o que o dono lê
   diferente do que a varredura lê ("gro.eplog" invertido aparece na tela como "golpe.org").
   O arquivo mora aqui (api/_vendas) porque o SERVIDOR também varre na entrega de uma direção (api/painel.mjs): defesa em
   profundidade, caso a varredura local do dono seja pulada. scripts/varredura.mjs só reexporta este.
   Pendência PR2b1-varredura-fp (testes em docs/testes/varredura-casos.test.mjs), sempre a favor de o dono ler menos falso
   alarme sem deixar passar contato:
   - fecha: domínio com TLD fora da lista (golpe.pt, promo.digital), 9 solto sem parênteses (21 9 8765-4321), ponto disfarçado
     (golpe . com, golpe(dot)com, golpe[dot]net, golpe·com) e "ponto com" solto só quando o TLD fecha a frase;
   - deixa de alarmar: IPv4 com octeto acima de 255, faixa de preço (R$ 2500-3500), frase longa com hífens, "um ponto com
     desconto", símbolo grego solto (10 Ω), número de 11 ou 14 dígitos soltos, sem pontuação nem rótulo CPF/CNPJ e sem dígito
     verificador válido (código de barras, lote);
   - um trecho achado sai do texto antes dos tipos seguintes: a chave AIza não vira também telefone.
   ========================================================================== */
/* por propriedade Unicode, e não por lista de códigos (a lista deixava passar a marca de letra árabe, o separador mongol,
   o preenchimento hangul, as "tags" acima de U+FFFF...): Default_Ignorable_Code_Point (hífen mole, largura zero, seletores
   de variação, preenchimentos), Cf (formato: controles de direção, que invertem a leitura, marca de ordem de bytes,
   âncoras de anotação), Cc (controles C0/C1) e Co (uso privado). O arquivo não traz nenhum desses caracteres escritos. */
const INVISIVEIS = /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}\p{Co}]/gu;
/* o ponto final de outras escritas (。 U+3002, ｡ U+FF61, ． U+FF0E) vira o ponto comum: "golpe。com" é um endereço. O ponto médio
   (· U+00B7) e o operador (∙ U+2219) também, mas só quando colados a algo: "golpe·com" é endereço, "Clínica · Online" é separador */
const PONTOS_DISFARCADOS = /[。｡．]|(?<!\s)[·∙]|[·∙](?!\s)/g;
const normalizar = texto => texto.replace(INVISIVEIS, '').replace(PONTOS_DISFARCADOS, '.').normalize('NFKC').replace(INVISIVEIS, '').replace(PONTOS_DISFARCADOS, '.');
/* o alfabeto de um site brasileiro de pequeno negócio é o latino: uma letra cirílica ou armênia em qualquer lugar, ou grega
   colada a uma letra latina ("gоlpe" com o о cirílico, "Clínica Ωmega"), é um disfarce de endereço ou de nome que a lista de
   TLDs não enxerga. O símbolo grego solto ("10 Ω", ohm) é só texto. A letra estranha é o grupo capturado, quando há */
const OUTRO_ALFABETO = /[\p{Script=Cyrillic}\p{Script=Armenian}]|\p{Script=Latin}(\p{Script=Greek})|(\p{Script=Greek})\p{Script=Latin}/u;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const EMAIL_GLOBAL = new RegExp(EMAIL.source, 'gi');
const TLDS = 'com\\.br|com|net|org|io|app|dev|site|br|xyz|co|info|store|shop|online|ai|tv|me|ly|link|biz|top|club';
/* parece ano - ano (2020-2024), não telefone fixo sem DDD */
const DOIS_ANOS = /^(19|20)\d\d-(19|20)\d\d$/;

const por = re => texto => (texto.match(re) || [null])[0];

/* IPv4 de verdade: quatro números de 0 a 255 ("300.400.500.600" é versão ou código, não endereço) */
function ipv4(texto) {
  for (const [achado] of texto.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)) if (achado.split('.').every(octeto => Number(octeto) <= 255)) return achado;
  return null;
}

/* extensões de arquivo e de tecnologia que não são TLD: "Feito com Next.js" é texto, não endereço */
const NAO_TLD = 'js|mjs|ts|jsx|tsx|css|html|json|png|jpg|jpeg|gif|svg|pdf|txt|doc|docx|xls|xlsx|csv|zip';

/* a corrida longa só é chave se misturar dígitos e letras ("Pediatria/Ortopedia/Cardiologia/..." é texto) */
function corridaDeChave(texto) {
  for (const [corrida] of texto.matchAll(/[A-Za-z0-9+/=_-]{32,}/g)) {
    /* frase com hífens ("passo-1-escolha-2-..."): todos os pedaços curtos, é texto e não chave */
    if (corrida.split('-').every(pedaco => pedaco.length <= 10)) continue;
    if ((corrida.match(/\d/g) || []).length >= 3 && (corrida.match(/[a-z]/gi) || []).length >= 4) return corrida;
  }
  return null;
}

/* fixo sem DDD (2133-4455), menos quando as duas metades parecem anos ou quando é faixa de preço (R$ 2500-3500, 1000-2500-3500) */
function fixoSemDdd(texto) {
  for (const m of texto.matchAll(/\b[2-5]\d{3}-\d{4}\b/g)) {
    const antes = texto.slice(Math.max(0, m.index - 5), m.index);
    if (!DOIS_ANOS.test(m[0]) && !/R\$\s*$/.test(antes) && !/\d-$/.test(antes)) return m[0];
  }
  return null;
}

/* dígito verificador (módulo 11) com os pesos oficiais: 0 quando o resto é 0 ou 1, senão 11 menos o resto */
const digitoMod11 = (digitos, pesos) => {
  const resto = pesos.reduce((soma, peso, i) => soma + peso * Number(digitos[i]), 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
};
const PESOS_CPF = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
/* CPF e CNPJ só com os dois dígitos verificadores certos; "111.111.111-11" e afins não valem */
export function cpfValido(digitos) {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
  return digitoMod11(digitos, PESOS_CPF.slice(1)) === Number(digitos[9]) && digitoMod11(digitos, PESOS_CPF) === Number(digitos[10]);
}
export function cnpjValido(digitos) {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false;
  return digitoMod11(digitos, PESOS_CNPJ.slice(1)) === Number(digitos[12]) && digitoMod11(digitos, PESOS_CNPJ) === Number(digitos[13]);
}
/* o primeiro trecho que casa com o formato E (tem dígito verificador válido, OU vem com pontuação de documento, OU vem depois do
   rótulo CPF/CNPJ). Sem isso, um documento digitado com um dígito errado ("CNPJ 12.345.678/0001-90") deixava de ser achado; só o
   número solto, sem pontuação e sem rótulo (código de barras, lote), precisa do dígito verificador para valer */
const documentoValido = (re, valido) => texto => {
  for (const m of texto.matchAll(re)) {
    const antes = texto.slice(Math.max(0, m.index - 12), m.index);
    if (valido(m[0].replace(/\D/g, '')) || /[./-]/.test(m[0]) || /(?:cpf|cnpj)\W{0,3}$/i.test(antes)) return m[0];
  }
  return null;
};

/* [tipo, detectores, mascarar]: o trecho de chave e telefone sai só com os 4 primeiros caracteres */
const PADROES = [
  ['endereço de site', [
    por(/\b[a-z][a-z0-9+.-]{1,9}:\/\//i), /* qualquer esquema (https://, ftp://, file://, hxxp://) */
    por(/(?:^|[\s"'(])\/\/[a-z0-9]/i), por(/\bwww\./i), por(/\bwa\.me\b|\bbit\.ly\b|\blocalhost\b/i),
    ipv4, por(/[a-z][[(]\.[\])][a-z]/i),
    por(new RegExp('\\b[a-z0-9][a-z0-9-]*\\.(?:' + TLDS + ')\\b', 'i')),
    /* a mesma lista com letra de qualquer alfabeto antes do ponto ("Niterói.com", "ΟΡΤΟ.com"): o \b do JS não enxerga acento */
    por(new RegExp('(?<![\\p{L}\\p{N}-])[\\p{L}\\p{N}][\\p{L}\\p{N}-]*\\.(?:' + TLDS + ')(?![\\p{L}\\p{N}])', 'iu')),
    /* qualquer domínio "palavra.tld" colado, com o TLD só de letras minúsculas (.pt, .fr, .digital); o TLD minúsculo e não
       seguido de letra deixa de fora o fim de frase sem espaço ("fim.Começo"); a palavra tem que ter uma letra ("2.5.mm") e não
       vir depois de @ ("@clinica.sol" é perfil, e o perfil é o achado dele) */
    por(new RegExp('\\b(?<!@[\\w.-]*)(?=[a-zA-Z0-9-]*[a-zA-Z])[a-zA-Z0-9][a-zA-Z0-9-]{1,62}\\.(?!(?:' + NAO_TLD + ')(?![a-zA-Z]))[a-z]{2,24}(?![a-zA-Z])')),
    /* ponto com espaço antes ("golpe . com") ou escrito entre sinais ("golpe(dot)com", "golpe[dot]net") */
    por(new RegExp('\\b[a-z0-9-]{2,}\\s+\\.\\s*(?:' + TLDS + ')\\b', 'i')),
    por(/\b[a-z0-9-]+\s*[([]\s*dot\s*[)\]]\s*[a-z]{2,}/i),
    /* "golpe ponto com", "golpe (ponto) net": o endereço por extenso. Com sinal de um lado ou do outro, sempre; solto, só quando
       o TLD fecha a frase (fim, pontuação, barra, "barra" ou "ponto br"), para "um ponto com desconto" ser texto */
    por(/\b[a-z0-9-]+\s*(?:[([]\s*ponto\s*[)\]]?|ponto\s*[)\]])\s*(?:com|net|org|br|app|xyz)\b/i),
    por(/\b[a-z0-9-]+\s+ponto\s+(?:com|net|org|br|app|xyz)(?=\s*(?:$|[.,;:!?)\]/]|barra\b|ponto\s+br\b))/i)
  ], false],
  ['caminho de arquivo', [
    por(/\b[a-z]:[\\/]/i), por(/(?:^|[\s"'(])~[\\/]/), por(/(?:^|[\s"'(])\/(?:home|users|etc|tmp|var|root)\b/i),
    por(/\\\\[a-z0-9]/i), por(/\.\.[\\/]/)
  ], false],
  ['chave', [
    por(/\bsk-[a-z0-9_-]{8,}/i), por(/\b[sprk]k_(?:live|test)_\w{8,}/i), por(/\beyJ[a-z0-9_-]{10,}/i), por(/\bghp_\w{20,}/),
    por(/\bxox[abpr]-[\w-]{10,}/), por(/\bAKIA[0-9A-Z]{16}\b/), por(/\bAIza[\w-]{20,}/), por(/\bBearer\s+[\w.-]{16,}/i),
    por(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i), por(/\b[0-9a-f]{32,}\b/i), corridaDeChave
  ], true],
  ['telefone', [
    /* celular e fixo com DDD válido, com ou sem pontuação, com ou sem +55 */
    por(/(?<!\d)(?:\+?55[\s.-]?)?\(?[1-9][1-9]\)?[\s.-]?9\d{4}[\s.-]?\d{4}(?!\d)/),
    por(/(?<!\d)(?:\+?55[\s.-]?)?\(?[1-9][1-9]\)?[\s.-]?[2-5]\d{3}[\s.-]?\d{4}(?!\d)/),
    por(/\b9\d{4}[\s.-]\d{4}\b/), fixoSemDdd, por(/\b0[58]00[\s.-]?\d{3}[\s.-]?\d{4}\b/), por(/(?<!\d)\+?55\s?\d{10,11}\b/),
    por(/\b\d{2}\s9\s\d{4}\s\d{4}\b/), por(/\+\d{1,3}[\s.-]\d{2,4}[\s.-]\d{3,4}[\s.-]\d{4}/),
    por(/\([1-9][1-9]\)\s?9\s\d{4}[\s.-]?\d{4}/), /* (21) 9 8765-4321: o 9 solto, depois do DDD entre parênteses */
    por(/(?<!\d)[1-9][1-9][\s.-]9[\s.-]\d{4}[\s.-]?\d{4}(?!\d)/) /* 21 9 8765-4321, 21.9.8765.4321, 21-9-8765-4321: o 9 solto sem parênteses */
  ], true],
  /* o contato real entra no site depois, pelo dono, nunca pela fila: nem o perfil, nem o documento, nem a conta */
  ['perfil de rede social', [por(/(?:^|[\s(])@[a-z0-9._]{3,30}\b/i)], false],
  /* chave Pix e documento entram depois, pelo dono, nunca pela fila */
  ['documento', [
    documentoValido(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, cpfValido), /* CPF */
    documentoValido(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, cnpjValido) /* CNPJ */
  ], true],
  ['conta bancária', [por(/\bag(?:ência|encia|\.)?\s*:?\s*\d{3,5}\b[^.]{0,20}\bc(?:onta|\/c|c)\.?\s*:?\s*\d{4,}/i)], false]
];

/* toda string de um valor, com o caminho dela (secoes[2].itens[0].texto) */
export function textosDe(valor, caminho = '') {
  if (typeof valor === 'string') return [{ caminho, texto: valor }];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => textosDe(v, caminho + '[' + i + ']'));
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([k, v]) => textosDe(v, caminho ? caminho + '.' + k : k));
  return [];
}

const codigoDe = caractere => 'U+' + caractere.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

/* o primeiro caractere do texto ORIGINAL que a regex acha, como U+XXXX (hexadecimal maiúsculo, no mínimo 4 dígitos), ou null */
function primeiroCodigo(texto, re) {
  const m = texto.match(re);
  return m ? codigoDe(m[0]) : null;
}

/* a letra de outro alfabeto: a estranha, e não a latina que está colada a ela */
function codigoDeLetraEstranha(texto) {
  const m = texto.match(OUTRO_ALFABETO);
  return m ? codigoDe(m[1] || m[2] || m[0]) : null;
}

const trechoDe = (achado, mascarar) => (mascarar ? achado.slice(0, 4) + '…' : achado.slice(0, 40));

/* os achados de uma direção já higienizada: vazio = pode sair (um achado por tipo em cada texto) */
export function varrer(direcao) {
  const achados = [];
  for (const { caminho, texto } of textosDe(direcao)) {
    const invisivel = primeiroCodigo(texto, INVISIVEIS);
    if (invisivel) achados.push({ caminho, tipo: 'caractere invisível', trecho: invisivel });
    const estranha = codigoDeLetraEstranha(texto);
    if (estranha) achados.push({ caminho, tipo: 'letra de outro alfabeto', trecho: estranha });
    const limpo = normalizar(texto);
    const email = limpo.match(EMAIL);
    if (email) achados.push({ caminho, tipo: 'e-mail', trecho: trechoDe(email[0], false) });
    /* o trecho achado sai do texto (vira espaço) antes dos tipos seguintes, como o e-mail: um achado não vira dois */
    let resto = limpo.replace(EMAIL_GLOBAL, ' ');
    for (const [tipo, detectores, mascarar] of PADROES) {
      for (const detectar of detectores) {
        const achado = detectar(resto);
        if (achado) { achados.push({ caminho, tipo, trecho: trechoDe(achado, mascarar) }); resto = resto.split(achado).join(' '); break; }
      }
    }
  }
  return achados;
}
