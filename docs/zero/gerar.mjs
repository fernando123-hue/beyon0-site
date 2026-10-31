/* ==========================================================================
   GERA os arquivos do Zero que o time de teste usa para SIMULAR a conversa:
     docs/zero/prompt-efetivo.txt  o prompt de sistema EXATO (como o código o monta e envia), o estado de exemplo, as
                                   ferramentas em prosa e o que o código faz com a resposta;
     docs/zero/abertura.txt        a primeira fala fixa, as variantes por página e a etiqueta.
   Os dois nascem do código (consultor.mjs, agente.mjs, zero.mjs, config.mjs) com a tabela oficial de preços
   (docs/fase2/regras-rascunho-v1.json): nada é escrito à mão. docs/testes/zero.test.mjs falha se os arquivos
   gravados saírem do que o código monta. Para atualizar:   node docs/zero/gerar.mjs
   ========================================================================== */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { montarSistema, ferramentas } from '../../api/_vendas/consultor.mjs';
import { estadoParaModelo } from '../../api/_vendas/agente.mjs';
import { PAPEIS, TETOS } from '../../api/_ia/config.mjs';
import { ABERTURAS, ETIQUETA, RECADO_FIXO } from '../../api/_vendas/zero.mjs';

const REGRAS = JSON.parse(fs.readFileSync(new URL('../fase2/regras-rascunho-v1.json', import.meta.url), 'utf8'));
/* o modo das direções e a forma de pagamento do ar: manual (o dono produz os modelos, até haver verba) e só Pix */
const OPCOES = { direcoes: 'manual', metodos: ['pix'] };
const MAX_HISTORICO = 12, MAX_RODADAS = 4;

const tipoDe = v => {
  if (Array.isArray(v.enum)) return 'um de: ' + v.enum.join(', ');
  if (v.type === 'object') return 'objeto com ' + camposDe(v);
  if (v.type === 'array') return 'lista de ' + (v.items?.enum ? 'itens entre: ' + v.items.enum.join(', ') : v.items?.type === 'string' ? 'textos' : 'itens');
  const t = { string: 'texto', integer: 'número inteiro', boolean: 'sim ou não', number: 'número' }[v.type] || v.type;
  return t + (v.description ? ' (' + v.description + ')' : '');
};
function camposDe(esquema) {
  const props = Object.entries(esquema.properties || {});
  if (!props.length) return 'nenhum campo';
  const obrig = new Set(esquema.required || []);
  return props.map(([k, v]) => `${k}${obrig.has(k) ? ' (obrigatório)' : ''}: ${tipoDe(v)}`).join('; ');
}

/* o que o código devolve ao modelo depois de cada ferramenta (agente.mjs): para a simulação ser fiel */
const RESULTADOS = {
  atualizar_briefing: 'devolve ok, a confiança do briefing, o que ainda falta e o proximo_passo recalculado.',
  estimar: 'devolve o prazo em dias úteis, a fase, os itens e o valor como instrução de usar os marcadores [[total]], [[sinal]] e [[restante]] (o número nunca chega ao modelo), mais o proximo_passo. Se faltar algo ou o pedido for inválido, devolve os erros; se o caso for grande demais ou fora da tabela, devolve encaminhar_diagnostico.',
  pedir_contato: 'devolve ok se já existe estimativa; senão pede para estimar antes. O formulário aparece na tela.',
  sugerir_solucao_ia: 'devolve ok. A ideia vai para o briefing.',
  encaminhar_diagnostico: 'devolve só que o botão DEIXAR UM RECADO apareceu na tela e que nada foi enviado a ninguém.'
};

