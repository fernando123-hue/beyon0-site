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

## Task 5: banco I, a entrega

- Vermelho visto: `error: relation "app.entregas" does not exist` (7 de 7 caídos).
- Verde: entrega-banco 7/7; pagamentos-banco + retomada-banco + vendas-banco 29/29.
- Desvio: no teste do gatilho, `select status from app.pagamentos p join app.propostas pr` era ambíguo (as duas têm `status`); virou `p.status`.
- `etapa_retomavel` só ganhou `'em_producao'`; nenhum teste antigo de retomada precisou mudar.
- **Dono:** aplicar `supabase/migrations/20261023120000_pr3b2_entrega.sql` no Supabase real (aqui só arquivo e PGlite).
- Rodo os testes de banco com `--test-concurrency=1` (modo leve).

## Task 6: banco II, o material

- Vermelho visto: `function app.vendas_material_salvar(jsonb) does not exist` (15 de 15 caídos).
- Verde: material-banco 15/15 (primeira passada: 14/15).
- Desvio: o teste "sem número" usava `telefone: '123'`, que o `check` de `app.leads.telefone` (E.164, 8 a 15 dígitos) recusa já ao inserir; virou `'+12345678'`
  (E.164 válido, mas não brasileiro, então `usar_numero_do_pedido` responde `motivo: 'numero'`).
- **Dono:** aplicar `supabase/migrations/20261023120100_pr3b2_material.sql`.

## Task 7: armazém (Supabase Storage) e balde

- Vermelho visto: `Cannot find module '.../api/_material/armazem.mjs'`. Verde: armazem 11/11 (inclui o roteiro do `conferir-armazem` contra o armazém local).
- `node --check` em `scripts/conferir-armazem.mjs`, `docs/servidor.mjs`, `docs/banco-local.mjs`: ok. O PUT do armazém local em `docs/servidor.mjs` não foi
  exercitado (nada de servidor no modo leve); a função só reaproveita `gravarPorUrl`/`lerPorUrl`, cobertas no teste.
- **Dono:** (1) rodar `supabase/storage/material.sql` no SQL Editor; (2) rodar `scripts/conferir-armazem.mjs` com as chaves só naquela janela; (3) a conferência à mão do
  teto do balde (`select privado.bytes_no_balde()` antes e depois de subir um arquivo, Step 6 do plano).

## Task 8: ações do material em /api/vendas + interruptor

- Vermelho visto: módulo `fluxo-material.mjs` ausente (`Cannot find module`, o `fluxo.mjs` já o importava). Verde: material-api + interruptor 16/16;
  fluxo-api + ajustes-api + csp 60/60; detalhes-api, retomada-api, api, formulario-api verdes.
- Desvios do plano (o teste decide):
  1. `ateEntregaCriada` conferia a entrega pelo estado; com o interruptor desligado o estado não a traz. Passou a conferir no banco.
  2. Teste "outro visitante": o `cen.navegador()` sem `env` caía no interruptor desligado (503 em vez de 404); passou `{ env: { BZ_ENTREGA: 'ligada' }, armazem }`.
  3. `salvar('whatsapp', '21999990001')` dava 422 (11 dígitos colados batem no `CPF_CNPJ`); o teste usa `'21 99999-0001'` (400).
  4. O teste do interruptor listava `link-pedido`, `sair-do-aparelho`, `outro-aparelho`, `abrir-pedido`, que só existem na Task 9; deixei só as `material-*` e a Task 9 acrescenta as outras (comentário no teste).
- Resposta 2 da captação (`numero_em` = `enviado_em`, sem data futura nem anterior à entrada): no servidor `numero_em` é o `agora` do próprio Worker (nunca vem do cliente) e `iniciarPrazo`
  usa o mais tarde dos dois, então nunca é futuro nem anterior à entrada. `formulario.enviado_em` (`materiais.enviado_em`) recebe o mesmo `agora`.
- `.env.example` ganhou `BZ_ENTREGA=` (sem valor); `docs/servidor.mjs` liga por conta própria.

## Task 9: link do pedido, outro aparelho, sair deste aparelho

