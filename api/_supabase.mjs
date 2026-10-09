/* ==========================================================================
   SUPABASE COMO O USUÁRIO (docs/fundacao/01-ARQUITETURA.md §5).
   Para os dados do negócio (esquema app), o backend NUNCA usa a chave
   secreta: fala com o Supabase com a chave PÚBLICA + o JWT do próprio
   usuário. Assim o RLS do banco vale também aqui dentro — se este código
   tiver um erro de autorização, o banco ainda recusa o que não é da
   organização da pessoa (defesa em camadas).
   A chave secreta fica em api/_banco.mjs e só serve às métricas anônimas.
   O token do usuário nunca vai para log.
   ========================================================================== */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TOKEN_MAX = 4096;

/* null = não configurado (a API responde "indisponível" e registra o motivo no log) */
export function configUsuario(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_CHAVE_PUBLICA) return null;
  return { url: env.SUPABASE_URL.replace(/\/+$/, ''), publica: env.SUPABASE_CHAVE_PUBLICA };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* o token do cabeçalho Authorization, só se tiver a forma de um JWT de usuário ainda dentro da validade
   (sub = uuid, exp no futuro). É só uma triagem para não gastar o Auth com lixo: quem decide se o token
   vale (assinatura, sessão revogada) é o Supabase Auth, em usuarioDoToken. */
export function tokenDe(request, agora = Date.now()) {
  const t = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!t || t.length > TOKEN_MAX || !JWT.test(t)) return null;
  let carga;
  try { carga = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!carga || !UUID.test(String(carga.sub || '')) || !Number.isFinite(carga.exp) || carga.exp * 1000 <= agora) return null;
  return t;
}

/* quem é o dono do token: o próprio Supabase Auth confere assinatura e validade. null = token recusado */
/* (auditoria 2026-10-07) toda chamada ao Supabase tem tempo máximo: sem ele, uma lentidão prendia a função até o teto da Vercel */
export const TEMPO_MAXIMO_MS = 10000;

/* o Auth não conseguiu responder (429, 5xx, rede): falha passageira, não token recusado. Quem chama devolve 503
   recuperável, nunca 401 "sessão expirada" (o navegador jogaria a conversa fora) nem 500 (auditoria 2026-10-09).
   paraVisitante: a frase que a pessoa lê; a mensagem do erro é só para o log. */
export class AuthIndisponivel extends Error {
  constructor(detalhe, paraVisitante) { super(detalhe); this.name = 'AuthIndisponivel'; this.paraVisitante = paraVisitante || null; }
}

export async function usuarioDoToken(cfg, token) {
  const r = await fetch(cfg.url + '/auth/v1/user', { headers: { apikey: cfg.publica, authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new AuthIndisponivel('auth respondeu HTTP ' + r.status);
  const u = await r.json().catch(() => null);
  return u && typeof u.id === 'string' ? { id: u.id } : null;
}

/* uma chamada REST ao PostgREST como o usuário, no esquema pedido (padrão: app) */
export function comoUsuario(cfg, token) {
  return async function rest(metodo, caminho, { corpo, prefer, esquema = 'app' } = {}) {
    const cab = { apikey: cfg.publica, authorization: 'Bearer ' + token, 'content-type': 'application/json', 'accept-profile': esquema, 'content-profile': esquema };
    if (prefer) cab.prefer = prefer;
    const r = await fetch(cfg.url + '/rest/v1/' + caminho, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }
    return { status: r.status, ok: r.ok, dados };
  };
}
