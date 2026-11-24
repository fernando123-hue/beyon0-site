# Fundação de Dados — Operação (2026-10-06)

Como montar, mudar, testar, proteger e recuperar o banco. A arquitetura e o porquê estão em `01-ARQUITETURA.md`.

## 1. Migrations

- Ficam em `supabase/migrations/`, no formato do Supabase CLI: `AAAAMMDDHHMMSS_nome.sql`. Rodam em ordem de nome, uma vez cada.
- **Toda mudança de estrutura é uma migration nova.** Nunca se edita uma migration já aplicada, e nada se muda à mão no painel do Supabase.
- Hoje são seis:

| Arquivo | O que cria |
|---|---|
| `…120000_esquemas.sql` | Os esquemas `app`, `metricas` e `privado`, sem nenhuma concessão por padrão. |
| `…120100_metricas.sql` | As métricas anônimas do site: só o backend acessa. |
| `…120200_app_nucleo.sql` | Organizações, membros, as funções de segurança e os gatilhos comuns. |
| `…120300_app_comercial.sql` | Clientes, leads, projetos, briefings, propostas e revisões. |
| `…120400_app_auditoria.sql` | A auditoria e o gatilho que a alimenta. |
| `…120500_app_rls.sql` | As concessões por papel e as 31 políticas de RLS. |

**Prova de que é reproduzível:** `npm run testar` cria um Postgres vazio, aplica as seis migrations do zero e confere o estado final em cada execução.

### Para acrescentar uma tabela ao `app` (lista de conferência)

1. Coluna `org_id uuid not null references app.organizacoes (id) on delete cascade` e `unique (org_id, id)`.
2. Chaves estrangeiras para outras tabelas do `app` **compostas**: `(org_id, x_id) references app.x (org_id, id)`.
3. Colunas `created_at`, `updated_at`, `created_by` e `updated_by`, com os gatilhos `privado.carimbar` e `privado.org_imutavel`.
4. O gatilho `privado.auditar('campo_seguro', …)`, listando só campos sem dado pessoal.
5. As concessões para `authenticated` e `service_role`, e o RLS com as quatro políticas (ler, criar, editar e apagar).
6. Toda função nova com `revoke all on function … from public, anon` explícito. O Postgres dá EXECUTE a todos por padrão, e o teste "nenhuma função executável por PUBLIC" falha se alguma esquecer.
7. Testes no `docs/testes/banco.test.mjs` (o permitido e o recusado) e uma sabotagem no `docs/testes/mutacao.mjs`.

## 2. Testes

```bash
npm run testar
```

Roda os três conjuntos:

- métricas: 9 testes;
- API: 9 testes de autenticação, validação, autorização, erros e freio de taxa;
- banco: 15 testes de integridade, isolamento entre organizações, papéis, acesso anônimo, auditoria, restauração e permissões de função, com Postgres de verdade (PGlite) e as migrations reais.

```bash
npm run testar:mutacao
```

Sabota as migrations de seis jeitos e confere que os testes falham em todos:

- leitura aberta;
- anônimo com acesso;
- chave estrangeira sem a organização;
- membro comum podendo apagar;
- função nova executável por todos;
- auditoria copiando dado pessoal.

Não precisa de Docker nem de conta no Supabase.

**Limite conhecido:** a camada de teste imita o Supabase (papéis `anon`, `authenticated` e `service_role`, e a função `auth.uid()`), mas não é o Supabase. Ela não cobre:

- a troca de papel do PostgREST (role `authenticator`);
- as concessões automáticas que o Supabase dá no `public`;
- o fato de que lá as migrations rodam como `postgres`, sem superusuário. Para RLS e SECURITY DEFINER o efeito é o mesmo.

Depois de aplicar as migrations num projeto real, rode a conferência da seção 4.4.

## 3. Variáveis e segredos

A lista sem valores está em `.env.example`.

