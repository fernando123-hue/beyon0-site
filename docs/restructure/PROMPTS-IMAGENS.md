# Prompts para gerar as imagens que faltam

Para colar no ChatGPT (gerador de imagem). Escritos em 2026-09-22, depois da
triagem das 15 primeiras imagens (ver `PLANO-REESTRUTURACAO.md`, seções 4 e 10).

**Como usar:** cole o BLOCO DE ESTILO, dê um Enter, e cole o prompt da imagem
que quiser. O bloco de estilo é o que faz as imagens novas parecerem da mesma
família das que já existem — sem ele cada uma sai de um planeta diferente.

**Formato:** peça paisagem (1536×1024) para tudo que for hero ou capa. As capas
OG são 1200×630, então gere em paisagem e corte depois.

---

## BLOCO DE ESTILO — vai antes de todo prompt

```
Render 3D fotorrealista e cinematográfico, fundo preto absoluto.
Paleta restrita: pretos e cinzas neutros frios, mais UMA cor de acento —
ciano de instrumento, dessaturado, cor de equipamento de precisão. Nada de
violeta, magenta, verde ou laranja.
Materiais: vidro escuro translúcido em camadas, metal fosco, pedra escura.
A luz vem de TRÁS dos objetos e escapa pelas arestas. Névoa baixa e sutil.
Linguagem ortogonal e técnica: malha, régua, marca de registro, ângulo reto.
A profundidade vem de camadas e escala, não de brilho difuso espalhado.
Composição limpa, com bastante vazio.

PROIBIDO: qualquer texto, letra, número ou logotipo na imagem. Interface de
computador legível. Robôs, humanoides, cérebros, esferas de energia, redes
neurais em formato de cérebro. Neon saturado. Lens flare. Poeira dourada.
```

---

## 1. Automação & IA — PRIORIDADE MÁXIMA

É a única frente do site sem imagem nenhuma: hoje o Hub a apresenta só com
texto. Duas direções; gere as duas e escolha.

### 1A — a ordem emergindo (minha recomendação)

```
Uma esteira industrial suspensa no vazio escuro. De um lado entram placas de
vidro escuro desalinhadas, tortas, em alturas diferentes. Conforme avançam,
elas se alinham sozinhas e saem do outro lado em uma fileira perfeita,
equidistante, com as arestas acesas em ciano. O contraste entre as duas pontas
é o assunto da imagem: caos entrando, ordem saindo. Câmera baixa, em três
quartos. Vazio generoso na metade esquerda do quadro.
```

### 1B — o caminho que se resolve

```
Uma malha ortogonal escura suspensa no vazio, feita de nós conectados por
linhas retas muito finas. Um único caminho atravessa a malha acendendo em
ciano, de um nó de entrada até um nó de saída; todos os outros nós permanecem
apagados. Alguns painéis de vidro escuro flutuam desfocados ao redor. A
leitura é "um processo encontrando o próprio caminho". Centro visual à direita,
vazio à esquerda.
```

---

## 2. Experiências digitais — variações do portal

A imagem 07 (o arco de pedra) é a melhor do acervo e virou a assinatura dessa
frente, mas é uma só. Estas três dão material para a página própria quando ela
existir.

### 2A — frontal, o vão como passagem

```
Um arco monolítico de pedra escura, em pé sobre chão molhado que reflete.
No vão, uma lâmina de vidro vertical, e através dela aparece uma paisagem
diferente da que está deste lado — como se o vão mostrasse outro lugar.
Névoa baixa. Uma linha fina de luz ciano corre pelo chão até a base do arco.
Câmera frontal, simétrica, o arco ocupando o terço central.
```

### 2B — três quartos, escala monumental

```
O mesmo arco de pedra escura, agora visto de três quartos e de baixo, para
parecer monumental. O vão aceso em ciano ilumina a pedra por dentro das
arestas. Ao fundo, longe e desfocado, um segundo arco igual. Chão de rocha
molhada. Vazio grande no alto do quadro.
```

