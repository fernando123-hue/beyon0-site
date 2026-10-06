# Plano — AI Core vivo (2026-10-02, décima primeira sessão)

## 1. O pedido

O dono mandou uma imagem (`moodboard/ai-core-referencia.png`): uma esfera de
anéis de vidro escuro, quebrados, em volta de um núcleo branco-ciano que
irradia, com estilhaços soltos e um traço de luz horizontal atravessando.
Pediu para "dar vida" a ela com o img2threejs, usar o motion (o pedido
anterior: Remotion) se possível, e ser o **AI Core** do site. Sem portfólio,
o site é a prova: tem de ser excepcional. E a regra explícita: **se o
resultado pesar na harmonia do site, apagar sem dó.**

## 2. O que "img2threejs" quer dizer aqui

O dossiê (artifact `CRtpEXWfUsgcgPEzVD9fAK`) já concluiu: o img2threejs não é
biblioteca, não reconstrói 3D. É um método em que o modelo de visão lê a
imagem, escreve um **spec** (peças, materiais, repetições) e o código three.js
sai dele; depois compara render contra referência e corrige. É isso que
fazemos, sem o Python dele e sem build:

1. **Inventário da imagem** (seção 3): o que define a identidade dela.
2. **Spec declarativo** (`js/nucleo/spec.js`): peças, cores como tokens do
   site, contagens. Nada de three.js no spec.
3. **Emissor** (`js/nucleo/pecas.js`): spec → objetos three.js.
4. **Revisão contra a referência**: screenshot da cena lado a lado com a
   imagem, correção por passe (forma → material → luz → movimento).

## 3. Inventário da referência

| Zona | O que é | Como vira 3D |
|---|---|---|
| Centro | ponto branco quase estourado, halo ciano, raios curtos | esfera emissiva pequena + 2 sprites de halo aditivos (textura gerada uma vez) |
| Em volta do centro | anéis finos concêntricos, como uma lente/abertura | 3 toros finos emissivos, girando em eixos próximos |
| Gaiola | arcos grossos de vidro escuro, partidos, cruzando em vários eixos (esfera armilar quebrada) | 7–9 toros com arco < 2π, material escuro com aresta de luz por fresnel (shader próprio, barato) |
| Estilhaços | cacos de vidro soltos, mais densos nas bordas | 1 `InstancedMesh` de poliedros irregulares (≈ 60 desktop / 30 celular) |
| Poeira | pontos finos | 1 `Points` (≈ 400 / 180) |
| Traço horizontal | raio de luz atravessando o núcleo | sprite esticado; **é o feixe do site** (o fio de 1px da assinatura) passando pela esfera |
| Fundo | preto azulado com bruma ciano | o fundo do site já é esse (`--bg`, atmosfera); canvas transparente |

Ajuste de identidade: a imagem é mais neon que o site. A V4 proíbe neon e
mancha redonda atrás de texto. O núcleo concentra o brilho num ponto pequeno;
os arcos são escuros com aresta fina; o ciano é o `--ac` do site.

## 4. O papel no site (por que ele existe)

