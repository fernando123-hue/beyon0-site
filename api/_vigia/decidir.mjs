/* ==========================================================================
   O VIGIA — A DECISÃO (spec docs/superpowers/specs/2026-11-15-auto-reparo-design.md). Funções puras, sem rede nem banco.
   achadosDe: o que está quebrado agora (texto fixo do item, ou null).
   decidir: com o estado guardado (app.vigia), o que entra no e-mail desta ronda e o que se grava:
     • quebrou agora → avisa; continua quebrado → avisa de novo só depois de 24 h; voltou depois de avisado → "voltou";
     • `noEmail: true` marca o item que gerou linha: se o e-mail não sair, ele NÃO é gravado e a ronda seguinte repete.
   decidirSemBanco: banco fora = sem memória → regra fixa de horário (D3).
   Os textos são fixos: o único número é uma contagem. Nada do cliente, nada de valor de configuração.
   ========================================================================== */
const H = 3600e3;
const LEMBRAR_MS = 24 * H;
const PRAZO_RECONCILIACAO_MS = 6.5 * H;   /* roda de 3 em 3 h: duas seguidas perdidas */
const PRAZO_DIARIA_MS = 26 * H;
const MIN_FALHAS_IA = 3;
const MIN_CONVERSAS_IA = 2;
const HORAS_SEM_BANCO = new Set([1, 7, 13, 19]);   /* UTC; todas fora das horas da reconciliação (múltiplas de 3) */
const SEM_BANCO_INTERVALO_MS = 23 * H;           /* (23, não 24: a ronda do dia seguinte cai no mesmo minuto) */

export const ESTREIA = 'O vigia do site está ligado. Ele confere o site ao longo do dia e só escreve quando algo quebra ou volta ao normal.';
export const BANCO_FORA = 'URGENTE: o banco de dados do site não responde. O orçamento e o Zero ficam fora do ar até ele voltar.';
export const SEM_MEMORIA = 'O vigia do site está sem a tabela dele no banco: falta aplicar a atualização do banco do vigia (migration 20261115120000_vigia). Até lá ele confere só as páginas e a configuração.';

const ROTULOS_CONFIGURACAO = { supabase: 'banco de dados', anthropic: 'chave da IA', cron: 'segredo das rotinas', pagamentos: 'pagamentos' };

/* a ordem é a do e-mail: o mais grave primeiro */
export const ITENS = Object.freeze({
  ia_conta: { quebrou: 'URGENTE: a IA recusou a conta (crédito, chave ou modelo). O Zero não consegue conversar até isso ser resolvido.', voltou: 'Voltou ao normal: a conta da IA.' },
  paginas: { quebrou: 'URGENTE: páginas do site não abriram na conferência automática.', voltou: 'Voltou ao normal: as páginas do site.' },
  configuracao: { quebrou: 'URGENTE: falta configuração no servidor do site:', voltou: 'Voltou ao normal: a configuração do servidor.' },
  pagamentos: { quebrou: 'A conferência automática dos pagamentos não roda há mais de 6 horas.', voltou: 'Voltou ao normal: a conferência dos pagamentos.' },
  alertas_urgentes: { quebrou: 'alertas urgentes no painel esperando você.', voltou: null },   /* quem resolve é o dono, no painel */
  ia_falhando: { quebrou: 'A IA está falhando nas conversas (demora ou erro do provedor). O Zero pode não estar respondendo.', voltou: 'Voltou ao normal: a IA nas conversas.' },
  rotina_diaria: { quebrou: 'A rotina diária do site (limpezas e alarmes de prazo) não roda há mais de um dia.', voltou: 'Voltou ao normal: a rotina diária.' }
});

const ms = iso => (iso ? Date.parse(iso) : NaN);
const depois = (a, b) => Number.isFinite(ms(a)) && (!Number.isFinite(ms(b)) || ms(a) > ms(b));
const iso = t => new Date(t).toISOString();

function textoConfiguracao(nomes) {
  return ITENS.configuracao.quebrou + ' ' + nomes.map(n => ROTULOS_CONFIGURACAO[n] || 'outro item').join(', ') + '.';
}
const textoUrgentes = n => (n === 1 ? 'Há 1 alerta urgente no painel esperando você.' : 'Há ' + n + ' ' + ITENS.alertas_urgentes.quebrou);

