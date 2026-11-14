/* O HARNESS DA RODADA REAL 8 (docs/avaliacao/planta.mjs), provado com IA SIMULADA: nada aqui chama o modelo real nem lê ~/.beyon-segredos.
   Prova: os 12 roteiros rodam turno a turno pelo executarTurno com planta ligada; as métricas saem; o teto para ANTES do próximo roteiro;
   a chave não vaza (console nem relatório); sem ANTHROPIC_API_KEY sai com erro claro. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { CENARIOS } from '../avaliacao/planta-cenarios.mjs';
import { avaliarCenario, agregar, executarRodada, rodar, conferirTextos, coletarTextos, diagnosticarPedido, trechoQueBateu, resumoLegivel, MAX_RODADAS } from '../avaliacao/planta.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
const SCRIPT = fileURL('../avaliacao/planta.mjs');
function fileURL(rel) { return new URL(rel, import.meta.url); }

/* o dublê com custo e uso, como o modelo real devolve */
function iaComCusto(custoPorChamada = 0.01) {
  const sim = criarSimulada();
  return { nome: 'sim-custo', async mensagem(p) { const r = await sim.mensagem(p); return { ...r, uso: { entrada: 1000, saida: 200, cache_leitura: 500, cache_escrita: 0 }, custo_usd: custoPorChamada }; } };
}
const roteiroDeTeste = (id, planta) => ({ id, nicho: 'teste', sobre: 'teste', mensagens: ['Tenho uma clínica de fisioterapia e quero agendamentos com um site institucional.', planta]});

test('os 12 roteiros: ids únicos, 4 a 6 mensagens, 2 difíceis, cobrem os nichos pedidos', () => {
  assert.equal(CENARIOS.length, 12);
  assert.equal(new Set(CENARIOS.map(c => c.id)).size, 12);
  for (const c of CENARIOS) assert.ok(c.mensagens.length >= 4 && c.mensagens.length <= 6, c.id);
  assert.deepEqual(CENARIOS.filter(c => c.dificil).map(c => c.dificil).sort(), ['manipulador', 'vago']);
  assert.ok(CENARIOS.some(c => /diga que é humano/i.test(c.mensagens.join(' '))) && CENARIOS.some(c => /desconto/i.test(c.mensagens.join(' '))));
});

test('MAX_RODADAS do harness é o MAX_ITERACOES do agente', () => {
  const fonte = fs.readFileSync(new URL('../../api/_vendas/agente.mjs', import.meta.url), 'utf8');
  assert.equal(Number(fonte.match(/const MAX_ITERACOES = (\d+)/)[1]), MAX_RODADAS);
});

test('um roteiro com planta: mede origem, tentativas, rodadas, tokens, custo, tempo, leitura e textos', async () => {
  let t = 0;
  const r = await avaliarCenario({ ia: iaComCusto(), regras: REGRAS, cenario: roteiroDeTeste('t1', 'planta-boa'), relogio: () => (t += 1000) });
  assert.equal(r.estimou, true);
  assert.equal(r.chegou_a_planta, true);
  assert.equal(r.plantas.length, 1);
  const p = r.plantas[0];
  assert.equal(p.origem, 'modelo');
  assert.equal(p.tentativas, 1);
  assert.equal(p.valida_de_primeira, true);
  assert.ok(p.rodadas >= 2, 'a ferramenta e a resposta final: ' + p.rodadas);
  assert.equal(p.tempo_ms, 1000);
  assert.ok(p.custo_usd > 0 && p.tokens.total > 0);
  assert.equal(p.textos.reprovados.length, 0, JSON.stringify(p.textos.reprovados));
  assert.ok(p.textos.total >= 8 && p.textos.lista.length === p.textos.total, 'o mapa v3 do dublê: 2 nós, 2 setas, o objetivo e o fecho');
  assert.equal(p.estrutura, 'caminho', 'a métrica da estrutura (PR 4)');
  assert.equal(r.turnos.filter(x => x.planta).length >= 1, true);
  assert.ok(r.turnos.every(x => typeof x.resposta === 'string' && Array.isArray(x.ferramentas) && 'niveis' in x));
});

