/* ==========================================================================
   O TESTE DO PIX DE R$ 0,01 — só para o dono, só pelo painel (api/painel.mjs, chave PAINEL_CHAVE).
   Serve para provar, com dinheiro real e valor mínimo, a cadeia inteira: Mercado Pago de produção → QR / copia-e-cola →
   banco do dono → confirmação. NÃO prova a ligação com o pedido real (isso é coberto pelos testes simulados e pelo E2E).

   ISOLAMENTO (regras do dono, 20/11: "de forma alguma pode ir pro produto principal"):
   • este módulo é importado SÓ por api/painel.mjs; nada do caminho do cliente (vendas.mjs, pagamentos.mjs, _vendas/*,
     servico.mjs) o importa (docs/testes/teste-pix.test.mjs varre isso);
   • o valor é a constante VALOR_CENTAVO daqui: nenhum campo da requisição entra no valor, e nenhum parâmetro novo foi
     acrescentado a criarOrdem nem ao serviço do pedido;
   • trava de ligar: sem BZ_TESTE_PIX = "1" no ambiente, tudo responde fechado (vazia em produção por padrão: wrangler.jsonc);
   • a order de teste tem external_reference "TESTE-<aleatório>"; a referência de um pedido real é o UUID da tentativa
     (banco: external_reference = t.id::text), então nunca começa com "TESTE-". O webhook e a reconciliação ignoram o prefixo
     (servico.mjs, ordemDeTeste);
   • ler e reembolsar só aceitam order com a referência TESTE- E total R$ 0,01 E da conta esperada, conferidos consultando a
     order no Mercado Pago ANTES de qualquer ação. Order de pedido real nunca passa por aqui.
   Os dados de quem paga (nome, e-mail, CPF) vêm do formulário na hora, vão só ao Mercado Pago e NUNCA são gravados, logados
   nem devolvidos em erro. Nada aqui toca o banco.
   ========================================================================== */
import { randomBytes } from 'node:crypto';
import { criarMercadoPago, retratoDe, ErroProvedor } from './mercadopago.mjs';
import { configPagamentos } from './config.mjs';
import { validarPagador } from './servico.mjs';
import { criarFreio } from '../_freio.mjs';

export const VALOR_CENTAVO = '0.01';          /* o ÚNICO valor que este teste cobra; nunca vem da requisição */
export const PREFIXO_REFERENCIA = 'TESTE-';
export const EXPIRACAO_PIX = 'PT10M';          /* o QR vale 10 minutos */
export const MAX_POR_HORA = 5;
const JANELA_FREIO_MS = 3600e3;
const CHAVE_DO_FREIO = 'teste-pix';
const ID_ORDER = /^ORD[0-9A-Za-z]{10,60}$/;
const DOCUMENTOS = ['CPF', 'CNPJ'];

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/* o texto de cada estado, em português simples (quem lê não é técnico) */
const TEXTOS = {
  aguardando: 'Aguardando o pagamento. Abra o app do seu banco e pague o Pix de R$ 0,01.',
  pago: 'Pagamento recebido pelo Mercado Pago: a cadeia funciona.',
  expirou: 'O Pix expirou sem pagamento. Gere outro para testar de novo.',
  cancelado: 'Este Pix foi cancelado. Gere outro para testar de novo.',
  devolvido: 'O centavo foi devolvido.',
  falhou: 'O Mercado Pago não aceitou este Pix. Gere outro para testar de novo.',
  desconhecido: 'O Mercado Pago devolveu um estado que o teste não conhece. Confira no app do Mercado Pago.'
};
const ESTADO_DO_TESTE = {
  processando: 'aguardando', aguardando: 'aguardando', requer_acao: 'aguardando', aprovada: 'pago', expirada: 'expirou', cancelada: 'cancelado',
  estornada: 'devolvido', recusada: 'falhou'
};
const estadoDoTeste = retrato => ESTADO_DO_TESTE[retrato.estado] || 'desconhecido';

/* o pagador que vai ao provedor: em produção, o que o dono digitou (o banco mostra o nome dele); fora dela, o MP só aceita o
   e-mail de teste e o Pix de teste pede o nome APRO (a mesma regra do pedido, servico.mjs) */
