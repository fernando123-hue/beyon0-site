/* ==========================================================================
   A VARREDURA do que sai da fila manual (spec docs/specs/2026-10-11-orcamento-sem-ia.md §4). Uma direção é só texto
   de site (nome, títulos, itens): nela não cabe endereço de site, caminho de arquivo, chave, e-mail nem telefone. Se
   um aparecer, é vazamento (o modelo copiou algo da máquina) ou injeção (o briefing veio de um desconhecido), e nada
   sai. O contato do cliente entra no site depois, pelo dono, nunca por aqui.
   O arquivo mora aqui (api/_vendas) porque o SERVIDOR também varre na entrega de uma direção (api/painel.mjs): defesa em
   profundidade, caso a varredura local do dono seja pulada. scripts/varredura.mjs só reexporta este.

   COMO FUNCIONA. Cada tipo é uma lista de detectores; um detector devolve o trecho achado ou null. A varredura olha uma cópia
   normalizada do texto (largura total vira normal, pontos de outras escritas viram ponto). O e-mail sai do texto antes dos outros
   tipos, e todo trecho achado também sai, para não virar um segundo achado (a chave AIza não vira telefone). O caractere invisível
   (controle de direção, hífen mole) é achado por si: apagá-lo antes de olhar deixava passar "gro.eplog", que a tela mostra como
   "golpe.org". Regra de desempate: na dúvida entre achar e limpar, achar. O dono lê o alarme e decide.

   O QUE ACHA (testes: docs/testes/varredura-casos.test.mjs e fila-direcoes.test.mjs)
   - endereço de site: esquema (https://, hxxp://), www., wa.me, IPv4 de verdade (octetos até 255), "palavra.tld" com TLD da lista
     (TLDS), da lista de golpe (TLDS_DE_GOLPE, em qualquer caixa) ou qualquer TLD todo em minúsculas ou todo em maiúsculas que não
     seja extensão de arquivo; nome de qualquer alfabeto e com acento ("Niterói.com"); .zip. Ponto disfarçado: "golpe . com",
     "golpe(dot)com", "golpe[dot]net", pontos médios colados ("golpe·com"), "pontocom" colado e o ponto por extenso ("golpe ponto com",
     "golpe (ponto) pt"; com sinal de um lado só vale a lista de TLDs e a de golpe; solto, só quando o TLD fecha a frase).
   - e-mail, caminho de arquivo, chave (prefixos conhecidos, UUID, hexadecimal longo, corrida longa que mistura dígitos e letras), telefone
     (celular e fixo com ou sem DDD, com o 9 solto, 0800), perfil de rede social e conta bancária.
   - documento: CPF e CNPJ com dígito verificador válido, ou com pontuação, ou depois do rótulo CPF/CNPJ; CPF com ponto no lugar do
     hífen com dígito válido ou rótulo.
   - letra de outro alfabeto: cirílico ou armênio em qualquer lugar, grego colado a outra letra (palavra inteira em grego também).
   - caractere invisível, de controle ou de uso privado.

   O QUE NÃO ACHA (texto de loja)
   - IPv4 com octeto acima de 255, faixa de preço (R$ 2500-3500), frase longa com hífens, extensão de arquivo e de tecnologia
     (foto.mp4, Next.js), "Sr.joão", "um ponto com desconto", "(ponto de venda)", símbolo grego solto (10 Ω), pontos médios com espaço
     dos dois lados (separador "Clínica · Online"), número de 11 ou 14 dígitos solto sem pontuação, sem rótulo e sem dígito
     verificador válido (código de barras, lote).

   ALARMES ACEITOS (a varredura acha, o dono lê e libera)
   - abreviação com ponto colado, de mesma forma que "Golpe.pt": "Av.paulista", "Seg.sex", "Cia.ltda", "Salão.Vip", "Fit.Live aulas";
   - ponto solto com TLD da lista: "Pedimos desculpas . Com isso", "fim . Me ligue", "Promoção . Me peça";
   - "(ponto" seguido de palavra que também é TLD (co-working, tv, vip, live, shop, digital, online, top): "Atendimento (ponto online
     e físico)", "Quiosque (ponto top)", "Espaço (ponto co-working)", e "Nosso (ponto) de encontro" (sinal dos dois lados);
   - "a bolha pontocom" e "Corte •barba •tintura" (bolinha colada de um lado só);
   - número no formato de CPF com pontos ("Nota fiscal 529.982.247.25") alarma com qualquer rótulo (ou sem rótulo nenhum) se o dígito
     verificador bater por acaso (~1% dos números dessa forma).

   PERDAS ACEITAS (a varredura NÃO acha)
   - domínio de TLD fora das duas listas, com inicial maiúscula e sem espaço ("Golpe.Sh"): seria igual a "Dr.Silva";
   - "golpe (ponto sh" e "golpe ponto) zip": TLD fora das duas listas com sinal de um lado só.

   TEMPO. As regex de endereço são quadráticas em sequências como "a-a-a-…" (cada hífen reinicia a busca); não há nada exponencial.
   O teste mede 700 caracteres (o teto de uma seção em direcao.mjs) e uma direção inteira no tamanho máximo, com limites de 1 s por
   campo e 3 s por direção (o medido é ~40 ms e ~0,5 s). Não acrescente regex com repetição aninhada nem lookbehind de tamanho variável.
   ========================================================================== */
