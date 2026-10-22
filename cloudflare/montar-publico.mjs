/* O QUE SOBE COMO ASSET: lista de PERMISSÃO (arquivo novo não sobe sem entrar aqui; o verificador acusa o 404 na
   prévia). Fonte: git ls-files (só o versionado). Sem git: erro, nunca "copia tudo". */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PERMITIDOS = [/^[a-z0-9-]+\.html$/, /^[a-z0-9-]+\.css$/, /^css\//, /^js\//, /^vendor\//, /^assets\//, /^(robots\.txt|sitemap\.xml|favicon\.ico|_headers)$/];
const NEGADOS = [/^js\/nucleo\/lab\.js$/, /^vendor\/three\/(entrada\.js|README\.md)$/, /^assets\/README\.txt$/, /(^|\/)\.env/, /\.(sql|dump|7z|log)$/];
export const ehPublico = arq => PERMITIDOS.some(r => r.test(arq)) && !NEGADOS.some(r => r.test(arq));

export function montarPublico({ raiz, destino, arquivos }) {
  fs.rmSync(destino, { recursive: true, force: true });
  const copiados = arquivos.filter(ehPublico);
  for (const a of copiados) {
    const alvo = path.join(destino, a);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.copyFileSync(path.join(raiz, a), alvo);
  }
  return copiados;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {   /* (só quando rodado como comando) */
  const raiz = process.cwd();
  const arquivos = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' }).split('\0').filter(Boolean);
  const n = montarPublico({ raiz, destino: path.join(raiz, 'publico'), arquivos }).length;
  console.log('[montar-publico] ' + n + ' arquivos em publico/');
}