O H1 é "Do problema ao sistema no ar". O núcleo conta isso sem texto:
**nasce em pedaços e se monta.** No boot, os estilhaços convergem, os arcos
travam no lugar e, quando o fio de luz da assinatura passa pela esfera, o
núcleo acende. Depois respira devagar. É o mesmo gesto do site ("a luz passa
e imprime"), não um enfeite novo.

- **Ponteiro (desktop):** a esfera inclina na direção do cursor; o núcleo
  segue um pouco mais que a gaiola (profundidade).
- **Rolagem:** ao sair do hero, a gaiola se abre e os cacos se afastam (o
  sistema "solta" para mostrar o que tem dentro); voltando, ela fecha.
- **Dados reais:** o console de boot (carga, bytes, fps desta visita)
  continua, preso à esfera como leitura do instrumento. Nenhum número
  inventado.
- **Celular primeiro:** a esfera ocupa o lugar do console (depois do CTA),
  com a borda superior aparecendo no fim da primeira tela; o console vira a
  leitura embaixo dela.

## 5. Arquitetura

```
vendor/three/three.module.min.js   r160, o mesmo já auditado no histórico (558c208), MIT
js/nucleo/spec.js                  o que a esfera é, em dados
js/nucleo/pecas.js                 spec → three (anéis, gaiola, cacos, poeira, halo)
js/nucleo/cena.js                  renderer, câmera, resize, qualidade, dispose
js/nucleo/boot.js                  porteiro, carga tardia, B.add, ponteiro, rolagem, boot sincronizado
```

Regras (vindas da história medida do projeto e da skill threejs-perf):

1. **Carrega depois do LCP**, por `import()` dinâmico; nada no caminho da
   1ª pintura. Canvas não é candidato a LCP; o parágrafo do hero continua.
2. **Um rAF só** (`B.add`); para quando a aba some ou a esfera sai da tela.
3. **Sem pós-processamento.** O brilho vem de sprites aditivos e fresnel.
4. **Porteiro:** WebGL por CPU não monta (`failIfMajorPerformanceCaveat`;
   `?3d=forcar` para o verificador); `saveData` e memória < 4 GB não montam.
   **Mudança de decisão:** a camada 3D antiga ficava fora do toque porque
   era fundo de paralaxe; o AI Core é a peça principal do hero, então entra
   no celular, mais leve (DPR ≤ 1,5, metade dos cacos).
5. **Degrada medindo:** se o fps cair abaixo de 45 nos primeiros segundos,
   baixa a qualidade; se continuar, a esfera sai e o console fica sozinho.
6. **Movimento reduzido:** desenha um quadro, parado, montado. Sem JS / sem
   WebGL: o console de hoje, intacto (acréscimo, nunca substituição).
7. Cores lidas dos tokens do CSS uma vez no boot.

## 6. Orçamento e critério de apagar

| Medida | Limite |
|---|---|
| Bytes a mais (comprimido) | ≤ 180 KB, todos depois do LCP |
| LCP (mediana de 5, A/B com a V4.9) | piora ≤ 0,1 s |
| fps desktop (GPU) | ≥ 58 parado e rolando |
| fps celular emulado | ≥ 50 |
| Draw calls | ≤ 40 |
| Verificador / acessibilidade | 10/10 e 23/23 continuam |

**Apagar** se: estourar o orçamento sem conserto barato; o painel de
críticos disser que a esfera briga com a tipografia ou vira "template de
IA"; ou, olhando lado a lado, ela não ficar à altura da referência.

## 7. Fases

1. **Laboratório** (`docs/lab-nucleo.html`): a esfera sozinha, comparada
   lado a lado com a referência até ficar à altura. Passes: forma → material
   → luz → movimento.
2. **Integração no hero** (celular primeiro), boot sincronizado com o fio,
   ponteiro, rolagem, porteiro, degradação.
3. **Medição A/B** contra a V4.9 + verificador + acessibilidade.
4. **Revisão:** revisão de código por agente + painel de críticos
   (`docs/workflows/critica-premio.js`).
5. **Motion (Remotion)** — depois que a esfera passar na fase 4, nunca
   antes. Proposta (decisão do dono, seção 9). A tensão registrada na sessão anterior continua: animação de
   interface é GSAP; vídeo só onde vídeo ganha. O uso que faz sentido agora
   que existe o AI Core: o **mesmo spec** renderizado pelo Remotion
   (`@remotion/three`) numa vinheta curta da marca (redes, OG em vídeo) e,
   se medir bem, a transição entre páginas (o núcleo pisca e o traço
   atravessa a tela, ~0,6 s, só na navegação interna). Plano próprio antes
   de instalar; licença grátis conferida no site do Remotion.

## 8. O que foi medido (2026-10-02, versão final da sessão)

Máquina do dono, Chrome headless com a GPU real (GTX 1050 Ti, D3D11);
`docs/olhar.mjs` com `GPU=1` faz o mesmo para os screenshots.

| Medida | Sem esfera (`?3d=nao`) | Com esfera |
|---|---|---|
| fps desktop 1440 parado / rolando | 60 / 59 | 60 / 60 |
| fps celular 390 (CPU 4× mais lenta) parado / rolando | 60 / 59 | 60 / 59 |
| script por segundo, desktop | 3 ms | 45 ms (< 1 ms por quadro) |
| script por segundo, celular CPU 4× | 8 ms | 118 ms (≈ 2 ms por quadro) |
| LCP celular CPU 4×, mediana de 5 | 1,12 s | 1,06 s (empate: ruído) |
| CLS | 0 | 0 |
| bytes a mais, comprimido | — | three reduzido 124 KB + módulos 17 KB (comentados, sem minificar), todos depois do load |
| chamadas de desenho / triângulos | — | 29 / 33 mil |

O console mostra o peso do site ("transferido", congelado no instante do
carimbo) e o do núcleo à parte ("núcleo aceso · +N KB"); a Prova soma os
dois. No servidor local nada é comprimido (412 + 523 KB); na Vercel o
navegador informa o tamanho comprimido.

Verificador 12/12 (os dois alvos novos `hub-3d` e `hub-3d-cel` exigem a
esfera montada e acesa; os demais exigem que ela NÃO monte em WebGL por CPU).
Acessibilidade 23/23. Movimento reduzido conferido à mão: esfera montada,
acesa e parada. Sem JS: o desenho em CSS no mesmo lugar.

O three entra **reduzido** (`vendor/three/README.md`): só as classes que a
esfera usa, empacotadas uma vez com esbuild fora do repositório (166 → 124 KB).
E o WebGL é testado **antes** de baixá-lo: aparelho sem GPU não paga os bytes
(o verificador pegou o three escrevendo erro no console quando tentava).

## 9. Motion (Remotion): a proposta

A tensão da sessão anterior se resolve assim, com o AI Core pronto:

- **Transição entre páginas: não é trabalho de vídeo.** Um vídeo de 0,6 s
  tocando antes de navegar atrasa a navegação, pesa 150–300 KB por variante e
  exige HEVC com alfa no Safari. A ferramenta certa é a View Transitions API
  entre documentos (`@view-transition { navigation: auto; }` no CSS, 0 KB,
  Chrome 126+ e Safari 18.2+; quem não suporta navega como hoje). O traço de
  luz do núcleo pode ser o elemento compartilhado que atravessa a tela.
- **Onde o Remotion ganha: a vinheta da marca.** O mesmo `spec.js` +
  `pecas.js` renderizados pelo `@remotion/three` (o emissor já é
  independente do site: recebe o estado pronto) num vídeo de ~6 s: os
  pedaços convergem, o núcleo acende, "Beyon Zero" e a frase entram. Formatos
  9:16 (reels/status), 1:1 e 16:9 (LinkedIn, apresentação, OG em vídeo).
  Matriz em `03 Projetos\video-matriz` (repo próprio), seguindo a skill
  `video-matriz`. Licença: grátis para empresa de até 3 pessoas (conferir
  no site do Remotion antes de instalar).
- Ordem sugerida: (1) View Transitions no site, medida e revisada; (2) a
  vinheta no Remotion a partir do mesmo spec.

## 10. Rodadas de revisão (2026-10-02)

**Código (agente revisor):** aprovado com ressalvas, nenhum achado alto.
Corrigido: contexto perdido no modo parado (redesenha no
`webglcontextrestored`); falha no meio da montagem deixava o desenho em CSS
escondido e o contexto vivo (`tem-nucleo` só depois do 1º quadro; a cena
solta o contexto se `montar` falhar); normais erradas nas pontas dos arcos;
a linha do núcleo podia quebrar a ordem do log e ficava mentindo depois de
uma desistência; o verificador podia desistir sozinho em SwiftShader (com
`forcar` não degrada); aparelho a 30 Hz fixos era expulso (a régua é a
cadência do próprio aparelho, teto 60); desistência deixava ouvintes e o
buffer vivos; `medir(true)` redundante; resize com leitura de layout no
handler (agora ResizeObserver + quadro); contexto de teste duplicado (um só,
testado antes de baixar o three); `stencil: false`,
`powerPreference: 'default'`; código morto.

**Design (crítico com mandato de apagar):**
- Rodada 1 — **ajustar** (V4.9 6,0 → 6,5). Lia como novelo (26 tubos finos),
  três clichês somados beirando o neon (estrela de raios, traço fixo,
  aresta acesa em tudo), tempo morto entre montar e acender, console
  tapando a esfera. Feito: 13 faixas grossas em espiral áurea, metade de
  trás recuando, aresta a 60%, raios quase nada, traço como evento,
  montagem mais curta que só começa quando a arte é impressa, lente com
  marcas em âmbar (amarra à marca), console menor e translúcido.
- Rodada 2 — **manter** (7,5). Feito: material de vidro (fios de reflexo
  duros, o núcleo visto através dos arcos, corte oblíquo nas pontas),
  esfera descida no desktop, núcleo inteiro no fim da 1ª tela do celular,
  log encostado, o peso do núcleo separado do peso do site, e a abertura na
  rolagem pela posição da esfera (abria no meio da tela, sobre o texto).
- Em aberto: o console sem JS mostra uma linha só (já era assim na V4.9).

## 11. Versão 2: o reator (2026-10-02, pedido do dono depois de ver no celular)

O dono viu a prévia: "parece um emaranhado de fios e cabos; quero sensação
de grandeza, equilíbrio, alta simetria e grande energia passando por ele".
O problema é de conceito, não de ajuste: arcos soltos em ângulos variados
sempre leem como fios. A v2 troca a ideia.

**Conceito: um reator visto de frente.** Simetria radial (12 tempos), peças
inteiras e usinadas (nada ondulado nem partido), camadas em profundidade, e a
energia como protagonista:

| Peça | O que é | Papel |
|---|---|---|
| Núcleo | o mesmo ponto branco com halo | a fonte |
| Lente | anéis finos de frente + régua âmbar | o instrumento |
| Raios de energia | 12 feixes do anel externo ao núcleo, com pulsos correndo PARA DENTRO | a energia sendo puxada (o "grande energia passando") |
| Disco | partículas em órbita no plano do equador, espiralando para o núcleo | profundidade e movimento contínuo |
| Giroscópio | 2 anéis inteiros de vidro, um vertical e um equatorial, girando devagar | o volume 3D, em equilíbrio |
| Portal | anel externo grande em 12 segmentos de vidro com vãos alinhados aos raios | a grandeza e a simetria |
| Trilhos | anéis contínuos com pulsos de luz correndo em volta | a energia circulando |
| Régua | 72 marcas finas em volta de tudo | escala de instrumento (a linguagem de 1px do site) |
| Onda | um anel de luz que sai do núcleo a cada ~5 s e se desfaz | o pulso do sistema |

A montagem continua contando o H1: os 12 segmentos chegam ao portal em
pares simétricos, os anéis travam, o núcleo acende e a energia começa a
correr. Sem cacos (eram o caos que o dono não quer). Mesmo orçamento (fps,
LCP, bytes) e o mesmo processo: laboratório → crítica → código → medida.

### 11.1 Rodadas da v2

- **Crítica, rodada 3 — ajustar (7,0).** Simetria e equilíbrio certos;
  faltavam grandeza e energia. Achados: anel vertical + elipse do equador +
  núcleo liam como **símbolo de átomo / logo do React** (clichê); o console
  cortava o círculo (simetria cortada = desequilíbrio); tudo brilhava igual
  (lia como mostrador, não potência); a onda virava mancha redonda. Feito: sai
  o anel vertical (o eixo vertical são os jatos finos); os 12 raios viram a
  energia dominante (pulso em fase a cada 1,6 s, o núcleo bate a cada
  chegada) e o resto escurece; disco em órbita kepleriana a 12° do
  horizonte; onda de 1 px a cada 8 s; acendimento de dentro para fora;
  círculo nunca cortado (celular: console depois dele; desktop: o console sai
  do hero e a medida volta à trilha). Não feito: jatos de 2,2× o raio (no
  celular cruzariam o texto).
- **Código, revisão da v2 — aprovada com ressalvas.** Corrigido: smoothstep
  com bordas invertidas (indefinido em GPU móvel); a costura do `atan` nos
  anéis (um tracinho fixo às 9 h quebraria a simetria: agora `uv.x`); o
  relógio dos shaders dá a volta a cada 400 s (float32 depois de horas);
  energia de dois lados só nas faixas (nos tubos somava 2×); material apagado
  não é desenhado; `getWorldPosition` inútil; o three reduzido perdeu as
  classes que a v2 não usa (124 → 121 KB).
- **Salto de layout de 0,253 no celular (vinha da V4.9).** Achado ao medir:
  o menu do celular nascia no fluxo (sem a classe `tem-menu`, ligada só pelo
  `pagina.js` com `defer`) e o hero subia 213 px depois da 1ª pintura. Agora
  `tem-menu` liga no `<head>` (js/ancoras.js), com rede: sem o menu montado
  até o load, a classe sai. CLS do Hub no celular: 0,253 → 0,014.
- **Crítica, rodada 4 — manter (8,0)** (V4.9 6,0; v1 7,5; v52 7,0). Os três
  últimos ajustes, feitos: o disco virou matéria (sem o anel sólido, que lia
  como Saturno; riscos ao longo da órbita, 60% no miolo); os raios ficam
  legíveis parados (guia contínua, cauda de 18%, lampejo na borda do portal
  a cada injeção); respiro de 40 px entre o anel e o texto no desktop. O
  crítico recomenda congelar o reator e seguir para o resto da página.
- Medido no fim (GPU real): fps igual com e sem reator (60/60 desktop; 60/59
  celular com CPU 4×), ~2 ms de script por quadro no celular com CPU 4×, CLS
  0–0,014, three reduzido 121 KB comprimido.

## 12. Transição entre páginas (View Transitions) — 2026-10-02

Feita em CSS puro no fim de `css/motion.css` (0 KB): a luz passa e imprime
a página nova (`clip-path` da esquerda para a direita no desktop, de cima
para baixo no celular, 520 ms, `--ease-io`), a velha recua para 35%; menu e
barra fixa com nome próprio ficam parados; movimento reduzido (sistema ou
interruptor) desliga. Só dispara em clique real (o navegador ignora
navegação disparada por script — conferido).

**Estado da verificação (honesto):** com duas páginas mínimas a transição
dispara em 100% das cargas no headless; entre as páginas do site, só em
parte delas. A página velha sempre inicia (`pageswap` com transição) e a
nova às vezes chega sem ela (`pagereveal` nulo), sem aviso no console;
remover um script por vez não muda o padrão, e o mesmo cenário alterna
entre sim e não — aponta para timing do headless, não isolado. Quando o
navegador pula, a navegação é a de sempre (nenhum risco funcional).
**A confirmar num celular real** (Chrome Android 126+, Safari iOS 18.2+).

### 11.2 Profundidade e os vazios (pedido do dono, depois da prévia)

O dono mandou o recorte do centro: "adicione mais elementos nesses espaços
em branco" e "ainda parece muito plano". Feito: o reator inteiro inclinado
(−0,42 rad, portal elíptico mesmo parado); 12 câmaras de vidro extrudado com
chanfro entre os raios (z −0,15), com a luz do núcleo caindo da borda de
dentro para fora; 12 pétalas sobre os raios, à frente (z +0,2); anel
tracejado girando ao contrário; luz de fundo atrás do portal (paralaxe);
névoa no vidro (o que está longe escurece); luz-chave fixa nos chanfros;
disco só dentro da lente (fora dela virava chuvisco). Crítica rodada 5:
8,3 com esses ajustes e **congelar o reator**. Revisão de código: aprovada;
geometria compartilhada por camada (2 em vez de 24 extrusões). Ficam para
quando uma medida pedir: instanciar segmentos e placas (82 → ~30 chamadas)
e `FrontSide` nas placas fechadas. three reduzido: 129 KB (ganhou a
extrusão). fps no celular com CPU 4×: 60/59 (uma leitura isolada de 48 logo
depois do verificador não se repetiu em duas medidas).

## 13. v3 "refinado" (2026-10-02) — CONGELADO

Pedido do dono sobre a v54: "as bordas espessas dão um ar mais pesado, mais
rústico; quero algo elegante, de outro patamar". Precisão em vez de massa:
portal FINO (tubo 0,011, micro-vãos) com um **bisel** (um reflexo que corre
no anel, uma volta a cada 14 s); fio de trás aditivo fraco; câmaras e
pétalas viraram **lâminas de cristal**: contorno de 1 px nas duas faces com
as arestas de espessura, a aresta de dentro acesa pelo núcleo e apagando para
fora, preenchimento quase transparente, névoa pela profundidade; raios mais
finos; régua de 120 marcas (8 longas fortes, curtas discretas). Crítica
rodada 6: **manter, 8,5** (celular e desktop); ajustes finais feitos (sem a
"mira": jatos até 0,9 e traço assentado a .10; lampejos discretos; periferia
limpa) e **congelar**. Revisão de código: aprovada; pisos de espessura
(nada abaixo de ~1 px no celular), código morto removido (achatar,
vidro radial, Extrude/Shape do bundle: 129 → 121 KB).

**Próximo, pedido do dono:** "quero que ele esteja sempre em movimento,
praticamente 'respirando', algo leve, suave, quase hipnotizante; e
bastante interativo". Feito na seção 14.

## 14. Respiração e gesto (2026-10-02, décima segunda sessão)

A forma da v3 continua congelada; só o movimento mudou. Números em
`spec.js` (`respira`, `campo`, `toque`).

- **Respiração:** um fôlego a cada 7 s (inspira em 42% do ciclo e solta
  mais devagar, sem tranco nas viradas). Nasce no núcleo (escala +10% e
  luz ±7%) e corre para fora com atraso por camada: lente 0,35 s,
  pétalas 0,75 s, câmaras 1,1 s, tracejado 1,35 s, portal 1,6 s. Com o
  atraso, vira uma onda lenta que atravessa o reator, em vez de um zoom do
  conjunto. Substitui o seno de 5% que existia antes.
- **Campo (ponteiro ou dedo):** a posição na tela é projetada no plano do
  reator (`cena.projetar`). As lâminas perto dela se afastam, se erguem
  para a câmera e **acendem**. Num traço de 1 px o deslocamento sozinho não
  se lia; a primeira versão, com 10 px, ficou invisível nos quadros. O
  núcleo segue com atraso, por uma mola criticamente amortecida (~0,6 s),
  e clareia quando o ponteiro chega perto dele. No celular, o dedo vale
  enquanto está na tela; quando a rolagem assume, o `pointercancel` desfaz
  o campo.
- **Toque ou clique curto no reator:** sai uma onda do ponto tocado, um
  anel de lâminas acesas que atravessa o reator em 1,5 s, e o núcleo bate
  mais forte.
- **Rolagem:** dá um impulso de giro à roda (o tracejado gira ao
  contrário, como engrenagem); o impulso perde força aos poucos.
- Arquitetura: `js/nucleo/gesto.js` (eventos → estado; usado pelo site e
  pelo laboratório). O campo e a onda são calculados no vertex shader das
  lâminas (trecho `DESLOCA`), sem custo de JS por lâmina. `Matrix4` e
  `Vector4` ficaram fora do three reduzido; o código usa `worldToLocal` e
  objetos `{x,y,z,w}`, sem regerar o bundle.
- Laboratório: `?cx=&cy=&cf=` (campo) e `?tx=&ty=&tt=` (onda) congelam um
  quadro; `?anim=1` tem o gesto ao vivo no canvas.

**Medido** (GPU real, CPU da máquina em 100% por outro processo): celular
390 px com CPU 4× mais lenta, 60 fps parado e 60 tocando seguidamente;
desktop 60/60 com o mouse girando sobre o reator; nenhuma degradação.
Verificador 12/12 e acessibilidade ok (movimento reduzido: um quadro
parado e limpo). Revisão de código: um achado (o quadro reduzido podia
congelar campo/onda), corrigido.

**Falta:** o dono sentir no celular de verdade (a "sensação" da
respiração e da mola não se julga por quadro parado) e a crítica de
motion por agentes, se ele quiser ajuste fino.

## 15. A energia no fôlego e o olhar (2026-10-02, depois do deploy)

Dois pedidos do dono, olhando o site no ar:

- **"Esses pequenos feixes parecem avulsos, não seguem um sentido
  lógico."** Eram os pulsos dos 12 raios: dois por raio, a cada 1,6 s,
  fora do ritmo da respiração, num canal quase apagado (base 0,11). Viraram
  **um ciclo preso ao fôlego**: no começo da inspiração a energia entra pelo
  portal (o lampejo), é puxada pelos raios acelerando (caminho `x^1,6`) e
  chega no instante do fôlego cheio, e o núcleo bate. Ao expirar, os jatos
  soltam a energia para fora. O canal ficou aceso (base 0,2): a frente corre
  num trilho. No shader, `uFrente`/`uDir`/`uPulso` no lugar do relógio.
- **"Mantenha apenas o núcleo seguindo [o cursor] e deixe mais aparente;
  arrume outra maneira de alcançar a imersão."** O corpo não inclina mais
  (fica só o balanço próprio, lento). O núcleo **olha** para o cursor em
  qualquer ponto do hero (`spec.olhar.alcance` 0,075, o dobro do de antes;
  a lente vai 45% do caminho, o que dá profundidade). No lugar da
  inclinação, o **bisel do portal vira para o cursor**: o anel reflete a
  sua luz. Somado ao campo que acende as lâminas e à onda do toque.

Revisão de código: misturar ÂNGULOS do bisel saltava ~50° a cada volta
própria (a cada 14 s); passou a misturar direções (vetores). O gesto
projetava o ponteiro duas vezes por quadro; agora uma. Medido: 60 fps no
celular com CPU 4× mais lenta, tocando; verificador 12/12 (uma rodada com
a CPU em 97% por explorer.exe/papel de parede deu falso negativo na 1ª
carga); acessibilidade 23/23.

## 16. A rede, o mini AI Core e o novo fundo do hero (2026-10-02)

Três pedidos do dono, num sistema só:

1. "Conforme vamos passando e mudando de páginas, o AI Core vá seguindo a
   gente e interagindo também; não ele todo, algo pequeno e minimalista."
2. "O fundo [do hero] não está no mesmo nível do AI Core: tire os anéis,
   modifique o fundo do hero completamente para agregar ainda mais valor."
3. "Um fundo animado, com feixes que se conectam, interagem entre si e com
   todos os elementos do site, bem parecido com o antigo porém melhor."

**Arquitetura.**
- `js/rede.js`: canvas 2D fixo atrás do conteúdo. Nós em 3 profundidades
  (paralaxe), as 4 ligações mais próximas por nó (a 4ª suave), sinais e
  "conversas" (cadeias de 3–5 saltos) presas ao fôlego, cantos dos elementos
  como nós (encaixes), a pilha de cartões vira corrente, o ponteiro é nó, e
  no celular um TRILHO tracejado na margem direita (o fio por onde o mini
  corre). Respira com o reator.
- `js/rede-texto.js`: as zonas onde a rede não entra (todo texto visível
  linha a linha, miolo de cartões e botões, cota/números/rota/LEDs inteiros,
  halo dos botões), medidas por evento em posição de layout.
- `js/rede-reator.js` (só no Hub): a constelação do reator — duas órbitas
  de 12 nós alinhadas aos raios, presas aos 12 pontos de entrada; a cada
  fôlego a onda corre até o portal guiada pela FASE e passa o bastão
  (faíscas). O reator não tem mais paralaxe (posição calculada, sem ler
  layout por quadro); `boot.js` publica `B.nucleo` (centro, raio de
  entrada, giro, achatamento).
- `js/mini.js`: o mini AI Core. Corpo num canvas de 96 px acima das seções
  (as de fundo grafite o apagavam); a luz que ele leva, o rastro e o feixe
  no canvas de trás. Nasce do reator do Hub, desce junto da coluna (desktop)
  ou no trilho (celular) com mola, olha o cursor, solta sinais no expirar,
  manda feixe ao canto da seção ou do cartão aceso, continua de onde estava
  ao trocar de página (rede e mini herdados, sem fusão na View Transition)
  e se despede no rodapé.
- `core.js`: `B.relogio()` (relógio da visita, igual entre páginas) e
  `B.FOLEGO`: reator, rede e mini respiram juntos.
- O fundo do hero perdeu anéis, coluna, névoa e fragmentos (estão no commit
  8103c99); ficou a luz do núcleo e o escuro das bordas, e a constelação.

**O processo.** Nove rodadas com três críticos (direção de arte, motion,
celular/legibilidade), notas de 6/6,5/6 para 9,3/9,5/9,5. Achados que
valem lembrar: pontos perto de letras leem como acentos (protegido todo
texto, linha a linha, inclusive aria-hidden do SplitText); `getClientRects`
de um bloco traz a caixa dos filhos de bloco (medir só nós de texto); o
canvas atrás de seções semitransparentes apaga o que está nele (corpo do
mini num canvas à frente); `globalAlpha` acima de 1 é ignorado (a
respiração achatava); onda por soma de dt atrasa com engasgos (guiar pela
fase); bug antigo do palco da prova revelado pela rede: a máscara era medida
antes do número real chegar (passando de 999 KB sobrava um "2 KB").

**Medido.** A/B com GPU real e CPU 4× no celular: 60/60 fps nas três
páginas, LCP sem piora (mediana). Verificador 12/12, acessibilidade 23/23.
A medida de texto custa 1,2 ms por evento.

**Pendente do dono.** Ver no celular dele (fluidez, aquecimento, borda
curva da tela). E uma decisão: a cota "1ª pintura em X s" mostra o número
real; num aparelho fraco pode mostrar 10 s numa página que vende
velocidade (o verificador viu 10,5 s na 1ª carga do navegador de teste).

## 17. Sem desfoque, os feixes, o mini com vontade própria e o reator soberano (2026-10-02, 13ª sessão)

Quatro pedidos do dono, feitos em quatro partes (um commit cada):

1. **"Tire todos os blur, esses brilhos meio desfocados: só poluem e deixam
   genérico"** (`ec08dac`). Saíram as manchas da atmosfera, da Conversa, do
   canto dos painéis e das células, a luz do núcleo no hero, o halo do fio
   de varredura, os brilhos de hover, o vidro fosco da nav e da barra, o
   brilho e a luz do mini, e no AI Core a bruma larga, o traço largo e o
   disco de luz atrás do portal. O núcleo mantém o ponto quente (curto). A
   nav e a barra ficaram opacas (`e1b4b77`): translúcidas sem desfoque, o
   texto passava por baixo como fantasma.
2. **"Ao invés de formas paradas que se conectam de vez em quando, feixes
   de energia andando frequentemente e gerando interação quando se
   esbarram; e eles interagem com o usuário"** (`e1b4b77`). `js/feixes.js`
   é o motor (cabeça + cauda nítida de 1 px, 8 direções em passos de 45°,
   decisão a cada 28 px; contorna texto e cartões). Junção (cruzar a cauda
   de outro): losango, carga, às vezes um ramo. Choque (cabeça com cabeça):
   anel e faíscas, os dois se recolhem no ponto e sai um feixe na soma das
   direções. `js/rede.js` virou a ponte com a página: o cursor atrai e
   carrega; clique/toque solta um pulso de 4; rolar acelera; cartão aceso
   solta 2 feixes que percorrem as bordas; no celular o trilho da margem
   direita tem feixes que sobem e descem; os feixes continuam entre páginas.
   A folga do texto no celular caiu de 16 para 8 px (era para os pontos da
   malha; com 16 a margem sumia). A malha antiga e `rede-reator.js` estão
   em `ec08dac`.
3. **"O mini deve se movimentar de vez em quando para outros lados em vez
   de ficar apenas descendo em linha reta, e interagir junto com o fundo"**
   (`ed49f6d`). Passeio (doca → indo → parado → voltando) a cada 8–14 s
   parado: margem do outro lado, vão livre ou canto de um cartão (que
   acende); em trechos de 45°; rolar rápido o chama de volta. No celular só
   sai por uma faixa sem texto (na margem esquerda de 20 px ele cobria o
   começo das linhas). Com o fundo: atrai feixes, absorve o que chega nele
   e reemite carregado (pausa de 1,6 s: com 0,8 virava aspirador, 13 em
   30 s), bote curto, olha para choques perto.
4. **"Tire as partes do fundo grudadas no AI Core: degradam a imagem
   soberana; o cenário deve se moldar e interagir com ele, não o
   contrário"** (`d103c1c`). Saiu o `.cosmos` (escuro radial centrado
   nele). O reator é um CAMPO para a rede (elipse a 1,36 do raio de
   entrada; a régua de fora está a 1,26): nenhum feixe cruza a face,
   contornam; nada é desenhado sobre ele. Inspirando, ele puxa os feixes de
   perto e os que tocam a borda entregam a energia; no começo do expirar
   solta 3 feixes carregados. Sem WebGL o campo vem da caixa do desenho em
   CSS. O reator em si não mudou.

