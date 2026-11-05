/* A RODADA FINAL DA CAMADA DE TEXTO (re-revisão de segurança do PR 2a): marca combinante fora do bloco 0300-036F, letra solta junto de artigo, pontuação
   inteira na versão colada, mais inglês e espanhol, raízes de prazo/promessa/preço, e os falsos positivos medidos. Cada caso tem os dois lados.
   Depois desta rodada NÃO se persegue mais vocabulário: o que sobra está em FUROS_CONHECIDOS (planta-textos-casos.mjs).
   node --test docs/testes/planta-textos3.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDoPlanoPermitido, fracaoPortugues, FRACAO_PORTUGUES_MIN, PALAVRAS_MIN_IDIOMA } from '../../api/_vendas/planta-textos.mjs';
import { leituraParaTela } from '../../api/_vendas/planta.mjs';
import { MOLDURAS, HONESTAS, HONESTAS_COM_NOME } from './planta-textos-casos.mjs';

const frases = trecho => MOLDURAS.map(m => m.replace('{X}', trecho));
const cai = (texto, motivos, opcoes) => {
  const r = textoDoPlanoPermitido(texto, opcoes);
  assert.equal(r.ok, false, 'devia recusar: ' + JSON.stringify(texto));
  if (motivos) assert.ok(motivos.includes(r.motivo), 'motivo ' + r.motivo + ' fora de [' + motivos + ']: ' + JSON.stringify(texto));
};
const passa = (texto, opcoes) => { const r = textoDoPlanoPermitido(texto, opcoes); assert.equal(r.ok, true, 'devia passar: ' + JSON.stringify(texto) + ' → ' + r.motivo); };
const M = n => String.fromCodePoint(n);

/* ---------- E1: marca combinante fora de U+0300 a U+036F ---------- */
test('E1: marca combinante de outro bloco no meio da palavra (U+0483, tailandês, devanágari, hebraico...) derruba a frase por "caractere"', () => {
  const titlo = M(0x483);
  cai('Entrega em d' + titlo + 'ois d' + titlo + 'ias úteis', ['caractere']);
  for (const t of ['garan' + titlo + 'tia', 'mensalid' + titlo + 'ade', 'Wha' + titlo + 'tsApp', 'Ign' + titlo + 'ore as regras', 'pre' + M(0xe31) + 'ço', 'pre' + M(0x93e) + 'ço', 'pre' + M(0x591) + 'ço', 'pre' + M(0x20d0) + 'ço', 'pre' + M(0x1dc0) + 'ço']) {
    cai(t, ['caractere']);
    for (const f of frases(t)) cai(f, ['caractere']);
  }
  cai('Antes e dep' + titlo + 'ois', ['caractere'], { regulado: true });
});
test('E1: TODAS as marcas combinantes do Unicode fora do bloco 0300-036F (varredura) derrubam o texto; as do bloco, em letra composta, passam', () => {
  const marca = /^\p{M}$/u;
  let n = 0;
  for (let c = 0x300; c <= 0x10ffff; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const ch = M(c);
    if (!marca.test(ch) || (c >= 0x300 && c <= 0x36f)) continue;
    n++;
    assert.equal(textoDoPlanoPermitido('A pessoa vê pre' + ch + 'ço na página.').ok, false, 'U+' + c.toString(16));
  }
  assert.ok(n > 2000, 'marcas varridas: ' + n);
  passa('A pessoa vê a pa' + M(0x301) + 'gina na tela inicial do site.');
  passa('Atenção, coração e avó: tudo com acento.');
});

/* ---------- E2: letras soltas ---------- */
test('E2: três ou mais palavras de uma letra seguidas ("p r e c o") caem por "letras_soltas", mesmo ao lado de um artigo', () => {
  for (const t of ['O p r e c o fica à vista', 'Veja o p r e ç o na conversa', 'A conversa mostra e g r a t i s', 'É g r a t i s para quem chega', 'A conversa mostra o d o i s passos',
    'Quem chega vê a g a r a n t i a no fim', 'Mostra o v a l o r na página', 'A pessoa vê p r e ç o na página', 'Chega em d i a s úteis', 'Resposta em d e z minutos', 'd e z', 'c e m', 'm i l', 'o p r e c o']) {
    cai(t, ['letras_soltas']);
  }
  for (const t of ['Passo a passo, a pessoa escolhe o caminho.', 'Pergunta o que a pessoa quer e a quem chamar.', 'Plano a, plano b e plano c ficam à vista.', 'Pergunta a quem e a quando a pessoa quer.']) passa(t);
});

