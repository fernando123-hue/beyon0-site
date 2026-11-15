/* A CONFERÊNCIA DOS MODELOS EM NICHO REGULADO (api/_vendas/conferencia-regulada.mjs; spec docs/superpowers/specs/2026-11-15-nicho-regulado-design.md
   §6). Cada regra com um caso que falha e um texto honesto que passa, por conselho. node --test docs/testes/conferencia-regulada.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conferirDirecao, falhasParaModelo, MARCADOR_REGISTRO, CONSELHOS } from '../../api/_vendas/conferencia-regulada.mjs';

/* um modelo honesto de clínica, que passa em todo conselho de saúde (sem preço, promessa, superlativo, depoimento) */
const base = (rodape, extra = {}) => ({
  nome_conceito: 'Clareza que acolhe', resumo: 'Um site calmo que mostra quem atende e como marcar.',
  navegacao: { marca: 'Clínica Sol', itens: ['Tratamentos', 'Equipe', 'Contato'], cta: 'Agendar' },
  secoes: [
    { tipo: 'hero', variante: 'split', rotulo: 'Niterói', titulo: 'Cuidado com calma, do primeiro contato ao retorno', subtitulo: 'Atendemos convênios e particulares.', texto: '', itens: [], cta: 'Como agendar' },
    { tipo: 'servicos', variante: 'cartoes', rotulo: 'Tratamentos', titulo: 'O que fazemos', subtitulo: '', texto: '', itens: [{ titulo: 'Avaliação', texto: 'A primeira conversa explica o tratamento.' }], cta: '' },
    { tipo: 'sobre', variante: 'split', rotulo: 'Quem atende', titulo: 'Nossos valores', subtitulo: '', texto: 'A partir de hoje você agenda pelo site.', itens: [], cta: '' }
  ],
  rodape: { texto: rodape },
  ...extra
});
const comTexto = (direcao, texto) => ({ ...direcao, secoes: [...direcao.secoes, { tipo: 'faq', variante: 'lista', rotulo: '', titulo: texto, subtitulo: '', texto: '', itens: [], cta: '' }] });
const regras = (r) => r.falhas.map(f => f.regra);

test('nicho comum: não confere nada', () => {
  assert.deepEqual(conferirDirecao(comTexto(base(''), 'O melhor preço, R$ 99, garantido'), null), { ok: true, falhas: [] });
});

test('o modelo honesto passa em cada conselho de saúde (com o registro ou o marcador)', () => {
  for (const [chave, c] of Object.entries(CONSELHOS)) {
    if (c.tipo !== 'saude') continue;
    const sig = c.registro === 'registro' ? 'CRBM' : c.registro;
    assert.deepEqual(regras(conferirDirecao(base('Dra. Ana Souza · ' + sig + '-RJ 12345'), chave)), [], chave);
    assert.deepEqual(regras(conferirDirecao(base('Dra. Ana Souza · ' + MARCADOR_REGISTRO), chave)), [], chave + ' com o marcador');
  }
});

test('saúde: promessa, superlativo, grátis, urgência, antes e depois falham', () => {
  const casos = [['Resultado garantido em 30 dias', 'promessa'], ['Clareamento sem dor', 'promessa'], ['Tratamento milagroso', 'promessa'], ['100% de satisfação', 'promessa'],
    ['O melhor dentista de Niterói', 'superlativo'], ['A única clínica com laser', 'superlativo'], ['Referência em implantes', 'superlativo'],
    ['Avaliação grátis', 'gratis_sorteio'], ['Sorteio de clareamento', 'gratis_sorteio'], ['Últimas vagas do mês', 'urgencia'], ['Só hoje', 'urgencia'],
    ['Veja o antes e depois', 'antes_depois_depoimento'], ['Depoimentos de pacientes', 'antes_depois_depoimento']];
  for (const [t, r] of casos) assert.ok(regras(conferirDirecao(comTexto(base('CRO-RJ 12345'), t), 'odontologia')).includes(r), t);
});

test('preço: proibido em CFO, COFFITO, CFP, CFBM e saúde genérica; o CFM permite; o CFN só a partir de 23/01/2027', () => {
  const comPreco = comTexto(base('CRM-RJ 12345 · CRO-RJ 1 · CREFITO-2 1 · CRP 05/1 · CRN-4 1 · CRBM 1'), 'Consulta por R$ 150, em até 3x no cartão de crédito');
  for (const chave of ['odontologia', 'fisioterapia', 'psicologia', 'biomedicina', 'saude_generica']) assert.ok(regras(conferirDirecao(comPreco, chave)).includes('preco'), chave);
  assert.ok(!regras(conferirDirecao(comPreco, 'medicina')).includes('preco'), 'CFM 2.336/2023 art. 9º VI');
  assert.ok(regras(conferirDirecao(comPreco, 'nutricao', { hoje: '2027-01-22' })).includes('preco'), 'CFN 599/2018 até 22/01/2027');
  assert.ok(!regras(conferirDirecao(comPreco, 'nutricao', { hoje: '2027-01-23' })).includes('preco'), 'CFN 856/2026 a partir de 23/01/2027');
  assert.ok(regras(conferirDirecao(comTexto(base('CRO-RJ 1'), 'Tabela de valores'), 'odontologia')).includes('preco'));
});

