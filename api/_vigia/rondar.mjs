/* ==========================================================================
   O VIGIA — A RONDA (spec docs/superpowers/specs/2026-11-15-auto-reparo-design.md). Chamada pelo cron horário
   (cloudflare/agenda.mjs) nas horas sem reconciliação. Nunca chama IA.
     1. confere o que o Worker vê sozinho (páginas, configuração: ./conferir.mjs);
     2. lê o banco numa chamada (app.rotinas_vigia_ler: a memória do vigia e os números de agora), com uma 2ª tentativa;
     3. decide (./decidir.mjs) e manda UM e-mail com as novidades (api/_aviso.mjs);
     4. só então grava o estado: o que não saiu no e-mail não fica "avisado" e volta na ronda seguinte.
   Banco fora: sem memória, regra fixa de horário (D3). A função do vigia que não existe (migration ainda não aplicada)
   não é "banco fora": só log, para não mandar alarme falso ao dono.
   Subpedidos externos: no máximo 4 (a leitura com a 2ª tentativa, a gravação e a pergunta gratuita da chave da IA).
   ========================================================================== */
import { criarTransporte } from '../_vendas/transporte.mjs';
import { ORG } from '../_vendas/org.mjs';
import { avisarDonoLinhas } from '../_aviso.mjs';
import { conferir as conferirPadrao } from './conferir.mjs';
import { achadosDe, decidir, decidirSemBanco, lembrarSemBanco, BANCO_FORA, SEM_MEMORIA } from './decidir.mjs';

const ESPERA_MS = 2000;
const MEMORIA_DO_ISOLADO = new Map();
const SEM_FUNCAO = new Set(['PGRST202', '42883']);   /* PostgREST "função não encontrada" / Postgres "função não existe" */
const LEITURA_NEUTRA = Object.freeze({ estado: {}, estreia_em: null, falhas_ia_hora: 0, conversas_falha_hora: 0, ultima_falha_conta_em: null,
  ultima_ok_ia_em: null, ultima_falha_ia_em: null, ultima_reconciliacao_em: null, ultima_diaria_em: null, urgentes: 0 });
const esperarPadrao = ms => new Promise(r => setTimeout(r, ms));
const log = dados => console[dados.nivel === 'erro' ? 'error' : 'log'](JSON.stringify({ origem: 'vigia', ...dados }));
const codigoDe = e => String(e?.codigo || e?.name || 'erro').slice(0, 20);

async function ler(banco, esperar) {
  try { return { leitura: await banco('rotinas_vigia_ler', { org_slug: ORG }) }; }
  catch (e) {
    if (SEM_FUNCAO.has(e?.codigo)) return { semFuncao: true };
    await esperar(ESPERA_MS);
    try { return { leitura: await banco('rotinas_vigia_ler', { org_slug: ORG }) }; }
    catch (e2) { return { semFuncao: SEM_FUNCAO.has(e2?.codigo), erro: codigoDe(e2) }; }
  }
}

/* rondar(env, { banco, avisar, agora, conferir, esperar, memoria }) → { linhas, enviado, semBanco } */
export async function rondar(env = {}, deps = {}) {
  const agora = deps.agora ?? Date.now();
  const esperar = deps.esperar ?? esperarPadrao;
  const banco = deps.banco !== undefined ? deps.banco : criarTransporte(env);
  const avisar = deps.avisar ?? (linhas => avisarDonoLinhas(env, linhas));
  const memoria = deps.memoria ?? MEMORIA_DO_ISOLADO;
  const conferencias = await (deps.conferir ?? conferirPadrao)(env, { esperar });

  /* sem memória: não há banco configurado, a migration do vigia falta ou o banco não respondeu. Nenhum dos três fica calado
     (revisões do PR #168): vale a regra fixa de horário, com a linha principal do caso e o que o Worker conferiu sozinho */
  const semMemoria = async (evento, principal, erro) => {
    const doWorker = Object.values(achadosDe(LEITURA_NEUTRA, conferencias, agora)).filter(Boolean);
    const linhas = decidirSemBanco(agora, memoria, doWorker, principal);
    const enviado = linhas.length ? await avisar(linhas) : false;
    if (enviado) lembrarSemBanco(memoria, agora);
    log({ nivel: 'erro', evento, erro, paginas: conferencias.paginas, faltando: conferencias.configuracao, linhas: linhas.length, enviado });
    return { linhas, enviado, semBanco: true };
  };
  if (!banco) return semMemoria('ronda sem banco configurado', BANCO_FORA);
  const { leitura, semFuncao, erro } = await ler(banco, esperar);
  if (semFuncao) return semMemoria('a migration do vigia não foi aplicada (app.rotinas_vigia_ler)', SEM_MEMORIA);
  if (!leitura) return semMemoria('ronda com o banco fora', BANCO_FORA, erro);

  const achados = achadosDe(leitura, conferencias, agora);
  const { linhas, itens } = decidir(leitura.estado || {}, achados, agora);
  const enviado = linhas.length ? await avisar(linhas) : false;
  const gravar = itens.filter(i => enviado || !i.noEmail).map(({ noEmail, ...i }) => i);
  const gravado = gravar.length ? await gravarEstado(banco, gravar, esperar) : true;
  const quebrados = Object.keys(achados).filter(k => achados[k]);
  log({ nivel: quebrados.length || !gravado ? 'erro' : 'info', evento: 'ronda', quebrados, linhas: linhas.length, enviado, gravado });
  return { linhas, enviado, semBanco: false };
}

/* o e-mail já saiu: sem gravar, a ronda seguinte repetiria o aviso. Uma 2ª tentativa (revisões do PR #168) */
async function gravarEstado(banco, itens, esperar) {
  try { await banco('rotinas_vigia_gravar', { itens }); return true; }
  catch {
    await esperar(ESPERA_MS);
    try { await banco('rotinas_vigia_gravar', { itens }); return true; }
    catch (e) { log({ nivel: 'erro', evento: 'estado do vigia não gravado', erro: codigoDe(e) }); return false; }
  }
}
