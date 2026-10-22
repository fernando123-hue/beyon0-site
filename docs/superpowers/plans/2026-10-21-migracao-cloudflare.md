# Migração do site da Vercel para a Cloudflare: plano de implementação (revisado, 2026-10-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Só plano. Nada foi implementado nem configurado.** Branch: `migracao-cloudflare` (de `origin/main` `28d8de8`).
> Esta é a **2ª versão**: reescrita inteira aplicando a revisão `.superpowers/sdd/cloudflare-plano-revisao.md`
> (4 ALTO, 9 MÉDIO, 13 BAIXO). O § 2 diz, achado por achado, onde cada um foi resolvido. Passa por nova revisão
> (agente diferente) e é mostrado ao dono antes de qualquer código. Resumo para o dono:
> `.superpowers/sdd/cloudflare-resumo-dono.md`.
>
> Informações do dono/coordenador incorporadas (21/10): o dono **já tem conta na Cloudflare**; o dono **comprou o
> domínio `beyonzero.com.br`**; segredos **só nos segredos do Worker** (só escrita) + cópia no gerenciador de senhas
> do dono. O Infisical fica como opção futura, fora deste plano.
>
> **Endereço final: `https://beyonzero.com.br`** (sem `www`); `www.beyonzero.com.br` redireciona (301) para ele.
> Por quê: é o mais curto de dizer, digitar e imprimir; o Worker atende o domínio raiz direto (Custom Domain); um
> hostname só no Turnstile cobre os dois; o `/api/evento` confere a origem pelo próprio host, então o
> `METRICAS_HOSTS` pode ficar vazio.

## Decisões do dono depois deste plano (21/10) — VALEM POR CIMA do texto abaixo

1. **Plano GRÁTIS da Cloudflare** (zona e Workers): "o investimento até o primeiro cliente deve ser mínimo". O item 2
   do resumo ("Workers Paid obrigatório") passa a ser **hipótese a medir**: o limite de 10 ms é de CPU, não de
   tempo de relógio (esperar Supabase, Anthropic e Mercado Pago não conta). Acrescentar uma task de MEDIÇÃO antes do
   corte: CPU por rota (sessão, mensagem, ajustar, escopo, pagar, webhook, painel, evento, cron e o caminho da geração
   com `higienizar`/`varrer`), primeiro localmente (perfil de CPU no Node, mesmo código) e depois no `workers.dev`
   grátis com as métricas de CPU da Cloudflare. Só se alguma rota passar do limite com folga insuficiente, o agente
   volta ao dono com a medida e as opções (otimizar a rota, tirar o trabalho do pedido, ou US$ 5/mês).
2. **Só Pix no lançamento** (sem cartão): resolve a cláusula 2.2.1(h) dos termos para domínio no plano grátis.
   Acrescentar task: o cartão fica desligado em produção por configuração (o método some da tela e a API recusa), com
   teste; Pix continua.
3. **DNS já trocado** no Registro.br para `dave.ns.cloudflare.com` / `desi.ns.cloudflare.com` (21/10, delegação em
   ~2 h; DNSSEC estava desligado). A zona está no plano grátis, com os 3 registros do Registro.br mantidos (MX nulo,
   SPF `-all`, DMARC `p=reject`) e a sincronização de robôs desligada.

4. **Decisão do dono 1 (§ 4), respondida em 21/10: (b) DUAS contas grátis, sem GitHub Pro.** Produção e prévias em
   contas separadas (a de prévias com o e-mail dele + "+previa"; o Zero Trust pede cartão, sem cobrança). O P2b
   (GitHub Pro) NÃO se aplica; o limite residual do § 5.3 fica como está escrito.
5. **Decisão do dono 2 (§ 4), respondida em 21/10: fica no GRÁTIS; nenhuma assinatura paga (Cloudflare, GitHub ou
   outra) antes da PRIMEIRA VENDA concluída.** Se a medida M2 mostrar que a entrega de direções não cabe: o agente faz
   a opção **(b)** (entrega em pedaços) e, se ainda não couber, volta ao dono com a **(c)** (conferência só no PC dele).
   A opção (a) (Workers Paid, US$ 5/mês) fica para depois da 1ª venda; o cartão que o Zero Trust pede, sem cobrança,
   não é assinatura.
6. **Decisão do dono 3 (§ 4), respondida em 21/10: APAGAR `beyon0-site.vercel.app` logo**, sem os 90 dias de
   redirecionamento, **mas só depois de a captação trocar os links** das mensagens, demonstrações e
   `captacao/config/oferta.json` para `beyonzero.com.br`. O P17 passa a ser só "apagar" e espera esse aviso.
7. **Sem e-mail `@beyonzero.com.br` por agora** (21/10, "Agora não"): o MX nulo, o SPF `-all` e o DMARC
   `p=reject` continuam como estão (§ 7.1).

Também já decidido (`01 Empresa/Decisões.md`, 20–21/10), **não reabrir**: migrar ANTES de ir ao ar; a Vercel **não
será promovida** (a produção de lá fica como está até ser apagada); grátis primeiro, US$ 5/mês só depois da 1ª venda
(item 5).

---

**Goal:** o site (páginas estáticas + `api/*.mjs` + 2 rotinas agendadas) passa a rodar num Worker da Cloudflare com
assets estáticos, em `https://beyonzero.com.br`, com a mesma segurança de hoje ("só o dono publica produção",
fechado por padrão, IP confiável), só Pix, e medido contra os limites do plano grátis.

**Architecture:** um Worker (`cloudflare/worker.mjs`) que só roda em `/api/*` (`run_worker_first`); as páginas saem
dos assets com cabeçalhos no `_headers`. Uma tabela de rotas chama as funções que já existem (`atender`, `receber`,
`executar`, `listar`/`criar`, `ler`/`mudar`), reescreve os cabeçalhos de IP e limita o corpo por rota. O ambiente
("produção / prévia / local") é decidido pelo **runtime** (`navigator.userAgent === 'Cloudflare-Workers'`) mais o
`BZ_AMBIENTE` versionado, fechado por padrão. Produção e prévias ficam em **contas Cloudflare separadas**
(recomendação da Decisão do dono 1, § 4), para que código de uma branch qualquer nunca tenha a credencial que publica
produção.

**Tech Stack:** Node 24 (testes `node --test`), Cloudflare Workers + Static Assets, Wrangler **4.136.3** fixado
(≥ 4.135.0, exigido pelas Previews), Workers Builds (integração Git), Cloudflare Access, Supabase (Auth + PostgREST),
Mercado Pago (Orders/Pix), Turnstile.

## Global Constraints

- Nenhum código vai ao ar sem o dono: produção só a partir da branch `producao`, na conta de produção; o agente
  nunca tem token da Cloudflare (nem de produção nem de prévia) e nunca cola segredo.
- Fechado por padrão: na Cloudflare, ambiente ausente/errado = `producao` (o mais restritivo); nada de simulador,
  banco em memória, `BZ_LOCAL` ou chave de teste fora do `local`.
- `compatibility_date` `"2026-10-21"`, `compatibility_flags: ["nodejs_compat"]`. O `nodejs_compat` traz o
  `process.env` preenchido com vars e segredos (`nodejs_compat_populate_process_env`, data ≥ 2025-04-01); o
  `navigator.userAgent === 'Cloudflare-Workers'` vem da **data** (`global_navigator`, padrão desde 2022), não do
  `nodejs_compat`.
