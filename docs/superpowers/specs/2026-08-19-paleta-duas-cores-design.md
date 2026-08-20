# Paleta de duas cores — spec de design

**Data:** 2026-08-19
**Pedido do dono:** "melhorar nossa paleta de cores, mas sem fugir muito da nossa
identidade visual (…) para não ficar tudo muito monocromático. Também considere
isso no estado dourado."
**Status:** aprovado pelo dono (direção e desenho). Pendente: plano de implementação.

> **Correção (revisão da Task 6):** versões anteriores deste spec, e as mensagens de
> commit das Tasks 2 e 6, citam ~20° para a varredura do quente antigo. O valor real é
> 4,1°, idêntico ao do frio antigo. As mensagens de commit já estão no histórico e não
> podem ser reescritas; este documento é a fonte da verdade.

---

## 1. O diagnóstico

A rampa de hoje não é pouco saturada — é **um matiz só**:

| token | hex | matiz |
|---|---|---|
| `--deep` | `#06272B` | 186° |
| `--mid` | `#0F6A73` | 185° |
| `--glow` | `#00F5FF` | 182° |
| `--hi` | `#9FF8FF` | 184° |
| `--core` | `#F2FEFF` | 185° |

Varredura total: **4°**. É por isso que lê monocromático. O que falta não é
saturação nem uma cor de acento solta — é **viagem de matiz**: sombra e luz
serem cores diferentes, não a mesma cor em brilhos diferentes.

O estado Singular tem exatamente o mesmo problema, em quente: marrom `#221808`
→ ouro `#FFC96B` → branco, **4°** de variação — o mesmo número do frio, não por
coincidência: os dois eram, literalmente, um matiz só com a luminância variando.

## 2. A decisão

Direção escolhida pelo dono: **B + elementos de B+**.

- **B** — viagem de matiz na rampa + um contraponto (violeta) vivendo na
  atmosfera do canvas.
- **elementos de B+** — o contraponto também ganha papel semântico: marca o AI
  Core. Mas **não** recolorindo o reator inteiro; só o seu núcleo.

Decisão sobre o reator (escolha explícita do dono): **núcleo violeta, estrutura
ciano.** O hero continua lendo ciano de longe; de perto tem duas cores
conversando dentro da mesma peça. A leitura semântica é "a inteligência queima
violeta no centro, a interface em volta é ciano".

## 3. A rampa

### 3.1 Repouso (frio)

| token | hex | matiz | papel | mudança |
|---|---|---|---|---|
| `--void` | `#000000` | — | fundo absoluto | inalterado |
| `--deep` | `#0B1E3A` | 216° | penumbra, corpo dos painéis | **186° → 216°** |
| `--mid` | `#0F5E78` | 195° | divisores, traços de baixa energia | **185° → 195°** |
| `--glow` | `#00F5FF` | 182° | **âncora.** acento primário, bordas, dados | inalterado |
| `--hi` | `#9FF8FF` | 184° | texto secundário | inalterado |
| `--core` | `#F2FEFF` | 185° | texto principal, núcleo do brilho | inalterado |
| `--alt` | `#7C5CFF` | 252° | **contraponto.** atmosfera + núcleo do AI Core | **novo** |

Varredura: **4° → 70°**.

`--glow`, `--hi` e `--core` são intocados de propósito. O ciano `#00F5FF` é a
marca; quem muda é a base sob ele.

**Onde cada um destes vive de verdade.** As linhas `--void`, `--deep`, `--mid`,
`--glow`, `--hi` e `--core` são tokens de CSS em `:root` (hex **e** par `-rgb`,
os dois precisam mudar juntos). `--alt` **não é token de CSS** — o violeta só é
consumido pelo canvas, e a lei do projeto é que a cor do canvas nunca passa pela
folha de estilo. Ele vive como constante em `js/field.js`. A tabela acima é a
paleta, não a lista de variáveis CSS; declarar `--alt` no `:root` criaria uma
variável sem consumidor. Mesma coisa para a brasa no estado quente.