| Variável | Onde fica (Cloudflare, desde o PR C) | Observação |
|---|---|---|
| `SUPABASE_URL` | Produção (Worker `beyon-zero-site`); staging e prévias (Worker `beyon-zero-site-previa`) com o projeto de staging | Endereço do projeto. |
| `SUPABASE_CHAVE_PUBLICA` | Produção e prévias | `sb_publishable_…`. Usada com o JWT do usuário; o RLS vale. |
| `SUPABASE_CHAVE_SECRETA` | Produção, e prévias com a chave de staging | `sb_secret_…`. Ignora o RLS. Só no servidor. |
| `PAINEL_CHAVE` | Produção | Pelo menos 32 caracteres aleatórios. |
| `METRICAS_HOSTS` | `wrangler.jsonc` (vazio) | Outros domínios aceitos no `/api/evento`. |

Regras:

- **Nenhum segredo no código, no git, no navegador ou no log.** Os testes conferem que a chave secreta nunca vai numa chamada feita em nome do usuário e que o log não leva token nem dado pessoal.
- **Use as chaves novas** (`sb_publishable_` e `sb_secret_`). As antigas (`anon` e `service_role`, em formato JWT) estão sendo descontinuadas pelo Supabase até o fim de 2026. O código ainda aceita as antigas, por segurança.
- **Se uma chave vazar:** gere outra no Supabase (API Keys), troque no Worker (Workers & Pages › Settings › Variables and Secrets), publique de novo e apague a antiga.
- **O arquivo local de variáveis** (`.env.local`, ou o `.dev.vars` do Wrangler) fica só na máquina: o `.gitignore` o exclui e o `montar-publico` não o sobe como asset. Pode ser apagado quando não for mais usado.

## 4. Montar os ambientes

### 4.1 Local (sem conta)

```bash
npm install
npm run testar
```

O site local roda com `npm run servir`. As funções de `/api` respondem com um banco em memória para as métricas. O `/api/leads` responde "indisponível" localmente, porque não há Supabase.

### 4.2 Staging (recomendado antes de produção)

1. No Supabase, crie um **segundo projeto**, `beyon-zero-staging`, na região São Paulo (`sa-east-1`). O plano grátis permite dois projetos.
2. Aplique as migrations nele (seção 4.3).
3. No Worker `beyon-zero-site-previa` (segredos do Worker **e** os segredos-base das Previews): `SUPABASE_URL`, `SUPABASE_CHAVE_PUBLICA` e `SUPABASE_CHAVE_SECRETA` deste projeto.
4. **Nunca copie dados de produção para o staging.** Use dados inventados.

### 4.3 Produção

1. Crie o projeto `beyon-zero` no Supabase, região **São Paulo**. Use uma senha forte de banco e guarde-a no gerenciador de senhas; ela não vai para a Cloudflare.
2. Aplique as migrations pelo Supabase CLI (precisa de Node, não de Docker):

   ```bash
   npx supabase@2 login
   ```
   ```bash
   npx supabase@2 init
   ```
   ```bash
   npx supabase@2 link --project-ref SEU_PROJECT_REF
   ```
   ```bash
   npx supabase@2 db push
   ```

   O `init` só cria `supabase/config.toml` e não mexe nas migrations. O `db push` aplica as migrations de `supabase/migrations` e registra cada uma no histórico do projeto. Daqui em diante, toda migration nova sobe pelo mesmo comando.
3. Em **Settings › Data API › Exposed schemas**, acrescente `app` e `metricas`. O `privado` **nunca** entra nessa lista.
4. **Superado pela Fase 2 (login anônimo LIGADO, cadastro aberto desligado; `docs/fase2/02-OPERACAO.md`).** Em **Authentication › Sign In / Providers**, mantenha o **cadastro aberto desligado** ("Allow new users to sign up") e o **login anônimo ligado** (o orçamento abre a sessão do visitante). Em **Authentication › Rate Limits**, ligue **IP Address Forwarding**: o Worker repassa o IP do visitante e, sem a opção, todos dividem o limite do IP da Cloudflare. O texto original desta etapa, "só entra quem o dono convidar", valia antes do orçamento. Mesmo que alguém se cadastrasse, sem ser membro de uma organização não veria nada, mas falaria direto com a API; desligar diminui a superfície.
5. Crie a organização e o primeiro dono, no **SQL Editor**, como `postgres`:
   - convide o seu e-mail em **Authentication › Users › Invite** e aceite o convite;
   - rode, trocando o e-mail:
   ```sql
   insert into app.organizacoes (slug, nome) values ('beyon-zero', 'Beyon Zero');
   insert into app.membros (org_id, user_id, papel)
   select o.id, u.id, 'dono' from app.organizacoes o, auth.users u
   where o.slug = 'beyon-zero' and u.email = 'SEU_EMAIL';
   ```
