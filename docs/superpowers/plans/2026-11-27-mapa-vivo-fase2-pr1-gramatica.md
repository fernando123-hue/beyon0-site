# Mapa vivo v2, Fase 2, PR 1: a gramática da cena e o dicionário — plano de implementação

> **Para agentes:** SUB-SKILL: superpowers:executing-plans (execução nesta sessão, tarefa por tarefa). Passos com `- [ ]`.

**Objetivo:** criar, sem ligar em página nenhuma, a forma fechada da CENA do caso (`js/orcamento-cena-forma.js`) e quem a preenche por código no aparelho (`js/cena-dicionario.js`: ramo → lugar, palavra → oferta, leitor de equipe com negação), mais o leitor de oração comum (`js/oracao.js`).

**Arquitetura:** três módulos puros, ES5, no molde de `js/mapa-saber.js` e `js/orcamento-mapa-forma.js` (script clássico na tela com `window.BZ…`, CommonJS no servidor, sem DOM, sem `node:`, nunca lançam). `cenaDoCaso()` é determinística: a mesma entrada dá a mesma cena, e respostas diferentes dão cenas diferentes, sem sorteio. O desenho (`js/cena-desenho.js`) e a ligação com a miniatura `.nasce` e com o servidor ficam para o PR 2.

**Tecnologia:** JavaScript ES5 (UMD), `node --test`, `node:vm` para provar o caminho do navegador.

**Especificação:** cofre `01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md`, "FASE 2" (gramática, dicionário, equipe, limites, aceites 1 a 5 e 7). A direção visual (C, "palco") já está no ar, então a condição de início da Fase 2 está cumprida.

## Restrições globais

- ES5 sintático nos três módulos: sem `let`, `const`, `=>`, template, `class` (o teste confere).
- Nenhuma função lança: entrada estranha dá `null` ou `{ ok: false, erros }`.
- Tabelas sem protótipo (`Object.create(null)`): `__proto__` e `constructor` nunca casam.
- Texto da pessoa: no máximo 2000 caracteres lidos (`TEXTO_MAX`), sem acento e em minúsculas antes de qualquer regex; regex sem quantificador aninhado.
- Nenhum texto da pessoa sai dos módulos: só códigos das listas fechadas e números.
- Nicho regulado nunca recebe `depoimentos`.
- Equipe só vira número quando a pessoa DIZ; negada na mesma oração, não vale. Faturamento não é lido.
- Nada é carregado em página neste PR (a tela não muda; o teste de página prova isso).

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `js/oracao.js` (novo) | `semAcento`, `achaSemNegar(texto, re)` (a 1ª ocorrência não negada na mesma oração), as regras de oração e negação. A mesma regra de `js/mapa-saber.js` e `js/orcamento-coerencia.js` (a migração desses dois para cá é um PR separado, com a medida de bytes). |
| `js/orcamento-cena-forma.js` (novo) | As listas fechadas (LUGARES, OFERTAS, DESTAQUES, CANAIS), os limites e `validar(cena)`. |
| `js/cena-dicionario.js` (novo) | `LUGAR_DO_RAMO`, sublugar por palavra (só se compatível com o ramo), oferta por palavra ou objetivo, destaque, `equipeDoTexto(texto)` e `cenaDoCaso(caso)`. |
| `docs/worker-fumaca.mjs` | A busca dos arquivos de `js/` segue também os `require('./x.js')` de dentro de `js/` (o dicionário requer a forma e a oração). |
| `docs/testes/oracao.test.mjs`, `cena-forma.test.mjs`, `cena-dicionario.test.mjs` (novos) | Os testes, ligados à suíte por `import` em `docs/testes/zero.test.mjs`. |

---

### Tarefa 1: o leitor de oração (`js/oracao.js`)

**Interface produzida:** `BZOracao = { TEXTO_MAX: 2000, semAcento(t) -> string, achaSemNegar(texto, re) -> RegExpExecArray | null }`. `texto` já passado por `semAcento`; `re` com a flag `g`.

- [ ] **Passo 1: teste vermelho** — `docs/testes/oracao.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const O = createRequire(import.meta.url)('../../js/oracao.js');

test('semAcento: minúsculas, sem acento, cortado em 2000; não-texto vira vazio', () => {
  assert.equal(O.semAcento('Clínica ÓTIMA'), 'clinica otima');
  assert.equal(O.semAcento('a'.repeat(2500)).length, 2000);
  for (const v of [null, undefined, 42, {}]) assert.equal(O.semAcento(v), '');
});

test('achaSemNegar: a ocorrência não negada na mesma oração; negação antes (até 3 palavras) ou logo depois apaga', () => {
  const re = /\bsomos (\d+)\b/g;
  assert.equal(O.achaSemNegar('somos 4 aqui', re)[1], '4');
  assert.equal(O.achaSemNegar('nao somos 4', re), null);
  assert.equal(O.achaSemNegar('nunca fomos e nem somos 4', re), null);
  assert.equal(O.achaSemNegar('nao sei, mas somos 4', re)[1], '4', 'a vírgula fecha a oração da negação');
  assert.equal(O.achaSemNegar('somos 4 nao', re), null, 'negação logo depois');
  assert.equal(O.achaSemNegar('nao somos 3, somos 4', re)[1], '4', 'a 2ª ocorrência vale');
});

test('achaSemNegar nunca lança e deixa a regex pronta para a próxima chamada', () => {
  const re = /\bx\b/g;
  assert.equal(O.achaSemNegar(null, re), null);
  assert.equal(O.achaSemNegar('x', null), null);
  O.achaSemNegar('x x', re);
  assert.equal(re.lastIndex, 0);
});
```

- [ ] **Passo 2:** `node --test docs/testes/oracao.test.mjs` → FALHA (`Cannot find module '../../js/oracao.js'`).

- [ ] **Passo 3: o módulo** — `js/oracao.js`:

```js
/* A ORAÇÃO E A NEGAÇÃO (Mapa vivo v2, Fase 2; a mesma regra de js/mapa-saber.js e js/orcamento-coerencia.js, revisões dos PRs 4, 5a e #289):
   uma palavra do texto livre vale se alguma ocorrência não estiver negada na MESMA oração. Vírgula, ponto, "mas", "só" e "porém" fecham a
   oração; "não", "nunca", "nem", "sem" e "nada de" até 3 palavras antes negam, e "não"/"nunca" até 2 palavras depois também ("e"/"ou" no meio
   abrem outra oração). PURO (sem DOM), ES5: window.BZOracao na tela, CommonJS no Node. Nunca lança. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZOracao = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var TEXTO_MAX = 2000;
  var NEGACAO = /\b(?:nao|nunca|nem|sem|nada de)(?: \w+){0,3}$/;
  var NEGACAO_DEPOIS = /^ *(?:(?!(?:e|ou) )\w+ +){0,2}(?:nao|nunca)\b/;
  var FIM_DA_ORACAO = /[,;.!?\n]|\b(?:mas|so|porem)\b/;

  /* minúsculas, sem acento, no máximo TEXTO_MAX caracteres; o que não é texto vira '' */
  function semAcento(t) {
    return typeof t === 'string' ? t.slice(0, TEXTO_MAX).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : '';
  }
  /* a 1ª ocorrência de re (flag g) que não está negada na sua oração, ou null. texto: já passado por semAcento */
  function achaSemNegar(texto, re) {
    if (typeof texto !== 'string' || !(re instanceof RegExp) || !re.global) return null;
    var m, achou = null;
    re.lastIndex = 0;
    while ((m = re.exec(texto))) {
      var antes = texto.slice(0, m.index).split(FIM_DA_ORACAO).pop().trim();
      var depois = texto.slice(m.index + m[0].length).split(FIM_DA_ORACAO)[0];
      if (!NEGACAO.test(antes) && !NEGACAO_DEPOIS.test(depois)) { achou = m; break; }
      if (m[0] === '') re.lastIndex++;
    }
    re.lastIndex = 0;
    return achou;
  }

  return Object.freeze({ TEXTO_MAX: TEXTO_MAX, semAcento: semAcento, achaSemNegar: achaSemNegar });
});
```

- [ ] **Passo 4:** `node --test docs/testes/oracao.test.mjs` → PASSA.
- [ ] **Passo 5: commit** — `git add js/oracao.js docs/testes/oracao.test.mjs` e `git commit` ("feat: o leitor de oração e negação comum (mapa vivo fase 2)").

---

### Tarefa 2: a forma da cena (`js/orcamento-cena-forma.js`)

**Interface produzida:** `BZCenaForma = { LUGARES, OFERTAS, DESTAQUES, CANAIS, GENTE_MAX: 6, CANAIS_MAX: 3, validar(c) -> { ok: true, cena } | { ok: false, erros: [{ caminho, codigo }] } }`. A cena é `{ lugar, gente, canais, oferta, destaque }`, devolvida como CÓPIA congelada. `lugar` é obrigatório; `oferta` e `destaque` são código ou `null`; `canais` é uma lista de até 3 códigos sem repetir; `gente` é um inteiro de 0 a 6 (6 = "6 ou mais"). Códigos de erro: `objeto`, `campo_desconhecido`, `caractere_proibido`, `fora_da_lista`, `obrigatorio`, `fora_do_limite`, `repetido`, `tipo`.

