/* Leitor mínimo de JSONC (o wrangler.jsonc): tira comentários // e bloco fora de string e vírgulas finais, depois
   JSON.parse. Só para testes e conferências do repositório; o Wrangler lê o arquivo com o leitor dele. */

/* fim da string que começa em texto[i] (aspas), respeitando \" */
function fimDaString(texto, i) {
  let j = i + 1;
  while (j < texto.length && texto[j] !== '"') j += texto[j] === '\\' ? 2 : 1;
  return j + 1;
}

export function parse(texto) {
  let semComentarios = '';
  for (let i = 0; i < texto.length;) {
    const c = texto[i];
    if (c === '"') { const fim = fimDaString(texto, i); semComentarios += texto.slice(i, fim); i = fim; }
    else if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; }
    else if (c === '/' && texto[i + 1] === '*') {
      const fim = texto.indexOf('*/', i + 2);
      if (fim < 0) throw new Error('comentário de bloco sem fim');
      i = fim + 2;
    } else { semComentarios += c; i++; }
  }
  /* vírgula final antes de } ou ] (fora de string: as strings passam inteiras) */
  let limpo = '';
  for (let i = 0; i < semComentarios.length;) {
    const c = semComentarios[i];
    if (c === '"') { const fim = fimDaString(semComentarios, i); limpo += semComentarios.slice(i, fim); i = fim; }
    else if (c === ',' && /^\s*[}\]]/.test(semComentarios.slice(i + 1))) i++;
    else { limpo += c; i++; }
  }
  return JSON.parse(limpo);
}
