# Planta viva do produto do cliente (fatia 2 do painel da conversa): especificação

> Data: 2026-11-05 (revisão 2, depois da revisão do arquiteto independente contra o código real; cada item foi conferido no código antes de aplicar).
> Autor: agente (sessão do site, enquanto o dono dorme). Ramo `planta-spec` (de `origin/main` = `a337d82`).
> Só documentação: nenhum código de produção. O plano de execução está em `docs/superpowers/plans/2026-11-05-planta-viva.md`.
> Marcas: **[D]** = decisão do dono (registrada em `01 Empresa/Decisões.md`, cofre, não neste repositório); **[A]** = decisão do agente, o dono pode mudar.

## 0. O que já está decidido e o que esta especificação decide

| Tema | Quem | O quê |
|---|---|---|
| Existe uma planta animada, única por cliente e nicho, na linguagem do site (escuro, ciano, traço de 1 px, "a luz passa e imprime") | [D] 04/11 | Não copiar o vídeo de referência; mostrar o MECANISMO (como o site trabalha sozinho), nunca promessa, número, preço ou prazo |
| O protótipo (`planta-lab`, commit `148deab`: 3 nichos, 3 topologias, ouro só no LED final, texto em HTML, sem blur) vale como está | [D] 05/11 | "ficou muito bom, gostei muito de tudo", inclusive o ponto dourado no final |
| Também um gráfico de leitura (radar "como lemos o seu caso") como o da parte final da conversa | [D] 05/11 (o agente entende assim; se for outro, o dono corrige) | Cada cliente com o seu, gerado do que ele escreveu, nunca copiado |
| O modelo devolve SÓ um plano em JSON validado por esquema; o código desenha tudo | [D] 04/11 | Contrato da seção 2 |
| Todo o resto (momento, lugar, números, catálogo, eixos, medidas) | [A] | Esta especificação |

Regras permanentes que valem aqui (do `CLAUDE.md` e das memórias do dono): sem blur nem brilho difuso nem "tubo" de linhas empilhadas (uma linha só, com luz circulando); celular primeiro (390 e 320 px); nada de "tela de carregamento" nem de área vazia com rótulo de espera (a própria página se move); não reinterpretar o que ele aprovou; voz humana em todo texto de cliente; CSP sem inline (`style-src 'self'`: nada de `style=""` nem `setAttribute('style')`; `el.style.x` por JS pode); zero invenção de dado; regra 1 do `CLAUDE.md`: movimento contínuo só em transform/opacity e **um rAF só, via `B.add`** (`window.BEYON.add`, `js/core.js`).

**Decisão desta frente [A], não regra do repositório:** o `CLAUDE.md` não exige ES5 e vários arquivos do site já usam `=>`/`async` (`js/orcamento-api.js`, `js/orcamento-envio.js`...). Os módulos da planta usam **ES5 sintático** (`var`, `function`, sem `=>`, `const`, `let`, crase, classe), como `js/orcamento-painel.js` e `js/orcamento-material-esquema.js`, para serem iguais ao módulo vizinho e carregarem em qualquer navegador sem passo de build.

## 1. O que o visitante vê

### 1.1 Em que momento da conversa

O funil de hoje (`api/_vendas/consultor.mjs`, `proximoPasso`) é: descobrir negócio e objetivo, **a pergunta da dor (`situacao_atual`)**, formato, e então "já dá para estimar: chame estimar agora". Ou seja, no turno em que o briefing fica pronto o Zero chama `estimar` e mostra o valor. A planta entra **depois disso**:

- **No turno SEGUINTE ao da primeira estimativa**, quando `estimativa` existe, o briefing ainda não tem `planta`, a etapa é de preço aberto (`descoberta`, `estimativa` ou `contato`, pedido não confirmado) e a flag está ligada. Nunca no mesmo turno do `estimar` (o ESTADO do turno é calculado no começo dele, quando `estimativa` ainda é nula; um teste fixa isso). Não exige `situacao_atual`.
- O `proximoPasso` ganha um **ramo por prefixo**: quando a condição vale, devolve "Antes de tudo neste turno, chame desenhar_planta (uma vez) e diga em uma frase que desenhou o site em planta, logo abaixo. Depois: " + o texto que ele devolveria hoje. O texto atual não é trocado nem reescrito. Sem a condição, o `proximoPasso` é idêntico ao de hoje (teste).
- O Zero escreve **uma frase** no chat e não descreve as etapas: a planta é o conteúdo.
- Redesenho só quando a pessoa pede um ajuste ("quero cobrar um sinal") ou o caso muda de verdade, até 4 versões por conversa. Se a pessoa diz "A planta está certa.", o Zero **não redesenha** e segue o funil (com planta gravada o prefixo não existe, então o `proximoPasso` é o de hoje; a descrição da ferramenta também manda).
- Se o Zero deixa de chamar a ferramenta, o servidor não espera para sempre: **dois turnos depois de o prefixo ter pedido, sem plano, ele grava o plano padrão do nicho** (contador `briefing.planta_pedidos`, spec §2.6).
- Depois que o pedido é confirmado, ou nas etapas de só dúvidas, a planta fica como está, sem botão de ajuste (o estado diz `planta_editavel: false`).
- O radar (seção 3) aparece antes e muda a cada resposta; a planta só quando há matéria para 8 ou 9 etapas e o preço já foi dito.

(Substitui a versão anterior desta seção, que punha a planta "antes de falar de valor" e "no 3º ao 5º turno": isso contradizia o funil, que estima assim que o briefing fica pronto.)

### 1.2 Onde fica

