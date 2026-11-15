# PR 5b: o desenho do mapa do caso (v3) na tela. Plano de implementação

> **Para quem executa:** sub-skill exigida: superpowers:executing-plans (inline; nesta casa, agente só para revisão). Os passos usam caixa de seleção (`- [ ]`).

**Objetivo:** a página do orçamento passa a desenhar o plano v3 (as 5 estruturas) no cartão da conversa (celular) e na faixa (computador). A entrada parte do esboço (voo), a luz corre na ordem de cada estrutura e o objetivo vira ouro. O v2 continua desenhando como hoje.

**Arquitetura:**
- Dois módulos novos ao lado dos da v2:
  - `js/mapa-layout.js`: puro, recebe o plano e as medidas e devolve a geometria;
  - `js/mapa-desenho.js`: DOM e movimento, `window.BZMapa` com o MESMO contrato do `BZPlanta`.
- A cola (`js/orcamento-planta.js`) escolhe o conjunto de módulos pela versão do plano e troca do v2 para o v3 no meio da conversa.
- Camadas e faixas já existem em `js/orcamento-mapa-forma.js` (PR 4). A composição em px vem do laboratório `docs/lab-estruturas.js` (`compor`, `rotCel`, `desenharSetas`, `animar`), já conferida nas duas peles.

**Tecnologia:**
- ES5, UMD (`window.X` na tela, CommonJS no Node);
- SVG para traço, HTML para texto; Web Animations;
- `node --test` e Playwright (headless shell 1228).

**Desenho:** `docs/superpowers/specs/2026-11-14-mapa-desenho-design.md` (§3, §5, §9); spec mãe §7.5.

## Restrições globais (valem em toda tarefa)

- **Pele:** a escolhida pelo dono, `caixa` (A) ou `trilho` (B). Só ela vai para `js/`; a outra fica no laboratório. **A tarefa 2 não começa sem essa resposta.** A tarefa 1 não depende dela.
- Só `textContent`. Papel, ícone, origem e estrutura passam por tabela com chave própria (`Object.prototype.hasOwnProperty`); nada do plano vira classe, id, seletor ou atributo. O id do plano só serve de chave de objeto sem protótipo.
- Movimento só em transform e opacity, mais `stroke-dashoffset` uma vez por traço. Sem blur, sem `requestAnimationFrame` contínuo, nenhuma variável CSS por frame. Pausa fora da tela e com a aba escondida (`BZPlantaRelogio`). Movimento reduzido ou `html.menos-movimento`: o quadro final, parado e aceso.
- CSP sem inline: nada de `style=""` no HTML nem `<style>`; `el.style.x` por JS pode.
- Celular primeiro:
  - a 390 e a 320, o quadro cabe em 440 px com o objetivo dentro;
  - se a altura medida passar de 440 (letra aumentada), o quadro fica com a altura natural e, no ouro, a caixa da conversa rola até o objetivo (regra dos 3 s);
  - nunca cortar texto.
- Bytes:
  - o teto do JS do desenho v2 (21.200) não muda;
  - o v3 ganha teto próprio, medido e escrito no teste;
  - ligação da faixa: no máximo 4.600 publicada. Se passar, o número medido vai ao PR (spec §7.5).
- Nível 3 onde toca `js/orcamento*`; nível 2 nos módulos do desenho. Revisão de código e de segurança por agentes diferentes; suíte; E2E do orçamento nos dois modos; checks um a um; `--match-head-commit`.
- Commits em português com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Script com "push"/"merge" no texto: escrever com Write.