- Vermelho visto: `function app.vendas_link_pedido_criar(jsonb) does not exist` (10 de 10). Verde: link-pedido-banco 10/10, link-pedido-api 10/10; interruptor + material-api + retomada-api + fluxo-api + ajustes-api + retomada-banco 79/79.
- Desvios do plano (o teste decide):
  1. O bloco M1 do plano termina colado numa crase quebrada ("``` `api/vendas.mjs`:"); a chave de fechamento do último teste faltava no trecho e foi recolocada.
  2. `cen.navegador()` sem `env` cai no interruptor desligado (503): no arquivo de teste criei `novoNav()` com `{ env: { BZ_ENTREGA: 'ligada' }, armazem }`.
  3. `antes.iniciar()` devolve o id da conversa, não um objeto: `{ conversa_id: cc }` (o plano usava `cc.conversa_id`).
  4. `docs/testes/interruptor.test.mjs` passou a cobrir também `link-pedido`, `sair-do-aparelho`, `outro-aparelho` e `abrir-pedido` (o que a Task 8 deixou em aberto).
- "Sair deste aparelho" chama `POST {SUPABASE_URL}/auth/v1/logout?scope=global` com o token do próprio visitante (`visitantes.sair`); o auth local imita (`revogados`).
  **Aviso para a Cloudflare:** se o Worker um dia validar o JWT sem o `/auth/v1/user`, a revogação deixa de ser imediata. A conferência real é a linha 8 do `conferir-armazem` (dono).
- **Dono:** aplicar `supabase/migrations/20261023120200_pr3b2_link_pedido.sql`.

## Task 10: o lado do dono no painel

- Vermelho visto: 6 de 8 caídos sem a migration/painel (`function ... does not exist`). Verde: entrega-painel 8/8; ajustes-dono + painel-aviso + api 46/46.
- Desvios (o teste decide):
  1. O cenário da 3a é um cliente de SAÚDE e o `montarPedido` agora recusa saúde (resposta 6 da captação): os testes de pacote trocam o segmento por "serviços" (`naoSaude`) e um teste novo
     confere o 422 "produção manual" para saúde.
  2. `pedido.whatsapp` é o telefone de contato do cadastro (o da lead), não o WhatsApp dos botões do material; o teste confere o formato.
- Nenhum teste fora do arquivo novo lista `ACOES_PAINEL` (só `api/painel.mjs` e o Worker da Cloudflare, que o conferem no plano deles).
- **Dono:** aplicar `supabase/migrations/20261023120300_pr3b2_dono.sql` (a Task 11 acrescenta funções no mesmo arquivo). Antes (B8): `select count(*) from app.conversas c where c.etapa = 'em_producao' and not exists (select 1 from app.entregas e where e.conversa_id = c.id);`

## Task 11: rotina diária, limpeza e reconciliação

- Vermelho visto: `Cannot find module '.../api/_material/limpeza.mjs'`. Verde: limpeza 8/8; api + auditoria-p0 + auditoria-p1 + entrega-painel verdes; `fila-direcoes` 45/45
  (rodando junto com outros arquivos no PC ocupado ele estourou o tempo uma vez; sozinho passa).
- Desvios (o teste decide):
  1. `updated_at` de `app.pagamentos` é carimbado pelo banco (`privado.carimbar`) e volta para agora; o teste do estorno "há 2 dias" usa a licença `bz.restaurando = 'on'` numa transação
     (só vale em conexão SQL sem usuário). Em produção o `updated_at` do estorno é o instante em que o estorno entrou, que é o que a regra quer.
  2. `limpos` do teste M3 é `>= 1`: os outros testes do arquivo deixam pedidos vencidos no mesmo banco e a rotina os limpa também.
- Subpedidos da rotina na conta: 5 no total (log `subpedidos`), bem abaixo de 45.

## Task 12: scripts/entregas.mjs (o dono, no PC)

- Vermelho visto: `Cannot find module '.../scripts/entregas-lib.mjs'`. Verde: entregas-dono 7/7; direcoes-dono verde (16/16 no total com ele); `node --check` nos três scripts.
- Desvio: o teste do plano olhava `r.comandos[0]` esperando `importado BZ-… c-`, mas o código põe a importação da captação em `[0]` e o `importado` (com `<id … c-xxxxxx>`) em `[1]`;
  o teste passou a conferir os dois comandos na ordem (primeiro importar, só depois marcar).
