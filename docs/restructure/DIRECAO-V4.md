# Direção V4 — "Tech refinado" (2026-10-01)

Pedido do dono depois de ver a V3 clara no ar: "vamos voltar para a
identidade visual antiga, aquele padrão tech, refinado e profissional".
Decisões dele (por pergunta): a referência é a **V1** (o site original:
fundo escuro, ciano, Sora + JetBrains Mono, malha e régua, moodboard de
painéis de vidro); **nada da V3 fica** além dos fatos (FAQ, decisões em
`01 Empresa\Decisões.md`); o **AI Core fica para o futuro** e será
remodelado por completo (o hero reserva o lugar). "Monte por partes e
revise": cada parte é construída, olhada no celular primeiro, revisada e
commitada antes da seguinte.

O que a V2 ensinou (e que o dono chamou de "mórbida"): preto absoluto sem
luz, cinza frio e nada vivo. A V4 mantém a identidade escura e tech da V1,
mas com **luz**: atmosfera de luz ciano/azul atrás do conteúdo, painéis de
vidro com aresta iluminada, um feixe que varre devagar, dados vivos. Nunca
neon, nunca glow redondo atrás de texto (o dono já rejeitou), nunca
"startup de IA" (ciano + violeta).

## 1. Sistema visual

**Paleta** (contraste conferido contra `--bg`):

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#06080B` | fundo (preto com um fio de azul, não #000) |
| `--s1` / `--s2` | `#0B0E13` / `#11151C` | painel / painel elevado |
| `--line` / `--line-hi` | `rgb(255 255 255 / .08)` / `rgb(79 216 240 / .35)` | régua estrutural / linha ativa |
| `--t1` / `--t2` / `--t3` | `#EEF1F5` / `#A3ABB8` / `#7C8594` | título (18:1) / corpo (8,5:1) / rótulo (5,3:1) |
| `--stroke` | `#5C6675` | contorno de controle (3,4:1) |
| `--ac` | `#4FD8F0` | a única cor de ação (11,7:1 como texto) |
| `--ac-tinta` | `#04171C` | texto sobre o ciano |
| `--luz` | `#2A6BFF` | só na atmosfera (gradiente de luz azul, nunca em texto) |

**Tipografia:** Sora 300 nos displays (a leveza tecnológica da V1), 400 no
corpo, 600 em h3/ênfase; JetBrains Mono em rótulo, índice, dado, botão.
Instrument Serif sai.

**Vocabulário de forma:** régua de 1px, índice mono, malha com fresta de
1px, painel de vidro (fundo `rgb(255 255 255 / .03)`, borda `--line`,
aresta superior iluminada), raio 6px, botão retangular mono maiúsculo.

**Luz e vida (sem canvas):**
- Atmosfera: dois gradientes radiais fixos (ciano em cima à direita, azul
  embaixo à esquerda), estáticos, baratos.
- Feixe: uma linha de luz ciano que atravessa o hero devagar (só transform,
  loop longo). Para em movimento reduzido.
- Varredura: ao revelar um painel, uma linha percorre a aresta superior.
- Dados vivos: fps e tempo de carga medidos nesta visita.
- Hover de vidro: aresta e índice acendem; nada se move sozinho em repouso
  além do feixe.

**Celular primeiro** continua regra do projeto (memória
`site-mobile-primeiro`): CSS base em 390px; primeira tela com marca, frase,
o que é e CTA; barra fixa de ação; alvos ≥ 48px.

## 2. Estrutura e copy (do zero)

**Hub (`/`)**
1. Hero: status "Sistema online · Beyon Zero"; H1 "Do problema ao sistema
   <em>no ar</em>."; sub "Sites, automação e inteligência artificial para
   negócios e entidades. Uma pessoa constrói do primeiro rascunho à
   publicação: diagnóstico primeiro, preço fechado antes, e tudo fica no seu
   nome."; CTAs "Falar comigo" / "Ver os serviços"; arte = composição de
   painéis de vidro (lugar reservado ao AI Core futuro); trilha com os três
   serviços e a medida desta visita.
2. Serviços: três painéis de vidro numerados (Sites · Automação & IA ·
   Experiências digitais), cada um com o que é, para quem, e a porta.
3. Como funciona: três passos em linha (Conversa → Diagnóstico e preço
   fechado → Construção e entrega no seu nome).
4. Garantias: quatro linhas com régua (Começa pelo problema · Preço fechado
   antes · O que é seu continua seu · Transparência em dados e custos).
5. Prova: três medidas desta visita (carga, bytes, fps).
6. Conversa: "Me diga o que precisa acontecer. Eu digo <em>como</em>." + CTA.

**Sites (`/sites`)**: hero com janela-mockup em vidro, H1 "Sites que
carregam rápido e <em>convencem</em>."; formatos (3 painéis); padrão de
entrega (6 linhas); prova; método (4 passos); perguntas (9, texto da FAQ
mantido); conversa.

**Automação & IA (`/automacao`)**: hero mantém a frase da V1 "Toda entidade
perde dinheiro num ponto que ninguém está <em>auditando</em>."; o problema
(3 linhas de laudo); capacidades (malha 2×3 com fresta de 1px); método (3
passos); cenários (3 leituras de estado); perguntas (10, mantidas); conversa
com modal e link do resumo.

**Resumo (`/resumo`)**: a mesma pele escura, sem movimento.

## 3. Partes e revisão

| Parte | Entrega | Revisão |
|---|---|---|
| 1 | tokens, base, componentes, motion, hub | celular 390/320 → desktop; verificador; commit |
| 2 | sites | idem |
| 3 | automação + modal | idem |
| 4 | resumo, ferramentas, docs, revisão de código por agente | verificador, acessibilidade, medir; commit |

Publicar só quando o dono pedir.
