/* ==========================================================================
   O MODO SOMBRA (F3 do JEV): o classificador Haiku v2 lê o turno do Zero DEPOIS
   que a resposta já saiu, e só MEDE. Nada aqui muda resposta, tempo, preço,
   fluxo ou decisão: roda em segundo plano (waitUntil no Worker), começa na
   próxima volta do relógio e qualquer falha (motor, prazo, disjuntor, banco)
   some calada, com um log técnico sem texto.
   • Desligado por padrão: liga só com JEV_SOMBRA=1 E a chave da Anthropic.
   • Teto do dia (US$ 0,30, JEV_SOMBRA_TETO_DIA_USD) lido do banco antes de cada
     turno e somado a cada leitura; bateu, para até o dia seguinte (Brasília).
     O que pode passar: as leituras já em voo ao mesmo tempo (~US$ 0,0003 cada).
   • Amostragem opcional (JEV_SOMBRA_AMOSTRA, 0 a 1; padrão 1 = todo turno).
   • Lê três textos: a mensagem do visitante, a saída do modelo ANTES das travas
     e a resposta final (só se ela for diferente da saída do modelo).
   • O texto chega ao Haiku só pelo portão de sinalizar() (montarPedido) e
     NUNCA vai ao banco: o registro (app.jev_sombra) guarda ids, rótulos,
     probabilidades, os sinais de código, a divergência, versões, custo e tempo.
   ========================================================================== */
import { sinalizar, criarDisjuntor } from './index.mjs';
import { VERSAO_PERGUNTAS, VERSAO_PROTECAO } from './perguntas.mjs';
import { VERSAO_POLITICA } from './politica.mjs';
import { lerCodigo, SAUDE_HUMANA } from './sinais-de-codigo.mjs';
import { criarMotorHaiku, MODELO_DO_MOTOR, VERSAO_INSTRUCAO, PRAZO_DO_MOTOR_MS } from './motor-haiku.mjs';
import { custoUsd } from '../_ia/config.mjs';
import { ORG } from '../_vendas/org.mjs';

export const TETO_DIA_USD_PADRAO = 0.3;
const TETO_DIA_USD_MAXIMO = 5;   /* (uma variável errada não vira gasto grande: acima disto volta ao padrão) */
export const PRAZO_SOMBRA_MS = PRAZO_DO_MOTOR_MS;
/* p_sim a partir da qual o Haiku conta como "sim" na comparação com o código: o mesmo limiar da F2 */
export const LIMIAR_DA_COMPARACAO = 0.5;
/* o prazo estourou: o provedor pode ter cobrado; conta a saída máxima (2000 tokens) para o teto não ficar cego */
const PIOR_CASO_USD = custoUsd(MODELO_DO_MOTOR, { saida: 2000 });

const numeroEntre = (v, min, max, padrao) => {
  if (typeof v !== 'string' || v.trim() === '') return padrao;
  const n = Number(v);
  return Number.isFinite(n) && n > min && n <= max ? n : padrao;
};

export function configSombra(env = {}) {
  return {
    ligada: env.JEV_SOMBRA === '1' && !!env.ANTHROPIC_API_KEY,
    tetoDiaUsd: numeroEntre(env.JEV_SOMBRA_TETO_DIA_USD, 0, TETO_DIA_USD_MAXIMO, TETO_DIA_USD_PADRAO),
    amostra: numeroEntre(env.JEV_SOMBRA_AMOSTRA, 0, 1, 1)
  };
}

/* um disjuntor por isolado do Worker: 3 falhas seguidas param a sombra por 10 minutos */
const DISJUNTOR = criarDisjuntor();
const logPadrao = dados => console.error(JSON.stringify({ origem: 'jev_sombra', nivel: 'erro', ...dados }));
/* a próxima volta do relógio (macrotarefa): nada da sombra roda no caminho da resposta, nem como microtarefa */
const proximaVolta = () => new Promise(r => setTimeout(r, 0));

/* o Haiku no vocabulário do código: 'sim'/'nao' ou, no nicho, 'regulado'/'livre' */
function rotuloDoMotor(pergunta, sinal) {
  if (!sinal) return null;
  if (pergunta === 'nicho_saude') return SAUDE_HUMANA.has(sinal.escolha) ? 'regulado' : 'livre';
  return typeof sinal.p_sim === 'number' ? (sinal.p_sim >= LIMIAR_DA_COMPARACAO ? 'sim' : 'nao') : null;
}
const MARCA = new Set(['sim', 'regulado']);
function divergencias(codigo, sinais) {
  if (!sinais) return [];
  return Object.entries(codigo).flatMap(([pergunta, doCodigo]) => {
    const doMotor = rotuloDoMotor(pergunta, sinais[pergunta]);
    if (!doMotor || doMotor === doCodigo) return [];
    return [pergunta + (MARCA.has(doMotor) ? ':so_haiku' : ':so_codigo')];
  });
}

