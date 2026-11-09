/* RODADA REAL 8, AJUSTE 1: o que a lista dura recusava de falso positivo nos textos REAIS do modelo (advogado-familia: "o número da OAB", "em Curitiba").
   Cada porta aberta tem aqui o ataque equivalente que continua fechado.  node --test docs/testes/planta-textos4.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDoPlanoPermitido, SIGLAS_DE_CONSELHO } from '../../api/_vendas/planta-textos.mjs';
import { validarPlano } from '../../api/_vendas/planta-esquema.mjs';
import { resolverDesenho, turnoDaPlantaInicial, montarPlanta } from '../../api/_vendas/planta.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';

const motivo = (t, o) => { const r = textoDoPlanoPermitido(t, o); return r.ok ? 'ok' : r.motivo; };

test('sigla de conselho profissional (OAB, CREFITO...) passa; sigla qualquer continua marca', () => {
  for (const s of ['OAB', 'CREFITO', 'CRO', 'CRP', 'CRN', 'CREA']) {
    assert.equal(motivo('A página mostra quem atende, o número da ' + s + ' e a área de atuação.'), 'ok', s);
    assert.equal(motivo('A página mostra quem atende, o registro no ' + s + ' e a área.'), 'ok', s);
  }
  assert.ok(SIGLAS_DE_CONSELHO.includes('OAB'));
  /* a porta é só dessas siglas, escritas em caixa alta */
  for (const s of ['BMW', 'IBM', 'CRM', 'SEBRAE', 'CNPJ', 'SAP', 'Oab', 'oab ltda', 'OABX', 'XOAB']) {
    const m = motivo('A página mostra quem atende, o número da ' + s + ' e a área de atuação.');
    if (s === 'oab ltda') continue;   /* minúscula nunca foi sigla */
    assert.equal(m, 'marca', s);
  }
  /* a sigla não leva carona: as outras listas seguem valendo ao lado dela */
  assert.notEqual(motivo('A página mostra a OAB e garante o resultado do caso.'), 'ok');
  assert.notEqual(motivo('A OAB aprova o desconto para quem pagar hoje mesmo.'), 'ok');
  assert.equal(motivo('A página mostra a OAB e o perfil do escritório no Instagram.'), 'marca');
  assert.equal(motivo('A página mostra a OAB e responde em instantes.'), 'prazo');
});

test('cidade que a pessoa deu passa; sem ela, nome próprio é marca; ela não abre outras portas', () => {
  const t = 'O mapa mostra onde fica o escritório em Curitiba e como chegar.';
  assert.equal(motivo(t), 'marca');
  assert.equal(motivo(t, { cidade: 'Curitiba' }), 'ok');
  assert.equal(motivo('O mapa mostra onde fica o escritório em Rappi e como chegar.', { cidade: 'Curitiba' }), 'marca');
  assert.equal(motivo('O mapa mostra onde fica o escritório em Instagram.', { cidade: 'Instagram' }), 'marca', 'plataforma como "cidade" segue recusada');
  assert.equal(motivo('O mapa mostra onde fica o escritório em Itaú.', { cidade: 'Itaú' }), 'marca');
  assert.equal(motivo(t, { cidade: 'x'.repeat(500) + ' Curitiba' }), 'marca');
  assert.equal(motivo('O mapa mostra o escritório em Curitiba e promete o dobro de clientes.', { cidade: 'Curitiba' }), 'promessa');
});

const PLANO_COM_CIDADE = () => {
  const p = JSON.parse(JSON.stringify(planoPadrao('saude_agenda')));
  p.chegada.frase = 'A pessoa chega pela busca ou pelo mapa e vê o escritório em Curitiba.';
  return p;
};

test('o validador do plano e o fluxo do turno carregam a cidade; a planta gravada revalida com ela', () => {
  assert.equal(validarPlano(PLANO_COM_CIDADE(), { nomeDoNegocio: '' }).ok, false);
  assert.equal(validarPlano(PLANO_COM_CIDADE(), { nomeDoNegocio: '', cidade: 'Curitiba' }).ok, true);
  const ctx = { estimativaNoInicio: true, nMensagens: 2, regulado: false, nomeDoNegocio: '', cidade: 'Curitiba' };
  const d = resolverDesenho({ entrada: PLANO_COM_CIDADE(), briefing: { negocio: { cidade: 'Curitiba' } }, turno: turnoDaPlantaInicial(), ctx });
  assert.equal(d.saida.ok, true);
  assert.equal(d.briefing.planta.origem, 'modelo');
  const m = montarPlanta(d.briefing, {});
  assert.equal(m.origem, 'modelo', 'a leitura revalida com a cidade do briefing e não cai no padrão');
  const sem = montarPlanta({ ...d.briefing, negocio: {} }, {});
  assert.equal(sem.origem, 'padrao', 'sem a cidade no briefing, a revalidação recusa');
});
