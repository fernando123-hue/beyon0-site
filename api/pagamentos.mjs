/* ==========================================================================
   /api/pagamentos — o WEBHOOK do Mercado Pago e a RECONCILIAÇÃO.
   O webhook é superfície de ataque pública. Ordem das defesas:
     1. freio por IP e corpo limitado;
     2. tipo "order" e data.id no formato de order;
     3. corpo JSON válido; se o corpo traz data.id, tem de ser o mesmo da query;
     4. assinatura x-signature (HMAC com a assinatura secreta, tempo constante);
     5. o aviso NÃO decide nada: o servidor CONSULTA a order com o Access Token
        e aplica o retrato pelo banco (app.pagamentos_aplicar confere tudo).
   Respostas: 200 quando entendido (mesmo ignorado, para o MP não reenviar sem
   fim); 401 assinatura; 400 formato; 500 quando a consulta ou o banco falham
   (o MP reenvia; fail closed). Nenhuma resposta traz dado interno.
   ?acao=reconciliar  — agendado (Vercel Cron), exige Authorization: Bearer CRON_SECRET.
   ?acao=simular      — SÓ no servidor local: "paga" o Pix no simulador e manda o aviso assinado.
   ========================================================================== */
import { conferirCron } from './_cron.mjs';
import { criarTransporte } from './_vendas/transporte.mjs';
import { configPagamentos } from './_pagamentos/config.mjs';
import { criarServicoPagamentos } from './_pagamentos/servico.mjs';
import { verificarAssinatura } from './_pagamentos/assinatura.mjs';
import { ErroProvedor } from './_pagamentos/mercadopago.mjs';
import { criarFreio, ipDe } from './_freio.mjs';

const LIMITE_BYTES = 65536;
const ID_ORDER = /^ORD[0-9A-Za-z]{10,60}$/;
const freio = criarFreio({ max: 120, janelaMs: 60e3 });
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export const POST = request => receber(request, process.env);
export const GET = request => receber(request, process.env);

/* aviso com assinatura válida de uma order que o MP ainda não devolve (consistência eventual): pede reenvio por até 6 h */
const REENVIO_ORDER_NAO_LEGIVEL_MS = 6 * 3600e3;

