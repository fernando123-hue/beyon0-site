# Planta viva: plano de implementação (PRs 2a a 2d)

> Data: 2026-11-05. Especificação: `docs/superpowers/specs/2026-11-05-planta-viva-design.md` (leia primeiro). Base: `main` = `a337d82`.
> Processo: `docs/PROCESSO.md` (nível de risco pelos arquivos, teste visto vermelho, revisão por agente DIFERENTE do autor, link do comentário no corpo do PR, `gh run rerun` do gate "Processo", mesclar por REST). `git push` sem pipe nem `2>&1`.
> O agente autor de um PR nunca é o revisor dele. Sugestão de pares abaixo; vale qualquer par que respeite isso.

## 0. Ordem, dependências e o que roda em paralelo

```
Passo 0 (diagnóstico do CLS do protótipo, sem PR)  ─┐
                                                    ├─ 2b (desenho, front) ──┐
Passo 1 (fixtures dos 3 nichos, commit comum)  ─────┤                        ├─ 2c (ligação) ── 2d (radar: servidor + ligação)
                                                    └─ 2a (servidor)  ───────┘                      ▲
                                  2d-front (módulo do radar, só dados de teste) ─ pode andar com 2a/2b ┘
```

| Par | Em paralelo? | Por quê (arquivos que se tocam) |
|---|---|---|
| 2a e 2b | **SIM** | 2a só toca `api/`, `docs/testes/` e `package.json`; 2b só toca `js/planta-*.js`, `css/`, `docs/lab-*`, `docs/testes/`. Pontos de contato: (1) as fixtures `docs/testes/fixtures/planta/*.json`; (2) o agregador de testes. Solução: o **passo 1** cria as fixtures num commit único (anote o hash do blob com `git hash-object`) e os dois ramos partem dele; adições idênticas dos dois lados fundem sem conflito. Só 2a mexe no `package.json` |
| 2a e 2d-servidor | NÃO | os dois mexem em `api/_vendas/consultor.mjs`, `agente.mjs`, `fluxo.mjs` |
| 2b e 2d-front (módulo do radar) | SIM | arquivos novos distintos (`js/planta-radar.js`, `css/orcamento-radar.css`). Só repetem 30 linhas de ajudantes de SVG/DOM; aceitável |
| 2c e qualquer outro | NÃO | 2c precisa de 2a (campo `planta` no estado) e 2b (módulos); toca `orcamento.html`, `js/orcamento.js` e `js/orcamento-planta.js`, os mesmos do 2d. 2d-ligação vem depois |
| 2b/2c e a rodada real 8 do Zero | independentes | a rodada real (modelo real no staging) continua bloqueada pelo dono; nada daqui depende dela, mas a avaliação de qualidade do plano do modelo real (seção 6) só acontece quando ela liberar |

Pontos que nunca podem divergir entre ramos: o esquema do plano (spec §2.2) e o catálogo de tipos (spec, Anexo A). Se um PR precisar mexer neles, o PR muda a spec no mesmo commit e avisa os outros ramos.

Para registrar em todos os PRs: seções do gate (Especificação, Visto rodando, Regressão, Verificação comportamental, Teste visto vermelho, Revisão técnica, Revisão de segurança quando nível 3), comentários de revisão publicados por `gh api repos/fernando123-hue/beyon0-site/issues/N/comments -F body=@arquivo`, link no corpo por `PATCH`, depois `gh run rerun` do gate, esperar o CI (mutação ~40 min), `git fetch` e conferir se a `main` andou (se andou, juntar, re-testar), mesclar por `gh api -X PUT repos/fernando123-hue/beyon0-site/pulls/N/merge -f merge_method=merge`.

## Passo 0. Diagnosticar o CLS do protótipo (antes de desenhar de novo)

Sem PR; resultado vai no corpo do PR 2b. No worktree `03 Projetos/site-planta` (ramo `planta-lab`, **não editar**; copiar `docs/lab-planta*` para a pasta de trabalho do 2b se precisar mexer).

