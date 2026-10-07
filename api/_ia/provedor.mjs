/* ==========================================================================
   CAMADA DE IA — a interface única (o resto do sistema só fala com isto).
   A especificação pede: "não espalhe chamadas de um provedor pela aplicação;
   permita IA local → alternativa → API paga sem reconstruir". Contrato:

     await ia.mensagem({ papel, sistema, mensagens, ferramentas?, esquema? })
       papel       'conversa' | 'extracao' | 'geracao' (modelo e esforço em _ia/config.mjs)
       sistema     texto estável (vai para o cache de prompt)
       mensagens   [{ role: 'user'|'assistant', content }] (formato do Messages API)
       ferramentas [{ name, description, input_schema, strict? }]
       esquema     JSON Schema: a resposta TEM de ser um JSON nesse formato
     →  { texto, json, chamadas: [{ id, nome, entrada }], conteudo, parada, modelo, uso, custo_usd }
        parada: 'fim' | 'ferramenta' | 'limite' | 'recusa'

   Erros: lança ErroIA { motivo: 'indisponivel'|'tempo'|'limite'|'recusa'|'formato'|'falha' }.
   Quem chama transforma em uma recuperação elegante ("suas informações foram
   preservadas") — nunca inventa a resposta.

   Implementações:
     anthropic.mjs  Claude pela API (SDK oficial), com ANTHROPIC_API_KEY
     simulado.mjs   respostas determinísticas, para testes e o servidor local
   ========================================================================== */
export class ErroIA extends Error {
  /* custo_usd: o que já foi pago antes da falha (recusa, formato, resposta cortada, rodadas anteriores): o fluxo soma no teto */
  constructor(motivo, mensagem, custo_usd = 0) { super(mensagem || motivo); this.motivo = motivo; this.custo_usd = custo_usd; }
}

/* qual implementação: a chave na Vercel liga a real; o servidor local e os testes usam a simulada */
export async function criarIA(env = process.env) {
  if (env.ANTHROPIC_API_KEY) {
    const { criarAnthropic } = await import('./anthropic.mjs');
    return criarAnthropic(env);
  }
  /* nunca o simulador na produção da Vercel: proposta inventada para cliente de verdade. Sem chave lá, o consultor
     fica desligado (vendas.mjs responde 503 com o WhatsApp) */
  if (env.VERCEL_ENV === 'production') return null;
  if (env.BZ_LOCAL === '1' || env.BZ_IA === 'simulada') {
    const { criarSimulada } = await import('./simulado.mjs');
    return criarSimulada();
  }
  return null;
}
