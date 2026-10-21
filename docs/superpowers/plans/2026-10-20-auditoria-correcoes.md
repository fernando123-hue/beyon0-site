# PR de correções da auditoria (run-1) — plano

Fonte: `C:\Vault - Fernando\Beyon Zero\06 Operação\Auditoria de segurança\run-1\` — `findings.json` (registros
verificados, com `validation_plan.local` de cada um), `NEEDS-VALIDATION.md` (pistas 1, 2, 4, 6) e
`findings-pt.json` (correção sugerida). Branch `auditoria-correcoes` a partir de `origin/main` `8b87d47` (PR 3a já
dentro). Nível 3 (api/, supabase/, .vercelignore): revisão técnica e de segurança por agentes diferentes.

**Fato novo (20/10):** a produção ainda é a versão sem API (`/api/vendas` → 404). Nada do fluxo novo está no ar; a
promoção de `59c5830` + este PR vão juntos. Por isso não há código antigo a proteger: a "porta antiga" que a
migration do PR 3a deixou aberta de propósito pode fechar já (Task 5).

Regra de todas as tasks: TDD (teste vermelho visto e registrado com a linha exata ANTES do código), migration NOVA
(`supabase/migrations/20261020120000_auditoria_correcoes.sql`; as anteriores não mudam), mensagens e comentários em
português no estilo do repositório, um commit por task.

## Revisão do plano (20/10): OBRIGATÓRIA, vale por cima do texto das tasks

Revisão completa, com arquivo:linha e a lista de passos corrigida de cada task:
`.superpowers/sdd/auditoria-plano-revisao.md`. Onde ela e o texto abaixo divergirem, **vale a revisão**. Resumo:

- **T1:** sem a linha literal `restauracao.sql` no `.vercelignore` (o `csp.test.mjs:86-88` exige redirect para cada
  linha sem `*`); só `*.sql`, `*.dump`, `*.7z`. Acrescentar `*.7z` também ao `.gitignore`.
- **T2:** o vermelho precisa de `TETOS.conversas_por_ip48_dia + 1` conversas do mesmo /48 (a última recusada). O `uso`
  da chave /48 do consultor é **'ia48'** (não 'pedido48', senão consultor e pedido dividem o contador). Mesmo `agora`
  nas duas chaves; /48 mal formada → 22023, sem padrão mágico no SQL. Conferir a conta do teto (16 × 1,5 = 24 < 25).
- **T3:** reescrever `fluxo-api.test.mjs:559-566` (hoje fixa o teto com `custo_ia_usd = 30`) sobre `ia_chamadas`, em
  arquivo de teste NOVO (o `fluxo-api` tem 838 linhas). `ia_chamadas` só aceita inserção: testes com gasto de hoje
  usam banco próprio, com esse caso por último. **Fechar a janela sem conta:** gravar o registro da chamada em
  `comReserva` ANTES de liberar a reserva (`fluxo.mjs:213-215` × `379-381`); se a gravação falhar, não liberar.
  Uma função privada única para o gasto do dia, usada por `vendas_custo_dia` e `vendas_reservar_custo`; manter o
  `coalesce` (slug desconhecido não pode virar NULL/500). O índice já existe (`ia_chamadas.sql:31`): não criar outro.
- **T4:** um teste vermelho POR camada: (a) `consultor.test.mjs:334-335` (ferramentas por etapa); (b) banco devolve
  55000 para estimativa em `escolhida`; (c) fluxo com `criarSimulada` chamando `estimar` (`simulado.mjs:77-82` não olha
  a lista de ferramentas). Lista positiva `ETAPAS_COM_PRECO` num lugar só. Prompt: a regra é "até a confirmação do
  pedido pelo WhatsApp" (a etapa `contato` continua estimando), texto fixo (cache), trechos `consultor.mjs` 91, 106,
  107, 132, 167, 191, respeitando os testes que fixam o prompt (`consultor.test.mjs:225`, `222-239`, `281`).
- **T5:** atualizar as chamadas de teste que usam a porta antiga sem `origem`: `ajustes-banco.test.mjs:73`, `86-87` e
  `vendas-banco.test.mjs:51` (esta monta escopo/confirmação/cobrança de vários testes do arquivo). Apontar as
  sabotagens `mutacao.mjs:58-59` e `64-65` para a migration nova (senão os mutantes sobrevivem).
- **Docs:** riscar `pr1-pendencias.md:191` (PR3a-consultor-preco), ajustar a `227`, pôr a migration nova na lista
  `38-41`; atualizar `docs/fase2/03-STATUS.md:90-91`.

## Task 1 — backup fora do deploy pela CLI (pista 6)

- `.vercelignore`: acrescentar `*.sql`, `*.dump`, `*.7z` e `restauracao.sql` (com o comentário de por quê, junto do
  `.env*`). Conferir que nada que o site serve termina assim (o `supabase/` já está fora).
- `docs/fundacao/02-OPERACAO.md` §5: gravar o dump e o `restauracao.sql` FORA da pasta do projeto (ex.:
  `%USERPROFILE%\BeyonZero-backup\`) e apagar o `restauracao.sql` logo depois do uso.
- Teste (em `docs/testes/csp.test.mjs` ou arquivo novo pequeno): o `.vercelignore` cobre `.env*`, `*.sql`, `*.dump`,
  `*.7z`. Vermelho antes.

## Task 2 — limite diário do consultor também por /48 (pista 1)

Registro: `api/_vendas/ip.mjs:ai-daily-ip-counter-keyed-on-ipv6-64-only`.
- `api/_vendas/fluxo.mjs` `reservarIa`: passar também `chave_ip48: chaveDoIp48(ip, ...)` (como `fluxo-pedido.mjs:63`)
  e `max_por_ip48` (constante nova em `api/_ia/config.mjs` `TETOS`, ex. `conversas_por_ip48_dia: 16`, com o porquê no
  comentário de `config.mjs:53-55`).
- Migration: redefinir `app.vendas_reservar_ia` para contar também a chave /48 (mesmo `privado.contar_ip`/`freio_ip`
  ou equivalente; uma vez por conversa, como hoje com `ip_contado`), recusando com o mesmo motivo `freio_ip`. Chave
  /48 nula (IPv4) = só a regra de hoje. Manter SECURITY DEFINER, `search_path = ''`, grants iguais.
- Teste PGlite (estilo `auditoria-p0`): 9 conversas com chaves de nove /64 do MESMO /48 → hoje as 9 passam
  (vermelho); depois, a 17ª (ou a que passar do teto /48) recebe `freio_ip`; IPv4 segue no teto de 8.

## Task 3 — teto do dia pelo gasto real do dia (pista 2)

Registro: `supabase/migrations/20261007120400_vendas_api.sql:vendas_custo_dia:lifetime-cost-by-ultima_atividade`.
- Migration: `app.vendas_custo_dia` e o cálculo do dia em `app.vendas_reservar_custo` passam a somar
  `app.ia_chamadas.custo_usd` com `created_at` desde a meia-noite de São Paulo (mais as reservas abertas, como hoje
  em `vendas_reservar_custo`), em vez do `custo_ia_usd` da vida inteira das conversas tocadas hoje. Índice
  `ia_chamadas (org_id, created_at)`.
- Teste PGlite: conversas com `custo_ia_usd` somando ≥ 25 e `ultima_atividade` de 2 dias atrás; `confirmar-pacote`
  em cada (sem IA) → hoje `vendas_custo_dia` ≥ 25 e um visitante novo recebe 503 (vermelho); depois, 0 e o visitante
  novo passa. E o caso certo continua: chamadas reais de hoje somando 25 → `dia`.

## Task 4 — consultor não recalcula o preço depois da escolha (pista 4)

Registro: `supabase/migrations/20261015120000_pr2b_ajustes.sql:vendas_registrar_estimativa:reestimativa-apos-escolha`.
- `api/_vendas/consultor.mjs` `ferramentas()`: em `direcoes`/`escolhida`/`alteracoes` (e etapas de geração), não
  entregar `estimar` nem `pedir_contato`. Ajustar `docs/testes/consultor.test.mjs:~329` (hoje fixa 5 ferramentas em
  `alteracoes`).
- `api/_vendas/agente.mjs`: recusar `estimar` fora das etapas permitidas (defesa em profundidade, mesmo que o modelo
  insista).
- `api/_vendas/fluxo.mjs` `turno`: gravar estimativa só em `descoberta`/`estimativa`/`contato`.
- Prompt (`consultor.mjs` ~106-132, 191): "recalcular"/"chame estimar de novo" só antes do contato.
- Migration: `app.vendas_registrar_estimativa` deixa de aceitar `direcoes`/`escolhida`/`alteracoes`.
- Teste: IA simulada que chama `estimar` depois da escolha → hoje grava estimativa nova (vermelho); depois, nenhuma
  estimativa nova e o escopo sai da estimativa de antes.

## Task 5 — fechar a porta antiga do ajuste pela IA (segurança #1 do PR 3a)

`supabase/migrations/20261017120000_pr3a_ajustes.sql:58,89`: sem `origem`, `vendas_registrar_alteracao` assume 'ia',
sem teto de 30 e aceitando `estimativa`. Com a produção sem API, não há código antigo a proteger.
- Migration: `vendas_registrar_alteracao` exige `origem = 'opcao'` (ou o que o PR 3a usa), recusa a chave
  `estimativa` (22023) e deixa de chamar `vendas_registrar_estimativa`. Se a Task 4 já tirou as etapas pós-escolha de
  `vendas_registrar_estimativa`, conferir que nada mais dependia dessa chamada.
- Teste PGlite: chamar sem `origem` / com `origem 'ia'` / com `estimativa` → recusado; a opção pronta continua.
- Riscar a linha PR3a correspondente em `docs/revisoes/pr1-pendencias.md` ("feito no PR de correções da auditoria").

## Fim do PR

- Suíte (`testar`), mutação (`testar:mutacao`; acrescentar 1 sabotagem por task de banco: sem /48, soma da vida
  inteira, estimar aceito depois da escolha, origem 'ia' aceita), E2E sem e com consultor, `verificar` e
  `acessibilidade` (a tela não muda, mas o consultor muda de ferramentas).
- `docs/revisoes/pr1-pendencias.md`: as pistas 1, 2, 4 e 6 da auditoria como feitas; 3, 5, 7, 8, 9 seguem abertas
  (citar `06 Operação/Auditoria de segurança/run-1/NEEDS-VALIDATION.md`).
- Dono, antes de promover: aplicar também `20261020120000_auditoria_correcoes.sql` (depois da do PR 3a).
