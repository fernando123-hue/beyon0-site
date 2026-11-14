/* O mapa padrão do caso, v3 (api/_vendas/mapa-padrao.mjs; plano do PR 4 §7 e passo 5 do §8): composto só do que se sabe, sem acaso. Todo padrão
   passa no MESMO validador do plano do modelo (com as travas), em todos os nichos, regulado ou não; as 5 estruturas são alcançáveis; a mesma
   entrada dá o mesmo mapa; sem rótulo tocado não há texto nem trava no "hoje"; oQueSeSabe lê os rótulos e o texto livre com a guarda de negação. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { planoDoCaso, oQueSeSabe, CHAVES_DO_MAPA } from '../../api/_vendas/mapa-padrao.mjs';
import { validarPlano } from '../../api/_vendas/planta-esquema.mjs';

const require = createRequire(import.meta.url);
const M = require('../../js/orcamento-mapa-forma.js');
const R = require('../../js/orcamento-rotulos.js');
const TRAVAS = Object.entries(R.SUGESTOES).filter(([, s]) => s.campo === 'o_que_se_perde');
const SABERES = [
  { origens: [], trava: null },
  { origens: ['instagram'], trava: null },
  { origens: ['google_busca', 'indicacao'], trava: null },
  { origens: ['google_mapa', 'passa_na_frente', 'whatsapp'], trava: null },
  ...TRAVAS.map(([cod, s]) => ({ origens: [], trava: cod, travaRotulo: s.rotulo })),
  ...TRAVAS.map(([cod, s]) => ({ origens: ['indicacao'], trava: cod, travaRotulo: s.rotulo })),
  ...TRAVAS.map(([cod, s]) => ({ origens: ['instagram', 'site_atual'], trava: cod, travaRotulo: s.rotulo })),
  ...M.ORIGENS_MAPA.map((o) => ({ origens: [o, 'outro'].filter((x, i, a) => a.indexOf(x) === i), trava: null }))
];

test('as 8 bases, com toda combinação de origem e trava, passam no validador inteiro (com as travas), regulado ou não', () => {
  assert.equal(CHAVES_DO_MAPA.length, 8);
  for (const chave of CHAVES_DO_MAPA) {
    for (const saber of SABERES) {
      for (const regulado of [false, true]) {
        const p = planoDoCaso(chave, saber);
        const r = validarPlano(p, { versoes: ['v3'], regulado });
        assert.equal(r.ok, true, chave + ' ' + JSON.stringify(saber) + (regulado ? ' regulado' : '') + ': ' + JSON.stringify(r.erros));
      }
    }
  }
});

test('as 5 estruturas são alcançáveis, e a escolha segue o guia: trava = antes_depois; 2 origens + trava = mapa; senão a do nicho', () => {
  const vistas = new Set();
  for (const chave of CHAVES_DO_MAPA) for (const saber of SABERES) vistas.add(planoDoCaso(chave, saber).estrutura);
  assert.deepEqual([...vistas].sort(), [...M.ESTRUTURAS].sort());
  const trava = { origens: ['indicacao'], trava: 'falta_consulta', travaRotulo: 'Paciente marca e falta' };
  assert.equal(planoDoCaso('saude_agenda', {}).estrutura, 'ciclo');
  assert.equal(planoDoCaso('saude_agenda', trava).estrutura, 'antes_depois', 'a trava muda a estrutura');
  assert.equal(planoDoCaso('saude_agenda', { ...trava, origens: ['instagram', 'indicacao'] }).estrutura, 'mapa');
  assert.equal(planoDoCaso('loja_online', {}).estrutura, 'ramos');
  assert.equal(planoDoCaso('alimentacao', {}).estrutura, 'caminho');
  assert.equal(planoDoCaso('chave-que-nao-existe', {}).estrutura, 'caminho', 'desconhecida: o genérico');
  assert.equal(planoDoCaso('constructor', {}).estrutura, 'caminho');
});

test('mesma entrada, mesmo mapa (nada de acaso no arquivo); quem recebe pode mexer sem estragar o próximo', () => {
  const src = fs.readFileSync(new URL('../../api/_vendas/mapa-padrao.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random|Date|new Date|performance\.now/);
  const saber = { origens: ['instagram', 'indicacao'], trava: 'pergunta_e_some', travaRotulo: 'Muita gente pergunta e some' };
  assert.deepEqual(planoDoCaso('educacao', saber), planoDoCaso('educacao', saber));
  const a = planoDoCaso('educacao', saber); a.nos[0].titulo = 'mexido';
  assert.notEqual(planoDoCaso('educacao', saber).nos[0].titulo, 'mexido');
});

test('o "hoje" só com o que se sabe: sem rótulo, sem texto nem trava; sem nada, o mapa vai sem "hoje"', () => {
  assert.equal('hoje' in planoDoCaso('generico', {}), false);
  const so = planoDoCaso('generico', { origens: ['indicacao'] });
  assert.deepEqual(so.hoje, { origens: ['indicacao'] });
  const sem = planoDoCaso('generico', { trava: 'falta_consulta' });
  assert.equal(sem.hoje, undefined, 'trava sem o rótulo tocado: nada no hoje');
  const com = planoDoCaso('generico', { trava: 'falta_consulta', travaRotulo: 'Paciente marca e falta' });
  assert.equal(com.hoje.trava, 'Paciente marca e falta');
  assert.equal(com.hoje.texto, undefined, 'texto do hoje nunca é inventado');
  for (const p of [so, com]) for (const n of p.nos) if (n.papel === 'origem') assert.ok(p.hoje.origens.includes(n.origem));
});

test('oQueSeSabe: os rótulos tocados, o texto livre com negação, google como busca e mapa só quando dito; trava só pelo rótulo exato', () => {
  const tocados = oQueSeSabe({ situacao_atual: { como_chegam: 'Pelo Instagram; Me acham no Google', o_que_se_perde: 'Muita gente pergunta e some' } });
  assert.deepEqual(tocados, { origens: ['instagram', 'google_busca'], trava: 'pergunta_e_some', travaRotulo: 'Muita gente pergunta e some' });
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'me acham pelo google maps e por indicação' } }).origens, ['google_mapa', 'indicacao']);
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'não uso instagram, vem tudo do boca a boca' } }).origens, ['indicacao'], 'a negação anula');
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'chamam no zap e passam na frente' } }).origens, ['whatsapp', 'passa_na_frente']);
  /* (revisão técnica do PR 4) a negação fica na oração dela: a vírgula, o ponto, "mas" e "só" a fecham */
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'Não tenho site, só WhatsApp e Instagram' } }).origens, ['instagram', 'whatsapp']);
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'nao uso instagram, so whatsapp' } }).origens, ['whatsapp']);
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'não uso instagram só whatsapp' } }).origens, ['whatsapp'], 'sem vírgula, o "só" fecha a oração');
  /* (re-revisão) o "nem" continua a negação depois da vírgula */
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'Não uso Instagram, nem WhatsApp' } }).origens, []);
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'Não tenho Instagram, nem site, nem Google, só indicação' } }).origens, ['indicacao']);
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'não uso instagram, mas o instagram é o principal' } }).origens, ['instagram'], 'outra ocorrência, sem negação, vale');
  /* a regra do google antes do corte de 3: a busca que sai não toma a vaga de uma origem real */
  assert.deepEqual(oQueSeSabe({ situacao_atual: { como_chegam: 'whatsapp, google maps, indicação' } }).origens, ['whatsapp', 'google_mapa', 'indicacao']);
  assert.equal(oQueSeSabe({ situacao_atual: { o_que_se_perde: 'cliente marca e não aparece' } }).trava, null, 'texto livre da trava não é lido');
  assert.ok(oQueSeSabe({ situacao_atual: { como_chegam: 'instagram, whatsapp, google, indicação, fachada' } }).origens.length <= 3);
  for (const b of [null, 1, 'x', {}, { situacao_atual: null }, { situacao_atual: { como_chegam: 5 } }]) assert.deepEqual(oQueSeSabe(b), { origens: [], trava: null, travaRotulo: '' });
});
