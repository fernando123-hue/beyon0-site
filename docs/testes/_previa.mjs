/* AJUDA DOS TESTES DA PRÉVIA ATÉ O FIM (PR 3b-3). Não é arquivo de teste. Leva a entrega de uma conversa com a entrada paga
   ao passo pedido SEM passar pelas funções que ainda vão ser testadas (cada função tem o seu arquivo): a licença
   bz.transicao_livre vale numa conexão SQL do dono, sem usuário do Auth (privado.conferir_transicao_entrega). */
import { conversaComEntradaPaga } from './_entrega.mjs';

export const CLIENTE = 'c-k7m3qa';   /* o id do cliente na captação (o "importado" grava este valor) */
export const PREVIA = 'https://v1.bz-' + CLIENTE + '.pages.dev';
export const SITE = 'https://clinicasol.com.br';

/* muda colunas de app.entregas (e só elas) numa transação com a licença das transições */
export async function forcarEntrega(db, c, campos) {
  const cols = Object.keys(campos);
  const set = cols.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await db.exec("begin; set local bz.transicao_livre = 'on';");
  try {
    await db.query(`update app.entregas set ${set} where conversa_id = $1`, [c.conversa_id, ...cols.map(k => campos[k])]);
    await db.exec('commit');
  } catch (e) { await db.exec('rollback'); throw e; }
}

/* a conversa com a entrada paga, o material enviado e importado (o que o 3b-2 entrega) e o passo pedido */
export async function entregaEm(db, passo = 'producao', { prazo = 8, ...resto } = {}) {
  const c = await conversaComEntradaPaga(db, { prazo, ...resto });
  /* no passo "material" o rascunho tem o número, a UF e a caixa marcada (o caso do dia 30); nos outros o material já foi enviado */
  const enviado = passo !== 'material';
  await db.query(`update app.materiais m set status = $2, enviado_em = case when $2 = 'enviado' then now() - interval '1 day' end,
      dados = '{"whatsapp":"+5521999990001"}', negocio = '{"uf":"RJ"}',
      autorizacao = '{"marcada":true,"texto":"Autorizo a Beyon Zero a usar este material.","versao":1}'
    from app.entregas e where e.id = m.entrega_id and e.conversa_id = $1`, [c.conversa_id, enviado ? 'enviado' : 'rascunho']);
  const agora = new Date().toISOString();
  await forcarEntrega(db, c, {
    passo, cliente_captacao: CLIENTE, entrega_ate: '2026-11-05',
    prazo: JSON.stringify({ entrada_em: agora, numero_em: agora, conta_desde: agora, pausas: [] }),
    ...(['previa', 'aprovada', 'no_ar', 'suspensa'].includes(passo) ? { previa_url: PREVIA, previa_em: agora } : {}),
    ...(['no_ar', 'suspensa'].includes(passo) ? { site_url: SITE, no_ar_em: agora } : {}),
    ...(passo === 'suspensa' ? { suspensa_em: agora } : {})
  });
  return c;
}

/* o código do pedido (BZ-…) e a versão da entrega (updated_at com os microssegundos, no MESMO texto que o banco entrega à tela dentro do jsonb: nunca passa por Date) */
export const codigoDe = async (db, c) => (await db.query('select codigo from app.pedidos where conversa_id = $1', [c.conversa_id])).rows[0].codigo;
export const versaoDe = async (db, c) => (await db.query("select (to_jsonb(updated_at) #>> '{}') as v from app.entregas where conversa_id = $1", [c.conversa_id])).rows[0].v;
