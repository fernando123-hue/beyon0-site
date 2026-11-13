/* ==========================================================================
   A PLANTA VIVA NO SERVIDOR: a flag, a ferramenta do modelo, o que se grava no briefing e o que o estado devolve (spec §2.1, §2.6).
   • plantaLigada(env): BZ_PLANTA === 'ligada'. Desligada por padrão; desligada, o Zero e o `estado` são os de hoje.
   • FERRAMENTA_PLANTA: o esquema FECHADO de desenhar_planta, montado das listas da forma (js/orcamento-planta-forma.js), com a descrição que manda
     o quando e o como e três exemplos completos (os planos padrão de saúde, indústria e loja, que validam).
   • resolverDesenho / fecharTurno: as regras de um turno da planta (um plano aceito por turno, teto de 4 versões, uma volta de correção, o padrão na
     2ª falha e quando o modelo esquece), SEM efeito colateral: devolvem o briefing novo e o estado do turno (nada é mutado).
   • montarPlanta / leituraParaTela: o que o estado mostra à tela, sempre REVALIDADO (um plano antigo que deixou de ser válido sai como o padrão).
   • semChavesDaPlanta / plantaParaModelo: o que o modelo e o gerador veem (nunca as chaves da planta; ao modelo, só uma versão compacta).
   O briefing guarda: planta = { v: 1, versao, origem: 'modelo'|'padrao', motivos: [códigos], tentativas, n_mensagens, plano }, mais leitura e planta_pedidos.
   Só este módulo (e a ferramenta, depois do validador) escreve nessas chaves: atualizar_briefing descarta chave desconhecida.
   ========================================================================== */
import F from '../../js/orcamento-planta-forma.js';
import { validarPlano } from './planta-esquema.mjs';
import { cidadeValida } from './planta-textos.mjs';
import { planoPadrao, nichoDaPlanta } from './planta-padrao.mjs';

export const PLANTA_CHAVES = F.PLANTA_CHAVES;
export const plantaLigada = env => !!env && env.BZ_PLANTA === 'ligada';

export const MAX_VERSOES = 4;            /* versões do desenho por conversa (a 5ª é recusada) */
export const PEDIDOS_SEM_PLANO_MAX = 2;  /* turnos em que o prefixo pediu e o modelo não desenhou: no 2º o servidor grava o padrão */
const COMPACTO_MAX = 600;                /* caracteres da versão compacta que o modelo vê */
const ERROS_AO_MODELO_MAX = 6;

/* ---------- o que o modelo e o gerador veem ---------- */
/* o briefing sem as chaves da planta; sem nenhuma delas devolve o MESMO objeto (a serialização fica byte a byte a de hoje) */
export function semChavesDaPlanta(briefing) {
  if (!briefing || typeof briefing !== 'object' || Array.isArray(briefing)) return briefing;
  if (!PLANTA_CHAVES.some(k => Object.hasOwn(briefing, k))) return briefing;
  return Object.fromEntries(Object.entries(briefing).filter(([k]) => !PLANTA_CHAVES.includes(k)));
}

/* a versão compacta para o modelo ajustar mantendo os ids: id, tipo e título de cada caixa (nunca as frases). Cabe em 600 caracteres */
export function plantaParaModelo(planta) {
  const plano = planta && typeof planta === 'object' ? planta.plano : null;
  if (!plano || typeof plano !== 'object' || !Array.isArray(plano.etapas)) return null;
  const etapas = [];
  for (const et of plano.etapas) {
    if (!et || typeof et.id !== 'string') continue;
    const item = [et.id, et.tipo, String(et.titulo || '').slice(0, 40)];
    const candidata = { versao: planta.versao, origem: planta.origem, topologia: plano.topologia, etapas: [...etapas, item] };
    if (JSON.stringify(candidata).length > COMPACTO_MAX) break;
    etapas.push(item);
  }
  return { versao: planta.versao, origem: planta.origem, topologia: plano.topologia, etapas };
}

