/* ==========================================================================
   PROVEDOR MERCADO PAGO — Orders API (Checkout Transparente), por HTTPS
   direto nos endpoints documentados (sem SDK de servidor: menos dependência,
   código auditável). Fontes em docs/pagamentos/00-PESQUISA-E-PLANO.md.
     POST /v1/orders                criar (X-Idempotency-Key obrigatório)
     GET  /v1/orders/{id}           consultar (a fonte da verdade)
     GET  /v1/orders?…              buscar por external_reference (janela de datas)
     POST /v1/orders/{id}/cancel    cancelar (status created / action_required)
     POST /v1/orders/{id}/refund    reembolsar (corpo vazio = total)
   O Access Token só vai no cabeçalho Authorization, nunca em URL, log ou erro.
   Erros viram ErroProvedor com um "tipo" fechado; quem chama decide sem adivinhar.
   ========================================================================== */
import { estadoDe } from './estados.mjs';

export class ErroProvedor extends Error {
  constructor(tipo, status, codigo, extra = {}) {
    super('provedor: ' + tipo + (status ? ' (HTTP ' + status + ')' : '') + (codigo ? ' ' + codigo : ''));
    this.tipo = tipo;            /* tempo | rede | credencial | limite | indisponivel | invalido | conflito | nao_encontrado | resposta */
    this.status = status || null;
    this.codigo = codigo || null;
    Object.assign(this, extra);
  }
}

const VALOR = /^\d{1,10}(\.\d{1,2})?$/;
const ID_ORDER = /^[A-Za-z0-9_-]{4,64}$/;
export const valorTexto = v => Number(v).toFixed(2);

function codigoDe(corpo) {
  if (!corpo || typeof corpo !== 'object') return null;
  const e = Array.isArray(corpo.errors) && corpo.errors[0];
  const c = (e && (e.code || e.message)) || corpo.code || corpo.error || null;
  return typeof c === 'string' ? c.slice(0, 80) : null;
}

