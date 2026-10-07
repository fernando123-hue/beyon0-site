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

const ACOES = {
  GET: { estado: 'estado', pagamento: 'pagamento', 'pagamento-config': 'pagamentoConfig' },
  POST: { sessao: 'sessao', renovar: 'renovar', mensagem: 'mensagem', contato: 'contato', gerar: 'gerar', 'gerar-direcao': 'gerarDirecao',
    escolher: 'escolher', alterar: 'alterar', escopo: 'escopo', confirmar: 'confirmar', pagar: 'pagar' }
};
const PRECISA_IA = new Set(['mensagem', 'gerarDirecao', 'alterar']);
const LIMITE_BYTES = 16384;
export const freioGeral = criarFreio({ max: 90, janelaMs: 60e3 });
export const freioSessao = criarFreio({ max: 8, janelaMs: 10 * 60e3 });   /* criar visitante anônimo: poucos por IP */

const json = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

export const GET = request => atender(request, process.env, 'GET');
export const POST = request => atender(request, process.env, 'POST');

export async function atender(request, env, metodo, deps) {
  const query = new URL(request.url).searchParams;
  const acao = ACOES[metodo] && ACOES[metodo][query.get('acao')];
  if (!acao) return json({ erro: 'Ação inválida.' }, 404);
  const ip = ipDe(request);
  if (freioGeral(ip) || (acao === 'sessao' && freioSessao(ip))) return json({ erro: 'Muitas requisições. Espere um minuto.' }, 429);

  let corpo = null;
  if (metodo === 'POST') {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return json({ erro: 'Envie JSON.' }, 415);
    const texto = await request.text();
    if (texto.length > LIMITE_BYTES) return json({ erro: 'Corpo grande demais.' }, 413);
    try { corpo = texto ? JSON.parse(texto) : {}; } catch { return json({ erro: 'JSON inválido.' }, 400); }
  }

  /* a configuração pública do pagamento (Public Key e ambiente): sem sessão, sem segredo */
  if (acao === 'pagamentoConfig') return json(configPublica(deps && deps.cfgPagamentos ? deps.cfgPagamentos : configPagamentos(env)));

  const d = deps || { banco: criarTransporte(env), visitantes: criarVisitantes(env), ia: await criarIA(env) };
  if (!deps && d.banco) {
    const cfg = configPagamentos(env);
    if (cfg.ativo) d.pagamentos = criarServicoPagamentos({ banco: d.banco, cfg });
    else if (cfg.motivo) console.error('[vendas] pagamentos desligados:', cfg.motivo);
  }
  if (!d.banco || !d.visitantes) { console.error('[vendas] banco ou autenticação não configurados'); return json({ erro: 'Serviço indisponível.' }, 503); }
  if (PRECISA_IA.has(acao) && !d.ia) { console.error('[vendas] IA não configurada (ANTHROPIC_API_KEY)'); return json({ erro: 'O consultor está indisponível agora. Fale com a Beyon Zero pelo WhatsApp.', whatsapp: true }, 503); }

  try {
    return json(await criarFluxo(d)[acao]({ request, query, corpo }));
  } catch (e) {
    const r = traduzirErro(e);
    if (r) return json({ erro: r.message, ...(r.extra || {}) }, r.status);
    console.error('[vendas] ' + acao + ':', e && e.codigo ? 'código ' + e.codigo : (e && e.message ? e.message.slice(0, 120) : 'erro'));
    return json({ erro: 'Erro interno.' }, 500);
  }
}
