/* ==========================================================================
   A VARREDURA do que sai da fila manual (spec docs/specs/2026-10-11-orcamento-sem-ia.md §4). Uma direção é só texto
   de site (nome, títulos, itens): nela não cabe endereço de site, caminho de arquivo, chave, e-mail nem telefone. Se
   um aparecer, é vazamento (o modelo copiou algo da máquina) ou injeção (o briefing veio de um desconhecido), e nada
   sai. O contato do cliente entra no site depois, pelo dono, nunca por aqui.
   ========================================================================== */
const PADROES = [
  ['endereço de site', /\bhttps?:\/\/|\bwww\.|\b[a-z0-9][a-z0-9-]*\.(?:com\.br|com|net|org|io|app|dev|site|br)\b/i],
  ['caminho de arquivo', /\b[a-z]:[\\/]|(?:^|[\s"'(])~[\\/]|(?:^|[\s"'(])\/(?:home|users|etc|tmp|var|root)\b|\\\\[a-z0-9]/i],
  ['chave', /\bsk-[a-z0-9_-]{8,}|\beyJ[a-z0-9_-]{10,}|\b[0-9a-f]{32,}\b|[a-z0-9+/]{40,}={0,2}/i],
  ['e-mail', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['telefone', /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/]
];

/* toda string de um valor, com o caminho dela (secoes[2].itens[0].texto) */
export function textosDe(valor, caminho = '') {
  if (typeof valor === 'string') return [{ caminho, texto: valor }];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => textosDe(v, caminho + '[' + i + ']'));
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([k, v]) => textosDe(v, caminho ? caminho + '.' + k : k));
  return [];
}

/* os achados de uma direção já higienizada: vazio = pode sair */
export function varrer(direcao) {
  const achados = [];
  for (const { caminho, texto } of textosDe(direcao)) {
    for (const [tipo, re] of PADROES) {
      const m = texto.match(re);
      if (m) achados.push({ caminho, tipo, trecho: m[0].slice(0, 40) });
    }
  }
  return achados;
}
