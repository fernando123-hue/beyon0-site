/* ==========================================================================
   A GUARDA da sessão isolada (hook PreToolUse do Claude Code, carregado do --settings da sessão). Ensaio real do PR 43:
   proibir comando por comando não fecha, porque o Claude Code deixa passar comandos de "só leitura" que não estão na lista
   documentada (nl e rg rodaram sem estar liberados). Então a guarda é a LISTA DO QUE É PERMITIDO: no Bash, só passa o
   conferir exato das instruções, pela partida ./.conferir.mjs da pasta do pedido; qualquer outra coisa é bloqueada.
   Read, Edit e Write não são decididos aqui: seguem as regras de permissão da sessão.
   Protocolo do hook: lê o JSON do stdin; para liberar, imprime o JSON de "allow" e sai com 0; para bloquear, escreve a
   mensagem no stderr e sai com 2.
   O par arquivo/estratégia não é conferido aqui (./conversao.json com "autoridade" passa): o conferir só LÊ e avalia o
   arquivo, então um par trocado não tem o que proteger.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFERIR_EXATO = /^node \.\/\.conferir\.mjs \.\/(conversao|autoridade|experiencia)\.json (conversao|autoridade|experiencia)$/;
const BLOQUEIO = 'Bloqueado pela guarda da sessão isolada: só o conferir exato das instruções é permitido.';

/* a decisão, pura: { codigo: 0|2, saida?: string (stdout), erro?: string (stderr) } */
export function decidirGuarda(entrada) {
  /* entrada ilegível ou sem o nome da ferramenta: bloqueia (na dúvida, nada passa) */
  if (!entrada || typeof entrada !== 'object' || typeof entrada.tool_name !== 'string') return { codigo: 2, erro: BLOQUEIO };
  if (entrada.tool_name !== 'Bash') return { codigo: 0 };
  const comando = entrada.tool_input && entrada.tool_input.command;
  if (typeof comando !== 'string' || !CONFERIR_EXATO.test(comando)) return { codigo: 2, erro: BLOQUEIO };
  return {
    codigo: 0,
    saida: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'conferir exato da sessão isolada (partida ./.conferir.mjs)' } })
  };
}

/* execução: só quando é o arquivo chamado (importar para testar não lê o stdin) */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let entrada;
  try { entrada = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { entrada = undefined; }
  const r = decidirGuarda(entrada);
  if (r.saida) process.stdout.write(r.saida);
  if (r.erro) process.stderr.write(r.erro);
  process.exitCode = r.codigo;
}
