# PR 3b-3c: notas de execução (painel dos avisos, telas da prévia e do site no ar, verificador do "antes de ligar" e o E2E)

Base: `4224651` (a `main` com o 3b-3a e o 3b-3b já mesclados; a `origin/main` não andou durante o 3b-3c, conferido em 28/10). Plano: `2026-10-22-pr3b3-previa-no-ar.md` (Tasks 11, 13, 14, 15b, 16 e o recorte da 17). Notas do 3b-3b: `pr3b3b-notas.md`.

**Mesclar não é ir ao ar.** Nada aqui liga o `BZ_ENTREGA`, aplica migration ou promove algo na Vercel. Este PR não tem migration nova nem `api/` nova: só telas do cliente, painel do dono, o verificador `scripts/antes-de-ligar.mjs`, o E2E e o servidor local. **Uma exceção, vinda da revisão de segurança (B1, seção "Correções finais"): `previa-aprovar` em `api/_vendas/fluxo-previa.mjs` passou a exigir `rodada_base`.** Tudo do lado do cliente fica atrás do interruptor.

Linha de base da suíte na base: 1034 testes (a do 3b-3b).

## Task 11: o painel do dono, os avisos da D1

- Vermelho: `ENOENT: no such file or directory, open '...\js\painel-entregas.js'`; no `painel-aviso`, `actual: 'Abrir no WhatsApp', expected: 'Abrir a conversa no WhatsApp'` e o `mailto:` que ainda levava `?subject=...&body=...`.
- Verde: `painel-entregas` 10/10 no começo, depois com o teste do módulo e do componente com DOM de mentira; `painel-entregas painel-aviso painel-redes csp previa-painel`: 69/69.
- O que é: o bloco "Avisos para mandar" lê `GET /api/painel?fila=avisos` e mostra, para cada aviso, a mensagem pronta numa caixa só de leitura, "Copiar a mensagem", o botão que abre a conversa SEM o texto e "Já avisei" (manda `aviso_feito` e o `momento`). Seis mensagens: prévia, site no ar, material parado, aviso antes de apagar o material e os dois lembretes do restante. O link de retomada de uso único nunca vai num endereço (`wa.me/?text=` o passaria a terceiros): o dono copia e cola.
- Desvios do plano: o foco vai direto à mensagem depois de "Preparar"; o texto de ajuda da fila foi atualizado; momento que o painel não conhece não vira cartão; o lembrete 1 ganhou "Se você já pagou, pode ignorar esta mensagem."
- Dono: revisar o tom das seis mensagens (em especial a de apagar o material). Nada de banco nem de ambiente.

## Task 13: a tela do passo 3, a prévia

- Vermelho: `Error: ENOENT: no such file or directory, open '...\js\orcamento-previa.js'`; no `orcamento-entrega`, `actual: 'Previsão do seu site: 5 de novembro. Você vê a prévia aqui mesmo.'  expected: 'Sua prévia está pronta. Seu site só segue depois da sua resposta.'`. Depois da revisão, o teste da colisão do nome: `AssertionError: BZPrevia.desenhar continua sendo o do desenho das direções`.
- Verde: `orcamento-previa` 30/30 e os seis vizinhos 97/97. `acessibilidade.mjs`: "Tudo certo."
- O que é: "Ver a prévia" (outra aba, `noopener noreferrer`, endereço só se passar na regra da captação), "Está bom: aprovar" (num `<dialog>`, nunca `window.confirm`) e "Quero ajustes" (um campo, até 1.500 caracteres, no máximo 2 listas, com o telefone e o e-mail do site em campos próprios e a autorização de uso). Sem resposta o projeto para (D5): a tela diz "Seu site só segue depois da sua resposta." e não promete aprovação automática.
- Desvios do plano:
  1. O global da tela é `window.BZPreviaEntrega`. O plano usava `window.BZPrevia`, que já é do desenho das três direções (`js/previa.js`); a revisão achou a colisão (a tela dos 3 modelos quebraria). Um teste lê todos os `<script>` de `orcamento.html` e falha se dois atribuírem o mesmo `window.X`.
  2. Prévia sem endereço que passe na regra: o cliente não aprova o que não consegue ver (só a frase "A prévia não abriu por aqui." e o WhatsApp).
  3. Botão "Voltar" novo no formulário (quem abre "Quero ajustes" e desiste não tinha como voltar).
  4. Um só WhatsApp ("Outra dúvida?") na seção; dois lugares de erro (no formulário, perto do campo, e fora, para aprovar e para o 409); a ação tem o seu `try/catch` e a releitura de fundo nunca vira "falha de envio".
  5. Textos enxugados para a voz humana (sem "Recebido.", uma nota só sobre CPF e telefone). As frases do contrato ficaram exatas.
  6. `hrefDaPrevia` aceita a barra final, como o servidor e o CHECK do banco.
