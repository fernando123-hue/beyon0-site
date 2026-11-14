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
import M from '../../js/orcamento-mapa-forma.js';
import { validarPlano } from './planta-esquema.mjs';
import { cidadeValida } from './planta-textos.mjs';
import { nichoDaPlanta } from './planta-padrao.mjs';
import { planoDoCaso, oQueSeSabe } from './mapa-padrao.mjs';

export const PLANTA_CHAVES = F.PLANTA_CHAVES;
export const plantaLigada = env => !!env && env.BZ_PLANTA === 'ligada';

/* (PR 4) o modelo escreve o MAPA DO CASO v3 (js/orcamento-mapa-forma.js): estrutura, nós por papel, setas. Um v2 gravado continua lido e
   desenhado (a leitura aceita as duas versões); o ajuste de um v2 vem como um v3 inteiro. O padrão é composto do caso (api/_vendas/mapa-padrao.mjs). */
export const MAX_VERSOES = 6;            /* versões do mapa por conversa (a 7ª é recusada) */
export const PEDIDOS_SEM_PLANO_MAX = 2;  /* turnos em que o prefixo pediu e o modelo não desenhou: no 2º o servidor grava o padrão */
const COMPACTO_MAX = 900;                /* caracteres da versão compacta que o modelo vê (6 nós e 9 setas cabem) */
export const REGISTRO_BYTES_MAX = 8192;  /* o registro "planta" gravado no briefing; acima disso não se grava (o desenho anterior fica) */
/* o padrão do caso: o nicho e o que se sabe (origens e trava tocadas) */
const padraoDoCaso = briefing => planoDoCaso(nichoDaPlanta(briefing), oQueSeSabe(briefing));
const ehV3 = plano => !!plano && typeof plano === 'object' && Object.hasOwn(plano, 'estrutura');
const ERROS_AO_MODELO_MAX = 6;

/* ---------- o que o modelo e o gerador veem ---------- */
/* o briefing sem as chaves da planta; sem nenhuma delas devolve o MESMO objeto (a serialização fica byte a byte a de hoje) */
export function semChavesDaPlanta(briefing) {
  if (!briefing || typeof briefing !== 'object' || Array.isArray(briefing)) return briefing;
  if (!PLANTA_CHAVES.some(k => Object.hasOwn(briefing, k))) return briefing;
  return Object.fromEntries(Object.entries(briefing).filter(([k]) => !PLANTA_CHAVES.includes(k)));
}

/* a versão compacta do mapa v3 (no bloco BRIEFING, como dado): os nós [id, papel, título] e as setas [de, para, rótulo], nunca as frases. Cabe em
   COMPACTO_MAX: corta primeiro o rótulo das setas, depois as setas; os nós só no fim, se ainda passar (o ajuste precisa dos ids) */
/* (revisão de segurança do PR 4, B1) o plano vem do briefing CRU (sem a revalidação da leitura): só entram o que as listas da forma reconhecem
   (id no formato, papel, estrutura e origem da lista), e o teto vale no fim, nem que custe nós */
