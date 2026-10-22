/* PAGAR SEM MEDO (PR 3b-1; spec 2026-10-21 §4): a tela do Pix na ordem nova, o nome que aparece no banco e as
   perguntas antes de pagar, só as que já são verdade. Lê o HTML e os módulos da página, sem navegador.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const HTML = ler('orcamento.html');
const semComentario = h => h.replace(/<!--[\s\S]*?-->/g, '');
const texto = h => semComentario(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/ ([).,:?])/g, '$1').trim();
/* o trecho do HTML do 1º marcador até o 2º (que vem depois dele) */
const entre = (h, de, ate) => {
  const i = h.indexOf(de), j = h.indexOf(ate, i + de.length);
  assert.ok(i >= 0 && j > i, 'trecho não encontrado: ' + de + ' → ' + ate);
  return h.slice(i, j);
};

test('o nome no Pix (decisão do dono de 21/10, Decisões.md, "Nome que aparece no Pix"): antes do botão de copiar, com o aviso de abreviação', () => {
  const pix = entre(HTML, 'id="o-pix"', 'id="o-desafio"');
  assert.ok(texto(pix).includes('No seu banco vai aparecer: Fernando Ferreira Dos Santos (alguns bancos mostram o nome abreviado)'), texto(pix));
  assert.ok(pix.indexOf('Fernando Ferreira Dos Santos') < pix.indexOf('id="o-pix-copiar"'), 'o nome vem antes do código');
  assert.equal(HTML.split('Fernando Ferreira Dos Santos').length, 2, 'uma vez só na página');
  assert.ok(!/Gernando/i.test(HTML), 'nunca a grafia antiga do Mercado Pago (Decisões.md, 20/10, "Correção: o nome é Fernando Ferreira")');
});

test('o Pix na ordem nova: valor, nome, copiar, os 3 passos; o QR só em "Pagar por outro aparelho"', () => {
  const pix = entre(HTML, 'id="o-pix"', 'id="o-desafio"');
  const marcas = ['id="o-pix-valor"', 'Fernando Ferreira Dos Santos', 'id="o-pix-copiar"', 'Abra o app do seu banco', 'Pix <span aria-hidden="true">›</span>', 'Cole o código e confirme'];
  const pos = marcas.map(m => pix.indexOf(m));
  assert.ok(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1])), 'ordem: ' + marcas.map((m, i) => m + '@' + pos[i]).join(', '));
  assert.ok(!pix.includes('id="o-pix-qr"'), 'o QR saiu do bloco do código');
  assert.ok(texto(entre(HTML, 'id="o-pix-copiar"', '</button>')).endsWith('Copiar o código Pix'));
  const outro = entre(HTML, 'id="o-pix-outro"', '</details>');
  assert.ok(outro.includes('Pagar por outro aparelho (QR Code)') && outro.includes('id="o-pix-qr"'), 'o QR dentro de "Pagar por outro aparelho"');
  assert.ok(HTML.indexOf('id="o-pag-status"') < HTML.indexOf('id="o-pix-outro"'), 'o status ("Esperando o pagamento") vem antes do QR');
  assert.ok(texto(entre(HTML, 'for="o-pag-doc"', '</label>')).includes('o Mercado Pago pede para emitir o Pix'), 'o porquê do CPF junto do campo');
});

const JS = fs.readdirSync(new URL('../../js/', import.meta.url)).filter(f => /^orcamento.*\.js$/.test(f)).map(f => ler('js/' + f));
const semComentarioJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const antes = () => entre(HTML, 'id="o-antes"', '</section>');
const perguntas = () => [...antes().matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m => texto(m[1]));
/* as perguntas do 3b-1 (spec §4, coluna "Quando entra" = 3b-1). "Quantos ajustes?" (D2) é da Task 7 e "Quando fica pronto?" (D4) da Task 9 */
const PERMITIDAS = ['Posso desistir?', 'Quando fica pronto?', 'Quantos ajustes?'];
/* frases barradas: as que só entram com a parte delas (3b-2, 3b-3) ou com dado do dono, e as que o dono revisou e nunca entram (D2, D5) */
const AINDA_NAO = [
  [/Quando pago o restante/i, 'com o 3b-3'],
  [/Como mando fotos/i, 'com o 3b-2'],
  [/precisa mandar nada pelo WhatsApp/i, 'com o 3b-2'],
  [/O que eu recebo/i, 'com o dado do dono (domínio e hospedagem)'],
  [/Nota fiscal/i, 'quando a spec trouxer (há decisão de 11/10, Decisões.md: sem nota por enquanto; a spec §4 deixa a pergunta para depois)'],
  [/Guarde o link do seu pedido/i, 'com o 3b-2'],
  [/passo \d de 4/i, 'com o 3b-2 (os passos antes de pagar)'],
  [/sai do ar/i, 'com o 3b-3: a regra vale (D4, 21/10) e a frase entra com a tela do restante'],
  [/prazo fica parado/i, 'com o 3b-3: a regra vale (D4, 21/10) e a frase entra com a tela da lista de ajustes'],
  [/(conta|vale) como aprovad|considerad\w* (como )?aprovad|aprova(d\w*|ção)? (sozinh|automátic|automatic)|sem resposta[^.]{0,40}aprovad/i, 'NUNCA (D5, 21/10): sem resposta o projeto para; nada é aprovado sozinho'],
  [/quantos precisar|sem limite de ajustes/i, 'NUNCA (D2, 21/10): são 2 listas de ajuste'],
  [/Pôr na minha agenda/i, 'com a D1 (a tela do pedido) e o 3b-2'],
];

