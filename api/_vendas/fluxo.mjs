/* ==========================================================================
   O FLUXO DE VENDAS — as ações da API /api/vendas (Fase 2, etapa 2).
   Cada ação: confere o visitante pelo token → valida a entrada (lista
   fechada) → aplica os tetos (taxa, turnos, custo) → chama a lógica de
   negócio e a IA → grava pelo banco (app.vendas_*, uma transação por passo).
   As dependências entram por parâmetro (banco, ia, visitantes, pagamentos): os
   testes trocam por dublês sem tocar no fluxo.
   Falha de IA: nada é inventado; a resposta é a recuperação elegante pedida
   na especificação, e o que a pessoa já contou continua no banco.
   ========================================================================== */
import { executarTurno } from './agente.mjs';
import { estimar } from './precos.mjs';
import { gerarDirecao } from './gerador.mjs';
import { interpretar, aplicar, fatoresComEscopo } from './alteracoes.mjs';
import { montarEscopo } from './escopo.mjs';
import { limparMensagem, pareceInjecao, redigir } from './seguranca.mjs';
import { ehUuid, normalizarTelefone } from '../_valida-app.mjs';
import { TETOS } from '../_ia/config.mjs';
import { ErroIA } from '../_ia/provedor.mjs';
import { ErroBanco } from './transporte.mjs';
import { ErroPagamento } from '../_pagamentos/servico.mjs';

export const ORG = 'beyon-zero';
export const RECUPERACAO = 'Não consegui concluir a análise neste momento. Suas informações foram preservadas. Vamos continuar de onde paramos.';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ORIGENS = ['anuncio', 'busca', 'social', 'mensagem', 'email', 'referencia', 'direto'];
/* etapas em que a conversa com o agente ainda vale (depois disso, o fluxo segue pelos blocos da página) */
const CONVERSA_ABERTA = ['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes'];

/* respostas de erro: o que o visitante vê (sem detalhe interno) */
export class Recusa extends Error {
  constructor(status, mensagem, extra) { super(mensagem); this.status = status; this.extra = extra; }
}
export function traduzirErro(e) {
  if (e instanceof Recusa) return e;
  if (e instanceof ErroPagamento) return new Recusa(e.status, e.message, e.extra);
  if (e instanceof ErroIA) return new Recusa(503, RECUPERACAO, { recuperavel: true });
  if (e instanceof ErroBanco) {
    if (e.codigo === 'P0002') return new Recusa(404, 'Não encontrado.');
    if (e.codigo === '55000') return new Recusa(409, 'Esta etapa ainda não está disponível.');
    if (e.codigo === '23514') return new Recusa(409, 'Limite atingido para esta conversa.');
    if (e.codigo === '22023') return new Recusa(400, 'Dados inválidos.');
    if (e.codigo === '55P03') return new Recusa(409, 'Ainda estou respondendo à mensagem anterior. Um instante.');
    if (e.codigo === '40001') return new Recusa(409, 'O investimento mudou enquanto o escopo era montado. Tente de novo.');
  }
  return null;
}

const exigir = (cond, status, msg) => { if (!cond) throw new Recusa(status, msg); };
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/* as regras comerciais ATIVAS (sem elas não há estimativa: nada de preço inventado) */
async function regrasAtivas(banco) {
  const r = await banco('vendas_regras_ativas', { org_slug: ORG });
  return r && r.regras ? r : null;
}

