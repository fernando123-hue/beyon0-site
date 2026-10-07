/* ==========================================================================
   /api/pagamentos — o WEBHOOK do gateway (Fase 2, etapa 10 e 11).
   1. confere a assinatura do aviso (sem ela: 401, nada muda);
   2. CONSULTA o gateway pela cobrança (o status e o valor vêm da fonte, não
      do corpo do aviso);
   3. app.vendas_confirmar_pagamento aplica numa transação: idempotente por
      evento, valor conferido, e o sinal pago cria cliente e projeto em produção.
   Responde 200 quando o aviso foi entendido (mesmo repetido), para o gateway
   não reenviar sem fim; 500 só em falha nossa (o gateway tenta de novo).
   ?acao=simular (só com o gateway simulado, fora de produção): a página de
   pagamento de desenvolvimento "paga" e o aviso assinado passa pelo mesmo
   caminho do real.
   ========================================================================== */
import { criarTransporte } from './_vendas/transporte.mjs';
import { criarGateway } from './_vendas/pagamento.mjs';
import { criarFreio, ipDe } from './_freio.mjs';

const LIMITE_BYTES = 65536;
const freio = criarFreio({ max: 120, janelaMs: 60e3 });
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const POST = request => receber(request, process.env);

export async function receber(request, env, deps) {
  if (freio(ipDe(request))) return json({ erro: 'Muitas requisições.' }, 429);
  const banco = deps?.banco || criarTransporte(env);
  const gateway = deps?.gateway || criarGateway(env);
  if (!banco || !gateway) return json({ erro: 'Não encontrado.' }, 404);
  const query = new URL(request.url).searchParams;

  if (query.get('acao') === 'simular') {
    if (gateway.nome !== 'simulado') return json({ erro: 'Não encontrado.' }, 404);
    let p;
    try { p = JSON.parse(await request.text()); } catch { return json({ erro: 'JSON inválido.' }, 400); }
    const aviso = gateway.pagar(String(p?.ref || ''), ['pago', 'cancelado', 'expirado'].includes(p?.status) ? p.status : 'pago');
    if (!aviso) return json({ erro: 'Cobrança não encontrada.' }, 404);
    return receber(new Request(request.url.split('?')[0], { method: 'POST', headers: aviso.cabecalhos, body: aviso.corpo }), env, { banco, gateway });
  }

  const corpo = await request.text();
  if (corpo.length > LIMITE_BYTES) return json({ erro: 'Corpo grande demais.' }, 413);
  const v = await gateway.verificarWebhook(request, corpo);
  if (!v.valido) { console.error('[pagamentos] aviso recusado:', v.motivo); return json({ erro: 'Assinatura inválida.' }, 401); }
  try {
    const fonte = await gateway.consultar(v.evento.gateway_ref);
    if (!fonte) return json({ ok: true, ignorado: 'cobrança desconhecida no gateway' });
    const r = await banco('vendas_confirmar_pagamento', { gateway: gateway.nome, evento_id: v.evento.evento_id, tipo: v.evento.tipo,
      gateway_ref: v.evento.gateway_ref, status: fonte.status, valor: fonte.valor });
    return json({ ok: true, aplicado: r.aplicado || null, duplicado: !!r.duplicado, sem_mudanca: !!r.sem_mudanca });   /* (sem ids internos na resposta ao gateway) */
  } catch (e) {
    console.error('[pagamentos] falha ao aplicar:', e && e.codigo ? 'código ' + e.codigo : 'erro');
    return json({ erro: 'Erro interno.' }, 500);
  }
}