- **Faixa de largura total entre `.orc-mesa` (conversa + painel) e `#o-contato` (o formulário "Para quem vamos desenhar?")**, `orcamento.html` linhas ~249-253 [A]. Motivo: a posição paisagem precisa de 760 px ou mais, e a coluna do painel é estreita (a partir de 900 px: `minmax(300px, 1fr)` contra `1.55fr`, fixa na rolagem; a largura exata depende da janela).
- **Decisão [A] (o dono pode mudar): a faixa vem ANTES do formulário.** Risco: afasta o preço do botão "Quero os três modelos". O PR 2c **mede** a distância do cartão de preço até o botão do formulário nas duas posições (A: planta antes; B: planta depois do formulário) em 390, 320 e 1.280 px e reporta. No celular, se a planta for o motivo de a distância passar de 1,5 tela, a faixa limita a altura a 70 vh com o botão "Ver a planta inteira" (a altura muda por toque da pessoa, que o navegador não conta no CLS).
- A coluna do painel (fatia 1) continua com "O que já anotamos" e a ficha; o radar entra nela **abaixo do cartão de investimento** [A] (seção 3.5).
- Para a pessoa não perder a planta: junto da fala do Zero que a trouxe aparece, **dentro da lista de mensagens**, o botão "Ver a planta do seu site" (celular e computador). Tocar nele insere a faixa (se ainda não estiver) e leva a pessoa até ela pela rolagem existente da tela (`rolarAte`/`irPara` de `js/orcamento.js`, que já espera a passagem entre páginas), sem cortina. O botão precisa **sobreviver aos turnos seguintes**: `conversa()` refaz a lista inteira a cada mudança (`js/orcamento.js` ~610-615), então o estado guarda `planta.n_mensagens` (a posição da fala que acompanhou aquela versão) e o módulo recoloca o botão a cada `render()`, depois de `conversa()`, sob a fala de índice `n_mensagens`.
- Sem JS a faixa não existe (a página de orçamento depende de JS para conversar). Em `prefers-reduced-motion` ou com o interruptor "menos movimento" (`html.menos-movimento`): um quadro final, completo, sem movimento.

### 1.3 Como é e como se move (herdado do protótipo, sem reinterpretar)

Elementos: núcleo (Zero); a chegada ("de onde a pessoa vem"); 8 a 9 caixas de estação com ícone em traço, número, verbo e título; rotas de 1 px com setas; LED final ("Objetivo"); legenda de leitura com a frase da estação acesa; botões "Está certo", "Quero ajustar algo", "Rever a montagem". **Todas as classes novas da planta usam o prefixo `plv-`** (o radar da seção 3 usa **`plr-`**) (`pv-` já existe nas miniaturas de prévia, `pl-` na vitrine de Sites, `.planta*` em `css/peca-sites.css`).

Sequência (cerca de 7,6 s, a do protótipo):

1. **Emaranhado** (0 a 1,6 s): um rabisco único do núcleo ao LED ("sem estrutura, o caminho de quem chega é um emaranhado"). Semente = hash dos ids do plano.
2. **Esboço** (0,35 s em diante): as caixas surgem a 34% de opacidade, com as rotas fantasma.
3. **A luz imprime**: a cabeça de luz percorre cada rota na ordem do plano; ao chegar, a estação acende e a legenda mostra "03 · Agenda" e a frase dela. A rota SE DESENHA uma vez (animação finita de `stroke-dashoffset`, permitida: a regra 1 fala de movimento contínuo).
4. **Ouro só no LED**: ao chegar, o LED fica dourado (`--ouro-rgb`) com duas ondas de traço (anéis que crescem e somem, em `transform` e `opacity`) [D].
5. **Vida (repouso)**: depois de pronta, um pulso de luz percorre a rota a cada 6 s. **Por ser movimento contínuo, só em `transform`/`opacity`** (regra 1): a cabeça é um ponto pequeno de traço movido por `transform: translate()` com keyframes por segmento da polilinha da rota (não por `stroke-dashoffset` nem `offset-distance`, que não são do compositor). Roda só enquanto a faixa está na tela e a aba visível, no máximo 60 s, e volta com toque ou foco [A].
6. **Ajuste**: a pessoa escreve o que quer mudar; o Zero devolve um plano novo; a tela compara por `id` e anima só a diferença (estações movem por transform, a nova entra com a etiqueta "Ajustado", a luz percorre as rotas que a tocam). Sem ids em comum: refaz a montagem inteira.

A animação começa quando 35% da faixa entra na tela (IntersectionObserver). **Sem rolagem automática** [A] (o protótipo seguia a luz rolando a página; briga com o dedo). A legenda de leitura fica **grudada na base da faixa** no celular (`position: sticky; bottom: 0`, opaca) enquanto a planta está em vista; não é `fixed`, para não brigar com o teclado virtual nem com a faixa de consentimento (`.consentimento`, `position: fixed`, z-index 70, `css/tokens.css:280`), caso coberto na verificação em 390 e 320.

"Está certo" envia "A planta está certa." pelo formulário normal da conversa (passa por todas as travas e segue o funil). "Quero ajustar algo" foca o campo de texto com a dica "Diga o que mudar na planta." [A]. **Os dois só funcionam com `planta_editavel`** (seção 2.6): o servidor diz se o preço ainda está aberto e a flag ligada.

### 1.4 Celular primeiro: a proposta concreta para a pendência "vertical e comprida"

O protótipo no celular tinha caixas de 80 a 98 px e vão de 30 px, cerca de 1.250 px para 9 etapas. Proposta, medida no PR 2b:

- Caixa de lado (ícone à esquerda, texto à direita) com **68 px**, vão de **18 px** (passo de 86 px). Cabe porque o título tem no máximo 40 caracteres: 2 linhas a 13 px mesmo em 320 px (largura útil 180 px; 40 caracteres ≈ 264 px). A frase longa vai para a legenda.
- Altura total com 9 etapas: **≤ 940 px em 390 px e ≤ 1.020 px em 320 px** (cerca de 1,4 tela). Teste de geometria e medição no navegador.
- Legenda grudada na base; sem rolagem automática; botão no chat; limite de altura com "Ver a planta inteira" se a medição do 1.2 mandar.
- Descartado por enquanto: folha de tela cheia ("bottom sheet"). Zeraria o CLS, mas é uma camada que cobre a tela, parecida demais com o que o dono rejeitou.

