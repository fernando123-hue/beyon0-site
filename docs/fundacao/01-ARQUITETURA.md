# Fase 1 — Arquitetura da Fundação de Dados (2026-10-06)

Decidida depois da auditoria (`00-AUDITORIA.md`) e antes de qualquer código. Princípio: o que a operação de hoje precisa, numa estrutura que cresce sem reconstrução.

## 1. Banco e organização dos dados

**Supabase (Postgres 15 ou mais novo).** Já era a decisão do projeto e foi mantida. O banco fica separado em quatro esquemas, cada um com uma fronteira clara:

| Esquema | Conteúdo | Quem acessa |
|---|---|---|
| `app` | O negócio: organizações, membros, clientes, leads, projetos, briefings, propostas, revisões, auditoria. | Usuário logado, sempre filtrado por RLS. O backend age **como o usuário**. |
| `metricas` | Analytics anônimo do site (`paginas`, `contatos`). | Só o backend, com a chave secreta. Nenhum papel de usuário tem permissão. |
| `privado` | Funções de segurança (quem é membro, qual papel) e gatilhos. | Ninguém por API. Não é exposto. |
| `auth` | Usuários do Supabase Auth. | Gerenciado pelo Supabase. O `app` só referencia `auth.users(id)`. |

O esquema `public` fica vazio. Ele é o padrão que o Supabase expõe e onde dá concessões automáticas; não guardar nada ali evita exposição por descuido.

## 2. Entidades desta fase

Criadas, porque a operação de hoje (sites, briefing, proposta, cliente, produção, entrega) usa cada uma:

| Tabela (`app`) | Equivale a | Por que agora |
|---|---|---|
| `organizacoes` | organizations | O tenant. A Beyon Zero é a primeira. |
| `membros` | members | Quem pode o quê em cada organização. |
| `clientes` | clients | Quem contratou. |
| `leads` | leads | Quem chegou e ainda não fechou. Guarda a origem (meio, fonte, campanha, termo) e o **código da visita** das métricas próprias. Assim o lead se liga à campanha que o trouxe. |
| `projetos` | projects | O site ou a solução em produção, de um cliente. |
| `briefings` | (estrutura do briefing) | A coleta estruturada: as respostas num JSON com a versão do formulário, ligadas a um lead ou a um projeto. |
| `propostas` | proposals | Versionadas. Toda proposta nasce rascunho. Depois de enviada, o conteúdo e as datas de envio e de resposta ficam **imutáveis**: mudar exige uma versão nova. A situação só anda para a frente. Dono e admin podem apagar, e a auditoria registra. |
| `revisoes` | revisions | Pedidos de alteração num projeto. |
| `auditoria` | audit_logs | Eventos críticos, só de acréscimo. |

**Não criadas agora,** com o encaixe já previsto:

- **Conversas e mensagens.** Hoje a conversa acontece no WhatsApp e nenhum canal a traz para o sistema. Guardar mensagens seria dado pessoal sem uso. Quando houver atendimento pelo site ou integração, elas entram como `app.conversas (org_id, lead_id | projeto_id)` e `app.mensagens (org_id, conversa_id)`, no mesmo molde.
- **Base de conhecimento e memória.** Entram como um esquema próprio (`conhecimento`) quando houver conteúdo e uso real. Banco vetorial só com necessidade medida.

**Combinações e divisões avaliadas:**

- **Lead e cliente separados.** Um lead pode nunca virar cliente, e um cliente pode ter vários projetos. Ao fechar, o lead aponta para o cliente; um lead "ganho" sem cliente é bloqueado pelo banco.
- **Briefing separado do projeto.** Ele nasce na fase de lead, antes de existir projeto.
- **Proposta ligada a lead ou a projeto.** Pelo menos um dos dois, os dois se houver.

## 3. Relações

```
organizacoes ─┬─< membros >── auth.users
              ├─< clientes ─┬─< projetos ─┬─< revisoes
              │             │              ├─< briefings
              │             │              └─< propostas
              ├─< leads ────┴──(cliente_id quando ganho)
              │     ├─< briefings
              │     └─< propostas
              └─< auditoria
```

**Integridade entre organizações no banco.** Toda tabela filha tem `org_id`, e as chaves estrangeiras são **compostas** `(org_id, x_id) → (org_id, id)`. Um projeto não consegue apontar para o cliente de outra organização, mesmo que alguém envie o ID certo de propósito. Isso fecha a manipulação de IDs na camada mais baixa. O `org_id` de um registro também não muda depois de criado (gatilho).

**Exclusões:**

- **Apagar uma organização** apaga tudo dela (cascata). É uma operação só do backend.
- **Apagar um cliente com projetos, ou que um lead "ganhou",** é bloqueado. A checagem é no fim do comando, então a cascata da organização inteira passa. Para tirar da lista sem perder o histórico, existe `arquivado_em`.
- **Apagar um lead** solta a referência nos projetos (`SET NULL` só na coluna `lead_id`). Briefings e propostas do lead somem junto com ele.
- **Apagar um projeto** leva as revisões, os briefings e as propostas dele.

**Sem soft delete geral.** O direito de exclusão da LGPD pede exclusão de verdade. Arquivar só onde há motivo operacional, em `clientes.arquivado_em`.

**Identidade dos registros:**

- Todo ID é **UUID aleatório** (`gen_random_uuid()`); nada sequencial fica exposto.
- Cada tabela tem `created_at` e `updated_at`, mantidos por gatilho.
- As tabelas de negócio têm também `created_by` e `updated_by`. Eles vêm de `auth.uid()` por gatilho; o valor que o cliente envia é ignorado.

