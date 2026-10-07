/* ==========================================================================
   POST /api/evento — recebe o retrato de uma página vista (js/metricas.js).
   Sem cookie, sem IP gravado. Só aceita pedido do próprio site (Origin), de
   navegador que não se declara robô, e com o pacote dentro da lista fechada
   de campos (api/_valida.mjs). Banco desligado: responde 204 e não grava.
   ========================================================================== */
import { banco } from './_banco.mjs';
import { validarPacote, ehRobo, LIMITE_BYTES } from './_valida.mjs';
import { criarFreio, ipDe } from './_freio.mjs';

const vazio = status => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
/* 60 retratos por minuto por IP: uma pessoa real manda menos de 10 */
export const freado = criarFreio({ max: 60, janelaMs: 60e3 });
const LIMPEZA = { chance: 0.01, retencaoDias: 400 };     /* 1 em cada 100 pedidos apaga o que passou de ~13 meses */

/* o pedido veio de uma página deste mesmo site? (METRICAS_HOSTS: lista extra, separada por vírgula) */
export function origemPermitida(request, env = process.env) {
  const origem = request.headers.get('origin');
  if (!origem) return false;
  let host;
  try { host = new URL(origem).host; } catch { return false; }
  const extras = (env.METRICAS_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
  return host === new URL(request.url).host || host === request.headers.get('host') || extras.includes(host);
}

/* (a Vercel chama POST(request, contexto): o ambiente entra por process.env; os testes chamam receber direto) */
export const POST = request => receber(request, process.env);
export async function receber(request, env) {
  if (!origemPermitida(request, env)) return vazio(403);
  if (ehRobo(request.headers.get('user-agent'))) return vazio(204);
  if (freado(ipDe(request))) return vazio(429);
  const db = banco(env);
  if (!db.ligado) return vazio(204);
  const corpo = await request.text();
  if (corpo.length > LIMITE_BYTES) return vazio(413);
  let pacote;
  try { pacote = validarPacote(JSON.parse(corpo)); } catch { pacote = null; }
  if (!pacote) return vazio(400);
  try {
    await db.gravarPagina(pacote.pagina);
    if (pacote.contato) await db.gravarContato(pacote.contato);
    if (Math.random() < LIMPEZA.chance) await db.apagarAntigos(new Date(Date.now() - LIMPEZA.retencaoDias * 864e5).toISOString());
    return vazio(204);
  } catch (e) {
    console.error('[metricas] evento:', e.message);
    return vazio(500);
  }
}