Paisagem (largura da faixa ≥ 760 px): altura **fixa de 456 px** para as três topologias; as folgas verticais são elásticas (no protótipo: laço ≈ 388, bifurca ≈ 420, espinha com satélites ≈ 504; o desenho se acomoda à altura reservada, nunca o contrário). **Achado:** o layout paisagem do protótipo foi calculado para 5 a 7 colunas e exige coluna ≥ 112 a 130 px; com 8 a 9 estações em linha, laço e espinha deixam de caber até em 1.280 px (coluna ≈ 105 px com 8 caixas; o protótipo devolve `null` e cai no retrato). O PR 2b leva uma nova disposição: **laço e espinha em duas fileiras** (laço como pista: ida em cima, volta embaixo; espinha com o tronco em duas fileiras e os satélites só nas pontas). Bifurca cabe em linha (7 colunas). É trabalho de desenho a aprovar nas capturas, não suposição.

### 1.5 Textos fixos da interface (escritos pelo código, não pelo modelo)

Título da faixa "A planta do seu site"; "Chega", "Objetivo", "Ajustado"; botões; status para leitor de tela ("Planta pronta, com 9 etapas."); e **duas notas de honestidade** [A]:

- Plano do modelo: "É o desenho do que o seu site pode fazer, a partir do que você contou. O que entra de fato é combinado no orçamento."
- Plano padrão (inclusive o que o servidor grava quando o modelo não chama): "Um desenho de exemplo para o seu tipo de negócio. Conforme você contar mais, o Zero refaz."

## 2. Contrato com o modelo

### 2.1 A ferramenta

`desenhar_planta` (nova, em `todasAsFerramentas` de `api/_vendas/consultor.mjs`).

- **A flag chega por parâmetro, não por `process.env`.** Hoje só `fluxo.mjs` tem `env` (`entregaLigada(env)`, `BZ_ENTREGA`); `agente.mjs` e `consultor.mjs` são puros. `fluxo.mjs` calcula `planta = plantaLigada(env)` (`BZ_PLANTA === 'ligada'`) e passa a `executarTurno`, que repassa a `ferramentas(regras, { etapa, pedidoStatus, planta })`, `proximoPasso({ ..., planta })` e `estadoParaModelo({ ..., planta })`. Padrão `false`: sem `planta` a lista **não** inclui `desenhar_planta` (as listas e os testes de hoje seguem com 5 ferramentas).
- **A lista de ferramentas é prefixo de cache** da API: ela só liga/desliga por **etapa e flag**, nunca por condição do turno (ter ou não ter estimativa). A condição "agora é a hora" vive só no `proximoPasso` (texto do ESTADO) e na recusa do código.
- **Não mexe no prompt de sistema.** Hoje ele mede **26.985** (`direcoes: 'manual'`) e **26.994** (`'api'`) caracteres (medido em 05/11 com `montarSistema` e `docs/fase2/regras-rascunho-v1.json`). O 27.000 **não é limite da API**: é uma asserção de teste (`docs/testes/consultor.test.mjs:55`, `docs/testes/zero.test.mjs:639, 801, 886`). Ela poderia subir, mas isso é decisão do dono (foi de 26.000 para 27.000 em 01/11 a pedido dele); aqui o "quando" vai no `proximoPasso` e o "como" na descrição e no esquema da ferramenta.
- **Esquema estrito** (`strict: true` nas ferramentas com enums): a interface do provedor documenta o campo (`api/_ia/provedor.mjs:10`) mas `api/_ia/anthropic.mjs` **não o repassa hoje**. O PR 2a avalia: se repassar for uma linha segura, liga para `desenhar_planta` (enums de `topologia`, `tipo`, `verbo`, `origem`); limites de tamanho continuam no validador e na descrição. Não bloqueia.
- Resultado devolvido ao modelo: `{ ok: true, na_tela: true, etapas: N }` ou `{ ok: false, erros: ["etapa 3: título com 47 caracteres (máx 40)", ...] }` para ele corrigir **uma vez** no mesmo turno. Segunda falha: o servidor grava o plano padrão e devolve `{ ok: true, na_tela: true, exemplo: true }`; a descrição da ferramenta manda, quando `exemplo: true`, dizer "um desenho de exemplo para o seu tipo de negócio, que eu refaço conforme você me contar mais".
- **Custo e tempo.** Um plano de 9 etapas tem uns 3 KB de JSON, ou **1.000 a 1.300 tokens de saída** (não 600); uma correção dobra. Os tetos reais: 90 s por turno no navegador (`js/orcamento-api.js`, `MENSAGEM_MS`), 45 s por volta do modelo (`api/_ia/config.mjs`, `PAPEIS.conversa.timeout_ms`), `max_tokens` 4.000, `MAX_ITERACOES = 4` (**não sobe**: o turno da planta tem a volta das ferramentas, uma de correção no pior caso e a volta do texto; esgotando, o servidor grava o padrão). Meta: **turno da planta ≤ 60 s na rodada real 8**. O teste de tetos de `zero.test.mjs` ganha o caso "turno da planta: 4 voltas, 1.300 tokens de saída".

### 2.2 O plano (JSON, esquema fechado, sem campo extra)