**Medido.** A/B com `ec08dac` na mesma sessão: 60 fps nos dois, script por
6 s igual ou menor, 13 KB a menos. Mini em 30 s parado: 2 passeios por
aparelho. Reator em 21 s: 7 entregas, 9 feixes soltos, 0 cabeças dentro do
campo no desktop. Verificador 12/12, acessibilidade ok.

**Pendente do dono.** Ver tudo no celular dele e dizer como prosseguir.

## 18. O Campo do Reator, módulos ligados e o reator/mini que pedem o clique (2026-10-03, 14ª sessão)

Pedido do dono (resumo): o fundo de feixes "dá impressão de desordem";
quero algo grandioso, que combine com o tema, ressoe com o AI Core e
interaja com o usuário e com todos os elementos (os de hoje e os que
vierem); "proíbo blur em qualquer coisa"; pulso do clique no centro mais
suave e certeiro; AI Core e mini reagem à opção sob o cursor ("como se
quisesse que o usuário clique lá"); o mini sugere cliques; clicar demais no
núcleo acelera a rotação e agita o mini; cartões e opções refeitos do zero,
sem nada colado, com bom espaçamento e conexão.

**Referências** (pesquisa 2025–2026, premiados e marcas reconhecidas; o
que ficou): a rosa dos instrumentos de aviação (régua 5°/10°, rótulo a cada
30°, a marca de rumo "bug"), o mostrador Waypoint do relógio (lugares na
direção real), cruzes de registro, rótulos mono de instrumento; o
"novelo" do NASA Eyes como lição negativa (uma rota acesa por vez).
Descartado: grades com brilho que segue o mouse, manchas, partículas,
"aurora", fundos 3D pesados; shader de tela cheia (seria um 2º WebGL).

**O que é.**
- `js/campo.js`: a geometria polar do reator estendida pela página — 12
  raios que se ramificam ×2 a cada dobra (teto: 48 no desktop, 24 no
  celular), anéis com hierarquia de régua, nós; ROTOR (do vão à 1ª
  ramificação) que gira com a roda do reator, ESTATOR fixo; rótulos de rumo
  ("030"…"360") e cotas ("R·0480") só no desktop e fora do texto; a ONDA
  nítida a cada expiração; PACOTES que voltam ao núcleo (partem em x=0,86 do
  fôlego, escalonados, para chegar no lampejo); a MIRA polar do cursor; a
  ROTA de uma opção até o núcleo; a MARCA DE RUMO com leitura ("→ SITES ·
  244°") na borda do campo, só com 48 px livres de texto.
- `js/rede.js`: a ponte com a página (origem no reator ou acima da página,
  fôlego, elementos acesos pela onda, opções sob o cursor, clique, entrega
  ao reator por `campo:chegou`, barramento dos módulos, registro automático
  por MutationObserver).
- `css/cartoes.css`: os cartões refeitos como MÓDULOS separados (vão 24 px
  celular / até 36 desktop), um sinal de canto só, o barramento de 1 px com
  nó desenhado pelo campo entre módulos irmãos (reto ou com chanfro de 45°).
  A pilha sobreposta do celular saiu.
- AI Core: pulso do toque com envelope finito (+18% a 30 ms, +28% a 0,1 s,
  fim a 0,6 s; a frente arranca e cruza a lente em ~0,37 s); toque novo não
  mata a onda em voo; agitação (3º toque em 2,4 s: até +1,1 rad/s, acalma a
  0,32/s); atento às opções (clareia); luz do núcleo nítida (disco de borda
  dura e anéis); recebe a energia do campo.
- Mini: reação à opção sob o cursor (marca de rumo no aro, inclinação de 6
  px, até 3 pulsos de espera no ritmo da rota), sugestão (vai até uma opção,
  fio de 1 px, mira nos cantos, um anel, link aceso; no máx. 1 a cada 12 s,
  só com a rolagem parada), agitação (brilha, 3º arco, órbita curta).
- Sem desfoque em lugar nenhum: saíram também as faixas de seção com
  degradê, a luz da prova e do console (viraram fio de 1 px) e as voltas do
  fio de varredura do hero.

**Processo.** Rodadas com 3 críticos (arte, movimento, celular) retomados
a cada rodada; resultados e notas no fim desta seção.

**Resultado das rodadas.** Rodada 1: arte 6,5 / movimento 6,5 / celular
6,5. Rodada 2: 7 / 7,5 / 7 (achado: a rede inteira caía do laço no
celular por colisão de nome, sem nenhum erro visível — corrigido e o
verificador agora pega). Rodada 3: 8 / 8,5 / 8. Rodada 4 (confirmação):
8,5 / 9 / 8,5, "pronto para o dono" nos três. Revisão de código: 4 altas
e 7 médias corrigidas (o campo não desenhava no movimento reduzido; a
sugestão podia ficar presa; o módulo atropelava o console e o
instrumento), conferidas; 0 de segurança. Medido: verificador 12/12 com
`campo=ok`, acessibilidade ok, 60 fps; LCP em A/B com 48d7c0b igual ou
melhor (mediana de 5); mini no celular visível ~80% do tempo rolando.

**Ficou para depois (baixo risco, anotado).** Alocações pequenas por
quadro (`polar`, `doca`), constantes de orientação lidas uma vez
(`celular`, `ESTREITO`), a leitura do rumo "presa ao aro" (sugestão de
arte), o "dente" no ponto do engate rotor/estator (sugestão de movimento),
utilitários duplicados entre rede.js e mini.js.

**Pendente do dono.** Ver no celular dele e dizer como prosseguir.

## 19. Reator limpo, núcleo nítido, trava em sentidos opostos, fundo do desktop e as estações (2026-10-03, 15ª sessão)

Pedidos do dono, vendo a prévia: (1) "o AI Core regrediu, está muito
poluído; o núcleo virou só uma bola branca, quero efeitos nele como antes,
porém melhor"; (2) "quase tudo gira para o mesmo lado: faça girarem para
lados diferentes, mais criativo"; (3) "o fundo funcionaria pro hero com algo
a mais, mas pro site todo não cai bem" + "no celular ficou muito bom: remodele
só no desktop"; (4) "onde há muitos cards, um AI Core médio ligado a eles,
transmitindo energia, que o mini possa turbinar; mais interações; analise se
o que entrar no celular estraga o que já foi feito".

**Reator (`spec.js`, `pecas.js`).** Saíram o disco de partículas, o anel do
equador, o fio de trás, o trilho de 1,07, dois anéis da lente e as faces de
trás/quinas das lâminas (o "fantasma"): 37 → 27 chamadas, 34 mil → 20 mil
triângulos. O núcleo é um shader (a COROA, num quadrado de frente para a
câmera, `premultipliedAlpha`): miolo branco pequeno e anéis em degraus, 36
filamentos de comprimento fixo (12 longos) que ficam brancos e esticam na
chegada da energia, um aro em 3 partes, a ÓRBITA de antes (a elipse do disco,
assinatura de que o dono gostava) em duas elipses tracejadas de 1 px em
sentidos opostos, e uma onda de 1 px que corre do núcleo às câmaras em
0,45 s na chegada. Tudo com antisserrilhado de 1 px por `fwidth`; nenhum
degradê.

**A trava (`spec.trava`, `travar()`).** Câmaras e pétalas giram em sentidos
opostos em relação ao portal, uma casa de 30° por fôlego: travadas ~2 s
depois do encaixe, soltam acelerando, chegam com velocidade e "clicam" (passam
~2° e voltam em 0,3 s) no instante em que a energia chega ao núcleo; os 12
raios piscam juntos ali. Régua e tracejado parados (duas referências fixas,
crítica: com tudo girando lia como máquina de lavar). Aro do núcleo, órbitas,
anel da lente e trilho alternam sentidos.

**Fundo do desktop.** `js/campo.js` ganhou a VARREDURA (só desktop): um raio
de 1 px que dá a volta em 14 s ao contrário do rotor e deixa acesos, em
degraus, os anéis, nós e rumos que cruzou. No desktop o campo vale só no
hero (no Hub nasce do reator; em Sites/Automação, atrás da arte do hero, que
vira o objeto medido) e termina em degraus no fim dele; fora da tela, anda mas
não desenha. Do hero para baixo, `js/trilho.js`, o INSTRUMENTO DESENROLADO:
réguas verticais nas margens presas ao documento, horizonte com cruz em cada
seção (acende quando o mini passa), a seção atual com barra de progresso,
cantoneiras e o nome vertical ("03/05 · GARANTIAS"), fluxo de traços (desce
na esquerda, sobe na direita), pulso por expiração que desce, atravessa os
horizontes e corre pelas ligações até os módulos, pacotes que sobem na
inspiração, rota e marca de rumo da opção sob o cursor. No desktop o mini
corre sobre a régua da direita. `js/rede.js` escolhe quem responde por cada
ponto (`fundoEm`). **Celular: nada muda** (trilho, varredura e estações não
existem lá; a folga extra dos nós é só desktop).

**As estações (`js/estacao.js`, só desktop).** Um AI Core médio (80 px) na
régua da esquerda, no CORREDOR entre fileiras mais perto do meio de cada grupo
de 3+ módulos encostado na coluna: miolo com anel e 12 filamentos que olha
para o cursor, aros de 3 e 6 partes em sentidos opostos, a órbita tracejada
achatada (a marca do núcleo do reator), estator parado e a CARGA em 12
segmentos. A cada inspiração manda um surto pela régua e pelo barramento: a
aresta de cima de cada módulo acende em sequência (`.is-onda`); o pulso do
instrumento a carrega um pouco. Clique nela (ou sozinho, no máx. 1 vez a cada
20 s por estação): o mini desce pela régua da direita, cruza pelo corredor
(sem passar por cima dos módulos), acopla SOBRE a régua, acima dela, e
transfere energia (o trecho da régua aceso + pacotes) até encher; ela TURBINA:
surto duplo e rápido, os módulos acendem a borda inteira (`.is-energia`), as
cantoneiras da seção piscam; o mini volta pelo mesmo corredor. Sob o cursor
ela acelera. Achado no teste: ao remedir a página a estação era recriada e o
mini ficava preso à cópia velha; agora o objeto é o mesmo (e há teto de 3 s
no acoplamento e 6 s parado). `B.estacoes.estado()` (só leitura) para testes.

**Análise do celular (pedido do dono).** Não entrou nada novo: no celular os
módulos ocupam a largura (margem de 20 px) e o mini já só aparece nos vãos;
uma estação de 80 px cobriria texto ou exigiria mudar o layout aprovado; o
instrumento de réguas nas margens não tem margem onde morar. O que mudou no
celular é só o reator (mais limpo, núcleo novo, trava), que é o mesmo nos
dois.

**Processo.** Crítica de arte em 2 rodadas (rodada 1: reator 7, núcleo 5,5,
rotação 7, hero do Hub 8, fundo do desktop 6; ajustes feitos) e revisão de
código (1 alta: a coroa escrevia alfa 1 no quadrado inteiro, um quadrado
preto opaco só visível com GPU; médias: campo desenhando fora do hero, onda
cortada pelo quadrado, tracejado deslizando ao rolar, `innerHeight` por
quadro — todas corrigidas). Crítica de arte rodada 2: núcleo 7, rotação 7,5, hero de Sites 7,5, fundo do
desktop 7, celular 9 (concorda em não mexer); o turbo (4) foi refeito depois
dela (cards respondendo por classe, corredor, carga em segmentos) e conferido
quadro a quadro. Verificador: 11/12 nas três últimas rodadas, cada vez um alvo
diferente acima do orçamento de LCP por pouco (2,2–2,7 s), com a CPU da
máquina em 100%; acessibilidade ok. Medido: A/B intercalado com 4f9d1a3 (GPU real):
desktop 60/60 fps, celular com CPU 4× ~49/49 (CPU da máquina em 100%), script
por quadro igual. LCP oscilou nos dois lados (a CPU em 100%; o código novo
começa depois do `load`).

## 20. Núcleos que transbordam e as estações no centro dos cards (2026-10-03, 15ª sessão, 2ª parte)

Pedido do dono: "revisão geral. Os núcleos dos AI Cores devem ser bem
bolados, transmitir a sensação de que estão transbordando de energia — vale
para todos, especialmente o principal; se possível, remodele do zero. Os AI
Core médios devem estar no centro dos cards, conectados a todos, com alguma
menção de que estão conectados ao principal. Separe em partes e só termine
no resultado perfeito."

**Parte 1 — inventário.** Grupos que comportam uma estação no centro
(desktop): Hub › Garantias (4 → 2×2), Sites › Padrão de entrega (6, já em 2
colunas), Automação › Capacidades (6, de 3×2 para 2×3). Viável sem salto de
layout: o espaço é do HTML/CSS.

**Parte 2 — o núcleo do reator, do zero (`js/nucleo/coroa.js`).** Três
tentativas: (1) línguas em lobos polares — liam como flor/órbita de átomo
(descartada); (2) GLOBO DE PLASMA — fios ondulados do núcleo até o vidro,
com arco aceso no contato, rompendo o vidro em raio no estouro (aprovado
como conceito, mas pequeno e calmo demais no tamanho real); (3) a versão
final: zona do núcleo ~50% maior (vidro 0,28, núcleo 0,09); o vidro é da
coroa (de frente para a câmera, 48 marcas girando e arcos correndo nele; o
anel inclinado da lente não batia com os contatos e saiu); TRANSBORDA em
repouso (de tempos em tempos um fio fura o vidro sozinho); o CURSOR atrai
os fios (o mais próximo engrossa e rompe o vidro na direção dele, como o
dedo num globo de plasma); borda que ferve em 5 frequências; 3 ECOS em
curvas de nível (o "brilho" em traço); raios com tronco afinando e galho;
faíscas por fora; a onda da chegada. Tudo com antisserrilhado de 1 px; o
alfa é o maior canal com `premultipliedAlpha`. No celular, menos fios,
faíscas e ecos (`coroa.celular`). Achado de passagem: a correção do
"quadrado preto" do commit anterior tinha ido para o shader do VIDRO (que
ficou translúcido) e não para o núcleo — corrigido. Os shaders das peças
foram para `js/nucleo/shaders.js` (pecas.js 966 → 606 linhas).

**Parte 3 — o mesmo núcleo nos pequenos (`js/plasma.js`).** Estação: fios
desiguais que batem num vidro, dois ecos, rompe o vidro no turbo e quando o
alimentador chega. Mini: no tamanho dele fio fino some (lia como alvo) e
três pontas girando liam como hélice; ficaram PONTAS grossas que nascem em
ângulos sorteados e furam o anel como faíscas. Achado: na estação o objeto
do plasma era criado antes das cores (o núcleo saía preto).

**Parte 4 — estações no centro.** `.tem-estacao` (≥981 px e só com mouse:
num tablet com toque o JS não monta a estação) vira 2 colunas com um
corredor de 120 px; o `.estacao-vao` é o último filho (as entradas contam
os cards pela ordem) e o grid o põe na coluna do meio; linhas da MESMA
altura, então a estação cai exatamente no ramo do meio (3 linhas) ou no vão
(2 linhas); sem JS, um anel parado. A estação (~110 px de carga) tem uma
espinha no corredor e um ramo até a borda de cada card; o barramento entre
irmãos é pulado nesses grupos. A ligação ao principal: o ALIMENTADOR sobe
do topo dela até o horizonte da seção com um mini-símbolo do reator e "↑ AI
CORE"; a CADEIA da energia é real: o pulso do reator (a cada expiração)
desce pelas réguas, atravessa o horizonte até o meio (`trilho:meio`), desce
pelo alimentador, carrega a estação e ela manda um surto a cada card (a
aresta de cima acende). Se o horizonte já passou do topo, o pulso entra pelo
alto da tela (`trilho:onda`). TURBO (clique, ou o mini sozinho): o mini vem
pelo corredor entre as fileiras, acopla acima dela no eixo, enche a carga e
ela turbina: a rede dela acende em branco, os cards acendem a borda e um
traço percorre a borda de cada um uma vez (`.energia-volta`, máscara cônica
com `@property`); o mini volta pelo mesmo corredor.

**Celular.** O layout dos cards não mudou (o espaço da estação some; o
barramento volta). Mudaram só o núcleo do reator (maior, mais leve no
celular) e o do mini.

**Parte 5 — rodadas.** Crítica de arte com olhar novo: rodada 1 **6,5**
(núcleo pequeno e calmo, cursor sem efeito, mini como "alvo", estação como
"cata-vento", estação fora do ramo, ligação ao principal ilegível, turbo
sem recompensa) → rodada 2 **8** (núcleo 8, estouro 9, cursor 8,5, estação
no centro 8,5) → ajustes finais: mini com 5 pontas curtas irregulares
piscando alternadas (4 iguais liam como mira; uma longa, como ponteiro);
o mini segue o caminho exato até a estação (com a mola cortava o canto dos
cards) e não dispara sinal ao trilho de lá (sobrava uma linha atravessando
um card); traço do turbo em 4 lados só com transform (a 1ª versão animava
uma variável de CSS, contra a regra 1); órbita da estação inclinada (deitada
lia como olho); linhas dos grupos na altura natural e a estação posta pelo
JS no ramo do meio (3 linhas) ou no vão (2 linhas). Revisão de código em 2
voltas (alta: `pow` de base negativa e `atan(0,0)` no shader, risco de NaN
em GPU de celular; médias: o layout de 2 colunas valia para tablet com
toque, custo por pixel, relógio de 400 s, alocações — tudo corrigido).

**Medido.** 1ª pintura em A/B (mediana de 5, GPU real): desktop 864 ms contra
1104 ms do commit anterior; celular 800 contra 1340 (não piorou; a CPU da
máquina em 100% faz o número oscilar). fps com GPU real: desktop 60/60;
celular com CPU 4× ~49/49. Verificador 12/12; acessibilidade ok. No modo de
teste sem GPU (SwiftShader, só informativo) o reator caiu de ~17 para ~10
fps: a coroa custa mais por pixel; no celular ela usa menos fios, faíscas e
ecos, e o porteiro já barra WebGL por CPU.
Rodada 3 da crítica: **9/10, "chegou ao pedido do dono; pode fechar"**
(núcleo 8,5, mini 8, estação 8,5, estação como central 9, turbo 9, ligação
8, duas colunas 9, celular 8,5). Ajuste final opcional: espaços que não
quebram em "não no meu" (o título quebra "No ar, / não no meu computador",
sem mudar a redação).

## 21. Núcleo redondo que brilha, fluxo das estações, mini que encaixa nos CTAs, heros próprios e a passagem (2026-10-04, 16ª sessão)

Pedidos do dono (ver o print do CTA "Agendar diagnóstico" com os cantos):
(1) núcleo sem "deformações", redondinho e certinho como antes, sem os raios,
mas que BRILHE; (2) AI Core médio conectado aos cards, com a energia fluindo
até eles e efeitos nos cards; (3) mini com um ESPAÇO para acoplar e turbinar,
também em opções como o CTA; um agente ativo para a imersão no site inteiro;
(4) acelerando, a rotação ia toda para o mesmo lado; (5) heros de Sites e
Automação únicos; a transição entre páginas tinha sumido e o site parecia
travar: otimizar e trazer a transição de volta, melhor.

**Transição (`js/passagem.js`, `css/motion.css`).** Medido no Chrome real
(Playwright com `C:/Program Files/Google/Chrome`, janela visível): a View
Transition entre documentos falhava em 14 de 14 trocas (a página velha
iniciava, a nova chegava com `pagereveal` nulo); a bisseção mostrou que GSAP,
CSS e até páginas mínimas oscilavam — não confiável. Agora a transição é do
site: no clique, o painel opaco cobre (0,42 s) com o fio de luz na frente, a
marca do AI Core e o nome do destino; navega; a página nova nasce coberta
(`passagem-chega`, posta no head por `ancoras.js`) e o painel segue a
varredura (0,62 s). Só transform (compositor). Pré-carga na intenção
(cursor, dedo, foco). Desktop da esquerda para a direita; celular de cima
para baixo. Voltar/avançar (bfcache) sem painel preso — conferido.

**Travamento.** Perfil no Chrome real rolando /automacao: ~40% do quadro do
laço era layout forçado — ler `window.scrollX` dentro do quadro depois do
GSAP escrever estilo. A rolagem fica em cache em `core.js` (`B.S.sx/sy`); a
rede só remede a página com a rolagem parada (teto 1,2 s); o começo da rede
herdada saiu de antes do 1º quadro. Medido: script do laço 1123 → 474 ms e
layout forçado 474 → 67 ms no mesmo roteiro; A/B com 627242d rolando as três
páginas: quadros > 25 ms 27 → 13, script por quadro ~1,2 → ~0,9 ms. Achado
de passagem: o canvas do fundo era desenhado com `innerWidth` (com a barra de
rolagem) num elemento sem ela — tudo ~1% comprimido; agora `clientWidth`.

**Núcleo (`js/nucleo/coroa.js`).** Círculos perfeitos: miolo branco que
esquenta com a pressão e o fôlego, faixa ciano claro, ciano forte, vão de
1 px e aro; o REFLEXO (arco branco que corre e vira para o cursor); o HALO
em curvas de 1 px (as de dentro inteiras, as de fora em arcos que giram em
sentidos alternados); a CARGA do fôlego atravessa o halo; CINTILAÇÕES curtas;
EMISSÃO de anéis até o vidro; as marcas do vidro acendem do lado do cursor.
Fios, bordas que ferviam, raios e faíscas saíram (estão em 627242d). Mini e
estações na mesma linguagem (`js/plasma.js`).

**Rotação.** O impulso (rolagem, cliques) entrava na roda inteira e cada
camada somava por cima: tudo ia para o mesmo lado. Agora cada camada tem o
seu `arrasto` relativo à roda: câmaras −1,2×, pétalas +1,5×, vidro do núcleo
−1,3× (spec.trava).

**Estações (`js/estacao.js`, `css/cartoes.css`).** Ramos mais visíveis; uma
PORTA em cada card (conector na borda que dá para a estação); pacotes (rastro
ciano, cabeça branca) correm sem parar até ela; cada chegada pisca o pino; o
card sob o cursor é o FOCO (ramo branco, fluxo dobrado, a energia ATRAVESSA o
card numa linha de 1 px); o surto da expiração atravessa todos. Soquete do
mini no alimentador, acima dela.

**Mini (`js/mini.js`, `css/base.css`).** Soquete no canto de cada CTA
principal (aparece com o mini por perto). Lê o comportamento: cursor
hesitando perto/sobre o botão (~0,9 s) ou o botão no meio da tela com a
leitura parada (~2,2 s, depois de a pessoa ter rolado; vale no celular).
Encaixado: quatro travas fecham sobre ele, mira de quatro cantos, traço na
borda, a luz atravessa o botão em ritmo, a seta chama; pulsa junto; fica
enquanto o cursor estiver no botão (teto 8 s). Um encaixe a cada 16 s, o
mesmo botão a cada 30 s. Rolando rápido ele vai um pouco à frente.

**Heros (`js/hero-fundo.js`).** Sites, "a grade de construção": 12 colunas,
linhas de base, réguas em px presas à página, mira com coordenadas, cotas
REAIS da janela e a cascata da carga com os arquivos e tempos REAIS desta
página (Resource Timing), refeita a cada expiração (no celular só réguas,
colunas e cotas). Automação, "o circuito": o painel vira chip com pinos,
trilhas de placa até as margens, pacotes entrando, a via perto do cursor
acende e dispara. No desktop substituem o campo no hero; no celular o campo
segue abaixo do hero (o fundo aprovado do celular continua igual no resto).

**Verificação.** Verificador 11/12 (LCP de Sites 2524 ms contra 2500, com a
CPU da máquina a 100%; A/B de LCP com mediana de 5 contra 627242d: as
medianas ficaram um pouco acima nas três páginas mas com faixas totalmente
sobrepostas — a mesma página variou de 0,9 a 2,7 s); acessibilidade ok;
voltar/avançar ok.

**Revisão de código (agente independente) e correções.** Alta: a porta e a
travessia dos cards nunca animavam (a classe saía sem o prefixo `is-`) —
corrigido e conferido (`porta-a` rodando). Médias corrigidas: o soquete do
CTA ficava girando se o mini desistia no voo; a passagem agora se desfaz
sozinha se a navegação não acontecer (4 s) e não quebra sem rótulo; o teto da
remedida conta do primeiro pedido; as faixas do núcleo não se cruzam no
estouro (anel de cor errada); a carga da cascata é lida em evento (não por
quadro); no celular o campo é recortado em vez de desenhado e apagado.
Baixas: leituras e escritas separadas nas docas, rótulos das cotas guardados,
circuito não recomeça a cada remedida, sem pré-carga com economia de dados,
o boot do hero espera o painel da passagem abrir, o shader do núcleo pula
halo/emissão fora do vidro. Depois: verificador 12/12, acessibilidade ok.

## 22. A pilha do celular de volta, com upgrade (2026-10-04, 16ª sessão, 2ª parte)

Pedido do dono: "no mobile, conforme íamos descendo, alguns cards ficavam
sobrepostos; ao descer apareciam e ao subir voltavam a se sobrepor. Volte com
isso e, se der, faça um upgrade. Só no mobile." Saiu em 9af2c2d (módulos com
vão). Volta em `.pilha` (Garantias do Hub, o problema da Automação, Formatos
de Sites), até 720 px: `position: sticky` em degraus de fichário (CSS puro;
sem JS e em movimento reduzido continua, parada). Upgrade: o degrau mostra o
NÚMERO do card coberto (a aba; `calc(--mod-pad + 20px)`, cabe de 320 a
720 px) e ele acende em ciano quando coberto; o de baixo recua (scale .95) e
o miolo esmaece pela rolagem; o encaixe acende a aresta de cima; a aba não
recebe toque (abria o WhatsApp do card de baixo); foco de teclado num card
coberto rola até ele. O fundo vivo conhece os cards grudados
(`rede-texto.js`, GRUDAM). Revisão de código: os gatilhos mediam o card
grudado e desencaixavam depois de um refresh no meio da pilha — agora medem a
pilha com a posição natural somada (conferido: starts iguais antes e depois
do refresh); o `is-foco` de posição não age nos cards da pilha. Verificador
12/12, acessibilidade ok.

**Correção do sentido (mesmo dia):** o dono viu e disse que era "ao
contrário". Agora o grupo CHEGA EMPILHADO (um monte: o 1º card na frente, os
outros atrás com as bordas de baixo em degraus de 10 px, encolhidos 3,5% por
nível) e, descendo, a rolagem DISTRIBUI os cards: cada um sai do monte e
desce até o seu lugar enquanto o lugar dele sobe de 100% a 74% da tela; ao
encaixar, a aresta acende; subindo, voltam ao monte. Miolo apagado (12%) no
monte e na viagem, nítido ao encaixar; card no monte sem toque. Sem sticky:
sem JS, sem GSAP e em movimento reduzido fica a lista comum (resolve a dúvida
sobre quem pede menos movimento). A revelação de entrada não mexe nos cards
da pilha (o clearProps apagaria a posição do monte). Verificador 12/12,
acessibilidade ok.

