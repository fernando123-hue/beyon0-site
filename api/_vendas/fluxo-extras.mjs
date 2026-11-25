/* ==========================================================================
   OS EXTRAS NA CONVERSA COM O ZERO (dono, 24/11, opção A). Com o consultor, o preço é a estimativa que o Zero gravou e os cartões de extras
   da tela de toques ficam escondidos (a conta deles trocaria o pacote do Zero). Logo depois do preço, a conversa mostra 2 ou 3 extras como
   cartões: um toque inclui, outro tira, e o preço que vale para o pedido é o novo. Duas ações, nenhuma chama modelo:
   • extras-sugeridos: as sugestões desta conversa (catalogo.mjs, sugestoesDaConversa: o ramo que ela tocou e o formato da estimativa
     gravada), cada uma com o quanto ela pesa no total, calculado pelo motor (precos.mjs, estimar) contra a tabela ATIVA.
   • alternar-extra: { chave, incluir, versao }. A chave tem de estar nas sugestões que o servidor monta agora para esta conversa (nunca
     uma chave qualquer do corpo); incluir é sim ou não; a versão é a da tabela que a tela mostrou. O código parte dos fatores GRAVADOS
     (o formato, as páginas, a urgência e os outros extras do Zero ficam), põe ou tira só aquele extra (e o que dependia dele), estima e
     regrava a estimativa: é ela que os detalhes do pedido e o escopo usam. Nenhum número vem do navegador. A escolha dela vai junto da
     estimativa (detalhes.escolhas_cliente): quando o Zero estima de novo, o código a aplica por cima (api/_vendas/escolhas-extras.mjs).
   Etapas: só até os detalhes do pedido (descoberta e estimativa, as mesmas do confirmar-pacote); o banco também recusa depois (55000).
   Freios por conversa, como os do preço ao vivo; o freio geral por IP de api/vendas.mjs vale antes de tudo.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ErroBanco } from './transporte.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { estimar } from './precos.mjs';
import { sugestoesDaConversa } from './catalogo.mjs';
import { regrasAtivas } from './regras-ativas.mjs';
import { criarFreio } from '../_freio.mjs';
import { mesmoJson } from './json-igual.mjs';
import { comExtra, escolhasDe, comEscolha, comEscolhasGravadas } from './escolhas-extras.mjs';

export const ETAPAS_EXTRAS = ['descoberta', 'estimativa'];
/* por conversa, no módulo (o fluxo é criado a cada pedido): quem toca muito não fica sem poder seguir para o pedido */
const freioListar = criarFreio({ max: 60, janelaMs: 60 * 60e3 });
const freioAlternar = criarFreio({ max: 30, janelaMs: 60 * 60e3 });
export const FRASES = Object.freeze({
  conversaInvalida: 'Conversa inválida.',
  semPreco: 'O valor ainda não saiu. Converse com o Zero primeiro.',
  extraInvalido: 'Esse extra não está disponível aqui.',
  incluirInvalido: 'Diga se quer incluir ou tirar o extra.',
  muitos: 'Muitos toques seguidos. Espere um pouco ou deixe um recado.',
  tabelaMudou: 'A tabela de valores mudou enquanto você montava o orçamento. Confira o valor novo.',
  emAtualizacao: 'A tabela de valores está em atualização. Deixe um recado para a equipe.',
  fechado: 'O pacote já foi fechado. Para mudar, deixe um recado para a equipe.',
  precisaConversa: 'Esse pacote precisa de uma conversa. Deixe um recado para a equipe.'
});
const exigir = (cond, status, msg, extra) => { if (!cond) throw new Recusa(status, msg, extra); };
const valida = e => !!e && !e.erros && !e.encaminhar_diagnostico;

/* as sugestões com o peso de cada uma no total (incluído: quanto sai se tirar; fora: quanto entra). Fica de fora a que não fecha pelo motor
   (pede conversa, joga parte para uma fase seguinte que hoje não existe) ou não muda o valor */
function sugestoes(regras, fatores, toques) {
  const tabela = regras.regras;
  const atual = estimar(fatores, tabela);
  if (!valida(atual)) return { total: null, extras: [] };
  const lista = sugestoesDaConversa(tabela, { formato: fatores.formato, ramo: toques.ramo, material: toques.material });
  const extras = lista.map(s => {
    const incluido = Number(fatores.adicionais?.[s.chave]) > 0;
    const outro = estimar(comExtra(fatores, s.chave, !incluido, tabela), tabela);
    if (!valida(outro) || (!incluido && outro.fase_seguinte && !atual.fase_seguinte)) return null;
    const valor = Math.abs(outro.valor_total - atual.valor_total);
    return valor > 0 ? { chave: s.chave, nome: s.nome, frase: s.frase, valor, incluido, indicado: s.indicado } : null;
  }).filter(Boolean);
  return { total: atual.valor_total, extras };
}

