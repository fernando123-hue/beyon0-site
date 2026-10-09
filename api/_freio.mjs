/* ==========================================================================
   FREIO POR IP, comum às funções (antes vivia só em api/evento.mjs).
   Por instância da função: segura rajadas de um mesmo IP sem banco nem
   serviço externo. Não é muralha (instâncias diferentes não somam); a
   muralha é a regra de limite no firewall da Vercel (docs/fundacao/02-OPERACAO.md).
   Na Vercel o X-Forwarded-For é reescrito pela plataforma: não é forjável.
   ========================================================================== */
import { normalizarIp } from './_vendas/ip.mjs';

const TETO_IPS = 5000;   /* memória: acima disso, recomeça a contagem */

export function criarFreio({ max, janelaMs }) {
  const contagem = new Map();
  return function freado(ip, agora = Date.now()) {
    if (contagem.size > TETO_IPS) contagem.clear();
    const c = contagem.get(ip);
    if (!c || agora - c.desde > janelaMs) { contagem.set(ip, { desde: agora, n: 1 }); return false; }
    c.n++;
    return c.n > max;
  };
}

/* a chave do freio: o IPv4 como veio; o IPv6 pelo prefixo /64 (auditoria 2026-10-09: a casa inteira tem um /64 e troca
   os 64 bits finais à vontade, o que anulava os freios); IPv4 dentro do IPv6 é o próprio IPv4. As regras estão em
   normalizarIp (api/_vendas/ip.mjs), as mesmas do freio diário do banco, que recebe esta chave de volta (fluxo.mjs).
   O que não é IP ("local" no servidor de desenvolvimento) fica como veio. */
export function ipDe(request) {
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  return normalizarIp(ip) || ip;
}