- [ ] **Passo 1: teste vermelho** — `docs/testes/cena-forma.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../../js/orcamento-cena-forma.js');
const MapaForma = require('../../js/orcamento-mapa-forma.js');
const BOA = { lugar: 'cozinha', gente: 4, canais: ['instagram', 'whatsapp'], oferta: 'cardapio', destaque: 'fotos' };
const codigos = r => (r.erros || []).map(e => e.caminho + ':' + e.codigo);

test('listas fechadas do tamanho da spec; os canais são os mesmos códigos do mapa do caso', () => {
  assert.equal(F.LUGARES.length, 10);
  assert.equal(F.OFERTAS.length, 12);
  assert.ok(F.DESTAQUES.length <= 5);
  assert.deepEqual([...F.CANAIS], [...MapaForma.ORIGENS_MAPA]);
  for (const l of [F.LUGARES, F.OFERTAS, F.DESTAQUES, F.CANAIS]) assert.ok(Object.isFrozen(l));
});

test('cena boa: ok, cópia congelada, a entrada não muda', () => {
  const entrada = JSON.parse(JSON.stringify(BOA));
  const r = F.validar(entrada);
  assert.equal(r.ok, true);
  assert.deepEqual(r.cena, BOA);
  assert.ok(Object.isFrozen(r.cena) && Object.isFrozen(r.cena.canais));
  assert.notEqual(r.cena.canais, entrada.canais);
  assert.deepEqual(entrada, BOA);
  assert.equal(F.validar({ ...BOA, oferta: null, destaque: null, canais: [], gente: 0 }).ok, true);
});

test('aceite 1: recusa lugar, oferta, destaque ou canal fora da lista, gente fora de 0..6 e texto com < ou >', () => {
  assert.deepEqual(codigos(F.validar({ ...BOA, lugar: 'castelo' })), ['lugar:fora_da_lista']);
  assert.deepEqual(codigos(F.validar({ ...BOA, oferta: 'nave' })), ['oferta:fora_da_lista']);
  assert.deepEqual(codigos(F.validar({ ...BOA, destaque: 'premio' })), ['destaque:fora_da_lista']);
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: ['instagram', 'orkut'] })), ['canais.1:fora_da_lista']);
  for (const gente of [-1, 7, 2.5, '4', NaN]) assert.equal(F.validar({ ...BOA, gente }).ok, false, String(gente));
  assert.deepEqual(codigos(F.validar({ ...BOA, lugar: '<img src=x>' })), ['lugar:caractere_proibido']);
  assert.deepEqual(codigos(F.validar({ ...BOA, oferta: 'a>b' })), ['oferta:caractere_proibido']);
});

test('limites, repetidos, campo desconhecido, lugar obrigatório, herdados e não-objetos', () => {
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: ['instagram', 'whatsapp', 'indicacao', 'tiktok'] })), ['canais:fora_do_limite']);
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: ['instagram', 'instagram'] })), ['canais.1:repetido']);
  assert.deepEqual(codigos(F.validar({ ...BOA, canais: 'instagram' })), ['canais:tipo']);
  assert.deepEqual(codigos(F.validar({ ...BOA, extra: 1 })), ['extra:campo_desconhecido']);
  assert.deepEqual(codigos(F.validar({ ...BOA, lugar: undefined })), ['lugar:obrigatorio']);
  for (const lugar of ['__proto__', 'constructor', 'toString']) assert.equal(F.validar({ ...BOA, lugar }).ok, false, lugar);
  for (const v of [null, undefined, 'cozinha', 42, [], () => 1]) assert.deepEqual(codigos(F.validar(v)), [':objeto']);
});

test('nunca lança, nem com getter que lança ou objeto sem protótipo', () => {
  const traicoeiro = { ...BOA };
  Object.defineProperty(traicoeiro, 'lugar', { get() { throw new Error('x'); }, enumerable: true });
  assert.equal(F.validar(traicoeiro).ok, false);
  const semProto = Object.assign(Object.create(null), BOA);
  assert.equal(F.validar(semProto).ok, true);
});

test('fonte ES5 (sem let, const, =>), sem DOM nem innerHTML', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-cena-forma.js', import.meta.url), 'utf8');
  assert.ok(!/\blet\b|\bconst\b|=>|`|innerHTML|document\./.test(fonte));
});
```

- [ ] **Passo 2:** `node --test docs/testes/cena-forma.test.mjs` → FALHA (módulo não existe).

- [ ] **Passo 3: o módulo** — `js/orcamento-cena-forma.js`:

```js
/* A FORMA DA CENA DO CASO (Mapa vivo v2, Fase 2; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 2"). UM arquivo para a tela e
   para o servidor, no molde de js/orcamento-mapa-forma.js: script clássico (window.BZCenaForma), CommonJS no Node. ES5, sem DOM.
   Cena = { lugar, gente, canais, oferta, destaque }: o tipo de lugar, quantas pessoas ela DISSE que são (6 = "6 ou mais"), até 3 canais (os
   códigos das origens do mapa do caso), o que vende como peça e um destaque. Só códigos de listas fechadas e um número: nenhum texto. A
   unicidade vem da combinação, nunca de sorteio. validar() nunca lança e devolve uma CÓPIA congelada. */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (raiz) raiz.BZCenaForma = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var congelar = function (l) { return Object.freeze(l.slice()); };
  var LUGARES = congelar(['consultorio', 'salao', 'cozinha', 'loja', 'oficina', 'escritorio', 'sala_aula', 'sede', 'estudio', 'obra']);
  var OFERTAS = congelar(['cardapio', 'encomenda', 'entrega', 'reserva', 'agenda', 'orcamento', 'vitrine', 'catalogo', 'aulas', 'galeria', 'loja_online', 'projeto']);
  var DESTAQUES = congelar(['fotos', 'depoimentos', 'localizacao', 'horarios']);
  /* os mesmos códigos de ORIGENS_MAPA (js/orcamento-mapa-forma.js); o teste prende as duas listas */
  var CANAIS = congelar(['instagram', 'whatsapp', 'google_busca', 'google_mapa', 'indicacao', 'passa_na_frente', 'facebook', 'tiktok', 'site_atual', 'outro']);
  var GENTE_MAX = 6, CANAIS_MAX = 3;
  var CAMPOS = congelar(['lugar', 'gente', 'canais', 'oferta', 'destaque']);
  var PROIBIDO = /[<>]/;

  var ehObjeto = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var naLista = function (lista, v) { return typeof v === 'string' && lista.indexOf(v) >= 0; };

  /* um código de lista: '' se bom, senão o código do erro */
  function conferirCodigo(lista, v, obrigatorio) {
    if (v === null || v === undefined) return obrigatorio ? 'obrigatorio' : '';
    if (typeof v !== 'string') return 'tipo';
    if (PROIBIDO.test(v)) return 'caractere_proibido';
    return naLista(lista, v) ? '' : 'fora_da_lista';
  }
  function conferirCanais(v, erros) {
    if (!Array.isArray(v)) { erros.push({ caminho: 'canais', codigo: 'tipo' }); return; }
    if (v.length > CANAIS_MAX) { erros.push({ caminho: 'canais', codigo: 'fora_do_limite' }); return; }
    for (var i = 0; i < v.length; i++) {
      var e = conferirCodigo(CANAIS, v[i], true);
      if (!e && v.indexOf(v[i]) !== i) e = 'repetido';
      if (e) erros.push({ caminho: 'canais.' + i, codigo: e });
    }
  }
  function conferir(c) {
    var erros = [], k, e;
    for (k in c) if (Object.prototype.hasOwnProperty.call(c, k) && CAMPOS.indexOf(k) < 0) erros.push({ caminho: k, codigo: 'campo_desconhecido' });
    if ((e = conferirCodigo(LUGARES, c.lugar, true))) erros.push({ caminho: 'lugar', codigo: e });
    if (typeof c.gente !== 'number' || c.gente % 1 !== 0 || c.gente < 0 || c.gente > GENTE_MAX) erros.push({ caminho: 'gente', codigo: 'fora_do_limite' });
    conferirCanais(c.canais, erros);
    if ((e = conferirCodigo(OFERTAS, c.oferta, false))) erros.push({ caminho: 'oferta', codigo: e });
    if ((e = conferirCodigo(DESTAQUES, c.destaque, false))) erros.push({ caminho: 'destaque', codigo: e });
    return erros;
  }

  /* validar(c) -> { ok: true, cena } | { ok: false, erros }. Nunca lança */
  function validar(c) {
    try {
      if (!ehObjeto(c)) return { ok: false, erros: [{ caminho: '', codigo: 'objeto' }] };
      var erros = conferir(c);
      if (erros.length) return { ok: false, erros: erros };
      return { ok: true, cena: Object.freeze({
        lugar: c.lugar, gente: c.gente, canais: Object.freeze(c.canais.slice()),
        oferta: c.oferta === undefined ? null : c.oferta, destaque: c.destaque === undefined ? null : c.destaque
      }) };
    } catch (x) {
      return { ok: false, erros: [{ caminho: '', codigo: 'objeto' }] };
    }
  }

  return Object.freeze({ LUGARES: LUGARES, OFERTAS: OFERTAS, DESTAQUES: DESTAQUES, CANAIS: CANAIS, GENTE_MAX: GENTE_MAX, CANAIS_MAX: CANAIS_MAX, validar: validar });
});
```

- [ ] **Passo 4:** `node --test docs/testes/cena-forma.test.mjs` → PASSA.
- [ ] **Passo 5: commit** — `git add js/orcamento-cena-forma.js docs/testes/cena-forma.test.mjs` e `git commit` ("feat: a forma fechada da cena do caso (mapa vivo fase 2)").

---

### Tarefa 3: o dicionário e a cena do caso (`js/cena-dicionario.js`)

**Interface consumida:** `BZOracao.semAcento`, `BZOracao.achaSemNegar` (Tarefa 1); `BZCenaForma.validar` e as listas (Tarefa 2).

**Interface produzida:** `BZCenaDicionario = { LUGAR_DO_RAMO, lugarDoCaso(ramo, texto) -> código | null, ofertaDoCaso(texto, objetivos) -> código | null, destaqueDoCaso(texto, objetivos, regulado) -> código | null, equipeDoTexto(texto) -> inteiro 1..999 | null, cenaDoCaso({ ramo, texto, canais, objetivos, regulado }) -> cena congelada | null }`.

Regras:
- **Lugar:** palavra do texto (não negada) que aponta um lugar COMPATÍVEL com o ramo tocado; senão, o lugar padrão do ramo; ramo fora da lista e sem palavra compatível → `null` (melhor nada que errado). Com o ramo `outro`, qualquer palavra vale.
- **Oferta:** a palavra não negada que aparece PRIMEIRO no texto; sem palavra, o objetivo tocado (`agendamentos` → `agenda`, `vender_online` → `loja_online`); senão `null`.
- **Destaque:** pedido de depoimento/avaliação no texto (só fora de nicho regulado) → `depoimentos`; senão o objetivo `achado_google` → `localizacao`; senão `apresentar` → `fotos`; senão `null`.
- **Equipe:** "somos N", "equipe/time de N", "N funcionários/colaboradores/profissionais/atendentes", "N pessoas na equipe", "trabalham N pessoas", "só eu"/"sozinha" = 1, "eu e minha sócia/meu marido…" = 2; números por extenso de um a trinta; a ocorrência mais à esquerda vale; negada na oração, não vale; 0 ou mais de 999, `null`. Fora do padrão ("atendo 20 pessoas por dia", "buffet para 100 pessoas"), `null`.
- **Cena:** `gente` = mínimo entre a equipe e 6 (sem equipe, 0); `canais` = os códigos recebidos (as origens já lidas por `BZMapaSaber.origensDoCaso`), só os da lista, sem repetir, no máximo 3; tudo passa por `BZCenaForma.validar`.

- [ ] **Passo 1: teste vermelho** — `docs/testes/cena-dicionario.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../../js/cena-dicionario.js');
const F = require('../../js/orcamento-cena-forma.js');
const RAMOS = ['servicos', 'saude', 'beleza', 'alimentacao', 'comercio', 'educacao', 'associacao', 'outro'];