const idValido = id => typeof id === 'string' && (id === 'objetivo' || (M.ID_NO.test(id) && !M.IDS_RESERVADOS.includes(id)));
function mapaParaModelo(planta, plano) {
  let nos = (Array.isArray(plano.nos) ? plano.nos : []).filter(n => n && idValido(n.id) && n.id !== 'objetivo' && M.PAPEIS.includes(n.papel))
    .map(n => [n.id, n.papel, String(n.titulo || '').slice(0, M.LIMITES_MAPA.titulo_max)]);
  const setas = (Array.isArray(plano.setas) ? plano.setas : []).filter(s => s && idValido(s.de) && idValido(s.para))
    .map(s => [s.de, s.para, String(s.rotulo || '').slice(0, M.LIMITES_MAPA.rotulo_max)]);
  const origens = plano.hoje && Array.isArray(plano.hoje.origens) ? plano.hoje.origens.filter(o => M.ORIGENS_MAPA.includes(o)).slice(0, M.LIMITES_MAPA.hoje_origens_max) : [];
  const objetivo = plano.objetivo && typeof plano.objetivo.titulo === 'string' ? plano.objetivo.titulo.slice(0, M.LIMITES_MAPA.titulo_max) : '';
  const estrutura = M.ESTRUTURAS.includes(plano.estrutura) ? plano.estrutura : null;
  const montar = ss => ({ versao: planta.versao, origem: planta.origem, estrutura, origens, nos, setas: ss, objetivo });
  let c = montar(setas);
  if (JSON.stringify(c).length > COMPACTO_MAX) c = montar(setas.map(s => [s[0], s[1]]));
  while (JSON.stringify(c).length > COMPACTO_MAX && c.setas.length) c = montar(c.setas.slice(0, -1));
  while (JSON.stringify(c).length > COMPACTO_MAX && nos.length) { nos = nos.slice(0, -1); c = montar(c.setas); }
  /* as setas só entre o que ficou (nó filtrado ou cortado não deixa seta para um id que o modelo não vê) */
  const ficaram = new Set(['objetivo', ...nos.map(n => n[0])]);
  return montar(c.setas.filter(s => ficaram.has(s[0]) && ficaram.has(s[1])));
}
/* a versão compacta para o modelo ajustar mantendo os ids: do v3, o mapa acima; do v2, id, tipo e título de cada caixa (nunca as frases) */
export function plantaParaModelo(planta) {
  const plano = planta && typeof planta === 'object' ? planta.plano : null;
  if (ehV3(plano)) return mapaParaModelo(planta, plano);
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

/* ---------- a ferramenta (o mapa do caso v3) ---------- */
const texto = { type: 'string' };
const ESQUEMA_PLANTA = { type: 'object', additionalProperties: false, required: ['estrutura', 'hoje', 'nos', 'setas', 'objetivo', 'fecho'], properties: {
  estrutura: { type: 'string', enum: [...M.ESTRUTURAS] },
  hoje: { type: 'object', additionalProperties: false, required: ['origens'], properties: {
    origens: { type: 'array', items: { type: 'string', enum: [...M.ORIGENS_MAPA] } }, texto, trava: texto } },
  nos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'papel', 'icone', 'titulo', 'frase'], properties: {
    id: texto, papel: { type: 'string', enum: [...M.PAPEIS] }, icone: { type: 'string', enum: [...M.ICONES] }, origem: { type: 'string', enum: [...M.ORIGENS_MAPA] },
    titulo: texto, frase: texto } } },
  setas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['de', 'para', 'rotulo'], properties: { de: texto, para: texto, rotulo: texto } } },
  objetivo: { type: 'object', additionalProperties: false, required: ['titulo', 'frase'], properties: { titulo: texto, frase: texto } },
  fecho: texto } };

