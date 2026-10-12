/* O catálogo público (api/_vendas/catalogo.mjs): só o que a tela mostra, nada interno; extras por ramo e formato. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogoPublico, respostasParaBriefing } from '../../api/_vendas/catalogo.mjs';
import { limparAtualizacao } from '../../api/_vendas/briefing.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));

test('nada interno sai: prioridade, prazo por item, piso, limites, descontos', () => {
  const c = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' });
  const texto = JSON.stringify(c);
  for (const proibido of ['prioridade', 'prazo_dias', 'piso', 'valor_max', 'descontos', 'limites']) assert.ok(!texto.includes(proibido), proibido);
  assert.ok(c.formatos.find(f => f.chave === 'institucional').inclui.length > 0, 'o que já vem no pacote');
});

test('extras: os do ramo nos principais; os da loja só com a loja; dependentes com requer; fora do automático = fale comigo', () => {
  const saude = catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' });
  const chaves = l => l.map(e => e.chave);
  assert.ok(chaves(saude.extras.principais).includes('agendamento'));
  assert.ok(!chaves(saude.extras.principais).includes('catalogo'));
  assert.ok(chaves(saude.extras.mais).includes('area_restrita'));
  assert.ok(!chaves([...saude.extras.principais, ...saude.extras.mais]).includes('marketplace'), 'extra da loja fora da loja');
  assert.ok(chaves(catalogoPublico(REGRAS, { formato: 'loja_plataforma', ramo: 'comercio' }).extras.principais).includes('marketplace'));
  assert.deepEqual(saude.extras.mais.find(e => e.chave === 'area_documentos').requer, ['area_restrita']);
  const fora = saude.extras.mais.find(e => e.chave === 'sistema_sob_medida');
  assert.equal(fora.fale_comigo, true);
  assert.equal(fora.valor, null);
  for (const e of [...saude.extras.principais, ...saude.extras.mais]) assert.ok(e.frase && !/sob medida/i.test(e.frase), e.chave);
});

test('urgência pública: acréscimo e prazo, sem o nome interno', () => {
  assert.deepEqual(catalogoPublico(REGRAS, { formato: 'institucional', ramo: 'saude' }).urgencia, { acrescimo_percentual: 30, prazo_fator: 0.6 });
});

test('respostas → briefing que o limparAtualizacao aceita inteiro', () => {
  const b = respostasParaBriefing({ ramo: 'saude', outro: '', cidade: 'Goiânia', objetivos: ['agendamentos', 'achado_google'], site_atual: 'instagram', material: 'nao', assumido: [] }, 'institucional');
  assert.deepEqual(limparAtualizacao(b), b);
  assert.deepEqual(b.objetivos, ['agendamentos', 'outro']);
  assert.equal(b.objetivo_detalhe, 'ser achado no Google');
  assert.equal(b.negocio.cidade, 'Goiânia');
  assert.equal(b.conteudo.textos, 'nao');
  assert.equal(b.projeto.formato, 'institucional');
});
