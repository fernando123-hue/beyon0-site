/* ==========================================================================
   CAMADA DE IA — Claude pela API da Anthropic (SDK oficial @anthropic-ai/sdk,
   versão fixa). Só este arquivo conhece o provedor.
   • modelo e esforço por papel (_ia/config.mjs); pensamento adaptativo é o
     padrão nos modelos 5.5 (não se desliga: o esforço é o controle);
   • fallback do servidor no modo "default" (beta server-side-fallback-2026-07-01), só nos modelos que o têm
     (COM_FALLBACK): se o modelo recusar por política, a Anthropic tenta outro no mesmo pedido;
   • modelo RESERVA na queda (MODELO_RESERVA, auto-reparo 15/11): 5xx/529 ou rede depois das repetições → uma
     tentativa no reserva (hoje só o Zero: Sonnet 5.5 → Sonnet 5, mesmo preço por token);
   • o prompt de sistema vai com cache_control (é estável): conversas seguidas
     pagam ~10% pela parte repetida;
   • ferramenta nunca é forçada (nos 5.5 isso é recusado): o prompt orienta;
   • saída estruturada por output_config.format (JSON Schema) quando há esquema;
   • tempo máximo e tentativas controladas; erros tipados do SDK viram ErroIA.
   A chave vem só de process.env.ANTHROPIC_API_KEY (Vercel/Infisical), nunca do código.
   ========================================================================== */
import Anthropic from '@anthropic-ai/sdk';
import { PAPEIS, RESERVA_DO_PAPEL, custoUsd, TENTATIVAS_PADRAO, COM_FALLBACK, MODELO_RESERVA } from './config.mjs';
import { ErroIA } from './provedor.mjs';

const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
const STATUS_DA_CONTA = new Set([402, 403, 404]);
/* o 400 de limite de gasto não tem tipo próprio (é invalid_request_error): só a mensagem do PROVEDOR distingue.
   Ancorado no começo da mensagem (o provedor cita campo e posição, não o texto do visitante). Fontes: doc oficial de
   limites ("You have reached your specified API usage limits" / "...workspace API usage limits") e a mensagem de
   conta sem crédito ("Your credit balance is too low…", conhecida, não documentada na página de erros) */
const LIMITE_DE_GASTO = /^(You have reached your specified (workspace )?API usage limits|Your credit balance is too low)/i;
const mensagemDoProvedor = e => String(e?.error?.error?.message || '');
/* sem texto do visitante: status, tipo do erro e o id do pedido para achar no painel da Anthropic */
const logErroProvedor = e => console.error(JSON.stringify({ origem: 'ia', nivel: 'erro', status: e.status, tipo: String(e?.error?.error?.type || '').slice(0, 40) || null, request_id_provedor: String(e.requestID || '').slice(0, 80) || null }));

/* a queda do PROVEDOR, a que o reserva pode cobrir: 5xx (inclui o 529 de sobrecarga) e erro de rede. Tempo esgotado não
   (já se esperou o tempo de cada tentativa) e 4xx não (o pedido ou a conta: o reserva daria o mesmo erro) */
const ehQueda = e => e instanceof Anthropic.InternalServerError
  || (e instanceof Anthropic.APIConnectionError && !(e instanceof Anthropic.APIConnectionTimeoutError));

/* o mesmo pedido no reserva; o parâmetro do fallback do servidor só vai se o reserva também o tiver */
function noReserva(pedido, reserva) {
  const { betas, fallbacks, ...resto } = pedido;
  return { ...resto, model: reserva, ...(COM_FALLBACK.has(reserva) ? { betas, fallbacks } : {}) };
}
/* o ORÇAMENTO DE TEMPO do reserva (revisões do PR #170): as tentativas do modelo principal podem ter levado até 3 × o tempo
   máximo do papel; o reserva só entra se a queda veio cedo (até 30 s) e tem no máximo 25 s, para a resposta caber em ~1 min */
