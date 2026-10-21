/* ==========================================================================
   /api/rotinas — as ROTINAS DIÁRIAS do servidor, chamadas pelo cron da Vercel
   (vercel.json → crons) com o segredo do cron no cabeçalho. Uma porta só
   para o que roda sozinho, pelas MESMAS funções do banco que a API usa (a
   rotina não tem caminho próprio para contornar regra nenhuma).
     1. retenção que a página de privacidade promete (app.vendas_reter): texto das conversas de quem não fechou em
        60 dias, o contato dele em 12 meses, e o texto da conversa de quem pagou em 30 dias (menos contestação)
     2. retenção das métricas (~13 meses; antes era feita ao ABRIR o painel)
     2b. o pedido de modelos (PR 2a): vence quem não confirmou pelo WhatsApp em 72 h e apaga o hash do telefone e as redes no prazo
     3. a SAÚDE: app.rotinas_conferir grava a execução e os alertas do dia
        (pagamento que pede uma pessoa, teto de IA, IA falhando, freio por IP,
        rotina que falhou) e o dono recebe o resumo no celular pelo ntfy.sh
        (grátis, sem conta: ALERTA_NTFY_TOPICO), uma vez por dia.
   A reconciliação de pagamentos segue no seu cron (/api/pagamentos?acao=reconciliar).
   ORÇAMENTO (Cloudflare grátis: 50 subpedidos por invocação, api/_orcamento.mjs): cada chamada ao banco, às métricas e ao ntfy é
   contada POR EXECUÇÃO e a rotina para em 45 (3 ficam guardados para a conferência da saúde e o aviso). A etapa que não
   coube vira alerta (como as falhas), nunca silêncio, e o resumo diz `parcial: true`.
   Uso: GET /api/rotinas?acao=diaria  com  Authorization: Bearer <CRON_SECRET>
   ========================================================================== */
import { conferirCron, segredoDoCron } from './_cron.mjs';
import { criarTransporte } from './_vendas/transporte.mjs';
import { banco as bancoMetricas } from './_banco.mjs';
import { TETOS } from './_ia/config.mjs';
import { ORG } from './_vendas/org.mjs';
import { orcamentoDe, SemOrcamento, ORCAMENTO_SUBPEDIDOS } from './_orcamento.mjs';

const RESERVA_FINAL = 3;   /* subpedidos guardados para o fim, que não podem faltar: rotinas_conferir, o aviso no ntfy e rotinas_avisado */
const RETENCAO_METRICAS_DIAS = 400;   /* ~13 meses (docs/metricas/README.md); antes rodava ao abrir o painel */
const TOPICO = /^[A-Za-z0-9_-]{20,64}$/;   /* o tópico do ntfy é o segredo: longo e aleatório */
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const log = dados => console.log(JSON.stringify({ origem: 'rotinas', ...dados }));

export const GET = request => executar(request, process.env);
export const POST = request => executar(request, process.env);

/* o aviso no celular: POST de texto no tópico (o app ntfy inscrito no tópico mostra a notificação) */
/* (no ntfy.sh público, quem souber o tópico lê e escreve nele: o texto nunca leva dado pessoal; com conta grátis
   do ntfy dá para reservar o tópico e usar um token — ALERTA_NTFY_TOKEN) */
async function ntfy(topico, texto, urgente, token) {
  const r = await fetch('https://ntfy.sh/' + topico, { method: 'POST', body: texto, signal: AbortSignal.timeout(5000),
    headers: { title: 'Beyon Zero: alerta do site', priority: urgente ? 'high' : 'default', tags: 'warning', ...(token ? { authorization: 'Bearer ' + token } : {}) } });
  if (!r.ok) throw new Error('ntfy HTTP ' + r.status);
}

