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
  const marcas = ['id="o-pix-valor"', 'Fernando Ferreira Dos Santos', 'id="o-pix-copiar"', 'Abra o app do seu banco', 'Pix › Pix copia e cola', 'Cole o código e confirme'];
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
  [/conta como aprovada|aprovad\w* (sozinh|automatic)/i, 'NUNCA (D5, 21/10): sem resposta o projeto para; nada é aprovado sozinho'],
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
