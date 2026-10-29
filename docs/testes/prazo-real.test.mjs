/* A MÉTRICA DE PRAZO, prometido × real (scripts/prazo-real-lib.mjs). Dono, 2026-10-28: "se o trabalho não couber em 10 dias
   úteis, crie uma métrica para analisar e aumentar a quantidade de dias desde já". Por formato: quantas entregas, média e
   percentil 75 dos dias úteis reais, % no prazo e o prazo_dias sugerido. A conta de dias úteis é a do prazo da entrega
   (api/_material/prazo.mjs): o dia de partida não conta, a espera pela lista de ajustes não conta.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medirEntrega, analisarPrazos, deItemDoPainel, tabelaDePrazos, MINIMO_ENTREGAS } from '../../scripts/prazo-real-lib.mjs';

const SEM_FERIADO = { feriados: new Set() };   /* (as contas à mão ficam só com sábado e domingo; o feriado tem teste próprio) */
const ent = (formato, prometido, inicio, noAr, pausas = []) => ({ formato, prazo_dias: prometido, inicio: inicio + 'T10:00:00-04:00', no_ar: noAr + 'T15:00:00-04:00', pausas });

test('uma entrega: dias úteis do início do relógio ao dia no ar, sem o dia de partida e sem a espera pelos ajustes', () => {
  /* seg 09/11 → seg 16/11: ter, qua, qui, sex, seg = 5 */
  assert.deepEqual(medirEntrega(ent('landing_page', 5, '2026-11-09', '2026-11-16'), SEM_FERIADO), { formato: 'landing_page', prometido: 5, real: 5, atraso: 0, no_prazo: true });
  /* seg 09/11 → qui 19/11 = 8 dias úteis; a espera de qui 12 a sex 13 soma 1 (o dia em que ela abre não conta) → 7 */
  const pausa = [{ desde: '2026-11-12T09:00:00-04:00', ate: '2026-11-13T18:00:00-04:00' }];
  assert.deepEqual(medirEntrega(ent('landing_page', 5, '2026-11-09', '2026-11-19', pausa), SEM_FERIADO), { formato: 'landing_page', prometido: 5, real: 7, atraso: 2, no_prazo: false });
  /* espera ainda aberta quando o site foi ao ar: fecha no dia no ar (qui 12 → qui 19 = 5 parados; 8 − 5 = 3) */
  const aberta = [{ desde: '2026-11-12T09:00:00-04:00', ate: null }];
  assert.equal(medirEntrega(ent('landing_page', 5, '2026-11-09', '2026-11-19', aberta), SEM_FERIADO).real, 3);
  /* espera de antes do início do relógio não conta (a mesma regra de calcularEntregarAte) */
  const antes = [{ desde: '2026-11-05T09:00:00-04:00', ate: '2026-11-10T09:00:00-04:00' }];
  assert.equal(medirEntrega(ent('landing_page', 5, '2026-11-09', '2026-11-16', antes), SEM_FERIADO).real, 5);
});

test('feriado nacional não conta (o padrão do prazo): qui 19/11 → ter 24/11, com o 20/11 no meio, são 2 dias úteis', () => {
  assert.equal(medirEntrega(ent('landing_page', 5, '2026-11-19', '2026-11-24')).real, 2);
});

test('entrega sem início do relógio, sem dia no ar ou sem prazo prometido não entra na conta', () => {
  assert.equal(medirEntrega({ formato: 'landing_page', prazo_dias: 5, inicio: null, no_ar: '2026-11-16T10:00:00-04:00' }), null);
  assert.equal(medirEntrega({ formato: 'landing_page', prazo_dias: 5, inicio: '2026-11-09T10:00:00-04:00', no_ar: null }), null);
  assert.equal(medirEntrega({ formato: 'landing_page', prazo_dias: 0, inicio: '2026-11-09T10:00:00-04:00', no_ar: '2026-11-16T10:00:00-04:00' }), null);
  assert.equal(medirEntrega({ formato: '', prazo_dias: 5, inicio: '2026-11-09T10:00:00-04:00', no_ar: '2026-11-16T10:00:00-04:00' }), null);
  assert.equal(medirEntrega({ formato: 'landing_page', prazo_dias: 5, inicio: 'ontem', no_ar: '2026-11-16T10:00:00-04:00' }), null);
});

