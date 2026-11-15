/* ==========================================================================
   O VIGIA — A RONDA (spec docs/superpowers/specs/2026-11-15-auto-reparo-design.md). Chamada pelo cron horário
   (cloudflare/agenda.mjs) nas horas sem reconciliação. Nunca chama IA.
     1. confere o que o Worker vê sozinho (páginas, configuração: ./conferir.mjs);
     2. lê o banco numa chamada (app.rotinas_vigia_ler: a memória do vigia e os números de agora), com uma 2ª tentativa;
     3. decide (./decidir.mjs) e manda UM e-mail com as novidades (api/_aviso.mjs);
     4. só então grava o estado: o que não saiu no e-mail não fica "avisado" e volta na ronda seguinte.
   Banco fora: sem memória, regra fixa de horário (D3). A função do vigia que não existe (migration ainda não aplicada)
   não é "banco fora": só log, para não mandar alarme falso ao dono.
   Subpedidos externos: no máximo 3 (a leitura com a 2ª tentativa e a gravação).
   ========================================================================== */
import { criarTransporte } from '../_vendas/transporte.mjs';
import { ORG } from '../_vendas/org.mjs';
import { avisarDonoLinhas } from '../_aviso.mjs';
import { conferir as conferirPadrao } from './conferir.mjs';
import { achadosDe, decidir, decidirSemBanco, lembrarSemBanco } from './decidir.mjs';

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

  if (!banco) {
    log({ nivel: 'erro', evento: 'ronda sem banco configurado', paginas: conferencias.paginas, faltando: conferencias.configuracao });
    return { linhas: [], enviado: false, semBanco: true };
  }
  const { leitura, semFuncao, erro } = await ler(banco, esperar);
  if (semFuncao) { log({ nivel: 'erro', evento: 'a migration do vigia não foi aplicada (app.rotinas_vigia_ler)' }); return { linhas: [], enviado: false, semBanco: true }; }

  if (!leitura) {
    const doWorker = Object.values(achadosDe(LEITURA_NEUTRA, conferencias, agora)).filter(Boolean);
    const linhas = decidirSemBanco(agora, memoria, doWorker);
    const enviado = linhas.length ? await avisar(linhas) : false;
    if (enviado) lembrarSemBanco(memoria, agora);
    log({ nivel: 'erro', evento: 'ronda com o banco fora', erro, linhas: linhas.length, enviado });
    return { linhas, enviado, semBanco: true };
  }

  const achados = achadosDe(leitura, conferencias, agora);
  const { linhas, itens } = decidir(leitura.estado || {}, achados, agora);
  const enviado = linhas.length ? await avisar(linhas) : false;
  const gravar = itens.filter(i => enviado || !i.noEmail).map(({ noEmail, ...i }) => i);
  if (gravar.length) {
    try { await banco('rotinas_vigia_gravar', { itens: gravar }); }
    catch (e) { log({ nivel: 'erro', evento: 'estado do vigia não gravado', erro: codigoDe(e) }); }
  }
  const quebrados = Object.keys(achados).filter(k => achados[k]);
  log({ nivel: quebrados.length ? 'erro' : 'info', evento: 'ronda', quebrados, linhas: linhas.length, enviado });
  return { linhas, enviado, semBanco: false };
}
