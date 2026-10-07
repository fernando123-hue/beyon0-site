/* ==========================================================================
   O VISITANTE: um usuário ANÔNIMO do Supabase Auth (a mesma autenticação da
   equipe; a especificação pede "não crie uma segunda autenticação").
   • criar(): o backend pede ao Supabase um login anônimo (/auth/v1/signup sem
     e-mail) com a chave pública; o navegador recebe só o token desse
     visitante, que vale para a conversa DELE (RLS e funções conferem).
   • renovar(refresh): troca o token vencido (/auth/v1/token?grant_type=refresh_token).
   • quem(request): confere o token no próprio Supabase Auth (assinatura,
     validade, sessão revogada) e devolve o id do visitante.
   Exige, no painel do Supabase: Authentication › "Allow anonymous sign-ins"
   ligado (o cadastro com e-mail continua desligado) — docs/fase2/02-OPERACAO.md.
   Local e testes: globalThis.__BZ_LOCAL.auth (tokens HS256 de desenvolvimento).
   ========================================================================== */
import { configUsuario, tokenDe, usuarioDoToken, TEMPO_MAXIMO_MS } from '../_supabase.mjs';

export function criarVisitantes(env = process.env) {
  const cfg = configUsuario(env);
  if (cfg) {
    const cab = { apikey: cfg.publica, 'content-type': 'application/json' };
    const sessao = s => (s && s.access_token && s.user?.id ? { token: s.access_token, refresh: s.refresh_token, expira_em: s.expires_at || null, visitante_id: s.user.id } : null);
    return {
      async criar() {
        const r = await fetch(cfg.url + '/auth/v1/signup', { method: 'POST', headers: cab, body: JSON.stringify({ data: {} }), signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
        if (!r.ok) throw new Error('login anônimo recusado: HTTP ' + r.status);
        return sessao(await r.json());
      },
      async renovar(refresh) {
        if (typeof refresh !== 'string' || refresh.length > 512 || !/^[A-Za-z0-9_-]+$/.test(refresh)) return null;
        const r = await fetch(cfg.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: cab, body: JSON.stringify({ refresh_token: refresh }), signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
        return r.ok ? sessao(await r.json()) : null;
      },
      async quem(request) {
        const t = tokenDe(request);
        if (!t) return null;
        const u = await usuarioDoToken(cfg, t);
        return u ? u.id : null;
      }
    };
  }
  if (globalThis.__BZ_LOCAL && globalThis.__BZ_LOCAL.auth) return globalThis.__BZ_LOCAL.auth;
  return null;
}
