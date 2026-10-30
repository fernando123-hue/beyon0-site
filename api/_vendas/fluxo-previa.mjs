/* ==========================================================================
   A PRÉVIA, pelo cliente (PR 3b-3; spec §3 e §8; D2, D4, D5): duas ações, nenhuma chama modelo.
   • previa-ajustes: UMA lista por vez, de 1 a 1.500 caracteres DIGITADOS (medidos antes de redigir; M3), depois de limpar e redigir (o telefone e o e-mail viram marcador);
     o WhatsApp/telefone e o e-mail DO SITE vão em campos próprios (M3, 22/10), normalizados e conferidos por ESQ.contatoDoSite e só com `autorizo: true` (a mesma autorização
     do material); uma lista pode ter só o contato; CPF/CNPJ é recusado ANTES de redigir; a rodada que a tela viu tem de ser a do banco (40001 → 409); a 3ª lista é recusada (D2).
     O prazo VOLTA A CORRER: o servidor fecha a pausa e calcula a data nova com a regra da captação (api/_material/prazo.mjs) e o banco só guarda.
   • previa-aprovar: só o cliente aprova (D5), e só a prévia que ele viu (`rodada_base`); não existe aprovação por tempo, por rotina nem pelo dono.
   Atrás do interruptor BZ_ENTREGA. O texto da lista NUNCA volta à tela; nada aqui grava texto do cliente no log.
   Toda recusa do banco que a pessoa pode ler vira frase em português (409/422), nunca a mensagem crua nem 500.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ErroBanco } from './transporte.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { redigir, semInvisiveis } from './seguranca.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';
import { fecharPausa, calcularEntregarAte, isoNoFuso } from '../_material/prazo.mjs';
import { entregaLigada, FRASE_DESLIGADA } from '../_material/interruptor.mjs';

export const MAX_LISTA = 1500;
export const FRASES = Object.freeze({
  conversaInvalida: 'Conversa inválida.',
  cpf: 'Não escreva CPF, CNPJ nem números soltos de 11 ou 14 dígitos aqui. Telefone e e-mail do site vão nos campos próprios.',
  texto: 'Escreva a lista de ajustes (de 1 a 1.500 caracteres).',
  passo: 'Esta etapa não está disponível agora. Se precisar, deixe um recado para a equipe.',
  mudou: 'A prévia mudou enquanto você escrevia (outra aba?). Confira e tente de novo.',
  rodadas: 'As duas listas de ajuste já foram usadas. O que passar disso é orçado à parte: deixe um recado para a equipe.',
  whatsapp: 'O WhatsApp ou telefone do site não parece certo. Use o DDD e o número (ex.: (21) 99999-0001).',
  email: 'O e-mail do site não parece certo. Confira (ex.: contato@seusite.com.br).',
  autorizacao: 'Para trocar o telefone ou o e-mail do site, marque a autorização de uso.'
});
const soCom = (corpo, chaves) => !!corpo && typeof corpo === 'object' && !Array.isArray(corpo) && Object.keys(corpo).every(k => chaves.includes(k));
const tipoOpcional = (v, tipo) => v === undefined || v === null || typeof v === tipo;
/* controles (menos tabulação e quebras de linha) e, por semInvisiveis (a mesma do pedido livre), os caracteres de formato, o uso privado e o substituto solto */
const CONTROLES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const limparLista = s => semInvisiveis(s.replace(CONTROLES, '')).trim();
/* linhas em branco entre os dígitos escondiam um CPF ou telefone da redação (o pedido livre junta tudo numa linha): aqui as quebras duplas viram uma, e a lista segue em linhas */
const unirQuebras = s => s.replace(/\s*\n\s*/g, '\n');   /* (o \s* de antes pega também o \r do fim de linha do Windows) */
const cortar = (s, max) => [...s].slice(0, max).join('');   /* (por caractere inteiro, não no meio de um par de substitutos) */

