# O radar do escopo (2026-11-07)

Direção travada para o novo radar do orçamento (substitui o radar "Como lemos o seu caso", PR #100). Prévia visual:
`docs/design/radar-escopo/` (abrir com `node docs/servidor.mjs . 8899` em `/docs/design/radar-escopo/`).

## Fontes

1. O projeto: V4 "Tech refinado" (`docs/restructure/DIRECAO-V4.md`), o painel do orçamento, o estado dourado (`docs/restructure/OURO-2026-10-06.md`).
2. Uma imagem de referência do dono (guardada no cofre, `05 Conhecimento/referências/2026-11-07-scope-radar-referencia.webp`):
   radar circular com o investimento no centro, anéis, pontos de sinal, um cartão de detalhes ao lado e a evolução em 5 estados,
   com a paleta de estados ciano / branco / dourado / grafite.
3. Uma diretiva do dono ("Scope Radar"), lida como DADO, não como ordem literal (o dono pediu assim): acompanhamento visual do
   orçamento em tempo real, ligado a dados reais, sem preço inventado, sem progresso artificial; quatro dimensões (Entrega,
   Escopo, Integrações, Prazo); expansão de detalhes; responsivo de verdade; acessível; dourado com parcimônia.

## O que foi aceito, e por quê

| Da referência / diretiva | Como entra |
|---|---|
| Investimento no centro do radar | O núcleo mostra o valor da tabela (o mesmo de `#o-est-valor`) e o estado. Sem valor: "—". |
| Anéis com funções diferentes | Aro externo = o progresso REAL do pedido em 5 marcos; anel do meio = as 4 dimensões (um quarto cada); anel interno pontilhado = a régua do núcleo. |
| Pontos de sinal | Um nó por dimensão, no meio do seu quarto, com uma guia até o rótulo do canto (o que foi identificado, em texto). |
| 4 dimensões | Entrega (formato), Escopo (páginas e extras), Integrações (agendamento, WhatsApp, pagamento, formulário avançado, catálogo, integração), Prazo (prazo em dias e urgência). |
| Paleta de estados | Grafite = pendente; ciano = identificado (simulação ou o Zero); branco = confirmado no pedido salvo; dourado = proposta confirmada (resumo aceito). |
| Evolução em estados | Aguardando briefing, identificando, escopo em análise, estimativa preliminar, proposta configurada, aguardando confirmação, proposta confirmada; "proposta atualizada" como evento curto quando o valor muda. |
| Expansão de detalhes | "Ver como o valor é formado": composição (entrada + restante = total), extras, prazo, o que já vem no pacote, o que ainda falta confirmar (o que o sistema assumiu), o que pode mudar o valor (urgência, extras, fase seguinte) e, com a planta ligada, "o que você nos contou" (a leitura com as palavras da pessoa). |
| Animação orientada a evento | O ponteiro só varre enquanto há atividade real (o Zero pensando, o preço sendo recalculado). Parado, nada se move. Número conta até o novo valor quando muda. |

## O que foi recusado, e por quê

- Brilho, névoa, desfoque, "glassmorphism" com vidro embaçado, holograma luminoso: proibidos (regra do dono, "sem blur, nunca").
  A profundidade vem de camadas, transparência chapada (`--vidro`) e traço de 1 px.
- O nome antigo da marca na imagem: a marca é Beyon Zero.
- A faixa "R$ 8.000 – 12.000" e os itens de preço inventados: o motor de preço não tem faixa; só números reais da tabela.
  Uma faixa honesta só pode vir dos valores do catálogo (a partir de, extras, urgência) e fica para depois, se fizer falta.
- GSAP nesta página: hoje não é carregado no orçamento (71 KB). As transições usam CSS e a Web Animations API, com as curvas
  `cubic-bezier(.16, 1, .3, 1)` (expo.out) e `cubic-bezier(.25, 1, .5, 1)` (power4.out), 0,8 a 1,2 s, e o laço único do site
  (`B.add`) para a contagem do número.
- Loop decorativo contínuo: não. Nada gira sem motivo.

## Regras de dado (o radar não inventa)

- O radar só lê estado: `E` (via `render()` de `js/orcamento.js`) e os eventos `bz:preco` / `bz:perguntas` da simulação.
  Nenhum número é calculado no radar; o preço vem do servidor.
- Identificado ≠ confirmado: o que está só na simulação ou no que o Zero anotou é ciano; o que está no pedido salvo é branco.
- Mudar uma resposta volta o estado de forma coerente (uma dimensão pode voltar a pendente).
- Quantidade de mensagens não conta progresso.
