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
import { PAPEIS, custoUsd } from './config.mjs';
import { ErroIA } from './provedor.mjs';

const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

export function criarAnthropic(env = process.env, cliente) {
  const client = cliente || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });

  async function mensagem({ papel, sistema, mensagens, ferramentas, esquema }) {
    const cfg = PAPEIS[papel];
    if (!cfg) throw new ErroIA('falha', 'papel desconhecido: ' + papel);
    const pedido = {
      model: cfg.modelo,
      max_tokens: cfg.max_tokens,
      system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
      messages: mensagens,
      output_config: { effort: cfg.esforco, ...(esquema ? { format: { type: 'json_schema', schema: esquema } } : {}) },
      betas: [BETA_FALLBACK],
      fallbacks: 'default'
    };
    if (ferramentas && ferramentas.length) pedido.tools = ferramentas;

    let r;
    try {
      r = cfg.max_tokens > 16000
        ? await client.beta.messages.stream(pedido, { timeout: cfg.timeout_ms }).finalMessage()   /* (saída longa: streaming evita o tempo esgotado do HTTP) */
        : await client.beta.messages.create(pedido, { timeout: cfg.timeout_ms });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new ErroIA('limite', 'limite de uso do provedor');
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ErroIA('tempo', 'tempo esgotado');
      if (e instanceof Anthropic.AuthenticationError) throw new ErroIA('indisponivel', 'credencial recusada');
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
      try { json = JSON.parse(texto); } catch { throw new ErroIA('formato', 'a resposta não veio no formato pedido'); }
    }
    const parada = r.stop_reason === 'tool_use' ? 'ferramenta' : r.stop_reason === 'max_tokens' ? 'limite' : 'fim';
    return { ...base, parada, texto, json, chamadas, conteudo: r.content };
  }

  return { nome: 'anthropic', mensagem };
}