## Mapa dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `js/mapa-layout.js` (novo) | `compor(plano, larg, medidas, opc) -> { W, H, celular, caixas, setas, cabecalhos, ordem }`. Puro. |
| `js/mapa-desenho.js` (novo) | `BZMapa.montar/atualizar/parar`. Constrói o DOM, mede em lote, chama o layout, desenha, anima por estrutura e cuida do voo, do ouro e da leitura oculta. Traz os desenhos das 10 origens. |
| `css/orcamento-mapa.css` (novo) | A pele do mapa, com cores por papel por classe de tabela. |
| `js/orcamento-planta.js` | Conjuntos v2/v3 por versão; a troca v2→v3; `desconhecida` só sem `topologia` nem `estrutura`. |
| `js/planta-cresce.js` | `casarMapa(esboco, plano3)`: o casar do v3, sem sobra voando. |
| `js/orcamento-planta-esboco.js` | `pontosDoEsboco` chama `casarMapa` quando o plano tem `estrutura`. |
| `_headers` | Os 3 arquivos novos revalidam. |
| `docs/lab-estruturas.*` | Passa a usar os módulos reais; a pele não escolhida fica só aqui. |
| `docs/testes/planta-mapa-layout.test.mjs` (novo) | Geometria: 8 padrões + 3 exemplos + limites × 320/390/768/1280. |
| `docs/testes/planta-mapa-desenho.test.mjs` (novo) | DOM falso (o mesmo jeito de `planta-esboco-pagina`): monta, segurança e leitura. |
| `docs/testes/planta-ligacao.test.mjs` | Conjuntos por versão e a troca v2→v3. |
| `docs/testes/planta-bytes.test.mjs`, `planta-es5.test.mjs`, `travessia-cache.test.mjs` | Tetos, ES5 e carregamentos sem `?v`. |
| `docs/e2e-planta.mjs` | Refeito: v3 pela IA simulada (montagem básica) e v2 forjado na rede (regressão do voo v2). |

---

### Tarefa 1: a cola escolhe o conjunto pela versão (não depende da pele)

**Arquivos:**
- Modificar: `js/orcamento-planta.js` (`MODULOS`, `CSS_DA_FAIXA`, `anexar`, `carregar`, `seguir`, `reconciliar`, `esconder`, `inserir`, `atualizar`, `desconhecida`).
- Teste: `docs/testes/planta-ligacao.test.mjs`.

**Interfaces:**
- Produz:

```js
var CONJUNTOS = {
  v2: { modulos: ['js/orcamento-planta-forma.js', 'js/planta-pecas.js', 'js/planta-layout.js', 'js/planta-desenho.js'], css: 'css/orcamento-planta.css', forma: 'BZPlantaForma', validar: 'validarFormaPlano', desenho: 'BZPlanta' },
  v3: { modulos: ['js/orcamento-mapa-forma.js', 'js/planta-pecas.js', 'js/planta-relogio.js', 'js/mapa-layout.js', 'js/mapa-desenho.js'], css: 'css/orcamento-mapa.css', forma: 'BZMapaForma', validar: 'validarFormaMapa', desenho: 'BZMapa' }
};
var versaoDoPlano = function (plano) { return typeof plano.estrutura === 'string' ? 'v3' : typeof plano.topologia === 'string' ? 'v2' : ''; };
```

- `st.carga` vira `st.cargas[v]`: `'nao'|'indo'|'ok'|'falhou'`.
- `st.conj` é a versão montada.
- Exporta `MODULOS: CONJUNTOS.v2.modulos` (compatível) e `CONJUNTOS`.

- [ ] **Passo 1: testes que falham** (em `planta-ligacao.test.mjs`, no ambiente falso que o arquivo já tem):
  - (a) um estado com plano v3 baixa `CONJUNTOS.v3.modulos` + o CSS v3, nessa ordem, `async=false`;
  - (b) o v2 baixa o que baixava;
  - (c) um v2 montado seguido de um v3 chama `BZPlanta.parar()` uma vez, baixa o v3 e chama `BZMapa.montar` na mesma raiz;
  - (d) um plano sem `topologia` nem `estrutura` continua sumindo calado, com `bz:planta-pronta` uma vez por versão;
  - (e) a falha de download do v3 não estraga o v2 já baixado.
