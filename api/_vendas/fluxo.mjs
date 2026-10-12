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
import { estimar, validarRegras, LANDING_GRANDE, CHAVE as CHAVE_EXTRA } from './precos.mjs';
import { gerarDirecao } from './gerador.mjs';
import { interpretar, aplicar, fatoresComEscopo, paraVisitante } from './alteracoes.mjs';
import { montarEscopo, nomesDosItens } from './escopo.mjs';
import { limparMensagem, pareceInjecao, redigir, MSG_MAX } from './seguranca.mjs';
import { ehUuid, normalizarTelefone } from '../_valida-app.mjs';
import { TETOS, reservaUsd, modoDirecoes } from '../_ia/config.mjs';
import { ErroIA } from '../_ia/provedor.mjs';
import { ErroBanco } from './transporte.mjs';
import { ErroPagamento } from '../_pagamentos/servico.mjs';
import { criarFreio, ipDe } from '../_freio.mjs';
import { chaveDoIp } from './ip.mjs';
import { AuthIndisponivel } from '../_supabase.mjs';
import { ETAPAS_SO_DUVIDAS } from './consultor.mjs';
import { classificar } from '../_classificador/index.mjs';
import { catalogoPublico, respostasParaBriefing, nomeDeTela, landingMaxExtras } from './catalogo.mjs';
import { limparAtualizacao } from './briefing.mjs';

import { ORG } from './org.mjs';
export { ORG };
export const RECUPERACAO = 'Não consegui concluir a análise neste momento. Suas informações foram preservadas. Vamos continuar de onde paramos.';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ORIGENS = ['anuncio', 'busca', 'social', 'mensagem', 'email', 'referencia', 'direto'];
/* etapas em que a conversa com o agente ainda vale: até o sinal, e no escopo e no sinal só para dúvidas (ETAPAS_SO_DUVIDAS);
   depois do sinal pago, o fluxo segue pelos blocos da página */
const CONVERSA_ABERTA = ['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes', ...ETAPAS_SO_DUVIDAS];
/* etapas que aceitam ajuste (= app.vendas_registrar_alteracao): conferidas ANTES de chamar o modelo */
const AJUSTE_ABERTO = ['escolhida', 'alteracoes'];
/* a trava de "uma resposta de IA por vez" dura o pior caso que cabe na função (300 s na Vercel) */
const TRAVA_IA_S = 300;
const RESERVA_S = 600;   /* a reserva de custo vence sozinha se a função cair no meio (a geração cabe em 300 s) */
const LIMITE_CONVERSA = 'Chegamos ao limite desta conversa por aqui. Continue com a Beyon Zero pelo WhatsApp: o seu briefing já está salvo.';
const LIMITE_DIA = 'O consultor está com muita procura agora. Seu briefing está salvo; tente de novo mais tarde ou fale pelo WhatsApp.';

/* respostas de erro: o que o visitante vê (sem detalhe interno) */
export class Recusa extends Error {
  constructor(status, mensagem, extra) { super(mensagem); this.status = status; this.extra = extra; }
}
export function traduzirErro(e) {
  if (e instanceof Recusa) return e;
  if (e instanceof ErroPagamento) return new Recusa(e.status, e.message, e.extra);
  if (e instanceof ErroIA) return new Recusa(503, RECUPERACAO, { recuperavel: true });
  /* tempo máximo de uma chamada ao Supabase esgotado: lentidão passageira, não erro interno */
  if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return new Recusa(503, 'O serviço está lento agora. Suas informações foram preservadas; tente de novo em instantes.', { recuperavel: true });
  /* o Auth do Supabase instável (429, 5xx, rede): passageiro, nunca "sessão expirada" nem erro interno (auditoria 2026-10-09) */
  if (e instanceof AuthIndisponivel) return new Recusa(503, e.paraVisitante || 'O serviço está instável agora. Suas informações foram preservadas; tente de novo em instantes.', e.recuperavel ? { recuperavel: true } : { whatsapp: true });
  if (e instanceof ErroBanco) {
    if (e.codigo === 'P0002') return new Recusa(404, 'Não encontrado.');
    if (e.codigo === '55000') return new Recusa(409, 'Esta etapa ainda não está disponível.');
    if (e.codigo === '23514') return new Recusa(409, 'Limite atingido para esta conversa.');
    if (e.codigo === '22023') return new Recusa(400, 'Dados inválidos.');
    if (e.codigo === '55P03') return new Recusa(409, 'Ainda estou respondendo à mensagem anterior. Um instante.');
    if (e.codigo === '40001') return new Recusa(409, 'A proposta mudou enquanto eu preparava isso (outra aba?). Confira e tente de novo.');
  }
  return null;
}

