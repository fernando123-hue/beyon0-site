# A IA real no servidor local, com teto (14/11)

Para o teste com o modelo real da spec do orçamento em conversa (`2026-11-13-orcamento-conversa-design.md` §9): 5 conversas pela página real e o teste C do mapa, com teto de **US$ 3** [D] e vídeos.

## O que já existe e o que falta

- `BZ_IA_REAL=1` com `ANTHROPIC_API_KEY` (pela `scripts/com-chave.mjs`) já faz o `docs/servidor.mjs` usar o Claude. Sem isso, ele apaga a chave e a IA é a simulada.
- **Não há teto que valha para o teste.** O teto do dia (`TETOS.dia_usd`, US$ 25) mora no banco local, em memória, e zera a cada servidor novo; o E2E e as gravações sobem um servidor por rodada. Nada impede passar dos US$ 3 somando rodadas.
- **Não há registro do gasto nem do tempo por chamada** fora do banco que some. O relatório do teste pede os dois.
- **A geração dos 3 modelos usaria o Opus** (US$ 0,4 a 0,7 cada) se uma conversa chegasse a ela: com a chave presente, `modoDirecoes` vira `api`. O teste não precisa dela.
- **Não há como repetir uma conversa sem pagar de novo.** A §9 prevê: "se a câmera lenta não combinar com a IA real, a página real reproduz a resposta gravada da IA".

## O desenho

1. **`docs/ia-local.mjs`** (só local; `docs/` não vai para o deploy) monta a IA do servidor local, em três modos:
   - **real** (`BZ_IA_REAL=1` + chave): `conversa` e `extracao` vão ao Claude; `geracao` fica na simulada, salvo `BZ_IA_REAL_GERACAO=1`;
   - **fita** (`BZ_IA_REPRODUZIR=<arquivo>`): devolve, em ordem, por papel, as respostas gravadas, no ritmo gravado (`BZ_IA_RITMO=imediato` tira a espera). Sem chave e sem gasto. Fita acabada é erro `indisponivel`, nunca resposta inventada;
   - **simulada**: o de hoje.
2. **O livro do gasto**, um JSON fora do repositório (padrão `~/.beyon-gasto-ia.json`, ou `BZ_IA_LIVRO`), soma o `custo_usd` de cada chamada real, inclusive o já pago de uma chamada que falhou, com papel, modelo, tempo e hora. Ele sobrevive aos servidores.
3. **O teto** (`BZ_IA_TETO_USD`, padrão 3; valor inválido, ≤ 0 ou > 10 volta ao padrão) é conferido ANTES de cada chamada real: o gasto do livro + o reservado das chamadas em voo + a reserva do papel (`reservaUsd`). Passou: erro `limite`, a chamada não sai, e a página mostra a recuperação de sempre.
4. **A gravação** (`BZ_IA_GRAVAR=<arquivo>`, desligada por padrão): uma linha JSON por chamada real (papel, a última fala da pessoa, ms, resposta). É o que a fita lê.
5. **O gancho em `api/_ia/provedor.mjs`:** `criarIA` usa `globalThis.__BZ_LOCAL.ia` primeiro, **só** com `ambienteDe(env) === 'local'`, como o armazém e o banco locais já fazem. Na Cloudflare e na Vercel o gancho é ignorado mesmo que exista.
6. O servidor diz no início qual modo, o teto, o gasto do livro e onde ele está (nunca a chave). `JEV_SOMBRA` é apagada no local: a sombra chama o SDK direto, fora do teto.

## Testes (nível 3: toca `api/`)

`docs/testes/ia-local.test.mjs`, com IA real falsa (sem rede):
- o teto barra antes de chamar, conta as chamadas em voo e o custo de falha;
- o livro sobrevive a uma instância nova; teto inválido volta ao padrão;
- a geração vai à simulada, salvo com o interruptor próprio;
- a gravação e a fita: a mesma resposta volta, por papel, em ordem; a fita acabada é `indisponivel`;
- o gancho de `criarIA` vale no local e é ignorado na Cloudflare.
