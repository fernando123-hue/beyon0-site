/* Leitor do _headers (só o que a doc da Cloudflare descreve): blocos "caminho + linhas indentadas", "#" de comentário,
   "*" (splat: casa qualquer coisa, inclusive vazio), ":nome" (placeholder: casa UM trecho NÃO vazio, sem "/") e "! Nome",
   que tira o que uma regra aplicada ANTES pôs. Serve ao servidor local e aos testes: no ar, quem aplica é a Cloudflare.
   A semântica documentada (developers.cloudflare.com/workers/static-assets/headers/): toda regra que casa o caminho
   entra ("inherit all rules' headers") e o mesmo cabeçalho em mais de uma regra SOMA os valores ("a, b").
   O que a doc NÃO garante é a ORDEM em que as regras são aplicadas, e o "!" só tira o que já foi aplicado. Medido em
   produção em 10/11: em "/" saíam DUAS CSPs (a da regra "/" primeiro, a de "/*" depois), e nos outros caminhos o "!"
   funcionava. Isso bate com a plataforma aplicando as regras em ordem ALFABÉTICA do caminho ("/" < "/*" < "/:x" < "/a…"),
   não na ordem do arquivo (a do wrangler local). Por isso o leitor simula as duas ordens (ORDENS) e os testes exigem que
   o resultado seja o mesmo nas duas. */
export const ORDENS = ['arquivo', 'alfabetica'];

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

/* o padrão como a Cloudflare o compila (workers-shared, rules-engine.ts): "*" → .*, ":nome" → [^/]+ */
const escapar = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const regexDe = padrao => new RegExp('^' + padrao.split('*').map(p => escapar(p).replace(/:[A-Za-z]\w*/g, '[^/]+')).join('.*') + '$');
const casa = (padrao, caminho) => regexDe(padrao).test(caminho);

function ordenar(regras, ordem) {
  if (ordem === 'arquivo') return regras;
  if (ordem === 'alfabetica') return [...regras].sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0));
  throw new Error('cabecalhosPara: ordem desconhecida: ' + ordem);
}

/* os cabeçalhos (nome em minúsculas → valor) que o _headers dá a um caminho, aplicando as regras na ordem pedida */
export function cabecalhosPara(regras, caminho, { ordem = 'arquivo' } = {}) {
  const mapa = new Map();
  for (const r of ordenar(regras, ordem)) {
    if (!casa(r.caminho, caminho)) continue;
    for (const nome of r.desanexar) mapa.delete(nome);
    for (const [nome, valor] of r.cabecalhos) mapa.set(nome, mapa.has(nome) ? mapa.get(nome) + ', ' + valor : valor);
  }
  return mapa;
}
