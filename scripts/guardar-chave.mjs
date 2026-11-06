/* Guarda um segredo (chave da Anthropic, token) FORA do repositório, sem que ninguém precise colá-lo em conversa.

   Uso (no terminal do dono, uma vez):
     node scripts/guardar-chave.mjs ANTHROPIC_API_KEY

   O programa pede o valor com a digitação escondida e grava em
   %USERPROFILE%\.beyon-segredos\<NOME> (no Windows; em outro sistema, ~/.beyon-segredos/<NOME>),
   só legível pelo dono (modo 0600 onde existe). Nada é impresso.
   Para usar sem ver: node scripts/com-chave.mjs <comando...> (ele lê os arquivos e roda o comando). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PASTA_SEGREDOS = path.join(os.homedir(), '.beyon-segredos');
const NOME_VALIDO = /^[A-Z][A-Z0-9_]{2,63}$/;

export function caminhoDoSegredo(nome) {
  if (!NOME_VALIDO.test(nome)) throw new Error('nome inválido: use MAIÚSCULAS, números e _ (ex.: ANTHROPIC_API_KEY)');
  return path.join(PASTA_SEGREDOS, nome);
}

export function gravarSegredo(nome, valor) {
  const alvo = caminhoDoSegredo(nome);
  const limpo = String(valor).trim();
  if (limpo.length < 8 || /\s/.test(limpo)) throw new Error('valor vazio, curto demais ou com espaço no meio: nada foi gravado');
  fs.mkdirSync(PASTA_SEGREDOS, { recursive: true, mode: 0o700 });
  fs.writeFileSync(alvo, limpo, { mode: 0o600 });
  return alvo;
}

/* lê da entrada padrão sem ecoar na tela */
function pedirEscondido(pergunta) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) { reject(new Error('rode num terminal interativo (a digitação é escondida)')); return; }
    process.stdout.write(pergunta);
    let texto = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const ao = (c) => {
      for (const ch of c) {
        if (ch === '\u0003') { process.stdin.setRawMode(false); process.stdout.write('\n'); reject(new Error('cancelado')); return; }
        if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', ao); process.stdout.write('\n'); resolve(texto); return; }
        if (ch === '\u007f' || ch === '\b') { texto = texto.slice(0, -1); continue; }
        texto += ch;
      }
    };
    process.stdin.on('data', ao);
  });
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (executadoDireto) {
  const nome = process.argv[2];
  if (!nome) { console.error('uso: node scripts/guardar-chave.mjs NOME_DO_SEGREDO   (ex.: ANTHROPIC_API_KEY)'); process.exit(2); }
  try {
    const valor = await pedirEscondido(`Cole o valor de ${nome} (não aparece na tela) e aperte Enter: `);
    const onde = gravarSegredo(nome, valor);
    console.log(`Guardado em ${onde}. Nada foi impresso. Para apagar, delete esse arquivo.`);
  } catch (e) {
    console.error('Não guardei: ' + e.message);
    process.exit(1);
  }
}