test('aceite 3: os 8 ramos têm um lugar válido; ramo fora da lista, sem palavra, nada', () => {
  for (const r of RAMOS) assert.ok(F.LUGARES.includes(D.lugarDoCaso(r, '')), r);
  for (const r of ['banco', '__proto__', 'constructor', null, 42]) assert.equal(D.lugarDoCaso(r, ''), null, String(r));
});

test('sublugar por palavra, só se combina com o ramo; negado não vale', () => {
  assert.equal(D.lugarDoCaso('beleza', 'Tenho uma barbearia no centro'), 'salao');
  assert.equal(D.lugarDoCaso('servicos', 'Faço reformas e obras pequenas'), 'obra');
  assert.equal(D.lugarDoCaso('servicos', 'Oficina mecânica do bairro'), 'oficina');
  assert.equal(D.lugarDoCaso('saude', 'Estúdio de pilates'), 'estudio');
  assert.equal(D.lugarDoCaso('saude', 'Tenho uma oficina'), 'consultorio', 'oficina não combina com saúde: fica o padrão');
  assert.equal(D.lugarDoCaso('servicos', 'Não é obra, é consultoria'), 'escritorio');
  assert.equal(D.lugarDoCaso('outro', 'uma confeitaria'), 'cozinha', 'com "outro", a palavra decide');
});

test('aceite 2: equipe só quando ela diz; negação apaga; por extenso; fora do padrão, nada', () => {
  const casos = [
    ['Somos 4 aqui', 4], ['somos quatro', 4], ['Só eu', 1], ['trabalho sozinha', 1], ['Eu e minha sócia', 2], ['eu e meu marido cuidamos de tudo', 2],
    ['equipe de 12', 12], ['temos 3 funcionários', 3], ['uns 10 colaboradores', 10], ['trabalham 5 pessoas aqui', 5], ['7 pessoas na equipe', 7],
    ['Não somos 4', null], ['nao temos 3 funcionarios', null], ['atendo 20 pessoas por dia', null], ['buffet para 100 pessoas', null],
    ['tenho 3 lojas', null], ['', null], [null, null], ['somos 0', null], ['somos 1000', null]
  ];
  for (const [t, n] of casos) assert.equal(D.equipeDoTexto(t), n, String(t));
  assert.equal(D.equipeDoTexto('não sei, mas somos 4'), 4, 'a vírgula fecha a oração da negação');
  assert.equal(D.equipeDoTexto('somos 3 sócios e temos 8 funcionários'), 3, 'a mais à esquerda vale');
});

