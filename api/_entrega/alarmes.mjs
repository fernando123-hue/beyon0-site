/* ==========================================================================
   OS ALARMES DE PRAZO da rotina diária (PR 3b-3; spec §2.1 e §5; D4). Só CONTAGEM (o alerta do painel não leva dado pessoal; o código do
   pedido aparece no `listar` do terminal). Os limites são os da captação (config/entrega.json), com teste de igualdade.
   • material: dias CORRIDOS desde a entrada, sem o material enviado (30) e SEM o aviso de material parado (22/10): depois do aviso o projeto só espera o cliente,
     sem alarme diário, sem encerrar e sem publicar nada (nada vai ao ar sem autorização do cliente);
   • prazo vencido: em `producao`, `ajustes` e `aprovada` (M1: o prazo corre até PUBLICAR, a regra única da captação; depois da aprovação do cliente a pausa já fechou), e NUNCA com a pausa aberta;
     nunca em `material` (o prazo só começa com o material recebido);
   • restante (22/10): MAIS de 3 dias CORRIDOS desde o REGISTRO do aviso "seu site está no ar" (o dia do aviso é o dia 0; à 00:00 depois do 3º dia o site sai do ar). Sem o registro do aviso a contagem não começou.
   • material parado há 5 meses (22/10): o aviso prévio do apagamento (6 meses parado, avisando 30 dias antes) é devido; quem decide é o banco (`apagar_material_devido`, por data de Campo Grande), aqui só se conta;
   D5: a prévia parada (esperando o cliente, com a pausa aberta) NÃO gera alarme nem muda de passo: o cliente é quem decide quando responde. Já a `aprovada` alarma: o cliente respondeu e o atraso volta a ser da Beyon.
   ========================================================================== */
import { prazoVencido, diasCorridosDesde } from '../_material/prazo.mjs';

export const LIMITES = Object.freeze({ material_dias: 30, restante_dias: 3, lembretes_restante: Object.freeze([2, 3]), max_rodadas: 2 });

export function contarAlarmes(itens, agora = new Date()) {
  const r = { prazo_vencido: 0, material_30: 0, restante_vencido: 0, material_apagar: 0, ilegiveis: 0 };
  for (const it of itens || []) {
    /* B1: um item torto (data ilegível, prazo_dias fora de 1..60, lixo na lista) vira contagem de "ilegiveis"; não derruba os alarmes do dia */
    try { contarUm(it, agora, r); } catch (e) { if (!(e instanceof RangeError || e instanceof TypeError)) throw e; r.ilegiveis++; }
  }
  return r;
}

function contarUm(it, agora, r) {
  {
    if (it.passo === 'material') {
      if (it.entrada_em && !it.aviso_material_em && diasCorridosDesde(it.entrada_em, agora) >= LIMITES.material_dias) r.material_30++;
      if (it.apagar_material_devido === true) r.material_apagar++;   /* o banco decide (as datas de Campo Grande, o que há para apagar, a autorização): aqui só se conta */
    }
    else if (it.passo === 'producao' || it.passo === 'ajustes' || it.passo === 'aprovada') { if (prazoVencido(it.prazo, { prazoDias: it.prazo_dias }, agora)) r.prazo_vencido++; }
    else if (it.passo === 'no_ar') { if (it.aviso_no_ar_feito_em && diasCorridosDesde(it.aviso_no_ar_feito_em, agora) > LIMITES.restante_dias) r.restante_vencido++; }
  }
}