- Dono: nada. Decidir (pergunta): "Ver a prévia" e "Está bom: aprovar" têm o mesmo peso visual (dois botões ciano cheios).

## Task 14: a tela do passo 4, o site no ar e o restante só por Pix

- Vermelho: `Error: ENOENT: ... js\orcamento-restante.js`; depois, no componente do Pix, 5 testes vermelhos (`o-pag-metodos nunca ficou visível: [false]`: com o cartão ligado no servidor o seletor aparecia). Depois da revisão, 6 vermelhos: o aviso, a ligação no `orcamento.js`, `restanteAberto`, `alvoDaRetomada`, a suspensa sem "Abrir o site" e o status limpo.
- Verde: `orcamento-restante` 24/24 no começo; os oito arquivos pedidos 120/120 depois.
- O que é: `#o-noar` (endereço em texto, "Abrir o site", a frase dos 3 dias, o aviso a partir do 2º dia), o Pix do restante no MESMO componente da entrada (`js/orcamento-pagamento.js` ganhou `mostrar(valor, pct, { metodos: ['pix'] })`, então o seletor de cartão nunca aparece, qualquer que seja `MP_METODOS`), `#o-fim` (concluído com as duas partes pagas, ou encerrado). O valor do restante vem do registro do banco; sem ele, total menos a entrada PAGA; entrada registrada e não paga (estornada, contestada): a tela não cobra (o banco recusa com 55000).
- Desvios do plano:
  1. `BZRestante.criar` é uma fábrica (estado por instância e DOM de mentira nos testes), não funções soltas.
  2. O `#o-pagamento` carrega textos da entrada (atalho "Perguntas antes de pagar", "Pergunte ao consultor", "Passo 1 de 4 · Entrada", o escopo, o aviso "quero pagar o sinal"): no restante somem por classe CSS. O plano não tratava.
  3. O `parar()` do `orcamento.js` mataria o Pix do restante a cada leitura; com o restante aberto ele não roda.
  4. Retomada pelo link ou pelo aviso cai em `#o-noar` (`alvoDaRetomada`); o restante respeita o interruptor (`entrega_ligada`); quem tinha o Pix da entrada volta ao "Para começar" (`{}` solta a restrição).
  5. Aviso do último dia: "Hoje é o último dia do prazo do restante. Depois dele, sem o pagamento, o site sai do ar." Sem horário de corte na tela (o ramo "Falta 1 dia" era inalcançável e saiu).
  6. Entrega suspensa: "Seu site saiu do ar", o endereço só em texto, o mesmo Pix; a frase diz que a Beyon Zero coloca o site no ar de novo, sem prazo.
- Dono: nada. Confirmar o desvio 7 abaixo (entrega `encerrada`).

## Task 15b: o verificador "antes de ligar"

