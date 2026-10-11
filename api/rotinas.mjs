/* ==========================================================================
   /api/rotinas — as ROTINAS DIÁRIAS do servidor, chamadas pelo cron da Vercel
   (vercel.json → crons) com o segredo do cron no cabeçalho. Uma porta só
   para o que roda sozinho, pelas MESMAS funções do banco que a API usa (a
   rotina não tem caminho próprio para contornar regra nenhuma).
     1. retenção que a página de privacidade promete (app.vendas_reter): texto das conversas de quem não fechou em
        60 dias, o contato dele em 12 meses, e o texto da conversa de quem pagou em 30 dias (menos contestação)
     2. retenção das métricas (~13 meses; antes era feita ao ABRIR o painel)
     3. a SAÚDE: app.rotinas_conferir grava a execução e os alertas do dia
        (pagamento que pede uma pessoa, teto de IA, IA falhando, freio por IP,
        rotina que falhou) e o dono recebe o resumo no celular pelo ntfy.sh
        (grátis, sem conta: ALERTA_NTFY_TOPICO), uma vez por dia.
   A reconciliação de pagamentos segue no seu cron (/api/pagamentos?acao=reconciliar).
   Uso: GET /api/rotinas?acao=diaria  com  Authorization: Bearer <CRON_SECRET>
   ========================================================================== */
import { conferirCron, segredoDoCron } from './_cron.mjs';
import { criarTransporte } from './_vendas/transporte.mjs';
import { banco as bancoMetricas } from './_banco.mjs';
import { TETOS } from './_ia/config.mjs';
import { ORG } from './_vendas/org.mjs';

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
  const banco = deps.banco || criarTransporte(env);
  if (!banco) { log({ nivel: 'erro', evento: 'sem banco' }); return json({ erro: 'Indisponível.' }, 503); }

  /* cada etapa roda mesmo que a anterior falhe; a falha vira alerta (a rotina não morre calada) */
  const falhas = [];
  let retencao = null;
  try { retencao = await banco('vendas_reter', {}); }
  catch (e) { falhas.push('retenção (' + (e && e.codigo ? 'banco ' + e.codigo : 'erro') + ')'); }
  const metricas = deps.metricas || bancoMetricas(env);
  if (metricas && metricas.ligado) {
    try { await metricas.apagarAntigos(new Date(Date.now() - RETENCAO_METRICAS_DIAS * 864e5).toISOString()); }
    catch (e) { falhas.push('retenção das métricas'); }
  }

  let saude;
  try { saude = await banco('rotinas_conferir', { org_slug: ORG, teto_dia_usd: TETOS.dia_usd, falha: falhas.join('; ') || null }); }
  catch (e) {
    log({ nivel: 'erro', evento: 'saúde não conferida', codigo: e && e.codigo });
    return json({ erro: 'Erro interno.' }, 500);
  }

  const topico = TOPICO.test(env.ALERTA_NTFY_TOPICO || '') ? env.ALERTA_NTFY_TOPICO : null;
  if (saude.alertas.length && saude.avisar && topico) {
    const texto = saude.alertas.map(a => (a.nivel === 'urgente' ? '!! ' : '') + a.mensagem).join('\n') + '\nDetalhes no painel.';
    try {
      const token = /^tk_[A-Za-z0-9]{20,64}$/.test(env.ALERTA_NTFY_TOKEN || '') ? env.ALERTA_NTFY_TOKEN : null;
      await (deps.enviarAlerta || ntfy)(topico, texto, saude.alertas.some(a => a.nivel === 'urgente'), token);
      await banco('rotinas_avisado', {});
    } catch (e) { log({ nivel: 'erro', evento: 'alerta não enviado', erro: e && e.message ? e.message.slice(0, 80) : 'erro' }); }
  }
  log({ nivel: falhas.length ? 'erro' : 'info', evento: 'diária', retencao, alertas: saude.alertas.map(a => a.tipo), falhas });
  return json({ ok: !falhas.length, retencao, saude });
}