/* ---------- a ferramenta ---------- */
const texto = { type: 'string' };
const ETAPA = { type: 'object', additionalProperties: false, required: ['id', 'tipo', 'verbo', 'titulo', 'frase'], properties: {
  id: texto, tipo: { type: 'string', enum: [...F.TIPOS_ETAPA] }, verbo: { type: 'string', enum: [...F.VERBOS] }, titulo: texto, frase: texto,
  decisao: { type: 'boolean' }, ramo: { type: 'integer', enum: [0, 1] }, satelite_de: texto, lado: { type: 'string', enum: ['cima', 'baixo'] },
  laco: { type: 'boolean' }, retorno: { type: 'boolean' } } };
const ESQUEMA_PLANTA = { type: 'object', additionalProperties: false, required: ['topologia', 'chegada', 'etapas', 'fim', 'fecho'], properties: {
  topologia: { type: 'string', enum: [...F.TOPOLOGIAS] },
  chegada: { type: 'object', additionalProperties: false, required: ['origens', 'titulo', 'frase'], properties: { origens: { type: 'array', items: { type: 'string', enum: [...F.ORIGENS] } }, titulo: texto, frase: texto } },
  etapas: { type: 'array', items: ETAPA },
  fim: { type: 'object', additionalProperties: false, required: ['titulo', 'frase'], properties: { titulo: texto, frase: texto } },
  fecho: texto, rotulo_retorno: texto, rotulos_ramos: { type: 'array', items: texto } } };

const EXEMPLOS = ['saude_agenda', 'industria_b2b', 'loja_online'];
const DESCRICAO = 'Desenha na tela, logo abaixo da conversa, a planta do site desta pessoa: o caminho de quem chega, em 8 ou 9 caixas, do começo até o objetivo. ' +
  'Chame UMA vez, no turno em que o proximo_passo do ESTADO mandar, e de novo só se a pessoa pedir para mudar a planta ou o caso mudar de verdade (até 4 versões por conversa; mantenha o id das etapas que não mudam). ' +
  'Se ela disser que a planta está certa, não desenhe de novo. Quem desenha é o código: você só entrega o plano em JSON, com as listas fechadas do esquema. ' +
  'Escreva em português do Brasil, na voz da Beyon ("a gente"), em terceira pessoa para quem chega, no presente, sem jargão. É o desenho do que o site PODE fazer a partir do que a pessoa contou, nunca promessa: ' +
  'proibido qualquer número ou algarismo, preço, custo, prazo, resultado, garantia, suporte, marca ou nome de terceiro (vale só o nome do negócio que a pessoa deu), link, e-mail, emoji e formatação; nada de "mais clientes" nem "vende sozinho". ' +
  'Em saúde e advocacia, nada de depoimento nem de antes e depois. ' +
  'Tamanhos: título de 3 a 40 caracteres, frase de 20 a 110, rótulo de 3 a 28; 7 ou 8 etapas (mais a chegada, 8 ou 9 caixas); títulos diferentes entre si; id de 2 a 24 letras minúsculas, números ou hífen (não use os ids reservados nucleo, led, chegada, constructor, prototype e proto); o fecho conta como frase (20 a 110 caracteres). ' +
  'Topologia: laco (o fim volta ao começo; a última etapa leva retorno true; rotulo_retorno opcional), bifurca (a conversa decide e o caminho se divide e se junta: 1 ou mais etapas de entrada, a última com decisao true; 1 a 2 etapas no ramo 0; 1 a 2 no ramo 1; 1 a 2 de saída sem ramo; rotulos_ramos com 2 rótulos), ' +
  'espinha (4 a 5 etapas de tronco e 2 a 4 satélites, cada um com satelite_de apontando para o id de uma etapa do tronco e lado cima ou baixo; no máximo um satélite por etapa e um só com laco true). ' +
  'Resultado: ok com na_tela, o desenho já está na tela: diga em uma frase que desenhou o site em planta, logo abaixo, sem descrever as etapas. ok false com erros: corrija e chame de novo UMA vez. ' +
  'ok com exemplo true: o código mostrou um desenho de exemplo para o tipo de negócio; diga isso e que você refaz conforme a pessoa contar mais. ' +
  'Os exemplos abaixo são modelo de forma e de voz; escreva textos novos para ESTE negócio.';