export async function receber(request, env, deps = {}) {
  const query = new URL(request.url).searchParams;
  const acao = query.get('acao');
  if (acao !== 'reconciliar' && freio(ipDe(request))) return json({ erro: 'Muitas requisições.' }, 429);
  const banco = deps.banco || criarTransporte(env);
  const cfg = deps.cfg || configPagamentos(env);
  if (!banco || !cfg.ativo) { console.error('[pagamentos] desligado:', cfg.motivo || 'sem banco'); return json({ erro: 'Indisponível.' }, 503); }
  const servico = deps.servico || criarServicoPagamentos({ banco, cfg });

  if (acao === 'reconciliar') return reconciliar(request, cfg, servico);
  if (acao === 'simular') return simular(request, cfg, env, deps);
  if (request.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  return aviso(request, query, cfg, banco, servico);
}

async function aviso(request, query, cfg, banco, servico) {
  const requestId = (request.headers.get('x-request-id') || '').slice(0, 120) || null;
  /* recusa ANTES da assinatura não grava no banco (quem não tem o segredo não pode encher a trilha): só o log */
  const recusar = (status, motivo) => {
    console.error('[pagamentos] aviso recusado:', motivo);
    return json({ erro: status === 401 ? 'Assinatura inválida.' : 'Aviso inválido.' }, status);
  };
  const tamanho = Number(request.headers.get('content-length') || 0);
  if (tamanho > LIMITE_BYTES) return recusar(413, 'corpo grande demais');
  const texto = await request.text();
  if (texto.length > LIMITE_BYTES) return recusar(413, 'corpo grande demais');
  const dataId = query.get('data.id') || query.get('id');
  const tipo = query.get('type') || query.get('topic');
  if (!dataId || !ID_ORDER.test(dataId)) return recusar(400, 'data.id ausente ou fora do formato');
  let corpo = null;
  if (texto) { try { corpo = JSON.parse(texto); } catch { return recusar(400, 'JSON inválido', dataId); } }
  const tipoCorpo = corpo && typeof corpo.type === 'string' ? corpo.type : null;
  if ((tipo || tipoCorpo) !== 'order' || (tipo && tipoCorpo && tipo !== tipoCorpo)) return recusar(400, 'tipo de aviso não tratado', dataId);
  const idCorpo = corpo && corpo.data && typeof corpo.data.id === 'string' ? corpo.data.id : null;
  if (idCorpo && idCorpo.toLowerCase() !== dataId.toLowerCase()) return recusar(400, 'data.id do corpo diferente da query', dataId);

  const v = verificarAssinatura({ xSignature: request.headers.get('x-signature'), xRequestId: requestId, dataId, segredo: cfg.segredoWebhook });
  if (!v.valido) return recusar(401, v.motivo, dataId);

  await banco('pagamentos_registrar_aviso', { provedor: 'mercadopago', provedor_ref: dataId, request_id: requestId,
    acao: corpo && typeof corpo.action === 'string' ? corpo.action : null }).catch(e => console.error('[pagamentos] trilha do aviso falhou:', e && e.codigo));
  try {
    const r = await servico.processarAviso({ orderId: dataId, requestId });
    if (r && r.ignorado === 'order não encontrada nesta conta' && Date.now() - v.tsMs < REENVIO_ORDER_NAO_LEGIVEL_MS) {
      return json({ erro: 'Order ainda não disponível.' }, 503);   /* o MP reenvia a cada 15 min */
    }
    return json({ ok: true, ...(r && r.duplicada ? { duplicada: true } : {}), ...(r && r.sem_mudanca ? { sem_mudanca: true } : {}) });
  } catch (e) {
    console.error('[pagamentos] falha ao processar aviso:', e instanceof ErroProvedor ? 'provedor ' + e.tipo : (e && e.codigo ? 'banco ' + e.codigo : 'erro'));
    return json({ erro: 'Erro interno.' }, 500);   /* o MP reenvia; nada foi aplicado pela metade (uma transação) */
  }
}

async function reconciliar(request, cfg, servico) {
  const acesso = conferirCron(request, cfg.cronSecret);   /* (api/_cron.mjs: 32+ caracteres, tentativa errada freia) */
  if (acesso === 'freado') return json({ erro: 'Muitas tentativas.' }, 429);
  if (acesso !== 'ok') return json({ erro: 'Não autorizado.' }, 401);
  try { return json({ ok: true, ...(await servico.reconciliar({})) }); }
  catch (e) { console.error('[pagamentos] reconciliação falhou:', e && e.codigo ? 'banco ' + e.codigo : (e && e.tipo) || 'erro'); return json({ erro: 'Erro interno.' }, 500); }
}

/* só o servidor local: o simulador "paga" o Pix (ou conclui o 3DS) e o aviso assinado passa pelo MESMO caminho do real */
async function simular(request, cfg, env, deps) {
  const local = globalThis.__BZ_LOCAL;
  if (cfg.ambiente !== 'simulado' || !local || !local.mp || env.VERCEL || env.VERCEL_ENV) return json({ erro: 'Não encontrado.' }, 404);
  if (request.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  let p;
  try { p = JSON.parse(await request.text()); } catch { return json({ erro: 'JSON inválido.' }, 400); }
  const order = typeof p?.tentativa_id === 'string' ? local.mp.sim.porReferencia(p.tentativa_id) : null;
  if (!order) return json({ erro: 'Cobrança não encontrada.' }, 404);
  if (p.acao === 'desafio') local.mp.sim.concluirDesafio(order.id, p.aprovado !== false);
  else local.mp.sim.pagarPix(order.id);
  const a = local.mp.sim.aviso(order.id);
  const base = new URL(request.url);
  return receber(new Request(base.origin + base.pathname + a.query, { method: 'POST', headers: a.cabecalhos, body: a.corpo }), env, { banco: deps.banco, cfg: deps.cfg });
}
