/* ==========================================================================
   A LEITURA DO CASO (o radar "Como lemos o seu caso"; spec §3, plano "PR 2d-ligação").
   • ferramentaLeitura(): o esquema FECHADO de `ler_caso`, montado das listas da forma (js/orcamento-planta-forma.js), com a descrição que manda o quando e o como.
   • validarLeitura(bruto, { mensagensDoVisitante, regulado, anterior }): a GRAVAÇÃO. Forma (módulo comum: exatamente os 5 eixos, sem repetir) + lista dura e as dez
     travas sobre a evidência + ÂNCORA (a evidência tem de aparecer LITERALMENTE numa mensagem do visitante, ou ser a que a leitura anterior já tinha ancorado) e SÓ
     REBAIXA: nenhum nível sai acima do que o modelo disse. Evidência recusada (número, marca, promessa, sem âncora...) é descartada e o nível cai um degrau; deixou_claro
     sem evidência vira comentou; comentou sem evidência vira nao_falou; nao_falou nunca leva evidência. Nunca lança.
   • montarLeitura(briefing, { regulado }): a LEITURA do `estado`. Forma + lista dura, SEM reaplicar a âncora (a retenção apaga as mensagens; a leitura guardada vale
     como gravada). Inválida: some (null), nunca vira nota inventada. É a função que o estado já usava (leituraParaTela, em planta.mjs, é este mesmo código).
   • resolverLeitura: o que o agente chama para a ferramenta (uma leitura aceita por turno; forma errada volta ao modelo uma vez; inválida nunca muda o que já está).
   O briefing guarda `leitura = { eixos: [5] }`; só este módulo (depois do validador) escreve nessa chave: atualizar_briefing descarta chave desconhecida.
   ========================================================================== */
import F from '../../js/orcamento-planta-forma.js';
import { normalizarTexto, textoDoPlanoPermitido } from './planta-textos.mjs';

export const NOME_LEITURA = 'ler_caso';

const ORDEM = Object.freeze({ nao_falou: 0, comentou: 1, deixou_claro: 2 });
const DEGRAU_ABAIXO = Object.freeze({ deixou_claro: 'comentou', comentou: 'nao_falou', nao_falou: 'nao_falou' });
const MENSAGENS_MAX = 80;          /* quantas falas do visitante entram na conta (a janela do banco é de 60 mensagens, metade delas dele) */
const MENSAGEM_MAX_CARACTERES = 2100;
const EVIDENCIA_MIN_LETRAS = 8, EVIDENCIA_MIN_PALAVRAS = 2;   /* "a" estaria em qualquer mensagem: o trecho que ancora tem de dizer alguma coisa */
const ERROS_AO_MODELO_MAX = 6;
const PONTAS = /^[\s.,;:!?"“”'’‘()…\-–—]+|[\s.,;:!?"“”'’‘()…\-–—]+$/gu;

/* ---------- a ferramenta ---------- */
const DESCRICAO = 'Registra no painel, abaixo do preço, o radar "Como lemos o seu caso": o que a pessoa já contou sobre cinco assuntos. ' +
  'Chame UMA vez por turno, na mesma volta do atualizar_briefing, quando a mensagem dela trouxe informação nova sobre o caso; sem informação nova, não chame. ' +
  'Mande sempre os cinco eixos: volume (quanta procura ou movimento ela disse ter), repeticao (tarefas e perguntas que se repetem), urgencia (pressa que ela mostrou), ' +
  'pessoas (quanto do atendimento hoje depende de alguém estar ali) e informacao (onde estão os dados dela: caderno, mensagens, planilhas, cabeça). ' +
  'O nível vale só pelo que a PESSOA escreveu, nunca pelo que você acha do negócio dela: nao_falou (ainda não tocou no assunto), comentou (citou de passagem) ou deixou_claro (disse com todas as letras). ' +
  'Na dúvida, comentou; sem nada, nao_falou e sem evidencia. ' +
  'Para comentou e deixou_claro mande a evidencia: um trecho curto (até 60 caracteres, duas palavras ou mais) copiado LITERAL de uma mensagem dela, nas palavras dela, sem número, sem preço, sem prazo e sem marca. ' +
  'O código procura o trecho nas mensagens dela; se não achar, a evidência sai e o nível desce. ' +
  'Se o BRIEFING já traz leitura_atual, reenvie os cinco eixos: mantenha o que continua valendo e atualize o que mudou. ' +
  'Resultado: ok com no_painel, a leitura já está na tela (não comente a leitura no texto, siga a conversa); ok false com erros: corrija e chame de novo UMA vez.';

const ESQUEMA_LEITURA = { type: 'object', additionalProperties: false, required: ['eixos'], properties: {
  eixos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['eixo', 'nivel'], properties: {
    eixo: { type: 'string', enum: [...F.EIXOS] }, nivel: { type: 'string', enum: [...F.NIVEIS] }, evidencia: { type: 'string' } } } } } };