/* strict NÃO está ligado (decisão do PR 2a). api/_ia/anthropic.mjs passa o objeto da ferramenta inteiro à API (pedido.tools = ferramentas), então "strict: true"
   chegaria lá; mas sem uma chamada real não dá para provar que a API aceita este esquema (28 tipos, 34 verbos, aninhamento, regras de tamanho só na
   descrição), e um 400 derrubaria o turno inteiro do Zero. O esquema já evita palavras que o modo estrito recusa (sem minLength, maxLength, minItems,
   pattern): ligar é UMA linha, a fazer na rodada real 8 se mais de 30% dos planos caírem no padrão. */
/* a ferramenta (nova a cada chamada: quem a recebe pode mexer) */
export function ferramentaPlanta() {
  const exemplos = EXEMPLOS.map((chave, i) => '\nEXEMPLO ' + (i + 1) + ': ' + JSON.stringify(planoPadrao(chave))).join('');
  return { name: 'desenhar_planta', description: DESCRICAO + exemplos, input_schema: JSON.parse(JSON.stringify(ESQUEMA_PLANTA)) };
}

/* ---------- os erros que voltam ao modelo: só caminho e regra, nunca o texto dele ---------- */
const REGRA = {
  titulo_curto: 'título curto demais (3 a 40 caracteres)', titulo_longo: 'título longo demais (3 a 40 caracteres)',
  frase_curta: 'frase curta demais (20 a 110 caracteres)', frase_longa: 'frase longa demais (20 a 110 caracteres)', rotulo: 'rótulo fora de 3 a 28 caracteres',
  titulo_repetido: 'título igual ao de outra caixa (use títulos diferentes)',
  digito: 'tem número ou algarismo (escreva sem números)', simbolo: 'tem símbolo de valor ou porcentagem', preco: 'fala de preço, custo ou valor', prazo: 'fala de prazo ou de tempo, mesmo negando ("sem prometer resposta imediata" também cai): tire palavras como imediata, rápido, hoje, agora, dias, horas, na hora, toda semana e descreva só o passo',
  numeral: 'tem número por extenso (de dois em diante)', promessa: 'promete resultado', garantia: 'fala de garantia', suporte: 'fala de suporte ou manutenção',
  ordem: 'tem instrução ao sistema', negar_ia: 'fala em primeira pessoa como se fosse gente', marca: 'cita marca ou nome de terceiro: troque WhatsApp, Instagram, Google e afins por palavra comum (rede social, aplicativo de mensagens, busca, mapa); só vale o nome do negócio e a cidade que a pessoa deu, Pix e sigla de conselho como OAB ou CREFITO (escreva só a sigla, sem estado nem número)',
  url: 'tem link', email: 'tem e-mail ou arroba', markdown: 'tem formatação ou sinal de tag', emoji: 'tem emoji', alfabeto: 'tem letra fora do alfabeto latino',
  caractere: 'tem caractere que não é de texto corrido', depoimento: 'tem depoimento ou antes e depois (proibido neste ramo)', resultado_regulado: 'promete cura ou resultado (proibido neste ramo)',
  texto: 'não é texto', vazio: 'vazio', longo: 'longo demais', interno: 'não foi possível conferir',
  grande: 'plano grande demais (cabe em uns 8 KB)', nao_objeto: 'o plano precisa ser um objeto', nao_serializavel: 'o plano não é JSON simples',
  chave_extra: 'campo que não existe no esquema', chave_faltando: 'campo obrigatório faltando', chave_proibida: 'nome de campo proibido',
  topologia: 'topologia fora da lista (laco, bifurca ou espinha)', etapas_qtd: 'o plano precisa de 7 ou 8 etapas (mais a chegada)', id: 'id fora do formato (2 a 24 letras minúsculas, números ou hífen)',
  id_reservado: 'id reservado (use outro)', id_repetido: 'id repetido', tipo: 'tipo fora da lista', verbo: 'verbo fora da lista', origens: 'origens fora da lista, repetidas ou fora de 1 a 4',
  ramo: 'ramos da bifurcação fora da regra', decisao: 'a decisão precisa ser uma só, e a última da entrada na bifurcação', retorno: 'o retorno é só da última etapa do laço',
  satelite: 'satélite fora da regra (preso a uma etapa do tronco, um por etapa)', lado: 'lado precisa ser cima ou baixo', laco: 'laço curto só num satélite, e um só', tronco: 'o tronco precisa ter 4 ou 5 etapas',
  campo_fora_da_topologia: 'campo que não é desta topologia (laco usa retorno; bifurca usa ramo e decisao; espinha usa satelite_de, lado e laco): tire o campo, mesmo com false', chegada: 'chegada fora do formato', fim: 'fim fora do formato', etapa: 'etapa fora do formato', evidencia: 'evidência fora do formato'
};
const FORMA = 'fora da forma do esquema';
function lerCaminho(c) {
  const m = String(c || '').match(/^etapas\[(\d{1,2})\]\.?(.*)$/);
  const campo = r => ({ titulo: 'título', frase: 'frase', id: 'id', tipo: 'tipo', verbo: 'verbo', ramo: 'ramo', satelite_de: 'satelite_de', lado: 'lado', laco: 'laco', retorno: 'retorno', decisao: 'decisao' }[r] || r);
  if (m) return 'etapa ' + (Number(m[1]) + 1) + (m[2] ? ', ' + campo(m[2]) : '');
  if (!c) return 'plano';
  return String(c).replace(/^chegada\./, 'chegada, ').replace(/^fim\./, 'fim, ');
}
/* só o NÚMERO de caracteres do texto recusado por tamanho (nunca o texto): o modelo erra a conta de 110 */
function tamanhoDoTexto(codigo, caminho, plano) {
  if (!/^(?:titulo|frase)_(?:curt|long)[oa]$/.test(codigo) || typeof caminho !== 'string' || !plano || typeof plano !== 'object') return '';
  try {
    const v = caminho.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((o, k) => (o == null || typeof o !== 'object' || !Object.hasOwn(o, k) ? undefined : o[k]), plano);
    return typeof v === 'string' ? ' (tem ' + v.trim().length + ' caracteres)' : '';
  } catch { return ''; }
}
/* erros do validador -> frases curtas para o modelo (no máximo 6) */
export function errosParaModelo(erros, plano = null) {
  const lista = Array.isArray(erros) ? erros : [];
  return lista.slice(0, ERROS_AO_MODELO_MAX).map(e => {
    const codigo = e && typeof e.codigo === 'string' ? e.codigo : 'interno';
    const regra = codigo.startsWith('trava_') ? 'tem promessa ou frase que o Zero não pode escrever' : (Object.hasOwn(REGRA, codigo) ? REGRA[codigo] : FORMA);
    return lerCaminho(e && e.caminho) + ': ' + regra + tamanhoDoTexto(codigo, e && e.caminho, plano);
  });
}

