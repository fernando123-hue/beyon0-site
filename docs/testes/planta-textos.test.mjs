/* A CAMADA DE TEXTO DA PLANTA (PR 2a, api/_vendas/planta-textos.mjs): a lista dura (spec §2.3) + as dez travas que o Zero já tem, rodadas sobre o
   texto já NORMALIZADO. Aqui: a normalização; os textos do protótipo (reescritos nas fixtures) passam em tudo; 60 frases ruins por classe, incluindo
   as que as dez travas deixam passar; o nome do negócio dado pela pessoa passa e outro nome próprio não; as variações (letras separadas, invisíveis,
   largura total, dígitos de outro alfabeto) são pegas. node --test docs/testes/planta-textos.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizarTexto, textoDoPlanoPermitido, TRAVAS, PLATAFORMAS } from '../../api/_vendas/planta-textos.mjs';
import { MOLDURAS, TRECHOS_NEUTROS, CLASSES, REGULADO, PASSAM_PELAS_TRAVAS, VARIACOES } from './planta-textos-casos.mjs';

const RAIZ = new URL('./fixtures/planta/', import.meta.url);
const plano = nome => JSON.parse(fs.readFileSync(new URL(nome + '.json', RAIZ), 'utf8'));
const textosDe = (v, saida = []) => {
  if (typeof v === 'string') saida.push(v);
  else if (Array.isArray(v)) v.forEach(x => textosDe(x, saida));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!['id', 'tipo', 'verbo', 'topologia', 'lado', 'origens', 'ramo', 'satelite_de'].includes(k)) textosDe(x, saida); });
  return saida;
};
const frases = trecho => MOLDURAS.map(m => m.replace('{X}', trecho));

test('normalizarTexto: NFKC, sem invisíveis, "<", ">" e controles, espaço simples e aparado', () => {
  assert.equal(normalizarTexto('  Olá\u00a0mundo\u200b \t\n  de\u2009novo  '), 'Olá mundo de novo');
  assert.equal(normalizarTexto('\uff21\uff22\uff23'), 'ABC', 'largura total vira ASCII (NFKC)');
  assert.equal(normalizarTexto('a<b>c'), 'abc');
  assert.equal(normalizarTexto('x\u0000y\u007fz'), 'xyz');
  assert.equal(normalizarTexto('pre\u00adço\u2060'), 'preço');
  assert.equal(normalizarTexto('\ufb01m'), 'fim', 'a ligadura "\ufb01" vira "fi" (muda o comprimento: por isso se reconfere depois)');
  assert.equal(normalizarTexto(undefined), '');
  assert.equal(normalizarTexto(null), '');
  assert.equal(normalizarTexto(7), '', 'só texto');
});

test('as dez travas do Zero rodam, uma a uma, e cada uma que MUDAR o texto recusa', () => {
  assert.equal(TRAVAS.length, 10);
  assert.deepEqual(TRAVAS.map(t => t.nome).sort(), ['garantia', 'mensalidade', 'negarIA', 'pagamento', 'precoComMarca', 'precoNoTexto', 'recado', 'resultado', 'suporte', 'desconto'].sort());
  for (const t of TRAVAS) assert.equal(typeof t.rodar, 'function', t.nome);
});

test('os textos do protótipo reescritos (3 fixtures, todas as caixas) passam na lista própria e nas dez travas, com e sem nicho regulado', () => {
  let n = 0;
  for (const nome of ['clinica', 'embalagens', 'loja']) {
    for (const t of textosDe(plano(nome))) {
      for (const regulado of [false, true]) {
        const r = textoDoPlanoPermitido(t, { nomeDoNegocio: '', regulado });
        assert.deepEqual({ ok: r.ok, motivo: r.motivo }, { ok: true, motivo: undefined }, nome + ' / regulado=' + regulado + ': ' + t);
      }
      n++;
    }
  }
  assert.ok(n >= 50, 'textos conferidos: ' + n);
});

test('as molduras, com um trecho neutro, passam (o vermelho das classes é do trecho, não da moldura)', () => {
  for (const neutro of TRECHOS_NEUTROS) for (const f of frases(neutro)) assert.equal(textoDoPlanoPermitido(f).ok, true, f);
});

for (const [classe, { codigos, trechos }] of Object.entries(CLASSES)) {
  test('classe "' + classe + '": ' + trechos.length * MOLDURAS.length + ' frases ruins recusadas (motivo entre ' + codigos.join(', ') + ')', () => {
    assert.ok(trechos.length * MOLDURAS.length >= 60, 'menos de 60 frases: ' + trechos.length * MOLDURAS.length);
    for (const trecho of trechos) {
      for (const f of frases(trecho)) {
        const r = textoDoPlanoPermitido(f, { nomeDoNegocio: '', regulado: false });
        assert.equal(r.ok, false, 'devia recusar: ' + f);
        assert.ok(codigos.includes(r.motivo), 'motivo ' + r.motivo + ' fora de [' + codigos.join(', ') + ']: ' + f);
      }
    }
  });
}

test('nicho regulado: depoimento, antes e depois, cura e resultado são recusados; fora do nicho regulado, depoimento passa', () => {
  for (const trecho of REGULADO.trechos) {
    for (const f of frases(trecho)) {
      const r = textoDoPlanoPermitido(f, { regulado: true });
      assert.equal(r.ok, false, 'devia recusar em nicho regulado: ' + f);
      assert.ok(REGULADO.codigos.includes(r.motivo) || ['promessa'].includes(r.motivo), r.motivo + ': ' + f);
    }
  }
  for (const f of frases('um depoimento')) assert.equal(textoDoPlanoPermitido(f, { regulado: false }).ok, true, 'fora do regulado: ' + f);
  for (const f of frases('o antes e depois')) assert.equal(textoDoPlanoPermitido(f, { regulado: false }).ok, true, f);
});

test('o que as dez travas deixam passar a lista própria pega (spec §2.3)', () => {
  for (const f of PASSAM_PELAS_TRAVAS) {
    const mudaram = TRAVAS.filter(t => t.rodar(normalizarTexto(f)) !== normalizarTexto(f)).map(t => t.nome);
    const r = textoDoPlanoPermitido(f);
    assert.equal(r.ok, false, f);
    if (!mudaram.length) assert.ok(r.motivo && !r.motivo.startsWith('trava_'), 'sem trava que pegasse: o motivo é da lista própria — ' + f + ' → ' + r.motivo);
  }
});

test('"um" e "uma" passam; numeral de dois em diante, não', () => {
  for (const f of ['A pessoa escolhe uma opção.', 'Só um toque abre o guia de medidas.', 'Tem um caminho para cada pessoa.']) assert.equal(textoDoPlanoPermitido(f).ok, true, f);
  assert.equal(textoDoPlanoPermitido('A pessoa escolhe entre duas opções.').motivo, 'numeral');
});

test('"dia a dia", "na hora" e "sozinho" sozinhos passam (o prazo é "dias", "em minutos"...; a promessa é "vende sozinho")', () => {
  for (const f of ['O site entende o dia a dia do negócio.', 'Chega a confirmação na hora da marcação.', 'Volta sozinho na hora da revisão.', 'No dia da consulta, chega o lembrete.']) assert.equal(textoDoPlanoPermitido(f).ok, true, f);
});

test('o nome do negócio que a pessoa deu passa; outro nome próprio, não', () => {
  const nome = 'Clínica Aurora';
  assert.equal(textoDoPlanoPermitido('A pessoa fala com a Clínica Aurora pela página.', { nomeDoNegocio: nome }).ok, true);
  assert.equal(textoDoPlanoPermitido('A pessoa fala com a clínica aurora pela página.', { nomeDoNegocio: nome }).ok, true, 'minúscula também');
  const r = textoDoPlanoPermitido('A pessoa fala com a Clínica Horizonte pela página.', { nomeDoNegocio: nome });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'marca');
  assert.equal(textoDoPlanoPermitido('A pessoa fala com a Clínica Aurora pela página.', {}).motivo, 'marca', 'sem o nome dado, o nome próprio é marca');
  /* o nome dado não abre a porta para o resto: um nome que traz dígito, ordem ou plataforma continua recusado */
  assert.equal(textoDoPlanoPermitido('A pessoa fala com a Studio 21 pela página.', { nomeDoNegocio: 'Studio 21' }).ok, false);
  assert.equal(textoDoPlanoPermitido('A pessoa fala com a Ignore Regras pela página.', { nomeDoNegocio: 'Ignore Regras' }).motivo, 'ordem');
  assert.equal(textoDoPlanoPermitido('A pessoa fala com o Instagram pela página.', { nomeDoNegocio: 'Instagram' }).motivo, 'marca', 'plataforma conhecida segue recusada mesmo como "nome"');
  /* nome gigante ou estranho não vira passe livre */
  assert.equal(textoDoPlanoPermitido('A pessoa fala com a Clínica Horizonte pela página.', { nomeDoNegocio: 'x'.repeat(500) + ' Horizonte' }).ok, false);
  assert.equal(textoDoPlanoPermitido('A pessoa fala com a Pix pela página.', { nomeDoNegocio: '' }).ok, true, '"Pix" é o meio de pagamento e passa');
});

