# PR 3b-3b: notas de execução (banco, API do cliente, API do dono, rotina e terminal)

Base: `0921ffc` (a `main` com o 3b-3a já mesclado). Plano: `2026-10-22-pr3b3-previa-no-ar.md` (Tasks 2 a 10, 15a e 17). Depois mesclei a `origin/main` (`5c88b0f`, com a privacidade do PR #57; `9fde808` resolveu o `package.json`). Mesclar não é ir ao ar: nada aqui liga o `BZ_ENTREGA` nem promove a Vercel. As ações novas do cliente ficam atrás do interruptor e um teste (15a) impede que alguma nasça fora dele.

Linha de base da suíte na base: 850 testes, 849 passam, 1 pulado.

## Task 2: banco I, o esquema da prévia ao fim

- Vermelho: `transição de passo não permitida: producao → previa` e `column "previa_url" of relation "entregas" does not exist` (10 de 11 caídos).
- Verde: `previa-esquema` 11/11; vizinhos 70/70.
- Desvios: nenhum de lógica. Migration `20261024120000_pr3b3_esquema.sql` (eventos do funil, 17 colunas em `app.entregas`, `app.materiais.dispensado_em`, tabela `app.entrega_ajustes` com RLS e sem política, transições do passo). A D5 (nenhuma rotina muda o passo) ficou presa por teste e por 3 sabotagens; depois, na Task 9, o detector deixou de ser a regex que dava falso positivo com `where passo =`.
- Dono: aplicar a migration no Supabase real.

## Task 3: prazo com pausa, endereços e alarmes

- Vermelho: `The requested module '../../api/_material/prazo.mjs' does not provide an export named 'abrirPausa'` e `Cannot find module '.../api/_entrega/enderecos.mjs'`.
- Verde: 26/26 (prazo-pausa, enderecos, alarmes, prazo, captacao-igual; a captação estava ao lado e os testes de igualdade rodaram de verdade).
- Desvio: o teste do restante (3 dias, lembretes 2 e 3) não ficou `todo`: a captação já está em `restante_fora_do_ar_dias` 3 e `lembretes_restante` [2, 3].
- Dono: nada.

## Task 4: banco II, o que a tela recebe e as ações do cliente na prévia

- Vermelho: `function app.vendas_previa_ajustes(jsonb) does not exist` (10 de 11 caídos).
- Verde: `previa-banco` 11/11, depois 14/14 na fix wave (recusas 40001, P0002, 55000 e 22023 de `aprovar`).
- Desvios: os casts de data, versão e uuid dão 22023 (o plano deixava estourar 22008/22P02); na fix wave o bloco `exception when others` ficou estreito (só erro de formato). Lista de ajustes e `aprovar` mesclam no prazo só `conta_desde` e `pausas`. Incidente de processo: mutação rodada sem filtro deixou um arquivo sabotado no disco; restaurado com `git checkout`, nada entrou no commit.
- Dono: aplicar `20261024120100_pr3b3_previa.sql` (as Tasks 5 e 6 acrescentam a ela).

## Task 5: as ações do dono e as listas (banco)

- Vermelho: `function app.vendas_previa_publicar(jsonb) does not exist` (13 de 13 caídos). Na 1ª tentativa de verde: `syntax error at end of input`, achado por bisseção.
- Verde: `previa-dono-banco` 14/14, depois 18/18 depois da revisão.
- Desvios (o teste decidiu):
  1. O plpgsql corta `if v_dias < case when ... then 2 else 3 end then` no `then` do `case`; virou variável `v_min` calculada antes.
  2. Material parado nunca encerra nem tira a vaga: `vendas_encerrar` não aceita `sem_material` (22023); `aviso_material_em` guarda o início do "parado".
  3. `encerrar` e `suspender` recusam com o Pix do restante em andamento (`pagamento_em_andamento`).
  4. Todas as contas (30 dias, 3 dias, lembretes) são por DATA de Campo Grande, não por 24 h de relógio; provado com horas 00:00 e 23:59 e 4 sabotagens de relógio.
  5. Sem `entrada_em`, dispensar e o aviso de material parado falham FECHADO (`coalesce(v_dias, 0)`; o fail-open era real e foi visto vermelho).
  6. `aviso_feito material_parado` fora do passo `material` responde `estado` (não `ja`).
- Dono: nada além da migration.

## Task 6: banco IV, o restante

- Vermelho: `etapa atual (em_producao) não permite esta ação` (12 de 15 caídos); sem `pagamento.parcela` no estado.
- Verde: `restante-banco` 16/16; 19/19 depois da revisão.
- Desvios:
  1. `app.projetos` exige `entregue_em` quando `status = 'entregue'`; o gatilho engolia o erro e a entrega nunca concluía. Agora grava a data de Campo Grande.
  2. A leitura do estado (`vendas_estado`) não pode quebrar a tela se a conclusão falhar: bloco com exceção, só aviso no log; a próxima leitura conserta.
  3. DESVIO DO PLANO, ver seção 1: entrada estornada ou contestada não abre o restante (55000).
  4. O saldo exige a entrega da mesma proposta; projeto pausado ou cancelado que recebe o restante gera `project.error` para a equipe.
- Dono: aplicar `20261024120200_pr3b3_restante.sql`.

## Task 7: API do cliente (lista de ajustes, aprovar, restante), atrás de `BZ_ENTREGA`

- Vermelho: `ESQ.contatoDoSite is not a function` e `actual: 404 / expected: 200` nas ações novas (20 de 21 caídos).
- Verde: `previa-api` 17/17 e `contato-site` 4/4; 19/19 depois das duas correções; conjunto da Task 118/118, depois 100/100.
- Desvios:
  1. Texto grande com contato passava só com o contato; virou limpeza própria (1.500 medidos antes de redigir, 422 acima).
  2. O texto livre perde os caracteres de formato e de uso privado (`semInvisiveis`, agora compartilhada com o pedido livre) e junta as quebras de linha do Windows antes de redigir, para o CPF escondido entre linhas não escapar.
  3. Recusas do banco viram 409 com frase e saída pelo WhatsApp; motivo desconhecido nunca vira 200 nem motivo cru.
  4. O `pagar` do restante decide a recusa pelo CÓDIGO 55000 do banco, não pela mensagem (em produção a mensagem do PostgREST não chega ao erro).
  5. Telefone de 11 dígitos sem máscara no texto livre casa o regex de CPF e dá 422; a frase manda o telefone para o campo próprio.
- Dono: nada (o interruptor segue desligado).

## Task 8: API do dono em `/api/painel`

- Vermelho: `ACOES_PAINEL.POST` sem `previa` (actual false) e `actual: 400, expected: 422/409/200` ("Pedido inválido" do despacho antigo) (8 de 9 caídos).
- Verde: `previa-painel` 22/22 depois da revisão; vizinhos 151/151.
- Desvios:
  1. `FALHA` era um `Response` único reaproveitado (`Body is unusable` na 2ª chamada); virou fábrica.
  2. Toda recusa `{ok:false, motivo}` vira 409 com frase própria (só `endereco` fica 422).
  3. Prazo torto (data ilegível, `pausas` que não é lista) vira 409 com frase, não 500; relógio inválido do banco (22023) vira 409.
  4. Beco do prazo vencido (seção 2): a frase diz ao dono a verdade (devolução por atraso é o caminho de hoje; não há ação de nova data).
  5. Servidor nunca faz fetch na prévia nem no site; grava só a origem.
- Dono: nada.

## Task 9: a rotina diária e o material de projeto parado

- Vermelho: `function app.rotinas_entregas(jsonb) does not exist`; `old.test("update app.entregas set aviso_material_em = now() where passo = 'material'...")` deu `true` (falso positivo da regex antiga da D5); depois, nas 9 do apagamento, `column "aviso_apagar_material_em" of relation "entregas" does not exist`.
- Verde: `rotina-entregas` e `material-parado` 11/11 (com a reconferência sob trava); conjunto 130/130.
- Desvios (decisão do dono de 22/10 para o apagamento, que o plano não tinha):
  1. "Parado" começa no aviso de material parado e RECOMEÇA se o cliente mexer no material (ver seção 1).
  2. O material só é apagado com 6 meses parado, aviso prévio do dono registrado e 30 dias depois dele; sem o aviso do dono nada é apagado (falha segura). Apaga só `dados` e `negocio`; autorização, pedido, proposta, pagamento e a vaga ficam; o passo nunca muda.
  3. Autorização completa (número, caixa e UF) nunca é apagada nem avisada.
  4. Corrida: o apagamento trava conversa, entrega e material, reconfere e só então zera (`privado.material_apagar_agora`); o 1º teste da corrida era vacuoso (os arquivos vivos barravam) e foi refeito.
  5. Alarmes novos: `prazo_vencido`, `material_30_dias`, `restante_3_dias`, `material_apagar`.
- Dono: aplicar `20261024120300_pr3b3_rotina.sql` e registrar os desvios 1 e 3 em `Decisões.md`.

## Task 10: `scripts/entregas.mjs`, o comando do dono

- Vermelho: `The requested module '../../scripts/entregas-lib.mjs' does not provide an export named 'baixarAjustes'`; na lista, `undefined` onde se esperava `null, null, false`.
- Verde: `entregas-dono-previa` 21/21 (24/24 depois da fix wave) e `lista-material-banco` 2/2.
- Desvios:
  1. Migration nova `20261024120400_pr3b3_lista.sql` (a 5ª): `vendas_entregas_lista` traz `aviso_apagar_material_em`, `material_apagado_em` e `apagar_material_devido` (a conta de 5 meses e da mexida do cliente fica numa função só, a mesma da rotina).
  2. `executar(argv, deps)` exportado para testar o terminal sem processo e sem rede.
  3. O erro do painel chega ao terminal só como frase limpa, com a chave trocada por `[chave]`; o texto do cliente nunca vai ao terminal.
  4. `aviso BZ-… material-apagar` registra o aviso prévio, com a explicação de 6 meses e 30 dias.
- Dono: aplicar `20261024120400_pr3b3_lista.sql`; usar `node scripts/entregas.mjs listar`.

## Task 15a: o interruptor cobre toda ação nova

- Vermelho: `uma ação nova entrou em ACOES.POST: ponha-a atrás do interruptor e em DA_ENTREGA ... + 'acao-falsa'`.
- Verde: `interruptor.test.mjs` 5/5. A lista que fecha `ACOES.POST` e a lista conferida em 503 são a mesma.
- Dono: nada.

## 1. Desvios do plano que o dono precisa confirmar

1. **Entrada estornada ou contestada não abre o restante.** O plano dizia "o restante é o que falta para o total, sempre". Cobrar só `total - entrada` com a entrada devolvida entregaria o site por menos que o combinado, e nada avisaria a equipe. O banco responde 55000 (`privado.sinal_pago`) e a API devolve 409 com saída pelo WhatsApp. Não está em `Decisões.md`.
2. **"Parado" recomeça se o cliente mexer no material.** O dono escreveu que a contagem começa no aviso de material parado. Sem o recomeço, quem voltasse depois do apagamento teria o material novo apagado no dia seguinte. Se o dono preferir o relógio fixo, é trocar `privado.material_parado_desde` para devolver só `aviso_material_em` (a sabotagem "não recomeça a contagem" deixa de valer). Foi conclusão do agente, não do dono.
3. **Apagamento do material só com aviso prévio do dono 30 dias antes.** A página de privacidade promete "avisamos você antes". O aviso é do dono (`aviso BZ-… material-apagar`); o alarme repete todo dia até ele registrar; sem o aviso, nada é apagado.
4. **Autorização completa nunca é apagada nem avisada.** O texto de `/privacidade#material` diz "depois de 6 meses parado... apagado"; para quem já autorizou (número, caixa e UF) a frase não vale, e o dono precisa aceitar isso (e o texto precisa dizer, ver seção 2).
5. **5ª migration `20261024120400_pr3b3_lista.sql`.** Foi preciso trazer os dois campos do apagamento para a lista do painel e do terminal; as 4 migrations do plano viraram 5.
6. **A prova da autorização do contato do site mora numa tabela própria.** `app.entrega_contato_autorizacoes` (RLS ligada, sem política, `revoke all` até do `service_role`, sem chave estrangeira de propósito). A rotina copia a prova antes de apagar a lista de ajustes (30 dias depois da última atividade), para o consentimento (LGPD, art. 8º, §2º) sobreviver à lista. Corrigido na própria migration `…120300`, que ainda não foi aplicada em lugar nenhum.

## 2. Pendências

- **Beco do prazo vencido.** `novas_datas` só é lido (`prazo.mjs`); nada o escreve. Cliente que quer seguir depois do atraso, ou aprova no último dia e o dono publica no dia seguinte, recebe 409 "devolução por atraso". Falta a ação "nova data" ou aceitar como devolução (decisão do dono).
- **`traduzirLimite` (`api/_pagamentos/servico.mjs`).** Os ramos que leem `e.message` (/cartão pausado/, /tentativas esgotadas/, /verificação/, /sem percentual de entrada/) só casam no PGlite; em produção o `ErroBanco` traz só `rpc nome: HTTP status` e cai no genérico. O restante já decide por código 55000. Sugestão: o transporte repassar a mensagem do PostgREST. Herdado da 3b-1 e 3b-2.
- **Aviso prévio na 3b-3c precisa de link de retomada novo.** O link do pedido dura 120 dias deslizantes e só renova com uso; projeto parado mais que isso sem o cliente voltar deixa o link vencer. Não há contradição com a página (30 dias depois do fim do pedido), é questão de uso.
- **Lista de ajustes de pedido preso em `ajustes` nunca expira.** A que está na fila não some por idade (por desenho); pedido parado ali guarda o texto indefinidamente.
- **Janela herdada do apagamento (armazém, depois banco).** Entre a escolha e o `baixar`, se o cliente voltar, as fotos já tiradas do armazém somem; os campos que ele digitou ficam (protegidos). Deadlock raro entre a rotina e o cliente é possível. Ordem herdada da 3b-2, de propósito, para nunca deixar objeto órfão.
- **B4: painel e rotina não passam pelo interruptor.** Com `BZ_ENTREGA` desligado, o dono consegue publicar a prévia e a rotina conta `material_30_dias` para pedidos sem tela de material. Ruído, sem dano automático.
- **B6: fuso do dia do alerta.** `rotinas_conferir` grava o `dia` no fuso de São Paulo; as contas da entrega usam Campo Grande. Entre 23h e 0h de Campo Grande o alerta cai no dia seguinte. Só muda a deduplicação.
- **A caixa de autorização antiga conta para o material novo.** Depois do apagamento, a autorização (herdada da 3b-2) continua valendo para o material que o cliente mandar de novo.
- **O texto de `/privacidade` deve dizer que quem tem autorização completa não é apagado** (ver seção 1, item 4). Pendência de texto, não de código.
- **Task 10, `baixarAjustes` inclui rodadas já aplicadas** (como o plano manda). O dono baixa tudo e a pasta precisa estar vazia.
- Menores: `prazoLegivel` falha fechado (pedido legado sem `conta_desde` em produção dá 409 "confira o prazo"); `validarBase` (HOSTS de `direcoes.mjs`) só aceita os hosts da Vercel, e o PR da Cloudflare precisa liberar o host exato de produção e de staging (M4); `colocarNoAr` e `publicarPrevia` só exigem `https://`, a conferência fina é do servidor.

## 3. Para o 3b-3c

- **Painel dos avisos:** incluir o momento `material_apagar` (botão, mensagem pronta e link de retomada novo), além de `material_parado`, `previa`, `no_ar` e os lembretes do restante; o painel lê `apagar_material_devido`, `aviso_apagar_material_em` e `material_apagado_em` da lista.
- **Telas do cliente:** prévia, lista de ajustes (duas rodadas), aprovar, restante (só Pix), concluído e encerrado. A tela decide por `entrega.passo` e `conversa.etapa` (a entrega `encerrada` volta a mostrar a entrada). Mostrar `previa.url` e `site.url` só com `a.href` e `textContent`, reconferir `https:` e a mesma regex, nunca `innerHTML`. Avisar que o telefone vai no campo próprio, não no texto.
- **15b:** o verificador `antes-de-ligar.mjs`, seu teste e o item 4d das pendências; M6 (CSP com o endereço exato do Supabase) segue como pedido à sessão da Cloudflare.

## 4. Achados da revisão de segurança e o que foi corrigido

Veredito do revisor (opus): **pode mesclar**, sem Crítico nem Alto. Relatório: `pr3b3b-seguranca.md`.

- **M1 (Médio), corrigido (`a85ef3a`).** A rotina apagava a lista de ajustes junto com a prova da autorização do contato. Agora copia a prova para a tabela própria antes do DELETE; 3 sabotagens pegas.
- **B1, corrigido (`d22d402`, `e7eef97`).** `prazoVencido` sem teto travava com `prazo_dias` absurdo (1e12 passou de 60 s). Agora `PRAZO_DIAS_MAX = 60` e teto de 260 dias úteis parados; `contarAlarmes` ganhou `try` por item (o item torto vira `ilegiveis`, não derruba o dia). Teste novo `prazo-limites.test.mjs`.
- **B3, corrigido (`84260a8`, `107f34f`).** `encerrar` e `dispensar` do terminal agora pedem o código digitado (`ENCERRAR-XXXX`, `DISPENSAR-XXXX`); errado, vazio ou sem terminal = nada é feito. Desvio: o terminal mostra o código, a ação e a mudança de passo, mas não o passo atual (isso exigiria uma chamada ao servidor antes da pergunta).
- **B5, corrigido (`3e9c256`).** Publicar mescla só `conta_desde` e `pausas`; dispensar só `numero_em` e `conta_desde` (`jsonb_each` filtrado, para não apagar o `ate: null` da pausa aberta).
- **Nota pequena, corrigida.** O `listar` do terminal passa todos os campos por `paraTerminal`.
- **B2, mantido.** Escolha sem trava e armazém antes do banco no apagamento do material parado: a ordem é a da 3b-2, escolhida para nunca deixar objeto órfão; probabilidade muito baixa e os campos do cliente ficam protegidos.
- **B4, mantido.** O painel do dono exige `PAINEL_CHAVE` e o interruptor cobre o lado do cliente; o dano de mexer no painel com o interruptor desligado é só ruído (os 3 dias contam do aviso registrado). Fica registrado nas pendências.
- **B6, mantido.** Só informativo: muda a deduplicação do alerta, não a segurança.

## 5. Números

Suíte: ... (preencher)

Mutação: ... (preencher)

Nível de risco: 3 (sensível), como no 3b-2. Migrations: nenhuma aplicada em banco real (só PGlite). Não feito, por ordem: push, PR, merge, aplicar as 5 migrations.