test('por formato: n, média, p75 dos dias reais, % no prazo e o prazo sugerido (o atual × o p75 de real ÷ prometido, para cima)', () => {
  const pausa = [{ desde: '2026-11-12T09:00:00-04:00', ate: '2026-11-13T18:00:00-04:00' }];
  const entregas = [
    ent('landing_page', 5, '2026-11-09', '2026-11-16'),          /* real 5, atraso 0 */
    ent('landing_page', 5, '2026-11-09', '2026-11-18'),          /* real 7, atraso 2 */
    ent('landing_page', 5, '2026-11-09', '2026-11-19', pausa),   /* real 7, atraso 2 */
    ent('landing_page', 5, '2026-11-09', '2026-11-13'),          /* real 4, atraso −1 */
    ent('institucional', 8, '2026-11-09', '2026-11-19'),
    ent('institucional', 8, '2026-11-09', '2026-11-25'),
    ent('sob_medida', 10, '2026-11-09', '2026-11-20'),           /* 9 */
    ent('sob_medida', 10, '2026-11-09', '2026-11-23'),           /* 10 */
    ent('sob_medida', 12, '2026-11-09', '2026-11-24'),           /* 11, com adicionais prometidos em 12 */
    { formato: 'landing_page', prazo_dias: 5, inicio: '2026-11-09T10:00:00-04:00', no_ar: null }
  ];
  const r = analisarPrazos(entregas, { prazosAtuais: { landing_page: 5, institucional: 8, sob_medida: 10 }, ...SEM_FERIADO });
  /* landing: reais [4, 5, 7, 7]: média 5,75 → 5,8; p75 pelo posto mais próximo (o 3º de 4) = 7; no prazo 2 de 4 = 50%.
     Real ÷ prometido [0,8; 1; 1,4; 1,4]: p75 = 1,4 → 5 × 1,4 = 7 */
  assert.deepEqual(r.formatos.landing_page, { n: 4, media: 5.8, p75: 7, no_prazo_pct: 50, prazo_atual: 5, sugestao: 7, motivo: 'p75 de real ÷ prometido: 1,4' });
  assert.deepEqual(r.formatos.institucional, { n: 2, media: 10, p75: 12, no_prazo_pct: 50, prazo_atual: 8, sugestao: 'manter', motivo: 'menos de ' + MINIMO_ENTREGAS + ' entregas' });
  /* experiência: todas no prazo (a razão é contra o prometido de cada uma, que já inclui os adicionais): [0,9; 0,92; 1] → 1 */
  assert.deepEqual(r.formatos.sob_medida, { n: 3, media: 10, p75: 11, no_prazo_pct: 100, prazo_atual: 10, sugestao: 'manter', motivo: 'p75 de real ÷ prometido: 1' });
  assert.equal(r.ignoradas, 1, 'a entrega sem dia no ar');
  assert.equal(MINIMO_ENTREGAS, 3);
});

test('sugestão: nunca abaixo do atual, nunca acima de 60 (o máximo do banco); formato fora da tabela não tem sugestão', () => {
  const tres = (formato, prometido, noAr) => [1, 2, 3].map(() => ent(formato, prometido, '2026-11-09', noAr));
  /* todas adiantadas: o atraso é negativo, mantém (a métrica só aumenta, por decisão do dono) */
  assert.equal(analisarPrazos(tres('landing_page', 5, '2026-11-11'), { prazosAtuais: { landing_page: 5 }, ...SEM_FERIADO }).formatos.landing_page.sugestao, 'manter');
  /* atraso enorme (seg 09/11 a sex 26/02 são 79 dias úteis contra 58): 58 × 1,36 passa de 60 → 60 */
  const longe = analisarPrazos(tres('institucional', 58, '2027-02-26'), { prazosAtuais: { institucional: 58 }, ...SEM_FERIADO }).formatos.institucional;
  assert.equal(longe.sugestao, 60);
  const fora = analisarPrazos(tres('loja_plataforma', 8, '2026-11-25'), { prazosAtuais: {}, ...SEM_FERIADO }).formatos.loja_plataforma;
  assert.deepEqual([fora.prazo_atual, fora.sugestao, fora.motivo], [null, 'manter', 'formato sem prazo na tabela']);
  assert.deepEqual(analisarPrazos([], { prazosAtuais: { landing_page: 5 } }), { formatos: {}, ignoradas: 0 });
});

/* revisão de 28/10: o atraso em DIAS somado ao prazo-base misturava entregas de tamanhos diferentes (um projeto de 16 dias
   prometidos com 4 de atraso empurrava a base de 8 para 12). A razão real ÷ prometido põe todas na mesma escala */