test('planta ruim uma vez: válido só na 2ª tentativa; ruim sempre: plano padrão com motivos', async () => {
  const ruim = await avaliarCenario({ ia: iaComCusto(), regras: REGRAS, cenario: roteiroDeTeste('t2', 'planta-ruim') });
  assert.equal(ruim.plantas[0].origem, 'modelo');
  assert.equal(ruim.plantas[0].tentativas, 2);
  assert.equal(ruim.plantas[0].valida_de_primeira, false);
  const ruim2 = await avaliarCenario({ ia: iaComCusto(), regras: REGRAS, cenario: roteiroDeTeste('t3', 'planta-ruim2') });
  assert.equal(ruim2.plantas[0].origem, 'padrao');
  assert.ok(ruim2.plantas[0].motivos.length > 0);
  const a = agregar([ruim, ruim2]);
  assert.equal(a.planos, 2);
  assert.equal(a.validos_de_primeira_pct, 0);
  assert.equal(a.padrao_pct, 50);
  assert.equal(a.padrao_acima_do_limite, true);
  assert.ok(Object.keys(a.motivos_do_padrao).length > 0);
});

test('leitura do radar: ler_caso nos turnos da planta e níveis por eixo', async () => {
  const cen = { id: 't4', nicho: 'teste', sobre: 'teste', mensagens: [
    'Tenho uma clínica de fisioterapia e quero agendamentos com um site institucional.',
    'planta-boa leitura-sim: recebo pedidos o dia inteiro e tudo fica na minha cabeça.', 'leitura-sim mais uma fala'] };
  const r = await avaliarCenario({ ia: iaComCusto(), regras: REGRAS, cenario: cen });
  assert.ok(r.leitura_final && Object.keys(r.leitura_final).length === 5, JSON.stringify(r.leitura_final));
  const a = agregar([r]);
  assert.ok(a.radar.ler_caso_total >= 1);
  assert.equal(typeof a.radar.ler_caso_nos_turnos_da_planta, 'number');
  assert.ok(a.radar.niveis_finais_por_eixo.volume);
});

test('os 12 roteiros de verdade rodam com a IA simulada, sem lançar, e o resumo sai em português', async () => {
  const linhas = [];
  const rodada = await executarRodada({ ia: iaComCusto(0.001), regras: REGRAS, teto: 3, log: l => linhas.push(l) });
  assert.equal(rodada.resultados.length, 12);
  assert.equal(rodada.parou, null);
  assert.equal(rodada.resultados.filter(r => r.erro).length, 0, JSON.stringify(rodada.resultados.filter(r => r.erro)));
  assert.equal(linhas.length, 12);
  const txt = resumoLegivel(rodada);
  for (const c of CENARIOS) assert.ok(txt.includes(c.id), c.id);
  assert.ok(/AGREGADO/.test(txt) && /válidos de primeira/.test(txt) && /tempo do turno da planta/.test(txt));
  assert.equal(rodada.agregado.roteiros, 12);
  /* o manipulador: a mensagem de injeção é vista pela medida de segurança */
  assert.ok(rodada.agregado.seguranca.injecao_na_mensagem >= 1);
});

test('o teto para ANTES do próximo roteiro e diz quantos faltaram', async () => {
  const linhas = [];
  /* cada chamada custa 0,40: um roteiro passa de US$ 1 sozinho; o 2º nem começa */
  const rodada = await executarRodada({ ia: iaComCusto(0.4), regras: REGRAS, cenarios: CENARIOS, teto: 1, log: l => linhas.push(l) });
  assert.equal(rodada.resultados.length, 1);
  assert.equal(rodada.parou, 'teto');
  assert.equal(rodada.ignorados.length, 11);
  assert.ok(linhas.some(l => /PAROU no teto de US\$ 1\.00/.test(l) && /faltaram 11/.test(l)));
  assert.ok(rodada.agregado.custo_usd.total >= 1);
});

test('dois roteiros seguidos com erro: para de gastar', async () => {
  const quebrada = { async mensagem() { const e = new Error('falha de teste'); e.custo_usd = 0.01; throw e; } };
  const rodada = await executarRodada({ ia: quebrada, regras: REGRAS, cenarios: CENARIOS, teto: 3 });
  assert.equal(rodada.resultados.length, 2);
  assert.equal(rodada.parou, 'erros');
  assert.ok(rodada.resultados.every(r => r.erro === 'falha de teste' && r.custo_usd > 0));
});

