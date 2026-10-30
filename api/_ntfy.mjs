/* ==========================================================================
   O AVISO NO CELULAR DO DONO (ntfy.sh; grátis, sem conta). Um só lugar para quem manda: a rotina diária (api/rotinas.mjs) e
   os avisos de "pedido novo na fila" e "recado novo" (api/_vendas). O tópico é o segredo (ALERTA_NTFY_TOPICO, longo e
   aleatório; ALERTA_NTFY_TOKEN opcional, de conta grátis do ntfy). No ntfy.sh público quem souber o tópico lê e escreve
   nele: o texto NUNCA leva dado do cliente nem o conteúdo de um recado.
   ========================================================================== */
const TOPICO = /^[A-Za-z0-9_-]{20,64}$/;
const TOKEN = /^tk_[A-Za-z0-9]{20,64}$/;
const ESPERA_MAX_MS = 2000;   /* o aviso nunca atrasa a gravação do pedido ou do recado além disto */

export const topicoDe = env => (env && TOPICO.test(env.ALERTA_NTFY_TOPICO || '') ? env.ALERTA_NTFY_TOPICO : null);
export const tokenDe = env => (env && TOKEN.test(env.ALERTA_NTFY_TOKEN || '') ? env.ALERTA_NTFY_TOKEN : null);

/* POST de texto no tópico (o app ntfy inscrito nele mostra a notificação) */
export async function ntfy(topico, texto, urgente, token, titulo = 'Beyon Zero: alerta do site', tags = 'warning', timeoutMs = 5000) {
  const r = await fetch('https://ntfy.sh/' + topico, { method: 'POST', body: texto, signal: AbortSignal.timeout(timeoutMs),
    headers: { title: titulo, priority: urgente ? 'high' : 'default', tags, ...(token ? { authorization: 'Bearer ' + token } : {}) } });
  if (!r.ok) throw new Error('ntfy HTTP ' + r.status);
}

export const AVISOS = Object.freeze({
  pedido: 'Pedido novo na fila. Detalhes no painel.',
  recado: 'Recado novo. Leia no painel.',
  fila_cheia: 'URGENTE: a fila de pedidos encheu ou o limite por hora foi atingido. Veja o painel.'
});

/* Avisa o dono com um dos textos FIXOS de AVISOS. Sem tópico: não faz nada. Falha ou demora: só log, nunca erro
   (quem chama pode dar await sem medo). `deps.enviar` troca o envio nos testes */
const UM_POR_JANELA = { fila_cheia: 10 * 60e3 };   /* (a fila cheia recusa muita gente: um aviso a cada 10 min por instância, não um por recusa) */
const ultimoAviso = {};
export async function avisarDono(env, tipo, deps = {}) {
  const topico = topicoDe(env);
  const texto = Object.hasOwn(AVISOS, tipo) ? AVISOS[tipo] : null;
  if (!topico || !texto) return false;
  const agora = (deps.agora || Date.now)();
  if (UM_POR_JANELA[tipo]) {
    if (ultimoAviso[tipo] !== undefined && agora - ultimoAviso[tipo] < UM_POR_JANELA[tipo]) return false;
    ultimoAviso[tipo] = agora;
  }
  const enviar = deps.enviar || ((t, x, u, k) => ntfy(t, x, u, k, 'Beyon Zero', tipo === 'pedido' ? 'package' : tipo === 'fila_cheia' ? 'rotating_light' : 'speech_balloon', ESPERA_MAX_MS));
  let espera;
  try {
    await Promise.race([
      Promise.resolve().then(() => enviar(topico, texto, tipo === 'fila_cheia', tokenDe(env))),
      new Promise((_, rej) => { espera = setTimeout(() => rej(new Error('ntfy demorou')), deps.esperaMs ?? ESPERA_MAX_MS); })
    ]);
    return true;
  } catch (e) {
    console.error(JSON.stringify({ origem: 'ntfy', nivel: 'aviso', evento: 'aviso ao dono não enviado', tipo, erro: e && e.message ? String(e.message).slice(0, 80) : 'erro' }));
    return false;
  } finally { clearTimeout(espera); }
}