/* três exemplos de três estruturas diferentes, montados pelo padrão do caso (passam no validador): o modelo não ancora numa estrutura só */
const EXEMPLOS = [
  ['saude_agenda', { origens: ['instagram', 'indicacao'] }],
  ['servico_orcamento', { origens: ['google_busca'], trava: 'responde_na_mao', travaRotulo: 'Respondo preço e horário na mão' }],
  ['loja_online', { origens: ['instagram', 'passa_na_frente'] }]
];
/* (texto aprovado pelo dono como "DESCRICAO v3"; os tamanhos e os ids são a regra técnica que acompanha) */
const DESCRICAO = 'Monta, logo abaixo da conversa, o mapa do caso desta pessoa: de onde ela chega, o que trava hoje, o que o site faz e onde ela quer chegar. ' +
  'Chame UMA vez, no turno em que o proximo_passo do ESTADO mandar, e de novo só se a pessoa pedir para mudar o mapa ou o caso mudar de verdade (até ' + MAX_VERSOES + ' versões por conversa). ' +
  'Se ela disser que o mapa está certo, não monte de novo. Quem desenha é o código: você só entrega o plano em JSON, com as listas fechadas do esquema. ' +
  'A estrutura sai do que a pessoa contou, pela primeira regra que valer: o ganho está na volta (recompra, retorno, revisão, mensalidade): ciclo; dois públicos ou dois serviços com caminhos diferentes: ramos; ' +
  'a dor é trabalho repetido ou perda fora de hora: antes_depois; várias forças ao mesmo tempo (duas origens ou mais, uma trava e um desejo): mapa; nos outros casos: caminho. ' +
  'Mesma história, mesma estrutura. Nunca escolha uma estrutura para variar nem copie a dos exemplos: eles mostram a forma, não o seu caso. ' +
  'No hoje: em origens, só os códigos dos lugares que ela disse (Google sem falar de mapa é google_busca); texto e trava com as palavras dela, sem marca; preço só como o que perguntam a ela, nunca valor, juízo ou comparação; não escreva Hoje (a tela põe). ' +
  'O objetivo não é um nó: as setas o chamam pelo id objetivo. Seta de volta só no ciclo, e uma só. ' +
  'Escreva em português do Brasil, na voz da Beyon (a gente), em terceira pessoa para quem chega, no presente, sem jargão. É o que o site PODE fazer a partir do que a pessoa contou, nunca promessa: ' +
  'proibido número ou algarismo, preço como valor, custo, prazo, resultado, garantia, marca ou nome de terceiro (vale só o nome do negócio que ela deu), link, e-mail, emoji e formatação; nada de mais clientes nem vende sozinho. ' +
  'Em saúde e advocacia, nada de depoimento nem de foto de antes e depois (a estrutura antes_depois fala do trabalho, nunca do corpo). ' +
  'Papéis: origem (de onde chega, com o código em origem, um dos de hoje.origens; no máximo 2), hoje e trava (como é hoje e o que se perde), site, conversa e acao (o que o site faz), volta (o retorno, no ciclo), ajustado (o que mudou num ajuste). ' +
  'Por estrutura: em ramos um nó se divide em exatamente 2 setas; em antes_depois há trava e site ou acao; o caminho não se divide nem se junta; o mapa tem 4 nós ou mais, com trava e origem. ' +
  'Tamanhos: título de 3 a 28 caracteres, frase de 20 a 60, rótulo de seta de 3 a 24, texto e trava do hoje de 10 a 60, fecho de 20 a 80; 2 a 6 nós e 1 a 9 setas; no máximo 5 passos de cima a baixo (o objetivo conta) e 2 nós lado a lado; ' +
  'nenhuma seta chega a um nó de origem; seta que pula um passo só passa onde não há nó; todo nó chega ao objetivo; títulos diferentes entre si; id de 1 a 12 letras minúsculas, números ou _ (não use objetivo, hoje, constructor, prototype e proto). ' +
  'Ajuste: mantenha os ids e o texto do que não mudou; o nó novo ou trocado leva o papel ajustado e entra ligado por uma seta com rótulo. Se planta_desenhada tem topologia, é um desenho antigo: escreva o plano inteiro de novo, sem ajustado. ' +
  'Resultado: ok com na_tela, o mapa já está na tela: diga em uma frase que montou o mapa do caso, logo abaixo, sem descrever os nós. ok false com erros: corrija e chame de novo UMA vez. ' +
  'ok com exemplo true: o código mostrou um mapa de exemplo para o tipo de negócio; diga isso e que você refaz conforme a pessoa contar mais. ' +
  'Os exemplos abaixo são modelo de forma e de voz; escreva textos novos para ESTE negócio.';