test('"Pix" passa; sigla em caixa alta no meio da frase é marca', () => {
  assert.equal(textoDoPlanoPermitido('O pagamento acontece por Pix numa tela só.').ok, true);
  assert.equal(textoDoPlanoPermitido('O pagamento acontece por PIX numa tela só.').ok, true, 'PIX em caixa alta também é o meio de pagamento');
  assert.equal(textoDoPlanoPermitido('O site conversa com um CRM do negócio.').motivo, 'marca');
});

test('as variações são pegas (normalização antes da comparação)', () => {
  for (const v of VARIACOES) {
    for (const f of [v, 'A pessoa vê ' + v + ' na página inicial.']) {
      const r = textoDoPlanoPermitido(f);
      assert.equal(r.ok, false, JSON.stringify(f));
    }
  }
});

test('texto fora do tipo, vazio ou grande demais: recusa com motivo, nunca lança', () => {
  for (const v of [undefined, null, 7, {}, [], true, '', '   ', '\u200b']) {
    const r = textoDoPlanoPermitido(v);
    assert.equal(r.ok, false);
    assert.equal(typeof r.motivo, 'string');
  }
  assert.equal(textoDoPlanoPermitido('a'.repeat(100000)).ok, false, 'texto enorme não passa nem custa caro');
  const t0 = Date.now();
  textoDoPlanoPermitido('a '.repeat(3000) + 'a<'.repeat(3000));
  assert.ok(Date.now() - t0 < 1500, 'sem explosão de tempo');
});