- Vermelho: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\scripts\antes-de-ligar.mjs'`. Depois da revisão, 7 de 20 vermelhos antes do código (fonte da CSP que existe e não se deixa ler, o `connect-src` de verdade, os três lugares com o mesmo projeto, espaços em volta de `ligada`, a `BZ_BASE` sem usuário nem senha na frase, o cabeçalho único das conclusões).
- Verde: `antes-de-ligar` 20/20; com `interruptor`, `csp` e `cabecalhos`: 44/44.
- O que é: lê só arquivos do repositório (e a captação, se estiver ao lado). Linhas OK, FALTA (um arquivo prova) ou CONFIRMAR (só o dono prova). Sai com código 1 se houver FALTA. Confere: as 10 migrations (e um teste compara a lista com a pasta), a CSP de `/orcamento` com o endereço EXATO do Supabase nos três lugares (`vercel.json`, `<meta>` e `_headers`), os cabeçalhos pelo teste de paridade, a privacidade do 3b-2, a captação (`condicoes_versao`, 3 dias, lembretes 2 e 3), nenhum arquivo de deploy ligando o `BZ_ENTREGA` e a `BZ_BASE`.
- Desvios do plano: 10 migrations (não 9); o `_headers` da Cloudflare já existe e o `vercel.json` é opcional; a captação é CONFERIDA, não só pedida; as cinco conclusões do 3b-3b viram CONFIRMAR sob um cabeçalho só.
- Saída de hoje: FALTA só nas três CSPs com o curinga `https://*.supabase.co/...`. É o esperado.

## Task 16: o E2E inteiro e a verificação no celular

- Vermelho: `AssertionError: a única linha que liga, e só quando BZ_ENTREGA_LOCAL não é "desligada"` (o teste do servidor local, antes de mexer nele). O E2E em si foi ajustado em rodadas de depuração (r1 393 OK, 6 FALHA; r2 410 OK, 2 FALHA; r3 411 OK, 1 FALHA), todas ajuste do E2E, nenhum bug do produto.
- Verde, as quatro rodadas finais (cada uma com servidor novo): padrão 412 OK e 0 FALHA; só Pix (`MP_METODOS=pix`) 411 OK e 0 FALHA; entrega desligada 284 OK e 0 FALHA; consultor ligado com IA simulada 418 OK e 0 FALHA. Depois dos reforços, a rodada padrão: 418 OK e 0 FALHA. `verificar.mjs`: 22 OK; `acessibilidade.mjs`: "Tudo certo."; vi os PNG a 390 e a 320 px.
- O que é: `docs/e2e-previa.mjs` (os passos da prévia ao fim: D5, lista de ajustes, volta pelo link do aviso, o ar, o restante só por Pix, o concluído) e `BZ_ENTREGA_LOCAL=desligada` no servidor local.
- Desvios do plano: a página do `passoDaEntrega` não serve de aparelho do cliente (termina sem acesso ao pedido), então a prévia cria os seus aparelhos, cada um entrando pelo link de retomada de uso único; o dinheiro na tela não tem `,00`; ids reais (`#o-prv-aviso`, `#o-prv-erro-form`); o 429 do limite diário do link do pedido é esperado e contado (qualquer outro 429 é FALHA); `goto` de contexto novo passou de 30 s para 90 s.
- Depois da revisão: o texto "Seu material" deixou de repetir a Previsão depois da prévia (`leadDoMaterial`); o E2E prova a D5 com a prévia PUBLICADA (no ar sem aprovação = 409 "ainda não aprovou a prévia"), confere o fundo do `<dialog>` (cor sem transparência e nenhum blur) e exige que cada id exista UMA vez antes de dizer que "não aparece".
- Dono: nada.

## Desvios do plano que o dono precisa confirmar

