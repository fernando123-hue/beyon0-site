/* a entrada do Worker: só encaminha (a lógica mora nas tabelas, testadas em Node) */
import { rotear } from './rotas.mjs';
import { agendar } from './agenda.mjs';

export default {
  fetch(request, env, ctx) { return rotear(request, env, ctx); },
  /* (a hora AGENDADA, não a do relógio: decide reconciliação × vigia mesmo se o cron atrasar) */
  scheduled(controller, env, ctx) { ctx.waitUntil(agendar(controller.cron, env, undefined, { agora: controller.scheduledTime })); }
};