1. `node docs/servidor.mjs . 8899` e rodar uma variante de `docs/lab-planta-medir.mjs` que registra, para cada `layout-shift`, `value` e `sources[].node` (seletor), em 390, 320 e 1.280.
2. Anotar quais elementos deslocam e quanto: confirmar ou derrubar as três hipóteses da spec §4.4 (altura por JS depois de medir; bloco que sai de `hidden`; legenda de altura variável) e achar as que faltam.
3. Saída: tabela `elemento | CLS | causa`. **Sem essa tabela o PR 2b não começa o desenho** ("medir antes de afirmar").

## Passo 1. Fixtures dos 3 nichos (commit comum a 2a e 2b)

Ramo curto `planta-fixtures` (de `origin/main`), nível 2 (só `docs/testes/`), mesclado antes de 2a e 2b começarem, ou cherry-pick do mesmo commit nos dois.

- `docs/testes/fixtures/planta/clinica.json` (laço, 8 caixas), `embalagens.json` (bifurca, 9), `loja.json` (espinha, 8): os três planos do protótipo **reescritos no formato do esquema** da spec §2.2, com 8 a 9 caixas, ids estáveis, verbos da lista, nenhuma palavra proibida (nada de "preço", número, marca). Textos revisados com a skill `voz-humana`.
- `docs/testes/fixtures/planta/invalidos/*.json`: um arquivo por defeito (título com 41 caracteres, frase com 111, tipo fora do catálogo, topologia inventada, 7 caixas, 10 caixas, id repetido, `satelite_de` apontando para o nada, chave `__proto__`, digito na frase, marca, prazo, promessa, `<script>`, plano de 9 KB...). O mesmo conjunto serve ao servidor (2a) e à validação leve da tela (2b).
- Verificar o hash: `git hash-object docs/testes/fixtures/planta/*.json` anotado no corpo dos dois PRs.

## PR 2a: servidor (esquema, validador, plano padrão, ferramenta do Zero)

**Nível 3** (`api/`, `package.json`, `.env.example`). Branch `planta-2a`. Autor sugerido: agente de implementação A. **Revisão técnica:** `code-reviewer`. **Revisão de segurança:** `security-reviewer`. Terceira leitura só do contrato com o modelo: `silent-failure-hunter` (o desenho todo é de cair calado em plano padrão: queremos ter certeza de que cada queda deixa rastro no log).

### Arquivos

Novos:
- `api/_vendas/planta-esquema.mjs`: `ESQUEMA_PLANTA` (para a ferramenta), listas fechadas (`TOPOLOGIAS`, `TIPOS`, `VERBOS`, `ORIGENS`), `validarPlano(bruto, { nomeDoNegocio, regulado })`.
- `api/_vendas/planta-textos.mjs`: lista dura de proibições (spec §2.3) e `textoDoPlanoPermitido(texto, ctx)` que reúne a lista própria e as travas existentes (rejeita se qualquer uma MUDAR o texto).
- `api/_vendas/planta-padrao.mjs`: os 8 planos padrão e `nichoDaPlanta(briefing)`.
- `api/_vendas/planta.mjs`: `aplicarPlanta({ entrada, briefing, tentativa, nome, regulado })` (o que a ferramenta chama: valida, devolve `{ ok, erros }` ou grava `briefing.planta`, cai no padrão na 2ª falha), `montarPlanta(briefing, ctx)` (o que o `estado` devolve, revalidando), `plantaParaModelo(briefing)` (versão compacta), `plantaLigada(env)`.
- Testes (novos): `docs/testes/planta-esquema.test.mjs`, `planta-textos.test.mjs` (+ `planta-textos-casos.mjs`), `planta-padrao.test.mjs`, `planta-ferramenta.test.mjs`, `planta-estado.test.mjs`, e o agregador **`planta-todos.test.mjs`** (importa dinamicamente todo `planta-*.test.mjs` da pasta; assim 2b, 2c e 2d não tocam mais o `package.json`).

