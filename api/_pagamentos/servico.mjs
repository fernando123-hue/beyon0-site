/* ==========================================================================
   SERVIÇO DE PAGAMENTOS — o domínio financeiro da Beyon Zero. O resto do
   sistema fala com ele; ele fala com o provedor (hoje o Mercado Pago) e com
   o banco. Autoridade:
     navegador  → interface (nada do que ele manda decide valor nem "pago")
     IA         → nenhuma (não há ferramenta de pagamento no agente)
     provedor   → o estado externo, CONSULTADO pelo servidor com o Access Token
     banco      → o estado interno e a última conferência (app.pagamentos_aplicar)
     aviso      → só um sinal para consultar
   Regra de erro (fail closed): diante de dúvida (tempo esgotado, provedor fora,
   conflito de idempotência), a tentativa fica como está; nunca vira paga e
   nunca é dada como recusada sem o provedor dizer. A reconciliação resolve.
   ========================================================================== */
import { criarMercadoPago, retratoDe, ErroProvedor } from './mercadopago.mjs';
import { ATIVOS } from './estados.mjs';
import { orcamentoDe, SemOrcamento, ORCAMENTO_SUBPEDIDOS } from '../_orcamento.mjs';
import { confirmarEntradas, emailPermitido } from './confirmacao.mjs';
import { criarDesistencia } from './desistencia.mjs';

/* fins SEM dinheiro: só depois deles uma nova tentativa pode começar (aprovada, duplicada, estornada etc. mostram o estado) */
const LIVRES = new Set(['recusada', 'cancelada', 'expirada']);

export class ErroPagamento extends Error {
  constructor(status, mensagem, extra) { super(mensagem); this.status = status; this.extra = extra; }
}

const AGUARDE = 'Estamos confirmando com o Mercado Pago. Não pague de novo: esta tela atualiza sozinha.';
const INDISPONIVEL = 'O pagamento online está indisponível agora. Tente em alguns minutos ou deixe um recado para a equipe.';
const CRIACAO_INCERTA_S = 90;          /* criação sem resposta: depois disso, procura a order pela referência */
const CRIACAO_ABANDONADA_S = 5 * 60;   /* e, sem achar em 5 min, dá a tentativa por cancelada */
const CONSULTA_MIN_S = 10;             /* a página pede atualização; o provedor é consultado no máximo a cada 10 s */
const BUSCA_FALHANDO_S = 30 * 60;      /* a busca pela referência falha há 30 min: encerra (uma aprovação tardia ainda é aplicada) */
const PARALELO = 5;                    /* consultas simultâneas na reconciliação */
const VARREDURA_DIAS = 0.5;            /* a janela da varredura: 12 h, 4× o intervalo do cron (3 h); o que passou disso a lista de tentativas já cobre */
const SEM_DINHEIRO = new Set(['canceled', 'expired', 'failed']);   /* (estados da listagem em que a order não tem dinheiro a conferir) */
const RESERVA_FINAL = 2;               /* subpedidos guardados para o fim da reconciliação (pagamentos_atencao e a ocorrência) */
const CONFIRMACOES_POR_VEZ = 5;        /* confirmações da entrada recuperadas por reconciliação (1 reserva + 1 envio cada) */
export const ORG = 'beyon-zero';