const RESERVA_SO_ATE_MS = 30000;
const RESERVA_TEMPO_MS = 25000;
/* sem texto do visitante: o evento, o status, o tipo e o id do pedido (o mesmo formato de logErroProvedor) */
const logIA = (evento, e) => console.error(JSON.stringify({ origem: 'ia', nivel: 'erro', evento, status: e?.status ?? null,
  tipo: String(e?.error?.error?.type || '').slice(0, 40) || null, request_id_provedor: String(e?.requestID || '').slice(0, 80) || null }));

/* o erro do SDK vira ErroIA (o motivo decide o disjuntor e o alerta do vigia) */
function erroIA(e, cfg, tentativas) {
  if (e instanceof Anthropic.APIError && e.status >= 400 && e.status < 500) logErroProvedor(e);   /* (inclui 401 e 429) */
  if (e instanceof Anthropic.RateLimitError) return new ErroIA('limite', 'limite de uso do provedor');
  /* tempo esgotado: o modelo pode ter gerado (e cobrado) em cada tentativa. Sem o uso real, conta o PIOR caso
     (a saída máxima do papel por tentativa), para o teto não ficar cego */
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ErroIA('tempo', 'tempo esgotado', custoUsd(cfg.modelo, { saida: cfg.max_tokens }) * (1 + tentativas));
  if (e instanceof Anthropic.AuthenticationError) return new ErroIA('indisponivel', 'credencial recusada');
  /* problema da CONTA, não do pedido (doc oficial "Claude API errors"): 402 cobrança, 403 permissão, 404 modelo ou
     recurso, e o 400 de limite de gasto/saldo. Conta no disjuntor e no alerta, senão o funil para sem aviso */
  if (e instanceof Anthropic.APIError && STATUS_DA_CONTA.has(e.status)) return new ErroIA('indisponivel', 'provedor HTTP ' + e.status);
  if (e instanceof Anthropic.APIError && e.status === 400 && e?.error?.error?.type === 'invalid_request_error'
    && LIMITE_DE_GASTO.test(mensagemDoProvedor(e))) return new ErroIA('indisponivel', 'limite de gasto ou saldo da conta');
  /* o resto dos 4xx (menos 429) vem do pedido — o conteúdo que o visitante controla —, não do provedor fora do ar:
     "entrada" não conta no disjuntor (app.vendas_ia_disponivel); 5xx e sem status, sim ("falha") */
  if (e instanceof Anthropic.APIError && e.status >= 400 && e.status < 500) return new ErroIA('entrada', 'provedor HTTP ' + e.status);
  if (e instanceof Anthropic.APIError) return new ErroIA('falha', 'provedor HTTP ' + (e.status || '?'));
  return new ErroIA('falha', 'erro de rede');
}

