/* ==========================================================================
   OS DETALHES DO PEDIDO (orçamento sem IA, PR 2a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §0, §3 e §7).
   A ação "detalhes": confere o visitante, valida o corpo (esquema fechado, redigir em todo texto), faz no
   servidor o HMAC do telefone e a chave do IP (o banco nunca recebe nenhum dos dois em claro para os freios) e
   grava por app.vendas_registrar_detalhes, que aplica os freios numa transação: uma vez por conversa, IP,
   telefone e o teto da fila do dono. A confirmação pelo WhatsApp é do dono, no painel (api/painel.mjs).
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ErroBanco } from './transporte.mjs';
import { validarDetalhes, chaveDoTelefone, PEDIDOS } from './pedido.mjs';
import { chaveDoIp } from './ip.mjs';
import { ipDe } from '../_freio.mjs';
import { ehUuid } from '../_valida-app.mjs';

const FORA_DA_ETAPA = 'Os detalhes vêm depois do preço e só uma vez. Se precisar mudar algo, fale com a Beyon Zero pelo WhatsApp.';
/* (a mesma frase para "pedido aberto" e "limite do dia": não diz a ninguém qual dos dois um número tem) */
const TELEFONE = 'Este WhatsApp já tem um pedido aberto ou chegou ao limite de pedidos de hoje. Confirme o pedido que já existe ou fale com a Beyon Zero pelo WhatsApp.';
const MOTIVOS = {
  ja_enviado: { status: 409, texto: FORA_DA_ETAPA },
  fila_cheia: { status: 503, texto: 'Muita procura agora: a fila de modelos está cheia. Fale com a Beyon Zero pelo WhatsApp e a gente segue por lá.', extra: { fila_cheia: true, whatsapp: true } },
  telefone_aberto: { status: 409, texto: TELEFONE, extra: { whatsapp: true } },
  telefone_dia: { status: 409, texto: TELEFONE, extra: { whatsapp: true } },
  freio_ip: { status: 429, texto: 'Muitos pedidos deste endereço hoje. Fale com a Beyon Zero pelo WhatsApp: a gente continua por lá.', extra: { whatsapp: true } }
};

export function criarAcoesDoPedido({ banco, visitante, segredoFreio, limites = PEDIDOS, requestId }) {
  return {
    async detalhes({ request, corpo }) {
      const vid = await visitante(request);
      if (!ehUuid(corpo?.conversa_id)) throw new Recusa(400, 'Conversa inválida.');
      const v = await validarDetalhes(corpo);
      if (v.erros) throw new Recusa(400, v.erros[0]);
      const d = v.dados;
      const telefoneHash = chaveDoTelefone(d.telefone, segredoFreio);
      if (!telefoneHash) {
        /* (na Vercel sem FREIO_SEGREDO nem SUPABASE_CHAVE_SECRETA: sem freio por telefone, nada é gravado) */
        console.error(JSON.stringify({ origem: 'vendas', nivel: 'erro', request_id: requestId || null, evento: 'detalhes sem o segredo do freio' }));
        throw new Recusa(503, 'O pedido de modelos está indisponível agora. Fale com a Beyon Zero pelo WhatsApp.', { whatsapp: true });
      }
      let r;
      try {
        r = await banco('vendas_registrar_detalhes', {
          conversa_id: corpo.conversa_id, visitante_id: vid, nome: d.nome, telefone: d.telefone, aceite: true,
          briefing: d.briefing, redes: d.redes, suspeito: d.suspeito, telefone_hash: telefoneHash,
          chave_ip: chaveDoIp(ipDe(request), segredoFreio, new Date(), 'pedido'),
          max_por_ip: limites.por_ip_dia, max_por_telefone_dia: limites.por_telefone_dia,
          teto_fila: limites.fila_confirmados, horas: limites.horas_para_confirmar
        });
      } catch (e) {
        if (e instanceof ErroBanco && e.codigo === '55000') throw new Recusa(409, FORA_DA_ETAPA);
        throw e;
      }
      if (!r || r.ok !== true) {
        const m = Object.hasOwn(MOTIVOS, String(r && r.motivo)) ? MOTIVOS[r.motivo] : MOTIVOS.ja_enviado;
        throw new Recusa(m.status, m.texto, m.extra);
      }
      return { codigo: r.codigo, expira_em: r.expira_em };
    }
  };
}
