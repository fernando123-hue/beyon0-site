/* A geração GARANTIDA (17/11: o dono viu "Este modelo não saiu desta vez" no celular e exigiu que isso nunca aconteça):
   Opus, depois Sonnet, depois a direção montada pelo código. Sempre sai uma direção válida e conferida. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarDirecaoGarantida, TEMPO_DA_RESERVA_MS, PRAZO_GERACAO_MS } from '../../api/_vendas/gerador.mjs';
import { direcaoDeReserva, cortarNaFrase, MODELO_RESERVA_CODIGO } from '../../api/_vendas/reserva.mjs';
import { higienizar, ESTRATEGIAS } from '../../api/_vendas/direcao.mjs';
import { conferirDirecao, CONSELHOS } from '../../api/_vendas/conferencia-regulada.mjs';
import { criarSimulada } from '../../api/_ia/simulado.mjs';
import { ErroIA } from '../../api/_ia/provedor.mjs';

const BRIEFING = { negocio: { nome: 'Clínica Sorriso', segmento: 'odontologia', cidade: 'Niterói', descricao: 'Clínica odontológica familiar com foco em implantes. Atendemos de segunda a sábado.' },
  servicos: ['Implantes', 'Clareamento', 'Limpeza'], posicionamento: { diferenciais: ['Atendimento sem pressa'] }, funcionalidades: ['whatsapp'] };
const ESTRATEGIA = Object.keys(ESTRATEGIAS)[0];
const base = { briefing: BRIEFING, estrategia: ESTRATEGIA, numero: 1, fatores: { formato: 'institucional' } };

/* uma IA que registra os pedidos e responde pelo roteiro (cada item: uma função, ou um erro para lançar) */
function iaComRoteiro(roteiro) {
  const simulada = criarSimulada();
  const pedidos = [];
  return {
    pedidos,
    async mensagem(p) {
      pedidos.push({ papel: p.papel, reserva: p.reserva === true });
      const passo = roteiro[Math.min(pedidos.length - 1, roteiro.length - 1)];
      if (passo instanceof Error) throw passo;
      return passo ? passo(p) : simulada.mensagem(p);
    }
  };
}

test('o Opus respondeu: um chamada só, degrau opus, nada de reserva', async () => {
  const ia = iaComRoteiro([null]);
  const g = await gerarDirecaoGarantida({ ia, ...base });
  assert.equal(g.degrau, 'opus');
  assert.deepEqual(g.motivos, []);
  assert.deepEqual(ia.pedidos, [{ papel: 'geracao', reserva: false }]);
});

test('o Opus caiu (tempo esgotado): o Sonnet entrega, com a bandeira reserva no mesmo papel', async () => {
  const ia = iaComRoteiro([new ErroIA('tempo', 'demorou', 0.4), null]);
  const g = await gerarDirecaoGarantida({ ia, ...base });
  assert.equal(g.degrau, 'sonnet');
  assert.deepEqual(g.motivos, ['opus:tempo']);
  assert.deepEqual(ia.pedidos, [{ papel: 'geracao', reserva: false }, { papel: 'geracao', reserva: true }]);
  assert.ok(g.custo_usd >= 0.4, 'o gasto da chamada que caiu entra na conta');
});

test('a saída do Opus veio cortada ou fora do esquema: cai para o Sonnet, não para a tela', async () => {
  const cortada = async () => ({ json: { secoes: [] }, parada: 'fim', modelo: 'claude-opus-5-5', custo_usd: 0.3 });
  const ia = iaComRoteiro([cortada, null]);
  const g = await gerarDirecaoGarantida({ ia, ...base });
  assert.equal(g.degrau, 'sonnet');
  assert.match(g.motivos[0], /^opus:formato$/);
});

test('Opus e Sonnet caem: o código monta a direção; ela é válida e vem marcada como reserva', async () => {
  const ia = iaComRoteiro([new ErroIA('falha'), new ErroIA('tempo')]);
  const caidos = [];
  const g = await gerarDirecaoGarantida({ ia, ...base, aoCair: x => caidos.push(x.etapa + ':' + x.motivo) });
  assert.equal(g.degrau, 'codigo');
  assert.equal(g.modelo, MODELO_RESERVA_CODIGO);
  assert.deepEqual(g.motivos, ['opus:falha', 'sonnet:tempo']);
  assert.deepEqual(caidos, ['opus:falha', 'sonnet:tempo']);
  assert.ok(!higienizar(g.direcao, ESTRATEGIA).erro, 'passa de novo no higienizar');
  assert.equal(g.direcao.navegacao.marca, 'Clínica Sorriso');
});

