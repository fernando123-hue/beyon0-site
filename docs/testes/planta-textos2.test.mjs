/* A 2ª RODADA DA CAMADA DE TEXTO (revisão independente do PR 2a): letras só de uma lista branca, idioma, palavra cortada ou repetida, prazo, promessas,
   marcas, marcas combinantes e negar IA. Regra de parada: o que não está aqui fica em FUROS_CONHECIDOS (planta-textos-casos.mjs), porque a defesa de verdade é o
   prompt e a rodada real 8.  node --test docs/testes/planta-textos2.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { textoDoPlanoPermitido, fracaoPortugues, FRACAO_PORTUGUES_MIN } from '../../api/_vendas/planta-textos.mjs';
import { MOLDURAS, HONESTAS, HONESTAS_COM_NOME, FALSOS_POSITIVOS_CONHECIDOS, FUROS_CONHECIDOS } from './planta-textos-casos.mjs';

const frases = trecho => MOLDURAS.map(m => m.replace('{X}', trecho));
const cai = (texto, motivos, opcoes) => {
  const r = textoDoPlanoPermitido(texto, opcoes);
  assert.equal(r.ok, false, 'devia recusar: ' + JSON.stringify(texto));
  if (motivos) assert.ok(motivos.includes(r.motivo), 'motivo ' + r.motivo + ' fora de [' + motivos + ']: ' + JSON.stringify(texto));
};
const passa = (texto, opcoes) => { const r = textoDoPlanoPermitido(texto, opcoes); assert.equal(r.ok, true, 'devia passar: ' + JSON.stringify(texto) + ' → ' + r.motivo); };
const plano = n => JSON.parse(fs.readFileSync(new URL('./fixtures/planta/' + n + '.json', import.meta.url), 'utf8'));
async function todosOsTextos() {
  const t = [];
  const colher = v => { if (typeof v === 'string') t.push(v); else if (Array.isArray(v)) v.forEach(colher); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!['id', 'tipo', 'verbo', 'topologia', 'lado', 'origens'].includes(k)) colher(x); }); };
  const { CHAVES, planoPadrao } = await import('../../api/_vendas/planta-padrao.mjs');
  for (const c of CHAVES) colher(planoPadrao(c));
  for (const n of ['clinica', 'embalagens', 'loja']) colher(plano(n));
  return t;
}

/* ---------- S1: lista branca de letras ---------- */
test('S1: letras parecidas de outros blocos latinos (ɡ ı ᴘ ø æ ð þ ß) caem por "alfabeto", sozinhas e dentro de frase', () => {
  for (const t of ['ɡarantia', 'Gratıs', 'Mensalıdade', 'Doıs', 'Imedıato', 'Prazø', 'ᴘreço', 'preæo', 'ðois', 'þrazo', 'preßo', 'cusɫo']) {
    cai(t, ['alfabeto']);
    for (const f of frases(t)) cai(f, ['alfabeto']);
  }
  for (const c of [String.fromCharCode(0xd7), String.fromCharCode(0xf7)]) cai('A pessoa vê ' + c + ' na página.', ['alfabeto', 'caractere', 'simbolo']);
});
test('S1: o português honesto, com todos os acentos, passa pela lista branca', () => {
  passa('A avó pôs o açúcar no café e o órfão tomou o pingüim por brinquedo, às vezes.');
  passa('ñoño ýÿü');
  passa('Cuidados com a saúde e o bem-estar de quem chega até aqui.');
});

/* ---------- S2: idioma ---------- */
test('S2: texto em inglês ou espanhol cai por "idioma"; o português dos oito planos e das fixtures passa com folga', async () => {
  for (const t of ['Ready in ten days for every client who arrives here', 'Free for the first month and every client who arrives', 'Precio bajo para cada cliente que llega aqui al sitio',
    'The site shows every service to the visitor', 'Your clients will love this page so much', 'Una pagina con los servicios del negocio']) cai(t, ['idioma']);
  cai('Free for a month', ['idioma']);
  cai('El sitio', ['idioma']);
  const textos = await todosOsTextos();
  assert.ok(textos.length > 150);
  let menor = 1;
  for (const t of textos) { passa(t); menor = Math.min(menor, fracaoPortugues(t) ?? 1); }
  assert.ok(menor >= FRACAO_PORTUGUES_MIN + 0.015, 'a menor fração honesta (' + menor.toFixed(3) + ') precisa ficar acima do corte (' + FRACAO_PORTUGUES_MIN + ')');
});
test('S2: o nome do negócio e nome de produto de uma palavra não derrubam o idioma; texto curto honesto passa', () => {
  passa('A pessoa conversa com a Aurora e marca o horário pelo celular.', { nomeDoNegocio: 'Aurora' });
  passa('Aurora Studio recebe a pessoa, mostra os serviços e marca o horário.', { nomeDoNegocio: 'Aurora Studio' });
  for (const t of ['Avaliação marcada', 'Aluno matriculado', 'Pedido pago', 'Horário reservado', 'Busca, mapa e indicação']) passa(t);
  assert.equal(fracaoPortugues('Avaliação marcada'), null, 'texto curto não tem fração (a regra vale de 5 palavras em diante)');
});

