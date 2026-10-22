/* ==========================================================================
   A TRAVA ANTI-PUBLICAÇÃO (plano da migração para a Cloudflare, § 5.3 e § 5.5, tarefa B8).
   Procura, nos arquivos versionados, o que publicaria a produção da Cloudflare sem o dono:
     • workflow do GitHub com permissão de escrita (contents: write, permissions: write-all);
     • comando do Wrangler que publica, volta versão, mexe em segredo ou em gatilho (deploy sem --dry-run, versions
       deploy|upload, rollback, secret put|bulk, triggers deploy);
     • a branch de produção como destino (dois-pontos antes do nome dela, ou o caminho refs/heads dela);
     • package.json com script de instalação (preinstall, install, postinstall, prepare): o Builds o executa;
     • wrangler.jsonc com "build" (rodaria código no deploy).
   LIMITE: varredura de texto. Pega erro e instrução óbvia, não quem quer contornar ('prod' + 'ucao', base64). A trava
   contra o agente enganado é a confirmação do dono no `git push` (§ 5.5 do plano, item 1).
   Autônomo de propósito (sem import do repositório): o dono copia ESTE arquivo para ~/.claude/guarda/ (tarefa P2) e o
   guarda o roda sobre a árvore a empurrar. Uso: node anti-publicacao.mjs [pasta]  (saída 1 se houver achado).
   Os termos proibidos são montados por partes para este arquivo não precisar de exceção.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const W = 'wrang' + 'ler';
const PROD = 'pro' + 'ducao';
const TEXTO_MAX = 2 * 1024 * 1024;   /* arquivo maior que isto não é texto de configuração */
const BINARIOS = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf|7z|zip|gz|dump)$/i;

/* exceções: só de arquivos .md, um a um, nunca pasta (2ª revisão, ALTO-3) */
const EXCECOES_MD = new Set(['docs/superpowers/plans/2026-10-21-migracao-cloudflare.md', 'docs/PROCESSO.md', 'CLAUDE.md']);

const PADROES_TEXTO = [
  { motivo: 'deploy do Wrangler sem --dry-run na mesma linha', re: new RegExp(W + '\\s+deploy\\b(?![^\\n]*--dry-run)') },
  { motivo: 'versions deploy/upload/secret do Wrangler', re: new RegExp(W + '\\s+versions\\s+(deploy|upload|secret)\\b') },
  { motivo: 'rollback do Wrangler', re: new RegExp(W + '\\s+rollback\\b') },
  { motivo: 'secret put/bulk do Wrangler', re: new RegExp(W + '\\s+secret\\s+(put|bulk)\\b') },
  { motivo: 'triggers deploy do Wrangler', re: new RegExp(W + '\\s+triggers\\s+deploy\\b') },
  { motivo: 'a branch de produção como destino (:' + PROD + ')', re: new RegExp(':' + PROD + '\\b') },
  { motivo: 'refs/heads/' + PROD, re: new RegExp('refs/heads/' + PROD + '\\b') }
];
const PADROES_WORKFLOW = [
  { motivo: 'workflow com contents: write', re: /\bcontents:\s*write\b/ },
  { motivo: 'workflow com permissions: write-all', re: /\bpermissions:\s*write-all\b/ }
];
const SCRIPTS_DE_INSTALACAO = ['preinstall', 'install', 'postinstall', 'prepare'];

/* JSONC → objeto, só para ler o wrangler.jsonc (cópia mínima de cloudflare/jsonc.mjs, para este arquivo ser autônomo) */
function lerJsonc(texto) {
  let sem = '';
  for (let i = 0; i < texto.length;) {
    const c = texto[i];
    if (c === '"') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== '"') j += texto[j] === '\\' ? 2 : 1;
      sem += texto.slice(i, j + 1); i = j + 1;
    } else if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; }
    else if (c === '/' && texto[i + 1] === '*') { const f = texto.indexOf('*/', i + 2); i = f < 0 ? texto.length : f + 2; }
    else { sem += c; i++; }
  }
  return JSON.parse(sem.replace(/,(\s*[}\]])/g, '$1'));
}

export function conferirAntiPublicacao(raiz, arquivos) {
  const achados = [];
  const acha = (arquivo, motivo) => achados.push(arquivo + ': ' + motivo);
  for (const arquivo of arquivos) {
    const norm = arquivo.replace(/\\/g, '/');
    if (BINARIOS.test(norm)) continue;
    const caminho = path.join(raiz, norm);
    let texto;
    try {
      if (fs.statSync(caminho).size > TEXTO_MAX) continue;
      texto = fs.readFileSync(caminho, 'utf8');
    } catch { continue; }   /* (versionado e apagado na árvore: nada a ler) */
    const dispensado = EXCECOES_MD.has(norm);
    if (!dispensado) {
      for (const p of PADROES_TEXTO) if (p.re.test(texto)) acha(norm, p.motivo);
      if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(norm)) for (const p of PADROES_WORKFLOW) if (p.re.test(texto)) acha(norm, p.motivo);
    }
    if (/(^|\/)package\.json$/.test(norm)) {
      try {
        const scripts = JSON.parse(texto).scripts || {};
        for (const s of SCRIPTS_DE_INSTALACAO) if (Object.hasOwn(scripts, s)) acha(norm, 'script de instalação "' + s + '" (o Builds o executa)');
      } catch { acha(norm, 'package.json ilegível'); }
    }
    if (/(^|\/)wrangler\.jsonc$/.test(norm)) {
      try { if (Object.hasOwn(lerJsonc(texto), 'build')) acha(norm, '"build" no wrangler.jsonc (rodaria código no deploy)'); }
      catch { acha(norm, 'wrangler.jsonc ilegível'); }
    }
  }
  return achados;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {   /* (só quando rodado como comando) */
  const raiz = path.resolve(process.argv[2] || process.cwd());
  let arquivos;
  try { arquivos = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' }).split('\0').filter(Boolean); }
  catch (e) { console.error('[anti-publicacao] sem git na pasta: não dá para saber o que é versionado (' + e.message + ')'); process.exit(1); }
  const achados = conferirAntiPublicacao(raiz, arquivos);
  for (const a of achados) console.error('[anti-publicacao] ' + a);
  console.log('[anti-publicacao] ' + (achados.length ? achados.length + ' achado(s)' : 'limpo'));
  process.exit(achados.length ? 1 : 0);
}