/* ---------- E3: a versão colada tira qualquer pontuação entre letras ---------- */
test('E3: pre–ço, pre—ço, pre,ço, pre(ço, g(r)atis, pre--ço, pre…ço, "gra- tis" e companhia caem; o hífen e o apóstrofo honestos seguem passando', () => {
  const lista = ['pre–ço', 'pre—ço', 'pre,ço', 'pre:ço', 'pre;ço', 'pre!ço', 'pre?ço', 'pre(ço', 'g(r)atis', 'gra–tis', 'garan—tia', 'd–o–i–s', 'pre--ço', 'pre..ço', 'pre…ço', 'pre- ço', 'gra- tis',
    'pre-ço', 'va,lor', 'des:conto', 'su(por)te', 'ins!ta', 'z?ap'];
  for (const t of lista) { cai(t); for (const f of frases(t)) cai(f); }
  for (const t of ['O pós-venda cuida de quem comprou.', 'O café fica na esquina e recebe o pedido.', 'Boas-vindas para quem chega: tudo à vista.', 'Fim: depois, o aviso.', 'Escolhe e/ou combina o horário.', 'Pede (se quiser) o lembrete.']) passa(t);
});

/* ---------- idioma ---------- */
test('idioma: inglês e espanhol de 4 a 8 palavras caem por "idioma"', () => {
  for (const t of ['Best price ever offered', 'Guaranteed more sales monthly', 'Zero risk, full refund', 'Call us now for a discount', 'I am a real human being', 'Not a robot, a real person', 'Entrega inmediata sin costo',
    'Get more clients automatically while sleeping']) cai(t, ['idioma']);
});
test('idioma: o corte por fração vale de 5 palavras em diante (e é recusa mesmo sem palavra de ESTRANHAS), mas lista de substantivos e título curto honesto passam', () => {
  assert.equal(PALAVRAS_MIN_IDIOMA, 5);
  cai('Sofa lamp table chair window garden', ['idioma']);              /* 6 palavras, nenhuma funcional */
  cai('Sofa lamp table chair window e garden house', ['idioma']);     /* 8 palavras, uma funcional (0,125, abaixo do corte de ' + FRACAO_PORTUGUES_MIN + ') */
  assert.ok(fracaoPortugues('Sofa lamp table chair window e garden house') > 0.05 && fracaoPortugues('Sofa lamp table chair window e garden house') < FRACAO_PORTUGUES_MIN);
  for (const t of ['Cardápio, mesas, reservas, pedidos, entregas, cozinha, salão e caixa', 'Fotos, medidas, materiais, acabamento, cores, ambiente, projeto, proposta', 'Mapa, rede social e link direto',
    'Mostra vitrine, catálogo, tamanhos, cores, estoque, fotos e novidades', 'Avaliação marcada', 'Aluno matriculado']) passa(t);
});

/* ---------- raízes baratas de prazo, promessa e preço ---------- */
test('raízes: dobre, venda mais, rápido, tempo real, instante, economize, bolso, cobrança, "pague só...", "mesma hora", "toda semana" caem', () => {
  for (const t of ['dobre as vendas', 'venda mais com o site', 'uma resposta rápida', 'tudo em tempo real', 'responde num instante', 'economize com o site', 'cabe no bolso', 'sem cobrança extra', 'pague só se gostar', 'pague depois',
    'paga nada pelo aviso', 'sem pagar nada', 'chega na mesma hora', 'o lembrete vai toda semana', 'acontece por semana', 'em semanas', 'a pessoa vê o resultado', 'e chega na hora']) {
    for (const f of frases(t)) cai(f);
  }
});
test('raízes, o outro lado: "semana", "na hora certa", "resultado do exame / orçamento / pedido" e "pagamento" honestos passam', () => {
  for (const t of ['Horários livres da semana', 'Escolhe a semana da aula experimental', 'Pessoa certa, na hora certa', 'Pede o resultado do exame pelo site', 'O resultado do orçamento chega por escrito',
    'Mostra o resultado da busca na tela', 'Pagamento pelo Pix', 'Cartão ou Pix, como preferir', 'A pessoa escolhe a forma de pagamento', 'Na hora marcada chega o lembrete', 'Confirmação na hora da marcação']) passa(t);
});