const pagadorParaProvedor = (p, cfg) => (cfg.ambiente === 'producao' ? p : { ...p, email: 'test@testuser.com', nome: 'APRO' });

/* order que este teste criou: referência TESTE-, valor R$ 0,01, conta esperada. É a ÚNICA porta de leitura e de reembolso */
function conferirOrdemDeTeste(order, cfg) {
  const r = retratoDe(order);
  const ehDoTeste = typeof r.external_reference === 'string' && r.external_reference.startsWith(PREFIXO_REFERENCIA)
    && r.total_amount === VALOR_CENTAVO && r.pagamento.amount === VALOR_CENTAVO
    && !!cfg.contaEsperada && r.user_id === String(cfg.contaEsperada);
  return ehDoTeste ? r : null;
}

export function ehPedidoDeTestePix(bruto) {
  return !!bruto && typeof bruto === 'object' && (Object.hasOwn(bruto, 'teste_pix') || Object.hasOwn(bruto, 'teste_pix_reembolsar'));
}

export function criarTestePix({ freio = criarFreio({ max: MAX_POR_HORA, janelaMs: JANELA_FREIO_MS }), config = configPagamentos } = {}) {
  const FECHADO = { erro: 'O teste do Pix está desligado. Ele só funciona enquanto o interruptor BZ_TESTE_PIX estiver ligado.', desligado: true };
  const NAO_E_DO_TESTE = { erro: 'Esta order não é do teste do Pix de R$ 0,01.' };

  /* a trava de ligar, a configuração dos pagamentos (mesma conta e mesmo token do site, com as mesmas travas) e o provedor */
  function preparar(env) {
    if (!env || env.BZ_TESTE_PIX !== '1') return { resposta: json(FECHADO, 403) };
    const cfg = config(env);
    if (!cfg || !cfg.ativo) { console.error('[teste-pix] pagamentos desligados:', (cfg && cfg.motivo) || 'sem configuração'); return { resposta: json({ erro: 'Os pagamentos estão desligados neste ambiente.' }, 503) }; }
    return { cfg, mp: criarMercadoPago({ token: cfg.token, base: cfg.base, fetch: cfg.fetch || globalThis.fetch }) };
  }

  const erroDoProvedor = (e, etapa) => {
    const tipo = e instanceof ErroProvedor ? e.tipo : 'erro';
    console.error('[teste-pix] ' + etapa + ':', tipo, e instanceof ErroProvedor && e.status ? e.status : '');   /* (só o tipo e o HTTP: nada do que foi digitado) */
    if (tipo === 'invalido') return json({ erro: 'O Mercado Pago não aceitou os dados. Confira o nome, o e-mail e o CPF e tente de novo.' }, 422);
    if (tipo === 'nao_encontrado') return json(NAO_E_DO_TESTE, 404);
    return json({ erro: 'Não deu para falar com o Mercado Pago agora. Tente de novo em instantes.' }, 502);
  };

  async function criar(entrada, env) {
    const { resposta, cfg, mp } = preparar(env);
    if (resposta) return resposta;
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return json({ erro: 'Pedido inválido.' }, 400);
    const tipo = entrada.documento_tipo === undefined ? null : String(entrada.documento_tipo).toUpperCase();
    if (tipo !== null && !DOCUMENTOS.includes(tipo)) return json({ erro: 'Escolha CPF ou CNPJ.' }, 400);
    const v = validarPagador({ nome: entrada.nome, sobrenome: entrada.sobrenome, email: entrada.email, documento: entrada.documento });
    if (v.erro) return json({ erro: v.erro }, 400);
    if (tipo !== null && tipo !== v.dados.documentoTipo) return json({ erro: 'O tipo de documento não combina com o número.' }, 400);
    if (freio(CHAVE_DO_FREIO)) return json({ erro: 'Já foram ' + MAX_POR_HORA + ' testes na última hora. Espere um pouco para gerar outro.' }, 429);

    const referencia = PREFIXO_REFERENCIA + randomBytes(12).toString('hex');
    let criada;
    try {
      criada = await mp.criarOrdem({ chave: 'bz-teste-' + referencia, referencia, valor: VALOR_CENTAVO, pagador: pagadorParaProvedor(v.dados, cfg), metodo: 'pix', pixExpiracao: EXPIRACAO_PIX });
    } catch (e) { return erroDoProvedor(e, 'criar'); }
    /* o que voltou tem de ser exatamente o pedido: a nossa referência, R$ 0,01 e a nossa conta; senão não se entrega QR nenhum */
    const r = criada && criada.order ? conferirOrdemDeTeste(criada.order, cfg) : null;
    if (!r || r.external_reference !== referencia || !ID_ORDER.test(r.order_id || '') || !r.pix || !r.pix.qr) {
      console.error('[teste-pix] a order criada não confere com o pedido; nenhum QR entregue');
      if (criada && criada.order && ID_ORDER.test(String(criada.order.id || ''))) await mp.cancelarOrdem(String(criada.order.id), 'cx-' + referencia).catch(() => {});
      return json({ erro: 'O Mercado Pago devolveu uma cobrança diferente da pedida. Nada foi entregue; tente de novo.' }, 502);
    }
    return json({ ok: true, order_id: r.order_id, valor: VALOR_CENTAVO, qr: r.pix.qr, qr_base64: r.pix.qr_base64, expira_em: new Date(Date.now() + 10 * 60e3).toISOString(), estado: estadoDoTeste(r), texto: TEXTOS[estadoDoTeste(r)] });
  }

  async function consultar(orderId, env) {
    const { resposta, cfg, mp } = preparar(env);
    if (resposta) return resposta;
    if (!ID_ORDER.test(String(orderId || ''))) return json({ erro: 'Código da order inválido.' }, 400);
    let order;
    try { order = await mp.consultarOrdem(String(orderId)); } catch (e) { return erroDoProvedor(e, 'consultar'); }
    const r = conferirOrdemDeTeste(order, cfg);
    if (!r) return json(NAO_E_DO_TESTE, 404);
    const estado = estadoDoTeste(r);
    return json({ ok: true, order_id: r.order_id, estado, pago: estado === 'pago', texto: TEXTOS[estado], valor: VALOR_CENTAVO });
  }

  async function reembolsar(orderId, env) {
    const { resposta, cfg, mp } = preparar(env);
    if (resposta) return resposta;
    if (!ID_ORDER.test(String(orderId || ''))) return json({ erro: 'Código da order inválido.' }, 400);
    const id = String(orderId);
    try {
      /* consulta ANTES: só order do teste (TESTE-, R$ 0,01, nossa conta) e só a que está paga chega ao reembolso */
      const antes = conferirOrdemDeTeste(await mp.consultarOrdem(id), cfg);
      if (!antes) return json(NAO_E_DO_TESTE, 404);
      if (antes.estado === 'estornada') return json({ ok: true, order_id: id, estado: 'devolvido', pago: false, texto: TEXTOS.devolvido, valor: VALOR_CENTAVO });
      if (antes.estado !== 'aprovada') return json({ erro: 'Este Pix ainda não foi pago: não há centavo para devolver.' }, 409);
      let conflito = false;
      try { await mp.reembolsarOrdem(id, 'rf-teste-' + id); }
      catch (e) { if (!(e instanceof ErroProvedor) || e.tipo !== 'conflito') throw e; conflito = true; }   /* (409 do MP: já devolvido ou em devolução; o estado consultado diz qual) */
      const depois = conferirOrdemDeTeste(await mp.consultarOrdem(id), cfg);
      if (!depois) return json(NAO_E_DO_TESTE, 404);
      const estado = estadoDoTeste(depois);
      return json({ ok: estado === 'devolvido' || !conflito, order_id: id, estado, pago: estado === 'pago', texto: TEXTOS[estado], valor: VALOR_CENTAVO });
    } catch (e) { return erroDoProvedor(e, 'reembolsar'); }
  }

  return {
    /* GET ?teste_pix=<order_id> */
    ler: (orderId, env) => consultar(orderId, env),
    /* POST {teste_pix: {...}} cria; POST {teste_pix_reembolsar: <order_id>} devolve o centavo */
    mudar(bruto, env) {
      if (Object.hasOwn(bruto, 'teste_pix_reembolsar')) return reembolsar(bruto.teste_pix_reembolsar, env);
      return criar(bruto.teste_pix, env);
    }
  };
}

export const testePix = criarTestePix();
