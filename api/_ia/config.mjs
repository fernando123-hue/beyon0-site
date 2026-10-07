/* ==========================================================================
   CAMADA DE IA — configuração (um lugar só; docs/fase2/01-ARQUITETURA.md).
   Decisão do dono (2026-10-06): Claude Sonnet 5.5 com esforço médio na
   conversa; Claude Opus 5.5 com esforço alto na geração das 3 direções
   ("tão boas que se vendam sozinhas"). Preços oficiais por milhão de tokens
   (cache de 2026-09-25 da referência da API), usados só para MEDIR o custo
   de cada conversa e aplicar os tetos — não para cobrar ninguém.
   ========================================================================== */
export const PAPEIS = {
  conversa: { modelo: 'claude-sonnet-5-5', esforco: 'medium', max_tokens: 4000, timeout_ms: 45000 },
  extracao: { modelo: 'claude-sonnet-5-5', esforco: 'low', max_tokens: 3000, timeout_ms: 45000 },
  geracao: { modelo: 'claude-opus-5-5', esforco: 'high', max_tokens: 24000, timeout_ms: 240000 }
};

/* US$ por milhão de tokens: entrada, saída, leitura de cache, escrita de cache (~1,25× a entrada) */
export const PRECO_POR_MILHAO = {
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cache_leitura: 0.2, cache_escrita: 2.5 },
  'claude-opus-5-5': { entrada: 4, saida: 20, cache_leitura: 0.2, cache_escrita: 5 },
  'claude-haiku-4-5': { entrada: 1, saida: 5, cache_leitura: 0.1, cache_escrita: 1.25 }
};

/* tetos de custo (operacionais, não comerciais): passou, o agente para com elegância e oferece o WhatsApp */
export const TETOS = {
  conversa_usd: 1.5,          // por conversa (descoberta + direções + alterações)
  dia_usd: 25,                // somando todas as conversas do dia
  turnos_por_conversa: 40,
  geracoes_por_conversa: 3    // = app.vendas_iniciar_geracao (max_geracoes)
};

export function custoUsd(modelo, uso) {
  const p = PRECO_POR_MILHAO[modelo];
  if (!p || !uso) return 0;
  const m = 1e6;
  return (uso.entrada || 0) * p.entrada / m + (uso.saida || 0) * p.saida / m
    + (uso.cache_leitura || 0) * p.cache_leitura / m + (uso.cache_escrita || 0) * p.cache_escrita / m;
}