- Cópia dos percorredores de imagem conferida a olho contra `captacao/entrega/imagens.mjs` linhas 19-65: iguais. Atenção para o revisor: a captação regrava toda imagem como WebP (cabeçalho do arquivo dela);
  `estruturaCompleta` só confere a estrutura do arquivo original, como o plano manda.

## Task 13: CSP de /orcamento

- Vermelho visto: o teste novo falhou antes da troca. Verde: csp + ambiente 21/21 (a `<meta>` de `orcamento.html` e o header de `vercel.json` iguais; as outras páginas intactas).
- Não há `_headers` da Cloudflare neste ramo (o PR B ainda não existe): as mesmas duas trocas ficam para ele (nas pendências, Task 20).
- **Dono (obrigatório antes de ir ao ar):** dizer o endereço `https://<projeto>.supabase.co` para trocar o curinga `*.supabase.co`.

## Task 14: a tela "Seu pedido"

- Vermelho visto: `ENOENT … js/orcamento-material.js` (o teste lê os arquivos das Tasks 15 e 16) e o HTML sem `#o-pedido`. Verde: orcamento-entrega + csp + pagar-sem-medo + so-pix-textos + orcamento-pix 40/40;
  consultor, faq-identico, orcamento-ajustes, prazo-uteis-textos, orcamento-preparo verdes.
- Desvio de ordem: o teste da Task 14 exige que `js/orcamento-envio.js` e `js/orcamento-material.js` existam e que o HTML os carregue na ordem. Deixei os dois como arquivos de uma linha
  de comentário ("lugar reservado") neste commit; as Tasks 15 e 16 os substituem.
- `AINDA_NAO` perdeu "Guarde o link do seu pedido" e "Pôr na minha agenda" (as outras ficam). O recibo agora diz "Entrada recebida. O próximo passo é mandar o material…".
- **Verificação de tela PENDENTE (Task 19, PC livre):** olhar `#o-pedido` a 390 e 320 px, o cartão do link, o `details` "Voltar ao pedido depois" e a lista dos 4 passos; E2E da volta pelo `#pedido=`.

## Task 15: motor de envio

- Vermelho visto: com o arquivo de uma linha ("lugar reservado"), 13 de 13 testes caídos (`Cannot read properties of undefined (reading 'problemaDaEscolha')`). Verde: orcamento-envio 13/13.
- Desvio: o teste "remover" esperava o id de mentira `id1`, mas o log já tem a linha `reduzir` antes da reserva, então o id é `id2`; corrigi a expectativa (comentada no teste).
- A redução por canvas (`reduzirNoAparelho`) e o PUT por XHR (`enviarPut`) NÃO foram exercitados num navegador (modo leve): só as versões injetadas nos testes. Conferir na Task 19, com foto grande de celular real e o armazém real.

## Task 16: formulário do material (6 blocos) e "Enviar"

- Vermelho visto: `Cannot read properties of undefined (reading 'blocos')` com o arquivo de uma linha (6 de 6 caídos). Verde: orcamento-material + entrega + envio + pagar-sem-medo + csp 52/52; `node --check` ok.
- Desvios: (1) o teste M6 esperava `status === 429` no texto, o código usa `e1.status !== 429` (mesma regra, escrita ao contrário); o teste confere `status !== 429`.
  (2) `passo \d de 4` saiu do `AINDA_NAO` (o bloco 2 da tela diz "Passo 2 de 4"), como o plano manda.
- Telas do material (salvar sozinho a 700 ms, "Falta:", barra de envio, miniaturas, `progress`) NÃO foram vistas num navegador (modo leve). **Verificação de tela PENDENTE (Task 19)**: 390 e 320 px, teclado, leitor,
  o `accept` dos arquivos no iPhone (HEIC), foto grande de celular real, envio ao armazém real (CORS).

## Task 17: pergunta "Como mando fotos e textos?" e passos antes de pagar

