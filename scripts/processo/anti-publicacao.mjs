/* ==========================================================================
   A TRAVA ANTI-PUBLICAÇÃO (plano da migração para a Cloudflare, § 5.3 e § 5.5, tarefa B8; ampliada pela revisão do PR B,
   ALTO-2). Procura, nos arquivos versionados, o que publicaria a produção da Cloudflare sem o dono:
     • comando do Wrangler que publica, apaga, volta versão, cria prévia, mexe em segredo ou em gatilho (deploy sem
       --dry-run, delete, rollback, preview, publish, versions deploy|upload|secret, secret put|bulk|delete, triggers
       deploy), com ou sem @versão, com opções antes do subcomando, em linha de shell ou em lista de argumentos
       (spawn('npx', ['<wrangler>', '<subcomando>']));
     • o push da branch de produção (em qualquer posição do comando), o push de todas as branches ou o espelho, e a
       branch de produção como destino (dois-pontos antes do nome, ou o caminho refs/heads dela);
     • workflow do GitHub com escopo de escrita (qualquer <escopo>: write, write-all), sem permissions no topo (herdaria o
       padrão do repositório), com a action da Cloudflare ou com o token e a conta da Cloudflare;
     • package.json com script de instalação (preinstall, install, postinstall, prepare): o Builds o executa;
     • wrangler.jsonc com a estrutura que apontaria o deploy da main para a produção: build em qualquer lugar; no topo,
       workers_dev e preview_urls diferentes de false, routes, route ou account_id; dentro de env.*, name, route,
       account_id ou routes que não seja a lista vazia. (Quando o PR C ligar o domínio, o routes do topo passa a existir:
       ajustar esta regra naquele PR.)
   LIMITE: varredura de texto. Pega erro e instrução óbvia, não quem quer contornar ('prod' + 'ucao', base64). A trava
   contra o agente enganado é a confirmação do dono no push (§ 5.5 do plano, item 1).
   Autônomo de propósito (sem import do repositório): o dono copia ESTE arquivo para ~/.claude/guarda/ (tarefa P2) e o
   guarda o roda sobre a árvore a empurrar. Uso: node anti-publicacao.mjs [pasta]  (saída 1 se houver achado).
   Os termos proibidos são montados por partes para este arquivo não precisar de exceção.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const W = 'wrang' + 'ler';
const G = 'gi' + 't';
const PROD = 'pro' + 'ducao';
const TEXTO_MAX = 2 * 1024 * 1024;   /* arquivo maior que isto não é texto de configuração */
const BINARIOS = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|pdf|7z|zip|gz|dump)$/i;

/* exceções: só de arquivos .md, um a um, nunca pasta (2ª revisão, ALTO-3) */
const EXCECOES_MD = new Set(['docs/superpowers/plans/2026-10-21-migracao-cloudflare.md', 'docs/PROCESSO.md', 'CLAUDE.md']);