/* a ferramenta (nova a cada chamada: quem a recebe pode mexer) */
export function ferramentaLeitura() {
  return { name: NOME_LEITURA, description: DESCRICAO, input_schema: JSON.parse(JSON.stringify(ESQUEMA_LEITURA)) };
}

/* ---------- a âncora ---------- */
const chave = t => normalizarTexto(t).toLowerCase();
const palavras = t => (t.match(/\p{L}+/gu) || []).length;
const aparar = t => String(t).replace(PONTAS, '');

/* as falas do visitante prontas para a busca (só texto, no máximo MENSAGENS_MAX, as mais recentes) */
function falasDoVisitante(lista) {
  if (!Array.isArray(lista)) return [];
  const texto = [];
  for (const m of lista.slice(-MENSAGENS_MAX)) if (typeof m === 'string') texto.push(chave(m.slice(0, MENSAGEM_MAX_CARACTERES)));
  return texto;
}
/* a evidência que a leitura anterior já tinha ancorado, por eixo (já passou pela gravação uma vez) */
function evidenciasAnteriores(anterior) {
  const por = {};
  if (!anterior) return por;
  const f = F.validarFormaLeitura(anterior);
  if (!f.ok) return por;
  for (const e of f.leitura.eixos) if (e.nivel !== 'nao_falou' && typeof e.evidencia === 'string') por[e.eixo] = chave(e.evidencia);
  return por;
}

/* um eixo: devolve { nivel, evidencia?, rebaixo? } */
function julgar(item, { falas, anteriores, regulado }) {
  const baixar = motivo => ({ nivel: DEGRAU_ABAIXO[item.nivel], rebaixo: { eixo: item.eixo, de: item.nivel, para: DEGRAU_ABAIXO[item.nivel], motivo } });
  if (item.nivel === 'nao_falou') return { nivel: 'nao_falou' };
  if (typeof item.evidencia !== 'string') return baixar('sem_evidencia');
  const r = textoDoPlanoPermitido(aparar(item.evidencia), { regulado, travas: true, primeiraPessoa: true });
  if (!r.ok) return baixar('evidencia_' + r.motivo);
  if (r.texto.length < EVIDENCIA_MIN_LETRAS || palavras(r.texto) < EVIDENCIA_MIN_PALAVRAS) return baixar('curta');
  const k = chave(r.texto);
  if (!(anteriores[item.eixo] === k || falas.some(f => f.includes(k)))) return baixar('sem_ancora');
  return { nivel: item.nivel, evidencia: r.texto };
}

/* A GRAVAÇÃO. Devolve { ok: true, leitura, rebaixados: [{ eixo, de, para, motivo }] } ou { ok: false, motivos, erros } (forma errada: nada é consertado) */
export function validarLeitura(bruto, ctx) {
  try {
    let falas = [], regulado = false, anterior = null;
    try { falas = falasDoVisitante(ctx && ctx.mensagensDoVisitante); regulado = !!(ctx && ctx.regulado); anterior = ctx && ctx.anterior; } catch { falas = []; }
    const f = F.validarFormaLeitura(bruto);
    if (!f.ok) return { ok: false, motivos: f.motivos, erros: f.erros };
    let anteriores = {};
    try { anteriores = evidenciasAnteriores(anterior); } catch { anteriores = {}; }
    const eixos = [], rebaixados = [];
    for (const item of f.leitura.eixos) {
      const j = julgar(item, { falas, anteriores, regulado });
      eixos.push(j.evidencia === undefined ? { eixo: item.eixo, nivel: j.nivel } : { eixo: item.eixo, nivel: j.nivel, evidencia: j.evidencia });
      if (j.rebaixo) rebaixados.push(j.rebaixo);
    }
    return { ok: true, leitura: { eixos }, rebaixados };
  } catch {
    return { ok: false, motivos: ['interno'], erros: [] };   /* falha fechado: nunca lança, nada é gravado */
  }
}

/* ---------- a leitura do estado: sem âncora ---------- */
/* a leitura gravada, REVALIDADA a cada leitura (forma + lista dura; as dez travas e a âncora rodaram ao gravar): { eixos } ou null. A evidência devolvida é a NORMALIZADA, e a de
   um eixo "não falou" nunca sai (a forma a aceita em qualquer nível; quem decide mostrar é este validador) */