/* ---------- o que se grava ---------- */
const uniao = (a, b) => [...new Set([...(a || []), ...(b || [])])];
function gravarPlanta(briefing, { plano, origem, motivos, tentativas, nMensagens }) {
  const anterior = briefing && briefing.planta && Number.isInteger(briefing.planta.versao) ? briefing.planta.versao : 0;
  return { ...briefing, planta: { v: 1, versao: anterior + 1, origem, motivos: uniao([], motivos), tentativas, n_mensagens: nMensagens, plano } };
}
const caixas = plano => plano.etapas.length + 1;

/* o estado do turno da planta (zerado a cada turno) */
export const turnoDaPlantaInicial = () => Object.freeze({ falhas: 0, motivos: [], gravou: false });

/* Um pedido do modelo para desenhar. Devolve { saida (para o modelo), briefing, turno }, sem mutar nada.
   ctx: { estimativaNoInicio, nMensagens, regulado, nomeDoNegocio } */
export function resolverDesenho({ entrada, briefing, turno, ctx }) {
  const recusa = motivo => ({ saida: { ok: false, motivo }, briefing, turno });
  if (turno.gravou) return recusa('a planta já foi desenhada neste turno; uma por vez');
  if (!ctx.estimativaNoInicio) return recusa('a planta vem depois da estimativa');
  const versao = briefing.planta && Number.isInteger(briefing.planta.versao) ? briefing.planta.versao : 0;
  if (versao >= MAX_VERSOES) return recusa('limite de ' + MAX_VERSOES + ' versões da planta nesta conversa');
  if (turno.falhas >= 2) return recusa('já foram duas tentativas neste turno; o desenho que estava na tela continua');
  const v = validarPlano(entrada, { nomeDoNegocio: ctx.nomeDoNegocio, regulado: ctx.regulado, cidade: cidadeValida(ctx.cidade) });
  if (v.ok) {
    const novo = gravarPlanta(briefing, { plano: v.plano, origem: 'modelo', motivos: turno.motivos, tentativas: turno.falhas + 1, nMensagens: ctx.nMensagens });
    return { saida: { ok: true, na_tela: true, etapas: caixas(v.plano) }, briefing: novo, turno: { ...turno, gravou: true } };
  }
  const t = { ...turno, falhas: turno.falhas + 1, motivos: uniao(turno.motivos, v.motivos) };
  if (t.falhas === 1) return { saida: { ok: false, erros: errosParaModelo(v.erros, entrada) }, briefing, turno: t };
  /* a 2ª falha: sem planta ainda, o servidor grava o padrão do nicho; com uma planta já na tela, ela fica (o padrão é só para quem não tem desenho) */
  if (versao > 0) return { saida: { ok: false, mantida: true, motivo: 'o desenho anterior continua na tela; não desenhe de novo neste turno' }, briefing, turno: t };
  const plano = planoPadrao(nichoDaPlanta(briefing));
  const novo = gravarPlanta(briefing, { plano, origem: 'padrao', motivos: t.motivos, tentativas: t.falhas, nMensagens: ctx.nMensagens });
  return { saida: { ok: true, na_tela: true, exemplo: true }, briefing: novo, turno: { ...t, gravou: true } };
}

