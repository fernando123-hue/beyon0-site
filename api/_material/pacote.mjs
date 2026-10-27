/* ==========================================================================
   O PACOTE VERSÃO 1 DA TROCA COM A CAPTAÇÃO (PR 3b-2; spec §6; captacao/docs/parte6/para-o-site.md §3 e revisao-pr3b.md I1/I3).
   Duas pastas: `pedido-site/` (pedido.json e formulario.json) e `material/` (SÓ logo.* e foto-NN.*: um JSON a mais ali
   reprova o material inteiro na captação). Aqui só se MONTAM os dois JSON a partir dos dados do banco; quem grava as
   pastas é scripts/entregas.mjs, no PC do dono.
   Regras: lista vazia = campo omitido (nunca []); campo fora de CAMPOS nunca sai; `como_funciona` nunca sai;
   `depoimentos` só com "sim" à pergunta deles; `fotos_com_pessoas: true` só com "Sim" às fotos; nada de CPF/CNPJ.
   ========================================================================== */
import ESQ from '../../js/orcamento-material-esquema.js';
import { isoNoFuso } from './prazo.mjs';

export const VERSAO = 1;
export const PLANOS = Object.freeze({ landing_page: 'landing', institucional: 'institucional' });
/* os ramos do orçamento (os nomes de NOME_RAMO em api/_vendas/catalogo.mjs) → a chave de captacao/config/nichos.json.
   null = a captação decide (hoje há um nicho só). Ao entrar um nicho novo lá, a chave entra aqui, com teste. */
export const RAMOS = Object.freeze({ 'serviços': null, 'saúde': null, 'beleza': null, 'alimentação': null, 'comércio': null, 'educação': null, 'associação': null });
const EXTENSAO = { png: 'png', jpg: 'jpg', webp: 'webp' };

export function ramoDe(segmento) {
  const s = String(segmento || '').trim().toLowerCase();
  return { ramo: Object.hasOwn(RAMOS, s) ? RAMOS[s] : null, saude: s === 'saúde' };
}

export const telefoneE164 = ESQ.telefoneE164;   /* (a mesma conta da tela: js/orcamento-material-esquema.js) */

export function nomesDosArquivos(arquivos) {
  const logo = arquivos.filter(a => a.papel === 'logo').slice(0, 1);
  const fotos = arquivos.filter(a => a.papel === 'foto').sort((a, b) => a.ordem - b.ordem);
  return [
    ...logo.map(a => ({ ...a, nome: 'logo.' + EXTENSAO[a.tipo_real] })),
    ...fotos.map((a, i) => ({ ...a, nome: 'foto-' + String(i + 1).padStart(2, '0') + '.' + EXTENSAO[a.tipo_real] }))
  ];
}

const vazio = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export function podarDados(dados, autorizacao) {
  const saida = {};
  for (const campo of ESQ.CAMPOS_SALVOS) {
    if (vazio(dados[campo])) continue;
    if (campo === 'depoimentos' && !(autorizacao && autorizacao.depoimentos_autorizados === true)) continue;
    saida[campo] = dados[campo];
  }
  if (autorizacao && autorizacao.fotos_com_pessoas === 'sim') saida.fotos_com_pessoas = true;
  return saida;
}

export function montarFormulario({ material, arquivos }) {
  const aut = material.autorizacao || {};
  if (aut.marcada !== true) throw new Error('formulário: sem a caixa de autorização marcada, nada entra');
  if (typeof aut.texto !== 'string' || aut.texto.length < 5 || aut.texto.length > 600) throw new Error('formulário: texto da autorização fora de 5 a 600 caracteres');
  const dados = podarDados(material.dados || {}, aut);
  const problemas = ESQ.validarDados(dados);
  if (!dados.whatsapp) problemas.push('dados: sem o whatsapp dos botões');
  if (problemas.length) throw new Error('formulário: ' + problemas.slice(0, 5).join('; '));
  return {
    versao: VERSAO,
    enviado_em: isoNoFuso(new Date(material.enviado_em)),
    autorizacao: { texto: aut.texto, marcada: true },
    dados,
    arquivos: nomesDosArquivos(arquivos).map(a => a.nome)
  };
}

export function montarPedido({ codigo, negocio, proposta, entradaPagaEm, whatsappContato }) {
  const faltas = [];
  const nome = String(negocio.nome || '').trim(), cidade = String(negocio.cidade || '').trim();
  if (!/^BZ-[A-Z0-9]{5}$/.test(String(codigo))) faltas.push('código do pedido');
  if (!nome) faltas.push('nome do negócio');
  if (!cidade) faltas.push('cidade');
  if (ESQ.UFS.indexOf(negocio.uf) < 0) faltas.push('UF');
  const whatsapp = telefoneE164(whatsappContato);
  if (!whatsapp) faltas.push('WhatsApp de contato');
  const pct = proposta.sinal_percentual;
  if (!Number.isInteger(pct) || pct < 1 || pct > 100 || !(Number(proposta.valor_total) > 0)) faltas.push('valor da entrada');
  if (!proposta.aceita_em || !proposta.escopo) faltas.push('aceite');
  if (!entradaPagaEm) faltas.push('data da entrada paga');
  if (faltas.length) throw new Error('pedido incompleto, falta: ' + faltas.join(', '));
  if (!Object.hasOwn(PLANOS, proposta.formato)) throw new Error('formato sem esteira na captação (' + proposta.formato + '): produção manual');
  /* o prazo da proposta aceita (o que o cliente viu), em dias úteis; a captação só aceita de 5 a 10 */
  const dias = proposta.prazo_dias;
  if (!Number.isInteger(dias) || dias < 5 || dias > 10) throw new Error('prazo da proposta (' + dias + ') fora de 5 a 10 dias úteis: produção manual');
  /* os valores da proposta, em REAIS INTEIROS (preco = entrada + final); a tabela normal, fora das 10 vagas (D6) */
  const preco = Number(proposta.valor_total);
  if (!Number.isInteger(preco)) throw new Error('o total (' + preco + ') não está em reais inteiros: produção manual');
  if ((preco * pct) % 100 !== 0) throw new Error('a entrada de ' + pct + '% sobre ' + preco + ' tem centavos: produção manual (a captação só aceita reais inteiros)');
  const entrada = preco * pct / 100;
  const { ramo, saude } = ramoDe(negocio.segmento);
  /* a captação recusa "saude": true e o ramo de saúde até existir o modelo de saúde (para-o-site.md §6, item 6): o dono resolve à mão */
  if (saude) throw new Error('cliente de saúde: produção manual (a captação ainda não vende para saúde)');
  return {
    versao: VERSAO, codigo,
    negocio: { nome_exibicao: nome, tipo_exibicao: String(negocio.segmento || 'negócio').trim(), cidade, uf: negocio.uf, ...(ramo ? { ramo } : { saude }) },
    plano: PLANOS[proposta.formato],
    valores: { preco, entrada, final: preco - entrada },
    prazo: { dias, contagem: 'uteis' },
    aceite: { em: isoNoFuso(new Date(proposta.aceita_em)), texto: proposta.escopo },
    entrada_paga_em: isoNoFuso(new Date(entradaPagaEm)),
    whatsapp
  };
}
