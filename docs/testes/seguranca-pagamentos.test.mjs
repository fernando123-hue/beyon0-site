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

/* ---------- revisão técnica D: o assunto do alerta não é cortado ---------- */
/* o assunto inteiro: as palavras codificadas (RFC 2047) do cabeçalho, com a dobra de linha, juntas e lidas */
function assuntoCompleto(bruto) {
  const cabecalho = bruto.split('\r\n\r\n')[0].split('\r\n');
  const i = cabecalho.findIndex(l => l.startsWith('Subject: '));
  const linhas = [cabecalho[i].slice(9)];
  for (let j = i + 1; j < cabecalho.length && /^[ \t]/.test(cabecalho[j]); j++) linhas.push(cabecalho[j].trim());
  const palavras = linhas.join(' ').split(' ');
  assert.ok(palavras.every(p => /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/.test(p) && p.length <= 75), 'cada palavra codificada cabe em 75 caracteres: ' + palavras.map(p => p.length));
  assert.ok(linhas.every(l => l.length + 9 <= 78), 'cada linha física do cabeçalho cabe nas 78 colunas');
  return palavras.map(p => Buffer.from(p.slice(10, -2), 'base64').toString('utf8')).join('');
}

test('revisão D: o assunto do alerta de pagamento sai INTEIRO (código, parcela e o que houve), sem reticências e sem quebra de linha dentro dele', async () => {
  for (const evento of ['estorno', 'estorno_parcial', 'contestacao']) {
    for (const parcela of ['entrada', 'restante']) {
      const canal = canalFalso();
      assert.equal(await avisarDonoPagamento({ AVISO_EMAIL: canal, AVISO_PARA: 'dono@exemplo.com' }, { codigo: 'BZ-ACDEF', evento, parcela }, { EmailMessage: EmailFalso }), true);
      const assunto = assuntoCompleto(canal.enviados[0].bruto);
      const frase = textoDoAvisoDePagamento({ codigo: 'BZ-ACDEF', evento, parcela }).split('.')[0];
      assert.equal(assunto, frase, evento + '/' + parcela);
      assert.ok(assunto.includes('BZ-ACDEF') && !assunto.includes('…') && !/[\r\n]/.test(assunto));
    }
  }
});

test('revisão D: assunto com acento e longo fica em palavras codificadas inteiras (nenhum caractere partido ao meio) e sem cabeçalho injetado', async () => {
  const canal = canalFalso();
  const longo = 'ç'.repeat(70);
  const { montarEmail } = await import('../../api/_aviso.mjs');
  const bruto = montarEmail({ de: 'avisos@beyonzero.com.br', para: 'dono@exemplo.com', texto: longo + '\r\nBcc: x@y.com. Resto.' });
  const lido = assuntoCompleto(bruto);
  assert.ok(!lido.includes('�') && /^ç{70}$/.test(lido), 'nenhum caractere partido: os 70 ç inteiros, sem o que veio depois da quebra de linha');
  assert.ok(!/^Bcc:/m.test(bruto.split('\r\n\r\n')[0]), 'nada de cabeçalho vindo do texto');
  assert.equal(canal.enviados.length, 0);
});

test('revisão E: o texto do restante pago com a entrega bloqueada diz que o site NÃO vai ao ar, com o código, sem dado pessoal, e o assunto é a 1ª frase', async () => {
  const t = textoDoAvisoDePagamento({ codigo: 'BZ-ACDEF', evento: 'restante_pago_bloqueada', parcela: 'restante' });
  assert.match(t, /^URGENTE: pedido BZ-ACDEF: o restante foi pago, mas a entrega está bloqueada/);
  assert.match(t, /não vai ao ar/); assert.doesNotMatch(t, /ponha no ar/); assert.ok(!/[\r\n]/.test(t));
  const canal = canalFalso();
  assert.equal(await avisarDonoPagamento({ AVISO_EMAIL: canal, AVISO_PARA: 'dono@exemplo.com' }, { codigo: 'BZ-ACDEF', evento: 'restante_pago_bloqueada', parcela: 'restante' }, { EmailMessage: EmailFalso }), true);
  assert.equal(assuntoCompleto(canal.enviados[0].bruto), t.split('.')[0]);
});

/* ---------- revisão 2, item 1: o banco recusa cobrar o restante com a entrega bloqueada; o cliente lê uma frase humana, nunca o erro cru ---------- */
test('revisão 2/1: o 55000 "a entrega está bloqueada" vira frase humana (409, com saída pelo recado), sem as palavras bloqueada, estorno ou código', async () => {
  const bloqueio = Object.assign(new Error('a entrega está bloqueada (entrada estornada, contestada ou projeto pausado): a equipe resolve'), { codigo: '55000' });
  const servico = criarServicoPagamentos({ banco: async () => { throw bloqueio; }, cfg: { ativo: true, contaEsperada: '777', metodos: ['pix'] }, provedor: mp });
  const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '52998224725' };
  await assert.rejects(servico.iniciar({ conversa_id: 'c', visitante_id: 'v', metodo: 'pix', pagador: PAGADOR }), e => {
    assert.equal(e.status, 409);
    assert.match(e.message, /conferindo/); assert.doesNotMatch(e.message, /bloquead|estorn|contest|BZ-|55000/i);
    return true;
  });
});