- Vermelho visto: os 2 testes novos de `pagar-sem-medo` falharam antes do HTML. Verde: pagar-sem-medo, orcamento-entrega, so-pix-textos, consultor, condicoes, csp, prazo-uteis-textos 83/83.
- Guarda visto vermelho colando `<p>Quando pago o restante?</p>`: `frase barrada (com o 3b-3)`; tirado.
- `AINDA_NAO` perdeu `Como mando fotos` e `precisa mandar nada pelo WhatsApp`; continuam barradas as do 3b-3 e as da D2/D5.
- **Verificação de tela PENDENTE (Task 19):** os passos acima do Pix a 390/320 px e o atalho de perguntas.

## Task 18: privacidade (PR separado, só preparado)

- Branch `pr3b2-privacidade` criada com `git branch` a partir de `origin/main` (`fde6d6f`, já com o PR #49 e o #50) e commitada SEM trocar a branch atual
  (plumbing do git: índice temporário, `write-tree`, `commit-tree`, `update-ref`). Commit `004cc73`: só `privacidade.html`, `docs/testes/privacidade-material.test.mjs` e uma linha no `testar`. Sem push.
- Vermelho visto: o teste novo falhou 4 de 4 contra a página sem o texto. Verde: privacidade-material 4/4 + `condicoes.test.mjs` 20/20 (rodados numa cópia exportada da branch, fora desta worktree).
- **Dois desvios do plano, por causa de testes que já existem na `main`:**
  1. `condicoes.test.mjs` proíbe "N anos" na página (o prazo legal de guarda de comprovantes "não leva número de anos" até o dono confirmar). O "5 anos" do plano e do Anexo B virou
     "ficam pelo prazo legal de guarda de comprovantes, contado do último pagamento ou devolução". Se o dono confirmar 5 anos, troca-se a frase e o guarda juntos. O corpo do PR (Anexo B do plano) ainda diz 5 anos: ajustar na hora de abrir.
  2. O trecho novo da Anthropic usava parênteses ("(textos, contatos e fotos)") dentro do parêntese da Anthropic e quebrava a regex de `condicoes.test.mjs`; virou "o material do site: textos, contatos e fotos, que o agente que monta o site lê".
- No PR do código: `privacidade-prazos.test.mjs` (o item 1 passa, o 2 pula enquanto a página não tem o item, o 3 ficou verde com as pendências) e a seção `4c` em `docs/revisoes/pr1-pendencias.md`
  (migrations, balde, conferir-armazem, PR da privacidade, CSP com o endereço exato, `BZ_ENTREGA`, captação, verificação de tela pendente).
- **Dono:** o clique de mesclar o PR da privacidade é o "sim". O PR não foi publicado (sem push). Registrar a resposta em `Decisões.md` se ele responder no chat.

## Task 19: E2E da entrega e verificação de tela (PENDENTE, PC livre)

- ESCRITO e só com `node --check`: `docs/e2e-entrega.mjs` (plano, Step 1) e a chamada `await passoDaEntrega(...)` em `docs/e2e-orcamento.mjs`, depois do `passoDoPix`. **NÃO foi rodado** (modo leve).
- Falta fazer com o PC livre: as 3 rodadas do E2E (padrão, `MP_METODOS=pix`, com consultor) + uma com `BZ_ENTREGA=` vazio (o recibo mostra a frase da entrega desligada), `verificar`, `acessibilidade`, `olhar`
  e abrir os PNG `5-pedido-cel`, `5a-material-cel`, `5b-material-320`, `5c-enviado-cel` (e os `4-pix-*` do 3b-1).
- Riscos conhecidos do E2E não rodado: depende dos ids `#o-ret-abrir`, `#o-ret-estado`, `#o-retomada` (existem no HTML), do `espera` e `foto` do E2E atual, e de 61 s de espera do freio de IP por trecho; o `e2e-orcamento.mjs` já passava de 800 linhas antes.
- Linha de aparelho real (dono): foto HEIC do iPhone no seletor, "Mandar para mim" e "Pôr na minha agenda".

## Andamento

próxima tarefa: 20 (suíte inteira, mutação, nível de risco); 19 só escrita, execução pendente