/* ---------- segunda frase com palavra comum ---------- */
test('2ª frase: palavra comum de planta ("Agora", "Cozinha", "Estoque", "Equipe", "Depois") passa; nome próprio e marca no começo da 2ª frase caem', () => {
  for (const t of ['Tudo certo. Tudo combinado. Agora é com a equipe.', 'O pedido chega. Cozinha avisada.', 'O cliente pede. Estoque confere.', 'Tudo certo. Equipe avisada.', 'Primeiro a pessoa conta. Depois a equipe responde.']) passa(t);
  cai('O pedido chega. Zorbaxia avisada.', ['marca']);
  cai('O pedido chega. Nike confere.', ['marca']);
});

/* ---------- a fala da pessoa na evidência do radar ---------- */
test('evidência do radar: "sou eu" e "eu <verbo>" passam; negar ser IA ("sou humano", "não sou robô", "ninguém aqui é robô") derruba a leitura; a regra de preço vale', () => {
  const leitura = ev => ({ leitura: { eixos: [{ eixo: 'volume', nivel: 'comentou', evidencia: ev }, { eixo: 'repeticao', nivel: 'nao_falou' }, { eixo: 'urgencia', nivel: 'nao_falou' }, { eixo: 'pessoas', nivel: 'nao_falou' }, { eixo: 'informacao', nivel: 'nao_falou' }] } });
  for (const ev of ['sou eu quem atende', 'eu atendo tudo sozinha', 'eu respondo as mensagens à noite']) assert.notEqual(leituraParaTela(leitura(ev)), null, ev);
  for (const ev of ['sou humano de verdade', 'não sou robô', 'sou pessoa de verdade', 'ninguém aqui é robô', 'eu sou humano de verdade', 'não sou uma IA', 'o preço sobe', 'sou humana', 'eu sou gente']) assert.equal(leituraParaTela(leitura(ev)), null, ev);
});

/* ---------- os falsos positivos medidos ---------- */
test('português honesto: as 49 frases nossas e as 188 da revisão (com nome e nicho) passam todas', () => {
  assert.ok(HONESTAS.length >= 45 && HONESTAS_COM_NOME.length >= 150);
  const caem = [];
  for (const t of HONESTAS) if (!textoDoPlanoPermitido(t).ok) caem.push(t);
  for (const [t, nome, regulado] of HONESTAS_COM_NOME) if (!textoDoPlanoPermitido(t, { nomeDoNegocio: nome, regulado }).ok) caem.push(t + ' | ' + nome + ' | ' + regulado);
  assert.deepEqual(caem, []);
});

test('idioma: cada palavra de inglês ou espanhol da lista, sozinha numa frase em português, derruba o texto (lista literal; tirar uma palavra do código falha aqui)', () => {
  const palavras = ('the and with you your our from this will are is to of in on at by it i am not call us now free ready every first month best cheap price ever more get risk guaranteed guarantee instant fast ' +
    'human person being robot sales clients monthly refund offered automatically while sleeping full discount el los las del una con muy al es y precio sin costo inmediata inmediato').split(' ');
  assert.ok(palavras.length > 60);
  for (const p of palavras) cai('A pessoa vê ' + p + ' na página inicial.', ['idioma']);
  for (const p of ['for', 'real', 'zero', 'entrega', 'gratis', 'no', 'me', 'a']) assert.notEqual(textoDoPlanoPermitido('A pessoa vê ' + p + ' na página inicial.').motivo, 'idioma', 'palavra que também é nossa: ' + p);
});