/* por propriedade Unicode, e não por lista de códigos (a lista deixava passar a marca de letra árabe, o separador mongol,
   o preenchimento hangul, as "tags" acima de U+FFFF...): Default_Ignorable_Code_Point (hífen mole, largura zero, seletores
   de variação, preenchimentos), Cf (formato: controles de direção, que invertem a leitura, marca de ordem de bytes,
   âncoras de anotação), Cc (controles C0/C1) e Co (uso privado). O arquivo não traz nenhum desses caracteres escritos. */
const INVISIVEIS = /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}\p{Co}]/gu;
/* o ponto final de outras escritas (。 U+3002, ｡ U+FF61, ． U+FF0E) vira o ponto comum: "golpe。com" é um endereço. O ponto médio
   (· U+00B7), o operador (∙ U+2219), a bolinha (• U+2022), o operador ponto (⋅ U+22C5), o ponto de hifenização (‧ U+2027) e os
   pontos médios do japonês (・ U+30FB, ･ U+FF65) e o ponto de sílabas canadenses (ᐧ), de transcrição sinológica (ꞏ), de separador
   de palavras (⸱ ⸳), rúnico (᛫) e siríaco (܁) também, mas só quando colados a algo: "golpe·com" é endereço, "Clínica · Online"
   é separador */
const PONTO_MEDIO = '[·∙•⋅‧・･ᐧꞏ⸱⸳᛫܁]';
const PONTOS_DISFARCADOS = new RegExp('[。｡．]|(?<!\\s)' + PONTO_MEDIO + '|' + PONTO_MEDIO + '(?!\\s)', 'g');
const normalizar = texto => texto.replace(INVISIVEIS, '').replace(PONTOS_DISFARCADOS, '.').normalize('NFKC').replace(INVISIVEIS, '').replace(PONTOS_DISFARCADOS, '.');
/* o alfabeto de um site brasileiro de pequeno negócio é o latino: uma letra cirílica ou armênia em qualquer lugar, ou grega
   colada a QUALQUER outra letra ("gоlpe" com o о cirílico, "Clínica Ωmega", e a palavra inteira "ΟΡΤΟ", que na tela lê "OPTO"), é
   um disfarce de endereço ou de nome que a lista de TLDs não enxerga. Só o símbolo grego isolado ("10 Ω", ohm; "π = 3,14") é
   texto. O primeiro caractere achado é a letra estranha */
const OUTRO_ALFABETO = /[\p{Script=Cyrillic}\p{Script=Armenian}]|\p{Script=Greek}(?=\p{L})|(?<=\p{L})\p{Script=Greek}/u;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const EMAIL_GLOBAL = new RegExp(EMAIL.source, 'gi');
const TLDS = 'com\\.br|com|net|org|io|app|dev|site|br|xyz|co|info|store|shop|online|ai|tv|me|ly|link|biz|top|club';
const TLDS_DE_GOLPE = 'pt|digital|bet|vip|live|click|icu|lat|cc|gg|uk|fr|ru|cn';
/* parece ano - ano (2020-2024), não telefone fixo sem DDD */
const DOIS_ANOS = /^(19|20)\d\d-(19|20)\d\d$/;

const por = re => texto => (texto.match(re) || [null])[0];

