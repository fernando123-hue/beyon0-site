/* SEM HTML DO MODELO NA PLANTA (spec §4.2): todo texto que o modelo escreve entra na tela por textContent. Este teste LÊ o código dos
   módulos js/planta-*.js e falha se achar qualquer porta de entrada para HTML ou código: innerHTML, outerHTML, insertAdjacentHTML,
   document.write, eval(, new Function, setAttribute('style'...), .cssText, e também atributos de evento (onclick...), srcdoc, javascript:
   e a construção de seletor com id. Comentários e textos de explicação não contam; um trecho de código conta.
   node --test docs/testes/planta-sem-html.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = fileURLToPath(new URL('../../js/', import.meta.url));
const arquivos = fs.readdirSync(JS).filter((n) => /^planta-.+\.js$/.test(n)).sort();

/* o código sem comentários, mas COM o texto das strings (setAttribute('style') e 'onclick' moram em strings) */
function codigoComStrings(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

const PROIBIDOS = [
  ['innerHTML', /\binnerHTML\b/], ['outerHTML', /\bouterHTML\b/], ['insertAdjacentHTML', /\binsertAdjacentHTML\b/], ['document.write', /\bdocument\s*\.\s*write(ln)?\b/],
  ['eval(', /\beval\s*\(/], ['new Function', /\bnew\s+Function\b/], ['Function(', /(^|[^.\w])Function\s*\(/],
  ["setAttribute('style'", /setAttribute\s*\(\s*['"]style['"]/], ['.cssText', /\.cssText\b/], ['setAttribute de evento (on...)', /setAttribute\s*\(\s*['"]on\w+/i],
  ['srcdoc', /\bsrcdoc\b/], ['javascript:', /javascript:/i], ['DOMParser/createContextualFragment', /DOMParser|createContextualFragment/],
  ['setTimeout/setInterval com texto', /set(Timeout|Interval)\s*\(\s*['"]/], ['querySelector montado com id', /querySelector(All)?\s*\(\s*['"][^'"]*['"]\s*\+/],
  ['atributo id= com dado', /setAttribute\s*\(\s*['"]id['"]/],
  ['href/xlink:href/src por atributo', /setAttribute\s*\(\s*['"](xlink:)?(href|src|action|formaction|poster|data|background)['"]/i], ['setAttributeNS', /setAttributeNS\s*\(/],
  ['propriedade href/src', /\.\s*(href|src|srcdoc|action|formAction|poster)\s*=[^=]/], ['propriedade on* (onclick...)', /\.\s*on[a-z]+\s*=[^=]/], ['atribuição a .style', /\.\s*style\s*=[^=]/]
];

export function achados(src, nome) {
  const c = codigoComStrings(src);
  /* a regra do id vale para os módulos do PLANO (peças, layout, desenho): o id do modelo nunca vira atributo id. O radar (outro PR) gera o dele (contador) para o aria-labelledby */
  return PROIBIDOS.filter(([n, re]) => re.test(c) && !(n === 'atributo id= com dado' && nome === 'planta-radar.js')).map(([n]) => n);
}

test('há módulos planta-*.js para varrer', () => {
  assert.ok(arquivos.length >= 3, arquivos.join(','));
});

for (const nome of arquivos) {
  test(nome + ': nenhuma porta para HTML ou código (innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, style por atributo, cssText)', () => {
    assert.deepEqual(achados(fs.readFileSync(path.join(JS, nome), 'utf8'), nome), [], nome);
  });
}

test('sanidade da varredura: ela enxerga cada porta (e ignora comentário)', () => {
  const casos = {
    innerHTML: 'el.innerHTML = x;', outerHTML: 'el.outerHTML = x;', insertAdjacentHTML: "el.insertAdjacentHTML('beforeend', x);", 'document.write': 'document.write(x);', 'eval(': 'eval(x);',
    'new Function': "new Function('return 1');", "setAttribute('style'": "el.setAttribute('style', 'a:b');", '.cssText': 'el.style.cssText = "a:b";', srcdoc: 'f.srcdoc = x;',
    'setAttribute de evento (on...)': "el.setAttribute('onclick', 'x()');", 'javascript:': "a.href = 'javascript:alert(1)';",
    'href/xlink:href/src por atributo': "el.setAttribute('xlink:href', t); el.setAttribute('href', t); img.setAttribute('src', t);", 'setAttributeNS': "el.setAttributeNS(null, 'href', t);",
    'propriedade href/src': 'li.href = t; f.src = t;', 'propriedade on* (onclick...)': 'li.onclick = t;', 'atribuição a .style': "el.style = 'a:b';"
  };
  for (const [nome, codigo] of Object.entries(casos)) assert.ok(achados(codigo).includes(nome), 'não viu: ' + nome);
  assert.deepEqual(achados('/* innerHTML eval( */ var a = 1; // el.innerHTML = x'), []);
});

test('o DOM falso lança em innerHTML, então um uso escondido derrubaria os testes do desenho (rede de segurança dupla)', async () => {
  const { criarJanela } = await import('./planta-dom-falso.mjs');
  const w = criarJanela();
  const el = w.document.createElement('div');
  assert.throws(() => { el.innerHTML = '<b>x</b>'; }, /proibido/);
  assert.throws(() => el.insertAdjacentHTML('beforeend', 'x'), /proibido/);
  assert.throws(() => el.outerHTML, /proibido/);
});