test('revisão 2/6: o corte do assunto é por caractere inteiro (emoji não vira U+FFFD) e um texto que começa com ponto ou quebra de linha ainda tem assunto (o padrão fixo)', async () => {
  const { montarEmail } = await import('../../api/_aviso.mjs');
  const mont = texto => montarEmail({ de: 'avisos@beyonzero.com.br', para: 'dono@exemplo.com', texto });
  const emojis = mont('😀'.repeat(110) + '. Resto.');
  const lido = assuntoCompleto(emojis);
  assert.ok(!lido.includes('\uFFFD'), 'nenhum emoji partido ao meio');
  assert.match(lido, /^(😀)+…$/);
  for (const vazio of ['. Só o resto.', '\r\nSó o resto.', '   ', '\n\n']) {
    assert.equal(assuntoCompleto(mont(vazio)), 'Aviso da Beyon Zero', JSON.stringify(vazio) + ': assunto padrão, nunca vazio');
  }
});

test('revisão 2/7: o emoji nunca é partido na fronteira entre duas palavras codificadas do assunto (a fatia é por caractere inteiro, em qualquer largura da palavra anterior)', async () => {
  const { montarEmail } = await import('../../api/_aviso.mjs');
  for (let n = 30; n <= 46; n++) {
    const frase = 'a'.repeat(n) + '😀😀 fim';
    const lido = assuntoCompleto(montarEmail({ de: 'avisos@beyonzero.com.br', para: 'dono@exemplo.com', texto: frase }));
    assert.equal(lido, frase, 'n=' + n);
  }
});

/* ---------- S2: o estorno da entrada manda cancelar o Pix do restante no provedor (melhor esforço; nunca derruba o pagamento) ---------- */
const PIX_DO_RESTANTE = Object.freeze({ tentativa_id: '00000000-0000-4000-8000-0000000000aa', order: 'ORDRESTANTE00000000000000001' });
const orderCancelada = { ...order, id: PIX_DO_RESTANTE.order, transactions: { payments: [{ id: 'PAY2', amount: '1800.00', paid_amount: null, status: 'cancelled', status_detail: 'canceled', payment_method: { id: 'pix', type: 'bank_transfer' } }] } };

test('S2: o banco manda cancelar o Pix do restante: o serviço cancela a order no provedor (com a chave de idempotência da tentativa) e aplica o retrato', async () => {
  const canceladas = [], aplicadas = [];
  const banco = async (nome, p) => { if (nome === 'pagamentos_aplicar') { aplicadas.push(p.retrato.order_id); return aplicadas.length === 1 ? { aplicado: 'estornada', alerta: ALERTA, cancelar_restante: [PIX_DO_RESTANTE] } : { aplicado: 'cancelada' }; } return {}; };
  const provedor = { ...mp, cancelarOrdem: async (id, chave) => { canceladas.push([id, chave]); return orderCancelada; } };
  const servico = criarServicoPagamentos({ banco, cfg, provedor, avisar: async () => true });
  await servico.processarAviso({ orderId: ORDER, requestId: 'r1' });
  assert.deepEqual(canceladas, [[PIX_DO_RESTANTE.order, 'cx-' + PIX_DO_RESTANTE.tentativa_id]]);
  assert.deepEqual(aplicadas, [ORDER, PIX_DO_RESTANTE.order], 'o retrato da order cancelada também é aplicado');
});

test('S2: o cancelamento no provedor FALHANDO (ou o provedor sem cancelarOrdem) nunca derruba o pagamento já gravado: o resultado do banco volta igual', async () => {
  const erros = console.error; console.error = () => {};
  try {
    for (const cancelarOrdem of [async () => { throw new Error('provedor caiu'); }, undefined]) {
      const banco = async nome => nome === 'pagamentos_aplicar' ? { aplicado: 'contestada', alerta: { ...ALERTA, evento: 'contestacao' }, cancelar_restante: [PIX_DO_RESTANTE] } : {};
      const servico = criarServicoPagamentos({ banco, cfg, provedor: { ...mp, cancelarOrdem }, avisar: async () => true });
      const r = await servico.processarAviso({ orderId: ORDER });
      assert.equal(r.aplicado, 'contestada');
    }
  } finally { console.error = erros; }
});

test('S2: sem cancelar_restante no resultado do banco, nada é cancelado', async () => {
  let n = 0;
  const banco = async nome => nome === 'pagamentos_aplicar' ? { aplicado: 'estornada', alerta: ALERTA } : {};
  const servico = criarServicoPagamentos({ banco, cfg, provedor: { ...mp, cancelarOrdem: async () => { n++; return orderCancelada; } }, avisar: async () => true });
  await servico.processarAviso({ orderId: ORDER });
  assert.equal(n, 0);
});