### 3.2 Singular (quente)

Mesma estrutura, espelhada: sombra → âncora → luz, mais um contraponto.

| token | hex | matiz | papel |
|---|---|---|---|
| `--deep` | `#2A0E0C` | 4° | penumbra quente (era `#221808`) |
| `--mid` | `#8A3A16` | 19° | divisores em terracota (era `#B08236`) |
| `--glow` | `#FFC96B` | 38° | **âncora ouro** — inalterado |
| `--hi` | `#FFE6B0` | 41° | texto claro quente — já existe hoje |
| `--core` | `#FFFFFF` | — | núcleo branco |
| `--alt` | `#FF6B2C` | 18° | **contraponto brasa** — é nisto que o violeta se transforma |

Varredura: **4° → 37°**, com faixa de leveza de 5% a 100%.

**Assimetria assumida.** O estado quente fica com 37° de varredura contra 70° do
frio. Isso é deliberado: fogo é um fenômeno de matiz estreito, e a riqueza vem
da leveza e da saturação, não do matiz. Brasa e ouro estão só 20° de matiz um do
outro, mas têm **1.87 de contraste** e 12 pontos de leveza entre si — o olho lê
laranja e ouro como cores distintas.

**Rosa `#FF5C7A` foi considerado e descartado.** Como espelho estrutural do
violeta ele era mais puro (49° de distância do ouro, contra 20° da brasa), mas
briga com a identidade de "ouro derretido" do Singular. A brasa é fisicamente
correta para um núcleo em combustão e é a cor que o dono escolheu.

### 3.3 Fora da rampa (inalterados)

`--led #E61A1A` (só o medidor) e `--gold #FFC96B` (que agora é o `--glow` do
estado quente) seguem exatamente como estão.

## 4. Onde cada cor vive

### 4.1 Regra de ouro do violeta

**O violeta nunca carrega texto.** Ele dá 4.83 de contraste sobre `#000` (passa
AA normal) mas **4.17 sobre o painel do card** — o que passa AA só em texto
grande. Fora de texto pequeno, portanto: ele é atmosfera, geometria e acento
grande. Bordas, corpo de texto, ícones e botões seguem ciano.

### 4.2 Mapa por elemento

| onde | hoje | depois |
|---|---|---|
| `js/field.js` §1 partículas | escolhem entre ciano / alta / núcleo pelo próprio brilho | a **faixa mais fraca** passa a ser violeta em vez de ciano; as faixas alta e núcleo seguem ciano→branco |
| `js/field.js` §2 brumas | ciano | violeta; são a camada mais profunda e difusa da cena |
| `js/field.js` §2b aurora do Singular | ciano→ouro | idem, com o contraponto entrando na banda profunda |
| `js/field.js` §2c onda de choque | ciano/branco | inalterada (é o pico branco) |
| `js/field.js` §3 bezel, grade, raios, giroscópio | ciano | **inalterados — ciano** |
| `js/field.js` §3 núcleo poligonal + plasma (l. 363) | ciano/núcleo | **violeta**, saturando a branco no pico |
| `js/field.js` §3 overdrive do Singular (l. 342) | ouro/branco | inalterado |
| `js/field.js` §3c nó do mini AI Core | ciano | **violeta** |
| `js/field.js` §3c elos até os cards | ciano | saem **ciano**, acendem para **violeta** na chegada ao nó |
| `js/field.js` §3c portas nos cards | alta | inalteradas |
| `js/field.js` barramento | ciano/núcleo | inalterado |
| `styles.css` corpo dos painéis (`--painel`) | teal chapado | passa a viajar 192° (topo) → 215° (base) |
| `styles.css` bordas, texto, ícones, botões, aurora das bordas | ciano | **inalterados** |

O painel do card ganha a viagem de matiz de graça: `--painel` já lê `--mid` no
topo e `--deep` no corpo, e os dois tokens mudam. Nenhuma regra nova.

## 5. Mudanças no canvas

`js/field.js` tem uma função só que resolve cor:

```js
function cor(base, w, hot) {
  var c = mistura(base, OURO, w || 0);
  return hot ? mistura(c, BRANCO, hot) : c;
}
```

Todo mundo mistura para o mesmo `OURO`. Isso não serve para o violeta, e o
motivo é mais grave do que "fica feio no meio da transição": em `warmth = 1` — o
reinado do Singular, o auge do evento — o violeta viraria exatamente
`255,201,107`, **o mesmo ouro de todas as outras cores**. O contraponto
desapareceria justo no momento de maior impacto, e o estado quente voltaria a
ser mono-ouro, que é precisamente o problema que esta paleta existe para
resolver.

Com `BRASA` como alvo ele fecha em `255,107,44` e continua sendo uma segunda cor.
No meio do caminho (`w = .6`) a diferença é de saturação: `203,157,166` (malva
empoeirado) pelo caminho do ouro contra `203,101,128` (coral quente) pelo da
brasa.

Mudança mínima — o alvo vira parâmetro opcional, e todos os pontos de chamada
existentes continuam válidos sem tocar em nada:

```js
var VIOLETA = '124,92,255', BRASA = '255,107,44';

function cor(base, w, hot, alvo) {
  var c = mistura(base, alvo || OURO, w || 0);
  return hot ? mistura(c, BRANCO, hot) : c;
}
```

Quem é violeta chama `cor(VIOLETA, w, hot, BRASA)`. Todo o resto segue indo para
o ouro.

## 6. Verificação de contraste (já executada no desenho)

Painel do card composto sobre `#000`, texto medido no meio do card:

| texto | painel atual | painel novo | veredito |
|---|---|---|---|
| `core` (h3 no hover) | 17.06 | **17.62** | AA ok |
| `hi` cheio (p no hover) | 14.51 | **14.99** | AA ok |
| `hi` .74 (p em repouso) | 8.39 | **8.57** | AA ok |
| `glow` (kicker, CTA) | 12.97 | **13.40** | AA ok |

**Todo texto melhorou.** O painel índigo é ligeiramente mais escuro no corpo que
o teal, então o contraste sobe.

Borda ciano .30 sobre o painel: **2.28** contra 2.31 no painel antigo — a
calibragem de contraste dos cards feita em `01c990d` fica preservada.

`--mid` segue **reprovando** para texto (2.89) e continua proibido para qualquer
texto legível, como a lei já manda.

## 7. Fora de escopo

- Tipografia, layout, espaçamento, raios.
- As 5 leis de performance. Nenhum efeito novo, nenhuma variável de CSS por
  frame, nenhum subsistema novo em `B.add`.
- `--led`, o medidor, a intro, o vídeo.
- Copy.
- Qualquer mudança de comportamento. Isto é **troca de cor em pontos que já
  existem**.

## 8. O que isto revisa

O `docs/HANDOFF.md` §5 registra a identidade como SAGRADA, com "nenhum hex fora
dela em repouso", e o Singular como "só ouro e branco, zero verde".

- **"Nenhum hex fora da rampa"** — revisado: entra `--alt`. A rampa deixa de ser
  de matiz único e passa a ter uma âncora (ciano, intocada) mais um contraponto.
- **"Só ouro e branco" no Singular** — revisado: entra a brasa. O **"zero verde"
  continua garantido**, porque não sobra nenhum token teal na rampa quente.

Ambas são exceções explícitas do dono, no mesmo padrão da exceção do vidro nos
cards registrada em 2026-08-18.

## 9. Como verificar no fim

1. `node --check` nos JS; chaves balanceadas no CSS; tokens definidos = usados.
2. Contraste recalculado sobre o painel novo — nenhum texto abaixo de AA.
3. No navegador: valores computados dos tokens, do `--painel` e das bordas.
4. `?perf` + `__frame()` — o custo de frame não deve mudar, já que não há efeito
   novo, só constantes de cor diferentes.
5. Olho do dono no celular: o hero ainda lê ciano de longe? O núcleo violeta
   conversa com a estrutura ou briga? O Singular ficou rico ou sujo?
