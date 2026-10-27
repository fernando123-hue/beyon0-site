/* ==========================================================================
   A ENTREGA PELO DONO, no painel (PR 3b-3; spec §5, §6, §8). Cada ação recebe o código JÁ normalizado (BZ-…) por api/painel.mjs, lê o que precisa
   (vendas_entrega_info), CONFERE com a mensagem certa para o dono (o banco confere de novo, como rede), calcula o prazo no servidor (a regra da captação) e chama
   a função do banco. O endereço gravado é sempre a ORIGEM do que o dono digitou (sem barra final, sem caminho). Nada aqui grava texto do cliente no log.
   D5: não existe aqui nada que aprove, publique ou encerre "por silêncio": pôr no ar exige a aprovação do cliente, e o motivo de encerrar é de lista fechada.
   ========================================================================== */
import { criarTransporte } from '../_vendas/transporte.mjs';
import { ORG } from '../_vendas/org.mjs';
import { pareceInjecao } from '../_vendas/seguranca.mjs';
import { problemaDaPrevia, problemaDoSite, origemDoSite } from './enderecos.mjs';
import { abrirPausa, iniciarPrazo, calcularEntregarAte, isoNoFuso, diasCorridosDesde, prazoVencido } from '../_material/prazo.mjs';
import { LIMITES } from './alarmes.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

export const MOTIVOS_DE_ENCERRAR = Object.freeze(['desistencia', 'atraso', 'producao_manual', 'outro']);   /* lista fechada: nunca "sem resposta" (D5) e, desde 22/10, nunca "sem_material" */
export const MOMENTOS_DE_AVISO = Object.freeze(['previa', 'no_ar', 'material_parado', 'material_apagar', 'restante_lembrete_1', 'restante_lembrete_2']);
const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const FALHA = () => json({ erro: 'Banco não configurado.' }, 503);   /* (uma resposta nova a cada uso: o corpo de uma Response só se lê uma vez) */

async function lerInfo(rpc, codigo) {
  try { return { info: await rpc('vendas_entrega_info', { org_slug: ORG, codigo }) }; }
  catch (e) {
    if (e && e.codigo === 'P0002') return { resposta: json({ erro: 'Pedido não encontrado.' }, 404) };
    console.error('[painel] entrega, leitura:', e && e.codigo);
    return { resposta: json({ erro: 'Não deu para ler a entrega agora.' }, 500) };
  }
}
/* o banco devolveu 55000 (passo), 40001 (a entrega mudou no meio) ou outro erro */
function erroDoBanco(e, rotulo, { prazo = false } = {}) {
  if (e && e.codigo === '55000') return json({ erro: 'O passo da entrega mudou: confira com "listar" e tente de novo.' }, 409);
  if (e && e.codigo === '40001') return json({ erro: 'A entrega mudou enquanto você agia. Rode de novo.' }, 409);
  if (e && e.codigo === 'P0002') return json({ erro: 'Pedido não encontrado.' }, 404);
  /* nas ações de prazo o 22023 é o relógio fora da janela (5 min) ou a data fora do padrão: não é erro de quem digitou */
  if (e && e.codigo === '22023' && prazo) return json({ erro: 'O banco recusou a hora desta ação (o relógio do servidor está fora da janela de 5 minutos do banco, ou a data do prazo não bate): confira o relógio e tente de novo.' }, 409);
  if (e && e.codigo === '22023') return json({ erro: 'Pedido inválido.' }, 400);
  console.error('[painel] ' + rotulo + ':', e && e.codigo);
  return json({ erro: 'Não deu para salvar agora.' }, 500);
}
const MOTIVO_RECUSA = {
  cedo: 'Ainda não é a hora: o prazo desta ação não chegou.',
  sem_numero: 'O número do WhatsApp ainda não está autorizado: o site não sai sem ele.',
  rodadas: 'O cliente já usou as rodadas de ajuste combinadas.',
  sem_importado: 'O pedido ainda não foi importado na captação: rode "importado BZ-… c-xxxxxx" antes.',
  endereco: 'O endereço não vale (o banco recusou).',
  estado: 'O material já não está em rascunho.',
  pagamento_em_andamento: 'Há um Pix do restante em andamento: espere ele expirar (1 hora) ou cancele no Mercado Pago, e tente de novo.',
  sem_aviso: 'O aviso "seu site está no ar" ainda não foi registrado: os 3 dias do restante só contam a partir dele (aviso BZ-… no-ar).',
  fora_do_ar: 'O site não está no ar: o lembrete do restante só existe com o site no ar.',
  dispensar: 'O número já está autorizado: o caminho é dispensar o material (dispensar BZ-…), não o aviso de material parado.',
  ja: 'Isso já foi registrado.'
};
const RECUSA_GENERICA = 'O banco recusou esta ação: confira o passo da entrega na lista e tente de novo.';
/* a recusa de regra do banco ({ ok:false, motivo }) vira 409 com a frase em português; só o endereço fora do padrão é 422. `frases` troca a frase de um motivo para esta ação */
function recusar(r, frases = {}) {
  const motivo = r && r.motivo;
  return json({ erro: frases[motivo] || MOTIVO_RECUSA[motivo] || RECUSA_GENERICA }, motivo === 'endereco' ? 422 : 409);
}
/* "ainda cedo" por momento: o aviso de material parado é do limite de LIMITES.material_dias depois da entrada; os lembretes, do 2º e do 3º dia depois do aviso "no ar" */
const fraseDoDia30 = dias => 'Ainda não: só depois de ' + LIMITES.material_dias + ' dias da entrada (hoje são ' + dias + ').';
const fraseCedo = (momento, dias) => momento === 'restante_lembrete_1' ? 'Ainda não: o lembrete do 2º dia só vale a partir do 2º dia depois do aviso do site no ar (hoje são ' + dias + ').'
  : momento === 'restante_lembrete_2' ? 'Ainda não: o último lembrete é do 3º dia depois do aviso do site no ar (hoje são ' + dias + ').'
  : 'O aviso de material parado é a partir do dia ' + LIMITES.material_dias + ' depois da entrada (captação: o aviso só vale depois desse dia; hoje são ' + dias + ').';