test('sugestão pelo atraso relativo: entregas de tamanhos diferentes com o mesmo atraso proporcional dão a mesma sugestão', () => {
  /* 8 → 10 (×1,25), 8 → 10 (×1,25) e 16 → 20 (×1,25): p75 1,25 → 8 × 1,25 = 10 (pelo atraso em dias seria 8 + 4 = 12) */
  const entregas = [ent('institucional', 8, '2026-11-09', '2026-11-23'), ent('institucional', 8, '2026-11-09', '2026-11-23'), ent('institucional', 16, '2026-11-09', '2026-12-07')];
  const r = analisarPrazos(entregas, { prazosAtuais: { institucional: 8 }, ...SEM_FERIADO }).formatos.institucional;
  assert.deepEqual([r.n, r.p75, r.sugestao, r.motivo], [3, 20, 10, 'p75 de real ÷ prometido: 1,25']);
  /* para cima: 8 × 1,1 = 8,8 → 9 */
  const pouco = [1, 2, 3].map(() => ent('institucional', 10, '2026-11-09', '2026-11-24'));   /* 11 ÷ 10 = 1,1 */
  assert.equal(analisarPrazos(pouco, { prazosAtuais: { institucional: 8 }, ...SEM_FERIADO }).formatos.institucional.sugestao, 9);
});

test('item da lista do painel (fila=entregas) vira entrega: formato do briefing, prazo prometido, início do relógio, no ar e esperas', () => {
  const it = { codigo: 'BZ-K7M3Q', passo: 'no_ar', formato: 'institucional', prazo_dias: 9, no_ar_em: '2026-11-20T15:00:00-04:00',
    prazo: { conta_desde: '2026-11-09T10:00:00-04:00', entrada_em: '2026-11-08T10:00:00-04:00', pausas: [{ desde: '2026-11-12T09:00:00-04:00', ate: '2026-11-13T18:00:00-04:00' }] } };
  assert.deepEqual(deItemDoPainel(it), { formato: 'institucional', prazo_dias: 9, inicio: '2026-11-09T10:00:00-04:00', no_ar: '2026-11-20T15:00:00-04:00', pausas: it.prazo.pausas });
  assert.deepEqual(deItemDoPainel({ formato: 'landing_page', prazo_dias: 5, prazo: {} }), { formato: 'landing_page', prazo_dias: 5, inicio: null, no_ar: null, pausas: [] });
  assert.deepEqual(deItemDoPainel({ formato: 'landing_page', prazo_dias: 5, prazo: { conta_desde: 'x', pausas: 'lixo' }, no_ar_em: 'y' }).pausas, [], 'esperas ilegíveis viram lista vazia (e a data ilegível tira a entrega da conta)');
});

test('a tabela impressa: uma linha por formato, com a sugestão; sem entregas, diz isso', () => {
  const r = { formatos: { landing_page: { n: 4, media: 5.8, p75: 7, no_prazo_pct: 50, prazo_atual: 5, sugestao: 7, motivo: 'p75 de real ÷ prometido: 1,4' } }, ignoradas: 1 };
  const linhas = tabelaDePrazos(r);
  assert.ok(linhas.some(l => /landing_page/.test(l) && /\b4\b/.test(l) && /5,8/.test(l) && /50%/.test(l) && /→ 7/.test(l)), linhas.join('\n'));
  assert.ok(linhas.some(l => /1 entrega fora da conta/.test(l)));
  assert.match(tabelaDePrazos({ formatos: {}, ignoradas: 0 }).join('\n'), /Nenhuma entrega no ar/);
});