export function montarLeitura(briefing, { regulado = false } = {}) {
  try {
    const l = briefing && typeof briefing === 'object' ? briefing.leitura : null;
    if (!l || typeof l !== 'object') return null;
    const f = F.validarFormaLeitura(l);
    if (!f.ok) return null;
    const eixos = [];
    for (const e of f.leitura.eixos) {
      const r = e.nivel === 'nao_falou' || e.evidencia === undefined ? null : textoDoPlanoPermitido(e.evidencia, { regulado: !!regulado, travas: false, primeiraPessoa: true });
      if (r && !r.ok) return null;
      eixos.push(r ? { eixo: e.eixo, nivel: e.nivel, evidencia: r.texto } : { eixo: e.eixo, nivel: e.nivel });
    }
    return { eixos };
  } catch {
    return null;
  }
}

/* o que o modelo vê do briefing: a leitura de agora (já validada, curta: eixo, nível e as palavras da própria pessoa), para ele reenviar os cinco eixos mantendo o que vale */
export const leituraParaModelo = (briefing, ctx) => montarLeitura(briefing, ctx);

/* ---------- os erros que voltam ao modelo: só caminho e regra, nunca o texto dele ---------- */
const REGRA = {
  eixos_qtd: 'precisa dos cinco eixos, nem mais nem menos', eixo: 'eixo fora da lista (volume, repeticao, urgencia, pessoas, informacao)', eixo_repetido: 'eixo repetido',
  nivel: 'nível fora da lista (nao_falou, comentou, deixou_claro)', evidencia: 'evidência fora do formato', evidencia_longa: 'evidência longa demais (até 60 caracteres)',
  chave_extra: 'campo que não existe no esquema', chave_faltando: 'campo obrigatório faltando', chave_proibida: 'nome de campo proibido',
  nao_objeto: 'precisa ser um objeto com a lista eixos', nao_serializavel: 'não é JSON simples', grande: 'grande demais'
};
function caminhoLegivel(c) {
  const m = String(c || '').match(/^eixos\[(\d{1,2})\]\.?(.*)$/);
  if (m) return 'eixo ' + (Number(m[1]) + 1) + (m[2] ? ', ' + m[2] : '');
  return c ? String(c) : 'leitura';
}
export function errosDaLeituraParaModelo(erros) {
  const lista = Array.isArray(erros) ? erros : [];
  return lista.slice(0, ERROS_AO_MODELO_MAX).map(e => {
    const codigo = e && typeof e.codigo === 'string' ? e.codigo : 'interno';
    return caminhoLegivel(e && e.caminho) + ': ' + (Object.hasOwn(REGRA, codigo) ? REGRA[codigo] : 'fora da forma do esquema');
  });
}

/* ---------- o turno ---------- */
/* o estado do turno da leitura (zerado a cada turno) */
export const turnoDaLeituraInicial = () => Object.freeze({ falhas: 0, gravou: false });

/* Um pedido do modelo para ler o caso. Devolve { saida (para o modelo), briefing, turno }, sem mutar nada.
   ctx: { mensagensDoVisitante, regulado }. Aceita: também devolve `rebaixados` (eixo, de, para, motivo: só códigos), para o log e a medida da rodada real */
export function resolverLeitura({ entrada, briefing, turno, ctx }) {
  const recusa = (motivo, extra = {}) => ({ saida: { ok: false, motivo, ...extra }, briefing, turno });
  try {
    if (turno.gravou) return recusa('a leitura já foi feita neste turno; uma por turno');
    if (turno.falhas >= 2) return recusa('já foram duas tentativas neste turno; a leitura que estava na tela continua');
    const v = validarLeitura(entrada, { mensagensDoVisitante: ctx && ctx.mensagensDoVisitante, regulado: ctx && ctx.regulado, anterior: briefing && briefing.leitura });
    if (v.ok) return { saida: { ok: true, no_painel: true }, briefing: { ...briefing, leitura: v.leitura }, turno: { ...turno, gravou: true }, rebaixados: v.rebaixados };
    const t = { ...turno, falhas: turno.falhas + 1 };
    if (t.falhas === 1) return { saida: { ok: false, erros: errosDaLeituraParaModelo(v.erros) }, briefing, turno: t };
    return { saida: { ok: false, mantida: true, motivo: 'a leitura anterior continua na tela; não chame de novo neste turno' }, briefing, turno: t };
  } catch {
    return recusa('não foi possível conferir a leitura');
  }
}
