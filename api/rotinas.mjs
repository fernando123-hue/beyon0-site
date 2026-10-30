/* ==========================================================================
   /api/rotinas — as ROTINAS DIÁRIAS do servidor, chamadas pelo cron da Vercel
   (vercel.json → crons) com o segredo do cron no cabeçalho. Uma porta só
   para o que roda sozinho, pelas MESMAS funções do banco que a API usa (a
   rotina não tem caminho próprio para contornar regra nenhuma).
     1. retenção que a página de privacidade promete (app.vendas_reter): texto das conversas de quem não fechou em
        60 dias, o contato dele em 12 meses, e o texto da conversa de quem pagou em 30 dias (menos contestação)
     2. retenção das métricas (~13 meses; antes era feita ao ABRIR o painel)
     1b. o recado (o único lugar de feedback do site): apagado 60 dias depois de criado, lido ou não (app.rotinas_recados)
     2b. o pedido de modelos (PR 2a): vence o pedido herdado que ficou "aguardando" (desde 30/10 todo pedido nasce confirmado; sem efeito novo) e apaga o hash do telefone e as redes no prazo
     2c. (PR 3b-2) a limpeza e a reconciliação do armazém do material (reserva vencida, objeto sem linha, importado há 7 dias)
     2d. (PR 3b-3) os alarmes de prazo da entrega (prazo vencido, 30 dias sem material, 3 dias do restante) e a retenção da lista de ajustes: 1 subpedido.
         D5: nada aqui muda o passo de uma entrega; o pedido parado esperando o material nunca é encerrado
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
import { limparMaterial } from './_material/limpeza.mjs';
import { contarAlarmes } from './_entrega/alarmes.mjs';
import { criarArmazem } from './_material/armazem.mjs';
import { conferirCron, segredoDoCron } from './_cron.mjs';
import { criarTransporte } from './_vendas/transporte.mjs';
import { banco as bancoMetricas } from './_banco.mjs';
import { TETOS } from './_ia/config.mjs';
import { ORG } from './_vendas/org.mjs';
import { ntfy, topicoDe, tokenDe } from './_ntfy.mjs';
import { orcamentoDe, SemOrcamento, ORCAMENTO_SUBPEDIDOS } from './_orcamento.mjs';

const RESERVA_FINAL = 3;   /* subpedidos guardados para o fim, que não podem faltar: rotinas_conferir, o aviso no ntfy e rotinas_avisado */
const RETENCAO_METRICAS_DIAS = 400;   /* ~13 meses (docs/metricas/README.md); antes rodava ao abrir o painel */
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const log = dados => console.log(JSON.stringify({ origem: 'rotinas', ...dados }));

export const GET = request => executar(request, process.env);
export const POST = request => executar(request, process.env);

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
  let recados = null;   /* o recado vence em 60 dias (app.rotinas_recados): 1 subpedido */
  try { recados = await banco('rotinas_recados', {}); }
  catch (e) { falhou('recados', e); }
  let atendente = null;   /* o atendente do site do cliente: conversas 60 dias (app.rotinas_atendente): 1 subpedido */
  try { atendente = await banco('rotinas_atendente', {}); }
  catch (e) { falhou('atendente', e); }
  let pedidos = null;
  try { pedidos = await banco('vendas_expirar_pedidos', {}); }
  catch (e) { falhou('pedidos', e); }
  /* (PR 3b-2) a limpeza e a reconciliação do armazém: 3 subpedidos (2 ao banco, 1 remoção em lote), dentro do orçamento da rotina */
  let material = null;
  const armazem = deps.armazem !== undefined ? deps.armazem : criarArmazem(env);
  if (armazem) {
    try {
      material = await limparMaterial({ banco, armazem: { remover: gasto.contar(cs => armazem.remover(cs)) } });
      if (material.alarme) falhas.push('alarme: o balde de material está em ' + material.balde_pct + '% do teto');
    } catch (e) { falhou('material', e); }
  }
  /* (PR 3b-3) os alarmes de prazo da entrega: 1 subpedido (a lista e a retenção da lista de ajustes), a conta de dias úteis é do JS. D5: nada aqui muda o passo */
  let entregas = null;
  try {
    entregas = contarAlarmes((await banco('rotinas_entregas', {})).itens, new Date());
    /* um pedido com data ou dias que não se leem não pode sumir calado: vira falha da rotina (alerta rotina_falhou, só a contagem, sem dado pessoal) */
    if (entregas.ilegiveis > 0) falhas.push(entregas.ilegiveis + ' entrega(s) com prazo ilegível (veja "entregas.mjs listar")');
  }
  catch (e) { falhou('entregas', e); }
  const metricas = deps.metricas || bancoMetricas(env);
  if (metricas && metricas.ligado) {
    try { await gasto.contar(iso => metricas.apagarAntigos(iso))(new Date(Date.now() - RETENCAO_METRICAS_DIAS * 864e5).toISOString()); }
    catch (e) { if (e instanceof SemOrcamento) parcial = true; falhas.push('retenção das métricas' + (e instanceof SemOrcamento ? ' (sem orçamento de subpedidos)' : '')); }
  }

  let saude;
  const bancoFinal = gasto.contarReservado(bancoBase);
  try { saude = await bancoFinal('rotinas_conferir', { org_slug: ORG, teto_dia_usd: TETOS.dia_usd, falha: falhas.join('; ') || null, entregas }); }
  catch (e) {
    log({ nivel: 'erro', evento: 'saúde não conferida', codigo: e && e.codigo });
    return json({ erro: 'Erro interno.' }, 500);
  }

  const topico = topicoDe(env);
  if (saude.alertas.length && saude.avisar && topico) {
    const texto = saude.alertas.map(a => (a.nivel === 'urgente' ? '!! ' : '') + a.mensagem).join('\n') + '\nDetalhes no painel.';
    try {
      const token = tokenDe(env);
      await gasto.contarReservado(deps.enviarAlerta || ntfy)(topico, texto, saude.alertas.some(a => a.nivel === 'urgente'), token);
      await bancoFinal('rotinas_avisado', {});
    } catch (e) { log({ nivel: 'erro', evento: 'alerta não enviado', erro: e && e.message ? e.message.slice(0, 80) : 'erro' }); }
  }
  log({ nivel: falhas.length ? 'erro' : 'info', evento: 'diária', retencao, recados, atendente, pedidos, alertas: saude.alertas.map(a => a.tipo), material, entregas, falhas, parcial, subpedidos: gasto.gastos() });
  if (parcial) log({ nivel: 'aviso', evento: 'rotina parcial', subpedidos: gasto.gastos() });
  return json({ ok: !falhas.length, parcial, retencao, recados, atendente, pedidos, material, saude });
}