export function criarMercadoPago({ token, base = 'https://api.mercadopago.com', fetch: buscar = globalThis.fetch, timeoutMs = 15000 }) {
  if (!token) throw new Error('token ausente');

  async function req(metodo, caminho, { corpo, chave, aceitar = [] } = {}) {
    const cab = { authorization: 'Bearer ' + token, accept: 'application/json' };
    if (corpo !== undefined) cab['content-type'] = 'application/json';
    if (chave) cab['x-idempotency-key'] = chave;
    let r;
    try {
      r = await buscar(base + caminho, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new ErroProvedor(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'tempo' : 'rede');
    }
    let dados = null;
    const texto = await r.text().catch(() => '');
    if (texto) { try { dados = JSON.parse(texto); } catch { dados = null; } }
    if (r.ok || aceitar.includes(r.status)) {
      if (!dados || typeof dados !== 'object') throw new ErroProvedor('resposta', r.status);
      return { status: r.status, dados };
    }
    const codigo = codigoDe(dados);
    if (r.status === 401 || r.status === 403) throw new ErroProvedor('credencial', r.status, codigo);
    if (r.status === 404) throw new ErroProvedor('nao_encontrado', r.status, codigo);
    if (r.status === 409 || r.status === 423) throw new ErroProvedor('conflito', r.status, codigo);
    if (r.status === 429) throw new ErroProvedor('limite', r.status, codigo, { tentarApos: Number(r.headers.get('retry-after')) || null });
    if (r.status >= 500) throw new ErroProvedor('indisponivel', r.status, codigo);
    throw new ErroProvedor('invalido', r.status, codigo);
  }

  return {
    nome: 'mercadopago',

    /* cria a order. 201 = criada; 402 = criada, mas a transação falhou (cartão recusado): devolve a order nos dois casos */
    async criarOrdem({ chave, referencia, valor, pagador, metodo, cartao, pixExpiracao, tresDS }) {
      const pagamento = { amount: valorTexto(valor) };
      if (metodo === 'pix') {
        pagamento.payment_method = { id: 'pix', type: 'bank_transfer' };
        pagamento.expiration_time = pixExpiracao || 'PT1H';
      } else {
        pagamento.payment_method = { id: cartao.meio, type: cartao.tipo, token: cartao.token, installments: cartao.parcelas };
      }
      const corpo = {
        type: 'online', processing_mode: 'automatic', total_amount: valorTexto(valor), external_reference: referencia,
        payer: { email: pagador.email, first_name: pagador.nome, last_name: pagador.sobrenome, identification: { type: pagador.documentoTipo, number: pagador.documento } },
        transactions: { payments: [pagamento] }
      };
      if (metodo === 'cartao' && tresDS) corpo.config = { online: { transaction_security: { validation: tresDS, liability_shift: 'required' } } };
      const r = await req('POST', '/v1/orders', { corpo, chave, aceitar: [402] });
      return { order: r.dados, recusadaNaCriacao: r.status === 402 };
    },

    async consultarOrdem(id) {
      if (!ID_ORDER.test(id || '')) throw new ErroProvedor('invalido', null, 'id de order inválido');
      return (await req('GET', '/v1/orders/' + encodeURIComponent(id))).dados;
    },

    /* busca pela nossa referência (a tentativa), numa janela de datas (obrigatória na API) */
    async buscarPorReferencia(referencia, desde, ate) {
      const q = new URLSearchParams({ begin_date: new Date(desde).toISOString(), end_date: new Date(ate).toISOString(), external_reference: referencia, type: 'online' });
      const d = (await req('GET', '/v1/orders?' + q)).dados;
      const lista = Array.isArray(d.data) ? d.data : [];
      return lista.filter(o => o && o.external_reference === referencia);
    },

    /* as orders da conta numa janela (a varredura da reconciliação), 50 por página */
    async buscarRecentes(desde, ate, pagina = 1) {
      const q = new URLSearchParams({ begin_date: new Date(desde).toISOString(), end_date: new Date(ate).toISOString(), type: 'online',
        page: String(pagina), page_size: '50', sort_by: 'created_date', sort_order: 'asc' });
      const d = (await req('GET', '/v1/orders?' + q)).dados;
      return Array.isArray(d.data) ? d.data : [];
    },

    async cancelarOrdem(id, chave) {
      if (!ID_ORDER.test(id || '')) throw new ErroProvedor('invalido', null, 'id de order inválido');
      return (await req('POST', '/v1/orders/' + encodeURIComponent(id) + '/cancel', { chave })).dados;
    },

    async reembolsarOrdem(id, chave) {
      if (!ID_ORDER.test(id || '')) throw new ErroProvedor('invalido', null, 'id de order inválido');
      return (await req('POST', '/v1/orders/' + encodeURIComponent(id) + '/refund', { chave, corpo: {} })).dados;
    }
  };
}

/* o RETRATO: só os campos que a Beyon Zero usa, conferidos no formato. Order fora do formato = "desconhecido" */
export function retratoDe(order, { pixExpiraEm } = {}) {
  const pagamentos = order && order.transactions && Array.isArray(order.transactions.payments) ? order.transactions.payments : [];
  const p = pagamentos.length === 1 ? pagamentos[0] : null;   /* (a Beyon Zero cria UMA transação por order) */
  const pm = (p && p.payment_method) || {};
  const ts = pm.transaction_security || {};
  const texto = v => (v === undefined || v === null ? null : String(v));
  const r = {
    order_id: texto(order && order.id),
    external_reference: texto(order && order.external_reference),
    user_id: texto(order && order.user_id),
    total_amount: texto(order && order.total_amount),
    country_code: texto(order && order.country_code),
    pagamento: p ? {
      id: texto(p.id), amount: texto(p.amount), paid_amount: texto(p.paid_amount), status: texto(p.status), status_detail: texto(p.status_detail),
      metodo_id: texto(pm.id), metodo_tipo: texto(pm.type), parcelas: Number.isInteger(pm.installments) ? pm.installments : null
    } : {},
    estado: p ? estadoDe(p.status, p.status_detail) : 'desconhecido'
  };
  if (order && order.currency !== undefined) r.currency = texto(order.currency);
  if (pm.type === 'bank_transfer' && pm.id === 'pix' && (pm.qr_code || pm.ticket_url)) {
    r.pix = { qr: texto(pm.qr_code), qr_base64: texto(pm.qr_code_base64), link: /^https:\/\//.test(pm.ticket_url || '') ? pm.ticket_url : null, expira_em: pixExpiraEm || null };
  }
  if (typeof ts.url === 'string' && /^https:\/\//.test(ts.url)) r.desafio_url = ts.url;
  /* formato mínimo: sem isso, nada é aplicado como aprovado */
  if (!ID_ORDER.test(r.order_id || '') || !VALOR.test(r.total_amount || '') || !p || !VALOR.test(r.pagamento.amount || '')) r.estado = 'desconhecido';
  return r;
}
