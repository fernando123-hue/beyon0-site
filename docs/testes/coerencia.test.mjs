/* Mapa vivo v2, FASE 4 (coerência), parte 1: a regra de código que confere o ramo tocado contra o que a pessoa escreveu
   (cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 4", aceite 1). Os 40 casos abaixo foram escritos
   ANTES do código; os 20 de coerencia-casos-independentes.json foram escritos por OUTRO agente, sem ver o código, só com
   a regra. A pergunta na tela (dois botões) vem no PR seguinte. npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Coerencia = require('../../js/orcamento-coerencia.js');
const { RAMOS } = await import('../../api/_classificador/contrato.mjs');

/* [ramo tocado, texto, palpite esperado ou null (quieto)] */
const CASOS = [
  /* dúvida: o texto fala claramente de UM outro ramo */
  ['saude', 'tenho uma padaria no centro, fazemos pão e bolo todo dia', 'alimentacao'],
  ['servicos', 'sou dentista, atendo no meu consultório há 10 anos', 'saude'],
  ['comercio', 'escola de inglês para crianças e adultos, aulas à noite', 'educacao'],
  ['educacao', 'barbearia com 3 cadeiras, corte e barba', 'beleza'],
  ['alimentacao', 'loja de roupas femininas e acessórios no shopping', 'comercio'],
  ['beleza', 'fazemos reformas e pintura de apartamentos', 'servicos'],
  ['saude', 'pizzaria e hamburgueria com entrega no bairro', 'alimentacao'],
  ['comercio', 'associação de moradores do bairro, sem fins lucrativos', 'associacao'],
  ['beleza', 'escritório de advocacia trabalhista, atendo empresas', 'servicos'],
  ['educacao', 'confeitaria artesanal, bolos de festa por encomenda', 'alimentacao'],
  ['alimentacao', 'clinica de fisioterapia e pilates para idosos', 'saude'],
  ['servicos', 'salao de beleza, manicure e sobrancelha', 'beleza'],
  ['associacao', 'autoescola com aulas praticas e teoricas', 'educacao'],
  ['saude', 'oficina mecanica de carros e motos', 'servicos'],
  ['educacao', 'boutique de semijoias e acessórios, vendo pelo instagram', 'comercio'],
  ['comercio', 'restaurante self service no almoço, marmita à noite', 'alimentacao'],
  /* quieto: confirma o ramo tocado, mesmo citando outro */
  ['beleza', 'clínica de estética facial e corporal', null],
  ['comercio', 'loja de bolos e doces para festas', null],
  ['saude', 'clínica odontológica, também temos curso para auxiliares', null],
  ['alimentacao', 'Clínica do Pão, padaria de bairro desde 1998', null],
  ['saude', 'Clínica do Pão, uma clínica de nutrição esportiva', null],
  ['educacao', 'curso de confeitaria para quem quer vender bolos', null],
  ['servicos', 'pet shop com banho e tosa e veterinário', null],
  /* quieto: ambíguo (2 ou mais ramos diferentes do tocado) */
  ['servicos', 'temos padaria e uma loja de roupas no mesmo prédio', null],
  ['associacao', 'farmácia de manipulação no centro', null],
  ['educacao', 'academia de pilates e yoga', null],
  /* quieto: sem palavra de ramo */
  ['servicos', 'atendemos empresas da região há bastante tempo', null],
  ['comercio', 'quero um site bonito para aparecer no google', null],
  ['saude', 'o pessoal chega pelo instagram e pelo whatsapp', null],
  /* quieto: negação na mesma oração */
  ['servicos', 'não é restaurante, é consultoria de gestão', null],
  ['saude', 'nao somos padaria, fazemos exames laboratoriais', null],
  ['comercio', 'vendo roupas, sem escola nem curso', null],
  ['beleza', 'nada de barbearia, é um salão só para mulheres', null],
  /* quieto: o ramo tocado é "outro" ou não é da lista */
  ['outro', 'tenho uma padaria e quero vender pela internet', null],
  ['qualquer', 'tenho uma padaria e quero vender pela internet', null],
  [undefined, 'tenho uma padaria e quero vender pela internet', null],
  /* quieto: texto curto demais (< 15 caracteres) */
  ['saude', 'padaria', null],
  ['saude', 'sou dentista', null],
  /* quieto: texto vazio ou que não é texto */
  ['saude', '', null],
  ['saude', null, null]
];

/* falsos alarmes achados pela revisão técnica (typescript-reviewer), executados contra a 1ª versão: a palavra descreve o CLIENTE
   ou o assunto do trabalho, não o negócio dela; ou é palavra fraca sozinha. Todos têm de ficar quietos */
const FALSOS_ALARMES_DA_REVISAO = [
  ['servicos', 'Sou designer e faço identidade visual para restaurantes'],
  ['comercio', 'Atendo clientes nos bares e restaurantes da região'],
  ['servicos', 'contabilidade para padarias e mercados do bairro'],
  ['servicos', 'Minha empresa organiza eventos com buffet e cardápio'],
  ['saude', 'Estou vendo como ter um site novo para a clínica'],
  ['servicos', 'Estou vendo como ter um site novo'],
  ['beleza', 'Instituto de beleza e bem-estar no centro'],
  ['servicos', 'clube de assinatura de vinhos com entrega'],
  ['beleza', 'estúdio de dança com aulas para crianças'],
  ['comercio', 'produtos de limpeza e materiais para revenda'],
  ['educacao', 'oficinas de arte e pintura para adultos'],
  ['servicos', 'desenvolvo SPA em React e sistemas web'],
  ['servicos', 'consultoria para e-commerce e moda'],
  ['servicos', 'software para clínicas e consultórios'],
  ['educacao', 'cursinho preparatório para exames de residência']
];
for (const [ramo, texto] of FALSOS_ALARMES_DA_REVISAO) {
  test(`revisão técnica, falso alarme: ramo ${ramo} + "${texto}" -> quieto`, () => {
    assert.deepEqual(Coerencia.conferirCoerencia({ ramo }, texto), { ok: true });
  });
}

