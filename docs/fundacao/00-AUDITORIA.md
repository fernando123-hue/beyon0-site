# Fase 0 — Auditoria técnica (2026-10-06)

Feita antes de qualquer mudança da Fundação de Dados. Fonte: o repositório na branch `rebuild-v2` (head `c00236f`), o histórico do git inteiro, o disco local e a última prévia da Vercel.

## 1. Stack atual

| Camada | O que existe |
|---|---|
| Frontend | HTML, CSS e JS puros, sem build. GSAP 3.15 vendorado (licença padrão da GreenSock, gratuita). three.js r160 reduzido e vendorado (MIT). |
| Hospedagem | Vercel, plano Hobby, deploy pelo GitHub (`fernando123-hue/beyon0-site`). `main` = produção; `rebuild-v2` = prévia. |
| Backend | Funções da Vercel em `api/*.mjs` (Node, assinatura Web `Request`/`Response`, sem biblioteca). Confirmado na prévia: `api/evento` e `api/painel` publicadas como funções, região `iad1` (EUA). |
| Banco | **Nenhum banco existe ainda.** O código das métricas próprias (`api/_banco.mjs`) fala com o Supabase pela API REST com `fetch`, mas fica desligado sem as variáveis de ambiente. O esquema estava num SQL avulso (`docs/metricas/esquema.sql`), sem migrations versionadas. |
| Dependências | Runtime: zero. Desenvolvimento: `playwright`. `npm audit`: 0 vulnerabilidades. |
| Testes | `npm run testar` (9 testes de unidade da API de métricas, banco em memória). Verificador e acessibilidade com Playwright. Nenhum teste de banco real ou de RLS. |
| Ferramentas na máquina | Node 24, Vercel CLI 55 (token expirado), `gh`. **Sem Docker, sem `psql`, sem Supabase CLI.** |

## 2. Arquitetura atual

```
Navegador (site estático, CSP 'self')
  ├─ js/metricas.js ──sendBeacon──▶ /api/evento  (público, sem login)
  ├─ js/painel.js  ──fetch──────▶ /api/painel  (chave compartilhada PAINEL_CHAVE)
  └─ js/medicao.js ──(só com aceite)──▶ Google Analytics / Ads
/api/*  ──fetch REST + chave secreta (env)──▶ Supabase (ainda não criado)
```

Decisões já tomadas e preservadas:

- **Sem build e sem framework.** O site é estático. A Fundação não muda isso.
- **Backend = funções da Vercel.** É a fronteira entre o navegador e o banco.
- **Supabase por REST com `fetch`**, sem `supabase-js` no navegador nem no servidor. Mantido: zero dependência de runtime.
- **Métricas próprias** com lista fechada de campos, freio por IP, retenção de 13 meses e privacidade documentada. São preservadas e passam para o esquema próprio delas.

## 3. Segredos encontrados

| Onde | O quê | Situação |
|---|---|---|
| `.env.local` (disco) | `VERCEL_OIDC_TOKEN`, criado por `vercel env pull` em 30/07 | Ignorado pelo git (`.env*` no `.gitignore`). Nunca entrou no histórico. Token de curta duração, já vencido. Risco baixo. |
| Código rastreado | Nenhuma chave, senha ou token | Busca por padrões de chave (Supabase, AWS, GitHub, Stripe, JWT, chave privada) nos arquivos atuais e em **todo o histórico do git**: nada encontrado. |
| `api/_banco.mjs` | Lê `SUPABASE_URL` e `SUPABASE_CHAVE` de `process.env` | Correto: nada hardcoded. O nome `SUPABASE_CHAVE` é ambíguo (não diz que é a secreta). |
| `api/painel.mjs` | Lê `PAINEL_CHAVE` de `process.env` | Correto. Comparação em tempo constante. |
| Navegador | Nenhum segredo | Só o endpoint `/api/evento` e os IDs públicos do Google (vazios). |

## 4. Integrações

- **WhatsApp:** links `wa.me` com mensagem pronta. Nada passa pelo site.
- **Google Analytics e Ads:** inertes até os IDs serem preenchidos; só com consentimento.
- **Vercel:** hospedagem e funções.
- **Supabase:** planejado, inerte.
- Não há webhooks, upload de arquivos, OAuth, pagamento nem e-mail.

## 5. Riscos encontrados

