/* A forma do mapa do caso, v3 (js/orcamento-mapa-forma.js; plano docs/superpowers/plans/2026-11-13-pr4-composicao-servidor.md §2 a §4, passo 2 do §8).
   Os 15 planos do laboratório (3 casos × 5 estruturas, docs/lab-estruturas-casos.js) e o caso "limites" passam; cada regra recusa a sabotagem
   dela com o código certo; nada lança; as listas batem com as do desenho. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../../js/orcamento-mapa-forma.js');
const PECAS = require('../../js/planta-pecas.js');
const ler = (rel) => fs.readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(ler('docs/lab-estruturas-casos.js'), ctx);
const CASOS = JSON.parse(JSON.stringify(ctx.window.LAB_ESTRUTURAS_CASOS));

const plano = (caso, est) => ({ estrutura: est, hoje: caso.hoje, nos: caso.estruturas[est].nos, setas: caso.estruturas[est].setas, objetivo: caso.objetivo, fecho: caso.fecho });
const copia = (v) => JSON.parse(JSON.stringify(v));
const motivos = (p) => F.validarFormaMapa(p).motivos;
const base = () => copia(plano(CASOS.clinica, 'caminho'));

test('os 15 planos do laboratório e o caso "limites" passam na forma, nas 5 estruturas', () => {
  for (const [nome, caso] of Object.entries(CASOS)) {
    for (const est of F.ESTRUTURAS) {
      const r = F.validarFormaMapa(plano(caso, est));
      assert.equal(r.ok, true, nome + '/' + est + ': ' + JSON.stringify(r.erros));
    }
  }
});

test('as listas: ícones iguais aos desenhos de hoje; as origens da sugestão e do v2 caem na lista do mapa', () => {
  assert.deepEqual([...F.ICONES].sort(), [...PECAS.TIPOS].sort());
  for (const v of Object.values(F.ORIGEM_DA_SUGESTAO)) assert.ok(F.ORIGENS_MAPA.includes(v), v);
  for (const v of Object.values(F.ORIGEM_DO_V2)) assert.ok(F.ORIGENS_MAPA.includes(v), v);
  assert.equal(F.ORIGEM_DA_SUGESTAO.google, 'google_busca', '"Me acham no Google" é a busca');
  assert.equal(Object.prototype.hasOwnProperty.call(F.ORIGEM_DA_SUGESTAO, 'constructor'), false);
});

test('o grafo: 6 camadas, 3 na mesma camada, volta fora do ciclo, pulo por cima de caixa', () => {
  const longo = base();
  longo.nos = [1, 2, 3, 4, 5].map((i) => ({ id: 'n' + i, papel: 'site', icone: 'pagina', titulo: 'Passo número ' + 'abcde'[i - 1], frase: 'Uma frase com tamanho suficiente aqui' }));
  longo.setas = [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'objetivo']].map(([de, para]) => ({ de, para, rotulo: 'segue' }));
  longo.hoje = { origens: [], texto: 'chamam no direct e tiro dúvida' };
  assert.deepEqual(motivos(longo), ['camadas'], '5 nós em fila + o objetivo = 6 camadas');

  const largo = copia(plano(CASOS.clinica, 'mapa'));
  largo.nos.push({ id: 'extra', papel: 'origem', origem: 'instagram', icone: 'chegada', titulo: 'Outra origem', frase: 'Mais uma chegando pela mesma camada' });
  largo.setas.push({ de: 'extra', para: 'pagina', rotulo: 'chega por' });
  assert.ok(motivos(largo).includes('origens_nos') || motivos(largo).includes('camada_cheia'));
  const tres = copia(plano(CASOS.clinica, 'mapa'));
  tres.nos[2] = { id: 'direct', papel: 'site', icone: 'pagina', titulo: 'Pergunta no direct', frase: 'Dúvida e horário saem um por um, na mão' };
  tres.nos.splice(1, 1); tres.setas = tres.setas.filter((s) => s.de !== 'indica');
  tres.nos.push({ id: 'x1', papel: 'site', icone: 'pagina', titulo: 'Caixa um', frase: 'Uma frase com tamanho suficiente aqui' });
  tres.setas.push({ de: 'perfil', para: 'x1', rotulo: 'vai' }, { de: 'x1', para: 'pagina', rotulo: 'vai' }, { de: 'perfil', para: 'noite', rotulo: 'vai' });
  assert.ok(motivos(tres).includes('camada_cheia'), '3 nós na mesma camada: ' + motivos(tres));

  const volta = base();
  volta.setas.push({ de: 'horario', para: 'perfil', rotulo: 'volta' });
  assert.ok(motivos(volta).includes('seta_para_origem'));
  const volta2 = base();
  volta2.setas.push({ de: 'horario', para: 'pagina', rotulo: 'volta' });
  assert.ok(motivos(volta2).includes('volta'), 'volta no caminho: ' + motivos(volta2));

  const pulo = base();
  pulo.setas.push({ de: 'perfil', para: 'horario', rotulo: 'pula' });
  assert.ok(motivos(pulo).includes('pulo') || motivos(pulo).includes('caminho_divide'), String(motivos(pulo)));
  const puloRamos = copia(plano(CASOS.clinica, 'ramos'));
  puloRamos.setas.push({ de: 'perfil', para: 'objetivo', rotulo: 'pula' });
  assert.ok(motivos(puloRamos).includes('pulo'), 'pulo por cima da página e dos ramos: ' + motivos(puloRamos));
});

test('ids e referências: __proto__, objetivo, repetido, para inexistente, seta para si, repetida, o objetivo que sai fora do ciclo', () => {
  const proto = base(); proto.nos[1].id = '__proto__';
  assert.ok(motivos(proto).includes('id_no') || motivos(proto).includes('id_reservado'));
  const obj = base(); obj.nos[1].id = 'objetivo';
  assert.ok(motivos(obj).includes('id_reservado'));
  const rep = base(); rep.nos[2].id = 'pagina';
  assert.ok(motivos(rep).includes('id_repetido'));
  const fantasma = base(); fantasma.setas[0].para = 'nada';
  assert.deepEqual(motivos(fantasma), ['seta_ref']);
  const propria = base(); propria.setas[0].para = 'perfil';
  assert.ok(motivos(propria).includes('seta_propria'));
  const repetida = base(); repetida.setas.push(copia(repetida.setas[0]));
  assert.ok(motivos(repetida).includes('seta_repetida'));
  const sai = base(); sai.setas.push({ de: 'objetivo', para: 'pagina', rotulo: 'volta' });
  assert.ok(motivos(sai).includes('objetivo_sai'));
});

test('origens: só no papel origem, da lista, e sempre uma das que estão no "hoje"', () => {
  const fora = base(); fora.nos[0].origem = 'tiktok';
  assert.deepEqual(motivos(fora), ['origem_fora_do_hoje']);
  const inventada = base(); inventada.nos[0].origem = 'outdoor';
  assert.deepEqual(motivos(inventada), ['origem']);
  const solta = base(); solta.nos[1].origem = 'instagram';
  assert.ok(motivos(solta).includes('origem'));
  const hojeRuim = base(); hojeRuim.hoje = { origens: ['instagram', 'instagram'] };
  assert.ok(motivos(hojeRuim).includes('origem'));
  const vazio = base(); vazio.hoje = { origens: [] }; vazio.nos[0] = { id: 'perfil', papel: 'site', icone: 'pagina', titulo: 'Vê o perfil e se interessa', frase: 'Chega pelo link do perfil, curiosa' };
  assert.deepEqual(motivos(vazio), ['hoje_vazio']);
  const sem = base(); delete sem.hoje; sem.nos[0] = vazio.nos[0];
  assert.equal(F.validarFormaMapa(sem).ok, true, 'sem o hoje (o padrão sem nada conhecido): vale');
});

test('as regras por estrutura: ramos sem divisão, antes_depois sem trava, mapa pequeno, caminho que se divide', () => {
  const ramos = copia(plano(CASOS.clinica, 'caminho')); ramos.estrutura = 'ramos';
  assert.ok(motivos(ramos).includes('ramos'));
  const ad = copia(plano(CASOS.clinica, 'antes_depois'));
  ad.nos[1].papel = 'hoje';
  assert.ok(motivos(ad).includes('antes_depois'));
  const mapa = copia(plano(CASOS.clinica, 'caminho')); mapa.estrutura = 'mapa';
  assert.ok(motivos(mapa).includes('mapa'));
  const div = copia(plano(CASOS.clinica, 'ramos')); div.estrutura = 'caminho';
  assert.ok(motivos(div).includes('caminho_divide'));
  const ciclo = copia(plano(CASOS.clinica, 'caminho')); ciclo.estrutura = 'ciclo';
  assert.ok(motivos(ciclo).includes('volta'), 'ciclo sem a volta');
});

test('textos e contagens: tamanhos, caractere proibido, nós de 2 a 6, setas de 1 a 9, as duas versões juntas', () => {
  const t = base(); t.nos[0].titulo = 'x'.repeat(29); t.nos[1].frase = 'curta'; t.setas[0].rotulo = 'r'.repeat(25); t.fecho = 'f'.repeat(81);
  assert.deepEqual(motivos(t).sort(), ['fecho_longo', 'frase_curta', 'rotulo', 'titulo_longo'].sort());
  const c = base(); c.objetivo.titulo = 'Avaliação <b>';
  assert.ok(motivos(c).includes('caractere'));
  const um = base(); um.nos = um.nos.slice(0, 1);
  assert.ok(motivos(um).includes('nos_qtd'));
  const v = base(); v.topologia = 'laco';
  assert.ok(motivos(v).includes('versao'));
  const extra = base(); extra.nos[0].cor = 'red';
  assert.ok(motivos(extra).includes('chave_extra'));
  const grande = base(); grande.fecho = 'a'.repeat(7000);
  assert.deepEqual(motivos(grande), ['grande']);
});

test('nunca lança e não toca no bruto', () => {
  for (const v of [null, undefined, 1, 'x', [], {}, { nos: 'x', setas: {} }, { estrutura: 'ciclo', nos: [null], setas: [null] }]) {
    const r = F.validarFormaMapa(v);
    assert.equal(r.ok, false);
  }
  const ciclico = base(); ciclico.eu = ciclico;
  assert.deepEqual(F.validarFormaMapa(ciclico).motivos, ['nao_serializavel']);
  const b = base(); const antes = JSON.stringify(b);
  F.validarFormaMapa(b);
  assert.equal(JSON.stringify(b), antes);
});