```
plano = {
  topologia: "laco" | "bifurca" | "espinha",
  chegada:   { origens: [origem x 1..4, sem repetir], titulo, frase },
  etapas:    [ etapa x 7..8 ],            // 1 chegada + 7 ou 8 = 8 ou 9 caixas
  fim:       { titulo, frase },           // o LED: o "Objetivo"
  fecho:     frase,                       // aparece quando a luz termina
  rotulo_retorno: texto <= 28             // só no laço
  rotulos_ramos:  [texto <= 28, texto <= 28]   // só na bifurca
}
etapa = { id, tipo, verbo, titulo, frase,
          decisao?: bool,                 // no máximo UMA por plano em qualquer topologia; obrigatória na bifurca (a última de entrada)
          ramo?: 0 | 1,                   // só na bifurca
          satelite_de?: id, lado?: "cima" | "baixo", laco?: bool,   // só na espinha
          retorno?: bool }                // só no laço, na última etapa
```

- **`topologia`**, lista fechada: `laco` (o fim volta ao começo: a clínica), `bifurca` (a conversa decide e a rota se divide e se junta: a fábrica), `espinha` (um tronco com satélites e, no máximo, um laço curto: a loja). Topologia nova exige layout, teste de geometria e entrada nesta lista; o modelo nunca inventa uma.
- **Regras por topologia**: laço = todas em sequência, a última com `retorno: true`; bifurca = entrada (sem `ramo`; a última com `decisao: true`), 1 a 2 etapas no `ramo` 0, 1 a 2 no `ramo` 1, 1 a 2 de saída (sem `ramo`); espinha = 4 a 5 de tronco e 2 a 4 satélites, cada `satelite_de` apontando para uma etapa de tronco, no máximo um satélite por etapa, no máximo um `laco: true`. `decisao` é opcional no laço e na espinha.
- **`tipo`**: catálogo fechado (Anexo A). Tipo fora da lista invalida o plano.
- **`verbo`**: lista fechada de uns 30 verbos de uma palavra (Recebe, Mostra, Conduz, Decide, Agenda, Lembra, Cobra, Calcula, Levanta, Combina, Propõe, Retoma, Reativa, Mede, Convence, Reúne, Avisa, Escolhe, Confirma, Responde, Registra, Organiza...).
- **`origens`**: `busca`, `mapa`, `indicacao`, `rede`, `anuncio`, `direto`, `email`; só o número delas desenha o ícone de chegada.
- **`id`**: `^[a-z0-9-]{2,24}$`, único; o modelo mantém os ids das etapas que não mudam ao redesenhar (permite animar só a diferença).
- **Tamanhos**: título 3 a 40, frase 20 a 110, rótulos até 28, 8 ou 9 caixas, plano serializado ≤ 8 KB. O validador **rejeita** o que passa do limite (cortar no meio faria frase torta) e o erro volta ao modelo.
- **Um único módulo define a FORMA para os dois lados**: `js/orcamento-planta-forma.js` (ES5, script clássico na tela e CommonJS no servidor, o mesmo desenho de `js/orcamento-material-esquema.js`, importado por `api/_material/pacote.mjs` e `api/_vendas/fluxo-recado.mjs`). Ele guarda as **listas fechadas** (topologias, tipos, verbos, origens, eixos e níveis do radar), os **limites** e a **validação de forma** (tipos, contagens, regras por topologia, limpeza de caracteres, comprimentos). O prefixo `orcamento` é de propósito: o arquivo é nível 3 em `scripts/processo/niveis.json`. Servidor e tela usam o MESMO código (não há "teste de paridade" a manter). As travas de TEXTO (seção 2.3) são só do servidor.

Os textos são em português do Brasil, na voz da Beyon ("a gente"), terceira pessoa para a pessoa que chega, presente do indicativo, sem jargão. A descrição da ferramenta leva três exemplos completos (os três nichos do protótipo reescritos nestas regras).

### 2.3 O que é PROIBIDO em qualquer texto do plano

Número (qualquer dígito, `%`, `R$`), preço e custo (preço, valor, custo, barato, grátis, desconto, taxa), prazo (prazo, imediat-, instantâne-, "em minutos/segundos/horas", "mesmo dia", dias, semanas, meses), numerais por extenso de dois em diante (um e uma passam), marca e nome de terceiro (heurística: palavra com inicial maiúscula no meio da frase, fora o nome do negócio que a própria pessoa deu e `Pix`; mais lista de plataformas conhecidas, também em minúsculas), promessa de resultado ou garantia (enche, lota, dobra, aumenta, mais clientes/vendas/pedidos/agendamentos, vende sozinho, sem esforço, garant-, certeza, resultado, lucro, faturamento), URL, e-mail, telefone, markdown, emoji, ordem ao sistema (ignore, desconsidere, instrução, prompt, regras), negar ser IA, e, em nicho regulado, depoimento e "antes e depois".

**Medido (05/11, conferido de novo na revisão): 53 textos do protótipo + 6 das estações de ajuste, contra as dez travas existentes** (`semPromessaDeResultado`, `semGarantia`, `semPromessaDeSuporte`, `semMensalidadeDoAtendente`, `semPromessaDeDesconto`, `semNegarSerIA`, `semPromessaDeRecado`, `semPrecoNoTexto` e `semPrecoComMarca`, `semPromessaDePagamento`, `textoProibido`): **0 falso positivo em todas**. (A 1ª medição desta sessão já incluía `semPrecoNoTexto` e `textoProibido`, que o revisor achou que faltavam; só `semPromessaDePagamento` faltava, e agora foi medida: 0.) O detector de injeção (`pareceInjecao`, feito para texto do visitante) deu 1 em 53 e **não é usado** no plano. Recall das travas contra texto ruim: pegam "Dobra as vendas", "Aparece em primeiro no Google", "Garantia de resultado", "Suporte contínuo", "a partir de 2900"; **deixam passar** "Enche a agenda da clínica toda semana", "Entrega em dois dias úteis", "Vende sozinho e sem esforço", "Mais clientes todo mês", "Pagamento sem taxa" e "Faixa de preço pela tabela". Conclusão: as travas são a 1ª camada; o plano tem a lista própria, mais dura, e aqui um falso positivo só custa cair no plano padrão. Os dados de teste evitam "valor" e "preço" ("abate do valor da consulta" vira "abate da consulta"; "Faixa de preço pela tabela" vira "Medida de catálogo, com a tabela da fábrica").

