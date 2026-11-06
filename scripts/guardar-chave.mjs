/* Guarda um segredo (chave da Anthropic, token) FORA do repositório, sem que ninguém precise colá-lo em conversa.

   Uso (no terminal do dono, uma vez):
     node scripts/guardar-chave.mjs ANTHROPIC_API_KEY

   O NOME é validado antes de qualquer pergunta, e o argumento recusado nunca é repetido na tela (se a chave foi colada no lugar do nome, ela não aparece).
   Depois o programa pede o valor com a digitação escondida e grava em %USERPROFILE%\.beyon-segredos\<NOME> (no Windows; em outro sistema, ~/.beyon-segredos/<NOME>).
   A gravação é num arquivo temporário renomeado por cima (o modo 0600 vale mesmo para um arquivo que já existia aberto). No Windows a pasta também é restringida ao usuário
   atual com icacls (melhor esforço: se falhar, segue em silêncio). Valor com byte de controle (setas, Esc, Tab), com espaço no meio, vazio ou curto é recusado e NADA é gravado.
   Para usar sem ver: node scripts/com-chave.mjs --so NOME <comando...> (ele lê os arquivos e roda o comando). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PASTA_SEGREDOS = path.join(os.homedir(), '.beyon-segredos');
const NOME_VALIDO = /^[A-Z][A-Z0-9_]{2,63}$/;
const BYTE_DE_CONTROLE = /[\u0000-\u001f\u007f]/;
const MSG_NOME = 'nome inválido: use MAIÚSCULAS, números e _ (ex.: ANTHROPIC_API_KEY)';

export const nomeValido = (nome) => typeof nome === 'string' && NOME_VALIDO.test(nome);

export function caminhoDoSegredo(nome) {
  if (!nomeValido(nome)) throw new Error(MSG_NOME);   /* (a mensagem nunca leva o argumento: ele pode ser a própria chave) */
  return path.join(PASTA_SEGREDOS, nome);
}

/* Windows: só o usuário atual na pasta. Primeiro dá o acesso, depois tira a herança (se a 1ª falhar, a 2ª não roda: ninguém fica trancado fora da própria pasta). Sem shell. */
export function restringirPasta(pasta, { plataforma = process.platform, usuario, executar = execFileSync } = {}) {
  if (plataforma !== 'win32') return false;
  try {
    const eu = usuario || os.userInfo().username;
    const op = { stdio: 'ignore', windowsHide: true };
    executar('icacls', [pasta, '/grant:r', eu + ':(OI)(CI)F'], op);
    executar('icacls', [pasta, '/inheritance:r'], op);
    return true;
  } catch { return false; }
}

export function gravarSegredo(nome, valor) {
  const alvo = caminhoDoSegredo(nome);
  const limpo = String(valor).trim();
  if (limpo.length < 8 || /\s/.test(limpo) || BYTE_DE_CONTROLE.test(limpo)) throw new Error('valor vazio, curto demais, com espaço ou caractere de controle: nada foi gravado');
  fs.mkdirSync(PASTA_SEGREDOS, { recursive: true, mode: 0o700 });
  restringirPasta(PASTA_SEGREDOS);
  const temporario = alvo + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temporario, limpo, { mode: 0o600 });
    try { fs.chmodSync(temporario, 0o600); } catch { /* sem modo POSIX (Windows) */ }
    fs.renameSync(temporario, alvo);
  } catch (e) {
    try { fs.rmSync(temporario, { force: true }); } catch { /* nada a limpar */ }
    throw new Error('não consegui gravar o arquivo (' + (e && e.code ? e.code : 'erro') + '): nada foi gravado');
  }
  return alvo;
}

/* lê da entrada padrão sem ecoar na tela; tudo o que digitar entra (inclusive bytes de controle, que o gravarSegredo recusa) */
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
  if (!nomeValido(nome)) { console.error(MSG_NOME + '. O argumento recebido não é repetido aqui; nada foi pedido nem gravado.'); process.exit(2); }
  try {
    const valor = await pedirEscondido(`Cole o valor de ${nome} (não aparece na tela) e aperte Enter: `);
    const onde = gravarSegredo(nome, valor);
    console.log(`Guardado em ${onde}. Nada foi impresso. Para apagar, delete esse arquivo.`);
  } catch (e) {
    console.error('Não guardei: ' + e.message);
    process.exit(1);
  }
}
