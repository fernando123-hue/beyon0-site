/* O TELEFONE/WHATSAPP E O E-MAIL DO SITE (PR 3b-3, decisão M3 do dono de 22/10): uma regra só (ESQ.contatoDoSite) para a tela, o servidor e o banco. Normaliza o que a pessoa digita,
   confere formato e tamanho, recusa lixo. As MESMAS listas de docs/testes/_contato.mjs valem para o banco (previa-esquema e previa-banco).  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ESQ from '../../js/orcamento-material-esquema.js';
import { WHATSAPP_BONS, WHATSAPP_RUINS, EMAIL_BONS, EMAIL_RUINS } from './_contato.mjs';

test('o formato é o do banco: as listas compartilhadas passam e falham do mesmo jeito', () => {
  for (const w of WHATSAPP_BONS) assert.ok(ESQ.WHATSAPP_SITE.test(w), w);
  for (const w of WHATSAPP_RUINS) assert.ok(!ESQ.WHATSAPP_SITE.test(w), JSON.stringify(w));
  for (const m of EMAIL_BONS) assert.ok(ESQ.emailDoSiteValido(m), m);
  for (const m of EMAIL_RUINS) assert.ok(!ESQ.emailDoSiteValido(m), JSON.stringify(m));
});

test('contatoDoSite normaliza o que a pessoa digita (máscara, +55, maiúsculas, espaços das pontas) e devolve só o formato guardado', () => {
  for (const [bruto, esperado] of [['(21) 97716-7944', '+5521977167944'], ['21 97716-7944', '+5521977167944'], ['+55 21 97716-7944', '+5521977167944'], ['5521977167944', '+5521977167944'],
    ['(21) 3333-4444', '+552133334444'], ['  (67) 99999-0001  ', '+5567999990001']]) {
    assert.deepEqual(ESQ.contatoDoSite(bruto, ''), { ok: true, whatsapp: esperado, email: null }, bruto);
  }
  assert.deepEqual(ESQ.contatoDoSite('', '  Contato@ClinicaSol.com.br '), { ok: true, whatsapp: null, email: 'contato@clinicasol.com.br' });
  assert.deepEqual(ESQ.contatoDoSite(null, undefined), { ok: true, whatsapp: null, email: null }, 'os dois campos são opcionais');
  assert.deepEqual(ESQ.contatoDoSite('21977167944', 'a@b.com.br'), { ok: true, whatsapp: '+5521977167944', email: 'a@b.com.br' });
});

test('contatoDoSite recusa lixo, dizendo qual campo: letras no número, curto ou longo demais, DDD que não existe, celular sem o 9, e-mail sem domínio, com espaço ou grande demais', () => {
  for (const w of ['abc21977167944', '21977167944 ramal 12', '2197716', '+55 21 97716-7944 99', '(01) 97716-7944', '21 87716-7944', '21 1777-1679', '<script>', 'x'.repeat(200)]) {
    assert.deepEqual(ESQ.contatoDoSite(w, ''), { ok: false, erro: 'whatsapp' }, w);
  }
  for (const m of ['a@b', 'a b@c.com', '@x.com', 'a..b@c.com', 'x'.repeat(65) + '@a.com', 'a@' + 'b'.repeat(120) + '.com', '<a>@b.com', 'a@b.com, c@d.com', 'mailto:a@b.com']) {
    assert.deepEqual(ESQ.contatoDoSite('', m), { ok: false, erro: 'email' }, m);
  }
  assert.equal(ESQ.contatoDoSite('abc', 'a@b').erro, 'whatsapp', 'o número é conferido primeiro');
});

test('os limites de tamanho são os do banco e a versão da autorização cabe na coluna', () => {
  assert.deepEqual({ ...ESQ.CONTATO_MAX }, { whatsapp: 30, email: 120, email_local: 64 });
  assert.ok(ESQ.AUTORIZACAO.versao.length >= 1 && ESQ.AUTORIZACAO.versao.length <= 20, 'a coluna contato_autorizacao_versao aceita até 20 caracteres');
});