1. **Mensagens do painel: copiar e colar, e não abrir o WhatsApp com o texto.** O link de retomada de uso único é segredo e nunca vai num endereço. O botão abre a conversa sem texto; o dono cola a mensagem copiada. Vale também para a fila e os lembretes antigos (mesmo componente).
2. **Prévia sem endereço válido: o cliente não aprova.** Só a frase e o WhatsApp.
3. **A tela não promete aprovação automática, prazo para responder nem lembrete** (D5). A frase do contrato "Seu site só segue depois da sua resposta." está na tela.
4. **Restante só por Pix, qualquer que seja `MP_METODOS`.** O componente da entrada (3b-1) ganhou o terceiro argumento; a entrada continua como era.
5. **A tela não cobra o restante se a entrada foi registrada e não paga** (estornada, contestada), igual ao banco (55000). É o desvio 1 do 3b-3b visto pela tela.
6. **Entrega suspensa: a tela mostra o endereço só como texto** e diz que a Beyon Zero coloca o site no ar de novo depois do pagamento, sem prazo.
7. **Entrega `encerrada` mostra `#o-fim` ("Este pedido foi encerrado")**, como o plano manda. As notas do 3b-3b diziam que a entrega `encerrada` "volta a mostrar a entrada". Não achei nada no código que reabra a entrada nesse caso. Se a intenção era outra, é uma frase sua.
8. **O código público do pedido (BZ-XXXXX) vai dentro do `?text=` dos botões de WhatsApp de `orcamento.html`** (3b-1 e 3b-2, não do 3b-3c). Contagem corrigida e medida (elementos com `data-wa`): 13 na base `4224651` e 16 agora; os 3 novos do 3b-3c são o do restante (`o-pag-indisponivel`, a variante `orc-so-restante`), o "Outra dúvida?" da prévia e o do encerrado. O `orcamento.js` põe o código em todos os `[data-wa]` da página. O revisor achou aceitável (é identificador público; o acesso é pelo código de 32 caracteres, que o E2E prova que nunca aparece). Quer manter?
9. **"Ver a prévia" e "Está bom: aprovar" com o mesmo peso visual.** Talvez "Ver a prévia" em contorno.
10. **Os textos novos (as seis mensagens do painel, a tela da prévia e a do site no ar)** passaram pela voz humana, mas o tom final é seu.
11. **O global `BZPreviaEntrega` no lugar de `BZPrevia` do plano (colisão real).** Só aviso, sem efeito para o cliente.
12. **As mensagens do painel dizem "o site sai do ar à meia-noite, no fim do 3º dia".** É a regra que o senhor decidiu em 22/10 ("quando bater 00:00 tiramos"), então ficou. A tela do cliente NÃO promete horário, porque quem suspende é o senhor, na mão. Confirme que é isto que quer dizer ao cliente.
13. **Mexi em `api/` (B1).** `previa-aprovar` agora recebe `rodada_base` (a mesma que a lista de ajustes já mandava): sem ela, 400; diferente da rodada da entrega, 409 "A prévia mudou enquanto você escrevia (outra aba?)". Antes, numa aba velha o servidor aprovava a prévia nova, que a pessoa nunca abriu. Correção mínima, sem migration; o banco ainda trava a corrida por `versao`. Quem chamar `previa-aprovar` fora da tela precisa mandar o campo.
14. **Mensagens antigas do painel (fila de modelos e lembrete dos modelos)** passaram a abrir com "Aqui é o Fernando, da Beyon Zero.", como as novas, para a voz ser uma só.

## Correções finais (revisões de segurança e técnica do branch inteiro)

Veredito da segurança: pode mesclar; nada crítico, alto ou médio. Os achados abaixo foram corrigidos em commits pequenos, cada um com o teste visto vermelho antes.

