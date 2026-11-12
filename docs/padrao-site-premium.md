# Padrão "site premium" dos sites de clientes

Decisão do dono, 2026-11-10 (`01 Empresa/Decisões.md`): "mudarmos o nosso gerador com já essas ideias em mente
também, para agregar no nosso valor geral". Origem: a análise de um vídeo sobre "a psicologia de um site premium".
As ideias do vídeo que o nosso processo ainda não escrevia viraram estas 4 regras. Valem para as 3
direções (o gerador, `api/_vendas/gerador.mjs`, e a fila manual, que usa o mesmo `SISTEMA_GERACAO`) e para a
construção do site escolhido.

A base já existia e continua: textos do negócio (nada genérico), zero invenção, celular primeiro, velocidade, SEO
básico, acessibilidade, código e acessos no nome do cliente.

## 1. O teste dos 5 segundos (no gerador)

A primeira impressão se forma em frações de segundo, e a pessoa julga a empresa pelo site. Por isso o topo
(hero) precisa responder sozinho, para quem nunca ouviu falar do negócio, a três perguntas:

- **O que é?** O título diz o que o negócio faz, com as palavras do cliente dele.
  Exemplo: "Implante e lente de contato dental em Campinas", e não "Seu sorriso, nossa missão".
- **Para quem?** O subtítulo completa com o público, a cidade ou o diferencial.
- **E agora?** O botão é o próximo passo: "Agendar avaliação".

Como conferir: mostre o topo no celular por 5 segundos a alguém de fora e pergunte "o que essa empresa faz?".
Se a resposta vier errada, o título está errado, não a pessoa.

## 2. Enxugar (no gerador e na construção)

"A perfeição vem quando não há mais nada para tirar." IA tende a encher a tela, e isso deixa o site com cara de
barato.

- Seções pelo formato: landing page de 5 a 7; institucional de 6 a 9; loja de 5 a 8. Dentro da faixa, a
  estratégia decide: a de conversão fica perto do mínimo; autoridade e experiência podem usar a faixa inteira,
  porque o espaço e a narrativa são a estratégia delas. Nunca seção sem motivo.
- Antes de entregar: releia e corte a seção, o item ou a frase que não serve à estratégia escolhida.
- Uma seção, um foco. Nenhuma tela vira mural de cartões: de 3 a 6 itens por seção.
- Na construção, a mesma pergunta em cada tela do celular: "para onde a pessoa olha primeiro?". Se não tiver
  resposta, sobra coisa.

## 3. Aviso de cookies que bloqueia de verdade (na construção)

Lei (LGPD), não enfeite. Um aviso bonito que não bloqueia nada é pior que nenhum.

- Site do cliente **sem** rastreador e **sem** conteúdo de terceiros: não leva aviso de cookies (não há o que
  consentir). Só o aviso de privacidade do formulário, com o mínimo de dados.
- Site **com** Analytics, pixel do Instagram/Facebook ou Google Ads: os scripts de rastreio **só carregam
  depois do "sim"** da pessoa. Recusar vale tanto quanto aceitar (mesmo peso visual, sem truque). A escolha,
  inclusive a recusa, fica guardada no aparelho, e há um link no rodapé para mudar de ideia.
- **Conteúdo de terceiros também conta:**
  - **Mapa incorporado** (a seção de localização): por padrão, imagem estática com o link "Abrir no mapa". O mapa
    interativo só carrega depois de um clique da pessoa.
  - **Vídeo do YouTube:** a capa e o botão de tocar; o vídeo só carrega no clique (de preferência pelo domínio
    `youtube-nocookie.com`).
  - **Fontes:** hospedadas no próprio site, nunca carregadas do Google Fonts.
- Modelo: o nosso, `js/medicao.js` (nada sai do aparelho sem o "sim"; reabrir pelo `[data-consentimento-abrir]`).
  Ele cobre o Google (GA4 e Ads). Para o pixel da Meta, adaptar o mesmo bloqueio, que é ponto de partida e não
  peça pronta. Não precisamos de ferramenta paga para isso.
- O aviso não substitui a página de privacidade: o site do cliente tem a dele, dizendo o que coleta e para quê.
- Como conferir, com a aba Rede do navegador aberta, nos três caminhos:
  - **Recusar e navegar:** nenhuma chamada para google-analytics, googletagmanager, facebook ou doubleclick, nem
    depois de recarregar.
  - **Aceitar:** as chamadas aparecem.
  - **Mudar de ideia pelo link do rodapé:** recusar e recarregar; as chamadas não voltam.

## 4. O kit de movimento mínimo (na construção)

Os pequenos detalhes são o que faz o site parecer cuidado. Sozinhos parecem inúteis; juntos são a diferença
entre "vivo" e "sem vida". Mas o site do cliente não é o nosso: nada de reator, campo ou sons. O kit:

- **Entrada ao rolar:** o conteúdo aparece suave quando chega à tela (opacidade e um deslocamento curto,
  0,4 a 0,6 s, uma vez só).
- **Reação no botão e no cartão:** com mouse, uma resposta curta ao passar por cima (cor, borda ou um
  deslocamento de 2 a 4 px, até 0,2 s); no toque, a resposta ao apertar.
- **Troca de página** (institucional): uma transição curta, sem esconder o conteúdo por mais de 0,3 s.
- **Formulário:** avisa o erro no próprio campo, na hora (sem esperar o envio e sem apagar o que a pessoa
  escreveu), e mostra claramente "deu certo" ou "deu erro e o que fazer".

Regras do kit:

- Só `transform` e `opacity` no que se move.
- Sem desfoque (sem blur) e sem brilho difuso.
- Com "reduzir movimento" (`prefers-reduced-motion`) ou sem JavaScript, tudo aparece inteiro e parado.
- O movimento entra **depois** de o site estar completo e funcionando: primeiro funcional e enxuto, depois os
  detalhes.

## Onde isto é lido

- O gerador (`SISTEMA_GERACAO`) traz as regras 1 e 2. Os testes em `docs/testes/geracao.test.mjs` prendem as
  regras e a existência deste documento.
- A construção do site do cliente segue a skill `padrao-desenvolvimento` (seção da revisão final), que aponta
  para cá. A ficha `02 Serviços/Sites/Sites.md`, no cofre, também aponta para cá.
- A revisão de interface antes da entrega (`revisao-ui`) confere as 4 regras.