test('oferta: a 1ª palavra do texto; senão o objetivo; senão nada', () => {
  assert.equal(D.ofertaDoCaso('Vendo marmitas e faço entregas', []), 'cardapio');
  assert.equal(D.ofertaDoCaso('Faço entregas de marmitas', []), 'entrega');
  assert.equal(D.ofertaDoCaso('Não tenho cardápio, só encomendas de bolo', []), 'encomenda');
  assert.equal(D.ofertaDoCaso('', ['agendamentos']), 'agenda');
  assert.equal(D.ofertaDoCaso('', ['vender_online']), 'loja_online');
  assert.equal(D.ofertaDoCaso('', ['apresentar']), null);
});

test('aceite 4: nicho regulado nunca recebe depoimentos; fora dele, o destaque vem do texto ou do objetivo', () => {
  assert.equal(D.destaqueDoCaso('quero mostrar depoimentos dos pacientes', [], true), null);
  assert.equal(D.destaqueDoCaso('quero mostrar depoimentos dos pacientes', ['achado_google'], true), 'localizacao');
  assert.equal(D.destaqueDoCaso('quero mostrar as avaliações dos clientes', [], false), 'depoimentos');
  assert.equal(D.destaqueDoCaso('', ['achado_google', 'apresentar'], false), 'localizacao');
  assert.equal(D.destaqueDoCaso('', ['apresentar'], false), 'fotos');
  assert.equal(D.destaqueDoCaso('sem depoimentos, por favor', [], false), null);
  for (const r of RAMOS) for (const t of ['depoimentos', 'avaliações e depoimentos']) {
    const c = D.cenaDoCaso({ ramo: r, texto: t, canais: [], objetivos: [], regulado: true });
    assert.notEqual(c && c.destaque, 'depoimentos', r);
  }
});

test('cenaDoCaso: a cena válida, congelada, determinística; gente até 6; canais filtrados', () => {
  const caso = { ramo: 'alimentacao', texto: 'Somos 9 na cozinha, vendemos marmitas', canais: ['instagram', 'orkut', 'whatsapp', 'instagram', 'tiktok', 'indicacao'], objetivos: ['apresentar'], regulado: false };
  const c = D.cenaDoCaso(caso);
  assert.deepEqual(JSON.parse(JSON.stringify(c)), { lugar: 'cozinha', gente: 6, canais: ['instagram', 'whatsapp', 'tiktok'], oferta: 'cardapio', destaque: 'fotos' });
  assert.ok(Object.isFrozen(c));
  assert.deepEqual(D.cenaDoCaso(caso), c, 'mesma entrada, mesma cena');
  assert.equal(D.cenaDoCaso({ ...caso, texto: '' }).gente, 0);
  assert.equal(D.cenaDoCaso({ ...caso, ramo: 'banco', texto: '' }), null);
  for (const v of [null, undefined, 'x', 42, []]) assert.equal(D.cenaDoCaso(v), null);
});

test('aceite 5: casos diferentes da mesma área dão cenas diferentes (nenhuma idêntica entre respostas diferentes)', () => {
  const casos = [
    { ramo: 'alimentacao', texto: 'Somos 4, vendemos marmitas', canais: ['instagram'], objetivos: [] },
    { ramo: 'alimentacao', texto: 'Só eu, faço bolos sob encomenda', canais: ['whatsapp'], objetivos: [] },
    { ramo: 'alimentacao', texto: 'Restaurante com reservas, equipe de 12', canais: ['google_mapa'], objetivos: ['achado_google'] },
    { ramo: 'alimentacao', texto: 'Padaria, entregas no bairro', canais: ['indicacao', 'whatsapp'], objetivos: ['apresentar'] },
    { ramo: 'saude', texto: 'Clínica odontológica, somos 3 dentistas', canais: ['instagram'], objetivos: ['agendamentos'] },
    { ramo: 'saude', texto: 'Estúdio de pilates, só eu', canais: ['indicacao'], objetivos: ['agendamentos'] },
    { ramo: 'saude', texto: 'Psicóloga, atendimento online', canais: ['google_busca'], objetivos: ['achado_google'] },
    { ramo: 'beleza', texto: 'Barbearia, somos 2', canais: ['instagram', 'passa_na_frente'], objetivos: ['agendamentos'] },
    { ramo: 'beleza', texto: 'Salão com 6 cabeleireiras', canais: ['whatsapp'], objetivos: ['apresentar'] },
    { ramo: 'servicos', texto: 'Faço reformas, equipe de 5, orçamento grátis', canais: ['indicacao'], objetivos: [] },
    { ramo: 'servicos', texto: 'Oficina mecânica, 3 funcionários', canais: ['google_mapa'], objetivos: ['achado_google'] },
    { ramo: 'servicos', texto: 'Escritório de contabilidade', canais: ['indicacao'], objetivos: ['apresentar'] },
    { ramo: 'comercio', texto: 'Loja de roupas, vitrine no centro', canais: ['instagram', 'passa_na_frente'], objetivos: [] },
    { ramo: 'comercio', texto: 'Quero vender online meus produtos', canais: ['instagram'], objetivos: ['vender_online'] },
    { ramo: 'educacao', texto: 'Curso de inglês, turmas pequenas', canais: ['facebook'], objetivos: [] },
    { ramo: 'educacao', texto: 'Aulas particulares, só eu', canais: ['indicacao'], objetivos: ['agendamentos'] },
    { ramo: 'associacao', texto: 'Associação de moradores', canais: ['whatsapp'], objetivos: ['apresentar'] },
    { ramo: 'outro', texto: 'Estúdio de tatuagem, somos 2', canais: ['instagram'], objetivos: ['agendamentos'] }
  ];
  const assinaturas = casos.map(c => JSON.stringify(D.cenaDoCaso({ ...c, regulado: false })));
  assert.ok(assinaturas.every(a => a !== 'null'), 'todos desenham');
  assert.equal(new Set(assinaturas).size, casos.length, 'nenhuma cena idêntica');
});

