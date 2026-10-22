/* AJUDA DOS TESTES DA ENTREGA (PR 3b-2): uma conversa com a ENTRADA PAGA pelo caminho real (proposta aceita →
   cobrança → pagamentos_aplicar), que é o que dispara o gatilho da entrega. Não é arquivo de teste. */
import { randomUUID } from 'node:crypto';
import { como, pedidoConfirmado } from './_banco.mjs';

export const ORG = '99999999-0000-4000-8000-000000000099';
const REGRAS = 'dddddddd-0000-4000-8000-0000000000d0';
export const rpcDe = db => (nome, p) => como(db, 'service_role', q => q(`select app.${nome}($1::jsonb) as r`, [JSON.stringify(p)])).then(x => x.rows[0].r);

export async function prepararOrg(db) {
  await db.exec(`insert into app.organizacoes (id, slug, nome) values ('${ORG}', 'beyon-zero', 'Beyon Zero');
    insert into app.regras_comerciais (id, org_id, versao, status, regras, aprovada_em) values ('${REGRAS}', '${ORG}', 1, 'ativa', '{"moeda":"BRL"}', now());`);
}

/* antesDePagar: um gancho para sabotar o banco antes do aviso de pagamento (o teste do gatilho que não derruba o pagamento) */
export async function conversaComEntradaPaga(db, { total = 3000, sinal = 1200, prazo = 10, telefone = '+5521999990001', formato = 'institucional', antesDePagar = null, semPagar = false } = {}) {
  const rpc = rpcDe(db);
  const visitante = randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [visitante]);
  const conversa = (await rpc('vendas_iniciar', { org_slug: 'beyon-zero', visitante_id: visitante, origem_meio: 'direto' })).conversa_id;
  const b = { conversa_id: conversa, visitante_id: visitante };
  await rpc('vendas_registrar_turno', { ...b, mensagem_visitante: 'oi', mensagem_agente: 'olá', briefing: { projeto: { formato }, negocio: { nome: 'Clínica Sol', segmento: 'saúde', cidade: 'Niterói' } }, confianca: 0.8 });
  await rpc('vendas_registrar_estimativa', { ...b, regras_id: REGRAS, fatores: { formato }, valor_total: total, sinal, prazo_dias: prazo });
  await rpc('vendas_informar_contato', { ...b, nome: 'Ana Souza', email: 'ana@x.com', aceite: true });
  await db.query('update app.leads set telefone = $1 where id = (select lead_id from app.conversas where id = $2)', [telefone, conversa]);
  await pedidoConfirmado(db, conversa);
  const g = await rpc('vendas_iniciar_geracao', b);
  for (const d of g.direcoes) await rpc('vendas_concluir_direcao', { direcao_id: d.id, conteudo: { secoes: [] }, modelo: 't' });
  await rpc('vendas_escolher', { ...b, direcao_id: g.direcoes[0].id });
  const proposta = (await rpc('vendas_apresentar_escopo', { ...b, titulo: 'Site', escopo: 'Escopo confirmado pelo cliente.' })).proposta_id;
  await rpc('vendas_confirmar_escopo', { ...b, proposta_id: proposta, confirmo: true });
  const t = await rpc('pagamentos_iniciar_tentativa', { ...b, metodo: 'pix', provedor: 'mercadopago' });
  const order = 'ORD' + t.tentativa_id.replace(/-/g, '').slice(0, 20).toUpperCase();
  await rpc('pagamentos_vincular', { tentativa_id: t.tentativa_id, provedor_order_id: order });
  if (semPagar) return { ...b, proposta, aplicado: null };
  if (antesDePagar) await antesDePagar();
  const v = Number(t.valor).toFixed(2);
  const aplicado = await rpc('pagamentos_aplicar', { provedor: 'mercadopago', origem: 'webhook', conta_esperada: '777', retrato: {
    order_id: order, external_reference: t.tentativa_id, user_id: '777', total_amount: v, country_code: 'BRA',
    pagamento: { id: 'PAY' + order.slice(-6), amount: v, paid_amount: v, status: 'processed', status_detail: 'accredited', metodo_id: 'pix', metodo_tipo: 'bank_transfer', parcelas: null },
    estado: 'aprovada' } });
  return { ...b, proposta, aplicado };
}
