/* ==========================================================================
   SIMULADOR DA ORDERS API do Mercado Pago (testes e servidor local; fora do
   deploy: docs/ está no .vercelignore e o /docs é bloqueado no vercel.json).
   Imita o que a documentação oficial descreve (docs/pagamentos/00-…):
   endpoints, campos, 201/402/400/401/404/409/429, X-Idempotency-Key (a mesma
   chave com o mesmo corpo devolve o resultado original; com outro corpo, 409),
   e-mail de teste obrigatório no sandbox, e o aviso assinado (x-signature).
   Cartão: o token "local-<NOME>-…" decide o resultado pelo nome do titular,
   como os nomes de teste do MP (APRO, OTHE, CONT, FUND, SECU) + CHAL (3DS).
   Controles para testes: falhar a próxima chamada, pagar o Pix, estornar,
   contestar, expirar, adulterar uma order.
   ========================================================================== */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { assinar } from '../api/_pagamentos/assinatura.mjs';

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const idDe = prefixo => prefixo + Array.from(randomBytes(26), b => BASE32[b % 32]).join('');
const VALOR = /^\d{1,10}(\.\d{1,2})?$/;
const json = (status, corpo, cab = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...cab } });
const erro = (status, code, message) => json(status, { errors: [{ code, message: message || code }] });