/* o aviso prévio do apagamento do material (22/10, projeto parado há 5 meses): as recusas do banco com a frase certa (as de material parado falariam da entrada) */
const FRASES_APAGAR = Object.freeze({
  estado: 'O aviso prévio do apagamento só existe enquanto o projeto espera o material (passo "material").',
  sem_aviso: 'Registre antes o aviso de material parado (aviso BZ-… material-parado): o tempo de "parado" só começa nele.',
  nada: 'O cliente não mandou nada que possa ser apagado: não há o que avisar.',
  cedo: 'Ainda não: o aviso prévio é devido quando o projeto completa 5 meses parado (datas de Campo Grande), ou já foi dado depois da última mexida do cliente.',
  dispensar: 'O número já está autorizado: o caminho é dispensar o material (dispensar BZ-…), não apagá-lo.',
  ja: 'O aviso prévio do apagamento já foi registrado.'
});

/* M1 (a regra única da captação, clientes/entrega.mjs:162 e :232): o prazo corre até PUBLICAR. Com ele vencido, nem a prévia nem o site saem: antes disso, a devolução por atraso */
const instanteOk = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
/* o prazo guardado tem de ter datas que se leem: a conta (Intl) lança com data torta e o dono veria 500 */
function prazoLegivel(prazo) {
  if (!prazo || typeof prazo !== 'object' || !instanteOk(prazo.conta_desde)) return false;
  if (prazo.pausas !== undefined && !Array.isArray(prazo.pausas)) return false;
  return (prazo.pausas || []).every(p => p && instanteOk(p.desde) && (p.ate === null || instanteOk(p.ate)));
}
const PRAZO_TORTO = () => json({ erro: 'O prazo desta entrega tem uma data que não dá para ler: confira o prazo na lista de entregas antes de publicar.' }, 409);
/* a conta do prazo (Intl) lança RangeError com data torta que o prazoLegivel não vê (ex.: novas_datas): vira 409 com a frase, nunca exceção.
   Devolve a resposta que barra, ou null se pode seguir */
function barrarPeloPrazo(info, agora, oQue) {
  try {
    if (!prazoLegivel(info.prazo)) return PRAZO_TORTO();
    return prazoVencido(info.prazo, { prazoDias: info.prazo_dias }, agora) ? json({ erro: fraseDoAtraso(info, oQue) }, 409) : null;
  } catch (e) { if (e instanceof RangeError) return PRAZO_TORTO(); throw e; }
}
const fraseDoAtraso = (info, oQue) => 'O prazo combinado (' + info.entrega_ate + ') venceu: ' + oQue + ' agora esconderia o atraso. O caminho é a devolução por atraso (D4: a entrada volta, mesmo depois dos 7 dias): estorne no Mercado Pago, rode "encerrar BZ-… atraso" e registre a devolução na captação. Se o cliente quiser seguir: o site ainda não recebe a nova data (é pendência), e é preciso registrar a nova data antes de publicar.';

