/* TESTE C COM A IA REAL (14/11), AJUSTE 1: a trava de pagamento recusava o mapa inteiro por "Chama no direct" (o cliente chama a clínica no
   direct do Instagram: a origem mais comum). Na conversa do Zero, "me chama no direct" segue sendo outro canal para pagar e continua trocado;
   no mapa, o canal descreve como o cliente chega, e a porta abre só para o CANAL. Pagar fora da tela, link, conta e número seguem fechados.
   node --test docs/testes/planta-textos5.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDoPlanoPermitido } from '../../api/_vendas/planta-textos.mjs';
import { motivoDaTroca, semPromessaDePagamento, RESPOSTAS_PAGAMENTO } from '../../api/_vendas/promessa.mjs';

const motivo = (t) => { const r = textoDoPlanoPermitido(t, { nomeDoNegocio: '' }); return r.ok ? 'ok' : r.motivo; };

test('no mapa, o canal por onde o cliente chega passa (os textos reais do modelo no teste C)', () => {
  for (const t of ['Chama no direct', 'A cliente chama no direct e pergunta o tamanho', 'Manda mensagem no direct', 'Fala no direct do perfil',
    'Chama no direct para marcar o horário', 'Chama no direct para saber se tem horário']) {
    assert.equal(motivo(t), 'ok', t);
  }
});

test('no mapa, pagar fora da tela, link, conta e número continuam recusados', () => {
  for (const t of ['Paga no pix direto pra mim', 'Manda o pix no direct', 'Transfere direto para a conta', 'Pagamento por boleto ou depósito',
    'Chama no Telegram para pagar', 'Link de pagamento no direct',
    /* (revisões do PR) o canal com objeto, e o canal de chegada junto de pagar */
    'Manda a chave no direct', 'Manda o recibo no direct', 'Manda o código no direct', 'Chama no direct e manda a chave',
    'Chama no direct que eu passo a chave', 'Chama no direct e manda o comprovante', 'Manda os dados bancários no direct']) {
    assert.notEqual(motivo(t), 'ok', t);
  }
});

test('na conversa do Zero nada muda: "me chama no direct" segue trocado pela resposta fixa de pagamento', () => {
  assert.equal(motivoDaTroca('Me chama no direct que eu te passo o pagamento'), 'meio');
  assert.equal(motivoDaTroca('Chama no direct'), 'meio');
  assert.equal(motivoDaTroca('Fala comigo no Telegram'), 'meio');
  assert.equal(semPromessaDePagamento('Chama no direct'), RESPOSTAS_PAGAMENTO.meio);
});
