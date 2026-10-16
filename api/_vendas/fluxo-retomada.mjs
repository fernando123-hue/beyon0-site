/* ==========================================================================
   RETOMAR O PEDIDO EM OUTRO APARELHO (PR 2b-2). Troca o código do link por uma sessão nova da MESMA conversa:
   cria o visitante anônimo (como "sessao") e, no banco, numa transação, marca o código como usado e passa a conversa
   para ele (app.vendas_usar_retomada). O aparelho antigo perde o acesso: o link é o caminho de quem trocou de aparelho.
   A fronteira (api/vendas.mjs) já passou o anti-robô e o freio de criação de sessão: o código errado também gasta a
   cota do IP. O código nunca vai para log nem para a resposta.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ORG } from './org.mjs';
import { CODIGO_RETOMADA, hashDaRetomada } from './retomada.mjs';

const LINK_INVALIDO = 'Este link já foi usado, venceu ou não vale mais. Peça um novo à Beyon Zero pelo WhatsApp.';

export function criarAcoesDaRetomada({ banco, visitantes }) {
  return {
    async retomar({ corpo }) {
      const codigo = corpo && corpo.codigo;
      if (typeof codigo !== 'string' || !CODIGO_RETOMADA.test(codigo)) throw new Recusa(400, 'Link inválido. Confira se ele chegou inteiro ou peça um novo pelo WhatsApp.');
      const s = await visitantes.criar();
      if (!s) throw new Recusa(503, 'Serviço indisponível. Tente de novo em instantes.');
      const r = await banco('vendas_usar_retomada', { org_slug: ORG, codigo_hash: hashDaRetomada(codigo), visitante_id: s.visitante_id });
      if (!r || r.ok !== true) throw new Recusa(410, LINK_INVALIDO, { whatsapp: true });
      return { token: s.token, refresh: s.refresh, expira_em: s.expira_em, conversa_id: r.conversa_id };
    }
  };
}
