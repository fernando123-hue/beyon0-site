# PR 3b-2: notas da execução (modo leve)

Branch `pr3b2` (parte de `pr3b1`, que parte do PR #49). Base: `aff2146`. Modo leve: só `node --test <arquivo da tarefa>`;
suíte e mutação rodam uma vez no fim; nada de E2E, `verificar`, `acessibilidade`, `olhar`, servidor ou Chrome (Task 19 PENDENTE).

## Task 1: base (sem commit)

- Base `aff2146`; `node_modules` é junção; `pglite ok`.
- 3b-1 presente: `BZPix` em `js/orcamento.js:556`; "Quando fica pronto?" em `orcamento.html:471`; `AINDA_NAO` em
  `pagar-sem-medo.test.mjs:46`; última migration `20261022120000_pr3b1_entrada.sql` (as `20261023…` do plano seguem valendo).
- Testes que listam `ACOES`: `ajustes-api.test.mjs`, `opcoes.test.mjs` (Tasks 8 a 10 atualizam).
- "Sim" do dono (3b D1 a D6, 21/10) em `01 Empresa/Decisões.md` linhas 26 a 31. Captação (só leitura) presente.
- Linha de base da suíte: 585 testes (notas do 3b-1); a suíte inteira roda no fim.

## Task 2: esquema do material e bytes

- Vermelho visto: `Cannot find module '.../js/orcamento-material-esquema.js'` (módulo tirado do lugar; testes escritos junto).
- Verde: material-esquema 10/10; captacao-igual 4/4 (rodaram contra a pasta da captação, não pularam).

## Respostas da captação (para-o-site.md §6, main 94e182f, recebidas no meio da Task 3)

1. Dias úteis: dia 1 = 1º dia útil depois do início; espera soma os úteis do dia seguinte ao início até o fim, INCLUSIVE.
   Diferente do plano (que contava [de, ate)): mudei `diasUteisEntre` para (de, ate]. Quais feriados contam: do dono; `FERIADOS` fica vazio e
   configurável (opção `feriados`); os casos usam só os nacionais.
2. `numero_em` = `formulario.enviado_em` (recusar futuro ou anterior à entrada) -> Task 4/8. 3. `material_dispensar`: NÃO (nada a fazer aqui).
4. `prazo.dias` fora de 5 a 10: recusado -> produção manual. 5. Valores só em reais inteiros. 6. `"saude": false`; ramo de saúde recusado.
7. `aceite.texto` basta; `aceite.em` = hora real do clique.

## Task 3: prazo em dias úteis

- Vermelho visto: `Cannot find module '.../api/_material/prazo.mjs'`.
- A fixture `prazo-casos.json` deixou de ser provisória: tem os casos da captação (§6) mais os do site, todos com os feriados nacionais.
  Recalculei à mão os casos do site para a regra "inclusive" (sábado a segunda soma 1; antes somava 0).
- O teste de igualdade `captacao-igual` agora roda de verdade contra `clientes/prazos.mjs` (data e vencimento): igual em todos os casos.
- Verde: prazo 8/8; captacao-igual 5/5.

## Task 3A: textos do prazo em dias úteis

- Vermelho visto: 4 de 4 testes novos falharam antes dos textos. Verde: os 8 arquivos da tarefa, 104 testes, 0 falhas.
- Trocados: escopo (73, 77), consultor (95, 99; a 81 do atendente segue corrida), agente (103), `js/orcamento.js`, recibo, `orcamento.html`
  e as frases nos 5 testes antigos. Os números de linha do plano batiam.
- **Fora deste PR (avisar o coordenador):** `index.html` (197, 275), `sites.html` (63, 122, 267) e `condicoes.html` ainda dizem "10 dias corridos"
  para a entrega; `automacao.html:321` (teste de 10 dias do atendente) fica corrido. PR de texto próprio, com `condicoes_versao` nova.

## Task 4: pacote versão 1

- Vermelho visto: `Cannot find module '.../api/_material/pacote.mjs'`. Verde: pacote 11/11 (+ captacao-igual 6/6: o `formulario.json` do site passa na `lerFormulario` dela).
- Desvio (resposta 6 da captação): `montarPedido` com segmento "saúde" LANÇA "cliente de saúde: produção manual" (a captação recusa `saude: true`);
  o plano gerava `saude: true`. Os outros ramos vão com `saude: false` explícito. O PEDIDO de teste passou a "serviços".
- Resposta 2 (`numero_em` = `enviado_em`, sem data futura ou anterior à entrada) e 7 (`aceite.em` = hora real do clique) entram na Task 8 (servidor).
- A captação ainda não tem leitor de `pedido.json` (`importar-site` não existe): a igualdade do pedido fica só pelo contrato (§4/§6).

## Task 3 (complemento): feriados = SÓ OS NACIONAIS (decisão do dono, 21/10)

- `FERIADOS` em `prazo.mjs` deixou de ser vazio: responde `.has(dia)` para qualquer ano com os 9 nacionais de data fixa (01-01, 04-21, 05-01, 09-07,
  10-12, 11-02, 11-15, 11-20, 12-25) mais a Sexta-feira Santa (nacional por lei, calculada pela Páscoa). Carnaval e Corpus Christi (ponto facultativo)
  e Campo Grande (26/08, 11/10) NÃO contam. Dúvida para o coordenador: se o dono não quer a Sexta-feira Santa, é tirar uma linha.
- A captação hoje conta também móveis e Campo Grande: ela precisa se alinhar (os casos de teste não são afetados; só usam nacionais).
- Frase ao cliente "Sábado, domingo e feriado nacional não contam." entrou no contrato (escopo), no consultor e na resposta de "Quando fica pronto?".
- Testes: prazo 8/8 e captacao-igual 6/6 contra o código dela; 118 testes dos arquivos de prazo/texto, 0 falhas.

## Andamento

próxima tarefa: 5