test('sem tempo para o Sonnet (o Opus consumiu a janela): vai direto ao código', async () => {
  let t = 0;
  const agora = () => t;
  const ia = iaComRoteiro([async () => { t += PRAZO_GERACAO_MS - TEMPO_DA_RESERVA_MS + 5000; throw new ErroIA('tempo', 'x', 0.4); }]);
  const g = await gerarDirecaoGarantida({ ia, ...base, agora });
  assert.equal(g.degrau, 'codigo');
  assert.deepEqual(g.motivos, ['opus:tempo', 'sonnet:sem_tempo']);
  assert.equal(ia.pedidos.length, 1, 'não chamou o Sonnet sem tempo');
});

test('um erro do nosso próprio código no Opus também não chega ao visitante', async () => {
  const ia = iaComRoteiro([new TypeError('bug'), new TypeError('bug de novo')]);
  const g = await gerarDirecaoGarantida({ ia, ...base });
  assert.equal(g.degrau, 'codigo');
  assert.deepEqual(g.motivos, ['opus:interno', 'sonnet:interno']);
});

test('conta fora do ar (indisponivel) ou conteúdo recusado pelo conselho: o Sonnet não insiste, vai direto ao código', async () => {
  for (const erro of [new ErroIA('indisponivel'), new ErroIA('regras', 'fora da norma', 0.2)]) {
    const ia = iaComRoteiro([erro]);
    const g = await gerarDirecaoGarantida({ ia, ...base });
    assert.equal(g.degrau, 'codigo');
    assert.equal(ia.pedidos.length, 1, 'uma chamada só');
    assert.equal(g.motivos[1], 'sonnet:pulado');
  }
});

test('o custo já pago entra na conta mesmo quando o erro é do nosso código, não só do provedor', async () => {
  let n = 0;
  const ia = { async mensagem() { n++; if (n === 1) return { json: { secoes: [] }, parada: 'fim', modelo: 'claude-opus-5-5', custo_usd: 0.3 }; throw new Error('bug'); } };
  const g = await gerarDirecaoGarantida({ ia, ...base });
  assert.equal(g.degrau, 'codigo');
  assert.ok(g.custo_usd >= 0.3, 'o 0,30 da resposta inválida do Opus ficou na conta: ' + g.custo_usd);
});

test('o registro de quem chama nunca derruba a geração', async () => {
  const ia = iaComRoteiro([new ErroIA('tempo'), null]);
  const g = await gerarDirecaoGarantida({ ia, ...base, aoCair: () => { throw new Error('log quebrado'); } });
  assert.equal(g.degrau, 'sonnet');
});

/* o stream que nunca termina: o prazo da chamada INTEIRA vale (o timeout do SDK só cobre até os cabeçalhos) */
import { criarAnthropic } from '../../api/_ia/anthropic.mjs';
test('o stream do Opus que nunca termina é abortado no prazo e sai como "tempo", para o Sonnet entrar', async () => {
  let abortou = false;
  const cliente = { beta: { messages: { stream: () => ({ controller: { abort: () => { abortou = true; } }, finalMessage: () => new Promise(() => {}) }) } } };
  const ia = criarAnthropic({ ANTHROPIC_API_KEY: 'x' }, cliente, { geracao: { timeout_ms: 40 } });
  await assert.rejects(() => ia.mensagem({ papel: 'geracao', sistema: 's', mensagens: [{ role: 'user', content: 'oi' }] }), e => e instanceof ErroIA && e.motivo === 'tempo');
  assert.ok(abortou, 'a conexão foi cortada');
});

/* ---------- a direção de reserva ---------- */
const HOSTIS = [
  {},
  null,
  { negocio: { nome: '<script>alert(1)</script>', descricao: 'x'.repeat(5000) }, servicos: new Array(50).fill('<b>serviço</b>') },
  { negocio: { nome: '', segmento: 'lorem ipsum dolor', descricao: '  ' }, servicos: [null, 7, {}, 'ok'] },
  { negocio: { nome: 'Dr. Paulo', segmento: 'psicologia', descricao: 'Garantimos a cura. Depoimentos de pacientes. Promoção de 30% de desconto, R$ 100 a sessão.' }, servicos: ['antes e depois', 'consulta grátis', 'o melhor da cidade', 'parcelamos no Pix'], posicionamento: { diferenciais: ['resultado garantido', 'nunca perca'] } },
  { negocio: { nome: 'Escritório Silva', segmento: 'advocacia', descricao: 'Ganhamos todas as causas. Honorários a partir de R$ 500.' }, servicos: ['causas ganhas', 'consulta gratuita'] },
  /* o PRÓPRIO NOME do negócio esbarra na regra do conselho (revisões do PR 180: a reserva lançava erro e a garantia quebrava) */
  ...['Odontologia Popular Sorriso', 'Escritório Vitória Advogados', 'Clínica Mente Sã Preço Social', 'Clínica Os Melhores Médicos', 'Clínica Preço Justo',
    'Dr. Silva, o melhor dentista da cidade', 'Silva Advogados - Causas Ganhas', 'Cura Garantida Terapias', 'Clínica 100% Saúde', 'Consulta Gratuita Advocacia', 'Grátis Odonto']
    .map(nome => ({ negocio: { nome, segmento: 'saúde', descricao: 'Atendimento.' }, servicos: ['Consulta'] }))
];

