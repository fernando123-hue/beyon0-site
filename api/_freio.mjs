/* ==========================================================================
   FREIO POR IP, comum às funções (antes vivia só em api/evento.mjs).
   Por instância da função: segura rajadas de um mesmo IP sem banco nem
   serviço externo. Não é muralha (instâncias diferentes não somam); a
   muralha é a regra de limite no firewall da Vercel (docs/fundacao/02-OPERACAO.md).
   Na Vercel o X-Forwarded-For é reescrito pela plataforma: não é forjável.
   ========================================================================== */
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

export const ipDe = request => (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
