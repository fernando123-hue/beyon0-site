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
  /* (sem nova tentativa automática: 2 × 240 s não cabem nos 300 s da função; a tela oferece "gerar de novo") */
  geracao: { modelo: 'claude-opus-5-5', esforco: 'high', max_tokens: 24000, timeout_ms: 240000, tentativas: 0 }
};
export const TENTATIVAS_PADRAO = 2;

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
  geracoes_por_conversa: 3,   // = app.vendas_iniciar_geracao (max_geracoes)
  /* conversas que USAM a IA, por IP por dia, contadas no banco (o teto do dia é global: sem isto, um IP o esgotava).
     8 × conversa_usd = US$ 12 < dia_usd: um IP sozinho não derruba o agente para todos */
  conversas_por_ip_dia: 8
};

/* o mais caro da tabela, por item: um modelo fora da tabela (o servidor da Anthropic pode responder com outro)
   conta como o mais caro, nunca como zero, para os tetos não ficarem cegos */
const MAIS_CARO = Object.values(PRECO_POR_MILHAO).reduce((m, p) => ({
  entrada: Math.max(m.entrada, p.entrada), saida: Math.max(m.saida, p.saida),
  cache_leitura: Math.max(m.cache_leitura, p.cache_leitura), cache_escrita: Math.max(m.cache_escrita, p.cache_escrita)
}), { entrada: 0, saida: 0, cache_leitura: 0, cache_escrita: 0 });

/* o valor que se RESERVA no teto antes de cada chamada (app.vendas_reservar_custo). Realista, não o pior caso: com o
   pior caso (~US$ 0,56 por direção no Opus) a 3ª direção era recusada sempre que a conversa já tinha gastado mais de
   US$ 0,38 (revisões do PR 15). Base: o teto da estimativa de docs/fase2/00-AUDITORIA-E-ANALISE.md (3 direções no Opus
   ~US$ 0,40 a 0,70 → até ~0,23 cada; conversa de ~10 turnos no Sonnet ~US$ 0,05 a 0,12). A MEDIR: com chamadas reais,
   trocar pelo p95 de app.ia_chamadas por papel. O que passar da reserva ainda é somado depois (o estouro fica pequeno) */
export const RESERVA_USD = { conversa: 0.05, extracao: 0.03, geracao: 0.25 };
export function reservaUsd(papel) {
  return RESERVA_USD[papel] ?? 0.25;
}

export function custoUsd(modelo, uso) {
  const p = PRECO_POR_MILHAO[modelo] || MAIS_CARO;
  if (!uso) return 0;
  const m = 1e6;
  return (uso.entrada || 0) * p.entrada / m + (uso.saida || 0) * p.saida / m
    + (uso.cache_leitura || 0) * p.cache_leitura / m + (uso.cache_escrita || 0) * p.cache_escrita / m;
}