### 2.4 O que o servidor faz com o plano (nunca lança, nunca devolve erro ao visitante)

`validarPlano(bruto, { nomeDoNegocio, regulado }) -> { ok: true, plano } | { ok: false, motivos: [código, ...] }`, em `api/_vendas/planta-esquema.mjs`, nesta ordem:

1. Forma (módulo comum): objeto simples, ≤ 8 KB, sem chave de protótipo nem fora do esquema (consulta a chave PRÓPRIA), tipos, listas fechadas, contagens por topologia, total de 8 ou 9.
2. **Normalização antes de qualquer comparação**: remove invisíveis e aplica `normalize('NFKC')` (a mesma de `semPrecoNoTexto`, que faz `INVISIVEIS` + NFKC), controles, `<` `>`, espaço simples. As travas rodam sobre o texto **já normalizado** e o teste é "a trava devolveu o mesmo texto normalizado" (senão `semPrecoNoTexto` acusaria troca por causa de um espaço sem quebra).
3. Comprimentos, `id` único e no formato, títulos distintos.
4. Cada texto: lista própria (2.3) + as **dez** travas acima. Qualquer uma que MUDE o texto rejeita o plano inteiro (a frase fixa da trava é longa e quebraria o desenho).

Falhou: o código devolve os erros ao modelo uma vez; falhou de novo, ou o modelo não chamou em dois turnos: **plano padrão** (2.5), com `origem: "padrao"`. Válido: `origem: "modelo"`.

### 2.5 Plano padrão por nicho

Dados fixos em `api/_vendas/planta-padrao.mjs`, escritos à mão (skill `voz-humana`) e passando pelo mesmo validador. Chave pelo texto de `negocio.segmento` e `negocio.descricao` normalizado (`paraBusca`); ambíguo ou desconhecido cai em `generico` (precisão antes de alcance). Oito planos [A]:

| Chave | Exemplos de negócio | Topologia |
|---|---|---|
| `saude_agenda` | clínica, consultório, estética, psicologia (nichos de `nichoRegulado`) | laço |
| `servico_agenda` | salão, barbearia, estúdio, personal, pet | laço |
| `servico_orcamento` | reforma, marcenaria, serralheria, instalação, limpeza | bifurca |
| `industria_b2b` | indústria, atacado, distribuidora, embalagens | bifurca |
| `loja_online` | moda, varejo, produtos, e-commerce | espinha |
| `alimentacao` | restaurante, confeitaria, delivery | espinha |
| `educacao` | cursos, escola, aulas | laço |
| `generico` | qualquer outro ou ambíguo (advocacia é regulada: entra por `nichoRegulado` e usa o `generico` escrito dentro das regras de regulado) | laço |

### 2.6 Onde o plano mora e o que o `estado` mostra

No `briefing` (jsonb, até 64 KB), **sem migration**: `briefing.planta = { v: 1, versao, origem, motivos: [códigos], tentativas, n_mensagens, plano }`, mais `briefing.leitura` (seção 3) e `briefing.planta_pedidos` (quantas vezes o `proximoPasso` pediu sem plano). Só a ferramenta (depois do validador) escreve nessas chaves: `atualizar_briefing` descarta chave desconhecida (`limparAtualizacao`) e `mesclar` não é usada para elas. Uma constante `PLANTA_CHAVES = ['planta', 'leitura', 'planta_pedidos']` é a única lista do que sair de circulação.

**O `estado` (`api/_vendas/fluxo.mjs`, ~348-354) devolve `conversa.briefing` inteiro hoje.** Regra nova, com flag ligada ou não:

1. `estado` **apaga** `PLANTA_CHAVES` de `conversa.briefing` **sempre**. Plano gravado + flag desligada ⇒ nem `planta` nem `conversa.briefing.planta` aparecem (teste). É o que torna "flag desligada = resposta idêntica à de hoje" verdadeiro.
2. Com a flag ligada, devolve ao lado do `painel`: `planta: { versao, origem, n_mensagens, plano }` **revalidada** a cada leitura (se o validador ficar mais duro amanhã, um plano antigo guardado sai como plano padrão), `leitura` revalidada, e `planta_editavel = precoAberto(etapa, pedido.status) && flag`. `motivos` e `tentativas` ficam no banco e **não** vão para a tela.

**O que o modelo e os outros consumidores veem:**
- `estadoParaModelo` (`api/_vendas/agente.mjs`, hoje `JSON.stringify(briefing)` inteiro no bloco "BRIEFING DO VISITANTE") serializa o briefing **sem** `PLANTA_CHAVES`. A versão compacta (ids, tipo e título, uns 400 caracteres) vai **dentro do bloco BRIEFING** (que é dado), nunca no bloco ESTADO (que é do código e tem autoridade). Teste: o contexto não contém nenhuma `frase` do plano gravado.
- O gerador das três direções recebe o briefing por **`briefingParaGeracao(b)`**, função nova em `api/_vendas/gerador.mjs` que tira `PLANTA_CHAVES`. `briefingDelimitado` é genérica e também embrulha outros objetos (`scripts/entregas-lib.mjs:232`, `scripts/direcoes.mjs:239`), por isso **não muda**; `gerarDirecao` (~linha 44) e `scripts/direcoes.mjs:216` passam a chamar `briefingParaGeracao`.
- `briefingSemProibidos` continua valendo; nas etapas de só dúvidas o briefing não muda (já é assim no banco).

