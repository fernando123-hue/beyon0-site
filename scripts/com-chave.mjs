/* Roda um comando com os segredos guardados por guardar-chave.mjs no ambiente, sem entregar o valor à conversa.

   Uso:  node scripts/com-chave.mjs --so NOME[,NOME] <comando> [argumentos...]
         node scripts/com-chave.mjs --todos <comando> [argumentos...]
   Ex.:  node scripts/com-chave.mjs --so ANTHROPIC_API_KEY node docs/avaliacao/consultor.mjs --teto 1

   --so é OBRIGATÓRIO (só entram no ambiente os segredos pedidos); "todos" só com --todos, escrito. Sem um dos dois, ou com --so vazio, nome inválido ou nome que não existe como
   arquivo em ~/.beyon-segredos, sai com código 2 dizendo QUAL nome (nunca o valor) e o comando não roda. Um segredo já definido no ambiente vence o do arquivo.

   LIMITE DE AMEAÇA (leia antes de usar): o programa esconde o valor da conversa, não do comando. O segredo fica no ambiente de QUALQUER comando que rode aqui: rode só comandos do
   próprio repositório (node arquivo.mjs), nunca npm install, curl nem comando desconhecido; um comando que leia o próprio ambiente e o mande para fora o leva. Melhor esforço: a saída
   do comando passa por um filtro que troca cada valor por *** (inclusive cortado entre dois pedaços); isso pega o descuido (um console.log do ambiente), não um comando mal-intencionado
   (que pode codificar o valor). O filtro tira o terminal do comando (sem cores, sem perguntas interativas na saída).
   Em Windows, npm e npx são arquivos .cmd e não rodam por aqui (sem shell, de propósito): use node arquivo.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PASTA_SEGREDOS, caminhoDoSegredo, nomeValido } from './guardar-chave.mjs';

export const TODOS = Symbol('todos');
export class ErroDeUso extends Error {}

const MSG_USO = 'uso: node scripts/com-chave.mjs --so NOME[,NOME] <comando> [argumentos...]   (ou --todos, escrito, para entregar todos os segredos da pasta)';

/* lê o valor de um segredo; qualquer falha vira ErroDeUso com o NOME (nunca o valor, nunca stack trace) */
function lerSegredo(nome) {
  let valor = '';
  try {
    const alvo = caminhoDoSegredo(nome);
    if (!fs.statSync(alvo).isFile()) throw new Error('não é arquivo');
    valor = fs.readFileSync(alvo, 'utf8').trim();
  } catch { valor = ''; }
  if (!valor) throw new ErroDeUso('o segredo ' + nome + ' não existe como arquivo legível em ' + PASTA_SEGREDOS + ' (guarde com: node scripts/guardar-chave.mjs ' + nome + '). Nada foi rodado.');
  return valor;
}

export function carregarSegredos(pedido) {
  const env = {};
  let nomes;
  if (pedido === TODOS) {
    let arquivos = [];
    try { arquivos = fs.readdirSync(PASTA_SEGREDOS); } catch { arquivos = []; }
    nomes = arquivos.filter((n) => nomeValido(n) && fs.statSync(path.join(PASTA_SEGREDOS, n), { throwIfNoEntry: false })?.isFile());
  } else {
    nomes = pedido;
  }
  nomes.forEach((nome, i) => {
    /* (um nome fora do padrão pode ser a própria chave colada no lugar do nome: não é repetido) */
    if (!nomeValido(nome)) throw new ErroDeUso('o item ' + (i + 1) + ' de --so não é um nome de segredo válido (MAIÚSCULAS, números e _). Nada foi rodado.');
    if (process.env[nome]) return;
    env[nome] = lerSegredo(nome);
  });
  return env;
}

/* separa --so/--todos do comando; lança ErroDeUso */
export function lerArgumentos(argv) {
  const args = [...argv];
  let so = null, todos = false;
  while (args[0] === '--so' || args[0] === '--todos') {
    if (args[0] === '--todos') { todos = true; args.shift(); continue; }
    if (args.length < 2) throw new ErroDeUso('--so pede os nomes. ' + MSG_USO);
    so = args[1].split(',');
    args.splice(0, 2);
  }
  if (so && todos) throw new ErroDeUso('use --so OU --todos, não os dois. ' + MSG_USO);
  if (so && (!so.length || so.some((n) => n === ''))) throw new ErroDeUso('--so está vazio ou tem um nome em branco. ' + MSG_USO);
  if (!so && !todos) throw new ErroDeUso(MSG_USO);
  if (!args.length) throw new ErroDeUso('falta o comando. ' + MSG_USO);
  return { pedido: todos ? TODOS : so, comando: args };
}

/* troca cada valor por *** na saída, mesmo cortado entre dois pedaços: segura no fim só o que ainda pode ser o começo de um valor */
export function criarRedator(valores) {
  const alvos = valores.filter((v) => typeof v === 'string' && v.length >= 4).sort((a, b) => b.length - a.length);
  const folga = alvos.reduce((m, v) => Math.max(m, v.length), 0) - 1;
  const trocar = (t) => alvos.reduce((acc, v) => acc.split(v).join('***'), t);
  let resto = '';
  return {
    empurrar(pedaco) {
      const t = trocar(resto + pedaco);
      if (folga <= 0) return t;
      const corte = Math.max(0, t.length - folga);
      resto = t.slice(corte);
      return t.slice(0, corte);
    },
    fim() { const r = resto; resto = ''; return r; }
  };
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (executadoDireto) {
  let plano, segredos;
  try {
    plano = lerArgumentos(process.argv.slice(2));
    segredos = carregarSegredos(plano.pedido);
  } catch (e) {
    console.error(e instanceof ErroDeUso ? e.message : 'não consegui preparar os segredos (' + (e && e.code ? e.code : 'erro') + '). Nada foi rodado.');
    process.exit(2);
  }
  const valores = Object.values(segredos);
  const filho = spawn(plano.comando[0], plano.comando.slice(1), { stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, ...segredos }, shell: false });
  for (const [fluxo, destino] of [[filho.stdout, process.stdout], [filho.stderr, process.stderr]]) {
    const redator = criarRedator(valores);
    fluxo.setEncoding('utf8');
    fluxo.on('data', (d) => { destino.write(redator.empurrar(d)); });
    fluxo.on('end', () => { destino.write(redator.fim()); });
  }
  filho.on('close', (codigo) => process.exit(codigo ?? 1));
  filho.on('error', (e) => { console.error('não consegui rodar o comando: ' + e.message); process.exit(1); });
}
