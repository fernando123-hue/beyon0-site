# Orçamento sem IA, PR 2b-1 — varredura na entrega, sessão isolada e os ajustes do PR 2a

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O que sai da fila manual para o cliente passa por uma varredura e pela leitura do dono. A sessão que lê o briefing roda numa lista do que é PERMITIDO (sem rede, sem ler fora da pasta). E as 10 pendências do PR 2a marcadas "PR 2b" ficam resolvidas.

**Architecture:**
- **Varredura:** um módulo puro (`scripts/varredura.mjs`), usado por `conferir` e por `planejarEntrega` em `scripts/direcoes.mjs`. O `entregar-pedido` mostra todo o texto e só entrega depois de o dono digitar ENTREGAR.
- **Sessão isolada:** o comando `pedido` grava, junto do `pedido.json`, a configuração da sessão (modo `dontAsk`, só o `conferir` liberado no Bash, leitura só na pasta). Ele também imprime a linha de comando do `claude`, que o dono roda.
- **Pendências do PR 2a:** uma migration nova e ajustes pequenos na API e nos testes.

**Tech Stack:** Node 24 (ESM, `node:test`), PGlite com as migrations reais (`docs/testes/_banco.mjs`), Claude Code CLI 2.1.269.

**Spec:** `docs/specs/2026-10-11-orcamento-sem-ia.md` §4 (a fila: "sessão ISOLADA", "`entregar-pedido` mostra ao dono tudo o que vai sair e recusa se achar URL, caminho de arquivo, chave (`sk-`, `eyJ`, base64/hex longos), e-mail ou telefone"). Pendências: `docs/revisoes/pr1-pendencias.md`, linhas `PR2a-*` com "PR 2b".

**Fica para o PR 2b-2 (plano próprio):** espera útil, link de retomada (com revisão de segurança própria) e o lembrete de 2 dias.

## Global Constraints

- Testes com `node --test <arquivos>` direto. O `npm` falha no Git Bash desta máquina. O Git Bash às vezes dá `fork: Permission denied`: basta repetir o comando.
- Suíte inteira: o comando `testar` de `package.json`, rodado com `node --test` e a mesma lista de arquivos.
- Commits em português, no formato `<tipo>: <descrição>`, explicando o PORQUÊ, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- TDD: o teste novo é visto falhando antes da mudança, e a mensagem da falha vai para o relatório da tarefa.
- Nada de dado inventado nem segredo em arquivo. A chave do painel nunca aparece num arquivo nem num teste.
- Código e comentários seguem o estilo do arquivo: comentários `/* ... */` em português, explicando o porquê.
- Branch: `orcamento-pr2b1`, a partir de `origin/main`.

---

### Task 1: Varredura do que sai da fila manual

**Files:**
- Create: `scripts/varredura.mjs`
- Modify: `scripts/direcoes.mjs` (`planejarEntrega`, comandos `conferir` e `entregar-pedido`)
- Test: `docs/testes/fila-direcoes.test.mjs` (acrescentar no fim)

**Interfaces:**
- Produces: `textosDe(valor, caminho = '') → Array<{ caminho: string, texto: string }>` (toda string de um objeto, com o caminho, ex. `secoes[2].itens[0].texto`); `varrer(direcao) → Array<{ caminho: string, tipo: string, trecho: string }>` (vazio = limpo; `tipo` é um de `'endereço de site'`, `'caminho de arquivo'`, `'chave'`, `'e-mail'`, `'telefone'`; `trecho` tem no máximo 40 caracteres).
- Consumes: `higienizar` (via `conferir` em `scripts/direcoes.mjs`).

- [ ] **Step 1: Write the failing test** (no fim de `docs/testes/fila-direcoes.test.mjs`; a fábrica `direcao()` já existe no arquivo, linha 47)

