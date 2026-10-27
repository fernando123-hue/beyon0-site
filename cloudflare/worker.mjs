/* a entrada do Worker: só encaminha (a lógica mora nas tabelas, testadas em Node) */
import { rotear } from './rotas.mjs';
import { agendar } from './agenda.mjs';

export default {
  fetch(request, env) { return rotear(request, env); },
  scheduled(controller, env, ctx) { ctx.waitUntil(agendar(controller.cron, env)); }
};