const temTexto = t => typeof t === 'string' && t.trim() !== '';
/* os textos do turno: a resposta final só quando difere da saída do modelo (o mesmo texto não se paga duas vezes) */
function alvosDo(turno) {
  const lista = [['entrada_do_visitante', 'entrada', turno.mensagem]];
  if (temTexto(turno.textoDoModelo)) {
    lista.push(['saida_do_zero', 'modelo', turno.textoDoModelo]);
    if (temTexto(turno.respostaFinal) && turno.respostaFinal.trim() !== turno.textoDoModelo.trim()) lista.push(['saida_do_zero', 'final', turno.respostaFinal]);
  }
  return lista.filter(([, , texto]) => temTexto(texto));
}

/* criarMotor(aoMedir) → { nome, modelo, chamar }: um motor por leitura, para o custo medido ser o DESTA leitura */
export function criarSombra({ config, banco, criarMotor, disjuntor = DISJUNTOR, sortear = Math.random, adiar = proximaVolta, log = logPadrao, prazoMs = PRAZO_SOMBRA_MS }) {
  async function ler(turno, tarefa, alvo, texto) {
    const medida = { custo_usd: 0 };
    const { rotulos, politica } = lerCodigo(tarefa, texto, { nicho: turno.nicho });
    const motor = criarMotor(m => { if (Number.isFinite(m?.custo_usd)) medida.custo_usd += m.custo_usd; });
    const t0 = Date.now();
    const r = await sinalizar(tarefa, texto, { motor, sinaisDeCodigo: politica, prazoMs, disjuntor });
    const custo = !r.disponivel && r.motivo === 'prazo' ? Math.max(medida.custo_usd, PIOR_CASO_USD) : medida.custo_usd;
    const sinais = r.disponivel ? r.sinais : null;
    await banco('vendas_sombra_registrar', {
      conversa_id: turno.conversaId, visitante_id: turno.visitanteId, request_id: turno.requestId || null, tarefa, alvo,
      disponivel: r.disponivel, motivo: r.disponivel ? null : r.motivo, sinais, codigo: rotulos, divergencias: divergencias(rotulos, sinais),
      versoes: { perguntas: VERSAO_PERGUNTAS[tarefa], protecao: VERSAO_PROTECAO, politica: VERSAO_POLITICA, instrucao: VERSAO_INSTRUCAO },
      modelo: String(motor.modelo ?? MODELO_DO_MOTOR).slice(0, 60), custo_usd: Number(custo.toFixed(6)), ms: Date.now() - t0, cortado: r.cortado, mascarados: r.mascarados
    }).catch(e => log({ evento: 'registro não gravado', codigo: e?.codigo ?? null }));
    return custo;
  }

  /* turno: { conversaId, visitanteId, requestId, mensagem, textoDoModelo, respostaFinal, nicho }. Nunca rejeita */
  async function observar(turno) {
    let chamadas = 0;
    try {
      if (!config?.ligada || !turno) return { chamadas, motivo: 'desligada' };
      await adiar();
      if (!(sortear() < config.amostra)) return { chamadas, motivo: 'amostra' };
      const gasto = await banco('vendas_sombra_gasto_dia', { org_slug: ORG }).catch(e => { log({ evento: 'gasto do dia não lido', codigo: e?.codigo ?? null }); return null; });
      let usado = Number(gasto?.custo_usd);
      if (gasto === null || !Number.isFinite(usado)) return { chamadas, motivo: 'gasto ilegível' };
      for (const [tarefa, alvo, texto] of alvosDo(turno)) {
        if (usado >= config.tetoDiaUsd) { log({ evento: 'teto do dia', nivel: 'info' }); return { chamadas, motivo: 'teto' }; }
        chamadas++;
        usado += await ler(turno, tarefa, alvo, texto);
      }
      return { chamadas };
    } catch (e) {
      log({ evento: 'sombra falhou', erro: e?.name ?? 'erro' });   /* (sem mensagem: pode ter texto) */
      return { chamadas, motivo: 'falhou' };
    }
  }
  return { observar };
}

/* a sombra do ambiente: null quando desligada (sem motor, sem banco, sem custo). Ligada, o SDK só é carregado no segundo
   plano, na primeira leitura; nada pesa no caminho da resposta */
export function sombraDoAmbiente(env, { banco, criarMotor } = {}) {
  const config = configSombra(env);
  if (!config.ligada || typeof banco !== 'function') return null;
  let cliente = null;
  const fabrica = criarMotor || (aoMedir => ({
    nome: 'haiku-' + VERSAO_INSTRUCAO,
    modelo: MODELO_DO_MOTOR,
    async chamar(pedido) {
      if (!cliente) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); cliente = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 }); }
      return criarMotorHaiku({ cliente, aoMedir }).chamar(pedido);
    }
  }));
  return criarSombra({ config, banco, criarMotor: fabrica });
}
