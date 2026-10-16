/* ==========================================================================
   A SESSÃO ISOLADA que produz as direções (spec §4). O briefing veio de um desconhecido: a sessão do Claude Code que o
   lê roda numa lista do que é PERMITIDO, não numa lista de proibições (a documentação diz que um deny de Bash "não é
   fronteira de segurança": o mesmo programa entra por outro caminho). No Windows nativo não há sandbox de sistema, então
   o isolamento é este: dontAsk (o que não está liberado é negado sem perguntar), leitura só na pasta do pedido, escrita
   só nela, Bash só para o conferir, sem rede e sem MCP. Fontes: code.claude.com/docs/en/permissions.md,
   permission-modes.md, cli-reference.md, sandboxing.md (lidas em 2026-10-15).
   ========================================================================== */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* os comandos "só leitura" rodam sem pedir em qualquer modo (lista fixa da documentação): deny explícito */
const SO_LEITURA = ['ls', 'cat', 'echo', 'pwd', 'head', 'tail', 'grep', 'find', 'wc', 'which', 'diff', 'stat', 'du', 'cd', 'git', 'type', 'more', 'less', 'dir', 'tree', 'file', 'sort', 'uniq', 'cut', 'awk', 'sed'];
/* rede e execução por outro caminho (o dontAsk já nega; o deny deixa o motivo explícito no registro da sessão) */
const REDE_E_ATALHOS = ['curl', 'wget', 'node -e', 'node --eval', 'node -p', 'node --print', 'npx', 'npm', 'powershell', 'pwsh', 'cmd', 'bash', 'sh', 'ssh', 'scp', 'gh', 'infisical', 'printenv', 'env', 'set', 'export'];

export const caminhoClaude = p => '//' + String(p).replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l) => l.toLowerCase());
const barras = p => String(p).replace(/\\/g, '/');

/* o caminho do script do conferir: UMA fonte, usada pela regra de allow e pelo texto das instruções, para nunca divergirem */
const scriptConferir = repo => barras(repo) + '/scripts/direcoes.mjs';

/* a linha de um comando do DONO, sempre com o caminho ABSOLUTO do script: com "node scripts/..." relativo, de dentro da pasta de
   um pedido, o que rodaria seria o arquivo que a sessão deixou lá (revisão de segurança do PR 43) */
export const linhaDoDono = ({ repo, comando, arg }) => 'node "' + scriptConferir(repo) + '" ' + comando + (arg ? ' ' + arg : '');

/* ENSAIO REAL (Claude Code 2.1.269, Windows): no dontAsk o comando que cita um caminho FORA da pasta de trabalho é negado, com regra
   de allow ou sem (e o deny de leitura do repositório também casa com o caminho do script no texto do comando). Por isso o
   conferir da sessão não cita o script do repositório: ele roda a PARTIDA ./.conferir.mjs, um arquivo da pasta do pedido, gerado
   pelo comando "pedido", que importa o script por URL file:/// (o import de dentro do arquivo não passa pelas permissões).
   A sessão não pode alterar a partida (deny de Edit). E a guarda (hook PreToolUse, scripts/guarda-sessao.mjs) é a lista do que é
   permitido no Bash, porque comandos de "só leitura" (nl, rg) escapam de qualquer lista de proibições. */
export const partidaConferir = repo => [
  '/* Partida do conferir da sessão isolada (gerada pelo comando "pedido"; a sessão não pode alterá-la). */',
  /* literal JSON: uma aspa no caminho (O'Brien) não quebra o arquivo gerado */
  'const { executarConferir } = await import(' + JSON.stringify(pathToFileURL(path.join(repo, 'scripts', 'direcoes.mjs')).href) + ');',
  'const [arquivo, estrategia] = process.argv.slice(2);',
  'const r = executarConferir(arquivo, estrategia);',
  'console.log(r.linha);',
  'if (!r.ok) process.exitCode = 1;',
  ''
].join('\n');

