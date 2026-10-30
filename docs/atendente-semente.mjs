/* O cliente FICTÍCIO do atendente, só no banco local (docs/atendente-teste.html): domínios localhost e 127.0.0.1, nada real. */
export const ATENDENTE_TESTE = 'at_00000000000000000000000000000001';

export async function semearAtendenteDeTeste(db) {
  const r = await db.query(
    `insert into app.atendente_clientes (org_id, publico, nome, whatsapp, privacidade_url, saudacao, cor, cor_texto, teto_dia_usd)
     select id, $1, 'Clínica Modelo (TESTE)', '5521900000000', 'https://exemplo.invalid/privacidade',
            'Oi! Este é um cliente de teste. Pergunte de horário, endereço ou preço da limpeza.', '#0f4c5c', '#ffffff', 5
       from app.organizacoes where slug = 'beyon-zero' returning id, org_id`, [ATENDENTE_TESTE]);
  const { id, org_id } = r.rows[0];
  for (const d of ['localhost', '127.0.0.1']) {
    await db.query('insert into app.atendente_dominios (cliente_id, org_id, dominio) values ($1, $2, $3)', [id, org_id, d]);
  }
  const perguntas = [['Qual o horário de atendimento?', 'Atendemos de segunda a sexta, das 8h às 18h.'], ['Onde fica a clínica?', 'Fica na Rua Fictícia, 100, Centro (endereço de teste).']];
  for (const [p, rs] of perguntas) {
    await db.query("insert into app.atendente_base (cliente_id, org_id, tipo, pergunta, resposta) values ($1, $2, 'pergunta', $3, $4)", [id, org_id, p, rs]);
  }
  await db.query("insert into app.atendente_base (cliente_id, org_id, tipo, item, preco_centavos) values ($1, $2, 'preco', 'Limpeza', 18000)", [id, org_id]);
}