/* subcomandos do Wrangler que publicam, apagam, criam prévia ou mexem em versão, segredo e gatilho */
const SUBCOMANDO = 'deploy|delete|rollback|preview|publish|versions\\s+(?:deploy|upload|secret)|secret\\s+(?:put|bulk|delete)|triggers\\s+deploy';
const SUBCOMANDO_EM_LISTA = 'deploy|delete|rollback|preview|publish|versions|secret|triggers';
/* o Wrangler (ou o wrangler.js do node_modules), com ou sem @versão; DEPOIS, na mesma parte da linha, opções e o subcomando */
const COMANDO_WRANGLER = new RegExp(W + '(?:\\.[cm]?js)?(?:@[^\\s\'"]+)?\\s(?:[^\\n]*?\\s)?(' + SUBCOMANDO + ')\\b', 'g');
/* em lista de argumentos (pode quebrar linha): 'wrangler', opções..., 'subcomando'; mais o resto da lista, até o ] */
const LISTA_WRANGLER = new RegExp('[\'"]' + W + '(?:@[^\'"]*)?[\'"]\\s*,\\s*(?:[\'"][^\'"]*[\'"]\\s*,\\s*)*?[\'"](' + SUBCOMANDO_EM_LISTA + ')[\'"]([^\\]]*)', 'g');
const LISTA_GIT = new RegExp('[\'"]' + G + '[\'"]\\s*,\\s*[\'"]push[\'"]([^\\]]*)', 'g');
const PUSH_NA_LINHA = new RegExp(G + '\\s+push\\b(.*)');
const PUSH_RUIM = new RegExp('\\b' + PROD + '\\b|--all\\b|--mirror\\b');
/* o --dry-run ligado dispensa SÓ o deploy; --dry-run=false, --dry-run false e --no-dry-run não o dispensam */
const dryRunLigado = s => /--dry-run(?:=true)?(?![\w=-])/.test(s) && !/--dry-run\s+false\b|--dry-run=false\b|--no-dry-run\b/.test(s);
const dryRunEmLista = s => /['"]--dry-run(?:=true)?['"]/.test(s) && !/['"]--dry-run=false['"]|['"]--no-dry-run['"]|['"]--dry-run['"]\s*,\s*['"]false['"]/.test(s);
/* os comandos de uma linha de shell ou de JS: separados por && || ; | (cada parte é conferida sozinha) */
const partesDaLinha = linha => linha.split(/&&|\|\||[;|]/);

const PADROES_TEXTO = [
  { motivo: 'a branch de produção como destino (:' + PROD + ')', re: new RegExp(':' + PROD + '\\b') },
  { motivo: 'refs/heads/' + PROD, re: new RegExp('refs/heads/' + PROD + '\\b') }
];
const PADROES_WORKFLOW = [
  { motivo: 'workflow com escopo de escrita (<escopo>: write)', re: /\b[\w-]+\s*:\s*write\b/ },
  { motivo: 'workflow com permissions: write-all', re: /\bwrite-all\b/ },
  { motivo: 'workflow com a action da Cloudflare', re: /\buses:\s*cloudflare\// },
  { motivo: 'workflow com a action oficial do Wrangler', re: new RegExp(W + '-action') },
  { motivo: 'workflow com o token da Cloudflare (CLOUDFLARE_API_TOKEN)', re: /CLOUDFLARE_API_TOKEN/ },
  { motivo: 'workflow com a conta da Cloudflare (CLOUDFLARE_ACCOUNT_ID)', re: /CLOUDFLARE_ACCOUNT_ID/ }
];
const SCRIPTS_DE_INSTALACAO = ['preinstall', 'install', 'postinstall', 'prepare'];

/* motivos de comando que publica, achados no texto de qualquer arquivo versionado */
function motivosDeComando(texto) {
  const motivos = new Set();
  for (const linha of texto.split(/\r?\n/)) {
    for (const parte of partesDaLinha(linha)) {
      for (const m of parte.matchAll(COMANDO_WRANGLER)) {
        if (m[1] !== 'deploy' || !dryRunLigado(parte)) motivos.add('comando do Wrangler que publica ou apaga (' + m[1].replace(/\s+/g, ' ') + ')');
      }
      const push = PUSH_NA_LINHA.exec(parte);
      if (push && PUSH_RUIM.test(push[1])) motivos.add('push da branch de produção, de todas as branches ou espelho');
    }
  }
  for (const m of texto.matchAll(LISTA_WRANGLER)) {
    if (m[1] !== 'deploy' || !dryRunEmLista(m[2])) motivos.add('comando do Wrangler que publica ou apaga, em lista de argumentos (' + m[1] + ')');
  }
  for (const m of texto.matchAll(LISTA_GIT)) {
    if (PUSH_RUIM.test(m[1].replace(/['"]/g, ' '))) motivos.add('push da branch de produção, de todas as branches ou espelho, em lista de argumentos');
  }
  return [...motivos];
}

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

const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function chaveEmQualquerLugar(valor, chave) {
  if (Array.isArray(valor)) return valor.some(x => chaveEmQualquerLugar(x, chave));
  if (!ehObjeto(valor)) return false;
  return Object.hasOwn(valor, chave) || Object.values(valor).some(x => chaveEmQualquerLugar(x, chave));
}

/* a estrutura do wrangler.jsonc que aponta o deploy da main (staging) para a produção, ou deixa a produção aberta */
function motivosDoWrangler(cfg) {
  const motivos = [];
  if (!ehObjeto(cfg)) return ['wrangler.jsonc sem objeto na raiz'];
  if (chaveEmQualquerLugar(cfg, 'build')) motivos.push('"build" no wrangler.jsonc (rodaria código no deploy)');
  if (cfg.workers_dev !== false) motivos.push('workers_dev do topo precisa ser false (produção sem endereço workers.dev)');
  if (cfg.preview_urls !== false) motivos.push('preview_urls do topo precisa ser false');
  for (const k of ['routes', 'route', 'account_id']) if (Object.hasOwn(cfg, k)) motivos.push('"' + k + '" no topo do wrangler.jsonc (rota e conta não vão no arquivo; o domínio é do PR C)');
  const envs = ehObjeto(cfg.env) ? cfg.env : {};
  for (const [nome, e] of Object.entries(envs)) {
    if (!ehObjeto(e)) continue;
    for (const k of ['name', 'route', 'account_id']) if (Object.hasOwn(e, k)) motivos.push('env.' + nome + '.' + k + ' (apontaria o deploy da main para outro Worker ou conta)');
    if (Object.hasOwn(e, 'routes') && !(Array.isArray(e.routes) && e.routes.length === 0)) motivos.push('env.' + nome + '.routes precisa ser a lista vazia (routes é herdável; o staging nunca pega o domínio)');
  }
  return motivos;
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
    const ehWorkflow = /^\.github\/workflows\/[^/]+\.ya?ml$/.test(norm);
    if (!dispensado) {
      for (const motivo of motivosDeComando(texto)) acha(norm, motivo);
      for (const p of PADROES_TEXTO) if (p.re.test(texto)) acha(norm, p.motivo);
      if (ehWorkflow) {
        for (const p of PADROES_WORKFLOW) if (p.re.test(texto)) acha(norm, p.motivo);
        if (!/^permissions:/m.test(texto)) acha(norm, 'workflow sem permissions no topo (herdaria o padrão do repositório)');
      }
    }
    if (/(^|\/)package\.json$/.test(norm)) {
      try {
        const scripts = JSON.parse(texto).scripts || {};
        for (const s of SCRIPTS_DE_INSTALACAO) if (Object.hasOwn(scripts, s)) acha(norm, 'script de instalação "' + s + '" (o Builds o executa)');
      } catch { acha(norm, 'package.json ilegível'); }
    }
    if (/(^|\/)wrangler\.jsonc$/.test(norm)) {
      try { for (const motivo of motivosDoWrangler(lerJsonc(texto))) acha(norm, motivo); }
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