const exigir = (cond, status, msg) => { if (!cond) throw new Recusa(status, msg); };
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/* as regras comerciais ATIVAS (sem elas não há estimativa: nada de preço inventado). A ativação é um insert manual
   (docs/fase2/02-OPERACAO.md): uma versão ativa INVÁLIDA vale como ausente — "tabela em atualização" antes de chamar
   o modelo, em vez de erro interno depois de pagar por ele (revisão técnica do PR 12) */
async function regrasAtivas(banco) {
  const r = await banco('vendas_regras_ativas', { org_slug: ORG });
  if (!r || !r.regras) return null;
  const v = validarRegras(r.regras);
  if (v.erros) {
    console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', evento: 'tabela de preços ativa inválida', versao: r.versao ?? null, erros: v.erros.slice(0, 5) }));
    return null;
  }
  return r;
}

/* ---------- o ORÇAMENTO SEM IA (spec docs/specs/2026-10-11-orcamento-sem-ia.md): as escolhas viram fatores AQUI; o
   navegador nunca manda preço, fator nem complexidade ---------- */
/* por conversa, no módulo: o fluxo é criado a cada pedido (vendas.mjs), um freio dentro dele zeraria sempre.
   Por instância, como o freio por IP (o freio no banco vem no PR 2) */
const freioPacote = criarFreio({ max: 60, janelaMs: 60 * 60e3 });
const ETAPAS_PACOTE = ['descoberta', 'estimativa'];   /* = app.vendas_registrar_respostas: depois do contato o pacote não muda por aqui */
const CONFIANCA_FORMULARIO = 0.4;   /* fixa: o formulário dá o começo do briefing; nunca vem do corpo */
const TABELA_EM_ATUALIZACAO = 'A tabela de valores está em atualização. Fale com a Beyon Zero pelo WhatsApp.';

/* os extras do corpo: só chave e quantidade inteira (o resto é ignorado; o motor confere contra a tabela) */
function extrasDoCorpo(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([k, q]) => CHAVE_EXTRA.test(k) && Number.isInteger(q)));
}

/* decisão do dono (2026-10-12): a landing page vai até 3 páginas (até 2 extras); de 4 em diante, só o site com várias
   páginas. Nada troca de formato sozinho: a tela recebe o motivo e o formato que serve, e a pessoa escolhe */
function landingGrandeDemais(formato, adicionais, tabela) {
  if (formato !== 'landing_page' || !tabela.formatos.landing_page) return false;
  const extrasPag = Number.isInteger(adicionais.pagina_extra) && adicionais.pagina_extra > 0 ? adicionais.pagina_extra : 0;
  return extrasPag > landingMaxExtras(tabela.formatos.landing_page);
}

/* o que a tela recebe da recomendação (sem as respostas validadas nem os adicionais internos) */
const publicaRec = rec => ({ formato: rec.formato, alternativa: rec.alternativa, fale_comigo: rec.fale_comigo, sugestoes: rec.sugestoes,
  motivo: rec.motivo, assumido: rec.assumido });

