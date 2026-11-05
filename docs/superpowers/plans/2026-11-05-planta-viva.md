# Planta viva: plano de implementação

> Data: 2026-11-05 (revisão 2, depois da revisão do arquiteto independente; cada item foi conferido no código). Especificação: `docs/superpowers/specs/2026-11-05-planta-viva-design.md` (leia primeiro). Base: `main` = `a337d82`.
> Processo: `docs/PROCESSO.md` (nível de risco pelos arquivos, teste visto vermelho, revisão por agente DIFERENTE do autor, link do comentário no corpo do PR, `gh run rerun` do gate "Processo", mesclar por REST). `git push` sem pipe nem `2>&1`.
> O autor de um PR nunca é o revisor dele. Os pares abaixo são sugestão; vale qualquer par que respeite isso.

## 0. Ordem final, níveis e o que roda em paralelo

| # | Etapa | Nível | Depende de |
|---|---|---|---|
| 0 | Diagnóstico do CLS do protótipo (sem PR) | nenhum | nada |
| 1 | **Passo 1: base comum** (módulo de forma, fixtures, agregador de testes) | **3** (`js/orcamento-planta-forma.js`) | nada |
| 2a | Servidor: textos, validador, plano padrão, ferramenta do Zero, `estado` | **3** (`api/`) | 1 |
| 2b | Desenho: peças, layout, animação, laboratório | **2** | 0, 1 |
| 2d-front | Módulo do radar (só dados de teste) | **2** | 1 |
| 2c | Ligação: a faixa na página de orçamento | **3** (`js/orcamento*`) | 2a, 2b |
| 2d-ligação | Radar: servidor + ligação na página | **3** | 2a, 2c, 2d-front |

```
Passo 0 ──────────────────────┐
Passo 1 ─┬─ 2a ───────────────┼─ 2c ── 2d-ligação
         ├─ 2b ───────────────┘            ▲
         └─ 2d-front ──────────────────────┘
```

**Em paralelo:** 2a ‖ 2b ‖ 2d-front (depois do Passo 1). Arquivos que se tocam, conferidos: 2a só mexe em `api/`, `scripts/direcoes.mjs`, `docs/zero/`, `docs/testes/` (arquivos próprios mais `consultor.test.mjs`, `zero.test.mjs`, `mutacao.mjs`) e `.env.example`; 2b só em `js/planta-*.js`, `css/orcamento-planta.css`, `docs/lab-*`, `docs/testes/planta-*`; 2d-front só em `js/planta-radar.js`, `css/orcamento-radar.css`, `docs/lab-radar.html`, `docs/testes/planta-radar*`. **Nenhum deles toca `package.json`** (ver Passo 1). Os três podem tocar `docs/testes/` em arquivos diferentes; o agregador pega todos.
**Não em paralelo:** 2a e 2d-ligação (`consultor.mjs`, `agente.mjs`, `fluxo.mjs`); 2c e 2d-ligação (`orcamento.html`, `js/orcamento.js`, `js/orcamento-planta.js`); 2c depende de 2a (campos do `estado`) e 2b (módulos). O 2d-front **não depende do 2b**: o radar tem a própria `alturaRadar(largura)`.