- Limites do plano grátis (lidos em 21/10, https://developers.cloudflare.com/workers/platform/limits/): **10 ms de
  CPU** por pedido e por cron; **50 subpedidos** por invocação; **100.000 pedidos/dia** (zera 00:00 UTC = 21 h de
  Brasília); 5 crons por conta; 1 s de inicialização; 128 MB de memória; corpo até 100 MB (plano da zona). Estouro
  de CPU = erro 1102 ("Worker exceeded resource limits"; há tolerância a estouro *ocasional*).
- Rota medida "cabe no grátis" só se: p99 quente ≤ 5 ms, 1ª chamada ≤ 8 ms, ≤ 45 subpedidos (limiar do § 3.3).
- Só Pix fora do `local`: `MP_METODOS` ausente/inválido = só Pix.
- Toda tarefa: teste visto **vermelho** antes do código (`docs/PROCESSO.md`); todos os arquivos tocados aqui são
  nível 3; revisão técnica e de segurança por agente diferente; `/code-review` antes de dar por pronto.
- Comandos: ferramenta Bash; se der `fork: Permission denied`, a fila do vigia (`.superpowers/sh/COMO-RODAR.md`,
  jobs `.ps1` sem acento). Nunca o terminal do app.
- CSP sem inline (CLAUDE.md regra 7); celular primeiro (regra 9) nas mudanças de tela.
- Commits em português, explicando o porquê, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## 1. O que muda em relação à 1ª versão (para quem leu a anterior)

| Antes | Agora | Por quê |
|---|---|---|
| "Workers Paid obrigatório" | grátis, medido; se não couber: (b) em pedaços e depois (c); nada pago antes da 1ª venda (Decisão do dono 2, respondida) | decisão do dono 1; medida do § 3 |
| "decidir cartão (R1)" | só Pix, tarefa A7 com teste | decisão do dono 2 |
| "trocar os servidores DNS" (§ 8 antigo, passos 1–4) | feito; só conferir | decisão do dono 3 |
| `BZ_PLATAFORMA` posto pelo código numa cópia do `env` | Cloudflare reconhecida pelo **runtime**; `BZ_PLATAFORMA` só simula nos testes | revisão A2 |
| `ipDe` decide pela presença de `request.cf` | a entrada do Worker **reescreve** os cabeçalhos de IP; `ipDe` fica como está | revisão M4 |
| uma conta, prévias de toda branch com o mesmo token | **duas contas** (produção / prévias), recomendado na Decisão do dono 1 | revisão A1 |
| limite de corpo único de 64 KiB | limite **por rota**, ≥ 3× o do handler | revisão M1 |
| login anônimo "igual à Vercel, subir o limite" | `Sb-Forwarded-For` com o IP real (tarefa A10) + ensaio | revisão A4 |

## 2. A revisão, achado por achado

### 2.1 ALTO

| # | Achado (resumo) | Confere no código? | Como o plano resolve | Onde |
|---|---|---|---|---|
| **A1** | A barreira tem 2 caminhos fora do guarda: (1) o token do Workers Builds roda o código de **toda** branch empurrada e pode `wrangler deploy` produção; (2) um workflow do GitHub Actions empurrado numa branch pode declarar `contents: write` e dar `git push` em `producao` | Sim. Doc do Builds (21/10): "Preview Builds" rodam em toda branch que não é a de produção; o token padrão tem *Workers Scripts: Edit* na conta; não há filtro de branch, só liga/desliga. Workflows hoje: `contents: read` (`ci.yml:14-15`, `processo.yml:11-12`), mas o YAML de uma branch pode pedir mais | **Caminho 1 fechado por desenho**: prévias numa **2ª conta Cloudflare** (grátis), com o seu próprio Builds e token; na conta de produção, "Enable Preview Builds" **desligado** e branch de produção `producao`. O código de uma branch qualquer só roda com o token da conta das prévias, que não alcança a produção. **Caminho 2: limite escrito, não fechado de graça** (2ª revisão, ALTO-3). O "Workflow permissions = Read" (P1) só muda o padrão (o YAML pode pedir `contents: write`); o B8 roda no CI **depois** do push; a varredura de texto do guarda pega erro e instrução óbvia, não quem quer contornar. A trava que pega o vetor real (o agente enganado) é a **confirmação do dono no `git push`**: o guarda pede o "sim" dele sempre que algum arquivo mudado em relação à `origin/main` for workflow, `cloudflare/`, `wrangler.jsonc` ou `package*.json` (cobre escrita por qualquer meio, inclusive pelo terminal); a regra "ask" de Edit/Write é só o 1º aviso; mais **negar** `gh api` de escrita (P2, aplicado pelo dono). A única trava técnica completa é ruleset na `producao`, que em repositório privado exige **GitHub Pro (US$ 4/mês)**: opção (c) da Decisão 1, com o risco que sobra sem ela escrito | § 4 D1, § 5.3, § 5.5, B6, B8, § 7 P1–P2 |
| **A2** | "Fechado por padrão" vaza: 4 chamadas sem `env` caem em `process.env`, onde o `BZ_PLATAFORMA` posto numa cópia do `env` não existe | Sim: `api/_vendas/fluxo-pedido.mjs:57` `naVercel()` (a trava "sem chave do IP fecha" **abre**); `:50` `chaveDoTelefone(d.telefone, segredoFreio)` (sem segredo cai no `env = process.env` de `api/_vendas/pedido.mjs:53`); `api/_vendas/fluxo.mjs:142` `modoDirecoes()` (o `api/vendas.mjs:95` nunca passa `direcoes`); `api/_vendas/agente.mjs:75` `modoDirecoes()`. A 5ª chamada sem argumento, `configClassificador()` (`api/_classificador/index.mjs:26`), só lê `BZ_JEV` e não decide ambiente: inofensiva | `ambienteDe` reconhece a Cloudflare pelo **runtime** (`globalThis.navigator?.userAgent === 'Cloudflare-Workers'`, valor fixo do workerd, flag `global_navigator`), então até a leitura por `process.env` vê "Cloudflare". O `BZ_PLATAFORMA` existe só para os testes em Node simularem. E as 4 chamadas passam a receber o ambiente explicitamente; a falta dele **fecha** (`'manual'`, 503). Teste estático novo falha se alguma função de ambiente for chamada sem argumento em `api/`. A mutação (A6) sabota "chamada sem env" | A1, A2, A6 |
| **A3** | Plano grátis: rotas que não cabem em 10 ms, e a medição antiga não as pegaria | **Medido agora** (§ 3): a varredura de uma direção **típica** (8 seções, 27 KB) gasta **~10 ms quente e 40–50 ms na 1ª chamada** no Node deste PC; a entrega (`entregar_direcao`, `ajuste_feito`) é o caminho de venda do lançamento (`BZ_DIRECOES=manual`). Reconciliação: com 50 pendentes, 1 + 2×50 subpedidos > 50 (`api/_pagamentos/servico.mjs:228-259`, `limite = 50`, `varrerPaginas = 3`). Painel GET: `listar` pagina até 50 × 2 tabelas (`api/_banco.mjs:16-17`, `:43-52`) | (1) **Bancada de CPU e subpedidos no Node** (tarefa M1) com dados do tamanho real, `process.cpuUsage` e limiar fixo; (2) **medida na prévia** (tarefa M2) lendo CPU por invocação no Workers Logs; (3) código que vale em qualquer plano: orçamento de subpedidos por execução na reconciliação e na rotina diária (A8) e teto de **CPU** no painel (A9), sem falha calada; (4) a bancada enumera as ações de `/api/vendas` e do painel (inclusive as do PR 3b) e falha se faltar caso; (5) **um critério só** para a M2 (§ 3.3), escrito antes de medir; (6) a entrega de direção vai para a **Decisão do dono 2** com 3 caminhos (US$ 5; varredura em pedaços + aquecimento; só a varredura do PC dele) | § 3.3, § 4 D2, A8, A9, M1, M2 |
| **A4** | O Supabase vê todos os visitantes com **um** IP, o mesmo de todo cliente de Workers (`2a06:98c0:3600::103`): o limite por IP do login anônimo vira um balde do mundo | Sim. Doc de cabeçalhos (21/10): subpedido de Worker para outra zona da Cloudflare chega com esse `CF-Connecting-IP` fixo. `api/_vendas/visitante.mjs:42` faz `/auth/v1/signup` do servidor, com a chave pública; limite padrão: 30/h por IP no anônimo e 150/5 min no `/token` (renovação, `:52`) — doc do Supabase lida em 21/10 | **`Sb-Forwarded-For`**, documentado oficialmente pelo Supabase (Authentication › Rate Limits › IP Address Forwarding; desligado por padrão em projeto novo; **só com chave secreta**, nunca a publicável). Tarefa A10: nas chamadas ao Auth de **criar** e **renovar**, o servidor manda `apikey` = chave secreta e `sb-forwarded-for` = o IP já validado pela entrada do Worker. O valor enviado é o do `normalizarIp` (IPv4 exato; IPv6 pelo **prefixo /64**, a casa inteira conta como um, intencional). Dono liga a opção no staging e na produção. **Ensaio que prova o limite, não só o log** (M2): anônimo baixado para 3/h no staging, a 4ª sessão do mesmo celular recebe 429 e outra rede recebe 200. **Limite escrito:** a doc não diz se a opção existe no plano grátis do Supabase; se não existir, o dono escolhe no P6 entre atrasar o corte pelo plano B (visitante criado no navegador: spec própria, ~2–3 dias com revisão) ou ir ao ar com o balde compartilhado e monitorar os 429 do Auth (R7) | A10, M2, § 7 P6, R7 |

### 2.2 MÉDIO

| # | Achado | Confere? | Resolução | Onde |
|---|---|---|---|---|
| M1 | Limite fixo de 64 KiB no Worker quebra o painel | Sim: painel aceita 200.000 caracteres (`api/painel.mjs:41`, `:115`); em UTF-8 isso passa de 64 KiB | Limite **por rota** em bytes = 3 × o limite do handler (em unidades de texto do JS; 1 unidade ≤ 3 bytes em UTF-8); os limites dos handlers passam a ser exportados e o teste B1 confere "Worker ≥ 3 × handler" para cada rota. O `rotear` lê o corpo uma vez e entrega ao handler um `Request` **novo** com esse corpo | B1 |
| M2 | Lista de permissão esquece `painel.css`, `privacidade.css`, `resumo.css` (raiz) | Sim (`ls` da raiz, 21/10) | Oráculo: `git ls-files` − regras do `.vercelignore` − o que não é página (`api/`, `package*.json`, `vercel.json`…) **==** saída do `montar-publico`, nos dois sentidos. Depois do PR D, a lista congelada vira o teste. Fumaça: `/_headers` e `/publico/x` → 404 | B3, B7 |
| M3 | 100 mil pedidos/dia: um IP sozinho esgota a cota; o `workers.dev` passa por fora da regra da zona | Sim: 40/10 s = 345.600/dia de um IP; doc de assets: pedido de `run_worker_first` recebe 429 quando a cota acaba | `workers_dev: false` **obrigatório** na produção (teste no JSONC, B6/C2). **Limite escrito, sem rodeio:** no grátis nenhuma regra protege a cota; a regra da zona fica em **10 pedidos / 10 s** por IP (= 86.400/dia, abaixo dos 100 mil: um IP sozinho não esgota, precisa de dois), conferida contra os pedidos por visita medidos na M2; o webhook do MP recebe 429 com a cota esgotada e a reconciliação recupera **se o cron rodar**. Pesa a favor da (a) na **Decisão do dono 2** | B6, C2, M2, § 7.1, § 4 D2 |
| M4 | A decisão do IP depende de `request.cf` sobreviver até o handler | Sim: os handlers chamam `ipDe` de novo (`api/vendas.mjs:52`, `api/painel.mjs:58`, `api/_vendas/fluxo-pedido.mjs:53`, `api/_cron.mjs:32`…) | O `rotear` **reescreve** os cabeçalhos: apaga `x-forwarded-for` e `x-vercel-forwarded-for` e põe `x-forwarded-for` = `cf-connecting-ip` validado; na Cloudflare sem IP válido → 403. O `ipDe` (`api/_freio.mjs:29-33`) não muda. Cron interno não passa pelo `rotear` (e só usa IP com segredo errado, `api/_cron.mjs:32`). Fumaça: XFF forjado não muda a chave do freio | B1, B7 |
| M5 | "Só Pix" sem tarefa, arquivo nem teste | Sim: tela `orcamento.html:383`, `:396`, `:427`; `js/orcamento-pagamento.js:69-84`, `:202`; API `api/_pagamentos/servico.mjs:159`, `:163`; `configPublica` (`api/_pagamentos/config.mjs:56-58`) não diz os métodos; banco aceita `('pix','cartao')` (não precisa migration) | Tarefa A7: `MP_METODOS` versionado (`"pix"`), `configPagamentos` → `metodos` (fora do `local`, ausente/inválido = `['pix']`), `configPublica` expõe, `iniciar` recusa cartão **antes** de validar e de tocar o banco, tela nasce sem cartão. Local (`simulado`) segue com cartão para o E2E | A7 |
| M6 | O texto do plano e o resumo contradizem as decisões; o § 4.3 item 4 de `02-OPERACAO.md` manda desligar o login anônimo | Sim (`docs/fundacao/02-OPERACAO.md:122-124`; "seis migrations", hoje são 34) | Este plano e o resumo foram reescritos com as decisões; § 7 diz "itens 1–3 e 5; o 4 está superado"; C5 corrige o `02-OPERACAO.md`; A0 atualiza `03-STATUS.md` já no PR A | A0, C5, § 7 |
| M7 | `scripts/direcoes.mjs` aceitar `*.workers.dev` com subdomínio livre manda a `PAINEL_CHAVE` a terceiros | Sim: `validarBase` (`scripts/direcoes.mjs:167-173`) com `HOSTS` em `:46` | Subdomínio `workers.dev` da conta das prévias **fixo numa constante**; padrões ancorados; teste com `x-beyon-zero-site.evil.workers.dev` e `…workers.dev.evil.com` recusados | C3 |
| M8 | O Access nas prévias barra o próprio agente (verificação, medição, script de direções) | Sim | **Service token** do Access, só da conta das prévias (dados de teste), criado pelo dono; os scripts mandam `CF-Access-Client-Id/Secret` quando as variáveis existem. Escopo do Access: **Worker `beyon-zero-site-previa` → "All traffic"** (cobre o staging fixo, que é deploy e não "Preview", e as prévias). O Zero Trust exige ativação e **pede cartão mesmo no Free** (sem cobrança): dito no P3/P5 e no resumo. Bypass de `/api/pagamentos` só no hostname **fixo** do staging, ensaiado; se não der, a reconciliação do staging cobre | B9, § 5.4, P3, P5 |
| M9 | O servidor local e o E2E não passam pela tabela de rotas do Worker | Sim: `docs/servidor.mjs:52-66` chama `mod[req.method]` direto | O servidor local passa a chamar o **mesmo** `rotear` (com `process.env`), então o E2E do orçamento atravessa a mesma porta da produção | B5 |

**Contagem (depois da 2ª revisão):** ALTO: A2 resolvido; A1, A3, A4 resolvidos **com limite escrito** (A1: o
caminho 2 só fecha de vez com GitHub Pro, Decisão 1 (c); A3: a entrega de direção depende da Decisão 2; A4: a opção do
Supabase pode não existir no grátis, R7). MÉDIO: 9/9 resolvidos, M3 e M8 com limite escrito; nenhum descartado.

### 2.3 BAIXO (todos absorvidos)

| Achado | Resolução |
|---|---|
| 404 e caminhos sem regra saem sem CSP | `_headers` com CSP geral em `/*` e, em `/orcamento` e `/painel`, `! Content-Security-Policy` seguido da CSP própria (a doc aceita desanexar); B4 testa; se o ensaio na prévia mostrar que desanexar e repor no mesmo bloco não funciona, volta a CSP por página **e** uma regra própria para o 404 |
| Ordem do 1º deploy (segredo só com o Worker existindo) | § 7, passos P3–P5: `producao` nasce sem `routes` e sem segredos (tudo fecha), dono cola os segredos, o domínio entra pelo PR C numa promoção normal |
| Builds no grátis: 1 build por vez, 3.000 min/mês; 100 prévias por Worker | escrito no § 5.3; com duas contas, a fila de prévias não atrasa a promoção (contas separadas) |
| Credencial da captação (`CLOUDFLARE_API_TOKEN`, *Pages: Edit*) na conta de produção | § 5.5: esse token **nunca** ganha *Workers Scripts*; regra do guarda: `wrangler` com essa variável fora de `captacao/` é negado |
| Promoção por merge: squash/rebase divergem a `producao` | o PR de promoção pede "Create a merge commit"; o agente confere `git diff origin/main origin/producao` vazio depois de cada promoção (§ 5.2) |
| `build.command` no `wrangler.jsonc` não roda no Builds | o comando vai no painel ("Build command"); B6 exige JSONC **sem** `build` |
| `wrangler check startup` e tamanho do pacote | B7 (o SDK da Anthropic é empacotado mesmo com `import()` dinâmico, `api/_ia/provedor.mjs:31`) |
| Workers Logs no grátis: cota diária e retenção curta | § 5.6: conferir a cota no painel no dia do ensaio; `head_sampling_rate: 1` enquanto o tráfego é baixo; anotar |
| Vercel no período de redirecionamento | **Decisão do dono 3** |
| Conta dos segredos (15 nomes no `.env.example`, não 16) | § 6 corrigido; `MP_METODOS` nos ajustes versionados |
| `03-STATUS.md` ainda diz "Cloudflare só no fim" | tarefa A0, já no PR A |
| Supabase grátis pausa projeto parado | § 7: a rotina diária toca o banco todo dia; conferir na doc atual do Supabase no dia (o agente não confirmou o prazo de pausa) |
| `www` e Turnstile | sem mudança: o raiz cobre o `www` |

---

## 3. Medidas já feitas (21/10, Node 24.18, Windows, este PC)

### 3.1 CPU da entrega de direção (`higienizar` + `varrer`)

Script descartável (scratchpad, não versionado), `performance.now()` em volta de código síncrono (no Windows o
`process.cpuUsage` tem degraus de ~15,6 ms; para código síncrono, relógio ≈ CPU). Duas rodadas:

| Entrada | Tamanho | `higienizar` (p50) | `varrer` 1ª chamada | `varrer` p50 quente |
|---|---|---|---|---|
| `docs/testes/fixtures/direcao-valida.json` | 1,3 KB | — | 30–39 ms | ~1 ms |
| direção típica: 8 seções, 6 itens, textos de 90/200/650/60/280 caracteres | 27 KB | **~0,5 ms** | **40–51 ms** | **~10–11 ms** |
| uma seção dessa direção | — | — | — | ~1,5 ms |
| direção máxima adversária (`varredura-casos.test.mjs:186-194`, unidade `a-`) | 54 KB | — | ~200–250 ms | ~180–230 ms |

Leitura: o custo é a **varredura** (`api/_vendas/varredura.mjs:233`), não o filtro. A 1ª chamada num isolado novo
paga a compilação das ~30 regex. Site com pouco tráfego quase sempre pega isolado frio. Os servidores da
Cloudflare têm outra CPU: o número exato vem da M2, mas **a ordem de grandeza não cabe em 10 ms**.

### 3.2 Subpedidos (contados no código)

| Rota | Subpedidos | Cabe em 50? |
|---|---|---|
| Reconciliação (`api/_pagamentos/servico.mjs:228-259`) | 1 (lista) + até 2 por tentativa (consultar + aplicar) + 1 por página do MP + 2 por order recente + 2 (atenção, ocorrência) | **Não** com > ~20 pendentes/orders; `limite = 50` |
| Painel GET 30–365 dias (`api/painel.mjs:100-101`, `api/_banco.mjs:43-52`) | 1 por 1.000 linhas por tabela (2 tabelas) + 1 (saúde) | sim no lançamento; **não** acima de ~24 mil linhas |
| Sessão do orçamento (`api/vendas.mjs`) | Turnstile 1 + Auth 1 + RPC 1–3 | sim |
| Entrega de direção (`api/painel.mjs:164-180`) | 2 RPC | sim (o problema é CPU) |

### 3.3 Limiar para "cabe"

**Um critério só, escrito antes de medir** (2ª revisão, MÉDIO-4). No grátis, pedido acima de 10 ms é **cortado**
(1102 / `exceededCpu`) ou passa pela tolerância a estouro ocasional: o sinal na Cloudflare é "teve 1102?", não
"quantos ms deu".

| Onde | Rota | "Cabe" quando |
|---|---|---|
| M1 (Node, triagem) | toda ação | p99 quente ≤ 5 ms **e** 1ª chamada ≤ 8 ms **e** ≤ 45 subpedidos. Fora disso: rota "em risco", medida com mais cuidado na M2 |
| **M2 (staging, decide)** | toda ação do visitante, painel GET, webhook, crons | em **20 chamadas espaçadas** (frias e quentes), **nenhum** 1102/`exceededCpu`, **p99 de CPU no Workers Logs ≤ 7 ms** e ≤ 45 subpedidos |
| **M2 (staging, decide)** | `entregar_direcao`, `ajuste_feito` (só o dono, raras) | em **5 entregas frias** (≥ 15 min entre elas, direção típica do § 3.1): **qualquer** 1102 = não cabe |

Qualquer rota fora do critério da M2 → o agente aplica a **Decisão 2 já respondida** (grátis; (b) entrega em pedaços
e, se ainda não couber, volta ao dono com a (c)), levando a tabela junto. A M2 anota também os pedidos
`/api/*` por visita ao orçamento (para a regra de limite, § 7.1).

---

## 4. Decisões do dono que este plano pediu (as 3 foram respondidas em 21/10)

> **Respondidas em 21/10 (`01 Empresa/Decisões.md`):** Decisão 1 = **(b)**, duas contas grátis, sem GitHub Pro;
> Decisão 2 = **grátis, nada pago antes da 1ª venda** (se a entrega não couber: (b) e, se ainda não couber, volta ao
> dono com a (c)); Decisão 3 = **apagar logo**, depois de a captação trocar os links. As tabelas e recomendações
> abaixo ficam como registro do que foi perguntado; o que vale é esta nota e o topo do plano.

### Decisão do dono 1 — Como a barreira "só o dono publica" fica na Cloudflare (RESPONDIDA: (b))

| Opção | Como funciona | O que fecha | Custo para o dono |
|---|---|---|---|
Dois caminhos levam código ao ar sem o dono (§ 2.1 A1): **caminho 1**, o programa que monta as prévias (Workers
Builds) roda o código de toda branch com uma chave que publica; **caminho 2**, uma automação do GitHub (workflow)
empurrada numa branch pode pedir permissão de escrita e empurrar para `producao`.

| Opção | Como funciona | O que fecha | O que sobra | Custo |
|---|---|---|---|---|
| (a) Uma conta só | prévias e produção na mesma conta, mesma chave do Builds | nada | os dois caminhos abertos: um texto malicioso lido pelo agente vira uma branch que publica | nenhum |
| **(b) Duas contas + confirmação do dono (recomendada)** | conta atual = **produção** (zona, Worker `beyon-zero-site`, Builds só da `producao`, prévias desligadas). Conta nova de **outro usuário** = **prévias** (Worker `beyon-zero-site-previa`, Builds da `main` e de toda branch, segredos de teste, Access). No guarda do dono: nenhum `git push` do agente que mude workflows, `cloudflare/`, `wrangler.jsonc` ou `package*.json` sai sem o **"sim"** dele, e o agente não pode usar `gh api` de escrita (P2) | caminho 1 inteiro; caminho 2 para o agente enganado (ele não cria o workflow sem o "sim" do dono) | um workflow malicioso que chegue ao repositório por outro meio (outra pessoa, outra ferramenta, ou o dono aprovar sem ler) empurra para `producao` e publica. Hoje só o dono e o agente escrevem no repositório | grátis; ~15 min; o Zero Trust da conta de prévias **pede cartão** (sem cobrança) |
| (c) (b) + **GitHub Pro, US$ 4/mês** | ruleset na branch `producao`: só o dono atualiza, só por PR | caminho 2 também: o workflow (que roda como "github-actions") não consegue empurrar | o agente usa o login do dono no GitHub: contra ele continua valendo o guarda (nega push e merge em `producao`) | US$ 4/mês |

Descartada da 1ª versão: produção por `versions upload` com "Deploy" no painel. **Não fecha** nenhum caminho: o Build
command roda no Builds de produção com a chave que pode `versions deploy`.

**Recomendação: (b) agora.** Fecha o caminho que existe de verdade hoje (o agente empurra branches o dia todo) sem
gastar nada, coerente com "investimento mínimo até o primeiro cliente". O risco que fica é escrito acima e é pequeno
enquanto só o dono e o agente mexem no repositório. A (c) vale a pena quando entrar outra pessoa no repositório ou no
1º cliente; não é obrigatória.

### Decisão do dono 2 — Plano grátis com a entrega de direção que não cabe (RESPONDIDA: grátis; (b), depois (c); a (a) só depois da 1ª venda)

A M2 mede tudo no staging com o critério do § 3.3. Se alguma rota ficar fora (o esperado, pelo § 3.1, é a entrega de
direção), as opções:

| Opção | O que é | Prós | Contras |
|---|---|---|---|
| **(a) US$ 5/mês (recomendada se a M2 confirmar)** | Workers Paid na conta de **produção** (a de prévias fica grátis; prévia não tem cliente) | nada a reescrever; acaba também a cota de 100 mil/dia (M3) e o teto de 50 subpedidos | US$ 5/mês desde o lançamento |
| (b) Grátis, varredura em pedaços | o `scripts/direcoes.mjs` manda a direção uma seção por pedido para uma rota que só varre e devolve um recibo assinado; a entrega final confere os recibos; e a varredura "aquece" as regex na inicialização do Worker | continua grátis | ~1 dia de código nível 3 a mais; a 1ª chamada fria pode estourar mesmo assim (40 ms medidos); a cota diária continua |
| (c) Grátis, sem a 2ª varredura no servidor | o servidor fica só com o `higienizar` (~0,5 ms); a varredura roda só no seu PC (`scripts/direcoes.mjs:303`, `:326`, `:421` já rodam) | grátis, zero código novo | perde a defesa em profundidade (se o script do PC for adulterado ou tiver bug, conteúdo indevido chega ao cliente): é decisão de segurança |

**Recomendação: (a), se a M2 confirmar.** É o que a sua regra já diz ("US$ 5 só se não couber"), e as opções (b) e
(c) gastam mais tempo ou tiram uma proteção para economizar US$ 5. Até a M2, o plano segue grátis. Pesa também a cota:
no grátis, **nenhuma regra protege os 100 mil pedidos/dia** (M3, § 7.1); esgotada, o orçamento e o aviso de pagamento
param até 21 h. **O pago não é "sem limite":** passa a cobrar o excesso (pedidos além de 10 milhões/mês, CPU além do
incluído, cobrados por milhão); um ataque passa a custar pouco dinheiro em vez de derrubar, mas **o Workers Paid não
tem teto de gasto**. O `"limits": { "cpu_ms": 100 }` da produção paga (tarefa C2b) limita o trabalho de **cada**
pedido, não o total da conta.

### Decisão do dono 3 — O endereço antigo `beyon0-site.vercel.app` (RESPONDIDA: apagar logo, depois de a captação trocar os links)

Ele está nas mensagens da captação, em `captacao/config/oferta.json` e no rodapé dos sites de demonstração já
publicados.

| Opção | O que acontece |
|---|---|
| (a) Deixar a Vercel como está até a captação trocar os links, depois apagar | quem clicar num link antigo depois de apagar vê erro |
| **(b) Trocar por um redirecionamento 301 para `beyonzero.com.br` por 90 dias, depois apagar (recomendada)** | links antigos continuam funcionando; é um deploy estático de redirecionamento (não é o site novo, não vende nada, não é "promover" o código novo na Vercel), feito pelo dono |
| (c) Apagar logo depois do corte | mais simples; links antigos quebram no mesmo dia |

**Resposta do dono (21/10): "Apague, substitua logo"**, sem os 90 dias de redirecionamento. É a (c), com uma condição
dita no registro: a captação troca antes os links das mensagens e demonstrações para `beyonzero.com.br`. Por isso o
plano NÃO cria o deploy estático de redirecionamento; o P17 só apaga, e só depois de a captação avisar que trocou.

**Recomendação: (b), por 90 dias** (30–60 dias é pouco para sites de demonstração que o cliente pode reabrir meses
depois).

---

## 5. Arquitetura alvo (escrita para a recomendação (b) da Decisão 1)

### 5.1 Peças e equivalências

| Vercel hoje | Cloudflare | Onde |
|---|---|---|
| `cleanUrls`, `trailingSlash: false` | `assets.html_handling: "auto-trailing-slash"`: `/orcamento` 200; `/orcamento.html` e `/orcamento/` → **307** (a Vercel dava 308; aceitável, B7 confere) | `wrangler.jsonc` |
| 404 automático | `assets.not_found_handling: "404-page"` (usa o `404.html` da raiz) | `wrangler.jsonc` |
| `regions: ["gru1"]` | nada (o Worker roda no ponto mais perto do visitante); Smart Placement desligado | — |
| `git.deploymentEnabled.main: false` | conta de produção: Builds só da branch `producao`, "Enable Preview Builds" **desligado** | painel (dono) |
| prévias com login (Deployment Protection) | conta de prévias: `main` → staging fixo `beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev`; outras branches → `<prévia>-beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev`; Cloudflare Access | painel (dono) |
| `headers` do `vercel.json` | `_headers` (páginas) + cabeçalhos da API postos pelo `rotear` (o `_headers` não vale para resposta do Worker) | `_headers`, `cloudflare/rotas.mjs` |
| `redirects` + `.vercelignore` (escondem arquivos) | lista de permissão: `cloudflare/montar-publico.mjs` copia só o público para `publico/` (fora do git) | B3 |
| `crons` `17 9 * * *` e `41 6 * * *` + `reconciliar.yml` (3 em 3 h) | `triggers.crons: ["23 */3 * * *", "41 6 * * *"]` + `scheduled()` chamando as MESMAS funções | B2 |
| `x-vercel-forwarded-for` | o `rotear` troca os cabeçalhos de IP pelo `cf-connecting-ip` validado | B1 |
| `VERCEL`/`VERCEL_ENV` (8 lugares) | `ambienteDe(env)` por runtime + `BZ_AMBIENTE` | A1, A2 |
| corte de 4,5 MB no corpo | limite por rota no `rotear` | B1 |
| Instant Rollback | Deployments → Rollback (não desfaz migration) | painel (dono) |
| Logs | Workers Logs (`observability`) + traces | `wrangler.jsonc` |

### 5.2 Arquivos novos e alterados (mapa)

```text
NOVOS
api/_ambiente.mjs                 ambienteDe(env) → 'producao' | 'previa' | 'local'; naCloudflare(env); foraDoLocal(env)
cloudflare/worker.mjs             entrada: fetch → rotear; scheduled → agendar (sem lógica)
cloudflare/rotas.mjs              tabela /api/<nome> → função; limites por rota; IP; cabeçalhos da API; 404/405/413/500
cloudflare/agenda.mjs             tabela cron → rota interna com Bearer CRON_SECRET
cloudflare/cabecalhos.mjs         leitor do _headers (servidor local e testes)
cloudflare/montar-publico.mjs     copia a lista de permissão para publico/
_headers                          cabeçalhos das páginas (fonte única)
wrangler.jsonc                    configuração (produção no topo; env.previa para a conta das prévias)
scripts/processo/anti-publicacao.mjs   a trava do A1 (usada pelo teste B8 e pela cópia do guarda)
docs/cpu-rotas.mjs                bancada de CPU e subpedidos (M1)
docs/worker-fumaca.mjs            fumaça no workerd (só CI)
docs/testes/ambiente.test.mjs     A1–A3
docs/testes/worker.test.mjs       B1, B2, B6
docs/testes/publico.test.mjs      B3
docs/testes/anti-publicacao.test.mjs   B8
docs/testes/dominio.mjs           constante do domínio (C1)

ALTERADOS (principais)
api/_vendas/turnstile.mjs:35-36, api/_pagamentos/config.mjs:21-40, api/_vendas/pedido.mjs:49-58, api/pagamentos.mjs:99,
api/_ia/provedor.mjs:37-38, api/_ia/config.mjs:27-33, api/_banco.mjs:101, api/vendas.mjs:71,:95 (A2), api/vendas.mjs:75 (A10)
api/_vendas/fluxo.mjs:142, api/_vendas/fluxo-pedido.mjs:38,:50,:57, api/_vendas/agente.mjs:75 (A2)
api/_pagamentos/config.mjs:56-58, api/_pagamentos/servico.mjs:159, orcamento.html:383,:427, js/orcamento-pagamento.js (A7)
api/_pagamentos/servico.mjs:228-259 (A8); api/_banco.mjs:43-52, api/painel.mjs:100-101 (A9)
api/_vendas/visitante.mjs:35-55 (A10); docs/servidor.mjs:52-66 (B5); scripts/direcoes.mjs:46,:167-173 (C3)
.gitignore, package.json, package-lock.json, .github/workflows/ci.yml, scripts/processo/niveis.json (B)
```

### 5.3 Publicação, prévias e a barreira

| Conta | Worker | Branch → o que acontece | Segredos | Quem configura |
|---|---|---|---|---|
| **Produção** (a conta atual, dona da zona) | `beyon-zero-site` | `producao` → `npx wrangler deploy` (config do topo). Nenhuma outra branch constrói | os 15 de produção | dono |
| **Prévias** (conta nova, grátis, de **outro usuário**: o Builds só aceita token de usuário, e um token de usuário com acesso às duas contas alcançaria a produção) | `beyon-zero-site-previa` | `main` → `npx wrangler deploy --env previa` (staging fixo, com crons); outra branch → `npx wrangler preview --env previa` | os de teste (Supabase staging, MP teste, Turnstile teste) | dono |

- **Promover** (substitui o "Promote" da Vercel): 1) o agente mescla na `main` pelo processo de sempre; 2) confere o
  staging; 3) abre o PR **"Promover para produção: `<sha>`"** de `main` para `producao`, pedindo **"Create a merge
  commit"** (nunca squash/rebase); 4) o dono abre no celular e clica **Merge**; 5) o agente confere a produção e
  `git diff origin/main origin/producao` vazio.
- **Voltar atrás:** conta de produção → Workers & Pages → `beyon-zero-site` → Deployments → ⋯ → Rollback (dono).
- **Limites do Builds no grátis:** 1 build por vez por conta, 3.000 min/mês; 100 prévias por Worker (as mais velhas
  são apagadas sozinhas). Com duas contas, uma fila de prévias não atrasa a promoção.
- **O limite que fica (escrito para o dono):** código que chegue à `producao` publica (o Build command e o deploy
  rodam o que está no repositório, com a chave de produção). A porta prevista é o merge do dono. A outra porta é um
  workflow do GitHub empurrado numa branch: o YAML pode pedir `contents: write` (o padrão "Read" do P1 não é teto;
  doc do `GITHUB_TOKEN`) e empurrar para `producao`. Contra o agente enganado, a trava é a confirmação do dono no
  `git push` de mudanças em workflows e nos arquivos que o Builds executa (§ 5.5, item 1); o B8 e a varredura do guarda pegam erro e
  instrução óbvia, não quem quer contornar. Só a Decisão 1 (c) (GitHub Pro, ruleset na `producao`; **não escolhida em
21/10**, o dono ficou na (b) sem assinatura) fecharia essa porta
  para qualquer origem.

### 5.4 Access nas prévias (conta das prévias)

- Antes: ativar o **Zero Trust** na conta das prévias (plano Free, até 50 pessoas). A criação da organização **pede
  uma forma de pagamento mesmo no Free**, sem cobrança (doc "Create a Zero Trust organization"): avisar o dono antes.
- O dono liga o Access no Worker: `beyon-zero-site-previa` → aba Access → "Protect this Worker behind Access" →
  **All traffic** (cobre o staging fixo da `main`, que é um *deploy* e não uma "Preview", e as Preview URLs; a opção
  "Previews only" deixaria o staging público). Login por código no e-mail dele. As URLs são públicas por padrão.
- **Service token** "agente-previas" (Zero Trust → Access → Service Auth), política "Service Auth" na mesma
  aplicação. Vale só para as prévias (dados de teste); validade 1 ano. Fica no gerenciador de senhas do dono e num
  arquivo local que a fila do vigia lê (`%USERPROFILE%\.claude\segredos\access-previas.env`, com
  `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET`; o guarda nega ao agente **ler** esse arquivo, como faz com `.env`).
  Os scripts (B9) mandam os dois cabeçalhos quando as variáveis existem.
- **Webhook de teste do Mercado Pago:** exceção (política **Bypass**) só para o caminho `/api/pagamentos` do
  hostname **fixo** do staging. Se o Access não aceitar caminho no `workers.dev` (ensaio do P8), o aviso de teste
  fica sem chegar e a reconciliação de 3 em 3 h do staging confere o pagamento (é o mesmo código).

### 5.5 O guarda e as permissões do Claude Code (configuração do DONO; tarefa P2, só com a aprovação dele)

O agente **não** edita `~/.claude/settings.json`, hooks nem `~/.claude/guarda/`. O texto abaixo é o pedido que vai ao
dono no P2; **quem aplica é o dono, ele mesmo** (o agente só entrega o texto).

Os caminhos sensíveis: `.github/workflows/**`, `cloudflare/**`, `wrangler.jsonc`, `package.json`,
`package-lock.json`. Motivo: o Builds de produção executa o que está neles, e um workflow pode empurrar para
`producao`. Essas mudanças são raras.

1. **Confirmação no `git push`** (a trava que cobre qualquer forma de escrita): antes de todo `git push` do agente, o
   guarda lista os arquivos mudados entre `origin/main` e o que vai ser empurrado (`git diff --name-only
   origin/main...<ref empurrada>`); se algum casar com os caminhos sensíveis, pede o "sim" do dono (ou nega até ele
   aprovar). Falhou a listagem, nega.
2. **Regra `ask`** em `permissions` do Claude Code para Edit/Write nesses caminhos: é só o **1º aviso**. Ela vale
   para as ferramentas de edição, não para escrita pelo terminal (`echo >`, `cp`, `sed -i`, `git apply`,
   `node -e`), que passa sem pedir; por isso a trava de verdade é o item 1.

Negar ao agente, além do que já nega:
- `wrangler deploy` sem `--dry-run`, `wrangler versions deploy|upload`, `wrangler rollback`, `wrangler triggers
  deploy`, `wrangler delete`, `wrangler secret …`, `wrangler versions secret …`, `wrangler preview …` (inclusive
  `base-config secret`), `wrangler login`; as mesmas por `npx`, `npm exec`, `pnpm dlx`, `node node_modules/wrangler/…`
  e `npm run <script>` cujo texto no `package.json` contenha `wrangler` sem `--dry-run`/`dev`/`types`/`check`;
- `wrangler` com `CLOUDFLARE_API_TOKEN` definido fora de `captacao/` (o token da captação é *Pages: Edit* +
  *Analytics: Read* e **nunca** ganha *Workers Scripts*);
- `git push` com destino `producao` (inclusive refspec `X:producao`), `--all`, `--mirror`; `gh pr merge` de PR com
  base `producao` (consulta `gh pr view <n> --json baseRefName`; falhou a consulta, nega);
