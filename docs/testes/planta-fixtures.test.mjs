/* AS FIXTURES DA PLANTA VIVA (Passo 1). Os planos dos 3 nichos, as leituras do radar e os inválidos (um arquivo por defeito)
   são a base de teste do servidor (PR 2a), do desenho (2b) e do radar (2d). Aqui: carregam como JSON, cada inválido diz o
   defeito esperado e as válidas não mudam sem querer (hash do JSON canônico, que não depende do fim de linha do Git).
   node --test docs/testes/planta-fixtures.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const RAIZ = new URL('./fixtures/', import.meta.url);
const lerJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, RAIZ), 'utf8'));
const hash = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const arquivos = (pasta) => fs.readdirSync(new URL(pasta, RAIZ)).filter((n) => n.endsWith('.json')).sort();

/* Mudou uma fixture de propósito? Rode o teste, copie o hash novo que a mensagem mostra e diga no commit por quê. */
const HASHES = {
  'planta/clinica.json': '6b06b8326cdd5a82ad2bd866c63e75eefe577e1b3a1831095eab635624807594',
  'planta/embalagens.json': '9a94854df46c775b07b8b0e9460d4880712bf297b7d0ca31882fbba01fc0fe1e',
  'planta/loja.json': '553cc822b271a97737d164c83c327273f44b69650ebb1f5ffe0f36dcd5d476d9',
  'radar/clinica.json': '6de7080b24d34672712ba4113a09bade90daa53e7c2cf4848c220a69467f96fe',
  'radar/embalagens.json': '8393581ac5d2d2ae8333a15b5246892b94181ce9809c73820d4b54f0e46f85b7',
  'radar/loja.json': '64d8c47c6c364fe7588405d221ca6e8e2cccaccb054443b1a8e371af5e6947bc'
};

const textos = (v, saida = []) => {
  if (typeof v === 'string') saida.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textos(x, saida));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => textos(x, saida));
  return saida;
};

test('as 3 plantas e as 3 leituras carregam como JSON e são exatamente as anotadas (hash)', () => {
  for (const [rel, esperado] of Object.entries(HASHES)) {
    const obj = lerJson(rel);
    assert.equal(typeof obj, 'object', rel);
    assert.equal(hash(obj), esperado, rel + ': hash novo = ' + hash(obj));
  }
});

test('a pasta tem só as fixtures anotadas (ninguém acrescenta uma válida sem anotar o hash)', () => {
  assert.deepEqual(arquivos('planta/'), ['clinica.json', 'embalagens.json', 'loja.json']);
  assert.deepEqual(arquivos('radar/'), ['clinica.json', 'embalagens.json', 'loja.json']);
});

test('os textos das fixtures válidas não têm dígito, sinal de tag nem quebra de linha (base limpa para as travas do 2a)', () => {
  for (const rel of Object.keys(HASHES)) {
    for (const t of textos(lerJson(rel))) assert.ok(!/[0-9<>\n\r\t]/.test(t), rel + ': ' + t);
  }
});

test('cada inválido de planta carrega como JSON e traz o defeito esperado, a camada e o plano', () => {
  const nomes = arquivos('planta/invalidos/');
  assert.ok(nomes.length >= 40, 'poucos inválidos: ' + nomes.length);
  for (const n of nomes) {
    const e = lerJson('planta/invalidos/' + n);
    assert.match(e._defeito, /^[a-z_]+$/, n);
    assert.ok(e._camada === 'forma' || e._camada === 'texto', n + ': _camada');
    assert.ok(e.plano && typeof e.plano === 'object' && !Array.isArray(e.plano), n + ': plano');
  }
  assert.equal(nomes.length, new Set(nomes).size);
});

test('cada inválido de leitura carrega como JSON e traz o defeito esperado', () => {
  const nomes = arquivos('radar/invalidos/');
  assert.ok(nomes.length >= 10, 'poucos inválidos: ' + nomes.length);
  for (const n of nomes) {
    const e = lerJson('radar/invalidos/' + n);
    assert.match(e._defeito, /^[a-z_]+$/, n);
    assert.equal(e._camada, 'forma', n);
    assert.ok(e.leitura && typeof e.leitura === 'object', n + ': leitura');
  }
});

test('os inválidos de prototype pollution trazem a chave como propriedade PRÓPRIA (só assim o teste prova algo)', () => {
  const a = lerJson('planta/invalidos/proto-na-raiz.json').plano;
  assert.ok(Object.prototype.hasOwnProperty.call(a, '__proto__'));
  const b = lerJson('planta/invalidos/constructor-na-etapa.json').plano;
  assert.ok(Object.prototype.hasOwnProperty.call(b.etapas[0], 'constructor'));
});