Alterados:
- `api/_vendas/consultor.mjs`: a ferramenta `desenhar_planta` em `todasAsFerramentas`, a lista `FERRAMENTAS_DA_PLANTA`, o filtro em `ferramentas()` (só com `precoAberto` e flag), o passo novo em `proximoPasso` (spec §1.1). **Não tocar no prompt de sistema** (limite 27.000, hoje 26.985).
- `api/_vendas/agente.mjs`: ramo `desenhar_planta` na volta de ferramentas (no máximo 1 plano aceito por turno, teto de 4 versões, 1 tentativa de correção, depois o padrão), `MAX_ITERACOES` 4 para 5, `plantaParaModelo` no `estadoParaModelo`, log de uma linha.
- `api/_vendas/fluxo.mjs`: `estado` devolve `planta` (revalidada) quando a flag está ligada; o turno devolve o que o resto já devolve (a tela relê o estado).
- `api/_vendas/gerador.mjs`: `briefingDelimitado` remove `planta` e `leitura` antes de serializar.
- `api/_ia/simulado.mjs`: o provedor simulado sabe chamar `desenhar_planta` (casos: plano bom, plano ruim, plano ruim duas vezes) para os testes do agente.
- `package.json`: acrescenta **só** `docs/testes/planta-todos.test.mjs` à lista de `testar`.
- `.env.example`: `BZ_PLANTA=` com comentário (vazio = desligado; `ligada` = liga). Flag nova no staging é ação do dono ou do fluxo normal de variáveis; a produção não liga sozinha.
- `docs/testes/mutacao.mjs`: duas sabotagens de fonte: (1) "validador aceita dígito na frase" em `planta-textos.mjs`; (2) "plano inválido gravado sem validar" em `planta.mjs`; ambas com `testes: ['docs/testes/planta-textos.test.mjs','docs/testes/planta-esquema.test.mjs']`.

### Testes a escrever PRIMEIRO (todos vistos vermelhos antes da implementação; anexar a saída)

1. **Esquema (`planta-esquema.test.mjs`)**: as 3 fixtures validam; cada arquivo de `invalidos/` é rejeitado com o código esperado; chave desconhecida, chave de protótipo, tipo de dado errado (número onde vai texto, lista onde vai objeto), 7 e 10 caixas, topologia fora da lista, regras por topologia (bifurca sem `decisao`, espinha com satélite de satélite, laço sem `retorno`), `id` repetido e fora do formato, plano de 9 KB, texto com 41 e 111 caracteres (a fronteira: 40 e 110 passam). Nunca lança: `validarPlano(undefined | null | 7 | [] | 'x' | objeto circular)` devolve `{ ok: false }`.
2. **Textos (`planta-textos.test.mjs`)**: (a) **os 53 textos do protótipo reescritos nas fixtures passam** (taxa de falso positivo medida em 0/53 nas travas em 05/11; o teste fixa isso); (b) lista de 60 ou mais frases ruins, por classe (dígito, `%`, `R$`, preço sem número, prazo, numeral por extenso, marca em maiúscula, marca em minúscula, resultado, garantia, suporte, ordem ao sistema, negar IA, URL, e-mail, markdown, emoji, depoimento em nicho regulado) rejeitadas; incluir as que as travas atuais DEIXAM passar e a lista nova tem de pegar: "Enche a agenda da clínica toda semana", "Entrega em dois dias úteis", "Vende sozinho e sem esforço", "Mais clientes todo mês", "Pagamento sem taxa", "Faixa de preço pela tabela"; (c) **nome do negócio dado pela pessoa** passa mesmo com maiúscula, outro nome próprio não; (d) acento e variações (`preco`, `PREÇO`, `p r e ç o` com espaços, letras com acento solto, dígito de outro alfabeto) pegos.
3. **Padrão (`planta-padrao.test.mjs`)**: os 8 planos padrão passam no validador; têm 8 ou 9 caixas; cobrem as 3 topologias; `nichoDaPlanta` acerta uma lista de segmentos (30 frases reais e 10 ambíguas: as ambíguas caem em `generico`); nicho regulado nunca recebe plano com palavra de resultado.
4. **Ferramenta e agente (`planta-ferramenta.test.mjs`)**: `ferramentas()` inclui `desenhar_planta` só em `descoberta`/`estimativa`/`contato` com pedido não confirmado e flag ligada; nunca em `escopo`/`aguardando_pagamento` nem depois de confirmado; `proximoPasso` pede o plano na condição da spec §1.1 e não antes; com o provedor simulado: plano bom gravado em `briefing.planta` com `origem: 'modelo'`; plano ruim volta `ok:false` com erros legíveis e o 2º aceito; ruim duas vezes: plano padrão com `origem: 'padrao'` e **`ok:true` para o modelo**; 2º plano no mesmo turno recusado; 5ª versão recusada; o prompt de sistema **não mudou** (comprimento igual ao da `main`, teste de igualdade do hash do texto); `atualizar_briefing` com `planta` no corpo NÃO grava (chave desconhecida); `briefingDelimitado` não leva `planta` nem `leitura`; `estadoParaModelo` leva só a versão compacta (≤ 600 caracteres para 9 etapas).
5. **Estado (`planta-estado.test.mjs`)**: `GET estado` devolve `planta` com flag ligada e omite com flag desligada; plano gravado que deixou de ser válido (simulando validador mais duro: injetar um plano com texto proibido direto no briefing) sai como plano padrão; `planta` nunca contém o `briefing` inteiro; nada de campo extra.
6. **Mutação**: as duas sabotagens falham os testes acima.

