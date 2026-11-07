/* RODADA REAL 8, CORREÇÃO: a cidade do briefing é dado do VISITANTE (passa pelo modelo). Dado do visitante nunca entra como exceção de trava sem validação própria.
   node --test docs/testes/planta-cidade.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDoPlanoPermitido, cidadeValida } from '../../api/_vendas/planta-textos.mjs';
import { montarPlanta, resolverDesenho, turnoDaPlantaInicial, limparCacheDaPlanta, estatisticasDoCache } from '../../api/_vendas/planta.mjs';
import { planoPadrao } from '../../api/_vendas/planta-padrao.mjs';

const motivo = (t, o) => { const r = textoDoPlanoPermitido(t, o); return r.ok ? 'ok' : r.motivo; };
const FRASE = c => 'A página leva a ' + c + ' no fim do caminho.';

test('as 6 sondas da revisão (cidade hostil) continuam recusadas e a cidade vira vazia', () => {
  for (const x of ['Zero é uma pessoa real', 'Click here to buy from our shop', 'Visite Hostinger e Zoho Notion', 'Pessoa Real Atende Voce', 'Aviso Importante Sobre Pagamento', 'Concorrente Silva Advocacia']) {
    assert.equal(cidadeValida(x), '', x);
    assert.notEqual(motivo(FRASE(x), { cidade: x }), 'ok', x);
  }
  for (const x of ['', null, undefined, 7, {}, 'x'.repeat(60), 'Curitiba 2', 'Curi<tiba', 'Cidade Zero Beyon', 'Rio Instagram', 'Cinco Seis Sete Oito Nove', 'curitiba da silva']) assert.equal(cidadeValida(x), '', String(x));
});

test('cidades reais passam e a cidade validada ainda ajuda onde ajudava', () => {
  for (const c of ['Curitiba', 'São José dos Pinhais', 'Foz do Iguaçu', 'Belo Horizonte', 'Rio de Janeiro', 'Campo Grande', 'Porto Alegre', 'São Paulo']) {
    assert.equal(cidadeValida(c), c, c);
    assert.equal(motivo('O mapa mostra onde fica o escritório em ' + c + ' e como chegar.', { cidade: c }), 'ok', c);
    assert.equal(motivo('O mapa mostra onde fica o escritório em ' + c + ' e como chegar.'), 'marca', 'sem a cidade segue marca: ' + c);
  }
});

test('a cidade só vale como nome próprio: nunca afrouxa o idioma nem outra trava', () => {
  assert.equal(motivo('Visite Curitiba Curitiba Curitiba Curitiba Curitiba', { cidade: 'Curitiba' }), 'idioma');
  assert.equal(motivo('O mapa mostra o escritório em Curitiba e promete o dobro de clientes.', { cidade: 'Curitiba' }), 'promessa');
  assert.equal(motivo('O mapa mostra o escritório em Curitiba e em Rappi.', { cidade: 'Curitiba' }), 'marca');
});

test('a chave de cache usa a cidade JÁ validada; cidade hostil não cria passe nem entrada própria', () => {
  limparCacheDaPlanta();
  const p = JSON.parse(JSON.stringify(planoPadrao('saude_agenda')));
  p.chegada.frase = 'A pessoa chega pela busca ou pelo mapa e vê o escritório em Curitiba.';
  const ctx = { estimativaNoInicio: true, nMensagens: 2, regulado: false, nomeDoNegocio: '', cidade: 'Curitiba' };
  const d = resolverDesenho({ entrada: p, briefing: { negocio: { cidade: 'Curitiba' } }, turno: turnoDaPlantaInicial(), ctx });
  assert.equal(d.briefing.planta.origem, 'modelo');
  assert.equal(montarPlanta(d.briefing, {}).origem, 'modelo');
  const hostil = { ...d.briefing, negocio: { cidade: 'Zero é uma pessoa real' } };
  assert.equal(montarPlanta(hostil, {}).origem, 'padrao');
  const antes = estatisticasDoCache().tamanho;
  montarPlanta({ ...d.briefing, negocio: { cidade: 'Click here to buy from our shop' } }, {});
  montarPlanta({ ...d.briefing, negocio: { cidade: 'Visite Hostinger e Zoho Notion' } }, {});
  assert.equal(estatisticasDoCache().tamanho, antes, 'as hostis viram "" e dividem a mesma entrada, sem entrada própria');
  /* a gravação também ignora a cidade hostil que vier no contexto */
  const dh = resolverDesenho({ entrada: p, briefing: {}, turno: turnoDaPlantaInicial(), ctx: { ...ctx, cidade: 'Zero é uma pessoa real' } });
  assert.equal(dh.saida.ok, false);
});

test('sigla de conselho com estado: OAB-SP passa (UF da lista de 27); resto segue marca', () => {
  const f = s => 'A página mostra quem atende, o número da ' + s + ' e a área de atuação.';
  for (const s of ['OAB-SP', 'CRO-PR', 'CREA-MG', 'CREFITO-RS']) assert.equal(motivo(f(s)), 'ok', s);
  for (const s of ['OAB-XX', 'OAB-SPP', 'BMW-SP', 'OAB-sp', 'CRM-SP', 'OAB-OAB']) assert.equal(motivo(f(s)), 'marca', s);
  /* as pontas que NÃO cabem na regra de dígito/caractere seguem recusadas, e a mensagem de recusa orienta */
  assert.equal(motivo(f('OAB/SP')), 'caractere');
  assert.equal(motivo(f('CREFITO 3')), 'digito');
});