/* ---------- validação do que vem do navegador (nada aqui decide valor) ---------- */
const soDigitos = v => String(v || '').replace(/\D/g, '');
function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function cnpjValido(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = n => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
const NOME = /^[\p{L}][\p{L}' .-]{0,59}$/u;
export function validarPagador(p) {
  const nome = String(p?.nome || '').trim(), sobrenome = String(p?.sobrenome || '').trim(), email = String(p?.email || '').trim().toLowerCase();
  const documento = soDigitos(p?.documento);
  if (!NOME.test(nome)) return { erro: 'Informe o nome.' };
  if (!NOME.test(sobrenome)) return { erro: 'Informe o sobrenome.' };
  if (!emailPermitido(email)) return { erro: 'Informe um e-mail válido.' };   /* (lista permitida, a mesma do envio e do banco: confirmacao.mjs) */
  if (documento.length === 11 ? !cpfValido(documento) : documento.length === 14 ? !cnpjValido(documento) : true) return { erro: 'CPF ou CNPJ inválido.' };
  return { dados: { nome, sobrenome, email, documento, documentoTipo: documento.length === 11 ? 'CPF' : 'CNPJ' } };
}
export function validarCartao(c) {
  const token = String(c?.token || ''), meio = String(c?.meio || ''), tipo = String(c?.tipo || ''), parcelas = Number(c?.parcelas);
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return { erro: 'Os dados do cartão não foram validados. Tente de novo.' };
  if (!/^[a-z_]{2,30}$/.test(meio)) return { erro: 'Bandeira do cartão não reconhecida.' };
  if (!['credit_card', 'debit_card'].includes(tipo)) return { erro: 'Tipo de cartão inválido.' };
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12 || (tipo === 'debit_card' && parcelas !== 1)) return { erro: 'Número de parcelas inválido.' };
  return { dados: { token, meio, tipo, parcelas } };
}

/* os freios do banco viram mensagens que a pessoa entende */
const PIX_MINUTOS = 30;   /* (igual a cfg.pixExpiracao = PT30M; curto de propósito: Pix agendado para depois não passa da validade do QR) */
function traduzirLimite(e) {
  const m = String(e && e.message || '');
  if (e && e.codigo === '23514' && /cartão pausado/.test(m)) throw new ErroPagamento(503, 'O pagamento com cartão está pausado por segurança. Use o Pix ou deixe um recado para a equipe.', { recado: true });
  if (e && e.codigo === '23514' && /tentativas esgotadas/.test(m)) throw new ErroPagamento(429, 'Foram muitas tentativas de pagamento. Deixe um recado para a equipe para concluir.', { recado: true });
  if (e && e.codigo === '55P03') throw new ErroPagamento(429, 'Espere alguns segundos antes de tentar de novo.');
  /* a entrega bloqueada (entrada estornada, contestada ou projeto pausado): o banco recusa cobrar o restante; a pessoa lê uma frase humana, sem a palavra do sistema; o dono já foi avisado */
  if (e && e.codigo === '55000' && /bloqueada/.test(m)) throw new ErroPagamento(409, 'Estamos conferindo o seu pagamento. A Beyon Zero fala com você antes de seguir.', { recado: true });
  if (e && e.codigo === '55000' && /verificação/.test(m)) throw new ErroPagamento(409, 'Seu pagamento está em verificação. A Beyon Zero fala com você em breve.', { recado: true });
  /* (PR 3b-1) proposta sem o percentual da entrada: o banco não cobra (falha fechada); a pessoa fala com a Beyon Zero */
  if (e && e.codigo === '23514' && /sem percentual de entrada/.test(m)) throw new ErroPagamento(409, 'Este pedido está sem o valor da entrada. Deixe um recado para a equipe.', { recado: true });
  throw e;
}

/* o miolo que fala com o banco e com o provedor (aplicar o retrato de uma order, atualizar uma tentativa). É função própria
   para a reconciliação criar, a CADA execução, um núcleo com banco e provedor CONTADOS (orçamento de subpedidos da
   Cloudflare, api/_orcamento.mjs); o serviço normal usa um núcleo com o banco e o provedor sem contagem.
   `confirmacao` (api/_pagamentos/confirmacao.mjs): com ela, a entrada aprovada AGORA (aplicado = 'aprovada', o banco diz isso
   uma vez só) recebe o e-mail logo depois de gravada; o núcleo contado da reconciliação vai sem ela e confirma pela varredura.
   `avisar` (19/11; api/_aviso.mjs, avisarDonoPagamento): o banco devolve `alerta` ({ codigo, evento, parcela }) quando um estorno, estorno parcial ou
   contestação bloqueou a entrega, ou quando o restante caiu; o dono é avisado NA HORA, pelo aviso do provedor ou pela reconciliação. O aviso nunca
   derruba o pagamento (ele já está gravado): falhou ou lançou, só vai para o log; a rotina diária continua contando (pagamentos_atencao) */
function criarNucleo({ banco, mp, cfg, agora, confirmacao = null, avisar = null }) {
  const PROV = mp.nome;
  const idade = iso => (agora() - new Date(iso).getTime()) / 1000;
  const ocorrencia = (evento, tentativa_id, provedor_ref, detalhe, origem) =>
    banco('pagamentos_registrar_ocorrencia', { evento, tentativa_id, provedor: PROV, provedor_ref, origem, detalhe }).catch(e => { if (e instanceof SemOrcamento) throw e; console.error('[pagamentos] auditoria falhou:', e && e.codigo); });
  const erroDoProvedor = (e, tentativa_id, ref, origem) => ocorrencia('payment.provider_error', tentativa_id, ref, { tipo: e.tipo, status: e.status, codigo: e.codigo }, origem);

  /* aplica o retrato de uma order (a única porta para mudar o estado financeiro) */
  async function aplicar(order, origem, request_id, extra) {
    const retrato = retratoDe(order, extra);
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(retrato.order_id || '')) {
      await ocorrencia('payment.divergence', null, null, { motivo: 'order sem id válido' }, origem);
      return { ignorado: 'order sem id' };
    }
    const r = await banco('pagamentos_aplicar', { provedor: PROV, origem, request_id: request_id || null, conta_esperada: cfg.contaEsperada, org_slug: ORG, retrato });
    /* o pagamento já está gravado (outra transação): o e-mail nunca o desfaz; erro do e-mail só vai para o log */
    if (confirmacao && r && r.aplicado === 'aprovada') await confirmarEntradas({ banco, confirmacao, provedor: PROV, filtro: { provedor_order_id: retrato.order_id } });
    if (r && r.alerta) await avisarDono(r.alerta);
    if (r && Array.isArray(r.cancelar_restante)) await cancelarPixDoRestante(r.cancelar_restante);
    return r;
  }

  /* (S2, revisão de segurança) a entrada foi estornada, estornada em parte ou contestada: o Pix do restante que ainda estava aberto não pode ser pago (nada vai ao ar). O banco
     lista as orders; aqui se cancela no provedor, com a chave de idempotência da tentativa. Melhor esforço: o pagamento já está gravado, então uma falha só vai para o log e
     para a trilha, nunca o desfaz (a tela já esconde o QR e o Pix expira sozinho). Só o orçamento de subpedidos esgotado sobe, como em todo o serviço. */
  async function cancelarPixDoRestante(lista) {
    for (const o of lista.slice(0, 3)) {
      if (!o || !/^[A-Za-z0-9_-]{4,64}$/.test(o.order || '') || !/^[0-9a-f-]{36}$/.test(o.tentativa_id || '')) continue;
      try {
        if (typeof mp.cancelarOrdem !== 'function') throw new Error('provedor sem cancelamento');
        await aplicar(await mp.cancelarOrdem(o.order, 'cx-' + o.tentativa_id), 'consulta');
      } catch (e) {
        if (e instanceof SemOrcamento) throw e;
        if (e instanceof ErroProvedor) await erroDoProvedor(e, o.tentativa_id, o.order, 'consulta');
        console.error('[pagamentos] o Pix do restante não foi cancelado no provedor:', (e && (e.codigo || e.tipo)) || 'erro');
        /* conflito = a order mudou agora mesmo (talvez paga): reconsulta e aplica, como resolverAtiva; o banco decide (paga com a entrega bloqueada = rastro e aviso) */
        if (e instanceof ErroProvedor && e.tipo === 'conflito') {
          try { await aplicar(await mp.consultarOrdem(o.order), 'consulta'); }
          catch (e2) { if (e2 instanceof SemOrcamento) throw e2; console.error('[pagamentos] a reconsulta do Pix do restante falhou:', (e2 && (e2.codigo || e2.tipo)) || 'erro'); }
        }
      }
    }
  }

  /* o aviso ao dono (estorno, contestação, restante pago): sem dado pessoal no log, só o evento */
  async function avisarDono(alerta) {
    if (typeof avisar !== 'function') return;
    try { if (!(await avisar(alerta))) console.error('[pagamentos] o aviso ao dono não saiu:', alerta.evento); }
    catch (e) { console.error('[pagamentos] o aviso ao dono falhou:', alerta.evento, (e && e.codigo) || 'erro'); }
  }

  /* traz uma tentativa ativa para o estado real do provedor. Erro do provedor: não muda nada */
  async function atualizar(t, origem) {
    try {
      if (t.provedor_order_id) return await aplicar(await mp.consultarOrdem(t.provedor_order_id), origem);
      const anos = idade(t.criada_em);
      if (anos < CRIACAO_INCERTA_S) return { aguardando_criacao: true };
      const desde = new Date(t.criada_em).getTime() - 10 * 60e3, ate = agora() + 10 * 60e3;
      const achadas = await mp.buscarPorReferencia(t.tentativa_id, desde, ate);
      if (achadas.length === 1) {
        await banco('pagamentos_vincular', { tentativa_id: t.tentativa_id, provedor_order_id: achadas[0].id });
        return await aplicar(await mp.consultarOrdem(achadas[0].id), origem);
      }
      if (achadas.length > 1) { await ocorrencia('payment.divergence', t.tentativa_id, null, { motivo: 'mais de uma order para a mesma tentativa' }, origem); return { divergencia: true }; }
      if (anos > CRIACAO_ABANDONADA_S) return await banco('pagamentos_encerrar_tentativa', { tentativa_id: t.tentativa_id, status: 'cancelada', motivo: 'criação sem order no provedor', origem });
      return { aguardando_criacao: true };
    } catch (e) {
      if (!(e instanceof ErroProvedor)) throw e;
      await erroDoProvedor(e, t.tentativa_id, t.provedor_order_id, origem);
      /* sem order e a busca falhando há muito tempo: encerra para não travar o visitante (aprovação tardia ainda é aplicada) */
      if (!t.provedor_order_id && idade(t.criada_em) > BUSCA_FALHANDO_S) {
        return await banco('pagamentos_encerrar_tentativa', { tentativa_id: t.tentativa_id, status: 'cancelada', motivo: 'criação sem order; busca indisponível', origem });
      }
      return { erro_provedor: e.tipo };
    }
  }

  return { PROV, idade, ocorrencia, erroDoProvedor, aplicar, atualizar, avisarDono, cancelarPixDoRestante };
}

