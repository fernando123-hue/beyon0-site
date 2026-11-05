/* O PLANO PADRÃO POR NICHO (PR 2a, api/_vendas/planta-padrao.mjs; spec §2.5). Oito planos escritos à mão, que passam pelo MESMO validador do plano do
   modelo, e a escolha do nicho a partir do briefing. Quem cai no padrão (o modelo errou duas vezes ou não chamou a ferramenta) vê um desenho de
   exemplo coerente com o ramo dela, nunca um desenho de outro ramo: na dúvida, "generico".  node --test docs/testes/planta-padrao.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVES, planoPadrao, nichoDaPlanta } from '../../api/_vendas/planta-padrao.mjs';
import { validarPlano } from '../../api/_vendas/planta-esquema.mjs';
import { nichoRegulado } from '../../api/_vendas/zero.mjs';

const ESPERADAS = ['saude_agenda', 'servico_agenda', 'servico_orcamento', 'industria_b2b', 'loja_online', 'alimentacao', 'educacao', 'generico'];
const TOPOLOGIA = { saude_agenda: 'laco', servico_agenda: 'laco', servico_orcamento: 'bifurca', industria_b2b: 'bifurca', loja_online: 'espinha', alimentacao: 'espinha', educacao: 'laco', generico: 'laco' };

test('há oito planos padrão, com as chaves da spec', () => {
  assert.deepEqual([...CHAVES].sort(), [...ESPERADAS].sort());
});

test('os oito validam (com e sem nicho regulado), têm 8 ou 9 caixas e a topologia combinada; cobrem as três topologias', () => {
  const topologias = new Set();
  for (const chave of CHAVES) {
    for (const regulado of [false, true]) {
      const r = validarPlano(planoPadrao(chave), { nomeDoNegocio: '', regulado });
      assert.equal(r.ok, true, chave + ' regulado=' + regulado + ': ' + JSON.stringify(r.erros));
    }
    const p = planoPadrao(chave);
    assert.ok([8, 9].includes(p.etapas.length + 1), chave + ': ' + (p.etapas.length + 1) + ' caixas');
    assert.equal(p.topologia, TOPOLOGIA[chave], chave);
    topologias.add(p.topologia);
  }
  assert.deepEqual([...topologias].sort(), ['bifurca', 'espinha', 'laco']);
});

test('cada plano é diferente dos outros (títulos e topologia fazem sentido para o ramo), sem texto de outro ramo', () => {
  const titulos = chave => planoPadrao(chave).etapas.map(e => e.titulo);
  for (const a of CHAVES) for (const b of CHAVES) if (a < b) assert.notDeepEqual(titulos(a), titulos(b), a + ' x ' + b);
  const tudo = chave => JSON.stringify(planoPadrao(chave));
  assert.ok(!/horário|consulta|clínica/i.test(tudo('loja_online')), 'a loja não fala de consulta');
  assert.ok(!/sacola|carrinho|cardápio/i.test(tudo('saude_agenda')), 'a clínica não fala de sacola');
});

test('o padrão que volta é uma cópia: mexer nele não muda o original; chave desconhecida cai em "generico"', () => {
  const a = planoPadrao('saude_agenda');
  a.etapas[0].titulo = 'mudou';
  a.etapas.pop();
  assert.notEqual(planoPadrao('saude_agenda').etapas[0].titulo, 'mudou');
  assert.equal(planoPadrao('saude_agenda').etapas.length, 7);
  assert.deepEqual(planoPadrao('nao-existe'), planoPadrao('generico'));
  assert.deepEqual(planoPadrao(undefined), planoPadrao('generico'));
  assert.deepEqual(planoPadrao('__proto__'), planoPadrao('generico'));
  assert.deepEqual(planoPadrao('constructor'), planoPadrao('generico'));
});

test('nicho regulado nunca recebe palavra de resultado, depoimento nem antes e depois (os oito, texto por texto)', () => {
  for (const chave of CHAVES) {
    const t = JSON.stringify(planoPadrao(chave)).toLowerCase();
    assert.ok(!/(?:resultados?|depoimentw*|antes e depois|testemunhw*|cura|garantw*|lucro|faturamento)/.test(t), chave);
  }
});

const REAIS = [
  ['clínica odontológica', 'saude_agenda'], ['consultório de psicologia', 'saude_agenda'], ['clínica de estética', 'saude_agenda'], ['nutricionista', 'saude_agenda'],
  ['fisioterapia', 'saude_agenda'], ['dentista', 'saude_agenda'], ['salão de beleza', 'servico_agenda'], ['barbearia', 'servico_agenda'],
  ['estúdio de tatuagem', 'servico_agenda'], ['personal trainer', 'servico_agenda'], ['pet shop com banho e tosa', 'servico_agenda'], ['clínica veterinária', 'servico_agenda'],
  ['reformas residenciais', 'servico_orcamento'], ['marcenaria sob medida', 'servico_orcamento'], ['serralheria', 'servico_orcamento'],
  ['instalação de ar condicionado', 'servico_orcamento'], ['empresa de limpeza pós-obra', 'servico_orcamento'], ['indústria de embalagens plásticas', 'industria_b2b'],
  ['distribuidora de alimentos para atacado', 'industria_b2b'], ['fábrica de móveis', 'industria_b2b'], ['atacado de materiais elétricos', 'industria_b2b'],
  ['loja de roupas femininas', 'loja_online'], ['moda fitness', 'loja_online'], ['e-commerce de cosméticos', 'loja_online'], ['boutique de acessórios', 'loja_online'],
  ['restaurante japonês', 'alimentacao'], ['confeitaria artesanal', 'alimentacao'], ['hamburgueria com delivery', 'alimentacao'], ['cursos de inglês', 'educacao'],
  ['escola de idiomas', 'educacao'], ['aulas de violão', 'educacao']
];
const AMBIGUOS = ['loja de roupas com delivery', 'escola de confeitaria', 'clínica de estética com loja de cosméticos', 'salão de beleza e curso de maquiagem',
  'indústria com loja virtual', 'restaurante e escola de gastronomia', 'marcenaria e loja de móveis', 'fisioterapia e academia', 'padaria e curso de panificação', 'distribuidora e loja virtual'];

test('nichoDaPlanta acerta 30 segmentos reais (pelo segmento, e também pela descrição)', () => {
  assert.ok(REAIS.length >= 30);
  for (const [texto, chave] of REAIS) {
    assert.equal(nichoDaPlanta({ negocio: { segmento: texto } }), chave, 'segmento: ' + texto);
    assert.equal(nichoDaPlanta({ negocio: { descricao: 'Somos ' + texto + ' e queremos um site novo.' } }), chave, 'descrição: ' + texto);
  }
});

test('nichoDaPlanta manda os ambíguos, os desconhecidos e o vazio para "generico" (precisão antes de alcance)', () => {
  assert.ok(AMBIGUOS.length >= 10);
  for (const texto of AMBIGUOS) assert.equal(nichoDaPlanta({ negocio: { segmento: texto } }), 'generico', texto);
  for (const texto of ['consultoria empresarial', 'contabilidade', 'agência de viagens', 'escritório de advocacia', 'advogada trabalhista']) assert.equal(nichoDaPlanta({ negocio: { segmento: texto } }), 'generico', texto);
  for (const b of [undefined, null, {}, 7, 'x', [], { negocio: null }, { negocio: { segmento: 7 } }, { negocio: { segmento: {} } }, { negocio: { segmento: '' } }]) assert.equal(nichoDaPlanta(b), 'generico');
});

test('nichoDaPlanta: quem é regulado (menos advocacia) sempre cai no plano de saúde; advocacia cai no genérico escrito dentro das regras', () => {
  for (const t of ['psicologia infantil', 'clínica médica', 'dermatologia', 'estética facial', 'nutricionista esportiva']) {
    assert.ok(nichoRegulado(t), t);
    assert.equal(nichoDaPlanta({ negocio: { segmento: t } }), 'saude_agenda', t);
  }
  assert.equal(nichoRegulado('escritório de advocacia').chave, 'advocacia');
  assert.equal(nichoDaPlanta({ negocio: { segmento: 'escritório de advocacia' } }), 'generico');
});

test('nichoDaPlanta nunca lança com texto estranho e não confunde palavras parecidas', () => {
  assert.equal(nichoDaPlanta({ negocio: { segmento: 'x'.repeat(100000) } }), 'generico');
  assert.equal(nichoDaPlanta({ negocio: { segmento: 'pre\u200bgo' } }), 'generico');
  assert.equal(nichoDaPlanta({ negocio: { segmento: 'escola' + ' '.repeat(5000) + 'x' } }), 'educacao');
  /* "cursor" e "escolha" não são curso nem escola */
  assert.equal(nichoDaPlanta({ negocio: { segmento: 'cursor de mouse, escolha livre' } }), 'generico');
});
