/* Roda um comando com os segredos guardados por guardar-chave.mjs no ambiente, sem imprimir nenhum.

   Uso:  node scripts/com-chave.mjs [--so NOME,NOME] <comando> [argumentos...]
   Ex.:  node scripts/com-chave.mjs node docs/avaliacao/consultor.mjs --teto 1

   Só entram no ambiente os segredos pedidos em --so (ou todos os da pasta, se --so faltar). A saída do comando
   passa direto; o valor do segredo nunca é escrito por este programa. Um segredo já definido no ambiente vence. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PASTA_SEGREDOS, caminhoDoSegredo } from './guardar-chave.mjs';

export function carregarSegredos(so) {
  const env = {};
  if (!fs.existsSync(PASTA_SEGREDOS)) return env;
  const nomes = so && so.length ? so : fs.readdirSync(PASTA_SEGREDOS);
  for (const nome of nomes) {
    if (process.env[nome]) continue;
    let alvo;
    try { alvo = caminhoDoSegredo(nome); } catch { continue; }
    if (fs.existsSync(alvo)) env[nome] = fs.readFileSync(alvo, 'utf8').trim();
  }
  return env;
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (executadoDireto) {
  const args = process.argv.slice(2);
  let so = null;
  if (args[0] === '--so') { so = (args[1] || '').split(',').filter(Boolean); args.splice(0, 2); }
  if (!args.length) { console.error('uso: node scripts/com-chave.mjs [--so NOME,NOME] <comando> [argumentos...]'); process.exit(2); }
  const filho = spawn(args[0], args.slice(1), { stdio: 'inherit', env: { ...process.env, ...carregarSegredos(so) }, shell: false });
  filho.on('exit', (codigo) => process.exit(codigo ?? 1));
  filho.on('error', (e) => { console.error('não consegui rodar o comando: ' + e.message); process.exit(1); });
}