export function criarServicoPagamentos({ banco, cfg, provedor, agora = () => Date.now(), confirmacao = null, avisar = null }) {
  if (!cfg || !cfg.ativo) throw new Error('pagamentos desligados');
  const mp = provedor || criarMercadoPago({ token: cfg.token, base: cfg.base, fetch: cfg.fetch || globalThis.fetch });
  const nucleo = criarNucleo({ banco, mp, cfg, agora, confirmacao, avisar });
  const { PROV, idade, ocorrencia, erroDoProvedor, aplicar, atualizar } = nucleo;
  const desistir = criarDesistencia({ banco, mp, cfg, nucleo });

  /* decide o que fazer com a tentativa ativa antes de começar outra */
  async function resolverAtiva(ctx, t, metodoNovo) {
    const tent = await banco('pagamentos_tentativa', { ...ctx, tentativa_id: t.tentativa_id });
    const r = await atualizar(tent, 'consulta');
    if (r && r.erro_provedor) throw new ErroPagamento(503, AGUARDE, { aguarde: true });
    if (r && r.aguardando_criacao) throw new ErroPagamento(409, AGUARDE, { aguarde: true });
    const agoraT = await banco('pagamentos_tentativa', { ...ctx, tentativa_id: t.tentativa_id });
    if (!ATIVOS.has(agoraT.status)) return { liberada: LIVRES.has(agoraT.status) };
    /* Pix aguardando e a pessoa quer Pix: o mesmo QR. Quer cartão: cancela o Pix ANTES (senão pode pagar os dois) */
    if (agoraT.status === 'aguardando' && agoraT.metodo === 'pix') {
      if (metodoNovo === 'pix') return { liberada: false };
      try {
        const cancelada = await mp.cancelarOrdem(agoraT.provedor_order_id, 'cx-' + agoraT.tentativa_id);
        await aplicar(cancelada, 'consulta');
      } catch (e) {
        if (!(e instanceof ErroProvedor)) throw e;
        await erroDoProvedor(e, agoraT.tentativa_id, agoraT.provedor_order_id, 'consulta');
        if (e.tipo === 'conflito') await atualizar(agoraT, 'consulta');   /* talvez tenha sido pago agora mesmo */
      }
      const depois = await banco('pagamentos_tentativa', { ...ctx, tentativa_id: t.tentativa_id });
      if (!ATIVOS.has(depois.status)) return { liberada: LIVRES.has(depois.status) };
      throw new ErroPagamento(409, 'Não consegui cancelar o Pix gerado antes. Pague por ele ou tente o cartão em alguns minutos.');
    }
    /* em análise ou esperando o banco (3DS): nunca abrir outra cobrança em paralelo */
    return { liberada: false };
  }

  function pagadorParaProvedor(pagador, metodo) {
    if (cfg.ambiente === 'producao') return pagador;
    /* teste e simulado: o MP só aceita o e-mail de teste; o Pix de teste pede o nome APRO (documentação oficial) */
    return { ...pagador, email: 'test@testuser.com', ...(metodo === 'pix' ? { nome: 'APRO' } : {}) };
  }

  return {
    nome: PROV,
    metodos: cfg.metodos || ['pix'],   /* (o consultor só cita as formas que existem: api/_vendas/consultor.mjs) */

    /* começa (ou retoma) o pagamento do sinal. O valor vem da proposta aceita, no banco */
    async iniciar({ conversa_id, visitante_id, metodo, pagador, cartao }) {
      if (!['pix', 'cartao'].includes(metodo)) throw new ErroPagamento(400, 'Escolha a forma de pagamento que aparece na tela.');
      if (!(cfg.metodos || ['pix']).includes(metodo)) throw new ErroPagamento(400, 'Esta forma de pagamento não está disponível.');
      const vp = validarPagador(pagador);
      if (vp.erro) throw new ErroPagamento(400, vp.erro);
      let vc = null;
      if (metodo === 'cartao') { vc = validarCartao(cartao); if (vc.erro) throw new ErroPagamento(400, vc.erro); }
      const ctx = { conversa_id, visitante_id };
      const iniciarNoBanco = () => banco('pagamentos_iniciar_tentativa', { ...ctx, metodo, provedor: PROV,
        max_tentativas: cfg.maxTentativasCartao ?? 5, intervalo_s: cfg.intervaloAposRecusaS ?? 20, max_recusas_hora: cfg.maxRecusasHora ?? 20 }).catch(traduzirLimite);
      let t = await iniciarNoBanco();
      if (t.ativa) {
        const decisao = await resolverAtiva(ctx, t, metodo);
        if (!decisao.liberada) return this.estado(ctx);
        t = await iniciarNoBanco();
        if (t.ativa) throw new ErroPagamento(409, AGUARDE, { aguarde: true });
      }
      /* o e-mail de quem paga fica na tentativa só para a confirmação da entrada (o provedor não o devolve depois). Falhar aqui não impede pagar */
      await banco('pagamentos_guardar_pagador', { tentativa_id: t.tentativa_id, email: vp.dados.email })
        .catch(e => console.error('[pagamentos] o e-mail de quem paga não foi guardado:', (e && e.codigo) || 'erro'));
      const pixExpiraEm = metodo === 'pix' ? new Date(agora() + PIX_MINUTOS * 60e3).toISOString() : null;
      let criada;
      try {
        criada = await mp.criarOrdem({ chave: t.chave_idempotencia, referencia: t.external_reference, valor: t.valor, pagador: pagadorParaProvedor(vp.dados, metodo),
          metodo, cartao: vc && vc.dados, pixExpiracao: cfg.pixExpiracao, tresDS: cfg.tresDS });
      } catch (e) {
        if (!(e instanceof ErroProvedor)) throw e;
        await erroDoProvedor(e, t.tentativa_id, null, 'criacao');
        /* o provedor RECUSOU o pedido (nada foi criado): libera a vaga para outra tentativa */
        if (e.tipo === 'invalido' || e.tipo === 'credencial' || e.tipo === 'limite') {
          await banco('pagamentos_encerrar_tentativa', { tentativa_id: t.tentativa_id, status: e.tipo === 'invalido' ? 'recusada' : 'cancelada', motivo: (e.codigo || e.tipo).slice(0, 60), origem: 'criacao' });
          if (e.tipo === 'invalido') throw new ErroPagamento(422, 'O Mercado Pago não aceitou estes dados. Confira e tente de novo.');
          if (e.tipo === 'credencial') console.error('[pagamentos] credencial recusada pelo provedor');
          throw new ErroPagamento(503, INDISPONIVEL, { recado: true });
        }
        /* tempo, rede, provedor fora, conflito: NÃO SE SABE se a order existe. A tentativa fica; a consulta e a reconciliação resolvem */
        throw new ErroPagamento(503, AGUARDE, { aguarde: true });
      }
      if (!criada.order || !/^[A-Za-z0-9_-]{4,64}$/.test(String(criada.order.id || ''))) {
        await ocorrencia('payment.divergence', t.tentativa_id, null, { motivo: 'criação sem id de order' }, 'criacao');
        throw new ErroPagamento(503, AGUARDE, { aguarde: true });
      }
      await banco('pagamentos_vincular', { tentativa_id: t.tentativa_id, provedor_order_id: String(criada.order.id) });
      await aplicar(criada.order, 'criacao', null, { pixExpiraEm });
      return this.estado(ctx);
    },

    /* o estado para a página; se houver tentativa ativa e a última consulta for velha, consulta o provedor antes */
    async estado(ctx, { atualizarProvedor = false } = {}) {
      let e = await banco('pagamentos_estado', ctx);
      const t = e.tentativa;
      if (atualizarProvedor && t && ATIVOS.has(t.status) && (!t.consultada_em || idade(t.consultada_em) >= CONSULTA_MIN_S)) {
        const tent = await banco('pagamentos_tentativa', { ...ctx, tentativa_id: t.id });
        await atualizar(tent, 'consulta');
        e = await banco('pagamentos_estado', ctx);
      }
      return e;
    },

    /* o aviso do provedor: SÓ um sinal. A verdade vem da consulta */
    async processarAviso({ orderId, requestId }) {
      let order;
      try { order = await mp.consultarOrdem(orderId); }
      catch (e) {
        if (!(e instanceof ErroProvedor)) throw e;
        await erroDoProvedor(e, null, orderId, 'webhook');
        if (e.tipo === 'nao_encontrado' || e.tipo === 'invalido') return { ignorado: 'order não encontrada nesta conta' };
        throw e;   /* tempo, rede, provedor fora: 5xx para o provedor reenviar */
      }
      return aplicar(order, 'webhook', requestId);
    },

    /* reconciliação: confere no provedor o que está aberto e o que foi pago há pouco (estorno/contestação),
       e varre as orders recentes da conta atrás de pagamento que o banco não conhece.
       ORÇAMENTO (Cloudflare grátis: 50 subpedidos por invocação): cada chamada ao banco e ao provedor é contada POR
       EXECUÇÃO e a rotina para em `orcamento` (45, menos 2 guardados para o fim). O que não coube fica para o próximo
       cron (3 em 3 h): a lista vem na ordem da migration (order by coalesce(consultada_em, created_at): as conferidas há
       mais tempo primeiro, então o que ficou de fora passa à frente na vez seguinte). Resumo: `parcial` e `subpedidos` */
    async reconciliar({ limite = 15, varrerDias = VARREDURA_DIAS, varrerPaginas = 1, orcamento = ORCAMENTO_SUBPEDIDOS } = {}) {
      const resumo = { conferidas: 0, aplicadas: 0, erros: 0, desconhecidas: 0, parcial: false, subpedidos: 0, confirmacoes: 0 };
      const gasto = orcamentoDe(orcamento, RESERVA_FINAL);
      const bancoContado = gasto.contar(banco);
      const mpContado = { ...mp, consultarOrdem: gasto.contar(mp.consultarOrdem), buscarRecentes: gasto.contar(mp.buscarRecentes),
        buscarPorReferencia: gasto.contar(mp.buscarPorReferencia),
        /* (S2, re-revisão) o cancelamento do Pix do restante também é uma ida ao provedor: gasta o orçamento de subpedidos da execução */
        cancelarOrdem: typeof mp.cancelarOrdem === 'function' ? gasto.contar(mp.cancelarOrdem) : undefined };
      const nucleo = criarNucleo({ banco: bancoContado, mp: mpContado, cfg, agora, avisar });   /* (o estorno achado aqui, com o aviso do provedor perdido, também avisa na hora) */
      let parou = false, paginaCheia = false;
      const contar = r => { if (r && r.aplicado) resumo.aplicadas++; if (r && r.ignorado === 'order desconhecida') resumo.desconhecidas++; if (r && r.erro_provedor) resumo.erros++; };
      /* um item com erro (banco, provedor, dado ruim) não derruba os outros; o fim do orçamento NÃO é erro: o laço para */
      const umPorVez = async (lista, fazer) => {
        let i = 0;
        await Promise.all(Array.from({ length: Math.min(PARALELO, lista.length) }, async () => {
          while (i < lista.length && !parou) {
            const item = lista[i++];
            try { contar(await fazer(item)); }
            catch (e) {
              if (e instanceof SemOrcamento) { parou = true; return; }
              resumo.erros++; console.error('[pagamentos] reconciliação, item:', e instanceof ErroProvedor ? 'provedor ' + e.tipo : (e && e.codigo) || 'erro');
            }
          }
        }));
      };
      const lista = await bancoContado('pagamentos_para_reconciliar', { provedor: PROV, limite, idade_min_s: 120 });
      resumo.conferidas = lista.length;
      await umPorVez(lista, t => nucleo.atualizar(t, 'reconciliacao'));
      /* as confirmações da entrada que ficaram para trás (aprovada por aqui, aviso que caiu antes do envio, chave que faltava):
         só com folga para a reserva e para cada envio; o que não couber fica para a próxima (a reserva é do banco, uma vez só) */
      const folga = Math.min(CONFIRMACOES_POR_VEZ, gasto.restantes() - 1);
      if (!parou && confirmacao && confirmacao.ligada && folga >= 1) {
        try { resumo.confirmacoes = (await confirmarEntradas({ banco: bancoContado, confirmacao: confirmacao.contada(gasto.contar), provedor: PROV, filtro: { limite: folga } })).enviadas; }
        catch (e) { if (e instanceof SemOrcamento) parou = true; else throw e; }
      }
      /* (20/11) as desistências de cliente que ficaram pela metade (queda entre o estorno e o encerramento, resposta que não voltou): só se ACABA o que já aconteceu, nunca se estorna sozinho */
      if (!parou && gasto.restantes() >= 12) {
        try { const n = await criarDesistencia({ banco: bancoContado, mp: mpContado, cfg, nucleo }).concluirPendentes(); if (n > 0) resumo.desistencias = n; }
        catch (e) { if (e instanceof SemOrcamento) parou = true; else { resumo.erros++; console.error('[pagamentos] desistências pendentes:', (e && (e.codigo || e.tipo)) || 'erro'); } }
      }
      if (varrerDias > 0 && !parou) {
        const desde = agora() - varrerDias * 86400e3;
        for (let pagina = 1; pagina <= varrerPaginas && !parou; pagina++) {
          let orders;
          try { orders = await mpContado.buscarRecentes(desde, agora(), pagina); }
          catch (e) {
            if (e instanceof SemOrcamento) { parou = true; break; }
            if (!(e instanceof ErroProvedor)) throw e;
            resumo.erros++;
            try { await nucleo.erroDoProvedor(e, null, null, 'reconciliacao'); }
            catch (e2) { if (e2 instanceof SemOrcamento) parou = true; else throw e2; }   /* (acabou ao gravar o erro: para, não cai) */
            break;
          }
          /* a listagem pode vir resumida: cada order é consultada inteira antes de aplicar */
          /* (order cancelada, expirada ou que falhou não tem dinheiro: não gasta subpedido) */
          await umPorVez(orders.filter(o => o && /^[A-Za-z0-9_-]{4,64}$/.test(String(o.id || '')) && !SEM_DINHEIRO.has(o.status)), async o => nucleo.aplicar(await mpContado.consultarOrdem(String(o.id)), 'reconciliacao'));
          if (orders.length < 50) break;
          if (pagina === varrerPaginas) paginaCheia = true;   /* (a última página permitida veio cheia: há mais orders do que a janela olhou) */
        }
      }
      /* o fim (a contagem de ocorrências a olhar e o registro da própria reconciliação) usa a reserva */
      const bancoFinal = gasto.contarReservado(banco);
      try { resumo.atencao = (await bancoFinal('pagamentos_atencao', { horas: 25 })).total; } catch { resumo.atencao = null; }
      resumo.parcial = parou || paginaCheia;
      resumo.subpedidos = gasto.gastos() + 1;   /* (+1: a ocorrência logo abaixo) */
      if (resumo.parcial) console.warn(JSON.stringify({ origem: 'pagamentos', nivel: 'aviso', evento: 'reconciliação parcial', subpedidos: resumo.subpedidos }));
      if (resumo.atencao) console.error('[pagamentos] ATENÇÃO: ' + resumo.atencao + ' ocorrência(s) financeira(s) pedem uma pessoa (app.pagamentos_auditoria; ver 01-ARQUITETURA-E-OPERACAO §7)');
      await criarNucleo({ banco: bancoFinal, mp, cfg, agora }).ocorrencia('payment.reconciled', null, null, resumo, 'reconciliacao');
      return resumo;
    },

    /* a desistência do cliente dentro dos 7 dias (api/_pagamentos/desistencia.mjs): só pela sessão dele, com a decisão no banco */
    desistir,

    /* reembolso (operação da equipe; não há rota pública). A chave de idempotência é fixa por order:
       dois pedidos de reembolso da mesma order nunca devolvem duas vezes */
    async reembolsar({ orderId }) {
      /* só order de uma tentativa NOSSA (nunca qualquer order da conta), e só a que tem dinheiro */
      const t = await banco('pagamentos_tentativa', { provedor: PROV, provedor_order_id: String(orderId || '') });
      if (!['aprovada', 'duplicada', 'estornada_parcial', 'contestada'].includes(t.status)) throw new ErroPagamento(409, 'Esta order não tem pagamento a reembolsar.');
      let conflito = null;
      try { await mp.reembolsarOrdem(orderId, 'rf-' + orderId); }
      catch (e) { if (!(e instanceof ErroProvedor)) throw e; await erroDoProvedor(e, t.tentativa_id, orderId, 'operacao'); if (e.tipo !== 'conflito') throw e; conflito = e.codigo; }
      const r = await aplicar(await mp.consultarOrdem(orderId), 'operacao');
      return conflito ? { ...r, conflito } : r;   /* (409 do MP: já reembolsado ou em reembolso; o estado consultado diz qual) */
    }
  };
}