test('negação DEPOIS da palavra, na mesma oração ("padaria não, é consultoria")', () => {
  assert.deepEqual(Coerencia.conferirCoerencia({ ramo: 'servicos' }, 'padaria nao, faço consultoria de gestão'), { ok: true });
  assert.deepEqual(Coerencia.conferirCoerencia({ ramo: 'servicos' }, 'padaria eu nunca tive, faço consultoria'), { ok: true });
});

test('o retorno só tem ok, duvida e palpite, e o palpite está na tabela de nomes', () => {
  const r = Coerencia.conferirCoerencia({ ramo: 'saude' }, 'tenho uma padaria no centro, fazemos pão e bolo todo dia');
  assert.deepEqual(Object.keys(r).sort(), ['duvida', 'ok', 'palpite']);
  assert.ok(Object.prototype.hasOwnProperty.call(Coerencia.NOMES, r.palpite));
});

test('são pelo menos 40 casos escritos antes do código (aceite 1 da Fase 4)', () => {
  assert.ok(CASOS.length >= 40, String(CASOS.length));
});

for (const [ramo, texto, espera] of CASOS) {
  test(`coerência: ramo ${ramo} + "${texto}" -> ${espera ?? 'quieto'}`, () => {
    const r = Coerencia.conferirCoerencia({ ramo }, texto);
    if (espera === null) assert.deepEqual(r, { ok: true });
    else assert.deepEqual(r, { ok: false, duvida: 'ramo', palpite: espera });
  });
}

/* perguntas que o outro agente esperava e a regra NÃO faz, de propósito: a palavra do ramo tocado aparece no texto (aqui, "Clínica"
   no nome), e a regra prefere não perguntar a perguntar errado. Falso alarme e palpite errado não têm exceção nenhuma */
const PERDAS_CONHECIDAS = ['Clínica do Pão: padaria e confeitaria, café da manhã e bolos por encomenda'];

test('os 20 casos do outro agente (escritos sem ver o código): nenhum falso alarme, nenhum palpite errado', () => {
  const independentes = JSON.parse(readFileSync(new URL('./coerencia-casos-independentes.json', import.meta.url), 'utf8'));
  assert.ok(independentes.length >= 20, String(independentes.length));
  const resultado = independentes.map(c => ({ c, r: Coerencia.conferirCoerencia({ ramo: c.ramo }, c.texto) }));
  const alarmes = resultado.filter(({ c, r }) => c.espera === null && r.ok !== true).map(({ c }) => c.texto);
  const errados = resultado.filter(({ c, r }) => c.espera !== null && r.ok === false && r.palpite !== c.espera).map(({ c }) => c.texto);
  const perdidas = resultado.filter(({ c, r }) => c.espera !== null && r.ok === true).map(({ c }) => c.texto);
  assert.deepEqual(alarmes, [], 'falso alarme');
  assert.deepEqual(errados, [], 'palpite errado');
  assert.deepEqual(perdidas, PERDAS_CONHECIDAS, 'perguntas que a regra deixou de fazer (só as conhecidas)');
});

test('o palpite é sempre um dos 7 ramos de verdade (nunca "outro"), e o nome dele existe', () => {
  for (const [ramo, texto] of CASOS) {
    const r = Coerencia.conferirCoerencia({ ramo }, texto);
    if (r.ok) continue;
    assert.ok(RAMOS.includes(r.palpite) && r.palpite !== 'outro', r.palpite);
    assert.equal(typeof Coerencia.NOMES[r.palpite], 'string');
  }
  assert.deepEqual(Object.keys(Coerencia.NOMES).sort(), RAMOS.filter(r => r !== 'outro').sort());
});

test('nunca lança e nunca devolve texto da pessoa (a tela só mostra o nome do ramo, da tabela)', () => {
  const estranhos = [undefined, null, 42, {}, [], 'x'.repeat(50000), '<script>padaria</script> pão e bolo todo dia'];
  for (const texto of estranhos) {
    for (const respostas of [undefined, null, 'saude', { ramo: 'saude' }, { ramo: '__proto__' }, { ramo: 'constructor' }]) {
      const r = Coerencia.conferirCoerencia(respostas, texto);
      assert.ok(r && typeof r.ok === 'boolean');
      assert.ok(!JSON.stringify(r).includes('<'), JSON.stringify(r));
    }
  }
});

test('o mesmo caso sempre dá a mesma resposta (determinismo, sem sorteio)', () => {
  const a = Coerencia.conferirCoerencia({ ramo: 'saude' }, 'tenho uma padaria no centro, fazemos pão e bolo todo dia');
  for (let i = 0; i < 5; i++) assert.deepEqual(Coerencia.conferirCoerencia({ ramo: 'saude' }, 'tenho uma padaria no centro, fazemos pão e bolo todo dia'), a);
});
