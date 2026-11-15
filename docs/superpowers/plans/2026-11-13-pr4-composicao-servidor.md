# Plano: PR 4, composição: servidor (mapa do caso v3)

Spec: `docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md` §7 (7.1 a 7.5), §8, §10, Anexos A e B. Laboratório: `docs/lab-estruturas.js`
(PR #149, as decisões abertas estão na descrição dele). Nível 3. Branch nova, criada da `main` **depois do merge do PR 3** (pedido na conversa),
que mexe em `js/orcamento*.js`, `api/_vendas`, `docs/e2e-*` e `supabase/migrations`.

Escrito em 2026-11-13, antes do PR 3 entrar: as linhas citadas são as da `main` em `e908d27` e devem ser conferidas de novo depois do rebase.

## 1. Objetivo e fora de escopo

**Objetivo.** O servidor passa a pedir, validar, gravar e devolver o plano **v3** (5 estruturas, nós por papel, setas com rótulo), sempre atrás
de `BZ_PLANTA`:
- o prompt da escolha da estrutura (guia do §7.1, "nunca sortear");
- os 8 planos padrão v3, escolhidos pelo que se sabe do caso;
- `MAX_VERSOES` de 4 para 6;
- o v2 continua lido, e o cliente de hoje ignora o v3 sem travar a conversa.

**Fora de escopo (PR 5):** o desenho e a animação por estrutura; o esboço sem tracejado; o "Ficou certo?" e o "Quero ajustar algo" na tela; os
ícones novos de cena e de origem; trocar `MODULOS` em `js/orcamento-planta.js:13`; o teto de bytes do desenho novo.
Também fora: o JEV (PR 6), a rodada com a IA real (§9), qualquer migration (o briefing é `jsonb` com esquema no código).

**A produção fica coerente:** só muda com a flag. Desligada, o `estado` e o Zero ficam byte a byte como hoje (`planta-estado.test.mjs` prova).

## 2. Decisões que o PR fecha (vão para a spec como "Anexo C")

1. **O objetivo é o campo `objetivo`, nunca um nó.** As setas o chamam pelo id reservado `"objetivo"`. Contagem: **2 a 6 nós mais o objetivo**
   (a leitura do "3 a 7 contando o objetivo" do §7.3). `objetivo` só aparece como `de` no `ciclo` (a saída para o nó de volta), no máximo uma vez.

2. **No máximo 5 camadas, com o objetivo, e 2 nós por camada** (os 440 px do celular, medidos no #149). O conflito com "origens ≤ 3" no `mapa`:

   | Opção | Prós | Contras |
   |---|---|---|
   | **A. No máximo 2 nós de origem; `hoje.origens` segue até 3** (a 3ª aparece na linha "Hoje", que a tela monta pelo código) | 1 código por nó; a regra de 2 por camada basta; nada do que a pessoa disse se perde; nenhum desenho novo | No `mapa`, a 3ª origem não vira nó |
   | B. Um nó de origem com `origens: [≤ 2]` | Cabem 3 ou 4 origens em nós | Campo e desenho novos; mais bytes no PR 5; mais regras |
   | C. 3 nós na camada 0 só no `mapa` | Fiel à letra do §7.1 | Não cabe em 390 px; quebra a regra comum de camadas |

   **Recomendado: A**, com três regras: nó de origem não recebe seta (`seta_para_origem`, o que o põe sempre na camada 0); no máximo 2 nós de
   origem (`origens_nos`); o código de cada nó de origem está em `hoje.origens` (`origem_fora_do_hoje`, zero invenção).

3. **Regras de desenho** (as do `validar` do laboratório, `docs/lab-estruturas.js`):
   - gerais: seta de volta só no `ciclo`, e lá exatamente 1; seta que pula camada só por faixa vazia; nenhum nó solto e todo nó alcança o
     objetivo (`nao_chega`); pelo menos uma seta chega ao objetivo; sem seta repetida nem para o próprio nó;
   - por estrutura: `ramos` exige um nó com exatamente 2 setas diretas saindo; `antes_depois` exige `trava` e `site` ou `acao`; `caminho` não se
     divide nem se junta; `mapa` exige ao menos 4 nós, com `trava` e `origem` ("várias forças").

4. **De-para das origens.** Códigos v3 do §7.3: `instagram, whatsapp, google_busca, google_mapa, indicacao, passa_na_frente, facebook, tiktok,
   site_atual, outro`.
   - `ORIGEM_DA_SUGESTAO` (os toques de `js/orcamento-rotulos.js:31-36`): `instagram`, `whatsapp`, `indicacao` e `passa_na_frente` iguais;
     `google` vira **`google_busca`** ("Me acham no Google"); `google_mapa` só quando a pessoa escreveu mapa, Maps ou endereço.
   - **Não renomear** `google` em `orcamento-rotulos.js`: é contrato do `respostas` (PR 1).
   - `ORIGEM_DO_V2` (para o esboço do PR 5, `js/planta-cresce.js` usa as origens v2): `busca` → `google_busca`, `mapa` → `google_mapa`,
     `indicacao` igual; `rede`, `anuncio`, `direto`, `email` → `outro` (ambíguos: não se inventa canal).
   - No cliente, código desconhecido vira `outro` (já no laboratório; vai no PR 5).

5. **"Preço" no `hoje`.** O exemplo da spec, "respondo preço e horário na mão", cai na regra `preco` (`api/_vendas/planta-textos.mjs:89`). E
   **"Respondo preço e horário na mão" é um rótulo que a pessoa toca** (`js/orcamento-rotulos.js:37`). Duas saídas: (a) o prompt evita a palavra;
   (b) `hoje.texto` e `hoje.trava` aceitam "preço"/"valor" **só como o assunto da pergunta**.
   **Recomendado: (b).** O "hoje" tem de ser reconhecível no que ela disse (§9); a (a) obriga o modelo a reescrever as palavras dela, e o padrão
   nem poderia citar o rótulo tocado. Como "Hoje:" dá ao texto a autoridade da fala dela, a abertura é estreita: uma máscara aplicada antes de
   procurar as raízes, só depois de verbo de pergunta/resposta e antes de conector:

   ```
   PRECO_COMO_DUVIDA = /\b(?:pergunt\w*|respond\w*|explic\w*|pass\w*|repet\w*|duvidas? (?:de|sobre)) (?:o |a |de |sobre )?(?:precos?|valor(?:es)?)(?= (?:e|no|na|nos|nas|pelo|pela|por|um|toda|todo|sempre|de novo)\b|$)/
   ```

   Mais "quanto custa" depois de `pergunt\w*`. Todo o resto da raiz `preco` continua recusado (barato, grátis, desconto, custa solto, parcela,
   reais, promoção, "preço baixo", "preço de custo"); dígito, R$ e % seguem nas outras regras; as dez travas rodam igual. O prompt manda nunca pôr
   valor, juízo de preço nem comparação. **Pede o sim do dono** (é texto com a autoridade da fala da pessoa).

6. **As outras folgas do `hoje`:** opção nova `campo: 'hoje'` em `textoDoPlanoPermitido`.
   - prazo do cotidiano mascarado só para a lista fechada `PRAZO_DO_COTIDIANO` ("na hora", "horas", "dias", "de madrugada", "a qualquer hora",
     "todo dia", "cada dia", "toda semana"); "imediato", "rápido", "prazo", "minutos", "tempo real", "amanhã", "hoje mesmo" continuam recusados.
     (Medido: a trava de prazo de hoje não pega "hoje", "agora" nem "à noite" sozinhos; pega "na hora", "dias", "de madrugada", "todo dia".)
   - `negar_ia` vira `NEGAR_IA_FORTE` (`planta-textos.mjs:115`): passa "eu respondo"; "sou humano" e "não sou robô" seguem recusados.
   - continuam valendo: marca, promessa (inclusive "enche/lota"), garantia, resultado, número, as dez travas, o idioma a 0,15.

7. **`hoje` é opcional na forma e obrigatório no prompt.** O padrão só põe `hoje.texto`/`trava` a partir de rótulo tocado; sem nada conhecido,
   vai só com origens ou fica de fora. Quando há `hoje`, ao menos um de origens, texto ou trava vem preenchido.

8. **`ajustado` exige um v3 anterior** (`ajustado_sem_plano`), no máximo 2 nós. Um v3 que nasce de um v2 não leva "Ajustado".

## 3. Arquivos e o que muda

| Arquivo | Mudança |
|---|---|
| `js/orcamento-mapa-forma.js` (**novo**, UMD ES5 como `orcamento-planta-forma.js`, `window.BZMapaForma`) | Listas `ESTRUTURAS`, `PAPEIS`, `ICONES` (os 29 `TIPOS`), `ORIGENS_MAPA`, `ORIGEM_DA_SUGESTAO`, `ORIGEM_DO_V2`; `LIMITES_MAPA`; `ID_NO = /^[a-z0-9_]{1,12}$/` com ids reservados (`objetivo`, `hoje`, `__proto__`, `constructor`, `prototype`, `proto`); `camadas()`/`faixas()` do laboratório; `validarFormaMapa(bruto)` (nunca lança; tabelas com chave própria) |
| `api/_vendas/planta-esquema.mjs` | `validarPlano` escolhe por chave: `estrutura` = v3, `topologia` = v2, as duas = `versao`. Opção `versoes` (`['v3']` vindo do modelo; as duas na leitura). Textos v3 normalizados e conferidos; títulos distintos; `redigir` (texto que a redação muda é recusado com `redigido`, sem corte); `textoDoPlanoPermitido` com `campo:'hoje'` no `hoje`; o v3 no máximo passa em `cabe()` |
| `api/_vendas/planta-textos.mjs` | Opção `campo: 'hoje'` (§2.5, §2.6); exportar `PRECO_COMO_DUVIDA` e `PRAZO_DO_COTIDIANO`. Sem a opção, nada muda |
| `api/_vendas/planta.mjs` | `ESQUEMA_PLANTA` v3; `DESCRICAO` v3; `EXEMPLOS` = 3 padrões v3 de estruturas diferentes; `MAX_VERSOES = 6`; códigos novos em `REGRA`; `lerCaminho` para `nos[i]`/`setas[i]` (pelo índice, nunca pelo id); `resolverDesenho` com `versoes:['v3']`, a regra do `ajustado` e o padrão do caso; `padraoDoCaso(briefing)` em `fecharTurno` e `montarPlanta`; `plantaParaModelo` v3; teto de bytes na gravação. O registro segue `v: 1` (formato do registro, não do plano) |
| `api/_vendas/planta-padrao.mjs` | 8 bases v3, `TRAVA_V3`, `NO_DE_ORIGEM`; `oQueSeSabe(briefing)` → `{ origens, trava }`; `planoPadrao(chave, saber)` sem acaso; os `PLANOS` v2 ficam como `planoPadraoV2` (leitura e teste) |
| `api/_ia/simulado.mjs` | O dublê da planta monta v3 |
| `js/orcamento-planta.js` | `leve()`: plano sem `topologia` conhecida = versão desconhecida → some **sem aviso `[beyon]`** e dispara `bz:planta-pronta` uma vez por versão (o valor não espera os 20 s de `PLANTA_MAX_MS`), sem tocar em `orcamento.js` |
| `api/_vendas/consultor.mjs` | Só o fim do `PREFIXO_PLANTA`: "desenhou o site em planta" → "montou o mapa do caso". O começo fica (o simulado o procura) |
| `docs/zero/gerar.mjs` + `docs/zero/prompt-efetivo.txt` | Texto da ferramenta ("6 versões", "nós", "setas"); gravar de novo (`zero.test.mjs` confere) |
| `docs/avaliacao/planta.mjs` | Métrica `estrutura` ao lado de `topologia` |
| `docs/testes/mutacao.mjs` | Sabotagens novas (§10) e o `de:` das que mudam |
| spec | Anexo C (as decisões do §2) |

`agente.mjs`, `fluxo.mjs` e `config.mjs` **não mudam**: a releitura (`fluxo.mjs:447`), o portão da ferramenta com preço aberto (`agente.mjs`) e a
reserva de custo já servem.

**Por que um módulo de forma novo, e não o de hoje (desvio da letra do §7.3):** medido, a forma de hoje mais os 3 módulos do desenho somam
29.166 bytes com gzip -9, para um teto de 29.300 (`planta-bytes.test.mjs:27-29`). Sobram 134 bytes; o v3 dentro de `orcamento-planta-forma.js`
estoura o teto. O PR 5 traz o teto do desenho novo, com o número, e decide se a forma v2 sai.

## 4. O esquema v3

**JSON Schema da ferramenta** (sem `minLength`/`maxLength`/`minItems`/`pattern`, como o de hoje; `strict` desligado):

```js
const T = { type: 'string' };
{ type: 'object', additionalProperties: false, required: ['estrutura', 'hoje', 'nos', 'setas', 'objetivo', 'fecho'], properties: {
  estrutura: { type: 'string', enum: ESTRUTURAS },                       // caminho, antes_depois, ramos, ciclo, mapa
  hoje: { type: 'object', additionalProperties: false, required: ['origens'], properties: {
    origens: { type: 'array', items: { type: 'string', enum: ORIGENS_MAPA } }, texto: T, trava: T } },
  nos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'papel', 'icone', 'titulo', 'frase'], properties: {
    id: T, papel: { type: 'string', enum: PAPEIS },                      // hoje, trava, origem, site, conversa, acao, volta, ajustado
    icone: { type: 'string', enum: ICONES }, origem: { type: 'string', enum: ORIGENS_MAPA }, titulo: T, frase: T } } },
  setas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['de', 'para', 'rotulo'], properties: { de: T, para: T, rotulo: T } } },
  objetivo: { type: 'object', additionalProperties: false, required: ['titulo', 'frase'], properties: { titulo: T, frase: T } },
  fecho: T } }
```

**`LIMITES_MAPA`** (conferidos contra os 15 planos e o caso de limites do laboratório):

| Campo | Limite |
|---|---|
| título (nó e objetivo) | 3 a 28 |
| frase (nó e objetivo) | 20 a 60 |
| rótulo da seta | 3 a 24 |
| `hoje.texto`, `hoje.trava` | 10 a 60 |
| `fecho` | 20 a 80 |
| nós / setas | 2 a 6 / 1 a 9 |
| `hoje.origens` | 0 a 3, sem repetir |
| camadas / nós por camada | até 5 / até 2 |
| nós de origem / nós `ajustado` | até 2 / até 2 |
| plano | até 6.144 bytes |

**Ordem das regras na forma:** tipos e chaves → listas e ids → `origem` só no papel `origem` (e lá obrigatória) → referências das setas →
contagens → grafo (`camadas`/`faixas` do laboratório: volta, camadas, faixa livre, pulo, regras por estrutura). O servidor acrescenta:
normalização, títulos distintos, `redigir`, a camada de texto e o `ajustado` (que depende da versão anterior).

**Códigos de erro novos** (cada um com frase em `REGRA`, sem nunca repetir texto do modelo):
- chaves e listas: `estrutura`, `versao`, `versao_antiga` ("escreva no formato novo, com estrutura, nos e setas"), `nos_qtd`, `setas_qtd`,
  `papel`, `icone`, `origem`, `origem_fora_do_hoje`, `origens_nos`;
- ids e setas: `id_no`, `seta_ref`, `seta_propria`, `seta_repetida`, `seta_para_origem`, `objetivo_sai`;
- grafo: `no_solto`, `nao_chega`, `sem_objetivo`, `camadas`, `camada_cheia`, `pulo`, `volta`;
- por estrutura: `ramos`, `antes_depois`, `caminho_divide`, `mapa`;
- ajuste: `ajustado`, `ajustado_sem_plano`;
- partes e texto: `hoje`, `hoje_vazio`, `objetivo`, `no`, `seta`, `redigido`, `hoje_curto`, `hoje_longo`, `fecho_longo`.

Ficam os de hoje: `titulo_*`, `frase_*`, `rotulo`, `id_reservado`, `id_repetido`, `titulo_repetido`, `grande` e as travas.

## 5. Como o v2 continua lido

- A versão vem da chave (`estrutura` × `topologia`), nunca do `planta.v`.
- `montarPlanta` revalida as duas a cada leitura (forma e lista dura, `travas:false`), com o mesmo cache. Um v2 gravado continua desenhando no
  cliente de hoje; um plano gravado inválido vira o padrão v3.
- O ajuste de um v2 gera um v3 inteiro: `resolverDesenho` só aceita v3 do modelo (um v2 dá `versao_antiga`). A ferramenta continua uma só
  (`desenhar_planta`), pelo cache do prompt.
- O cliente ignora a versão que não conhece (`leve()`, §3): a conversa segue e o valor sai na hora.
- A sessão principal pede ao dono para **não promover entre o PR 4 e o PR 5**.

## 6. O prompt da escolha e o `plantaParaModelo`

**`DESCRICAO` v3** (vai ao dono antes do merge, pela sessão principal: mudança de prompt aprovado, Anexo B):
- o que é: "Monta, logo abaixo da conversa, o mapa do caso desta pessoa: de onde ela chega, o que trava hoje, o que o site faz e onde ela quer
  chegar."
- a estrutura, pelo que a pessoa contou, na 1ª regra que valer:
  1. o ganho está na volta (recompra, retorno, revisão, mensalidade): `ciclo`;
  2. dois públicos ou dois serviços com caminhos diferentes: `ramos`;
  3. a dor é trabalho repetido ou perda fora de hora: `antes_depois`;
  4. várias forças ao mesmo tempo (duas origens ou mais, uma trava e um desejo): `mapa`;
  5. nos outros casos: `caminho`.
- **nunca sortear:** "Mesma história, mesma estrutura. Nunca escolha uma estrutura para variar nem copie a dos exemplos: eles mostram a forma,
  não o seu caso."
- `hoje`: origens só por código e só as que ela disse (Google sem mapa = `google_busca`); texto e trava com as palavras dela, sem marca; "preço"
  só como o que perguntam, nunca valor, juízo ou comparação; não escrever "Hoje" (a tela põe).
- ajuste: "mantenha os ids e o texto do que não mudou; o nó novo ou trocado leva o papel `ajustado` e entra ligado por uma seta com rótulo"; "se
  `planta_desenhada` tem `topologia`, é um desenho antigo: escreva o plano inteiro de novo, sem `ajustado`"; "até 6 versões".

**`plantaParaModelo` v3** (no bloco BRIEFING, como dado, nunca no ESTADO): `{ versao, origem, estrutura, origens, nos: [[id, papel, titulo]],
setas: [[de, para, rotulo]], objetivo: titulo }`. Corte: primeiro o rótulo das setas, depois as setas, nunca os nós. `COMPACTO_MAX` de 600 para
900; o teste prende o pior caso (6 nós, 9 setas). Sem frases, como hoje. v2: o compacto de hoje mais `topologia`.

## 7. Padrões v3, versões, custo e bytes

**`oQueSeSabe(briefing)`** (precisão antes de alcance, como `nichoDaPlanta`):
- origens: os rótulos de `R.SUGESTOES` achados como trecho exato em `situacao_atual.como_chegam` (como `respostas.mjs` grava), passados pelo
  `ORIGEM_DA_SUGESTAO`; palavras-chave no texto livre (instagram, insta, direct, whatsapp, zap, google, busca, mapa/maps, indica, boca a boca,
  passa na frente), com guarda de negação ("não/nunca" até 3 palavras antes); no máximo 3.
- trava: só o rótulo exato de uma sugestão `o_que_se_perde`. Texto livre da trava não é lido (não se inventa dor).

**As 8 bases** (sem nó `hoje`, `trava` nem `origem`): `saude_agenda` e `servico_agenda` = `ciclo`; `servico_orcamento`, `educacao` e
`loja_online` = `ramos`; `industria_b2b`, `alimentacao` e `generico` = `caminho`.

**A composição é sempre a mesma função de (nicho, origens, trava):** com origens, `hoje.origens` recebe os códigos e entra 1 nó de origem (2 nos
`ramos`), com texto de `NO_DE_ORIGEM` (10 entradas sem marca: "Vê o perfil", "Procura e acha", "Chega indicada"…); com trava, a estrutura vira
`antes_depois` (nós de `TRAVA_V3[código]`, `hoje.trava` = o rótulo tocado); com 2 origens ou mais e trava, `mapa`. As 5 estruturas ficam
alcançáveis, sem `Math.random` nem `Date`. Todo padrão passa no validador com `travas:true`, em todos os nichos, com e sem `regulado`.

**Versões.** `MAX_VERSOES` 4 → 6; a 7ª é recusada como a 5ª hoje. O ajuste só vale com o preço aberto (o portão de hoje).

**Custo.** Um turno de desenho reserva US$ 0,20; 6 versões = US$ 1,20 no pior caso, abaixo do teto de US$ 2 por conversa. O alarme de 80% não
muda de mecanismo. `zero.test.mjs` passa a calcular "24 turnos normais + 6 de desenho" com a descrição v3 no cache e prende: < 65% do teto da
conversa e no máximo +15% sobre hoje. Novo: `MAX_VERSOES * RESERVA_USD.conversa_planta <= TETOS.conversa_usd`.

**Bytes.** Plano v3 ≤ 6.144 bytes na forma; `gravarPlanta` recusa registro `planta` acima de 8.192 (motivo `grande`; o desenho anterior fica). O
briefing guarda só a versão atual: o teste "6 versões seguidas" prende o briefing depois da 6ª abaixo do da 1ª mais 8 KB. Os tetos de
`planta-bytes.test.mjs` não mudam (o módulo novo não entra na soma do desenho de hoje).

## 8. Ordem dos passos (cada um: teste visto vermelho → código → suíte da planta verde)

1. **Começo:** rebase na `main` com o PR 3; `npm run testar` e anotar a linha de base.
2. **Forma v3.** Vermelho: `planta-mapa-forma.test.mjs`: os 15 planos do laboratório e o caso `limites` passam; uma sabotagem por regra é
   recusada com o código certo (6 camadas, 3 na mesma camada, volta no `caminho`, pulo por cima de caixa, `__proto__` como id, `para`
   inexistente). Verde: `js/orcamento-mapa-forma.js` (e na lista do `planta-es5.test.mjs`).
3. **O `hoje`.** Vermelho: `planta-mapa-hoje.test.mjs`: os rótulos de trava e de origem e os `hoje` do laboratório passam com `campo:'hoje'`;
   recusados: "preço baixo", "o melhor preço", "preço de custo", "fica barato", "pagam menos", "respondo na hora e garanto", "sou humano",
   "chamam no WhatsApp", "lota a agenda", "respondo em dois dias", "R$". O teste **mede e imprime a taxa** de recusa num corpus de ~40 frases e
   prende que 100% dos rótulos tocados passam. Sem a opção, `planta-textos*.test.mjs` não mudam. Verde: `planta-textos.mjs`.
4. **O validador.** Vermelho: `planta-mapa-esquema.test.mjs` (escolha da versão; os casos v2 de `planta-esquema.test.mjs` sem mudar;
   `redigido`; títulos distintos; v3 máximo em `cabe()`; `versoes:['v3']` recusa v2). Verde: `planta-esquema.mjs`.
5. **Padrões.** Vermelho: `planta-mapa-padrao.test.mjs` (8 bases válidas; as 5 estruturas alcançáveis; mesma entrada = mesma saída; trava muda
   a estrutura; sem rótulo, sem `hoje.texto`/`trava`; nada de `Math.random`/`Date`; `oQueSeSabe` com negação, texto livre e `google` →
   `google_busca`). Verde: `planta-padrao.mjs`; os testes que usam `planoPadrao` como v2 passam a `planoPadraoV2`.
6. **Ferramenta e gravação.** Vermelho: `planta-mapa-ferramenta.test.mjs` (enumerações do schema = forma; 3 exemplos de 3 estruturas válidos;
   "6 versões" e "nunca" na descrição; v3 bom gravado; v2 do modelo = `versao_antiga`; 2ª falha grava o padrão do caso; 6ª aceita, 7ª
   recusada; `ajustado` sem v3 anterior recusado; registro > 8 KB não gravado), `planta-mapa-compacto.test.mjs` (ids mantidos, ≤ 900, corte
   na ordem, nunca frase), `planta-mapa-leitura.test.mjs` (`estado` com v2 = v2; com v3 = v3 revalidado; v3 adulterado = padrão v3; flag
   desligada = nada). Verde: `planta.mjs`.
7. **Simulado e cliente.** Vermelho: `planta-mapa-cliente.test.mjs` (no DOM falso de `planta-ligacao.test.mjs`: com v3 nenhum módulo carregado,
   nenhum `console.warn`, `bz:planta-pronta` uma vez; v2 igual) e um roteiro do simulado que grava v3. Verde: `orcamento-planta.js`, `simulado.mjs`.
8. **Prompt e custo.** Vermelho: `zero.test.mjs` com 6 versões e `planta-mapa-custo.test.mjs`. Verde: `PREFIXO_PLANTA` e `docs/zero` regravado.
9. **Mutação:** as sabotagens do §10 e `npm run testar:mutacao` inteiro.
10. **Fecho:** Anexo C na spec, `docs/avaliacao/planta.mjs`, `/code-review`, `npm run testar`, `npm run e2e:orcamento`, `npm run verificar`,
    `node scripts/processo/nivel-de-risco.mjs origin/main HEAD`.

Os 9 testes novos (`planta-mapa-forma`, `-hoje`, `-esquema`, `-padrao`, `-ferramenta`, `-compacto`, `-leitura`, `-cliente`, `-custo`) entram
pelo agregador `planta-todos.test.mjs`, sem mexer no `package.json`.

## 9. Sabotagens (`docs/testes/mutacao.mjs`)

1. Forma: limite de camadas 5 → 99.
2. Forma: `seta_ref` não conferida (seta para id inexistente passa).
3. Forma: seta de volta aceita fora do `ciclo`.
4. Forma: pulo de camada sem exigir faixa vazia.
5. Textos: a máscara do preço cobre qualquer "preço".
6. Textos: o modo `hoje` pula a raiz `promessa`.
7. Textos: o modo `hoje` deixa de rodar as dez travas.
8. Esquema: textos v3 sem a camada de texto.
9. Esquema: sem a conferência do `redigir`.
10. Planta: v2 do modelo aceito (`versoes` ignorado).
11. Planta: a 7ª versão aceita (substitui a sabotagem da "5ª").
12. Planta: `ajustado` sem v3 anterior aceito.
13. Planta: sem o teto de bytes do registro.
14. Padrão: `oQueSeSabe` ignorado (padrão só pelo nicho).
15. Cliente: `leve()` aceita versão desconhecida.

## 10. Evidência do PR (nível 3)

- **Especificação:** §7 e Anexo C.
- **Visto rodando (celular primeiro):** local com `BZ_PLANTA=ligada` e o simulado: com v3 a conversa segue sem desenho, sem `[beyon]` no
  console, e o valor sai sem os 20 s; uma conversa com v2 gravado continua desenhando. Fotos a 390 e 320.
- **Verificação comportamental:** o roteiro do simulado de ponta a ponta; o `estado` com v2, v3 e v3 adulterado.
- **Teste visto vermelho:** a saída vermelha de cada passo do §8.
- **Regressão:** `npm run testar`, `testar:mutacao`, `e2e:orcamento`, `verificar`.
- **Revisão técnica e revisão de segurança** por agentes diferentes (e diferentes do autor), com links. A segurança olha: a folga do `hoje`
  contra injeção (promessa com a autoridade de "Hoje:"); ids (`__proto__`) e tabelas com chave própria; nada do plano vira classe, seletor ou
  atributo; o teto de bytes; a revalidação na leitura; o compacto como dado; o erro ao modelo sem texto dele.
- **O dono:** a `DESCRICAO` v3, o `PREFIXO_PLANTA` novo e a folga do "preço" (§2.5) vão à sessão principal antes do merge, com o aviso de não
  promover entre os PRs 4 e 5.
- **Merge:** checks lidos um a um, com o SHA do head conferido; nunca `--admin`.

## 11. Riscos

- **Conflitos com o PR 3** (rebase antes de começar): `api/_vendas/consultor.mjs`, `docs/zero/*`, `api/_ia/simulado.mjs`,
  `docs/testes/mutacao.mjs`, `docs/testes/zero.test.mjs`, talvez `js/orcamento-planta.js`. `fluxo.mjs`, `agente.mjs` e `supabase/` não são tocados.
- **Modelo ancorado no exemplo** (sempre a mesma estrutura): 3 exemplos de 3 estruturas, o guia em ordem fixa e "não copie". A medida de verdade
  é a rodada do §9 (as 2 clínicas têm de sair diferentes); se falhar, ajusta-se o prompt lá.
- **Prompt mais longo** pesa no cache: `zero.test.mjs` prende +15%.
- **A folga do `hoje` é a superfície nova:** um falso negativo põe preço ou prazo com a autoridade de "Hoje:". O corpus de recusas e as
  sabotagens 5 a 7 seguram; na dúvida, recusa (o custo é cair no padrão).
- **A taxa de "hoje" recusados é estimada só no corpus escrito;** a real sai da rodada do §9.
- **Ícones de cena e de origem (§7.2):** o PR 4 fixa `ICONES` nos 29 de hoje; o PR 5 acrescenta, mexendo na lista comum, com teste.
- **CPU do `estado`** (10 ms na Cloudflare): o v3 é pequeno e o cache evita repetir a conta; `planta-mapa-leitura` mede a 2ª leitura.
- **Entre os PRs 4 e 5, com a flag ligada no staging,** não há mapa na tela, mas o Zero diz que montou. Aceito porque a flag é só do staging e o
  dono foi avisado; pede o PR 5 logo em seguida.
