/* ==========================================================================
   A CONFERÊNCIA DOS MODELOS EM NICHO REGULADO (docs/superpowers/specs/2026-11-15-nicho-regulado-design.md §6). Saúde e advocacia
   vendem pelo site como qualquer ramo (decisão do dono, 15/11); a proteção principal é esta conferência DETERMINÍSTICA de cada modelo
   gerado, antes de ele aparecer: um modelo fora da regra do conselho nunca aparece (a geração refaz uma vez; falhou de novo, "falhou").
   As regras vêm das normas lidas em fonte oficial em 15/11/2026 (a tabela e os links estão na spec §3). Na dúvida, falha: um falso
   positivo custa refazer; um falso negativo põe a Beyon em risco com o conselho. Puro (sem rede nem relógio: a data entra por parâmetro).
   conferirDirecao(direcao, nicho, { hoje }) -> { ok, falhas: [{ regra, caminho }] }   (nunca o texto: ele volta ao modelo)
   ========================================================================== */
import { paraBusca } from './zero.mjs';
import { textosDe } from './varredura.mjs';
import { CONSELHOS, MARCADOR_REGISTRO } from './regras-conselhos.mjs';
export { CONSELHOS, MARCADOR_REGISTRO };

/* o CFN libera o preço a partir de 23/01/2027 (Res. CFN 856/2026, art. 68; o início adiado pela Res. 858/2026) */
const CFN_PRECO_DESDE = '2027-01-23';

const re = (...partes) => new RegExp('\\b(?:' + partes.join('|') + ')\\b');
/* SAÚDE: as regras comuns (CFO, CFM, COFFITO, CFP, CFN, CFBM; spec §3) */
const PROMESSA = re('(?<!(?:sigilo|privacidade|confidencialidade|discricao) )garantid[oa]s?', 'garantimos(?! (?:o |a |seu |sua )?(?:sigilo|privacidade|confidencialidade|discricao))', 'garante a cura', 'cura garantida', 'garantia de resultado', 'resultado garantido', 'infalivel', 'sem dor', 'milagros[oa]s?', 'milagre', 'revolucionari[oa]s?', 'cura definitiva');
/* (o "%" não é letra: o \b não cabe depois dele) */
const CEM_POR_CENTO = /\b100 ?%/;
/* (medição com a IA real, 15/11: todo "superlativo" que derrubou um modelo era agenda, "o melhor horário", "o melhor dia", "o melhor canal";
   a escolha da pessoa não é autopromoção) */