export function criarFluxo({ banco, ia, visitantes, pagamentos }) {
  async function visitante(request) {
    const id = await visitantes.quem(request);
    exigir(id, 401, 'Sessão inválida ou expirada.');
    return id;
  }
  async function estado(vid, conversa_id) {
    return banco('vendas_estado', { conversa_id, visitante_id: vid });
  }
  async function dentroDoCusto(est) {
    if (Number(est.conversa.custo_ia_usd) >= TETOS.conversa_usd) throw new Recusa(429, 'Chegamos ao limite desta conversa por aqui. Continue com a Beyon Zero pelo WhatsApp: o seu briefing já está salvo.', { whatsapp: true });
    const dia = await banco('vendas_custo_dia', { org_slug: ORG });
    if (Number(dia.custo_usd) >= TETOS.dia_usd) throw new Recusa(503, 'O consultor está com muita procura agora. Seu briefing está salvo; tente de novo mais tarde ou fale pelo WhatsApp.', { whatsapp: true });
  }

  /* um turno com a trava da IA já reservada. O que se GRAVA é o texto redigido (sem telefone, e-mail,
     documento ou cartão), o mesmo que o modelo recebe */
  async function turno(vid, conversaId, est, regras, msg) {
    let r;
    try {
      r = await executarTurno({ ia, regras: regras.regras, conversa: { etapa: est.conversa.etapa, briefing: est.conversa.briefing, mensagens: est.mensagens, estimativa: est.estimativa }, mensagem: msg });
    } catch (e) {
      if (e instanceof ErroIA) await banco('vendas_registrar_evento', { conversa_id: conversaId, visitante_id: vid, tipo: 'ia_falhou', dados: { motivo: e.motivo } }).catch(() => {});
      throw e;
    }
    await banco('vendas_registrar_turno', { conversa_id: conversaId, visitante_id: vid, mensagem_visitante: redigir(msg), mensagem_agente: r.resposta, briefing: r.briefing, confianca: r.confianca, custo_usd: r.custo_usd });
    let estimativa = null;
    if (r.estimativa) {
      await banco('vendas_registrar_estimativa', { conversa_id: conversaId, visitante_id: vid, regras_id: regras.id, fatores: r.estimativa.fatores,
        valor_total: r.estimativa.valor_total, sinal: r.estimativa.sinal, prazo_dias: r.estimativa.prazo_dias, fase: r.estimativa.fase, detalhes: r.estimativa });
      estimativa = cartao(r.estimativa);
    }
    return { resposta: r.resposta, estimativa, pedir_contato: r.pedir_contato, diagnostico: r.diagnostico, sugestoes_ia: r.sugestoes_ia, confianca: r.confianca };
  }

  return {
    /* começar: cria o visitante anônimo e a conversa, com a origem da visita (das métricas, sem dado pessoal) */
    async sessao({ corpo }) {
      const s = await visitantes.criar();
      exigir(s, 503, 'Serviço indisponível. Tente de novo em instantes.');
      const o = corpo && typeof corpo === 'object' ? corpo : {};
      const c = await banco('vendas_iniciar', {
        org_slug: ORG, visitante_id: s.visitante_id,
        origem_meio: ORIGENS.includes(o.meio) ? o.meio : 'direto', origem_fonte: texto(o.fonte, 40).toLowerCase(),
        campanha: texto(o.campanha, 80), termo: texto(o.termo, 80),
        codigo_visita: /^[ACDEFGHJKMNPQRTUVWXY34679]{5}$/.test(o.codigo || '') ? o.codigo : null
      });
      return { token: s.token, refresh: s.refresh, expira_em: s.expira_em, conversa_id: c.conversa_id };
    },

    async renovar({ corpo }) {
      const s = await visitantes.renovar(corpo && corpo.refresh);
      exigir(s, 401, 'Sessão expirada.');
      return { token: s.token, refresh: s.refresh, expira_em: s.expira_em };
    },

    async estado({ request, query }) {
      const vid = await visitante(request);
      exigir(ehUuid(query.get('conversa')), 400, 'Conversa inválida.');
      const e = await estado(vid, query.get('conversa'));
      delete e.conversa.custo_ia_usd;   /* (métrica interna) */
      return e;
    },

    /* um turno de conversa com o agente */
    async mensagem({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const msg = limparMensagem(corpo?.texto);
      exigir(msg, 400, 'Escreva uma mensagem de até 2.000 caracteres.');
      const est = await estado(vid, corpo.conversa_id);
      exigir(CONVERSA_ABERTA.includes(est.conversa.etapa), 409, 'Agora o seu orçamento segue pelas etapas abaixo da conversa.');
      exigir(est.conversa.turnos < TETOS.turnos_por_conversa, 429, 'Esta conversa ficou longa. Continue pelo WhatsApp: seu briefing já está salvo.');
      await dentroDoCusto(est);
      const regras = await regrasAtivas(banco);
      exigir(regras, 503, 'A tabela de valores está em atualização. Seu briefing está salvo; fale com a Beyon Zero pelo WhatsApp.');
      if (pareceInjecao(msg)) await banco('vendas_registrar_evento', { conversa_id: corpo.conversa_id, visitante_id: vid, tipo: 'tentativa_bloqueada' }).catch(() => {});
      await banco('vendas_reservar_ia', { conversa_id: corpo.conversa_id, visitante_id: vid, max_turnos: TETOS.turnos_por_conversa, teto_usd: TETOS.conversa_usd });
      try {
        return await turno(vid, corpo.conversa_id, est, regras, msg);
      } finally {
        await banco('vendas_liberar_ia', { conversa_id: corpo.conversa_id, visitante_id: vid }).catch(() => {});
      }
    },

    /* o contato (nome + WhatsApp ou e-mail): vira lead e libera as direções */
    async contato({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const nome = texto(corpo?.nome, 120);
      const email = typeof corpo?.email === 'string' && corpo.email.trim() ? corpo.email.trim().toLowerCase() : null;
      const telefone = typeof corpo?.telefone === 'string' && corpo.telefone.trim() ? normalizarTelefone(corpo.telefone) : null;
      exigir(nome.length >= 2, 400, 'Informe seu nome.');
      exigir(!email || (email.length <= 254 && EMAIL.test(email)), 400, 'E-mail inválido.');
      exigir(corpo?.telefone ? telefone : true, 400, 'WhatsApp inválido.');
      exigir(email || telefone, 400, 'Informe WhatsApp ou e-mail.');
      exigir(corpo?.aceite === true, 400, 'É preciso concordar com o uso dos dados para receber as propostas.');
      await banco('vendas_informar_contato', { conversa_id: corpo.conversa_id, visitante_id: vid, nome, email, telefone, aceite: true });   /* (o banco guarda quando) */
      return { ok: true };
    },

    /* pedir as 3 direções (devolve os ids; o navegador pede cada uma em paralelo) */
    async gerar({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      await dentroDoCusto(await estado(vid, corpo.conversa_id));
      return banco('vendas_iniciar_geracao', { conversa_id: corpo.conversa_id, visitante_id: vid, max_geracoes: TETOS.geracoes_por_conversa });
    },

    /* gerar UMA direção (cabe nos 300 s da função) */
    async gerarDirecao({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id) && ehUuid(corpo?.direcao_id), 400, 'Dados inválidos.');
      await dentroDoCusto(await estado(vid, corpo.conversa_id));   /* (o Opus é a chamada mais cara: confere antes) */
      const p = await banco('vendas_reivindicar_direcao', { conversa_id: corpo.conversa_id, visitante_id: vid, direcao_id: corpo.direcao_id });
      if (!p.reivindicada) return { status: p.status };
      try {
        const g = await gerarDirecao({ ia, briefing: p.briefing, estrategia: p.estrategia, numero: p.numero, fatores: p.fatores });
        await banco('vendas_concluir_direcao', { direcao_id: p.direcao_id, conteudo: g.direcao, modelo: g.modelo });
        await banco('vendas_somar_custo', { conversa_id: corpo.conversa_id, visitante_id: vid, custo_usd: g.custo_usd }).catch(() => {});
        return { status: 'pronta' };
      } catch (e) {
        const motivo = e instanceof ErroIA ? e.motivo : 'falha';
        await banco('vendas_concluir_direcao', { direcao_id: p.direcao_id, erro: 'não foi possível gerar (' + motivo + ')' });
        if (e instanceof ErroIA) return { status: 'falhou', mensagem: RECUPERACAO };
        throw e;
      }
    },

    async escolher({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id) && ehUuid(corpo?.direcao_id), 400, 'Dados inválidos.');
      return banco('vendas_escolher', { conversa_id: corpo.conversa_id, visitante_id: vid, direcao_id: corpo.direcao_id });
    },

    /* alteração: o modelo traduz, o código aplica; escopo novo passa pelo motor de preço */
    async alterar({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const pedido = redigir(limparMensagem(corpo?.pedido));   /* (o modelo e o banco recebem o texto redigido) */
      exigir(pedido, 400, 'Descreva a alteração em até 2.000 caracteres.');
      const est = await estado(vid, corpo.conversa_id);
      await dentroDoCusto(est);
      exigir(est.escolha, 409, 'Escolha uma direção antes.');
      const direcoes = est.direcoes.filter(d => d.status === 'pronta');
      const escolhida = direcoes.find(d => d.id === est.escolha.direcao_id);
      exigir(escolhida, 409, 'Escolha uma direção antes.');
      const base = est.versao_final || escolhida.conteudo;
      await banco('vendas_reservar_ia', { conversa_id: corpo.conversa_id, visitante_id: vid, max_turnos: TETOS.turnos_por_conversa, teto_usd: TETOS.conversa_usd });
      let t;
      try { t = await interpretar({ ia, pedido, direcoes, escolhida: escolhida.numero }); }
      finally { await banco('vendas_liberar_ia', { conversa_id: corpo.conversa_id, visitante_id: vid }).catch(() => {}); }
      const a = aplicar({ base, mudancas: t.mudancas, direcoes });
      exigir(!a.erro, 422, 'Não consegui aplicar essa alteração. Pode descrever de outro jeito?');
      let estimativa = null;
      if (a.escopo.length) {
        const regras = await regrasAtivas(banco);
        exigir(regras, 503, 'A tabela de valores está em atualização.');
        const e = estimar(fatoresComEscopo(est.estimativa?.fatores, a.escopo), regras.regras);
        if (e.encaminhar_diagnostico) return { resposta: 'Esse pedido muda o projeto além do que a estimativa automática cobre. Vamos ver isso no diagnóstico pelo WhatsApp.', diagnostico: true, resultado: a.resultado };
        if (!e.erros) {
          await banco('vendas_registrar_estimativa', { conversa_id: corpo.conversa_id, visitante_id: vid, regras_id: regras.id, fatores: e.fatores, valor_total: e.valor_total, sinal: e.sinal, prazo_dias: e.prazo_dias, fase: e.fase, detalhes: e });
          estimativa = cartao(e);
        }
      }
      await banco('vendas_registrar_alteracao', { conversa_id: corpo.conversa_id, visitante_id: vid, pedido, mudancas: a.resultado, resultado: a.direcao });
      await banco('vendas_somar_custo', { conversa_id: corpo.conversa_id, visitante_id: vid, custo_usd: t.custo_usd }).catch(() => {});
      return { resposta: t.resposta, resultado: a.resultado.map(x => ({ operacao: x.operacao, aplicada: x.aplicada, motivo: x.motivo || null })), estimativa };
    },

    /* o escopo final (montado pelo código; o preço é o da última estimativa, conferido pelo banco) */
    async escopo({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const est = await estado(vid, corpo.conversa_id);
      exigir(est.escolha && est.estimativa, 409, 'Escolha uma direção antes.');
      const direcao = est.versao_final || est.direcoes.find(d => d.id === est.escolha.direcao_id)?.conteudo;
      exigir(direcao, 409, 'Escolha uma direção antes.');
      const aplicadas = est.alteracoes.filter(a => a.status === 'aplicada').flatMap(a => (a.mudancas || []).filter(m => m.aplicada));
      const { titulo, escopo } = montarEscopo({ estimativa: est.estimativa.detalhes, direcao, alteracoesAplicadas: aplicadas, briefing: est.conversa.briefing });
      const r = await banco('vendas_apresentar_escopo', { conversa_id: corpo.conversa_id, visitante_id: vid, titulo, escopo, estimativa_id: est.estimativa.id });
      return { ...r, titulo, escopo };
    },

    /* a confirmação explícita (e a concordância para começar dentro dos 7 dias, CDC art. 49) */
    async confirmar({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id) && ehUuid(corpo?.proposta_id), 400, 'Dados inválidos.');
      exigir(corpo?.confirmo === true, 400, 'É preciso confirmar o escopo.');
      return banco('vendas_confirmar_escopo', { conversa_id: corpo.conversa_id, visitante_id: vid, proposta_id: corpo.proposta_id, confirmo: true, inicio_imediato: corpo.inicio_imediato === true });
    },

    /* pagar o sinal (Pix ou cartão) pelo serviço de pagamentos. O navegador escolhe o MEIO e manda os dados do
       pagador e o token do cartão; o VALOR vem da proposta aceita, no banco (o corpo nunca define valor) */
    async pagar({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      exigir(pagamentos, 503, 'O pagamento online ainda não está disponível. A Beyon Zero envia o link pelo WhatsApp.');
      return pagamentos.iniciar({ conversa_id: corpo.conversa_id, visitante_id: vid, metodo: corpo?.metodo, pagador: corpo?.pagador, cartao: corpo?.cartao });
    },

    /* o estado do pagamento (a página consulta enquanto espera; o provedor é consultado no máximo a cada 10 s) */
    async pagamento({ request, query }) {
      const vid = await visitante(request);
      exigir(ehUuid(query.get('conversa')), 400, 'Conversa inválida.');
      exigir(pagamentos, 503, 'O pagamento online ainda não está disponível.');
      return pagamentos.estado({ conversa_id: query.get('conversa'), visitante_id: vid }, { atualizarProvedor: true });
    }
  };
}

/* o que o cartão da estimativa mostra (do motor; o modelo nunca escreveu estes números) */
export function cartao(e) {
  return {
    formato: e.formato.nome, valor_total: e.valor_total, sinal: e.sinal, sinal_percentual: e.sinal_percentual, prazo_dias: e.prazo_dias, fase: e.fase,
    itens: e.itens.map(i => ({ nome: i.nome, qtd: i.qtd })), fase_seguinte: e.fase_seguinte ? { itens: e.fase_seguinte.itens.map(i => ({ nome: i.nome, qtd: i.qtd })), valor_estimado: e.fase_seguinte.valor_estimado } : null
  };
}
