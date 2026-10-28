# Sons do site — desenho (2026-10-28)

## Pedido do dono (Decisões 28/10)

"Sons, para ambientação do site, selecionar card, botão e para clicar"; "Som de fundo com opção para deixar ligado
ou desligar"; "Não só o de fundo, mas os sons em geral"; começa ligado, "bem baixo e irá se estabilizando, não irá
assustar ninguém"; sons gerados no navegador (opção A); "ver como fica" na prévia antes do merge.

## O que muda para quem visita

- Primeiro toque ou clique na página: o fundo nasce do silêncio e sobe devagar (8 s na 1ª página da visita, 2 s nas
  seguintes) até um nível baixo e fica ali. Antes do primeiro toque, nada toca (o navegador não deixa; rolar não conta).
- Card: no desktop, o card que chega a 100% de carga (js/carga.js) toca um sino curto de duas notas; passar o mouse
  num card toca um "tic" quase inaudível. No celular, tocar num card toca o "tic".
- Botão: mouse sobre `.btn` toca um "tic" mais agudo e baixo; clicar/tocar em qualquer link, botão ou pergunta
  (`a`, `button`, `summary`) toca um clique seco.
- Um botão "Som" (ícone de ondas, `aria-pressed`) no cabeçalho, visível no celular e no desktop, liga e desliga TODOS
  os sons; desligar faz o fundo sumir em 0,4 s. A escolha fica no aparelho (`localStorage` `bz-som`, `'0'` = desligado;
  sem nada = ligado). Também no rodapé, ao lado de "Reduzir movimento".
- Aba escondida: o som pausa; voltou, retoma.
- iPhone no silencioso: fica mudo (o Web Audio segue a chave do aparelho; não forçamos).

## Como soa (Web Audio, sem arquivo)

- Fundo: três osciladores (110 Hz triângulo, 165 Hz e 220 Hz seno, levemente desafinados) por um passa-baixa
  ~700 Hz; o filtro e o volume RESPIRAM com o fôlego do reator (`B.FOLEGO`, 7 s, inspira 42%). Frequências acima de
  ~150 Hz de propósito: alto-falante de celular não toca grave abaixo disso.
- Sino do card: senos 880 Hz e 1320 Hz em sequência (60 ms), queda de 400 ms.
- Tic: seno ~1800 Hz, 30 ms. Clique: ruído curto (12 ms) por passa-banda ~2,5 kHz + batida de 160 Hz em 40 ms.
- Volumes: mestre sobe de 0 a 1 na rampa; fundo ≈ 0,05, efeitos 0,04-0,1 (ajustável na prévia, uma constante cada).

## Arquitetura

- `js/som.js` (clássico, defer, depois de `core.js`): cria o `AudioContext` só no primeiro gesto (`pointerdown`,
  `keydown`), monta mestre → fundo + efeitos, ouve `B.on('carga:cheio')`, `pointerenter`/`pointerup` delegados e
  `click`. Lê/grava a preferência. Sem `AudioContext` no navegador: não faz nada e o botão "Som" fica escondido.
  Nada por frame no CSS; a respiração usa `setTargetAtTime` agendado a cada fôlego (nenhum rAF novo).
- `js/carga.js`: uma linha, `B.emit('carga:cheio', card)` quando o card enche.
- HTML: o botão nas páginas que carregam `pagina.js` (nasce `hidden`, o JS mostra), mais o `<script>`.
- CSS: estilo do botão em `css/base.css` (sem `style=""`, CSP).
- Privacidade: `privacidade.html` cita a preferência `bz-som` junto da de movimento.

## Testes

- `docs/testes/som.test.mjs`: toda página com `pagina.js` carrega `som.js` e tem o botão `[data-som]` `hidden` com
  `aria-pressed`; `som.js` sem `style=`/`innerHTML`; a preferência só desliga com `'0'`; a privacidade cita `bz-som`;
  `carga.js` emite `carga:cheio`.
- `verificar` e `acessibilidade` seguem verdes (o botão é alcançável por teclado e tem foco visível).
- Ouvir: o dono, na prévia, no celular.

## Fora do escopo

Arquivos de áudio, volume em controle deslizante, sons por página diferentes, som no orçamento/painel.