test('nunca lança; nenhum texto da pessoa sai (só códigos e números)', () => {
  const hostil = '<img src=x onerror=alert(1)> somos 4 '.repeat(200);
  const c = D.cenaDoCaso({ ramo: 'outro', texto: hostil, canais: ['<b>'], objetivos: ['__proto__'], regulado: false });
  assert.ok(!/[<>]|img|alert/.test(JSON.stringify(c)));
  for (const f of ['lugarDoCaso', 'ofertaDoCaso', 'destaqueDoCaso', 'equipeDoTexto', 'cenaDoCaso']) {
    assert.doesNotThrow(() => D[f]({ toString() { throw new Error('x'); } }, { length: 1 }), f);
  }
});

test('o caminho do navegador: os três scripts juntos, na ordem, sem require, dão a mesma cena', () => {
  const ctx = { window: {} };
  ctx.window.window = ctx.window;
  for (const f of ['oracao.js', 'orcamento-cena-forma.js', 'cena-dicionario.js']) vm.runInNewContext(fs.readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8'), ctx);
  const caso = { ramo: 'beleza', texto: 'Barbearia, somos 2', canais: ['instagram'], objetivos: [], regulado: false };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.BZCenaDicionario.cenaDoCaso(caso))), JSON.parse(JSON.stringify(D.cenaDoCaso(caso))));
});

