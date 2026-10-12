/* O catálogo público (api/_vendas/catalogo.mjs): só o que a tela mostra, nada interno; extras por ramo e formato. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogoPublico, respostasParaBriefing, FRASES } from '../../api/_vendas/catalogo.mjs';
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

/* os dois cenários juntos cobrem todos os adicionais da tabela (os da loja só aparecem com a loja) */
function todosOsExtras() {
  const cenarios = [{ formato: 'institucional', ramo: 'saude' }, { formato: 'loja_plataforma', ramo: 'comercio' }];
  const porChave = new Map();
  for (const cenario of cenarios) {
    const c = catalogoPublico(REGRAS, cenario);
    for (const e of [...c.extras.principais, ...c.extras.mais]) porChave.set(e.chave, e);
  }
  return { extras: [...porChave.values()], formatos: catalogoPublico(REGRAS, cenarios[0]).formatos };
}

test('texto de tela: nenhum nome nem frase (extras e formatos) diz "sob medida" ou "briefing"', () => {
  const { extras, formatos } = todosOsExtras();
  assert.equal(extras.length, Object.keys(REGRAS.adicionais).length, 'todos os extras foram conferidos');
  for (const item of [...extras, ...formatos]) {
    assert.ok(!/sob medida|briefing/i.test(item.nome), `nome de ${item.chave}: ${item.nome}`);
    if ('frase' in item) assert.ok(!/sob medida|briefing/i.test(item.frase), `frase de ${item.chave}`);
  }
});

test('todo adicional da tabela tem frase própria (chave nova não cai no nome cru da tabela)', () => {
  for (const chave of Object.keys(REGRAS.adicionais)) assert.ok(chave in FRASES, `falta frase para ${chave}`);
  for (const e of todosOsExtras().extras) assert.notEqual(e.frase, REGRAS.adicionais[e.chave].nome, e.chave);
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

test('respostas ruins não quebram nem deixam chave undefined no briefing', () => {
  let b;
  assert.doesNotThrow(() => { b = respostasParaBriefing({ ramo: 'x', objetivos: 'y', material: 'z', outro: '', cidade: '' }, 'institucional'); });
  assert.ok(!('objetivos' in b), 'objetivos que não é lista: sem objetivos');
  assert.ok(!b.negocio?.segmento, 'ramo desconhecido: sem segmento');
  assert.ok(!b.conteudo, 'material desconhecido: sem textos');
  assert.ok(!JSON.stringify(b).includes('undefined') && Object.values(b).every(v => v !== undefined));
  assert.deepEqual(limparAtualizacao(b), b);
});

/* revisão de segurança do PR 37: o texto livre (outro ramo, cidade) vai ao briefing; telefone e e-mail digitados ali
   são trocados por marcadores, como a privacidade promete para o que se escreve no orçamento */
test('texto livre do formulário: telefone e e-mail viram marcadores no briefing', () => {
  const b = respostasParaBriefing({ ramo: 'outro', outro: 'Doceria 11 98765-4321', cidade: 'fulano@exemplo.com', objetivos: [] }, 'landing_page');
  assert.ok(!/98765|fulano@/.test(JSON.stringify(b)), JSON.stringify(b.negocio));
  assert.match(b.negocio.segmento, /Doceria \[telefone\]/);
  assert.equal(b.negocio.cidade, '[e-mail]');
  assert.equal(respostasParaBriefing({ ramo: 'outro', outro: 'Doceria', cidade: 'Campo Grande', objetivos: [] }, 'landing_page').negocio.cidade, 'Campo Grande', 'texto comum fica igual');
});
