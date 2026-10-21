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
import { estimar, LANDING_GRANDE, CHAVE as CHAVE_EXTRA } from './precos.mjs';
import { gerarDirecao } from './gerador.mjs';
import { montarEscopo } from './escopo.mjs';
import { limparMensagem, pareceInjecao, redigir } from './seguranca.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { TETOS, reservaUsd } from '../_ia/config.mjs';
import { ErroIA } from '../_ia/provedor.mjs';
import { ErroBanco } from './transporte.mjs';
import { ErroPagamento } from '../_pagamentos/servico.mjs';
import { criarFreio, ipDe } from '../_freio.mjs';
import { chaveDoIp, chaveDoIp48 } from './ip.mjs';
import { AuthIndisponivel } from '../_supabase.mjs';
import { ETAPAS_SO_DUVIDAS, precoAberto } from './consultor.mjs';
import { classificar } from '../_classificador/index.mjs';
import { catalogoPublico, respostasParaBriefing, nomeDeTela, landingMaxExtras } from './catalogo.mjs';
import { limparAtualizacao } from './briefing.mjs';
import { Recusa } from './recusa.mjs';
import { regrasAtivas, esquecerRegras } from './regras-ativas.mjs';
import { criarAcoesDoPedido } from './fluxo-pedido.mjs';
import { criarAcoesDaRetomada } from './fluxo-retomada.mjs';
import { criarAcoesDosAjustes } from './fluxo-ajustes.mjs';
import { PEDIDOS } from './pedido.mjs';

import { ORG } from './org.mjs';
export { ORG };
export const RECUPERACAO = 'Não consegui concluir a análise neste momento. Suas informações foram preservadas. Vamos continuar de onde paramos.';
const ORIGENS = ['anuncio', 'busca', 'social', 'mensagem', 'email', 'referencia', 'direto'];
/* etapas em que a conversa com o agente ainda vale: até o sinal, e no escopo e no sinal só para dúvidas (ETAPAS_SO_DUVIDAS);
   depois do sinal pago, o fluxo segue pelos blocos da página */
const CONVERSA_ABERTA = ['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes', ...ETAPAS_SO_DUVIDAS];
/* a trava de "uma resposta de IA por vez" dura o pior caso que cabe na função (300 s na Vercel) */
const TRAVA_IA_S = 300;
const RESERVA_S = 600;   /* a reserva de custo vence sozinha se a função cair no meio (a geração cabe em 300 s) */
const USO_IP48_IA = 'ia48';   /* o "uso" da chave /48 do consultor em privado.freio_ip (o do pedido é 'pedido48': contadores separados) */
const LIMITE_CONVERSA = 'Chegamos ao limite desta conversa por aqui. Continue com a Beyon Zero pelo WhatsApp: o seu briefing já está salvo.';
const LIMITE_DIA = 'O consultor está com muita procura agora. Seu briefing está salvo; tente de novo mais tarde ou fale pelo WhatsApp.';

/* respostas de erro: o que o visitante vê (sem detalhe interno). A classe mora em recusa.mjs (o fluxo do pedido
   também a usa); daqui ela continua exportada para quem já a importava */
export { Recusa };
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
    /* (PR2a-22P02) texto que não converte (uuid, número) no banco: entrada inválida, não erro interno */
    if (e.codigo === '22P02') return new Recusa(400, 'Dados inválidos.');
    if (e.codigo === '55P03') return new Recusa(409, 'Ainda estou respondendo à mensagem anterior. Um instante.');
    if (e.codigo === '40001') return new Recusa(409, 'A proposta mudou enquanto eu preparava isso (outra aba?). Confira e tente de novo.');
  }
  return null;
}

const exigir = (cond, status, msg) => { if (!cond) throw new Recusa(status, msg); };
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

/* as regras comerciais ATIVAS vêm de api/_vendas/regras-ativas.mjs. Com { cache: true } só no catálogo, no preço ao
   vivo e no "Quero" (PR37-T4); a conversa e o ajuste leem sempre do banco */
