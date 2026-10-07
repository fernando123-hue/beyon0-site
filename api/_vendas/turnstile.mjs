/* ==========================================================================
   ANTI-ROBÔ do /orcamento (Cloudflare Turnstile), na criação da sessão.
   Decisão do dono, 2026-10-07 ("Podemos usar sim"); revisão de segurança do
   PR #1, M1: criar visitante anônimo não tinha barreira além do freio por IP
   (em memória, por instância). É só o widget: a Cloudflare não fica na
   frente do site (essa fase continua "no fim").
   • Com TURNSTILE_SITE_KEY e TURNSTILE_SECRET: o token do widget é conferido
     na Cloudflare (siteverify, doc oficial "Server-side validation") antes de
     criar o visitante. Token: até 2.048 caracteres, vale 5 min, uso único.
   • Na produção da Vercel sem as chaves, com o segredo de TESTE da
     Cloudflare, ou em qualquer ambiente com só uma das duas chaves: FECHADO
     (a sessão é recusada e a página oferece o WhatsApp). Erro de
     configuração na Cloudflare (segredo inválido, erro interno) também:
     503, não "robô". Prévia, desenvolvimento e servidor local sem
     chaves: não exige (os testes e o E2E rodam sem Cloudflare).
   • O IP do visitante NÃO é mandado (remoteip é opcional): o widget já fala
     direto com a Cloudflare; o servidor não acrescenta dado.
   Chaves de teste oficiais (doc "Testing"): site 1x00000000000000000000AA e
   segredo 1x0000000000000000000000000000000AA sempre passam.
   ========================================================================== */
import { randomUUID } from 'node:crypto';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TOKEN_MAX = 2048;
const TEMPO_MS = 8000;
/* segredos de TESTE da Cloudflare (1x… passa sempre, 2x… falha, 3x… já usado): nunca valem na produção */
const SEGREDO_DE_TESTE = /^[123]x0{20,}/;
/* recusa que vem da CONFIGURAÇÃO ou da Cloudflare, não do visitante: 503 com WhatsApp, não "robô" */
const ERRO_NOSSO = new Set(['missing-input-secret', 'invalid-input-secret', 'internal-error', 'bad-request']);

export function configTurnstile(env = {}) {
  const siteKey = env.TURNSTILE_SITE_KEY || null, segredo = env.TURNSTILE_SECRET || null;
  const fechado = motivo => ({ exigido: true, siteKey: null, segredo: null, motivo });
  const naVercel = !!(env.VERCEL || env.VERCEL_ENV);
  const producao = naVercel && !['preview', 'development'].includes(env.VERCEL_ENV);
  if (!!siteKey !== !!segredo) return fechado('só uma das chaves do Turnstile está configurada');   /* (meia configuração: em qualquer ambiente) */
  if (siteKey && segredo) {
    if (producao && SEGREDO_DE_TESTE.test(segredo)) return fechado('segredo de teste da Cloudflare na produção');
    return { exigido: true, siteKey, segredo };
  }
  if (producao) return fechado('TURNSTILE_SITE_KEY/TURNSTILE_SECRET ausentes na produção');
  return { exigido: false, siteKey: null, segredo: null };
}

/* { ok } ou { ok: false, motivo: 'nao_configurado' | 'sem_token' | 'recusado' | 'indisponivel', codigos } */
export async function verificarHumano(cfg, token, buscar = fetch) {
  if (!cfg.exigido) return { ok: true };
  if (!cfg.segredo) return { ok: false, motivo: 'nao_configurado' };
  if (typeof token !== 'string' || !token || token.length > TOKEN_MAX) return { ok: false, motivo: 'sem_token' };
  try {
    const r = await buscar(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: cfg.segredo, response: token, idempotency_key: randomUUID() }),
      signal: AbortSignal.timeout(TEMPO_MS)
    });
    const j = await r.json();
    if (j && j.success === true) return { ok: true };
    const codigos = Array.isArray(j && j['error-codes']) ? j['error-codes'].slice(0, 3).map(c => String(c).slice(0, 40)) : [];
    return { ok: false, motivo: codigos.some(c => ERRO_NOSSO.has(c)) ? 'indisponivel' : 'recusado', codigos };
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
}