test('regras de um conselho só: "popular" (CFO), desconto e "valor acessível" (CFP), desconto (CFN)', () => {
  assert.ok(regras(conferirDirecao(comTexto(base('CRO-RJ 1'), 'Odontologia popular'), 'odontologia')).includes('popular'));
  assert.ok(!regras(conferirDirecao(comTexto(base('CRM-RJ 1'), 'Atendimento popular'), 'medicina')).includes('popular'));
  assert.ok(regras(conferirDirecao(comTexto(base('CRP 05/1'), 'Sessões com valor acessível'), 'psicologia')).includes('valor_social'));
  assert.ok(regras(conferirDirecao(comTexto(base('CRP 05/1'), 'Desconto para estudantes'), 'psicologia')).includes('desconto'));
  assert.ok(regras(conferirDirecao(comTexto(base('CRN-4 1'), 'Promoção de inverno'), 'nutricao', { hoje: '2026-11-15' })).includes('desconto'));
});

test('as seções de depoimentos e de números nunca entram; galeria, equipe e localização podem', () => {
  const d = base('CRO-RJ 1');
  d.secoes.push({ tipo: 'depoimentos', variante: 'cartoes', rotulo: '', titulo: 'Quem já veio', subtitulo: '', texto: '', itens: [], cta: '' });
  d.secoes.push({ tipo: 'numeros', variante: 'faixa', rotulo: '', titulo: 'Em números', subtitulo: '', texto: '', itens: [], cta: '' });
  d.secoes.push({ tipo: 'galeria', variante: 'grade', rotulo: '', titulo: 'O consultório', subtitulo: '', texto: '', itens: [], cta: '' });
  const r = regras(conferirDirecao(d, 'odontologia'));
  assert.ok(r.includes('secao_depoimentos') && r.includes('secao_numeros'));
  assert.ok(!r.includes('secao_galeria'));
});

test('a linha de identificação: sem a sigla do conselho (nem o marcador) no rodapé ou no contato, falha', () => {
  assert.ok(regras(conferirDirecao(base('Clínica Sol · Niterói'), 'odontologia')).includes('identificacao'));
  assert.ok(regras(conferirDirecao(base('CRM-RJ 12345'), 'odontologia')).includes('identificacao'), 'a sigla de OUTRO conselho não vale');
  assert.ok(!regras(conferirDirecao(base('Dr. Rui · cirurgião-dentista · CRO-RJ 12345'), 'odontologia')).includes('identificacao'));
});

test('advocacia (Provimento 205/2021): honorários, resultado, clientes, incitação e superlativo falham; o texto honesto passa', () => {
  const ok = base('Dra. Ana Souza · OAB/RJ 123.456');
  assert.deepEqual(regras(conferirDirecao(ok, 'advocacia')), []);
  const casos = [['Honorários acessíveis', 'honorarios'], ['Consulta gratuita', 'honorarios'], ['Parcelamos em 10x', 'honorarios'], ['R$ 300 a consulta', 'honorarios'],
    ['Ganhamos 95% das causas', 'resultado'], ['Sentença favorável em 60 dias', 'resultado'], ['Indenização de até 10 mil', 'resultado'],
    ['Nossos clientes confiam', 'clientes'], ['Casos de sucesso', 'clientes'], ['Entre com sua ação já', 'incitacao'], ['Não perca seu direito', 'incitacao'],
    ['O escritório mais experiente da cidade', 'superlativo']];
  for (const [t, r] of casos) assert.ok(regras(conferirDirecao(comTexto(ok, t), 'advocacia')).includes(r), t);
  assert.ok(regras(conferirDirecao(base('Escritório Souza'), 'advocacia')).includes('identificacao'));
});

test('revisão: a UF RS na linha do registro não é preço (OAB/RS, CRO-RS)', () => {
  assert.deepEqual(regras(conferirDirecao(base('Dra. Ana · OAB/RS 123456'), 'advocacia')), []);
  assert.deepEqual(regras(conferirDirecao(base('Dr. Rui · CRO-RS 12345'), 'odontologia')), []);
});

test('revisão: "sigilo garantido" passa; "cura garantida" e letras separadas por pontuação falham', () => {
  assert.deepEqual(regras(conferirDirecao(comTexto(base('CRP 07/1'), 'Atendimento com sigilo garantido'), 'psicologia')), []);
  assert.deepEqual(regras(conferirDirecao(comTexto(base('OAB/RJ 1'), 'Garantimos sigilo em cada conversa'), 'advocacia')), []);
  assert.ok(regras(conferirDirecao(comTexto(base('CRM-RJ 1'), 'Cura garantida'), 'medicina')).includes('promessa'));
  assert.ok(regras(conferirDirecao(comTexto(base('CRO-RJ 1'), 'Resultado g.a.r.a.n.t.i.d.o'), 'odontologia')).includes('promessa'));
  assert.ok(regras(conferirDirecao(comTexto(base('CRO-RJ 1'), 'Avaliação g-r-á-t-i-s'), 'odontologia')).includes('gratis_sorteio'));
});

test('revisão: na saúde genérica a identificação exige uma sigla de verdade ("criamos", "crianças" não contam)', () => {
  assert.ok(regras(conferirDirecao(base('Criamos um espaço para crianças'), 'saude_generica')).includes('identificacao'));
  assert.ok(!regras(conferirDirecao(base('Dra. Ana · CRN-4 12345'), 'saude_generica')).includes('identificacao'));
});

test('falsos positivos comuns passam: "nossos valores", "a partir de hoje", "como agendar", "atendemos convênios"', () => {
  assert.deepEqual(regras(conferirDirecao(base('CRO-RJ 1'), 'odontologia')), []);
});

test('as falhas voltam ao modelo só com caminho e regra, nunca com o texto', () => {
  const r = conferirDirecao(comTexto(base('CRO-RJ 1'), 'O melhor clareamento, R$ 499'), 'odontologia');
  const msgs = falhasParaModelo(r.falhas);
  assert.ok(msgs.length >= 2);
  for (const m of msgs) { assert.doesNotMatch(m, /499|clareamento/); assert.match(m, /^secoes\[\d\]/); }
});