test('propriedade: a reserva é válida para qualquer briefing, nas 3 estratégias, e passa no higienizar', () => {
  for (const b of HOSTIS) for (const e of Object.keys(ESTRATEGIAS)) {
    const r = direcaoDeReserva({ briefing: b, estrategia: e });
    assert.equal(r.modelo, MODELO_RESERVA_CODIGO);
    assert.equal(r.direcao.secoes[0].tipo, 'hero');
    assert.ok(r.direcao.secoes.length >= 3);
    assert.ok(!/[<>]/.test(JSON.stringify(r.direcao)), 'sem sinais de HTML');
    assert.ok(!higienizar(r.direcao, e).erro);
  }
});

test('propriedade: em qualquer nicho regulado a reserva passa na conferência do conselho, mesmo com o briefing cheio de promessas', () => {
  for (const chave of Object.keys(CONSELHOS)) for (const b of HOSTIS) for (const e of Object.keys(ESTRATEGIAS)) {
    const r = direcaoDeReserva({ briefing: b, estrategia: e, nicho: { chave }, hoje: '2026-11-17' });
    const c = conferirDirecao(r.direcao, { chave }, { hoje: '2026-11-17' });
    assert.ok(c.ok, chave + ': ' + JSON.stringify(c.falhas));
    assert.ok(!r.direcao.secoes.some(s => s.tipo === 'depoimentos' || s.tipo === 'numeros'));
  }
});

test('a reserva só usa o que a pessoa contou: nenhum número, depoimento ou nome inventado', () => {
  const r = direcaoDeReserva({ briefing: BRIEFING, estrategia: ESTRATEGIA });
  const texto = JSON.stringify(r.direcao);
  assert.ok(!/\d/.test(texto.replace(/#[0-9A-Fa-f]{6}/g, '')), 'nenhum número solto fora das cores');
  assert.ok(texto.includes('Implantes') && texto.includes('Clínica Sorriso'));
  assert.ok(!r.direcao.secoes.some(s => s.tipo === 'depoimentos' || s.tipo === 'numeros'));
});

test('cortarNaFrase: nunca corta no meio da palavra nem deixa parêntese aberto', () => {
  assert.equal(cortarNaFrase('Primeira frase curta. Segunda frase um pouco maior que passa do limite.', 40), 'Primeira frase curta.');
  assert.equal(cortarNaFrase('Texto sem ponto nenhum e bem comprido para cortar na palavra (bolo de pote', 40), 'Texto sem ponto nenhum e bem comprido');
  assert.equal(cortarNaFrase('curto', 40), 'curto');
});

/* ---------- a descrição de cada modelo (resumo): curta, direta, nunca cortada no meio ---------- */
import { resumoCurto, MAX_RESUMO } from '../../api/_vendas/direcao.mjs';

test('resumo: o parágrafo longo que o Opus escreveu vira no máximo 2 frases curtas, sem cortar no meio', () => {
  const longo = 'Uma direção sóbria e espaçosa que apresenta a Confeitaria da Sa Sa como um trabalho de cuidado, não como mais um cardápio. O topo fala do jeito de fazer. A página mostra os dois doces da casa, explica como encomendar e dá lugar de destaque a quem já provou. Tudo leva ao WhatsApp, o canal pelo qual os clientes já chegam. Os textos são escritos com as palavras que as pessoas digitam no Google (bolo de pote, doce para festa).';
  const r = resumoCurto(longo);
  assert.ok(r.length <= MAX_RESUMO, r.length + ': ' + r);
  assert.ok(/[.!?]$/.test(r), 'termina em frase inteira: ' + r);
  assert.ok(!/\(\w*$/.test(r), 'sem parêntese aberto');
  assert.ok((r.match(/[.!?](\s|$)/g) || []).length <= 2, 'até 2 frases');
});

test('resumo: curto fica como está; vazio, nulo e HTML não quebram', () => {
  assert.equal(resumoCurto('Mostra o que a loja faz e leva ao WhatsApp.'), 'Mostra o que a loja faz e leva ao WhatsApp.');
  assert.equal(resumoCurto(''), '');
  assert.equal(resumoCurto(null), '');
  assert.ok(!/[<>]/.test(resumoCurto('<b>oi</b> tudo bem?')));
});

test('o higienizar aplica o resumo curto na direção que vai à tela', () => {
  const base = direcaoDeReserva({ briefing: BRIEFING, estrategia: ESTRATEGIA }).direcao;
  const h = higienizar({ ...base, resumo: 'Frase um. '.repeat(40) }, ESTRATEGIA);
  assert.ok(h.direcao.resumo.length <= MAX_RESUMO);
  assert.ok(h.direcao.resumo.endsWith('.'));
});
