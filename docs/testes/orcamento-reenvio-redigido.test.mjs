/* N1 (duas revisões independentes, ajustes pós-radar): o servidor grava a fala REDIGIDA ("me chama em [e-mail]"), não o texto enviado (api/_vendas/fluxo.mjs: redigir(limparMensagem(texto))).
   A conferência do envio incerto (js/orcamento.js) tem de tolerar EXATAMENTE o que o servidor altera, senão a releitura mostra o turno, não bate, e a mensagem sai de novo
   (turno duplicado, IA paga duas vezes). A página falsa grava com o `redigir` REAL do servidor, para o teste não inventar o formato.
   Também aqui: N2 e N3 (caminhos de "Tentar de novo").  node --test docs/testes/orcamento-reenvio-redigido.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarPagina } from './orcamento-pagina-falsa.mjs';
import { redigir, limparMensagem } from '../../api/_vendas/seguranca.mjs';

const calar = () => new Promise((r) => setImmediate(r));
const esperar = async () => { for (let i = 0; i < 30; i++) await calar(); };
const grava = (t) => redigir(limparMensagem(t) || '');
async function paginaComConversa() {
  const p = criarPagina({ mensagens: [{ papel: 'visitante', conteudo: 'oi' }, { papel: 'agente', conteudo: 'Olá!' }] });
  assert.ok(await p.pronta());
  return p;
}
const redeCaiu = (p, { entra }) => { p.servidor.rede = false; p.servidor.redeParaLer = false; p.servidor.entra = entra; };
const redeVoltou = (p, { entra = true } = {}) => { p.servidor.rede = true; p.servidor.redeParaLer = true; p.servidor.entra = entra; };
const totalDoVisitante = (p) => p.servidor.mensagens.filter((m) => m.papel === 'visitante').length;
const gravada = (p) => p.servidor.mensagens.filter((m) => m.papel === 'visitante').pop().conteudo;

const TEXTOS_REDIGIDOS = [
  ['telefone', 'me liga no (11) 98765-4321 depois das 18h'],
  ['e-mail', 'me chama em joao@x.com quando puder'],
  ['e-mail por extenso', 'meu email é ana arroba gmail ponto com, pode mandar'],
  ['CPF', 'meu cpf é 123.456.789-09 para a nota'],
  ['CNPJ', 'o cnpj da loja é 12.345.678/0001-95, tudo certo'],
  ['número longo', 'o pedido antigo foi 1234567890123 no sistema'],
  ['cartão (código de segurança)', 'vou pagar com cartão 4111 1111 1111 1111 e cvv: 123 pode ser'],
  ['validade do cartão', 'no cartão a validade 11/2030 serve'],
  ['vários marcadores', 'joao@x.com ou (11) 98765-4321 ou 123.456.789-09 para falar comigo'],
  ['marcadores colados', '(11) 98765-4321 joao@x.com'],
  ['só o dado', '(11) 98765-4321'],
  ['só o e-mail', 'joao@x.com'],
  ['invisíveis', 'oi​ tudo‮ bem­ com você﻿'],
  ['dígitos de outro alfabeto', 'o prazo é de ٣٠ dias'],
  ['byte de controle', '\u0001oi, tudo bem\u0007 por aí?'],
  ['espaços nas pontas e invisível na borda', '  ​ oi, tudo bem  ']
];
for (const [rotulo, texto] of TEXTOS_REDIGIDOS) {
  test('N1: a fala gravada redigida (' + rotulo + ') confirma o envio incerto: a releitura mostra o turno e NÃO reenvia', async () => {
    const p = await paginaComConversa();
    redeCaiu(p, { entra: true });
    assert.equal(await p.enviar(texto), false, 'a página não sabe se entrou');
    const antes = totalDoVisitante(p);
    redeVoltou(p, { entra: true });
    assert.equal(await p.enviar(texto), true);
    assert.equal(p.servidor.chamadasMensagem.length, 1, 'só uma chamada chegou ao servidor (gravou: ' + JSON.stringify(gravada(p)) + ')');
    assert.equal(totalDoVisitante(p), antes, 'nenhum turno duplicado');
  });
}

test('N1: o teste não é vazio: o servidor de verdade muda e-mail, telefone, documento, cartão e invisíveis nesses textos', () => {
  const mudam = TEXTOS_REDIGIDOS.filter(([, t]) => grava(t) !== t.trim());
  assert.ok(mudam.length >= 14, 'mudam ' + mudam.length);
  assert.match(grava('joao@x.com ou (11) 98765-4321 ou 123.456.789-09'), /\[e-mail\].*\[telefone\].*\[documento\]/);
  assert.match(grava('cartão 4111 1111 1111 1111 cvv: 123'), /\[cartão\]/);
});

test('N1: texto longo (2.000 caracteres) com vários marcadores é conferido depressa (sem backtracking explosivo)', async () => {
  const p = await paginaComConversa();
  const bloco = 'a b c d e f g h i j k l m n o p q r s t u v w x y z ';
  const longo = ((bloco + 'joao@x.com ' + bloco + '(11) 98765-4321 ').repeat(8)).slice(0, 2000);
  redeCaiu(p, { entra: true });
  await p.enviar(longo);
  redeVoltou(p, { entra: true });
  const t0 = Date.now();
  assert.equal(await p.enviar(longo), true);
  assert.ok(Date.now() - t0 < 1500, 'demorou ' + (Date.now() - t0) + ' ms');
  assert.equal(p.servidor.chamadasMensagem.length, 1);
});

test('N1 (o contrário): outra fala com marcador mas texto DIFERENTE não confirma; uma fala só de marcador não casa qualquer texto', async () => {
  const casos = [
    ['outra fala com e-mail', 'me chama em maria@y.com quando puder', 'quero um site para a clínica'],
    ['só o marcador contra texto sem dado', '(11) 98765-4321', 'oi, tudo bem?'],
    ['mesmo começo, outro fim', 'me liga no (11) 98765-4321 amanhã', 'me liga no meu trabalho amanhã'],
    ['marcador de e-mail contra texto com telefone', 'joao@x.com', '(11) 98765-4321'],
    ['marcador de documento contra número curto', 'meu cpf é 123.456.789-09', 'meu cpf é 123'],
    ['dois marcadores contra um só dado', 'joao@x.com ou (11) 98765-4321', 'joao@x.com ou nada']
  ];
  for (const [rotulo, daOutraAba, enviado] of casos) {
    const p = await paginaComConversa();
    redeCaiu(p, { entra: false });
    assert.equal(await p.enviar(enviado), false, rotulo);
    p.servidor.mensagens.push({ papel: 'visitante', conteudo: grava(daOutraAba) }, { papel: 'agente', conteudo: 'ok' });
    redeVoltou(p, { entra: true });
    assert.equal(await p.enviar(enviado), true, rotulo);
    assert.equal(p.servidor.chamadasMensagem.length, 2, rotulo + ': a fala de outra aba NÃO confirmou, a mensagem foi mandada');
  }
});

test('N1: o texto que a pessoa digitou com o próprio marcador ("[telefone]") continua valendo por igualdade simples', async () => {
  const p = await paginaComConversa();
  redeCaiu(p, { entra: true });
  await p.enviar('o campo se chama [telefone] mesmo');
  redeVoltou(p, { entra: true });
  assert.equal(await p.enviar('o campo se chama [telefone] mesmo'), true);
  assert.equal(p.servidor.chamadasMensagem.length, 1);
});

test('N3: 409 "respondendo": depois que a IA se libera, "Tentar de novo" relê e manda', async () => {
  const p = await paginaComConversa();
  p.servidor.erro = { status: 409, message: 'A mensagem anterior ainda está sendo respondida (respondendo).' };
  assert.equal(await p.enviar('Posso pagar no Pix?'), false);
  assert.equal(p.aviso().temAcao, true, 'o 409 oferece tentar de novo');
  p.servidor.erro = null;
  const leituras = p.servidor.leituras;
  p.tentarDeNovo();
  await esperar();
  assert.equal(p.servidor.chamadasMensagem.length, 2, 'mandou');
  assert.equal(totalDoVisitante(p), 2);
  assert.ok(p.servidor.leituras - leituras <= 2, 'uma releitura antes do envio e a de depois dele (' + (p.servidor.leituras - leituras) + ')');
});

test('N2 (fonte): reenviar recusa com a conversa ocupada ANTES de limpar a caixa (o texto que a pessoa escreve não some)', () => {
  const src = fs.readFileSync(new URL('../../js/orcamento.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const re = src.slice(src.indexOf('async function reenviar'), src.indexOf('/* Safari < 16'));
  assert.ok(re.indexOf('if (enviando) return false;') > 0 && re.indexOf('if (enviando) return false;') < re.indexOf("$('o-texto').value = ''"));
});