/* o comando do dono: só LÊ (um GET na lista do painel, a mesma de scripts/entregas.mjs listar), ou um arquivo exportado */
test('comando: lê a lista do painel só com GET, imprime a tabela com o prazo da tabela, e nunca mostra a chave', async () => {
  const { executar, SQL_HISTORICO } = await import('../../scripts/prazo-real.mjs');
  const chave = 'k'.repeat(40), pedidos = [];
  const item = (noAr) => ({ formato: 'landing_page', prazo_dias: 5, no_ar_em: noAr + 'T15:00:00-04:00', prazo: { conta_desde: '2026-11-09T10:00:00-04:00', pausas: [] } });
  const buscar = async (url, init) => { pedidos.push([url, init.method || 'GET', init.body]); return new Response(JSON.stringify({ entregas: [item('2026-11-16'), item('2026-11-18'), item('2026-11-17'), { formato: 'landing_page', prazo_dias: 5, prazo: {} }] }), { status: 200 }); };
  const saidas = [], erros = [];
  const cod = await executar([], { env: { BZ_BASE: 'http://127.0.0.1:8899', PAINEL_CHAVE: chave }, buscar, saida: s => saidas.push(s), erro: s => erros.push(s) });
  assert.equal(cod, 0, erros.join('\n'));
  assert.deepEqual(pedidos.map(p => [p[0], p[1], p[2]]), [['http://127.0.0.1:8899/api/painel?fila=entregas', 'GET', undefined]], 'um GET só, sem corpo');
  const texto = saidas.join('\n');
  assert.match(texto, /landing_page/);
  assert.match(texto, /5 → 7/, 'reais 5, 7, 6 contra 5 prometidos (sem feriado em novembro nesses dias): p75 de real ÷ prometido 1,4 → 7');
  assert.match(texto, /1 entrega fora da conta/);
  assert.match(texto, /só as entregas que ainda estão na lista do painel/i, 'avisa que a lista do painel não guarda as concluídas');
  /* revisão de 28/10: o aviso vem ANTES da tabela (quem lê a tabela primeiro decidiria com a amostra só das abertas) */
  assert.ok(texto.search(/ATENÇÃO: amostra parcial/) >= 0 && texto.search(/ATENÇÃO: amostra parcial/) < texto.indexOf('landing_page'), 'o aviso antes da tabela: ' + texto);
  assert.match(texto, /--sql[^\n]*--arquivo/, 'e aponta o caminho do histórico inteiro');
  assert.ok(!texto.includes(chave));
  /* recusa do painel: a frase, sem a chave */
  const ruim = async () => new Response(JSON.stringify({ erro: 'Não autorizado ' + chave }), { status: 401 });
  const e2 = [];
  assert.equal(await executar([], { env: { BZ_BASE: 'http://127.0.0.1:8899', PAINEL_CHAVE: chave }, buscar: ruim, saida: () => {}, erro: s => e2.push(s) }), 1);
  assert.ok(!e2.join('').includes(chave) && /Não autorizado/.test(e2.join('')), e2.join(''));
  /* sem chave: nem chama o painel */
  const nada = [];
  assert.equal(await executar([], { env: { BZ_BASE: 'http://127.0.0.1:8899' }, buscar: async (...a) => { nada.push(a); }, saida: () => {}, erro: () => {} }), 1);
  assert.equal(nada.length, 0);
  /* o histórico inteiro (as concluídas saem da lista do painel): uma consulta só de leitura para o SQL Editor */
  assert.match(SQL_HISTORICO, /^select /i);
  assert.doesNotMatch(SQL_HISTORICO, /\b(insert|update|delete|drop|alter|create|grant|truncate)\b/i, 'só leitura');
  const s3 = [];
  assert.equal(await executar(['--sql'], { env: {}, buscar: async () => { throw new Error('não chama'); }, saida: s => s3.push(s), erro: () => {} }), 0);
  assert.ok(s3.join('\n').includes(SQL_HISTORICO));
  /* revisão de segurança do PR #63: a exportação traz dados de cliente (briefing); o dono é avisado antes de salvar */
  assert.match(s3.join('\n'), /dados de cliente/i, 'avisa que a exportação tem dados de cliente');
  assert.match(s3.join('\n'), /não (versione|commite|guarde no repositório)/i, 'e que não vai para o repositório');
});

test('comando --arquivo: lê a exportação do SQL Editor (lista de itens no formato do painel), sem rede', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { executar } = await import('../../scripts/prazo-real.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prazo-real-'));
  try {
    const itens = ['2026-11-16', '2026-11-18', '2026-11-17'].map(d => ({ formato: 'institucional', prazo_dias: 8, no_ar_em: d + 'T15:00:00-04:00', prazo: { conta_desde: '2026-11-09T10:00:00-04:00' } }));
    const arq = path.join(dir, 'entregas.json');
    fs.writeFileSync(arq, JSON.stringify([{ entregas: itens }]));   /* (o SQL Editor exporta a linha com a coluna "entregas") */
    const saidas = [];
    const cod = await executar(['--arquivo', arq], { env: {}, buscar: async () => { throw new Error('sem rede'); }, saida: s => saidas.push(s), erro: s => saidas.push(s) });
    assert.equal(cod, 0, saidas.join('\n'));
    assert.match(saidas.join('\n'), /institucional\s+3 .*100%.*manter/);
    fs.writeFileSync(arq, 'isso não é json');
    const e = [];
    assert.equal(await executar(['--arquivo', arq], { env: {}, saida: () => {}, erro: s => e.push(s) }), 1);
    assert.match(e.join(''), /arquivo/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('formato vindo do banco com nome estranho ("__proto__") vira linha comum, sem mexer no protótipo', () => {
  const tres = [1, 2, 3].map(() => ent('__proto__', 5, '2026-11-09', '2026-11-16'));
  const r = analisarPrazos(tres, { prazosAtuais: { landing_page: 5 }, ...SEM_FERIADO });
  assert.ok(Object.hasOwn(r.formatos, '__proto__'));
  assert.deepEqual([r.formatos['__proto__'].n, r.formatos['__proto__'].prazo_atual], [3, null]);
  assert.equal(Object.getPrototypeOf(r.formatos), Object.prototype);
});