### 2C — detalhe do vão

```
Close no vão de um arco de pedra escura: só a lâmina de vidro e as duas
laterais de pedra entrando no quadro. Dentro do vidro, camadas de reflexo em
profundidade, com luz ciano vindo de trás. Textura da pedra bem visível,
granulada e fria. Quase abstrato.
```

---

## 3. Capas de compartilhamento (OG)

Hoje as três páginas dividem a mesma capa. Como o WhatsApp é o canal de venda
do negócio, uma capa por página melhora o link compartilhado. **Deixe a metade
esquerda vazia**: o texto é composto por cima depois.

### 3A — Hub

```
Um cubo formado por painéis de vidro escuro translúcido, flutuando no vazio
preto, com as arestas acesas em ciano e um ponto de luz branca no centro,
visível através das faces. Alguns painéis soltos flutuam ao redor. O cubo fica
na metade direita do quadro; a metade esquerda é vazio preto.
```

### 3B — Sites

```
Uma pilha de painéis de vidro escuro em perspectiva, como telas empilhadas em
profundidade, todas apoiadas sobre um pedestal de pedra escura com um anel de
luz ciano na base. O painel da frente é o mais nítido; os de trás vão sumindo
na névoa. Metade direita do quadro; vazio preto à esquerda.
```

### 3C — Automação & IA

Use a 1A ou a 1B, reenquadrada em paisagem com mais vazio à esquerda.

---

## 4. Sequência do cubo se montando (para o vídeo de transição)

A imagem 03 é o melhor quadro do acervo e a única com movimento implícito.
Uma sequência dela vira o vídeo de transição sem animar nada à mão.

```
Painéis de vidro escuro dispersos no vazio preto, que convergem e se encaixam
formando um cubo fechado com as arestas acesas em ciano e um ponto de luz
branca no centro.

Quadro 1 de 6: os painéis estão longe uns dos outros, desalinhados, girando
devagar, e o ponto de luz central é fraco.
```

Depois peça os quadros 2 a 6 **um de cada vez**, sempre dizendo *"mesma câmera,
mesma luz, mesmo enquadramento do anterior; os painéis avançaram mais um passo
em direção ao cubo e o ponto de luz ficou mais forte"*.

> **Ressalva honesta:** gerador de imagem não mantém consistência perfeita entre
> quadros. Espere descartar bastante. Se sair inconsistente demais, o caminho é
> animar o cubo que já existe em WebGL no site (`js/cena.js`) e gravar a tela —
> sai perfeito e não custa geração nenhuma.

---

## 5. Textura de pedra (opcional, para o portal em 3D)

```
Textura de pedra escura quase preta, com veios cinza-azulados frios e
granulação fina. Vista perfeitamente frontal, iluminação plana e uniforme, sem
sombra direcional, sem relevo projetado. A textura preenche o quadro inteiro,
sem moldura e sem borda. Quadrada.
```

> Peça "sem costura / tileable" no pedido, mas confira: gerador quase nunca
> acerta a emenda de primeira. Se não fechar, o portal continua bem com o
> gradiente que já tem.

---

## O que fazer quando a imagem chegar

Antes de aceitar qualquer imagem, confira estes quatro itens — foram
exatamente os que reprovaram metade do primeiro acervo:

1. **Tem texto?** Rejeite. Texto gerado sai ilegível e não dá para corrigir.
2. **Tem número?** Rejeite. Número em imagem não passa pela regra de zero
   invenção do projeto.
3. **Tem marca escrita?** Rejeite. A marca é **Beyon Zero** — o acervo antigo
   veio com `Beyond`, `beyon.0` e `MYKER SITES`, nenhum deles nosso.
4. **A cor de acento continua sendo uma só?** Se apareceu violeta ou verde,
   peça de novo: a identidade tem uma cor de ação e mais nenhuma.

Salve as aprovadas em `docs/restructure/moodboard/` seguindo a numeração que já
existe (16, 17, 18…) e com nome descritivo, igual às anteriores.
