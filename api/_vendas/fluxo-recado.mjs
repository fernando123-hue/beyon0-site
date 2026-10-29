/* ==========================================================================
   O RECADO (passo 1 do "Site sem WhatsApp", decisão do dono de 28/10): o ÚNICO lugar de feedback do site. Uma ação:
   • recado: texto (1 a 1.000 caracteres DIGITADOS) e e-mail opcional (para a resposta). Sem sessão: quem não conseguiu abrir o orçamento
     também precisa poder deixar um recado, então esta é a saída de TODAS as recusas e não depende de Auth nem de IA. A fronteira
     (api/vendas.mjs) já passou o anti-robô e o limite geral; aqui entram o freio por IP (em memória e o do banco, por hora) e o teto do dia (banco).
   • A conversa vai só como REFERÊNCIA e só se a pessoa mandou o token da sessão do orçamento e a conversa é dela; token inválido, vencido ou
     Auth fora do ar NUNCA recusam o recado: ele grava sem ligação.
   • O texto livre NÃO leva contato: telefone, e-mail e números soltos viram marcador (a resposta sai pelo campo de e-mail); CPF/CNPJ é recusado.
   • O texto nunca vai para o log. A resposta não devolve id.
   O lado do dono (lista e "lido") está em api/painel.mjs.
   ========================================================================== */
import { Recusa } from './recusa.mjs';
import { ehUuid } from '../_valida-app.mjs';
import { redigir, semInvisiveis } from './seguranca.mjs';
import { criarFreio, ipDe } from '../_freio.mjs';
import { chaveDoIp } from './ip.mjs';
import { tokenDe } from '../_supabase.mjs';
import { ORG } from './org.mjs';
import ESQ from '../../js/orcamento-material-esquema.js';

export const MAX_RECADO = 1000;
/* os rótulos de onde a pessoa estava; qualquer outro valor é ignorado (o recado vale mais que o rótulo) */
export const ORIGENS_RECADO = Object.freeze(['inicio', 'sites', 'automacao', 'orcamento', 'consultor', 'condicoes', 'privacidade', 'resumo', 'outra']);
export const FRASES = Object.freeze({
  invalido: 'Recado inválido. Confira e tente de novo.',
  texto: 'Escreva o seu recado (de 1 a 1.000 caracteres).',
  cpf: 'Não escreva CPF nem CNPJ no recado. Se precisar de resposta, deixe só o e-mail no campo próprio.',
  email: 'O e-mail não parece certo. Confira (ex.: nome@empresa.com.br) ou deixe o campo vazio.',
  freio: 'Você já deixou vários recados nesta hora. Tente de novo mais tarde.',
  cheio: 'Estamos recebendo muitos recados agora. Tente de novo mais tarde.'
});
const CHAVES = ['texto', 'email', 'origem', 'conversa_id', 'turnstile'];
const USO_IP = 'recado';   /* o "uso" da chave do IP: o contador do recado não divide com o do consultor nem o dos pedidos */
const freioRecado = criarFreio({ max: 10, janelaMs: 60 * 60e3 });   /* por instância, como os outros; o do banco (5 por hora) é o que vale de verdade */

const soCom = (corpo, chaves) => !!corpo && typeof corpo === 'object' && !Array.isArray(corpo) && Object.keys(corpo).every(k => chaves.includes(k));
/* controles (menos tabulação e quebra de linha) e, por semInvisiveis, os caracteres de formato, o uso privado e o substituto solto */
const CONTROLES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const limpar = s => semInvisiveis(s.replace(CONTROLES, '')).trim();
const unirQuebras = s => s.replace(/\s*\n\s*/g, '\n');   /* (linhas em branco entre os dígitos escondiam um telefone da redação) */
const cortar = (s, max) => [...s].slice(0, max).join('');

/* o texto pronto para guardar, ou a Recusa com a frase certa */
function textoDoRecado(bruto) {
  if (typeof bruto !== 'string') throw new Recusa(422, FRASES.texto);
  const limpo = limpar(bruto);
  if (!limpo || [...limpo].length > MAX_RECADO) throw new Recusa(422, FRASES.texto);
  if (ESQ.CPF_CNPJ.test(limpo)) throw new Recusa(422, FRASES.cpf);   /* (ANTES de redigir, que trocaria o número por um marcador) */
  const texto = cortar(redigir(unirQuebras(limpo)).trim(), MAX_RECADO).trim();
  if (!texto) throw new Recusa(422, FRASES.texto);
  return texto;
}

function emailDoRecado(bruto) {
  if (bruto === undefined || bruto === null) return null;
  if (typeof bruto !== 'string') throw new Recusa(422, FRASES.email);
  const c = ESQ.contatoDoSite('', bruto);
  if (!c.ok) throw new Recusa(422, FRASES.email);
  return c.email;
}

export function criarAcoesDoRecado({ banco, visitantes, segredoFreio }) {
  /* o visitante da sessão do orçamento, se houver; qualquer problema (sem token, vencido, Auth fora) = sem ligação */
  async function visitanteSeHouver(request) {
    if (!tokenDe(request)) return null;
    try { return (await visitantes.quem(request)) || null; }
    catch (e) { console.error(JSON.stringify({ origem: 'vendas', nivel: 'aviso', evento: 'recado: sessão não conferida, segue sem ligação', erro: e && e.name })); return null; }
  }

  return {
    async recado({ request, corpo }) {
      if (!soCom(corpo, CHAVES)) throw new Recusa(400, FRASES.invalido);
      const texto = textoDoRecado(corpo.texto);
      const email = emailDoRecado(corpo.email);
      if (corpo.conversa_id !== undefined && corpo.conversa_id !== null && !ehUuid(corpo.conversa_id)) throw new Recusa(400, FRASES.invalido);
      const origem = ORIGENS_RECADO.includes(corpo.origem) ? corpo.origem : null;
      const ip = ipDe(request);
      if (freioRecado(ip)) throw new Recusa(429, FRASES.freio);
      const visitante = corpo.conversa_id ? await visitanteSeHouver(request) : null;
      const r = await banco('vendas_recado_criar', {
        org_slug: ORG, texto, email, origem, chave_ip: chaveDoIp(ip, segredoFreio, new Date(), USO_IP),
        ...(visitante ? { conversa_id: corpo.conversa_id, visitante_id: visitante } : {})
      });
      if (!r || r.ok !== true) throw new Recusa(r && r.motivo === 'cheio' ? 503 : 429, r && r.motivo === 'cheio' ? FRASES.cheio : FRASES.freio);
      return { ok: true };
    }
  };
}
