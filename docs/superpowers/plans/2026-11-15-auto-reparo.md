# Auto-reparo — plano de execução

> **Para agentes:** executar tarefa a tarefa (superpowers:executing-plans), com TDD. Passos em checkbox (`- [ ]`).

**Objetivo:** vigia de hora em hora sem IA, com aviso por e-mail sem repetição (PR 1), e fallback de modelo do Zero
na queda (PR 2). Spec: `docs/superpowers/specs/2026-11-15-auto-reparo-design.md`.

**Arquitetura:** o cron horário chama `rondar(env)` nas horas fora da reconciliação. `rondar` confere no Worker
(páginas por `ASSETS`, configuração), lê o banco numa função (`app.rotinas_vigia_ler`: estado + números), decide com
uma função pura (`decidir`), manda um e-mail (`avisarDonoLinhas`) e só então grava o estado
(`app.rotinas_vigia_gravar`). Banco fora: regra fixa de horário, sem memória.

**Stack:** Node 24 (`node --test`), PGlite com as migrations reais, Cloudflare Workers, SDK `@anthropic-ai/sdk` 0.131.

## Restrições globais

- Custo de IA do vigia: zero (nenhuma chamada a modelo).
- Nenhum dado pessoal em e-mail, log ou tabela do vigia; o único número no e-mail é contagem.
- Texto de e-mail fixo, em português, sem jargão.
- Nada muda na lógica de pagamento; a reconciliação continua nas mesmas horas (UTC múltiplas de 3, minuto 23).
- Migration nova só acrescenta (tabela + 2 funções), com `revoke` de `public, anon, authenticated` e `execute` só para
  `service_role`; o dono aplica antes da promoção.
- Commits em português explicando o porquê; rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nível de risco 3 nos dois PRs: teste visto vermelho, revisão técnica e de segurança por agentes diferentes, links no PR.

---

## PR 1 — o vigia

### Tarefa 1: migration `app.vigia` + `rotinas_vigia_ler` + `rotinas_vigia_gravar`

**Arquivos:** criar `supabase/migrations/20261115120000_vigia.sql`; teste `docs/testes/vigia-banco.test.mjs`.

**Interfaces (produz):**
- `app.rotinas_vigia_ler({ org_slug })` → `{ estado: { [item]: { ativo, desde, avisado_em } } | {}, estreia_em,
  falhas_ia_hora, conversas_falha_hora, ultima_falha_conta_em, ultima_ok_ia_em, ultima_falha_ia_em,
  ultima_reconciliacao_em, ultima_diaria_em, urgentes }` (datas ISO ou null).
- `app.rotinas_vigia_gravar({ itens: [{ item, ativo, desde, avisado_em }] })` → `{ gravados }`; item fora da lista →
  `22023`. Lista: `estreia, paginas, configuracao, pagamentos, rotina_diaria, alertas_urgentes, ia_falhando, ia_conta`.

- [ ] Teste vermelho: ler com tabela vazia → `estado {}`, contagens 0; com `ia_chamadas` inseridas (3 falhas `tempo`
  de 2 conversas na última hora, 1 de 2 h atrás, 1 `indisponivel`, 1 ok) → números certos; `payment.reconciled` e
  `rotinas_execucoes` → datas; alerta urgente não resolvido de 3 dias conta, resolvido e de 8 dias não; gravar e ler
  de volta; item desconhecido → erro 22023; `anon`/`authenticated` sem `execute`.
- [ ] Rodar (`node --test docs/testes/vigia-banco.test.mjs`) → falha (função não existe).
- [ ] Escrever a migration.
- [ ] Rodar → passa. Commit.

### Tarefa 2: `decidir` (pura)

**Arquivo:** criar `api/_vigia/decidir.mjs`; teste `docs/testes/vigia.test.mjs`.

**Interfaces (produz):**
- `ITENS`: `{ [item]: { quebrou: string, voltou: string | null } }` (textos fixos).
- `achadosDe(leitura, conferencias, agora)` → `{ [item]: boolean }` (true = falhando), aplicando os prazos (6 h 30,
  26 h a partir de `max(ultima, estreia)`), a regra de 2+ conversas e a "volta só com prova" da IA.
- `decidir(estadoAnterior, achados, agora)` → `{ linhas: string[], itens: [{ item, ativo, desde, avisado_em }] }`
  (`avisado_em` já com `agora` para o que entrou no e-mail; o chamador só grava se o envio deu certo; se falhou,
  grava com o `avisado_em` antigo).
- `decidirSemBanco(agora, memoria)` → `string[]` (horas 1, 7, 13, 19 UTC e nunca 2× em 24 h na `memoria` Map).