- **B1 (segurança, Baixo):** aprovar diz qual prévia a pessoa viu (`rodada_base`); o servidor recusa a aba velha com 409 e a falta do campo com 400. Testes novos na API (aba velha com a v2 publicada = 409 e a entrega segue em `previa`; o caso feliz; sem o campo) e na tela (o corpo leva `rodada_base`; a releitura troca a rodada junto com a prévia). Duas sabotagens novas (servidor ignora; tela não manda).
- **B2 (verificador):** `connect-src` virou lista do que é PERMITIDO (o próprio site, `api.mercadopago.com`, `secure-fields.mercadopago.com` e o Supabase exato); `https://*`, `wss:`, `ws:`, `data:`, `blob:`, `*.exemplo.com` e qualquer outro site viram FALTA citando a fonte. `script-src`, `style-src`, `default-src` (e as variantes `-elem`/`-attr`) recusam `'unsafe-inline'`, `'unsafe-eval'`, `*` e esquema solto. O script real continua com as mesmas 3 FALTA de antes (o curinga do Supabase), nenhuma nova.
- **B3 (verificador):** varre também `.github/workflows/*.yml` e `cloudflare/*.mjs`: qualquer menção ao `BZ_ENTREGA` fora de comentário é FALTA (nada ali tem motivo para mexer no interruptor; hoje nenhum menciona). Se o Worker um dia precisar LER o interruptor, o verificador vai dar FALTA e a regra se ajusta de propósito.
- **Info 3 e 4:** `autocomplete="off"` na lista de ajustes; comentário de `js/painel-pedido-comum.js` corrigido (o código fica só na caixa de leitura).
- **I1:** o recibo de cima só promete o material em `material`/`producao`; da prévia em diante diz "Entrada recebida." (`leadDoRecibo`). **O bloco "Seu material" (somente leitura) NÃO foi escondido** depois da produção: o `leadDoMaterial` já foi desenhado para ele continuar visível com "Recebido." (e65f060) e esconder mudaria uma decisão anterior; fica como pendência de produto.
- **I3:** nada tirado; registrado no desvio 12.
- **I4:** o aviso "A prévia está pronta" leva a `#o-previa` (passos `previa`, `ajustes`, `aprovada`, entrega ligada); a sabotagem da retomada continua batendo uma vez (e ganhou irmã).
- **Minors:** nota curta do passo 3 ("Esperando a sua resposta.", "Lista recebida."); a nota da `suspensa` usa o `limite_dias` do servidor; a tela da prévia não quebra sem `rodadas`; "Outra dúvida?" vira "Não conseguiu abrir? Fale comigo pelo WhatsApp." quando a prévia nem abriu; "O prazo do restante terminou. O Pix está logo abaixo." no lugar de "Pague agora…"; erros genéricos em voz de pessoa; mensagem de apagar o material abrindo pelo que o cliente pode fazer e dizendo "a logomarca, as fotos e os textos"; `1.500` das frases de JS vem de `MAX_LISTA` (e um teste iguala o `maxlength` do HTML, a tela e o servidor); o teste da volta à aba agora executa `orcamento-espera.js` com um DOM de mentira em vez de ler por regex.
- **Risco conhecido para o CI:** a mutação levou 62 min neste PC (202 sabotagens, ~18 s cada) e o `.github/workflows/ci.yml` tem `timeout-minutes: 45` (calculado com ~10 s por sabotagem). Não mexi no `ci.yml`; observe o primeiro CI deste PR e, se cancelar por tempo, aumente o limite ou divida a mutação.

## Pendências

