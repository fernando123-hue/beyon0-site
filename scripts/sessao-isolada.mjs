/* ==========================================================================
   A SESSÃO ISOLADA que produz as direções (spec §4). O briefing veio de um desconhecido: a sessão do Claude Code que o
   lê roda numa lista do que é PERMITIDO, não numa lista de proibições (a documentação diz que um deny de Bash "não é
   fronteira de segurança": o mesmo programa entra por outro caminho). No Windows nativo não há sandbox de sistema, então
   o isolamento é este: dontAsk (o que não está liberado é negado sem perguntar), leitura só na pasta do pedido, escrita
   só nos 3 arquivos de direção, SEM Bash (a sessão não tem terminal), sem rede e sem MCP. Fontes:
   code.claude.com/docs/en/permissions.md, permission-modes.md, cli-reference.md, sandboxing.md (lidas em 2026-10-15).

   POR QUE SEM BASH (ensaio real do PR 43, Claude Code 2.1.269, Windows): (1) nesta máquina o Windows às vezes não consegue
   abrir o processo do Git Bash ("fork: Permission denied", código 254); se isso acontece com o hook de guarda
   (PreToolUse), ele nem começa, o "|| exit 2" não roda, o código sai diferente de 2 e o Claude Code deixa o comando seguir;
   (2) comandos de "só leitura" (nl, rg...) passam pelas regras de permissão mesmo no dontAsk; (3) o dontAsk nega, com ou
   sem regra, comando que cita caminho fora da pasta de trabalho. Uma guarda que depende de abrir um processo não é
   fronteira confiável; a defesa certa é não dar Bash à sessão. O conferir dentro da sessão era só comodidade: o dono confere
   no terminal dele, e o entregar-pedido confere tudo de qualquer jeito (filtro, varredura, leitura e código sorteado), e o
   servidor varre de novo.
   ========================================================================== */
export const caminhoClaude = p => '//' + String(p).replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, l) => l.toLowerCase());
const barras = p => String(p).replace(/\\/g, '/');

/* o caminho do script do DONO (comandos do terminal dele) */
const scriptDoDono = repo => barras(repo) + '/scripts/direcoes.mjs';

/* a linha de um comando do DONO, sempre com o caminho ABSOLUTO do script: com "node scripts/..." relativo, de dentro da pasta de
   um pedido, o que rodaria seria o arquivo que a sessão deixou lá (revisão de segurança do PR 43) */
export const linhaDoDono = ({ repo, comando, arg }) => 'node "' + scriptDoDono(repo) + '" ' + comando + (arg ? ' ' + arg : '');

export function configSessao({ repo }) {
  return {
    permissions: {
      defaultMode: 'dontAsk',
      disableBypassPermissionsMode: 'disable',
      blockReadsOutsideWorkingDirectories: true,
      /* escrita só nos 3 arquivos de direção, NUNCA ./** (revisão de segurança): com ./** a sessão gravava
         ./scripts/direcoes.mjs na pasta do pedido, e o dono, de dentro dela, rodava "node scripts/direcoes.mjs entregar-pedido"
         com caminho relativo: executava o arquivo plantado, com a chave do painel e com internet. Nada de Bash no allow. */
      allow: ['Edit(./conversao.json)', 'Edit(./autoridade.json)', 'Edit(./experiencia.json)'],
      deny: [
        /* rede, MCP e a ferramenta Bash INTEIRA (segunda camada: o --tools já a tira e o --disallowedTools também) */
        'WebFetch', 'WebSearch', 'mcp__*', 'Bash',
        /* a sessão escreve na pasta, mas não na própria configuração nem nas instruções (deny vence qualquer allow); nem no
           pedido.json: o entregar-pedido confia nele para casar cada id com a sua estratégia */
        'Edit(./.sessao.json)', 'Edit(./.instrucoes.md)', 'Edit(./pedido.json)', 'Edit(./scripts/**)',
        /* nem nos arquivos que o Claude Code carrega sozinho da pasta de trabalho (configuração, memória, MCP) */
        'Edit(./.claude/**)', 'Edit(./CLAUDE.md)', 'Edit(./CLAUDE.local.md)', 'Edit(./.mcp.json)',
        'Read(' + caminhoClaude(repo) + '/**)', 'Read(~/.claude/**)', 'Read(~/.ssh/**)', 'Read(~/.config/**)'
      ]
    }
  };
}

/* o texto que a sessão lê como instrução: a SKILL mais o que é específico desta pasta. Sem comando nenhum: a sessão não tem
   terminal, e quem confere e entrega é o dono */
export function instrucoesSessao({ skill }) {
  return [
    String(skill).trimEnd(),
    '',
    '## Nesta sessão isolada',
    '',
    '- O pedido está em `./pedido.json`.',
    '- Grave `./conversao.json`, `./autoridade.json` e `./experiencia.json`, seguindo `instrucoes.sistema` e `instrucoes.esquema`.',
    '- Você NÃO tem terminal nem internet e não lê nada fora desta pasta.',
    '- Ao terminar, avise o dono: ele confere e entrega pelo terminal dele (filtro, varredura, leitura e código sorteado).',
    ''
  ].join('\n');
}

/* a linha que o DONO roda no PowerShell (aspas simples: o PowerShell não expande nada dentro).
   Push-Location/Pop-Location em vez de Set-Location: ao sair da sessão (mesmo com erro) o PowerShell do dono volta à pasta
   de antes, e não fica dentro da pasta do pedido, onde um arquivo plantado poderia ser executado por caminho relativo.
   A chave do painel e o endereço saem do ambiente ANTES do claude (a sessão e seus filhos não os herdam) e voltam no finally,
   para o entregar-pedido do dono, e as variáveis bz* somem (a chave não fica em variável da sessão do PowerShell).
   O Push-Location fica ANTES do try e para com erro (-ErrorAction Stop): se a pasta não existir, o claude NÃO abre na pasta
   atual, e o finally nunca roda um Pop-Location sem ter feito o Push.
   Ferramentas: só Read, Edit e Write; o Bash ainda vai no --disallowedTools, para sair do contexto mesmo se o --tools mudar. */
const ps = s => "'" + String(s).replace(/'/g, "''") + "'";
export function comandoSessao({ pasta, settings, instrucoes }) {
  return 'Push-Location -LiteralPath ' + ps(pasta) + ' -ErrorAction Stop; try { $bzChave = $env:PAINEL_CHAVE; $env:PAINEL_CHAVE = $null; $bzBase = $env:BZ_BASE; $env:BZ_BASE = $null;'
    + ' claude --restricted --permission-mode dontAsk --strict-mcp-config'
    + " --tools 'Read,Edit,Write' --disallowedTools 'WebFetch' 'WebSearch' 'mcp__*' 'Bash'"
    + ' --settings ' + ps(settings) + ' --append-system-prompt-file ' + ps(instrucoes)
    /* sem acento: a página de código do Windows estraga o argumento */
    + " 'Produza as 3 direcoes do pedido.json desta pasta, seguindo as instrucoes da sessao.'"
    + ' } finally { Pop-Location; $env:PAINEL_CHAVE = $bzChave; $env:BZ_BASE = $bzBase; Remove-Variable bzChave, bzBase -ErrorAction SilentlyContinue }';
}
