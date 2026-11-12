# Planta viva v2: o poder do Zero, em espetáculo (direção, 12/11)

> Pedido do dono (12/11, no chat): a planta "deverá ser um dos poderes do Zero que ele irá gerar com o passar da conversa, e eu quero ele
> perfeitamente refinado, quero um espetáculo visual". Este documento é a direção do agente; o dono vê o protótipo em vídeo antes de
> qualquer PR. O que já foi aprovado (protótipo de 05/11, ponto dourado no fim, faixa depois do formulário) não é reinterpretado: é a base.

## 1. O que muda de verdade

Hoje a planta aparece **de uma vez**, num turno só, depois do preço, como uma faixa de 8 caixas iguais. Funciona, mas lê como um
fluxograma, e a pessoa não vê o Zero fazendo nada: vê um resultado pronto.

A v2 transforma isso num **poder visível**: a planta **nasce na primeira resposta e cresce a cada coisa que a pessoa conta**. Quem conversa
vê o próprio negócio sendo desenhado enquanto fala. O espetáculo é a soma de três momentos:

1. **A semente** (1ª resposta útil): o núcleo do Zero acende e solta o primeiro traço: a chegada ("de onde o seu cliente vem").
2. **O crescimento** (cada turno): cada fato novo que o código já lê do briefing (segmento, objetivo, como o cliente chega hoje, a dor,
   agenda, pedido, WhatsApp, Instagram) **imprime uma estação**: a luz sai do núcleo, corre pela rota, a estação se desenha traço a traço
   (ícone em 1 px, depois o rótulo, depois a frase), com um som curto do `js/som.js`. As estações que ainda faltam ficam como **esboço
   fantasma** (o que o Zero ainda vai entender), então a pessoa sente que a conversa está construindo algo.
3. **A consagração** (quando o preço sai): o Zero chama `desenhar_planta` (já existe) e a planta **se reorganiza** do esboço para o desenho
   final do caso dela: as estações deslizam para o lugar definitivo (transform), a luz percorre o caminho inteiro de uma vez e o LED do
   objetivo vira **ouro** (aprovado em 05/11), com as duas ondas de traço.

## 2. Por que fica barato e confiável

- O crescimento turno a turno **não chama IA**: é derivado do briefing que o servidor já monta (os mesmos campos da ficha "O que já
  anotamos"). Zero custo extra, zero risco de o modelo inventar estação.
- O desenho final continua sendo o `desenhar_planta` validado por esquema (o que existe e passou nas rodadas reais 8 e 9).
- Nada de promessa: a planta mostra o MECANISMO, nunca número, preço, prazo ou resultado (regra de 04/11).

## 3. A linguagem do espetáculo (o que o deixa "refinado")

- **Luz que imprime** (a assinatura do site): toda estação nasce pela luz que chega nela, nunca por fade solto.
- **Traço único de 1 px com luz circulando**, sem blur, sem brilho difuso, sem "tubo" de linhas empilhadas (regra do dono).
- **Energia do AI Core**: o núcleo do Zero na planta é o mesmo vocabulário do reator (anéis, rumos, pulso no fôlego `B.FOLEGO`).
- **Ícones desenhados**: cada ícone se desenha como assinatura (stroke-dashoffset uma vez), não aparece pronto.
- **Ritmo**: estação nova em ~900 ms (luz 350, ícone 300, texto 250); a consagração em ~4 s; repouso com um pulso a cada 6 s
  (só transform/opacity, regra 1 do CLAUDE.md).
- **Som**: mesma família do `js/som.js` (sino curto para estação, acorde para a consagração); respeita o interruptor de som.
- **Ouro só no fim** e só no objetivo.
- **Celular primeiro**: no celular a planta vive como um cartão que cresce **dentro da conversa** (vertical, uma coluna, a estação nova
  sempre à vista sem roubar a rolagem); no computador vive no painel ao lado e, na consagração, abre na faixa larga.
- **Movimento reduzido / menos movimento**: cada estação aparece completa, sem voo; a consagração é um quadro final.

## 4. Ordem de trabalho (por partes)

1. **Laboratório** (`docs/lab-planta.html`, fora do deploy): roteiro de conversa com 3 nichos (clínica, serviço com agenda, loja), turno a
   turno, mostrando semente → crescimento → consagração. Medir tarefas longas no celular 4x (orçamento de cada efeito).
2. **Vídeo para o dono** (celular 390 e computador), com o som.
3. Com o "sim" dele: PR do crescimento (derivação do briefing + desenho incremental), PR da consagração, staging, celular dele, produção.

## 5. O que fica de fora desta rodada

- Radar de 5 eixos "como lemos o seu caso": o radar do escopo (#104) o substituiu no painel por pedido do dono (07/11). Se ele quiser os
  dois, entra depois, na mesma linguagem.
- Métricas de "viu a planta": continuam desligadas (decisão de privacidade do dono).