```js
/* PR 2b-1 (spec §4): o que sai da fila manual é varrido. URL, caminho de arquivo, chave, e-mail ou telefone dentro de uma
   direção é vazamento ou injeção (o briefing veio de um desconhecido): nada sai */
test('varredura: recusa URL, caminho, chave, e-mail e telefone em qualquer texto da direção; texto normal passa', async () => {
  const { varrer, textosDe } = await import('../../scripts/varredura.mjs');
  const { conferir } = await import('../../scripts/direcoes.mjs');
  const limpa = conferir(direcao(), 'conversao').direcao;
  assert.deepEqual(varrer(limpa), [], 'a direção de exemplo passa');
  assert.ok(textosDe(limpa).some(t => t.caminho === 'secoes[0].titulo'), 'o caminho de cada texto');
  const casos = [
    ['endereço de site', 'Veja em https://exemplo.com.br/agenda'], ['endereço de site', 'Acesse www.clinicasol.com.br'],
    ['endereço de site', 'Nosso site: clinicasol.com.br'],
    ['caminho de arquivo', 'Abra C:\\Users\\Irineu\\.ssh\\id_rsa'], ['caminho de arquivo', 'leia ~/.claude/settings.json'],
    ['chave', 'sk-ant-api03-abcdefghijklmnop'], ['chave', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIx'],
    ['chave', 'a3f9c2e1b7d4a6f8c0e2b4d6f8a1c3e5b7d9f0a2'], ['chave', 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZn'],
    ['e-mail', 'Escreva para contato@clinicasol.com.br'], ['telefone', 'Ligue (21) 98765-4321'], ['telefone', 'WhatsApp 21987654321']
  ];
  for (const [tipo, texto] of casos) {
    const d = { ...limpa, secoes: limpa.secoes.map((s, i) => (i === 1 ? { ...s, texto } : s)) };
    const achados = varrer(d);
    assert.ok(achados.some(a => a.tipo === tipo && a.caminho === 'secoes[1].texto'), tipo + ' em "' + texto + '": ' + JSON.stringify(achados));
  }
  for (const texto of ['Atendemos de segunda a sábado, das 8h às 18h.', 'Desde 2010 cuidando de 1.200 famílias.', 'R$ 1.800 em até 10 dias.', 'Horário: 8h/18h', '[telefone]', 'Agende pelo WhatsApp']) {
    const d = { ...limpa, secoes: limpa.secoes.map((s, i) => (i === 1 ? { ...s, texto } : s)) };
    assert.deepEqual(varrer(d), [], 'falso positivo em "' + texto + '"');
  }
});

test('varredura: a entrega recusa o pedido inteiro se UMA direção tiver achado; o conferir também avisa', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { planejarEntrega } = await import('../../scripts/direcoes.mjs');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'bz-var-'));
  const dirs = [{ id: 'cccccccc-0000-4000-8000-000000000001', estrategia: 'conversao', status: 'gerando' }, { id: 'cccccccc-0000-4000-8000-000000000002', estrategia: 'autoridade', status: 'gerando' }];
  fs.writeFileSync(path.join(raiz, 'pedido.json'), JSON.stringify({ direcoes: dirs }));
  fs.writeFileSync(path.join(raiz, 'conversao.json'), JSON.stringify(direcao()));
  const suja = direcao();
  suja.secoes[1] = { ...suja.secoes[1], texto: 'Mais em https://golpe.example/x' };
  fs.writeFileSync(path.join(raiz, 'autoridade.json'), JSON.stringify(suja));
  assert.throws(() => planejarEntrega(raiz), /autoridade\.json recusado pela varredura: endereço de site em secoes\[1\]\.texto/);
  fs.rmSync(raiz, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="varredura" docs/testes/fila-direcoes.test.mjs`
Expected: FAIL com `Cannot find module` em `scripts/varredura.mjs` (1º teste); depois de criar o módulo, o 2º falha porque `planejarEntrega` não varre.

- [ ] **Step 3: Write minimal implementation**

`scripts/varredura.mjs`:

```js
/* ==========================================================================
   A VARREDURA do que sai da fila manual (spec docs/specs/2026-10-11-orcamento-sem-ia.md §4). Uma direção é só texto
   de site (nome, títulos, itens): nela não cabe endereço de site, caminho de arquivo, chave, e-mail nem telefone. Se
   um aparecer, é vazamento (o modelo copiou algo da máquina) ou injeção (o briefing veio de um desconhecido), e nada
   sai. O contato do cliente entra no site depois, pelo dono, nunca por aqui.
   ========================================================================== */
const PADROES = [
  ['endereço de site', /\bhttps?:\/\/|\bwww\.|\b[a-z0-9][a-z0-9-]*\.(?:com\.br|com|net|org|io|app|dev|site|br)\b/i],
  ['caminho de arquivo', /\b[a-z]:[\\/]|(?:^|[\s"'(])~[\\/]|(?:^|[\s"'(])\/(?:home|users|etc|tmp|var|root)\b|\\\\[a-z0-9]/i],
  ['chave', /\bsk-[a-z0-9_-]{8,}|\beyJ[a-z0-9_-]{10,}|\b[0-9a-f]{32,}\b|[a-z0-9+/]{40,}={0,2}/i],
  ['e-mail', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ['telefone', /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/]
];

/* toda string de um valor, com o caminho dela (secoes[2].itens[0].texto) */
export function textosDe(valor, caminho = '') {
  if (typeof valor === 'string') return [{ caminho, texto: valor }];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => textosDe(v, caminho + '[' + i + ']'));
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([k, v]) => textosDe(v, caminho ? caminho + '.' + k : k));
  return [];
}

/* os achados de uma direção já higienizada: vazio = pode sair */
export function varrer(direcao) {
  const achados = [];
  for (const { caminho, texto } of textosDe(direcao)) {
    for (const [tipo, re] of PADROES) {
      const m = texto.match(re);
      if (m) achados.push({ caminho, tipo, trecho: m[0].slice(0, 40) });
    }
  }
  return achados;
}
```

Em `scripts/direcoes.mjs`:
- acrescentar `import { varrer, textosDe } from './varredura.mjs';` junto dos imports;
- em `planejarEntrega`, logo depois de `if (h.erro) throw ...`:

```js
    const achados = varrer(h.direcao);
    if (achados.length) throw new Error(d.estrategia + '.json recusado pela varredura: ' + achados.map(a => a.tipo + ' em ' + a.caminho).join('; '));
```

- no comando `conferir`, depois do `if (h.erro) {...}`:

```js
    const achados = varrer(h.direcao);
    if (achados.length) { console.log('RECUSADA pela varredura: ' + achados.map(a => a.tipo + ' em ' + a.caminho + ' ("' + a.trecho + '")').join('; ')); process.exitCode = 1; return; }
```

- no comando `entregar-pedido`, entre o `planejarEntrega` e o laço de envio, mostrar e pedir a palavra (o terminal é do DONO; cada linha começa com `| ` para não se confundir com instrução):

