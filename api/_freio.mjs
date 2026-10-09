/* ==========================================================================
   FREIO POR IP, comum às funções (antes vivia só em api/evento.mjs).
   Por instância da função: segura rajadas de um mesmo IP sem banco nem
   serviço externo. Não é muralha (instâncias diferentes não somam); a
   muralha é a regra de limite no firewall da Vercel (docs/fundacao/02-OPERACAO.md).
   Na Vercel o X-Forwarded-For é reescrito pela plataforma: não é forjável.
   ========================================================================== */
import { isIP } from 'node:net';
import { prefixo64 } from './_vendas/ip.mjs';

const TETO_IPS = 5000;   /* memória: acima disso, recomeça a contagem */
const IPV4_MAPEADO = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

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
   os 64 bits finais à vontade, o que anulava os freios). A chave do IPv6 continua um endereço válido ("2001:db8:a:b::"),
   porque o freio diário do banco (chaveDoIp em api/_vendas/ip.mjs) também a recebe. IPv4 mapeado ("::ffff:1.2.3.4") é o
   próprio IPv4: pelo /64, todos os mapeados cairiam numa chave só. */
export function ipDe(request) {
  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const mapeado = IPV4_MAPEADO.exec(ip);
  if (mapeado) return mapeado[1];
  return isIP(ip) === 6 ? prefixo64(ip) + '::' : ip;
}