## 3. O gráfico de leitura: radar "Como lemos o seu caso"

### 3.1 O que ele é (e o que não é)

O radar mostra **o que a pessoa disse** sobre cinco assuntos, não uma nota do negócio. Um eixo baixo quer dizer "ela ainda não falou disso", nunca "isso é pouco no negócio dela". Muda a cada resposta, como na referência. Sem número, porcentagem, comparação ou promessa.

### 3.2 Eixos

Os da foto de referência, fixados pelo dono em 04/11 [D], relidos como leitura (rótulos fixos escritos pelo código):

| Eixo | O que o Zero procura no que a pessoa disse |
|---|---|
| Volume | quanta procura ou movimento ela disse ter |
| Repetição | tarefas e perguntas que se repetem |
| Urgência | pressa que ela mostrou |
| Depende de pessoas | quanto do atendimento hoje depende de alguém estar ali |
| Informação espalhada | onde estão os dados dela (caderno, mensagens, planilhas, cabeça) |

Três níveis, em palavras: **"não falou"**, **"comentou"**, **"deixou claro"**; no desenho, raio 0,15 / 0,5 / 0,85 (o mínimo não é zero). Acessível: uma lista `<dl>` com eixo, nível por extenso e evidência. Plano B registrado (não escolhido): eixos de "cobertura" calculados só do briefing, se a rodada real mostrar o modelo inflando níveis.

### 3.3 Como o modelo preenche

Ferramenta `ler_caso` (pequena; chamável a cada turno com informação nova):

```
leitura = { eixos: [ { eixo: "volume"|"repeticao"|"urgencia"|"pessoas"|"informacao",
                        nivel: "nao_falou"|"comentou"|"deixou_claro",
                        evidencia?: texto <= 60 } x 5 ] }
```

A descrição manda: nível só pelo que a PESSOA escreveu; "deixou claro" só com as palavras dela; evidência é trecho curto em palavras da pessoa; sem número; na dúvida "comentou"; sem nada, "nao_falou" e sem evidência.

### 3.4 Como o código valida (só rebaixa, nunca eleva)

1. Forma (módulo comum): exatamente os 5 eixos, sem repetir, `nivel` na lista, `evidencia` ≤ 60.
2. **Evidência ancorada, na GRAVAÇÃO**: ao menos metade das palavras de conteúdo (4 letras ou mais, normalizadas) tem de aparecer nas mensagens do VISITANTE. Senão a evidência é descartada e o nível cai para no máximo "comentou".
3. Mesma lista dura e as mesmas travas da seção 2.3/2.4. Número na evidência: descartado (o radar não repete número, mesmo que a pessoa o tenha dito).
4. `deixou_claro` sem evidência válida cai para `comentou`; `comentou` sem palavra da pessoa que o sustente cai para `nao_falou`. Em nicho regulado, evidência com depoimento ou "antes e depois" é descartada.
5. **Na LEITURA do estado** a revalidação confere forma e texto proibido, mas **não** reaplica a âncora: a retenção apaga as mensagens depois de um tempo, e sem mensagens tudo seria rebaixado a "não falou". A leitura guardada vale como gravada.

### 3.5 Desenho

SVG de pentágono com 3 anéis, 5 raios e polígono de 1,5 px em ciano com preenchimento chapado de 10% (cor lisa; se o dono achar "mole", fica só o contorno). Rótulos em HTML ao redor, até 2 linhas, mínimo de 11 px. Ao mudar, os vértices se movem em 450 ms **interpolados pelo laço único `B.add`** (`window.BEYON.add`; **sem `requestAnimationFrame` próprio**, regra 1 do `CLAUDE.md`); sem `BEYON` ou em movimento reduzido, salta. Altura fixa: o módulo do radar tem a própria `alturaRadar(largura)` (300 px em 390), independente da função da planta. **Classes do radar com o prefixo `plr-`** (o `plv-` é da planta, seção 1.5); a altura do desenho e da lista é reservada por CSS (`css/orcamento-radar.css`), e a classe `plr-vaga` reserva o espaço antes de o JS montar. A lista `<dl>` fica sempre visível com reserva de pior caso; as decisões em aberto para a ligação (reduzir a reserva ou recolher a lista mantendo o leitor de tela, região viva, vaga sem radar, `desmontar` na troca de tela) estão no plano, "Decisões do 2d-front".

**Lugar [A]: na coluna do painel, ABAIXO do cartão de investimento** (e não acima, onde empurraria o preço). A coluna é fixa na rolagem e, com as peças, rola por dentro (`css/orcamento-painel.css`). Critério de CLS: delta de CLS da página ≤ 0,01 com o radar entrando, **e** o cartão de investimento não sai da área visível do painel em 1.280 x 800.

## 4. Honestidade, segurança, acessibilidade, desempenho

### 4.1 Honestidade

- A planta descreve o que "um site bem estruturado pode fazer", não o que está no pacote: por isso as duas notas fixas (1.5), a proibição de número/preço/prazo/resultado e a regra de que escopo e valor continuam vindo só do motor de preço e da tela de escopo.
- Lembrete automático, cobrança de sinal ou carrinho podem estar fora do que a tabela entrega hoje. Na 1ª versão a salvaguarda é a nota; uma etiqueta "combinar no orçamento" por tipo (`fora_do_automatico` da tabela ativa) fica para uma 2ª rodada [A].
- O Zero continua sendo uma IA que não nega ser IA (`semNegarSerIA` roda nos textos).
- Nicho regulado: sem depoimento nem "antes e depois" e sem promessa de resultado; o `saude_agenda` é escrito dentro disso.

### 4.2 Segurança

