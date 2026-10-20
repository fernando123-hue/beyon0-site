/* ==========================================================================
   OS AJUSTES SEM IA (PR 3a; spec docs/specs/2026-10-11-orcamento-sem-ia.md §4 e §7): três ações, nenhuma chama modelo.
   • ajustar: UMA opção pronta da lista fechada (opcoes.mjs), conferida antes de qualquer leitura. O código aplica sobre a
     versão atual (alteracoes.mjs → aplicar) e grava com origem "opcao". Cores, fontes e seções só de OUTRO modelo pronto
     da geração atual: o "espaço reservado" de aplicar() para seção que nenhum modelo tem não é alcançável daqui. Nenhuma
     opção muda o preço.
   • desfazer: o último ajuste aplicado volta (o banco escolhe qual; o trabalho do dono não se desfaz por aqui).
   • pedido-livre: até 3, curto, redigido e numa linha só, na fila do dono (app.vendas_pedido_livre). "Seu pedido entra
     junto; não atrasa o início": a tela mostra o que ainda está aguardando; o resumo só conta (o texto fica fora do contrato).
   Cada ação: corpo conferido → visitante → estado → pedido não encerrado → etapa de ajuste → banco.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ErroBanco } from './transporte.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { aplicar } from './alteracoes.mjs';
import { validarOpcao, rotuloDaOpcao, fraseDaRecusa, fraseDoErro } from './opcoes.mjs';
import { limparMensagem, redigir } from './seguranca.mjs';

/* = app.vendas_registrar_alteracao e app.vendas_pedido_livre */
export const AJUSTE_ABERTO = ['escolhida', 'alteracoes'];
const ANTES_DA_ESCOLHA = ['descoberta', 'estimativa', 'contato', 'gerando', 'direcoes'];
export const PEDIDO_LIVRE_MAX = 300;
export const PEDIDOS_LIVRES_MAX = 3;
export const FRASES = Object.freeze({
  conversaInvalida: 'Conversa inválida.',
  opcaoInvalida: 'Esse ajuste não existe. Escolha uma das opções da tela.',
  escolhaAntes: 'Escolha um modelo antes.',
  fechados: 'Os ajustes desta proposta já foram fechados.',
  modeloIndisponivel: 'Esse modelo não está disponível para este ajuste.',
  secaoDeFora: 'Essa seção não existe nos outros modelos.',
  limiteAjustes: 'Você chegou ao limite de 30 ajustes neste pedido. Para mudar mais, fale com a Beyon Zero pelo WhatsApp.',
  versaoMudou: 'Sua versão mudou enquanto você ajustava (outra aba ou a Beyon Zero). Confira e tente de novo.',
  nadaADesfazer: 'Não há ajuste para desfazer.',
  ultimoDoDono: 'O último ajuste foi da Beyon Zero; escreva um pedido.',
  livreTamanho: 'Escreva o pedido em até 300 caracteres.',
  limiteLivres: 'Você já fez os 3 pedidos escritos deste orçamento. Para mais, fale com a Beyon Zero pelo WhatsApp.',
  livreFora: 'Este pedido segue com a Beyon Zero pelo WhatsApp: escreva por lá o que quer mudar.'
});
/* o corpo só com estas chaves (qualquer outra é 400, antes de tocar no banco) */
const soCom = (corpo, chaves) => !!corpo && typeof corpo === 'object' && !Array.isArray(corpo) && Object.keys(corpo).every(k => chaves.includes(k));
/* caracteres de controle (inclusive DEL e os C1) e separadores de linha viram espaço: o pedido entra numa linha só */
const CONTROLE_OU_ESPACO = /[\x00-\x20\x7f-\xa0\s]+/g;