export function configSessao({ repo }) {
  return {
    permissions: {
      defaultMode: 'dontAsk',
      disableBypassPermissionsMode: 'disable',
      blockReadsOutsideWorkingDirectories: true,
      /* escrita só nos 3 arquivos de direção, NUNCA ./** (revisão de segurança): com ./** a sessão gravava
         ./scripts/direcoes.mjs na pasta do pedido, e o dono, de dentro dela, rodava "node scripts/direcoes.mjs entregar-pedido"
         com caminho relativo: executava o arquivo plantado, com a chave do painel e com internet */
      allow: ['Edit(./conversao.json)', 'Edit(./autoridade.json)', 'Edit(./experiencia.json)', 'Bash(node ./.conferir.mjs *)'],
      deny: [
        'WebFetch', 'WebSearch', 'mcp__*',
        /* a sessão escreve na pasta, mas não na própria configuração nem nas instruções (deny vence qualquer allow); nem no
           pedido.json: o entregar-pedido confia nele para casar cada id com a sua estratégia */
        'Edit(./.sessao.json)', 'Edit(./.instrucoes.md)', 'Edit(./.conferir.mjs)', 'Edit(./pedido.json)', 'Edit(./scripts/**)',
        /* nem nos arquivos que o Claude Code carrega sozinho da pasta de trabalho (configuração, memória, MCP) */
        'Edit(./.claude/**)', 'Edit(./CLAUDE.md)', 'Edit(./CLAUDE.local.md)', 'Edit(./.mcp.json)',
        'Read(' + caminhoClaude(repo) + '/**)', 'Read(~/.claude/**)', 'Read(~/.ssh/**)', 'Read(~/.config/**)',
        ...SO_LEITURA.flatMap(c => ['Bash(' + c + ')', 'Bash(' + c + ' *)']),
        ...REDE_E_ATALHOS.flatMap(c => ['Bash(' + c + ')', 'Bash(' + c + ' *)'])
      ]
    },
    /* a guarda: segunda camada, e a que decide o Bash (as proibições acima ficam como reforço). "|| exit 2": no Claude Code só a
       saída 2 bloqueia; qualquer outro erro (script sumiu ou quebrou, node não achado) deixaria a chamada seguir. */
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "' + barras(repo) + '/scripts/guarda-sessao.mjs" || exit 2' }] }] }
  };
}

/* o texto que a sessão lê como instrução: a SKILL mais o que é específico desta pasta. O conferir só roda com a linha
   EXATA do allow (a sessão abre na pasta do pedido, então o caminho do script é o absoluto e o arquivo é relativo) */
export function instrucoesSessao({ repo, skill }) {
  const linha = 'node ./.conferir.mjs ./<estrategia>.json <estrategia>';
  return [
    String(skill).trimEnd(),
    '',
    '## Nesta sessão isolada',
    '',
    '- O pedido está em `./pedido.json`.',
    '- Grave `./conversao.json`, `./autoridade.json` e `./experiencia.json`.',
    '- Para conferir, rode EXATAMENTE (sem tirar nem pôr nada): `' + linha + '`, trocando `<estrategia>` por `conversao`, `autoridade` ou `experiencia`. Qualquer outra forma é negada.',
    ''
  ].join('\n');
}

/* a linha que o DONO roda no PowerShell (aspas simples: o PowerShell não expande nada dentro).
   Push-Location/Pop-Location em vez de Set-Location: ao sair da sessão (mesmo com erro) o PowerShell do dono volta à pasta
   de antes, e não fica dentro da pasta do pedido, onde um arquivo plantado poderia ser executado por caminho relativo.
   A chave do painel e o endereço saem do ambiente ANTES do claude (a sessão e seus filhos não os herdam) e voltam no finally,
   para o entregar-pedido do dono, e as variáveis bz* somem (a chave não fica em variável da sessão do PowerShell).
   O Push-Location fica ANTES do try e para com erro (-ErrorAction Stop): se a pasta não existir, o claude NÃO abre na pasta
   atual, e o finally nunca roda um Pop-Location sem ter feito o Push. */
const ps = s => "'" + String(s).replace(/'/g, "''") + "'";
export function comandoSessao({ pasta, settings, instrucoes }) {
  return 'Push-Location -LiteralPath ' + ps(pasta) + ' -ErrorAction Stop; try { $bzChave = $env:PAINEL_CHAVE; $env:PAINEL_CHAVE = $null; $bzBase = $env:BZ_BASE; $env:BZ_BASE = $null;'
    + ' claude --restricted --permission-mode dontAsk --strict-mcp-config'
    + " --tools 'Read,Edit,Write,Bash' --disallowedTools 'WebFetch' 'WebSearch' 'mcp__*'"
    + ' --settings ' + ps(settings) + ' --append-system-prompt-file ' + ps(instrucoes)
    /* sem acento: a página de código do Windows estraga o argumento */
    + " 'Produza as 3 direcoes do pedido.json desta pasta, seguindo as instrucoes da sessao.'"
    + ' } finally { Pop-Location; $env:PAINEL_CHAVE = $bzChave; $env:BZ_BASE = $bzBase; Remove-Variable bzChave, bzBase -ErrorAction SilentlyContinue }';
}
