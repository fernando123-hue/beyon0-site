# Fase 1 — Status (2026-10-06)

A fase parou aqui, como pedido. **Infisical e Cloudflare não foram iniciados.**

## Status

| Item | Situação |
|---|---|
| **Banco** | Pronto em código e testado. 9 tabelas em `app`, 2 em `metricas`, funções em `privado`, sobre Postgres de verdade (PGlite, Postgres 18). **O projeto no Supabase ainda não existe**: criar a conta é do dono (`02-OPERACAO.md` §4.3). |
| **Segurança** | Defesa em três camadas: concessões por papel, RLS e integridade no banco (chaves compostas, checks e gatilhos). O backend age como o usuário nos dados do negócio. Há freio de taxa, validação por lista fechada e erros genéricos. Duas revisões independentes (segurança e banco) não acharam nada crítico ou alto; os achados médios e baixos foram corrigidos ou estão abaixo. |
| **RLS** | Ligado em todas as 11 tabelas, com 31 políticas por organização e papel. Testado no permitido (o próprio recurso) e no negado: outra organização, sem login, logado sem organização, membro em operação de administração, manipulação de ID, mover registro de organização e forjar auditoria. |
| **Testes** | `npm run testar`: **33 de 33**. `npm run testar:mutacao`: **6 de 6** sabotagens pegas. Os testes do site (verificador e acessibilidade) e o de ponta a ponta das métricas continuam passando. |
| **Migrations** | 6, versionadas em `supabase/migrations/`. Criam o banco do zero até o estado esperado, e isso é provado a cada `npm run testar`. Não foram aplicadas num Supabase real. |
| **Segredos** | Nenhum no código, no histórico do git, no navegador ou no log (verificado por teste). Os nomes estão em `.env.example`. A chave secreta só é usada pelas métricas anônimas. `.env*`, cópias de banco e o estado do Supabase CLI ficam fora do git e do deploy. |
| **Documentação** | `docs/fundacao/`: auditoria, arquitetura, operação (local, staging, produção, backup, restauração, LGPD e Infisical) e este status. |

## Controles implementados

- **Isolamento entre organizações:** RLS, chaves estrangeiras compostas `(org_id, id)` e `org_id` imutável.
- **Papéis:**
  - dono, admin e membro;
  - sempre pelo menos um dono, com trava contra mudança simultânea;
  - só o dono gerencia membros;
  - organização só é criada pelo backend.
- **Autoria e datas** vêm do banco; o que o cliente envia é ignorado.
- **Auditoria** só de acréscimo, sem dado pessoal; nem o backend a reescreve.
- **Proposta:**
  - nasce rascunho;
  - depois de enviada, o conteúdo e as datas não mudam;
  - a situação só anda para a frente.
- **API `/api/leads`:**
  - freio por IP;
  - token triado e validado pelo Supabase Auth;
  - lista fechada de campos;
  - checagem de membro;
  - operação como o usuário;
  - 401, 403, 409, 413, 415, 429 e 500 genéricos.
- **Funções:**
  - nenhuma executável por PUBLIC;
  - `SECURITY DEFINER` com `search_path` vazio;
  - o esquema `privado` nunca exposto.
- **Restauração** que preserva datas, autoria e auditoria. Só liga sem usuário logado.
- **Região das funções:** São Paulo (`gru1`), perto do banco.

## Riscos restantes

1. **As migrations nunca rodaram num Supabase real.** Os testes usam uma imitação fiel do que o RLS precisa. Ela não cobre a troca de papel do PostgREST, as concessões automáticas do Supabase nem o papel `postgres` sem superusuário. Mitigação: a conferência de `02-OPERACAO.md` §4.4 logo depois do primeiro `db push`, de preferência no staging.
2. **Sem backup no plano grátis do Supabase.** Até o Pro, só a cópia manual semanal (§5).
3. **O painel de métricas usa uma chave compartilhada.** Não há identidade por pessoa; a chave fica no `sessionStorage`. A fundação para trocá-la por login (Supabase Auth com membros) está pronta, mas a troca não foi feita.
4. **Plano Hobby da Vercel**: o uso comercial é proibido pelos termos.
5. **O freio de taxa vale por instância da função.** Sem as regras no firewall da Vercel, um ataque distribuído ainda consome a cota.
6. **O ID global** de uma tabela deixa confirmar, por erro de duplicidade, que um UUID existe em outra organização. Só funciona com chamada direta ao banco; o impacto é desprezível. Aceito.
7. **Dono e admin podem apagar uma proposta enviada.** Fica registrado na auditoria. Aceito por simplicidade; dá para bloquear se o dono quiser.
8. **Índices em `created_by` e `updated_by`** não foram criados. Apagar um usuário varre as tabelas. Irrelevante no volume atual; criar quando crescer.
9. **A exclusão de um usuário que é o único dono** é recusada até outro membro virar dono (§5.1). É de propósito, mas exige o procedimento.

