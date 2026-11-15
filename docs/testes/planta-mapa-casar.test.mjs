/* O VOO DO ESBOÇO PARA O MAPA DO CASO (PR 5b, tarefa 5; desenho docs/superpowers/specs/2026-11-14-mapa-desenho-design.md §9): BZPlantaCresce.casarMapa
   leva cada estação que a pessoa viu nascer ao nó do plano v3 que conta a MESMA parte da história. Diferente do v2, a estação sem par não voa para
   o 1º nó livre (lá ela caía num nó sem relação): ela some na luz. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { planoDoCaso } from '../../api/_vendas/mapa-padrao.mjs';

const require = createRequire(import.meta.url);
const Cresce = require('../../js/planta-cresce.js');

const BRIEF = {
  negocio: { segmento: 'clínica', descricao: 'Clínica odontológica' },
  situacao_atual: { como_chegam: 'Pelo Instagram e por indicação', o_que_se_perde: 'muita gente pergunta e some' },
  objetivos: ['agendamentos'], funcionalidades: ['agendamento', 'whatsapp']
};
const no = (id, papel, extra = {}) => ({ id, papel, icone: 'pagina', titulo: 'Título ' + id, frase: 'Uma frase de tamanho bom aqui', ...extra });

test('casarMapa: chegada vai à 1ª origem; o que trava, à trava; página ao site; ação à ação; a volta (WhatsApp) à conversa', () => {
  const esb = Cresce.derivar(BRIEF);
  const plano = { estrutura: 'mapa', nos: [no('o1', 'origem', { origem: 'instagram' }), no('o2', 'origem', { origem: 'indicacao' }), no('tr', 'trava'), no('si', 'site'), no('ag', 'acao'), no('zap', 'conversa')] };
  assert.deepEqual({ ...Cresce.casarMapa(esb, plano) }, { chegada: 'o1', conversa: 'tr', pagina: 'si', acao: 'ag', volta: 'zap' });
});

test('casarMapa: sem trava, o que trava vai à conversa; a volta pega a "volta" quando a conversa já foi usada', () => {
  const esb = Cresce.derivar(BRIEF);
  const plano = { estrutura: 'ciclo', nos: [no('o1', 'origem', { origem: 'instagram' }), no('cv', 'conversa'), no('si', 'site'), no('ag', 'acao'), no('vt', 'volta')] };
  assert.deepEqual({ ...Cresce.casarMapa(esb, plano) }, { chegada: 'o1', conversa: 'cv', pagina: 'si', acao: 'ag', volta: 'vt' });
});

test('casarMapa: a estação sem par NÃO voa (some na luz): nada de "1º nó livre"', () => {
  const esb = Cresce.derivar(BRIEF);
  const plano = { estrutura: 'caminho', nos: [no('si', 'site'), no('ag', 'acao')] };
  const m = Cresce.casarMapa(esb, plano);
  assert.deepEqual({ ...m }, { pagina: 'si', acao: 'ag' });
  assert.equal(Object.getPrototypeOf(m), null, 'mapa sem protótipo');
});

test('casarMapa: só estações conhecidas; o esboço vazio não casa nada; entradas estranhas não lançam', () => {
  const vazio = Cresce.derivar({});
  const plano = planoDoCaso('saude_agenda', { origens: ['instagram'] });
  assert.deepEqual(Object.keys(Cresce.casarMapa(vazio, plano)), ['chegada'], 'a chegada provisória também voa (ela está na tela)');
  for (const [e, p] of [[null, null], [vazio, null], [null, plano], [vazio, { nos: 'x' }], [{ estacoes: 'x' }, plano]]) assert.deepEqual(Object.keys(Cresce.casarMapa(e, p)), []);
  const estranho = { estrutura: 'caminho', nos: [no('__proto__', 'site'), no('constructor', 'acao')] };
  const m = Cresce.casarMapa(Cresce.derivar(BRIEF), estranho);
  assert.equal(m.pagina, '__proto__', 'id estranho só vira valor, sem tocar protótipo');
  assert.equal(m.acao, 'constructor');
});

test('cada nó recebe no máximo uma estação, e só ids do plano saem', () => {
  for (const chave of ['saude_agenda', 'servico_orcamento', 'loja_online', 'generico']) {
    const plano = planoDoCaso(chave, { origens: ['instagram', 'indicacao'], trava: 'pergunta_e_some', travaRotulo: 'Muita gente pergunta e some' });
    const ids = plano.nos.map((n) => n.id);
    const valores = Object.values(Cresce.casarMapa(Cresce.derivar(BRIEF), plano));
    assert.equal(new Set(valores).size, valores.length, chave + ': um nó, uma estação');
    for (const v of valores) assert.ok(ids.includes(v), chave + ': ' + v);
  }
});

test('a ligação do esboço usa casarMapa quando o plano tem "estrutura" (v3), e casar no v2', () => {
  const fonte = fs.readFileSync(new URL('../../js/orcamento-planta-esboco.js', import.meta.url), 'utf8');
  assert.match(fonte, /typeof plano\.estrutura === 'string' \? Cresce\.casarMapa\(I\.esboco, plano\) : Cresce\.casar\(I\.esboco, plano\)/);
});