const ESCOLHA_DA_PESSOA = '(?! (?:horario|dia|periodo|momento|canal|forma|formato|data|caminho|opcao|jeito|maneira|hora|turno|local|meio|contato)s?\\b)';
const SUPERLATIVO = re('[oa]s? melhor(?:es)?' + ESCOLHA_DA_PESSOA, 'o unico', 'a unica', 'numero 1', 'n 1', 'top 1', 'referencia (?:em|no|na|da|do)', 'lider(?:es)? (?:em|no|na)', 'mais experiente');
const GRATIS = re('gratis', 'gratuit[oa]s?', 'sorteio', 'sorteamos', 'brindes?', 'cupom', 'cupons', 'de graca');
const URGENCIA = re('ultimas vagas', 'ultimo dia', 'so hoje', 'apenas hoje', 'corra', 'nao perca', 'por tempo limitado', 'vagas limitadas');
const ANTES_DEPOIS = re('antes e depois', 'antes depois', 'depoimentos?', 'relatos? de pacientes?', 'o que nossos pacientes dizem', 'avaliacoes de pacientes');
/* preço, valor e forma de pagamento (no texto busca o "R$" some: ele é conferido no texto cru) */
/* ("nossos valores", "a partir de hoje" e "valor" solto ficam de fora: são falso positivo comum; o "R$" e os números com reais vão pelo texto cru) */
const PRECO = re('precos?', 'valor(?:es)? (?:da|das|do|dos|de) (?:consulta|sessao|sessoes|procedimento|tratamento|avaliacao|atendimento)', 'tabela de valores', 'parcel\\w*', 'pix', 'cartao de credito', 'formas? de pagamento', 'honorarios?', 'investimento de', 'custa(?:m)?');
/* (revisão: "RS" sem o cifrão era a UF do Rio Grande do Sul na própria linha do registro, OAB/RS e CRO-RS; só o "R$" e "reais") */
const DINHEIRO_CRU = /R\$|\d+\s?reais\b/i;
const DESCONTO = re('descontos?', 'promoc(?:ao|oes)', 'promocional', 'oferta especial', 'pacote promocional');
const POPULAR = re('popular(?:es)?');
const CFP_VALOR = re('preco social', 'valor acessivel', 'valores acessiveis', 'pacotes?');
/* ADVOCACIA (Prov. 205/2021; CED arts. 39 a 47) */
const OAB_RESULTADO = re('ganhamos', 'causas? ganhas?', 'vitorias?', 'sentencas? favorave(?:l|is)', 'garantimos(?! (?:o |a |seu |sua )?(?:sigilo|privacidade|confidencialidade|discricao))', '(?<!(?:sigilo|privacidade|confidencialidade|discricao) )garantid[oa]s?', 'indenizac(?:ao|oes) de', 'exito garantido', 'sucesso garantido', 'resultados? (?:garantid|comprovad|expressiv)\\w*');
const OAB_CLIENTES = re('nossos clientes', 'clientes atendidos', 'clientes satisfeitos', 'depoimentos?', 'casos de sucesso');
const OAB_INCITA = re('entre com (?:sua|a) acao', 'nao perca (?:seu|o seu) direito', 'ultimo dia', 'processe', 'acione (?:agora|ja)', 'corra');
const OAB_GRATIS = re('consulta gratuita', 'consulta gratis', 'parcelamos', 'descontos?', 'gratis', 'gratuit[oa]s?');
/* as seções que não entram num modelo regulado (prévia, sem paciente nem cliente reais; spec §3, escolha de projeto) */
const SECOES_FORA = new Set(['depoimentos', 'numeros']);

function precoProibido(chave, hoje) {
  if (chave === 'medicina') return false;   /* (CFM 2.336/2023, art. 9º, VI: o valor da consulta pode) */
  if (chave === 'nutricao' && String(hoje || '') >= CFN_PRECO_DESDE) return false;
  return true;
}
/* a linha de identificação (nome + sigla + número, ou o marcador): o rodapé ou uma seção de contato tem a sigla do registro */
function temIdentificacao(direcao, nicho) {
  const sigla = String(nicho.registro || '').toLowerCase();
  const onde = [direcao?.rodape?.texto, ...((direcao?.secoes || []).filter(s => s && (s.tipo === 'contato' || s.tipo === 'sobre')).flatMap(s => textosDe(s).map(t => t.texto)))];
  return onde.some(t => {
    const s = String(t || '');
    if (s.includes(MARCADOR_REGISTRO)) return true;
    const b = paraBusca(s);
    return (sigla === 'registro' || sigla === 'conselho') ? /\b(?:cro|crm|crefito|crp|crn|crbm|crfa|coren)\b/.test(b) : new RegExp('\\b' + sigla + '\\b').test(b);
  });
}