- **`gh api` de escrita** (`-X`/`--method` PUT, POST, PATCH ou DELETE, ou `-f`/`-F`/`--input` sem `--method GET`) em
  `/contents`, `/git/`, `/merges`, `/pulls/*/merge`, em **qualquer** branch: criaria commit sem `git push`;
- **antes de todo `git push`**: rodar a cópia do guarda de `scripts/processo/anti-publicacao.mjs` (o dono copia o
  arquivo do PR B para `~/.claude/guarda/anti-publicacao.mjs`) sobre a árvore a empurrar; achado = nega. É varredura
  de texto: pega erro e instrução óbvia (`wrangler deploy`, `:producao`), não quem quer contornar (`"prod"+"ucao"`,
  base64); por isso a confirmação no `git push` (item 1 acima) é que segura o agente enganado;
- ler `.dev.vars*`, `.wrangler/` e `~/.claude/segredos/`.

Repetir os principais em `permissions.deny` do `~/.claude/settings.json`. As regras da Vercel ficam até o PR D.
Permitido: `wrangler deploy --dry-run`, `wrangler dev`, `wrangler types`, `wrangler check startup`, push nas branches
de trabalho.

### 5.6 Observabilidade

`observability.enabled: true`, `observability.logs.enabled: true`, `head_sampling_rate: 1`,
`observability.traces.enabled: true` (o topo sozinho não liga traces). Os logs já são JSON de uma linha. Workers Logs
no grátis tem cota diária e retenção curta: conferir no painel no dia do P8 e anotar aqui. Alerta: o Workers Logs não
alerta por frase; o alerta do dono continua pelo ntfy na rotina diária (R11).

---

## 6. Segredos e ajustes

**Regra para o dono: tudo que ele cola no painel é "Secret"** (o `wrangler deploy` apaga variável de texto criada no
painel que não esteja no `wrangler.jsonc`; segredo não). Valores públicos por natureza também vão como Secret.

| # | Nome | Produção (conta de produção) | Prévias (conta das prévias, `env.previa` + segredos-base das Previews) | Obrigatória? |
|---|---|---|---|---|
| 1 | `SUPABASE_URL` | projeto `beyon-zero` | `beyon-zero-staging` | sim |
| 2 | `SUPABASE_CHAVE_PUBLICA` | `sb_publishable_…` | a do staging | sim |
| 3 | `SUPABASE_CHAVE_SECRETA` | `sb_secret_…` (também usada no `Sb-Forwarded-For`, A10) | a do staging | sim |
| 4 | `PAINEL_CHAVE` | 32+ caracteres | outra | sim |
| 5 | `ANTHROPIC_API_KEY` | só se o consultor for ligado | vazio (`BZ_IA=simulada` nas prévias) | não |
| 6 | `MP_ACCESS_TOKEN` | produção | teste | para pagar |
| 7 | `MP_PUBLIC_KEY` | produção | teste | para pagar |
| 8 | `MP_WEBHOOK_SEGREDO` | produção | teste | para pagar |
| 9 | `MP_USER_ID` | conta da Beyon Zero | conta de teste | para pagar |
| 10 | `CRON_SECRET` | 32+ caracteres | outro (o staging tem cron) | sim |
| 11 | `FREIO_SEGREDO` | 32+ caracteres | outro | recomendado |
| 12 | `ALERTA_NTFY_TOPICO` | tópico | vazio | opcional |
| 13 | `ALERTA_NTFY_TOKEN` | `tk_…` | vazio | opcional |
| 14 | `TURNSTILE_SITE_KEY` | widget de produção | `1x00000000000000000000AA` (teste oficial) | sim |
| 15 | `TURNSTILE_SECRET` | widget de produção | segredo de teste oficial | sim |

Ajustes **versionados** no `wrangler.jsonc` (não secretos): `BZ_AMBIENTE` (`producao` / `previa`), `MP_AMBIENTE`
(`producao` / `teste`), `MP_METODOS` (`pix` nos dois), `BZ_DIRECOES` (`manual`), `MP_3DS` (vazio), `METRICAS_HOSTS`
(vazio). `BZ_IA=simulada` só no `env.previa`.

Conta: o `.env.example` deste checkout tem **15** nomes; faltam `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`,
`BZ_DIRECOES` (A3 corrige); `METRICAS_HOSTS`, `MP_AMBIENTE`, `MP_3DS` e `MP_METODOS` viram ajuste versionado.

Passos do dono: conta certa → Workers & Pages → Worker → Settings → Variables and Secrets → Add → **Secret** → nome →
valor → Deploy. Cada valor também no gerenciador de senhas, com o mesmo nome e a conta (produção/prévias). Os
segredos-base das Previews são copiados para cada prévia **na criação** (mudar depois não muda as que já existem).

---

## 7. Passos do dono, em ordem (o agente guia pelo navegador dele, só olhando; nunca vê valor)

| # | Quando | Passo |
|---|---|---|
| P1 | já | GitHub → repositório → Settings → Actions → General → **Workflow permissions = Read repository contents** (muda só o padrão; não é trava, § 5.3) |
| P2 | antes de ligar qualquer Builds | **aprovar e aplicar** no Claude Code dele as regras do § 5.5: **confirmação no `git push`** quando algum arquivo mudado em relação à `origin/main` for workflow, `cloudflare/`, `wrangler.jsonc` ou `package*.json`; `ask` de Edit/Write nesses caminhos (1º aviso); `deny` de `gh api` de escrita; as regras do guarda e a cópia do `anti-publicacao.mjs` do PR B. O agente prepara o texto; não edita `settings.json`, hooks nem o guarda |
| P2b | **NÃO se aplica (Decisão 1 = (b), 21/10)** | (era: GitHub Pro, US$ 4/mês → ruleset na branch `producao`.) Sem assinatura antes da 1ª venda; revisitar depois dela ou quando entrar outra pessoa no repositório |
| P3 | depois do merge do PR B | criar a **conta das prévias** com **outro usuário** (outro login; ex.: o e-mail dele com `+previa`), nunca uma 2ª conta sob o mesmo login (Decisão 1 b); 2 etapas ligadas nos dois usuários; ativar o Zero Trust Free (**pede cartão, sem cobrança**); anotar o subdomínio `workers.dev` dela (vira a constante `SUB_PREVIAS`, C3/B9) |
| P4 | idem | conta das prévias: Workers Builds ligado ao repositório; branch de produção `main`; Deploy command `npx wrangler deploy --env previa`; Preview Builds ligado; Preview command `npx wrangler preview --env previa`; Build command `node cloudflare/montar-publico.mjs` |
| P5 | idem | conta das prévias: segredos de teste (§ 6, coluna Prévias) em **dois lugares**: no Worker `beyon-zero-site-previa` (vale para o staging da `main`) **e** nos segredos-base das Previews (Settings → Previews; copiados para cada prévia nova na criação). Access no Worker com **All traffic** + service token (§ 5.4) |
| P6 | idem | **Supabase staging** (`beyon-zero-staging`, São Paulo, grátis): `npx supabase@2 db push` (34 migrations); esquemas expostos `app` e `metricas` (nunca `privado`); cadastro aberto **desligado**; login anônimo **ligado**; Authentication › Rate Limits › **IP Address Forwarding ligado** (A10). **Se a opção não aparecer no plano grátis:** o dono escolhe entre (1) atrasar o corte pelo plano B do R7 (~2–3 dias) ou (2) ir ao ar com o balde compartilhado e o agente monitorar os 429 do Auth no log (R7). Não é uma 4ª decisão de arquitetura: é a contingência do A4 |
| P7 | idem | **Mercado Pago, modo teste**: credenciais de teste nos segredos; webhook de teste em `https://beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev/api/pagamentos` |
| P8 | staging no ar | ensaios com o agente (Task M2): uma prévia de branch abre com `BZ_AMBIENTE=previa` (log de uma chamada; sem isso tudo fecha como produção, ALTO-2 da 2ª revisão); critério de CPU do § 3.3; A4 com o limite do anônimo em 3/h; **a regra de 10 pedidos / 10 s em `/api/*` (o staging no `workers.dev` não tem regra de zona: contar no Workers Logs os pedidos do IP do dono em cada janela de 10 s; nenhuma janela pode passar de 10) não trava o painel do dono (abrir, trocar de fila, entregar) nem uma rodada inteira do `scripts/direcoes.mjs`**: zero 429; se houver, tarefa C3b (§ 7.1); formato real da URL de prévia (para o C3); Access/Bypass; cota do Workers Logs; `_headers` desanexando CSP; **Decisão do dono 2** com a tabela da M2 |
| P9 | idem | conta de produção: Workers Builds ligado ao repositório; branch de produção **`producao`**; **Enable Preview Builds desligado**; Build command `node cloudflare/montar-publico.mjs`; Deploy command `npx wrangler deploy`. Criar a branch `producao` a partir da `main` no GitHub (nasce sem domínio e sem segredos: tudo fecha) |
| P10 | antes do PR C ir ao ar | **Supabase produção** (`beyon-zero`): igual ao P6, mais `docs/fundacao/02-OPERACAO.md` § 4.3 **itens 1–3 e 5** (o item 4, "desligar o login anônimo", está **superado** pela Fase 2: login anônimo LIGADO, cadastro aberto desligado); § 4.4 conferido; tabela de preços `ativa` (`docs/fase2/02-OPERACAO.md` § 1.2, `npm run validar:regras`); Site URL `https://beyonzero.com.br`, Redirect URLs só `https://beyonzero.com.br/**`; só um dos dois (`pg_cron` de retenção ou `/api/rotinas`) |
| P11 | idem | **Mercado Pago produção**: URL do site `https://beyonzero.com.br`; webhook `https://beyonzero.com.br/api/pagamentos` (sem `www`), evento Order; assinatura em `MP_WEBHOOK_SEGREDO` |
| P12 | idem | **Turnstile produção**: hostname `beyonzero.com.br` (cobre o `www`) |
| P13 | idem | os 15 segredos de produção no Worker de produção |
| P14 | idem | zona (§ 7.1) |
| P15 | promoção | Merge do PR "Promover para produção" |
| P16 | +1 dia | nada (o agente confere as rotinas no log) |
| P17 | **só depois do corte conferido (P15–P16) e de a captação avisar que trocou os links para `beyonzero.com.br`** (Decisão 3, 21/10) | **apagar logo** o projeto `beyon0-site` da Vercel (sem redirecionamento de 90 dias), o acesso do app da Vercel ao GitHub e `vercel logout`. Antes, o agente confere que nenhum link antigo sobrou na captação (`captacao/config/oferta.json`, mensagens, rodapé dos sites de demonstração publicados) |

Antes do 1º pagamento real: a lista de `docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md` § 11 (R$ 1 pago e estornado,
aviso real aceito, `MP_USER_ID` conferido, reconciliação no log). O Supabase grátis pausa projeto parado: a rotina
diária toca o banco todo dia; o prazo atual da pausa é conferido na doc do Supabase no P10 (não confirmado aqui).

### 7.1 Zona `beyonzero.com.br` (já na Cloudflare, grátis; o DNS já foi trocado)

| Ajuste | Valor | Por quê |
|---|---|---|
| Conferir | zona "Active"; registros MX nulo, SPF `-all`, DMARC `p=reject` mantidos (sem e-mail no domínio por agora, 21/10) | decisão do dono 3; "Agora não" ao e-mail |
| `www` | DNS `AAAA www 100::` **com proxy** + Redirect Rule `www.beyonzero.com.br/*` → `https://beyonzero.com.br/${1}`, 301, mantendo a query | o Worker não vê o `www` |
| SSL/TLS | Full (strict); Always Use HTTPS | padrão certo |
| HSTS | ligar **no fim** (depois da 1ª semana), 6 meses, sem preload | ligar cedo prende erro de certificado |
| Rocket Loader, Email Obfuscation (vem ligado em zona nova), Web Analytics automático, Zaraz | **desligados** | injetam script inline; a CSP quebra a página |
| Bot Fight Mode | **desligado** | no Free não abre exceção e pode barrar o webhook do MP |
| Pseudo IPv4 | desligado | IPv6 real no `cf-connecting-ip` |
| Cache | nenhuma regra "Cache Everything" | HTML e `/api` nunca em cache |
| Regra de limite (Free: 1 regra, só caminho, por IP, janela de 10 s) | **todo** `/api/*` (o operador de "começa com"/curinga que o editor do Free oferecer; nome fora da tabela também gasta cota) → **10 pedidos / 10 s** → Block 10 s. Conta: 10 a cada 10 s = 86.400/dia por IP, **abaixo** dos 100.000 (para esgotar a cota são precisos ao menos 2 IPs; com 20/10 s, um IP sozinho gastava 172.800). O P8 confere contra os pedidos por visita medidos na M2 (o orçamento faz 1 pedido a cada 60 s; uma página, poucos `/api/evento`) e só sobe o valor se uma visita normal passar de 10 em 10 s, nunca acima de 11. **O painel e o `scripts/direcoes.mjs` do dono também passam por ela** (o painel abre ~5 consultas de uma vez: resumo e as filas de `js/painel*.js`; o script chama `/api/painel` em sequência, `scripts/direcoes.mjs:461`). **Sem exceção para `/api/painel`**: o `/api/painel` aceita pedido de qualquer IP (a chave é conferida no Worker, e o 401 também gasta cota), então tirá-lo da regra reabriria a cota para um IP só. Se o P8 mostrar 429 no painel ou no script, quem se ajusta é o cliente: o script espera ≥ 1,1 s entre chamadas e o painel faz as consultas da abertura uma depois da outra (tarefa C3b) | `/api/pagamentos` dentro: o aviso do MP vem de poucos IPs e em baixo volume no lançamento; se levar 429, o MP reenvia. **Limite escrito: no grátis nenhuma regra protege a cota**; dois IPs a esgotam e tudo em `/api/*` responde 429 até 21 h (Decisão 2) |
| `workers.dev` da produção | **desligado** (`workers_dev: false`, C2) | passaria por fora desta regra |

---

## 8. Tarefas

Verificação comum a todo PR (além do teste de cada tarefa): `npm run testar`, `npm run testar:mutacao`, servidor
local + `npm run e2e:orcamento` (com e sem consultor: `BZ_SEM_CONSULTOR=1`), `npm run verificar` e
`npm run acessibilidade` quando tocar página. Todo arquivo de teste novo entra no script `testar` do `package.json`
(a lista é explícita). Comandos abaixo a partir da raiz do site.

### PR A — ambiente, Pix, orçamentos de subpedidos e IP no Auth (ainda publicado pela Vercel; nada muda para o visitante)

#### Task A0: a ordem das fases no `03-STATUS.md`

**Files:** Modify: `docs/fundacao/03-STATUS.md:68-69`

- [ ] **Step 1:** trocar os itens "1. **Infisical:** a próxima…" e "2. **Cloudflare:** só quando o site estiver 100%
  pronto…" por: "1. **Cloudflare antes de ir ao ar**
  (decisão do dono 21/10, `01 Empresa/Decisões.md`): plano grátis medido, só Pix, domínio `beyonzero.com.br`; plano
  em `docs/superpowers/plans/2026-10-21-migracao-cloudflare.md`. 2. **Infisical:** opção futura." (e a linha 3,
  "Infisical e Cloudflare não foram iniciados", ganha "(Cloudflare: em andamento desde 21/10)").
- [ ] **Step 2:** `git add docs/fundacao/03-STATUS.md && git commit -m "docs: ordem das fases com a Cloudflare antes de ir ao ar"`

#### Task A1: `ambienteDe` pelo runtime, fechado por padrão

**Files:**
- Create: `api/_ambiente.mjs`, `docs/testes/ambiente.test.mjs`
- Modify: `package.json` (script `testar`: acrescentar `docs/testes/ambiente.test.mjs`)

**Interfaces:**
- Produces: `naCloudflare(env?) → boolean`; `ambienteDe(env?) → 'producao' | 'previa' | 'local'`;
  `foraDoLocal(env?) → boolean`. Usados por A2, A7, A10, B1.

- [ ] **Step 1: teste vermelho** — `docs/testes/ambiente.test.mjs`:

```js
/* AMBIENTE — em que ambiente o código roda (api/_ambiente.mjs). Fechado por padrão: na Cloudflare, o que não for
   "previa" declarado é produção. A Cloudflare é reconhecida pelo RUNTIME (navigator.userAgent), então até quem lê
   process.env vê "Cloudflare" (revisão do plano, A2). npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambienteDe, naCloudflare, foraDoLocal } from '../../api/_ambiente.mjs';

/* simula o workerd: navigator.userAgent === 'Cloudflare-Workers' (doc Web standards, flag global_navigator) */
export function comoCloudflare(fn) {
  const antes = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true, writable: true });
  try { return fn(); } finally { if (antes) Object.defineProperty(globalThis, 'navigator', antes); else delete globalThis.navigator; }
}

test('Cloudflare pelo runtime: sem nada declarado é produção', () => {
  comoCloudflare(() => {
    assert.equal(naCloudflare({}), true);
    assert.equal(ambienteDe({}), 'producao');
    assert.equal(ambienteDe(undefined), 'producao', 'sem env nenhum: produção');
    assert.equal(ambienteDe({ BZ_AMBIENTE: 'previa' }), 'previa');
    assert.equal(ambienteDe({ BZ_AMBIENTE: ' previa ' }), 'previa', 'espaço colado no painel');
  });
});
test('Cloudflare: erro de digitação, "local" e BZ_LOCAL nunca abrem', () => {
  comoCloudflare(() => {
    for (const env of [{ BZ_AMBIENTE: 'prod' }, { BZ_AMBIENTE: 'local' }, { BZ_AMBIENTE: 'Previa' }, { BZ_LOCAL: '1' }, { BZ_LOCAL: '1', BZ_AMBIENTE: 'Previa' }]) {
      assert.equal(ambienteDe(env), 'producao', JSON.stringify(env));
    }
    assert.equal(foraDoLocal({ BZ_LOCAL: '1' }), true);
  });
});
test('simulação nos testes em Node: BZ_PLATAFORMA=cloudflare vale como o runtime', () => {
  assert.equal(ambienteDe({ BZ_PLATAFORMA: 'cloudflare' }), 'producao');
  assert.equal(ambienteDe({ BZ_PLATAFORMA: 'cloudflare', BZ_AMBIENTE: 'previa' }), 'previa');
  assert.equal(ambienteDe({ BZ_PLATAFORMA: 'cloudflare', BZ_LOCAL: '1' }), 'producao');
  assert.equal(ambienteDe({ VERCEL: '1', BZ_PLATAFORMA: 'cloudflare', BZ_AMBIENTE: 'previa' }), 'producao', 'na Vercel a simulação não vale');
});
test('Vercel até o PR D: production (ou sem VERCEL_ENV) é produção; preview/development é prévia', () => {
  assert.equal(ambienteDe({ VERCEL: '1' }), 'producao');
  assert.equal(ambienteDe({ VERCEL: '1', VERCEL_ENV: 'production' }), 'producao');
  assert.equal(ambienteDe({ VERCEL_ENV: 'preview' }), 'previa');
  assert.equal(ambienteDe({ VERCEL: '1', VERCEL_ENV: 'development' }), 'previa');
});
test('nada disso: local (servidor local e testes)', () => {
  assert.equal(ambienteDe({}), 'local');
  assert.equal(ambienteDe({ BZ_LOCAL: '1' }), 'local');
  assert.equal(ambienteDe(undefined), 'local');
  assert.equal(foraDoLocal({}), false);
});
```

- [ ] **Step 2:** `node --test docs/testes/ambiente.test.mjs` → FAIL ("Cannot find module …/api/_ambiente.mjs").
- [ ] **Step 3: implementação** — `api/_ambiente.mjs`:

```js
/* ==========================================================================
   EM QUE AMBIENTE O CÓDIGO RODA: 'producao' | 'previa' | 'local' (plano da migração para a Cloudflare, 2026-10-21).
   • Cloudflare: reconhecida pelo RUNTIME (navigator.userAgent === 'Cloudflare-Workers', fixo no workerd), não por
     configuração: não dá para esquecer nem forjar por variável, e vale também para quem lê process.env.
     BZ_AMBIENTE === 'previa' (exato) = prévia; QUALQUER outra coisa = produção (fechado por padrão).
     BZ_PLATAFORMA=cloudflare só simula a Cloudflare nos testes em Node.
   • Vercel (só até o PR D): VERCEL_ENV preview/development = prévia; o resto = produção.
   • Nada disso: local (servidor local e testes).
   ========================================================================== */
const USER_AGENT_CLOUDFLARE = 'Cloudflare-Workers';

const objeto = env => (env && typeof env === 'object' ? env : {});
const naVercel = e => !!(e.VERCEL || e.VERCEL_ENV);
/* (a simulação por BZ_PLATAFORMA nunca vale na Vercel: lá ela viraria "previa" numa produção) */
export const naCloudflare = env => {
  const e = objeto(env);
  return globalThis.navigator?.userAgent === USER_AGENT_CLOUDFLARE || (e.BZ_PLATAFORMA === 'cloudflare' && !naVercel(e));
};

export function ambienteDe(env) {
  const e = objeto(env);
  if (naCloudflare(e)) return String(e.BZ_AMBIENTE || '').trim() === 'previa' ? 'previa' : 'producao';
  if (naVercel(e)) return ['preview', 'development'].includes(e.VERCEL_ENV) ? 'previa' : 'producao';
  return 'local';
}

export const foraDoLocal = env => ambienteDe(env) !== 'local';
```

- [ ] **Step 4:** `node --test docs/testes/ambiente.test.mjs` → PASS (5 testes).
- [ ] **Step 5:** `git add api/_ambiente.mjs docs/testes/ambiente.test.mjs package.json && git commit -m "feat: ambiente decidido pelo runtime, fechado por padrao na Cloudflare"`

#### Task A2: os 8 lugares e as 4 chamadas sem ambiente

**Files:**
- Modify: `api/_vendas/turnstile.mjs:35-36`, `api/_pagamentos/config.mjs:21-40`, `api/_vendas/pedido.mjs:47-58`,
  `api/pagamentos.mjs:99`, `api/_ia/provedor.mjs:37-38`, `api/_ia/config.mjs:27-33`, `api/_banco.mjs:101`,
  `api/vendas.mjs:71`, `:95`, `api/_vendas/fluxo.mjs:139-142`, `:294`, `api/_vendas/fluxo-pedido.mjs:10`,
  `:38`, `:50`, `:57`, `api/_vendas/agente.mjs:75`
- Test: `docs/testes/ambiente.test.mjs` (casos novos), `docs/testes/pedido.test.mjs:93-98`

**Interfaces:**
- Consumes: `ambienteDe`, `foraDoLocal` (A1).
- Produces: `criarFluxo({ …, env, direcoes })` — `env` é o objeto de ambiente do pedido; `direcoes` ausente =
  `'manual'`. `criarAcoesDoPedido({ …, env })` — sem `env`, as travas fecham. `chaveDoTelefone(e164, segredo,
  env = {})` (não lê mais `process.env`). `naVercel` deixa de existir em `pedido.mjs`.

