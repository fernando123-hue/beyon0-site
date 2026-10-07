# Referência — tela de pagamento concluído (2026-10-07)

**Pedido do dono:** "Aqui está o link do modelo que eu te falei antes: https://kokonutui.com/docs/cards/currency-transfer.
Sei que o contexto é diferente, mas deve dar para criar algo com a nossa essência a partir disso."
**Onde:** o bloco `#o-pronto` do `/orcamento` (o sinal acabou de ser pago).
**Arquivos:** `js/orcamento-recibo.js`, `css/orcamento.css` (bloco "O RECIBO"), `orcamento.html` (`#o-pronto`).

## O que o modelo tem (Kokonut UI, "Currency Transfer", MIT)
Cartão centrado de 420px; dois estados (em andamento → concluído aos 1,5 s): um arco girando em volta de um ícone
dá lugar a um ✓ num círculo (giro de -180° para 0°); título e linha de status trocam subindo; duas caixas "From"
e "To" separadas por 12px se fecham numa peça só (cantos internos retos, uma borda entre elas); a linha de câmbio
embaixo troca de "calculando" para o valor; o ID da transação em verde.

## O que entrou (o porquê)
| Do modelo | Na Beyon Zero | Por quê |
|---|---|---|
| Círculo + ✓ girando | Anel ciano de 1,5px que se FECHA girando (-150° → 0°) e o ✓ que se desenha | O fechamento é o próprio "concluído"; traço nítido é a régua de 1px da marca |
| Duas caixas que se juntam | "Pago agora" (sinal) + "Na entrega" (restante) que chegam separadas e se encaixam | Aqui as duas partes SÃO o projeto inteiro: o encaixe diz isso sem texto |
| Valor que acende (0,5 → 1) | O valor pago acende no encaixe | Mesmo gesto, mesma função |
| — | Uma linha de luz de 1px corre a junção depois do encaixe | A assinatura do site: "a luz passa e imprime" (CLAUDE.md, A assinatura) |
| ID da transação | "Código do pagamento BZ-XXXXXXXX" (início do id da tentativa) | Algo que a pessoa cita ao falar com a Beyon Zero |
| Linha de câmbio | Total do projeto + prazo, em mono | O dado que fecha a conta |

## O que NÃO entrou (e por quê)
- **Brilho desfocado** atrás do selo (`blur-2xl`) e `drop-shadow` nos traços: o dono proíbe desfoque em qualquer coisa.
- **Estado "em andamento" falso**: o modelo finge 1,5 s de processamento. Aqui o recibo só aparece depois que o
  servidor confirmou com o Mercado Pago; a espera real já fica no bloco do pagamento. Animar uma espera inventada
  seria mentir na tela.
- **Verde-esmeralda**: a cor de ação é o ciano da marca (`--ac`, `--ac-3`).
- **Tooltip** com hora da cotação: não há cotação; a data e a hora do pagamento ficam visíveis na linha do meio.
- A biblioteca (React + Motion): o `/orcamento` é HTML/CSS/JS puro; tudo em CSS (transform, opacity e o traço
  do selo de 64px, uma vez).

## A energia (2ª rodada, mesmo dia: "efeitos de energia, bem minimalista, preciso nos pequenos detalhes")
Vocabulário do próprio site, sem desfoque: cabeça branca e cauda ciano (a luz que circula nos cards), "tinta
molhada" (o H1 do Hub), "a luz passa e imprime", LED que pisca uma vez por passagem (o hero).
| Detalhe | Quando | Medida |
|---|---|---|
| Ponta branca DENTRO do fio, na frente do anel enquanto ele se fecha | 0,15–1,0 s | dash .05; offset .05 − progresso; mesma curva e giro do anel |
| Descarga: um eco de 1px sai do anel e apaga | 1,3 s (fim do ✓) | escala 1 → 1,55, 0,7 s |
| Tinta molhada no valor pago (ciano → branco) | 1,2 s (encaixe) | 1,1 s |
| Luz na junção (cabeça branca, cauda de 110px) e a marca ciano que cresce atrás dela e apaga | 1,6 s | 0,8 s; marca 30 ms atrás, ease-in cúbica = 1ª metade da curva da cabeça |
| Volta: uma luz percorre o anel, de 12 h a 12 h | a cada 9,6 s (desde 3,4 s, depois da chegada) | 1,44 s, no fio (1,5px, ponta reta) |
| LED de "Sinal pago" pisca branco | no fim de cada volta | 0,1 s acende, ~1 s apaga |
Só a parte PAGA tem energia; "Na entrega" fica apagada. Recusados: brilho/halo, partículas, pulso contínuo.
Conferido congelando as animações em instantes exatos com zoom (ponta na frente do traço; anel parado sem a
emenda de 3 h, que o tracejado deixava; marca nunca à frente da cabeça).

## Regras do recibo
- Anima UMA vez, só quando a confirmação chega com a tela aberta (a etapa passa de "aguardando pagamento" para
  "em produção"). Quem volta depois vê o recibo pronto, parado. Movimento reduzido: parado.
- Meio de pagamento, data e código só com a tentativa APROVADA; sem eles o recibo segue certo ("Confirmado pelo
  Mercado Pago").
- Ao chegar, o foco vai para o título (o aviso do pagamento some junto com o bloco dele).