- [ ] **Passo 2:** rodar `node --test docs/testes/planta-ligacao.test.mjs` e ver falhar. (O teste "a tela aceita a versão que não conhece" muda: o v3 passa a ser conhecido.)
- [ ] **Passo 3: implementar.**
  - `anexar(url, tipo, css, aoFim)` usa o `css` do conjunto (hoje está fixo em `CSS_DA_FAIXA`).
  - `carregar(v)` percorre `CONJUNTOS[v]`.
  - `seguir` lê `win[C.forma][C.validar]` e `win[C.desenho]`.
  - `reconciliar` chama `win[C.desenho].atualizar`.
  - Ao mudar de versão com algo montado, `win[CONJUNTOS[st.conj].desenho].parar()` e montagem nova (o caminho de `inserir`).
  - `desconhecida = function (p) { return !versaoDoPlano(p.plano); }`.
  - Atualizar a sabotagem "a tela aceita a versão que não conhece" em `docs/testes/mutacao.mjs` para o novo `if`.
- [ ] **Passo 4:** rodar `node --test docs/testes/planta-ligacao.test.mjs docs/testes/planta-bytes.test.mjs docs/testes/travessia-cache.test.mjs` e esperar passar. Se a ligação passar de 4.600, anotar o número para o PR. `travessia-cache` ganha os 3 carregamentos novos e o `_headers`, as 3 entradas.
- [ ] **Passo 5: commit** "feat: a cola da planta escolhe o conjunto de módulos pela versão do plano".

### Tarefa 2: `js/mapa-layout.js`, a geometria (precisa da pele escolhida)

**Arquivos:**
- Criar: `js/mapa-layout.js`.
- Teste: `docs/testes/planta-mapa-layout.test.mjs`.

**Interfaces:**
- Consome: `BZMapaForma.camadas(p)` e `BZMapaForma.faixas(est, p, lay)` (o mesmo retorno do laboratório).
- Produz:
  - `BZMapaLayout.pedidos(plano, larg) -> [{ chave, texto, classe, larguraMax }]`: o que medir, em lote; as chaves são `'no:<id>'`, `'rot:<i>'` e `'cab:<0|1>'`.
  - `BZMapaLayout.compor(plano, larg, alturas) -> { W, H, celular, caixas: {id: {x, y, w, h}}, setas: [{ de, para, volta, linha|curva, ponta, rot: { x, y, max, lado, topo } }], cabecalhos: [{ texto, x, y }], ordem: [ids] }`, em que `alturas` vem como `{ chave: px }`.
  - `BZMapaLayout.M`: as constantes do laboratório (`gapX`, `celGapY` …).
- O que decide o celular: `larg < 640`, ou coluna < 120 px no computador (como no laboratório).

- [ ] **Passo 1: teste que falha.** Medidas estimadas: 15 px por linha de título, 8 px por caractere, quebra pela `larguraMax`. Para os 8 `planoDoCaso` (os nichos de `CHAVES_DO_MAPA`, com e sem trava, com 2 origens), os 3 `EXEMPLOS` do prompt (`api/_vendas/planta.mjs`) e o caso `limites` (`docs/lab-estruturas-casos.js`), em 320/390/768/1280:
  - caixas sem interseção;
  - rótulo não cobre caixa nem rótulo;
  - tudo dentro de `[0, W] × [0, H]`;
  - celular: `H <= 440` e o objetivo dentro;
  - o ciclo tem exatamente uma seta `volta`;
  - a ordem começa pela camada 0 e termina no objetivo.
- [ ] **Passo 2:** rodar `node --test docs/testes/planta-mapa-layout.test.mjs` e ver falhar (módulo inexistente).
- [ ] **Passo 3: implementar** portando de `docs/lab-estruturas.js` só a pele escolhida: `compor` (sem DOM: as alturas vêm de `alturas`), `rotCel`, `ordem` e `amostrar`/`ponto` (para o desenho usar).
  - O `vao` do celular sai de `alturas['rot:i'] + 15`.
  - Nada de `offsetHeight` aqui.