6. Segredos no Worker de produção `beyon-zero-site` (seção 3). Publique pela promoção (PR "Promover para produção", `docs/PROCESSO.md`).
7. Na **zona `beyonzero.com.br`** (Security › WAF › Rate limiting rules; o plano grátis tem 1 regra), crie a regra de limite por IP para todo `/api/*`: 10 pedidos em 10 s, bloqueio de 10 s. O freio dentro das funções vale por instância; a regra da zona vale para todas. No grátis nenhuma regra protege a cota diária do Worker (dois IPs a esgotam). Detalhes e valores: plano da migração, § 7.1.

### 4.4 Conferência depois de aplicar num projeto real

No SQL Editor:

```sql
-- toda tabela de app e metricas com RLS ligado (deve voltar vazio)
select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('app', 'metricas') and c.relkind = 'r' and not c.relrowsecurity;

-- anon sem nenhuma concessão nesses esquemas (deve voltar vazio)
select table_schema, table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_schema in ('app', 'metricas', 'privado');

-- quem tem acesso: em app só authenticated e service_role; em metricas só service_role
select table_schema, grantee, string_agg(distinct privilege_type, ', ') from information_schema.role_table_grants
where table_schema in ('app', 'metricas') and grantee not in ('postgres') group by 1, 2 order by 1, 2;

-- permissões padrão para objetos FUTUROS (anon e authenticated não podem aparecer para app nem metricas)
select * from pg_default_acl;
```

Depois, com a chave publicável e **sem login**:

```bash
curl -s "https://SEU_PROJETO.supabase.co/rest/v1/clientes?select=id" -H "apikey: SUA_CHAVE_PUBLICAVEL" -H "Accept-Profile: app"
```

A resposta tem de ser **erro de permissão**, nunca dados.

### 4.5 O vigia (auto-reparo, 2026-11-15)

O cron horário do Worker confere o site nas horas sem reconciliação (spec
`docs/superpowers/specs/2026-11-15-auto-reparo-design.md`). Ele **não chama IA**. Precisa da migration
`20261115120000_vigia.sql` aplicada **antes** da promoção que leva o código ao ar; sem ela, o vigia fica sem memória e manda, só às 01, 07, 13 e
19 h UTC, o e-mail "O vigia do site está sem a tabela dele no banco…" (com o que ele conseguiu conferir sozinho).

- **Primeiro e-mail:** "O vigia do site está ligado…", na primeira ronda depois da promoção (até ~2 h). É o teste de
  ponta a ponta. Se não chegar em 3 h, procure `"origem":"vigia"` nos logs do Worker de produção (`enviado: false` =
  o canal de e-mail falhou; `migration do vigia` = falta a migration).
- **Depois:** só escreve quando algo quebra (páginas, configuração, banco, conferência dos pagamentos, rotina diária,
  alertas urgentes do painel, IA falhando nas conversas, conta da IA recusada) ou volta ao normal; lembra a cada 24 h o
  que continua quebrado.
- **Banco fora:** sem memória, avisa só às 01, 07, 13 e 19 h UTC.
- **Zerar a memória** (o próximo e-mail volta a ser o de estreia): `delete from app.vigia;` no SQL Editor (só o dono).

## 5. Backup e recuperação

**O que o Supabase oferece** (documentação oficial, 2026-10):

| Plano | Backup automático | Retenção | Recuperação a qualquer instante |
|---|---|---|---|
| Free | **Nenhum** | — | Não |
| Pro (US$ 25 por mês) | Diário | 7 dias | Complemento pago, com perda máxima de ~2 minutos |
| Team | Diário | 14 dias | Complemento pago |

Restaurar deixa o projeto fora do ar durante o processo.

**Recomendação:**

- **Enquanto só houver métricas anônimas:** o plano grátis serve, com cópia manual semanal.
- **Antes de guardar o primeiro cliente de verdade:** plano **Pro**, com backup diário de 7 dias, e a cópia mensal fora do Supabase. Decisão do dono.

**Cópia manual (fora do Supabase):**