export async function executar(request, env, deps = {}) {
  /* segredo curto ou ausente = rotina desligada (nunca "aberta"); tentativa errada freia por IP (api/_cron.mjs) */
  const acesso = conferirCron(request, segredoDoCron(env));
  if (acesso === 'freado') return json({ erro: 'Muitas tentativas.' }, 429);
  if (acesso !== 'ok') return json({ erro: 'Não autorizado.' }, 401);
  if (new URL(request.url).searchParams.get('acao') !== 'diaria') return json({ erro: 'Não encontrado.' }, 404);
  const bancoBase = deps.banco || criarTransporte(env);
  if (!bancoBase) { log({ nivel: 'erro', evento: 'sem banco' }); return json({ erro: 'Indisponível.' }, 503); }

  const gasto = orcamentoDe(deps.orcamento ?? ORCAMENTO_SUBPEDIDOS, RESERVA_FINAL);
  const banco = gasto.contar(bancoBase);   /* (as etapas comuns; a conferência e o aviso usam a reserva) */
  const motivoDe = e => e instanceof SemOrcamento ? 'sem orçamento de subpedidos' : e && e.codigo ? 'banco ' + e.codigo : 'erro';
  let parcial = false;

  /* cada etapa roda mesmo que a anterior falhe; a falha vira alerta (a rotina não morre calada) */
  const falhas = [];
  const falhou = (etapa, e) => { if (e instanceof SemOrcamento) parcial = true; falhas.push(etapa + ' (' + motivoDe(e) + ')'); };
  let retencao = null;
  try { retencao = await banco('vendas_reter', {}); }
  catch (e) { falhou('retenção', e); }
  let pedidos = null;
  try { pedidos = await banco('vendas_expirar_pedidos', {}); }
  catch (e) { falhou('pedidos', e); }
  const metricas = deps.metricas || bancoMetricas(env);
  if (metricas && metricas.ligado) {
    try { await gasto.contar(iso => metricas.apagarAntigos(iso))(new Date(Date.now() - RETENCAO_METRICAS_DIAS * 864e5).toISOString()); }
    catch (e) { if (e instanceof SemOrcamento) parcial = true; falhas.push('retenção das métricas' + (e instanceof SemOrcamento ? ' (sem orçamento de subpedidos)' : '')); }
  }

  let saude;
  const bancoFinal = gasto.contarReservado(bancoBase);
  try { saude = await bancoFinal('rotinas_conferir', { org_slug: ORG, teto_dia_usd: TETOS.dia_usd, falha: falhas.join('; ') || null }); }
  catch (e) {
    log({ nivel: 'erro', evento: 'saúde não conferida', codigo: e && e.codigo });
    return json({ erro: 'Erro interno.' }, 500);
  }

  const topico = TOPICO.test(env.ALERTA_NTFY_TOPICO || '') ? env.ALERTA_NTFY_TOPICO : null;
  if (saude.alertas.length && saude.avisar && topico) {
    const texto = saude.alertas.map(a => (a.nivel === 'urgente' ? '!! ' : '') + a.mensagem).join('\n') + '\nDetalhes no painel.';
    try {
      const token = /^tk_[A-Za-z0-9]{20,64}$/.test(env.ALERTA_NTFY_TOKEN || '') ? env.ALERTA_NTFY_TOKEN : null;
      await gasto.contarReservado(deps.enviarAlerta || ntfy)(topico, texto, saude.alertas.some(a => a.nivel === 'urgente'), token);
      await bancoFinal('rotinas_avisado', {});
    } catch (e) { log({ nivel: 'erro', evento: 'alerta não enviado', erro: e && e.message ? e.message.slice(0, 80) : 'erro' }); }
  }
  log({ nivel: falhas.length ? 'erro' : 'info', evento: 'diária', retencao, pedidos, alertas: saude.alertas.map(a => a.tipo), falhas, parcial, subpedidos: gasto.gastos() });
  if (parcial) log({ nivel: 'aviso', evento: 'rotina parcial', subpedidos: gasto.gastos() });
  return json({ ok: !falhas.length, parcial, retencao, pedidos, saude });
}
