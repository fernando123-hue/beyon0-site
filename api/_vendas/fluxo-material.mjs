/* ==========================================================================
   O MATERIAL (PR 3b-2; spec §3, §7, §8, §9): cinco ações, nenhuma chama modelo e NENHUMA passa o arquivo pelo Worker.
   O navegador envia o arquivo direto ao armazém, pelo link assinado que `material-reservar` devolve; o Worker só reserva,
   pede o link, e em `material-conferir` lê os 16 primeiros bytes e o tamanho do objeto (o tipo vem do CONTEÚDO, o
   tamanho tem de ser igual ao declarado). O que o cliente digita vale pelo esquema compartilhado (js/orcamento-material-
   esquema.js), depois de limparMensagem + redigir nos textos livres e com CPF/CNPJ recusado ANTES de redigir.
   Cada ação: corpo conferido → visitante → banco (dono da sessão, passo "material"). Nada aqui grava link, caminho ou
   nome de arquivo no log. Recusa de regra volta do banco como { ok: false, motivo }.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ErroBanco } from './transporte.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { limparMensagem, redigir } from './seguranca.mjs';
import { ipDe } from '../_freio.mjs';
import { chaveDoIp } from './ip.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';
import { tipoPorBytes } from '../_material/bytes.mjs';
import { iniciarPrazo, calcularEntregarAte, isoNoFuso } from '../_material/prazo.mjs';
import { podarDados } from '../_material/pacote.mjs';
import { entregaLigada, FRASE_DESLIGADA } from '../_material/interruptor.mjs';

export const FRASES = Object.freeze({
  conversaInvalida: 'Conversa inválida.',
  campo: 'Esse campo não existe.',
  valor: 'Confira esse campo e tente de novo.',
  cpf: 'Não escreva CPF nem CNPJ aqui.',
  tipo: 'Esse arquivo não é uma foto que o site aceita. Use JPG, PNG ou WebP.',
  fotoGrande: 'Foto grande demais (até 10 MB).',
  logoGrande: 'Logo grande demais (até 5 MB).',
  limiteFotos: 'Você chegou ao limite de 20 fotos.',
  limiteLogo: 'Já há uma logo. Tire a atual para trocar.',
  limiteReservas: 'Você chegou ao limite de arquivos deste pedido. Se precisar de mais, fale com a Beyon Zero pelo WhatsApp.',
  limitePedido: 'O total das fotos passou de 150 MB. Tire alguma ou mande menores.',
  balde: 'Recebemos muitos arquivos agora. Tente de novo amanhã.',
  freio: 'Muitos envios seguidos. Espere um pouco e tente de novo.',
  numero: 'Não encontrei um número de WhatsApp válido no pedido. Digite o número.',
  faltam: 'Falta preencher o que é obrigatório.',
  enviando: 'Espere os arquivos terminarem de enviar.',
  mudou: 'O material mudou enquanto você enviava (outra aba?). Confira e tente de novo.',
  naoChegou: 'O arquivo não chegou ao armazém. Tente de novo.',
  naoEra: 'O arquivo que chegou não é o que você escolheu. Tente de novo.',
  jaEnviado: 'O material já foi enviado.',
  passo: 'Esta etapa não está disponível agora.',
  indisponivel: 'Esta etapa ainda não está disponível.',
  armazem: 'O envio de arquivos está indisponível agora. Tente de novo em instantes.'
});

const soCom = (corpo, chaves) => !!corpo && typeof corpo === 'object' && !Array.isArray(corpo) && Object.keys(corpo).every(k => chaves.includes(k));
const LIVRES = new Set(['servicos', 'provas', 'depoimentos', 'horario', 'bairros', 'endereco']);   /* (o endereço também passa por limparMensagem + redigir: B13) */
/* texto livre: limparMensagem + redigir em cada string (telefone, e-mail e documento viram marcadores) */
function limpar(v) {
  if (typeof v === 'string') { const l = limparMensagem(v); return l ? redigir(l).trim() : ''; }
  if (Array.isArray(v)) return v.map(limpar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x)]));
  return v;
}
const log = (nivel, dados) => console[nivel === 'erro' ? 'error' : 'log'](JSON.stringify({ origem: 'material', nivel, ...dados }));