const CACHE = { cache: true };

/* ---------- o ORÇAMENTO SEM IA (spec docs/specs/2026-10-11-orcamento-sem-ia.md): as escolhas viram fatores AQUI; o
   navegador nunca manda preço, fator nem complexidade ---------- */
/* por conversa, no módulo: o fluxo é criado a cada pedido (vendas.mjs), um freio dentro dele zeraria sempre.
   Por instância, como o freio por IP; o freio DE VERDADE dos pedidos é o do banco, nos detalhes. Um freio para cada
   ação (PR37-T4/S2): quem mexe muito no preço ao vivo não fica sem poder gravar o "Quero" */
const freioSimular = criarFreio({ max: 60, janelaMs: 60 * 60e3 });
const freioConfirmar = criarFreio({ max: 20, janelaMs: 60 * 60e3 });
const freioCatalogo = criarFreio({ max: 60, janelaMs: 60 * 60e3 });
const PACOTE_FECHADO = 'O pacote já foi fechado. Para mudar, fale com a Beyon Zero pelo WhatsApp.';
const TABELA_MUDOU = 'A tabela de valores mudou enquanto você montava o orçamento. Confira o valor novo.';
/* o mesmo JSON sem depender da ordem das chaves (o jsonb volta do banco com as chaves na ordem dele) */
const canonico = v => (Array.isArray(v) ? v.map(canonico)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v);
const mesmoJson = (a, b) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
const ETAPAS_PACOTE = ['descoberta', 'estimativa'];   /* = app.vendas_registrar_respostas: depois do contato o pacote não muda por aqui */
const CONFIANCA_FORMULARIO = 0.4;   /* fixa: o formulário dá o começo do briefing; nunca vem do corpo */
const TABELA_EM_ATUALIZACAO = 'A tabela de valores está em atualização. Fale com a Beyon Zero pelo WhatsApp.';

/* (PR 2a, revisão final M1) a situação do pedido nas ações do visitante. Regra do dono: "Descartar encerra o pedido e
   para o que faltava fazer": descartado, NENHUMA ação seguinte passa (gerar, gerar-direcao, escolher, ajustar, desfazer, pedido-livre, escopo,
   pagar). Arquivado (resolvido por fora) não bloqueia; só não gera de novo, como todo pedido que não está confirmado */
const PEDIDO_ENCERRADO = 'Este pedido foi encerrado. Fale com a Beyon Zero pelo WhatsApp.';
const NAO_GERA = {
  aguardando: ['O pedido ainda está aguardando a confirmação pelo WhatsApp.', undefined],
  expirado: [PEDIDO_ENCERRADO, { whatsapp: true }],
  descartado: [PEDIDO_ENCERRADO, { whatsapp: true }],
  arquivado: ['Este pedido segue com a Beyon Zero pelo WhatsApp.', { whatsapp: true }]
};
/* sem pedido (o fluxo antigo, contato direto) ou em situação desconhecida: a frase de sempre */
const SEM_CONFIRMACAO = ['O pedido ainda não foi confirmado pelo WhatsApp.', undefined];
function exigirNaoDescartado(est) {
  if (est.pedido && est.pedido.status === 'descartado') throw new Recusa(409, PEDIDO_ENCERRADO, { whatsapp: true });
}
/* null: o pedido está confirmado e pode gerar; senão, a recusa com a frase da situação */
function recusaDoGerar(pedido) {
  const status = pedido && pedido.status;
  if (status === 'confirmado') return null;
  const [frase, extra] = Object.hasOwn(NAO_GERA, String(status)) ? NAO_GERA[status] : SEM_CONFIRMACAO;
  return new Recusa(409, frase, extra);
}

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