export function criarAcoesDoDono(env) {
  const rpc = criarTransporte(env);
  const agoraDe = () => { const a = new Date(); return { agora: a, iso: a.toISOString(), fuso: isoNoFuso(a) }; };
  const base = codigo => ({ org_slug: ORG, codigo });

  return {
    async previaPublicar(codigo, bruto) {
      if (!rpc) return FALHA();
      const { info, resposta } = await lerInfo(rpc, codigo); if (resposta) return resposta;
      if (!['producao', 'ajustes'].includes(info.passo)) return json({ erro: 'A entrega está em "' + info.passo + '": só se publica prévia quando ela está em produção ou em ajustes.' }, 409);
      const problema = problemaDaPrevia(bruto.url, info.cliente_captacao);
      if (problema) return json({ erro: problema }, 422);
      const t = agoraDe();
      const atrasoPrevia = barrarPeloPrazo(info, t.agora, 'mostrar a prévia'); if (atrasoPrevia) return atrasoPrevia;   /* (M1) o prazo atual, ANTES de abrir a pausa */
      try {
        const r = await rpc('vendas_previa_publicar', { ...base(codigo), url: new URL(bruto.url).origin, agora: t.iso, versao: info.versao, prazo: abrirPausa(info.prazo, t.fuso) });
        return r && r.ok ? json({ ok: true }) : recusar(r);
      } catch (e) { return erroDoBanco(e, 'prévia', { prazo: true }); }
    },

    async noAr(codigo, bruto) {
      if (!rpc) return FALHA();
      const { info, resposta } = await lerInfo(rpc, codigo); if (resposta) return resposta;
      if (info.passo !== 'aprovada') {
        return json({ erro: info.passo === 'previa' || info.passo === 'ajustes' || info.passo === 'producao'
          ? 'O cliente ainda não aprovou a prévia: o projeto para até ele responder (D5). Nada é publicado antes.'
          : 'A entrega está em "' + info.passo + '": só se põe no ar depois da aprovação.' }, 409);
      }
      const problema = problemaDoSite(bruto.url);
      if (problema) return json({ erro: problema }, 422);
      const t = agoraDe();
      const atrasoSite = barrarPeloPrazo(info, t.agora, 'publicar o site'); if (atrasoSite) return atrasoSite;   /* (M1) a pausa fechou quando o cliente aprovou: o prazo voltou a correr */
      try {
        const r = await rpc('vendas_no_ar', { ...base(codigo), url: origemDoSite(bruto.url), agora: t.iso, versao: info.versao });
        return r && r.ok ? json({ ok: true }) : recusar(r);
      } catch (e) { return erroDoBanco(e, 'no ar', { prazo: true }); }
    },

    async suspender(codigo) {
      if (!rpc) return FALHA();
      try {
        const r = await rpc('vendas_suspender', base(codigo));
        if (r && r.ok) {
          return json({ ok: true, lembretes: r.lembretes, aviso: r.lembretes >= 2 ? 'Suspenso no site. Tire o site do ar pela captação.'
            : 'Suspenso no site. ATENÇÃO: só ' + r.lembretes + ' dos 2 lembretes do restante (2º e 3º dia) foram registrados; a captação só deixa tirar o site do ar com os 2. Tire o site do ar pela captação.' });
        }
        if (r && r.motivo === 'cedo') return json({ erro: 'Ainda não: o aviso do site no ar foi há ' + r.dias + ' dia(s). O site só sai do ar à 00:00 depois do 3º dia (D4, 22/10).' }, 409);
        return recusar(r);
      } catch (e) { return erroDoBanco(e, 'suspender'); }
    },

    async encerrar(codigo, bruto) {
      if (!rpc) return FALHA();
      if (!MOTIVOS_DE_ENCERRAR.includes(bruto.motivo)) return json({ erro: 'Motivo fora da lista: ' + MOTIVOS_DE_ENCERRAR.join(', ') + '. Não existe encerrar por silêncio do cliente (D5).' }, 400);
      try {
        const r = await rpc('vendas_encerrar', { ...base(codigo), motivo: bruto.motivo });
        return r && r.ok ? json({ ok: true, lembrete: 'Se houve devolução, registre também na captação (desistiu / devolucao): são duas marcações.' }) : recusar(r);
      } catch (e) { return erroDoBanco(e, 'encerrar'); }
    },

    async dispensar(codigo) {
      if (!rpc) return FALHA();
      const { info, resposta } = await lerInfo(rpc, codigo); if (resposta) return resposta;
      if (info.passo !== 'material') return json({ erro: 'A entrega está em "' + info.passo + '": só se dispensa o material de quem ainda não o enviou.' }, 409);
      if (!instanteOk(info.entrada_em)) return json({ erro: 'A entrada desta entrega não tem data legível: confira na lista de entregas antes de dispensar o material.' }, 409);
      const dias = diasCorridosDesde(info.entrada_em);
      if (dias < LIMITES.material_dias) return json({ erro: fraseDoDia30(dias) }, 409);
      const falta = ESQ.faltas(info.material);
      if (falta.length) {
        return json({ erro: 'O número do WhatsApp ainda não está autorizado (falta: ' + falta.map(f => f.texto).join(', ') + '): sem a autorização expressa do cliente nada é publicado (captação, resposta 3). '
          + 'Registre o aviso de material parado (aviso BZ-… material-parado): o projeto fica parado até o cliente mandar o material ou autorizar.' }, 409);
      }
      const t = agoraDe();
      try {
        const prazo = iniciarPrazo({ entrada_em: info.entrada_em, numero_em: t.fuso });
        const entregaAte = calcularEntregarAte(prazo, { prazoDias: info.prazo_dias }, t.agora);
        const r = await rpc('vendas_material_dispensar', { ...base(codigo), agora: t.iso, versao: info.versao, prazo: { numero_em: t.fuso, conta_desde: prazo.conta_desde }, entrega_ate: entregaAte });
        if (r && r.ok) return json({ ok: true, entrega_ate: entregaAte, marcada_em: (info.material && info.material.autorizacao && info.material.autorizacao.marcada_em) || null });   /* (B5) a data REAL da marcação da caixa; o formulário leva a de hoje */
        return recusar(r, { cedo: fraseDoDia30(r && r.dias) });
      } catch (e) { return e instanceof RangeError ? PRAZO_TORTO() : erroDoBanco(e, 'dispensar', { prazo: true }); }
    },

    async avisoFeito(codigo, bruto) {
      if (!rpc) return FALHA();
      if (!MOMENTOS_DE_AVISO.includes(bruto.momento)) return json({ erro: 'Momento inválido: ' + MOMENTOS_DE_AVISO.join(', ') + '.' }, 400);
      try {
        const r = await rpc('vendas_aviso_feito', { ...base(codigo), momento: bruto.momento });
        if (r && r.ok) return json({ ok: true });
        return recusar(r, bruto.momento === 'material_apagar' ? FRASES_APAGAR : { cedo: fraseCedo(bruto.momento, r && r.dias), estado: 'O aviso de material parado só existe enquanto o cliente ainda não enviou o material (passo "material").' });
      } catch (e) { return erroDoBanco(e, 'aviso'); }
    },

    async religado(codigo) {
      if (!rpc) return FALHA();
      try { await rpc('vendas_religado', base(codigo)); return json({ ok: true }); } catch (e) { return erroDoBanco(e, 'religado'); }
    },

    /* a fila dos avisos da D1: o contato vai para o painel montar a mensagem (e o link de retomada de uso único, pelo `link_retomada` que já existe) */
    async avisos() {
      if (!rpc) return FALHA();
      try { const r = await rpc('vendas_avisos_lista', { org_slug: ORG }); return json({ itens: r.itens || [], total: r.total || 0 }); }
      catch (e) { console.error('[painel] avisos:', e && e.codigo); return json({ erro: 'Não deu para ler os avisos agora.' }, 500); }
    },

    /* a lista de ajustes como DADO: o selo de texto suspeito por item; a produção a lê dentro da moldura do briefing (scripts/entregas-lib.mjs) */
    async ajustes(codigo) {
      if (!rpc) return FALHA();
      try {
        const r = await rpc('vendas_ajustes_da_entrega', base(codigo));
        return json({ passo: r.passo, previa_url: r.previa_url, ajustes: (r.ajustes || []).map(a => ({ ...a, suspeito: pareceInjecao(String(a.texto || '')) })) });
      } catch (e) { return erroDoBanco(e, 'ajustes'); }
    }
  };
}
