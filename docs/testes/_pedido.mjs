/* O caminho novo até as direções nos testes de API (PR 2a): os detalhes no lugar do antigo "contato" e o dono
   confirmando pelo WhatsApp (a mesma função do painel). LIMITES_DE_TESTE: os testes que fazem muitos pedidos não
   esbarram no teto da fila nem no freio por IP (os freios têm testes próprios em detalhes-api e pedidos-banco). */
import { PEDIDOS } from '../../api/_vendas/pedido.mjs';

export const LIMITES_DE_TESTE = Object.freeze({ ...PEDIDOS, fila_confirmados: 1000, por_ip_dia: 1000, por_ip48_dia: 1000 });
let seq = 0;
/* um WhatsApp novo a cada chamada (o freio por telefone vale nos testes também) */
export const telefoneDeTeste = () => '(21) 9' + String(1000 + (++seq % 9000)) + '-' + String(1000 + Math.floor(seq / 9000) % 9000);

export async function detalhesEConfirmar(chamar, rpc, conversaId, extra = {}) {
  const r = await chamar('POST', 'detalhes', { conversa_id: conversaId, negocio: 'Clínica Teste', vende: 'Consultas e exames', telefone: telefoneDeTeste(), nome: 'Rita', aceite: true, ...extra });
  if (r.status !== 200) throw new Error('detalhes: ' + r.status + ' ' + JSON.stringify(r.corpo));
  const c = await rpc('vendas_confirmar_whatsapp', { org_slug: 'beyon-zero', conversa_id: conversaId });
  if (!c || c.ok !== true) throw new Error('confirmar: ' + JSON.stringify(c));
  return r.corpo;
}