test('fontes ES5 sem DOM; nenhuma página carrega os módulos novos ainda (PR 2 liga)', () => {
  for (const f of ['oracao.js', 'cena-dicionario.js']) {
    const fonte = fs.readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8');
    assert.ok(!/\blet\b|\bconst\b|=>|`|innerHTML|document\./.test(fonte), f);
  }
  for (const p of fs.readdirSync(new URL('../../', import.meta.url)).filter(n => n.endsWith('.html'))) {
    assert.ok(!/cena-dicionario|orcamento-cena-forma|oracao\.js/.test(fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8')), p);
  }
});
```

- [ ] **Passo 2:** `node --test docs/testes/cena-dicionario.test.mjs` → FALHA (módulo não existe).

- [ ] **Passo 3: o módulo** — `js/cena-dicionario.js`:

```js
/* QUEM PREENCHE A CENA POR CÓDIGO, NO APARELHO (Mapa vivo v2, Fase 2; cofre: 01 Empresa/Mapa vivo v2 - especificação 2026-11-21.md, "FASE 2").
   Do ramo tocado, das respostas (objetivos), das origens já lidas (BZMapaSaber.origensDoCaso) e do que ela escreveu: o lugar, quantas pessoas
   (só quando ela DIZ), o que vende e um destaque. 0 ms, sem rede, determinístico (a mesma entrada, a mesma cena). Na dúvida, nada: o lugar
   só sai de palavra que combina com o ramo; a equipe só vira número dita; nicho regulado nunca recebe depoimentos. Faturamento não é lido.
   Usa js/oracao.js (a oração e a negação) e js/orcamento-cena-forma.js (a forma). PURO, ES5: window.BZCenaDicionario na tela (os dois
   antes, na ordem), CommonJS no Node. Nunca lança; nenhum texto dela sai daqui, só códigos e números. */
(function (raiz, fabrica) {
  'use strict';
  var cjs = typeof module === 'object' && module && module.exports;
  var api = fabrica(cjs ? require('./oracao.js') : raiz && raiz.BZOracao, cjs ? require('./orcamento-cena-forma.js') : raiz && raiz.BZCenaForma);
  if (cjs) module.exports = api;
  if (raiz) raiz.BZCenaDicionario = api;
})(typeof window !== 'undefined' ? window : null, function (O, F) {
  'use strict';

  var tabela = function (o) { var t = Object.create(null), k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) t[k] = o[k]; return Object.freeze(t); };
  var tem = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
  var lista = function (v) { return Array.isArray(v) ? v : []; };

  var LUGAR_DO_RAMO = tabela({
    servicos: 'escritorio', saude: 'consultorio', beleza: 'salao', alimentacao: 'cozinha', comercio: 'loja', educacao: 'sala_aula', associacao: 'sede', outro: 'escritorio'
  });
  /* os lugares que uma palavra pode trocar, por ramo ("outro": qualquer um) */
  var COMBINAM = tabela({
    servicos: ['escritorio', 'oficina', 'obra', 'estudio'], saude: ['consultorio', 'estudio'], beleza: ['salao', 'estudio'], alimentacao: ['cozinha', 'loja'],
    comercio: ['loja', 'oficina'], educacao: ['sala_aula', 'estudio'], associacao: ['sede'], outro: F.LUGARES
  });
  /* palavra -> lugar (minúsculas, sem acento), na ordem de preferência */
  var LUGAR_POR_PALAVRA = [
    ['oficina', /\b(?:oficina|mecanic\w*|funilaria|borracharia|autoeletrica|auto eletrica)\b/g],
    ['obra', /\b(?:obras?|reformas?|construc\w*|pedreir\w*|marcenari\w*|marceneir\w*|eletricist\w*|encanador\w*)\b/g],
    ['estudio', /\b(?:estudio|academia|pilates|crossfit|yoga|fotograf\w*|tatuage\w*|tattoo)\b/g],
    ['salao', /\b(?:barbearia|barbeir\w*|salao|manicure|cabeleireir\w*)\b/g],
    ['consultorio', /\b(?:consultorio|clinica|odonto\w*|dentist\w*|psicolog\w*|fisioterap\w*|nutricionist\w*)\b/g],
    ['cozinha', /\b(?:padaria|confeitaria|restaurante|lanchonete|hamburgueria|pizzaria|marmit\w*|doceria|cozinha)\b/g],
    ['loja', /\b(?:loja|boutique|mercado|mercearia|papelaria|petshop|pet shop)\b/g],
    ['sala_aula', /\b(?:escola|cursos?|aulas?|professor\w*|reforco)\b/g],
    ['escritorio', /\b(?:escritorio|advocacia|advogad\w*|contabil\w*|consultoria|imobiliaria)\b/g]
  ];
  /* palavra -> o que vende; vale a que aparece primeiro no texto */
  var OFERTA_POR_PALAVRA = [
    ['cardapio', /\b(?:cardapio|menu|pratos?|lanches?|pizzas?|marmitas?)\b/g],
    ['encomenda', /\b(?:encomendas?|bolos?|doces)\b/g],
    ['entrega', /\b(?:delivery|entregas?|tele ?entrega)\b/g],
    ['reserva', /\b(?:reservas?|reservar)\b/g],
    ['agenda', /\b(?:agend\w*|horarios? marcados?|marcar horario)\b/g],
    ['orcamento', /\b(?:orcamentos?|cotac\w*|visita tecnica)\b/g],
    ['vitrine', /\b(?:vitrine|roupas?|colec\w*)\b/g],
    ['catalogo', /\b(?:catalogo|linha de produtos)\b/g],
    ['aulas', /\b(?:aulas?|turmas?|matricul\w*)\b/g],
    ['galeria', /\b(?:portfolio|trabalhos feitos|galeria)\b/g],
    ['loja_online', /\b(?:loja (?:online|virtual)|vender online|e-?commerce|pagamento online)\b/g],
    ['projeto', /\b(?:projetos?|sob medida)\b/g]
  ];
  var OFERTA_DO_OBJETIVO = tabela({ agendamentos: 'agenda', vender_online: 'loja_online' });
  var DEPOIMENTO = /\b(?:depoimentos?|avaliac\w*|o que (?:os )?clientes dizem)\b/g;

  /* ---------- equipe ---------- */
  var EXTENSO = tabela({
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30
  });
  var N = '(\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta)';
  var CERCA = '(?:uns |umas |cerca de |quase |mais de )?';
  var GENTE = '(?:funcionari[oa]s|colaborador(?:es|as)|profissionais|atendentes|dentistas|cabeleireir[oa]s|professor(?:es|as))';
  /* [regex, número fixo ou null = o grupo 1] */
  var EQUIPE = [
    [new RegExp('\\bsomos (?:em )?' + CERCA + N + '\\b', 'g'), null],
    [new RegExp('\\b(?:equipe|time) de ' + CERCA + N + '\\b', 'g'), null],
    [new RegExp('\\b' + CERCA + N + ' ' + GENTE + '\\b', 'g'), null],
    [new RegExp('\\b' + N + ' pessoas? (?:na|no) (?:equipe|time)\\b', 'g'), null],
    [new RegExp('\\btrabalham (?:aqui )?' + CERCA + N + ' pessoas\\b', 'g'), null],
    [/\b(?:so eu|sou so eu|sozinh[oa])\b/g, 1],
    [/\beu e (?:o |a )?(?:meu |minha )?(?:socio|socia|espos[oa]|marido|mulher|irma|irmao|filh[oa]|mae|pai|namorad[oa])\b/g, 2]
  ];
  var numero = function (s) { return /^\d+$/.test(s) ? parseInt(s, 10) : (tem(EXTENSO, s) ? EXTENSO[s] : 0); };

  /* equipeDoTexto(texto) -> 1..999 ou null: só o que ela DISSE; a ocorrência mais à esquerda vale */
  function equipeDoTexto(texto) {
    try {
      var t = O.semAcento(texto), melhor = null, i;
      if (!t) return null;
      for (i = 0; i < EQUIPE.length; i++) {
        var m = O.achaSemNegar(t, EQUIPE[i][0]);
        if (m && (!melhor || m.index < melhor.indice)) melhor = { indice: m.index, n: EQUIPE[i][1] === null ? numero(m[1]) : EQUIPE[i][1] };
      }
      return melhor && melhor.n >= 1 && melhor.n <= 999 ? melhor.n : null;
    } catch (x) { return null; }
  }

  /* ---------- lugar, oferta, destaque ---------- */
  function lugarDoCaso(ramo, texto) {
    try {
      if (!tem(LUGAR_DO_RAMO, ramo)) return null;
      var t = O.semAcento(texto), i;
      for (i = 0; t && i < LUGAR_POR_PALAVRA.length; i++) {
        var lugar = LUGAR_POR_PALAVRA[i][0];
        if (COMBINAM[ramo].indexOf(lugar) >= 0 && O.achaSemNegar(t, LUGAR_POR_PALAVRA[i][1])) return lugar;
      }
      return LUGAR_DO_RAMO[ramo];
    } catch (x) { return null; }
  }
  function ofertaDoCaso(texto, objetivos) {
    try {
      var t = O.semAcento(texto), melhor = null, i, obj = lista(objetivos);
      for (i = 0; t && i < OFERTA_POR_PALAVRA.length; i++) {
        var m = O.achaSemNegar(t, OFERTA_POR_PALAVRA[i][1]);
        if (m && (!melhor || m.index < melhor.indice)) melhor = { indice: m.index, oferta: OFERTA_POR_PALAVRA[i][0] };
      }
      if (melhor) return melhor.oferta;
      for (i = 0; i < obj.length; i++) if (tem(OFERTA_DO_OBJETIVO, obj[i])) return OFERTA_DO_OBJETIVO[obj[i]];
      return null;
    } catch (x) { return null; }
  }
  function destaqueDoCaso(texto, objetivos, regulado) {
    try {
      var obj = lista(objetivos);
      if (regulado !== true && O.achaSemNegar(O.semAcento(texto), DEPOIMENTO)) return 'depoimentos';
      if (obj.indexOf('achado_google') >= 0) return 'localizacao';
      if (obj.indexOf('apresentar') >= 0) return 'fotos';
      return null;
    } catch (x) { return null; }
  }

  /* cenaDoCaso({ ramo, texto, canais, objetivos, regulado }) -> a cena congelada (BZCenaForma.validar) ou null */
  function cenaDoCaso(caso) {
    try {
      if (!caso || typeof caso !== 'object' || Array.isArray(caso)) return null;
      var lugar = lugarDoCaso(caso.ramo, caso.texto);
      if (!lugar) return null;
      var equipe = equipeDoTexto(caso.texto), canais = [], c = lista(caso.canais), i;
      for (i = 0; i < c.length && canais.length < F.CANAIS_MAX; i++) if (F.CANAIS.indexOf(c[i]) >= 0 && canais.indexOf(c[i]) < 0) canais.push(c[i]);
      var r = F.validar({
        lugar: lugar, gente: equipe ? Math.min(equipe, F.GENTE_MAX) : 0, canais: canais,
        oferta: ofertaDoCaso(caso.texto, caso.objetivos), destaque: destaqueDoCaso(caso.texto, caso.objetivos, caso.regulado === true)
      });
      return r.ok ? r.cena : null;
    } catch (x) { return null; }
  }

  return Object.freeze({
    LUGAR_DO_RAMO: LUGAR_DO_RAMO, lugarDoCaso: lugarDoCaso, ofertaDoCaso: ofertaDoCaso, destaqueDoCaso: destaqueDoCaso, equipeDoTexto: equipeDoTexto, cenaDoCaso: cenaDoCaso
  });
});
```

- [ ] **Passo 4:** `node --test docs/testes/cena-dicionario.test.mjs` → PASSA. Se algum caso do aceite 5 der cena igual, ou algum caso de equipe falhar, ajustar a tabela ou a regex e anotar no relatório do PR qual caso pediu a mudança (o teste vermelho é a evidência).
- [ ] **Passo 5: commit** — `git add js/cena-dicionario.js docs/testes/cena-dicionario.test.mjs` e `git commit` ("feat: o dicionário da cena e o leitor de equipe (mapa vivo fase 2)").

---

### Tarefa 4: ligar os testes à suíte e a fumaça seguir os `require` de `js/`

**Arquivos:** `docs/testes/zero.test.mjs` (fim do arquivo), `docs/worker-fumaca.mjs` (`jsQueAApiImporta`).

- [ ] **Passo 1:** acrescentar ao fim de `docs/testes/zero.test.mjs`, depois de `import './coerencia-tela.test.mjs';`:

```js
import './oracao.test.mjs';
import './cena-forma.test.mjs';
import './cena-dicionario.test.mjs';
```

- [ ] **Passo 2:** em `docs/worker-fumaca.mjs`, depois de juntar os imports de `api/` e `cloudflare/`, seguir os `require('./x.js')` de cada arquivo de `js/` achado (o dicionário requer a forma e a oração; quando o PR 2 o importar no servidor, a fumaça precisa levá-los):

```js
  ['api', 'cloudflare'].forEach(varrer);
  /* os arquivos de js/ que requerem outros de js/ (o dicionário da cena requer a forma e a oração): segue a cadeia */
  const fila = [...achados];
  while (fila.length) {
    const rel = fila.shift();
    for (const m of fs.readFileSync(path.join(RAIZ, rel), 'utf8').matchAll(/require\(\s*['"]\.\/([\w.-]+\.js)['"]\s*\)/g)) {
      const dep = 'js/' + m[1];
      if (!achados.has(dep)) { achados.add(dep); fila.push(dep); }
    }
  }
  return [...achados].sort();
```

(substitui as duas linhas finais `['api', 'cloudflare'].forEach(varrer);` e `return [...achados].sort();`; atualizar o comentário da função: "nenhum deles importa outro de js/ hoje" vira "segue os require('./x.js') de dentro de js/").

- [ ] **Passo 3:** conferir a lista de hoje (os mesmos 6 de antes, porque a API ainda não importa o dicionário) com o mesmo `achar.mjs` usado no #291, e `node --check docs/worker-fumaca.mjs`.
- [ ] **Passo 4:** `npm run testar` inteiro (sozinho na máquina) → 0 falhas.
- [ ] **Passo 5: commit** — "test: os testes da cena na suíte; a fumaça segue os require de js/".

---

### Tarefa 5: processo de nível 3

- [ ] Revisão técnica (typescript-reviewer) e de segurança (security-reviewer), agentes diferentes do autor, sobre `git diff origin/main...HEAD`; tratar achados com teste visto vermelho.
- [ ] Push do ramo `mapa-vivo-cena-forma`; PR no molde do #291 (O que mudou, nível 3, Especificação, Visto rodando = "não se aplica: nenhuma página carrega os módulos; o teste de página prova", Verificação comportamental, Vermelho, links das revisões, Regressão com a suíte e os checks um a um, Segurança).
- [ ] Despertador da CI (`avisar-ci.mjs pr <n>`), checks um a um, `main` contida no ramo, mesclar com `--match-head-commit`, CI da `main`, promover com o mesmo SHA, conferir o ar e o `git diff origin/main origin/producao` vazio.

## Autoconferência (contra a spec)

- Gramática fechada com `validar()` que nunca lança: Tarefa 2 (aceite 1).
- Dicionário ramo → lugar com subramos por palavra: Tarefa 3 (aceite 3).
- Equipe só dita, com negação; faturamento não coletado: Tarefa 3 (aceite 2).
- Nicho regulado sem depoimentos: Tarefa 3 (aceite 4).
- Determinismo e unicidade sem sorteio: Tarefa 3 (aceite 5, 18 casos; a meta de 30 roteiros do laboratório fica para o PR 2, com o desenho).
- Nenhum texto em `innerHTML`, class, id ou seletor: os módulos não tocam o DOM, e os testes de fonte provam (aceite 7, parte do PR 1).
- Fica para o PR 2: o desenho (`js/cena-desenho.js`), os limites de tela (uma cena, 6 bonequinhos + "+N", altura reservada ≈ 120 px a 390), o movimento reduzido (aceite 6), a ligação com a miniatura `.nasce` e com a conversa, o campo `negocio.equipe` no briefing, a parte da chamada da 1b que devolve `lugar`/`oferta` quando o código não sabe, e as medidas (% de cenas, tempo de desenho).
- Decisão aberta do dono que NÃO trava este PR: item 3 da seção 5 (toque opcional "Quantas pessoas trabalham aí?"). Este PR só lê o que ela escreve.
