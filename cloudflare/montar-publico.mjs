/* O QUE SOBE COMO ASSET: lista de PERMISSÃO (arquivo novo não sobe sem entrar aqui; o verificador acusa o 404 na
   prévia). Fonte: git ls-files (só o versionado). Sem git: erro, nunca "copia tudo".
   Nos .html copiados, cada JS/CSS local ganha ?v=<hash do conteúdo>: o _headers dá cache curto a /js/* e /css/* e o HTML
   novo nunca junta JS/CSS velho (docs/testes/travessia-cache.test.mjs). O HTML do repositório não muda; vendor/ fica como
   está (tem o próprio cache) e endereço externo não é tocado. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PERMITIDOS = [/^[a-z0-9-]+\.html$/, /^[a-z0-9-]+\.css$/, /^css\//, /^js\//, /^vendor\//, /^assets\//, /^(robots\.txt|sitemap\.xml|favicon\.ico|_headers)$/];
const NEGADOS = [/^js\/nucleo\/lab\.js$/, /^vendor\/three\/(entrada\.js|README\.md)$/, /^assets\/README\.txt$/, /(^|\/)\.env/, /\.(sql|dump|7z|log)$/];
export const ehPublico = arq => PERMITIDOS.some(r => r.test(arq)) && !NEGADOS.some(r => r.test(arq));

const TAMANHO_DO_HASH = 10;
/* atributo src/href (não data-src) com caminho local (sem esquema, sem //), entre aspas, terminado em .js/.css, sem query */
const REFERENCIA = /(\s)(src|href)=(["'])(\.\/)?(\/?)([a-z0-9_][a-z0-9_./-]*\.(?:js|css))\3/g;
/* depois da troca, qualquer src/href local de JS/CSS sem ?v (fora vendor/) é erro: a montagem nunca o deixa passar calada */
const QUALQUER = /\s(?:src|href)\s*=\s*["']?([^"'\s>]+)/gi;
const externa = u => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(u);

function versionarHtml(html, pagina, { destino, publicos, hashes }) {
  const saida = html.replace(REFERENCIA, (inteira, espaco, atributo, aspas, ponto, barra, caminho) => {
    const arquivo = barra ? caminho : path.posix.join(path.posix.dirname(pagina), caminho);
    if (arquivo.startsWith('vendor/')) return inteira;
    if (!publicos.has(arquivo)) throw new Error('montar-publico: ' + pagina + ' pede ' + barra + caminho + ', que não sobe (seria 404 no ar)');
    if (!hashes.has(arquivo)) hashes.set(arquivo, createHash('sha256').update(fs.readFileSync(path.join(destino, arquivo))).digest('hex').slice(0, TAMANHO_DO_HASH));
    return espaco + atributo + '=' + aspas + (ponto || '') + barra + caminho + '?v=' + hashes.get(arquivo) + aspas;
  });
  for (const [, u] of saida.matchAll(QUALQUER)) {
    if (externa(u) || !/\.(js|css)([?#]|$)/i.test(u) || /^(\.\/|\/)?vendor\//.test(u) || /\?v=[0-9a-f]+$/.test(u)) continue;
    throw new Error('montar-publico: ' + pagina + ' pede ' + u + ' sem ?v (a montagem só versiona "js/x.js", "/css/x.css", "./x.css" entre aspas, sem query)');
  }
  return saida;
}

export function montarPublico({ raiz, destino, arquivos }) {
  fs.rmSync(destino, { recursive: true, force: true });
  const copiados = arquivos.filter(ehPublico);
  for (const a of copiados) {
    const alvo = path.join(destino, a);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.copyFileSync(path.join(raiz, a), alvo);
  }
  const contexto = { destino, publicos: new Set(copiados), hashes: new Map() };
  for (const pagina of copiados.filter(a => a.endsWith('.html'))) {
    const alvo = path.join(destino, pagina);
    fs.writeFileSync(alvo, versionarHtml(fs.readFileSync(alvo, 'utf8'), pagina, contexto));
  }
  return copiados;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {   /* (só quando rodado como comando) */
  const raiz = process.cwd();
  const arquivos = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' }).split('\0').filter(Boolean);
  const n = montarPublico({ raiz, destino: path.join(raiz, 'publico'), arquivos }).length;
  console.log('[montar-publico] ' + n + ' arquivos em publico/');
}