/* ---------- S3: palavra cortada, com sinal ou repetida ---------- */
test('S3: pre-ço, gra-tis, g.r.a.t.i.s, preeeço, D.E.Z, d-o-i-s e companhia caem; o hífen honesto continua passando', () => {
  for (const t of ['pre-ço', 'gra-tis', 'garan-tia', 'g-r-a-t-i-s', 'g.r.a.t.i.s', 'preeeço', 'graaatis', 'D.E.Z', 'd-o-i-s', 'va-lor', 'pra-zo', 'des-con-to', 'su.por.te', 'imediiiato', 'ins-ta-gram', 'wha-tsapp']) {
    cai(t);
    for (const f of frases(t)) cai(f);
  }
  for (const t of ['Mensagem de boas-vindas para quem chega.', 'Atendimento de pós-venda para a pessoa que comprou.', 'O site cuida do dia a dia da loja.', 'A conversa pergunta o que a pessoa quer e/ou precisa.', 'O pagamento acontece por Pix numa tela só.']) passa(t);
});

/* ---------- S4: prazo ---------- */
test('S4: prazo no singular e em expressões cai; "dia a dia", "no dia da consulta" e "na hora da marcação" continuam honestos', () => {
  for (const t of ['A pessoa recebe tudo em um dia', 'Fica pronto num dia só', 'Tudo chega na hora', 'A resposta vem amanhã', 'O aviso chega hoje mesmo', 'Atende ainda hoje', 'Responde sem demora', 'Muda de um dia pro outro',
    'Fica pronto numa tarde', 'Vale por uma quinzena', 'O trimestre inteiro', 'Pronto antes de sexta', 'Atende a qualquer hora', 'Responde de madrugada', 'Atende de segunda a sexta', 'Chega em uma hora', 'Todo dia chega um aviso', 'Resolve em um minuto']) {
    cai('A pessoa vê que ' + t.charAt(0).toLowerCase() + t.slice(1) + '.', ['prazo', 'numeral', 'promessa']);
  }
  for (const t of ['O site entende o dia a dia do negócio.', 'No dia da consulta, chega o lembrete.', 'Confirmação na hora da marcação.', 'Chama de volta na hora de renovar.', 'Chegou o dia da revisão e o site chama a pessoa de volta.',
    'Volta sozinho na hora da revisão.', 'Cada pessoa vê o horário que combina com ela.']) passa(t);
});

/* ---------- S5: quantificadores e promessas ---------- */
test('S5: dobro, triplo, milhares, centenas, dezenas, dúzia, metade, nunca mais, cresce, "enquanto você dorme" e clientes que chegam sozinhos caem', () => {
  for (const t of ['o dobro de pessoas', 'o triplo de contatos', 'milhares de visitas', 'centenas de pedidos', 'dezenas de mensagens', 'uma dúzia de avisos', 'metade do trabalho', 'nunca mais perde um recado', 'o negócio cresce',
    'um crescimento constante', 'enquanto você dorme o site atende', 'enquanto a loja vende o site trabalha', 'clientes chegam sozinhos', 'pedidos que entram sozinhos', 'a agenda se preenche sozinha']) {
    cai('O site faz com que ' + t + ' o tempo todo.', ['promessa', 'numeral', 'prazo']);
  }
});
test('S5: nicho regulado: casos de sucesso, histórias de pacientes, transformação, fotos de pacientes, relatos e tudo o que o Zero já recusa (PEDIDOS_PROIBIDOS) caem; fora do regulado, passam', () => {
  for (const t of ['casos de sucesso', 'histórias de pacientes', 'a transformação', 'fotos de pacientes', 'relatos de clientes', 'depoimentos', 'antes e depois', 'avaliações de pacientes', 'sorteio de brindes', 'a sessão grátis', 'testemunhos']) {
    for (const f of frases(t)) cai(f, ['depoimento', 'resultado_regulado', 'preco', 'promessa'], { regulado: true });
  }
  for (const t of ['casos de sucesso', 'histórias de clientes', 'relatos de quem já comprou']) for (const f of frases(t)) passa(f, { regulado: false });
});