/* O fim do turno. prefixoUsado: o ESTADO pediu a planta neste turno. esgotou: o turno acabou nas voltas, com a última ainda uma chamada de ferramenta.
   Devolve o briefing novo (o mesmo objeto se nada muda). */
export function fecharTurno({ briefing, turno, prefixoUsado, esgotou, nMensagens }) {
  if (turno.gravou) return briefing;
  const semPlanta = !(briefing.planta && Number.isInteger(briefing.planta.versao));
  if (esgotou && turno.falhas > 0 && semPlanta) {
    return gravarPlanta(briefing, { plano: planoPadrao(nichoDaPlanta(briefing)), origem: 'padrao', motivos: uniao(turno.motivos, ['estouro']), tentativas: turno.falhas, nMensagens });
  }
  if (!prefixoUsado || !semPlanta) return briefing;
  const pedidos = (Number.isInteger(briefing.planta_pedidos) ? briefing.planta_pedidos : 0) + 1;
  if (pedidos >= PEDIDOS_SEM_PLANO_MAX) {
    return { ...gravarPlanta(briefing, { plano: planoPadrao(nichoDaPlanta(briefing)), origem: 'padrao', motivos: uniao(turno.motivos, ['nao_chamou']), tentativas: turno.falhas, nMensagens }), planta_pedidos: pedidos };
  }
  return { ...briefing, planta_pedidos: pedidos };
}

/* ---------- o que o estado mostra ---------- */
/* A posição da fala do Zero que trouxe o desenho. Na GRAVAÇÃO vale a posição ABSOLUTA na conversa (0 é a 1ª mensagem guardada; todo turno guarda 2 mensagens, e
   `turnos` é o contador do banco): 2 * turnos + 1 é a fala do Zero do turno em curso. Na LEITURA a tela só recebe as últimas 60 mensagens (vendas_estado), então
   a posição vira a da janela: tira as mensagens que ficaram para trás. Sem `turnos` (teste, dado antigo) vale o comprimento da lista + 1, como antes.
   A fala de abertura fixa do Zero NÃO está no banco: quem a mostra (a tela) soma 1 à posição se a puser no começo da lista (anotado para o PR 2c). */