- [ ] **Passo 4:** passar a sabotagem de vão (`celGapY: 70`) no teste e vê-la falhar; voltar.
- [ ] **Passo 5:** rodar de novo e esperar passar; incluir `mapa-layout.js` no `planta-es5`.
- [ ] **Passo 6: commit** "feat: a geometria do mapa do caso (js/mapa-layout.js)".

### Tarefa 3: `js/mapa-desenho.js` + `css/orcamento-mapa.css`, o quadro parado

**Arquivos:**
- Criar: `js/mapa-desenho.js` e `css/orcamento-mapa.css`.
- Teste: `docs/testes/planta-mapa-desenho.test.mjs`.

**Interfaces:**
- Consome: `BZMapaLayout`, `BZMapaForma.validarFormaMapa`, `BZPlantaPecas.desenhar` e `BZPlantaRelogio.criar`.
- Produz `window.BZMapa = { montar(raiz, plano, opcoes) -> { ok, motivos? }, atualizar(plano, opcoes) -> { ok }, parar() }`. As `opcoes` são as do `BZPlanta`: `origem`, `editavel`, `aoCerto`, `aoAjustar`, `animar`, `largura`, `esboco`, `som`, `notaEmbaixo`, `fala`.
- Medir:
  - escrever todos os pedidos num contêiner fora da página;
  - ler as alturas uma vez, depois de `document.fonts.ready`;
  - montar o quadro escondido com a altura final e trocar.

- [ ] **Passo 1: testes que falham** (DOM falso, como `planta-esboco-pagina.test.mjs`):
  - monta as 5 estruturas;
  - nenhum `innerHTML`, `eval`, `insertAdjacentHTML` nem `style=` na fonte;
  - um título com `<img onerror>` vira texto;
  - um papel `constructor` é recusado pela forma antes de chegar aqui;
  - a leitura oculta (`ol.sr-only`) tem 1 item por nó, mais o objetivo e as setas; nenhum `aria-label` com texto do plano;
  - movimento reduzido: as classes finais (`is-aceso`, `is-ouro`) já na montagem;
  - origem desconhecida vira "Outro canal" (`BZMapaSaber.NOMES`).
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3: implementar** a partir de `no()`, `chip()`/moldura, `desenharSetas()`, `cantosRedondos()` e `leitura()` do laboratório.
  - A linha "Hoje:" (palavra posta pela tela) e as origens de `hoje.origens` ficam acima do quadro.
  - O `fecho` fica abaixo.
  - As cores por papel vêm por classe de tabela, no CSS.
- [ ] **Passo 4:** rodar e esperar passar; incluir no `planta-es5` e no `planta-sem-html` (se ele lista arquivos).
- [ ] **Passo 5: commit** "feat: o quadro do mapa do caso, parado (js/mapa-desenho.js)".

### Tarefa 4: a entrada e o movimento por estrutura

**Arquivos:**
- Modificar: `js/mapa-desenho.js` e `css/orcamento-mapa.css`.
- Teste: `docs/testes/planta-mapa-desenho.test.mjs`, com relógio falso (`avancar`).

**Ritmo:** o do laboratório (`animar`): 240 ms por nó, 480 ms por seta, 900 ms na volta, ouro 420 ms depois do objetivo. Som: `passa` a cada nó e `ouro` no fim.

| Estrutura | O que o teste confere (ordem dos acesos, pelo relógio falso) |
|---|---|
| caminho | um nó por vez, na ordem |
| antes_depois | a faixa "Hoje" inteira antes da "Com o site"; o pulso único na trava |
| ramos | os dois filhos do nó que divide acendem no MESMO instante |
| ciclo | o objetivo fica ouro antes de a luz correr a volta; o repouso do laço dura até o limite de vida da v2 e só usa transform |
| mapa | as origens acendem juntas |

