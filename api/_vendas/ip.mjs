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

const IPV4_NO_FIM = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const hex = n => n.toString(16);
const ipv4De = (alto, baixo) => [alto >> 8, alto & 255, baixo >> 8, baixo & 255].join('.');

/* os 8 grupos de 16 bits de um IPv6 já validado (sem a zona), com o IPv4 do fim ("::ffff:1.2.3.4") em 2 grupos */
function grupos(ip) {
  const v4 = IPV4_NO_FIM.exec(ip);
  const s = v4 ? ip.slice(0, -v4[0].length) + hex((v4[1] << 8) | v4[2]) + ':' + hex((v4[3] << 8) | v4[4]) : ip;
  const [esq, dir = ''] = s.split('::');
  const a = esq ? esq.split(':') : [], b = dir ? dir.split(':') : [];
  return [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b].map(g => parseInt(g, 16));
}
const zerados = (g, de, ate) => g.slice(de, ate).every(x => x === 0);

/* a forma de contar um IP nos freios (este e o por instância, api/_freio.mjs → ipDe); null se não for IP.
   • IPv4: ele mesmo.
   • IPv4 dentro do IPv6, em qualquer escrita (::ffff:1.2.3.4, ::ffff:c000:201, 0:0:0:0:0:ffff:…, NAT64 64:ff9b::/96):
     o próprio IPv4 (revisão de segurança do lote 1, auditoria 2026-10-09).
   • IPv6 com os 64 bits iniciais zerados (::1, ::1.2.3.4 antigo, ::ffff:0:…): o endereço inteiro. Pelo /64, todos
     cairiam na chave "0:0:0:0::" e um visitante frearia os outros.
   • O resto do IPv6: o prefixo /64 ("2001:db8:a:b::"), um endereço válido (o freio diário o recebe de volta). */
export function normalizarIp(ip) {
  if (typeof ip !== 'string') return null;
  const semZona = ip.split('%')[0];
  const v = isIP(semZona);
  if (v === 4) return semZona;
  if (v !== 6) return null;
  const g = grupos(semZona.toLowerCase());
  if (zerados(g, 0, 5) && g[5] === 0xffff) return ipv4De(g[6], g[7]);
  if (g[0] === 0x64 && g[1] === 0xff9b && zerados(g, 2, 6)) return ipv4De(g[6], g[7]);
  if (zerados(g, 0, 4)) return g.map(hex).join(':');
  return g.slice(0, 4).map(hex).join(':') + '::';
}

export function chaveDoIp(ip, segredo, agora = new Date()) {
  if (!segredo || typeof ip !== 'string' || ip.length > 64) return null;
  const n = normalizarIp(ip);
  if (!n) return null;
  const normal = n.endsWith('::') ? n + '/64' : n;   /* ("2001:db8:a:b::/64": a mesma chave de antes desta revisão) */
  const dia = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });   /* AAAA-MM-DD no fuso do teto diário */
  return createHmac('sha256', segredo).update(dia + '|' + normal).digest('hex');
}