- [ ] **Step 1: testes vermelhos** — acrescentar a `docs/testes/ambiente.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configTurnstile } from '../../api/_vendas/turnstile.mjs';
import { configPagamentos } from '../../api/_pagamentos/config.mjs';
import { criarIA } from '../../api/_ia/provedor.mjs';
import { modoDirecoes } from '../../api/_ia/config.mjs';
import { banco } from '../../api/_banco.mjs';
import { chaveDoTelefone } from '../../api/_vendas/pedido.mjs';

const CF = { BZ_PLATAFORMA: 'cloudflare' };
const MP = { MP_ACCESS_TOKEN: 'APP_USR-1234567890123456-abc-123456', MP_PUBLIC_KEY: 'APP_USR-pub-1234567890123456', MP_WEBHOOK_SEGREDO: 'segredo-muito-longo-123', MP_USER_ID: '123456' };

test('Cloudflare produção: Turnstile obrigatório e sem chave de teste', () => {
  assert.equal(configTurnstile({ ...CF }).exigido, true, 'sem chaves: fecha');
  assert.equal(configTurnstile({ ...CF, TURNSTILE_SITE_KEY: '1x00000000000000000000AA', TURNSTILE_SECRET: '1x0000000000000000000000000000000AA' }).siteKey, null, 'chave de teste na produção: fecha');
  assert.equal(configTurnstile({ ...CF, BZ_AMBIENTE: 'previa' }).exigido, false, 'prévia sem chaves: como a prévia da Vercel');
});
test('Cloudflare: pagamento produção só com MP_AMBIENTE=producao; prévia só teste; simulador nunca', () => {
  const salvo = globalThis.__BZ_LOCAL; globalThis.__BZ_LOCAL = { mp: { token: 't', segredo: 's', userId: '1', fetch: null, cronSecret: null } };
  try {
    assert.equal(configPagamentos({ ...CF, ...MP }).ambiente === 'simulado', false, 'simulador fora do local: nunca');
    assert.equal(configPagamentos({ ...CF, ...MP, MP_AMBIENTE: 'producao' }).ativo, true);
    assert.equal(configPagamentos({ ...CF, ...MP, MP_AMBIENTE: 'teste' }).ativo, false);
    assert.equal(configPagamentos({ ...CF, ...MP, BZ_AMBIENTE: 'previa', MP_AMBIENTE: 'producao' }).ativo, false);
    assert.equal(configPagamentos({ ...CF, ...MP, BZ_AMBIENTE: 'previa', MP_AMBIENTE: 'teste' }).ativo, true);
  } finally { globalThis.__BZ_LOCAL = salvo; }
});
test('Cloudflare: IA simulada nunca em produção; direções sem chave = manual; banco em memória nunca', async () => {
  assert.equal(await criarIA({ ...CF, BZ_IA: 'simulada', BZ_LOCAL: '1' }), null);
  assert.equal(modoDirecoes({ ...CF, BZ_LOCAL: '1' }), 'manual');
  assert.equal(banco({ ...CF, BZ_LOCAL: '1' }).ligado, false);
  assert.equal(chaveDoTelefone('+5521999990000', undefined, { ...CF, BZ_LOCAL: '1' }), null);
});
test('o runtime da Cloudflare vale até para quem lê process.env (o objeto vazio)', () => {
  comoCloudflare(() => {
    assert.equal(modoDirecoes({ BZ_LOCAL: '1' }), 'manual');
    assert.equal(banco({ BZ_LOCAL: '1' }).ligado, false);
  });
});

/* nenhuma função de ambiente é chamada SEM o ambiente em api/ (a chamada sem argumento cairia em process.env) */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DE_AMBIENTE = ['ambienteDe', 'foraDoLocal', 'naCloudflare', 'modoDirecoes', 'banco', 'criarIA', 'configPagamentos', 'criarVisitantes',
  'criarTransporte', 'configUsuario', 'configTurnstile', 'criarAnthropic', 'origemPermitida'];
const arquivosDe = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? arquivosDe(path.join(dir, d.name)) : d.name.endsWith('.mjs') ? [path.join(dir, d.name)] : []);
test('nenhuma chamada sem ambiente em api/ (revisão do plano, A2)', () => {
  const achados = [];
  for (const arq of arquivosDe(path.join(RAIZ, 'api'))) {
    const texto = fs.readFileSync(arq, 'utf8');
    for (const nome of DE_AMBIENTE) if (new RegExp('(?<![\\w.])' + nome + '\\(\\s*\\)').test(texto)) achados.push(path.relative(RAIZ, arq) + ': ' + nome + '()');
    if (/chaveDoTelefone\([^(),]+,[^(),]+\)/.test(texto)) achados.push(path.relative(RAIZ, arq) + ': chaveDoTelefone com 2 argumentos');
    if (/\bnaVercel\(\s*\)/.test(texto)) achados.push(path.relative(RAIZ, arq) + ': naVercel()');
  }
  assert.deepEqual(achados, []);
});
```

  E em `docs/testes/pedido.test.mjs:96-98`, as expectativas continuam (a Vercel ainda existe); acrescentar
  `assert.equal(chaveDoTelefone('+5521999990000', undefined), null, 'sem env: fecha (não lê process.env)');`.
- [ ] **Step 2:** `node --test docs/testes/ambiente.test.mjs docs/testes/pedido.test.mjs` → FAIL: Turnstile
  `exigido:false` na Cloudflare, pagamento "fora da Vercel", banco em memória ligado, e o teste estático lista
  `fluxo-pedido.mjs: naVercel()`, `chaveDoTelefone com 2 argumentos`, `fluxo.mjs: modoDirecoes()`,
  `agente.mjs: modoDirecoes()`.
- [ ] **Step 3: implementação** (cada arquivo importa `ambienteDe` de `'../_ambiente.mjs'` ou `'./_ambiente.mjs'`):
  - `api/_vendas/turnstile.mjs:35-36` → `const producao = ambienteDe(env) === 'producao';` (apagar a linha do `naVercel`).
  - `api/_pagamentos/config.mjs`: apagar `NA_VERCEL` (`:21`); `:24` → `const amb = ambienteDe(env); const local = globalThis.__BZ_LOCAL && amb === 'local';`;
    `:34-40` →
    ```js
    if (amb !== 'local') {
      const prod = amb === 'producao';
      if (prod && ambiente !== 'producao') return desligado('produção exige MP_AMBIENTE=producao');
      if (!prod && ambiente !== 'teste') return desligado('prévia exige MP_AMBIENTE=teste');
    } else if (ambiente === 'producao') {
      return desligado('credencial de produção fora da produção');
    }
    ```
    (se um teste existente conferir o texto antigo do `motivo`, atualizar o texto esperado, nunca a regra).
  - `api/_vendas/pedido.mjs:48-58` → apagar `naVercel`; `chaveDoTelefone(e164, segredo, env = {})` com
    `const local = env.BZ_LOCAL === '1' && ambienteDe(env) === 'local';`.
  - `api/pagamentos.mjs:99` → `… || !local.mp || ambienteDe(env) !== 'local') return json({ erro: 'Não encontrado.' }, 404);`
  - `api/_ia/provedor.mjs:37-38` → `if (ambienteDe(env) === 'producao') return null;`
  - `api/_ia/config.mjs:30-32` → `const simulada = env.BZ_LOCAL === '1' || env.BZ_IA === 'simulada'; return simulada && ambienteDe(env) !== 'producao' ? 'api' : 'manual';`
  - `api/_banco.mjs:101` → `if (env.BZ_LOCAL === '1' && ambienteDe(env) === 'local') return local;`
  - `api/vendas.mjs:71` → `const semConsultorLocal = env.BZ_LOCAL === '1' && env.BZ_SEM_CONSULTOR === '1' && ambienteDe(env) === 'local';`
  - `api/vendas.mjs:95` → `return responder(await criarFluxo({ ...d, env: d.env || env, direcoes: d.direcoes || modoDirecoes(env), requestId })[acao]({ request, query, corpo }));`
    (e `import { modoDirecoes } from './_ia/config.mjs';`).
  - `api/_vendas/fluxo.mjs:139` → acrescentar `env` à desestruturação; `:142` → `const modo = direcoes === 'manual' || direcoes === 'api' ? direcoes : 'manual';`
    (fechado: sem o modo, nada chama a API); `:294` → `criarAcoesDoPedido({ banco, visitante, segredoFreio, env, limites: limitesPedido, requestId })`;
    tirar o import de `modoDirecoes` se ficar sem uso.
  - `api/_vendas/fluxo-pedido.mjs:10` → importar `chaveDoTelefone` sem `naVercel`, e `ambienteDe` de `'../_ambiente.mjs'`;
    `:38` → `export function criarAcoesDoPedido({ banco, visitante, segredoFreio, env, limites = PEDIDOS, requestId })` e,
    logo abaixo, `const local = !!env && ambienteDe(env) === 'local';   /* sem o ambiente: fecha */`;
    `:50` → `chaveDoTelefone(d.telefone, segredoFreio, env || {})`; `:57` → `if (!chaveIp && !local) indisponivel('detalhes sem a chave do IP');`
  - `api/_vendas/agente.mjs:75` → `montarSistema(regras, { direcoes: direcoes || 'manual' })` e tirar o import de `modoDirecoes` se ficar sem uso.
- [ ] **Step 4:** `npm run testar`. Teste antigo que quebrar **só** porque agora a trava fecha sem ambiente passa a
  declarar o local (`env: { BZ_LOCAL: '1' }` nos deps, ou `direcoes: 'api'` no `criarFluxo`, como o PR1 do
  orçamento já fez). Nunca afrouxar a regra para o teste passar. Esperado: tudo PASS.
- [ ] **Step 5:** `git commit -am "feat: os 8 lugares perguntam o ambiente; chamada sem ambiente fecha"`

#### Task A3: `.env.example` completo

**Files:** Modify: `.env.example`; Test: `docs/testes/ambiente.test.mjs`

- [ ] **Step 1: teste vermelho** — acrescentar:

```js
const SO_LOCAIS = new Set(['BZ_LOCAL', 'BZ_IA', 'BZ_IA_REAL', 'BZ_SEM_CONSULTOR', 'BZ_JEV', 'BZ_PLATAFORMA', 'VERCEL', 'VERCEL_ENV']);
test('todo env.X lido em api/ está no .env.example ou na lista de chaves só locais', () => {
  const exemplo = fs.readFileSync(path.join(RAIZ, '.env.example'), 'utf8');
  const declarados = new Set([...exemplo.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1]));
  const lidos = new Set(arquivosDe(path.join(RAIZ, 'api')).flatMap(a => [...fs.readFileSync(a, 'utf8').matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)].map(m => m[1])));
  const faltam = [...lidos].filter(n => !declarados.has(n) && !SO_LOCAIS.has(n)).sort();
  assert.deepEqual(faltam, []);
});
```

- [ ] **Step 2:** `node --test docs/testes/ambiente.test.mjs` → FAIL com `['BZ_DIRECOES', 'TURNSTILE_SECRET', 'TURNSTILE_SITE_KEY']`
  (mais `MP_METODOS` depois da A7, `BZ_AMBIENTE` agora).
