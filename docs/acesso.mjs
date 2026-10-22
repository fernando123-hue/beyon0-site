/* ==========================================================================
   COMO OS SCRIPTS ALCANÇAM O STAGING ATRÁS DO ACCESS (plano da migração para a Cloudflare, § 5.4, tarefa B9).
   O Worker de prévias fica atrás do Cloudflare Access; o "service token" do agente (CF_ACCESS_CLIENT_ID e
   CF_ACCESS_CLIENT_SECRET, que o dono guarda num arquivo local e a fila do vigia carrega) é mandado em dois
   cabeçalhos. Regra de ouro: o token NUNCA vai para outro host. Só sai quando as DUAS variáveis existem e o BASE é o
   staging/prévia DA CONTA DO DONO (beyon-zero-site-previa.<SUB_CONTA>.workers.dev, https). Produção, domínio próprio,
   servidor local e o Worker de mesmo nome em OUTRA conta (qualquer pessoa cria um): nada.
   ========================================================================== */

/* O subdomínio workers.dev da conta Cloudflare do dono (pendência P3). ENQUANTO FOR null, o staging fica FECHADO: o
   token do Access (e a chave do painel, scripts/direcoes.mjs) não vão a host nenhum. Só o dono o preenche, com o
   que a Cloudflare mostra em Workers & Pages → "Your subdomain" (letras minúsculas, números e hífen). */
export const SUB_CONTA = null;

const NOME_DO_STAGING = 'beyon-zero-site-previa';
const SUB_VALIDO = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const subOuNulo = sub => (typeof sub === 'string' && SUB_VALIDO.test(sub) ? sub : null);

/* o host fixo do staging, montado com o SUB_CONTA (ou o sub dado, nos testes); null se ainda não há SUB */
export function hostDoStaging(sub = SUB_CONTA) {
  const s = subOuNulo(sub);
  return s ? NOME_DO_STAGING + '.' + s + '.workers.dev' : null;
}

/* staging fixo ou prévia de branch ("<branch>-beyon-zero-site-previa"), SEMPRE com o SUB da conta do dono, comparação exata */
export function ehHostDePrevia(base, sub = SUB_CONTA) {
  const staging = hostDoStaging(sub);
  if (!staging) return false;
  let u;
  try { u = new URL(String(base || '')); } catch { return false; }
  const exato = u.hostname === staging || (u.hostname.endsWith('-' + staging) && /^[a-z0-9-]+$/.test(u.hostname.slice(0, -staging.length - 1)));
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && exato;
}

/* { 'CF-Access-Client-Id': …, 'CF-Access-Client-Secret': … } ou {} (nunca lança, nunca devolve metade) */
export function cabecalhosDeAcesso(env = process.env, base = env.BASE || env.BZ_BASE, sub = SUB_CONTA) {
  const id = typeof env.CF_ACCESS_CLIENT_ID === 'string' ? env.CF_ACCESS_CLIENT_ID.trim() : '';
  const segredo = typeof env.CF_ACCESS_CLIENT_SECRET === 'string' ? env.CF_ACCESS_CLIENT_SECRET.trim() : '';
  if (!id || !segredo || !ehHostDePrevia(base, sub)) return {};
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': segredo };
}

/* Playwright: instala os cabeçalhos SÓ nos pedidos da origem do staging (rota por origem). Nunca extraHTTPHeaders, que
   mandaria o token também a terceiros que a página chama (Turnstile, Mercado Pago, Google). Devolve se instalou. */
export async function autorizarContexto(ctx, base, env = process.env, sub = SUB_CONTA) {
  const cabecalhos = cabecalhosDeAcesso(env, base, sub);
  if (Object.keys(cabecalhos).length === 0) return false;
  await ctx.route(new URL(base).origin + '/**', route => route.continue({ headers: { ...route.request().headers(), ...cabecalhos } }));
  return true;
}