export function criarMpSimulado({ token, userId = '1234567890', segredo, sandbox = true, agora = () => Date.now() } = {}) {
  const orders = new Map();
  const chaves = new Map();
  const falhas = [];                 /* cada item: 'tempo' | 'rede' | número HTTP — consumido pela próxima chamada */
  const chamadas = [];

  function nova(corpo) {
    const pg = corpo.transactions.payments[0], pm = pg.payment_method;
    const id = idDe('ORD'), pid = idDe('PAY');
    const pagamento = { id: pid, amount: pg.amount, status: 'created', status_detail: 'created', reference_id: randomBytes(5).toString('hex'), payment_method: { id: pm.id, type: pm.type } };
    let http = 201;
    if (pm.type === 'bank_transfer' && pm.id === 'pix') {
      Object.assign(pagamento, { status: 'action_required', status_detail: 'waiting_transfer', expiration_time: pg.expiration_time });
      Object.assign(pagamento.payment_method, { qr_code: '00020126580014br.gov.bcb.pix0136' + randomUUID() + '5204000053039865802BR', qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', ticket_url: 'https://www.mercadopago.com.br/sandbox/payments/' + pid + '/ticket' });
    } else {
      Object.assign(pagamento.payment_method, { token: pm.token, installments: pm.installments });
      const nome = String(pm.token).split('-')[1] || '';
      const recusa = { OTHE: 'processing_error', FUND: 'insufficient_amount', SECU: 'bad_filled_card_data', EXPI: 'bad_filled_card_data' };
      if (nome === 'APRO') Object.assign(pagamento, { status: 'processed', status_detail: 'accredited', paid_amount: pg.amount });
      else if (nome === 'CONT') Object.assign(pagamento, { status: 'processing', status_detail: 'in_process' });
      else if (nome === 'CHAL') { Object.assign(pagamento, { status: 'action_required', status_detail: 'pending_challenge' }); pagamento.payment_method.transaction_security = { url: 'https://sandbox.mercadopago.com.br/3ds/challenge/' + pid, validation: 'on_fraud_risk', liability_shift: 'required' }; }
      else { Object.assign(pagamento, { status: 'failed', status_detail: recusa[nome] || 'rejected_by_issuer' }); http = 402; }
    }
    const order = {
      id, type: 'online', processing_mode: 'automatic', external_reference: corpo.external_reference, total_amount: corpo.total_amount,
      total_paid_amount: pagamento.paid_amount || '0.00', country_code: 'BRA', user_id: userId, status: pagamento.status, status_detail: pagamento.status_detail,
      capture_mode: 'automatic', created_date: new Date(agora()).toISOString(), last_updated_date: new Date(agora()).toISOString(),
      integration_data: { application_id: '874202490252970' }, transactions: { payments: [pagamento] }
    };
    orders.set(id, order);
    return { http, order };
  }

  function validarCriacao(c) {
    if (!c || c.type !== 'online') return 'invalid_order_type';
    if (c.processing_mode !== 'automatic') return 'property_value';
    if (typeof c.total_amount !== 'string' || !VALOR.test(c.total_amount)) return 'property_type';
    if (typeof c.external_reference !== 'string' || c.external_reference.length > 64) return 'property_value';
    const p = c.payer || {};
    if (!p.email || !p.first_name || !p.last_name || !p.identification || !p.identification.type || !p.identification.number) return 'required_properties';
    if (sandbox && !/@testuser\.com$/.test(p.email)) return 'invalid_email_for_sandbox';
    const pgs = c.transactions && c.transactions.payments;
    if (!Array.isArray(pgs) || pgs.length !== 1) return 'minimum_items';
    if (pgs[0].amount !== c.total_amount) return 'invalid_total_amount';
    const pm = pgs[0].payment_method || {};
    if (pm.type === 'bank_transfer') return pm.id === 'pix' ? null : 'property_value';
    if (!['credit_card', 'debit_card'].includes(pm.type) || !pm.token || !Number.isInteger(pm.installments)) return 'required_properties';
    if (!/^local-[A-Z]{4}-/.test(pm.token)) return 'invalid_card_token';
    return null;
  }

  function atualizar(order, status, detalhe, extra = {}) {
    const p = order.transactions.payments[0];
    Object.assign(p, { status, status_detail: detalhe }, extra);
    Object.assign(order, { status, status_detail: detalhe, last_updated_date: new Date(agora()).toISOString() });
    if (extra.paid_amount) order.total_paid_amount = extra.paid_amount;
  }

  async function buscar(url, init = {}) {
    const u = new URL(url);
    const metodo = (init.method || 'GET').toUpperCase();
    const cab = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    chamadas.push({ metodo, caminho: u.pathname, chave: cab['x-idempotency-key'] || null });
    const falha = falhas.shift();
    if (falha === 'tempo') { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }
    if (falha === 'rede') throw new TypeError('fetch failed');
    if (typeof falha === 'number') return falha === 429 ? json(429, { errors: [{ code: 'too_many_requests' }] }, { 'retry-after': '2' }) : erro(falha, 'internal_error');
    if (u.host !== 'api.mercadopago.com') return erro(404, 'not_found');
    if (cab.authorization !== 'Bearer ' + token) return erro(401, 'invalid_credentials');
    const corpo = init.body ? JSON.parse(init.body) : undefined;
    const precisaChave = metodo === 'POST';
    const chave = cab['x-idempotency-key'];
    if (precisaChave && !chave) return erro(400, 'empty_required_header');
    if (precisaChave && (chave.length < 1 || chave.length > 128)) return erro(400, 'invalid_idempotency_key_length');
    const assinaturaCorpo = createHash('sha256').update(metodo + u.pathname + (init.body || '')).digest('hex');
    if (precisaChave && chaves.has(chave)) {
      const antes = chaves.get(chave);
      if (antes.assinatura !== assinaturaCorpo) return erro(409, 'idempotency_key_already_used');
      return json(antes.status, antes.corpo);
    }
    const guardar = (status, c) => { if (precisaChave) chaves.set(chave, { status, corpo: c, assinatura: assinaturaCorpo }); return json(status, c); };

    if (metodo === 'POST' && u.pathname === '/v1/orders') {
      const inval = validarCriacao(corpo);
      if (inval) return guardar(400, { errors: [{ code: inval, message: inval }] });
      const { http, order } = nova(corpo);
      return guardar(http, structuredClone(order));
    }
    if (metodo === 'GET' && u.pathname === '/v1/orders') {
      if (!u.searchParams.get('begin_date') || !u.searchParams.get('end_date')) return erro(400, 'required_search_params');
      const desde = Date.parse(u.searchParams.get('begin_date')), ate = Date.parse(u.searchParams.get('end_date'));
      const ref = u.searchParams.get('external_reference');
      const todas = [...orders.values()].filter(o => { const t = Date.parse(o.created_date); return t >= desde && t <= ate && (!ref || o.external_reference === ref); });
      const pagina = Number(u.searchParams.get('page') || 1), tam = Number(u.searchParams.get('page_size') || 20);
      const fatia = todas.slice((pagina - 1) * tam, pagina * tam);
      return json(200, { data: structuredClone(fatia), paging: { total: String(todas.length), total_pages: String(Math.ceil(todas.length / tam)), offset: String((pagina - 1) * tam), limit: String(tam) } });
    }
    const m = u.pathname.match(/^\/v1\/orders\/([A-Za-z0-9]+)(\/(cancel|refund))?$/);
    if (!m) return erro(404, 'not_found');
    const order = orders.get(m[1]);
    if (!order) return guardar(404, { errors: [{ code: 'order_not_found' }] });
    if (metodo === 'GET' && !m[3]) return json(200, structuredClone(order));
    if (metodo === 'POST' && m[3] === 'cancel') {
      if (!['created', 'action_required'].includes(order.status)) return guardar(409, { errors: [{ code: order.status === 'canceled' ? 'order_already_canceled' : 'cannot_cancel_order' }] });
      atualizar(order, 'canceled', 'canceled_transaction');
      order.transactions.payments[0].status_detail = 'canceled';
      return guardar(200, structuredClone(order));
    }
    if (metodo === 'POST' && m[3] === 'refund') {
      if (order.status === 'refunded') return guardar(409, { errors: [{ code: 'order_already_refunded' }] });
      if (order.status !== 'processed') return guardar(409, { errors: [{ code: 'cannot_refund_order' }] });
      atualizar(order, 'refunded', 'refunded');
      order.transactions.refunds = [{ id: idDe('REF'), amount: order.total_amount, status: 'processed' }];
      return guardar(201, structuredClone(order));
    }
    return erro(405, 'method_not_allowed');
  }

  return {
    fetch: buscar, orders, chamadas,
    falhar(...tipos) { falhas.push(...tipos); },
    pagarPix(id) { const o = orders.get(id); atualizar(o, 'processed', 'accredited', { paid_amount: o.total_amount }); return o; },
    concluirDesafio(id, aprovado = true) { const o = orders.get(id); if (aprovado) atualizar(o, 'processed', 'accredited', { paid_amount: o.total_amount }); else atualizar(o, 'failed', 'rejected_by_issuer'); return o; },
    aprovarAnalise(id) { const o = orders.get(id); atualizar(o, 'processed', 'accredited', { paid_amount: o.total_amount }); return o; },
    estornar(id) { atualizar(orders.get(id), 'refunded', 'refunded'); },
    contestar(id) { atualizar(orders.get(id), 'charged_back', 'in_process'); },
    expirar(id) { atualizar(orders.get(id), 'expired', 'expired'); },
    editar(id, fn) { fn(orders.get(id)); },
    porReferencia(ref) { return [...orders.values()].find(o => o.external_reference === ref); },
    /* o aviso que o MP mandaria: query com data.id, x-signature e x-request-id */
    aviso(id, { requestId = randomUUID(), ts = String(agora()), assinaturaDe = segredo, acao = 'order.processed' } = {}) {
      const o = orders.get(id);
      return {
        query: '?data.id=' + encodeURIComponent(id) + '&type=order',
        cabecalhos: { 'content-type': 'application/json', 'x-request-id': requestId, 'x-signature': assinar({ dataId: id.toLowerCase(), requestId, ts, segredo: assinaturaDe }) },
        corpo: JSON.stringify({ action: acao, api_version: 'v1', application_id: '874202490252970', date_created: new Date(agora()).toISOString(), live_mode: !sandbox,
          type: 'order', user_id: userId, data: { id, status: o ? o.status : 'processed', status_detail: o ? o.status_detail : 'accredited' } })
      };
    }
  };
}
