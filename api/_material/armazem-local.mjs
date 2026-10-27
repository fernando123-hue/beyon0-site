/* ==========================================================================
   O ARMAZÉM DE MENTIRA do servidor local e dos testes (PR 3b-2): em memória, com as regras do balde real (token do link,
   tipo declarado, 10 MB, sem sobrescrever) e o link REUTILIZÁVEL por 2 h, como o real. Instalado em
   globalThis.__BZ_LOCAL.armazem por docs/banco-local.mjs; o PUT do navegador chega por docs/servidor.mjs.
   Nunca é importado por código de produção a não ser por api/_material/armazem.mjs (que só o devolve se __BZ_LOCAL existir).
   ========================================================================== */
import { randomBytes } from 'node:crypto';

const CAMINHO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIPOS = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX = 10 * 1024 * 1024;

export function criarArmazemLocal({ base = '' } = {}) {
  const objetos = new Map();   /* caminho → { bytes, tipo } */
  const fichas = new Map();    /* token → caminho */
  const caminhoDe = pathname => { const m = /^\/_armazem-local\/([^/]+\/[^/]+)$/.exec(pathname); return m && CAMINHO.test(m[1]) ? m[1] : null; };
  return {
    objetos,
    async linkDeEnvio(caminho) {
      if (!CAMINHO.test(caminho)) throw new Error('caminho inválido');
      const token = randomBytes(24).toString('base64url');
      fichas.set(token, caminho);
      return { url: base + '/_armazem-local/' + caminho + '?token=' + token };
    },
    /* o PUT do navegador no link (caminho + ?token=…) */
    gravarPorUrl(caminhoComQuery, bytes, tipo) {
      const u = new URL(caminhoComQuery, 'http://x');
      const caminho = caminhoDe(u.pathname);
      if (!caminho || fichas.get(u.searchParams.get('token')) !== caminho) return { status: 403 };
      if (!TIPOS.has(String(tipo).split(';')[0].trim().toLowerCase())) return { status: 415 };
      if (bytes.length > MAX) return { status: 413 };
      if (objetos.has(caminho)) return { status: 409 };   /* upsert desligado */
      objetos.set(caminho, { bytes: Uint8Array.from(bytes), tipo: String(tipo) });
      return { status: 200 };
    },
    /* a leitura do painel (o link de 60 s do "baixar"): só no ambiente local */
    lerPorUrl(pathname) {
      const m = /^\/_armazem-local\/ler\/(.+)$/.exec(pathname);
      const o = m && CAMINHO.test(m[1]) ? objetos.get(m[1]) : null;
      return o ? { status: 200, bytes: o.bytes, tipo: o.tipo } : { status: 404 };
    },
    async inicioDoArquivo(caminho) { const o = objetos.get(caminho); return o ? { bytes: o.bytes.slice(0, 16), total: o.bytes.length } : null; },
    async tamanhoDoObjeto(caminho) { const o = objetos.get(caminho); return o ? o.bytes.length : null; },
    async remover(caminhos) { for (const c of caminhos) objetos.delete(c); },
    async linksDeLeitura(caminhos) { return Object.fromEntries([...new Set(caminhos)].filter(c => objetos.has(c)).map(c => [c, base + '/_armazem-local/ler/' + c])); }
  };
}