- **XSS:** todo texto do modelo entra por `textContent`; `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` e `new Function` ficam proibidos nos módulos da planta, **com teste que lê o código e falha**. O SVG nasce de `createElementNS` com atributos que só recebem números finitos, constantes e `d` gerado pelo código; o `id` só vai para `data-id` no formato certo e nunca para seletor sem `CSS.escape`.
- A tela valida a FORMA de novo pelo mesmo módulo do servidor (`js/orcamento-planta-forma.js`).
- **Carregador sob demanda com lista CONSTANTE de URLs** (`js/planta-pecas.js`, `planta-layout.js`...), nunca `src` montado com dado do estado.
- CSP: nada de `style=""` nem `setAttribute('style')`.
- O que o modelo lê já vem sem telefone, e-mail ou documento (`redigir`), e o validador rejeita telefone, e-mail e URL na saída.
- Custo: 1.000 a 1.300 tokens por plano, teto de 4 versões, e as travas de custo existentes (`TETOS.conversa_usd`, `TETOS.dia_usd`) valem. Sem endpoint novo: a planta viaja no `estado`.
- **Métrica que o agente consegue observar:** o log do Worker é da Cloudflare, fora do alcance do agente. Por isso `briefing.planta` guarda `origem`, `motivos` (códigos, sem texto) e `tentativas`, e a medição é feita **pelo banco de staging ou pela fila do painel do dono** (que já lê o briefing). Também sai uma linha de log JSON (`api/vendas.mjs`) para quem tiver acesso. **Não há evento novo no banco:** `app.vendas_registrar_evento` só aceita `ia_falhou` e `tentativa_bloqueada` (`supabase/migrations/20261007120100_vendas_funcoes.sql`).

### 4.3 Acessibilidade

- O texto é HTML: a lista `<ol>` na ordem da luz (`ord`) é o conteúdo; o SVG é `aria-hidden`; ícones e rotas são decorativos (o traço aceso mantém ≥ 3:1 mesmo assim).
- `role="status"` anuncia só no fim ("Planta pronta, com 9 etapas."); a legenda animada é `aria-hidden`.
- `prefers-reduced-motion: reduce` e `html.menos-movimento`: quadro final imediato, sem ondas, pulso nem emaranhado; ouro estático.
- Botões ≥ 44 px, foco visível, tudo por teclado, ordem de tabulação botões depois da lista. Contraste pelos tokens (`--t1`, `--t2`); ouro no preto 12,7:1.

### 4.4 Desempenho

- **CLS (pendência nº 1; o protótipo media 0,17 a 0,36). Meta única: delta de CLS (com planta menos sem planta) ≤ 0,01** nos 3 nichos, em 390, 320 e 1.280 px, no cenário real da conversa (não só no laboratório). Causas prováveis a CONFIRMAR no passo 0 (hipóteses, não fato): altura da área definida por JS depois de medir a largura; bloco que sai de `hidden`; legenda de altura variável.
- **Como:** (1) altura da área por função pura `alturaReservada(largura)` (paisagem fixa em 456 px; retrato por largura com 9 etapas), o desenho se acomoda a ela; (2) caixas e rótulos com posição absoluta dentro de área de tamanho fixo (troca de fonte não muda o layout); (3) legenda com `min-height` de 4 linhas; (4) **regra de inserção:** deslocamento fora da área visível não conta no CLS e a faixa entra abaixo da mesa. O módulo só tira a faixa de `hidden` quando ela está fora da área visível (a posição dela abaixo da dobra, medida por IntersectionObserver); se estiver à vista, **espera**: o botão do chat (1.2) fica disponível e a faixa é inserida no toque nele ou no próximo gesto da pessoa (clique, toque, tecla: o navegador não conta deslocamento dentro de 500 ms de uma ação dela). **Não** existe área vazia reservada com texto de espera: seria tela de carregamento com outra roupa.
- **CPU no celular:** sem GSAP nesta página (não o carrega; +70 KB à toa). Web Animations API (`Element.animate`) para o desenho finito das rotas e para o pulso em `transform`; sem a API, quadro final. No máximo 2 rotas animadas ao mesmo tempo; nada de `getPointAtLength` em laço; `getTotalLength` uma vez por rota. Metas com estrangulamento de CPU de 4x: montagem ≤ 120 ms, nenhuma tarefa longa (> 50 ms) na entrada, DOM do quadro ≤ 450 nós, TBT da página com a planta no máximo +50 ms sobre sem ela. O headless desenha por software: serve para comparar.
- **Bytes:** JS da planta **≤ 20 KB comprimido com `gzip -9`** (conservador: a Cloudflare serve brotli, que dá menos; o PR 2c reporta os dois), carregado sob demanda quando o 1º plano chega.
- **ES5 sintático:** decisão desta frente (seção 0); um teste lê os arquivos e recusa a sintaxe nova.

## 5. NÃO-objetivos

- Não é cenário ilustrado do cliente (fábrica, engrenagens, pilha de documentos): a spec de 04/11 desse "cenário em 3 zonas" foi superada pelo dono; os quadros "O cenário / O que trava / Onde quer chegar" **não** entram agora.
- Não promete resultado, não mostra número, preço, prazo, nome de terceiro; não substitui escopo nem preço do motor.
- Não é editor (sem arrastar caixas); ajusta-se pela conversa.
- Sem WebGL, canvas, GSAP nesta página, som novo, biblioteca nova, endpoint novo, tabela nova, migration nova.
- Sem ajuste para quem já confirmou o pedido (briefing congelado).
- Não gera ícone por IA nem aceita SVG do modelo.
- Não é a vitrine pública de Sites/Início; é só a conversa de orçamento.

## 6. Riscos e perguntas

