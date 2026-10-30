/* PREÇO POR MARCA (re-revisão R2 e T1): a IA NUNCA escreve valor. Para citar preço ela escreve [[preco:ID]] e o CÓDIGO troca pelo item e valor da
   tabela, formatados por nós. O que sobrar de valor monetário escrito pela IA é rejeitado; número que não é preço (horário, endereço, telefone)
   só passa quando está literalmente na base. Também: negação de IA (R3), interruptor (R5), redação de dado pessoal e resumo fixo no wa.me (R6).
   node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarResposta, idsDePrecos, negaSerIA, interruptorLigado, redigirVisitante, linkWhatsapp } from '../../api/_atendente/regras.mjs';
import { montarContexto, montarSistema } from '../../api/_atendente/agente.mjs';

const BASE = [
  { tipo: 'pergunta', pergunta: 'Qual o horário?', resposta: 'Atendemos de segunda a sexta, das 8h às 18h. Fica na Rua das Flores, 100.' },
  { tipo: 'pergunta', pergunta: 'Tem desconto?', resposta: 'Há vinte anos no bairro. Não damos desconto. Parcelamos no cartão.' },
  { tipo: 'preco', item: 'Limpeza', preco_centavos: 18000 },
  { tipo: 'preco', item: 'Implante', preco_centavos: 250000 },
  { tipo: 'preco', item: 'Gel', preco_centavos: 5000 }
];
const ok = t => processarResposta(t, BASE);

test('as marcas viram item e valor da tabela, formatados por nós (inclusive item de 3 letras)', () => {
  const ids = idsDePrecos(BASE);
  assert.equal(ids.size, 3);
  assert.equal(ok('[[preco:p1]]').texto, 'Limpeza: R$ 180,00');
  assert.equal(ok('Custa [[preco:p2]].').texto, 'Custa Implante: R$ 2.500,00.');
  assert.equal(ok('[[preco:p3]]').texto, 'Gel: R$ 50,00');
  assert.equal(ok('Temos [[preco:p1]] e [[preco:p3]].').texto, 'Temos Limpeza: R$ 180,00 e Gel: R$ 50,00.');
});

test('id desconhecido ou marca quebrada: rejeita (resposta fixa com passagem para pessoa)', () => {
  for (const t of ['[[preco:p9]]', '[[preco:]]', '[[preco:p1', 'Custa [[preco:../x]].', '[[outra:p1]]', 'Custa [[ preco:p1 ]].']) assert.equal(ok(t).ok, false, t);
});

test('valor escrito pela IA é rejeitado (os exemplos da re-revisão R2 e T1)', () => {
  const barra = ['O implante custa 180.', 'Implante: 180,00', 'A limpeza custa 2500.', '180 o implante', 'A limpeza custa R$ 100.', 'Custa R$ 18.', 'Limpeza por R$ 8,00',
    'Custa oito.', 'cinco contos', 'cinco paus', 'sai por nove pratas', 'zero reais', 'Fica sem custo.', 'sem cobrança', 'de brinde', 'isento', 'com cupom', 'um terço do preço',
    'Custa ９０.', 'Custa ٩٠.', 'ninety reais', 'one hundred reais', 'XC reais', 'cento e cinquenta reais', 'noventa reais', 'duzentos reais de desconto', 'Parcelamos em dez vezes.',
    'Custa 90.', 'A limpeza sai por 2k.', 'Temos 50% de desconto.', '3x de 60', 'R$ 90', 'É de graça.', 'Gel custa 50.', 'Custa R$ 180,00.', 'O valor é R$ 180,00.', 'A limpeza é 180 reais.',
    'O custo é de cem.', 'Fica por apenas 49.', 'uns 2 mil', 'Atendemos às 9h.', 'Temos desconto à vista.', 'um real', 'R $ 90', 'US$ 90', '90 dólares'];
  for (const t of barra) assert.equal(ok(t).ok, false, t);
});

test('a marca vale em qualquer frase: não precisa repetir o nome do item (T1)', () => {
  for (const t of ['Custa [[preco:p1]].', 'O valor é [[preco:p1]].', 'Sai por [[preco:p1]].', '[[preco:p1]]', 'Claro! [[preco:p1]] Quer marcar?']) assert.equal(ok(t).ok, true, t);
});

test('o que não é preço passa quando está literalmente na base: horário, endereço, frase do dono', () => {
  for (const t of ['Atendemos de segunda a sexta, das 8h às 18h.', 'Fica na Rua das Flores, 100.', 'Não damos desconto.', 'Há vinte anos no bairro.', 'Parcelamos no cartão.',
    'Posso ajudar com outra dúvida?', 'Essa eu não sei, vou chamar a equipe.']) assert.equal(ok(t).ok, true, t);
});

test('a palavra de risco só passa na frase que o próprio dono escreveu: repetir literal passa, outra frase com a mesma palavra não', () => {
  assert.equal(ok('Não damos desconto.').ok, true);
  assert.equal(ok('Hoje damos desconto de verdade.').ok, false);
  assert.equal(ok('Não damos desconto. Mas temos 20% hoje.').ok, false);
});

test('o prompt não mostra valor nenhum e manda a IA usar a marca', () => {
  const ctx = montarContexto(BASE), sis = montarSistema({ nome: 'Clínica Teste' });
  assert.doesNotMatch(ctx, /180|2\.?500|50,00|18000|valor_reais|preco_centavos/);
  assert.match(ctx, /"id":"p1"/);
  assert.match(sis, /\[\[preco:ID\]\]/);
  assert.match(sis, /NUNCA escreva valor/i);
});

test('R3: negação de IA, frases novas', () => {
  for (const t of ['Sou Ana.', 'Aqui é Ana.', 'Sou da equipe.', 'Sou funcionária da clínica.', 'Você está falando com uma pessoa.', 'Somos humanos.', 'Somos pessoas reais.', 'Não é um robô.',
    'Não é uma IA.', 'Aqui não tem robô.', 'Nao sou nenhum robo.', 'N sou robô', "I'm a real person."]) assert.equal(negaSerIA(t), true, t);
  for (const t of ['Sou o assistente virtual da Clínica, uma inteligência artificial.', 'Sou uma IA e posso ajudar.', 'Sou um assistente virtual.', 'Não sou capaz de informar isso.', 'Atendemos de segunda a sexta.']) assert.equal(negaSerIA(t), false, t);
});

test('R5: o interruptor fecha por padrão: só vazio ou "ligado" (sem diferenciar maiúscula) liga', () => {
  for (const v of ['ligado', 'LIGADO', 'Ligado', ' ligado ']) assert.equal(interruptorLigado(v), true, String(v));
  for (const v of [undefined, '', '  ', 'desligado', 'Desligado', 'off', 'OFF', 'nao', '0', 'false', 'sim', 'x']) assert.equal(interruptorLigado(v), false, String(v));
});

test('R6: redigirVisitante pega dois espaços, e-mail disfarçado, CEP, RG e telefone sem DDD', () => {
  for (const t of ['meu cpf 123  456  789  09', 'ana @ gmail . com', 'ana (at) gmail (dot) com', 'cep 24020-000', 'rg 12.345.678-9', 'liga 9999-8888', 'liga 3333-4444', 'cpf 123.456.789-09', 'ana@exemplo.com']) {
    assert.doesNotMatch(redigirVisitante(t), /123\s+456|ana\s*@|\(at\)|24020|12\.345|9999|3333|123\.456|exemplo/i, t);
  }
  assert.match(redigirVisitante('Quanto custa uma limpeza? Atendem às 8h?'), /Quanto custa uma limpeza\? Atendem às 8h\?/);
});

test('R6: o link do WhatsApp leva um resumo FIXO, sem as falas do visitante', () => {
  const url = linkWhatsapp({ whatsapp: '5521999990000' });
  const texto = new URL(url).searchParams.get('text');
  assert.match(texto, /Vim pelo site/);
  assert.equal(url.startsWith('https://wa.me/5521999990000?text='), true);
  assert.equal(linkWhatsapp({ whatsapp: null }), null);
});