export function montarPromptEfetivo() {
  const sistema = montarSistema(REGRAS, OPCOES);
  const estado = estadoParaModelo({ briefing: {}, estimativa: null, etapa: 'descoberta', regras: REGRAS, metodos: OPCOES.metodos });
  const conv = PAPEIS.conversa;
  const ferr = ferramentas(REGRAS).map(f => `${f.name}\n${f.description}\nCampos: ${camposDe(f.input_schema)}.\nResultado: ${RESULTADOS[f.name]}`).join('\n\n');
  return `PROMPT EFETIVO DO ZERO
Gerado por docs/zero/gerar.mjs a partir do código. Não edite à mão: o teste docs/testes/zero.test.mjs confere este arquivo.
Modelo da conversa: ${conv.modelo}, esforço ${conv.esforco} (a extração do briefing roda no Haiku 5.5). Tabela de preços: a oficial (docs/fase2/regras-rascunho-v1.json). Modo das três direções: ${OPCOES.direcoes}. Pagamento: só Pix.

======== 1. PROMPT DE SISTEMA (enviado como está, igual em todo turno; começa na próxima linha e termina na linha FIM) ========
${sistema}
======== FIM DO PROMPT DE SISTEMA ========

======== 2. BLOCO DE ESTADO (segundo bloco do sistema, muda a cada turno; este é o do primeiro turno) ========
${estado}
======== FIM DO BLOCO DE ESTADO ========
Nos turnos seguintes, "etapa", "proximo_passo", "confianca", "ainda_falta" e "estimativa_mostrada" mudam, e o briefing cresce. Em conversa de saúde ou advocacia o código acrescenta ao estado a chave "saude_regulada" (conselho, o que nunca prometer, o que cabe). O texto da pessoa vai como mensagem de usuário, com e-mail, telefone, CPF e cartão trocados por marcadores. O modelo vê as últimas ${MAX_HISTORICO} mensagens e pode usar até ${MAX_RODADAS} rodadas de ferramenta por turno.

======== 3. FERRAMENTAS (o modelo recebe o nome, esta descrição e o formato dos campos) ========
${ferr}
======== FIM DAS FERRAMENTAS ========
Por etapa: até o envio dos detalhes do pedido o modelo tem as cinco ferramentas; depois dele perde estimar e pedir_contato; no escopo e no pagamento não tem nenhuma e só tira dúvidas.

======== 4. O QUE O CÓDIGO FAZ COM A RESPOSTA DO MODELO (a simulação deve aplicar o mesmo) ========
Nesta ordem, sobre o texto que vai para a tela:
a) Todo valor em reais que o modelo digitar por conta própria ("R$ 1.000", "2 mil reais", "dois mil reais") é apagado.
b) No escopo e no pagamento, resposta que dê o pagamento como feito, mude condição, cite valor ou mande pagar por outro meio vira uma frase fixa. A pergunta que pede isso nem chega ao modelo.
c) Frase que diga que deixou, enviou, avisou, anotou ou encaminhou algo a alguém, ou que prometa prazo de resposta, é trocada por: "${RECADO_FIXO}" O botão DEIXAR UM RECADO aparece junto.
d) Se a conversa indica saúde ou advocacia (pelo briefing, pelas mensagens ou pela de agora) e a resposta libera depoimento, antes e depois, preço ou promoção de procedimento, ou foge de recusar quando a pessoa pediu, a resposta vira o texto fixo de recusa com o conselho certo (CRO, CRM, CRP, CRN, CREFITO, OAB). Se a pessoa insiste, vira uma frase curta com o recado. Veterinária e estética automotiva não travam. "Depoimentos" não entra no briefing desses negócios.
e) Por último, [[total]], [[sinal]] e [[restante]] viram o número exato da estimativa (por exemplo "R$ 2.900"). Sem estimativa válida, a frase com marcador sai e entra: "Esse valor eu ainda não tenho aqui. ${RECADO_FIXO}"
A resposta é cortada em 1.500 caracteres. A primeira fala do Zero é fixa e não chama o modelo (ver abertura.txt).

======== 5. LIMITES DE CUSTO ========
Por conversa: US$ ${TETOS.conversa_usd}; por dia, no total: US$ ${TETOS.dia_usd}; até ${TETOS.turnos_por_conversa} turnos por conversa.
`;
}

export function montarAbertura() {
  return `ABERTURA DO ZERO
Gerado por docs/zero/gerar.mjs a partir do código (api/_vendas/zero.mjs). Texto fixo e aprovado: a tela o mostra sem chamar o modelo, e o modelo o recebe no estado como "a_pessoa_ja_viu".

Etiqueta fixa ao lado do nome, em toda tela de conversa:
${ETIQUETA}

Primeira fala, padrão:
${ABERTURAS.padrao}

Variantes por página de origem (mesma estrutura, só a pergunta muda):
Página de sites:
${ABERTURAS.sites}
Página do atendente de IA:
${ABERTURAS.atendente}
Quem volta com orçamento salvo (qualquer texto vindo do aparelho é escapado antes de aparecer na tela):
${ABERTURAS.retorno}
`;
}

/* rodado direto (node docs/zero/gerar.mjs) grava os arquivos; importado pelo teste, só expõe as funções */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fs.writeFileSync(new URL('./prompt-efetivo.txt', import.meta.url), montarPromptEfetivo());
  fs.writeFileSync(new URL('./abertura.txt', import.meta.url), montarAbertura());
  console.log('gravados: docs/zero/prompt-efetivo.txt e docs/zero/abertura.txt');
}
