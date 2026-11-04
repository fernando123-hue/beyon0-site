# Gabarito do classificador (F1 do estudo do JEV)

Casos sintéticos com a **resposta certa escrita antes** de qualquer motor rodar, para medir o classificador de perguntas fechadas
(`api/_classificador`). Nada aqui é conversa real: são frases inventadas, sem dado pessoal e sem nome de pessoa.

| Arquivo | Tarefa | Perguntas |
|---|---|---|
| `saida_do_zero.json` | o que o Zero escreveu | desconto, recado, saúde proibida, resultado, valor em dinheiro, negar ser IA |
| `entrada_do_visitante.json` | o que a pessoa escreveu | ramo de saúde, pedir uma pessoa, dar ordens ao sistema, irritação (1 a 5), momento de decisão |

## Formato

- `padrao`: a resposta de toda pergunta que o caso não escreve (na saída, tudo "nao"; na entrada, "nenhum" / "nao" / "nao").
  `irritacao` e `momento` não têm padrão: só valem quando o caso as escreve.
- `casos[]`: `id`, `origem` (`falha_real`, `parafrase`, `negacao_longe`, `injecao_na_saida`, `combinado`, `controle`, `ambiguidade`,
  `fronteira`, `irritacao`, `momento`), `texto`, `certa` (só o que difere do padrão) e, às vezes, `incerto: true`.
- `incerto: true` marca caso de fronteira (ex.: nutricionista, fisioterapeuta, psicanalista). A medição os conta à parte e o dono confere.

## Regras

1. A resposta certa se escreve **antes** de rodar qualquer motor. Corrigir o gabarito depois de ver o resultado de um motor só vale
   com a razão escrita no commit (aconteceu uma vez: `ev-076`, "clínica de fisioterapia" estava sem o ramo de saúde).
2. Texto novo: sem e-mail, telefone, documento, nome de pessoa ou da marca de terceiros; sem sinais de menor e maior.
3. Pergunta nova ou palavra mudada nas perguntas (`perguntas.mjs`) exige versão nova do gabarito (`g2`).

## Como usar

- `npm test` (arquivo `docs/testes/classificador.test.mjs`): valida o formato, os rótulos, o portão e o equilíbrio.
- `node scripts/avaliar-codigo-no-gabarito.mjs --erros`: quanto o **código atual** já acerta (custo zero). É a base que um modelo (F2)
  precisa vencer. Perguntas "sem detector" são onde um modelo teria algo a acrescentar.