export function criarFluxo({ banco, ia: iaBase, visitantes, pagamentos, segredoFreio, requestId, direcoes }) {
  /* as direções: geradas pela API na hora, ou na FILA MANUAL (o dono produz no Claude Code, em até 24 horas úteis;
     decisão do dono 2026-10-08). Os testes passam o modo; o site lê BZ_DIRECOES */
  const modo = direcoes === 'manual' || direcoes === 'api' ? direcoes : modoDirecoes();
  /* o REGISTRO das chamadas de IA (app.ia_chamadas): cada chamada ao modelo vira uma linha — papel, modelo,
     tokens, custo, ferramentas pedidas, tempo, erro — sem o texto de ninguém; gravado no fim da ação, dê certo ou não */
  const chamadas = [];
  const ia = iaBase && { ...iaBase, async mensagem(p) {
    const t0 = Date.now();
    try {
      const r = await iaBase.mensagem(p);
      chamadas.push({ papel: p.papel, modelo: r.modelo, parada: r.parada, custo_usd: r.custo_usd || 0, tokens_entrada: r.uso?.entrada ?? null,
        tokens_saida: r.uso?.saida ?? null, ferramentas: (r.chamadas || []).map(c => c.nome), ms: Date.now() - t0 });
      return r;
    } catch (e) {
      chamadas.push({ papel: p.papel, erro: e instanceof ErroIA ? e.motivo : 'interno', custo_usd: (e && e.custo_usd) || 0, ms: Date.now() - t0 });
      throw e;
    }
  } };
  async function gravarChamadas(conversaId, vid) {
    if (!chamadas.length) return;
    await banco('vendas_registrar_ia', { conversa_id: conversaId, visitante_id: vid, request_id: requestId || null, chamadas: chamadas.splice(0) })
      .catch(e => console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', request_id: requestId || null, evento: 'registro de IA não gravado', codigo: e && e.codigo })));
  }
  async function visitante(request) {
    const id = await visitantes.quem(request);
    exigir(id, 401, 'Sessão inválida ou expirada.');
    return id;
  }
  async function estado(vid, conversa_id) {
    return banco('vendas_estado', { conversa_id, visitante_id: vid });
  }
  /* o que o modelo cobrou entra no teto da conversa, também quando a chamada falhou (recusa, formato, ajuste
     recusado): sem isso, pedidos que falham gastavam fora da conta */
  async function somarCusto(conversaId, vid, custo) {
    if (!(custo > 0)) return;
    await banco('vendas_somar_custo', { conversa_id: conversaId, visitante_id: vid, custo_usd: custo })
      .catch(e => console.error('[vendas] custo não somado:', e && e.codigo));
  }
  /* a trava de "uma resposta de IA por vez", que na 1ª vez da conversa também conta o IP do dia (só um HMAC chega ao banco) */
  async function reservarIa(conversaId, vid, request) {
    const r = await banco('vendas_reservar_ia', { conversa_id: conversaId, visitante_id: vid, max_turnos: TETOS.turnos_por_conversa, teto_usd: TETOS.conversa_usd,
      segundos: TRAVA_IA_S, chave_ip: request ? chaveDoIp(ipDe(request), segredoFreio) : null, max_por_ip: TETOS.conversas_por_ip_dia });
    if (r && r.ok === false && r.freio_ip) throw new Recusa(429, 'Muitas conversas deste endereço hoje. Fale com a Beyon Zero pelo WhatsApp: a gente continua por lá.', { whatsapp: true });
  }
  /* RESERVA um valor REALISTA da chamada (RESERVA_USD em api/_ia/config.mjs) no teto antes de chamar o modelo
     (app.vendas_reservar_custo, numa transação que trava a organização): chamadas em paralelo não passam mais todas pela
     mesma leitura. Começa só se (gasto + reservas) está abaixo do teto da conversa e do dia; o estouro fica no que as
     chamadas já em voo gastarem além das suas reservas (o freio de última instância é o limite de gasto no console da
     Anthropic). A reserva sai no fim, depois de somar o custo real. Erro do banco na reserva FECHA (503, sem chamar o
     modelo); só a função ainda inexistente (migration a aplicar) segue sem reserva, com log */
  async function comReserva(conversaId, vid, papel, fn) {
    const valor = reservaUsd(papel);
    let reserva = null;
    try {
      const r = await banco('vendas_reservar_custo', { conversa_id: conversaId, visitante_id: vid, valor_usd: valor,
        teto_conversa_usd: TETOS.conversa_usd, teto_dia_usd: TETOS.dia_usd, segundos: RESERVA_S });
      if (r && r.ok === false) throw r.motivo === 'dia' ? new Recusa(503, LIMITE_DIA, { whatsapp: true }) : new Recusa(429, LIMITE_CONVERSA, { whatsapp: true });
      reserva = r && r.reserva_id;
      if (!reserva) throw Object.assign(new Error('reserva sem id'), { codigo: 'SEM_RESERVA' });   /* (resposta inesperada: fecha) */
    } catch (e) {
      if (e instanceof Recusa || (e && e.codigo === 'P0002')) throw e;
      /* só a função ainda inexistente (migration a aplicar) segue como antes; qualquer outro erro do banco FECHA: sem
         reserva não se chama o modelo (revisões do PR 15) */
      const semFuncao = e && (e.codigo === '42883' || e.codigo === 'PGRST202');
      console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', request_id: requestId || null, evento: semFuncao ? 'reserva de custo indisponível (função ausente): segue sem reserva' : 'reserva de custo falhou: não chama o modelo', codigo: e && e.codigo }));
      if (!semFuncao) throw new Recusa(503, 'O consultor está indisponível agora. Seu briefing está salvo; tente de novo em instantes ou fale pelo WhatsApp.', { whatsapp: true });
    }
    try { return await fn(); }
    finally {
      if (reserva) await banco('vendas_liberar_reserva', { reserva_id: reserva, conversa_id: conversaId, visitante_id: vid })
        .catch(e => console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', request_id: requestId || null, evento: 'reserva não liberada (vence sozinha)', codigo: e && e.codigo })));
    }
  }
  async function dentroDoCusto(est) {
    if (Number(est.conversa.custo_ia_usd) >= TETOS.conversa_usd) throw new Recusa(429, LIMITE_CONVERSA, { whatsapp: true });
    const dia = await banco('vendas_custo_dia', { org_slug: ORG });
    if (Number(dia.custo_usd) >= TETOS.dia_usd) throw new Recusa(503, LIMITE_DIA, { whatsapp: true });
    /* o disjuntor: o provedor de IA falhou nas últimas 5 chamadas (10 min) → não chama, oferece o WhatsApp */
    /* (consulta que falha — ex.: migration ainda não aplicada — não derruba o agente: na dúvida, chama; o log avisa) */
    const disjuntor = await banco('vendas_ia_disponivel', { org_slug: ORG })
      .catch(e => { console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', request_id: requestId || null, evento: 'disjuntor não consultado', codigo: e && e.codigo })); return null; });
    if (disjuntor && disjuntor.disponivel === false) throw new Recusa(503, 'O consultor está fora do ar por alguns minutos. Seu briefing está salvo; tente de novo daqui a pouco ou fale pelo WhatsApp.', { whatsapp: true });
  }

  /* um turno com a trava da IA já reservada. O que se GRAVA é o texto redigido (sem telefone, e-mail,
     documento ou cartão), o mesmo que o modelo recebe */
  async function turno(vid, conversaId, est, regras, msg) {
    let r;
    try {
      r = await executarTurno({ ia, direcoes: modo, regras: regras.regras, conversa: { etapa: est.conversa.etapa, briefing: est.conversa.briefing, mensagens: est.mensagens, estimativa: est.estimativa }, mensagem: msg });
    } catch (e) {
      await somarCusto(conversaId, vid, e && e.custo_usd);   /* (as rodadas pagas antes da falha, de qualquer tipo de erro) */
      if (e instanceof ErroIA) await banco('vendas_registrar_evento', { conversa_id: conversaId, visitante_id: vid, tipo: 'ia_falhou', dados: { motivo: e.motivo } }).catch(() => {});
      throw e;
    }
    /* o custo do turno é gravado junto com as mensagens; se a gravação falhar, ele entra assim mesmo. No escopo e no sinal
       (só dúvidas) o briefing e a confiança ficam como estão: o escopo já foi montado com eles */
    const soDuvidas = ETAPAS_SO_DUVIDAS.includes(est.conversa.etapa);
    await banco('vendas_registrar_turno', { conversa_id: conversaId, visitante_id: vid, mensagem_visitante: redigir(msg), mensagem_agente: r.resposta,
      ...(soDuvidas ? {} : { briefing: r.briefing, confianca: r.confianca }), custo_usd: r.custo_usd })
      .catch(async e => { await somarCusto(conversaId, vid, r.custo_usd); throw e; });
    let estimativa = null;
    if (r.estimativa && !soDuvidas) {
      await banco('vendas_registrar_estimativa', { conversa_id: conversaId, visitante_id: vid, regras_id: regras.id, fatores: r.estimativa.fatores,
        valor_total: r.estimativa.valor_total, sinal: r.estimativa.sinal, prazo_dias: r.estimativa.prazo_dias, fase: r.estimativa.fase, detalhes: r.estimativa });
      estimativa = cartao(r.estimativa);
    }
    return { resposta: r.resposta, estimativa, pedir_contato: !soDuvidas && r.pedir_contato, diagnostico: r.diagnostico, sugestoes_ia: r.sugestoes_ia, confianca: r.confianca };
  }

  /* respostas + escolhas → recomendação e estimativa pelo motor, contra a tabela ATIVA (nada grava aqui) */
  async function pacote(corpo) {
    const regras = await regrasAtivas(banco);
    exigir(regras, 503, TABELA_EM_ATUALIZACAO);
    const tabela = regras.regras;
    const rec = (await classificar('recomendar_pacote', { respostas: corpo?.respostas, formatos: Object.keys(tabela.formatos) })).dados;
    exigir(!rec.erros, 400, 'Respostas inválidas.');
    const formato = typeof corpo?.formato === 'string' && Object.hasOwn(tabela.formatos, corpo.formato) ? corpo.formato : rec.formato;
    /* os adicionais da recomendação só entram se a pessoa ficou no formato recomendado; os extras dela vencem os da recomendação */
    const adicionais = { ...(formato === rec.formato ? rec.adicionais : {}), ...extrasDoCorpo(corpo?.extras) };
    if (landingGrandeDemais(formato, adicionais, tabela)) throw new Recusa(400, LANDING_GRANDE, { formato_sugerido: 'institucional' });
    const e = estimar({ formato, adicionais, urgencia: corpo?.urgencia === true }, tabela);
    if (e.erros) throw new Recusa(400, e.erros[0]);
    return { regras, rec, e, formato };
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
      return { ...e, modo_direcoes: modo };   /* (a tela troca "alguns minutos" por "até 24 horas úteis") */
    },

    /* o catálogo público da tabela ativa (o "Quer ajustar?"): só com a sessão e a conversa deste visitante */
    async catalogo({ request, query }) {
      const vid = await visitante(request);
      exigir(ehUuid(query.get('conversa')), 400, 'Conversa inválida.');
      await estado(vid, query.get('conversa'));   /* (a conversa é deste visitante; de outro: 404) */
      const regras = await regrasAtivas(banco);
      exigir(regras, 503, TABELA_EM_ATUALIZACAO);
      return { versao: regras.id, ...catalogoPublico(regras.regras, { formato: query.get('formato'), ramo: query.get('ramo') }) };
    },

    /* o preço ao vivo: calcula, NÃO grava (spec §3) */
    async simular({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      await estado(vid, corpo.conversa_id);   /* (antes do freio: ninguém gasta a cota da conversa de outro) */
      exigir(!freioPacote(corpo.conversa_id), 429, 'Muitas simulações seguidas. Espere um pouco ou fale pelo WhatsApp.');
      const { regras, rec, e } = await pacote(corpo);
      const recomendacao = publicaRec(rec);
      if (e.encaminhar_diagnostico) return { versao: regras.id, recomendacao, estimativa: null, diagnostico: { itens: e.itens_diagnostico.map(i => nomeDeTela(i.chave, i.nome)) } };
      return { versao: regras.id, recomendacao, estimativa: cartao(e), diagnostico: null };
    },

    /* grava o pacote UMA vez, com a versão da tabela que a pessoa viu (spec §3 e §7) */
    async confirmarPacote({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const est = await estado(vid, corpo.conversa_id);
      exigir(!freioPacote(corpo.conversa_id), 429, 'Muitas tentativas seguidas. Espere um pouco ou fale pelo WhatsApp.');
      exigir(ETAPAS_PACOTE.includes(est.conversa.etapa), 409, 'O pacote já foi fechado. Para mudar, fale com a Beyon Zero pelo WhatsApp.');
      const { regras, rec, e, formato } = await pacote(corpo);
      if (corpo?.versao !== regras.id) throw new Recusa(409, 'A tabela de valores mudou enquanto você montava o orçamento. Confira o valor novo.', { versao_nova: regras.id });
      exigir(!e.encaminhar_diagnostico, 409, 'Esse pacote precisa de uma conversa. Fale com a Beyon Zero pelo WhatsApp.');
      await banco('vendas_registrar_respostas', { conversa_id: corpo.conversa_id, visitante_id: vid,
        briefing: limparAtualizacao(respostasParaBriefing(rec.respostas, formato)), confianca: CONFIANCA_FORMULARIO });
      await banco('vendas_registrar_estimativa', { conversa_id: corpo.conversa_id, visitante_id: vid, regras_id: regras.id, fatores: e.fatores,
        valor_total: e.valor_total, sinal: e.sinal, prazo_dias: e.prazo_dias, fase: e.fase, detalhes: e });
      return { estimativa: cartao(e) };
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
      await reservarIa(corpo.conversa_id, vid, request);
      try {
        return await comReserva(corpo.conversa_id, vid, 'conversa', () => turno(vid, corpo.conversa_id, est, regras, msg));
      } finally {
        await gravarChamadas(corpo.conversa_id, vid);
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
      exigir(modo !== 'manual' || telefone, 400, 'Informe seu WhatsApp: é por ele que avisamos quando as direções ficarem prontas.');
      exigir(corpo?.aceite === true, 400, 'É preciso concordar com o uso dos dados para receber as propostas.');
      await banco('vendas_informar_contato', { conversa_id: corpo.conversa_id, visitante_id: vid, nome, email, telefone, aceite: true });   /* (o banco guarda quando) */
      return { ok: true };
    },

    /* pedir as 3 direções (devolve os ids; o navegador pede cada uma em paralelo) */
    async gerar({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      /* (fila manual: não há gasto de API; o disjuntor ou o teto da IA não barram quem acabou de deixar o WhatsApp) */
      if (modo !== 'manual') await dentroDoCusto(await estado(vid, corpo.conversa_id));
      return banco('vendas_iniciar_geracao', { conversa_id: corpo.conversa_id, visitante_id: vid, max_geracoes: TETOS.geracoes_por_conversa });
    },

    /* gerar UMA direção (cabe nos 300 s da função) */
    async gerarDirecao({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id) && ehUuid(corpo?.direcao_id), 400, 'Dados inválidos.');
      const est = await estado(vid, corpo.conversa_id);
      /* direção já pronta ou que falhou: nada a gerar, nada a reservar (o pedido que não custa modelo não segura a trava
         das reservas — revisão de segurança do PR 15) */
      const atual = (est.direcoes || []).find(d => d.id === corpo.direcao_id);
      exigir(atual, 404, 'Não encontrado.');
      if (atual.status !== 'gerando') return { status: atual.status };
      /* fila manual: nada a gerar aqui, o dono entrega pelo painel (vendas_concluir_direcao) */
      if (modo === 'manual') return { status: 'na_fila' };
      /* em geração por outro pedido (o navegador repede a cada 60 s): responde sem entrar na trava da organização
         (revisão de segurança do PR 16). Só a consulta ainda inexistente (migration a aplicar) segue para reivindicar */
      const andamento = await banco('vendas_direcao_em_andamento', { conversa_id: corpo.conversa_id, visitante_id: vid, direcao_id: corpo.direcao_id })
        .catch(e => { if (e && (e.codigo === '42883' || e.codigo === 'PGRST202')) return null; throw e; });
      if (andamento && andamento.em_andamento) return { status: 'em_andamento' };
      await dentroDoCusto(est);   /* (o Opus é a chamada mais cara: confere antes) */
      return comReserva(corpo.conversa_id, vid, 'geracao', async () => {
        const p = await banco('vendas_reivindicar_direcao', { conversa_id: corpo.conversa_id, visitante_id: vid, direcao_id: corpo.direcao_id });
        if (!p.reivindicada) return { status: p.status };
        try {
          const g = await gerarDirecao({ ia, briefing: p.briefing, estrategia: p.estrategia, numero: p.numero, fatores: p.fatores });
          await somarCusto(corpo.conversa_id, vid, g.custo_usd);   /* (antes de gravar: a Opus já cobrou, dê certo ou não a gravação) */
          await banco('vendas_concluir_direcao', { direcao_id: p.direcao_id, conteudo: g.direcao, modelo: g.modelo });
          return { status: 'pronta' };
        } catch (e) {
          const motivo = e instanceof ErroIA ? e.motivo : 'falha';
          if (e instanceof ErroIA) await somarCusto(corpo.conversa_id, vid, e.custo_usd);
          await banco('vendas_concluir_direcao', { direcao_id: p.direcao_id, erro: 'não foi possível gerar (' + motivo + ')' });
          if (e instanceof ErroIA) return { status: 'falhou', mensagem: RECUPERACAO };
          throw e;
        } finally {
          await gravarChamadas(corpo.conversa_id, vid);
        }
      });
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
      const limpo = limparMensagem(corpo?.pedido);
      exigir(limpo, 400, 'Descreva a alteração em até 2.000 caracteres.');   /* (antes de redigir: redigir(null) vira "null") */
      /* (o modelo e o banco recebem o texto redigido; o marcador pode ser maior que o dado — "a@b.co" vira
         "[e-mail]" — e o banco aceita até MSG_MAX no pedido) */
      const pedido = redigir(limpo).slice(0, MSG_MAX);
      const est = await estado(vid, corpo.conversa_id);
      exigir(est.escolha, 409, 'Escolha uma direção antes.');
      exigir(AJUSTE_ABERTO.includes(est.conversa.etapa), 409, 'Os ajustes desta proposta já foram fechados.');   /* (antes de pagar o modelo) */
      await dentroDoCusto(est);
      const direcoes = est.direcoes.filter(d => d.status === 'pronta');
      const escolhida = direcoes.find(d => d.id === est.escolha.direcao_id);
      exigir(escolhida, 409, 'Escolha uma direção antes.');
      const base = est.versao_final || escolhida.conteudo;
      await reservarIa(corpo.conversa_id, vid, request);
      const t = await comReserva(corpo.conversa_id, vid, 'extracao', async () => {
        let r;
        try { r = await interpretar({ ia, pedido, direcoes, escolhida: escolhida.numero }); }
        catch (e) { await somarCusto(corpo.conversa_id, vid, e && e.custo_usd); throw e; }
        finally {
          await banco('vendas_liberar_ia', { conversa_id: corpo.conversa_id, visitante_id: vid }).catch(() => {});
          await gravarChamadas(corpo.conversa_id, vid);
        }
        /* a chamada ao modelo já foi paga: o custo entra no teto agora, dê certo ou não o que vem depois */
        await somarCusto(corpo.conversa_id, vid, r.custo_usd);
        return r;
      });
      const a = aplicar({ base, mudancas: t.mudancas, direcoes });
      exigir(!a.erro, 422, 'Não consegui aplicar essa alteração. Pode descrever de outro jeito?');
      let estimativa = null, novaEstimativa;
      if (a.escopo.length) {
        const regras = await regrasAtivas(banco);
        exigir(regras, 503, 'A tabela de valores está em atualização.');
        const e = estimar(fatoresComEscopo(est.estimativa?.fatores, a.escopo), regras.regras);
        if (e.encaminhar_diagnostico) return { resposta: 'Esse pedido muda o projeto além do que a estimativa automática cobre. Vamos ver isso no diagnóstico pelo WhatsApp.', diagnostico: true, resultado: paraVisitante(a.resultado).resultado };
        /* o motor recusou o novo escopo: o ajuste NÃO entra (senão o contrato teria um item sem preço) */
        exigir(!e.erros, 422, 'Esse pedido muda o escopo de um jeito que a estimativa automática não cobre. Pode descrever de outro jeito, ou falamos pelo WhatsApp?');
        novaEstimativa = { regras_id: regras.id, fatores: e.fatores, valor_total: e.valor_total, sinal: e.sinal, prazo_dias: e.prazo_dias, fase: e.fase, detalhes: e };
        estimativa = cartao(e);
      }
      /* ajuste + estimativa nova numa transação só; o banco recusa se a escolha mudou enquanto o modelo traduzia */
      await banco('vendas_registrar_alteracao', { conversa_id: corpo.conversa_id, visitante_id: vid, direcao_id: escolhida.id, pedido, mudancas: a.resultado, resultado: a.direcao,
        ...(novaEstimativa ? { estimativa: novaEstimativa } : {}) });
      /* (a frase é do código, nunca do modelo: auditoria 2026-10-09; o nome do adicional, o da tabela de preços) */
      return { ...paraVisitante(a.resultado, novaEstimativa ? nomesDosItens(novaEstimativa.detalhes) : undefined), estimativa };
    },

    /* o escopo final (montado pelo código; o preço é o da última estimativa, conferido pelo banco) */
    async escopo({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const est = await estado(vid, corpo.conversa_id);
      exigir(est.escolha && est.estimativa, 409, 'Escolha uma direção antes.');
      const direcao = est.versao_final || est.direcoes.find(d => d.id === est.escolha.direcao_id)?.conteudo;
      exigir(direcao, 409, 'Escolha uma direção antes.');
      /* quem volta depois que a retenção de 2 meses apagou o resumo do caso e os pedidos de ajuste (o contato fica 12
         meses): o escopo sairia sem o que foi combinado; melhor recomeçar (revisão técnica do PR 35) */
      const apagado = !Object.keys(est.conversa.briefing || {}).length || (est.alteracoes || []).some(a => a.pedido === '[apagado]');
      exigir(!apagado, 409, 'Este orçamento ficou parado por muito tempo e parte do que você contou foi apagada pelo nosso prazo de privacidade. Comece um novo orçamento ou fale com a Beyon Zero pelo WhatsApp.');
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
      /* sem contato (ou com o contato anonimizado pela retenção de 12 meses), o cliente nasceria sem nome nem telefone */
      const est = await estado(vid, corpo.conversa_id);
      exigir(est.conversa.tem_contato, 409, 'Antes de pagar, informe de novo o seu nome e WhatsApp no formulário de contato.');
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
    itens: e.itens.map(i => ({ chave: i.chave, nome: i.nome, qtd: i.qtd })), fase_seguinte: e.fase_seguinte ? { itens: e.fase_seguinte.itens.map(i => ({ chave: i.chave, nome: i.nome, qtd: i.qtd })), valor_estimado: e.fase_seguinte.valor_estimado } : null
  };
}
