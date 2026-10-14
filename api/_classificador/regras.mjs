/* ==========================================================================
   ADAPTADOR "REGRAS" — grátis, por TABELA EXPLÍCITA (cada caso escrito e
   testado em docs/testes/classificador.test.mjs). Nada de "um objetivo só →
   landing": a dentista que quer agendamentos precisa de várias páginas.
   ========================================================================== */
import { validarRespostas, resultado } from './contrato.mjs';
import { pareceInjecao } from '../_vendas/seguranca.mjs';

const PAGINAS = { landing_page: 1, institucional: 5, loja_plataforma: 5, sob_medida: 4 };
const NOME_OBJETIVO = { pedidos_whatsapp: 'receber pedidos pelo WhatsApp', achado_google: 'ser achado no Google', agendamentos: 'agendamentos',
  vender_online: 'vender online', apresentar: 'apresentar a empresa', campanha: 'uma campanha' };
const lista = xs => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);

function escolherFormato(objetivos, formatos) {
  if (objetivos.includes('vender_online')) {
    return formatos.includes('loja_plataforma') ? { formato: 'loja_plataforma', alternativa: null, fale_comigo: [] } : { formato: 'institucional', alternativa: null, fale_comigo: ['loja'] };
  }
  if (objetivos.length === 1 && objetivos[0] === 'campanha') return { formato: 'landing_page', alternativa: 'institucional', fale_comigo: [] };
  const cabeLanding = objetivos.length === 1 && objetivos[0] !== 'apresentar';
  return { formato: 'institucional', alternativa: cabeLanding ? 'landing_page' : null, fale_comigo: [] };
}

function motivo(formato, objetivos) {
  if (formato === 'loja_plataforma') return 'Você quer vender online: uma loja numa plataforma pronta, com a cara da sua marca, recebe os pedidos e os pagamentos.';
  if (formato === 'landing_page') return 'Para uma campanha, uma página só, focada no pedido, resolve e custa menos.';
  const destino = objetivos.includes('agendamentos') ? 'marcar o horário' : objetivos.includes('pedidos_whatsapp') ? 'chamar no WhatsApp' : 'entrar em contato';
  const quer = objetivos.length ? 'Você quer ' + lista(objetivos.map(o => NOME_OBJETIVO[o])) + ': u' : 'U';
  return quer + 'm site com várias páginas apresenta o seu negócio e leva o cliente até ' + destino + '.';
}

/* a TRIAGEM do pedido (spec §4 e §8, etapa B): texto que parece tentativa de dar ordem vira selo no painel.
   Só marca; não bloqueia nada (o dono lê antes de produzir) */
function triar(tarefa, { textos }) {
  const lista = Array.isArray(textos) ? textos.filter(t => typeof t === 'string') : [];
  return resultado(tarefa, 'regras', { suspeito: lista.some(t => pareceInjecao(t)) });
}

export function regras(tarefa, entrada) {
  if (tarefa === 'triar_pedido') return triar(tarefa, entrada || {});
  const { respostas, formatos } = entrada || {};
  const v = validarRespostas(respostas);
  if (v.erros) return resultado(tarefa, 'regras', { erros: v.erros });
  const r = v.dados;
  const f = escolherFormato(r.objetivos, formatos || []);
  const adicionais = r.objetivos.includes('agendamentos') && f.formato !== 'landing_page' ? { agendamento: 1 } : {};
  const sugestoes = r.material === 'nao' ? [{ chave: 'textos', qtd: PAGINAS[f.formato] }] : [];
  return resultado(tarefa, 'regras', { formato: f.formato, alternativa: f.alternativa, fale_comigo: f.fale_comigo, adicionais, sugestoes, motivo: motivo(f.formato, r.objetivos), assumido: r.assumido, respostas: r });
}
