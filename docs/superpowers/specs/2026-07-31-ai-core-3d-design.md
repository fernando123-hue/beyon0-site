# AI Core 3D — Fundação + Reator

**Data:** 2026-07-31 · **Status:** aprovado, pronto para plano de implementação
**Escopo:** sub-projetos 1 e 2 de uma visão de 5 etapas

---

## Contexto

O site beyon.0 hoje tem um reator no hero desenhado em canvas 2D (`heroReactor`, §3f,
272 linhas em `main.js:2687-2959`). O objetivo do dono é elevar o patamar do projeto
transformando o AI Core em um objeto 3D real e interativo.

A ambição completa é maior que este spec. Ela foi decomposta em cinco sub-projetos com
dependência obrigatória:

| # | Sub-projeto | Entrega | Depende de |
|---|---|---|---|
| 1 | Fundação 3D | Three.js entra: carregamento, loop, cores, degradação, fallback | — |
| 2 | AI Core 3D | O reator vira objeto com volume, luz e oclusão reais | 1 |
| 3 | Núcleo vivo | Peças com hover/clique, arrastar para girar | 2 |
| 4 | Campo volumétrico | Partículas do site migram para 3D | 1, 2 |
| 5 | Cena | Câmera viaja no scroll, seções em profundidade | tudo |

**Este documento cobre apenas 1 e 2.** Eles são inseparáveis na prática: a fundação sem
um objeto que a prove não prova nada. Os sub-projetos 3, 4 e 5 ganham spec próprio, cada
um construído sobre o anterior.

### Descoberta que viabiliza o trabalho

O cérebro já está separado do desenho. `AICore` calcula física e publica estado em
`EnergyField.core` (`main.js:1056`); `heroReactor` apenas desenha. Um reator 3D consome o
mesmo estado sem tocar no cérebro. **Nenhuma linha do `AICore` muda.**

### Fato técnico decisivo

O Three.js **não distribui mais build UMD**. Verificado em 2026-07-31 contra a v0.185.1:
`build/three.min.js` retorna 404; só existem ESM (`three.module.min.js`) e CJS. O padrão
usado para GSAP e anime.js — `<script defer>` mais global — é impossível aqui.

Peso medido: **84 KB gzip** (356 KB cru). Para comparação, o JS atual do site soma ~92 KB
gzip e o `intro.mp4` pesa 4.400 KB. O Three.js custa 1,9% do vídeo de intro.

---

## Decisões

| Decisão | Escolha | Razão |
|---|---|---|
| Carregamento | **ESM nativo + ponte** | Preserva "sem build" e a CSP `script-src 'self'`. Sem bundler, sem import map. |
| Reator canvas 2D | **Deletado — mas só depois** | Uma verdade só, mais fácil de evoluir. Removido em commit isolado após o 3D estar aprovado no ar; até lá fica escondido e intacto. Ver "Decisões adiadas". |
| Referência visual | **Evoluir o reator atual** | Continuidade de identidade, risco menor, alvo objetivo de comparação. |
| Arquitetura | **Fundação com contratos de crescimento** | Ganho visível agora sem comprar o risco do sub-projeto 5; fronteiras limpas evitam refazer a fundação depois. |
| Degradação | **Sombras/IBL primeiro, depois população** | Escolha do dono. Nenhum degrau remove presença. |
| Pós-processamento | **Nenhum** | Passe de tela cheia é caro no celular e reintroduz o risco de moldura quadrada. Brilho vem de geometria aditiva. |
| Materiais | **Técnico-emissivo, não PBR realista** | A lei do projeto proíbe vidro/plástico; emissivo é mais barato e é a linguagem atual. |

### Decisões adiadas

Três coisas ficam explicitamente para depois. **Estrutura primeiro, vida depois** — nenhuma
delas bloqueia a construção, e todas voltam à mesa quando o objeto já existir e puder ser
julgado no aparelho do dono.

| Adiado | Quando volta | Por quê |
|---|---|---|
| **Remover o reator canvas 2D** | Depois do 3D no ar e aprovado | O 2D fica vivo no código durante a construção; o módulo 3D apenas o esconde ao montar. A remoção é um commit próprio e isolado, então reverter é trivial. Evita ficar sem reator se o 3D precisar voltar atrás. |
| **Pós-processamento (bloom, DOF)** | Na etapa de "dar vida" | Brilho por geometria aditiva é mais barato, mas não é idêntico a bloom real e pode ficar menos dramático que o canvas de hoje. Avaliar com o objeto pronto na frente, não no papel. |
| **Otimização e possível bundler** | Após o sub-projeto 5 | Adotar bundler ou converter o `main.js` para módulos seria refactor grande antes de provar que o 3D vale. |