Para registrar em todos os PRs: seções do gate (Especificação, Visto rodando, Regressão, Verificação comportamental, Teste visto vermelho, Revisão técnica, Revisão de segurança quando nível 3), comentários de revisão por `gh api repos/fernando123-hue/beyon0-site/issues/N/comments -F body=@arquivo`, link no corpo por `PATCH`, depois `gh run rerun` do gate, esperar o CI (mutação ~40 min), `git fetch` e conferir se a `main` andou (se andou, juntar e re-testar; lição do #38), mesclar por `gh api -X PUT repos/fernando123-hue/beyon0-site/pulls/N/merge -f merge_method=merge`. Worktrees separados a partir de `origin/main` (nunca `03 Projetos/site`, em ramo velho, nem `site-planta`, o protótipo, que fica intacto).

## Passo 0. Diagnosticar o CLS do protótipo (antes de desenhar de novo)

Sem PR; o resultado vai no corpo do PR 2b. **A variante da ferramenta de medida é criada na pasta temporária do agente (scratchpad), apontando para o servidor do worktree `site-planta` (`node docs/servidor.mjs . 8899` lá); o worktree `site-planta` não se edita.**

1. Variante de `docs/lab-planta-medir.mjs` que registra cada `layout-shift` com `value` e `sources[].node`, em 390, 320 e 1.280.
2. Confirmar ou derrubar as hipóteses da spec §4.4 (altura por JS depois de medir; bloco que sai de `hidden`; legenda de altura variável) e achar as que faltam.
3. Saída: tabela `elemento | CLS | causa`. **Sem ela o PR 2b não começa o desenho** ("medir antes de afirmar").

## Passo 1. Base comum (nível 3)

Ramo `planta-base` (de `origin/main`). **Revisão técnica:** `code-reviewer`. **Revisão de segurança:** `security-reviewer`. Mesclado antes de 2a, 2b e 2d-front começarem.

**Por que nível 3 e por que sem `package.json`:** o `testar` de `package.json` é uma lista explícita de arquivos; um teste fora dela nunca roda no CI, e mexer no `package.json` pede o "sim" do dono no push (`docs/PROCESSO.md`, seção "Como se publica", item 1; `CLAUDE.md` regra 6). Escolhida a alternativa sem `package.json`: `docs/testes/zero.test.mjs` já está na lista e já termina com `import './travas-identidade.test.mjs';` (precedente do #92). O Passo 1 acrescenta ao fim dele **uma linha**: `import './planta-todos.test.mjs';`. O nível 3 vem do arquivo `js/orcamento-planta-forma.js` (prefixo `orcamento`, de propósito), não do `package.json`.

### Arquivos

Novos:
- `js/orcamento-planta-forma.js`: ES5, script clássico na tela (`window.BZPlantaForma`) e CommonJS no servidor (`import F from '../../js/orcamento-planta-forma.js'`, como `js/orcamento-material-esquema.js`, que `api/_material/pacote.mjs` e `api/_vendas/fluxo-recado.mjs` importam; o `package.json` não tem `"type": "module"`, então `.js` é CommonJS). Conteúdo: listas fechadas (`TOPOLOGIAS`, `TIPOS` = `chegada` + 28, `VERBOS`, `ORIGENS`, `EIXOS` e `NIVEIS` do radar), `LIMITES`, `validarFormaPlano(bruto)` e `validarFormaLeitura(bruto)` (tipos, contagens, regras por topologia, caracteres, comprimentos; nunca lança; devolve `{ ok, plano|leitura, motivos }`), `PLANTA_CHAVES`. Sem DOM, sem `node:`.
- `docs/testes/planta-todos.test.mjs`: agregador. Lê a própria pasta, importa dinamicamente todo `planta-*.test.mjs`, **filtrando o próprio nome** (não se importa) e os `*-casos.mjs`; falha se não achar nenhum.
- `docs/testes/planta-fixtures.test.mjs`: teste mínimo: as 3 fixtures e os inválidos carregam como JSON; cada inválido tem o campo `_defeito` com o código esperado; hashes iguais aos anotados.
- `docs/testes/planta-forma.test.mjs`: o módulo de forma.
- `docs/testes/fixtures/planta/clinica.json` (laço, 8 caixas), `embalagens.json` (bifurca, 9), `loja.json` (espinha, 8): os planos do protótipo **reescritos no formato do esquema**, ids estáveis, verbos da lista, sem palavra proibida (nada de "preço", "valor", número, marca). Textos revisados com `voz-humana`. `docs/testes/fixtures/planta/invalidos/*.json`: um arquivo por defeito (título com 41, frase com 111, tipo fora do catálogo, topologia inventada, 7 e 10 caixas, id repetido, `satelite_de` apontando para o nada, `__proto__`, dígito, marca, prazo, promessa, `<script>`, 9 KB...). `docs/testes/fixtures/radar/*.json`: 3 leituras (uma por nicho) e inválidas.

Alterado: `docs/testes/zero.test.mjs` (uma linha no fim).

### Testes a escrever PRIMEIRO (vistos vermelhos)

1. Forma: as 3 fixtures validam; cada inválido de forma é rejeitado com o código esperado (os de texto proibido ficam para o 2a); fronteiras 40/41 e 110/111; regras por topologia (bifurca sem `decisao`, espinha com satélite de satélite, laço sem `retorno`, mais de uma `decisao`); `validarFormaPlano(undefined | null | 7 | [] | 'x' | circular)` devolve `{ ok: false }`; chave de protótipo; leitura com 4 e 6 eixos, eixo repetido, nível fora da lista.
2. O módulo carrega como CommonJS no Node **e** como script clássico (teste com `vm` sem `module`).
3. `planta-todos.test.mjs` não se importa e roda os outros (vermelho: criar um `planta-x.test.mjs` que falha e ver o agregador falhar).
4. Varredura ES5 do arquivo (sem `=>`, `const`, `let`, crase, `class`).

### Pronto quando

Testes vistos vermelhos e depois verdes; `npm run testar` roda os testes novos (prova: contagem de testes sobe); `node scripts/processo/nivel-de-risco.mjs origin/main HEAD` = 3; revisões publicadas; CI verde; **`git diff --stat origin/main` não lista `package.json`**.

## PR 2a: servidor (textos, validador, plano padrão, ferramenta, `estado`)

**Nível 3.** Ramo `planta-2a`. **Revisão técnica:** `code-reviewer`. **Segurança:** `security-reviewer`. Terceira leitura: `silent-failure-hunter` (o desenho todo cai calado no plano padrão; cada queda tem de deixar rastro em `motivos`).

### Arquivos

Novos:
- `api/_vendas/planta-esquema.mjs`: `validarPlano(bruto, { nomeDoNegocio, regulado })` = módulo de forma + normalização (invisíveis + NFKC, igual a `semPrecoNoTexto`) + `textoDoPlanoPermitido`. Servidor e tela usam a MESMA forma; só os textos são do servidor.
- `api/_vendas/planta-textos.mjs`: lista dura (spec §2.3) e as **dez** travas rodadas sobre o texto já normalizado.
- `api/_vendas/planta-padrao.mjs`: 8 planos padrão e `nichoDaPlanta(briefing)`.
- `api/_vendas/planta.mjs`: `plantaLigada(env)`, `aplicarPlanta`, `montarPlanta`, `plantaParaModelo`, `semChavesDaPlanta(briefing)`.
- Testes: `planta-textos.test.mjs` (+ `planta-textos-casos.mjs`), `planta-padrao.test.mjs`, `planta-ferramenta.test.mjs`, `planta-estado.test.mjs`, `planta-geracao.test.mjs`.

Alterados:
- `api/_vendas/consultor.mjs`: `desenhar_planta` em `todasAsFerramentas`; `ferramentas(regras, { etapa, pedidoStatus, planta = false })` (a ferramenta só entra com `planta` **e** `precoAberto`; ligada/desligada por etapa e flag, **nunca por condição de turno**: a lista é prefixo de cache); `proximoPasso({ ..., planta = false })` com o **ramo por prefixo** (spec §1.1): o corpo atual vira `proximoPassoBase` sem mudar uma vírgula, e `proximoPasso` devolve `PREFIXO + proximoPassoBase(...)` só quando `planta && estimativa && !b.planta && precoAberto`. **Prompt de sistema não muda.**
- `api/_vendas/agente.mjs`, **cinco pontos**: (1) `executarTurno({ ..., planta = false })` (linha ~85); (2) `estadoParaModelo({ ..., planta })` (linha ~53) repassa a `proximoPasso` (linha ~58) e serializa o briefing **sem** `PLANTA_CHAVES`, com a versão compacta dentro do bloco BRIEFING; (3) a chamada a `estadoParaModelo` (linha ~100); (4) `ferramentas(regras, { ..., planta })` (linha ~102); (5) a chamada a `proximoPasso` dentro do ramo `atualizar_briefing` (linha ~134). Mais o ramo novo `desenhar_planta` na volta das ferramentas: um plano aceito por turno, teto de 4 versões, uma volta de correção, na 2ª falha grava o padrão e devolve `{ ok: true, na_tela: true, exemplo: true }`; grava `n_mensagens = conversa.mensagens.length + 1` (a posição da fala do Zero deste turno), `motivos`, `tentativas`; contador `planta_pedidos` (se o prefixo foi usado e o turno acabou sem plano, +1; com 2, grava o padrão com motivo `nao_chamou`). **`MAX_ITERACOES` fica em 4.**
- `api/_vendas/fluxo.mjs`: linha ~272 passa `planta: plantaLigada(env)` a `executarTurno`; `estado` (~348-354) **apaga `PLANTA_CHAVES` de `conversa.briefing` sempre** e, com a flag, devolve `planta` e `leitura` revalidadas e `planta_editavel = precoAberto(etapa, pedido.status) && flag`.
- `api/_vendas/gerador.mjs`: `briefingParaGeracao(b)` (tira `PLANTA_CHAVES`), usada em `gerarDirecao` (~linha 44); `briefingDelimitado` **fica intacta** (usada com outros objetos por `scripts/entregas-lib.mjs:232` e `scripts/direcoes.mjs:239`). `scripts/direcoes.mjs:216` passa a usar `briefingParaGeracao` (`scripts/` é nível 2; o PR é 3 pelo resto).
- `api/_ia/simulado.mjs`: só chama `desenhar_planta` se ela estiver em `ferramentas`, e só com gatilhos na fala do visitante que **nenhum roteiro usa** (conferido em `docs/e2e-orcamento.mjs`: nenhuma fala contém "planta"): `planta-boa`, `planta-ruim` (inválida uma vez, depois válida), `planta-ruim2` (inválida sempre). Sem gatilho, o simulado ignora o pedido do prefixo (como um modelo que esquece; exercita o padrão em 2 turnos).
- `api/_ia/anthropic.mjs`: **avaliar** repassar `strict` (hoje não repassa; `api/_ia/provedor.mjs:10` só documenta). Só entra se for uma linha segura e o teste do provedor continuar verde; senão, registrar e seguir.
- `docs/zero/gerar.mjs`: `RESULTADOS.desenhar_planta` e o texto "as cinco ferramentas" (linha ~66), mais um bloco "com a planta ligada: + desenhar_planta"; **`docs/zero/prompt-efetivo.txt` regenerado por `node docs/zero/gerar.mjs`** (`zero.test.mjs` falha se o arquivo gravado sair do que o código monta; o gerar sem `planta` segue com 5 ferramentas).
- `docs/testes/consultor.test.mjs` (linhas ~78, 379, 389, 391): as listas **sem** flag seguem com 5; acrescentar casos com `planta: true` (6, só em etapa de preço aberto). `docs/testes/zero.test.mjs`: teste de tetos (~473) ganha o caso "turno da planta: 4 voltas, 1.300 tokens de saída"; o teste do `prompt-efetivo` (~498) acompanha o arquivo regenerado.
- `.env.example`: `BZ_PLANTA=` (vazio = desligado; `ligada` liga).
- `docs/testes/mutacao.mjs`: sabotagens de fonte: (1) validador aceita dígito; (2) plano gravado sem validar; (3) `estado` deixa de apagar `PLANTA_CHAVES`; (4) a trava de uma das dez deixa de rodar.

### Testes a escrever PRIMEIRO (vistos vermelhos; anexar a saída)

1. **Textos**: (a) **os 53 textos do protótipo reescritos nas fixtures passam em TODAS as dez travas e na lista própria** (medido hoje: 0 de 59 nas dez, incluindo `semPromessaDePagamento`); (b) 60 ou mais frases ruins por classe (dígito, `%`, `R$`, preço sem número, prazo, numeral por extenso, marca em maiúscula e em minúscula, resultado, garantia, suporte, ordem ao sistema, negar IA, URL, e-mail, markdown, emoji, depoimento em nicho regulado), incluindo as que as travas deixam passar: "Enche a agenda da clínica toda semana", "Entrega em dois dias úteis", "Vende sozinho e sem esforço", "Mais clientes todo mês", "Pagamento sem taxa", "Faixa de preço pela tabela"; (c) nome do negócio dado pela pessoa passa, outro nome próprio não; (d) variações pegas: `preco`, `PREÇO`, letras separadas, dígito de outro alfabeto, espaço sem quebra, `２９００` (a normalização NFKC vem antes da comparação).
2. **Padrão**: os 8 planos validam, têm 8 ou 9 caixas, cobrem as 3 topologias; `nichoDaPlanta` acerta 30 segmentos reais e manda 10 ambíguos para `generico`; nicho regulado nunca recebe palavra de resultado.
3. **Ferramenta e agente (provedor simulado)**: `ferramentas()` inclui `desenhar_planta` só com `planta: true` e etapa de preço aberto; nunca em escopo/pagamento nem pedido confirmado; **sem `planta`, a lista é a de hoje**; `proximoPasso` com `planta` e `estimativa` e sem plano começa pelo prefixo e termina **com o texto de hoje** (comparação exata do sufixo); sem estimativa, ou com plano gravado, ou sem a flag, é idêntico ao de hoje; **no turno em que o simulado chama `estimar` o prefixo não aparece** (o ESTADO é do começo do turno); plano bom grava `origem: 'modelo'` com `n_mensagens`; ruim volta `ok:false` com erros legíveis e o 2º é aceito; ruim duas vezes grava o padrão e responde `{ ok: true, na_tela: true, exemplo: true }`; modelo que ignora o prefixo por 2 turnos recebe o padrão (`motivos: ['nao_chamou']`); 2º plano no mesmo turno recusado; 5ª versão recusada; `montarSistema` devolve o mesmo texto com a flag ligada e desligada (prompt intacto); `atualizar_briefing` com `planta` no corpo NÃO grava.
4. **Contexto do modelo**: o texto de `estadoParaModelo` com plano gravado **não contém nenhuma `frase`** do plano, não contém `planta_pedidos`, e a versão compacta (≤ 600 caracteres para 9 etapas) está dentro do bloco BRIEFING e **fora** do bloco ESTADO.
5. **Estado**: plano gravado + flag **desligada** ⇒ o JSON do `estado` não tem `planta`, nem `leitura`, nem `conversa.briefing.planta`; flag ligada ⇒ tem `planta` (sem `motivos`/`tentativas`), `planta_editavel`, e `conversa.briefing` sem as chaves; plano gravado que deixou de ser válido sai como padrão; com a flag desligada o `estado` é igual byte a byte ao da `main` para a mesma conversa (regressão).
6. **Geração**: `briefingParaGeracao` não leva `planta`, `leitura` nem `planta_pedidos`; `briefingDelimitado` com outro objeto segue igual; `gerarDirecao` e `scripts/direcoes.mjs` usam a nova.
7. **Mutação**: as quatro sabotagens falham os testes acima.

### Verificação comportamental

`npm run testar` (todos os testes antigos verdes + os novos), três conversas simuladas (clínica, embalagens, loja) com o JSON do `estado` colado no corpo do PR (sem texto de visitante real), `node docs/zero/gerar.mjs` sem diferença depois de regenerado. **Sem crédito de modelo real** (a rodada real 8 segue bloqueada pelo dono).

### Pronto quando

Tudo acima verde e visto vermelho antes; prompt de sistema idêntico; flag desligada = `estado` e lista de ferramentas iguais; duas revisões publicadas e achados aplicados; CI e mutação verdes; `main` conferida; nível calculado = 3.

### Repassado pela revisão do Passo 1 (para o 2a conferir; o módulo de forma NÃO faz isto)

O Passo 1 (`js/orcamento-planta-forma.js`) foi revisto por `code-reviewer` e `security-reviewer`. O que ficou para a camada de texto e o servidor:

- **Títulos distintos** (spec §2.4, passo 3): a forma confere ids únicos, não títulos repetidos.
- **NFKC primeiro, depois limpar e reconferir:** `validarPlano` do 2a normaliza (invisíveis + NFKC), **remove `<`, `>`, controles e invisíveis do texto normalizado e confere de novo os comprimentos** (o NFKC pode encurtar ou alongar uma frase). A forma já recusa `<`/`>` e seus equivalentes de largura total e pequenos (U+FF1C/FF1E/FE64/FE65), inclusive depois de `normalize('NFKC')`, mas isso é cinto, não a limpeza.
- **Limite de tamanho do `input` da ferramenta ANTES de chamar a forma:** a forma faz `JSON.stringify` do bruto antes de testar os 8 KB (o tamanho é medido no texto já serializado). O 2a corta o `tool_use`/corpo grande antes (a API já limita por `max_tokens`; conferir o ramo `desenhar_planta` do `agente.mjs`).
- **Homóglifos, espaços finos e escrita da direita para a esquerda** são da camada de texto: a forma recusa as marcas de direção e os invisíveis, mas deixa passar letras de outros alfabetos, o espaço sem quebra e os espaços finos (U+2000 a U+200A).
- **Evidência de eixo `nao_falou` não deve ser desenhada** (radar, 2d): a forma aceita `evidencia` em qualquer nível; quem decide mostrar é o servidor/validador de leitura e o desenho.
- **O layout ordena por referência, não por posição:** na espinha o satélite pode vir ANTES do tronco no array (a forma não exige ordem entre eles); `satelite_de` aponta por `id`.
- **Ids só em `data-id`, `Map` ou `Object.create(null)`; nunca `#id` num seletor sem `CSS.escape`.** O regex da spec admite `--`, `00`, `a-`; a forma reserva `nucleo`, `led`, `chegada`, `constructor`, `prototype` e `proto`.
- **Regras da forma mais estritas que a spec (decisões do Passo 1, a confirmar ou afrouxar no 2a):**
  - `laco` só vale em satélite da espinha (como no protótipo); num satélite aceita `true` e `false`, qualquer outro valor é recusado; no tronco a chave é recusada até com `false`.
  - `retorno` só existe na ÚLTIMA etapa do laço e vale `true`; em qualquer outra a chave é recusada (inclusive `retorno: false`), coerente com "só na última etapa" da spec.
  - `rotulo_retorno` (só no laço) e `rotulos_ramos` (só na bifurca, exatamente 2) são opcionais; rótulo de 3 a 28 caracteres.
  - A entrada da bifurca tem no mínimo 1 etapa e nenhum teto próprio (o total de 7 a 8 etapas limita).
  - `leitura` do radar: no máximo 2 KB; eixos sempre devolvidos na ordem canônica de `EIXOS`.
  - `tronco_min`/`tronco_max` decidem quase tudo na espinha; `satelites_min`/`satelites_max` são rede de segurança (com 7 a 8 etapas no total quase nunca decidem sozinhos).
  - Texto: a forma recusa `<`, `>` (e U+FF1C/FF1E/FE64/FE65), controles, TODA a propriedade Unicode `Default_Ignorable_Code_Point` (que inclui a lista de `promessa.mjs`, incompleta, mais U+180B a 180F, FFF0 a FFF8, 1BCA0 a 1BCA3, 1D173 a 1D17A e E0000 a E0FFF), o braille em branco U+2800 e substituto UTF-16 solto; o mínimo de comprimento só conta o texto visível (sem espaços nem esses caracteres). O teste percorre todos os code points. Se o `normalize` lançar, a forma recusa o texto (falha fechado).
  - O retorno traz `erros: [{ caminho, codigo }]`; o nome de uma chave extra entra no caminho só se começar por letra, tiver até 24 caracteres `[A-Za-z0-9_$-]` e nenhuma sequência de 4 ou mais dígitos, senão `?` (as chaves de protótipo entram pelo nome, que é uma lista fixa).

## PR 2b: o desenho (módulos do front, sem ligar ao Zero)

**Nível 2.** Ramo `planta-2b`, a partir do Passo 1, com o resultado do passo 0. **Revisão técnica:** `typescript-reviewer` + `performance-optimizer` (CLS e CPU). **Acessibilidade:** `a11y-architect` com `npm run acessibilidade`. O `security-reviewer` olha só a regra de `textContent`.

### Arquivos (todos novos; nada do site existente muda)

- `js/planta-pecas.js`: os 29 desenhos (`chegada` + 28 tipos; port do `docs/lab-planta-pecas.js` do protótipo para ES5 + 9 novos). Só traço, sem preenchimento nem desfoque.
- `js/planta-layout.js`: geometria pura das 3 topologias × paisagem e retrato, **com altura reservada**: `alturaReservada(largura)` e `montarGeometria(plano, largura)` com `H === alturaReservada(largura)`. Laço e espinha em duas fileiras no computador; retrato compacto (caixa 68, vão 18).
- `js/planta-desenho.js`: SVG por `createElementNS`, lista `<ol>` e rótulos por `textContent`, a linha do tempo por Web Animations API, ajuste por diferença de `id`, `prefers-reduced-motion` e `html.menos-movimento`, IntersectionObserver para começar, pausa fora da tela. **Desenho das rotas: `stroke-dashoffset` finito (uma vez). Pulso de repouso e ondas do LED: só `transform`/`opacity`** (cabeça de luz movida por `translate` com keyframes por segmento da polilinha; nada de `stroke-dashoffset` nem `offset-distance` contínuo, regra 1 do `CLAUDE.md`). Valida a forma pelo `BZPlantaForma` do Passo 1. `window.BZPlanta = { montar, atualizar, parar }`.
- `css/orcamento-planta.css`: todas as classes com prefixo **`plv-`** (`pv-` é das miniaturas de prévia em `css/orcamento.css`; `pl-` e `.planta*` são da vitrine de Sites). Sem `filter`, `backdrop-filter`, `box-shadow` com desfoque, gradiente radial.
- `docs/lab-planta.html`, `docs/lab-planta-quadros.mjs`, `docs/lab-planta-medir.mjs` (laboratório e ferramentas usando os módulos REAIS e as fixtures; fora do deploy).
- Testes: `planta-pecas.test.mjs`, `planta-layout.test.mjs`, `planta-desenho.test.mjs`, `planta-es5.test.mjs`, `planta-sem-html.test.mjs`.

### Testes a escrever PRIMEIRO (vistos vermelhos)

1. **Catálogo**: `TIPOS` do módulo de forma ↔ desenhos de `planta-pecas.js` 1 para 1, **incluindo `chegada`** (29); comandos de caminho permitidos e números finitos; nenhum atributo `filter`, `style` nem gradiente.
2. **Geometria**: 3 fixtures (+ variações de 8 e 9 caixas) × larguras 320, 360, 390, 430, 768, 1.024, 1.280: sem sobreposição, tudo dentro da largura, rotas ligam caixas existentes, ordem da luz total, **`H === alturaReservada(L)`**, retrato com 9 caixas ≤ 940 px em 390 e ≤ 1.020 em 320, paisagem sempre 456, laço e espinha em duas fileiras com 8 a 9 caixas, determinismo.
3. **Sem HTML do modelo**: lê `js/planta-*.js` e falha com `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `setAttribute('style'`, `.cssText`; teste com DOM falso passando título `<img src=x onerror=alert(1)>` que vira texto.
4. **ES5**: varre os arquivos sem comentários e strings, falha com `=>`, `const `, `let `, crase, `class `, `...`, `Object.values`, `Object.entries`, `padStart`, `Array.from`, `.includes(`, `async `. Visto vermelho contra o protótipo.
5. **Regra 1**: nenhum `requestAnimationFrame` nos módulos; nenhum `animate` com `strokeDashoffset` ou `offsetDistance` no pulso de repouso (teste lê o código do pulso).
6. **Desenho (DOM falso)**: uma `<li>` por caixa na ordem da luz; textos por `textContent`; status final com o número de etapas; `parar()` limpa; movimento reduzido: nenhuma animação; ajuste: só `id` novo ganha `is-ajustado`; sem ids em comum refaz tudo.

### Verificação no navegador (obrigatória)

Servidor `node docs/servidor.mjs . 8899`; laboratório `docs/lab-planta.html`. Capturas dos 3 nichos em 390, 320, 768 e 1.280, **abertas e olhadas antes de ler o código**, comparadas lado a lado com os mosaicos aprovados em `01 Empresa/Referências/Protótipo planta viva/` (o dono aprovou aquele visual: diferença de linguagem é defeito). `docs/lab-planta-medir.mjs`: CLS por nicho e largura (no laboratório, ≤ 0,01 absoluto), fps de entrada e repouso, quadros > 50 ms, nós do DOM (≤ 450). Com CPU 4x (`Emulation.setCPUThrottlingRate`): montagem ≤ 120 ms, nenhuma tarefa longa na entrada. `npm run acessibilidade` com a página do laboratório: movimento reduzido mostra o quadro final, teclado percorre os botões, árvore de acessibilidade lista as etapas na ordem da luz. Busca automática no CSS por `blur`, `drop-shadow`, `box-shadow`, `radial-gradient`, `backdrop-filter`.

### Pronto quando

Testes vistos vermelhos e verdes; CLS e CPU dentro da meta com os números no corpo do PR; capturas anexadas e comparadas com o aprovado; acessibilidade e ES5 verdes; revisões publicadas; `git diff --stat origin/main` só com arquivos novos.

## PR 2c: a ligação (a faixa na página de orçamento)

**Nível 3.** Ramo `planta-2c`, depois de 2a e 2b mescladas. **Revisão técnica:** `code-reviewer`. **Segurança:** `security-reviewer` (dado do modelo entra no DOM). **Desempenho e CLS:** `performance-optimizer`. **Acessibilidade:** `a11y-architect`.

### Arquivos

- `orcamento.html`: `<section id="o-planta" hidden>` **entre `.orc-mesa` e `#o-contato`** (linhas ~249-253), o `<link>` do CSS e o carregador. Sem `style=""`.
- `js/orcamento-planta.js` (novo, ES5): a cola. `BZOrcPlanta.atualizar(E)` lê `E.planta` e `E.planta_editavel`. Carregamento sob demanda com **lista CONSTANTE de URLs** (nunca `src` montado com dado do estado). **O botão "Ver a planta do seu site" é recolocado a cada `render()`, depois de `conversa()`, sob a fala de índice `E.planta.n_mensagens`** (a lista é refeita a cada mudança; `js/orcamento.js` ~610-615). Rolagem até a faixa por `rolarAte` (o existente de `js/orcamento.js`, ~728), sem `scrollIntoView` novo. **Regra de inserção:** a faixa só sai de `hidden` quando está fora da área visível; se estiver à vista, espera o toque no botão ou o próximo gesto (spec §4.4). "Está certo" envia "A planta está certa." pelo envio normal; "Quero ajustar" foca `#o-texto`; os dois **só com `E.planta_editavel`**.
- `js/orcamento.js`: **uma linha** no `render()`: `if (window.BZOrcPlanta) window.BZOrcPlanta.atualizar(E);`.
- `css/orcamento-planta.css` (acrescentar): posição da faixa, legenda `sticky` na base da faixa no celular, botão do chat, teto de altura com "Ver a planta inteira" (se a medição mandar).
- `docs/servidor.mjs`: liga `BZ_PLANTA=ligada` no servidor local, salvo `BZ_PLANTA_LOCAL=desligada` (mesmo desenho de `BZ_ENTREGA_LOCAL`, linha ~30).
- `docs/medir-planta.mjs` (novo, nível 2): conduz a conversa com o provedor simulado até o plano (`planta-boa`), registra `layout-shift` com `sources`, **A/B com a flag** (`BZ_PLANTA_LOCAL`), em 390, 320 e 1.280, com a faixa **dentro e fora** da área visível; mede bytes do JS da planta com `gzip -9` **e** brotli (o orçamento de 20 KB vale para `gzip -9`, o mais conservador; reporta os dois); mede a distância do cartão de preço até o botão do formulário nas posições A (planta antes) e B (depois).
- `docs/e2e-orcamento.mjs`: roda **as duas variantes** (flag ligada e desligada); com a flag ligada o roteiro de hoje vê o plano padrão aparecer sem quebrar o funil; um roteiro extra usa `planta-boa` e depois um ajuste.
- Testes: `docs/testes/planta-ligacao.test.mjs` (DOM falso, como o do painel).

### Testes a escrever PRIMEIRO

1. Sem `E.planta`, a faixa fica escondida e a tela é igual à de hoje.
2. Com `E.planta` válida: faixa uma vez; botão uma vez por versão; carregamento sob demanda uma vez.
3. **Depois de um novo turno o botão segue sob a fala da versão N** (a lista foi refeita) e não duplica.
4. `E.planta` inválida (forma errada, texto com `<`): nada aparece e nada lança.
5. **`planta_editavel: false`** (preço fechado): "Quero ajustar" e "Está certo" desligados, planta visível.
6. "Está certo" gera exatamente uma mensagem; "Quero ajustar" não envia nada.
7. A faixa à vista não é inserida até o gesto; fora da vista, é inserida na hora.
8. Regressão: `docs/testes/zero.test.mjs` (painel da fatia 1) verde; `render()` sem o módulo carregado funciona; com a flag desligada nenhum JS da planta é baixado.
9. E2E simulado: conversa até o plano; ajuste ("quero cobrar um sinal"); a 2ª planta marca o `id` novo.

### Verificação no navegador

`npm run verificar`, `npm run acessibilidade`, `npm run olhar`, `node docs/medir-planta.mjs` (A/B). **Meta única: delta de CLS ≤ 0,01** nos 3 nichos × 390/320/1.280, planta chegando com a faixa dentro e fora da área visível. Reportar: a distância preço → botão do formulário nas posições A e B (decide o teto de altura no celular); a legenda grudada com o banner `.consentimento` visível e com o teclado virtual aberto (390 e 320); bytes `gzip -9` e brotli. No celular real do dono não dá para testar sem ele: capturas emuladas e a lista do que ele olha ao voltar.

### Pronto quando

Faixa e botões funcionando com o provedor simulado nas duas variantes da flag; metas da spec §4.4 com números no PR; `E.painel` da fatia 1 intacto; flag desligada = página idêntica; revisões publicadas; CI e E2E verdes. Antes de mesclar, capturas e vídeo curto ao dono pelos canais habituais, sem esperar resposta (a `main` só vai para o staging; produção é dele e só liga com `BZ_PLANTA=ligada`).

## PR 2d-front: módulo do radar

**Nível 2.** Ramo `planta-2d-front`, a partir do Passo 1 (**independe do 2b**). Revisão: `typescript-reviewer` + `a11y-architect`.

- `js/planta-radar.js` (ES5; `window.BZRadar = { montar, atualizar, alturaRadar }`): pentágono, 3 anéis, 5 raios, polígono de 1,5 px com preenchimento chapado de 10%, rótulos em HTML, `<dl>` acessível com nível por extenso e evidência. **Interpolação de 450 ms pelo laço único `window.BEYON.add`** (sem `requestAnimationFrame` próprio); sem `BEYON` ou em movimento reduzido, salta. `alturaRadar(largura)` própria (300 em 390). Valida a forma pelo `BZPlantaForma`.
- `css/orcamento-radar.css` (prefixo **`plr-`**; o `plv-` é só da planta, `css/orcamento-planta.css`), `docs/lab-radar.html` (o piloto e o CSS do laboratório ficam em `docs/testes/planta-radar-lab.js` e `.css`, porque o CSP não aceita script nem estilo embutido e a lista de arquivos do 2d-front só cobre `docs/testes/planta-radar*`).
- **Testes primeiro** (`planta-radar.test.mjs`): 5 eixos exatos; níveis fechados; evidência por `textContent` (`<img onerror>` vira texto); nenhum número exibido; rótulos fixos; movimento reduzido sem `BEYON.add`; **nenhum `requestAnimationFrame` no arquivo**; `alturaRadar` constante por largura; ES5 e proibição de `innerHTML` (as varreduras de `planta-*.js` já cobrem este arquivo).
- Verificação no laboratório: capturas 390/320/1.280 com 3 leituras diferentes (prova de que cada cliente tem o seu); polígono muda entre duas leituras; legenda "não é nota".

### Decisões do 2d-front (medidas no laboratório; o que a 2d-ligação herda e decide)

- **A lista `<dl>` fica sempre visível, com altura reservada para o pior caso** (5 linhas de 63,6 px: eixo + nível, mais até 2 linhas de evidência de 60 letras). O radar montado tem **~680 px no celular** (quadro de 243 a 300 px + título + lista + legenda). Escolhi reservar o pior caso a truncar a fala da pessoa, porque assim o CLS do radar é 0. **A 2d-ligação decide e mede**: ou reduz a reserva (por exemplo 2 linhas por eixo), ou recolhe a lista visualmente mantendo-a para o leitor de tela. Medir antes: o critério da spec §3.5 é o cartão de investimento continuar na área visível do painel em 1.280 x 800.
- **`aria-live`**: o radar NÃO anuncia mudança. A região viva fica para a 2d-ligação, junto com a região viva do chat (uma só, para o leitor de tela não ouvir duas coisas ao mesmo tempo).
- **A vaga** (`.plr-vaga`, `::before` com a mesma altura do radar montado, medida: diferença 0,0 px em 390, 320 e 1.280): some quando o `.plr` entra e **não volta** se a instância for desmontada. O que fazer quando a conversa não tem radar (esconder a vaga ou manter o espaço) **é decisão da 2d-ligação**: deixar a vaga vazia empurra o que vem abaixo; escondê-la e mostrar depois é um deslocamento.
- **Ciclo de vida**: `BZRadar.montar` devolve uma instância (`atualizar`, `desmontar`); quem monta **deve chamar `desmontar()` ao trocar de tela ou desmontar o painel**: ela tira o radar do laço único (`BEYON.remove`) e desconecta o `ResizeObserver`. `montar` de novo no mesmo contêiner desmonta a instância antiga sozinho. Testes: `planta-radar.test.mjs` (desmontar no meio da animação).
- O radar chama `BEYON.iniciar()` ao entrar no laço (idempotente; o laço do site só roda depois dele, e quem chama é `js/pagina.js`). Sem isso o polígono ficava parado no mínimo enquanto o texto já dizia "deixou claro".
- No ouro (`html.is-ouro`) o radar fica dourado como todo ciano do site (usa `var(--ac)`); decisão do dono se isso é desejado.
- Medidas: `js/planta-radar.js` 5,9 KB gzip -9 (teto 8 KB do radar dentro dos 20 KB do orçamento); CLS causado pelo radar ≤ 0,0003 em 390/320/1.280 (0 em 18 de 21 casos).

## PR 2d-ligação: o radar na conversa

**Nível 3.** Ramo `planta-2d`, depois de 2a, 2c e 2d-front. Revisão: `code-reviewer`, `security-reviewer`, `a11y-architect`.

- `api/_vendas/leitura.mjs` (novo): `validarLeitura(bruto, { mensagensDoVisitante, regulado })` = forma (módulo comum) + lista dura + travas + **âncora na gravação** + só rebaixa (spec §3.4); `montarLeitura(briefing, ctx)` na leitura do estado **sem reaplicar a âncora** (retenção apaga mensagens; a leitura guardada vale como gravada).
- `api/_vendas/consultor.mjs`: ferramenta `ler_caso` (a mesma regra de flag e de lista fixa por etapa); `proximoPasso` pede a leitura em turno com informação nova. `api/_vendas/agente.mjs`: ramo `ler_caso` (uma por turno; erro volta ao modelo uma vez; leitura inválida não muda o que já está). `api/_vendas/fluxo.mjs`: `estado` já devolve `leitura` (feito no 2a) e `semChavesDaPlanta` já a apaga do briefing.
- `orcamento.html`: contêiner `#o-radar` na coluna do painel, **abaixo do cartão de investimento** (`#o-est`); `js/orcamento-radar.js` (nível 3 pelo prefixo; carrega `planta-radar.js` sob demanda com URL constante) e **uma linha** no `render()` de `js/orcamento.js`.
- **Testes primeiro** (`planta-leitura.test.mjs`): leitura boa passa; evidência sem âncora é descartada e o nível cai; `deixou_claro` sem evidência cai; **o nível nunca sobe** (propriedade); número e marca descartados; depoimento em nicho regulado descartado; 4 e 6 eixos recusados; eixo repetido recusado; nunca lança; **sem mensagens no banco, a leitura guardada não é rebaixada**; `estado` devolve `leitura` revalidada e apaga a chave do briefing; flag desligada omite; prompt de sistema intacto; sabotagem de mutação "evidência aceita sem ancorar".
- Verificação: `docs/medir-planta.mjs` com o radar. **Critério de CLS: delta de CLS da página ≤ 0,01 com o radar entrando, e o cartão de investimento não sai da área visível do painel em 1.280 x 800.** Capturas da conversa com o radar mudando entre o 1º e o 3º turno (simulado).

## Pós-PRs (dependem do dono)

1. **Rodada real 8** (chave de teste + login do Access; teto de US$ 3, pode subir avisando): 10 a 15 conversas de nichos variados. Medir **pelo banco de staging ou pela fila do painel** (o log do Worker é da Cloudflare): % de planos válidos de primeira, % que cai no padrão e `motivos`, tokens e custo por plano, **tempo do turno da planta (meta ≤ 60 s)**, qualidade dos textos, evidência do radar. Se mais de 30% cair no padrão, simplificar o esquema (ou ligar `strict`) ou afrouxar a lista dura onde erra; se o radar inflar níveis, plano B dos eixos de cobertura.
2. **Dono vê no celular** (staging com `BZ_PLANTA=ligada`) e decide a produção.
3. 2ª rodada, só se pedirem: etiqueta "combinar no orçamento" por tipo, ícones e topologias novos, evento de métrica no banco (pede migration).

## Objeções e correções à revisão (o que não foi aplicado como pedido)

- **I10:** a 1ª medição desta sessão já incluía `semPrecoNoTexto` e `textoProibido` (estavam no script); o que faltava era só `semPromessaDePagamento`. Medi de novo com as dez: 0 falso positivo em 59 textos (53 + 6 do ajuste).
- **M3:** o prefixo `pv-` já existe (`.pv-tela` em `css/orcamento.css`), então usei **`plv-`** (livre) **para a planta**; o radar usa **`plr-`** (livre também).
- **B5:** com B3 (`planta` padrão `false`), `docs/zero/gerar.mjs` e as listas de ferramentas **não quebram**; mesmo assim o 2a atualiza o gerador, regenera `prompt-efetivo.txt` e acrescenta casos com `planta: true`.
- **I12:** revi minha proposta de subir `MAX_ITERACOES` de 4 para 5: não sobe (o estouro cai no plano padrão), para não aumentar o pior caso contra os 90 s do navegador.
- **I5:** `offset-path` não existe em lugar nenhum do site e `offset-distance` não é do compositor; o pulso de repouso usa keyframes de `translate` por segmento da polilinha.
- **M9:** conferido que `api/_ia/anthropic.mjs` **não repassa `strict`** hoje; entra como avaliação no 2a, sem bloquear.
- **M1:** confirmado (vários arquivos do site usam `=>`/`async`); virou "decisão desta frente".

## Riscos de execução

- A `main` anda (outras frentes mesclam em `api/_vendas/`): `git fetch` antes de mesclar, juntar e re-testar.
- Suíte lenta com mutação: rodar `npm run testar` local e deixar a mutação para o CI.
- Custo dos agentes: 2a e 2b são os maiores; o teto próprio de 85% do limite semanal continua valendo.
