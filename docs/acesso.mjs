/* ==========================================================================
   COMO OS SCRIPTS ALCANÇAM O STAGING ATRÁS DO ACCESS (plano da migração para a Cloudflare, § 5.4, tarefa B9).
   O Worker de prévias fica atrás do Cloudflare Access; o "service token" do agente (CF_ACCESS_CLIENT_ID e
   CF_ACCESS_CLIENT_SECRET, que o dono guarda num arquivo local e a fila do vigia carrega) é mandado em dois
   cabeçalhos. Regra de ouro: o token NUNCA vai para outro host. Só sai quando as DUAS variáveis existem e o BASE é o
   staging/prévia (beyon-zero-site-previa no workers.dev, https). Produção, domínio próprio e servidor local: nada.
   ========================================================================== */
const HOST_DE_PREVIA = /^(?:[a-z0-9-]+-)?beyon-zero-site-previa\.[a-z0-9-]+\.workers\.dev$/;

export function ehHostDePrevia(base) {
  let u;
  try { u = new URL(String(base || '')); } catch { return false; }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && HOST_DE_PREVIA.test(u.hostname);
}

/* { 'CF-Access-Client-Id': …, 'CF-Access-Client-Secret': … } ou {} (nunca lança, nunca devolve metade) */
export function cabecalhosDeAcesso(env = process.env, base = env.BASE || env.BZ_BASE) {
  const id = typeof env.CF_ACCESS_CLIENT_ID === 'string' ? env.CF_ACCESS_CLIENT_ID.trim() : '';
  const segredo = typeof env.CF_ACCESS_CLIENT_SECRET === 'string' ? env.CF_ACCESS_CLIENT_SECRET.trim() : '';
  if (!id || !segredo || !ehHostDePrevia(base)) return {};
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': segredo };
}

/* Playwright: instala os cabeçalhos SÓ nos pedidos da origem do staging (rota por origem). Nunca extraHTTPHeaders, que
   mandaria o token também a terceiros que a página chama (Turnstile, Mercado Pago, Google). Devolve se instalou. */
export async function autorizarContexto(ctx, base, env = process.env) {
  const cabecalhos = cabecalhosDeAcesso(env, base);
  if (Object.keys(cabecalhos).length === 0) return false;
  await ctx.route(new URL(base).origin + '/**', route => route.continue({ headers: { ...route.request().headers(), ...cabecalhos } }));
  return true;
}
