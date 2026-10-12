/* ==========================================================================
   classificar(tarefa, entrada): o ponto único. Com o JEV desligado (padrão),
   usa as regras. Com BZ_JEV=ligado, tenta o JEV com tempo-limite e, se ele
   falhar, demorar ou disser "indisponível", recua para as regras: o site
   nunca para por causa do classificador.
   ========================================================================== */
import { TAREFAS, resultado } from './contrato.mjs';
import { regras } from './regras.mjs';
import { jev } from './jev.mjs';

export const configClassificador = (env = process.env) => ({ jev: String(env.BZ_JEV || '').trim().toLowerCase() === 'ligado', prazoMs: 1500 });

const comPrazo = (p, ms) => new Promise((ok, falha) => { const t = setTimeout(() => falha(new Error('prazo')), ms); Promise.resolve(p).then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); falha(e); }); });

export async function classificar(tarefa, entrada, { cfg = configClassificador(), adaptadores = {} } = {}) {
  if (!TAREFAS.includes(tarefa)) throw new Error('tarefa desconhecida: ' + tarefa);
  const usar = { regras, jev, ...adaptadores };
  if (cfg.jev) {
    try {
      const r = await comPrazo(usar.jev(tarefa, entrada), cfg.prazoMs);
      if (r && r.disponivel === true && r.dados) return resultado(tarefa, 'jev', r.dados);
    } catch { /* recua para as regras */ }
  }
  return usar.regras(tarefa, entrada);
}
