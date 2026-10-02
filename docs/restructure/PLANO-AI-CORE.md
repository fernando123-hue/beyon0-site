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