## Decisões pendentes (do dono)

1. **Criar os projetos no Supabase:** produção e staging, região São Paulo. Sem isso, o banco não existe.
2. **Plano do Supabase:** Pro (US$ 25 por mês, backup diário) antes do primeiro cliente real, ou o grátis com cópia manual enquanto só houver métricas.
3. **Plano da Vercel:** Pro (US$ 20 por mês) ou outra hospedagem, por causa do uso comercial.
4. **Trocar a chave do painel por login** com o Supabase Auth: uma fase própria, pequena.
5. **Política para apagar proposta enviada:** manter permitido para dono e admin, ou bloquear.
6. **Revisão jurídica da política de privacidade,** agora que haverá leads com nome, e-mail e telefone no banco.

## Ordem das fases combinada com o dono

1. **Infisical:** a próxima, aguardando autorização.
2. **Cloudflare:** só quando o site estiver 100% pronto (dono, 2026-10-06). Nada é configurado antes disso.

O que já se sabe que vai mudar quando a Cloudflare entrar (para não ser surpresa):

- **IP do visitante nos freios** (`api/_freio.mjs`, `ipDe`). Hoje vem do `x-forwarded-for` da Vercel. Atrás do proxy da Cloudflare, esse IP vira o da Cloudflare, e todos os visitantes cairiam no mesmo freio. A troca: ler o `cf-connecting-ip` quando a requisição comprovadamente vier da Cloudflare, com teste.
- **Onde fica a muralha de limite e firewall:** as regras planejadas para o firewall da Vercel (`02-OPERACAO.md` §4.3, passo 7) passam para o WAF e as regras de limite da Cloudflare. A Vercel fica sem duplicar.
- **Modo do DNS e SSL:** decidir entre o proxy da Cloudflare na frente da Vercel e só o DNS (a Vercel tem rede de borda própria e recomenda cuidado com o proxy na frente). Com proxy, o SSL fica em "Full (strict)", nunca "Flexible".
- **Cache:** o HTML e o `/api/*` não podem ser guardados em cache. Hoje a Vercel e os cabeçalhos `no-store` da API cuidam disso; as regras da Cloudflare têm de respeitar.
- **Cabeçalhos de segurança** (CSP e afins, em `vercel.json`) seguem vindo da Vercel. A Cloudflare não pode reescrever nem acrescentar scripts (desligar Rocket Loader, Email Obfuscation e afins, que injetam JS inline e a CSP bloquearia).
- **HSTS** no domínio próprio (risco R6 da auditoria): ligar em um lugar só.
- **`METRICAS_HOSTS`** e a checagem de origem do `/api/evento` com o domínio final.

## Próxima fase: Infisical (aguardando autorização)

Exatamente o que será feito (detalhe em `02-OPERACAO.md` §6):

1. **Projeto e ambientes:** criar o projeto `beyon-zero` no Infisical com três ambientes, `dev`, `staging` e `prod`.
2. **Segredos:** cadastrar em cada ambiente as variáveis de `.env.example`, com os valores dos respectivos projetos do Supabase e a `PAINEL_CHAVE`.
3. **Integração com a Vercel:** ligar a integração nativa Infisical → Vercel, com os mapeamentos `dev` → Development, `staging` → Preview e `prod` → Production. Conferir a primeira sincronização e então apagar os valores digitados à mão na Vercel.
4. **Máquina local:** trocar o `vercel env pull` por `infisical run -- npm run …` e apagar o `.env.local`.
5. **Acesso:** o dono em `prod`, e ninguém mais por enquanto. Ligar o registro de acesso do Infisical.
6. **Rotação:** escrever o procedimento (gerar a chave nova no Supabase, atualizar no Infisical, sincronizar, publicar, revogar a antiga). Fazer a cada 90 dias ou num vazamento, e testar uma vez no staging.
7. **Código:** nenhuma mudança. Ele já lê tudo de `process.env`, com os nomes do `.env.example`. A conferência é por teste: `npm run testar` e um `/api/leads` real no staging.