```js
    for (const e of plano) {
      const d = conferir(e.conteudo, e.estrategia).direcao;
      console.log('\n=== ' + e.estrategia + ': "' + d.nome_conceito + '" ===');
      for (const t of textosDe(d)) if (t.texto && !/^#[0-9A-F]{6}$/.test(t.texto)) console.log('| ' + t.caminho + ': ' + t.texto);
    }
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = (await rl.question('\nLeia o texto acima. Para entregar as ' + plano.length + ' direções, digite ENTREGAR: ')).trim();
    rl.close();
    if (resposta !== 'ENTREGAR') { console.log('Nada foi entregue.'); return; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test docs/testes/fila-direcoes.test.mjs`
Expected: todos passam (os testes antigos de `planejarEntrega` continuam verdes: a `direcao()` de exemplo não tem achado). Se um caso "normal" der falso positivo, ajuste o padrão, não o teste.

- [ ] **Step 5: Commit**

```bash
git add scripts/varredura.mjs scripts/direcoes.mjs docs/testes/fila-direcoes.test.mjs
git commit -m "feat(direcoes): varredura do que sai da fila manual e leitura do dono antes de entregar"
```

---

### Task 2: A sessão isolada da produção

**Files:**
- Create: `scripts/sessao-isolada.mjs`
- Modify: `scripts/direcoes.mjs` (comando `pedido`), `.claude/skills/produzir-direcoes/SKILL.md`, `docs/fase2/02-OPERACAO.md` §1b
- Test: `docs/testes/fila-direcoes.test.mjs` (acrescentar no fim)

