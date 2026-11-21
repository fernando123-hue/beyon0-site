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
import { SemOrcamento } from '../_orcamento.mjs';

const FALAR_COM_A_EQUIPE = 'Não foi possível cancelar por aqui. Deixe um recado para a equipe: ela resolve com você.';
const FRASES = Object.freeze({
  prazo: 'O prazo para cancelar por aqui já passou. Deixe um recado para a equipe: ela olha o seu caso.',
  em_andamento: 'Já estamos cuidando do seu cancelamento. Aguarde alguns instantes, sem precisar tocar de novo.',
  ja_desistiu: 'Este pedido já foi cancelado.',
  falha: 'Não consegui concluir agora. Nada foi alterado no seu pedido. Tente de novo em alguns minutos ou deixe um recado para a equipe.',
  aguardando: 'Recebemos o seu cancelamento e estamos confirmando com o Mercado Pago. Você não precisa fazer mais nada.'
});
const centavos = v => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : null; };

/* erros do POST do estorno em que NÃO se sabe se o estorno saiu (tempo, rede, provedor fora, 409, resposta ilegível): a order é consultada de novo antes de dizer qualquer coisa */
const INCERTOS = new Set(['tempo', 'rede', 'indisponivel', 'conflito', 'resposta']);

export function criarDesistencia({ banco, mp, cfg, nucleo }) {
  const { aplicar, avisarDono, erroDoProvedor, cancelarPixDoRestante } = nucleo;
  const marcar = (prep, status, detalhe) => banco('desistencia_marcar', { desistencia_id: prep.desistencia_id, status, ...(detalhe ? { detalhe } : {}) });
  const recusa = motivo => {
    if (motivo === 'prazo') return new ErroPagamento(409, FRASES.prazo, { recado: true });
    if (motivo === 'em_andamento') return new ErroPagamento(409, FRASES.em_andamento, { aguarde: true });
    if (motivo === 'ja_desistiu') return new ErroPagamento(409, FRASES.ja_desistiu);
    return new ErroPagamento(409, FALAR_COM_A_EQUIPE, { recado: true });
  };
  const aguardando = () => ({ ok: true, encerrado: false, aguardando: true, mensagem: FRASES.aguardando });

  /* a order consultada é a MESMA que o banco guardou como a que pagou a entrada? 'ok' (aprovada, nunca estornada), 'estornada' (inteira, com o estorno do mesmo valor na lista) ou o
     motivo da recusa. Estorno sem o valor na lista, parcial ou estado não reconhecido: 'estado' (nada é estornado por aqui) */
  function conferir(order, prep) {
    const r = retratoDe(order), valor = centavos(prep.valor);
    if (r.order_id !== prep.order_id) return 'order';
    if (r.user_id !== String(cfg.contaEsperada)) return 'conta';
    if (r.external_reference !== prep.tentativa_id) return 'referencia';
    if (centavos(r.total_amount) !== valor || centavos(r.pagamento.amount) !== valor) return 'valor';
    if (r.currency && r.currency !== 'BRL') return 'moeda';
    if (r.estado === 'estornada') return r.reembolsado && centavos(r.reembolsado) === valor ? 'estornada' : 'estado';
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

  /* o restante, ANTES de estornar a entrada: o Pix aberto é cancelado no provedor (ninguém o paga depois) e o banco confere de novo que o restante não foi pago.
     Restante pago, ou Pix que não saiu do ar: nada é estornado (o dono é avisado e a pessoa tenta de novo ou fala com a equipe) */
  async function restanteLivre(prep) {
    const antes = await banco('desistencia_restante', { desistencia_id: prep.desistencia_id });
    if (antes.restante_pago) return 'restante_pago';
    if (!Array.isArray(antes.abertas) || !antes.abertas.length) return null;
    await cancelarPixDoRestante(antes.abertas);
    const depois = await banco('desistencia_restante', { desistencia_id: prep.desistencia_id });
    if (depois.restante_pago) return 'restante_pago';
    return Array.isArray(depois.abertas) && depois.abertas.length ? 'restante_aberto' : null;
  }

  /* devolve a entrada. null = a entrada está estornada e gravada (siga para encerrar); senão a resposta final desta chamada */
  async function devolver(prep) {
    let order = await consultar(prep);
    if (order.falhou) return falhar(prep, order.falhou.tipo);
    const antes = conferir(order, prep);
    /* (o banco passa a saber o que o provedor já sabe, mas só estados que ele reconhece: um estado desconhecido fica para a reconciliação) */
    if (antes === 'estado' && retratoDe(order).estado !== 'desconhecido') await aplicar(order, 'operacao').catch(e => console.error('[desistencia] o estado da order não foi aplicado:', (e && e.codigo) || 'erro'));
    if (antes !== 'ok' && antes !== 'estornada') return falhar(prep, 'order_' + antes);
    let incerto = false;
    if (antes === 'ok') {
      const preso = await restanteLivre(prep);
      if (preso) return falhar(prep, preso);
      try { await mp.reembolsarOrdem(prep.order_id, 'dsc-' + prep.tentativa_id); }
      catch (e) {
        if (!(e instanceof ErroProvedor)) throw e;
        await erroDoProvedor(e, prep.tentativa_id, prep.order_id, 'operacao');
        if (!INCERTOS.has(e.tipo)) return falhar(prep, e.tipo);
        incerto = true;   /* (o estorno pode ter saído mesmo assim: a consulta abaixo diz) */
      }
      order = await consultar(prep);
      if (order.falhou) return incerto ? falhar(prep, 'sem_resposta') : aguardando();   /* (sem resposta e sem consulta: a rotina da reconciliação acaba se o estorno tiver saído) */
      if (conferir(order, prep) !== 'estornada') return incerto ? falhar(prep, 'nao_estornada') : aguardando();
    }
    await aplicar(order, 'operacao');   /* o estorno entra pelo caminho de sempre: bloqueia a entrega, cancela o Pix do restante e avisa o dono (alerta "desistencia") */
    await marcar(prep, 'estornada');
    return null;
  }

  /* fecha o pedido pelo caminho do dono. A entrada já foi devolvida: se o banco não deixar encerrar (p. ex. um Pix do restante que não saiu do ar), o dono é avisado */
  async function encerrar(prep) {
    let r = null;
    try { r = await banco('vendas_encerrar', { org_slug: ORG, codigo: prep.codigo, motivo: 'desistencia' }); }
    catch (e) { if (e instanceof SemOrcamento) throw e; console.error('[desistencia] o pedido não encerrou:', (e && e.codigo) || 'erro'); }
    if (r && r.ok === true) { await marcar(prep, 'concluida'); return { ok: true, encerrado: true }; }
    await avisarDono({ codigo: prep.codigo, evento: 'desistencia_nao_encerrada', parcela: 'entrada' });
    return { ok: true, encerrado: false };
  }

  async function desistir({ conversa_id, visitante_id }) {
    const prep = await banco('desistencia_preparar', { conversa_id, visitante_id });
    if (!prep || prep.ok !== true) throw recusa(prep && prep.motivo);
    if (!prep.retomar) {
      const fim = await devolver(prep);
      if (fim) return fim;
    }
    return encerrar(prep);
  }

  /* a reconciliação ACABA o que ficou pela metade (a queda do servidor, a resposta que não voltou, o pedido que não encerrou). Nunca estorna sozinha: uma desistência pedida cuja
     order ainda está aprovada só tem a trava solta (o dono já foi avisado da falha). Devolve quantos pedidos foram encerrados */
  async function concluirPendentes() {
    const r = await banco('desistencia_pendentes', {});
    let encerrados = 0;
    for (const prep of (r && Array.isArray(r.itens) ? r.itens : []).slice(0, 3)) {
      try {
        if (prep.status === 'pedida') {
          const order = await consultar(prep);
          if (order.falhou || conferir(order, prep) !== 'estornada') { await marcar(prep, 'liberada'); continue; }
          await aplicar(order, 'reconciliacao');
          await marcar(prep, 'estornada');
        }
        if ((await encerrar(prep)).encerrado) encerrados++;
      } catch (e) {
        if (e instanceof SemOrcamento) throw e;
        console.error('[desistencia] pendência não concluída:', (e && (e.codigo || e.tipo)) || 'erro');
      }
    }
    return encerrados;
  }

  desistir.concluirPendentes = concluirPendentes;
  return desistir;
}
