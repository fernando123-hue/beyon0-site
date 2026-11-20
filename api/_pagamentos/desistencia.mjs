/* ==========================================================================
   A DESISTÊNCIA PELO CLIENTE (dono, 20/11/2026): até 7 dias depois de aceitar as condições, a entrada volta inteira, pelo mesmo Pix (CDC art. 49; /condicoes).
   Regra de design do dono: "o reembolso não é algo que deva ser facilitado" e "não podemos ter erro nessa parte de pagamento". Por isso:
     • quem decide é o BANCO (app.desistencia_preparar: a sessão do próprio cliente, a janela de 7 dias, o restante em aberto, o site fora do ar, UMA desistência por pedido);
       o corpo da requisição só traz a conversa e o "confirmo" do segundo clique: valor, order e tentativa SAEM do banco, nunca de fora;
     • antes de devolver, a order é CONSULTADA no provedor e conferida contra o que o banco guardou (a conta do Mercado Pago, o valor, a referência, o estado "aprovada");
       o estorno é total (corpo vazio) e a chave de idempotência é fixa por tentativa (`dsc-<tentativa>`): repetir nunca devolve duas vezes;
     • depois, a order é consultada de novo e o estorno entra pelo caminho de sempre (app.pagamentos_aplicar: bloqueia a entrega, cancela o Pix do restante, avisa o dono);
       só então o pedido é encerrado pelo MESMO caminho do dono (app.vendas_encerrar, motivo desistência);
     • falha do provedor: nada é dado como devolvido, nada é encerrado, o dono é avisado e a pessoa lê uma frase humana. Falha DEPOIS de o estorno sair: não se marca nada
       além do que se sabe; a nova tentativa consulta a order, vê que já está estornada e só conclui (nunca estorna duas vezes).
   O aviso ao dono leva só o código do pedido (api/_aviso.mjs).
   ========================================================================== */
import { retratoDe, ErroProvedor } from './mercadopago.mjs';
import { ErroPagamento, ORG } from './servico.mjs';

const FALAR_COM_A_EQUIPE = 'Não foi possível cancelar por aqui. Deixe um recado para a equipe: ela resolve com você.';
const FRASES = Object.freeze({
  prazo: 'O prazo para cancelar por aqui já passou. Deixe um recado para a equipe: ela olha o seu caso.',
  em_andamento: 'Já estamos cuidando do seu cancelamento. Aguarde alguns instantes, sem precisar tocar de novo.',
  ja_desistiu: 'Este pedido já foi cancelado.',
  falha: 'Não consegui concluir agora. Nada foi alterado no seu pedido. Tente de novo em alguns minutos ou deixe um recado para a equipe.',
  aguardando: 'Recebemos o seu cancelamento e estamos confirmando com o Mercado Pago. Você não precisa fazer mais nada.'
});
const centavos = v => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : null; };