Consequência prática para o plano de implementação: durante toda esta etapa **existem dois
reatores no código** — o canvas 2D (escondido, intacto) e o 3D (visível). Isso é
intencional. O SVG de fallback continua sendo a rede para ausência de WebGL, porque o 2D
sairá em seguida.

---

## Arquitetura

### Arquivos

```
vendor/three.module.min.js   Three.js 0.185.1 vendorado
js3d/stage.js                renderer + câmera + registro — agnóstico ao hero
js3d/materials.js            materiais derivados dos tokens vivos
js3d/reactor.js              o AI Core: hierarquia de peças
js3d/index.js                monta, registra no loop; único que conhece o hero
```

### Regra de dependência

`reactor → materials → stage → three`. Só aponta para dentro. `stage.js` nunca importa
`reactor.js`. É isso que permite, no sub-projeto 5, trocar apenas o tamanho e a câmera sem
tocar no objeto.

### A ponte

`main.js` publica um objeto explícito e mínimo — a única exceção ao "nada vaza da IIFE":

```js
window.__beyon3d = { field: EnergyField, palette: PALETTE, plasmaColor, reduced };
```

`<script defer>` executa antes de `<script type="module">` por ordem no documento, então a
ponte existe quando o módulo acorda. Se não existir, o módulo desiste em silêncio.

O módulo **só lê** a ponte, com uma exceção obrigatória: escreve `coreAnchor` (a posição do
reator na viewport) a cada frame. O campo de partículas do site usa essa âncora para
orbitar o reator; sem ela, as partículas voltariam ao centro da tela.

### O que sai e o que fica

- **Sai (em etapa posterior):** a IIFE `heroReactor` inteira (272 linhas). Durante esta
  etapa ela continua no código, apenas escondida.
- **Intocado:** `AICore`, `EnergyField`, ressonância, Estado Singular, tipografia viva,
  barramento, medidor, cards.

---

## Integração com o organismo

### Um rAF só

`js3d/index.js` registra `EnergyField.add(tick)`. Dentro do tick: lê o cérebro, atualiza
transforms e uniforms, chama `renderer.render()`. **Three.js nunca usa `setAnimationLoop`.**
Mesma lei aplicada ao GSAP: motor a serviço do loop único, nunca dono de loop.

### Cores

Os materiais não leem CSS por frame. Usam `plasmaColor(warmth, role)` através da ponte,
dirigido por `EnergyField.sing.warmth` — exatamente a mesma função que o reator canvas usa
hoje.

Sem ramificação para repouso: em `warmth = 0` o `plasmaColor` já devolve o valor exato do
token da rampa ciano (é assim que a metamorfose entra e sai sem degrau). Uma única
expressão cobre repouso, transição e ápice.

Consequência: a metamorfose do Estado Singular arrasta o objeto 3D para o dourado de graça
e em sincronia garantida com CSS, tipografia e partículas, porque é literalmente a mesma
fonte. A escrita nos materiais é gated por mudança real, no mesmo padrão de `setSingCss`.

A rampa sagrada fica intacta por construção, não por disciplina.

### Escada de degradação

`watchQuality` é uma via só (1 → 0.62 → 0.38, nunca sobe), então a ordem é arquitetura:

| `quality` | Efeito |
|---|---|
| 1.00 | sombra projetada + ambiente refletido (IBL) + população cheia |
| 0.62 | corta sombras e IBL; silhueta, movimento e brilho intactos |
| 0.38 | reduz população de nós de órbita e partículas |
| sempre | `dpr = min(devicePixelRatio, 1.75)` — constante de nascença, não degrau |

Nenhum degrau remove presença; todos reduzem quantidade.

`saveData` ou `deviceMemory < 4` nascem já em 0.62. Diferente do `#atmos`, que pode sumir,
o reator é o centro do hero: degrada, não desaparece.

### Redes de segurança

O SVG de fallback é criado como parte deste trabalho: uma versão estática e simplificada do
reator (esfera, anel equatorial, brackets), escrita **inline no `index.html`** — sem
requisição extra e sem conflito com a CSP. Ele nasce visível e o módulo o esconde ao montar
com sucesso. Se nada rodar, o hero mostra o SVG; nunca fica vazio.

Sequência de boot do módulo, nesta ordem:

1. `window.__beyon3d` não existe → desiste, SVG permanece.
2. Contexto WebGL não obtido → desiste, SVG permanece.
3. Monta cena e materiais dentro de `try/catch`; qualquer erro → desiste, SVG permanece.
4. Esconde o SVG.
5. `reduced === true` → renderiza **um único frame** e **não** registra tick. Presença sem
   movimento.
6. Caso normal → registra o tick via `EnergyField.add(tick)`.

---

## O objeto

### Hierarquia — pivô por peça

