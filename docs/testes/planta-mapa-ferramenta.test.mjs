/* O mapa v3 na ferramenta, na gravação e na leitura (api/_vendas/planta.mjs; plano do PR 4 §5 a §7 e passo 6 do §8). O modelo só escreve v3 (o v2
   dele volta como "escreva no formato novo"); o "ajustado" só vale sobre um v3 já gravado; a 2ª falha grava o padrão DO CASO (origens e trava
   tocadas); o registro tem teto de bytes; a leitura revalida v2 e v3 pela chave e o v3 adulterado vira o padrão v3; a versão compacta que o modelo vê
   mantém os ids, cabe em 900 caracteres, corta rótulos e setas antes de nós e nunca leva frase. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverDesenho, turnoDaPlantaInicial, montarPlanta, plantaParaModelo, errosParaModelo, cabeNoRegistro, REGISTRO_BYTES_MAX, MAX_VERSOES, limparCacheDaPlanta } from '../../api/_vendas/planta.mjs';
import { planoDoCaso, oQueSeSabe } from '../../api/_vendas/mapa-padrao.mjs';
import { planoPadrao, nichoDaPlanta } from '../../api/_vendas/planta-padrao.mjs';

const CTX = { estimativaNoInicio: true, nMensagens: 2, regulado: false, nomeDoNegocio: '' };
const BRIEFING = { negocio: { segmento: 'clínica odontológica' }, situacao_atual: { como_chegam: 'Pelo Instagram; Por indicação', o_que_se_perde: 'Paciente marca e falta' } };
const desenhar = (entrada, briefing = BRIEFING, turno = turnoDaPlantaInicial()) => resolverDesenho({ entrada, briefing, turno, ctx: CTX });
const gravado = (plano, versao = 1) => ({ ...BRIEFING, planta: { v: 1, versao, origem: 'modelo', motivos: [], tentativas: 1, n_mensagens: 2, plano } });
const mapa = () => planoDoCaso('saude_agenda', oQueSeSabe(BRIEFING));

test('o modelo: o v3 bom é gravado; o v2 volta como "escreva no formato novo"', () => {
  const d = desenhar(mapa());
  assert.equal(d.saida.ok, true);
  assert.equal(d.briefing.planta.plano.estrutura, 'mapa', 'duas origens e a trava: várias forças');
  const v2 = desenhar(planoPadrao('saude_agenda'));
  assert.equal(v2.saida.ok, false);
  assert.match(v2.saida.erros.join(' '), /formato novo/);
  assert.equal(v2.briefing.planta, undefined);
});

test('a 2ª falha grava o padrão DO CASO (o nicho com as origens e a trava tocadas), não só o do nicho', () => {
  const ruim = mapa(); ruim.nos[0].titulo = 'Passo 1';
  const t1 = desenhar(ruim);
  const t2 = desenhar(ruim, BRIEFING, t1.turno);
  assert.equal(t2.saida.exemplo, true);
  assert.deepEqual(t2.briefing.planta.plano, planoDoCaso(nichoDaPlanta(BRIEFING), oQueSeSabe(BRIEFING)));
  assert.deepEqual(t2.briefing.planta.plano.hoje, { origens: ['instagram', 'indicacao'], trava: 'Paciente marca e falta' });
});

test('"ajustado": recusado sem um v3 anterior (o v3 que nasce de um v2 não leva "Ajustado"); aceito sobre um v3', () => {
  const ajuste = mapa(); ajuste.nos[5] = { ...ajuste.nos[5], papel: 'ajustado' };
  const semAnterior = desenhar(ajuste);
  assert.equal(semAnterior.saida.ok, false);
  assert.match(semAnterior.saida.erros.join(' '), /ajustado só num ajuste/);
  const sobreV2 = desenhar(ajuste, gravado(planoPadrao('saude_agenda')));
  assert.equal(sobreV2.saida.ok, false, 'sobre um v2 também não');
  const sobreV3 = desenhar(ajuste, gravado(mapa()));
  assert.equal(sobreV3.saida.ok, true, JSON.stringify(sobreV3.saida));
  assert.equal(sobreV3.briefing.planta.versao, 2);
});

test('o teto do registro: o maior plano válido cabe; acima de 8 KB não cabe (o desenho anterior fica)', () => {
  assert.equal(REGISTRO_BYTES_MAX, 8192);
  assert.equal(cabeNoRegistro({ v: 1, versao: MAX_VERSOES, plano: mapa() }), true);
  assert.equal(cabeNoRegistro({ v: 1, plano: { fecho: 'é'.repeat(4100) } }), false, '8.200 bytes em UTF-8');
  const ciclico = {}; ciclico.eu = ciclico;
  assert.equal(cabeNoRegistro(ciclico), false);
});

test('os erros ao modelo do v3: caminho por índice (nó, seta), regra legível, nunca o texto', () => {
  const msgs = errosParaModelo([{ caminho: 'nos[2].titulo', codigo: 'titulo_longo' }, { caminho: 'setas[4]', codigo: 'seta_ref' }, { caminho: 'hoje.texto', codigo: 'hoje_longo' }, { caminho: 'camadas[1]', codigo: 'camada_cheia' }]);
  assert.match(msgs[0], /^nó 3, título: título longo demais \(3 a 28/);
  assert.match(msgs[1], /^seta 5: seta que aponta/);
  assert.match(msgs[2], /hoje/);
  assert.match(msgs[3], /^passo 2: /);
});

test('a leitura: v2 gravado segue v2; v3 gravado sai revalidado; v3 adulterado vira o padrão v3 do caso', () => {
  limparCacheDaPlanta();
  const v2 = montarPlanta(gravado(planoPadrao('saude_agenda')));
  assert.equal(v2.origem, 'modelo'); assert.equal(v2.plano.topologia, 'laco');
  const v3 = montarPlanta(gravado(mapa()));
  assert.equal(v3.origem, 'modelo'); assert.equal(v3.plano.estrutura, 'mapa');
  const adulterado = mapa(); adulterado.setas.push({ de: 'site_x', para: 'objetivo', rotulo: 'vai' });
  const r = montarPlanta(gravado(adulterado));
  assert.equal(r.origem, 'padrao');
  assert.deepEqual(r.plano, planoDoCaso(nichoDaPlanta(BRIEFING), oQueSeSabe(BRIEFING)));
  const misto = montarPlanta(gravado({ ...mapa(), topologia: 'laco' }));
  assert.equal(misto.origem, 'padrao', 'as duas chaves juntas não valem');
});

test('a versão compacta do v3: ids mantidos, até 900 caracteres no pior caso, rótulos e setas cortados antes, nunca frase', () => {
  const p = mapa();
  const c = plantaParaModelo({ versao: 2, origem: 'modelo', plano: p });
  assert.equal(c.estrutura, 'mapa');
  assert.deepEqual(c.nos.map((n) => n[0]), p.nos.map((n) => n.id));
  assert.deepEqual(c.setas, p.setas.map((s) => [s.de, s.para, s.rotulo]));
  for (const n of p.nos) assert.ok(!JSON.stringify(c).includes(n.frase), 'frase vazou');
  /* o pior caso: 6 nós com id de 12 e título de 28, 9 setas com rótulo de 24 */
  const pior = { estrutura: 'mapa', hoje: { origens: ['instagram', 'whatsapp', 'google_busca'] }, objetivo: { titulo: 'o'.repeat(28), frase: 'f'.repeat(60) },
    nos: Array.from({ length: 6 }, (_, i) => ({ id: 'abcdefghijk' + i, papel: 'site', icone: 'pagina', titulo: 't'.repeat(27) + i, frase: 'x'.repeat(60) })),
    setas: Array.from({ length: 9 }, (_, i) => ({ de: 'abcdefghijk' + (i % 6), para: 'objetivo', rotulo: 'r'.repeat(23) + i })) };
  const cp = plantaParaModelo({ versao: 6, origem: 'modelo', plano: pior });
  assert.ok(JSON.stringify(cp).length <= 900, String(JSON.stringify(cp).length));
  assert.equal(cp.nos.length, 6, 'os nós nunca são cortados');
  assert.ok(cp.setas.every((s) => s.length === 2) || cp.setas.length === 9, 'primeiro saem os rótulos');
  /* acima do limite (o corte de verdade: o pior caso válido nem chega lá): saem os rótulos, depois setas do fim; os 6 nós ficam */
  const enorme = { ...pior, setas: Array.from({ length: 30 }, (_, i) => ({ de: 'abcdefghijk' + (i % 6), para: 'objetivo', rotulo: 'r'.repeat(23) + (i % 10) })) };
  const ce = plantaParaModelo({ versao: 6, origem: 'modelo', plano: enorme });
  assert.ok(JSON.stringify(ce).length <= 900, String(JSON.stringify(ce).length));
  assert.equal(ce.nos.length, 6);
  assert.ok(ce.setas.length > 0 && ce.setas.length < 30 && ce.setas.every((s) => s.length === 2), 'sem rótulo e com menos setas');
});