| # | Risco | Gravidade | Situação |
|---|---|---|---|
| R1 | **Não há banco nem migrations versionadas.** O esquema das métricas é um SQL avulso, sem como reproduzir nem testar. | Alta (para a fase) | Resolvido nesta fase. |
| R2 | **O painel usa uma chave compartilhada**, sem identidade por pessoa. Não diz quem fez cada ação, não revoga uma pessoa só, e a chave fica no `sessionStorage` (um XSS a leria; a CSP estrita reduz isso). | Média | Preparado nesta fase (Auth + membros). A troca do painel fica para uma decisão do dono. |
| R3 | **Plano Hobby da Vercel proíbe uso comercial.** | Alta (contratual) | Decisão do dono. Já registrada no guia do Google Ads. |
| R4 | **Funções na região `iad1` (EUA)** e o banco planejado em São Paulo: cada chamada cruza o continente, e os dados pessoais passam pelos EUA. | Média | Recomendado fixar a região `gru1`. |
| R5 | **Endpoint público `/api/evento`.** Dá para forjar o `Origin` fora do navegador. Já há lista fechada de campos, freio de 60 por minuto por IP e leitura do mais novo para o mais velho. | Média | Mantido. Recomendado o firewall da Vercel. |
| R6 | Não há HSTS explícito no `vercel.json`. A Vercel aplica HSTS em `*.vercel.app`, mas não automaticamente em domínio próprio. | Baixa | Recomendado no dia do domínio próprio. |
| R7 | O `.vercelignore` não exclui `.env*` nem uma futura pasta `supabase/`. O deploy vem do git, onde eles não estão, mas um `vercel deploy` local poderia enviar o `.env.local`. | Baixa | Resolvido nesta fase. |
| R8 | Mensagens de erro do painel dizem quais variáveis faltam antes da autenticação ("falta PAINEL_CHAVE"). Revela configuração, não segredo. | Baixa | Resolvido nesta fase. |
| R9 | O plano grátis do Supabase **não tem backup automático** (backup diário a partir do Pro; recuperação a qualquer instante é complemento pago). | Alta quando houver dados de clientes | Documentado, com decisão pendente do dono. |

Procurados e **não encontrados:**

- **SQL injection:** não há SQL montado com texto; os filtros REST usam valores validados por expressão regular e `encodeURIComponent`.
- **XSS:** nenhum `innerHTML` com dado. O painel monta tudo com `textContent`. A CSP não permite script inline.
- **CORS permissivo:** nenhum cabeçalho `Access-Control-Allow-*`. Só a mesma origem lê respostas.
- **CSRF:** o painel usa um cabeçalho `Authorization`, que um site de fora não consegue enviar. O endpoint de eventos confere a origem.
- **IDOR:** não há recurso por ID exposto a usuário comum ainda.
- **Upload, webhook ou dependência vulnerável:** nenhum.
- **Segredo em log:** os `console.error` registram a mensagem do erro, nunca a chave nem a URL com a chave.

## 6. Problemas críticos

Nenhum vazamento ou falha explorável hoje. O ponto crítico **para esta fase** é o R1: sem banco, sem migrations e sem testes de banco, nada da fundação é verificável.

## 7. Recomendações

1. Criar a base de dados com **migrations versionadas** no formato do Supabase (`supabase/migrations/`).
2. **Separar os dados por esquema:** `app` (o negócio, multi-organização, com RLS), `metricas` (analytics anônimo do site, só o backend) e `privado` (funções de segurança, nunca exposto).
3. Usar o **Supabase Auth** como identidade e a tabela de membros como autorização, com RLS em todo o esquema `app`.
4. **Integridade entre organizações no próprio banco:** chaves estrangeiras compostas `(org_id, id)`, para que um ID de outra organização nunca possa ser referenciado.
5. **Testar o RLS com Postgres de verdade:** PGlite (Postgres 18 compilado para WebAssembly, só para desenvolvimento) com uma camada que imita o Supabase. A prova de conceito passou: papéis, `SET ROLE`, RLS e `ON DELETE SET NULL (coluna)`.
6. Dar nomes explícitos às chaves: `SUPABASE_CHAVE_SECRETA` e `SUPABASE_CHAVE_PUBLICA`. Criar um `.env.example` sem valores, que é a lista que o Infisical vai receber na próxima fase.
7. Fixar a região das funções em `gru1` (São Paulo).
8. Não construir agora conversas, mensagens nem base de conhecimento. Não há canal que as produza (a conversa acontece no WhatsApp), e guardá-las seria dado pessoal sem uso.