test('perguntas antes de pagar: "Posso desistir?" com a lei e a decisão de 11/10 (Decisões.md); nenhuma fora da lista do 3b-1', () => {
  assert.ok(perguntas().includes('Posso desistir?'), perguntas().join(' | '));
  assert.ok(texto(antes()).includes('Até 7 dias depois de aceitar (confirmar o resumo), por qualquer motivo, você recebe a entrada de volta (Código de Defesa do Consumidor, art. 49). Depois dos 7 dias, a entrada fica com a Beyon Zero.'), texto(antes()));
  for (const p of perguntas()) assert.ok(PERMITIDAS.includes(p), 'pergunta que não é do 3b-1: ' + p);
});

test('nenhuma frase de parte que ainda não existe (3b-2, 3b-3), de dado do dono ou de decisão revista (D2, D5) aparece na página', () => {
  const tudo = texto(HTML) + '\n' + JS.map(semComentarioJs).join('\n');
  for (const [re, quando] of AINDA_NAO) assert.ok(!re.test(tudo), 'frase barrada (' + quando + '): ' + re);
});

test('perguntas: "Quantos ajustes?" com as 2 listas da D2 (Decisões.md, 21/10)', () => {
  assert.ok(perguntas().includes('Quantos ajustes?'), perguntas().join(' | '));
  assert.ok(texto(antes()).includes('Duas listas de ajuste na prévia. Uma lista é um conjunto de pedidos mandado de uma vez. O que passar das duas listas é orçado à parte, como página ou item novo.'), texto(antes()));
  assert.ok(!/quantos precisar/i.test(texto(antes())), 'a decisão de 11/10 ("sem limite") foi revista em 21/10 (D2)');
});