/* IPv4 de verdade: quatro números de 0 a 255 ("300.400.500.600" é versão ou código, não endereço) */
function ipv4(texto) {
  for (const [achado] of texto.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)) if (achado.split('.').every(octeto => Number(octeto) <= 255)) return achado;
  return null;
}

/* extensões de arquivo e de tecnologia que não são TLD: "Feito com Next.js" é texto, não endereço. Fica de fora o que também é
   TLD de verdade (.zip, da Google; .mov também seria, e nunca esteve na lista): "golpe.zip" é endereço. Nenhuma outra daqui é
   TLD (js, ts, css, png, pdf, doc...) */
const NAO_TLD = 'js|mjs|ts|jsx|tsx|css|html|json|png|jpg|jpeg|gif|svg|pdf|txt|doc|docx|xls|xlsx|csv';
/* o TLD não pode continuar em letra nem em dígito ("foto.mp4", "Sr.joão" não são endereço); o \b do JS não enxerga acento */
const FIM_TLD = '(?![\\p{L}\\p{N}])';
const SEM_EXTENSAO = alternativas => '(?!(?:' + alternativas + ')' + FIM_TLD + ')';
/* o nome do domínio, de qualquer alfabeto e com acento ("promoção.pt"), com pelo menos uma letra ("2.5.mm" não é) e que não vem
   depois de @ ("@clinica.sol" é perfil, e o perfil é o achado dele) */
const NOME_DE_DOMINIO = '(?<![\\p{L}\\p{N}_])(?<!@[\\w.-]*)(?=[\\p{L}\\p{N}-]*\\p{L})[\\p{L}\\p{N}][\\p{L}\\p{N}-]{1,62}';

