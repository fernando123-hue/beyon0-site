/* ==========================================================================
   A TABELA DE ROTAS DO WORKER: /api/<nome> → a função que já existe em api/<nome>.mjs.
   Na frente de todo handler: nome só da tabela (404), método da tabela (405), na Cloudflare o IP vem SÓ do
   cf-connecting-ip validado e os cabeçalhos de IP do cliente são apagados (403 sem ele), corpo limitado POR ROTA
   (3 × o limite do handler: 1 unidade de texto do JS ≤ 3 bytes em UTF-8), erro interno genérico, cabeçalhos da API.
   O servidor local (docs/servidor.mjs) passa por aqui também.
   ========================================================================== */
import { randomUUID } from 'node:crypto';
import * as vendas from '../api/vendas.mjs';
import * as pagamentos from '../api/pagamentos.mjs';
import * as rotinas from '../api/rotinas.mjs';
import * as evento from '../api/evento.mjs';
import * as leads from '../api/leads.mjs';
import * as painel from '../api/painel.mjs';
import * as atendente from '../api/atendente.mjs';
import { LIMITE_BYTES as LIMITE_EVENTO } from '../api/_valida.mjs';
import { naCloudflare } from '../api/_ambiente.mjs';
import { normalizarIp } from '../api/_vendas/ip.mjs';

const BYTES_POR_UNIDADE = 3;
const LIMITE_ROTINAS = 4096;
export const ROTAS = Object.freeze({
  vendas:     { limite: BYTES_POR_UNIDADE * vendas.LIMITE_BYTES, GET: (r, e) => vendas.atender(r, e, 'GET'), POST: (r, e) => vendas.atender(r, e, 'POST') },
  pagamentos: { limite: BYTES_POR_UNIDADE * pagamentos.LIMITE_BYTES, GET: pagamentos.receber, POST: pagamentos.receber },
  rotinas:    { limite: LIMITE_ROTINAS, GET: rotinas.executar, POST: rotinas.executar },
  evento:     { limite: BYTES_POR_UNIDADE * LIMITE_EVENTO, POST: evento.receber },
  leads:      { limite: BYTES_POR_UNIDADE * leads.LIMITE_BYTES, GET: leads.listar, POST: leads.criar },
  painel:     { limite: BYTES_POR_UNIDADE * painel.CORPO_MAX, GET: painel.ler, POST: painel.mudar },
  /* o atendente do site do CLIENTE: OPTIONS só aqui (preflight do navegador); a própria rota confere a origem contra os domínios do cliente */
  atendente:  { limite: BYTES_POR_UNIDADE * atendente.LIMITE_BYTES, GET: atendente.GET, POST: atendente.POST, OPTIONS: atendente.OPTIONS }
});
const METODOS = ['GET', 'POST', 'OPTIONS'];
const CABECALHOS_API = { 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };

const json = (dados, status, extra = {}) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CABECALHOS_API, ...extra } });
const log = dados => console.error(JSON.stringify({ origem: 'worker', nivel: 'erro', ...dados }));

async function lerLimitado(request, limite) {
  if (!request.body) return new Uint8Array(0);
  const leitor = request.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) { await leitor.cancel(); return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  partes.reduce((pos, p) => { tudo.set(p, pos); return pos + p.byteLength; }, 0);
  return tudo;
}

/* na Cloudflare: só o cf-connecting-ip (a borda sobrescreve o que o cliente mandar); o x-forwarded-for do cliente
   (a Cloudflare ACRESCENTA a ele, o 1º item é do atacante) e todo cabeçalho de IP que só outra plataforma garante
   (todo x-vercel-*, x-real-ip, true-client-ip, forwarded) somem: código futuro não pode confiar num valor forjado */
const CABECALHOS_DE_IP_ALHEIOS = /^(?:x-vercel-.*|x-real-ip|true-client-ip|forwarded)$/;
function cabecalhosDeIp(request, env) {
  const h = new Headers(request.headers);
  if (!naCloudflare(env)) return h;
  const ip = (h.get('cf-connecting-ip') || '').trim();
  for (const nome of [...h.keys()]) if (CABECALHOS_DE_IP_ALHEIOS.test(nome)) h.delete(nome);
  h.delete('x-forwarded-for');
  if (!ip || !normalizarIp(ip)) return null;
  h.set('x-forwarded-for', ip);
  return h;
}

const comCabecalhosDaApi = resposta => {
  const h = new Headers(resposta.headers);
  for (const [k, v] of Object.entries(CABECALHOS_API)) h.set(k, v);
  if (!h.has('cache-control')) h.set('cache-control', 'no-store');
  return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: h });
};

export function criarRoteador(rotas = ROTAS) {
  return async function rotear(request, env) {
    const url = new URL(request.url);
    const m = /^\/api\/([a-z]+)\/?$/.exec(url.pathname);
    const rota = m && Object.hasOwn(rotas, m[1]) ? rotas[m[1]] : null;
    if (!rota) return json({ erro: 'Não encontrado.' }, 404);
    const fn = METODOS.includes(request.method) && Object.hasOwn(rota, request.method) ? rota[request.method] : null;
    if (!fn) return json({ erro: 'Método não permitido.' }, 405, { allow: METODOS.filter(x => Object.hasOwn(rota, x)).join(', ') });
    try {   /* (a leitura do corpo também: se o cliente cortar no meio, sai o 500 com request_id, não a falha crua do runtime) */
      const headers = cabecalhosDeIp(request, env);
      if (!headers) return json({ erro: 'Proibido.' }, 403);
      let corpo;
      if (request.method === 'POST') {
        if (Number(request.headers.get('content-length') || 0) > rota.limite) return json({ erro: 'Corpo grande demais.' }, 413);
        corpo = await lerLimitado(request, rota.limite);
        if (corpo === null) return json({ erro: 'Corpo grande demais.' }, 413);
      }
      /* um Request NOVO: o corpo já foi lido; o handler lê o dele normalmente */
      const novo = new Request(url, { method: request.method, headers, body: corpo && corpo.byteLength ? corpo : undefined });
      return comCabecalhosDaApi(await fn(novo, env));
    } catch (e) {
      const id = randomUUID();
      log({ request_id: id, rota: m[1], erro: e && e.name ? e.name : 'erro' });   /* (sem mensagem: pode ter dado pessoal) */
      return json({ erro: 'Erro interno.', pedido: id }, 500, { 'x-request-id': id });
    }
  };
}

export const rotear = criarRoteador();
