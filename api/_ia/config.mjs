/* ==========================================================================
   CAMADA DE IA — configuração (um lugar só; docs/fase2/01-ARQUITETURA.md).
   Decisão do dono (2026-10-06): Claude Opus 5.5 com esforço alto na geração
   das 3 direções ("tão boas que se vendam sozinhas"). MODO ECONÔMICO (dono,
   2026-10-08, até haver dinheiro para a API): a conversa e a extração do
   briefing no Claude Haiku 5.5 (~20× mais barato que o Sonnet 5.5). Os
   ajustes do modelo escolhido (PR 3a) não chamam IA: opções prontas e pedido
   escrito para o dono (api/_vendas/fluxo-ajustes.mjs).
   Preços oficiais por milhão de tokens (cache de 2026-10-06 da referência da
   API), usados só para MEDIR o custo de cada conversa e aplicar os tetos —
   não para cobrar ninguém.
   ========================================================================== */
import { ambienteDe } from '../_ambiente.mjs';
export const PAPEIS = {
  conversa: { modelo: 'claude-haiku-5-5', esforco: 'medium', max_tokens: 4000, timeout_ms: 45000 },
  extracao: { modelo: 'claude-haiku-5-5', esforco: 'low', max_tokens: 3000, timeout_ms: 45000 },
  /* (sem nova tentativa automática: 2 × 240 s não cabem nos 300 s da função; a tela oferece "gerar de novo") */
  geracao: { modelo: 'claude-opus-5-5', esforco: 'high', max_tokens: 24000, timeout_ms: 240000, tentativas: 0 }
};
export const TENTATIVAS_PADRAO = 2;

/* as três direções: geradas pela API na hora ("api") ou produzidas pelo dono no Claude Code, em até 24 horas úteis
   ("manual", decisão do dono 2026-10-08, enquanto não há verba para a API). BZ_DIRECOES na Vercel; lido a cada uso.
   Sem chave da Anthropic os modelos saem SEMPRE pela fila manual (spec do orçamento sem IA §7); o simulador local
   (BZ_IA=simulada / BZ_LOCAL=1) continua gerando para os testes e o servidor local. A mesma condição de criarIA
   (api/_ia/provedor.mjs): na produção da Vercel o simulador nunca liga, então lá "simulada" sem chave também é fila
   manual (senão as direções ficariam presas em "gerando", sem modelo para gerá-las) */
export const modoDirecoes = (env = process.env) => {
  if (String(env.BZ_DIRECOES || '').trim().toLowerCase() === 'manual') return 'manual';
  if (env.ANTHROPIC_API_KEY) return 'api';
  const simulada = env.BZ_LOCAL === '1' || env.BZ_IA === 'simulada';
  return simulada && ambienteDe(env) !== 'producao' ? 'api' : 'manual';
};

/* US$ por milhão de tokens: entrada, saída, leitura de cache, escrita de cache (~1,25× a entrada). `longo`: a tabela que
   vale quando a entrada inteira do pedido (sem cache + lida + escrita) passa de `ate_tokens` */
export const PRECO_POR_MILHAO = {
  'claude-haiku-5-5': { entrada: 0.1, saida: 0.5, cache_leitura: 0.01, cache_escrita: 0.125,
    ate_tokens: 100000, longo: { entrada: 0.5, saida: 2.5, cache_leitura: 0.05, cache_escrita: 0.625 } },
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cache_leitura: 0.2, cache_escrita: 2.5 },
  'claude-opus-5-5': { entrada: 4, saida: 20, cache_leitura: 0.2, cache_escrita: 5 },
  'claude-haiku-4-5': { entrada: 1, saida: 5, cache_leitura: 0.1, cache_escrita: 1.25 }
};

/* o fallback do servidor (beta server-side-fallback-2026-07-01, modo "default") existe só nestes; no Haiku 5.5 o
   parâmetro não vale (referência da API, "Migrating to Claude Haiku 5.5": recusa sem fallback do servidor) */
export const COM_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

/* tetos de custo (operacionais, não comerciais): passou, o agente para com elegância e oferece o WhatsApp */
export const TETOS = {
  conversa_usd: 1.5,          // por conversa (descoberta + direções + alterações)
  dia_usd: 25,                // somando todas as conversas do dia
  turnos_por_conversa: 40,
  geracoes_por_conversa: 3,   // = app.vendas_iniciar_geracao (max_geracoes)
  /* conversas que USAM a IA, por IP por dia, contadas no banco (o teto do dia é global: sem isto, um IP o esgotava).
     8 × conversa_usd = US$ 12 < dia_usd: um IP sozinho não derruba o agente para todos */
  conversas_por_ip_dia: 8,
  /* o mesmo teto, agora também por /48 do IPv6 (auditoria run-1, pista 1): a casa ou a empresa recebe um /48 inteiro
     (65.536 redes /64) e trocava de /64 à vontade, fugindo do teto acima. Maior que o do /64 (mais de um aparelho por
     casa), mas ainda abaixo do dia: 16 × conversa_usd (1,5) = US$ 24 < dia_usd (25), no limite; quem subir a
     conversa_usd é avisado por docs/testes/auditoria-correcoes.test.mjs. Estreita, não resolve: quem tem vários IPv4
     segue de fora (Firewall da Vercel na criação da sessão e limite de gasto na Anthropic, com o dono) */
  conversas_por_ip48_dia: 16
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
   ~US$ 0,40 a 0,70 → até ~0,23 cada). Conversa e extração no Haiku 5.5: um turno com o sistema em cache fica na casa
   de US$ 0,001 a 0,005; 0,01 cobre com folga. A MEDIR: com chamadas reais, trocar pelo p95 de app.ia_chamadas por
   papel. O que passar da reserva ainda é somado depois (o estouro fica pequeno) */
export const RESERVA_USD = { conversa: 0.01, extracao: 0.01, geracao: 0.25 };
export function reservaUsd(papel) {
  return RESERVA_USD[papel] ?? 0.25;
}

export function custoUsd(modelo, uso) {
  const tabela = PRECO_POR_MILHAO[modelo] || MAIS_CARO;
  if (!uso) return 0;
  const entradaToda = (uso.entrada || 0) + (uso.cache_leitura || 0) + (uso.cache_escrita || 0);
  const p = tabela.longo && entradaToda > tabela.ate_tokens ? tabela.longo : tabela;
  const m = 1e6;
  return (uso.entrada || 0) * p.entrada / m + (uso.saida || 0) * p.saida / m
    + (uso.cache_leitura || 0) * p.cache_leitura / m + (uso.cache_escrita || 0) * p.cache_escrita / m;
}
