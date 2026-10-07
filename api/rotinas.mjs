/* ==========================================================================
   /api/rotinas — as ROTINAS DIÁRIAS do servidor, chamadas pelo cron da Vercel
   (vercel.json → crons) com o segredo do cron no cabeçalho. Uma porta só
   para o que roda sozinho, pelas MESMAS funções do banco que a API usa (a
   rotina não tem caminho próprio para contornar regra nenhuma).
   Hoje: a retenção de 90 dias que a página de privacidade promete
   (app.vendas_reter). A reconciliação de pagamentos segue no seu cron
   (/api/pagamentos?acao=reconciliar).
   Uso: GET /api/rotinas?acao=diaria  com  Authorization: Bearer <CRON_SECRET>
   ========================================================================== */
import { timingSafeEqual } from 'node:crypto';
import { criarTransporte } from './_vendas/transporte.mjs';

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const iguaisSeguro = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const GET = request => executar(request, process.env);
export const POST = request => executar(request, process.env);

export async function executar(request, env, deps = {}) {
  /* segredo curto ou ausente = rotina desligada (nunca "aberta") */
  const segredo = typeof env.CRON_SECRET === 'string' && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null;
  if (!segredo || !iguaisSeguro(request.headers.get('authorization') || '', 'Bearer ' + segredo)) return json({ erro: 'Não autorizado.' }, 401);
  if (new URL(request.url).searchParams.get('acao') !== 'diaria') return json({ erro: 'Não encontrado.' }, 404);
  const banco = deps.banco || criarTransporte(env);
  if (!banco) { console.error('[rotinas] sem banco'); return json({ erro: 'Indisponível.' }, 503); }
  try {
    const retencao = await banco('vendas_reter', {});
    console.log(JSON.stringify({ rotina: 'diaria', etapa: 'retencao', ...retencao }));
    return json({ ok: true, retencao });
  } catch (e) {
    console.error('[rotinas] retenção falhou:', e && e.codigo ? 'banco ' + e.codigo : 'erro');
    return json({ erro: 'Erro interno.' }, 500);
  }
}