### Verificação comportamental (antes de pedir revisão)

- Suíte completa: `npm run testar` (esperado: tudo verde e mais os testes novos) e `npm run testar:mutacao` (CI).
- Rodada simulada de 3 conversas (clínica, embalagens, loja) com o provedor simulado: o JSON do `estado` colado no corpo do PR (sem texto de visitante real).
- **Não** gastar crédito com o modelo real (rodada real 8 segue bloqueada pelo dono).

### Pronto quando

Todos os testes novos verdes e vistos vermelhos antes; suíte inteira verde; mutação pega as duas sabotagens; as 2 revisões publicadas e os achados aplicados; prompt de sistema idêntico; flag desligada = comportamento idêntico ao de hoje (teste de regressão: o `estado` e a lista de ferramentas são iguais byte a byte com a flag desligada); CI verde; `main` conferida. Nível calculado por `node scripts/processo/nivel-de-risco.mjs origin/main HEAD` = 3.

## PR 2b: o desenho (módulos do front, sem ligar ao Zero)

**Nível 2** (`js/planta-*.js` não casa com `js/orcamento*`; `css/` é 1; `docs/` de ferramentas é 2). Branch `planta-2b`. Parte do passo 0 e das fixtures. **Revisão técnica:** `typescript-reviewer` (cobre JS) + `performance-optimizer` (CLS e CPU). **Acessibilidade:** `a11y-architect`, com `npm run acessibilidade`. Segurança: não é nível 3, mas o `security-reviewer` olha a regra de `textContent` (barato, e o risco é XSS).

### Arquivos (todos novos, nada do site existente é alterado)

