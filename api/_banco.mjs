/* ==========================================================================
   MÉTRICAS PRÓPRIAS — onde os dados ficam (2026-10-06).
   Produção: Supabase (Postgres), pela API REST com fetch, sem biblioteca.
   As tabelas ficam no esquema `metricas` (supabase/migrations/…_metricas.sql),
   que só o backend acessa: anon e authenticated não têm concessão nenhuma.
   Variáveis de ambiente (só no servidor; .env.example; docs/fundacao/02-OPERACAO.md):
     SUPABASE_URL            https://xxxx.supabase.co
     SUPABASE_CHAVE_SECRETA  a chave secreta (sb_secret_…), NUNCA a pública
   Sem elas, o banco fica DESLIGADO: o endpoint responde 204 e não grava.
   Local (docs/servidor.mjs liga BZ_LOCAL=1): um banco em memória, para testar
   o caminho inteiro no navegador sem conta nenhuma.
   Esquema das tabelas: supabase/migrations/20261006120100_metricas.sql.
   ========================================================================== */
import { TEMPO_MAXIMO_MS } from './_supabase.mjs';
import { ambienteDe } from './_ambiente.mjs';

const PAGINA_REST = 1000;   /* o PostgREST devolve no máximo 1000 linhas por vez */
const TETO_LINHAS = 50000;  /* o painel nunca puxa mais que isso (proteção de memória) */

function supabase(url, chave) {
  const base = url.replace(/\/+$/, '') + '/rest/v1/';
  /* chave nova (sb_secret_…) vai só no apikey; a antiga (JWT, "eyJ…") também no Authorization */
  /* o esquema metricas (não o public): Accept-Profile na leitura, Content-Profile na escrita (o PostgREST aceita os dois em todas) */
  const cab = extra => Object.assign({ apikey: chave, 'content-type': 'application/json', 'accept-profile': 'metricas', 'content-profile': 'metricas' },
    chave.startsWith('eyJ') ? { authorization: 'Bearer ' + chave } : {}, extra);
  async function pedir(caminho, opcoes, rotulo) {
    const r = await fetch(base + caminho, { ...opcoes, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });   /* (tempo máximo: auditoria 2026-10-07) */
    if (!r.ok) {
      const corpo = await r.json().catch(() => null);
      throw new Error(rotulo + ': HTTP ' + r.status + (corpo && corpo.code ? ' código ' + corpo.code : ''));
    }
    return r;
  }
  return {
    ligado: true,
    async gravarPagina(linha) {
      await pedir('paginas?on_conflict=id', { method: 'POST', headers: cab({ prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(linha) }, 'gravar página');
    },
    async gravarContato(contato) {
      /* um contato por código: o primeiro clique vale; o gclid entra depois se chegar só no segundo */
      await pedir('contatos?on_conflict=codigo', { method: 'POST', headers: cab({ prefer: 'resolution=ignore-duplicates,return=minimal' }), body: JSON.stringify(contato) }, 'gravar contato');
      if (contato.gclid) await pedir('contatos?codigo=eq.' + contato.codigo + '&gclid=is.null', { method: 'PATCH', headers: cab({ prefer: 'return=minimal' }), body: JSON.stringify({ gclid: contato.gclid }) }, 'gclid');
    },
    async listar(tabela, campoData, desde) {
      const linhas = [];   /* (do mais novo para trás: se passar do teto, o que fica de fora é o mais velho) */
      for (let de = 0; de < TETO_LINHAS; de += PAGINA_REST) {
        const r = await pedir(tabela + '?select=*&' + campoData + '=gte.' + encodeURIComponent(desde) + '&order=' + campoData + '.desc',
          { headers: cab({ 'range-unit': 'items', range: de + '-' + (de + PAGINA_REST - 1) }) }, 'listar ' + tabela);
        const lote = await r.json();
        linhas.push(...lote);
        if (lote.length < PAGINA_REST) break;
      }
      return linhas.reverse();
    },
    async mudarContato(codigo, mudanca) {
      const r = await pedir('contatos?codigo=eq.' + codigo, { method: 'PATCH', headers: cab({ prefer: 'return=representation' }), body: JSON.stringify(mudanca) }, 'mudar contato');
      return (await r.json())[0] || null;
    },
    async apagarAntigos(limite) {
      const q = encodeURIComponent(limite);
      await pedir('paginas?inicio=lt.' + q, { method: 'DELETE', headers: cab({ prefer: 'return=minimal' }) }, 'apagar páginas');
      /* quem virou cliente fica (é atendimento); o resto sai no mesmo prazo */
      await pedir('contatos?status=neq.cliente&quando=lt.' + q, { method: 'DELETE', headers: cab({ prefer: 'return=minimal' }) }, 'apagar contatos');
    },
    async apagarContato(codigo) {
      const r = await pedir('contatos?codigo=eq.' + codigo, { method: 'DELETE', headers: cab({ prefer: 'return=representation' }) }, 'excluir contato');
      return (await r.json()).length > 0;
    }
  };
}

/* ---------- local: memória do processo do servidor de desenvolvimento ---------- */
const memoria = { paginas: new Map(), contatos: new Map() };
const local = {
  ligado: true,
  async gravarPagina(linha) { memoria.paginas.set(linha.id, Object.assign({}, memoria.paginas.get(linha.id), linha)); },
  async gravarContato(c) {
    const ja = memoria.contatos.get(c.codigo);
    if (!ja) memoria.contatos.set(c.codigo, Object.assign({ status: 'clicou', valor: null, nota: null }, c));
    else if (c.gclid && !ja.gclid) memoria.contatos.set(c.codigo, Object.assign({}, ja, { gclid: c.gclid }));
  },
  async listar(tabela, campoData, desde) {
    return [...memoria[tabela].values()].filter(l => l[campoData] >= desde).sort((a, b) => (a[campoData] < b[campoData] ? -1 : 1));
  },
  async mudarContato(codigo, mudanca) {
    const ja = memoria.contatos.get(codigo);
    if (!ja) return null;
    const novo = Object.assign({}, ja, mudanca);
    memoria.contatos.set(codigo, novo);
    return novo;
  },
  async apagarAntigos(limite) {
    for (const [k, l] of memoria.paginas) if (l.inicio < limite) memoria.paginas.delete(k);
    for (const [k, c] of memoria.contatos) if (c.status !== 'cliente' && c.quando < limite) memoria.contatos.delete(k);
  },
  async apagarContato(codigo) { return memoria.contatos.delete(codigo); }
};
const desligado = { ligado: false };

export function banco(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_CHAVE_SECRETA) return supabase(env.SUPABASE_URL, env.SUPABASE_CHAVE_SECRETA);
  if (env.BZ_LOCAL === '1' && ambienteDe(env) === 'local') return local;   /* (fora do local, nunca: sem Supabase fica desligado) */
  return desligado;
}
