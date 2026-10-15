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
