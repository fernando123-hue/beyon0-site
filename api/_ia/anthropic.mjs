/* ==========================================================================
   CAMADA DE IA — Claude pela API da Anthropic (SDK oficial @anthropic-ai/sdk,
   versão fixa). Só este arquivo conhece o provedor.
   • modelo e esforço por papel (_ia/config.mjs); pensamento adaptativo é o
     padrão nos modelos 5.5 (não se desliga: o esforço é o controle);
   • fallback do servidor no modo "default" (beta server-side-fallback-2026-07-01):
     se o modelo recusar por política, a Anthropic tenta outro no mesmo pedido;
   • o prompt de sistema vai com cache_control (é estável): conversas seguidas
     pagam ~10% pela parte repetida;
   • ferramenta nunca é forçada (nos 5.5 isso é recusado): o prompt orienta;
   • saída estruturada por output_config.format (JSON Schema) quando há esquema;
   • tempo máximo e tentativas controladas; erros tipados do SDK viram ErroIA.
   A chave vem só de process.env.ANTHROPIC_API_KEY (Vercel/Infisical), nunca do código.
   ========================================================================== */
import Anthropic from '@anthropic-ai/sdk';
import { PAPEIS, custoUsd, TENTATIVAS_PADRAO } from './config.mjs';
import { ErroIA } from './provedor.mjs';

const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
const STATUS_DA_CONTA = new Set([402, 403, 404]);
/* o 400 de limite de gasto não tem tipo próprio (é invalid_request_error): só a mensagem distingue */
const LIMITE_DE_GASTO = /usage limit|spend limit|spending limit|credit balance|billing/i;

export function criarAnthropic(env = process.env, cliente) {
  const client = cliente || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: TENTATIVAS_PADRAO });

  async function mensagem({ papel, sistema, contexto, mensagens, ferramentas, esquema }) {
    const cfg = PAPEIS[papel];
    if (!cfg) throw new ErroIA('falha', 'papel desconhecido: ' + papel);
    const pedido = {
      model: cfg.modelo,
      max_tokens: cfg.max_tokens,
      system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }, ...(contexto ? [{ type: 'text', text: contexto }] : [])],   /* o fixo em cache; o estado do turno depois */
      messages: mensagens,
      output_config: { effort: cfg.esforco, ...(esquema ? { format: { type: 'json_schema', schema: esquema } } : {}) },
      betas: [BETA_FALLBACK],
      fallbacks: 'default'
    };
    if (ferramentas && ferramentas.length) pedido.tools = ferramentas;

    const tentativas = cfg.tentativas ?? TENTATIVAS_PADRAO;
    const opcoes = { timeout: cfg.timeout_ms, maxRetries: tentativas };
    let r;
    try {
      r = cfg.max_tokens > 16000
        ? await client.beta.messages.stream(pedido, opcoes).finalMessage()   /* (saída longa: streaming evita o tempo esgotado do HTTP) */
        : await client.beta.messages.create(pedido, opcoes);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new ErroIA('limite', 'limite de uso do provedor');
      /* tempo esgotado: o modelo pode ter gerado (e cobrado) em cada tentativa. Sem o uso real, conta o PIOR caso
         (a saída máxima do papel por tentativa), para o teto não ficar cego */
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ErroIA('tempo', 'tempo esgotado', custoUsd(cfg.modelo, { saida: cfg.max_tokens }) * (1 + tentativas));
      if (e instanceof Anthropic.AuthenticationError) throw new ErroIA('indisponivel', 'credencial recusada');
      /* problema da CONTA, não do pedido (doc oficial "Claude API errors"): 402 cobrança, 403 permissão, 404 modelo ou
         recurso, e o 400 de limite de gasto/saldo. Conta no disjuntor e no alerta, senão o funil para sem aviso */
      if (e instanceof Anthropic.APIError && STATUS_DA_CONTA.has(e.status)) throw new ErroIA('indisponivel', 'provedor HTTP ' + e.status);
      if (e instanceof Anthropic.APIError && e.status === 400 && LIMITE_DE_GASTO.test(String(e.message))) throw new ErroIA('indisponivel', 'limite de gasto ou saldo da conta');
      /* o resto dos 4xx (menos 429) vem do pedido — o conteúdo que o visitante controla —, não do provedor fora do ar:
         "entrada" não conta no disjuntor (app.vendas_ia_disponivel); 5xx e sem status, sim ("falha") */
      if (e instanceof Anthropic.APIError && e.status >= 400 && e.status < 500) throw new ErroIA('entrada', 'provedor HTTP ' + e.status);
      if (e instanceof Anthropic.APIError) throw new ErroIA('falha', 'provedor HTTP ' + (e.status || '?'));
      throw new ErroIA('falha', 'erro de rede');
    }

    const uso = {
      entrada: r.usage?.input_tokens || 0,
      saida: r.usage?.output_tokens || 0,
      cache_leitura: r.usage?.cache_read_input_tokens || 0,
      cache_escrita: r.usage?.cache_creation_input_tokens || 0
    };
    const modelo = r.model || cfg.modelo;
    const base = { modelo, uso, custo_usd: custoUsd(modelo, uso) };
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
