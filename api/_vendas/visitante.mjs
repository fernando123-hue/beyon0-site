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
   O IP DO VISITANTE NO AUTH (migração para a Cloudflare, A10): atrás de um proxy o Supabase Auth vê o IP do proxy, e o limite
   dele por IP (login anônimo: 30 por hora por IP) viraria um balde compartilhado por todos os visitantes. Com
   SUPABASE_CHAVE_SECRETA e um IP válido, criar() e renovar() chamam o Auth com a chave SECRETA e o cabeçalho
   Sb-Forwarded-For (a doc do Supabase só aceita o cabeçalho com a chave secreta; o "IP Address Forwarding" precisa estar
   ligado no projeto, senão o Supabase ignora o cabeçalho e o comportamento é o de hoje).
   • O IP vem do rotear do Worker (validado, montado do zero, nunca copiado de cabeçalho do cliente) e passa por
     normalizarIp: IPv6 vai pelo prefixo /64 (2001:db8:a:b::1 → 2001:db8:a:b::), a casa inteira conta como um visitante,
     como nos freios do site. É intencional; o log do Auth mostra o prefixo, não o IP do celular.
   • Sem a chave secreta ou sem um IP válido: como antes (chave publicável, sem o cabeçalho).
   • NUNCA aponte o servidor local (que confia no x-forwarded-for) para o Supabase de staging com a chave secreta.
   • quem() segue com a chave publicável: é o /user com o token do próprio visitante.
   ========================================================================== */
import { configUsuario, tokenDe, usuarioDoToken, TEMPO_MAXIMO_MS, AuthIndisponivel } from '../_supabase.mjs';
import { normalizarIp } from './ip.mjs';

const SEM_LOGIN = 'Não consegui abrir o atendimento agora. Tente de novo em instantes.';
const LOGIN_DESLIGADO = 'O orçamento está indisponível agora. Fale com a Beyon Zero pelo WhatsApp.';
/* (auditoria 2026-10-09 e revisão técnica do lote 1) só o Supabase RECUSANDO o refresh encerra a sessão (400 token
   inválido, 401, 403, 422 refresh já usado ou revogado); 429, 408 e 5xx são passageiros */
const RECUSOU_TOKEN = new Set([400, 401, 403, 422]);
const passageiro = status => status === 429 || status === 408 || status >= 500;

/* uma chamada ao Auth: só a falha de REDE do fetch (TypeError "fetch failed") vira AuthIndisponivel (503 recuperável);
   o tempo esgotado segue como está (TimeoutError, que o fluxo já traduz para 503); erro de código segue como erro
   (500 com log), para não se esconder atrás de um "tente de novo" (revisão de segurança do lote 1) */
const deRede = e => e instanceof TypeError;
async function chamarAuth(url, opcoes, paraVisitante) {
  try { return await fetch(url, { ...opcoes, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) }); }
  catch (e) {
    if (!deRede(e)) throw e;
    throw new AuthIndisponivel('auth sem resposta: ' + e.message, paraVisitante);
  }
}

export function criarVisitantes(env = process.env, { ip } = {}) {
  const cfg = configUsuario(env);
  if (cfg) {
    const ipAuth = env.SUPABASE_CHAVE_SECRETA ? normalizarIp(String(ip || '')) : null;
    const cab = ipAuth ? { apikey: env.SUPABASE_CHAVE_SECRETA, 'sb-forwarded-for': ipAuth, 'content-type': 'application/json' } : { apikey: cfg.publica, 'content-type': 'application/json' };
    const sessao = s => (s && s.access_token && s.user?.id ? { token: s.access_token, refresh: s.refresh_token, expira_em: s.expires_at || null, visitante_id: s.user.id } : null);
    return {
      async criar() {
        const r = await chamarAuth(cfg.url + '/auth/v1/signup', { method: 'POST', headers: cab, body: JSON.stringify({ data: {} }) }, SEM_LOGIN);
        if (!r.ok && passageiro(r.status)) throw new AuthIndisponivel('login anônimo recusado: HTTP ' + r.status, SEM_LOGIN);
        /* outro 4xx é configuração (ex.: 422 anonymous_provider_disabled): tentar de novo não resolve. A pessoa vai
           para o WhatsApp e o log diz o que conferir; não é 500 porque o código não errou */
        if (!r.ok) throw new AuthIndisponivel('login anônimo desligado ou mal configurado no Supabase (Authentication › Allow anonymous sign-ins): HTTP ' + r.status, LOGIN_DESLIGADO, { recuperavel: false });
        return sessao(await r.json());
      },
      async renovar(refresh) {
        if (typeof refresh !== 'string' || refresh.length > 512 || !/^[A-Za-z0-9_-]+$/.test(refresh)) return null;
        const r = await chamarAuth(cfg.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: cab, body: JSON.stringify({ refresh_token: refresh }) });
        if (RECUSOU_TOKEN.has(r.status)) return null;
        if (!r.ok) throw new AuthIndisponivel('renovação: HTTP ' + r.status);
        return sessao(await r.json());
      },
      async quem(request) {
        const t = tokenDe(request);
        if (!t) return null;
        let u;
        try { u = await usuarioDoToken(cfg, t); }   /* (recusa = null; 429/5xx = AuthIndisponivel) */
        catch (e) {
          if (!deRede(e)) throw e;   /* (AuthIndisponivel, tempo esgotado e erro de código seguem como vieram) */
          throw new AuthIndisponivel('auth sem resposta: ' + e.message);
        }
        return u ? u.id : null;
      }
    };
  }
  if (globalThis.__BZ_LOCAL && globalThis.__BZ_LOCAL.auth) return globalThis.__BZ_LOCAL.auth;
  return null;
}
