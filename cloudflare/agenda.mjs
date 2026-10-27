/* os crons do Worker chamam as MESMAS funções que a Vercel chamava por GET, com o CRON_SECRET (api/_cron.mjs).
   O pedido é interno: não passa pelo rotear (não tem IP; o _cron.mjs só usa IP com segredo errado) */
import { receber as pagamentos } from '../api/pagamentos.mjs';
import { executar as rotinas } from '../api/rotinas.mjs';
import { segredoDoCron } from '../api/_cron.mjs';

export const AGENDA = Object.freeze({
  '23 */3 * * *': { rota: 'pagamentos', busca: '?acao=reconciliar' },
  '41 6 * * *': { rota: 'rotinas', busca: '?acao=diaria' }
});
const log = dados => console.error(JSON.stringify({ origem: 'agenda', nivel: 'erro', ...dados }));

export async function agendar(cron, env, rotas = { pagamentos, rotinas }) {
  const item = Object.hasOwn(AGENDA, cron) ? AGENDA[cron] : null;
  if (!item) return log({ evento: 'cron desconhecido', cron });
  const segredo = segredoDoCron(env);
  if (!segredo) return log({ evento: 'rotina desligada: CRON_SECRET ausente ou curto', cron });
  const pedido = new Request('https://interno.invalid/api/' + item.rota + item.busca, { headers: { authorization: 'Bearer ' + segredo } });
  const r = await rotas[item.rota](pedido, env);
  if (!r.ok) log({ evento: 'rotina respondeu erro', cron, status: r.status });
}