**"Não funcionou, acho que bugou" (mesmo dia).** Reproduzido com toque de
verdade (CDP `dispatchTouchEvent`; o `synthesizeScrollGesture` não rola nem
página em branco nesta máquina): a lógica funcionava, mas cada card só saía
do monte quando o lugar dele entrava pela borda de baixo — a distribuição
acontecia fora da vista e num piscar. Agora o monte PARA no alto da tela
(pin do ScrollTrigger, 260 px de rolagem por card) e os cards saem um a um à
vista; depois a página segue; subindo, voltam ao monte (conferido nos dois
sentidos no Hub, Sites e Automação). O pin é publicado como `B.pino` (o do
palco da prova é só do desktop), para o fundo vivo. Verificador: 11/12 com o
alvo que falha trocando a cada rodada (LCP, CPU 74–100%); acessibilidade ok.

**Volta à primeira versão (mesmo dia).** Com a parada na tela o dono achou
que "parece travado" e pediu a primeira versão de hoje ("tava perfeitamente
imersivo"), com melhorias. Restaurado o estado de 0508a12 (anima.js,
cartoes.css, rede-texto.js): sticky em degraus com a aba numerada, o recuo e
o esmaecer do coberto, o encaixe que acende, a aba sem toque, o foco que rola
até o card, gatilhos pela posição natural. As variantes "monte que se
distribui" (ce68979) e "monte que para na tela" (b1c2fff) ficam no histórico.
Lição: o dono descreve pelo que sente; na dúvida entre direções, mostrar
antes de trocar o que ele já aprovou.

