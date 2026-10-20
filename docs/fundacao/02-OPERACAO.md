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

| Variável | Ambiente na Vercel | Observação |
|---|---|---|
| `SUPABASE_URL` | Production, e Preview com o projeto de staging | Endereço do projeto. |
| `SUPABASE_CHAVE_PUBLICA` | Production e Preview | `sb_publishable_…`. Usada com o JWT do usuário; o RLS vale. |
| `SUPABASE_CHAVE_SECRETA` | Production, e Preview com a chave de staging | `sb_secret_…`. Ignora o RLS. Só no servidor. |
| `PAINEL_CHAVE` | Production | Pelo menos 32 caracteres aleatórios. |
| `METRICAS_HOSTS` | Opcional | Outros domínios aceitos no `/api/evento`. |

Regras:

- **Nenhum segredo no código, no git, no navegador ou no log.** Os testes conferem que a chave secreta nunca vai numa chamada feita em nome do usuário e que o log não leva token nem dado pessoal.
- **Use as chaves novas** (`sb_publishable_` e `sb_secret_`). As antigas (`anon` e `service_role`, em formato JWT) estão sendo descontinuadas pelo Supabase até o fim de 2026. O código ainda aceita as antigas, por segurança.
- **Se uma chave vazar:** gere outra no Supabase (API Keys), troque na Vercel, publique de novo e apague a antiga.
- **O `.env.local`** criado por `vercel env pull` fica só na máquina: o `.gitignore` e o `.vercelignore` o excluem. Pode ser apagado quando não for mais usado.

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
3. Na Vercel, ambiente **Preview**: `SUPABASE_URL`, `SUPABASE_CHAVE_PUBLICA` e `SUPABASE_CHAVE_SECRETA` deste projeto.
4. **Nunca copie dados de produção para o staging.** Use dados inventados.

### 4.3 Produção

1. Crie o projeto `beyon-zero` no Supabase, região **São Paulo**. Use uma senha forte de banco e guarde-a no gerenciador de senhas; ela não vai para a Vercel.
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

   O `init` só cria `supabase/config.toml` e não mexe nas migrations. O `db push` aplica as seis e registra cada uma no histórico do projeto. Daqui em diante, toda migration nova sobe pelo mesmo comando.
3. Em **Settings › Data API › Exposed schemas**, acrescente `app` e `metricas`. O `privado` **nunca** entra nessa lista.
4. Em **Authentication › Sign In / Providers**, **desligue o cadastro aberto** ("Allow new users to sign up") e o **login anônimo**. Nesta fase só entra quem o dono convidar. Mesmo que alguém se cadastrasse, sem ser membro de uma organização não veria nada, mas falaria direto com a API; desligar diminui a superfície.
5. Crie a organização e o primeiro dono, no **SQL Editor**, como `postgres`:
   - convide o seu e-mail em **Authentication › Users › Invite** e aceite o convite;
   - rode, trocando o e-mail:
   ```sql
   insert into app.organizacoes (slug, nome) values ('beyon-zero', 'Beyon Zero');
   insert into app.membros (org_id, user_id, papel)
   select o.id, u.id, 'dono' from app.organizacoes o, auth.users u
   where o.slug = 'beyon-zero' and u.email = 'SEU_EMAIL';
   ```
6. Variáveis na Vercel, ambiente **Production** (seção 3). Publique.
7. No **Firewall da Vercel**, crie regras de limite por IP para `POST /api/evento` (por exemplo, 30 por minuto) e para `/api/leads` (por exemplo, 60 por minuto). O freio dentro das funções vale por instância; o firewall vale para todas.

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

- Grave o dump e o `restauracao.sql` **fora da pasta do projeto** (por exemplo, `%USERPROFILE%\BeyonZero-backup\`): um `vercel deploy` feito pela CLI envia a pasta inteira, e um arquivo ali dentro iria junto (auditoria de segurança, 20/10/2026). O `.vercelignore` e o `.gitignore` também barram `*.dump`, `*.sql` e `*.7z`, mas a pasta de fora é a garantia. Os comandos abaixo são para o **Git Bash** (onde `$USERPROFILE` funciona; no PowerShell é `$env:USERPROFILE`, e no CMD, `%USERPROFILE%`). O `pg_dump --file` não cria a pasta: crie antes.

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

## 6. Próxima fase: Infisical (só com autorização do dono)

1. Criar o projeto `beyon-zero` no Infisical com três ambientes: `dev`, `staging` e `prod`.
2. Cadastrar as variáveis do `.env.example` em cada ambiente, com os valores de cada projeto do Supabase.
3. Ligar a **integração Infisical → Vercel**, que sincroniza os segredos nos ambientes Development, Preview e Production. O Infisical vira a fonte da verdade; a Vercel só recebe.
4. Apagar os valores cadastrados à mão na Vercel depois da primeira sincronização conferida.
5. Na máquina local, trocar `vercel env pull` por `infisical run -- npm run …`. Nenhum `.env` com valor real no disco.
6. Definir quem acessa cada ambiente (o dono em `prod`) e ligar o registro de acesso do Infisical.
7. Rotação: a chave secreta do Supabase e a `PAINEL_CHAVE` com um procedimento escrito, a cada 90 dias ou num vazamento.

O código não muda: ele já lê tudo de `process.env`, com os nomes do `.env.example`.