- [ ] **Step 3:** acrescentar ao `.env.example`, comentados como os outros: `BZ_AMBIENTE=` ("só na Cloudflare:
  `previa` nas prévias; qualquer outra coisa = produção"), `BZ_DIRECOES=manual`, `TURNSTILE_SITE_KEY=`,
  `TURNSTILE_SECRET=`, `MP_METODOS=pix`. **Atenção:** o guarda pode negar mexer em `.env.example` (o padrão
  `.env` casa); se negar, o texto exato vai ao dono no PR para ele colar.
- [ ] **Step 4:** PASS. **Step 5:** `git commit -am "chore: .env.example com as chaves que o codigo le"`

#### Task A4: `Buffer` explícito no cron

**Files:** Modify: `api/_cron.mjs:13`

- [ ] **Step 1:** acrescentar `import { Buffer } from 'node:buffer';` (refatoração sem mudança de comportamento; o
  `Buffer` global existe com `nodejs_compat`, mas o import explícito não depende disso).
- [ ] **Step 2:** `node --test docs/testes/pagamentos.test.mjs docs/testes/api.test.mjs` → PASS. **Step 3:** commit.

#### Task A5: limites dos handlers exportados (para o B1 conferir)

**Files:** Modify: `api/vendas.mjs:31`, `api/pagamentos.mjs:24`, `api/leads.mjs:20`, `api/painel.mjs:41`
(`api/_valida.mjs:7` já exporta `LIMITE_BYTES` do evento)

- [ ] **Step 1:** `export const LIMITE_BYTES = …` nos três primeiros; em `painel.mjs`, `export const CORPO_MAX = 200000;`.
  Os valores **não mudam** (16384, 65536, 8192, 200000; evento 4096). Nenhum teste novo aqui: o B1 os usa.
  Também para a bancada (M1, 2ª revisão MÉDIO-5): `export const ACOES` em `api/vendas.mjs:23` (só o `export`) e, em
  `api/painel.mjs`, `export const ACOES_PAINEL = Object.freeze({ GET: ['resumo', 'csv-ads', 'fila-direcoes',
  'fila-pendentes', 'fila-lembretes', 'fila-ajustes'], POST: ['entregar_direcao', 'avisado', 'link_retomada',
  'lembrado', 'ajuste_feito', 'ajuste_recusado', 'resolver_alerta', ...Object.keys(ACOES_PEDIDO)] })` — a lista do
  que `ler`/`mudar` despacham hoje (`api/painel.mjs:94-127`; conferir as chaves que vierem depois da `:127` e
  acrescentá-las). O teste da M1 confere a lista contra o código.
- [ ] **Step 2:** `npm run testar` → PASS. **Step 3:** commit.

#### Task A6: mutação do ambiente

**Files:** Modify: `docs/testes/mutacao.mjs` (lista `SABOTAGENS`, entradas com `fonte`)

- [ ] **Step 1:** acrescentar:

```js
  /* ---- o ambiente (migração para a Cloudflare, A1/A2): a Cloudflare nunca pode parecer "local" ---- */
  { nome: 'Cloudflare vista como local (runtime ignorado)', fonte: 'api/_ambiente.mjs', testes: ['docs/testes/ambiente.test.mjs'],
    de: "globalThis.navigator?.userAgent === USER_AGENT_CLOUDFLARE || ", para: '' },
  { nome: 'detalhes sem ambiente abrem a trava do IP', fonte: 'api/_vendas/fluxo-pedido.mjs', testes: ['docs/testes/detalhes-api.test.mjs'],
    de: "const local = !!env && ambienteDe(env) === 'local';", para: "const local = !env || ambienteDe(env) === 'local';" },
  { nome: 'prévia declarada com erro de digitação vira prévia', fonte: 'api/_ambiente.mjs', testes: ['docs/testes/ambiente.test.mjs'],
    de: "String(e.BZ_AMBIENTE || '').trim() === 'previa'", para: "/previa/i.test(String(e.BZ_AMBIENTE || ''))" },
```

  e em `docs/testes/detalhes-api.test.mjs`, o caso que a 2ª sabotagem exige: `criarAcoesDoPedido` **sem** `env`,
  pedido sem cabeçalho de IP, segredo presente → `detalhes` lança `Recusa` 503 e o `banco` falso **não** é chamado.
- [ ] **Step 2:** `npm run testar:mutacao` → cada sabotagem nova derruba o teste indicado ("pegou").
- [ ] **Step 3:** commit.

#### Task A7: só Pix fora do local (decisão do dono 2)

**Files:**
- Modify: `api/_pagamentos/config.mjs` (`configPagamentos`, `configPublica`), `api/_pagamentos/servico.mjs:158-160`,
  `orcamento.html:381`, `:427`, `js/orcamento-pagamento.js` (`configurar`, `escolherMetodo`, `:310`),
  `docs/e2e-orcamento.mjs` (encolhe), `docs/testes/mutacao.mjs`, `api/_vendas/consultor.mjs:90`, `:250`,
  `api/_vendas/promessa.mjs:27`, `api/_pagamentos/estados.mjs:59`, `docs/testes/consultor.test.mjs`,
  `privacidade.html:37` (só se citar cartão)
- Create: `docs/e2e-pix.mjs`, `docs/testes/so-pix-textos.test.mjs`
- Test: `docs/testes/pagamentos.test.mjs`

**Interfaces:**
- Produces: `cfg.metodos: string[]` (`['pix']` ou `['pix','cartao']`); `configPublica(cfg).metodos`; `MP_METODOS`
  (texto, `"pix"` ou `"pix,cartao"`).

- [ ] **Step 1: testes vermelhos** — em `docs/testes/pagamentos.test.mjs`:

```js
test('só Pix fora do local: MP_METODOS ausente ou inválido = só Pix; o cartão é recusado antes do banco', async () => {
  const base = { MP_ACCESS_TOKEN: 'APP_USR-1234567890123456-abc-123456', MP_PUBLIC_KEY: 'APP_USR-pub-1234567890123456', MP_WEBHOOK_SEGREDO: 'segredo-muito-longo-123', MP_USER_ID: '123456' };
  const salvo = globalThis.__BZ_LOCAL; globalThis.__BZ_LOCAL = undefined;
  try {
    const cf = { ...base, BZ_PLATAFORMA: 'cloudflare', MP_AMBIENTE: 'producao' };
    assert.deepEqual(configPagamentos(cf).metodos, ['pix'], 'ausente: só Pix');
    assert.deepEqual(configPagamentos({ ...cf, MP_METODOS: 'pix,boleto' }).metodos, ['pix'], 'inválido: só Pix');
    assert.deepEqual(configPagamentos({ ...cf, MP_METODOS: 'pix,cartao' }).metodos, ['pix', 'cartao']);
    assert.deepEqual(configPublica(configPagamentos(cf)).metodos, ['pix'], 'o navegador fica sabendo');
    /* cartão e pagador VÁLIDOS (revisão do plano do 3b-1, ALTO-1): com `cartao: {}` ou `pagador: {}` o iniciar de hoje
       já recusa em validarCartao/validarPagador antes do banco, e o teste passaria sem a guarda (a sabotagem sobreviveria) */
    const CARTAO = { token: 'local-APRO-abc12345', meio: 'visa', tipo: 'credit_card', parcelas: 1 };
    let chamadas = 0;
    const banco = async () => { chamadas++; return {}; };
    const servico = criarServicoPagamentos({ banco, cfg: configPagamentos(cf), provedor: { nome: 'mercadopago' } });
    await assert.rejects(servico.iniciar({ conversa_id: 'c', visitante_id: 'v', metodo: 'cartao', pagador: PAGADOR, cartao: CARTAO }),
      e => e.status === 400 && /não está disponível/.test(e.message));
    assert.equal(chamadas, 0, 'nenhuma chamada ao banco');
    /* controle: com o cartão ligado, o MESMO pedido chega ao banco (prova que a recusa acima é da guarda nova) */
    const comCartao = criarServicoPagamentos({ banco, cfg: configPagamentos({ ...cf, MP_METODOS: 'pix,cartao' }), provedor: { nome: 'mercadopago' } });
    await comCartao.iniciar({ conversa_id: 'c', visitante_id: 'v', metodo: 'cartao', pagador: PAGADOR, cartao: CARTAO }).catch(() => {});
    assert.ok(chamadas >= 1, 'com cartão ligado, o pedido chega ao banco');
  } finally { globalThis.__BZ_LOCAL = salvo; }
});
test('local (simulado) continua com cartão: o E2E não perde a regressão; MP_METODOS=pix vale também no local', () => {
  assert.ok(configPagamentos({}).metodos.includes('cartao'));
  assert.deepEqual(configPagamentos({ MP_METODOS: 'pix' }).metodos, ['pix']);
});
```

  (importar `configPublica` e `criarServicoPagamentos` se ainda não estiverem; `PAGADOR` já existe em
  `docs/testes/pagamentos.test.mjs:23`; o 2º teste roda com o `globalThis.__BZ_LOCAL` que o `before` do arquivo já
  monta.)
- [ ] **Step 2:** `node --test docs/testes/pagamentos.test.mjs` → FAIL (`metodos` undefined; e o `assert.rejects`
  com a mensagem "não está disponível" falha porque hoje o cartão válido passa da validação e chega ao banco).
- [ ] **Step 3: implementação** — em `api/_pagamentos/config.mjs`:

```js
const METODOS = ['pix', 'cartao'];
/* só Pix no lançamento (decisão do dono, 21/10): fora do local, MP_METODOS ausente ou com qualquer valor fora da
   lista = só Pix (fechado por padrão). Local (simulado) = os dois, para o E2E */
export function metodosDe(env, amb) {
  const lista = String(env.MP_METODOS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const valida = lista.length > 0 && lista.includes('pix') && lista.every(m => METODOS.includes(m));
  if (valida) return METODOS.filter(m => lista.includes(m));
  return amb === 'local' ? [...METODOS] : ['pix'];
}
```

  `configPagamentos`: no retorno simulado, `metodos: metodosDe(env, 'local')` (lista válida vale, ausente = os dois:
  assim o caso "só Pix" do E2E local funciona com `MP_METODOS=pix`); no retorno ativo, `metodos: metodosDe(env, amb)`.
  A chave é **`MP_METODOS`** e só ela (o PR 3b já a adotou, `site-pr3b/docs/specs/…pr3b-vender-sozinho.md`
  l.245-249; nenhuma outra chave de cartão é criada). **A A7 é a fonte do "só Pix"** (ver "Dono único" no fim
  desta tarefa).
  `configPublica`: `return { ativo: true, ambiente: cfg.ambiente, publicKey: cfg.publicKey, parcelasMax: 12, metodos: cfg.metodos || ['pix'] };`
  Em `servico.iniciar`, logo depois da 1ª linha (`:159`):
  `if (!(cfg.metodos || ['pix']).includes(metodo)) throw new ErroPagamento(400, 'Esta forma de pagamento não está disponível.');`
(Steps 4 e 5 e o "Dono único" abaixo: texto da revisão do plano do 3b-1, `.superpowers/sdd/pr3b1-plano-revisao.md`
ponto 1, adotado como está.)

- [ ] **Step 4: a tela** — `orcamento.html:381`: o grupo vira `<div class="pag-metodos" id="o-pag-metodos" role="radiogroup" aria-label="Forma de pagamento" hidden>`
  (nasce escondido: só Pix por padrão, e configuração que não carrega não mostra cartão); `:427` (`#o-pix-trocar`) ganha
  `hidden`. Em `js/orcamento-pagamento.js`, `configurar()` faz `mostrar('o-pag-metodos', comCartao); mostrar('o-pix-trocar', comCartao);`
  (o grupo de rádio de uma opção só some inteiro: spec do 3b §4) e `escolherMetodo(m)` começa com
  `if (m === 'cartao' && $('o-pag-metodos').hidden) m = 'pix';`. O `[hidden]` de `css/tokens.css:145` já tem `!important`.
- [ ] **Step 5: E2E em arquivo próprio** — o trecho do pagamento sai de `docs/e2e-orcamento.mjs` (`:717-744`) para
  `docs/e2e-pix.mjs`, que lê `pagamentoConfig().metodos` e roda o caminho com cartão (servidor padrão) ou o "só Pix"
  (`MP_METODOS=pix`): sem `#o-pag-metodos`, sem "Prefiro pagar com cartão", e `BZOrcamento.pagar('cartao', …)` com
  cartão VÁLIDO → 400. O texto vem do **Anexo A** do plano do 3b-1
  (`site-pr3b/docs/superpowers/plans/2026-10-21-pr3b1-so-pix.md`, commit `6f359fb`), **copiado aqui** porque o PR A
  mescla antes e não pode depender de um plano de outra branch. O cartão do "só Pix" é VÁLIDO (`local-APRO-…`), para o
  400 vir da guarda do `MP_METODOS` e não da validação do cartão. Crie `docs/e2e-pix.mjs`:

```js
/* O PIX no E2E do orçamento (A7 do PR A da Cloudflare; o PR 3b-1 acrescenta a ele). Fica fora de docs/e2e-orcamento.mjs, que já passou do teto de 800 linhas
   (pendência PR2b2-M3): o trecho do pagamento saiu de lá para cá. Recebe a página na tela da entrada (#o-pagamento
   visível), no celular (390 px), e a deixa com a entrada paga (#o-pronto visível).
   O servidor diz se o cartão vale (MP_METODOS, decisão do dono de 21/10): com os dois (o padrão do servidor local), o
   cartão é recusado e depois vem o Pix, como antes; só com o Pix (servidor local subido com MP_METODOS=pix), a tela
   não tem seletor nem cartão, e o servidor recusa o cartão com 400. */
const PAGADOR = { nome: 'Ana', sobrenome: 'Souza', email: 'ana@exemplo.com', documento: '529.982.247-25' };

async function cartaoRecusado(page, ok) {
  ok(await page.locator('#o-pag-metodos').isVisible(), 'cartão ligado (servidor local padrão): o seletor aparece');
  await page.click('[data-metodo="cartao"]');
  ok(await page.locator('#o-pag-local').isVisible(), 'modo local: nomes de teste no lugar dos campos do Mercado Pago');
  await page.fill('#o-titular', 'FUND');
  await page.click('#o-pag-enviar');
  await page.waitForFunction(() => /limite/.test(document.getElementById('o-pag-status').textContent), null, { timeout: 15000 });
  ok(true, 'cartão recusado: motivo em português, nada liberado');
  ok(await page.locator('#o-pronto').isHidden(), 'recusa não libera');
  await page.click('[data-metodo="pix"]');
}

async function cartaoDesligado(page, ok) {
  ok(await page.locator('#o-pag-metodos').isHidden(), 'só Pix: sem o seletor de forma de pagamento');
  const status = await page.evaluate(p => window.BZOrcamento.pagar('cartao', p, { token: 'local-APRO-abc12345', meio: 'visa', tipo: 'credit_card', parcelas: 1 })
    .then(() => 0, e => e.status), PAGADOR);
  ok(status === 400, 'só Pix: o servidor recusa o cartão antes do banco (status ' + status + ')');
}

export async function passoDoPix(page, { ok, espera, foto, semRolagemLateral }) {
  const cfg = await page.evaluate(() => window.BZOrcamento.pagamentoConfig());
  const comCartao = Array.isArray(cfg.metodos) && cfg.metodos.includes('cartao');
  console.log('[e2e-pix] formas de pagamento do servidor: ' + JSON.stringify(cfg.metodos));
  await page.click('#o-pag-enviar');
  ok((await page.textContent('#o-pag-erro')).includes('nome'), 'pagador sem dados: recusado com motivo');
  await page.fill('#o-pag-nome', PAGADOR.nome); await page.fill('#o-pag-sobrenome', PAGADOR.sobrenome);
  await page.fill('#o-pag-email', PAGADOR.email); await page.fill('#o-pag-doc', PAGADOR.documento);
  if (comCartao) await cartaoRecusado(page, ok); else await cartaoDesligado(page, ok);
  await page.click('#o-pag-enviar');
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 15000 });
  if (!comCartao) ok(await page.locator('#o-pix-trocar').isHidden(), 'só Pix: sem "Prefiro pagar com cartão"');
  ok((await page.inputValue('#o-pix-codigo')).startsWith('000201'), 'Pix copia e cola');
  ok(await page.locator('#o-pix-qr').isVisible(), 'QR do Pix');
  ok(await semRolagemLateral(page), 'celular no Pix: sem rolagem lateral');
  await page.locator('#o-pix').scrollIntoViewIfNeeded();
  await foto(page, comCartao ? '4-pix-cel' : '4-pix-so-pix-cel');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#o-pix:not([hidden])', { timeout: 15000 });
  ok(true, 'recarregar: o mesmo Pix volta (nenhuma cobrança nova)');
  ok(await page.locator('#o-pronto').isHidden(), 'voltar para a página não confirma nada sozinho');
  await page.click('#o-pix-simular');
  await page.waitForSelector('#o-pronto:not([hidden])', { timeout: 20000 });
  ok(true, 'Pix confirmado pelo aviso assinado + consulta: projeto liberado');
}
```

  (`espera` ainda não é usado aqui; o 3b-1 o usa nas tarefas dele.)

  Em `docs/e2e-orcamento.mjs`: acrescente `import { passoDoPix } from './e2e-pix.mjs';` junto do import de
  `./e2e-ajustes.mjs`; e troque o trecho que começa em
  `/* pagamento: dados do pagador, cartão recusado, depois Pix (QR) e a confirmação SÓ pelo aviso do provedor */` e
  termina em `ok(true, 'Pix confirmado pelo aviso assinado + consulta: projeto liberado');` (hoje `:718-744`) por:

  ```js
    /* pagamento: dados do pagador, o cartão (quando o servidor o liga) e o Pix; a confirmação SÓ pelo aviso do provedor (docs/e2e-pix.mjs) */
    await passoDoPix(page, { ok, espera, foto, semRolagemLateral });
  ```

  Confira com `wc -l docs/e2e-orcamento.mjs`: o arquivo encolhe (era 905).
- Sabotagem nova em `docs/testes/mutacao.mjs`: `{ nome: 'cartão aceito com só Pix (o servidor)', fonte: 'api/_pagamentos/servico.mjs', testes: ['docs/testes/pagamentos.test.mjs'], de: "if (!(cfg.metodos || ['pix']).includes(metodo)) throw", para: "if (false) throw" }`.
- **Dono único:** a A7 é só deste PR A. O PR 3b-1 não a implementa: consome `configPublica(cfg).metodos`,
  `#o-pag-metodos` e `docs/e2e-pix.mjs` (spec do 3b, §4: `site-pr3b/docs/specs/2026-10-21-pr3b-vender-sozinho.md` l.257-261).

  **A A7 é a fonte do "só Pix" e o PR 3b-1 depende dela:** o 3b-1 só confere se a A7 está na `main` (Task 1 do plano
  dele) e para se não estiver; não cria `metodosDe` nem mexe em `config.mjs` ou em `servico.iniciar`. Por isso o PR A
  deve mesclar antes do 3b-1.
- [ ] **Step 5b: o servidor não oferece cartão quando ele está desligado** (mesma revisão, MÉDIO-3; com a A7 no PR A,
  fica aqui). As frases de hoje que falam em pagar com cartão a quem só tem Pix:
  - `api/_vendas/consultor.mjs:90` ("pagamento do sinal no próprio site, por Pix ou cartão") e `:250` ("cobra o sinal
    por Pix ou cartão"): o texto sai de `cfg.metodos` (a lista chega ao consultor pelo fluxo, como o resto da
    configuração de pagamento): com `['pix']`, "por Pix"; com os dois, "por Pix ou cartão";
  - `api/_vendas/promessa.mjs:27` (`RESPOSTAS_PAGAMENTO.meio`, resposta fixa do consultor: "por Pix ou cartão"): vira
    texto neutro, sem citar a forma: `'O pagamento é só pelo bloco aqui na tela. Se ele não funcionar, a Beyon Zero envia o pagamento pelo WhatsApp.'`;
  - `api/_pagamentos/servico.mjs:159` (`'Escolha Pix ou cartão.'`, método fora da lista): vira
    `'Escolha a forma de pagamento que aparece na tela.'`.
  Ficam de fora, **com o motivo no teste**: as recusas específicas de cartão de `api/_pagamentos/estados.mjs:46-55` e
  as validações de `servico.mjs:58-60` e `:69` (só acontecem num pagamento com cartão, que a guarda da A7 recusa antes)
  e `servico.mjs:142` (só ao trocar do Pix para o cartão, idem). A recusa genérica de `estados.mjs:59` ("use outro
  cartão ou o Pix") vale para qualquer método: vira `'O pagamento não foi aprovado. Tente de novo; se não der, fale com a Beyon Zero pelo WhatsApp.'`.

  **Teste vermelho** (`docs/testes/so-pix-textos.test.mjs`, novo, no script `testar`):

```js
/* SÓ PIX: nenhum texto do servidor oferece cartão a quem só tem Pix (A7, Step 5b). npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESPOSTAS_PAGAMENTO } from '../../api/_vendas/promessa.mjs';
import { mensagemRecusa } from '../../api/_pagamentos/estados.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OFERTA = /Pix ou (o )?cart[aã]o|cart[aã]o ou (o )?Pix|tente o cart[aã]o|outro cart[aã]o/i;
/* só no caminho do cartão (a guarda da A7 recusa o cartão antes de chegar aqui) */
const SO_NO_CAMINHO_DO_CARTAO = [
  { arquivo: 'api/_pagamentos/estados.mjs', trecho: 'rejected_by_issuer' },
  { arquivo: 'api/_pagamentos/estados.mjs', trecho: 'card_disabled' },
  { arquivo: 'api/_pagamentos/estados.mjs', trecho: 'max_attempts_exceeded' },
  { arquivo: 'api/_pagamentos/servico.mjs', trecho: 'Não consegui cancelar o Pix gerado antes' }
];
const arquivosDe = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? arquivosDe(path.join(d, e.name)) : e.name.endsWith('.mjs') ? [path.join(d, e.name)] : []);

test('nenhuma frase do servidor oferece cartão fora do caminho do cartão', () => {
  const achados = [];
  for (const arq of arquivosDe(path.join(RAIZ, 'api'))) {
    const rel = path.relative(RAIZ, arq).split(path.sep).join('/');
    fs.readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(linha) || !OFERTA.test(linha)) return;
      if (SO_NO_CAMINHO_DO_CARTAO.some(p => p.arquivo === rel && linha.includes(p.trecho))) return;
      if (rel === 'api/_vendas/consultor.mjs' && /metodos/.test(linha)) return;   /* (o texto que depende da lista) */
      achados.push(rel + ':' + (i + 1));
    });
  }
  assert.deepEqual(achados, []);
});
test('respostas fixas e mensagens genéricas sem cartão', async () => {
  assert.doesNotMatch(RESPOSTAS_PAGAMENTO.meio, /cart[aã]o/i);
  assert.doesNotMatch(mensagemRecusa('qualquer_coisa'), /cart[aã]o/i);
  const s = criarServicoPagamentos({ banco: async () => ({}), cfg: { ativo: true, metodos: ['pix'] }, provedor: { nome: 'mercadopago' } });
  await assert.rejects(s.iniciar({ conversa_id: 'c', visitante_id: 'v', metodo: 'boleto' }), e => e.status === 400 && !/cart[aã]o/i.test(e.message));
});
```

  E em `docs/testes/consultor.test.mjs`: com `metodos: ['pix']`, o prompt montado (base e etapa
  `aguardando_pagamento`) não casa com `OFERTA`; com `['pix', 'cartao']`, casa. Vermelho hoje em
  `consultor.mjs:90`, `:250`, `promessa.mjs:27`, `servico.mjs:159` e `estados.mjs:59`. Teste antigo que conferir o
  texto velho dessas frases passa a conferir o novo (a regra não muda).
- [ ] **Step 6:** `npm run testar`; servidor local + `npm run e2e:orcamento` (com e sem consultor) → PASS;
  `npm run verificar` e `npm run acessibilidade` → PASS; olhar o `-cel` da tela de pagamento. Texto:
  `condicoes.html:60` já fala só de Pix; `privacidade.html:37` não cita cartão (conferido em 21/10).
- [ ] **Step 7:** commit `feat: so Pix fora do local (MP_METODOS), cartao recusado antes do banco`.

#### Task A8: orçamento de subpedidos na reconciliação

**Files:** Modify: `api/_pagamentos/servico.mjs:228-259`, `api/pagamentos.mjs` (onde chama `reconciliar`);
Test: `docs/testes/pagamentos.test.mjs`

**Interfaces:**
- Produces: `reconciliar({ limite = 15, varrerDias = 3, varrerPaginas = 1, orcamento = 45 })` → resumo com
  `parcial: boolean` e `subpedidos: number`.

- [ ] **Step 1: teste vermelho**:

```js
test('reconciliação nunca passa de 45 subpedidos; o resto fica para o próximo cron, com aviso no log', async () => {
  let pedidos = 0;
  const conta = fn => async (...a) => { pedidos++; return fn(...a); };
  const pendentes = Array.from({ length: 50 }, (_, i) => ({ tentativa_id: 't' + i, provedor_order_id: 'ORD' + String(i).padStart(4, '0'), status: 'pendente', criado_em: new Date(0).toISOString() }));
  const orders = Array.from({ length: 50 }, (_, i) => ({ id: 'REC' + String(i).padStart(4, '0') }));
  const banco = conta(async nome => nome === 'pagamentos_para_reconciliar' ? pendentes : nome === 'pagamentos_atencao' ? { total: 0 } : {});
  const provedor = { nome: 'mercadopago', consultarOrdem: conta(async id => ({ id, status: 'processed', transactions: { payments: [] } })), buscarRecentes: conta(async () => orders) };
  const cfg = { ativo: true, contaEsperada: '123456', metodos: ['pix'] };
  const r = await criarServicoPagamentos({ banco, cfg, provedor }).reconciliar({ limite: 50, varrerPaginas: 3 });
  assert.ok(pedidos <= 45, 'subpedidos: ' + pedidos);
  assert.equal(r.parcial, true);
});
```

- [ ] **Step 2:** FAIL (≈ 1 + 100 + 3 + 100 + 2 chamadas).
- [ ] **Step 3:** como implementar (2ª revisão, BAIXO-7): `atualizar` e `aplicar` usam o `banco`/`mp` do
  **fechamento** de `criarServicoPagamentos`, então um embrulho só dentro do `reconciliar` não conta essas chamadas.
  Extrair as funções internas para `criarNucleo({ banco, mp, cfg, agora })` (devolve `aplicar`, `atualizar`,
  `ocorrencia`, `erroDoProvedor`); o serviço usa um núcleo com o `banco`/`mp` normais; o `reconciliar` cria **a cada
  execução** um núcleo com versões contadas:

```js
class SemOrcamento extends Error {}
/* contador POR EXECUÇÃO (nunca no módulo: o isolado atende pedidos ao mesmo tempo) */
function orcamentoDe(limite) {
  let gastos = 0;
  const contar = fn => async (...a) => { if (gastos >= limite) throw new SemOrcamento(); gastos++; return fn(...a); };
  return { contar, gastos: () => gastos };
}
```

  `banco` contado = `contar(banco)`; `mp` contado = `{ ...mp, consultarOrdem: contar(mp.consultarOrdem), buscarRecentes:
  contar(mp.buscarRecentes) }`. Reservar 2 para o fim (`pagamentos_atencao` e a ocorrência, com o `banco` sem contar).
  O `umPorVez` **relança** `SemOrcamento` (não conta como erro) e o laço para; `resumo.parcial = true`; log
  `{ origem: 'pagamentos', nivel: 'aviso', evento: 'reconciliação parcial', subpedidos }`. A lista vem das mais antigas
  (conferir a ordem na migration de `pagamentos_para_reconciliar` e anotar no comentário). Padrões novos:
  `limite = 15`, `varrerPaginas = 1`, `orcamento = 45` (15 a cada 3 h = 120/dia).
- [ ] **Step 4: a rotina diária com o mesmo orçamento** (2ª revisão, MÉDIO-5: o PR 3b soma chamadas ao Storage
  nela). Teste vermelho em `docs/testes/api.test.mjs`: `executar` com `deps.banco` e `deps.metricas` falsos que contam,
  e um `fetch` falso (ntfy) que conta, com 60 etapas simuladas → nunca passa de 45 e o resumo diz `parcial: true`.
  Implementação: `api/rotinas.mjs:40-…` usa o mesmo `orcamentoDe(45)` (mover para `api/_orcamento.mjs`, exportado, e
  importar nos dois); etapa que ficou sem orçamento vira **alerta** (como as falhas de hoje), nunca silêncio.
- [ ] **Step 5:** PASS + `npm run testar`. **Step 6:** commit `fix: reconciliacao e rotina diaria com orcamento de subpedidos por execucao`.

#### Task A9: painel GET dentro do orçamento de CPU (não só de subpedidos)

**Files:** Modify: `api/_banco.mjs:16-17`, `:43-52`, `api/painel.mjs:100-101`; Test: `docs/testes/metricas.test.mjs`

Decisão do autor (2ª revisão, MÉDIO-6): o teto é pela **CPU**, não pelos 50 subpedidos. 20 páginas × 1.000 linhas ×
2 tabelas = 40 mil linhas de `JSON.parse` + `resumir` num pedido, o que passa de 10 ms com folga. O teto começa em
**2 páginas por tabela** (2.000 linhas, 4 mil no total: o tráfego do lançamento cabe com sobra) e só sobe se a M1
medir que um número maior passa no critério de triagem do § 3.3. O resumo agregado no banco (uma RPC por período,
migration nova) fica como trabalho próprio **se** o dono precisar ver períodos longos com muito tráfego; a rota é só
do dono e não bloqueia o lançamento.

- [ ] **Step 1: teste vermelho** — `listar` com `fetch` falso que devolve sempre 1.000 linhas: no máximo
  `MAX_PAGINAS_POR_TABELA` (exportado, `2`) chamadas por tabela e o resultado diz `cortado: true`; o `ler` do painel com
  duas tabelas cheias faz ≤ 5 subpedidos e devolve `aviso: 'período grande demais; mostrando os mais recentes'`.
- [ ] **Step 2:** FAIL. **Step 3:** `listar(tabela, campoData, desde, { maxPaginas = MAX_PAGINAS_POR_TABELA } = {})`
  devolve `Object.assign(linhas.reverse(), { cortado })`; o painel passa o `aviso` quando alguma veio cortada e a
  tela mostra o aviso (texto simples, sem mudar o layout).
- [ ] **Step 4:** PASS. A M1 mede o `GET /api/painel` com 2, 5 e 10 páginas por tabela e o número que passa vira o
  valor da constante (PR próprio, com a tabela da M1 citada). **Step 5:** commit.

#### Task A10: o IP real do visitante chega ao Supabase Auth (`Sb-Forwarded-For`)

**Files:** Modify: `api/_vendas/visitante.mjs:35-55`, `api/vendas.mjs:75`; Test: `docs/testes/api.test.mjs`

**Interfaces:**
- Produces: `criarVisitantes(env, { ip } = {})`. Com `env.SUPABASE_CHAVE_SECRETA` e `ip` válido, `criar()` e
  `renovar()` chamam o Auth com `apikey` = chave secreta e `sb-forwarded-for` = `ip`; sem um dos dois, como hoje
  (chave publicável, sem o cabeçalho).

- [ ] **Step 1: teste vermelho**:

```js
test('Auth: criar e renovar levam o IP do visitante (Sb-Forwarded-For) com a chave secreta', async () => {
  const vistos = [];
  const salvo = globalThis.fetch;
  globalThis.fetch = async (url, op) => { vistos.push({ url: String(url), h: op.headers }); return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u' } }), { status: 200 }); };
  try {
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_CHAVE_PUBLICA: 'sb_publishable_x', SUPABASE_CHAVE_SECRETA: 'sb_secret_y' };
    const v = criarVisitantes(env, { ip: '203.0.113.7' });
    await v.criar(); await v.renovar('abc');
    for (const c of vistos) { assert.equal(c.h['sb-forwarded-for'], '203.0.113.7'); assert.equal(c.h.apikey, 'sb_secret_y'); }
    vistos.length = 0;
    await criarVisitantes(env, {}).criar();
    assert.equal(vistos[0].h['sb-forwarded-for'], undefined, 'sem IP: sem o cabeçalho, chave publicável');
    assert.equal(vistos[0].h.apikey, 'sb_publishable_x');
  } finally { globalThis.fetch = salvo; }
});
```

- [ ] **Step 2:** FAIL. **Step 3:** em `criarVisitantes` (importar `normalizarIp` de `'./ip.mjs'`):
  `const ipAuth = cfg && env.SUPABASE_CHAVE_SECRETA ? normalizarIp(String(ip || '')) : null;`
  `const cab = ipAuth ? { apikey: env.SUPABASE_CHAVE_SECRETA, 'sb-forwarded-for': ipAuth, 'content-type': 'application/json' } : { apikey: cfg.publica, 'content-type': 'application/json' };`
  **IPv6 vai pelo prefixo /64** (`api/_vendas/ip.mjs:34-43`: `2001:db8:a:b::1` → `2001:db8:a:b::`): a casa inteira
  conta como um visitante, como nos freios do site. É intencional; o log do Auth mostra o prefixo, não o IP do
  celular. Caso a mais no teste: `ip: '2001:db8:a:b::1'` → `sb-forwarded-for: '2001:db8:a:b::'`; `ip: 'lixo'` → sem
  cabeçalho, chave publicável.
  (o `quem()` continua com a chave publicável: o `/user` com o token do visitante). Em `api/vendas.mjs:75`:
  `visitantes: criarVisitantes(env, { ip: ipDe(request) })` (o `ip` já foi calculado na `:52`; reaproveitar a variável).
  Comentário no topo do `visitante.mjs`: por que a chave secreta vai ao Auth (a doc do Supabase só aceita o
  `Sb-Forwarded-For` com chave secreta; o IP vem do `rotear`, validado, montado do zero e nunca copiado de cabeçalho
  do cliente; o /64 do IPv6 é intencional; sem a opção ligada no projeto, o Supabase ignora o cabeçalho e o
  comportamento é o de hoje; o servidor local confia no `x-forwarded-for`, então **nunca** apontar o servidor local
  para o Supabase staging com a chave secreta).
- [ ] **Step 4:** PASS + `npm run testar`. **Revisão de segurança obrigatória** (chave secreta numa chamada nova).
- [ ] **Step 5:** commit `feat: IP do visitante no Supabase Auth (Sb-Forwarded-For)`.

**Aceitação do PR A:** suíte inteira e os dois E2E verdes **sem mudar expectativas antigas** além das listadas;
mutação "pegou" em todas; na Vercel nada muda para o visitante (o PR A não é promovido na Vercel: decisão do dono).

### Task M1 — bancada de CPU e subpedidos no Node (PR próprio, nível 2, depois do PR A e antes do B)

**Files:** Create: `docs/cpu-rotas.mjs`, `docs/testes/fixtures/cpu/` (respostas gravadas); Modify: `package.json`
(script `cpu:rotas`)

**Interfaces:** Produces: `node docs/cpu-rotas.mjs [--json]` → tabela por rota: `frio_ms`, `p50_ms`, `p99_ms`,
`subpedidos`, `cabe` (limiar do § 3.3); sai com código 1 se alguma rota não cabe (não bloqueia o CI: é evidência).

- [ ] **Step 1: as respostas gravadas** (dados falsos, do tamanho real; nunca dado de cliente):
  `supabase-conversa.json` (conversa com 14 mensagens de 2.000 caracteres), `supabase-paginas-1000.json` (1.000
  linhas de `metricas.paginas` com os campos da migration `20261006120100_metricas.sql`), `mp-order-pix.json`
  (order de Pix como a do simulador `docs/mp-simulado.mjs`), `turnstile-ok.json`, `auth-signup.json`.
- [ ] **Step 2: o medidor** — cada rota roda em **processo novo** (`child_process.fork` do próprio arquivo com
  `--rota <nome>`) para a 1ª chamada ser fria de verdade (regex ainda não compiladas), e depois 50 vezes quente:

```js
/* (trecho central) mede só CPU do processo, com fetch falso que devolve as respostas gravadas e conta subpedidos */
const usado = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
async function medir(chamar, vezes) {
  const tempos = [];
  for (let i = 0; i < vezes; i++) { const a = usado(); await chamar(); tempos.push(usado() - a); }
  return tempos.sort((x, y) => x - y);
}
let subpedidos = 0;
globalThis.fetch = async (url, op) => { subpedidos++; return respostaGravada(String(url), op); };
```

  No Windows, `process.cpuUsage` tem degraus de ~15,6 ms: o medidor repete a chamada em lote (`vezes` chamadas por
  leitura) e divide, e roda também no Linux do CI (job manual) para a tabela final.
  **Os casos vêm do código, não de uma lista à mão** (2ª revisão, MÉDIO-5): o medidor importa `ACOES` de
  `api/vendas.mjs` e `ACOES_PAINEL` de `api/painel.mjs` (A5) e tem um objeto `CASOS` com uma entrada por ação; se
  alguma ação não tiver caso, **sai com erro** listando-a (assim as ações novas do PR 3b em `/api/vendas` e no painel,
  `site-pr3b/docs/specs/2026-10-21-pr3b-vender-sozinho.md` §9, entram obrigatoriamente). Um teste em
  `docs/testes/worker.test.mjs` importa os dois e confere que `ACOES_PAINEL` cobre toda chave `typeof bruto.<x> ===
  'string'` e todo `q.get('fila') === '<x>'` do `api/painel.mjs` (varredura do texto do arquivo). Além das ações:
  `pagamentos` (webhook assinado, reconciliar com 15 pendentes), `rotinas` (diária, com as etapas do 3b se já
  mescladas), `painel` GET com 2, 5 e 10 páginas por tabela (A9), `entregar_direcao` com a direção típica do § 3.1 e
  com a máxima de `varredura-casos.test.mjs`, `ajuste_feito`, `evento`, `leads`. Entradas: a pior que os validadores
  aceitam **e** uma típica.
- [ ] **Step 3:** `node docs/cpu-rotas.mjs` → tabela. Esperado (pelo § 3.1): `entregar_direcao` e `ajuste_feito`
  **não cabem**; o resto, a conferir.
- [ ] **Step 4:** a tabela vai para `docs/evidencias/2026-10-cpu-rotas.md` no PR, com a máquina e o Node.
- [ ] **Step 5:** commit `test: bancada de CPU e subpedidos por rota`.

### PR B — o Worker (staging na conta das prévias; a Vercel continua como está)

#### Task B1: a tabela de rotas (`rotear`)

**Files:** Create: `cloudflare/rotas.mjs`, `cloudflare/worker.mjs`, `docs/testes/worker.test.mjs`; Modify:
`package.json` (`testar`)

**Interfaces:**
- Consumes: `vendas.atender`, `pagamentos.receber`, `rotinas.executar`, `evento.receber`, `leads.listar/criar`,
  `painel.ler/mudar`, os `LIMITE_BYTES`/`CORPO_MAX` (A5), `naCloudflare` (A1), `normalizarIp` (`api/_vendas/ip.mjs:34`).
- Produces: `criarRoteador(rotas) → rotear(request, env) → Promise<Response>`; `ROTAS` (exportada para os testes);
  `rotear` (a tabela real).

- [ ] **Step 1: testes vermelhos** — `docs/testes/worker.test.mjs`:

```js
/* O WORKER — a tabela de rotas (cloudflare/rotas.mjs), em Node puro. npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarRoteador, ROTAS } from '../../cloudflare/rotas.mjs';
import * as vendas from '../../api/vendas.mjs';
import * as pagamentos from '../../api/pagamentos.mjs';
import * as leads from '../../api/leads.mjs';
import * as painel from '../../api/painel.mjs';
import { LIMITE_BYTES as LIMITE_EVENTO } from '../../api/_valida.mjs';

const CF = { BZ_PLATAFORMA: 'cloudflare' };
const eco = { limite: 1024, GET: async (r, e) => Response.json({ ok: true, xff: r.headers.get('x-forwarded-for'), vercel: r.headers.get('x-vercel-forwarded-for'), env: e.MARCA || null }),
  POST: async r => Response.json({ tamanho: (await r.text()).length }) };
const rotear = criarRoteador({ eco, quebra: { limite: 10, GET: async () => { throw new Error('segredo-no-erro'); } } });
const pedido = (caminho, op = {}) => new Request('https://beyonzero.com.br' + caminho, op);

test('rota e método certos chamam a função com o env recebido', async () => {
  const r = await rotear(pedido('/api/eco'), { MARCA: 'x' });
  assert.equal(r.status, 200); assert.equal((await r.json()).env, 'x');
});
test('nome fora da tabela, com _, maiúscula ou subcaminho: 404 JSON no-store', async () => {
  for (const c of ['/api/_freio', '/api/Eco', '/api/eco/x', '/api/nada', '/api/constructor', '/api/__proto__']) {
    const r = await rotear(pedido(c), {});
    assert.equal(r.status, 404, c); assert.match(r.headers.get('content-type'), /json/); assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});
test('método fora da tabela: 405', async () => { assert.equal((await rotear(pedido('/api/eco', { method: 'PUT', body: 'x' }), {})).status, 405); });
test('Cloudflare sem cf-connecting-ip válido: 403 e o handler não roda', async () => {
  let rodou = false;
  const r2 = criarRoteador({ eco: { limite: 10, GET: async () => { rodou = true; return new Response('x'); } } });
  for (const ip of [null, '', 'lixo', '999.1.1.1']) {
    const h = ip == null ? {} : { 'cf-connecting-ip': ip };
    assert.equal((await r2(pedido('/api/eco', { headers: h }), CF)).status, 403, String(ip));
  }
  assert.equal(rodou, false);
});
test('Cloudflare: o x-forwarded-for forjado some; vale o cf-connecting-ip', async () => {
  const r = await rotear(pedido('/api/eco', { headers: { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '5.6.7.8' } }), CF);
  const j = await r.json();
  assert.equal(j.xff, '203.0.113.7'); assert.equal(j.vercel, null);
});
test('corpo acima do limite da rota: 413 (Content-Length e leitura limitada); abaixo chega inteiro ao handler', async () => {
  assert.equal((await rotear(pedido('/api/eco', { method: 'POST', body: 'x'.repeat(1025) }), {})).status, 413);
  const sem = new Request('https://x/api/eco', { method: 'POST', body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2000)); c.close(); } }), duplex: 'half' });
  assert.equal((await rotear(sem, {})).status, 413, 'sem Content-Length');
  const ok = await rotear(pedido('/api/eco', { method: 'POST', body: 'y'.repeat(1000) }), {});
  assert.equal((await ok.json()).tamanho, 1000);
});
test('handler que lança: 500 genérico com x-request-id, sem a mensagem', async () => {
  const r = await rotear(pedido('/api/quebra'), {});
  assert.equal(r.status, 500); assert.ok(r.headers.get('x-request-id'));
  assert.doesNotMatch(await r.text(), /segredo-no-erro/);
});
test('toda resposta da API: noindex, nosniff, no-store se faltar', async () => {
  const r = await rotear(pedido('/api/eco'), {});
  assert.equal(r.headers.get('x-robots-tag'), 'noindex'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('limite do Worker ≥ 3 × o do handler, em toda rota (revisão M1)', () => {
  const minimo = { vendas: vendas.LIMITE_BYTES, pagamentos: pagamentos.LIMITE_BYTES, evento: LIMITE_EVENTO, leads: leads.LIMITE_BYTES, painel: painel.CORPO_MAX, rotinas: 0 };
  for (const [nome, rota] of Object.entries(ROTAS)) assert.ok(rota.limite >= 3 * minimo[nome], nome);
});
test('todo api/<nome>.mjs sem _ tem rota (endpoint novo esquecido falha)', () => {
  const nomes = fs.readdirSync(new URL('../../api/', import.meta.url)).filter(n => /^[a-z]+\.mjs$/.test(n)).map(n => n.slice(0, -4)).sort();
  assert.deepEqual(Object.keys(ROTAS).sort(), nomes);
});
```

- [ ] **Step 2:** `node --test docs/testes/worker.test.mjs` → FAIL (módulo não existe).
- [ ] **Step 3: implementação** — `cloudflare/rotas.mjs`:

```js
/* ==========================================================================
   A TABELA DE ROTAS DO WORKER: /api/<nome> → a função que já existe em api/<nome>.mjs.
   Na frente de todo handler: nome só da tabela (404), método da tabela (405), na Cloudflare o IP vem SÓ do
   cf-connecting-ip validado e os cabeçalhos de IP do cliente são apagados (403 sem ele), corpo limitado POR ROTA
   (3 × o limite do handler: 1 unidade de texto do JS ≤ 3 bytes em UTF-8), erro interno genérico, cabeçalhos da API.
   O servidor local (docs/servidor.mjs) passa por aqui também.
   ========================================================================== */
import { randomUUID } from 'node:crypto';
import * as vendas from '../api/vendas.mjs';
import * as pagamentos from '../api/pagamentos.mjs';
import * as rotinas from '../api/rotinas.mjs';
import * as evento from '../api/evento.mjs';
import * as leads from '../api/leads.mjs';
import * as painel from '../api/painel.mjs';
import { LIMITE_BYTES as LIMITE_EVENTO } from '../api/_valida.mjs';
import { naCloudflare } from '../api/_ambiente.mjs';
import { normalizarIp } from '../api/_vendas/ip.mjs';

const BYTES_POR_UNIDADE = 3;
const LIMITE_ROTINAS = 4096;
export const ROTAS = Object.freeze({
  vendas:     { limite: BYTES_POR_UNIDADE * vendas.LIMITE_BYTES, GET: (r, e) => vendas.atender(r, e, 'GET'), POST: (r, e) => vendas.atender(r, e, 'POST') },
  pagamentos: { limite: BYTES_POR_UNIDADE * pagamentos.LIMITE_BYTES, GET: pagamentos.receber, POST: pagamentos.receber },
  rotinas:    { limite: LIMITE_ROTINAS, GET: rotinas.executar, POST: rotinas.executar },
  evento:     { limite: BYTES_POR_UNIDADE * LIMITE_EVENTO, POST: evento.receber },
  leads:      { limite: BYTES_POR_UNIDADE * leads.LIMITE_BYTES, GET: leads.listar, POST: leads.criar },
  painel:     { limite: BYTES_POR_UNIDADE * painel.CORPO_MAX, GET: painel.ler, POST: painel.mudar }
});
const METODOS = ['GET', 'POST'];
const CABECALHOS_API = { 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };

const json = (dados, status, extra = {}) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CABECALHOS_API, ...extra } });
const log = dados => console.error(JSON.stringify({ origem: 'worker', nivel: 'erro', ...dados }));

async function lerLimitado(request, limite) {
  if (!request.body) return new Uint8Array(0);
  const leitor = request.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) { await leitor.cancel(); return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  partes.reduce((pos, p) => { tudo.set(p, pos); return pos + p.byteLength; }, 0);
  return tudo;
}

/* na Cloudflare: só o cf-connecting-ip (a borda sobrescreve o que o cliente mandar); o x-forwarded-for do cliente
   (a Cloudflare ACRESCENTA a ele, o 1º item é do atacante) e o x-vercel-* somem */
function cabecalhosDeIp(request, env) {
  const h = new Headers(request.headers);
  if (!naCloudflare(env)) return h;
  const ip = (h.get('cf-connecting-ip') || '').trim();
  h.delete('x-vercel-forwarded-for');
  h.delete('x-forwarded-for');
  if (!ip || !normalizarIp(ip)) return null;
  h.set('x-forwarded-for', ip);
  return h;
}

const comCabecalhosDaApi = resposta => {
  const h = new Headers(resposta.headers);
  for (const [k, v] of Object.entries(CABECALHOS_API)) h.set(k, v);
  if (!h.has('cache-control')) h.set('cache-control', 'no-store');
  return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: h });
};

export function criarRoteador(rotas = ROTAS) {
  return async function rotear(request, env) {
    const url = new URL(request.url);
    const m = /^\/api\/([a-z]+)\/?$/.exec(url.pathname);
    const rota = m && Object.hasOwn(rotas, m[1]) ? rotas[m[1]] : null;
    if (!rota) return json({ erro: 'Não encontrado.' }, 404);
    const fn = METODOS.includes(request.method) && Object.hasOwn(rota, request.method) ? rota[request.method] : null;
    if (!fn) return json({ erro: 'Método não permitido.' }, 405, { allow: METODOS.filter(x => Object.hasOwn(rota, x)).join(', ') });
    const headers = cabecalhosDeIp(request, env);
    if (!headers) return json({ erro: 'Proibido.' }, 403);
    let corpo;
    if (request.method === 'POST') {
      if (Number(request.headers.get('content-length') || 0) > rota.limite) return json({ erro: 'Corpo grande demais.' }, 413);
      corpo = await lerLimitado(request, rota.limite);
      if (corpo === null) return json({ erro: 'Corpo grande demais.' }, 413);
    }
    /* um Request NOVO: o corpo já foi lido; o handler lê o dele normalmente */
    const novo = new Request(url, { method: request.method, headers, body: corpo && corpo.byteLength ? corpo : undefined });
    try {
      return comCabecalhosDaApi(await fn(novo, env));
    } catch (e) {
      const id = randomUUID();
      log({ request_id: id, rota: m[1], erro: e && e.name ? e.name : 'erro' });   /* (sem mensagem: pode ter dado pessoal) */
      return json({ erro: 'Erro interno.', pedido: id }, 500, { 'x-request-id': id });
    }
  };
}

export const rotear = criarRoteador();
```

  `cloudflare/worker.mjs`:

```js
/* a entrada do Worker: só encaminha (a lógica mora nas tabelas, testadas em Node) */
import { rotear } from './rotas.mjs';
import { agendar } from './agenda.mjs';

export default {
  fetch(request, env) { return rotear(request, env); },
  scheduled(controller, env, ctx) { ctx.waitUntil(agendar(controller.cron, env)); }
};
```

- [ ] **Step 4:** `node --test docs/testes/worker.test.mjs` → PASS (o teste do `agenda` vem no B2; até lá, criar
  `cloudflare/agenda.mjs` com `export async function agendar() {}` para o import resolver).
- [ ] **Step 5:** commit `feat: tabela de rotas do Worker com IP da borda e limite por rota`.

#### Task B2: a agenda (crons)

**Files:** Create: `cloudflare/agenda.mjs`; Test: `docs/testes/worker.test.mjs`

**Interfaces:** Produces: `AGENDA` (exportada) e `agendar(cron, env, rotas = { pagamentos, rotinas })`.

- [ ] **Step 1: teste vermelho**:

```js
import { agendar, AGENDA } from '../../cloudflare/agenda.mjs';
import { parse as lerJsonc } from '../../cloudflare/jsonc.mjs';
test('crons: reconciliar de 3 em 3 h e a diária, com o CRON_SECRET, pelas MESMAS funções', async () => {
  const vistos = [];
  const falsa = nome => async (req, env) => { vistos.push({ nome, url: req.url, auth: req.headers.get('authorization'), env }); return new Response('{}'); };
  const env = { CRON_SECRET: 'c'.repeat(40) };
  await agendar('23 */3 * * *', env, { pagamentos: falsa('pagamentos'), rotinas: falsa('rotinas') });
  await agendar('41 6 * * *', env, { pagamentos: falsa('pagamentos'), rotinas: falsa('rotinas') });
  assert.deepEqual(vistos.map(v => [v.nome, new URL(v.url).search, v.auth]), [
    ['pagamentos', '?acao=reconciliar', 'Bearer ' + 'c'.repeat(40)], ['rotinas', '?acao=diaria', 'Bearer ' + 'c'.repeat(40)]]);
});
test('cron desconhecido ou segredo curto: não chama nada e loga erro', async () => {
  let chamou = false;
  const f = async () => { chamou = true; return new Response('{}'); };
  await agendar('0 0 * * *', { CRON_SECRET: 'c'.repeat(40) }, { pagamentos: f, rotinas: f });
  await agendar('41 6 * * *', { CRON_SECRET: 'curto' }, { pagamentos: f, rotinas: f });
  assert.equal(chamou, false);
});
test('os crons do wrangler.jsonc (produção e prévia) == as chaves da AGENDA', () => {
  const cfg = lerJsonc(fs.readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual([...cfg.triggers.crons].sort(), Object.keys(AGENDA).sort());
  assert.deepEqual([...cfg.env.previa.triggers.crons].sort(), Object.keys(AGENDA).sort());
});
```

- [ ] **Step 2:** FAIL. **Step 3:** `cloudflare/agenda.mjs`:

```js
/* os crons do Worker chamam as MESMAS funções que a Vercel chamava por GET, com o CRON_SECRET (api/_cron.mjs).
   O pedido é interno: não passa pelo rotear (não tem IP; o _cron.mjs só usa IP com segredo errado) */
import { receber as pagamentos } from '../api/pagamentos.mjs';
import { executar as rotinas } from '../api/rotinas.mjs';
import { segredoDoCron } from '../api/_cron.mjs';

export const AGENDA = Object.freeze({
  '23 */3 * * *': { rota: 'pagamentos', busca: '?acao=reconciliar' },
  '41 6 * * *': { rota: 'rotinas', busca: '?acao=diaria' }
});
const log = dados => console.error(JSON.stringify({ origem: 'agenda', nivel: 'erro', ...dados }));

export async function agendar(cron, env, rotas = { pagamentos, rotinas }) {
  const item = Object.hasOwn(AGENDA, cron) ? AGENDA[cron] : null;
  if (!item) return log({ evento: 'cron desconhecido', cron });
  const segredo = segredoDoCron(env);
  if (!segredo) return log({ evento: 'rotina desligada: CRON_SECRET ausente ou curto', cron });
  const pedido = new Request('https://interno.invalid/api/' + item.rota + item.busca, { headers: { authorization: 'Bearer ' + segredo } });
  const r = await rotas[item.rota](pedido, env);
  if (!r.ok) log({ evento: 'rotina respondeu erro', cron, status: r.status });
}
```

  E `cloudflare/jsonc.mjs` (leitor mínimo de JSONC: tira comentários `//` e `/* */` fora de string e vírgulas finais,
  depois `JSON.parse`; teste próprio com um comentário dentro de string que **não** pode sumir).
- [ ] **Step 4:** PASS (depois do B6, que cria o `wrangler.jsonc`; fazer B6 junto se preciso). **Step 5:** commit.

#### Task B3: assets por lista de permissão

**Files:** Create: `cloudflare/montar-publico.mjs`, `docs/testes/publico.test.mjs`; Modify: `.gitignore`
(`publico/`, `.wrangler/`, `.dev.vars*`), `docs/testes/csp.test.mjs` (os 3 testes "deploy:" passam a olhar a saída
do `montar-publico`)

**Interfaces:** Produces: `montarPublico({ raiz, destino, arquivos }) → string[]` (lista copiada);
`ehPublico(caminho) → boolean`; CLI `node cloudflare/montar-publico.mjs` (raiz = cwd, destino = `publico/`, arquivos
= `git ls-files`; sem git → erro e saída 1, nunca "copia tudo").

- [ ] **Step 1: teste vermelho** — `docs/testes/publico.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { montarPublico, ehPublico } from '../../cloudflare/montar-publico.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const versionados = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
/* o oráculo enquanto a Vercel existir (revisão M2): o que a Vercel serve hoje = versionado − .vercelignore − o que não é página */
const IGNORE = fs.readFileSync(path.join(RAIZ, '.vercelignore'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
/* o que a Vercel esconde por redirect (vercel.json → redirects, ex.: /.gitleaksignore, /.gitignore) também não é página */
const ESCONDIDOS = (JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8')).redirects || []).map(r => {
  const s = r.source.replace(/^\//, '');
  return s.includes(':') ? { prefixo: s.slice(0, s.indexOf(':')) } : { exato: s };   /* "/.github/:caminho*" → prefixo ".github/" */
});
const escondido = a => ESCONDIDOS.some(e => (e.exato !== undefined ? a === e.exato : e.prefixo && a.startsWith(e.prefixo)));
const NAO_PAGINA = [/^api\//, /^cloudflare\//, /^package(-lock)?\.json$/, /^vercel\.json$/, /^wrangler\.jsonc$/, /^\.env\.example$/, { test: escondido }];
const casa = (arq, p) => {
  const base = arq.split('/').pop();
  if (p.endsWith('/')) return arq.startsWith(p) || arq.includes('/' + p);
  if (p.includes('/')) return arq === p;
  if (p.includes('*')) return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(base);
  return base === p;
};
const esperado = versionados.filter(a => !IGNORE.some(p => casa(a, p)) && !NAO_PAGINA.some(r => r.test(a))).sort();

test('paridade com a Vercel: a saída == o que a Vercel serve hoje, nos dois sentidos', () => {
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'publico-'));
  const saida = montarPublico({ raiz: RAIZ, destino, arquivos: versionados }).sort();
  assert.deepEqual(saida.filter(a => a !== '_headers'), esperado.filter(a => a !== '_headers'));
  assert.ok(saida.includes('_headers'));
  for (const a of ['painel.css', 'privacidade.css', 'resumo.css', '404.html', 'favicon.ico']) assert.ok(saida.includes(a), a);
});
test('nunca sobe: código, docs, banco, segredo, configuração', () => {
  for (const a of ['api/vendas.mjs', 'api/_freio.mjs', 'docs/PROCESSO.md', 'supabase/migrations/x.sql', 'scripts/direcoes.mjs', 'cloudflare/rotas.mjs',
    '.github/workflows/ci.yml', '.claude/x', '.superpowers/x', 'CLAUDE.md', 'package.json', 'vercel.json', 'wrangler.jsonc', '.env', '.env.local', '.dev.vars',
    'backup.sql', 'x.dump', 'x.7z', 'js/nucleo/lab.js', 'vendor/three/entrada.js', 'vendor/three/README.md', 'assets/README.txt', 'publico/x.html', 'node_modules/x.js'])
    assert.equal(ehPublico(a), false, a);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** `cloudflare/montar-publico.mjs` — lista de permissão:

```js
/* O QUE SOBE COMO ASSET: lista de PERMISSÃO (arquivo novo não sobe sem entrar aqui; o verificador acusa o 404 na
   prévia). Fonte: git ls-files (só o versionado). Sem git: erro, nunca "copia tudo". */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PERMITIDOS = [/^[a-z0-9-]+\.html$/, /^[a-z0-9-]+\.css$/, /^css\//, /^js\//, /^vendor\//, /^assets\//, /^(robots\.txt|sitemap\.xml|favicon\.ico|_headers)$/];
const NEGADOS = [/^js\/nucleo\/lab\.js$/, /^vendor\/three\/(entrada\.js|README\.md)$/, /^assets\/README\.txt$/, /(^|\/)\.env/, /\.(sql|dump|7z|log)$/];
export const ehPublico = arq => PERMITIDOS.some(r => r.test(arq)) && !NEGADOS.some(r => r.test(arq));

export function montarPublico({ raiz, destino, arquivos }) {
  fs.rmSync(destino, { recursive: true, force: true });
  const copiados = arquivos.filter(ehPublico);
  for (const a of copiados) {
    const alvo = path.join(destino, a);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.copyFileSync(path.join(raiz, a), alvo);
  }
  return copiados;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {   /* (só quando rodado como comando) */
  const raiz = process.cwd();
  const arquivos = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' }).split('\0').filter(Boolean);
  const n = montarPublico({ raiz, destino: path.join(raiz, 'publico'), arquivos }).length;
  console.log('[montar-publico] ' + n + ' arquivos em publico/');
}
```

  (Se a raiz ganhar uma página `.html` nova, ela entra sozinha; se ganhar uma pasta nova de assets, entra na lista
  num PR nível 3.)
- [ ] **Step 4:** PASS; `node cloudflare/montar-publico.mjs` e conferir `publico/` (sem `api/`, sem `docs/`).
- [ ] **Step 5:** commit `feat: assets do Worker por lista de permissao, com paridade com a Vercel`.

#### Task B4: `_headers`

**Files:** Create: `_headers`, `cloudflare/cabecalhos.mjs`; Modify: `docs/testes/csp.test.mjs`

**Interfaces:** Produces: `lerHeaders(texto) → [{ caminho, cabecalhos: [[nome, valor]], desanexar: [nome] }]`;
`cabecalhosPara(regras, caminho) → Map` (aplica `/*`, depois as regras mais específicas, com `! Nome` desanexando,
como a doc de `_headers` descreve).

- [ ] **Step 1: testes vermelhos** em `csp.test.mjs` (lendo o `_headers` pelo `cloudflare/cabecalhos.mjs`): `<meta>`
  de CSP de cada página == a CSP que `cabecalhosPara` devolve para o caminho dela; **toda** página `.html` da saída
  do `montar-publico` tem CSP; `/orcamento` sem Google; `/painel` com `x-robots-tag: noindex` e `cache-control:
  no-store`; `/qualquer-coisa` (o 404) tem a CSP geral; nenhum caminho termina com **duas** CSPs; ≤ 100 regras e
  linha ≤ 2.000 caracteres; **paridade com o `vercel.json`** enquanto ele existir (mesmos cabeçalhos por caminho,
  para `/`, `/sites`, `/orcamento`, `/painel`, `/condicoes`, `/vendor/x.js`, `/assets/fontes/x.woff2`).
- [ ] **Step 2:** FAIL. **Step 3:** o `_headers` copia os valores do `vercel.json` (`headers`, a partir da linha 23)
  sem mudar um caractere:

```text
/*
  Content-Security-Policy: <o valor da regra "/((?!orcamento$|painel$).*)" do vercel.json>
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  <os demais da regra geral do vercel.json, um por linha>

/orcamento
  ! Content-Security-Policy
  Content-Security-Policy: <o valor da regra do /orcamento>

/painel
  ! Content-Security-Policy
  Content-Security-Policy: <o valor da regra do /painel>
  X-Robots-Tag: noindex
  Cache-Control: no-store

<as regras de cache das fontes e do vendor, iguais às do vercel.json>
```

  (Os `<…>` aqui são o texto literal do `vercel.json`; o teste de paridade garante a cópia exata.) O leitor
  `cloudflare/cabecalhos.mjs` implementa só o que a doc descreve: blocos "caminho + linhas indentadas", `*` como
  curinga, `! Nome` remove o que veio de regra anterior.
- [ ] **Step 4:** PASS. O ensaio do P8 confirma na prévia que desanexar e repor no mesmo bloco funciona (`curl -sI`
  de `/orcamento` com **uma** CSP); se não funcionar, a CSP volta a ser por página com uma regra própria para o 404
  e o teste muda junto.
- [ ] **Step 5:** commit.

#### Task B5: o servidor local passa pela mesma porta

**Files:** Modify: `docs/servidor.mjs:13-16`, `:50-66`; Test: `docs/testes/worker.test.mjs`

- [ ] **Step 1: teste vermelho**: sobe `docs/servidor.mjs` numa porta livre (filho, `BZ_LOCAL=1`) e confere:
  `/api/_freio` → 404 JSON; `PUT /api/vendas` → 405; POST de 70 KB em `/api/vendas` → 413 **do roteador**
  (corpo `{"erro":"Corpo grande demais."}`); POST de 150 KB no `/api/painel` → **não** 413 do roteador (chega ao
  handler, que responde 401 sem chave); cabeçalhos de `/`, `/orcamento`, `/painel` == `cabecalhosPara` do `_headers`.
- [ ] **Step 2:** FAIL. **Step 3:** em `api()`: montar o `Request` como hoje e responder
  `await rotear(pedido, process.env)` (import de `../cloudflare/rotas.mjs`); os cabeçalhos das páginas vêm de
  `cabecalhosPara(lerHeaders(_headers), caminho)` no lugar do `vercel.json`.
- [ ] **Step 4:** PASS; servidor local + `npm run e2e:orcamento` (com e sem consultor) → PASS (agora o E2E atravessa
  o `rotear`). **Step 5:** commit.

#### Task B6: `wrangler.jsonc` e `package.json`

**Files:** Create: `wrangler.jsonc`; Modify: `package.json`, `package-lock.json`; Test: `docs/testes/worker.test.mjs`

- [ ] **Step 1: teste vermelho**:

```js
const SEGREDOS = ['SUPABASE_URL', 'SUPABASE_CHAVE_PUBLICA', 'SUPABASE_CHAVE_SECRETA', 'PAINEL_CHAVE', 'ANTHROPIC_API_KEY', 'MP_ACCESS_TOKEN', 'MP_PUBLIC_KEY',
  'MP_WEBHOOK_SEGREDO', 'MP_USER_ID', 'CRON_SECRET', 'FREIO_SEGREDO', 'ALERTA_NTFY_TOPICO', 'ALERTA_NTFY_TOKEN', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET'];
test('wrangler.jsonc: produção fechada, prévia declarada, nada de segredo, nada que rode código no build', () => {
  const c = lerJsonc(fs.readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.ok(c.compatibility_flags.includes('nodejs_compat')); assert.equal(c.compatibility_date, '2026-10-21');
  assert.equal(c.assets.directory, 'publico'); assert.deepEqual(c.assets.run_worker_first, ['/api/*']); assert.equal(c.assets.not_found_handling, '404-page');
  assert.equal(c.vars.BZ_AMBIENTE, 'producao'); assert.equal(c.vars.MP_AMBIENTE, 'producao'); assert.equal(c.vars.MP_METODOS, 'pix');
  assert.equal(c.env.previa.vars.BZ_AMBIENTE, 'previa'); assert.equal(c.env.previa.vars.MP_AMBIENTE, 'teste'); assert.equal(c.env.previa.vars.MP_METODOS, 'pix');
  assert.deepEqual(c.env.previa.previews.vars, c.env.previa.vars, 'as prévias de branch não herdam vars: os mesmos do staging (ALTO-2)');
  for (const vars of [c.vars, c.env.previa.vars, c.previews?.vars || {}, c.env.previa.previews.vars]) for (const s of SEGREDOS) assert.ok(!(s in vars), s + ' em vars');
  assert.equal(c.workers_dev, false, 'produção sem workers.dev (revisão M3)');
  assert.equal(c.build, undefined, 'sem build: o Builds não honra e ele rodaria código no deploy');
  assert.equal(c.account_id, undefined, 'a conta vem do token do Builds de cada conta');
  assert.equal(c.routes, undefined, 'o domínio é do PR C'); assert.equal(c.env.previa.route, undefined);
  assert.deepEqual(c.env.previa.routes, [], 'routes é herdável: o staging nunca pega o domínio de produção (ALTO-1)');
  assert.equal(c.observability.enabled, true); assert.equal(c.observability.traces.enabled, true);
  const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const s of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepack']) assert.equal(pkg.scripts[s], undefined, s);
  assert.equal(pkg.devDependencies.wrangler, '4.136.3', 'versão exata');
});
```

- [ ] **Step 2:** FAIL. **Step 3:** `wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  // produção (conta de produção, branch producao). A conta vem do token do Builds: nunca account_id aqui.
  "name": "beyon-zero-site",
  "main": "cloudflare/worker.mjs",
  "compatibility_date": "2026-10-21",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "preview_urls": false,
  "assets": { "directory": "publico", "binding": "ASSETS", "run_worker_first": ["/api/*"],
              "html_handling": "auto-trailing-slash", "not_found_handling": "404-page" },
  "triggers": { "crons": ["23 */3 * * *", "41 6 * * *"] },
  "vars": { "BZ_AMBIENTE": "producao", "MP_AMBIENTE": "producao", "MP_METODOS": "pix", "BZ_DIRECOES": "manual", "MP_3DS": "", "METRICAS_HOSTS": "" },
  "observability": { "enabled": true, "logs": { "enabled": true, "head_sampling_rate": 1 }, "traces": { "enabled": true } },
  "env": {
    // conta das PRÉVIAS: main = staging fixo (deploy --env previa); outras branches = preview --env previa
    "previa": {
      // routes é HERDÁVEL: sem esta linha, depois do PR C o staging tentaria prender beyonzero.com.br (2ª revisão, ALTO-1)
      "routes": [],
      "workers_dev": true,
      "preview_urls": true,
      "triggers": { "crons": ["23 */3 * * *", "41 6 * * *"] },
      "vars": { "BZ_AMBIENTE": "previa", "MP_AMBIENTE": "teste", "MP_METODOS": "pix", "BZ_DIRECOES": "manual", "MP_3DS": "", "METRICAS_HOSTS": "", "BZ_IA": "simulada" },
      // as prévias de branch NÃO herdam vars: sem este bloco elas rodariam como produção (2ª revisão, ALTO-2)
      "previews": {
        "vars": { "BZ_AMBIENTE": "previa", "MP_AMBIENTE": "teste", "MP_METODOS": "pix", "BZ_DIRECOES": "manual", "MP_3DS": "", "METRICAS_HOSTS": "", "BZ_IA": "simulada" }
      }
    }
  }
}
```

  Conferido pela 2ª revisão no schema do 4.136.3 e na doc (21/10): `previews` é aceito dentro de um ambiente
  (`env.<nome>.previews`, com `--env` em todo comando de prévia); as prévias **não** herdam `vars` (vão em
  `previews.vars`); `assets`, `observability`, `triggers`, `workers_dev`, `preview_urls` e **`routes`** são herdados
  pelo ambiente; `preview_urls` existe (topo `false`: sem URLs de versão com os segredos de produção; `env.previa`
  `true`: necessário para as Preview URLs das branches). Mesmo assim, conferir de novo no
  `node_modules/wrangler/config-schema.json` instalado. **Versão do Wrangler:** 4.136.3 (22/09) é a da captação;
  antes do PR B, ler o changelog das Previews até a mais nova com ≥ 2 semanas (ex.: 4.147.0, 02/10) e trocar se
  houver correção de Previews, conferindo o schema dela. `package.json`: `"wrangler":
  "4.136.3"` em `devDependencies`; scripts `"cf:montar": "node cloudflare/montar-publico.mjs"`, `"cf:fumaca": "node
  docs/worker-fumaca.mjs"`, `"cpu:rotas": "node docs/cpu-rotas.mjs"`; descrição sem "Vercel". `npm install` para
  atualizar o lock (é dependência de desenvolvimento; o Builds instala pelo lock).
- [ ] **Step 4:** PASS + `npx wrangler deploy --dry-run --outdir .wrangler/saida` (empacota sem publicar; o guarda
  permite) e `npx wrangler deploy --dry-run --env previa --outdir .wrangler/saida-previa`; na saída do 2º, conferir
  que **não** há rota nem domínio personalizado (nem depois do C2).
- [ ] **Step 5:** commit `feat: wrangler.jsonc com producao fechada e ambiente previa`.

#### Task B7: fumaça no runtime de verdade (workerd, só no CI)

**Files:** Create: `docs/worker-fumaca.mjs`; Modify: `.github/workflows/ci.yml` (job novo "Worker", `permissions:
contents: read`)

- [ ] **Step 0 (pasta limpa):** o `wrangler dev` lê `.dev.vars` e `.env` da pasta. A fumaça copia para uma pasta
  temporária só `publico/` (saída do `montar-publico`), `cloudflare/`, `api/`, `wrangler.jsonc`, `package.json`,
  `package-lock.json` e `node_modules/` (junção/symlink) e roda **lá** (ou usa a opção que o `wrangler dev --help`
  do 4.136.3 mostrar para não ler `.env`). No CI não há `.env`, mas a regra é a mesma.
- [ ] **Step 1:** o script: `node cloudflare/montar-publico.mjs`; `npx wrangler deploy --dry-run --outdir
  .wrangler/saida` (anota o tamanho do pacote); `npx wrangler check startup` (perfil da inicialização; falha se
  passar de 400 ms, folga para o 1 s); `npx wrangler dev --local --port 8787` **sem segredos** (= produção sem
  chaves: tudo tem de fechar) e confere:
  `/orcamento` 200 com **uma** CSP; `/orcamento.html` 307 para `/orcamento`; `/docs/PROCESSO.md`, `/_headers`,
  `/publico/index.html`, `/wrangler.jsonc`, `/api/_freio` → 404; `GET /api/vendas?acao=sessao-config` com
  `cf-connecting-ip: 203.0.113.7` → JSON com `turnstile: null` e `consultor: false`; POST de 70 KB em
  `/api/vendas` → 413; dois POST `/api/evento` com o mesmo `cf-connecting-ip` e `x-forwarded-for` diferentes caem na
  mesma chave do freio (o 2º lote de 60 pedidos responde 429 igual); o cron `41 6 * * *` disparado à mão gera o log
  "rotina desligada". Caminho do disparo: `/cdn-cgi/local/scheduled?cron=…` no Wrangler ≥ 4.139.0 (Local Explorer,
  doc de Cron Triggers de 21/10); `/cdn-cgi/handler/scheduled?cron=…` com `wrangler dev --test-scheduled` nas
  versões anteriores (o 4.136.3). O script tenta os dois e falha se nenhum responder.
  O `wrangler dev` local põe `cf-connecting-ip`? Se não puser, a fumaça manda o cabeçalho e o caso do 403 fica no B1.
- [ ] **Step 2:** rodar local uma vez (`node docs/worker-fumaca.mjs`) e ver passar; ver **falhar** trocando o
  `run_worker_first` por `[]` (o `/api/_freio` vira 404 do asset, mas o `sessao-config` deixa de responder JSON).
- [ ] **Step 3:** commit.

#### Task B8: a trava anti-publicação e os níveis

**Files:** Create: `scripts/processo/anti-publicacao.mjs`, `docs/testes/anti-publicacao.test.mjs`; Modify:
`scripts/processo/niveis.json`

**Interfaces:** Produces: `conferirAntiPublicacao(raiz, arquivos) → string[]` (achados) e CLI
`node scripts/processo/anti-publicacao.mjs` (saída 1 com achado). O dono copia este arquivo para
`~/.claude/guarda/anti-publicacao.mjs` (P2); o guarda roda a cópia antes de todo `git push`.

- [ ] **Step 1: teste vermelho** — numa pasta temporária com arquivos falsos, cada um destes vira achado:
  um `.github/workflows/x.yml` com `contents: write` (ou `permissions: write-all`); qualquer arquivo versionado com
  `wrangler deploy` sem `--dry-run`, `versions deploy`, `versions upload`, `rollback`, `secret put`, `secret bulk`,
  `triggers deploy`, `:producao` ou `refs/heads/producao`; `package.json` com `preinstall`/`install`/`postinstall`/
  `prepare`; `wrangler.jsonc` com `build`. **Exceções só de arquivos `.md`, um a um, nunca pasta** (2ª revisão,
  ALTO-3): `docs/superpowers/plans/2026-10-21-migracao-cloudflare.md`, `docs/PROCESSO.md`, `CLAUDE.md`. Um `.mjs`
  ou `.yml` posto dentro de `docs/superpowers/plans/` **é** achado (caso de teste). O próprio verificador e o teste
  montam os termos por partes (`'wrangler' + ' deploy'`, `':pro' + 'ducao'`) para não precisarem de exceção. E o
  repositório real passa limpo. Comentário no topo do verificador: "varredura de texto: pega erro e instrução óbvia,
  não quem quer contornar (`'prod' + 'ucao'`, base64); a trava contra o agente enganado é a confirmação do dono
  no `git push` (§ 5.5 do plano, item 1)".
- [ ] **Step 2:** FAIL. **Step 3:** implementação com uma lista de expressões e a lista de exceções acima; lê
  `git ls-files` (ou a lista recebida). **Step 4:** PASS.
- [ ] **Step 5:** `niveis.json`: regra nível 3 para `^(wrangler\.jsonc|_headers)$` e `^cloudflare/` ("deploy e
  cabeçalhos da Cloudflare"); o `scripts/processo/` já é nível 3. Teste do nível (o de hoje) acrescenta os 3 caminhos.
- [ ] **Step 6:** commit.

#### Task B9: os scripts alcançam o staging atrás do Access

**Files:** Modify: `docs/verificar.mjs`, `docs/acessibilidade.mjs`, `docs/cpu-rotas.mjs`, `scripts/direcoes.mjs`;
Create: `docs/acesso.mjs`

**Interfaces:** Produces: `cabecalhosDeAcesso(env = process.env) → {}` ou
`{ 'CF-Access-Client-Id': …, 'CF-Access-Client-Secret': … }`, só quando as duas variáveis existem **e** o `BASE`
é o staging/prévia (nunca manda o token para outro host).

- [ ] **Step 1: teste vermelho** (em `worker.test.mjs`): com as duas variáveis e `BASE` de prévia → os 2 cabeçalhos;
  com `BASE=https://beyonzero.com.br` ou `http://127.0.0.1:8899` → `{}`; com só uma variável → `{}`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar; o Playwright usa `extraHTTPHeaders`; o `scripts/direcoes.mjs` soma
  os cabeçalhos aos que já manda. **Step 4:** PASS. **Step 5:** commit.

**Aceitação do PR B:** checks verdes (inclusive o job "Worker"); revisão técnica e de segurança; depois do merge, os
passos P1–P8 do dono; o staging abre no celular do dono; o orçamento vai até o Pix de teste com o Supabase staging; o
agente lê os logs. Então a M2.

### Task M2 — medida no staging (P8, com o dono; antes do PR C)

- [ ] **Antes de medir: as prévias estão como prévia?** Abrir uma prévia de branch e uma chamada ao staging da
  `main`; no log de cada uma, `BZ_AMBIENTE=previa` (o `sessao-config` com a chave de site de teste do Turnstile e o
  pagamento ativo em teste). Se alguma vier como produção (tudo fechado), o `env.previa.previews.vars` não pegou:
  parar e corrigir o B6 antes de medir.
- [ ] **Formato real da URL de prévia:** copiar o endereço da 1ª prévia criada e conferir contra a expressão do C3
  (`<prévia>-beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev`); se for outro, o C3 usa o formato visto.
- [ ] **A medida, com o critério do § 3.3 escrito antes:** `BASE=https://beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev
  node docs/cpu-rotas.mjs --remoto` (com o service token): toda ação do visitante, painel GET, webhook e crons, **20
  chamadas espaçadas** (frias e quentes); e **5 entregas frias** de direção típica (§ 3.1), com ≥ 15 min entre elas,
  pelo `scripts/direcoes.mjs` com pedidos de teste.
- [ ] No painel da conta das prévias: Workers & Pages → `beyon-zero-site-previa` → Observability → filtrar por
  caminho; anotar p50/p99/máximo de **CPU time** por rota e **todo** `exceededCpu` (erro 1102). Aplicar o critério:
  visitante/painel/webhook/crons cabem com zero 1102, p99 ≤ 7 ms e ≤ 45 subpedidos; entrega cabe só com zero 1102
  nas 5. Anotar os pedidos `/api/*` por visita ao orçamento (regra de limite, § 7.1).
- [ ] **Ensaio do A4 que prova o limite, não só o log:** no Supabase staging, baixar "anonymous sign-ins" para
  **3 por hora**; abrir **4 sessões** do orçamento no celular do dono pela mesma rede → a 4ª recebe 429 do Auth (o site
  mostra "indisponível" e o WhatsApp); de **outra rede** (o 4G do celular) → 200. No Logs → Auth, o IP do `signup` é o
  do celular (IPv4 exato ou o **prefixo /64** do IPv6, A10), **não** `2a06:98c0:3600::103`. Depois, voltar o limite ao
  valor padrão. Se o IP for o da Cloudflare: conferir a opção do P6; se ela não existir no grátis, a contingência do P6
  (plano B ou ir com o balde compartilhado e monitorar, R7). Anotar quantos 429 do Auth aparecem nos testes: IPv4 de
  operadora (CGNAT) junta muitos celulares num IP só e 30/h pode barrar gente de verdade; o dono ajusta o limite se
  preciso.
- [ ] Ensaios curtos: `curl -sI` de `/orcamento` (uma CSP só), Bypass do Access em `/api/pagamentos`, cota do
  Workers Logs.
- [ ] A tabela vai para `docs/evidencias/2026-10-cpu-rotas.md`; se alguma rota ficar fora do critério, ela vai ao
  dono junto com o caminho da **Decisão 2** (já respondida: grátis; (b), depois (c)).
- [ ] **Decisão 2 (21/10): nada pago antes da 1ª venda.** Rota que não cabe: o agente faz a **(b)**, plano próprio
  para a varredura em pedaços (fora deste). Se a (b) ainda não couber, o agente **volta ao dono** com a **(c)**
  (conferência só no PC dele): tarefa própria nível 3 tirando o `varrer` de `api/painel.mjs:175` e `:270` **só** na
  Cloudflare de produção, com a decisão citada no comentário e teste; **só com o "sim" dele**. A (a) (Workers Paid na
  conta de produção) **não** é pré-requisito do P15: só depois da 1ª venda concluída.

### PR C — domínio e corte (depois da M2; a Decisão 2 já está respondida: grátis)

O domínio entra num módulo de teste só: `docs/testes/dominio.mjs` com
`export const DOMINIO = 'https://beyonzero.com.br';`. Os testes que hoje fixam `beyon0-site.vercel.app` passam a
importar a constante (`docs/testes/condicoes.test.mjs:69-75`; `docs/testes/fila-direcoes.test.mjs:210-212`).
Arquivos com o endereço antigo (busca de 21/10): `index.html` (11, inclui os dados estruturados), `sites.html` (7),
`automacao.html` (7), `resumo.html` (5), `orcamento.html` (4), `condicoes.html` (4), `privacidade.html` (1),
`sitemap.xml` (5), `robots.txt` (1), `scripts/direcoes.mjs` (2), `assets/README.txt` (1), `package.json` (descrição).

#### Task C1: domínio único

**Files:** os arquivos acima; Create: `docs/testes/dominio.mjs`; Test: `docs/testes/condicoes.test.mjs`,
`docs/testes/publico.test.mjs`

- [ ] **Step 1: teste vermelho**: nenhum `vercel.app` nos arquivos da saída do `montar-publico`; canonical,
  `og:url`, `og:image`, dados estruturados, `sitemap.xml` e `robots.txt` com `DOMINIO`.
- [ ] **Step 2:** FAIL. **Step 3:** trocar os endereços. **Step 4:** PASS + `npm run verificar`. **Step 5:** commit.

#### Task C2: rota do domínio, `workers.dev` desligado

**Files:** Modify: `wrangler.jsonc`; Test: `docs/testes/worker.test.mjs`

- [ ] **Step 1: teste vermelho**: `routes` == `[{ pattern: "beyonzero.com.br", custom_domain: true }]` (sem `www`:
  o `www` é da Redirect Rule da zona); `workers_dev === false` e `preview_urls === false` no topo;
  `assert.deepEqual(c.env.previa.routes, [])` (continua vazio com o domínio no topo: `routes` é herdável, ALTO-1);
  `METRICAS_HOSTS` vazio.
- [ ] **Step 2:** FAIL. **Step 3:** acrescentar `"routes": [{ "pattern": "beyonzero.com.br", "custom_domain": true }]`
  no topo (o `env.previa.routes: []` do B6 fica). **Step 4:** PASS; `npx wrangler deploy --dry-run --env previa`
  sem rota nem domínio na saída. **Step 5:** commit.
- [ ] **Ensaio depois do PR C entrar na `main`:** o build do staging na conta das prévias passa, e o domínio
  `beyonzero.com.br` continua só no Worker de produção (painel da conta de produção → Domains).

#### Task C2b: teto de CPU na produção paga (**NÃO ENTRA no corte**: a Decisão 2 de 21/10 ficou no grátis; só se, depois da 1ª venda, o dono assinar o Workers Paid)

**Files:** Modify: `wrangler.jsonc`; Test: `docs/testes/worker.test.mjs`

- [ ] Teste vermelho: se `c.limits` existir no topo, `c.limits.cpu_ms === 100`, e `env.previa` sem `limits` (a conta
  das prévias é grátis; lá vale o limite do plano). Implementação: `"limits": { "cpu_ms": 100 }` no topo. Por quê: no
  pago, o excesso vira conta; o teto por pedido segura um ataque que force CPU (o padrão do pago é 30 s). PASS; commit.

#### Task C3: `scripts/direcoes.mjs` aceita só os nossos endereços

**Files:** Modify: `scripts/direcoes.mjs:46`, `:167-173`; Test: `docs/testes/fila-direcoes.test.mjs:210-212`

- [ ] **Step 1: teste vermelho**: aceitos `https://beyonzero.com.br`,
  `https://beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev` e
  `https://minha-branch-beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev`, local; recusados
  `http://beyonzero.com.br`, `https://beyonzero.com.br.evil.com`, `https://x@beyonzero.com.br`,
  `https://x-beyon-zero-site-previa.evil.workers.dev`, `https://beyon-zero-site-previa.<SUB_PREVIAS>.workers.dev.evil.com`,
  `https://www.beyonzero.com.br` (só redireciona; a chave não deve ir num pedido que vira 301).
- [ ] **Step 2:** FAIL. **Step 3:**

```js
/* o subdomínio workers.dev da conta das PRÉVIAS (P3): fixo, para a PAINEL_CHAVE nunca ir a um *.workers.dev de terceiros */
const SUB_PREVIAS = '<o subdomínio que o dono anotou no P3>';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HOSTS = [/^beyonzero\.com\.br$/, new RegExp('^(?:[a-z0-9-]+-)?beyon-zero-site-previa\\.' + esc(SUB_PREVIAS) + '\\.workers\\.dev$'),
  /^beyon0-site\.vercel\.app$/, /^beyon0-site-[a-z0-9-]+-beyond0\.vercel\.app$/];   /* (os da Vercel saem no PR D) */
```

  (O valor de `SUB_PREVIAS` só existe depois do P3; o PR C não abre sem ele. Não é segredo: aparece na URL. O
  formato `<prévia>-<worker>.<sub>.workers.dev` **não** está confirmado na doc das Previews: a expressão segue o
  endereço real da 1ª prévia, anotado na M2.)
- [ ] **Step 4:** PASS. **Step 5:** commit.

#### Task C3b: painel e script dentro da regra de 10 / 10 s (só se o P8 achar janela acima de 10)

**Files:** Modify: `scripts/direcoes.mjs:461` (função que chama `/api/painel`), `js/painel.js` (abertura);
Test: `docs/testes/fila-direcoes.test.mjs`, `docs/testes/painel-aviso.test.mjs`

- [ ] Teste vermelho: com um `fetch` falso que anota o horário de cada chamada, uma rodada inteira do script (fila,
  3 entregas, conferência) nunca faz mais de 10 chamadas em 10 s (espera ≥ 1,1 s entre chamadas; constante
  `INTERVALO_MIN_MS = 1100`); a abertura do painel faz as consultas uma depois da outra (cada uma espera a anterior).
- [ ] Implementação mínima; PASS; servidor local + abrir o painel e ver que nada mudou para o dono além de ~1 s a
  mais na abertura; commit `fix: painel e script de direcoes abaixo da regra de limite`.

#### Task C4: textos

**Files:** Modify: `privacidade.html` (hospedagem: "Cloudflare" no lugar de "Vercel"), `condicoes.html` (se citar)

- [ ] Texto novo marcado para **revisão jurídica** (já é pendência); `npm run verificar` e `npm run acessibilidade`;
  commit.

#### Task C5: documentos

**Files:** Modify: `docs/PROCESSO.md` (barreira nova: duas contas, promoção por PR com merge commit, rollback, o
limite residual escrito como no § 5.3, a regra de confirmação do dono do § 5.5 e, se escolhido, o ruleset do P2b), `CLAUDE.md` regra 6 (a `main` não publica; produção só pela `producao` na conta de
produção; o guarda nega o resto), `docs/fundacao/02-OPERACAO.md` (§ 3; § 4.3 item 4 marcado "superado pela Fase 2:
login anônimo LIGADO"; "seis migrations" → "as migrations de `supabase/migrations`"; IP Address Forwarding no
Auth), `docs/fase2/02-OPERACAO.md` § 1.3–1.4, `docs/pagamentos/01-ARQUITETURA-E-OPERACAO.md` § 9–10 (webhook e
alerta), `docs/fundacao/03-STATUS.md`.

- [ ] Nível 3 (`CLAUDE.md`, `docs/PROCESSO.md`): revisão própria; commit.

**Aceitação do PR C e corte:**
1. P10–P14 feitos; o agente abre o PR "Promover para produção: `<sha>`"; o dono faz o Merge (P15).
2. O agente confere: `BASE=https://beyonzero.com.br npm run verificar`; `https://www.beyonzero.com.br/sites?x=1` →
   301 para `https://beyonzero.com.br/sites?x=1`; `curl -sI` de `/`, `/orcamento`, `/painel`,
   `/api/vendas?acao=sessao-config` iguais aos do staging; `/docs/PROCESSO.md`, `/api/_freio`, `/.env`,
   `/CLAUDE.md`, `/wrangler.jsonc`, `/_headers` → 404; `https://beyon-zero-site.<sub de produção>.workers.dev` não
   responde (desligado). **Nunca** o E2E do orçamento contra produção.
3. O dono abre o site e o `/orcamento` no celular, **sem digitar mensagem**.
4. No dia seguinte: no Workers Logs da produção, os logs das duas rotinas (`origem: rotinas`, `[pagamentos]`).
5. `git diff origin/main origin/producao` vazio.

### PR D — limpeza (com produção conferida por 1–2 semanas)

**Files:** Delete: `vercel.json`, `.vercelignore`, `.github/workflows/reconciliar.yml` (se os crons rodaram certo
por uma semana); Modify: `api/_ambiente.mjs` (sem o ramo da Vercel), `api/_freio.mjs:31` (sem
`x-vercel-forwarded-for`), `docs/testes/publico.test.mjs` (o oráculo da Vercel vira a **lista congelada** da saída
de hoje), `docs/testes/csp.test.mjs` (sem paridade com o `vercel.json`), `scripts/direcoes.mjs` (sem os hosts
`vercel.app`), `scripts/processo/niveis.json`.

- [ ] **Step 1: teste vermelho**: "nenhuma menção a `VERCEL`/`x-vercel`/`vercel.app` em `api/`, `cloudflare/`,
  `scripts/`". **Step 2:** FAIL. **Step 3:** apagar. **Step 4:** PASS + suíte inteira. **Step 5:** commit.
- **Links antigos (Decisão 3, 21/10):** antes do P17, a captação confirma que trocou todos os links
  `beyon0-site.vercel.app` por `beyonzero.com.br` (`captacao/config/oferta.json`, as mensagens e o rodapé dos sites de
  demonstração já publicados). O agente confere com `grep` no repositório da captação e olhando os sites publicados;
  sem essa conferência o P17 espera. **Não há redirecionamento de 90 dias nem deploy estático de redirecionamento.**
- O P17 (apagar o projeto da Vercel, sem esperar os 90 dias) vem logo depois dessa conferência e do corte conferido
  (P15–P16); não precisa esperar as 1–2 semanas deste PR, que só limpa código. O dono tira as regras da Vercel do
  guarda depois do P17.

---

## 9. Riscos e o que ficou incerto

| # | Risco | Situação | O que fazer |
|---|---|---|---|
| R1 | Entrega de direção acima de 10 ms de CPU | **medido** no Node (§ 3.1) | M2 confirma; Decisão do dono 2 respondida: grátis, (b) e depois (c) |
| R2 | Cota de 100 mil pedidos/dia como ponto de derrubada barato: **no grátis nenhuma regra a protege**; com 10/10 s por IP (§ 7.1) são precisos 2 IPs. Quando acaba, `/api/*` responde 429 (ou erro 1027) até 21 h de Brasília, inclusive o webhook do MP | real no grátis | o MP reenvia o aviso por um tempo; a reconciliação de 3 em 3 h recupera **se o cron rodar** (a doc não diz se o cron roda com a cota esgotada); a Decisão 2 (a) trocaria a derrubada por custo (pequeno, cobrado por milhão de pedidos a mais), **sem teto de gasto** no Workers Paid, mas o dono ficou no grátis até a 1ª venda (21/10): **o risco fica aceito até lá**; o `cpu_ms` do C2b (parado) limitaria cada pedido, não o total |
| R3 | Geração longa pela API (até 240 s) cancelada se o visitante fechar a aba | só com `BZ_DIRECOES=api` (lançamento é `manual`) | ensaio com chave real antes de ligar a API; PR próprio se travar |
| R4 | O limite residual da barreira: um workflow que chegue ao repositório (por outra pessoa, outra ferramenta ou aprovação sem leitura) pode pedir `contents: write` e empurrar para `producao` | escrito (§ 5.3) | contra o agente enganado: a confirmação do dono (§ 5.5, P2). Para qualquer origem: só a Decisão 1 (c), GitHub Pro com ruleset. A antiga ideia de `versions upload` **não** fecha (o Build command roda com a chave de produção) |
| R5 | Repositório privado grátis sem proteção de branch (ruleset exige GitHub pago) | real | o mesmo do R4; nunca trocar a branch de produção para `main` sem decisão escrita |
| R6 | Links antigos `beyon0-site.vercel.app` | real | Decisão do dono 3 (21/10): apagar logo, sem redirecionamento; só depois de a captação trocar os links (P17) |
| **R7** | **`Sb-Forwarded-For` indisponível no plano grátis do Supabase** (a doc não diz o plano) | **incerto** | conferir no P6 (a opção aparece em Authentication › Rate Limits?). Se não aparecer, o dono escolhe (P6): **(1) atrasar o corte** pelo plano B: criar o visitante anônimo **no navegador** (o IP real chega ao Supabase; o Turnstile continua na frente; muda a CSP do `/orcamento` para `connect-src` do Supabase, o desenho da sessão e a segurança): spec própria, estimativa **2–3 dias** com revisões; ou **(2) ir ao ar com o balde compartilhado** por um período, com o agente lendo os 429 do Auth no log a cada dia e o plano B em paralelo. Também incerto: se a chave secreta **isenta** do limite (a doc não diz); o ensaio de 3/h da M2 responde |
| R8 | Diferenças do workerd não vistas no Node (`fetch` que falha com outro erro que `TypeError`; o `visitante.mjs:25` trata só `TypeError` como "rede") | coberto pela fumaça e pelo staging | B7 + o orçamento inteiro no staging |
| R9 | Webhook de teste barrado pelo Access no staging | depende do ensaio (§ 5.4) | se não der Bypass por caminho no `workers.dev`, a reconciliação do staging cobre |
| R10 | `previews` dentro de `env.previa`, herança, `preview_urls`, caminho do cron no `wrangler dev` | **conferido pela 2ª revisão** (schema 4.136.3 e doc): `previews` aceito no ambiente; `vars` não herdados (daí o `previews.vars`); `routes` herdado (daí o `routes: []`); `preview_urls` existe; cron em `/cdn-cgi/local/scheduled` (≥ 4.139.0) ou `/cdn-cgi/handler/scheduled` (antes) | B6 e B7 conferem de novo no arquivo instalado |
| R11 | Alerta por frase (a doc de pagamentos manda criar no Observability da Vercel) | o Workers Logs não alerta por frase | o ntfy da rotina diária; conferir que a reconciliação parcial (A8) também vira alerta |
| R12 | Política de privacidade cita a Vercel | real | C4, revisão jurídica |
| R13 | O PR 3b ("vender sozinho") traz envio de material com fotos (até 10 MB cada) | a spec (`site-pr3b/docs/specs/2026-10-21-pr3b-vender-sozinho.md`) já assume o grátis ("rotas leves; arquivo nunca passa pelo Worker"); **não cria rota**: põe **ações** novas em `/api/vendas` e no painel, e chamadas ao Storage na rotina diária; muda a CSP do `/orcamento` (`connect-src` do Storage, `img-src blob:`) | a M1 enumera `ACOES` e `ACOES_PAINEL` e falha sem caso de medida; a rotina diária tem orçamento de subpedidos (A8); a CSP nova entra no bloco `/orcamento` do `_headers` e, enquanto o `vercel.json` existir, nos dois juntos (teste de paridade do B4); a chave do cartão é a mesma `MP_METODOS` |
| R14 | A 1ª chamada fria num isolado novo pesa (regex compiladas na hora) em **toda** rota com varredura ou `redigir` | medido só na entrega | a M1/M2 medem a 1ª chamada de cada rota |

**Perguntas ao dono que não são decisão de arquitetura:** ~~vai ter e-mail `@beyonzero.com.br`?~~ respondida em
21/10: **não, por agora** (o MX nulo, o SPF `-all` e o DMARC `p=reject` continuam; a zona segue "sem e-mail"). A conta
Cloudflare de produção tem verificação em duas etapas? (o
agente não confirmou.)

## 10. Ordem no tempo

| Quando | Agente | Dono |
|---|---|---|
| Agora | nova revisão deste plano (agente diferente); depois PR A | P1 (as Decisões 1, 2 e 3 já foram respondidas em 21/10) |
| Depois do PR A | M1; PR B | P2 (guarda) |
| Depois do PR B | guiar e conferir pelo navegador do dono | P3–P8 (conta das prévias, Supabase staging, MP teste) |
| P8 | M2 + ensaios | (a Decisão 2 já está respondida; se uma rota não couber, o agente volta ao dono só com a (c)) |
| Staging aprovado | PR C | P9–P14 |
| Promoção | conferir produção, ler logs | P15 |
| +1 dia | conferir as rotinas | — |
| +1–2 semanas | PR D | — |
| Corte conferido **e** captação com os links trocados | conferir que nenhum link antigo sobrou | P17 (apagar a Vercel logo, Decisão 3) |

## 11. Fontes (lidas em 21/10/2026)

- Limites: https://developers.cloudflare.com/workers/platform/limits/
- Cabeçalhos HTTP (`CF-Connecting-IP` fixo em subpedido de Worker; `X-Forwarded-For` acrescentado):
  https://developers.cloudflare.com/fundamentals/reference/http-headers/
- `process.env` (`nodejs_compat_populate_process_env`, data ≥ 2025-04-01):
  https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/
- `navigator.userAgent === 'Cloudflare-Workers'` (`global_navigator`):
  https://developers.cloudflare.com/workers/runtime-apis/web-standards/
- Workers Builds (comandos, token padrão com *Workers Scripts: Edit*, Custom Build não honrado, Preview command):
  https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ · branches ("Enable Preview Builds", sem
  filtro de branch): https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/ · limites:
  https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- Supabase Auth, limites por IP e `Sb-Forwarded-For` (só chave secreta; ligar em Authentication › Rate Limits):
  https://supabase.com/docs/guides/auth/rate-limits
- Lidas pela revisão no mesmo dia e usadas aqui: assets e cobrança (429 em `run_worker_first`)
  https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ · `_headers` (`! Nome`)
  https://developers.cloudflare.com/workers/static-assets/headers/ · Previews
  https://developers.cloudflare.com/workers/previews/ · Access nos Workers
  https://developers.cloudflare.com/workers/configuration/cloudflare-access/ · Turnstile hostnames
  https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/ · regras de limite
  https://developers.cloudflare.com/waf/rate-limiting-rules/ · Cron Triggers
  https://developers.cloudflare.com/workers/configuration/cron-triggers/ · migração Vercel → Workers
  https://developers.cloudflare.com/workers/static-assets/migration-guides/vercel-to-workers/
- Lidas pela 2ª revisão (21/10) e usadas aqui: Previews, configuração (não herdam `vars`; `previews.vars`)
  https://developers.cloudflare.com/workers/previews/configuration/ · Previews × ambientes (`env.<nome>.previews`,
  `--env`) https://developers.cloudflare.com/workers/previews/compare-workflows/ · configuração do Wrangler
  ("Inheritable keys", inclusive `routes`) https://developers.cloudflare.com/workers/wrangler/configuration/ · schema
  do 4.136.3 https://unpkg.com/wrangler@4.136.3/config-schema.json · Zero Trust Free pede forma de pagamento
  https://developers.cloudflare.com/learning-paths/secure-internet-traffic/initial-setup/create-zero-trust-org/ ·
  permissões do `GITHUB_TOKEN` (o YAML ajusta; o padrão do repositório não é teto)
  https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token

---

## 12. Achados da 2ª revisão → onde foram tratados

Revisão: `.superpowers/sdd/cloudflare-plano-revisao-2.md` (veredito "aprovar com correções").

| Achado | O que mudou | Onde |
|---|---|---|
| Parciais da 1ª revisão: A1, A3, A4, M3, M8 | cada um passou a "resolvido com limite escrito" (A1: caminho 2 só fecha com GitHub Pro; A3: entrega depende da Decisão 2; A4: opção do Supabase pode não existir no grátis; M3: no grátis nenhuma regra protege a cota; M8: Access "All traffic" + cartão do Zero Trust) | § 2.1, § 2.2, contagem |
| **ALTO-1** `env.previa` herda `routes` | `"routes": []` no `env.previa`; teste `deepEqual(c.env.previa.routes, [])` no B6 e no C2; `--dry-run --env previa` sem rota; ensaio depois do PR C | B6, C2 |
| **ALTO-2** prévias sem `vars` rodam como produção | `env.previa.previews.vars` igual ao `env.previa.vars`, com teste de igualdade e sem segredo; P5 com os segredos nos dois lugares; P8/M2 conferem `BZ_AMBIENTE=previa` numa prévia antes de medir | B6, P5, P8, M2 |
| **ALTO-3** caminho 2 aberto em todas as opções | Decisão 1 reescrita: (a) uma conta, (b) duas contas + confirmação do dono (recomendada, grátis), (c) (b) + GitHub Pro US$ 4/mês (opcional, não obrigatório); `versions upload` descartado (não fecha); regra `ask` e `deny` de `gh api` de escrita como **pedido ao dono** (P2), sem o agente tocar em `settings.json`, hooks ou guarda; B8 com exceções só de `.md` um a um; texto do resumo do revisor adotado | § 4 D1, § 5.3, § 5.5, P2, P2b, B8, R4, R5 |
| MÉDIO-1 Access e Zero Trust | Access no Worker com "All traffic"; Zero Trust pede cartão no Free (sem cobrança); conta das prévias de **outro usuário** | § 5.3, § 5.4, P3, P5, resumo |
| MÉDIO-2 `Sb-Forwarded-For` | ensaio com o anônimo em 3/h (4ª sessão = 429; outra rede = 200); `normalizarIp` e /64 documentado na A10; contingência do P6 com estimativa (plano B 2–3 dias ou balde compartilhado com monitoração) | A10, M2, P6, R7, resumo |
| MÉDIO-3 um IP esgota a cota | regra em todo `/api/*`, 10/10 s (86.400/dia por IP); texto "no grátis nenhuma regra protege a cota"; pesa na Decisão 2 | § 7.1, § 2.2 M3, D2, R2, resumo |
| MÉDIO-4 critério da M2 | um critério só, escrito antes de medir (zero 1102 + p99 ≤ 7 ms em 20 chamadas; entrega: zero 1102 em 5 frias) | § 3.3, M2, D2 |
| MÉDIO-5 ações do 3b fora da bancada | `ACOES`/`ACOES_PAINEL` exportadas (A5); a M1 falha sem caso para cada ação; teste confere a lista do painel contra o código; rotina diária com orçamento de subpedidos | A5, M1, A8 Step 4, R13 |
| MÉDIO-6 A9 resolve subpedidos, não CPU | teto pela CPU: 2 páginas por tabela de início, sobe só com a M1; RPC agregada como trabalho próprio se precisar | A9 |
| MÉDIO-7 resumo promete demais | resumo reescrito: D1 com o texto do revisor, Supabase pode não ter a opção (com o plano B), cartão do Zero Trust, cota | resumo |
| BAIXO-1 E2E "só Pix" no local | simulado usa `metodosDe(env, 'local')`; teste novo | A7 |
| BAIXO-2 `BZ_PLATAFORMA` na Vercel | ignorado quando `naVercel`; caso de teste | A1 |
| BAIXO-3 origem do `navigator.userAgent` | vem da data (`global_navigator`) | Global Constraints |
| BAIXO-4 `wrangler dev` lê `.env` | fumaça em pasta limpa | B7 Step 0 |
| BAIXO-5 caminho do cron no `wrangler dev` | os dois caminhos citados; o script tenta os dois | B7, R10 |
| BAIXO-6 versão do Wrangler | ler o changelog das Previews e considerar uma ≥ 2 semanas (ex.: 4.147.0) | B6 |
| BAIXO-7 orçamento da A8 | núcleo por execução, contador nunca no módulo, `SemOrcamento` relançado | A8 Step 3 |
| BAIXO-8 pago não é "sem limite" | `limits.cpu_ms: 100` na produção paga; frase na D2 e no resumo | D2, C2b |
| BAIXO-9 formato da URL de prévia | copiado da 1ª prévia real na M2 antes de fixar no C3 | M2, C3 |
| BAIXO-10 CGNAT | M2 anota os 429 do Auth; o dono ajusta o limite | M2 |
| BAIXO-11 cron com a cota esgotada | "se o cron rodar" | R2, § 2.2 M3 |
| Item 6: chave do "só Pix" | **`MP_METODOS`**, a mesma que o 3b adotou; A7 fica neste PR A | A7, R13 |

### 12.1 Rodada 3 (conferência do `3e18d94`)

| Achado | O que mudou | Onde |
|---|---|---|
| BAIXO-R3a "ou autoriza uma sessão a aplicar" | tirado: quem aplica é o dono, ele mesmo; o agente só entrega o texto | § 5.5 |
| MÉDIO-R3a a regra `ask` não pega escrita pelo terminal | a trava passa a ser a **confirmação do dono no `git push`** quando algum arquivo mudado em relação à `origin/main` for workflow, `cloudflare/`, `wrangler.jsonc` ou `package*.json`; o `ask` de Edit/Write fica só como 1º aviso | § 2.1 A1, § 4 D1, § 5.3, § 5.5, P2, B8 |
| BAIXO-R3b "teto que eu configuro" | o Workers Paid não tem teto de gasto; o `cpu_ms` limita cada pedido, não o total | § 4 D2, R2, resumo |
| BAIXO-R3c regra 10/10 s e o dono | P8 confere que o painel e o `scripts/direcoes.mjs` não passam de 10 em 10 s; **sem exceção** para `/api/painel` (reabriria a cota para um IP só); se passar, o cliente se ajusta (tarefa C3b) | § 7.1, P8, C3b |
| BAIXO-R3d tamanho do resumo | mantido (aceito pelo coordenador) | resumo |

