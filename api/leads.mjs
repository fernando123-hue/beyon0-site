/* ==========================================================================
   /api/leads — a primeira API sobre o negócio, e o MODELO da fronteira
   (docs/fundacao/01-ARQUITETURA.md §6):
     1. autenticação: JWT do Supabase no Authorization (sem ele: 401);
     2. validação: lista fechada de campos (erro: 400, com o campo);
     3. autorização: o usuário é membro da organização pedida (senão: 403,
        sem dizer se a organização existe);
     4. a operação roda COMO O USUÁRIO (chave pública + JWT): o RLS do banco
        vale de novo aqui;
     5. erros internos voltam genéricos; o log leva o código, nunca o token
        nem dado pessoal.
     GET  /api/leads?org=<uuid>[&status=novo][&limite=50]
     POST /api/leads   { org_id, nome?, empresa?, email?, telefone?, interesse?,
                         origem_meio?, origem_fonte?, campanha?, termo?, codigo_visita?, observacoes? }
   ========================================================================== */
import { configUsuario, tokenDe, usuarioDoToken, comoUsuario } from './_supabase.mjs';
import { ehUuid, validarNovoLead, STATUS_LEAD } from './_valida-app.mjs';
import { criarFreio, ipDe } from './_freio.mjs';

export const LIMITE_BYTES = 8192;
/* 120 pedidos por minuto por IP: uso humano do painel fica muito abaixo */
export const freado = criarFreio({ max: 120, janelaMs: 60e3 });
const LISTA = { padrao: 50, max: 100 };
const COLUNAS = 'id,nome,empresa,email,telefone,interesse,status,origem_meio,origem_fonte,campanha,termo,codigo_visita,cliente_id,created_at,updated_at';

const json = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});
const indisponivel = () => json({ erro: 'Serviço indisponível. Tente de novo em instantes.' }, 503);

/* 1. quem é: devolve { ctx } ou { resposta } (o erro pronto) */
async function autenticar(request, env) {
  if (freado(ipDe(request))) return { resposta: json({ erro: 'Muitas requisições. Espere um minuto.' }, 429) };
  const cfg = configUsuario(env);
  if (!cfg) { console.error('[leads] SUPABASE_URL ou SUPABASE_CHAVE_PUBLICA ausente no servidor'); return { resposta: indisponivel() }; }
  const token = tokenDe(request);
  if (!token) return { resposta: json({ erro: 'Faça login.' }, 401) };
  try {
    const usuario = await usuarioDoToken(cfg, token);
    if (!usuario) return { resposta: json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' }, 401) };
    return { ctx: { usuario, rest: comoUsuario(cfg, token) } };
  } catch (e) {
    console.error('[leads] autenticação:', e.message);
    return { resposta: indisponivel() };
  }
}

/* 3. o usuário é membro da organização? (a consulta roda como ele: só enxerga as organizações dele) */
async function exigirMembro(ctx, org) {
  const r = await ctx.rest('GET', 'membros?select=papel&org_id=eq.' + org + '&user_id=eq.' + encodeURIComponent(ctx.usuario.id));
  if (!r.ok) throw new Error('membros HTTP ' + r.status);
  return Array.isArray(r.dados) && r.dados.length > 0;
}

/* erro do PostgREST → resposta ao cliente (sem detalhe interno) */
function respostaDeErro(r, rotulo) {
  const codigo = r.dados && r.dados.code;
  if (codigo === '23505') return json({ erro: 'Já existe um lead com este código de visita nesta organização.' }, 409);
  if (codigo === '42501' || r.status === 401 || r.status === 403) return json({ erro: 'Sem permissão.' }, 403);
  if (r.status === 400 || codigo === '23514' || codigo === '22P02' || codigo === '23503') return json({ erro: 'Dados inválidos.' }, 400);
  console.error('[leads] ' + rotulo + ': HTTP ' + r.status + (codigo ? ' código ' + codigo : ''));
  return json({ erro: 'Erro interno.' }, 500);
}

export const GET = request => listar(request, process.env);
export const POST = request => criar(request, process.env);

export async function listar(request, env) {
  const a = await autenticar(request, env);
  if (a.resposta) return a.resposta;
  const q = new URL(request.url).searchParams;
  const org = q.get('org');
  if (!ehUuid(org)) return json({ erro: 'Parâmetro org inválido.', campos: { org: 'obrigatório (uuid)' } }, 400);
  const status = q.get('status');
  if (status !== null && !STATUS_LEAD.includes(status)) return json({ erro: 'Parâmetro status inválido.', campos: { status: 'um de: ' + STATUS_LEAD.join(', ') } }, 400);
  const limite = q.get('limite') === null ? LISTA.padrao : Number(q.get('limite'));
  if (!Number.isInteger(limite) || limite < 1 || limite > LISTA.max) return json({ erro: 'Parâmetro limite inválido.', campos: { limite: '1 a ' + LISTA.max } }, 400);
  try {
    if (!(await exigirMembro(a.ctx, org.toLowerCase()))) return json({ erro: 'Sem acesso a esta organização.' }, 403);
    const r = await a.ctx.rest('GET', 'leads?select=' + COLUNAS + '&org_id=eq.' + org.toLowerCase() + (status ? '&status=eq.' + status : '') + '&order=created_at.desc&limit=' + limite);
    if (!r.ok) return respostaDeErro(r, 'listar');
    return json({ leads: r.dados });
  } catch (e) {
    console.error('[leads] listar:', e.message);
    return indisponivel();
  }
}

export async function criar(request, env) {
  const a = await autenticar(request, env);
  if (a.resposta) return a.resposta;
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return json({ erro: 'Envie JSON (Content-Type: application/json).' }, 415);
  const texto = await request.text();
  if (texto.length > LIMITE_BYTES) return json({ erro: 'Corpo grande demais.' }, 413);
  let bruto;
  try { bruto = JSON.parse(texto); } catch { return json({ erro: 'JSON inválido.' }, 400); }
  const v = validarNovoLead(bruto);
  if (v.erros) return json({ erro: 'Dados inválidos.', campos: v.erros }, 400);
  try {
    if (!(await exigirMembro(a.ctx, v.dados.org_id))) return json({ erro: 'Sem acesso a esta organização.' }, 403);
    const r = await a.ctx.rest('POST', 'leads?select=' + COLUNAS, { corpo: v.dados, prefer: 'return=representation' });
    if (!r.ok) return respostaDeErro(r, 'criar');
    return json({ lead: Array.isArray(r.dados) ? r.dados[0] : r.dados }, 201);
  } catch (e) {
    console.error('[leads] criar:', e.message);
    return indisponivel();
  }
}
