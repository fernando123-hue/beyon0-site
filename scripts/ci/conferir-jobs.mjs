/* Conferidor dos checks agregados da CI (mutação em fatias e E2E em duas rodadas). O resultado agregado de uma matriz do
   GitHub ("needs.<job>.result") não conta quantas partes existiram: uma matriz encurtada, ou uma parte pulada, pode sair
   "success". Aqui cada parte esperada é procurada PELO NOME entre os jobs da própria execução (API do GitHub) e tem de
   existir exatamente uma vez com conclusão "success"; faltando, repetida, pulada, cancelada ou ainda rodando reprova.
   Falha fechada: erro de rede ou de API também reprova (reexecute o job).
   Uso (job com permissions: actions: read):  GITHUB_TOKEN=... node scripts/ci/conferir-jobs.mjs --fatias 8
                                              GITHUB_TOKEN=... node scripts/ci/conferir-jobs.mjs "nome do job 1" "nome do job 2"
   Testado em docs/testes/ci-paralela.test.mjs */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const nomesDasFatias = n => Array.from({ length: n }, (_, k) => 'Mutação (fatia ' + (k + 1) + '/' + n + ')');

export function veredito(jobs, esperados) {
  if (!esperados.length) return { ok: false, problemas: ['nenhum job esperado: não há o que conferir'] };
  const problemas = [];
  for (const nome of esperados) {
    const achados = jobs.filter(j => j.name === nome);
    if (achados.length === 0) problemas.push('"' + nome + '": faltando entre os jobs da execução');
    else if (achados.length > 1) problemas.push('"' + nome + '": aparece mais de uma vez (' + achados.length + ')');
    else if (achados[0].conclusion !== 'success') problemas.push('"' + nome + '": conclusão ' + (achados[0].conclusion || 'ainda sem conclusão') + ', não success');
  }
  return { ok: problemas.length === 0, problemas };
}

const TENTATIVAS = 3;
const POR_PAGINA = 100;
const MAX_PAGINAS = 5;

async function buscarJobs(env) {
  const base = env.GITHUB_API_URL || 'https://api.github.com';
  const jobs = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const url = base + '/repos/' + env.GITHUB_REPOSITORY + '/actions/runs/' + env.GITHUB_RUN_ID + '/jobs?filter=latest&per_page=' + POR_PAGINA + '&page=' + pagina;
    let resposta;
    for (let t = 1; t <= TENTATIVAS; t++) {
      try {
        resposta = await fetch(url, { headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
        if (resposta.ok) break;
      } catch (e) { resposta = null; }
      await new Promise(r => setTimeout(r, 2000 * t));
    }
    if (!resposta || !resposta.ok) throw new Error('a API do GitHub não respondeu (' + (resposta ? resposta.status : 'sem rede') + ')');
    const corpo = await resposta.json();
    jobs.push(...corpo.jobs);
    if (jobs.length >= corpo.total_count) return jobs;
  }
  throw new Error('jobs demais para conferir (mais de ' + MAX_PAGINAS * POR_PAGINA + ')');
}

async function principal(args, env) {
  for (const v of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID']) if (!env[v]) { console.log('ERRO: falta ' + v); return 1; }
  let esperados = args;
  if (args[0] === '--fatias') {
    const n = Number(args[1]);
    if (!Number.isInteger(n) || n < 1 || n > 100) { console.log('ERRO: --fatias precisa de um número inteiro de 1 a 100'); return 1; }
    esperados = nomesDasFatias(n);
  }
  let jobs;
  try { jobs = await buscarJobs(env); } catch (e) { console.log('ERRO: ' + e.message); return 1; }
  const r = veredito(jobs, esperados);
  for (const p of r.problemas) console.log('REPROVADO: ' + p);
  if (r.ok) console.log('OK: ' + esperados.length + ' job(s) esperado(s), todos com success');
  return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal(process.argv.slice(2), process.env).then(c => { process.exitCode = c; });