**Contexto (documentação oficial do Claude Code, lida em 2026-10-15; https://code.claude.com/docs/en/permissions.md, permission-modes.md, cli-reference.md, sandboxing.md):**
- No Windows nativo NÃO há sandbox de sistema para o Bash ("On native Windows, Claude Code runs commands unsandboxed").
- O isolamento vem de uma lista do que é PERMITIDO:
  - `--permission-mode dontAsk` nega tudo o que pediria permissão;
  - `allow` só para escrever na pasta e para o `conferir`;
  - `blockReadsOutsideWorkingDirectories` recusa leitura fora da pasta de trabalho;
  - os comandos "só leitura" do Bash, que rodam sem pedir, levam `deny` explícito;
  - `--restricted` carrega só o `--settings` e confina as ferramentas de arquivo;
  - `--tools` limita as ferramentas nativas e `--disallowedTools` tira WebFetch, WebSearch e MCP do contexto.
- Regras de caminho: `//c/...` é absoluto; `./` é relativo à pasta de trabalho. Deny sempre vence allow.
- Limite documentado: o próprio `node .../direcoes.mjs conferir` roda sem sandbox. Ele só lê o arquivo que recebe e não abre rede.

**Interfaces:**
- Produces:
  - `configSessao({ repo }) → object`: o settings da sessão. `repo` é o caminho do repositório, como `fileURLToPath` devolve.
  - `caminhoClaude(caminhoWindows) → string`: `C:\a\b` → `//c/a/b`.
  - `comandoSessao({ pasta, settings, instrucoes }) → string`: a linha que o dono roda no PowerShell.
- Consumes: `PASTA`, `idCurto` e `montarArquivoPedido` de `scripts/direcoes.mjs`.

- [ ] **Step 1: Write the failing test**

```js
/* PR 2b-1 (spec §4): a sessão que lê o briefing roda numa lista do que é PERMITIDO: sem rede, sem MCP, Bash só para o
   conferir, escrita só na pasta do pedido, leitura fora da pasta recusada */
test('sessão isolada: settings em dontAsk, só o conferir no Bash, sem rede e sem ler fora da pasta; o comando usa --restricted', async () => {
  const { configSessao, caminhoClaude, comandoSessao } = await import('../../scripts/sessao-isolada.mjs');
  assert.equal(caminhoClaude('C:\\Vault - Fernando\\Beyon Zero\\x'), '//c/Vault - Fernando/Beyon Zero/x');
  const c = configSessao({ repo: 'C:\\Vault - Fernando\\Beyon Zero\\03 Projetos\\site' });
  assert.equal(c.permissions.defaultMode, 'dontAsk');
  assert.equal(c.permissions.blockReadsOutsideWorkingDirectories, true);
  assert.equal(c.permissions.disableBypassPermissionsMode, 'disable');
  assert.deepEqual(c.permissions.allow, ['Edit(./**)', 'Bash(node "C:/Vault - Fernando/Beyon Zero/03 Projetos/site/scripts/direcoes.mjs" conferir *)'], 'nada além de escrever na pasta e conferir');
  for (const r of ['WebFetch', 'WebSearch', 'mcp__*', 'Edit(./.sessao.json)', 'Edit(./.instrucoes.md)', 'Read(//c/Vault - Fernando/Beyon Zero/03 Projetos/site/**)', 'Bash(cat *)', 'Bash(curl *)', 'Bash(node -e *)'])
    assert.ok(c.permissions.deny.includes(r), 'deny sem ' + r);
  assert.ok(!c.permissions.allow.some(r => /fila|pedido|entregar|limpar/.test(r)), 'os comandos com a chave do painel nunca ficam liberados');
  const cmd = comandoSessao({ pasta: 'C:\\Users\\x\\BeyonZero-direcoes\\1234abcd', settings: 'C:\\Users\\x\\BeyonZero-direcoes\\1234abcd\\.sessao.json', instrucoes: 'C:\\Users\\x\\BeyonZero-direcoes\\1234abcd\\.instrucoes.md' });
  for (const parte of ["Set-Location -LiteralPath 'C:\\Users\\x\\BeyonZero-direcoes\\1234abcd'", '--restricted', '--permission-mode dontAsk', '--strict-mcp-config', "--tools 'Read,Edit,Write,Bash'", "--disallowedTools 'WebFetch' 'WebSearch' 'mcp__*'", "--settings 'C:\\Users\\x\\BeyonZero-direcoes\\1234abcd\\.sessao.json'", "--append-system-prompt-file 'C:\\Users\\x\\BeyonZero-direcoes\\1234abcd\\.instrucoes.md'"])
    assert.ok(cmd.includes(parte), 'comando sem ' + parte + ': ' + cmd);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="sessão isolada" docs/testes/fila-direcoes.test.mjs`
Expected: FAIL com `Cannot find module` em `scripts/sessao-isolada.mjs`.

- [ ] **Step 3: Write minimal implementation**

`scripts/sessao-isolada.mjs`:

```js
/* ==========================================================================
   A SESSÃO ISOLADA que produz as direções (spec §4). O briefing veio de um desconhecido: a sessão do Claude Code que o
   lê roda numa lista do que é PERMITIDO, não numa lista de proibições (a documentação diz que um deny de Bash "não é
   fronteira de segurança": o mesmo programa entra por outro caminho). No Windows nativo não há sandbox de sistema, então
   o isolamento é este: dontAsk (o que não está liberado é negado sem perguntar), leitura só na pasta do pedido, escrita
   só nela, Bash só para o conferir, sem rede e sem MCP. Fontes: code.claude.com/docs/en/permissions.md,
   permission-modes.md, cli-reference.md, sandboxing.md (lidas em 2026-10-15).
   ========================================================================== */
/* os comandos "só leitura" rodam sem pedir em qualquer modo (lista fixa da documentação): deny explícito */
const SO_LEITURA = ['ls', 'cat', 'echo', 'pwd', 'head', 'tail', 'grep', 'find', 'wc', 'which', 'diff', 'stat', 'du', 'cd', 'git', 'type', 'more', 'less', 'dir', 'tree', 'file', 'sort', 'uniq', 'cut', 'awk', 'sed'];
/* rede e execução por outro caminho (o dontAsk já nega; o deny deixa o motivo explícito no registro da sessão) */
const REDE_E_ATALHOS = ['curl', 'wget', 'node -e', 'node --eval', 'node -p', 'node --print', 'npx', 'npm', 'powershell', 'pwsh', 'cmd', 'bash', 'sh', 'ssh', 'scp', 'gh', 'infisical', 'printenv', 'env', 'set', 'export'];

export const caminhoClaude = p => '//' + String(p).replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l) => l.toLowerCase());
const barras = p => String(p).replace(/\\/g, '/');

export function configSessao({ repo }) {
  const script = barras(repo) + '/scripts/direcoes.mjs';
  return {
    permissions: {
      defaultMode: 'dontAsk',
      disableBypassPermissionsMode: 'disable',
      blockReadsOutsideWorkingDirectories: true,
      allow: ['Edit(./**)', 'Bash(node "' + script + '" conferir *)'],
      deny: [
        'WebFetch', 'WebSearch', 'mcp__*',
        /* a sessão escreve na pasta, mas não na própria configuração nem nas instruções (deny vence o Edit(./**)) */
        'Edit(./.sessao.json)', 'Edit(./.instrucoes.md)',
        'Read(' + caminhoClaude(repo) + '/**)', 'Read(~/.claude/**)', 'Read(~/.ssh/**)', 'Read(~/.config/**)',
        ...SO_LEITURA.flatMap(c => ['Bash(' + c + ')', 'Bash(' + c + ' *)']),
        ...REDE_E_ATALHOS.flatMap(c => ['Bash(' + c + ')', 'Bash(' + c + ' *)'])
      ]
    }
  };
}

/* a linha que o DONO roda no PowerShell, na pasta do pedido (aspas simples: o PowerShell não expande nada dentro) */
const ps = s => "'" + String(s).replace(/'/g, "''") + "'";
export function comandoSessao({ pasta, settings, instrucoes }) {
  return 'Set-Location -LiteralPath ' + ps(pasta) + '; claude --restricted --permission-mode dontAsk --strict-mcp-config'
    + " --tools 'Read,Edit,Write,Bash' --disallowedTools 'WebFetch' 'WebSearch' 'mcp__*'"
    + ' --settings ' + ps(settings) + ' --append-system-prompt-file ' + ps(instrucoes)
    + " 'Produza as três direções do pedido.json desta pasta, seguindo as instruções da sessão.'";
}
```

Em `scripts/direcoes.mjs`, no comando `pedido`, depois de gravar o `pedido.json`:

```js
    /* a sessão isolada (PR 2b-1): settings e instruções DENTRO da pasta do pedido (a sessão lê só ali), e a linha pronta */
    const { configSessao, comandoSessao } = await import('./sessao-isolada.mjs');
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const settings = path.join(dir, '.sessao.json'), instrucoes = path.join(dir, '.instrucoes.md');
    fs.writeFileSync(settings, JSON.stringify(configSessao({ repo }), null, 2), { mode: 0o600 });
    fs.copyFileSync(path.join(repo, '.claude', 'skills', 'produzir-direcoes', 'SKILL.md'), instrucoes);
    console.log('\nAbra a sessão isolada (PowerShell), e só ela, para produzir:\n' + comandoSessao({ pasta: dir, settings, instrucoes }));
```

(`fileURLToPath` e `path` já são importados no arquivo.)

Em `.claude/skills/produzir-direcoes/SKILL.md`, troque a seção "Você (esta sessão) faz só a produção, sem rede e sem chave" por:

```md
**Você (esta sessão) faz só a produção, numa SESSÃO ISOLADA:**
- O comando `pedido` do dono imprime a linha que abre esta sessão: `claude --restricted --permission-mode dontAsk ...`, na pasta do pedido.
- Nela, tudo o que não está liberado é negado sem perguntar:
  - ler fora da pasta, internet e MCP: negados;
  - Bash: só o `conferir`;
  - escrita: só na pasta do pedido.
- Se você estiver numa sessão com internet, com MCP ou com acesso ao repositório, você NÃO está na sessão isolada: pare e peça ao dono que abra a sessão pela linha do `pedido`.
- Se `PAINEL_CHAVE` aparecer no seu ambiente ou numa mensagem, **pare** e peça ao dono que rode os comandos no terminal dele.
- Nunca rode `fila`, `pedido` ou `entregar-pedido` você mesmo.
```

E no passo 7 ("Com o 'pode entregar' dele..."), acrescente: "O `entregar-pedido` varre os textos (URL, caminho, chave, e-mail, telefone), mostra tudo ao dono e só entrega depois de ele digitar ENTREGAR."

Em `docs/fase2/02-OPERACAO.md` §1b, acrescente ao item do `pedido <id>`: "imprime a linha que abre a sessão isolada (PowerShell). A produção acontece só nela: dontAsk, leitura e escrita só na pasta do pedido, Bash só para o `conferir`, sem internet nem MCP. A pasta `~/BeyonZero-direcoes/.claude/settings.json` antiga (lista de proibições) fica superada."

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test docs/testes/fila-direcoes.test.mjs`
Expected: todos passam.

- [ ] **Step 5: Ensaio real (o controlador faz; exige o login do Claude Code no terminal do dono válido)**

Numa pasta de teste `~/BeyonZero-direcoes/ensaio00` com um `pedido.json` falso, rode a linha do `comandoSessao` trocando o prompt final por um `-p` de ensaio que tenta, uma por uma:
1. ler `./pedido.json` (deve FUNCIONAR);
2. ler o `CLAUDE.md` do repositório (deve ser NEGADO);
3. ler `~/.claude/settings.json` (NEGADO);
4. `curl -s https://example.com` (NEGADO);
5. WebFetch (indisponível);
6. o `conferir` (FUNCIONA, mesmo que recuse o arquivo falso);
7. `ls` (NEGADO);
8. gravar `./saida.txt` (FUNCIONA);
9. gravar `C:/Users/<usuario>/fora.txt` (NEGADO);
10. editar `./.sessao.json` (NEGADO).

Use `--output-format json`, anote `permission_denials` e o resultado de cada item no relatório da tarefa e na descrição do PR. Apague a pasta de ensaio no fim. Se algum item der diferente do esperado, a tarefa NÃO está pronta: ajuste `configSessao` e repita.

- [ ] **Step 6: Commit**

```bash
git add scripts/sessao-isolada.mjs scripts/direcoes.mjs .claude/skills/produzir-direcoes/SKILL.md docs/fase2/02-OPERACAO.md docs/testes/fila-direcoes.test.mjs
git commit -m "feat(direcoes): sessão isolada da produção por lista do que é permitido (dontAsk, sem rede, só a pasta)"
```

---

### Task 3: Banco — trava em ordem, teto na estimativa, leitura sem trava

**Files:**
- Create: `supabase/migrations/20261015120000_pr2b_ajustes.sql`
- Test: `docs/testes/pedidos-banco.test.mjs` (acrescentar no fim)

**Interfaces:**
- Consumes: as funções `app.vendas_mudar_pedido`, `app.vendas_registrar_estimativa` e `app.vendas_conversa_dono` como estão hoje (migrations `20261013120100_pedidos_dono.sql:71`, `20261007120100_vendas_funcoes.sql:116` e `20261013120000_pedidos.sql:143`); os ajudantes `rpc`, `comPacote`, `erroDe` e `um` de `pedidos-banco.test.mjs`.
- Produces: as mesmas assinaturas, com os 3 ajustes.

- [ ] **Step 1: Write the failing test**

```js
/* PR 2b-1, pendências PR2a-teto-pacotes, PR2a-ordem-trava, PR2a-dono-leitura e PR2a-testes-borda */
test('estimativa (o caminho do consultor): o mesmo teto de 30 pacotes por conversa das respostas', async () => {
  const b = await comPacote();   /* (já gravou 1) */
  for (let i = 0; i < 29; i++) await rpc('vendas_registrar_estimativa', { ...b, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 });
  assert.equal((await erroDe(rpc('vendas_registrar_estimativa', { ...b, regras_id: REGRAS, fatores: { formato: 'institucional' }, valor_total: 3950, sinal: 1975, prazo_dias: 9 })))?.codigo, REGRA, 'a 31ª é recusada');
});

test('trava das direções em ordem fixa (sem espera circular) e a consulta leve do dono sem trava', async () => {
  const fonte = async nome => (await um("select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = $1", [nome])).prosrc;
  assert.match(await fonte('vendas_mudar_pedido'), /order by d\.id\s+for update of d/i, 'PR2a-ordem-trava');
  const dono = await fonte('vendas_conversa_dono');
  assert.doesNotMatch(dono, /for update|conversa_do\(/i, 'PR2a-dono-leitura: a leitura não trava a conversa');
  const b = await comPacote();
  assert.equal((await rpc('vendas_conversa_dono', { ...b, etapas: ['estimativa'] })).etapa, 'estimativa', 'continua funcionando');
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, visitante_id: randomUUID(), etapas: ['estimativa'] })))?.codigo, NAO_ACHOU, 'outro visitante');
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, etapas: ['contato'] })))?.codigo, ETAPA, 'etapa fora da lista');
});

test('bordas das funções do PR 2a (PR2a-testes-borda): outro visitante ou organização → P0002; entrada inválida → 22023', async () => {
  const b = await comPacote();
  assert.equal((await erroDe(rpc('vendas_registrar_respostas', { ...b, visitante_id: randomUUID(), briefing: {}, confianca: 0 })))?.codigo, NAO_ACHOU);
  assert.equal((await erroDe(rpc('vendas_conversa_dono', { ...b, etapas: { estimativa: true } })))?.codigo, INVALIDO, 'etapas que não são lista');
  assert.equal((await erroDe(rpc('vendas_mudar_pedido', { org_slug: 'outra', conversa_id: b.conversa_id, acao: 'arquivar' })))?.codigo, NAO_ACHOU);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="teto de 30|ordem fixa|bordas das funções" docs/testes/pedidos-banco.test.mjs`
Expected:
- o teto falha porque a 31ª estimativa é aceita;
- a ordem falha com `does not match /order by d\.id/`;
- a de bordas pode já passar. Anote quais passaram: são testes que faltavam, não comportamento novo.

- [ ] **Step 3: Write minimal implementation**

`supabase/migrations/20261015120000_pr2b_ajustes.sql`:

```sql
-- PR 2b-1: os ajustes das revisões do PR 2a (docs/revisoes/pr1-pendencias.md, linhas PR2a-*). As três são substituições
-- compatíveis com o código da promoção anterior: mesma assinatura, mesmo retorno (docs/revisoes/pr1-pendencias.md §6).

-- PR2a-ordem-trava: as direções travadas sempre em ordem de id (duas travas da mesma conversa em ordens diferentes
-- esperavam uma pela outra: 40P01)
create or replace function app.vendas_mudar_pedido(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; pd app.pedidos; v_acao text := p ->> 'acao'; v_status text;
begin
  if v_acao is null or v_acao not in ('descartar', 'arquivar') then raise exception 'ação inválida' using errcode = '22023'; end if;
  -- a mesma ordem de travas de vendas_concluir_direcao (direções, depois a conversa), e as direções por id: sem espera
  -- circular (40P01). A organização é conferida aqui também, para não travar direção de outra organização
  perform 1 from app.direcoes d join app.conversas cv on cv.id = d.conversa_id join app.organizacoes o on o.id = cv.org_id
   where d.conversa_id = (p ->> 'conversa_id')::uuid and o.slug = p ->> 'org_slug' order by d.id for update of d;
  c := privado.conversa_da_org(p ->> 'org_slug', (p ->> 'conversa_id')::uuid);
  -- descartar só antes do resumo (depois disso há proposta e pagamento); arquivar em qualquer etapa depois do contato
  perform privado.exigir_etapa(c, case when v_acao = 'descartar'
    then array['contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes']
    else array['contato', 'gerando', 'direcoes', 'escolhida', 'alteracoes', 'escopo', 'aguardando_pagamento', 'em_producao', 'encerrada'] end);
  select * into pd from app.pedidos where conversa_id = c.id for update;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  if v_acao = 'arquivar' and pd.status <> 'confirmado' then raise exception 'só se arquiva pedido confirmado' using errcode = '23514'; end if;
  if v_acao = 'descartar' and pd.status not in ('aguardando', 'confirmado') then raise exception 'pedido já encerrado' using errcode = '23514'; end if;
  v_status := case v_acao when 'descartar' then 'descartado' else 'arquivado' end;
  update app.pedidos set status = v_status, encerrado_em = now() where id = pd.id;
  -- encerrado por qualquer das duas ações, o pedido não pode deixar direções órfãs em "gerando"
  perform privado.parar_geracao(c.id, case v_acao when 'descartar' then 'pedido descartado' else 'pedido arquivado' end);
  if v_acao = 'descartar' then
    perform privado.evento(c.org_id, c.id, 'pedido_descartado');
  end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- PR2a-teto-pacotes: o caminho do consultor (estimar) com o mesmo teto de 30 pacotes por conversa das respostas
create or replace function app.vendas_registrar_estimativa(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_regras app.regras_comerciais; v_id uuid;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes']);
  if (select count(*) from app.estimativas e where e.conversa_id = c.id) >= 30 then
    raise exception 'limite de pacotes desta conversa' using errcode = '23514';
  end if;
  -- só a tabela ATIVA, aprovada pelo dono, gera estimativa para visitante
  select * into v_regras from app.regras_comerciais where id = (p ->> 'regras_id')::uuid and org_id = c.org_id and status = 'ativa';
  if not found then raise exception 'regras comerciais ativas não encontradas' using errcode = '55000'; end if;
  insert into app.estimativas (org_id, conversa_id, regras_id, fatores, valor_total, sinal, prazo_dias, fase, detalhes)
  values (c.org_id, c.id, v_regras.id, p -> 'fatores', (p ->> 'valor_total')::numeric, (p ->> 'sinal')::numeric,
          (p ->> 'prazo_dias')::integer, coalesce(p ->> 'fase', 'unica'), coalesce(p -> 'detalhes', '{}'))
  returning id into v_id;
  if c.etapa = 'descoberta' then update app.conversas set etapa = 'estimativa', ultima_atividade = now() where id = c.id; end if;
  perform privado.evento(c.org_id, c.id, 'estimativa_mostrada', jsonb_build_object('valor_total', (p ->> 'valor_total')::numeric, 'fase', coalesce(p ->> 'fase', 'unica')));
  return jsonb_build_object('estimativa_id', v_id);
end $$;

-- PR2a-dono-leitura: a consulta LEVE só lê; sem FOR UPDATE ela não espera atrás de quem grava
create or replace function app.vendas_conversa_dono(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_etapas text[];
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  select coalesce(array_agg(x), '{}') into v_etapas from jsonb_array_elements_text(coalesce(p -> 'etapas', '[]')) x;
  perform privado.exigir_etapa(c, v_etapas);   -- (lista vazia: nenhuma etapa vale, fecha)
  return jsonb_build_object('etapa', c.etapa,
    'estimativa', (select jsonb_build_object('regras_id', e.regras_id, 'fatores', e.fatores)
                   from app.estimativas e where e.conversa_id = c.id order by e.created_at desc limit 1));
end $$;
```

ANTES de colar: confira, com `git show origin/main:<migration>`, que os corpos de hoje de `vendas_mudar_pedido` e `vendas_registrar_estimativa` são exatamente os de cima menos o ajuste. Se uma migration posterior tiver mudado a função, parta do corpo mais novo. `create or replace` mantém os `grant`/`revoke` que já existem.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test docs/testes/pedidos-banco.test.mjs docs/testes/vendas-banco.test.mjs docs/testes/fluxo-api.test.mjs`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261015120000_pr2b_ajustes.sql docs/testes/pedidos-banco.test.mjs
git commit -m "fix(banco): trava das direções em ordem, teto de pacotes na estimativa e consulta leve sem trava"
```

---

### Task 4: API e testes — os ajustes pequenos do PR 2a

**Files:**
- Modify: `api/_vendas/fluxo.mjs:52-69` (`traduzirErro`), `api/_vendas/fluxo-pedido.mjs:62-65`, `api/_vendas/regras-ativas.mjs:30`, `api/painel.mjs:142`, `docs/testes/_pedido.mjs`, `docs/testes/detalhes-api.test.mjs:33`, `docs/testes/fila-direcoes.test.mjs:64` e `:174`, `docs/testes/pedidos-banco.test.mjs:41`, `docs/superpowers/plans/2026-10-13-orcamento-sem-ia-pr2a.md:45`, `docs/revisoes/pr1-pendencias.md`
- Test: `docs/testes/api.test.mjs` (ou o arquivo que já testa `traduzirErro`; procure com `grep -rn traduzirErro docs/testes`)

**Interfaces:**
- Produces:
  - `recusaDoMotivo(r) → Recusa`, exportada de `api/_vendas/fluxo-pedido.mjs`. Ela loga o motivo desconhecido antes do 409.
  - `telefoneDeTeste() → '(21) 9XXXX-XXXX'` e `telefoneE164DeTeste() → '+55219XXXXXXXX'`, em `docs/testes/_pedido.mjs`, com a mesma sequência.

- [ ] **Step 1: Write the failing tests**

```js
/* PR 2b-1, PR2a-22P02: parâmetro malformado que chega ao banco é 400, não 500 */
test('traduzirErro: 22P02 (texto que não converte) vira 400 "Dados inválidos."', async () => {
  const { traduzirErro } = await import('../../api/_vendas/fluxo.mjs');
  const { ErroBanco } = await import('../../api/_vendas/transporte.mjs');
  const r = traduzirErro(new ErroBanco('22P02', 'invalid input syntax for type uuid'));
  assert.equal(r?.status, 400);
  assert.equal(r?.message, 'Dados inválidos.');
});

/* PR2a-motivo-log: motivo que o servidor não conhece vira 409, mas com log (antes sumia) */
test('detalhes: motivo desconhecido do banco vira o 409 de "só uma vez" com log do motivo', async () => {
  const { recusaDoMotivo } = await import('../../api/_vendas/fluxo-pedido.mjs');
  const logs = [], original = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const r = recusaDoMotivo({ ok: false, motivo: 'motivo_novo' });
    assert.equal(r.status, 409);
    assert.ok(logs.some(l => l.includes('motivo_novo')), 'o motivo aparece no log: ' + logs.join(' | '));
    logs.length = 0;
    assert.equal(recusaDoMotivo({ ok: false, motivo: 'fila_cheia' }).status, 503);
    assert.equal(logs.length, 0, 'motivo conhecido não loga');
  } finally { console.error = original; }
});
```

Em `docs/testes/fila-direcoes.test.mjs:174`, troque `assert.equal(f.corpo.truncada, f.corpo.total > f.corpo.fila.length);` por:

```js
  assert.equal(f.corpo.truncada, undefined, 'PR2a-truncada: a fila não corta, o campo saiu');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern="22P02|motivo desconhecido" docs/testes/<arquivo do traduzirErro> docs/testes/detalhes-api.test.mjs` e `node --test docs/testes/fila-direcoes.test.mjs`
Expected:
- o 22P02 falha com `r` nulo;
- o do motivo falha porque `recusaDoMotivo` não existe;
- o da fila falha porque o campo `truncada` ainda vem na resposta.

- [ ] **Step 3: Write minimal implementation**

`api/_vendas/fluxo.mjs`, dentro de `if (e instanceof ErroBanco)`, logo depois da linha do `22023`:

```js
    /* (PR2a-22P02) texto que não converte (uuid, número) no banco: entrada inválida, não erro interno */
    if (e.codigo === '22P02') return new Recusa(400, 'Dados inválidos.');
```

`api/_vendas/fluxo-pedido.mjs`: acima de `criarAcoesDoPedido`:

```js
/* a recusa de um motivo do banco; motivo que este servidor não conhece (migration à frente do código) vira o 409 de
   "só uma vez", com log, para não sumir (PR2a-motivo-log) */
export function recusaDoMotivo(r) {
  const motivo = String(r && r.motivo);
  if (!Object.hasOwn(MOTIVOS, motivo)) console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', evento: 'detalhes: motivo desconhecido', motivo: motivo.slice(0, 40) }));
  const m = Object.hasOwn(MOTIVOS, motivo) ? MOTIVOS[motivo] : MOTIVOS.ja_enviado;
  return new Recusa(m.status, m.texto, m.extra);
}
```

e troque as linhas 62-65 por:

```js
      if (!r || r.ok !== true) throw recusaDoMotivo(r);
```

`api/_vendas/regras-ativas.mjs:30`: troque `versao: r.versao ?? null` por `regras_id: r.id ?? null` (PR2a-log-versao: a linha vem com `id`).

`api/painel.mjs:142`: troque por:

```js
    return json({ fila, total, alarme: total >= PEDIDOS.fila_confirmados });
```

(o `truncada` dos pendentes, na linha 199, continua: lá há corte.)

`docs/testes/_pedido.mjs`: troque a linha do `telefoneDeTeste` por:

```js
/* um WhatsApp novo a cada chamada, de uma sequência só para todo o arquivo de teste (o freio por telefone vale nos
   testes também; PR2a-testes-nomes: antes eram três geradores) */
const proximo = () => String(10000000 + (++seq));
export const telefoneDeTeste = () => { const n = proximo(); return '(21) 9' + n.slice(0, 4) + '-' + n.slice(4); };
export const telefoneE164DeTeste = () => '+55219' + proximo();
```

- Em `docs/testes/detalhes-api.test.mjs`:
  - apague a linha 33 (`const telefone = () => ...`);
  - importe `telefoneDeTeste` de `./_pedido.mjs` (junto do que já importa de lá, ou numa linha nova);
  - troque as chamadas `telefone()` por `telefoneDeTeste()`.
- Em `docs/testes/fila-direcoes.test.mjs`:
  - apague a linha 64 (`const telefoneNovo = ...`);
  - importe `telefoneDeTeste` de `./_pedido.mjs` (já importa `LIMITES_DE_TESTE` de lá, linha 15);
  - troque `telefoneNovo()` por `telefoneDeTeste()`.
- Em `docs/testes/pedidos-banco.test.mjs`:
  - apague a linha 41 (`const telefoneNovo = ...`);
  - acrescente `import { telefoneE164DeTeste } from './_pedido.mjs';`;
  - troque `telefoneNovo()` por `telefoneE164DeTeste()`;
  - se a variável `seq` ficar sem uso, apague-a da linha 15.

`docs/superpowers/plans/2026-10-13-orcamento-sem-ia-pr2a.md:45`: troque "são por organização, como a fila de hoje." por "são por organização, como a fila de hoje (`vendas_expirar_pedidos` é a rotina diária e roda para todas as organizações de uma vez; PR2a-plano-expirar)."

Em `docs/revisoes/pr1-pendencias.md`, risque (com `~~...~~`) e marque "**feito no PR 2b-1**" nas linhas: PR2a-ordem-trava, PR2a-motivo-log, PR2a-testes-borda, PR2a-truncada, PR2a-testes-nomes, PR2a-log-versao, PR2a-plano-expirar, PR2a-teto-pacotes, PR2a-dono-leitura e PR2a-22P02. Na linha PR2a-confirmar-1-toque, marque "**feito no PR #41** (2 toques, decisão do dono 2026-10-14)".

- [ ] **Step 4: Run the whole suite**

Run: a lista do `testar` de `package.json` com `node --test`.
Expected: tudo verde, sem teste pulado.

- [ ] **Step 5: Commit**

```bash
git add api/_vendas/fluxo.mjs api/_vendas/fluxo-pedido.mjs api/_vendas/regras-ativas.mjs api/painel.mjs docs/testes docs/superpowers/plans/2026-10-13-orcamento-sem-ia-pr2a.md docs/revisoes/pr1-pendencias.md
git commit -m "fix(orcamento): 22P02 vira 400, log do motivo desconhecido, fila sem truncada e um gerador de telefone nos testes"
```

---

## Fim do PR

1. Suíte inteira verde e E2E local (`docs/e2e-orcamento.mjs`, servidor com `BZ_SEM_CONSULTOR=1` e `PAINEL_CHAVE` de teste).
2. Nível de risco: `node scripts/processo/nivel-de-risco.mjs origin/main HEAD`. Esperado nível 3 (`supabase/`, `api/`, `.claude/`).
3. Revisão técnica e revisão de segurança por agentes diferentes do autor, publicadas no PR. A de segurança olha em especial `configSessao` (o que fica liberado) e os padrões da varredura (falso negativo).
4. PR com o modelo de `.github/pull_request_template.md`, o ensaio da Task 2 (item por item) e "o dono aplica a migration `20261015120000_pr2b_ajustes.sql` no banco real antes de promover".
5. Checks lidos um a um; merge com `--match-head-commit`; comentário "SHA para promover", com `git diff origin/main <sha>` vazio conferido.