- [ ] **Passo 1:** os 5 testes acima. Também: aba escondida pausa (o relógio para) e a volta retoma.
- [ ] **Passo 2:** ver falhar.
- [ ] **Passo 3: implementar** `programa(estrutura, comp) -> [{ em, id|seta, tipo }]`. É uma função pura, testável sozinha, e o relógio a toca.
- [ ] **Passo 4:** passar; medir tarefas longas com `docs/lab-planta-v2-medir.mjs` adaptado (CPU 4x, celular): nenhuma tarefa da planta acima de 50 ms em 2 de 3 rodadas.
- [ ] **Passo 5: commit** "feat: o mapa do caso se conta pela luz, do jeito de cada estrutura".

### Tarefa 5: o voo do esboço para o v3

**Arquivos:**
- Modificar: `js/planta-cresce.js` (novo `casarMapa`), `js/orcamento-planta-esboco.js` (`pontosDoEsboco`) e `js/mapa-desenho.js` (usa `opcoes.esboco()`).
- Teste: `docs/testes/lab-planta-v2.test.mjs` (os de `casar`) e `planta-consagracao-pagina.test.mjs`.

**Interfaces:**
- `casarMapa(esboco, plano3) -> { lugar: idDoNo }`, sem protótipo.
- As regras:
  - chegada → os nós `origem`, na ordem, no máximo 2;
  - conversa → `trava`, ou `conversa`;
  - página → `site`;
  - ação → `acao`;
  - volta → `conversa` ou `volta`, ainda livre;
  - **sem par, nada**: a estação some na luz, sem voar.

- [ ] **Passo 1:** testes:
  - o casamento de cada regra;
  - uma estação sem par fica fora do mapa;
  - um id `__proto__` só vira chave;
  - `pontosDoEsboco` com plano v3 usa `casarMapa`.
- [ ] **Passo 2:** ver falhar. **Passo 3:** implementar. **Passo 4:** passar.
- [ ] **Passo 5: commit** "feat: o esboço voa para o mapa do caso (casar v3, sem sobra voando)".

### Tarefa 6: `atualizar` (refaz) e a troca v2→v3 de ponta a ponta

- [ ] **Passo 1:**
  - `BZMapa.atualizar` com outro plano v3 refaz com a entrada;
  - com o mesmo plano, não faz nada;
  - um plano inválido devolve `{ ok:false }` e mantém o desenho anterior.
  - Na cola: v2 montado, depois v3, depois v3 ajustado, sem `[beyon]`.
- [ ] **Passos 2 a 4:** ver falhar, implementar e passar. (O nó novo que cresce e o deslize são do 5c.)
- [ ] **Passo 5: commit.**

### Tarefa 7: o laboratório nos módulos reais, os bytes e o E2E básico

- [ ] **Passo 1:** `docs/lab-estruturas.js` passa a montar com `BZMapa` (casos e conferência ficam).
  - `docs/lab-estruturas-fotos.mjs` roda contra eles, 4 casos × 4 larguras, verde.
  - A pele descartada sai do laboratório também, ou fica atrás de `?pele=` se o dono quiser comparar de novo.
- [ ] **Passo 2:** `planta-bytes.test.mjs` ganha o teto do v3 (`orcamento-mapa-forma` + `planta-pecas` + `planta-relogio` + `mapa-layout` + `mapa-desenho`), medido com `gzip -9` e escrito com o número e a data.
- [ ] **Passo 3:** `docs/e2e-planta.mjs` refeito.
  - **Flag ligada, IA simulada:** o v3 aparece no cartão (390, 320) e na faixa (1280); sem rolagem lateral; console limpo; o objetivo à vista.
  - **v2 forjado:** `page.route` no estado devolve um plano v2 de `api/_vendas/planta-padrao.mjs`; o voo e o ouro como antes.
  - **Flag desligada:** nada baixado.
  - Fotos em `00 Entrada/orcamento-conversa/pr5b/`.
- [ ] **Passo 4:**
  - suíte inteira;
  - E2E do orçamento nos dois modos;
  - `BZ_MUTACAO_FILTRO=mapa:`;
  - revisões de código e de segurança por agentes diferentes;
  - PR com evidência;
  - checks um a um;
  - merge com `--match-head-commit`;
  - SHA à sessão principal.
