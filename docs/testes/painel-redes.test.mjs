/* O painel monta os links das redes do cliente no NAVEGADOR (js/painel-pedido-comum.js), com uma cópia do REDES do
   servidor (api/_vendas/pedido.mjs). Se as duas derivarem, o painel deixa de validar o que o servidor aceita (ou
   aceita o que o servidor recusaria). Este teste lê o .js como texto, extrai a tabela e compara com a do servidor:
   as mesmas redes, o mesmo formato de usuário (source), os mesmos nomes reservados e o domínio fixo no link.  npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REDES as SERVIDOR } from '../../api/_vendas/pedido.mjs';

const fonte = readFileSync(new URL('../../js/painel-pedido-comum.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bloco = fonte.match(/var REDES = (\{\n[\s\S]*?\n {2}\});/);
assert.ok(bloco, 'não achei "var REDES = {...};" em js/painel-pedido-comum.js');
const PAINEL = new Function('return ' + bloco[1])();   /* (o literal do próprio arquivo do site, lido como texto) */

test('painel: as mesmas redes que o servidor aceita, nem mais nem menos', () => {
  assert.deepEqual(Object.keys(PAINEL).sort(), Object.keys(SERVIDOR).sort());
});

for (const rede of Object.keys(SERVIDOR)) {
  test('painel: ' + rede + ' tem o mesmo nome, formato de usuário, reservados e domínio fixo do servidor', () => {
    const s = SERVIDOR[rede], p = PAINEL[rede];
    assert.ok(p, rede + ' falta no painel');
    assert.equal(p.nome, s.nome);
    assert.equal(p.ok.source, s.usuario.source, 'formato do usuário');
    assert.equal(p.ok.flags, s.usuario.flags);
    assert.deepEqual(p.reservados || [], s.reservados || [], 'nomes reservados');
    const url = new URL(p.url('Exemplo'));
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'www.' + s.dominio, 'o link vai para o domínio fixo da rede');
    assert.ok(/^\/(@|company\/)?Exemplo\/?$/.test(url.pathname), 'caminho: ' + url.pathname);
    if (s.prefixo) assert.ok(url.pathname.startsWith('/' + s.prefixo + (s.prefixo === 'company/' ? '' : '')), 'prefixo ' + s.prefixo);
  });
}