export function criarFluxo({ banco, ia: iaBase, visitantes, pagamentos, segredoFreio, requestId, direcoes, env, limitesPedido = PEDIDOS }) {
  /* as direções: geradas pela API na hora, ou na FILA MANUAL (o dono produz no Claude Code, em até 24 horas úteis;
     decisão do dono 2026-10-08). Os testes passam o modo; o site lê BZ_DIRECOES */
  const modo = direcoes === 'manual' || direcoes === 'api' ? direcoes : 'manual';
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
  /* true: nada a gravar ou gravado; false: o banco falhou (o registro daquelas chamadas se perde; quem chama decide o que fazer) */
  async function gravarChamadas(conversaId, vid) {
    if (!chamadas.length) return true;
    return banco('vendas_registrar_ia', { conversa_id: conversaId, visitante_id: vid, request_id: requestId || null, chamadas: chamadas.splice(0) })
      .then(() => true, e => {
        console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', request_id: requestId || null, evento: 'registro de IA não gravado', codigo: e && e.codigo }));
        return false;
      });
  }
  async function visitante(request) {
    const id = await visitantes.quem(request);
    exigir(id, 401, 'Sessão inválida ou expirada.');
    return id;
  }
  async function estado(vid, conversa_id) {
    return banco('vendas_estado', { conversa_id, visitante_id: vid });
  }
  /* a consulta LEVE (PR37-T4/S2): a conversa é deste visitante e está numa das etapas; devolve a etapa e o último
     pacote gravado. Etapa fora da lista = o pacote já foi fechado */
  async function donoDaConversa(vid, conversaId, etapas) {
    try { return await banco('vendas_conversa_dono', { conversa_id: conversaId, visitante_id: vid, etapas }); }
    catch (e) { if (e instanceof ErroBanco && e.codigo === '55000') throw new Recusa(409, PACOTE_FECHADO); throw e; }
  }
  /* o que o modelo cobrou entra no teto da conversa, também quando a chamada falhou (recusa, formato, ajuste
     recusado): sem isso, pedidos que falham gastavam fora da conta */
  async function somarCusto(conversaId, vid, custo) {
    if (!(custo > 0)) return;
    await banco('vendas_somar_custo', { conversa_id: conversaId, visitante_id: vid, custo_usd: custo })
      .catch(e => console.error('[vendas] custo não somado:', e && e.codigo));
  }
  /* a trava de "uma resposta de IA por vez", que na 1ª vez da conversa também conta o IP do dia (só um HMAC chega ao banco).
     O IPv6 conta pelo /64 e também pelo /48 (auditoria run-1, pista 1: a casa ou a empresa recebe um /48 inteiro e trocava
     de /64 à vontade). O /48 tem o seu próprio "uso" (ia48), para não dividir o contador de privado.freio_ip com o pedido
     (pedido48); as duas chaves saem do MESMO instante, para não caírem em dias diferentes na virada da meia-noite */
  async function reservarIa(conversaId, vid, request) {
    const ip = request ? ipDe(request) : null, agora = new Date();
    const r = await banco('vendas_reservar_ia', { conversa_id: conversaId, visitante_id: vid, max_turnos: TETOS.turnos_por_conversa, teto_usd: TETOS.conversa_usd,
      segundos: TRAVA_IA_S, chave_ip: request ? chaveDoIp(ip, segredoFreio, agora) : null, max_por_ip: TETOS.conversas_por_ip_dia,
      chave_ip48: request ? chaveDoIp48(ip, segredoFreio, agora, USO_IP48_IA) : null, max_por_ip48: TETOS.conversas_por_ip48_dia });
    if (r && r.ok === false && r.freio_ip) throw new Recusa(429, 'Muitas conversas deste endereço hoje. Fale com a Beyon Zero pelo WhatsApp: a gente continua por lá.', { whatsapp: true });
  }
  /* RESERVA um valor REALISTA da chamada (RESERVA_USD em api/_ia/config.mjs) no teto antes de chamar o modelo
     (app.vendas_reservar_custo, numa transação que trava a organização): chamadas em paralelo não passam mais todas pela
     mesma leitura. Começa só se (gasto + reservas) está abaixo do teto da conversa e do dia; o estouro fica no que as
     chamadas já em voo gastarem além das suas reservas (o freio de última instância é o limite de gasto no console da
     Anthropic). A reserva sai no fim, depois de somar o custo real E de gravar o registro da chamada (app.ia_chamadas):
     o teto do dia lê esse registro (auditoria run-1, pista 2), então liberar a reserva antes dele deixaria o gasto fora
     da conta nos dois lugares por um instante. Se a gravação do registro falhar, a reserva NÃO é liberada: ela vence
     sozinha em RESERVA_S, e a falha não zera a conta na hora. O que sobra aberto: com o registro perdido, o gasto daquela
     chamada deixa de contar no dia quando a reserva vence (sub-contagem pequena; o limite de gasto no console da
     Anthropic é o freio final). Erro do banco na reserva FECHA (503, sem chamar o
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
      /* (os dois chamadores, mensagem() e gerarDirecao(), deixam o registro só para cá: um gravarChamadas deles esvaziaria a
         lista e a falha do banco passaria despercebida, liberando a reserva na hora) */
      const registrado = await gravarChamadas(conversaId, vid);
      if (reserva && registrado) await banco('vendas_liberar_reserva', { reserva_id: reserva, conversa_id: conversaId, visitante_id: vid })
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
      r = await executarTurno({ ia, direcoes: modo, regras: regras.regras, conversa: { etapa: est.conversa.etapa, pedido_status: est.pedido?.status, briefing: est.conversa.briefing, mensagens: est.mensagens, estimativa: est.estimativa }, mensagem: msg });
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
    /* a estimativa e o formulário só até a confirmação do pedido (ETAPAS_COM_PRECO, e pedido ainda não confirmado: a
       conversa volta a "contato" com o pedido confirmado se as três direções falham): o agente já não os devolve depois,
       e o banco recusa a estimativa (55000); esta é a camada do meio, para o estado que o turno leu no começo */
    const comPreco = precoAberto(est.conversa.etapa, est.pedido?.status);
    let estimativa = null;
    if (r.estimativa && !soDuvidas && comPreco) {
      await banco('vendas_registrar_estimativa', { conversa_id: conversaId, visitante_id: vid, regras_id: regras.id, fatores: r.estimativa.fatores,
        valor_total: r.estimativa.valor_total, sinal: r.estimativa.sinal, prazo_dias: r.estimativa.prazo_dias, fase: r.estimativa.fase, detalhes: r.estimativa });
      estimativa = cartao(r.estimativa);
    }
    return { resposta: r.resposta, estimativa, pedir_contato: !soDuvidas && comPreco && r.pedir_contato, diagnostico: r.diagnostico, sugestoes_ia: r.sugestoes_ia, confianca: r.confianca };
  }

  /* respostas + escolhas → recomendação e estimativa pelo motor, contra a tabela ATIVA (nada grava aqui) */
  async function pacote(corpo, opcoes) {
    const regras = await regrasAtivas(banco, opcoes);
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

  /* os detalhes e o pedido (PR 2a): api/_vendas/fluxo-pedido.mjs */
  const acoesDoPedido = criarAcoesDoPedido({ banco, visitante, segredoFreio, env, limites: limitesPedido, requestId });

  return {
    ...acoesDoPedido,
    ...criarAcoesDaRetomada({ banco, visitantes }),
    ...criarAcoesDosAjustes({ banco, visitante, estado, exigirNaoDescartado }),

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
      const { fila_confirmados: naFila, ...e } = await estado(vid, query.get('conversa'));
      delete e.conversa.custo_ia_usd;   /* (métrica interna) */
      /* (PR 2a) a tela oferece o WhatsApp ANTES dos detalhes quando a fila do dono está cheia; o número em si é interno */
      return { ...e, fila_cheia: Number(naFila) >= limitesPedido.fila_confirmados, modo_direcoes: modo };   /* (a tela troca "alguns minutos" por "até 24 horas úteis") */
    },

    /* o catálogo público da tabela ativa (o "Quer ajustar?"): só com a sessão e a conversa deste visitante, antes do contato */
    async catalogo({ request, query }) {
      const vid = await visitante(request);
      exigir(ehUuid(query.get('conversa')), 400, 'Conversa inválida.');
      await donoDaConversa(vid, query.get('conversa'), ETAPAS_PACOTE);   /* (de outro visitante: 404; depois do contato: 409) */
      exigir(!freioCatalogo(query.get('conversa')), 429, 'Muitas consultas seguidas. Espere um pouco ou fale pelo WhatsApp.');
      const regras = await regrasAtivas(banco, CACHE);
      exigir(regras, 503, TABELA_EM_ATUALIZACAO);
      return { versao: regras.id, ...catalogoPublico(regras.regras, { formato: query.get('formato'), ramo: query.get('ramo') }) };
    },

    /* o preço ao vivo: calcula, NÃO grava (spec §3) */
    async simular({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      await donoDaConversa(vid, corpo.conversa_id, ETAPAS_PACOTE);   /* (antes do freio: ninguém gasta a cota da conversa de outro) */
      exigir(!freioSimular(corpo.conversa_id), 429, 'Muitas simulações seguidas. Espere um pouco ou fale pelo WhatsApp.');
      const { regras, rec, e } = await pacote(corpo, CACHE);
      const recomendacao = publicaRec(rec);
      if (e.encaminhar_diagnostico) return { versao: regras.id, recomendacao, estimativa: null, diagnostico: { itens: e.itens_diagnostico.map(i => nomeDeTela(i.chave, i.nome)) } };
      return { versao: regras.id, recomendacao, estimativa: cartao(e), diagnostico: null };
    },

    /* grava o pacote UMA vez, com a versão da tabela que a pessoa viu (spec §3 e §7) */
    async confirmarPacote({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const dono = await donoDaConversa(vid, corpo.conversa_id, ETAPAS_PACOTE);
      exigir(!freioConfirmar(corpo.conversa_id), 429, 'Muitas tentativas seguidas. Espere um pouco ou fale pelo WhatsApp.');
      let { regras, rec, e, formato } = await pacote(corpo, CACHE);
      if (corpo?.versao !== regras.id) {
        /* a tabela guardada pode ter até 30 s: antes de dizer que a versão mudou, confere no banco. A leitura sem cache também
           renova o guardado. Só então vale o 409, e com a versão de agora (nunca com a que estava guardada) */
        ({ regras, rec, e, formato } = await pacote(corpo));
        if (corpo?.versao !== regras.id) throw new Recusa(409, TABELA_MUDOU, { versao_nova: regras.id });
      }
      exigir(!e.encaminhar_diagnostico, 409, 'Esse pacote precisa de uma conversa. Fale com a Beyon Zero pelo WhatsApp.');
      /* o mesmo pacote de novo (duplo toque, outra aba): nada a gravar (PR37-S3) */
      if (dono.estimativa && dono.estimativa.regras_id === regras.id && mesmoJson(dono.estimativa.fatores, e.fatores)) return { estimativa: cartao(e) };
      try {
        await banco('vendas_registrar_respostas', { conversa_id: corpo.conversa_id, visitante_id: vid,
          briefing: limparAtualizacao(respostasParaBriefing(rec.respostas, formato)), confianca: CONFIANCA_FORMULARIO });
        await banco('vendas_registrar_estimativa', { conversa_id: corpo.conversa_id, visitante_id: vid, regras_id: regras.id, fatores: e.fatores,
          valor_total: e.valor_total, sinal: e.sinal, prazo_dias: e.prazo_dias, fase: e.fase, detalhes: e });
      } catch (x) {
        if (!(x instanceof ErroBanco && x.codigo === '55000')) throw x;
        /* a tabela foi trocada há instantes (entre a leitura e a gravação) ou a conversa andou em outra aba */
        esquecerRegras();
        const agora = await regrasAtivas(banco);
        if (agora && agora.id !== regras.id) throw new Recusa(409, TABELA_MUDOU, { versao_nova: agora.id });
        throw new Recusa(409, PACOTE_FECHADO);
      }
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
        await banco('vendas_liberar_ia', { conversa_id: corpo.conversa_id, visitante_id: vid }).catch(() => {});
      }
    },

    /* pedir as 3 direções (devolve os ids; o navegador pede cada uma em paralelo). (PR 2a) Só com o pedido CONFIRMADO
       pelo WhatsApp, nos dois modos (decisão D2): sem pedido (o caminho antigo) ou esperando a confirmação, nada nasce.
       Uma frase por situação (aguardando, encerrado, arquivado); o banco também recusa (vendas_iniciar_geracao) */
    async gerar({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const est = await estado(vid, corpo.conversa_id);
      const semConfirmacao = recusaDoGerar(est.pedido);
      if (semConfirmacao) throw semConfirmacao;
      /* (fila manual: não há gasto de API; o disjuntor ou o teto da IA não barram quem acabou de deixar o WhatsApp) */
      if (modo !== 'manual') await dentroDoCusto(est);
      /* no modo manual, uma geração por conversa: a 2ª só por pedido explícito ao dono (spec §0) */
      return banco('vendas_iniciar_geracao', { conversa_id: corpo.conversa_id, visitante_id: vid, max_geracoes: modo === 'manual' ? 1 : TETOS.geracoes_por_conversa });
    },

    /* gerar UMA direção (cabe nos 300 s da função) */
    async gerarDirecao({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id) && ehUuid(corpo?.direcao_id), 400, 'Dados inválidos.');
      const est = await estado(vid, corpo.conversa_id);
      exigirNaoDescartado(est);
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
        }
      });   /* (o registro da chamada é gravado UMA vez, no finally de comReserva, antes de a reserva sair) */
    },

    async escolher({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id) && ehUuid(corpo?.direcao_id), 400, 'Dados inválidos.');
      exigirNaoDescartado(await estado(vid, corpo.conversa_id));
      return banco('vendas_escolher', { conversa_id: corpo.conversa_id, visitante_id: vid, direcao_id: corpo.direcao_id });
    },

    /* o escopo final (montado pelo código; o preço é o da última estimativa, conferido pelo banco) */
    async escopo({ request, corpo }) {
      const vid = await visitante(request);
      exigir(ehUuid(corpo?.conversa_id), 400, 'Conversa inválida.');
      const est = await estado(vid, corpo.conversa_id);
      exigirNaoDescartado(est);
      exigir(est.escolha && est.estimativa, 409, 'Escolha uma direção antes.');
      const direcao = est.versao_final || est.direcoes.find(d => d.id === est.escolha.direcao_id)?.conteudo;
      exigir(direcao, 409, 'Escolha uma direção antes.');
      /* quem volta depois que a retenção de 2 meses apagou o resumo do caso e os pedidos de ajuste (o contato fica 12
         meses): o escopo sairia sem o que foi combinado; melhor recomeçar (revisão técnica do PR 35) */
      const apagado = !Object.keys(est.conversa.briefing || {}).length || (est.alteracoes || []).some(a => a.pedido === '[apagado]');
      exigir(!apagado, 409, 'Este orçamento ficou parado por muito tempo e parte do que você contou foi apagada pelo nosso prazo de privacidade. Comece um novo orçamento ou fale com a Beyon Zero pelo WhatsApp.');
      const aplicadas = est.alteracoes.filter(a => a.status === 'aplicada').flatMap(a => (a.mudancas || []).filter(m => m.aplicada));
      /* (PR 3a) dos pedidos livres o resumo recebe só a situação (o texto da pessoa fica fora do contrato: spec §7) */
      const pedidosLivres = est.alteracoes.filter(a => a.origem === 'livre').map(a => ({ status: a.status }));
      const { titulo, escopo } = montarEscopo({ estimativa: est.estimativa.detalhes, direcao, alteracoesAplicadas: aplicadas, briefing: est.conversa.briefing, pedidosLivres });
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
      exigirNaoDescartado(est);
      if (!est.conversa.tem_contato) throw new Recusa(409, 'Antes de pagar, precisamos do seu contato de novo: fale com a Beyon Zero pelo WhatsApp citando o código do pedido.', { whatsapp: true });
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
