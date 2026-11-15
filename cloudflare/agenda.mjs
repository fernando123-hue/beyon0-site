/* os crons do Worker chamam as MESMAS funções que a Vercel chamava por GET, com o CRON_SECRET (api/_cron.mjs).
   O pedido é interno: não passa pelo rotear (não tem IP; o _cron.mjs só usa IP com segredo errado).
   (auto-reparo, 15/11) o cron de 3 em 3 h virou HORÁRIO, porque o plano grátis tem 5 crons por conta (eram 4, 2 por Worker):
   nas horas UTC múltiplas de 3 (as mesmas de antes) roda só a reconciliação; nas outras, só o VIGIA (api/_vigia/rondar.mjs).
   Os dois nunca dividem a mesma execução (50 subpedidos: a reconciliação usa até 45). O vigia não precisa do CRON_SECRET
   (é chamado por dentro, e a falta do segredo é uma das coisas que ele confere) */
import { receber as pagamentos } from '../api/pagamentos.mjs';
import { executar as rotinas } from '../api/rotinas.mjs';
import { segredoDoCron } from '../api/_cron.mjs';
import { rondar } from '../api/_vigia/rondar.mjs';

export const AGENDA = Object.freeze({
  '23 * * * *': { horaria: true },
  '41 6 * * *': { rota: 'rotinas', busca: '?acao=diaria' }
});
const RECONCILIAR = Object.freeze({ rota: 'pagamentos', busca: '?acao=reconciliar' });
const HORAS_DA_RECONCILIACAO = 3;
const log = dados => console.error(JSON.stringify({ origem: 'agenda', nivel: 'erro', ...dados }));

export async function agendar(cron, env, rotas = { pagamentos, rotinas }, { agora = Date.now(), vigiar = rondar } = {}) {
  const item = Object.hasOwn(AGENDA, cron) ? AGENDA[cron] : null;
  if (!item) return log({ evento: 'cron desconhecido', cron });
  if (item.horaria && new Date(agora).getUTCHours() % HORAS_DA_RECONCILIACAO !== 0) {
    try { await vigiar(env, { agora }); }
    catch (e) { log({ evento: 'vigia falhou', erro: e && e.name ? e.name : 'erro' }); }   /* (sem mensagem: pode ter dado de configuração) */
    return;
  }
  const alvo = item.horaria ? RECONCILIAR : item;
  const segredo = segredoDoCron(env);
  if (!segredo) return log({ evento: 'rotina desligada: CRON_SECRET ausente ou curto', cron });
  const pedido = new Request('https://interno.invalid/api/' + alvo.rota + alvo.busca, { headers: { authorization: 'Bearer ' + segredo } });
  const r = await rotas[alvo.rota](pedido, env);
  if (!r.ok) log({ evento: 'rotina respondeu erro', cron, status: r.status });
}
