/* ==========================================================================
   /api/painel — os números para o painel do dono (painel.html).
   Protegido pela chave PAINEL_CHAVE (variável de ambiente na Vercel, 32+
   caracteres aleatórios). Sem a chave configurada, o painel fica fechado.
     GET  ?dias=30            o resumo do período
     GET  ?csv=ads&nome=X     clientes vindos de anúncio, no formato de
                              importação de conversões off-line do Google Ads
     POST {codigo, status, valor, nota}   marca conversa/cliente num contato
     POST {codigo, excluir: true}         apaga o contato (pedido do titular, LGPD art. 18)
     POST {resolver_alerta: <id>}         marca um alerta da rotina diária como resolvido
   A resposta do GET traz também "saude": alertas abertos e a data da última rotina diária.
   ========================================================================== */
import { createHash, timingSafeEqual } from 'node:crypto';
import { banco } from './_banco.mjs';
import { resumir, csvGoogleAds } from './_resumo.mjs';
import { validarMudanca, CODIGO } from './_valida.mjs';
import { criarTransporte } from './_vendas/transporte.mjs';
import { ehUuid } from './_valida-app.mjs';
import { ORG } from './_vendas/org.mjs';

const CHAVE_MINIMA = 32;
const PERIODOS = [7, 30, 90, 365];
const JANELA_ADS_DIAS = 90;         /* o Google Ads só aceita conversão até 90 dias depois do clique */
const TENTATIVAS = { max: 10, janelaMs: 15 * 60e3 };
const erros = new Map();            /* (por instância da função: freio contra adivinhar a chave, não um cofre) */

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const hash = s => createHash('sha256').update(String(s)).digest();
const atraso = ms => new Promise(r => setTimeout(r, ms));
const diasAtras = n => new Date(Date.now() - n * 864e5).toISOString();

async function autorizar(request, env) {
  const chave = env.PAINEL_CHAVE || '';
  if (chave.length < CHAVE_MINIMA) {
    console.error('[metricas] painel: PAINEL_CHAVE ausente ou com menos de ' + CHAVE_MINIMA + ' caracteres');
    return json({ erro: 'Painel indisponível.' }, 503);
  }
  const quem = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (erros.size > 5000) erros.clear();
  const agora = Date.now();
  const tent = (erros.get(quem) || []).filter(t => agora - t < TENTATIVAS.janelaMs);
  if (tent.length >= TENTATIVAS.max) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
  const enviada = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (enviada && timingSafeEqual(hash(enviada), hash(chave))) { erros.delete(quem); return null; }
  erros.set(quem, tent.concat(agora));
  await atraso(800);
  return json({ erro: 'Chave errada.' }, 401);
}

/* a saúde (alertas abertos e quando a rotina diária rodou bem pela última vez): sem ela, silêncio parecia saúde.
   Falhar aqui não derruba o painel: devolve null e o painel diz que não deu para ler */
async function saudeDoSistema(env) {
  const rpc = criarTransporte(env);
  if (!rpc) return null;
  try { return await rpc('rotinas_painel', { org_slug: ORG }); }
  catch (e) { console.error('[painel] saúde:', e && e.codigo); return null; }
}

export const GET = request => ler(request, process.env);
export const POST = request => mudar(request, process.env);
export async function ler(request, env) {
  const negado = await autorizar(request, env);
  if (negado) return negado;
  const db = banco(env);
  if (!db.ligado) return json({ erro: 'Banco não configurado: faltam SUPABASE_URL e SUPABASE_CHAVE_SECRETA no servidor.' }, 503);   /* (só depois da chave certa) */
  const q = new URL(request.url).searchParams;
  try {
    if (q.get('csv') === 'ads') {
      const nome = (q.get('nome') || 'Cliente fechado').slice(0, 80);
      const contatos = await db.listar('contatos', 'quando', diasAtras(JANELA_ADS_DIAS));
      return new Response(csvGoogleAds(contatos, nome), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="conversoes-google-ads.csv"', 'cache-control': 'no-store' } });
    }
    const dias = PERIODOS.includes(+q.get('dias')) ? +q.get('dias') : 30;
    /* (abrir o painel não apaga mais nada: a retenção de ~13 meses roda na rotina diária, api/rotinas.mjs) */
    const desde = diasAtras(dias);
    const [paginas, contatos, saude] = await Promise.all([db.listar('paginas', 'inicio', desde), db.listar('contatos', 'quando', desde), saudeDoSistema(env)]);
    return json({ ...resumir(paginas, contatos, { dias }), saude });
  } catch (e) {
    console.error('[metricas] painel:', e.message);
    return json({ erro: 'Não deu para ler o banco agora. Tente de novo em instantes.' }, 500);
  }
}

export async function mudar(request, env) {
  const negado = await autorizar(request, env);
  if (negado) return negado;
  const db = banco(env);
  if (!db.ligado) return json({ erro: 'Banco não configurado.' }, 503);
  let bruto;
  try { bruto = JSON.parse(await request.text()); } catch { bruto = null; }
  /* marcar um alerta como resolvido */
  if (bruto && typeof bruto.resolver_alerta === 'string') {
    if (!ehUuid(bruto.resolver_alerta)) return json({ erro: 'Pedido inválido.' }, 400);
    const rpc = criarTransporte(env);
    if (!rpc) return json({ erro: 'Banco não configurado.' }, 503);
    try { await rpc('rotinas_resolver', { id: bruto.resolver_alerta, org_slug: ORG }); return json({ ok: true }); }
    catch (e) { return e && e.codigo === 'P0002' ? json({ erro: 'Alerta não encontrado.' }, 404) : json({ erro: 'Não deu para salvar agora.' }, 500); }
  }
  if (bruto && bruto.excluir === true && CODIGO.test(String(bruto.codigo))) {
    try { return (await db.apagarContato(bruto.codigo)) ? json({ ok: true, excluido: bruto.codigo }) : json({ erro: 'Código não encontrado.' }, 404); }
    catch (e) { console.error('[metricas] painel excluir:', e.message); return json({ erro: 'Não deu para excluir agora.' }, 500); }
  }
  const pedido = validarMudanca(bruto);
  if (!pedido) return json({ erro: 'Pedido inválido.' }, 400);
  try {
    const contato = await db.mudarContato(pedido.codigo, pedido.mudanca);
    return contato ? json({ ok: true, contato }) : json({ erro: 'Código não encontrado.' }, 404);
  } catch (e) {
    console.error('[metricas] painel mudar:', e.message);
    return json({ erro: 'Não deu para salvar agora.' }, 500);
  }
}
