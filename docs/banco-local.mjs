/* ==========================================================================
   AMBIENTE LOCAL do agente de vendas (desenvolvimento e testes; fora do
   deploy: docs/ está no .vercelignore). Monta e instala em globalThis.__BZ_LOCAL:
   • rpc: as funções app.vendas_* num PGlite com as MESMAS migrations, como
     service_role (o que o backend faz em produção pelo PostgREST);
   • auth: visitantes anônimos com tokens HS256 de desenvolvimento (em
     produção é o login anônimo do Supabase);
   • segredoPagamento: o segredo do gateway simulado.
   A tabela-rascunho de preços entra como ATIVA SÓ AQUI, para o fluxo rodar
   localmente; em produção só o dono ativa uma versão.
   ========================================================================== */
import fs from 'node:fs';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { novoBanco, como } from './testes/_banco.mjs';
import { tokenDe } from '../api/_supabase.mjs';
import { ErroBanco } from '../api/_vendas/transporte.mjs';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

export async function montarLocal({ base = 'http://127.0.0.1:8899', regras = true } = {}) {
  const db = await novoBanco();
  await db.exec(`insert into app.organizacoes (slug, nome) values ('beyon-zero', 'Beyon Zero')`);
  if (regras) {
    const r = JSON.parse(fs.readFileSync(new URL('./fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
    await db.query(`insert into app.regras_comerciais (org_id, versao, status, regras, fontes, aprovada_em)
      select id, 1, 'ativa', $1::jsonb, 'RASCUNHO ativado só no ambiente local', now() from app.organizacoes where slug = 'beyon-zero'`, [JSON.stringify(r)]);
  }
  const segredo = randomBytes(32);
  const refreshes = new Map();
  const assinar = carga => { const cab = b64({ alg: 'HS256', typ: 'JWT' }), corpo = b64(carga); return cab + '.' + corpo + '.' + createHmac('sha256', segredo).update(cab + '.' + corpo).digest('base64url'); };
  const sessao = id => {
    const exp = Math.floor(Date.now() / 1000) + 3600, refresh = randomBytes(24).toString('base64url');
    refreshes.set(refresh, id);
    return { token: assinar({ sub: id, exp, role: 'authenticated', is_anonymous: true }), refresh, expira_em: exp, visitante_id: id };
  };
  const local = {
    db,
    rpc: (nome, p) => como(db, 'service_role', q => q(`select app.${nome}($1::jsonb) as r`, [JSON.stringify(p)])).then(x => x.rows[0].r)
      .catch(e => { throw new ErroBanco(e.code, e.message); }),   /* (o mesmo erro do transporte de produção) */
    auth: {
      async criar() { const id = randomUUID(); await db.query('insert into auth.users (id) values ($1)', [id]); return sessao(id); },
      async renovar(refresh) { const id = refreshes.get(refresh); if (!id) return null; refreshes.delete(refresh); return sessao(id); },
      async quem(request) {
        const t = tokenDe(request);
        if (!t) return null;
        const [cab, corpo, sig] = t.split('.');
        if (!cab || !corpo || !sig) return null;
        const esperado = createHmac('sha256', segredo).update(cab + '.' + corpo).digest('base64url');
        if (sig.length !== esperado.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
        let carga;
        try { carga = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch { return null; }
        if (!carga || typeof carga.exp !== 'number' || carga.exp * 1000 <= Date.now()) return null;   /* vencido: como o Supabase */
        return carga.sub;
      }
    },
    segredoPagamento: randomBytes(32).toString('hex'),
    base
  };
  globalThis.__BZ_LOCAL = local;
  return local;
}