export function criarAcoesDosAjustes({ banco, visitante, estado, exigirNaoDescartado }) {
  function exigirEtapa(etapa) {
    if (AJUSTE_ABERTO.includes(etapa)) return;
    throw new Recusa(409, ANTES_DA_ESCOLHA.includes(etapa) ? FRASES.escolhaAntes : FRASES.fechados);
  }
  /* a conversa no ponto de ajustar: não encerrada, na etapa e com o modelo escolhido entre os prontos da geração atual
     (o estado só traz as direções da geração atual) */
  async function noPontoDeAjustar(request, conversaId) {
    const vid = await visitante(request);
    const est = await estado(vid, conversaId);
    exigirNaoDescartado(est);
    exigirEtapa(est.conversa.etapa);
    const prontas = (est.direcoes || []).filter(d => d.status === 'pronta' && d.conteudo);
    const escolhida = est.escolha ? prontas.find(d => d.id === est.escolha.direcao_id) : null;
    if (!escolhida) throw new Recusa(409, FRASES.escolhaAntes);
    return { vid, est, escolhida, outras: prontas.filter(d => d.id !== escolhida.id) };
  }
  return {
    async ajustar({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id', 'opcao']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const m = validarOpcao(corpo.opcao);
      if (!m) throw new Recusa(400, FRASES.opcaoInvalida);
      const { vid, est, escolhida, outras } = await noPontoDeAjustar(request, corpo.conversa_id);
      /* o servidor confere o que validarOpcao (só a forma) não pode: o modelo de onde vêm cores e fontes é OUTRO modelo
         pronto desta geração, e a seção acrescentada existe em algum deles */
      if (m.operacao.startsWith('usar_') && !outras.some(d => d.numero === m.direcao)) throw new Recusa(422, FRASES.modeloIndisponivel);
      if (m.operacao === 'adicionar_secao' && !outras.some(d => (d.conteudo.secoes || []).some(s => s.tipo === m.secao))) throw new Recusa(422, FRASES.secaoDeFora);
      /* (só os OUTROS modelos prontos entram em aplicar(): é deles que vêm cores, fontes e seções) */
      const a = aplicar({ base: est.versao_final || escolhida.conteudo, mudancas: [m], direcoes: outras });
      if (a.erro) throw new Recusa(422, fraseDoErro(a.erro));
      if (!a.resultado[0].aplicada) throw new Recusa(422, fraseDaRecusa(a.resultado[0].motivo));
      const rotulo = rotuloDaOpcao(m);
      try {
        /* o banco recusa (40001) se outro modelo foi escolhido, ou outro ajuste foi aplicado, entre a leitura e a gravação:
           a base é o ajuste aplicado que esta leitura viu (null = nenhum) */
        const r = await banco('vendas_registrar_alteracao', { conversa_id: corpo.conversa_id, visitante_id: vid, direcao_id: escolhida.id,
          pedido: rotulo, mudancas: a.resultado, resultado: a.direcao, origem: 'opcao', base_id: est.ajuste_atual || null });
        return { alteracao_id: r.alteracao_id, rotulo };
      } catch (e) {
        if (e instanceof ErroBanco && e.codigo === '23514') throw new Recusa(409, FRASES.limiteAjustes, { whatsapp: true });
        if (e instanceof ErroBanco && e.codigo === '40001') throw new Recusa(409, FRASES.versaoMudou);
        throw e;
      }
    },

    async desfazer({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const vid = await visitante(request);
      const est = await estado(vid, corpo.conversa_id);
      exigirNaoDescartado(est);
      exigirEtapa(est.conversa.etapa);
      if (est.conversa.etapa !== 'alteracoes') throw new Recusa(409, FRASES.nadaADesfazer);   /* ("escolhida": ainda não houve ajuste) */
      const r = await banco('vendas_desfazer_alteracao', { conversa_id: corpo.conversa_id, visitante_id: vid });
      if (r && r.ok === false && r.motivo === 'dono') throw new Recusa(409, FRASES.ultimoDoDono);   /* (o "feito" do dono não se desfaz) */
      if (!r || r.ok !== true) throw new Recusa(409, FRASES.nadaADesfazer);
      return { alteracao_id: r.alteracao_id };
    },

    async pedidoLivre({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id', 'texto']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const limpo = limparMensagem(corpo.texto);
      /* redigido ANTES de medir ("a@b.co" vira "[e-mail]", que é maior) e numa linha só, como entra no resumo */
      const texto = limpo ? redigir(limpo).replace(CONTROLE_OU_ESPACO, ' ').trim() : '';
      if (!texto || texto.length > PEDIDO_LIVRE_MAX) throw new Recusa(400, FRASES.livreTamanho);
      const { vid, est } = await noPontoDeAjustar(request, corpo.conversa_id);
      /* (arquivado ou sem pedido: a fila do dono só tem confirmados, e o pedido ficaria "aguardando" para sempre) */
      if (!est.pedido || est.pedido.status !== 'confirmado') throw new Recusa(409, FRASES.livreFora, { whatsapp: true });
      if ((est.alteracoes || []).filter(a => a.origem === 'livre').length >= PEDIDOS_LIVRES_MAX) throw new Recusa(409, FRASES.limiteLivres, { whatsapp: true });
      try {
        const r = await banco('vendas_pedido_livre', { conversa_id: corpo.conversa_id, visitante_id: vid, texto });
        return { alteracao_id: r.alteracao_id, restantes: r.restantes };
      } catch (e) {
        if (e instanceof ErroBanco && e.codigo === '23514') throw new Recusa(409, FRASES.limiteLivres, { whatsapp: true });
        throw e;
      }
    }
  };
}