/* a corrida longa só é chave se misturar dígitos e letras ("Pediatria/Ortopedia/Cardiologia/..." é texto) */
function corridaDeChave(texto) {
  for (const [corrida] of texto.matchAll(/[A-Za-z0-9+/=_-]{32,}/g)) {
    /* frase com hífens ("passo-1-escolha-2-..."): todos os pedaços curtos e cada um só de letras ou só de dígitos, é texto e não
       chave; "A1B2C-3D4E5-..." (pedaços curtos, mas mistos) é chave de produto */
    if (corrida.split('-').every(pedaco => pedaco.length <= 10 && /^(?:[a-zà-ú]*|\d*)$/i.test(pedaco))) continue;
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
/* "CPF 123", "CPF: 123", "CPF nº 123", "CPF n° 123", "CPF no 123" (o NFKC já fez de "nº" um "no") */
const ROTULO_DOCUMENTO = /(?:cpf|cnpj)\W{0,3}(?:n[o°]\.?\s*:?\s*)?$/i;
const documentoValido = (re, valido) => texto => {
  for (const m of texto.matchAll(re)) {
    const antes = texto.slice(Math.max(0, m.index - 12), m.index);
    if (valido(m[0].replace(/\D/g, '')) || /[./-]/.test(m[0]) || ROTULO_DOCUMENTO.test(antes)) return m[0];
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
    /* qualquer domínio "palavra.tld" colado, com o TLD todo em minúsculas ou todo em maiúsculas (.pt, .fr, .digital, .PT) e não
       seguido de letra nem dígito: "fim.Começo" (maiúscula só na inicial), "Sr.joão" e "foto.mp4" ficam de fora. Extensão de arquivo
       (js, png, pdf...) nunca é TLD aqui, em minúsculas ou maiúsculas. "Av.paulista", "Seg.sex" e "Cia.ltda" têm a mesma forma de
       "Golpe.pt" e seguem como alarme aceito */
    por(new RegExp(NOME_DE_DOMINIO + '\\.' + SEM_EXTENSAO(NAO_TLD) + '[a-z]{2,24}' + FIM_TLD, 'u')),
    por(new RegExp(NOME_DE_DOMINIO + '\\.' + SEM_EXTENSAO(NAO_TLD.toUpperCase()) + '[A-Z]{2,24}' + FIM_TLD, 'u')),
    /* e os TLDs mais usados em golpe fora da lista, em qualquer caixa ("Golpe.Pt", "golpe.pT"); fechar todos por formato alarmaria "Dr.Silva"
       e "fim.Começo". Não vão para TLDS: a linha do TLDS não respeita o @ e "@golpe.pt" deixaria de ser perfil */
    por(new RegExp(NOME_DE_DOMINIO + '\\.(?:' + TLDS_DE_GOLPE + ')' + FIM_TLD, 'iu')),
    /* ponto com espaço antes ("golpe . pt") ou escrito entre sinais ("golpe(dot)com", "golpe[dot]net"); o TLD segue o mesmo
       critério acima, e por isso "Pedimos desculpas . Com isso" (maiúscula só na inicial) é texto */
    por(new RegExp('(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}-]{2,}\\s+\\.\\s*[a-z]{2,24}' + FIM_TLD, 'u')),
    por(new RegExp('(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}-]{2,}\\s+\\.\\s*[A-Z]{2,24}' + FIM_TLD, 'u')),
    /* e a lista de TLDs em qualquer caixa ("golpe . Com", "Golpe . Br"): "Pedimos desculpas . Com isso" tem a mesma forma, e na dúvida é achado */
    por(new RegExp('(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}-]{2,}\\s+\\.\\s*(?:' + TLDS + ')' + FIM_TLD, 'iu')),
    por(/(?<![\p{L}\p{N}-])[\p{L}\p{N}-]+\s*[([]\s*dot\s*[)\]]\s*[a-z]{2,}/iu),
    /* "golpe ponto com", "golpe (ponto) pt": o endereço por extenso. Com sinal dos DOIS lados, qualquer TLD; com sinal de um lado só, as
       listas TLDS e TLDS_DE_GOLPE (senão "(ponto de venda)", "(ponto de coleta)" e "ponto) de ônibus" alarmam); solto, só quando o TLD fecha a frase
       (fim, qualquer pontuação ou símbolo, "barra" ou "ponto br"), para "um ponto com desconto" e "um ponto com 10% de desconto" serem
       texto. Colado ("golpepontocom", "golpe pontobr") vale a mesma lista curta, e "a bolha pontocom" é alarme aceito */
    por(/(?<![\p{L}\p{N}-])[\p{L}\p{N}-]+\s*[([]\s*ponto\s*[)\]]\s*[a-z]{2,24}(?![a-z])/iu),
    por(new RegExp('(?<![\\p{L}\\p{N}-])[\\p{L}\\p{N}-]+\\s*(?:[([]\\s*ponto|ponto\\s*[)\\]])\\s*(?:' + TLDS + '|' + TLDS_DE_GOLPE + ')(?![a-z])', 'iu')),
    por(/[\p{L}\p{N}-]\s*ponto(?:com|net|org|br|app|xyz)(?![\p{L}\p{N}])/iu),
    por(/(?<![\p{L}\p{N}-])[\p{L}\p{N}-]+\s+ponto\s+(?:com|net|org|br|app|xyz)(?=\s*(?:$|[^\p{L}\p{N}\s]|barra\b|ponto\s+br\b))/iu)
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
  ['perfil de rede social', [por(/(?:^|[^\w@.])@[a-z0-9._]{3,30}\b/i)], false],
  /* chave Pix e documento entram depois, pelo dono, nunca pela fila */
  ['documento', [
    documentoValido(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, cpfValido), /* CPF */
    /* CPF com ponto no lugar do hífen (529.982.247.25): só com dígito válido ou rótulo, senão "Lote 123.456.789.01" alarma */
    texto => {
      for (const m of texto.matchAll(/\b\d{3}\.\d{3}\.\d{3}\.\d{2}\b/g)) {
        if (cpfValido(m[0].replace(/\D/g, '')) || ROTULO_DOCUMENTO.test(texto.slice(Math.max(0, m.index - 12), m.index))) return m[0];
      }
      return null;
    },
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

const trechoDe = (achado, mascarar) => (mascarar ? achado.slice(0, 4) + '…' : achado.slice(0, 40));

/* os achados de uma direção já higienizada: vazio = pode sair (um achado por tipo em cada texto) */
export function varrer(direcao) {
  const achados = [];
  for (const { caminho, texto } of textosDe(direcao)) {
    const invisivel = primeiroCodigo(texto, INVISIVEIS);
    if (invisivel) achados.push({ caminho, tipo: 'caractere invisível', trecho: invisivel });
    const estranha = primeiroCodigo(texto, OUTRO_ALFABETO);
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
