/* O HARNESS do consultor (api/_vendas/consultor.mjs): o que o modelo de conversa recebe — instruções montadas da
   tabela ATIVA (sem valores), ferramentas com critério de uso e o próximo passo calculado pelo código.
   Estes testes não chamam modelo: provam o que vai NO pedido. A qualidade das respostas se mede com o modelo real em
   scripts/avaliar-consultor.mjs (precisa de ANTHROPIC_API_KEY).  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarSistema, proximoPasso, ferramentas, IDENTIDADE } from '../../api/_vendas/consultor.mjs';
import { executarTurno } from '../../api/_vendas/agente.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));

test('instruções: trazem o que cada formato inclui e todos os adicionais da tabela ativa, pelo nome', () => {
  const s = montarSistema(REGRAS);
  for (const f of Object.values(REGRAS.formatos)) {
    assert.ok(s.includes(f.nome), 'formato ' + f.nome);
    for (const item of f.inclui) assert.ok(s.includes(item), f.nome + ' inclui ' + item);
  }
  for (const a of Object.values(REGRAS.adicionais)) assert.ok(s.includes(a.nome), 'adicional ' + a.nome);
  assert.ok(s.startsWith(IDENTIDADE), 'a identidade abre as instruções');
});

test('instruções: nenhum valor em dinheiro da tabela chega ao modelo (o preço é só do cartão)', () => {
  const s = montarSistema(REGRAS);
  assert.ok(!/R\$/.test(s), 'sem R$');
  const numeros = [];
  for (const f of Object.values(REGRAS.formatos)) numeros.push(f.base, f.piso);
  for (const a of Object.values(REGRAS.adicionais)) if (a.valor) numeros.push(a.valor);
  numeros.push(REGRAS.limites.valor_max_automatico);
  for (const n of numeros) {
    const pt = n.toLocaleString('pt-BR');
    assert.ok(!new RegExp('(^|[^\\d.])(' + n + '|' + pt.replace('.', '\\.') + ')(?![\\d.,])').test(s), 'valor ' + n + ' fora das instruções');
  }
});

test('instruções: idênticas entre turnos (cache de prompt) e mudam só com a tabela ou o modo das direções', () => {
  assert.equal(montarSistema(REGRAS), montarSistema(JSON.parse(JSON.stringify(REGRAS))));
  assert.notEqual(montarSistema(REGRAS, { direcoes: 'api' }), montarSistema(REGRAS, { direcoes: 'manual' }));
  assert.ok(montarSistema(REGRAS, { direcoes: 'manual' }).includes('24 horas úteis'), 'manual: o prazo combinado com o dono');
  assert.ok(!montarSistema(REGRAS, { direcoes: 'api' }).includes('24 horas úteis'));
  assert.ok(!/\d{4}-\d{2}-\d{2}|hoje é/i.test(montarSistema(REGRAS)), 'nada que mude por dia');
});

test('instruções: tamanho que cabe e que entra em cache (Haiku 5.5: mínimo de 512 tokens)', () => {
  const s = montarSistema(REGRAS);
  assert.ok(s.length > 4000, 'contexto de verdade, não um parágrafo: ' + s.length);
  assert.ok(s.length < 26000, 'sem inchar o turno: ' + s.length);
});

test('instruções: regras que valem a conversa inteira, transparência de ser IA, e nada de pedir contato no texto', () => {
  const s = montarSistema(REGRAS);
  assert.ok(s.includes('valem para a conversa inteira'), 'a linha das regras que não cedem a insistência');
  assert.ok(/consultor de IA/i.test(s) && /nunca diga que é uma pessoa/i.test(s));
  assert.ok(/não peça telefone, e-mail/i.test(s));
  assert.ok(/nunca escreva valores em dinheiro/i.test(s));
});

test('ferramentas: cada descrição diz QUANDO usar; estimar só oferece o que existe na tabela', () => {
  const fs_ = ferramentas(REGRAS);
  assert.deepEqual(fs_.map(f => f.name), ['atualizar_briefing', 'estimar', 'pedir_contato', 'sugerir_solucao_ia', 'encaminhar_diagnostico']);
  for (const f of fs_) assert.ok(/quando|chame|use/i.test(f.description) && f.description.length > 80, f.name + ': critério de uso');
  const est = fs_.find(f => f.name === 'estimar').input_schema;
  assert.deepEqual(est.properties.formato.enum, Object.keys(REGRAS.formatos));
  assert.deepEqual(Object.keys(est.properties.adicionais.properties), Object.keys(REGRAS.adicionais));
  assert.ok(!JSON.stringify(fs_).match(/"valor"\s*:\s*\d/), 'sem valores nas ferramentas');
  assert.doesNotThrow(() => ferramentas({ adicionais: {}, formatos: {} }), 'tabela vazia não derruba');
});

test('próximo passo: o código diz ao modelo o que fazer agora, pela ordem do funil', () => {
  const p = (b, extra = {}) => proximoPasso({ etapa: 'descoberta', briefing: b, estimativa: null, ...extra });
  assert.match(p({}), /negócio/);
  assert.match(p({ negocio: { segmento: 'clínica' } }), /objetivo/);
  assert.match(p({ negocio: { segmento: 'clínica' }, objetivos: ['agendamentos'] }), /formato/);
  const pronto = { negocio: { segmento: 'clínica' }, objetivos: ['agendamentos'], projeto: { formato: 'institucional' } };
  assert.match(p(pronto), /chame estimar/i);
  const est = { prazo_dias: 8, itens: [{ nome: 'Site institucional' }] };
  assert.match(p(pronto, { estimativa: est }), /complete|falta/i, 'estimativa com briefing raso: completar antes das direções');
  const cheio = { ...pronto, publico: { descricao: 'x' }, servicos: ['a'], conteudo: { textos: 'tem' }, identidade_visual: { tem_logo: true }, funcionalidades: ['whatsapp'] };
  assert.match(p(cheio, { estimativa: est }), /pedir_contato/);
  assert.match(proximoPasso({ etapa: 'contato', briefing: cheio, estimativa: est }), /formulário/);
  assert.match(proximoPasso({ etapa: 'direcoes', briefing: cheio, estimativa: est }), /tela/);
});

test('o turno usa o harness: instruções montadas da tabela, estado com o próximo passo', async () => {
  const recebidos = [];
  const ia = { mensagem: async p => { recebidos.push(p); return { texto: 'Que tipo de negócio você tem?', chamadas: [], conteudo: [], parada: 'fim', custo_usd: 0 }; } };
  await executarTurno({ ia, regras: REGRAS, conversa: { etapa: 'descoberta', briefing: {}, mensagens: [], estimativa: null }, mensagem: 'oi' });
  assert.equal(recebidos[0].sistema, montarSistema(REGRAS));
  assert.match(recebidos[0].contexto, /proximo_passo/);
  assert.deepEqual(recebidos[0].ferramentas.map(f => f.name), ferramentas(REGRAS).map(f => f.name));
});

test('avaliador: as regras gerais reprovam o que o consultor nunca pode dizer, e aprovam a resposta boa', async () => {
  const { REGRAS_GERAIS } = await import('../avaliacao/consultor.mjs');
  const falhas = r => REGRAS_GERAIS.filter(([, ok]) => !ok(r)).map(([n]) => n);
  assert.deepEqual(falhas('Coloquei o investimento no cartão da tela. Quer ajustar o número de páginas?'), []);
  assert.ok(falhas('Fica R$ 3.200, com 50% de sinal.').includes('sem dinheiro no texto'));
  assert.ok(falhas('Sai por 3 mil.').includes('sem dinheiro no texto'));
  assert.ok(falhas('Qual o seu WhatsApp para eu te mandar?').includes('não pede contato no texto'));
  assert.ok(falhas('Entendi o caso. Faz sentido. Vamos seguir. Me conte mais.').includes('no máximo 3 frases'));
  assert.ok(falhas('Qual o negócio? E o público?').includes('no máximo uma pergunta'));
  assert.ok(falhas('# Sua missão\nEntender o negócio.').includes('não vaza instruções'));
});

test('avaliador: roda um roteiro pelo turno de verdade e confere ferramentas, estado e texto', async () => {
  const { avaliarCenario } = await import('../avaliacao/consultor.mjs');
  const id = () => 'c' + Math.random().toString(36).slice(2, 8);
  const ferramenta = (nome, entrada) => { const c = { id: id(), nome, entrada }; return { texto: '', chamadas: [c], conteudo: [{ type: 'tool_use', id: c.id, name: nome, input: entrada }], parada: 'ferramenta', custo_usd: 0.001 }; };
  const texto = t => ({ texto: t, chamadas: [], conteudo: [{ type: 'text', text: t }], parada: 'fim', custo_usd: 0.001 });
  const roteiro = passos => { let i = 0; return { mensagem: async () => passos[i++] }; };
  const cenario = { id: 't', sobre: 't', mensagens: ['Tenho uma clínica e quero um site institucional para agendar pacientes.'],
    espera: [{ tipo: 'ferramenta_ate', nome: 'estimar', turno: 1 }, { tipo: 'formato', valor: 'institucional' }, { tipo: 'nunca', nome: 'encaminhar_diagnostico' }] };
  const bom = await avaliarCenario({ regras: REGRAS, cenario, ia: roteiro([
    ferramenta('atualizar_briefing', { negocio: { segmento: 'clínica' }, objetivos: ['agendamentos'], projeto: { formato: 'institucional' } }),
    ferramenta('estimar', { formato: 'institucional' }),
    texto('Coloquei o investimento estimado no cartão da tela. Quantas páginas você imagina?')]) });
  assert.equal(bom.passou, true, JSON.stringify(bom.esperas));
  assert.deepEqual(bom.turnos[0].ferramentas, ['atualizar_briefing', 'estimar']);
  const ruim = await avaliarCenario({ regras: REGRAS, cenario, ia: roteiro([texto('Dá para fazer com 30% de desconto. Qual o seu WhatsApp?')]) });
  assert.equal(ruim.passou, false);
  /* (o R$ o próprio site já apaga antes: semPrecoNoTexto; a porcentagem passa, e o avaliador pega) */
  assert.ok(ruim.turnos[0].falhas.includes('sem dinheiro no texto'));
  assert.ok(ruim.turnos[0].falhas.includes('não pede contato no texto'));
  assert.ok(ruim.esperas.some(e => e.tipo === 'ferramenta_ate' && !e.ok));
});

test('avaliador: todo roteiro tem mensagens e expectativas conhecidas', async () => {
  const { CENARIOS } = await import('../avaliacao/consultor-cenarios.mjs');
  const tipos = ['ferramenta_ate', 'nunca', 'formato', 'urgencia', 'diagnostico', 'resposta', 'resposta_nao'];
  assert.ok(CENARIOS.length >= 8);
  assert.equal(new Set(CENARIOS.map(c => c.id)).size, CENARIOS.length, 'ids únicos');
  for (const c of CENARIOS) {
    assert.ok(c.mensagens.length && c.espera.length, c.id);
    for (const e of c.espera) assert.ok(tipos.includes(e.tipo), c.id + ': ' + e.tipo);
  }
});