| Risco | Gravidade | Resposta |
|---|---|---|
| A planta insinua função que o pacote não entrega (lembrete, sinal, carrinho) | Média | Nota fixa; proibição de número/preço; etiqueta por tipo numa 2ª rodada |
| O modelo erra o formato ou não chama, e vira quase sempre plano padrão | Média | Esquema (talvez `strict`) e exemplos na descrição, uma volta de correção, o servidor grava o padrão em 2 turnos; medir `origem` e `motivos` no banco; se > 30% padrão na rodada real 8, simplificar o esquema |
| Layout paisagem com 8 a 9 estações não cabe | Alta, conhecida | Duas fileiras para laço e espinha, teste de geometria em 7 larguras |
| CLS volta a passar da meta | Alta | Passo 0 mede as causas, função de altura, regra de inserção, teste automático com limite 0,01 |
| A faixa afasta o preço do botão do formulário | Média | O 2c mede as duas posições e reporta; teto de altura no celular |
| Falso positivo da lista dura corta planos bons | Baixa | Custo é cair no padrão; contar `motivos` e afinar |
| Briefing cresce (64 KB) | Baixa | Plano ≤ 8 KB, 1 plano e 1 leitura por conversa |
| `planta` vaza para o navegador com a flag desligada, ou para o modelo/gerador | Alta se esquecida | `PLANTA_CHAVES` apagada do `estado` sempre; fora do contexto do modelo; `briefingParaGeracao`; testes |
| Turno da planta estoura o tempo (90 s do navegador) | Média | `MAX_ITERACOES` fica em 4, padrão no estouro, meta ≤ 60 s na rodada real 8 |
| Prompt no limite do teste | Resolvido | Nada entra nele; limite do teste é de 27.000 (asserção, não da API) |
| Radar lido como "nota do negócio" | Média | Níveis em palavras, título, legenda "é o que você contou, não uma nota" |
| Repositório público | Média | Nenhum nome de cliente real, marca de terceiro, segredo ou estratégia em dados de teste; a lista de plataformas bloqueadas usa só nomes que o código já cita |

**Perguntas que de fato bloqueiam o dono: nenhuma.** Decisões [A] para ele revisar quando acordar, todas com padrão escolhido: (1) faixa larga entre a conversa e o formulário, medindo a distância do preço ao botão; (2) no celular, legenda grudada na base da faixa e botão "Ver a planta" no chat; (3) as notas de honestidade; (4) eixos do radar como leitura do que ele disse; (5) laço e espinha em duas fileiras no computador; (6) radar abaixo do cartão de investimento; (7) a planta aparece no turno seguinte ao da primeira estimativa.

## Anexo A. Catálogo de tipos (v1)

Do protótipo (19 de etapa): `pagina`, `conversa`, `agenda`, `lembrete`, `retoma`, `sinal`, `vitrine`, `cabide`, `produto`, `guia`, `carrinho`, `pagamento`, `caixa`, `tabela`, `briefing`, `amostra`, `proposta`, `acabamento`, `aviso`. Novos, a desenhar no PR 2b (9): `formulario`, `mapa`, `galeria`, `catalogo`, `cardapio`, `aula`, `documento`, `confirmacao`, `mensagem`. Total: **28 tipos de etapa + `chegada` (o ícone da caixa de chegada, só por esse papel, nunca como etapa) = 29 desenhos**. O teste de catálogo confere `chegada` + as 28, um a um, entre `js/orcamento-planta-forma.js` e `js/planta-pecas.js`. Cada ícone: grade de 40 x 40, só traço, destaque em traço mais claro, sem preenchimento nem desfoque.

## Anexo B. Exemplo mínimo de plano válido (laço, clínica, 8 caixas)

```json
{ "topologia": "laco",
  "chegada": { "origens": ["busca","mapa","indicacao"], "titulo": "Busca, mapa e indicação",
               "frase": "A pessoa chega pela busca, pelo mapa ou porque alguém indicou." },
  "etapas": [
    { "id": "pagina", "tipo": "pagina", "verbo": "Recebe", "titulo": "Uma página para cada tratamento", "frase": "Cai na página do tratamento que procurava, com a resposta que quer ler primeiro." },
    { "id": "conversa", "tipo": "conversa", "verbo": "Conduz", "decisao": true, "titulo": "Pergunta o que incomoda e a urgência", "frase": "A conversa entende o que incomoda e quão urgente é, sem formulário." },
    { "id": "horario", "tipo": "agenda", "verbo": "Agenda", "titulo": "Escolhe o horário da avaliação", "frase": "Mostra só os horários livres e a pessoa escolhe um ali mesmo." },
    { "id": "confirma", "tipo": "confirmacao", "verbo": "Confirma", "titulo": "Confirmação na hora da marcação", "frase": "Assim que marca, a pessoa recebe a confirmação com endereço e como chegar." },
    { "id": "vespera", "tipo": "lembrete", "verbo": "Lembra", "titulo": "Lembrete na véspera", "frase": "Na véspera chega o lembrete, para a pessoa não esquecer a hora." },
    { "id": "pos", "tipo": "mensagem", "verbo": "Responde", "titulo": "Dúvidas depois da consulta", "frase": "Quem ficou com dúvida volta à conversa e encontra a resposta." },
    { "id": "revisao", "tipo": "retoma", "verbo": "Reativa", "retorno": true, "titulo": "Volta sozinho na hora da revisão", "frase": "Chegou a época da revisão: o site chama a pessoa de volta." } ],
  "fim": { "titulo": "Avaliação marcada", "frase": "A avaliação entra na agenda da clínica sem ninguém ter atendido." },
  "fecho": "A pessoa chegou, foi entendida, marcou e vai ser lembrada. A clínica entra só no dia.",
  "rotulo_retorno": "o site continua" }
```

(O exemplo usa `confirmacao` e `mensagem`, tipos novos. A frase "sem ninguém ter atendido" é a do protótipo e precisa de olho da `voz-humana`: afirma automação total, e a nota fixa cobre.)