export function criarAcoesDosExtras({ banco, visitante, estado, donoDaConversa, cartao }) {
  /* visitante → conversa dele, na etapa certa (404 de outro, 409 fechada) → freio → estimativa gravada → tabela ativa → o que ela tocou */
  async function contexto(request, corpo, freio) {
    const vid = await visitante(request);
    exigir(ehUuid(corpo?.conversa_id), 400, FRASES.conversaInvalida);
    const dono = await donoDaConversa(vid, corpo.conversa_id, ETAPAS_EXTRAS);
    exigir(!freio(corpo.conversa_id), 429, FRASES.muitos);
    exigir(dono && dono.estimativa && dono.estimativa.fatores && typeof dono.estimativa.fatores === 'object', 409, FRASES.semPreco);
    const regras = await regrasAtivas(banco, { cache: true });
    exigir(regras, 503, FRASES.emAtualizacao);
    const est = await estado(vid, corpo.conversa_id);
    const t = est?.conversa?.briefing?.fluxo_toques;
    return { vid, dono, regras, toques: t && typeof t === 'object' ? t : {}, estimativa: est?.estimativa || null };
  }
  const resposta = (regras, fatores, toques) => ({ versao: regras.id, fatores, ...sugestoes(regras, fatores, toques) });

  return {
    async extrasSugeridos({ request, corpo }) {
      const { dono, regras, toques } = await contexto(request, corpo, freioListar);
      /* (a tabela mudou depois do preço do Zero: nada a sugerir até ele estimar de novo; o peso de cada extra seria de outra tabela) */
      if (dono.estimativa.regras_id !== regras.id) return { versao: regras.id, fatores: dono.estimativa.fatores, total: null, extras: [] };
      return resposta(regras, dono.estimativa.fatores, toques);
    },

    async alternarExtra({ request, corpo }) {
      const chave = corpo?.chave, incluir = corpo?.incluir;
      exigir(typeof incluir === 'boolean', 400, FRASES.incluirInvalido);
      exigir(typeof chave === 'string' && chave.length <= 41, 400, FRASES.extraInvalido);
      let { vid, dono, regras, toques, estimativa } = await contexto(request, corpo, freioAlternar);
      if (corpo.versao !== regras.id) {
        /* a tabela guardada pode ter até 30 s: confere no banco antes de dizer que mudou (como o confirmar-pacote) */
        regras = await regrasAtivas(banco);
        exigir(regras, 503, FRASES.emAtualizacao);
        exigir(corpo.versao === regras.id, 409, FRASES.tabelaMudou, { versao_nova: regras.id });
      }
      exigir(dono.estimativa.regras_id === regras.id, 409, FRASES.tabelaMudou, { versao_nova: regras.id });
      const fatores = dono.estimativa.fatores;
      /* a chave tem de ser uma das sugestões que ESTE servidor monta para ESTA conversa agora */
      exigir(sugestoes(regras, fatores, toques).extras.some(x => x.chave === chave), 400, FRASES.extraInvalido);
      const e = estimar(comExtra(fatores, chave, incluir, regras.regras), regras.regras);
      exigir(!e.erros, 400, FRASES.extraInvalido);
      exigir(!e.encaminhar_diagnostico, 409, FRASES.precisaConversa);
      /* a escolha dela segue gravada com a estimativa (api/_vendas/escolhas-extras.mjs): uma estimativa nova do Zero não a desfaz */
      const antes = escolhasDe(estimativa, regras.regras), escolhas = comEscolha(antes, chave, incluir);
      /* o mesmo pacote e a mesma escolha de novo (duplo toque, outra aba): nada a gravar */
      if (!mesmoJson(fatores, e.fatores) || !mesmoJson(antes, escolhas)) {
        try {
          await banco('vendas_registrar_estimativa', { conversa_id: corpo.conversa_id, visitante_id: vid, regras_id: regras.id, fatores: e.fatores,
            valor_total: e.valor_total, sinal: e.sinal, prazo_dias: e.prazo_dias, fase: e.fase, detalhes: comEscolhasGravadas(e, escolhas) });
        } catch (x) {
          if (x instanceof ErroBanco && x.codigo === '55000') throw new Recusa(409, FRASES.fechado);
          throw x;
        }
      }
      return { estimativa: cartao(e), ...resposta(regras, e.fatores, toques) };
    }
  };
}