- Instale o cliente do PostgreSQL 17 (só o `pg_dump` e o `psql`).
- A connection string está em **Connect › Session pooler**. É um segredo: ela não vai para o repositório nem para a Vercel.

- Grave o dump e o `restauracao.sql` **fora da pasta do projeto** (por exemplo, `%USERPROFILE%\BeyonZero-backup\`): um deploy feito pela CLI a partir da pasta do projeto envia o que estiver nela, e um arquivo ali dentro iria junto (auditoria de segurança, 20/10/2026). O `.gitignore` (e, enquanto existir, o `.vercelignore`) também barram `*.dump`, `*.sql` e `*.7z`, mas a pasta de fora é a garantia. Os comandos abaixo são para o **Git Bash** (onde `$USERPROFILE` funciona; no PowerShell é `$env:USERPROFILE`, e no CMD, `%USERPROFILE%`). O `pg_dump --file` não cria a pasta: crie antes.

```bash
mkdir -p "$USERPROFILE/BeyonZero-backup"
pg_dump "CONNECTION_STRING" --schema=app --schema=metricas --format=custom --file="$USERPROFILE/BeyonZero-backup/beyon-zero-AAAA-MM-DD.dump"
```

- Guarde o arquivo **criptografado** (por exemplo, 7-Zip com AES-256 e senha no gerenciador de senhas), fora do computador do dia a dia.
- Mantenha 4 cópias semanais e 3 mensais e apague as mais antigas. Os dados pessoais seguem a retenção prometida na política de privacidade.

**Como restaurar:**

- **Pelo backup do Supabase (Pro):** Database › Backups › escolher o dia › Restore.
- **Pela cópia manual:** num projeto vazio com as migrations aplicadas, gere o SQL dos dados e rode-o com o **modo restauração** ligado, numa transação só. Sem esse modo, os gatilhos trocariam as datas e a autoria originais pela hora da restauração e criariam auditoria falsa. O modo só vale sem usuário logado, então nenhuma requisição da API consegue ligá-lo.

```bash
pg_restore --data-only --no-owner -f "$USERPROFILE/BeyonZero-backup/restauracao.sql" "$USERPROFILE/BeyonZero-backup/beyon-zero-AAAA-MM-DD.dump"
```
```bash
psql "CONNECTION_STRING_DO_DESTINO" --single-transaction -v ON_ERROR_STOP=1 -c "set local bz.restaurando = on" -f "$USERPROFILE/BeyonZero-backup/restauracao.sql"
```

`set local` dentro de uma transação só: o modo não vaza para outra sessão pelo pooler. Com o modo ligado, o gatilho de auditoria fica desligado, então **anote a restauração fora do banco** (data, arquivo, quem fez). **Apague o `restauracao.sql` logo depois do uso**: ele tem os dados em texto aberto. O `.gitignore` ignora `*.dump`, `*.7z` e `restauracao.sql`, e o `.vercelignore` tira `*.dump`, `*.sql` e `*.7z` do deploy feito pela CLI.

**Como validar a restauração (uma vez por mês, no staging):**

1. Restaure a cópia mais recente no projeto de staging.
2. Rode a conferência da seção 4.4.
3. Compare as contagens com a produção:

```sql
select 'clientes', count(*) from app.clientes
union all select 'leads', count(*) from app.leads
union all select 'projetos', count(*) from app.projetos
union all select 'paginas', count(*) from metricas.paginas;
```

4. Apague os dados do staging depois. Ele não guarda dado real.

Um backup que nunca foi restaurado não está provado.

## 5.1 Pedido de exclusão (LGPD) e o último dono

- **Apagar um cliente ou lead a pedido da pessoa:** apague no banco, não arquive. Um cliente com projeto ou com lead "ganho" não se apaga sozinho. Apague (ou desligue) primeiro o que depende dele. A auditoria guarda que houve a exclusão, mas não guarda nome, e-mail nem telefone.
- **Apagar um usuário do Supabase Auth** que é o **único dono** de uma organização é recusado pelo banco, de propósito: a organização não pode ficar sem dono. Promova outro membro a dono antes, e então apague o usuário.

## 5.2 Entrega bloqueada: o material fica 60 dias; como destravar à mão (20/11)

- **O que bloqueia a entrega** (`privado.entrega_bloqueada`): entrada estornada, estornada em parte, contestada ou em estado não reconhecido depois de aprovada; restante estornado, contestado ou pago com a order suja; **projeto `pausado` ou `cancelado`**.
- **O material do cliente (arquivos e campos) fica guardado por 60 dias a partir do bloqueio e depois entra na limpeza normal.** A contagem é por data de Campo Grande: o dia do bloqueio é o dia 0 e no dia 60 o material já entra na limpeza. No 53º dia a rotina diária grava o alerta `material_bloqueado` (só contagem); o `listar` do terminal mostra `bloqueada_desde` e a data a partir da qual o material será apagado. Desbloqueada a entrega, volta a regra de sempre. Se o dono encerrar o pedido por desistência, o material sai no dia seguinte.
- **A data do bloqueio é a marca `status_em`** (tentativas, pagamentos e projetos): só anda quando o STATUS muda. A reconciliação que reconsulta o mesmo estorno a cada hora NÃO reinicia os 60 dias (`updated_at` não serve: o carimbo o mexe em todo UPDATE). Linhas anteriores à marca usam `updated_at`.
- **A pausa manual do dono também conta.** Pausar ou cancelar o projeto à mão (sem nenhum estorno) bloqueia a entrega e inicia os 60 dias do material, por decisão do dono. Antes de pausar um projeto de cliente que ainda vai voltar, saiba que esse relógio começa; reativar o projeto (`em_producao`) o cancela.
- **Sem botão no painel.** A contestação REVERTIDA a favor da Beyon devolve o pagamento a `pago`; só destrava SOZINHA quando o pedido não tem projeto a reativar. Com projeto, o projeto segue `pausado` até alguém reativar à mão (falha fechada). Destravar à mão = o dono avisa e o agente roda um programa pequeno no banco (nunca SQL solto): reativar o projeto (`app.projetos.status = 'em_producao'`) e, se for o caso, reaplicar o retrato `contestada_revertida` da order.
- **Atenção: isso NÃO vale para estorno parcial confirmado.** O estorno parcial é dinheiro que voltou ao cliente: a entrada deixa de estar quitada e a entrega só destrava se a tentativa for marcada `contestada_revertida` por decisão do dono depois de conferir no Mercado Pago. Estorno inteiro nunca destrava.
- **O Pix do restante já emitido** não aparece mais na tela quando a entrega bloqueia, e o banco manda o servidor cancelar a order no provedor quando a entrada cai (melhor esforço: se o cancelamento falhar, só o log e a trilha registram; o Pix expira sozinho). Se o cliente pagar mesmo assim, o dinheiro entra e nada vai ao ar: o dono é avisado na hora e o rastro vai para a rotina diária (devolver no Mercado Pago).
- **Alarme do site parado:** `aprovada` com o restante pago há mais de 2 dias corridos (`LIMITES.site_parado_dias`) gera o alerta urgente `site_parado` na rotina diária e uma linha no `listar`; o prazo da Beyon parou na aprovação e esse é o único aviso de que o site precisa ir ao ar.

## 5.3 Desistência pelo cliente em 7 dias: a entrada volta sozinha (20/11)

- **Onde o cliente clica:** em `/orcamento`, no fim da página (depois do fim do pedido, antes da planta do site), um link de texto pequeno: "Preciso desistir da compra". De propósito discreto (dono: "o reembolso não é algo que deva ser facilitado"): a tela principal nunca fala em reembolso nem devolução e o botão que devolve só nasce depois do toque no link. O painel diz o que acontece e tem "Confirmar desistência e devolver a entrada" e "Voltar"; só o segundo botão chama o servidor.
- **Quando a opção existe** (decide o banco, `privado.desistencia_motivo`; a tela só obedece a `entrega.pode_desistir`): a entrada paga e limpa; até **7 dias mais 3 horas** (margem a favor do cliente) contados da marca MAIS ANTIGA entre a aceitação da proposta e o pagamento da entrada; o restante NÃO pago (nem contestado ou estornado); o passo ainda é material, produção, prévia, ajustes ou prévia aprovada (site fora do ar, suspenso, concluído ou encerrado: não); a entrega não está bloqueada; nenhuma desistência anterior. Fora disso a pessoa lê uma frase com o recado e NADA é estornado (cai no caminho de sempre: o dono, à mão).
- **O que o servidor faz** (`api/_pagamentos/desistencia.mjs`, ação `desistir` de `/api/vendas`): sessão do cliente, `app.desistencia_preparar` (decide e reserva, UMA por pedido, trava de 2 minutos para duplo clique), consulta a order no Mercado Pago e confere conta, valor, referência e estado "aprovada", estorno TOTAL com a chave `dsc-<tentativa>`, nova consulta, `pagamentos_aplicar` (bloqueia a entrega, cancela o Pix do restante, avisa o dono) e `vendas_encerrar` com motivo `desistencia` (o material sai no dia seguinte). O valor devolvido é sempre o da order paga; nada vem da requisição.
- **Se algo falhar:** o Mercado Pago recusa ou cai antes do estorno: nada é dado como devolvido nem encerrado, a trava solta, o dono recebe `desistencia_falhou` (e o cliente, a frase com o recado); a nova tentativa usa a MESMA chave, só dentro de 24 horas do pedido e até 3 falhas (depois, a equipe resolve à mão: a janela de 7 dias não reabre por causa de uma falha). Erro de tempo ou de rede no POST do estorno: a order é reconsultada antes de dizer qualquer coisa. Antes de estornar, o Pix do restante aberto é CANCELADO e o banco confere de novo que o restante não foi pago (senão, nada é estornado); com a desistência pedida, nenhuma cobrança nova do restante abre. **A reconciliação (cron de 3 em 3 h) ACABA o que ficou pela metade** (queda entre o estorno e o encerramento, resposta que não voltou, pedido que não encerrou): `app.desistencia_pendentes` (pedida há mais de 10 min e menos de 3 dias) e, se a order já está estornada, aplica e encerra; **nunca estorna sozinha**. O estorno saiu mas a reconsulta falhou: a desistência fica `pedida`, a nova tentativa vê a order já estornada e só conclui (nunca estorna duas vezes). O estorno saiu e o pedido não encerrou (p. ex. Pix do restante que não saiu do ar): o dono recebe `desistencia_nao_encerrada`; é só `encerrar BZ-… desistencia` pelo painel.
- **Desistência que ficou `pedida` e o cliente não quer mais (ou travou):** só o dono resolve, à mão: o agente roda um programa pequeno no banco (nunca SQL solto) que apaga a linha de `app.desistencias` daquele pedido (a cobrança do restante volta a abrir) ou, se a entrada já foi devolvida, encerra o pedido pelo painel (`encerrar BZ-… desistencia`). Linhas `pedida` ou `estornada` com mais de 3 dias saem da rotina da reconciliação sem alerta próprio: o aviso `desistencia`/`desistencia_falhou` do dia é o rastro.
- **Rastro:** `app.desistencias` (status `pedida`, `estornada`, `concluida`, tentativas, falhas, carimbos). O alerta do estorno da entrada vira `desistencia` (e-mail "o cliente desistiu dentro dos 7 dias e a entrada foi devolvida"), nunca "estorno" nem "contestação".
- **Pendência de outro repositório:** a captação (`config/entrega.json`) sobe `condicoes_versao` para `2026-11-21` junto com `/condicoes` (o texto ganhou "você também pode desistir pelo próprio pedido, em Seu pedido").

## 6. Próxima fase: Infisical (só com autorização do dono)

1. Criar o projeto `beyon-zero` no Infisical com três ambientes: `dev`, `staging` e `prod`.
2. Cadastrar as variáveis do `.env.example` em cada ambiente, com os valores de cada projeto do Supabase.
3. Ligar a **integração Infisical → Vercel**, que sincroniza os segredos nos ambientes Development, Preview e Production. O Infisical vira a fonte da verdade; a Vercel só recebe.
4. Apagar os valores cadastrados à mão na Vercel depois da primeira sincronização conferida.
5. Na máquina local, trocar `vercel env pull` por `infisical run -- npm run …`. Nenhum `.env` com valor real no disco.
6. Definir quem acessa cada ambiente (o dono em `prod`) e ligar o registro de acesso do Infisical.
7. Rotação: a chave secreta do Supabase e a `PAINEL_CHAVE` com um procedimento escrito, a cada 90 dias ou num vazamento.

O código não muda: ele já lê tudo de `process.env`, com os nomes do `.env.example`.
