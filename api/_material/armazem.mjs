/* ==========================================================================
   O ARMAZÉM DOS ARQUIVOS (PR 3b-2; spec §7 e §9): Supabase Storage, balde privado `material`. O ARQUIVO NUNCA PASSA PELO
   WORKER: o navegador envia direto pelo link assinado que o Worker pede aqui; o Worker só lê 16 bytes, pergunta o tamanho,
   remove (em lote) e assina a leitura de 60 s do painel. Trocar de armazém (R2) = trocar este arquivo: linkDeEnvio,
   inicioDoArquivo, tamanhoDoObjeto, remover, linksDeLeitura.
   • O endereço do link de envio é montado com a SUPABASE_URL do ambiente (nunca com o host que a resposta trouxer).
   • Nenhuma mensagem de erro leva chave, link, token ou caminho (o log é do Worker e vai para fora).
   • [conferir] com o armazém real (scripts/conferir-armazem.mjs): Range → 206 com Content-Range; se o envio pede
     `apikey`; HEIC do iPhone. Se o Range for ignorado (200), lê só o primeiro pedaço do corpo e CANCELA o resto.
   ========================================================================== */
import { TEMPO_MAXIMO_MS } from '../_supabase.mjs';
import { criarArmazemLocal } from './armazem-local.mjs';
export { criarArmazemLocal };

export const BUCKET = 'material';
const BYTES = 16;
const CAMINHO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9._-]{16,2000}$/;

export class ErroArmazem extends Error {
  constructor(mensagem) { super(mensagem); this.name = 'ErroArmazem'; }
}

export function criarArmazem(env = process.env, { fetch: buscar = fetch } = {}) {
  if (env.SUPABASE_URL && env.SUPABASE_CHAVE_SECRETA) return armazemSupabase(env.SUPABASE_URL.replace(/\/+$/, ''), env.SUPABASE_CHAVE_SECRETA, buscar);
  if (globalThis.__BZ_LOCAL && globalThis.__BZ_LOCAL.armazem) return globalThis.__BZ_LOCAL.armazem;
  return null;
}

function armazemSupabase(url, chave, buscar) {
  const base = url + '/storage/v1';
  const cab = { apikey: chave, ...(chave.startsWith('eyJ') ? { authorization: 'Bearer ' + chave } : {}) };   /* (como api/_vendas/transporte.mjs) */
  const checar = c => { if (typeof c !== 'string' || !CAMINHO.test(c)) throw new ErroArmazem('caminho inválido'); };
  async function pedir(rotulo, url2, init = {}) {
    let r;
    try { r = await buscar(url2, { ...init, headers: { ...cab, ...(init.headers || {}) }, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) }); }
    catch { throw new ErroArmazem(rotulo + ': armazém indisponível'); }
    return r;
  }
  async function primeirosBytes(r) {
    const leitor = r.body.getReader();
    const juntos = new Uint8Array(BYTES);
    let n = 0;
    try {
      while (n < BYTES) {
        const { done, value } = await leitor.read();
        if (done) break;
        const pedaco = value.subarray(0, BYTES - n);
        juntos.set(pedaco, n); n += pedaco.length;
      }
    } finally { await leitor.cancel().catch(() => {}); }   /* nunca puxa o arquivo inteiro */
    return juntos.subarray(0, n);
  }
  const totalDe = r => {
    const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
    if (m) return Number(m[1]);
    const n = Number(r.headers.get('content-length'));
    return r.status === 200 && Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    async linkDeEnvio(caminho) {
      checar(caminho);
      const r = await pedir('link de envio', base + '/object/upload/sign/' + BUCKET + '/' + caminho, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new ErroArmazem('link de envio: HTTP ' + r.status);
      const corpo = await r.json().catch(() => null);
      const bruto = corpo && (corpo.url || corpo.signedUrl);
      let token = null;
      try { token = bruto ? new URL(bruto, base + '/').searchParams.get('token') : corpo && corpo.token; } catch { token = null; }
      if (typeof token !== 'string' || !TOKEN.test(token)) throw new ErroArmazem('link de envio sem token');
      return { url: base + '/object/upload/sign/' + BUCKET + '/' + caminho + '?token=' + encodeURIComponent(token) };
    },
    async inicioDoArquivo(caminho) {
      checar(caminho);
      const r = await pedir('leitura', base + '/object/authenticated/' + BUCKET + '/' + caminho, { headers: { range: 'bytes=0-' + (BYTES - 1) } });
      if (r.status === 404 || r.status === 400) { await r.body?.cancel().catch(() => {}); return null; }
      if (!r.ok) { await r.body?.cancel().catch(() => {}); throw new ErroArmazem('leitura: HTTP ' + r.status); }
      return { bytes: await primeirosBytes(r), total: totalDe(r) };
    },
    async tamanhoDoObjeto(caminho) {
      checar(caminho);
      const r = await pedir('tamanho', base + '/object/info/authenticated/' + BUCKET + '/' + caminho);
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new ErroArmazem('tamanho: HTTP ' + r.status);
      const j = await r.json().catch(() => null);
      const n = j && Number(j.size != null ? j.size : j.metadata && j.metadata.size);
      return Number.isFinite(n) ? n : null;
    },
    async remover(caminhos) {
      const lista = [...new Set(caminhos)].filter(c => typeof c === 'string' && CAMINHO.test(c));
      if (!lista.length) return;
      const r = await pedir('remoção', base + '/object/' + BUCKET, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: lista }) });
      if (!r.ok) throw new ErroArmazem('remoção: HTTP ' + r.status);
    },
    async linksDeLeitura(caminhos, segundos = 60) {
      const lista = [...new Set(caminhos)].filter(c => typeof c === 'string' && CAMINHO.test(c));
      if (!lista.length) return {};
      const r = await pedir('links de leitura', base + '/object/sign/' + BUCKET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: segundos, paths: lista }) });
      if (!r.ok) throw new ErroArmazem('links de leitura: HTTP ' + r.status);
      const j = await r.json().catch(() => []);
      const saida = {};
      for (const x of Array.isArray(j) ? j : []) {
        if (x && typeof x.path === 'string' && typeof x.signedURL === 'string' && !x.error && lista.includes(x.path)) saida[x.path] = base + x.signedURL;
      }
      return saida;
    }
  };
}