- [ ] Testes vermelhos: estreia (estado vazio → linha de estreia + item `estreia`), falha nova, contínua < 24 h (sem
  linha), > 24 h (lembra), volta (linha "voltou"), volta de `alertas_urgentes` sem linha, nada mudou → sem linhas,
  prazos a partir da estreia, IA ativa sem sucesso posterior continua ativa, banco fora nas horas certas e 1× em 24 h.
- [ ] Implementar. Rodar → passa. Commit.

### Tarefa 3: `conferir` + `avisarDonoLinhas`

**Arquivos:** criar `api/_vigia/conferir.mjs`; mudar `api/_aviso.mjs`; testes em `docs/testes/vigia.test.mjs` e
`docs/testes/aviso.test.mjs`.

**Interfaces (produz):**
- `conferir(env, { esperar })` → `{ paginas: boolean, configuracao: string[] }` (`paginas` true = ok; `configuracao` =
  nomes faltando: `supabase`, `anthropic`, `cron`, `pagamentos`).
- `avisarDonoLinhas(env, linhas, deps)` → `Promise<boolean>`; mesmo canal e mesmo `montarEmail`; assunto = 1ª linha.

- [ ] Testes vermelhos (ASSETS falso: 200 com `<html`, 500, 200 sem `<html`, falha 1× e passa na 2ª; env sem cada
  configuração; aviso com linhas → 1 e-mail com as linhas e o link do painel; sem canal → false sem fetch).
- [ ] Implementar. Rodar → passa. Commit.

### Tarefa 4: `rondar` + agenda + cron

**Arquivos:** criar `api/_vigia/rondar.mjs`; mudar `cloudflare/agenda.mjs`, `cloudflare/worker.mjs`,
`wrangler.jsonc`; testes `docs/testes/vigia.test.mjs`, `docs/testes/worker.test.mjs`, `docs/testes/rotina-entregas.test.mjs`.

**Interfaces:**
- `rondar(env, deps)` → `{ linhas, enviado, semBanco }`; deps: `{ banco, avisar, agora, conferir, memoria }`.
- `AGENDA = { '23 * * * *': { horaria: true }, '41 6 * * *': { rota: 'rotinas', busca: '?acao=diaria' } }`;
  `agendar(cron, env, rotas, { agora, rondar })`: horária → hora UTC % 3 === 0 reconcilia (com segredo), senão vigia
  (sem segredo); cada um num `try`.
- `worker.scheduled` passa `controller.scheduledTime`.

- [ ] Testes vermelhos: ponta a ponta com PGlite + canal falso (estreia manda e grava; 2ª ronda sem novidade não manda;
  envio falhou → não marca avisado e manda na seguinte; banco fora → regra fixa); agenda por hora; crons do
  `wrangler.jsonc` == AGENDA.
- [ ] Implementar; atualizar os testes que prendiam `23 */3 * * *`. Rodar `npm run testar` inteiro → passa. Commit.

### Tarefa 5: fechar o PR 1

- [ ] `npm run testar:mutacao` (incluir os arquivos novos se a lista for fixa), `npm run cf:fumaca`,
  `node scripts/processo/nivel-de-risco.mjs origin/main HEAD`.
- [ ] Atualizar `docs/fundacao/02-OPERACAO.md` (migration nova a aplicar antes da promoção; o que o e-mail diz).
- [ ] Push, PR com a evidência; revisão técnica e de segurança por agentes diferentes (comentários no PR); corrigir;
  checks lidos um a um; atualizar com a `main`; mesclar.

## PR 2 — fallback de modelo

### Tarefa 6: `claude-sonnet-5-5 → claude-sonnet-5` na queda

**Arquivos:** mudar `api/_ia/anthropic.mjs`, `api/_ia/config.mjs`; teste `docs/testes/ia-fallback.test.mjs`.

**Interfaces:** `config.MODELO_RESERVA = { 'claude-sonnet-5-5': 'claude-sonnet-5' }`; preço de `claude-sonnet-5` em
`PRECO_POR_MILHAO`.

- [ ] Testes vermelhos com cliente falso: 529/500/rede depois das repetições → 2ª chamada com `model: claude-sonnet-5`,
  sem `fallbacks`/`betas` de fallback, mesmas opções; resposta conta pelo preço do Sonnet 5; 4xx, 429, tempo esgotado
  e Haiku/Opus → nenhuma 2ª chamada; reserva também falha → o mesmo `ErroIA` de antes.
- [ ] Implementar. `npm run testar` → passa. Commit. Fechar como na Tarefa 5.
