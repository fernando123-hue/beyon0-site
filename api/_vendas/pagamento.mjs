/* ==========================================================================
   PAGAMENTO — a camada do gateway (Fase 2, etapa 10). O dono decide o
   gateway depois; esta camada é a interface que qualquer um deles cumpre:
     criarCobranca({ pagamento_id, valor, descricao, cliente }) → { gateway_ref, link }
     verificarWebhook(request, corpo) → { valido, evento: { evento_id, tipo, gateway_ref } }
     consultar(gateway_ref) → { status: 'pendente'|'pago'|'cancelado'|'expirado'|'estornado', valor }
   Regra que vale para todos: o status NUNCA vem só do aviso. O webhook é
   (1) conferido pela assinatura e (2) confirmado consultando o gateway; só
   então app.vendas_confirmar_pagamento aplica (idempotente, valor conferido).
   "O navegador disse que pagou" não existe neste sistema.
   Implementado hoje: SIMULADO (assinatura HMAC-SHA256, como a do Mercado
   Pago), para testes, servidor local e staging — nunca em produção.
   Asaas e Mercado Pago entram como adaptadores quando houver conta
   (docs/fase2/02-OPERACAO.md: o que cada um exige).
   ========================================================================== */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const assinar = (segredo, texto) => createHmac('sha256', segredo).update(texto).digest('hex');
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/* o gateway simulado: guarda as cobranças em memória da instância (é dublê) */
export function gatewaySimulado({ segredo, base }) {
  const cobrancas = new Map();
  return {
    nome: 'simulado',
    async criarCobranca({ pagamento_id, valor }) {
      const ref = 'sim_' + randomUUID().replace(/-/g, '').slice(0, 20);
      cobrancas.set(ref, { status: 'pendente', valor: Number(valor), pagamento_id });
      return { gateway_ref: ref, link: base + '/docs/pagamento-simulado.html?ref=' + ref };
    },
    /* o "pagador" do simulado: muda o status e devolve o aviso assinado, como o gateway real mandaria */
    pagar(ref, status = 'pago') {
      const c = cobrancas.get(ref);
      if (!c) return null;
      c.status = status;
      const corpo = JSON.stringify({ id: 'evt_' + randomUUID().slice(0, 12), type: 'payment.updated', data: { id: ref } });
      const ts = String(Date.now());
      return { corpo, cabecalhos: { 'x-signature': 'ts=' + ts + ',v1=' + assinar(segredo, ts + '.' + corpo), 'content-type': 'application/json' } };
    },
    async verificarWebhook(request, corpo) {
      const sig = request.headers.get('x-signature') || '';
      const m = sig.match(/^ts=(\d{10,16}),v1=([0-9a-f]{64})$/);
      if (!m) return { valido: false, motivo: 'sem assinatura' };
      if (Math.abs(Date.now() - Number(m[1])) > 5 * 60e3) return { valido: false, motivo: 'assinatura velha' };   /* (reenvio de um aviso antigo) */
      if (!igual(m[2], assinar(segredo, m[1] + '.' + corpo))) return { valido: false, motivo: 'assinatura inválida' };
      let ev;
      try { ev = JSON.parse(corpo); } catch { return { valido: false, motivo: 'corpo inválido' }; }
      if (!ev || typeof ev.id !== 'string' || !ev.data || typeof ev.data.id !== 'string') return { valido: false, motivo: 'evento incompleto' };
      return { valido: true, evento: { evento_id: ev.id.slice(0, 200), tipo: String(ev.type || 'evento').slice(0, 80), gateway_ref: ev.data.id.slice(0, 120) } };
    },
    async consultar(ref) {
      const c = cobrancas.get(ref);
      return c ? { status: c.status, valor: c.valor } : null;
    }
  };
}

/* qual gateway: o simulado só fora de produção, e só com um segredo configurado (ou no servidor local) */
let simuladoUnico = null;
export function criarGateway(env = process.env) {
  if (env.PAGAMENTO_GATEWAY === 'simulado' || globalThis.__BZ_LOCAL) {
    /* nunca cobra "de mentira" fora de teste: lista do que PODE (local, preview, development), não do que não pode */
    const ambiente = env.VERCEL_ENV;
    if (ambiente ? !['preview', 'development'].includes(ambiente) : !!env.VERCEL) return null;
    const segredo = env.PAGAMENTO_SIMULADO_SEGREDO || (globalThis.__BZ_LOCAL && globalThis.__BZ_LOCAL.segredoPagamento);
    if (!segredo || segredo.length < 32) return null;
    simuladoUnico = simuladoUnico || gatewaySimulado({ segredo, base: env.SITE_URL || (globalThis.__BZ_LOCAL && globalThis.__BZ_LOCAL.base) || 'https://localhost' });
    return simuladoUnico;
  }
  return null;   /* Asaas / Mercado Pago: adaptadores pendentes da decisão do dono */
}
