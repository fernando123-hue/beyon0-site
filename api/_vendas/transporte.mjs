/* ==========================================================================
   COMO O BACKEND CHAMA AS FUNÇÕES DO BANCO (app.vendas_*). Uma função só:
     await rpc('vendas_estado', { conversa_id, visitante_id })
   • Produção: PostgREST do Supabase (/rest/v1/rpc/<nome>) com a chave
     SECRETA, no esquema app. As funções só existem para service_role; quem
     decide se o visitante pode é a função (dono da conversa) — o backend só
     passa o id tirado do token conferido.
   • Local e testes: o servidor de desenvolvimento (docs/servidor.mjs) ou o
     teste instala um transporte em globalThis.__BZ_LOCAL (PGlite com as
     mesmas migrations). O código de api/ nunca importa o PGlite: em produção
     ele nem é instalado (npm ci --omit=dev).
   Erros do banco viram ErroBanco com o código SQLSTATE (P0002 não achou,
   55000 etapa errada, 22023 inválido, 23514 regra, 42501 sem permissão).
   ========================================================================== */
export class ErroBanco extends Error {
  constructor(codigo, mensagem) { super(mensagem || codigo); this.codigo = codigo; }
}

export function criarTransporte(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_CHAVE_SECRETA) {
    const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/';
    const chave = env.SUPABASE_CHAVE_SECRETA;
    const cab = { apikey: chave, 'content-type': 'application/json', 'content-profile': 'app', 'accept-profile': 'app',
      ...(chave.startsWith('eyJ') ? { authorization: 'Bearer ' + chave } : {}) };
    return async function rpc(nome, p) {
      if (!/^vendas_[a-z_]{2,40}$/.test(nome)) throw new ErroBanco('22023', 'função inválida');
      const r = await fetch(base + nome, { method: 'POST', headers: cab, body: JSON.stringify({ p }) });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new ErroBanco((corpo && corpo.code) || 'HTTP' + r.status, 'rpc ' + nome + ': HTTP ' + r.status);
      return corpo;
    };
  }
  if (globalThis.__BZ_LOCAL && typeof globalThis.__BZ_LOCAL.rpc === 'function') return globalThis.__BZ_LOCAL.rpc;
  return null;
}