/* ---------- S6: marcas ---------- */
test('S6: apelidos e marcas comuns caem em qualquer caixa ("insta", "zap", "tik tok", "you tube", "ifood", "uber", "itaú"...)', () => {
  for (const t of ['o insta', 'o INSTA', 'o zap', 'o zapzap', 'o wpp', 'o tik tok', 'o TikTok', 'o you tube', 'o ifood', 'o iFood', 'o uber', 'o itaú', 'o bradesco', 'o nubank', 'a rolex', 'a nike', 'a adidas', 'a shopee', 'o canva', 'o gmail']) {
    for (const f of frases(t)) cai(f, ['marca']);
  }
});
test('S6: capitalizada no começo de uma 2ª frase só passa se for palavra comum; marca no começo cai', () => {
  passa('A pessoa chega pela busca. Depois a conversa pergunta o que ela precisa.');
  passa('Cai na página do tratamento. Quem tem dúvida volta à conversa.');
  cai('A pessoa chega pela busca. Nike envia o pedido para quem comprou.', ['marca']);
  cai('A pessoa chega pela busca. Horizonte recebe o pedido completo.', ['marca']);
  passa('A pessoa chega pela busca. Horizonte recebe o pedido completo.', { nomeDoNegocio: 'Horizonte' });
});
test('S6: o nome do negócio só dá passe às palavras exatas do nome; nome com marca conhecida não dá passe nenhum', () => {
  passa('A pessoa fala com a Clínica Aurora pela página.', { nomeDoNegocio: 'Clínica Aurora' });
  cai('A pessoa fala com a Clínica Horizonte pela página.', ['marca'], { nomeDoNegocio: 'Clínica Aurora' });
  cai('A pessoa fala com a Clínica Aurora pela página.', ['marca'], { nomeDoNegocio: 'Insta Clínica Aurora' });
  cai('A pessoa fala com a Clínica Aurora pela página.', ['marca'], { nomeDoNegocio: 'Clínica Aurora Nike' });
  cai('A pessoa fala com a Loja Estrela pela página.', ['marca'], { nomeDoNegocio: 'Loja Aurora' });
});

/* ---------- S7: marcas combinantes ---------- */
test('S7: no máximo 2 marcas combinantes por letra, e nunca uma sequência só de marcas ou uma marca solta', () => {
  const M = n => String.fromCharCode(0x300 + n);
  cai('A pessoa vê pa' + M(1) + M(2) + M(3) + 'gina na tela inicial.', ['caractere']);
  cai('A pessoa vê ' + M(1) + M(2) + ' na tela inicial.', ['caractere']);
  cai(M(1) + 'A pessoa vê a página inicial.', ['caractere']);
  cai('A pessoa vê a pa' + M(1) + M(2) + M(3) + M(4) + M(5) + M(6) + M(7) + M(8) + M(9) + M(10) + 'gina na tela.', ['caractere']);
  passa('A pessoa vê a pa' + M(1) + 'gina na tela inicial do site.');
});

/* ---------- S10: negar IA ---------- */
test('S10: "humano de verdade", "por gente", "carne e osso", "ninguém aqui é robô" e "eu respondo" caem por negar_ia', () => {
  for (const t of ['um humano de verdade', 'uma humana de verdade', 'atendido por gente', 'gente de carne e osso', 'ninguém aqui é robô', 'ninguém aqui é máquina', 'eu respondo cada mensagem', 'eu atendo cada pessoa']) {
    for (const f of frases(t)) cai(f, ['negar_ia', 'trava_negarIA']);
  }
});

/* ---------- os falsos positivos e os furos conhecidos ---------- */
test('português honesto: o que passa e o que cai de propósito (falsos positivos conhecidos, medidos)', () => {
  assert.ok(HONESTAS.length >= 40);
  const caem = HONESTAS.filter(t => !textoDoPlanoPermitido(t).ok);
  assert.deepEqual(caem.sort(), [], 'frase honesta que passou a cair (afine ou anote em FALSOS_POSITIVOS_CONHECIDOS)');
  for (const t of FALSOS_POSITIVOS_CONHECIDOS) cai(t);
});
test('furos conhecidos: o que passa e deveria cair (a defesa real é o prompt e a rodada real 8; mudou? atualize a lista)', () => {
  assert.ok(FUROS_CONHECIDOS.length >= 8);
  for (const t of FUROS_CONHECIDOS) passa(t);
});