test('WhatsApp (D3, resposta do dono em 21/10): só em "Outra dúvida?", "Para desistir" e "Problema com o pagamento"', () => {
  const pag = entre(HTML, 'id="o-pagamento"', 'id="o-antes"');
  const links = h => [...h.matchAll(/<a\b[^>]*href="https:\/\/wa\.me\/[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map(m => m[0]);
  assert.match(texto(antes()), /Para desistir, fale com a Beyon Zero pelo WhatsApp\./);
  assert.match(texto(antes()), /Outra dúvida\? Fale com a Beyon Zero pelo WhatsApp\./);
  assert.match(texto(pag), /Problema com o pagamento\? Fale com a Beyon Zero pelo WhatsApp\./);
  assert.equal(links(antes()).length, 2, 'nas perguntas: desistir e outra dúvida, nada mais');
  for (const a of [...links(antes()), ...links(pag)]) {
    assert.ok(/\sdata-wa="[^"]+"/.test(a), 'o assunto vai pelo data-wa (js/pagina.js monta o link): ' + a);
    assert.ok(!/\?text=/.test(a), 'nada escrito à mão no href: ' + a);
  }
});

/* (Task 9) o texto que o cliente lê e que vem do SERVIDOR: o contrato (escopo.mjs), o que o consultor recebe para dizer
   (consultor.mjs) e as respostas fixas dele (promessa.mjs). Sem comentários: só o que pode chegar à tela */
const SERVIDOR = ['api/_vendas/escopo.mjs', 'api/_vendas/consultor.mjs', 'api/_vendas/promessa.mjs'].map(ler);

test('o texto do servidor (contrato, consultor, respostas fixas) também não traz frase barrada', () => {
  const tudo = SERVIDOR.map(semComentarioJs).join('\n');
  for (const [re, quando] of AINDA_NAO) assert.ok(!re.test(tudo), 'frase barrada (' + quando + '): ' + re);
});

test('D4 (21/10): a regra do prazo é a mesma no contrato, no consultor, em /condicoes e em "Quando fica pronto?"', () => {
  const [escopo, consultor] = SERVIDOR.slice(0, 2).map(semComentarioJs);
  assert.match(escopo, /contados do sinal pago e do material recebido/);
  assert.match(consultor, /depois do sinal pago e do material recebido/);
  assert.match(consultor, /contados do sinal pago e do material recebido/);
  assert.match(texto(ler('condicoes.html')), /contados do pagamento da entrada e do envio do seu material/);
  assert.ok(perguntas().includes('Quando fica pronto?'), perguntas().join(' | '));
  assert.ok(texto(antes()).includes('O prazo está no resumo do seu pedido, em dias úteis, contados do pagamento da entrada e do envio do seu material. Se o material não chegar em 30 dias, o site sai com as imagens do modelo.'), texto(antes()));
  assert.ok(texto(antes()).includes('Se a Beyon Zero não entregar no prazo combinado, você recebe a entrada inteira de volta, mesmo depois dos 7 dias.'), texto(antes()));
});

/* revisão do 3b-1, MÉDIO-2 e BAIXO-5: o texto que acalma e informa é frase em Sora de 16 px, não o rótulo mono de 14 px */
const regra = (css, seletor) => {
  const i = css.indexOf('\n' + seletor + ' {');
  assert.ok(i >= 0, 'regra não encontrada: ' + seletor);
  return css.slice(i, css.indexOf('}', i));
};
test('o status do pagamento e a validade do Pix são frase em Sora de 16 px (regra do CLAUDE.md: mono só em rótulo e dado)', () => {
  const css = ler('css/orcamento.css');
  const status = regra(css, '.orc-pag-status');
  assert.ok(/font-family:\s*var\(--sans\)/.test(status) && /font-size:\s*var\(--fs-b\)/.test(status) && !/--mono/.test(status), status);
  const nota = regra(css, '.pix .orc-nota');
  assert.ok(/font-size:\s*var\(--fs-b\)/.test(nota), nota);
});

/* revisão do 3b-1, BAIXO-2: o guarda da D5 (prévia sem resposta nunca é aprovada sozinha) pega as variações da frase */
test('o guarda da D5 pega as variações de "aprovada sozinha"', () => {
  const d5 = AINDA_NAO.find(([, quando]) => /D5/.test(quando))[0];
  for (const frase of ['A prévia conta como aprovada', 'considerada aprovada se você não responder', 'vale como aprovada', 'aprova sozinho', 'aprovação automática', 'aprovada automaticamente', 'sem resposta em 5 dias, a prévia fica aprovada'])
    assert.ok(d5.test(frase), 'o guarda da D5 não pegou: ' + frase);
  assert.ok(!d5.test('Você aprova a prévia quando quiser'), 'não pode barrar a frase normal');
});

/* revisão do 3b-1, BAIXO-4: a mesma palavra nas duas páginas (D2: 2 listas de ajuste); a regra não muda */
test('D2: o orçamento e /condicoes dizem "listas de ajuste", não "rodadas"', () => {
  const cond = texto(ler('condicoes.html'));
  assert.ok(cond.includes('2 listas de ajuste. Uma lista é um conjunto de pedidos mandado de uma vez.'), cond.slice(cond.indexOf('ajuste') - 40, cond.indexOf('ajuste') + 120));
  assert.ok(!/rodadas? de ajuste/i.test(cond + ' ' + texto(HTML)), 'a palavra "rodada" saiu dos dois textos');
});

/* revisão do 3b-1, BAIXO-6: o "›" é enfeite; o leitor de tela lê "Pix, depois Pix copia e cola" */
test('os passos do Pix: o "›" fica escondido do leitor de tela', () => {
  const passos = entre(HTML, 'class="pix__passos"', '</ol>');
  assert.ok(/<span aria-hidden="true">›<\/span>/.test(passos), passos);
  assert.ok(!passos.replace(/<span aria-hidden="true">›<\/span>/g, '').includes('›'), 'nenhum › solto');
  assert.ok(/<span class="sr-only">, depois<\/span>/.test(passos), 'o leitor de tela ouve o "depois"');
});
