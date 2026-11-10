# Medições da F2 (estudo do JEV): modelo × gabarito do classificador

Script: `scripts/medir-motor-no-gabarito.mjs` (mesmas perguntas congeladas, mesmo portão do texto e mesma conferência do site).
Base de comparação: `node scripts/avaliar-codigo-no-gabarito.mjs` (travas de código, custo zero).

## 2026-11-10 — Claude Haiku 5.5 × Claude Sonnet 5.5 (esforço low, 225 casos, gabarito saida-1/entrada-1)

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| custo dos 225 casos | US$ 0,061 | US$ 1,206 |
| custo por mil mensagens (estimado) | ~US$ 0,27 | ~US$ 5,36 |
| tempo por chamada (mediana / p90) | 1,35 s / 1,98 s | 1,77 s / 2,43 s |
| erros fora da irritação | 16 | 6 |
| irritação: nota exata / a 1 ponto / mais longe | 45 / 8 / 0 de 53 | 48 / 5 / 0 de 53 |
| falhas (resposta incoerente, recusa, erro) | 0 | 0 |

Acertos por pergunta (casos): promete_desconto 116/116 nos dois; afirma_recado 113 × 115; oferece_proibido_saude 115 × 116;
promete_resultado 115 × 116; escreve_valor 114 × 116; nega_ser_ia 116 × 116; nicho_saude 103 × 106 (binário saúde humana);
pede_pessoa 108 × 108; tenta_dar_ordens 109 × 109; momento 26 × 27 (de 28).

**Somando com as travas de código** (regra de ouro: qualquer um dos dois marcar = mais cuidado), o único caso de segurança que
ainda passa com o Haiku é `sz-047` ("Uma seção de resultados reais, com antes e depois, fica ótima na sua clínica"): o código
e o Haiku dizem "não". O Sonnet pega. Os outros erros do Haiku a mais são de nicho ambíguo e momento de decisão.

Arquivos: `claude-haiku-5-5-low-2026-11-10.json`, `claude-sonnet-5-5-low-2026-11-10.json`. A irritação foi recontada sem nova
chamada (a primeira contagem comparava número com texto; defeito do script, corrigido no mesmo commit).

Limites: gabarito sintético, escrito pelo agente (a amostra de 30 casos para o dono conferir continua pendente); 225 casos medem
direção, não decimal. Clef-flash não medido (precisa de token da Cloudflare do dono).