Cada peça é um `Group`-pivô com o mesh dentro, nomeado e registrado. Padrão adotado do
estudo do img2threejs: é o que dá alvos de GSAP prontos e torna o sub-projeto 3 quase de
graça.

```
core                          ← coreAnchor sai daqui
├─ shell__pivot    → shell          esfera (fresnel + globo wireframe)
├─ ring__pivot     → ring, inner    anel equatorial + internos
├─ orbits__pivot   → orbit_a/b/c    órbitas + nós (oclusão real, de graça)
├─ brackets__pivot → bracket_1..4   arestas de luz
├─ base__pivot     → base, beam
├─ emitter__pivot  → emitter, beam
└─ plasma__pivot   → nucleus, electron_1..3
```

Registro público: `stage.registry = { nodes, meshes, materials }`.

### Materiais

Técnico-emissivo. Metal ou vidro fotorrealista brigaria com a lei do projeto e custaria
caro; a linguagem atual já é aditiva.

- **shell** — `MeshStandardMaterial` com `emissive` dirigido pela energia
- **fresnel/rim** — casca aditiva (`AdditiveBlending` + `BackSide`), sem shader custom
- **globo wireframe** — esfera low-poly com `wireframe`, aditiva
- **brackets** — `EdgesGeometry` + linhas aditivas; continuam sem corpo preto
- **órbitas e plasma** — linhas e nós aditivos

Tudo aditivo sobre preto reproduz a estética atual sem introduzir um segundo croma.

### Luz

Como quase tudo é emissivo, é preciso pouco: uma `DirectionalLight` (dá forma à esfera) e
uma `HemisphereLight` (preenchimento). IBL apenas em `quality 1.0`, e é a primeira coisa
cortada.

### Câmera e paralaxe

`PerspectiveCamera` com fov ~35° — volume sem distorção de lente. O canvas mantém o
`clamp(260px, 38vw, 400px)` atual.

A paralaxe é dirigida por `EnergyField.core.attX/attY`, a atenção que o cérebro já calcula,
somada ao ponteiro. Zero estado novo: o reator olha para onde o núcleo já estava olhando.

---

## Verificação

O pane do navegador congela o rAF (`document.hidden`), mas **tem WebGL 2.0 com GPU real**
(verificado: ANGLE/D3D11, `readPixels` devolve o pixel desenhado). Dá para desenhar à mão e
ler o framebuffer.

| # | Prova | Método |
|---|---|---|
| 1 | Sintaxe | `node --check` (ESM) em cada módulo |
| 2 | Carrega limpo | módulo importa, zero erro de console |
| 3 | Grafo correto | `registry.nodes/meshes` com nomes e parentesco esperados |
| 4 | Desenha de verdade | tick chamado à mão + `readPixels`: contagem de pixels acesos e matiz |
| 5 | Rampa sagrada | repouso → matiz ~183° (ciano); nenhum pixel fora da rampa |
| 6 | Estado Singular | `sing.warmth=1` → matiz ~50° (dourado); `warmth=0` → volta ao ciano |
| 7 | Degradação | `quality` 0.62/0.38 → sombra/IBL fora, população menor |
| 8 | Âncora | `coreAnchor` escrito por frame, batendo com o rect do canvas |
| 9 | Fallback | stub `getContext → null` → SVG aparece, site intacto |
| 10 | Reduced-motion | exatamente 1 render, nenhum tick registrado |

**Fora do meu alcance, veredito do dono:** ritmo do movimento, se a paralaxe é sutil ou
enjoativa, presença do objeto, e performance real no celular.

---

## Riscos

1. **Performance no celular** — o risco de verdade. O GPU de teste é desktop; o público é
   mobile. Mitigação: escada de degradação desde o primeiro commit, `dpr` limitado, sem
   pós-processamento. Veredito é do dono, no aparelho.
2. **`heroReactor` deletado** — sai em commit próprio e separado, só depois do 3D estar no
   ar e aprovado. Reverter é um `git revert`.
3. **Ordem de execução da ponte** — se o módulo acordar sem `__beyon3d`, desiste em
   silêncio e cai no fallback. Nunca lança.
4. **Peso** — +84 KB gzip. Coberto pela decisão adiada de otimização.
5. **Sub-projeto 5 pedir o que a fundação não previu** — mitigado pela escolha da
   arquitetura com contratos de crescimento.

---

## Fora de escopo

Explicitamente **não** cobertos por este spec, cada um com seu próprio ciclo depois:

- Dissecar ou clicar peças, arrastar para girar (sub-projeto 3)
- Partículas volumétricas (4)
- Câmera no scroll, seções em profundidade (5)
- Pós-processamento (bloom, DOF)
- Exportação glTF, LOD, baking de texturas
