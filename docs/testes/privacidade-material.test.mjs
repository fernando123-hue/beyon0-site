/* A PRIVACIDADE DO MATERIAL (PR pequeno pr3b2-privacidade; spec §10): a página /privacidade passa a dizer quem lê o material
   (inclusive a Anthropic), onde fica, por quanto tempo, e o que acontece com o link do pedido. Frases literais (a página é texto,
   não código); os números aqui são os mesmos de api/_material/limpeza.mjs e do esquema do PR 3b-2, conferidos lá por
   privacidade-prazos.test.mjs.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PAG = fs.readFileSync(new URL('../../privacidade.html', import.meta.url), 'utf8');
const vezes = (t, s) => t.split(s).length - 1;
const ITEM = (PAG.match(/<li id="material">[\s\S]*?<\/li>/) || [''])[0].replace(/<[^>]+>/g, ' ');

test('o item do material existe uma vez, com a âncora #material, e o #orcamento antigo continua (link velho não quebra)', () => {
  assert.equal(vezes(PAG, 'id="material"'), 1);
  assert.equal(vezes(PAG, 'id="orcamento"'), 1);
});

test('o item diz: quem lê (inclusive a Anthropic), onde fica, os prazos, o hash do link', () => {
  for (const frase of ['Supabase', 'Anthropic', 'fundador', 'Estados Unidos', 'hash', 'não os aceita',
    '7 dias depois de ir para a produção', '30 dias depois do fim do pedido', 'no dia seguinte, se você desistir', '24 horas']) assert.ok(ITEM.includes(frase), frase);
  assert.ok(!/\bCPF\b[^.]*guardamos/i.test(ITEM), 'não promete guardar CPF');
});

test('uma regra só para cada dado: os registros do pedido seguem o prazo legal de guarda (sem número de anos, até o dono confirmar); o "90 dias" ficou só para os demais dados', () => {
  assert.ok(PAG.includes('ficam pelo prazo legal de guarda de comprovantes, contado do último pagamento ou devolução'));
  assert.ok(!/[0-9]+ anos/.test(PAG), 'nenhum número de anos: o guarda de condicoes.test.mjs exige a confirmação do dono');
  assert.equal(vezes(PAG, 'por mais 90 dias, salvo pedido por escrito'), 1);
});

test('a lista de terceiros cita o material (Supabase guarda os arquivos; a Anthropic lê o material de quem contrata)', () => {
  assert.ok(PAG.includes('e os arquivos do material enviado por quem contrata'));
  assert.ok(PAG.includes('o material do site: textos, contatos e fotos, que o agente que monta o site lê'));
});

/* só o TEXTO da página: o apagamento depois de 6 meses ainda não existe no código do site (pendência em docs/revisoes/pr1-pendencias.md) */
test('projeto parado (decisão do dono de 22/10): mantém a vaga, o material some depois de 6 meses parado, com aviso antes; sem número de anos', () => {
  for (const frase of ['continua reservado para você', '6 meses', 'avisamos você antes']) assert.ok(ITEM.includes(frase), frase);
  assert.ok(ITEM.includes('esperando o seu material ou a sua autorização'));
  assert.ok(!/[0-9]+ anos/.test(ITEM));
});