- **Aviso `no_ar` de entrega `suspensa` (DESTAQUE: o senhor precisa saber antes de mandar o aviso).** A fila `?fila=avisos` não traz o passo (só conversa, código, momento, desde e contato). Se a entrega estiver `suspensa`, a mensagem "O seu site está no ar!" seria errada, e o dono precisa saber antes de mandar. Para a fila mostrar o passo, é mudança de API/banco.
- **"WhatsApp sem WhatsApp".** `painel-fila.js`, `painel-lembretes.js` e a lista de pedidos ainda mostram "sem WhatsApp (apagado pela retenção?)" para contato só com e-mail. Pré-existente; só o bloco novo foi acertado.
- **`P.data` mostra 00:00** nos avisos de material (a hora não existe no dado). Cosmético.
- **"Seu material" (somente leitura) continua visível depois da produção** (ver I1 acima): decidir se some.
- **Texto de 14 px dentro do `#o-pagamento`** (rótulos "Nome (obrigatório)", "Problema com o pagamento?...", a nota do Mercado Pago): vem do componente da entrada do 3b-1, igual na entrada, e o restante o herda. "Nome" e "Sobrenome" ficam desalinhados porque "(obrigatório)" quebra linha no segundo rótulo. Não mexi: mudaria a tela da entrada.
- **Legenda do fieldset "Trocar o telefone ou o e-mail do site"** quebra em 2 linhas e a primeira fica em cima do traço da borda (visto no celular). Detalhe de estilo.
- **Item 8 da revisão do E2E não feito.** Com `BZ_ENTREGA=ligada` já exportado no shell E `BZ_ENTREGA_LOCAL=desligada`, a entrega continua ligada no servidor local (o teste do interruptor fixa uma única linha que liga). A rodada "desligada" falharia alto (a frase do recibo e os ids escondidos não bateriam), então não passa em silêncio.
- **`docs/cpu-rotas.mjs` não existe nesta base.** A CPU das rotas novas não foi medida em milissegundos; fica para o ensaio do plano da Cloudflare. Conferência à mão: `previa-ajustes` e `previa-aprovar` = 1 leitura do estado + 1 chamada ao banco, sem arquivo nem conversão; o `pagar` do restante usa a mesma rota da entrada; as ações do painel fazem de 1 a 2 chamadas.
- **A evidência visual do `<dialog>` aberto foi só por script** (o E2E o abre, mas a foto vem depois do fechar; a ausência de blur é conferida no `::backdrop` por script e por teste). Não há PNG do dialog aberto.
- **O E2E não confere que as ações do dono ainda respondem com a entrega desligada** (a rodada desligada confere a frase do recibo e os ids escondidos). O teste de banco/API do 3b-2 e o `interruptor.test.mjs` cobrem o painel.
- **Flakes conhecidos do `e2e-orcamento.mjs`, não do 3b-3c:** um `route.fetch: socket hang up` sem `catch` no trecho "diagnóstico" (~linha 753, uma requisição em voo quando a página fecha) e a contagem instantânea `:315` do painel (endurecida com `waitFor`). O arquivo passou de 800 linhas há tempo (894); o que é novo ficou em `e2e-previa.mjs`.
- **429 do link do pedido no console.** O cliente que volta pelo aviso e já gastou o limite diário do link vê o 429 no console do navegador, sem efeito na tela. Detalhe de produto.
- **Falhas só de LCP no `verificar.mjs`** apareceram nas Tasks 13 e 14 com o PC ocupado; na Task 16, com o PC livre, 22 OK e 0 FALHA.
- **O CONFIRMAR da `/privacidade` ("quem tem autorização completa não é apagado")** segue como texto a conferir: não verifiquei se a página já diz isso.
- **Do 3b-3b, ainda abertas:** o beco do prazo vencido, a lista de ajustes de pedido preso em `ajustes` que nunca expira, `traduzirLimite` lendo `e.message`, B2, B4 e B6 (ver `pr3b3b-notas.md`, seção 2).

## O que o dono precisa fazer antes de ligar o `BZ_ENTREGA`

Resumo (a lista completa e em ordem está no item 4d de `docs/revisoes/pr1-pendencias.md`). Nada disso é feito pelo agente.