export function criarAcoesDaPrevia({ banco, visitante, estado, env }) {
  async function chamar(nome, p) {
    try { return await banco(nome, p); }
    catch (e) {
      if (e instanceof ErroBanco && e.codigo === '55000') throw new Recusa(409, FRASES.passo, { recado: true });   /* passo errado ou entrada estornada */
      if (e instanceof ErroBanco && e.codigo === '40001') throw new Recusa(409, FRASES.mudou);
      throw e;
    }
  }
  /* a entrega no passo "previa", ou a recusa; `prazo` com a pausa já fechada e a data que a regra da captação dá */
  async function entregaNaPrevia(request, conversaId) {
    const vid = await visitante(request);
    const e = (await estado(vid, conversaId)).entrega;
    if (!e || e.passo !== 'previa') throw new Recusa(409, FRASES.passo, { recado: true });   /* (a frase manda deixar um recado: a saída vai junto, como no 55000 do banco) */
    const agora = new Date();
    const prazo = fecharPausa(e.prazo, isoNoFuso(agora));
    return { vid, e, agora, prazo, entregaAte: calcularEntregarAte(prazo, { prazoDias: e.prazo_dias }, agora) || e.entrega_ate };
  }

  const acoes = {
    async previaAjustes({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id', 'texto', 'rodada_base', 'whatsapp', 'email', 'autorizo']) || !ehUuid(corpo.conversa_id) || typeof corpo.texto !== 'string'
        || !Number.isInteger(corpo.rodada_base) || corpo.rodada_base < 0
        || !tipoOpcional(corpo.whatsapp, 'string') || !tipoOpcional(corpo.email, 'string') || !tipoOpcional(corpo.autorizo, 'boolean')) throw new Recusa(400, FRASES.conversaInvalida);
      /* (M3, 22/10) o telefone/WhatsApp e o e-mail DO SITE vêm em campos próprios: normalizados e conferidos pela regra única (ESQ.contatoDoSite, a mesma da tela e do banco). O texto livre NÃO leva contato: continua redigido */
      const contato = ESQ.contatoDoSite(corpo.whatsapp, corpo.email);
      if (!contato.ok) throw new Recusa(422, contato.erro === 'whatsapp' ? FRASES.whatsapp : FRASES.email);
      const temContato = !!(contato.whatsapp || contato.email);
      if (temContato && corpo.autorizo !== true) throw new Recusa(422, FRASES.autorizacao);   /* trocar o contato exige a MESMA autorização de uso do material: nada vai ao ar sem ela */
      if (ESQ.CPF_CNPJ.test(corpo.texto)) throw new Recusa(422, FRASES.cpf);   /* (ANTES de redigir, que trocaria o número por um marcador) */
      /* (M3) o limite de 1.500 é do que o cliente DIGITOU, medido ANTES de redigir. Redigir pode alongar o texto (`a@b.com`, 7 caracteres, vira `[e-mail]`, 8): quem digitou
         exatamente 1.500 não pode levar 422. O que passar de 1.500 DEPOIS de redigir é cortado no fim (o banco só aceita 1.500). Texto grande demais é 422 também com contato:
         nunca vira "só o contato" em silêncio */
      const limpo = limparLista(corpo.texto);
      if (limpo.length > MAX_LISTA) throw new Recusa(422, FRASES.texto);
      const texto = cortar(redigir(unirQuebras(limpo)).trim(), MAX_LISTA).trim();
      if (!texto && !temContato) throw new Recusa(422, FRASES.texto);   /* uma lista tem texto, contato do site, ou os dois */
      const { vid, e, agora, prazo, entregaAte } = await entregaNaPrevia(request, corpo.conversa_id);
      if (e.rodadas.max != null && e.rodadas.usadas >= e.rodadas.max) throw new Recusa(409, FRASES.rodadas, { recado: true });
      const r = await chamar('vendas_previa_ajustes', { conversa_id: corpo.conversa_id, visitante_id: vid, texto, whatsapp: contato.whatsapp, email: contato.email,
        autorizacao_versao: temContato ? ESQ.AUTORIZACAO.versao : null, rodada_base: corpo.rodada_base, versao: e.versao, agora: agora.toISOString(), prazo, entrega_ate: entregaAte });
      if (!r || r.ok !== true) throw new Recusa(409, r && r.motivo === 'rodadas' ? FRASES.rodadas : FRASES.passo, { recado: true });   /* (motivo que não conheço: a frase geral, nunca o motivo cru) */
      return { ok: true, rodada: r.rodada, entrega_ate: entregaAte };
    },

    async previaAprovar({ request, corpo }) {
      /* (B1, revisão de segurança) a tela diz QUAL prévia a pessoa viu (`rodada_base`, o mesmo número da lista de ajustes). Sem ela a porta velha ficaria aberta: numa aba antiga
         o servidor aprovaria a prévia nova, que a pessoa nunca abriu (D5). Faltou ou veio torta: 400; não é a rodada da entrega lida: 409 "a prévia mudou" */
      if (!soCom(corpo, ['conversa_id', 'rodada_base']) || !ehUuid(corpo.conversa_id) || !Number.isInteger(corpo.rodada_base) || corpo.rodada_base < 0) throw new Recusa(400, FRASES.conversaInvalida);
      const { vid, e, agora, prazo } = await entregaNaPrevia(request, corpo.conversa_id);
      if (corpo.rodada_base !== e.rodadas.usadas) throw new Recusa(409, FRASES.mudou);
      const r = await chamar('vendas_previa_aprovar', { conversa_id: corpo.conversa_id, visitante_id: vid, versao: e.versao, agora: agora.toISOString(), prazo });
      if (!r || r.ok !== true) throw new Recusa(409, FRASES.passo, { recado: true });
      return { ok: true };
    }
  };
  /* o interruptor: desligado, nenhuma ação passa (503 com a saída pelo recado), sem tocar no estado nem no banco (o corpo já foi lido por atender, mas não é usado) */
  return Object.fromEntries(Object.entries(acoes).map(([nome, f]) => [nome, async a => {
    if (!entregaLigada(env)) throw new Recusa(503, FRASE_DESLIGADA, { recado: true });
    return f(a);
  }]));
}