/* leitura = app.rotinas_vigia_ler; conferencias = conferir() (a chave recusada pela Anthropic vale como a conta da IA recusada) */
export function achadosDe(leitura, conferencias, agora) {
  const estreia = Number.isFinite(ms(leitura.estreia_em)) ? ms(leitura.estreia_em) : agora;
  const parado = (ultima, prazo) => agora - Math.max(Number.isFinite(ms(ultima)) ? ms(ultima) : -Infinity, estreia) > prazo;
  const iaAtiva = leitura.estado?.ia_falhando?.ativo === true;
  const iaNova = leitura.falhas_ia_hora >= MIN_FALHAS_IA && leitura.conversas_falha_hora >= MIN_CONVERSAS_IA;
  const iaSemProvaDeVolta = iaAtiva && !depois(leitura.ultima_ok_ia_em, leitura.ultima_falha_ia_em);
  const urgentes = Number(leitura.urgentes) || 0;
  return {
    /* LIMITE CONHECIDO: a chave recusada alarma pela conferência, mas o alarme só limpa quando uma conversa de verdade dá certo
       (ultima_ok_ia_em); a pergunta gratuita aceita a chave e não prova crédito nem modelo, então ela não limpa sozinha */
    ia_conta: depois(leitura.ultima_falha_conta_em, leitura.ultima_ok_ia_em) || conferencias.chaveIaRecusada === true ? ITENS.ia_conta.quebrou : null,
    paginas: conferencias.paginas ? null : ITENS.paginas.quebrou,
    configuracao: conferencias.configuracao.length ? textoConfiguracao(conferencias.configuracao) : null,
    pagamentos: conferencias.pagamentosLigados && parado(leitura.ultima_reconciliacao_em, PRAZO_RECONCILIACAO_MS) ? ITENS.pagamentos.quebrou : null,
    alertas_urgentes: urgentes > 0 ? textoUrgentes(urgentes) : null,
    ia_falhando: iaNova || iaSemProvaDeVolta ? ITENS.ia_falhando.quebrou : null,
    rotina_diaria: parado(leitura.ultima_diaria_em, PRAZO_DIARIA_MS) ? ITENS.rotina_diaria.quebrou : null
  };
}

const PARADO = Object.freeze({ ativo: false, desde: null, avisado_em: null, detalhe: null });

export function decidir(estado, achados, agora) {
  const linhas = [], itens = [];
  if (!estado.estreia) {
    linhas.push(ESTREIA);
    itens.push({ item: 'estreia', ativo: false, desde: iso(agora), avisado_em: iso(agora), detalhe: null, noEmail: true });
  }
  for (const item of Object.keys(ITENS)) {
    const texto = achados[item] || null;
    const antes = estado[item] || PARADO;
    if (texto) {
      /* o texto mudou (ex.: de 1 para 5 alertas urgentes, ou falta mais um item de configuração) é novidade: avisa já */
      const lembrar = !antes.ativo || !Number.isFinite(ms(antes.avisado_em)) || agora - ms(antes.avisado_em) >= LEMBRAR_MS || antes.detalhe !== texto;
      if (!lembrar) continue;   /* continua quebrado do mesmo jeito e já avisado há pouco: nada muda */
      linhas.push(texto);
      itens.push({ item, ativo: true, desde: antes.ativo && antes.desde ? antes.desde : iso(agora), avisado_em: iso(agora), detalhe: texto, noEmail: true });
    } else if (antes.ativo) {
      const avisar = !!antes.avisado_em && !!ITENS[item].voltou;
      if (avisar) linhas.push(ITENS[item].voltou);
      itens.push({ item, ativo: false, desde: null, avisado_em: null, detalhe: null, noEmail: avisar });
    }
  }
  return { linhas, itens };
}

/* sem memória (banco fora, sem banco configurado, migration do vigia ausente): a linha principal + as que o Worker conferiu
   sozinho (páginas, configuração), só nas horas fixas e no máximo uma vez a cada 23 h no mesmo isolado */
export function decidirSemBanco(agora, memoria, outras = [], principal = BANCO_FORA) {
  if (!HORAS_SEM_BANCO.has(new Date(agora).getUTCHours())) return [];
  const ultimo = memoria.get('banco');
  if (ultimo !== undefined && agora - ultimo < SEM_BANCO_INTERVALO_MS) return [];
  return [principal, ...outras];
}
/* só depois que o e-mail saiu: se ele falhar, a próxima ronda no horário tenta de novo */
export const lembrarSemBanco = (memoria, agora) => memoria.set('banco', agora);
