/* Leitor do _headers (só o que a doc da Cloudflare descreve): blocos "caminho + linhas indentadas", "#" de comentário,
   "*" como curinga e "! Nome" que remove o que veio de uma regra anterior. Serve ao servidor local e aos testes: no ar,
   quem aplica o _headers é a Cloudflare. Mais de uma regra para o mesmo cabeçalho SOMA os valores ("a, b"). */
export function lerHeaders(texto) {
  const regras = [];
  let atual = null;
  for (const bruta of String(texto).split(/\r?\n/)) {
    if (!bruta.trim() || bruta.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(bruta)) { atual = { caminho: bruta.trim(), cabecalhos: [], desanexar: [] }; regras.push(atual); continue; }
    if (!atual) throw new Error('_headers: linha indentada antes de um caminho: ' + bruta.trim());
    const linha = bruta.trim();
    if (linha.startsWith('!')) { atual.desanexar.push(linha.slice(1).trim().toLowerCase()); continue; }
    const i = linha.indexOf(':');
    if (i < 1) throw new Error('_headers: linha sem "Nome: valor": ' + linha);
    atual.cabecalhos.push([linha.slice(0, i).trim().toLowerCase(), linha.slice(i + 1).trim()]);
  }
  return regras;
}

const casa = (padrao, caminho) => new RegExp('^' + padrao.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(caminho);

/* os cabeçalhos (nome em minúsculas → valor) que o _headers dá a um caminho, na ordem do arquivo */
export function cabecalhosPara(regras, caminho) {
  const mapa = new Map();
  for (const r of regras) {
    if (!casa(r.caminho, caminho)) continue;
    for (const nome of r.desanexar) mapa.delete(nome);
    for (const [nome, valor] of r.cabecalhos) mapa.set(nome, mapa.has(nome) ? mapa.get(nome) + ', ' + valor : valor);
  }
  return mapa;
}