- `js/planta-pecas.js`: os 28 ícones do catálogo (port do `docs/lab-planta-pecas.js` para ES5 + 9 desenhados), `tipos()` e `desenhar(tipo, n)` devolvendo traços `{ d, ac }`. Sem preenchimento, sem desfoque.
- `js/planta-layout.js`: geometria pura (sem DOM) das 3 topologias × paisagem e retrato, **com altura reservada**: `alturaReservada(largura)` e `montarGeometria(plano, largura)` que devolve caixas, pontas, rotas, ordem da luz e `H === alturaReservada(largura)`. Laço e espinha em duas fileiras no computador (spec §1.4); retrato compacto (caixa 68 px, vão 18 px).
- `js/planta-valida.js`: validação leve da tela (forma, listas fechadas, limites, limpeza), mesmo conjunto de fixtures do servidor.
- `js/planta-desenho.js`: monta o SVG (`createElementNS`) e a lista `<ol>` (`textContent`), a linha do tempo por Web Animations API, o ajuste por diferença de `id`, `prefers-reduced-motion` e `html.menos-movimento`, IntersectionObserver para começar a animar, pausa fora da tela. Exposto como `window.BZPlanta = { montar(raiz, plano, opcoes), atualizar(plano), parar() }`.
- `css/orcamento-planta.css`: estados por classe (`is-aceso`, `is-ouro`, `is-ajustado`, `pl--pre`), mobile primeiro, ouro por `--ouro-rgb`. Sem `filter`, sem `backdrop-filter`, sem `box-shadow` com desfoque, sem gradiente radial.
- `docs/lab-planta.html` + `docs/lab-planta-quadros.mjs` + `docs/lab-planta-medir.mjs` (laboratório e ferramentas portados para usar os módulos REAIS e as fixtures; fora do deploy como o protótipo). `docs/lab-planta-semjs.mjs` não volta (a planta não tem versão sem JS).
- Testes: `docs/testes/planta-pecas.test.mjs`, `planta-layout.test.mjs`, `planta-valida.test.mjs`, `planta-desenho.test.mjs`, `planta-es5.test.mjs`, `planta-sem-html.test.mjs`.

### Testes a escrever PRIMEIRO (vistos vermelhos)

