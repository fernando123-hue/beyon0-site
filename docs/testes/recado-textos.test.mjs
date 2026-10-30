/* A SAÍDA PADRÃO É O RECADO (passo 1 do "Site sem WhatsApp"): nenhuma recusa da API manda a pessoa "falar pelo WhatsApp" nem leva
   `whatsapp: true`; o consultor oferece o recado e continua dizendo que é uma IA; o front do orçamento reage a `recado`, não a `whatsapp`.
   O que fica de propósito (passos 2 e 3): a confirmação do pedido PELO DONO no WhatsApp, o atendente de IA que é produto, e os campos
   de WhatsApp do site DO CLIENTE (material e prévia).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { montarSistema, IDENTIDADE, ferramentas } from '../../api/_vendas/consultor.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';

const RAIZ = new URL('../../', import.meta.url);
const ler = f => fs.readFileSync(new URL(f, RAIZ), 'utf8');
const sem = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const lista = pasta => fs.readdirSync(new URL(pasta + '/', RAIZ)).filter(f => /\.(mjs|js)$/.test(f)).map(f => path.posix.join(pasta, f));
const API = ['api/vendas.mjs', ...lista('api/_vendas'), ...lista('api/_pagamentos')];
const REGRAS = JSON.parse(ler('docs/fase2/regras-rascunho-v1.json'));

test('nenhum extra { whatsapp: true } sobrou na API (a saída é { recado: true })', () => {
  for (const f of API) assert.ok(!/\bwhatsapp: true\b/.test(sem(ler(f))), f);
});

test('nenhuma frase que a pessoa lê manda "falar/continuar/pedir pelo WhatsApp"', () => {
  const RUIM = /(fale|Fale|Continue|continue|peça|Peça|combina|resolve)[^'"`\n]{0,50}WhatsApp/;
  for (const f of API.filter(a => !a.endsWith('consultor.mjs'))) {
    const achou = sem(ler(f)).split('\n').filter(l => RUIM.test(l));
    assert.deepEqual(achou, [], f);
  }
});

test('o consultor oferece o recado onde antes oferecia o dono ou o WhatsApp, e não nega ser IA', () => {
  const s = montarSistema(REGRAS);
  assert.match(s, /deixe um recado|deixa um recado|deixar um recado/i);
  assert.match(s, /Você é uma IA: se perguntarem, diga que é o consultor de IA da Beyon Zero; nunca diga que é uma pessoa/);
  assert.match(s, /o site não tem telefone nem WhatsApp/);
  assert.ok(!/(fale|falar|combina|resolve|continue|peça)[^.\n]{0,40}pelo WhatsApp/i.test(s), 'o prompt não manda a pessoa para o WhatsApp');
  const desc = ferramentas(REGRAS, { etapa: 'descoberta' }).find(f => f.name === 'encaminhar_diagnostico').description;
  assert.match(desc, /recado/); assert.ok(!/pelo WhatsApp/.test(desc), desc);
  assert.match(IDENTIDADE, /consultor de IA/);
});

test('o consultor simulado também oferece o recado (e não o WhatsApp)', () => {
  assert.match(sem(ler('api/_ia/simulado.mjs')), /Quer deixar um recado para a equipe/);
  assert.ok(!/levar para o WhatsApp/.test(ler('api/_ia/simulado.mjs')));
  assert.ok(criarSimulada());
});

test('o front do orçamento reage a `recado` da API, não a `whatsapp` (e o js/recado.js existe)', () => {
  for (const f of ['js/orcamento-previa.js', 'js/orcamento-retomada.js', 'js/orcamento-api.js']) {
    const c = sem(ler(f));
    assert.ok(!/dados\.whatsapp\b/.test(c), f + ': ainda lê dados.whatsapp');
    assert.ok(!/whatsapp: true/.test(c), f);
  }
  assert.ok(fs.existsSync(new URL('js/recado.js', RAIZ)) && fs.existsSync(new URL('css/recado.css', RAIZ)));
});

test('o orçamento abre o recado nos links [data-wa] antigos, sem deixar o clique chegar à métrica de WhatsApp, e poupa só a confirmação do dono', () => {
  const c = sem(ler('js/orcamento.js'));
  assert.match(c, /closest\('a\[data-wa\]'\)/);
  assert.match(c, /a\.id === 'o-confirmar-wa'/, 'a confirmação do pedido pelo dono (passo 3) continua WhatsApp');
  assert.match(c, /ev\.preventDefault\(\); ev\.stopPropagation\(\);\s*API\.abrirRecado\(/);
  const api = sem(ler('js/orcamento-api.js'));
  assert.match(api, /recado: async function/); assert.match(api, /abrirRecado: function/);
  assert.match(api, /comAntiRobo\(base, true\)/, 'o recado passa pelo anti-robô da página');
});
