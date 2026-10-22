/* SÓ PIX: nenhum texto do servidor oferece cartão a quem só tem Pix (A7, Step 5b). npm run testar */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESPOSTAS_PAGAMENTO } from '../../api/_vendas/promessa.mjs';
import { mensagemRecusa } from '../../api/_pagamentos/estados.mjs';
import { criarServicoPagamentos } from '../../api/_pagamentos/servico.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OFERTA = /Pix ou (o )?cart[aã]o|cart[aã]o ou (o )?Pix|tente o cart[aã]o|outro cart[aã]o/i;
/* só no caminho do cartão (a guarda da A7 recusa o cartão antes de chegar aqui) */
const SO_NO_CAMINHO_DO_CARTAO = [
  { arquivo: 'api/_pagamentos/estados.mjs', trecho: 'rejected_by_issuer' },
  { arquivo: 'api/_pagamentos/estados.mjs', trecho: 'card_disabled' },
  { arquivo: 'api/_pagamentos/estados.mjs', trecho: 'max_attempts_exceeded' },
  { arquivo: 'api/_pagamentos/servico.mjs', trecho: 'Não consegui cancelar o Pix gerado antes' }
];
const arquivosDe = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? arquivosDe(path.join(d, e.name)) : e.name.endsWith('.mjs') ? [path.join(d, e.name)] : []);

test('nenhuma frase do servidor oferece cartão fora do caminho do cartão', () => {
  const achados = [];
  for (const arq of arquivosDe(path.join(RAIZ, 'api'))) {
    const rel = path.relative(RAIZ, arq).split(path.sep).join('/');
    fs.readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(linha) || !OFERTA.test(linha)) return;
      if (SO_NO_CAMINHO_DO_CARTAO.some(p => p.arquivo === rel && linha.includes(p.trecho))) return;
      if (rel === 'api/_vendas/consultor.mjs' && /metodos/.test(linha)) return;   /* (o texto que depende da lista) */
      achados.push(rel + ':' + (i + 1));
    });
  }
  assert.deepEqual(achados, []);
});
test('respostas fixas e mensagens genéricas sem cartão', async () => {
  assert.doesNotMatch(RESPOSTAS_PAGAMENTO.meio, /cart[aã]o/i);
  assert.doesNotMatch(mensagemRecusa('qualquer_coisa'), /cart[aã]o/i);
  const s = criarServicoPagamentos({ banco: async () => ({}), cfg: { ativo: true, metodos: ['pix'] }, provedor: { nome: 'mercadopago' } });
  await assert.rejects(s.iniciar({ conversa_id: 'c', visitante_id: 'v', metodo: 'boleto' }), e => e.status === 400 && !/cart[aã]o/i.test(e.message));
});