export function criarDesistencia({ banco, mp, cfg, nucleo }) {
  const { aplicar, avisarDono, erroDoProvedor } = nucleo;
  const marcar = (prep, status, detalhe) => banco('desistencia_marcar', { desistencia_id: prep.desistencia_id, status, ...(detalhe ? { detalhe } : {}) });
  const recusa = motivo => {
    if (motivo === 'prazo') return new ErroPagamento(409, FRASES.prazo, { recado: true });
    if (motivo === 'em_andamento') return new ErroPagamento(409, FRASES.em_andamento, { aguarde: true });
    if (motivo === 'ja_desistiu') return new ErroPagamento(409, FRASES.ja_desistiu);
    return new ErroPagamento(409, FALAR_COM_A_EQUIPE, { recado: true });
  };

  /* a order consultada é a MESMA que o banco guardou como a que pagou a entrada? 'ok' (aprovada, nunca estornada), 'estornada' (inteira, já) ou o motivo da recusa */
  function conferir(order, prep) {
    const r = retratoDe(order), valor = centavos(prep.valor);
    if (r.order_id !== prep.order_id) return 'order';
    if (r.user_id !== String(cfg.contaEsperada)) return 'conta';
    if (r.external_reference !== prep.tentativa_id) return 'referencia';
    if (centavos(r.total_amount) !== valor || centavos(r.pagamento.amount) !== valor) return 'valor';
    if (r.currency && r.currency !== 'BRL') return 'moeda';
    if (r.estado === 'estornada') return !r.reembolsado || centavos(r.reembolsado) === valor ? 'estornada' : 'estado';
    if (r.estado === 'aprovada' && !r.reembolsado && centavos(r.pagamento.paid_amount) === valor) return 'ok';
    return 'estado';
  }

  /* nada foi devolvido: solta a trava, avisa o dono e devolve uma frase humana */
  async function falhar(prep, motivo) {
    await marcar(prep, 'falhou', motivo).catch(e => console.error('[desistencia] a falha não foi gravada:', (e && e.codigo) || 'erro'));
    await avisarDono({ codigo: prep.codigo, evento: 'desistencia_falhou', parcela: 'entrada' });
    throw new ErroPagamento(503, FRASES.falha, { recado: true });
  }
  const consultar = async prep => {
    try { return await mp.consultarOrdem(prep.order_id); }
    catch (e) {
      if (!(e instanceof ErroProvedor)) throw e;
      await erroDoProvedor(e, prep.tentativa_id, prep.order_id, 'operacao');
      return { falhou: e };
    }
  };

  /* devolve a entrada. null = a entrada está estornada e gravada (siga para encerrar); senão a resposta final desta chamada */
  async function devolver(prep) {
    let order = await consultar(prep);
    if (order.falhou) return falhar(prep, order.falhou.tipo);
    const antes = conferir(order, prep);
    if (antes === 'estado') await aplicar(order, 'operacao').catch(e => console.error('[desistencia] o estado da order não foi aplicado:', (e && e.codigo) || 'erro'));   /* (o banco passa a saber o que o provedor já sabe) */
    if (antes !== 'ok' && antes !== 'estornada') return falhar(prep, 'order_' + antes);
    let conflito = false;
    if (antes === 'ok') {
      try { await mp.reembolsarOrdem(prep.order_id, 'dsc-' + prep.tentativa_id); }
      catch (e) {
        if (!(e instanceof ErroProvedor)) throw e;
        await erroDoProvedor(e, prep.tentativa_id, prep.order_id, 'operacao');
        if (e.tipo !== 'conflito') return falhar(prep, e.tipo);
        conflito = true;   /* (409: já devolvida ou em devolução; a consulta abaixo diz qual) */
      }
      order = await consultar(prep);
      if (order.falhou) return { ok: true, encerrado: false, aguardando: true, mensagem: FRASES.aguardando };   /* (o estorno pode ter saído: NÃO se marca nada, a nova tentativa consulta e conclui) */
      if (conferir(order, prep) !== 'estornada') return conflito ? falhar(prep, 'conflito') : { ok: true, encerrado: false, aguardando: true, mensagem: FRASES.aguardando };
    }
    await aplicar(order, 'operacao');   /* o estorno entra pelo caminho de sempre: bloqueia a entrega, cancela o Pix do restante e avisa o dono (alerta "desistencia") */
    await marcar(prep, 'estornada');
    return null;
  }

  /* fecha o pedido pelo caminho do dono. A entrada já foi devolvida: se o banco não deixar encerrar (p. ex. um Pix do restante que não saiu do ar), o dono é avisado */
  async function encerrar(prep) {
    const r = await banco('vendas_encerrar', { org_slug: ORG, codigo: prep.codigo, motivo: 'desistencia' });
    if (r && r.ok === true) { await marcar(prep, 'concluida'); return { ok: true, encerrado: true }; }
    await avisarDono({ codigo: prep.codigo, evento: 'desistencia_nao_encerrada', parcela: 'entrada' });
    return { ok: true, encerrado: false };
  }

  return async function desistir({ conversa_id, visitante_id }) {
    const prep = await banco('desistencia_preparar', { conversa_id, visitante_id });
    if (!prep || prep.ok !== true) throw recusa(prep && prep.motivo);
    if (!prep.retomar) {
      const fim = await devolver(prep);
      if (fim) return fim;
    }
    return encerrar(prep);
  };
}