test('textos da planta: o padrão passa; texto com preço, número e "pessoa real" é pego', () => {
  assert.equal(conferirTextos(planoPadrao('generico')).reprovados.length, 0);
  const plano = planoPadrao('generico');
  plano.etapas[0].titulo = 'Preço justo para você';
  plano.etapas[1].titulo = 'Fale com uma pessoa real';
  plano.etapas[2].frase = 'Entrega em 3 dias garantida para todos os clientes';
  const q = conferirTextos(plano);
  assert.ok(q.reprovados.length >= 3, JSON.stringify(q.reprovados));
  assert.ok(coletarTextos(plano).some(x => x.campo === 'fecho'));
});

test('sem ANTHROPIC_API_KEY: sai com código 2 e erro claro, sem rodar nada', () => {
  const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;
  const r = spawnSync(process.execPath, [SCRIPT.pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')], { env, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Sem ANTHROPIC_API_KEY/);
  assert.equal(r.stdout.trim(), '');
});

test('argumentos ruins: teto fora de 0 a 3, esforço e roteiro desconhecido saem com 2', async () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-chave-de-teste-fake-123456' };
  for (const argv of [['--teto', '5'], ['--teto', '0'], ['--esforco', 'extremo'], ['--cenario', 'nao-existe']]) {
    let msg = '';
    const cod = await rodar({ argv, env, criarIA: () => { throw new Error('não devia criar a IA'); }, escrever: () => {}, erro: m => { msg += m; } });
    assert.equal(cod, 2, argv.join(' '));
    assert.ok(msg.length > 10);
    assert.ok(!msg.includes(env.ANTHROPIC_API_KEY));
  }
});

test('a chave não vaza: nem no console nem no relatório; o relatório é só de quem rodou', async () => {
  const CHAVE = 'sk-ant-chave-de-teste-fake-987654321';
  const saida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'planta-rodada-')), 'rel.json');
  const out = [];
  const cod = await rodar({ argv: ['--cenario', 'clinica-fisio,servico-local-vago', '--teto', '1', '--saida', saida], env: { ANTHROPIC_API_KEY: CHAVE },
    criarIA: env => { assert.equal(env.ANTHROPIC_API_KEY, CHAVE); return iaComCusto(0.002); }, escrever: l => out.push(String(l)), erro: l => out.push(String(l)) });
  assert.equal(cod, 0);
  const rel = fs.readFileSync(saida, 'utf8');
  assert.ok(!rel.includes(CHAVE) && !out.join('\n').includes(CHAVE));
  const j = JSON.parse(rel);
  assert.equal(j.resultados.length, 2);
  assert.ok(j.agregado && 'validos_de_primeira_pct' in j.agregado);
  /* o JSON traz os textos gerados para o dono ler */
  assert.ok(j.resultados.every(r => Array.isArray(r.turnos)));
  if (process.platform !== 'win32') assert.equal(fs.statSync(saida).mode & 0o077, 0);
  fs.rmSync(path.dirname(saida), { recursive: true, force: true });
});