export const MENSAGENS_NA_JANELA = 60;
export function posicaoDaFala({ turnos, mensagens }) {
  return Number.isInteger(turnos) && turnos >= 0 ? 2 * turnos + 1 : (Number.isInteger(mensagens) ? mensagens : 0) + 1;
}
export function posicaoNaJanela(absoluta, { turnos, mensagensNaJanela }) {
  if (!Number.isInteger(absoluta) || absoluta < 0) return 0;
  if (!Number.isInteger(turnos) || turnos < 0 || !Number.isInteger(mensagensNaJanela)) return absoluta;
  return Math.max(0, absoluta - Math.max(0, 2 * turnos - mensagensNaJanela));
}

/* O estado revalida a cada leitura, e isso custava 16 a 30 ms quentes e ~330 a 550 ms frios (as regex das travas antigas): o plano grátis da Cloudflare tem 10 ms
   de CPU. Agora o estado confere só a FORMA e a LISTA DURA (as dez travas rodam ao GRAVAR e no turno do modelo), e guarda o resultado por
   (plano, nome do negócio, nicho regulado) no isolate: a 2ª leitura do mesmo plano é um JSON.stringify e um Map. */
const CACHE_MAX = 64;
const cachePlantas = new Map();
let acertos = 0, falhas = 0;
export const limparCacheDaPlanta = () => { cachePlantas.clear(); acertos = 0; falhas = 0; };
export const estatisticasDoCache = () => ({ tamanho: cachePlantas.size, max: CACHE_MAX, acertos, falhas });
function planoRevalidado(plano, nomeDoNegocio, regulado, cidade = '') {
  let chave;
  try { chave = JSON.stringify([regulado, nomeDoNegocio, cidade, plano]); } catch { return null; }
  if (typeof chave !== 'string') return null;
  if (cachePlantas.has(chave)) { acertos++; const g = cachePlantas.get(chave); return g === null ? null : JSON.parse(g); }
  falhas++;
  const v = validarPlano(plano, { nomeDoNegocio, regulado, cidade, travas: false });
  if (cachePlantas.size >= CACHE_MAX) cachePlantas.delete(cachePlantas.keys().next().value);
  cachePlantas.set(chave, v.ok ? JSON.stringify(v.plano) : null);
  return v.ok ? v.plano : null;
}

/* a planta gravada, REVALIDADA a cada leitura: { versao, origem, n_mensagens, plano } (sem motivos nem tentativas, que ficam no banco), ou null.
   Plano gravado que deixou de ser válido sai como o padrão do nicho (origem "padrao"). `turnos` e `mensagensNaJanela` põem n_mensagens na janela da tela. */
export function montarPlanta(briefing, { regulado = false, turnos, mensagensNaJanela } = {}) {
  const p = briefing && typeof briefing === 'object' ? briefing.planta : null;
  if (!p || typeof p !== 'object' || Array.isArray(p) || !Number.isInteger(p.versao) || p.versao < 1) return null;
  const nomeDoNegocio = briefing.negocio && typeof briefing.negocio.nome === 'string' ? briefing.negocio.nome : '';
  const cidade = cidadeValida(briefing.negocio && briefing.negocio.cidade);   /* (dado do visitante: só entra no cache e nas travas depois de validada) */
  const plano = planoRevalidado(p.plano, nomeDoNegocio, !!regulado, cidade);
  const nMensagens = posicaoNaJanela(Number.isInteger(p.n_mensagens) && p.n_mensagens >= 0 ? p.n_mensagens : 0, { turnos, mensagensNaJanela });
  if (plano) return { versao: p.versao, origem: p.origem === 'modelo' ? 'modelo' : 'padrao', n_mensagens: nMensagens, plano };
  return { versao: p.versao, origem: 'padrao', n_mensagens: nMensagens, plano: planoPadrao(nichoDaPlanta(briefing)) };
}

/* a leitura do radar: a lógica mora em ./leitura.mjs (PR 2d-ligação); o estado continua chamando este nome */
export { montarLeitura as leituraParaTela } from './leitura.mjs';
