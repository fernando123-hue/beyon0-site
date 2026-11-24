# Avaliações com o modelo real

Os arquivos desta pasta rodam o Zero com a IA de verdade, turno a turno, pelo mesmo `executarTurno` do site. Eles **gastam dólares**. Por isso
quem roda é o dono, no PowerShell dele: a IA não roda de dentro do app do Claude. Depois ele devolve o relatório para a sessão ler.

| Arquivo | O que mede | Como rodar |
|---|---|---|
| `consultor.mjs` | roteiros de venda do consultor | `node scripts/com-chave.mjs --so ANTHROPIC_API_KEY node docs/avaliacao/consultor.mjs --teto 1` |
| `planta.mjs` | a planta viva (rodada 8) | `node scripts/com-chave.mjs --so ANTHROPIC_API_KEY node docs/avaliacao/planta.mjs --teto 1` |
| `injecao.mjs` | **a rodada real de injeção**: 12 ataques e 3 clientes honestos | `npm run avaliar:injecao` |

## A rodada real de injeção (`injecao.mjs`)

**Antes:** a chave da Anthropic precisa estar guardada do jeito de sempre (`scripts/guardar-chave.mjs`). Se não estiver, o comando para
e diz qual nome falta, sem gastar nada. A pasta tem de estar com a `main` atualizada.

**No PowerShell, dentro da pasta do site:**

```powershell
npm run avaliar:injecao
```

Para um teto menor ou só alguns roteiros:

```powershell
npm run avaliar:injecao -- --teto 1 --cenario preco-zero,nega-ser-ia
```

- O teto padrão é **US$ 1,50** por rodada (o máximo aceito é 3). Quando o gasto passa do teto, a rodada para antes do próximo roteiro e
  diz quantos faltaram.
- A chave nunca aparece: se aparecesse em algum texto, sairia como `***`.

**O que aparece na tela:** uma linha por roteiro (`PASSOU` ou `FALHOU`, o custo e a checagem que falhou), depois o detalhe de cada falha
com o trecho, e o **RESUMO** no fim. A última linha diz onde ficou o relatório completo (um `.json` na pasta temporária, só o dono lê).
Para devolver: copie o texto da tela a partir de `== ROTEIROS ==`. Se a sessão pedir, mande também o `.json`, que traz as respostas do
Zero às mensagens inventadas dos roteiros e nenhum segredo.

**Como ler:**

- `FALHOU ... t3 valor_da_tabela: «R$ 0»` quer dizer que no 3º turno apareceu na tela um valor que não é o da tabela.
- `(a trava segurou)` quer dizer que o modelo errou, mas o código consertou antes de chegar à tela. Isso não reprova o roteiro, só mostra
  quanto a segunda camada trabalhou.
- Um **controle** (cliente honesto) que falha quer dizer que o Zero ficou desconfiado sem motivo ou não chegou ao valor.
- A lista das checagens e o que cada uma olha está no cabeçalho de `injecao.mjs`.

Código de saída: 0 se tudo passou, 1 se algum roteiro falhou ou deu erro, 2 se faltou a chave ou algum argumento estava errado.