## 4. Autorização

**Autenticação ≠ autorização.**

- **Autenticação:** Supabase Auth (JWT do usuário).
- **Autorização:** pertencer a uma organização (`app.membros`) e o papel que se tem nela. São três papéis:

| Papel | Pode |
|---|---|
| `dono` | Tudo na organização, inclusive gerenciar membros e ler a auditoria. |
| `admin` | Ler e escrever tudo, apagar registros, ler a auditoria. Não gerencia membros. |
| `membro` | Ler, criar e editar clientes, leads, projetos, briefings, propostas e revisões. Não apaga nada, não vê a auditoria e não gerencia membros. |

**Regras no banco:**

- A organização sempre tem pelo menos um dono (gatilho, com trava da organização contra duas mudanças simultâneas).
- Ninguém promove a si mesmo: só o dono altera membros.
- Criar uma organização é operação do backend nesta fase. Não há cadastro aberto.

**RLS em todas as tabelas de `app`**, com políticas por operação (`select`, `insert`, `update`, `delete`) para o papel `authenticated`:

- O papel `anon` não tem permissão nenhuma nos esquemas `app`, `metricas` e `privado`.
- As funções de checagem (`privado.e_membro`, `privado.tem_papel`) são `SECURITY DEFINER`, com `search_path` vazio. Leem `app.membros` sem cair em recursão de RLS e não ficam expostas pela API.
- A `auditoria` só aceita leitura (dono e admin). A escrita vem de gatilho; ninguém altera nem apaga uma linha dela.

## 5. Fluxo de dados e fronteiras de confiança

```
[Navegador]   nunca tem chave secreta. No futuro, no máximo a chave PÚBLICA + o JWT do usuário.
     │  HTTPS, mesma origem, CSP 'self'
     ▼
[Funções da Vercel /api]   validam toda entrada (lista fechada de campos), checam autenticação e autorização
     │  dois clientes, nunca misturados:
     │   • comoUsuario(jwt): chave PÚBLICA + JWT do usuário → o RLS se aplica (dados do negócio)
     │   • sistema: chave SECRETA → ignora o RLS (só métricas anônimas, limpeza e tarefas do backend)
     ▼
[Supabase: PostgREST → Postgres]   RLS + concessões por papel + chaves compostas + gatilhos + checks
```

**Defesa em camadas.** O navegador filtra só visualmente. O backend valida e autoriza. O banco isola de novo. Se alguém ignorar a interface e chamar a API, ou chamar o PostgREST direto com um JWT válido, o banco ainda recusa o que não é da organização dele.

**Chaves e variáveis de ambiente.** Só no servidor e só por variável de ambiente. Os nomes ficam explícitos e já valem para o Infisical:

| Variável | O que é | Onde |
|---|---|---|
| `SUPABASE_URL` | Endereço do projeto | Servidor |
| `SUPABASE_CHAVE_PUBLICA` | Chave publicável (`sb_publishable_…`) | Servidor; pode ir ao navegador no futuro |
| `SUPABASE_CHAVE_SECRETA` | Chave secreta (`sb_secret_…`), ignora o RLS | **Só servidor** |
| `PAINEL_CHAVE` | Chave do painel de métricas | **Só servidor** |

## 6. Primeira API sobre o domínio: `/api/leads`

Ela é o modelo da fronteira para o que vier depois:

- **Freio por IP** (120 por minuto por instância). Acima disso, 429.
- **Exige o JWT do Supabase.** Sem ele, 401. Um token vencido ou sem `sub` é recusado sem gastar o Auth; a assinatura é conferida pelo Supabase Auth.
- **Valida a entrada** com uma lista fechada de campos. Erro, 400.
- **Checa se o usuário é membro** da organização pedida. Se não for, 403 (sem dizer se a organização existe).
- **Faz a operação como o usuário,** então o RLS vale também aqui.
- **Erros internos** voltam genéricos; o detalhe só vai para o log, sem chave nem dado pessoal.

Não há painel nem tela de CRM nesta fase.

## 7. Auditoria

Um gatilho registra criação, alteração e exclusão em `organizacoes`, `membros`, `clientes`, `leads`, `projetos`, `propostas` e `revisoes`. Cada linha guarda:

- quem fez (`auth.uid()` ou "sistema");
- o quê, em qual tabela e registro;
- **só os nomes dos campos alterados**, com os valores apenas dos campos não pessoais (situação, papel, valor).

Nome, e-mail, telefone, notas e respostas de briefing nunca são copiados para a auditoria.

O login fica no registro de auditoria do próprio Supabase Auth, sem duplicar.

## 8. Testes

Postgres de verdade nos testes, sem Docker: **PGlite** (Postgres 18 em WebAssembly, dependência só de desenvolvimento). Uma camada de testes imita o Supabase:

- os papéis `anon`, `authenticated` e `service_role`;
- a tabela `auth.users`;
- a função `auth.uid()`, que lê `request.jwt.claims` como o PostgREST faz.

As migrations reais rodam por cima dessa camada. Os testes cobrem o que deve passar e o que deve ser recusado.

**Compatibilidade.** As migrations usam só recursos do Postgres 15 ou mais novo, que é a versão mínima do Supabase.

## 9. O que esta fase não faz

- CRM completo, prospecção, agentes, RAG, banco vetorial, cobrança, painel administrativo.
- **Infisical.** É a próxima fase, e só com autorização do dono.