/* nicho: { chave } (ou a própria chave). Devolve as falhas com o caminho (seções pelo índice) e a regra */
export function conferirDirecao(direcao, nichoOuChave, { hoje = '' } = {}) {
  const chave = typeof nichoOuChave === 'string' ? nichoOuChave : nichoOuChave?.chave;
  const nicho = Object.hasOwn(CONSELHOS, String(chave)) ? { chave, ...CONSELHOS[chave] } : null;
  if (!nicho) return { ok: true, falhas: [] };
  const falhas = [], viu = new Set();
  const falha = (regra, caminho) => { const k = regra + '|' + caminho; if (!viu.has(k)) { viu.add(k); falhas.push({ regra, caminho }); } };
  (direcao?.secoes || []).forEach((s, i) => { if (s && SECOES_FORA.has(s.tipo)) falha('secao_' + s.tipo, 'secoes[' + i + ']'); });
  const saude = nicho.tipo === 'saude', oab = nicho.tipo === 'advocacia';
  /* (medição, 15/11) só o que vai ao SITE: o resumo e o nome do conceito descrevem o modelo na tela da Beyon, e o modelo explica ali a
     norma ("a OAB não permite depoimentos"), o que não é publicidade do profissional */
  for (const { caminho, texto } of textosDe({ navegacao: direcao?.navegacao, secoes: direcao?.secoes, rodape: direcao?.rodape })) {
    if (/\.tipo$|\.variante$/.test(caminho)) continue;
    const b = paraBusca(String(texto).replace(/(?<=(?:^|[^\p{L}])\p{L})[.\-_*·•|/](?=\p{L}(?:[^\p{L}]|$))/gu, ' '));
    if (!b) continue;
    if (saude) {
      if (PROMESSA.test(b) || CEM_POR_CENTO.test(b)) falha('promessa', caminho);
      if (SUPERLATIVO.test(b)) falha('superlativo', caminho);
      if (GRATIS.test(b)) falha('gratis_sorteio', caminho);
      if (URGENCIA.test(b)) falha('urgencia', caminho);
      if (ANTES_DEPOIS.test(b)) falha('antes_depois_depoimento', caminho);
      if (precoProibido(nicho.chave, hoje) && (PRECO.test(b) || DINHEIRO_CRU.test(texto))) falha('preco', caminho);
      if (['psicologia', 'nutricao', 'saude_generica'].includes(nicho.chave) && DESCONTO.test(b)) falha('desconto', caminho);
      if (nicho.chave === 'odontologia' && POPULAR.test(b)) falha('popular', caminho);
      if (nicho.chave === 'psicologia' && CFP_VALOR.test(b)) falha('valor_social', caminho);
    }
    if (oab) {
      if (PRECO.test(b) || DINHEIRO_CRU.test(texto) || OAB_GRATIS.test(b)) falha('honorarios', caminho);
      if (OAB_RESULTADO.test(b) || PROMESSA.test(b) || CEM_POR_CENTO.test(b)) falha('resultado', caminho);
      if (SUPERLATIVO.test(b)) falha('superlativo', caminho);
      if (OAB_CLIENTES.test(b)) falha('clientes', caminho);
      if (OAB_INCITA.test(b)) falha('incitacao', caminho);
    }
  }
  if (!temIdentificacao(direcao, nicho)) falha('identificacao', 'rodape.texto');
  return { ok: falhas.length === 0, falhas };
}

/* as falhas em frases curtas para o modelo refazer (só caminho e regra, nunca o texto dele; como errosParaModelo do mapa) */
const REGRA = {
  secao_depoimentos: 'tire a seção de depoimentos (não cabe neste ramo)',
  secao_numeros: 'tire a seção de números (resultado em número não cabe neste ramo)',
  promessa: 'promete ou garante resultado: tire',
  superlativo: 'superlativo ou comparação ("o melhor", "o único", "referência"): tire',
  gratis_sorteio: 'gratuidade, sorteio, brinde ou cupom: tire',
  urgencia: 'urgência ou medo ("últimas vagas", "só hoje"): tire',
  antes_depois_depoimento: 'antes e depois ou depoimento: tire',
  preco: 'preço, valor ou forma de pagamento: tire (a norma deste conselho não deixa)',
  desconto: 'desconto ou promoção: tire',
  popular: 'a palavra "popular": tire',
  valor_social: '"preço social", "valor acessível" ou pacote: tire',
  honorarios: 'honorários, valores, gratuidade ou desconto: tire (Provimento 205/2021)',
  resultado: 'resultado, vitória ou decisão: tire (Provimento 205/2021)',
  clientes: 'clientes, casos ou depoimentos: tire',
  incitacao: 'incentiva a entrar com ação ou cria urgência: tire',
  identificacao: 'falta a linha de identificação no rodapé: nome, profissão, sigla do conselho e o número (ou ' + MARCADOR_REGISTRO + ')'
};
export function falhasParaModelo(falhas) {
  return (falhas || []).slice(0, 8).map(f => f.caminho + ': ' + (Object.hasOwn(REGRA, f.regra) ? REGRA[f.regra] : 'fora da regra do conselho'));
}
