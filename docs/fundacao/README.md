# Fundação de Dados da Beyon Zero

Fase 1: banco, segurança, RLS, testes, migrations e segredos. Feita em 2026-10-06.

| Arquivo | O que tem |
|---|---|
| [00-AUDITORIA.md](00-AUDITORIA.md) | O diagnóstico antes de mudar qualquer coisa: stack, arquitetura, segredos, integrações e riscos. |
| [01-ARQUITETURA.md](01-ARQUITETURA.md) | As decisões: esquemas, entidades, relações, multi-organização, papéis, RLS, fluxo de dados e fronteiras de confiança. |
| [02-OPERACAO.md](02-OPERACAO.md) | Migrations, testes, variáveis e segredos, montar local, staging e produção, backup e recuperação, e o plano do Infisical. |
| [03-STATUS.md](03-STATUS.md) | Onde a fase parou: o que foi feito e testado, os riscos que restam e as decisões pendentes. |

Onde está o código:

| Caminho | O quê |
|---|---|
| `supabase/migrations/` | O banco inteiro, em seis migrations versionadas. |
| `api/_supabase.mjs` | O backend falando com o Supabase **como o usuário** (chave pública + JWT). |
| `api/_banco.mjs` | O único uso da chave secreta: as métricas anônimas. |
| `api/leads.mjs`, `api/_valida-app.mjs` | A primeira API do negócio e o modelo da fronteira. |
| `docs/testes/` | `banco.test.mjs` (Postgres real via PGlite), `api.test.mjs`, `metricas.test.mjs`, `mutacao.mjs`. |
| `.env.example` | Os nomes das variáveis, sem valores. |
