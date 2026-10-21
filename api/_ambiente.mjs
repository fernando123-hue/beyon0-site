/* ==========================================================================
   EM QUE AMBIENTE O CÓDIGO RODA: 'producao' | 'previa' | 'local' (plano da migração para a Cloudflare, 2026-10-21).
   • Cloudflare: reconhecida pelo RUNTIME (navigator.userAgent === 'Cloudflare-Workers', fixo no workerd), não por
     configuração: não dá para esquecer nem forjar por variável, e vale também para quem lê process.env.
     BZ_AMBIENTE === 'previa' (exato) = prévia; QUALQUER outra coisa = produção (fechado por padrão).
     BZ_PLATAFORMA=cloudflare só simula a Cloudflare nos testes em Node.
   • Vercel (só até o PR D): VERCEL_ENV preview/development = prévia; o resto = produção.
   • Nada disso: local (servidor local e testes).
   ========================================================================== */
const USER_AGENT_CLOUDFLARE = 'Cloudflare-Workers';

const objeto = env => (env && typeof env === 'object' ? env : {});
const naVercel = e => !!(e.VERCEL || e.VERCEL_ENV);
/* (a simulação por BZ_PLATAFORMA nunca vale na Vercel: lá ela viraria "previa" numa produção) */
export const naCloudflare = env => {
  const e = objeto(env);
  return globalThis.navigator?.userAgent === USER_AGENT_CLOUDFLARE || (e.BZ_PLATAFORMA === 'cloudflare' && !naVercel(e));
};

export function ambienteDe(env) {
  const e = objeto(env);
  if (naCloudflare(e)) return String(e.BZ_AMBIENTE || '').trim() === 'previa' ? 'previa' : 'producao';
  if (naVercel(e)) return ['preview', 'development'].includes(e.VERCEL_ENV) ? 'previa' : 'producao';
  return 'local';
}

export const foraDoLocal = env => ambienteDe(env) !== 'local';
