// Portão do processo — nível de risco pelos arquivos alterados + evidência exigida no PR.
// Copiar para <projeto>/scripts/processo/ junto com niveis.json. Sem dependências (Node 18+).
//
//   node scripts/processo/nivel-de-risco.mjs <base> <head>     → só mostra o nível (uso local, antes do PR)
//   node scripts/processo/nivel-de-risco.mjs --pr              → CI: confere a evidência no corpo do PR
//       variáveis: BASE_SHA HEAD_SHA REPOSITORIO NUMERO_DO_PR CORPO_DO_PR GITHUB_TOKEN
//
// Origem: processo do Sistema SBP (docs/PROCESSO.md), generalizado. O que isto prova: que a evidência
// foi DECLARADA no lugar certo e que cada revisão linkada é um comentário que existe NESTE PR.
// Não prova que o texto é verdadeiro nem quem escreveu o comentário — isso é papel da revisão.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(readFileSync(path.join(AQUI, 'niveis.json'), 'utf8'));
const REGRAS = CONFIG.regras.map((r) => ({ ...r, re: new RegExp(r.padrao) }));
const SHA = /^[0-9a-f]{7,40}$/;

export function nivelDoArquivo(caminho) {
  const normalizado = caminho.replace(/\\/g, '/');
  const regra = REGRAS.find((r) => r.re.test(normalizado));
  if (regra) return { nivel: regra.nivel, motivo: regra.motivo };
  // Falhar fechado: caminho que ninguém classificou recebe a verificação mais funda.
  return { nivel: 3, motivo: 'caminho desconhecido — classifique em scripts/processo/niveis.json' };
}

export function nivelDaMudanca(arquivos) {
  if (arquivos.length === 0) throw new Error('nenhum arquivo na mudança');
  const porArquivo = arquivos.map((arquivo) => ({ arquivo, ...nivelDoArquivo(arquivo) }));
  return { nivel: Math.max(...porArquivo.map((a) => a.nivel)), porArquivo };
}

/** Texto de uma seção "### Nome" do corpo do PR, sem comentários HTML. */
function secao(corpo, nome) {
  const linhas = corpo.replace(/\r/g, '').split('\n');
  const inicio = linhas.findIndex((l) => l.trim().toLowerCase() === `### ${nome}`.toLowerCase());
  if (inicio < 0) return '';
  const fim = linhas.findIndex((l, i) => i > inicio && /^#{1,3} /.test(l));
  return linhas.slice(inicio + 1, fim < 0 ? undefined : fim).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}

export function evidenciasFaltando(nivel, corpo, pr) {
  const faltando = [];
  const links = [];
  for (const ev of CONFIG.evidencias) {
    if (nivel < ev.aPartirDoNivel) continue;
    const texto = secao(corpo, ev.secao);
    if (!texto) { faltando.push(`seção "### ${ev.secao}" vazia ou ausente (exigida a partir do nível ${ev.aPartirDoNivel})`); continue; }
    if (!ev.exigeLink) continue;
    const re = new RegExp(`https://github\\.com/${pr.repositorio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/${pr.numero}#(issuecomment|pullrequestreview)-(\\d+)`, 'g');
    const achados = [...texto.matchAll(re)];
    if (achados.length === 0) faltando.push(`"### ${ev.secao}": falta o LINK do comentário de revisão publicado neste PR`);
    links.push(...achados.map((m) => ({ tipo: m[1], id: m[2], secao: ev.secao })));
  }
  return { faltando, links };
}

/** Confere na API do GitHub que cada comentário/revisão citado existe e pertence a ESTE PR. */
export async function conferirLinks(pr, links, token) {
  const faltando = [];
  for (const l of links) {
    const caminho = l.tipo === 'issuecomment'
      ? `repos/${pr.repositorio}/issues/comments/${l.id}`
      : `repos/${pr.repositorio}/pulls/${pr.numero}/reviews/${l.id}`;
    const r = await fetch(`https://api.github.com/${caminho}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!r.ok) { faltando.push(`"### ${l.secao}": link ${l.tipo}-${l.id} não existe (HTTP ${r.status})`); continue; }
    if (l.tipo === 'issuecomment') {
      const c = await r.json();
      if (!String(c.issue_url).endsWith(`/issues/${pr.numero}`)) faltando.push(`"### ${l.secao}": comentário ${l.id} é de outro PR`);
    }
  }
  return faltando;
}

function arquivosAlterados(base, head) {
  if (!SHA.test(base) || !SHA.test(head)) throw new Error('base e head precisam ser hashes de commit');
  // --no-renames: arquivo movido aparece com o nome velho E o novo (mover código para docs/ não vira nível 0).
  return execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...${head}`], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim()).filter(Boolean);
}

function relatorio(nivel, porArquivo, faltando) {
  const celula = (t) => t.replace(/\|/g, '\\|');
  return [
    `## Processo: nível ${nivel} — ${CONFIG.nomes[nivel]}`, '',
    '| Arquivo | Nível | Por quê |', '|---|---|---|',
    ...porArquivo.slice().sort((a, b) => b.nivel - a.nivel).map((a) => `| \`${celula(a.arquivo)}\` | ${a.nivel} | ${a.motivo} |`),
    '',
    faltando === null ? '' : faltando.length === 0
      ? '**Evidência completa para este nível.**'
      : ['**Falta evidência no corpo do PR:**', ...faltando.map((f) => `- ${f}`)].join('\n'),
  ].join('\n');
}

async function principal(args) {
  const exigir = (n) => { const v = process.env[n]; if (!v) throw new Error(`${n} não definida`); return v; };
  if (args[0] === '--pr') {
    const pr = { repositorio: exigir('REPOSITORIO'), numero: Number(exigir('NUMERO_DO_PR')) };
    const { nivel, porArquivo } = nivelDaMudanca(arquivosAlterados(exigir('BASE_SHA'), exigir('HEAD_SHA')));
    const { faltando, links } = evidenciasFaltando(nivel, process.env.CORPO_DO_PR ?? '', pr);
    faltando.push(...(await conferirLinks(pr, links, exigir('GITHUB_TOKEN'))));
    const texto = relatorio(nivel, porArquivo, faltando);
    console.log(texto);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + '\n');
    process.exit(faltando.length ? 1 : 0);
  }
  const [base = 'origin/main', head = 'HEAD'] = args;
  const resolver = (ref) => execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
  const { nivel, porArquivo } = nivelDaMudanca(arquivosAlterados(resolver(base), resolver(head)));
  console.log(relatorio(nivel, porArquivo, null));
  const exigidas = CONFIG.evidencias.filter((e) => nivel >= e.aPartirDoNivel).map((e) => e.secao);
  console.log(`Evidência exigida no PR: ${exigidas.join(' · ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).catch((e) => { console.error(`Erro: ${e.message}`); process.exit(1); });
}
