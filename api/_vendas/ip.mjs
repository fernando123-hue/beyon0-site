/* ==========================================================================
   A CHAVE DO IP para o freio diário (app.vendas_reservar_ia → privado.freio_ip).
   O banco nunca recebe o IP: recebe HMAC-SHA256(segredo do servidor, dia|ip).
   Sem o segredo (variável de ambiente), o banco não volta ao IP; o dia entra
   na conta, então chaves de dias diferentes não se ligam. IPv6 conta pelo
   prefixo /64 (a casa inteira tem um /64 e troca o resto à vontade).
   Sem segredo, sem IP válido ou servidor local: sem chave (o freio não conta).
   ========================================================================== */
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

/* "2001:db8:a:b:c::1" → "2001:db8:a:b" (os 4 primeiros grupos = /64). Também o freio por instância (api/_freio.mjs → ipDe) */
export function prefixo64(ip) {
  const [esq, dir = ''] = ip.toLowerCase().split('::');
  const a = esq ? esq.split(':') : [], b = dir ? dir.split(':') : [];
  const grupos = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return grupos.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':');
}

export function chaveDoIp(ip, segredo, agora = new Date()) {
  if (!segredo || typeof ip !== 'string' || ip.length > 64) return null;
  const v = isIP(ip);
  if (!v) return null;
  const normal = v === 6 ? prefixo64(ip) + '::/64' : ip;
  const dia = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });   /* AAAA-MM-DD no fuso do teto diário */
  return createHmac('sha256', segredo).update(dia + '|' + normal).digest('hex');
}
