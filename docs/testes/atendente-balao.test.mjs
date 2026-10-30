/* O SCRIPT DO BALÃO (js/atendente-balao.js): regras de segurança e de estilo conferidas no código (a tela foi vista a 390px no navegador).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../js/atendente-balao.js', import.meta.url), 'utf8');
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '');

test('sem innerHTML, outerHTML, insertAdjacentHTML, document.write, eval ou new Function', () => {
  for (const r of [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/]) assert.doesNotMatch(codigo, r, String(r));
});
test('sem desfoque nem sombra (dono: nunca blur nem brilho suave)', () => {
  for (const r of [/blur/i, /box-shadow/i, /drop-shadow/i, /text-shadow/i, /backdrop-filter/i]) assert.doesNotMatch(codigo, r, String(r));
});
test('isolado: Shadow DOM fechado, estilos por CSSStyleSheet (sem depender de <style> na CSP do cliente)', () => {
  assert.match(codigo, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.match(codigo, /adoptedStyleSheets/);
});
test('sem segredo no script: só o id público; nenhuma chave, token ou segredo', () => {
  assert.doesNotMatch(codigo, /api[_-]?key|secret|token|sk-|service_role/i);
});
test('o link de passagem só vale se começar por https://wa.me/ e sai com noopener', () => {
  assert.match(codigo, /indexOf\('https:\/\/wa\.me\/'\) === 0/);
  assert.match(codigo, /noopener/);
});
test('acessível: rótulo no botão, role=log com aria-live, Esc fecha, campo com label, fonte de 16px no campo', () => {
  assert.match(codigo, /aria-label': 'Abrir o atendimento virtual'/);
  assert.match(codigo, /role: 'log', 'aria-live': 'polite'/);
  assert.match(codigo, /key === 'Escape'/);
  assert.match(codigo, /el\('label', \{ for: 'bz-texto'/);
  assert.match(codigo, /font:inherit/);
  assert.match(codigo, /font:16px/);
});
test('a etiqueta fixa "Assistente virtual · negócio" e o aviso de conversa guardada com link de privacidade', () => {
  assert.match(codigo, /'Assistente virtual · ' \+ cfg\.nome/);
  assert.match(codigo, /As conversas ficam guardadas/);
  assert.match(codigo, /Privacidade/);
});
test('o texto do visitante e da IA entra por textContent, e as cores só se forem #rrggbb', () => {
  assert.match(codigo, /e\.textContent = props\[k\]/);
  assert.match(codigo, /COR = \/\^#\[0-9a-f\]\{6\}\$\//);
});
