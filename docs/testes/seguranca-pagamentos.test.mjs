/* (e) O AVISO AO DONO NA HORA do estorno, da contestação e do restante pago (decisão do dono, 19/11): o banco devolve o alerta
   (app.pagamentos_aplicar: só o código do pedido, o evento e a parcela) e o serviço de pagamentos chama o aviso (api/_aviso.mjs, o mesmo
   canal do vigia e do pedido novo). O aviso nunca derruba o pagamento: falhou, lançou ou demorou, o pagamento já está gravado.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';
import { avisarDonoPagamento, textoDoAvisoDePagamento } from '../../api/_aviso.mjs';

const ORDER = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
const order = { id: ORDER, external_reference: '00000000-0000-4000-8000-000000000001', user_id: '777', total_amount: '1200.00', country_code: 'BRA',
  transactions: { payments: [{ id: 'PAY1', amount: '1200.00', paid_amount: '1200.00', status: 'refunded', status_detail: 'refunded', payment_method: { id: 'pix', type: 'bank_transfer' } }] } };
const ALERTA = Object.freeze({ codigo: 'BZ-ACDEF', evento: 'estorno', parcela: 'entrada' });
const cfg = { ativo: true, contaEsperada: '777', metodos: ['pix'] };
const mp = { nome: 'mercadopago', consultarOrdem: async () => order };

function servicoCom(resposta, avisar) {
  const chamadas = [];
  const banco = async (nome, p) => { chamadas.push(nome); if (nome === 'pagamentos_aplicar') return resposta; return {}; };
  return { servico: criarServicoPagamentos({ banco, cfg, provedor: mp, avisar }), chamadas };
}

test('(e) o estorno aplicado pelo aviso do Mercado Pago chama o aviso ao dono UMA vez, com o alerta do banco', async () => {
  const avisos = [];
  const { servico } = servicoCom({ aplicado: 'estornada', alerta: ALERTA }, async a => { avisos.push(a); return true; });
  const r = await servico.processarAviso({ orderId: ORDER, requestId: 'r1' });
  assert.equal(r.aplicado, 'estornada');
  assert.deepEqual(avisos, [ALERTA]);
});

test('(e) sem alerta do banco (pagamento comum, aviso repetido) não avisa ninguém', async () => {
  for (const resposta of [{ aplicado: 'aprovada' }, { sem_mudanca: true, status: 'estornada' }, null]) {
    let n = 0;
    const { servico } = servicoCom(resposta, async () => { n++; return true; });
    await servico.processarAviso({ orderId: ORDER });
    assert.equal(n, 0, JSON.stringify(resposta));
  }
});

test('(e) o aviso FALHANDO não derruba o pagamento: lança, rejeita ou devolve false, o resultado do banco volta igual', async () => {
  const erros = console.error; console.error = () => {};
  try {
    for (const avisar of [() => { throw new Error('canal caiu'); }, async () => { throw new Error('send falhou'); }, async () => false, 'não é função']) {
      const { servico } = servicoCom({ aplicado: 'contestada', alerta: { ...ALERTA, evento: 'contestacao' } }, avisar);
      const r = await servico.processarAviso({ orderId: ORDER });
      assert.equal(r.aplicado, 'contestada');
    }
  } finally { console.error = erros; }
});

test('(e) a reconciliação (que acha o estorno quando o aviso do provedor se perdeu) também avisa', async () => {
  const avisos = [];
  const banco = async nome => {
    if (nome === 'pagamentos_para_reconciliar') return [{ tentativa_id: '00000000-0000-4000-8000-000000000001', provedor: 'mercadopago', provedor_order_id: ORDER, status: 'aprovada', criada_em: new Date().toISOString() }];
    if (nome === 'pagamentos_aplicar') return { aplicado: 'estornada', alerta: ALERTA };
    if (nome === 'pagamentos_atencao') return { total: 1 };
    return {};
  };
  const erros = console.error; console.error = () => {};
  try {
    const servico = criarServicoPagamentos({ banco, cfg, provedor: { ...mp, buscarRecentes: async () => [] }, avisar: async a => { avisos.push(a); return true; } });
    await servico.reconciliar({ varrerDias: 0 });
  } finally { console.error = erros; }
  assert.deepEqual(avisos, [ALERTA]);
});

/* ---------- o texto e o canal (api/_aviso.mjs) ---------- */
class EmailFalso { constructor(de, para, bruto) { Object.assign(this, { de, para, bruto }); } }
const canalFalso = () => { const enviados = []; return { enviados, send: async m => { enviados.push(m); } }; };
const corpoDe = bruto => Buffer.from(bruto.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');

test('(e) o e-mail leva só o código do pedido e o evento: texto fixo, sem dado pessoal', async () => {
  const canal = canalFalso();
  assert.equal(await avisarDonoPagamento({ AVISO_EMAIL: canal, AVISO_PARA: 'dono@exemplo.com' }, ALERTA, { EmailMessage: EmailFalso }), true);
  assert.equal(canal.enviados.length, 1);
  const corpo = corpoDe(canal.enviados[0].bruto);
  assert.match(corpo, /BZ-ACDEF/);
  assert.match(corpo, /entrada/i); assert.match(corpo, /bloquead/i);
  assert.doesNotMatch(corpo, /@(?!beyonzero)|\+55|R\$/);
});

test('(e) os textos: um por evento e parcela, sem colchete nem número além do código; evento fora da lista não manda nada', async () => {
  for (const evento of ['estorno', 'estorno_parcial', 'contestacao']) {
    for (const parcela of ['entrada', 'restante']) {
      const t = textoDoAvisoDePagamento({ codigo: 'BZ-ACDEF', evento, parcela });
      assert.ok(t && t.includes('BZ-ACDEF') && !/[\r\n]/.test(t), evento + '/' + parcela);
    }
  }
  assert.match(textoDoAvisoDePagamento({ codigo: 'BZ-ACDEF', evento: 'restante_pago', parcela: 'restante' }), /no ar/);
  assert.equal(textoDoAvisoDePagamento({ codigo: 'BZ-ACDEF', evento: 'qualquer', parcela: 'entrada' }), null);
  const canal = canalFalso();
  assert.equal(await avisarDonoPagamento({ AVISO_EMAIL: canal, AVISO_PARA: 'dono@exemplo.com' }, { codigo: 'BZ-ACDEF', evento: 'x' }, { EmailMessage: EmailFalso }), false);
  assert.equal(canal.enviados.length, 0);
});

test('(e) código fora do formato nunca entra no e-mail (nada de cabeçalho ou texto injetado): o aviso sai sem ele', async () => {
  for (const codigo of ['BZ-ACDEF\r\nBcc: x@y.com', 'Ana Souza', '', null, 'BZ-acdef']) {
    const t = textoDoAvisoDePagamento({ codigo, evento: 'estorno', parcela: 'entrada' });
    assert.ok(t && !t.includes(String(codigo || '§')) && !/[\r\n]/.test(t), String(codigo));
  }
});

test('(e) as duas portas que criam o serviço de pagamentos (o webhook/reconciliação e a API de vendas) ligam o aviso ao dono', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['api/pagamentos.mjs', 'api/vendas.mjs']) {
    const fonte = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.match(fonte, /criarServicoPagamentos\(\{[^}]*avisar: alerta => avisarDonoPagamento\(env, alerta\)/, f);
    assert.match(fonte, /import \{ avisarDonoPagamento \} from '\.\/_aviso\.mjs';/, f);
  }
});
