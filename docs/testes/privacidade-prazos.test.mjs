/* OS PRAZOS DA PRIVACIDADE BATEM COM O CÓDIGO (PR 3b-2). Quando a página /privacidade (PR pequeno pr3b2-privacidade) já tem o item do material,
   os números que ela promete têm de ser os da limpeza e do esquema, e o link da caixa de autorização tem de apontar para #material.
   Enquanto a página não tem o item, o teste só confere que o link ainda aponta para o #orcamento que existe.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ESQ from '../../js/orcamento-material-esquema.js';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const PAG = ler('privacidade.html');
const TEM = PAG.includes('id="material"');
const ITEM = (PAG.match(/<li id="material">[\s\S]*?<\/li>/) || [''])[0].replace(/<[^>]+>/g, ' ');

test('o link da caixa de autorização aponta para a âncora que existe na página', () => {
  const m = ler('js/orcamento-material.js');
  assert.ok(m.includes(TEM ? '/privacidade#material' : '/privacidade#orcamento'), TEM ? 'a página já tem #material: atualize o href' : 'a página ainda não tem #material');
});

test('os prazos que a página promete são os do código (7, 30, 24 h)', { skip: TEM ? false : 'a página ainda não tem o item do material' }, () => {
  const L = ESQ.LIMITES;
  assert.ok(ITEM.includes(L.guarda_importado_dias + ' dias depois de ir para a produção'));
  assert.ok(ITEM.includes(L.guarda_nunca_importado_dias + ' dias depois do fim do pedido'));
  assert.ok(ITEM.includes(L.reserva_horas + ' horas'));
});

test('as pendências do dono citam a privacidade e o interruptor (o envio só liga depois do PR pequeno)', () => {
  const p = ler('docs/revisoes/pr1-pendencias.md');
  assert.match(p, /privacidade[^\n]*3b-2|3b-2[^\n]*privacidade/i, 'pr1-pendencias.md precisa citar o PR pequeno da privacidade em "Antes da 1ª promoção"');
  assert.match(p, /BZ_ENTREGA/);
});