/* ajustes: { papel: { esforco } } só para a AVALIAÇÃO comparar níveis (docs/avaliacao/consultor.mjs); o site não passa */
/* deps.agora: o relógio do orçamento de tempo do reserva (testes) */
export function criarAnthropic(env = process.env, cliente, ajustes = {}, { agora = Date.now } = {}) {
  const client = cliente || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: TENTATIVAS_PADRAO });

  async function mensagem({ papel, sistema, contexto, mensagens, ferramentas, esquema, reserva = false }) {
    const cfg = PAPEIS[papel] && { ...PAPEIS[papel], ...(reserva === true ? RESERVA_DO_PAPEL[papel] : {}), ...(ajustes[papel] || {}) };
    if (!cfg) throw new ErroIA('falha', 'papel desconhecido: ' + papel);
    const pedido = {
      model: cfg.modelo,
      max_tokens: cfg.max_tokens,
      system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }, ...(contexto ? [{ type: 'text', text: contexto }] : [])],   /* o fixo em cache; o estado do turno depois */
      messages: mensagens,
      output_config: { effort: cfg.esforco, ...(esquema ? { format: { type: 'json_schema', schema: esquema } } : {}) }
    };
    if (COM_FALLBACK.has(cfg.modelo)) Object.assign(pedido, { betas: [BETA_FALLBACK], fallbacks: 'default' });
    if (ferramentas && ferramentas.length) pedido.tools = ferramentas;

    const tentativas = cfg.tentativas ?? TENTATIVAS_PADRAO;
    const opcoes = { timeout: cfg.timeout_ms, maxRetries: tentativas };
    const chamar = (p, o) => (cfg.max_tokens > 16000
      ? client.beta.messages.stream(p, o).finalMessage()   /* (saída longa: streaming evita o tempo esgotado do HTTP) */
      : client.beta.messages.create(p, o));
    let r, feito = pedido;
    const inicio = agora();
    try {
      r = await chamar(pedido, opcoes);
    } catch (e) {
      /* o MODELO RESERVA (config.MODELO_RESERVA): só na queda do provedor, depois das repetições do SDK, uma vez, sem repetir,
         e só dentro do orçamento de tempo. O pensamento assinado de uma rodada anterior do mesmo turno vai junto: a API
         descarta, sem cobrar, o bloco que o modelo novo não lê (referência da API). Se o reserva também falhar, vale o erro
         da queda original (o disjuntor conta a queda; um 4xx do reserva não pode virar "entrada" e esconder o provedor
         fora do ar). Só chamadas sem streaming: hoje o único papel com reserva (a conversa) não usa streaming */
      const reserva = MODELO_RESERVA[cfg.modelo];
      if (!reserva || !ehQueda(e) || agora() - inicio > RESERVA_SO_ATE_MS) throw erroIA(e, cfg, tentativas);
      logIA('queda coberta pelo modelo reserva', e);   /* (a queda coberta não some: fica no log com o status) */
      feito = noReserva(pedido, reserva);
      try { r = await chamar(feito, { ...opcoes, timeout: Math.min(cfg.timeout_ms, RESERVA_TEMPO_MS), maxRetries: 0 }); }
      catch (e2) {
        logIA('o modelo reserva também falhou', e2);
        const erro = erroIA(e, cfg, tentativas);
        /* o reserva esgotou o tempo: pode ter gerado e cobrado; conta o pior caso dele, para o teto não ficar cego */
        if (e2 instanceof Anthropic.APIConnectionTimeoutError) erro.custo_usd += custoUsd(reserva, { saida: cfg.max_tokens });
        throw erro;
      }
    }

    /* sem uso na resposta: o pior caso do papel (a saída máxima), nunca zero — o teto não fica cego */
    const uso = r.usage ? {
      entrada: r.usage.input_tokens || 0,
      saida: r.usage.output_tokens || 0,
      cache_leitura: r.usage.cache_read_input_tokens || 0,
      cache_escrita: r.usage.cache_creation_input_tokens || 0
    } : { entrada: 0, saida: cfg.max_tokens, cache_leitura: 0, cache_escrita: 0 };
    const modelo = r.model || cfg.modelo;
    /* o mesmo modelo pedido com sufixo (ex.: data) conta pela tabela dele; contado como o mais caro, o Haiku sairia ~40×
       mais caro e a conversa bateria o teto em poucos turnos (revisões do PR do Haiku). Outro id segue a regra geral */
    const modeloCusto = modelo.startsWith(feito.model + '-') ? feito.model : modelo;   /* (feito.model: o pedido ou o reserva) */
    const base = { modelo, uso, custo_usd: custoUsd(modeloCusto, uso) };
    if (r.stop_reason === 'refusal') return { ...base, parada: 'recusa', texto: '', json: null, chamadas: [], conteudo: r.content };
    const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const chamadas = r.content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, nome: b.name, entrada: b.input }));
    let json = null;
    if (esquema) {
      try { json = JSON.parse(texto); } catch { throw new ErroIA('formato', 'a resposta não veio no formato pedido', base.custo_usd); }
    }
    const parada = r.stop_reason === 'tool_use' ? 'ferramenta' : r.stop_reason === 'max_tokens' ? 'limite' : 'fim';
    return { ...base, parada, texto, json, chamadas, conteudo: r.content };
  }

  return { nome: 'anthropic', mensagem };
}
