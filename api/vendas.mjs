/* ==========================================================================
   /api/vendas?acao=… — a API do agente de vendas (uma função; cada ação é um
   passo do fluxo, em api/_vendas/fluxo.mjs).
     GET  estado, pagamento, pagamento-config
     POST sessao, renovar, mensagem, contato, gerar, gerar-direcao, escolher,
          alterar, escopo, confirmar, pagar
   Fronteira: freio por IP, JSON obrigatório (um formulário de outro site não
   chega aqui), corpo limitado, token do visitante em cada ação (exceto criar
   a sessão), erro interno genérico (detalhe só no log, sem dado pessoal).
   ========================================================================== */
import { criarFluxo, traduzirErro } from './_vendas/fluxo.mjs';
import { criarTransporte } from './_vendas/transporte.mjs';
import { criarVisitantes } from './_vendas/visitante.mjs';
import { configPagamentos, configPublica } from './_pagamentos/config.mjs';
import { criarServicoPagamentos } from './_pagamentos/servico.mjs';
import { criarIA } from './_ia/provedor.mjs';
import { criarFreio, ipDe } from './_freio.mjs';
import { randomUUID } from 'node:crypto';

const ACOES = {
  GET: { estado: 'estado', pagamento: 'pagamento', 'pagamento-config': 'pagamentoConfig' },
  POST: { sessao: 'sessao', renovar: 'renovar', mensagem: 'mensagem', contato: 'contato', gerar: 'gerar', 'gerar-direcao': 'gerarDirecao',
    escolher: 'escolher', alterar: 'alterar', escopo: 'escopo', confirmar: 'confirmar', pagar: 'pagar' }
};
const PRECISA_IA = new Set(['mensagem', 'gerarDirecao', 'alterar']);
const LIMITE_BYTES = 16384;
export const freioGeral = criarFreio({ max: 90, janelaMs: 60e3 });
export const freioSessao = criarFreio({ max: 8, janelaMs: 10 * 60e3 });   /* criar visitante anônimo: poucos por IP */

/* toda resposta leva o x-request-id: o mesmo do log e do registro das chamadas de IA (app.ia_chamadas) */
const json = (dados, status = 200, requestId) => new Response(JSON.stringify(dados), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(requestId ? { 'x-request-id': requestId } : {}) }
});
/* log em uma linha JSON, sem dado pessoal: dá para filtrar por pedido no painel da Vercel */
const log = (nivel, dados) => console[nivel === 'erro' ? 'error' : 'log'](JSON.stringify({ origem: 'vendas', nivel, ...dados }));

export const GET = request => atender(request, process.env, 'GET');
export const POST = request => atender(request, process.env, 'POST');

export async function atender(request, env, metodo, deps) {
  const requestId = randomUUID();
  const responder = (dados, status) => json(dados, status, requestId);
  const query = new URL(request.url).searchParams;
  const acao = ACOES[metodo] && ACOES[metodo][query.get('acao')];
  if (!acao) return responder({ erro: 'Ação inválida.' }, 404);
  const ip = ipDe(request);
  if (freioGeral(ip) || (acao === 'sessao' && freioSessao(ip))) return responder({ erro: 'Muitas requisições. Espere um minuto.' }, 429);

  let corpo = null;
  if (metodo === 'POST') {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return responder({ erro: 'Envie JSON.' }, 415);
    const texto = await request.text();
    if (texto.length > LIMITE_BYTES) return responder({ erro: 'Corpo grande demais.' }, 413);
    try { corpo = texto ? JSON.parse(texto) : {}; } catch { return responder({ erro: 'JSON inválido.' }, 400); }
  }

  /* a configuração pública do pagamento (Public Key e ambiente): sem sessão, sem segredo */
  if (acao === 'pagamentoConfig') return responder(configPublica(deps && deps.cfgPagamentos ? deps.cfgPagamentos : configPagamentos(env)));

  /* segredoFreio: o HMAC do IP no freio diário (api/_vendas/ip.mjs); um segredo próprio, ou o do servidor do Supabase */
  const d = deps || { banco: criarTransporte(env), visitantes: criarVisitantes(env), ia: await criarIA(env), segredoFreio: env.FREIO_SEGREDO || env.SUPABASE_CHAVE_SECRETA };
  if (!deps && d.banco) {
    const cfg = configPagamentos(env);
    if (cfg.ativo) d.pagamentos = criarServicoPagamentos({ banco: d.banco, cfg });
    else if (cfg.motivo) log('erro', { request_id: requestId, evento: 'pagamentos desligados', motivo: cfg.motivo });
  }
  if (!d.banco || !d.visitantes) { log('erro', { request_id: requestId, evento: 'banco ou autenticação não configurados' }); return responder({ erro: 'Serviço indisponível.' }, 503); }
  if (PRECISA_IA.has(acao) && !d.ia) { log('erro', { request_id: requestId, evento: 'IA não configurada (ANTHROPIC_API_KEY)' }); return responder({ erro: 'O consultor está indisponível agora. Fale com a Beyon Zero pelo WhatsApp.', whatsapp: true }, 503); }

  try {
    return responder(await criarFluxo({ ...d, requestId })[acao]({ request, query, corpo }));
  } catch (e) {
    const r = traduzirErro(e);
    if (r) return responder({ erro: r.message, ...(r.extra || {}) }, r.status);
    log('erro', { request_id: requestId, acao, codigo: e && e.codigo ? e.codigo : null, erro: e && e.message ? e.message.slice(0, 120) : 'erro' });
    return responder({ erro: 'Erro interno.', pedido: requestId }, 500);   /* (o código do pedido: a pessoa cita, a equipe acha no log) */
  }
}
