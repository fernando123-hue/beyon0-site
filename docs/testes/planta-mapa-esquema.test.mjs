/* O validador do servidor com as duas versões (api/_vendas/planta-esquema.mjs; plano do PR 4 §3, §5 e passo 4 do §8): a versão pela chave, o v2
   vindo do modelo recusado como "versao_antiga", os textos v3 normalizados e conferidos (o "hoje" com as palavras da pessoa), títulos distintos,
   "redigido", e o maior v3 cabendo no corte de antes da forma. Os casos do v2 (planta-esquema.test.mjs) não mudam. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validarPlano } from '../../api/_vendas/planta-esquema.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../lab-estruturas-casos.js', import.meta.url), 'utf8'), ctx);
const CASOS = JSON.parse(JSON.stringify(ctx.window.LAB_ESTRUTURAS_CASOS));
const plano = (c, e) => JSON.parse(JSON.stringify({ estrutura: e, hoje: c.hoje, nos: c.estruturas[e].nos, setas: c.estruturas[e].setas, objetivo: c.objetivo, fecho: c.fecho }));
const V3 = { versoes: ['v3'] };
const base = () => plano(CASOS.clinica, 'caminho');

test('os 20 planos do laboratório passam no validador inteiro (forma e texto), como v3', () => {
  for (const [n, c] of Object.entries(CASOS)) {
    for (const e of ['caminho', 'antes_depois', 'ramos', 'ciclo', 'mapa']) {
      const r = validarPlano(plano(c, e), V3);
      assert.equal(r.ok, true, n + '/' + e + ': ' + JSON.stringify(r.erros));
      assert.equal(r.versao, 'v3');
    }
  }
});

test('a versão pela chave: v2 lido quando vale; do modelo (só v3) é "versao_antiga"; as duas chaves juntas, "versao"', () => {
  const v2 = planoPadrao('saude_agenda');
  const lido = validarPlano(v2);
  assert.equal(lido.ok, true, JSON.stringify(lido.erros));
  assert.equal(lido.versao, 'v2');
  assert.deepEqual(validarPlano(v2, V3).motivos, ['versao_antiga']);
  assert.deepEqual(validarPlano({ ...base(), topologia: 'laco' }).motivos, ['versao']);
  assert.equal(validarPlano(base()).ok, true, 'sem a opção, o v3 também vale (leitura)');
  assert.deepEqual(validarPlano(base(), { versoes: ['v2'] }).motivos, ['versao']);
});

test('os textos v3: normalizados, títulos distintos, a camada de texto em cada um (o "hoje" com a folga dele, só nele)', () => {
  const espacos = base(); espacos.nos[1].titulo = '  Página   do tratamento ';
  const r = validarPlano(espacos, V3);
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.plano.nos[1].titulo, 'Página do tratamento');
  const rep = base(); rep.nos[2].titulo = 'página do tratamento!';
  assert.ok(validarPlano(rep, V3).motivos.includes('titulo_repetido'));
  const repObj = base(); repObj.objetivo.titulo = 'Escolhe o horário';
  assert.ok(validarPlano(repObj, V3).motivos.includes('titulo_repetido'), 'o título do objetivo também conta');
  const hoje = base(); hoje.hoje.texto = 'Respondo preço e horário na mão';
  assert.equal(validarPlano(hoje, V3).ok, true, 'preço como o que perguntam passa no hoje');
  const frase = base(); frase.nos[1].frase = 'Respondo preço e horário na mão';
  assert.ok(validarPlano(frase, V3).motivos.includes('preco'), 'a mesma frase num nó (texto do modelo) cai');
  const barato = base(); barato.hoje.trava = 'quem chega acha o preço baixo';
  assert.ok(validarPlano(barato, V3).motivos.includes('preco'));
  const marca = base(); marca.setas[0].rotulo = 'chega pelo Instagram';
  assert.ok(validarPlano(marca, V3).motivos.includes('marca'));
  const saude = base(); saude.objetivo.frase = 'Mostra fotos de antes e depois dos pacientes';
  assert.ok(validarPlano(saude, { ...V3, regulado: true }).motivos.includes('depoimento'));
});

test('"redigido": o texto que a redação de dados pessoais mudaria é recusado inteiro (nada é cortado)', () => {
  const p = base(); p.nos[2].frase = 'Manda para fulano arroba gmail ponto com';
  assert.ok(validarPlano(p, V3).motivos.includes('redigido'));
});

test('o maior v3 cabe no corte de antes da forma (o corte não o barra como grande)', () => {
  const p = plano(CASOS.limites, 'mapa');
  p.nos.forEach((n, i) => { n.titulo = ('Título ' + 'abcdef'[i] + ' ').padEnd(28, 'x'); n.frase = ('Uma frase ' + 'abcdef'[i] + ' ').padEnd(60, 'y'); });
  p.setas.forEach((s) => { s.rotulo = 'r'.repeat(24); });
  while (p.setas.length < 9) p.setas.push({ de: 'pagina', para: 'objetivo', rotulo: 'r'.repeat(24) });
  p.fecho = 'f'.repeat(80); p.objetivo = { titulo: 'o'.repeat(28), frase: 'p'.repeat(60) };
  const r = validarPlano(p, V3);
  assert.ok(!r.motivos.includes('grande') && !r.motivos.includes('nao_objeto'), String(r.motivos));
});

test('nunca lança', () => {
  for (const v of [null, 1, 'x', [], { estrutura: 'ciclo' }, { estrutura: 'mapa', nos: [{ id: '__proto__' }], setas: [] }]) assert.equal(validarPlano(v, V3).ok, false);
});