export function criarAcoesDoMaterial({ banco, visitante, estado, armazem, segredoFreio, requestId, env }) {
  const semArmazem = () => { if (!armazem) throw new Recusa(503, FRASES.armazem); };
  const base = (corpo, vid) => ({ conversa_id: corpo.conversa_id, visitante_id: vid });
  /* passo errado (55000) vira a frase da etapa; o resto sobe como está */
  async function chamar(nome, p) {
    try { return await banco(nome, p); }
    /* passo errado, material já enviado ou sinal estornado (55000): a frase é a da etapa, nunca "já enviado" no estorno */
    catch (e) { if (e instanceof ErroBanco && e.codigo === '55000') throw new Recusa(409, FRASES.passo); throw e; }
  }
  function recusaDoMotivo(motivo, papel) {
    switch (motivo) {
      case 'tamanho': return new Recusa(422, papel === 'logo' ? FRASES.logoGrande : FRASES.fotoGrande);
      case 'fotos': return new Recusa(409, FRASES.limiteFotos);
      case 'logo': return new Recusa(409, FRASES.limiteLogo);
      case 'reservas': return new Recusa(409, FRASES.limiteReservas, { whatsapp: true });
      case 'pedido': return new Recusa(409, FRASES.limitePedido);
      case 'balde': return new Recusa(503, FRASES.balde, { recuperavel: true });
      case 'freio': return new Recusa(429, FRASES.freio);
      case 'numero': return new Recusa(422, FRASES.numero);
      case 'faltam_campos': return new Recusa(409, FRASES.faltam);
      case 'enviando': return new Recusa(409, FRASES.enviando);
      default: return new Recusa(409, FRASES.indisponivel);
    }
  }

  const acoes = {
    async materialSalvar({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id', 'campo', 'valor', 'usar_numero_do_pedido']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      let p;
      if (corpo.usar_numero_do_pedido === true) {
        if (corpo.campo !== 'whatsapp' || corpo.valor !== undefined) throw new Recusa(400, FRASES.campo);
        p = { usar_numero_do_pedido: true };
      } else {
        let valor = corpo.valor === undefined ? null : corpo.valor;
        if (valor !== null && ESQ.CPF_CNPJ.test(JSON.stringify(valor))) throw new Recusa(422, FRASES.cpf);   /* (ANTES de redigir, que trocaria o número por um marcador) */
        if (valor !== null && LIVRES.has(corpo.campo)) valor = limpar(valor);
        const r = ESQ.prepararPatch(corpo.campo, valor, isoNoFuso(new Date()));
        if (!r.ok) throw new Recusa(400, r.erro === 'campo' ? FRASES.campo : FRASES.valor);
        p = r.patch;
      }
      const vid = await visitante(request);
      const r = await chamar('vendas_material_salvar', { ...base(corpo, vid), ...p });
      if (!r.ok) throw recusaDoMotivo(r.motivo);
      return { ok: true };
    },

    async materialReservar({ request, corpo }) {
      semArmazem();
      if (!soCom(corpo, ['conversa_id', 'papel', 'tipo', 'tamanho']) || !ehUuid(corpo.conversa_id) || !['logo', 'foto'].includes(corpo.papel)
        || !Number.isInteger(corpo.tamanho) || corpo.tamanho < 1) throw new Recusa(400, FRASES.conversaInvalida);
      if (!ESQ.LIMITES.tipos.includes(corpo.tipo)) throw new Recusa(422, FRASES.tipo);
      const vid = await visitante(request);
      const chaveIp = chaveDoIp(ipDe(request), segredoFreio, new Date(), 'mat');   /* (o banco põe a hora; só um HMAC chega a ele) */
      const r = await chamar('vendas_material_reservar', { ...base(corpo, vid), papel: corpo.papel, tipo: corpo.tipo, tamanho: corpo.tamanho, chave_ip: chaveIp });
      if (!r.ok) throw recusaDoMotivo(r.motivo, corpo.papel);
      try {
        const link = await armazem.linkDeEnvio(r.caminho);
        return { arquivo_id: r.arquivo_id, url_envio: link.url };
      } catch (e) {
        /* o log leva o tipo do erro e o arquivo_id; nunca o link, o token, o caminho nem a mensagem do armazém */
        log('erro', { request_id: requestId || null, evento: 'link de envio não criado', arquivo_id: r.arquivo_id });
        await banco('vendas_material_remover', { ...base(corpo, vid), arquivo_id: r.arquivo_id }).catch(() => {});
        throw new Recusa(503, FRASES.armazem, { recuperavel: true });
      }
    },

    async materialConferir({ request, corpo }) {
      semArmazem();
      if (!soCom(corpo, ['conversa_id', 'arquivo_id']) || !ehUuid(corpo.conversa_id) || !ehUuid(corpo.arquivo_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const vid = await visitante(request);
      const b = base(corpo, vid);
      const a = await chamar('vendas_material_arquivo', { ...b, arquivo_id: corpo.arquivo_id });
      if (a.ok === false) throw recusaDoMotivo(a.motivo);   /* (o freio da conferência conta na leitura do arquivo, antes de o armazém ser tocado) */
      if (a.status === 'conferido') return { status: 'conferido' };
      if (a.status !== 'reservado') throw new Recusa(409, FRASES.indisponivel);
      let ini, total;
      try {
        ini = await armazem.inicioDoArquivo(a.caminho);
        if (ini) total = ini.total != null ? ini.total : await armazem.tamanhoDoObjeto(a.caminho);
      } catch {
        log('erro', { request_id: requestId || null, evento: 'objeto não lido', arquivo_id: corpo.arquivo_id });
        throw new Recusa(503, FRASES.armazem, { recuperavel: true });
      }
      if (!ini) throw new Recusa(409, FRASES.naoChegou);   /* a linha segue "reservado": a tela tenta de novo */
      const r = await chamar('vendas_material_conferir', { ...b, arquivo_id: corpo.arquivo_id, tipo_real: tipoPorBytes(ini.bytes), tamanho_real: total });
      if (r.status === 'conferido') return { status: 'conferido' };
      if (r.status === 'recusado') {
        await armazem.remover([r.caminho]).catch(() => log('erro', { request_id: requestId || null, evento: 'objeto recusado não removido (a reconciliação apaga)', arquivo_id: corpo.arquivo_id }));
        throw new Recusa(422, r.motivo === 'tipo' ? FRASES.tipo : FRASES.naoEra);
      }
      throw recusaDoMotivo(r.motivo);
    },

    async materialRemover({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id', 'arquivo_id']) || !ehUuid(corpo.conversa_id) || !ehUuid(corpo.arquivo_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const vid = await visitante(request);
      const r = await chamar('vendas_material_remover', { ...base(corpo, vid), arquivo_id: corpo.arquivo_id });
      if (!r.ok) throw new Recusa(404, 'Não encontrado.');
      if (armazem) await armazem.remover([r.caminho]).catch(() => log('erro', { request_id: requestId || null, evento: 'objeto removido da lista, mas não do armazém (a reconciliação apaga)', arquivo_id: corpo.arquivo_id }));
      return { ok: true };
    },

    async materialEnviar({ request, corpo }) {
      if (!soCom(corpo, ['conversa_id']) || !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.conversaInvalida);
      const vid = await visitante(request);
      const est = await estado(vid, corpo.conversa_id);
      const e = est.entrega;
      if (!e) throw new Recusa(409, FRASES.indisponivel);
      if (e.passo !== 'material' || e.material.status !== 'rascunho') throw new Recusa(409, FRASES.jaEnviado);
      const m = e.material;
      const faltas = ESQ.faltas(m);
      if (faltas.length) throw new Recusa(409, FRASES.faltam, { faltas });
      if (m.arquivos.some(a => a.status === 'reservado')) throw new Recusa(409, FRASES.enviando);
      /* o pacote inteiro vale pelas mesmas funções da tela, aqui no servidor (a captação valida de novo na importação) */
      if (ESQ.validarDados(podarDados(m.dados || {}, m.autorizacao || {})).length) throw new Recusa(422, FRASES.valor);
      const agora = new Date();
      const numeroEm = isoNoFuso(agora);
      const prazo = iniciarPrazo({ entrada_em: e.prazo.entrada_em, numero_em: numeroEm });
      const entregaAte = calcularEntregarAte(prazo, { prazoDias: e.prazo_dias }, agora);
      try {
        const r = await chamar('vendas_material_enviar', { ...base(corpo, vid), versao: m.updated_at, agora: agora.toISOString(),
          prazo: { numero_em: numeroEm, conta_desde: prazo.conta_desde }, entrega_ate: entregaAte });
        if (!r.ok) throw recusaDoMotivo(r.motivo);
        return { ok: true, entrega_ate: entregaAte };
      } catch (err) {
        if (err instanceof ErroBanco && err.codigo === '40001') throw new Recusa(409, FRASES.mudou);
        throw err;
      }
    }
  };
  /* o interruptor (M5): desligado, nenhuma ação passa, nem lê o corpo; o estado diz `entrega_ligada: false` */
  return Object.fromEntries(Object.entries(acoes).map(([nome, f]) => [nome, async a => {
    if (!entregaLigada(env)) throw new Recusa(503, FRASE_DESLIGADA, { whatsapp: true });
    return f(a);
  }]));
}