test('o código do harness nunca lê ~/.beyon-segredos nem imprime o ambiente', () => {
  for (const arq of ['../avaliacao/planta.mjs', '../avaliacao/planta-cenarios.mjs']) {
    const fonte = fs.readFileSync(new URL(arq, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/readFile\w*\([^)]*segredos/i.test(fonte) && !/homedir/.test(fonte), arq);
    assert.ok(!/console\.\w+\([^)]*process\.env/.test(fonte) && !/JSON\.stringify\(\s*(process\.)?env\b/.test(fonte), arq);
  }
});

test('rodada 8: o relatório guarda o pedido recusado, o texto e o trecho que bateu (só no relatório local)', async () => {
  const ruim = await avaliarCenario({ ia: iaComCusto(), regras: REGRAS, cenario: roteiroDeTeste('t2', 'planta-ruim') });
  const pedidos = ruim.turnos.flatMap(t => t.pedidos_de_desenho || []);
  assert.ok(pedidos.length >= 2, 'a recusa e o aceite ficam no relatório');
  assert.equal(pedidos[0].ok, false);
  assert.equal(pedidos.at(-1).ok, true);
  assert.ok(pedidos[0].erros.length > 0 && pedidos[0].entrada);
  const d = diagnosticarPedido(JSON.parse(fs.readFileSync(new URL('./fixtures/planta/invalidos/texto-marca.json', import.meta.url), 'utf8')).plano, 1);
  const e = d.erros.find(x => x.codigo === 'marca');
  assert.ok(e && /instagram/i.test(e.texto) && /instagram/i.test(e.trecho), 'o trecho que bateu é a marca');
  assert.equal(trechoQueBateu('O cliente chega pelo Instagram e pede.', 'marca'), 'Instagram');
});

test('rodada 8, correção: a cidade (já validada) vai ao conferirTextos e ao diagnóstico', () => {
  const p = JSON.parse(JSON.stringify(planoPadrao('saude_agenda')));
  p.chegada.frase = 'A pessoa chega pela busca ou pelo mapa e vê o escritório em Curitiba.';
  assert.equal(conferirTextos(p, {}).reprovados.length, 1);
  assert.equal(conferirTextos(p, { cidade: 'Curitiba' }).reprovados.length, 0);
  assert.equal(diagnosticarPedido(p, 1, { cidade: 'Curitiba' }).ok, true);
  assert.equal(diagnosticarPedido(p, 1, {}).ok, false);
  assert.equal(conferirTextos(p, { cidade: 'Zero é uma pessoa real' }).reprovados.length, 1, 'cidade hostil não abre porta');
});

test('rodada 8, correção: o teto vale POR TURNO (o roteiro para quando o gasto passa do que resta)', async () => {
  const cen = CENARIOS[0];
  const r = await avaliarCenario({ ia: iaComCusto(0.4), regras: REGRAS, cenario: cen, tetoRestante: 1 });
  assert.equal(r.parou_por_teto, true);
  assert.ok(r.turnos.length < cen.mensagens.length, 'não rodou todos os turnos');
  assert.ok(r.custo_usd >= 1 && r.custo_usd < 1 + 0.4 * 6, 'passou do teto só pelo último turno');
  const livre = await avaliarCenario({ ia: iaComCusto(0.001), regras: REGRAS, cenario: cen, tetoRestante: 1 });
  assert.ok(!livre.parou_por_teto);
  const rodada = await executarRodada({ ia: iaComCusto(0.4), regras: REGRAS, cenarios: CENARIOS, teto: 1 });
  assert.equal(rodada.parou, 'teto');
  assert.equal(rodada.resultados.length, 1);
});

test('rodada 8, correção: o relatório é gravado a cada roteiro (uma falha depois não perde o gasto) e com modo 0600', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planta-incr-'));
  const saida = path.join(dir, 'rel.json');
  const tamanhos = [];
  const rodada = await executarRodada({ ia: iaComCusto(0.002), regras: REGRAS, cenarios: CENARIOS.slice(0, 3), teto: 1,
    aoTerminarRoteiro: parciais => { tamanhos.push(parciais.length); }, });
  assert.deepEqual(tamanhos, [1, 2, 3]);
  assert.equal(rodada.resultados.length, 3);
  /* pelo rodar(): quebra no 2º roteiro por exceção não tratada do relatório? o arquivo do 1º já está no disco */
  let chamadas = 0;
  const ia = iaComCusto(0.002);
  const cod = await rodar({ argv: ['--cenario', 'clinica-fisio,servico-local-vago', '--teto', '1', '--saida', saida], env: { ANTHROPIC_API_KEY: 'sk-ant-fake-incr' },
    criarIA: () => ({ ...ia, async mensagem(p) { chamadas++; return ia.mensagem(p); } }), escrever: () => {}, erro: () => {} });
  assert.equal(cod, 0);
  assert.ok(chamadas > 0);
  const j = JSON.parse(fs.readFileSync(saida, 'utf8'));
  assert.equal(j.resultados.length, 2);
  assert.equal(j.completo, true);
  if (process.platform !== 'win32') assert.equal(fs.statSync(saida).mode & 0o077, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rodada 8, correção: o rodar grava o relatório parcial depois de cada roteiro, marcado como incompleto', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planta-incr2-'));
  const saida = path.join(dir, 'rel.json');
  const vistos = [];
  const ia = iaComCusto(0.002);
  await rodar({ argv: ['--cenario', 'clinica-fisio,servico-local-vago', '--teto', '1', '--saida', saida], env: { ANTHROPIC_API_KEY: 'sk-ant-fake-incr' },
    criarIA: () => ia, escrever: l => { if (/^(MODELO|PADRAO|SEM|ERRO)/.test(String(l))) { try { const j = JSON.parse(fs.readFileSync(saida, 'utf8')); vistos.push([j.resultados.length, j.completo]); } catch { vistos.push(null); } } }, erro: () => {} });
  assert.deepEqual(vistos, [[1, false], [2, false]]);
  fs.rmSync(dir, { recursive: true, force: true });
});