1. Rodar `node scripts/antes-de-ligar.mjs` e zerar os FALTA. Hoje só restam as três CSPs de `/orcamento` com o curinga do Supabase: dizer o endereço do projeto (`https://<projeto>.supabase.co`), trocar nos três lugares (`vercel.json`, `<meta>` de `orcamento.html` e `_headers`) e atualizar o `deepEqual` do teste "CSP do /orcamento (PR 3b-2)" em `docs/testes/csp.test.mjs`.
2. Aplicar no Supabase real as 10 migrations do 3b, em ordem (a das cinco do 3b-3 termina em `20261024120400_pr3b3_lista.sql`). Antes da 4ª do 3b-2, rodar a conferência que o verificador imprime.
3. Confirmar os desvios do 3b-3b e os do 3b-3c (as duas listas acima) e registrar a decisão em `01 Empresa/Decisões.md`.
4. Rodar o ensaio completo com Mercado Pago e Supabase de TESTE (uma entrada e um restante de teste), abrir os PNG a 390 e 320 px e, no aparelho real, um Pix de verdade de R$ 1.
5. Revisar pela voz humana os textos novos: as seis mensagens do painel, a tela da prévia, a do site no ar, o contrato e `/condicoes`.
6. Dar o subdomínio `workers.dev` da conta (`SUB_CONTA` em `docs/acesso.mjs`) para o staging abrir, e `PAINEL_CHAVE` e `BZ_BASE` só na janela do terminal.
7. Conferir a captação ao lado (material parado sem encerrar o pedido, o site sai do ar à 00:00 depois do 3º dia, `importar-site`) e o balde `material`.
8. Só então `BZ_ENTREGA=ligada` nas variáveis do Worker, junto com o 3b-1 e o 3b-2, já na Cloudflare. Mesclar não é ir ao ar.

## Números

- Suíte: 1132 testes, 1132 passam, 0 falham, 0 pulados, 0 "todo" (linha de base do 3b-3b: 1034; o 3b-3c soma 98), em 375 s, no HEAD `845435f`. Os dois testes que antes ficavam como "todo" já passam: a captação ao lado aplicou as regras de 22/10. A suíte inteira rodou duas vezes: na 1ª, 1 falha que era minha (o teste da partida da mutação recusava sabotagem de código com `para` vazio); corrigida e a 2ª ficou 1132 de 1132.
- Sabotagens novas: 28, as 28 vistas pegas antes da rodada completa (cada uma aponta para um arquivo de teste; a lista está em `docs/testes/mutacao.mjs`, entradas "(3b-3c)"). Uma primeira versão (a do `http:` e da porta no endereço do site) escapou porque o esquema já recusava os dois antes; trocada por "aceita caminho, consulta e #", que é pega. Quatro sabotagens de código com `para` vazio faziam o teste da partida da mutação acusar "já sabotado": passaram a ter um comentário no lugar.
- Mutação: 202 de 202 sabotagens pegas (174 do 3b-3b + 28 novas), em 3727 s (62 min) neste PC, uma só rodada completa, `git status` limpo no fim. **Atenção ao CI:** o `ci.yml` tem `timeout-minutes: 45` (calculado com ~10 s por sabotagem, 174 sabotagens, ~30 min). Aqui a média foi de 18 s por sabotagem; no runner do GitHub, a ~10 s cada, são ~34 min, mas com folga curta. Se o CI cancelar no meio, o caminho é subir o timeout (60) ou dividir a mutação em duas rodadas com `BZ_MUTACAO_FILTRO`. O 3b-3c não mexeu no `ci.yml`.
- Correções finais (passada depois das revisões, a partir do HEAD `38e3e6a`): +7 sabotagens (B1 x2, B2 x2, B3, I1 e I4), todas vistas pegas com `BZ_MUTACAO_FILTRO`; total medido por contagem de `SABOTAGENS`: 209. A suíte inteira e a mutação completa NÃO foram rodadas nesta passada (o controlador roda): os números de 1132 testes e 202 sabotagens acima são do HEAD `845435f` e ficam desatualizados até lá. Medido nesta passada: os 14 arquivos de teste que cobrem o que mudou, 250 testes, 250 passam, 0 falham.
- Nível de risco: 3 (sensível: dinheiro, banco, segurança). Evidência exigida: Especificação, Visto rodando (Task 16), Regressão (a suíte), Verificação comportamental, Teste visto vermelho (cada tarefa), Revisão técnica e Revisão de segurança por agente diferente do autor.
- Migrations novas: nenhuma. Nada aplicado em banco real. Não feito, por ordem: push, PR, merge, ligar o `BZ_ENTREGA`.