**A versão escolhida pelo dono: "o monte que se abre" (mesmo dia).** Depois de
três tentativas por interpretação, perguntei com o passo a passo de duas
opções; ele escolheu: chega-se a um monte; descendo, a página NÃO para, o
card da frente sobe com ela e o de trás fica parado sendo revelado; subindo,
cada um volta a se esconder até virar monte. Feito em CSS puro:
`position: sticky` pelo BAIXO (linha 96 px acima do fundo da tela, acima da
barra fixa; degraus de 8 px; z-index decrescente; fundo opaco). O navegador
move tudo no compositor, junto com o dedo — a versão com JS e parada parecia
"travada". Saiu a coreografia de JS da pilha; o fundo vivo não desenha
barramento entre os cards da pilha no celular. Conferido com toque real nos
dois sentidos; verificador 12/12; acessibilidade ok.

**A carga da pilha (mesmo dia, pedido: "efeitos de energia conforme for
descendo, como se os cards estivessem carregando").** O movimento continua
CSS; a energia é do `anima.js`: barra de 12 segmentos (borda dura) na BASE de
cada card — a parte revelada primeiro; no topo ela enchia escondida atrás do
card da frente — que enche enquanto ele é revelado (o 1º enquanto o grupo
sobe até o monte); enquanto carrega, a energia desce (traços de 2 px) da base
do card da frente para dentro dele; cheia, pisca branca e fica ciano, aresta
e número acendem, uma linha de luz atravessa o card. Subindo, descarrega.
Intervalos pela posição natural + a linha do sticky, medidos na pilha só no
refresh; por quadro só o scaleX da barra. Conferido com toque real nos dois
sentidos; verificador 12/12; acessibilidade ok.

## 23. A carga dos cards (cursor no desktop, rolagem no celular) e o mini como criança insistente (2026-10-04)

**Carga (`js/carga.js`, `css/cartoes.css` "A CARGA" e "O VISUAL DA CARGA").**
Uma peça só: no celular a rolagem da pilha comanda (`anima.js` chama
`B.carga.definir`); no desktop com mouse o CURSOR comanda — volta a função da
V1 (`js/field.js`, 81a787a): o card carrega conforme o cursor se aproxima
(300 px, quadrático, até 85%; em cima, 100%) e descarrega ao afastar. Visual
escolhido pelo dono entre quatro opções testadas na prévia (?carga=a|b|c|d,
já removidas): "B + D" — cantos de mira em neon que crescem e fecham a
moldura, borda neon que acende no último terço, pontos de luz correndo nos
quatro lados, barra neon com ponta e porcentagem. O brilho difuso aqui é
EXCEÇÃO pedida pelo dono (imagem de referência); no resto do site continua
proibido. Revisão: a porcentagem por `nodeValue` (com `textContent` o
MutationObserver da rede remedia a página inteira a cada número); a borda do
carregado não vence os destaques da estação; altura em cache; desktop e
pilha nunca disputam o card ao mudar a largura.

**Mini (`js/mini.js`), "como uma criança muito insistente".** Sai da doca a
cada 2,5–5 s (antes 8–14), sugere a cada ~4,5 s (antes 12), encaixa nos
botões com 0,45 s de hesitação ou 1,1 s de leitura parada; INSISTÊNCIA 0–1
sobe ~1/14 por s ignorado (sai mais cedo, pula mais alto, gira mais rápido) e
zera com clique ou o cursor perto; quica parado; segue o cursor de pertinho
(34/30 px, 3–5 s); no celular corre até o toque (fora de links); encaixado
sem clique, puxa a manga; pulo de festa quando o cursor chega. Conferido
quadro a quadro no Chrome real (desktop e toque).

**Medido.** Verificador 12/12; acessibilidade ok; LCP A/B (mediana de 5)
contra 2a10f4d sem diferença fora do ruído (desktop 944/1180/1588 contra
1016/1228/1520 ms; celular 1372/1356 contra 1612/1356 ms).

## 24. Letras, sobrecarga, tomadas discretas e o mini com vida (2026-10-04)

**Letras em 100% (`js/carga.js`).** No 1º cheio o texto do card vira letras
(SplitText 3.15, aria automático: o leitor lê a frase inteira) e uma onda de
luz o atravessa letra por letra (15 ms por letra, teto 1,5 s; no máximo uma
onda a cada 3,5 s por card).

**Sobrecarga (`js/estacao.js` + `js/carga.js`).** O mini acoplado ao AI Core
médio fica CONECTADO até novo clique no núcleo dele ou rolagem de 90 px (antes
soltava sozinho); enquanto conectado, os cards da estação ficam em sobrecarga
(moldura neon cheia piscando, cantos brancos, pontos rápidos, barra "MAX"
crepitando, onda de letras a cada 2,4 s) e a estação em turbo contínuo.
Conferido: conecta, segue conectado após 13 s, 2º clique solta, rolagem solta.

**Tomadas (`js/mini-docas.js`, separado do mini.js).** Dono: "mais
minimalista e discreto, e não em cards". Anel fino apagado com um ponto; as 3
travas só aparecem no encaixe; só botões principais e secundários.

**Encaixe animado (`js/mini.js`).** Dono: "estável, parado, não tremendo; uma
animação dele se acoplando, não algo rápido e sem vida". Chega freando
(proporcional à distância), alinha 22 px acima girando devagar (0,45 s),
desce devagar (0,7 s), trava (as travas fecham, 0,3 s) e assenta imóvel (sem
pulinho, puxão ou órbita); ao sair, sobe até o alinhamento (0,45 s) e vai.
Vale para botões e estações.

**Vida (`js/mini-vida.js`).** Repertório consultado antes do passeio comum,
cada um com pausa própria: contornar o card sob o cursor parado; brincar em
volta do cursor parado perto dele; sentar no fim de um texto selecionado
(interrompe o que não é encaixe); guiar até a próxima seção; ler junto ao
lado do título; espiar meio escondido na borda; dormir após ~22 s sem gestos
(esmaece, quase para, arcos de sono; acorda com festa). Também: mergulha no
centro na passagem entre páginas e comemora ao abrir uma pergunta do FAQ.
Conferido no Chrome real: todos observados num mesmo passeio de teste.
Verificador 12/12; acessibilidade ok.

**Revisão deste lote (agente independente) e correções.** Alta: com as letras
partidas, o fundo (rede-texto.js) criava uma zona por letra (~250 por card):
custo por quadro e apagado engrossado — agora cada texto partido
(`[data-carga-split]`) vale como uma zona. Médias: o texto é partido ANTES,
com o navegador ocioso e só nos cards fora da tela (evita o pulo de layout na
hora do efeito e o turbo da estação cortado na 1ª conexão); SplitText em
`span` com `aria: 'none'` e a seta (aria-hidden) fora; `ps.travou` zerado ao
entrar no encaixe e em `ir()`; contornar e brincar seguem o caminho exato
(com a mola cortavam o card); no celular guiar/ler junto/seleção ficam no
trilho; o MERGULHO na passagem foi implementado de fato (alvo no centro,
passeio e tomadas parados, posição salva no centro). Baixas: título que saiu
da faixa é esquecido; `ir()` encerra o comportamento anterior; seleção em
formulário ou maior que 400 caracteres ignorada; estação que some do mapa
conectada solta a sobrecarga; novo clique numa estação para a qual ele já
vai não reinicia o caminho. Conferido: estação conecta (~1 s de viagem,
encaixe em etapas, carga ~1 s) e ele fica imóvel; letras 143 sem rótulo
extra. Verificador: falhas de LCP só no desktop de Sites/Automação com a CPU
a 100%; o elemento do LCP é o título/parágrafo do hero (1–2,6 s), sem
relação com este lote. Acessibilidade ok.

## 25. Revisão de leveza (2026-10-04)

Pedido do dono: "revisão e otimização, deixe mais leve, sem estragar os pontos
fortes". Medido antes de mexer (Chrome real, mesmo roteiro: parado, rolando,
mouse; desktop e celular; nós, heap, tarefas longas) e rastreado com
invalidações de estilo e pilhas de layout forçado. Achados e correções:
- Os PONTOS da carga animavam sempre, até invisíveis, em unidades de
  contêiner (cqw), fora do compositor: ~12,7 mil recálculos de estilo numa
  rolagem. Agora a trilha de cada lado anda em % do próprio tamanho (o
  compositor resolve), o ponto só aparece animando (opacidade na animação) e
  só anima no card carregando/cheio/em sobrecarga.