/* strict NÃO está ligado (decisão do PR 2a; o esquema evita minLength, maxLength, minItems e pattern): ligar é UMA linha, na rodada real. */
/* a ferramenta (nova a cada chamada: quem a recebe pode mexer) */
export function ferramentaPlanta() {
  const exemplos = EXEMPLOS.map(([chave, saber], i) => '\nEXEMPLO ' + (i + 1) + ': ' + JSON.stringify(planoDoCaso(chave, saber))).join('');
  return { name: 'desenhar_planta', description: DESCRICAO + exemplos, input_schema: JSON.parse(JSON.stringify(ESQUEMA_PLANTA)) };
}

/* ---------- os erros que voltam ao modelo: só caminho e regra, nunca o texto dele ---------- */
/* (o modelo só escreve v3: os tamanhos são os do mapa, js/orcamento-mapa-forma.js LIMITES_MAPA) */
const REGRA = {
  titulo_curto: 'título curto demais (3 a 28 caracteres)', titulo_longo: 'título longo demais (3 a 28 caracteres)',
  frase_curta: 'frase curta demais (20 a 60 caracteres)', frase_longa: 'frase longa demais (20 a 60 caracteres)', rotulo: 'rótulo da seta fora de 3 a 24 caracteres',
  hoje_curto: 'texto do hoje curto demais (10 a 60 caracteres)', hoje_longo: 'texto do hoje longo demais (10 a 60 caracteres)',
  fecho_curto: 'fecho curto demais (20 a 80 caracteres)', fecho_longo: 'fecho longo demais (20 a 80 caracteres)',
  estrutura: 'estrutura fora da lista (caminho, antes_depois, ramos, ciclo ou mapa)', versao: 'o plano mistura o formato antigo (topologia) com o novo (estrutura): use só estrutura',
  versao_antiga: 'escreva no formato novo, com estrutura, nos e setas', nos_qtd: 'o mapa precisa de 2 a 6 nós (o objetivo não conta)', setas_qtd: 'o mapa precisa de 1 a 9 setas',
  papel: 'papel fora da lista', icone: 'ícone fora da lista', origem: 'origem fora da lista, repetida, ou em nó que não é de origem (o nó de origem precisa dela)',
  origem_fora_do_hoje: 'a origem do nó precisa estar em hoje.origens', origens_nos: 'no máximo 2 nós de origem',
  id_no: 'id fora do formato (1 a 12 letras minúsculas, números ou _)', seta_ref: 'seta que aponta para um id que não existe (use o id de um nó ou objetivo)',
  seta_propria: 'seta que sai e chega no mesmo nó', seta_repetida: 'seta repetida', seta_para_origem: 'nenhuma seta chega a um nó de origem (ele é o começo)',
  objetivo_sai: 'o objetivo só tem seta saindo no ciclo, e uma só', no_solto: 'nó sem nenhuma seta', nao_chega: 'nó que não chega ao objetivo por nenhuma seta',
  sem_objetivo: 'nenhuma seta chega ao objetivo', camadas: 'passos demais de cima a baixo (no máximo 5, com o objetivo)',
  camada_cheia: 'nós demais lado a lado no mesmo passo (no máximo 2, e sem cair um em cima do outro)', pulo: 'seta que pula um passo por cima de outro nó',
  volta: 'seta de volta só no ciclo, e lá exatamente uma', ramos: 'em ramos, um nó precisa se dividir em exatamente 2 setas',
  antes_depois: 'antes_depois precisa de um nó trava e de um site ou acao', caminho_divide: 'o caminho não se divide nem se junta', mapa: 'o mapa precisa de 4 nós ou mais, com trava e origem',
  ajustado: 'no máximo 2 nós ajustado', ajustado_sem_plano: 'ajustado só num ajuste de um mapa no formato novo (escreva o mapa inteiro, sem ajustado)',
  hoje: 'hoje fora do formato', hoje_vazio: 'hoje sem nada: ponha as origens, o texto ou a trava (ou tire o hoje)', objetivo: 'objetivo fora do formato',
  no: 'nó fora do formato', seta: 'seta fora do formato', redigido: 'tem dado pessoal (telefone, e-mail, documento): tire', registro: 'plano grande demais para guardar',
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
  /* (v3) nós e setas pelo ÍNDICE, nunca pelo id (o id é do modelo) */
  const v3 = String(c || '').match(/^(nos|setas|camadas)\[(\d{1,2})\]\.?(.*)$/);
  if (v3) return { nos: 'nó ', setas: 'seta ', camadas: 'passo ' }[v3[1]] + (Number(v3[2]) + 1) + (v3[3] ? ', ' + ({ titulo: 'título', frase: 'frase', rotulo: 'rótulo' }[v3[3]] || v3[3]) : '');
  const m = String(c || '').match(/^etapas\[(\d{1,2})\]\.?(.*)$/);
  const campo = r => ({ titulo: 'título', frase: 'frase', id: 'id', tipo: 'tipo', verbo: 'verbo', ramo: 'ramo', satelite_de: 'satelite_de', lado: 'lado', laco: 'laco', retorno: 'retorno', decisao: 'decisao' }[r] || r);
  if (m) return 'etapa ' + (Number(m[1]) + 1) + (m[2] ? ', ' + campo(m[2]) : '');
  if (!c) return 'plano';
  return String(c).replace(/^chegada\./, 'chegada, ').replace(/^fim\./, 'fim, ');
}
/* só o NÚMERO de caracteres do texto recusado por tamanho (nunca o texto): o modelo erra a conta de 110 */
function tamanhoDoTexto(codigo, caminho, plano) {
  if (!/^(?:titulo|frase|hoje|fecho)_(?:curt|long)[oa]$/.test(codigo) || typeof caminho !== 'string' || !plano || typeof plano !== 'object') return '';
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
/* as caixas na tela: no v3, os nós e o objetivo; no v2, as etapas e a chegada */
const caixas = plano => (ehV3(plano) ? plano.nos.length : plano.etapas.length) + 1;
/* o registro cabe no teto? (puro, para o teste e a mutação; o plano v3 válido mede até ~6 KB, então o teto só pega uma mudança de limite futura) */
export function cabeNoRegistro(registro, max = REGISTRO_BYTES_MAX) {
  let n;
  try { n = new TextEncoder().encode(JSON.stringify(registro)).length; } catch { return false; }
  return Number.isFinite(n) && n <= max;
}

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
  /* do modelo, só o mapa v3; o papel "ajustado" só num ajuste de um v3 (o v3 que nasce de um v2 não leva "Ajustado") */
  let v = validarPlano(entrada, { nomeDoNegocio: ctx.nomeDoNegocio, regulado: ctx.regulado, cidade: cidadeValida(ctx.cidade), versoes: ['v3'] });
  if (v.ok && v.plano.nos.some(n => n.papel === 'ajustado') && !ehV3(briefing.planta && briefing.planta.plano)) {
    v = { ok: false, motivos: ['ajustado_sem_plano'], erros: [{ caminho: 'nos', codigo: 'ajustado_sem_plano' }] };
  }
  if (v.ok) {
    const novo = gravarPlanta(briefing, { plano: v.plano, origem: 'modelo', motivos: turno.motivos, tentativas: turno.falhas + 1, nMensagens: ctx.nMensagens });
    /* o registro passou do teto: nada se grava, e o desenho anterior (se houver) fica */
    if (!cabeNoRegistro(novo.planta)) return { saida: { ok: false, motivo: REGRA.registro }, briefing, turno: { ...turno, falhas: turno.falhas + 1, motivos: uniao(turno.motivos, ['grande']) } };
    return { saida: { ok: true, na_tela: true, etapas: caixas(v.plano) }, briefing: novo, turno: { ...turno, gravou: true } };
  }
  const t = { ...turno, falhas: turno.falhas + 1, motivos: uniao(turno.motivos, v.motivos) };
  if (t.falhas === 1) return { saida: { ok: false, erros: errosParaModelo(v.erros, entrada) }, briefing, turno: t };
  /* a 2ª falha: sem planta ainda, o servidor grava o padrão do nicho; com uma planta já na tela, ela fica (o padrão é só para quem não tem desenho) */
  if (versao > 0) return { saida: { ok: false, mantida: true, motivo: 'o desenho anterior continua na tela; não desenhe de novo neste turno' }, briefing, turno: t };
  const plano = padraoDoCaso(briefing);
  const novo = gravarPlanta(briefing, { plano, origem: 'padrao', motivos: t.motivos, tentativas: t.falhas, nMensagens: ctx.nMensagens });
  return { saida: { ok: true, na_tela: true, exemplo: true }, briefing: novo, turno: { ...t, gravou: true } };
}

