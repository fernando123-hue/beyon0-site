/* A CI em paralelo (mutação em fatias e E2E em duas rodadas): o que o guarda e o gate de promoção leem por NOME continua
   sendo UM check agregado, e esse agregado só passa se TODAS as partes passarem. Duas camadas, ambas provadas aqui:
   1. scripts/ci/conferir-jobs.mjs: conta, pela API do GitHub, cada fatia pelo nome e exige "success" em todas (uma fatia
      pulada, cancelada, faltando ou repetida reprova, mesmo que o resultado agregado da matriz diga "success");
   2. a forma do .github/workflows/ci.yml: nomes, needs, if: always(), N das fatias igual ao N do agregado, nenhum
      segredo novo, nada de pull_request_target.
   A prova na CI de verdade (fatia sabotada/pulada/cancelada deixando o agregado vermelho) está no corpo do PR.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { veredito, nomesDasFatias } from '../../scripts/ci/conferir-jobs.mjs';

const YML = fs.readFileSync(fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

/* ---- 1. o conferidor de jobs ---- */
const NOMES = nomesDasFatias(8);
const todosVerdes = () => NOMES.map(name => ({ name, conclusion: 'success' }));

test('nomesDasFatias: "Mutação (fatia i/N)" para i de 1 a N, nessa ordem', () => {
  assert.equal(NOMES.length, 8);
  assert.equal(NOMES[0], 'Mutação (fatia 1/8)');
  assert.equal(NOMES[7], 'Mutação (fatia 8/8)');
  assert.deepEqual(nomesDasFatias(0), []);
});

test('veredito: todas as fatias com success = ok (job de outro assunto na lista não atrapalha)', () => {
  const r = veredito([...todosVerdes(), { name: 'Segredos no código (gitleaks)', conclusion: 'failure' }], NOMES);
  assert.equal(r.ok, true);
  assert.deepEqual(r.problemas, []);
});

test('veredito: fatia com failure, cancelled, skipped, nula (ainda rodando) ou qualquer outra conclusão REPROVA', () => {
  for (const conclusao of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral', null, undefined, '']) {
    const jobs = todosVerdes();
    jobs[3] = { name: NOMES[3], conclusion: conclusao };
    const r = veredito(jobs, NOMES);
    assert.equal(r.ok, false, String(conclusao));
    assert.equal(r.problemas.length, 1, String(conclusao));
    assert.ok(r.problemas[0].includes(NOMES[3]), String(conclusao));
  }
});

test('veredito: fatia FALTANDO (nunca criada: matriz encurtada, job pulado antes de virar fatia) reprova', () => {
  const jobs = todosVerdes().filter(j => j.name !== NOMES[0]);
  const r = veredito(jobs, NOMES);
  assert.equal(r.ok, false);
  assert.match(r.problemas[0], /faltando/);
  assert.equal(veredito([], NOMES).ok, false, 'lista vazia não é sucesso');
});

test('veredito: fatia repetida (duas com o mesmo nome) reprova: uma verde não cobre a outra', () => {
  const r = veredito([...todosVerdes(), { name: NOMES[2], conclusion: 'failure' }], NOMES);
  assert.equal(r.ok, false);
  assert.match(r.problemas.join('|'), /mais de uma vez|repetid/);
});

test('veredito: nada esperado (lista de nomes vazia) é erro: um conferidor sem o que conferir não pode aprovar', () => {
  const r = veredito(todosVerdes(), []);
  assert.equal(r.ok, false);
});

/* ---- 2. a forma do ci.yml ---- */
/* os jobs do arquivo: { id, texto } — o texto do bloco, do "  id:" até o próximo job */
function jobsDoArquivo(yml) {
  const ini = yml.indexOf('\njobs:\n');
  assert.ok(ini >= 0, 'o ci.yml tem jobs:');
  const corpo = yml.slice(ini + 7);
  const partes = corpo.split(/\n(?=  [A-Za-z0-9_-]+:\n)/);
  const comId = partes.map(p => [/^  ([A-Za-z0-9_-]+):\s*$/m.exec(p), p]).filter(([m]) => m);   /* (descarta o trecho só de comentário antes do 1º job) */
  return Object.fromEntries(comId.map(([m, p]) => [m[1], p]));
}
const JOBS = jobsDoArquivo(YML);
const nomeDe = bloco => (/^    name: (.+)$/m.exec(bloco) || [])[1];

test('ci.yml: os cinco checks que o processo lê por nome continuam existindo, com o nome de sempre, cada um UMA vez', () => {
  const nomes = Object.values(JOBS).map(nomeDe).filter(Boolean);
  for (const n of [
    'Testes (banco real, IA e pagamento simulados) e mutação',
    'Segredos no código (gitleaks)',
    'Dependências de produção (npm audit)',
    'E2E do orçamento (Chromium, do 1º texto ao projeto pago)',
    'Worker (workerd de verdade, sem publicar)',
  ]) assert.equal(nomes.filter(x => x === n).length, 1, n);
  assert.equal(new Set(nomes).size, nomes.length, 'nenhum nome de job repetido (as fatias não podem se chamar como o agregado)');
});