- `ctx.font` a cada quadro forçava o estilo da página (~225 ms numa rolagem
  no celular): `B.fonte` troca só quando muda (zerado após `restore` e ao
  redimensionar). `measureText` a cada quadro (~250 ms): `B.largura` mede
  cada rótulo uma vez por fonte (a memória é limpa quando a fonte carrega).
- A carga só redesenha tubo e cantos quando muda 1% (era 0,2%).
- A luz de cada letra dura 0,38 s (era 0,62): menos letras animando ao mesmo
  tempo (a cor não vai para o compositor) — a forma da onda é a mesma.
Resultado (antes → depois): estilo parado 0,3–0,8 → 0,05–0,13 ms/quadro;
quadros lentos rolando Automação desktop 55 → 27, Hub desktop 34 → 25, Hub
celular 53 → 41; fundo no celular rolando 1,7 → 0,5–0,7 ms/quadro.
Revisão de código: o ponto ficava parado como "toco" fora do canto (corrigido
com a opacidade na animação), a trilha 18 px mais curta (restaurada), a
largura medida com a fonte reserva (limpa no carregamento da fonte), a barra
presa em 99% (corrigido). Verificador 12/12; acessibilidade ok.

## 26. Encaixe suave do mini e a transição até a sobrecarga (2026-10-04, 17ª sessão)

Pedido do dono: "melhore o efeito do mini AI Core se acoplando, deixe-o mais
suave" e "quando ele se acopla e a energia do AI Core médio entra em
sobrecarga os cards instantaneamente entram no efeito, crie um estado de
transição nesse espaço de tempo".

**Encaixe (js/mini.js, js/estacao.js).** O que dava o tranco, medido quadro a
quadro no Chrome real: velocidade constante (810 px/s) com quinas secas,
freada no seco a ~180 px/s, e o ângulo dos arcos pulando ao trocar a
velocidade de giro (era relógio × velocidade). Agora o caminho vira uma linha
com cantos arredondados, percorrida numa senoide (sai do repouso, embala, chega
ao repouso); a pausa de alinhamento caiu de 0,45 para 0,14 s; o giro é somado;
as três travas fecham no instante em que ele assenta (estação também) e abrem
antes de ele subir; a volta usa o mesmo trajeto. Na estação ele não atravessa
mais o núcleo: vai pelo corredor e sobe num arco elíptico dentro da coluna dela
(120 px; um arco redondo passaria por cima dos cards). O soquete acende conforme
o mini vem para ela e o fio da transferência se desenha em 0,35 s.

**Transição (js/carga.js, css/cartoes.css).** Três atos: PRESSÃO (enquanto o
mini enche a estação, a carga dos cards sobe por baixo até 82%, no mínimo
1,2 s, e os cantos tremem na reta final); IGNIÇÃO (o surto da conexão corre
pelos ramos e cada card, o mais perto primeiro, vai a 100% em 0,9 s com a borda
pegando aos trancos, como neon ligando); SOBRECARGA (linha de luz, onda de
letras, MAX). Ao soltar, ESFRIA em 0,6 s em vez de cair de uma vez. Medido:
acoplou → sobrecarga em ~2,5 s; borda na ignição 0,20 → 0,70 → 0,15 → … → 1.