1. **Catálogo**: todo tipo do catálogo tem desenho e todo desenho está no catálogo (nenhum "ícone órfão"); cada traço só tem comandos de caminho permitidos e números finitos; nenhum atributo `filter`, `style`, `fill` com gradiente.
2. **Geometria (`planta-layout.test.mjs`)**: para as 3 fixtures (+ variações de 8 e 9 caixas) × larguras 320, 360, 390, 430, 768, 1.024, 1.280: nenhuma caixa se sobrepõe, tudo dentro da largura (sem rolagem lateral), toda rota liga caixas que existem, a ordem da luz é total, **`H === alturaReservada(L)`**, retrato 9 caixas ≤ 940 px em 390 e ≤ 1.020 em 320, paisagem sempre 456 px, laço/espinha em duas fileiras em 8 a 9 caixas, mesma entrada gera a mesma geometria (determinismo).
3. **Validação leve**: aceita e recusa o mesmo conjunto que o servidor para a **forma** (`invalidos/` de forma; os de texto proibido ficam fora, são só do servidor) e nunca lança.
4. **Sem HTML do modelo (`planta-sem-html.test.mjs`)**: lê `js/planta-*.js` e falha se achar `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `setAttribute('style'`, `.style.cssText`; e um teste com DOM falso (como `orcamento-painel`) que passa título `<img src=x onerror=alert(1)>` e confere que vira texto.
5. **ES5 (`planta-es5.test.mjs`)**: varre os arquivos sem comentários e sem strings e falha com `=>`, `const `, `let `, crase, `class `, `...`, `Object.values`, `Object.entries`, `.padStart`, `Array.from`, `.includes(`, `async `. Verificado vermelho contra o protótipo (`docs/lab-planta.js` do ramo `planta-lab`).
6. **Desenho (`planta-desenho.test.mjs`, DOM falso)**: a lista tem uma `<li>` por caixa, na ordem da luz; textos por `textContent`; o status final diz o número de etapas; `parar()` limpa temporizadores; movimento reduzido: nenhuma chamada de animação; ajuste: só as caixas com `id` novo ganham a classe `is-ajustado`; plano sem ids em comum refaz tudo.

### Verificação no navegador (obrigatória, nível 1 e 2)

Servidor `node docs/servidor.mjs . 8899`; o laboratório `docs/lab-planta.html`:

- Capturas dos 3 nichos em 390, 320, 768 e 1.280, **antes de olhar o código**; abrir os PNG e olhar. Comparar lado a lado com os mosaicos aprovados em `01 Empresa/Referências/Protótipo planta viva/` (o dono aprovou aquele visual; qualquer diferença de linguagem é defeito, não melhoria).
- `docs/lab-planta-medir.mjs`: CLS por nicho e largura (meta spec §4.4: ≤ 0,01 de delta; no laboratório, a meta é CLS ≤ 0,01 absoluto), fps de entrada e de repouso, quadros > 50 ms, nós do DOM (≤ 450).
- Com estrangulamento de CPU de 4x (DevTools/Playwright CDP `Emulation.setCPUThrottlingRate`): montagem ≤ 120 ms, nenhuma tarefa longa na entrada.
- `npm run acessibilidade` (estende o roteiro com a página do laboratório): sem JS não há faixa; movimento reduzido mostra o quadro final; teclado percorre os botões com foco visível; árvore de acessibilidade (`read_page`) lista as etapas na ordem da luz.
- Procurar à mão por blur, brilho e "tubo": inspeção do CSS por busca de `blur`, `drop-shadow`, `box-shadow`, `radial-gradient`, `backdrop-filter` (teste automático também).

### Pronto quando

Testes verdes e vistos vermelhos; CLS e CPU dentro da meta, **com os números no corpo do PR**; capturas dos 3 nichos × 4 larguras anexadas e comparadas com o aprovado; acessibilidade e ES5 verdes; as revisões publicadas; nenhum arquivo do site existente alterado (`git diff --stat origin/main` só com arquivos novos).

## PR 2c: a ligação (o painel mostra a planta quando o Zero devolve o plano)

**Nível 3** (`js/orcamento*`). Branch `planta-2c`, depois de 2a e 2b mescladas. **Revisão técnica:** `code-reviewer`. **Segurança:** `security-reviewer` (entra dado do modelo no DOM). **Desempenho e CLS:** `performance-optimizer`. **Acessibilidade:** `a11y-architect`.

### Arquivos

- `orcamento.html`: a faixa `<section id="o-planta" hidden>` entre `.orc-mesa` e os blocos de ajustes, o `<link>` do CSS e o carregador. Nada de `style=""`.
- `js/orcamento-planta.js` (novo, ES5): a cola. `window.BZOrcPlanta.atualizar(E)` lê `E.planta`; na primeira vez injeta `js/planta-*.js` (carregador sob demanda, mesma origem, CSP ok) e chama `BZPlanta.montar`; nas seguintes, `BZPlanta.atualizar` (ajuste). Botão do chat "Ver a planta do seu site" (celular) por `textContent`; "Está certo" envia "A planta está certa." pelo envio normal da conversa; "Quero ajustar algo" foca `#o-texto` com a dica. Desligado nas etapas de só dúvidas.
- `js/orcamento.js`: **uma linha** no `render()`, ao lado da que chama `BZPainel.atualizar`: `if (window.BZOrcPlanta) window.BZOrcPlanta.atualizar(E);`.
- `css/orcamento-planta.css`: o que a página precisa (posição da faixa, legenda fixa na base no celular, botão do chat).
- Testes: `docs/testes/planta-ligacao.test.mjs` (DOM falso, como o do painel), e uma extensão do roteiro `docs/e2e-orcamento.mjs` com o provedor simulado devolvendo plano.

### Testes a escrever PRIMEIRO

1. Sem `E.planta`, a faixa fica escondida e a tela é igual à de hoje (comparação do HTML renderizado).
2. Com `E.planta` válida, a faixa aparece uma vez, o botão do chat aparece uma vez por versão (não repete a cada turno), e o carregamento sob demanda acontece uma vez.
3. `E.planta` inválida (forma errada, texto com `<`): a faixa não aparece e nada lança (a tela valida de novo).
4. "Está certo" gera exatamente uma mensagem pelo envio normal; "Quero ajustar" não envia nada.
5. Em etapa de só dúvidas, os dois botões ficam desligados e a planta continua visível.
6. Regressão: `docs/testes/zero.test.mjs` (painel da fatia 1) continua verde; `render()` sem o módulo carregado funciona.
7. E2E simulado: conversa de clínica até o plano; ajuste ("quero cobrar um sinal"); a segunda planta traz o `id` novo marcado.

### Verificação no navegador

`npm run verificar` (as 10 metas + a página de orçamento), `npm run acessibilidade`, `npm run olhar`, `npm run medir -- planta` com **A/B: orçamento sem planta contra com planta** (mesma sessão): delta de CLS, TBT, bytes, nós. Cenário de CLS com `layout-shift` e fontes dos deslocamentos: 3 nichos × 390, 320 e 1.280 px, **chegada do plano com a faixa dentro da tela e fora dela**.

- **Degrau A** (inserir ao chegar): se delta de CLS ≤ 0,01, fica.
- **Degrau B** (reservar no envio da 1ª mensagem): se A passar de 0,02. A reserva usa `alturaReservada` do 2b; uma área vazia com "O Zero está lendo o seu caso" aparece no instante do envio e é preenchida quando o plano chega (deslocamento = 0).
- Entre 0,01 e 0,02: decidir com as capturas; registrar a decisão no corpo do PR.
- No celular real do dono não dá para testar sem ele: capturas em 390 e 320 de verdade (emulação) e a lista do que o dono deve olhar quando voltar.

### Pronto quando

Faixa e botões funcionando com o provedor simulado; metas da spec §4.4 atingidas e com números no PR; `E.painel` da fatia 1 intacto; flag `BZ_PLANTA` desligada = página idêntica (comparar HTML e requisições de rede: nenhum JS da planta baixado); as quatro revisões publicadas; CI e E2E verdes. **Antes de mesclar na `main`, mostrar capturas e vídeo curto ao dono pelos canais habituais, sem esperar resposta para mesclar** (a `main` só vai para o staging; produção é dele e só liga com `BZ_PLANTA=ligada` no staging).

## PR 2d: o radar "Como lemos o seu caso"

Dois ramos que se juntam. **Nível 3** no servidor e na ligação; o módulo puro do radar é nível 2.

### 2d-front (pode andar em paralelo com 2a e 2b; branch `planta-2d-front`, nível 2)

- `js/planta-radar.js` (ES5; `window.BZRadar = { validar, montar(raiz, leitura), atualizar(leitura) }`): pentágono, 3 anéis, 5 raios, polígono de 1,5 px com preenchimento chapado de 10%, rótulos em HTML, lista `<dl>` acessível com nível por extenso e evidência, interpolação dos vértices em 450 ms por `requestAnimationFrame`, movimento reduzido salta. Altura reservada (300 px em 390).
- `css/orcamento-radar.css`.
- `docs/lab-radar.html` e fixtures `docs/testes/fixtures/radar/*.json` (3 leituras diferentes, uma por nicho).
- Testes **primeiro**: `docs/testes/planta-radar.test.mjs` (formato, 5 eixos exatos, níveis fechados, evidência ≤ 60 por `textContent`, mesmo `<img onerror>` vira texto, nenhum número exibido na tela, rótulos fixos, movimento reduzido sem `requestAnimationFrame`), mais ES5 e proibição de `innerHTML` (as varreduras do 2b já cobrem `js/planta-*.js`, inclusive este arquivo).
- Verificação no navegador no laboratório: capturas 390/320/1.280 com leituras diferentes (para provar que cada cliente tem o seu); polígono muda entre duas leituras; conferir "não é nota" na legenda; CLS do bloco = 0 (altura fixa).
- Revisão: `typescript-reviewer` + `a11y-architect`.

### 2d-servidor e ligação (depois de 2a e 2c; branch `planta-2d`, nível 3)

Arquivos:
- `api/_vendas/leitura.mjs` (novo): `ESQUEMA_LEITURA`, `validarLeitura(bruto, { mensagensDoVisitante, regulado })`: esquema fechado de 5 eixos, **evidência ancorada** (metade das palavras de 4+ letras presentes nas mensagens do visitante), mesma lista dura e travas, só rebaixa nível (spec §3.4), `montarLeitura(briefing, ctx)` revalidando na leitura.
- `api/_vendas/consultor.mjs`: ferramenta `ler_caso`, `proximoPasso` pede a leitura a cada turno com informação nova.
- `api/_vendas/agente.mjs`: ramo `ler_caso` (guarda em `briefing.leitura`; uma por turno; erro volta ao modelo uma vez; sem plano padrão: leitura inválida simplesmente não muda o que já está).
- `api/_vendas/fluxo.mjs`: `estado` devolve `leitura`. `api/_vendas/gerador.mjs`: já tira `leitura` (feito no 2a).
- `js/orcamento-planta.js` ou um `js/orcamento-radar.js` novo (nível 3 pelo prefixo `orcamento`): `window.BZOrcRadar.atualizar(E)`; `js/orcamento.js`: uma linha no `render()`; `orcamento.html`: o contêiner do radar dentro do `#o-peca` (coluna do painel) e o `<link>` do CSS; o módulo `planta-radar.js` é carregado sob demanda junto com a primeira leitura.
- Testes (**primeiro**): `docs/testes/planta-leitura.test.mjs` com: leitura boa passa; evidência que não vem de palavra do visitante é descartada e o nível cai; `deixou_claro` sem evidência cai para `comentou`; **nível nunca sobe** (propriedade: para qualquer entrada, `nivel_saida <= nivel_entrada`); número na evidência descartado; marca descartada; depoimento em nicho regulado descartado; 4 ou 6 eixos recusados; eixo repetido recusado; nunca lança; `estado` devolve `leitura` revalidada; flag desligada omite; prompt de sistema intacto; sabotagem de mutação "evidência aceita sem ancorar".

Verificação: o do 2c (A/B de CLS e CPU, agora com o radar) mais capturas da conversa com o radar mudando entre o 1º e o 3º turno (simulado). Revisão: `code-reviewer`, `security-reviewer`, `a11y-architect`.

### Pronto quando

Radar muda a cada resposta com o provedor simulado; nenhum número na tela; evidência sempre ancorada; testes vistos vermelhos; revisões publicadas; CI verde.

## Pós-PRs (não são PR, dependem do dono)

1. **Rodada real 8 do Zero** (chave de teste + login do Access, teto de US$ 3, pode subir avisando): avaliar com o modelo real, em 10 a 15 conversas de nichos variados: % de planos válidos de primeira, % que cai no padrão, motivos mais comuns, tokens e custo por plano, qualidade dos textos (voz humana, sem "cara de robô"), evidência do radar. Critério de decisão: se mais de 30% cair no plano padrão, simplificar o esquema ou afrouxar a lista dura onde ela erra; se o radar inflar níveis, trocar para o plano B dos eixos de cobertura.
2. **Dono vê no celular dele** (staging com `BZ_PLANTA=ligada`) e decide a ligação em produção (promover é dele).
3. Melhorias de 2ª rodada, só se pedirem: etiqueta "combinar no orçamento" por tipo, tipos de ícone novos, topologia nova, evento de métrica no banco.

## Riscos de execução

- **Ordem de merge:** 2a, 2b (qualquer ordem), 2c, 2d-ligação. O gate "Processo" lê o corpo do PR na hora; publicar revisões antes do `rerun`.
- **A `main` anda** (outras frentes mesclam em `api/_vendas/`): `git fetch` antes de mesclar, juntar e re-testar (lição do #38).
- **Worktrees:** 2a, 2b, 2c, 2d em worktrees separados a partir de `origin/main` (nunca em `03 Projetos/site`, em ramo velho, nem em `site-planta`, que é o protótipo e fica intacto). Sugestão: `site-planta-2a`, `site-planta-2b`.
- **Suíte lenta com mutação:** rodar `npm run testar` local e deixar a mutação para o CI.
- **Custo de tokens dos agentes:** 2a e 2b são os maiores; 2c e 2d são pequenos. O teto próprio de 85% do limite semanal continua valendo.
