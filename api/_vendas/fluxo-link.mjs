/* ==========================================================================
   O LINK DO PEDIDO e a volta ao pedido (PR 3b-2; spec §1 e §8): quatro ações.
   • link-pedido: cria o link se não houver (o código sai UMA vez, nesta resposta) ou, com `novo`, troca ("Gerar um link novo").
   • sair-do-aparelho: revoga o link E encerra a sessão no Supabase Auth (logout global do próprio visitante; M1); a tela esquece a sessão.
   • outro-aparelho: a retomada de 7 dias e uso único do PR 2b-2 ("Continuar no computador").
   • abrir-pedido: troca o código por uma sessão nova da MESMA conversa (cria o visitante anônimo, como `retomar`; a fronteira
     de api/vendas.mjs já passou o anti-robô e o freio de criação de sessão). Usar NÃO revoga o link (R2-1).
   O código nunca vai para log nem para a resposta além da criação.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ORG } from './org.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { ipDe } from '../_freio.mjs';
import { chaveDoIp } from './ip.mjs';
import { CODIGO_LINK, novoCodigoLink, hashDoLink } from './link-pedido.mjs';
import { novoCodigoRetomada, hashDaRetomada, DIAS_RETOMADA } from './retomada.mjs';
import { entregaLigada, FRASE_DESLIGADA } from '../_material/interruptor.mjs';

export const FRASES = Object.freeze({
  conversaInvalida: 'Conversa inválida.',
  invalido: 'Este link não vale mais. Se você gerou um link novo, use o mais recente; se não, fale com a Beyon Zero pelo WhatsApp.',
  incompleto: 'Link inválido. Confira se ele chegou inteiro ou peça um novo pelo WhatsApp.',
  freio: 'Você já gerou links demais hoje. Use o que você guardou ou fale com a Beyon Zero pelo WhatsApp.',
  indisponivel: 'Esta etapa ainda não está disponível.'
});
const soCom = (corpo, chaves) => !!corpo && typeof corpo === 'object' && !Array.isArray(corpo) && Object.keys(corpo).every(k => chaves.includes(k));

export function criarAcoesDoLink({ banco, visitante, visitantes, segredoFreio, env }) {
  const acoes = {
    async linkPedido({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id', 'novo']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const vid = await visitante(request);
      const codigo = novoCodigoLink();
      const r = await banco('vendas_link_pedido_criar', { conversa_id: corpo.conversa_id, visitante_id: vid, codigo_hash: hashDoLink(codigo), forcar: corpo.novo === true });
      if (!r.ok) throw new Recusa(429, FRASES.freio, { whatsapp: true });
      return r.criado ? { criado: true, codigo } : { criado: false };
    },
    async sairDoAparelho({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const vid = await visitante(request);
      await banco('vendas_link_pedido_sair', { conversa_id: corpo.conversa_id, visitante_id: vid });
      await visitantes.sair(request);   /* a sessão também (M1): o logout global apaga as sessões e os refresh tokens deste visitante */
      return { ok: true };
    },
    async outroAparelho({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const vid = await visitante(request);
      const codigo = novoCodigoRetomada();
      const r = await banco('vendas_retomada_do_cliente', { conversa_id: corpo.conversa_id, visitante_id: vid, codigo_hash: hashDaRetomada(codigo) });
      if (!r.ok) throw new Recusa(429, FRASES.freio, { whatsapp: true });
      return { codigo, expira_em: r.expira_em, dias: DIAS_RETOMADA };
    },
    async abrirPedido({ request, corpo }) {
      const codigo = corpo && corpo.codigo;
      if (typeof codigo !== 'string' || !CODIGO_LINK.test(codigo)) throw new Recusa(400, FRASES.incompleto);
      const s = await visitantes.criar();
      if (!s) throw new Recusa(503, 'Serviço indisponível. Tente de novo em instantes.');
      const r = await banco('vendas_link_pedido_usar', { org_slug: ORG, codigo_hash: hashDoLink(codigo), visitante_id: s.visitante_id, chave_ip: chaveDoIp(ipDe(request), segredoFreio, new Date(), 'link') });
      if (!r || r.ok !== true) throw new Recusa(410, FRASES.invalido, { whatsapp: true });
      return { token: s.token, refresh: s.refresh, expira_em: s.expira_em, conversa_id: r.conversa_id };
    }
  };
  /* o interruptor (Task 8): desligado, nenhuma destas ações passa (503 com a saída pelo WhatsApp) */
  return Object.fromEntries(Object.entries(acoes).map(([nome, f]) => [nome, async a => {
    if (!entregaLigada(env)) throw new Recusa(503, FRASE_DESLIGADA, { whatsapp: true });
    return f(a);
  }]));
}