**Achado no caminho (js/pagina.js).** Os números ao vivo da prova recriavam
nós a cada 0,5 s; o MutationObserver da rede remedia a PÁGINA INTEIRA a cada
0,5 s (e apagava o surto das estações em voo). Agora só o texto muda: zero
remedições durante a sequência.

**Achado não corrigido (decisão do dono).** A sobrecarga declara um piscar da
borda (`sobre-pisca`) que nunca rodou: o `opacity: 1 !important` vence a
animação. O que o dono viu e aprovou é a borda acesa parada.

Revisão por agente: arco começando no meio com fileiras ímpares, volta refazendo
o caminho abandonado, travas sumindo ao soltar pelo clique, pressão estalando
num reacoplamento, movimento reduzido no meio da sequência e o soquete
acendendo para qualquer passagem — corrigidos. Verificador: 1ª rodada 12/12;
depois, LCP falhando em alvos que trocam a cada rodada com a CPU a 100% (o
falso alarme conhecido). Acessibilidade ok.

## 27. Sem piscar: energia circulando pela borda; revisão geral (2026-10-05)

Dono: "tire o piscar por energia transitando pelas bordas de forma bem suave
e discreta/minimalista" e "revise tudo, procure bugs e possíveis melhorias".

**A luz que circula (js/carga.js `circular`, css/cartoes.css).** Saíram o
tremor da pressão, a borda "aos trancos" da ignição e a barra crepitando. Uma
luz só (1,5 px, cabeça branca, cauda ciano em degradê, sem desfoque) dá a volta
no card a 170 px/s: quatro lados recortados, cada um com uma faixa do tamanho
do perímetro, defasados pelo trecho anterior — atravessa os cantos sem emenda;
transform em %, no compositor. A moldura parada da sobrecarga ficou ciano a 70%
(toda branca, a luz sumia nela), com transição na entrada e na saída.

**Bugs achados e corrigidos.** Regra de estado perdendo para a base em
especificidade (a luz nascia invisível; a borda do card sob o cursor na estação
e a do link sugerido pelo mini na faixa do hero nunca acendiam). Títulos em flex
quebrando no meio da palavra ao partir em letras ("Fe/ito prim/eiro", Sites). No
celular, "Agendar diagnóstico" no menu abria o modal e devolvia o fundo ao Tab.
O palco da prova, ao sair do desktop, deixava observador, ouvinte e B.pino vivos.
Resumo: botão sem destino sem JS e PDF sem contato. Código morto escrevendo por
quadro (o aro da V1). Seta do fluxo sem fallback. "Ver a prova" morto sem JS.
Skip-link para o main. Laço: remover um subsistema no meio do quadro pulava o
vizinho. Laço da rampa isolado por card.

**Para o dono decidir.** Os pontos de luz que correm nas bordas (`.carga-nos`)
estão invisíveis desde a versão escolhida (5fe12d2): ligar ou apagar o código?
A imagem de compartilhamento (og-cover) está desatualizada (texto antigo, Arial).
Descrições do Google longas (195 caracteres no Hub). "O primeiro ano do domínio
é por minha conta" está no FAQ/dado estruturado: segue valendo? Ícone para iPhone
(apple-touch-icon) não existe.

Verificador 12/12; acessibilidade ok; sequência da estação e encaixe no CTA
conferidos no Chrome real.

## 28. Pilha do celular mais suave e as letras em dois efeitos (2026-10-05)

Dono: "para o mobile, a transição dos efeitos de sobreposição dos cards mais
suaves, um pouco mais lentos, mais perceptíveis" e "o efeito das letras atual
somente nos cards que possuem o AI Core médio; os demais, outro efeito, com uma
transição suave que permita que as letras fiquem acesas".

**Pilha (o movimento sticky aprovado não mudou: segue 1:1 com o dedo).** A
carga corria junto com a rolagem e enchia em ~200 px (0,1–0,2 s num deslizar
normal). Agora CORRE ATRÁS dela (`B.carga.seguir`: velocidade proporcional à
distância, 0,35–2,2/s): 0→100% em ~0,95 s mesmo num deslizar rápido. Clarão e
linha do 100% mais lentos no celular (1,1/1,15 s) e entrando em fade; o fio de
energia segue a carga mostrada (não a rolagem crua) e desce mais devagar;
histerese (cheio entra em 99,5% e sai abaixo de 90%; o número fica em 100%).

**Letras.** Cards de uma estação viva (desktop): a onda de antes. Os demais (e
todos no celular): ACENDER — a linha que atravessa o card acende as letras por
onde passa (--dx pela posição de cada letra e pela curva da linha), um pico de
luz e assentam acesas: título #EDFDFC (acima do --t1), texto #CFDBDA; apagam
juntas em 0,6 s. Duas rodadas de crítica: (1) cor única quase branca parecia
negrito e escurecia o título; ordem de leitura descasada da linha; sem
histerese; (2) a luz corria ~120 px à frente da linha — pico a 6%, subida que
começa devagar e atraso nunca negativo: agora no máximo 23 px à frente.

Medido (Chrome, 390 px, A/B com o commit anterior, CPU 4× mais lenta):
quadros lentos 19 → 2, p95 92 → 33 ms. Verificador 12/12, acessibilidade ok,
sequência da estação intacta (onda na sobrecarga).

## 29. O próprio deslizar da pilha, letras sempre acesas e o salto da página (2026-10-05)

Dono: "eu quero que as letras fiquem acesas, e eu tava falando sobre o próprio
deslizar" (o pedido do §28 era o movimento dos cards, não os efeitos).

**O deslizar (css/cartoes.css "O DESLIZAR", js/anima.js).** Por cima do sticky
aprovado: o card da frente se SOLTA devagar (~0,6× o dedo) e acelera até 1×
enquanto revela o de baixo; depois ALCANÇA de leve (pico 1,3×). Animação ligada à
rolagem (animation-timeline: scroll(root)) só de `translate`: roda no
compositor, colada no dedo, a página nunca para (o "travado" que o dono
rejeitou). Faixas em px escritas pelo JS no refresh, na remedição da página e
quando a área visível muda de altura (barra de endereço). A carga do card de
baixo termina quando ele está DESCOBERTO. Sem suporte (Safari antigo/Firefox):
o sticky puro; `?pilha=antes` para comparar. A escala do card de baixo saiu
(encolher a camada borra texto e borda). Medido: card preso nunca desce (0
inversões com toque real), soltura no px certo, nenhum card cheio coberto.

**Letras.** Acesas ficam — também depois de descarregar; texto #D9E4E3.

**O salto da página (antigo, achado agora).** Os h2 divididos em linhas para a
entrada eram 40–55 px mais altos (um `<br class="br-l">` escondido no celular
que o SplitText quebrava mesmo assim; margens das máscaras colapsando e vazando)
e, ao voltar no meio da rolagem, tudo abaixo pulava. Corrigido: o br vira um
span vazio enquanto dividido, `flow-root` e a soma das margens, e uma trava que
desfaz a divisão se a altura mudar. Também o contador da prova (0 → 712 KB)
re-quebrava a legenda e pulava 11 px: a largura final fica reservada. Conferido
rolando as três páginas inteiras, celular e desktop: nenhuma seção muda de altura.

Revisão: crítico visual (3 rodadas) e revisor de código; verificador 12/12,
acessibilidade ok; A/B de desempenho empatado com a versão anterior.

## 30. A frase-resumo na régua volta para todas as opções (2026-10-05)

Dono (com print da régua, "← AUTOMAÇÃO & IA"): "com o cursor em cima de cada
opção aparecia uma frase resumindo em poucas palavras o que estava escrito ali;
você cortou muito disso; era um charme a mais; volte com ele e otimize".

**O que cortava (medido).** A leitura do rumo era o título cortado em 22
letras e só era desenhada se coubesse inteira numa linha, com margem ≥ 96 px:
em 1280 px, 0 opções; em 1440 px, 8/15 (Hub), 13/31 (Sites), 5/27 (Automação);
em 1920 px aparecia, mas truncada ("PERFORMANCE É REQUISI…") e, na prova,
embaralhada ("1,00SATÉ A PÁGINA EST…"). Os cards de Garantias nem eram opção.

**Agora.** Cada opção tem uma frase-resumo própria (`data-rotulo` no HTML, até
~28 letras, tirada do texto do card — nada inventado). O trilho a quebra em até
2 linhas ao lado da régua com a seta de texto; se a margem não comporta
(1280 px), ela fica em pé ao longo da régua, como o nome da seção. Ela se
escreve em 80 letras/s. Cards de Garantias (laudo__row) entram como opção.
Otimização: a quebra é guardada (sem medir por quadro), a frase com a seta é
montada uma vez no hover, refeita quando a fonte carrega. Revisão de código ok;
verificador 12/12.

## 31. Sem fumaça no neon; a frase da régua nítida e também no hero (2026-10-05)

Dono: "o brilho nas bordas dos cards e nas barras não pode ter essa fumaça, deixa
o design sujo; tire completamente mantendo a essência ou substitua por algo
melhor" e "as frases dos cards do hero falharam; em alguns lugares precisam de
mais brilho, ofuscadas pelo fundo".

**Neon a traço.** Saíram todas as sombras com desfoque da carga (cantos, borda
22 px por fora e 26 px por dentro, pontos, barra, ponta). A borda virou um
TUBO: o fio aceso, 1 px de fresta escura e um fio fino mais apagado, por fora e
por dentro (box-shadow com desfoque zero). A barra: o fio de 2 px e dois
trilhos de 1 px com fresta. A exceção ao "sem desfoque" deixa de existir.

**A frase.** Era pintada no canvas do fundo, que fica ATRÁS das seções: nas
faixas cinza (60% opacas) saía apagada. Agora é texto (.rumo-leitura) acima das
seções, cor cheia, 11 px; posição e opacidade escritas só quando mudam; escreve-se
em degraus (CSS). No hero a régua ainda não começa e o campo escondia a frase
perto de texto: os cards da faixa do hero passam a mostrá-la na margem, na
altura do card. Até 3 linhas antes de ir em pé. Verificador 12/12; acessibilidade ok.

## 32. Borda com luz de canto e o neon de um fio só (2026-10-05/06)