test('ci.yml: o agregado dos testes espera a suíte e as fatias, roda sempre (if: always()) e exige success de cada um', () => {
  const agregado = JOBS.testes;
  assert.match(agregado, /^    if: always\(\)\s*$/m);
  const needs = (/^    needs: \[(.*)\]\s*$/m.exec(agregado) || [])[1] || '';
  assert.deepEqual(needs.split(',').map(s => s.trim()).sort(), ['mutacao', 'suite']);
  assert.match(agregado, /needs\.suite\.result/);
  assert.match(agregado, /needs\.mutacao\.result/);
  assert.match(agregado, /\[ "\$SUITE" = success \]/, 'a suíte tem de ser success, não "não falhou"');
  assert.match(agregado, /conferir-jobs\.mjs/, 'a contagem das fatias pela API roda quando a mutação é esperada');
  assert.match(agregado, /^      actions: read\b/m, 'a contagem lê os jobs da execução: só leitura');
});

test('ci.yml: as fatias da mutação são 1/N..N/N (sem furo, sem repetição) e o N do agregado é o mesmo', () => {
  const mut = JOBS.mutacao;
  const lista = (/fatia: \[(.*)\]/.exec(mut) || [])[1] || '';
  const fatias = lista.split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  const n = fatias.length;
  assert.ok(n >= 2, 'a mutação roda em paralelo');
  assert.deepEqual(fatias, Array.from({ length: n }, (_, k) => (k + 1) + '/' + n));
  assert.match(mut, /MUTACAO_FATIA: \$\{\{ matrix\.fatia \}\}/);
  assert.match(mut, /^      fail-fast: false\b/m, 'uma fatia vermelha não cancela as outras: o relatório sai completo');
  assert.match(mut, /name: Mutação \(fatia \$\{\{ matrix\.fatia \}\}\)/);
  assert.match(mut, /run: npm run testar:mutacao/);
  assert.match(JOBS.testes, new RegExp('MUTACAO_FATIAS: ' + n + '\\b'), 'o agregado conta exatamente N fatias');
  assert.equal(nomeDe(mut), 'Mutação (fatia ${{ matrix.fatia }})');
});

test('ci.yml: a mutação continua só na main e à mão (workflow_dispatch); o agregado sabe quando ela é esperada', () => {
  assert.match(JOBS.mutacao, /^    if: github\.ref == 'refs\/heads\/main' \|\| github\.event_name == 'workflow_dispatch'\s*$/m);
  assert.match(JOBS.testes, /MUTACAO_ESPERADA: \$\{\{ github\.ref == 'refs\/heads\/main' \|\| github\.event_name == 'workflow_dispatch' \}\}/);
  assert.match(JOBS.suite, /run: npm run testar\s*$/m);
});

test('ci.yml: o E2E roda as duas rodadas (sem e com consultor) em paralelo, e o agregado de sempre só existe no PR e à mão', () => {
  const rodada = JOBS['e2e-rodada'];
  assert.ok(rodada, 'job das rodadas');
  assert.match(rodada, /^      fail-fast: false\b/m);
  assert.match(rodada, /modo: sem consultor/);
  assert.match(rodada, /modo: com consultor/);
  assert.equal((rodada.match(/^          - modo: /gm) || []).length, 2, 'exatamente as duas rodadas de antes');
  assert.match(rodada, /^    if: github\.event_name == 'pull_request' \|\| github\.event_name == 'workflow_dispatch'\s*$/m);
  assert.match(rodada, /npm run e2e:orcamento/);
  const agregado = JOBS.e2e;
  assert.match(agregado, /^    if: always\(\) && \(github\.event_name == 'pull_request' \|\| github\.event_name == 'workflow_dispatch'\)\s*$/m, 'skipped no push comum, como hoje');
  assert.match(agregado, /^    needs: \[e2e-rodada\]\s*$/m);
  assert.match(agregado, /\[ "\$RODADAS" = success \]/);
  assert.match(agregado, /conferir-jobs\.mjs/);
  assert.match(agregado, /^      actions: read\b/m);
});

test('ci.yml: nenhum segredo novo, nada de pull_request_target, nada do evento interpolado em run: (injeção)', () => {
  assert.doesNotMatch(YML, /pull_request_target/);
  const segredos = [...YML.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map(m => m[1]);
  assert.ok(segredos.every(s => s === 'GITHUB_TOKEN'), 'só o GITHUB_TOKEN: ' + segredos.join(','));
  assert.doesNotMatch(YML, /github\.head_ref|github\.event\.(pull_request|head_commit|comment|issue|review)/, 'texto de quem abriu o PR nunca entra no workflow');
  /* ${{ }} dentro de um bloco run: só com matrix/needs/github.run_id (valores do próprio arquivo ou do GitHub, nunca texto externo) */
  const runs = [...YML.matchAll(/^( *)run: [|>][-+]?\n((?:\1 +.*\n|\n)+)/gm)].map(m => m[2]);
  for (const bloco of runs) for (const m of bloco.matchAll(/\$\{\{([^}]*)\}\}/g)) assert.match(m[1].trim(), /^(matrix\.[a-z]+|needs\.[a-z0-9-]+\.result|github\.run_id)$/, m[0]);
});

test('ci.yml: nenhuma checagem sumiu: a suíte, o npm audit, o gitleaks, o worker e o E2E com as DUAS rodadas seguem lá', () => {
  assert.match(YML, /npm run testar\b/);
  assert.match(YML, /npm audit --omit=dev --audit-level=high/);
  assert.match(YML, /gitleaks\/gitleaks-action@/);
  assert.match(YML, /npm run cf:fumaca/);
  assert.equal((YML.match(/npm run e2e:orcamento/g) || []).length, 1, 'um passo só, rodado nas duas entradas da matriz');
  assert.match(YML, /CONSULTOR: '1'|CONSULTOR=1|CONSULTOR: \$\{\{ matrix\.consultor \}\}/);
});