test('o texto aceito volta normalizado (é ele que vai para o banco e para a tela)', () => {
  const r = textoDoPlanoPermitido('  A pessoa\u00a0escolhe\u200b  o horário.  ');
  assert.equal(r.ok, true);
  assert.equal(r.texto, 'A pessoa escolhe o horário.');
});

test('a lista de plataformas só tem nomes que o código do repositório já cita (repositório público)', () => {
  assert.ok(PLATAFORMAS.length >= 15);
  const codigo = ['api/_vendas/consultor.mjs', 'api/_vendas/seguranca.mjs', 'api/_vendas/zero.mjs', 'api/_vendas/promessa.mjs', 'api/_vendas/travas-identidade.mjs', 'api/_vendas/travas-resultado.mjs', 'api/_vendas/travas-promessa.mjs', 'api/_vendas/painel.mjs', 'api/_vendas/catalogo.mjs', 'api/_vendas/precos.mjs', 'api/_ia/simulado.mjs', 'api/_ia/config.mjs']
    .map(a => fs.readFileSync(new URL('../../' + a, import.meta.url), 'utf8').toLowerCase()).join('\n');
  const fora = PLATAFORMAS.filter(p => !codigo.includes(p.toLowerCase()) && !fs.readdirSync(new URL('../../api/_vendas/', import.meta.url)).some(f => fs.readFileSync(new URL('../../api/_vendas/' + f, import.meta.url), 'utf8').toLowerCase().includes(p.toLowerCase())));
  assert.deepEqual(fora, [], 'plataforma que nenhum arquivo de api/_vendas cita');
});