Dono, com o card do shine border da Magic UI como referência (só as bordas, "não
é para copiar"): a borda chapada dos cards "ficou meio seca".

**Repouso (`9072482`).** Quatro tiras de 1 px no fundo do módulo, paradas, por
baixo do fio cinza da borda: a luz na tinta do card entra pelo canto de cima à
esquerda e some nos dois lados; o canto oposto devolve um reflexo em prata.
Sem pseudo-elemento (::before é a aresta do foco, ::after a varredura) e sem
desfoque. Começam depois da curva do canto, como a aresta. Para comparar:
`?borda=b` (os quatro cantos, tinta e prata alternados) e `?borda=antes`.

**Aceso (`53e9c75`).** Print do dono (66 px) com o tubo da §31: "o meu problema
são essas bordas diferentes; quero uma coisa só, com energia circulando; vale
para todos que tiverem dessa forma". O tubo sai: moldura, barra e clarão do
100% com uma linha cada. No card cheio a luz que circulava só na ignição e na
sobrecarga corre pela borda, com 1 px; a moldura fica em .7 (na branca a luz
sumia) e a mira dos cantos sai quando ela fecha (por cima do fio fazia um 2º
tom). Fora da tela a luz para (IntersectionObserver, `.is-fora`): no Hub do
celular os 4 cards seguiam cheios fora da vista, 16 traços girando. A/B
rolando o Hub a 390 px (4 execuções, medianas): antes 57,0 fps / 15 quadros
lentos; sem a pausa 56,4 / 16; com a pausa 56,5 / 18 (ruído de 11 a 21).
Verificador 12/12. Falta o dono escolher a borda em repouso e aprovar o aceso.

## 33. Rodada de lapidação, fase 1: a sobrecarga sem lag (2026-10-06, 19ª sessão)

Dono: "AI Core médio, lag na sobrecarga", com ordem explícita de medir antes e
provar depois. Cenário medido no Chrome real (154, GPU) com Playwright: Hub a
1440×900, estação de Garantias no centro, clique no núcleo, o mini vem, pressão,
ignição, 6 s de sobrecarga, soltar, 2,5 s esfriando. Quadros por rAF, long
tasks por PerformanceObserver, trace do DevTools e perfil de CPU por amostragem.
Scripts no scratchpad da sessão (`medir-sobrecarga.mjs`, `ler-trace.mjs`,
`ler-quietos.mjs`, `ler-inval.mjs`); monitor de 100 Hz, por isso "fps" aqui
vai até 100.

**Antes.** Sobrecarga a 39,9 fps (mínimo 5,9; 42 quadros acima de 33 ms em
6 s; 3 long tasks); ignição a 48,8 fps (mínimo 6,2). Com a CPU 4× mais lenta:
24,8 fps, 71 quadros lentos, 14 long tasks.

**Causa 1 (A/B por camada): as letras.** Sem a animação das letras a
sobrecarga ia a 99 fps; sem a luz circulando ou o reflexo da barra, nada
mudava. Eram 553 letras (139+142+135+137) com quatro relógios de 2,4 s em
fase: cada letra animando (cor OU transform, tanto faz — medido) custa estilo e
pintura por quadro; o que pesa é quantas animam ao mesmo tempo. Cores literais
nos keyframes em vez de `var()`: sem efeito (medido).

**Causa 2 (perfil de CPU): `ctx.font`, `measureText` e `fillText`.** No Chrome,
num canvas que está na página, os três chamam `UpdateStyleAndLayoutTree` ANTES
de qualquer checagem (até repetir a mesma fonte): com o estilo sujo pelas
letras, 1,5 s de `fonte` + 1,3 s de `fillText` em 13 s de perfil — todo texto
do trilho, das estações e dos heros resolvia o estilo da página inteira no meio
do laço, a cada quadro.

**Causa 3 (trace com invalidação): o arranque da onda.** Ligar 139 animações
num quadro só = 13 ms de estilo + 10 de pintura: o pico de cada onda (quadros
de 35–45 ms). E 16 pontos `.carga-nos` invisíveis na sobrecarga seguiam
animando (marcavam estilo a cada quadro).

**O que mudou.**
- `js/carga.js`: a onda da sobrecarga percorre o GRUPO card a card (uma fila
  por estação, na ordem da página, dando voltas; `LETRAS.folga` entre elas); a
  onda arranca POR PALAVRA (timers em lotes de 80 ms; `--d` relativo à
  palavra; `.carga-palavra.is-luz-a/-b`); passo de 15 ms (teto 2600) → ~25
  letras animando por vez em vez de 35; `B.carga.preparar` parte os cards em
  letras no ocioso quando a estação acopla.
- `js/core.js`: `B.texto` pinta cada texto UMA vez por (texto, fonte, cor, dpr)
  numa oficina fora da página (OffscreenCanvas; sem ela, canvas solto) e faz
  `drawImage` por quadro; alfa por `globalAlpha`; `B.largura` mede na oficina.
  Trocados todos os `fillText` de trilho, estação, campo e heros.
- `css/cartoes.css`: `.is-sobrecarga > .carga-nos > b { animation: none }`.

**Depois (medianas de 3).** Sobrecarga 85–88 fps (mínimo 20–33; 0–3 quadros
acima de 33 ms em 6 s; nenhuma long task); ignição 76–77 fps (mínimo 17–33).
CPU 4×: 70,8 fps, 8 quadros lentos, nenhuma long task. No trace, o quadro com
onda custa 11,7 ms na thread principal (p90 15,6: cabe nos 16,7 ms de um
monitor de 60 Hz); o quadro quieto, 7,2 ms (é o custo de base da página com
três canvases desenhando: rede, estação e mini — fica para outra rodada).

## 34. Rodada de lapidação, fase 2: a luz de cada personagem (2026-10-06)

Fotos antes/depois em `docs/restructure/fotos-2026-10-06/` (Chrome real, GPU, 2×). O
diagnóstico pelas fotos: a luz do site já era coerente (uma família, traço nítido,
o reator como fonte); o que faltava era HIERARQUIA entre estados e a mesma luz
nos poucos lugares que ainda eram chapa. Ajustes cirúrgicos, sem reinterpretar o
aprovado:

| Personagem | O que mudou | A intenção da luz |
|---|---|---|
| Reator (hero do Hub) | nada | É a fonte: tudo o mais é iluminado por ele. Mexer nele é mexer na hierarquia inteira. |
| Estação (AI Core médio), repouso | estator .32 → .42, vidro .45 → .55 (`js/estacao.js`) | A fonte do grupo nunca fica menos acesa que um card pela metade (ficava: um card a 49 % ofuscava a estação). |
| Estação conectada / sobrecarga | portas dos cards em branco; moldura dos cards .7 → .84; índice (01–04) em branco (`css/cartoes.css`) | Três degraus legíveis: perto do cursor (cantos), cheio (moldura ciano + luz circulando), sobrecarga (moldura mais branca, porta e índice acesos, barra MAX). Cheio e sobrecarga eram quase iguais. |
| Mini AI Core | nada | O menor dos três acende quando trabalha (pulso, travas, soquete); em repouso é só presença. |
| Cards em repouso | a luz de canto vira a única borda; `?borda=b` e `?borda=antes` saíram (`css/cartoes.css`, `js/ancoras.js`) | A luz entra pelo canto de cima à esquerda, na tinta do módulo, e o canto oposto devolve prata: a mesma direção de luz em todos os módulos. |
| Botão primário | `box-shadow` inset de 1 px: aresta clara em cima/esquerda, tinta embaixo/direita (`css/base.css`) | A mesma luz dos módulos chega ao botão; deixa de ser uma chapa ciano. Traço, sem desfoque. |
| Rótulos mono (kicker) | a escrita (`js/escrita.js`, fase 3) | O painel acende: o nome do capítulo assenta em 320 ms ao entrar na tela. |
| Hero de Sites | o rótulo "esta página · carga X s" manda: a régua do alto some sob ele (`js/hero-fundo.js`) | Dois textos no mesmo lugar não é luz, é ruído. |

Variantes de borda: a B (quatro cantos alternando tinta e prata) fica no commit
`9072482` se o dono preferir.

## 35. Rodada de lapidação, fases 3 e 4: referências, auditoria e notas (2026-10-06)

**Fase 3 — referências.** Quadro completo em `REFERENCIAS-2026-10-06.md` (pesquisa por
agente: Magic UI, Aceternity, React Bits, Motion Primitives, Cult UI, Hover.dev, Animata,
21st.dev, Osmo; Awwwards 2025–26). O que entrou nesta rodada: só a **escrita dos
rótulos mono** (`js/escrita.js`, ideia #1): o nome do capítulo assenta caractere a
caractere em 320 ms ao entrar na tela, alfabeto de instrumento (0–9 A–F · /), só
dentro do subset da fonte, depois do reveal, com `data-nome` para o trilho. O resto do
TOP 6 ficou de fora com motivo: draw-outline nos botões (o botão já tem o feixe em
miniatura; dois gestos no mesmo lugar), autofoco dos cantos (os cantos de mira já
crescem com a carga), contador em mono (a prova já conta), click spark (o CTA sai da
página; o encaixe do mini já tem as travas), espinha scroll-driven (a rota dos passos
já é isso). Efeito novo só onde não havia nada parecido.

**Fase 4 — auditoria** (Chrome real 154 + headless; agentes de revisão de código ×2 e de
acessibilidade; prints em 360/768/1440/1920 nas 3 páginas, 3 pontos de rolagem cada).

| Área | Nota | Base da nota |
|---|---|---|
| Bugs e console | 9 | Zero erros de console nas 12 combinações (4 larguras × 3 páginas) e no verificador (12/12). Dois achados de revisão corrigidos antes de virar bug (regras de sobrecarga sem efeito por especificidade; `c.ondas` indefinido se o SplitText falhar). |
| Performance | 8 | LCP 0,7–1,2 s, CLS 0, 754–773 KB por página (29 pedidos), nenhuma long task na sobrecarga; quadro quieto 7,2 ms (três canvases desenhando: o próximo alvo). Headless com agente em paralelo dá LCP falso de 11 s em Sites (2× hoje): medir sozinho. |
| Animações | 8 | Sobrecarga 40 → 85–95 fps; onda por palavra; interrupção limpa (soltar no meio: fila passa a vez). Pendente: o quadro base de 7 ms. |
| Responsividade | 9 | Sem overflow lateral em 360/768/1440/1920; pilha e barra do celular ok; a 768 a régua do hero de Sites colidia com a coluna (corrigido). |
| Acessibilidade | 8 | Agente: 7,5 antes; corrigidos o foco cortado na barra (alto), describedby fixo do modal, forced-colors, console do hero mais opaco, foco após pouso em âncora, aviso "abre em nova aba", `aria-haspopup`, rótulo do rodapé, `aria-hidden` no número do kicker, nowrap a 320 px, pilha em zoom 400 %. Ficam: 2º controle de movimento no topo da página, nome longo dos cards-link (`aria-labelledby`), testar o SplitText no NVDA, copy do formulário ("Qual?"). |
| Acabamento visual | 8 | Luz coerente (uma direção, três degraus de estado); variantes de borda removidas; rótulo da cascata sem sobreposição. Pendente do dono: as 84 frases-resumo; og-cover; descrições do Google. |

Comparado aos premiados pesquisados (Lando Norris, Cerebrium, Lidar/Riotters): o site
tem a disciplina de traço e de tipografia deles e um sistema de luz mais consistente;
perde em "peso" de rolagem (eles usam smooth scroll com inércia: decisão do dono, custo
alto no celular) e em paleta (eles usam 2 cores; aqui são 5 tons: preto, grafite, metal,
prata, dois cianos).

**Adendo (mesma sessão, print do dono: "ainda tem uma certa trava mais ou menos nesse
momento", cards a 82 %, mini encaixado).** Reproduzido pelo caminho dele: rolar até
Garantias LOGO depois de carregar. Aí os cards chegam inteiros (o pré-corte só pegava
cards fora da tela) e o SplitText dos quatro cai no instante do encaixe: com a CPU 4×
mais lenta, quatro tarefas de 19–22 ms em 230 ms (quadros de 30–40 ms). Correções:
(1) `adiantar` corta todos os cards de estação no carregamento, um por folga do
navegador (`requestIdleCallback` encadeado), estejam onde estiverem — o pulo de
kerning de ~1 px num card na tela é menor que a trava na coreografia; (2) a primeira
onda de letras espera 0,7 s depois de o card entrar na sobrecarga (`LETRAS.primeira`):
antes começava junto com a rampa de ignição dos quatro; (3) o palco da prova remedia
com layout forçado (8 ms, 4 raízes) toda vez que o fps alternava entre 2 e 3 dígitos
(99 ↔ 100 num monitor de 100 Hz): agora só quando um número cresce além do medido.
Fica para outra rodada: o custo de base de 7 ms por quadro (28 ms a 4×) dos três
canvases; e o `.energia-volta` inserido/removido do DOM a cada turbo.

## 36. O Ouro: o estado dourado reformulado (2026-10-06, 19ª sessão, pedido pelo celular)

Dono: "estude o antigo estado dourado e aplique de uma forma completamente reformulada no
site inteiro; seja criativo; quero ser surpreendido". O estudo do Estado Singular da V1 e as
decisões estão em `OURO-2026-10-06.md`; fotos em `fotos-2026-10-06/ouro-*.png`.

Em uma linha: o ouro deixou de ser um relógio e virou um estado CONQUISTADO — a energia que
o reator deu volta a ele cheia — com a ignição em linha de 1 px que nasce onde foi conquistado
(estação em sobrecarga por uma volta, grupo de cards cheio no celular, segurar o núcleo, cursor
parado no miolo) e, uma vez por visita, sozinho aos 42 s de atenção. Reinado de 12 s com só as
três cores de energia trocadas (estrutura fria, energia quente); resfriamento pela mesma linha.
Peças: `js/ouro.js`; `B.ouro.k` e `B.tom` (core.js) para os canvases; `html.is-ouro` para o CSS;
`cena.tingir(k)` para o reator. Medido: ignição sem quadro acima de 33 ms (máx. 30); verificador
12/12; sem erro de console no desktop e no celular.