/* O fim do turno. prefixoUsado: o ESTADO pediu a planta neste turno. esgotou: o turno acabou nas voltas, com a última ainda uma chamada de ferramenta.
   Devolve o briefing novo (o mesmo objeto se nada muda). */
export function fecharTurno({ briefing, turno, prefixoUsado, esgotou, nMensagens }) {
  if (turno.gravou) return briefing;
  const semPlanta = !(briefing.planta && Number.isInteger(briefing.planta.versao));
  if (esgotou && turno.falhas > 0 && semPlanta) {
    return gravarPlanta(briefing, { plano: padraoDoCaso(briefing), origem: 'padrao', motivos: uniao(turno.motivos, ['estouro']), tentativas: turno.falhas, nMensagens });
  }
  if (!prefixoUsado || !semPlanta) return briefing;
  const pedidos = (Number.isInteger(briefing.planta_pedidos) ? briefing.planta_pedidos : 0) + 1;
  if (pedidos >= PEDIDOS_SEM_PLANO_MAX) {
    return { ...gravarPlanta(briefing, { plano: padraoDoCaso(briefing), origem: 'padrao', motivos: uniao(turno.motivos, ['nao_chamou']), tentativas: turno.falhas, nMensagens }), planta_pedidos: pedidos };
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

/* a planta gravada, REVALIDADA a cada leitura (v2 ou v3, pela chave): { versao, origem, n_mensagens, plano } (sem motivos nem tentativas, que ficam no
   banco), ou null. Plano gravado que deixou de ser válido sai como o padrão do caso, v3 (origem "padrao"). `turnos` e `mensagensNaJanela` põem n_mensagens na janela da tela. */
export function montarPlanta(briefing, { regulado = false, turnos, mensagensNaJanela } = {}) {
  const p = briefing && typeof briefing === 'object' ? briefing.planta : null;
  if (!p || typeof p !== 'object' || Array.isArray(p) || !Number.isInteger(p.versao) || p.versao < 1) return null;
  const nomeDoNegocio = briefing.negocio && typeof briefing.negocio.nome === 'string' ? briefing.negocio.nome : '';
  const cidade = cidadeValida(briefing.negocio && briefing.negocio.cidade);   /* (dado do visitante: só entra no cache e nas travas depois de validada) */
  const plano = planoRevalidado(p.plano, nomeDoNegocio, !!regulado, cidade);
  const nMensagens = posicaoNaJanela(Number.isInteger(p.n_mensagens) && p.n_mensagens >= 0 ? p.n_mensagens : 0, { turnos, mensagensNaJanela });
  if (plano) return { versao: p.versao, origem: p.origem === 'modelo' ? 'modelo' : 'padrao', n_mensagens: nMensagens, plano };
  return { versao: p.versao, origem: 'padrao', n_mensagens: nMensagens, plano: padraoDoCaso(briefing) };
}

/* a leitura do radar: a lógica mora em ./leitura.mjs (PR 2d-ligação); o estado continua chamando este nome */
export { montarLeitura as leituraParaTela } from './leitura.mjs';
