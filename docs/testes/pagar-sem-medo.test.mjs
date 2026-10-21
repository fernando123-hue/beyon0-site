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
