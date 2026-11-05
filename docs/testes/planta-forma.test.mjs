/* O MÓDULO DE FORMA DA PLANTA VIVA (Passo 1; spec §2.2, §2.4 passo 1 e §3.4 passo 1). Um arquivo só (js/orcamento-planta-forma.js)
   vale na tela (script clássico, window.BZPlantaForma) e no servidor (CommonJS). Aqui: listas fechadas, limites, regras por
   topologia, fronteiras, "nunca lança", o radar e a varredura ES5. As travas de TEXTO (dígito, marca, prazo, promessa) são do PR 2a:
   estes testes provam que a forma as DEIXA PASSAR (a camada de texto é outra).  node --test docs/testes/planta-forma.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import F from '../../js/orcamento-planta-forma.js';

const ARQ = new URL('../../js/orcamento-planta-forma.js', import.meta.url);
const fonte = fs.readFileSync(ARQ, 'utf8');
const lerJson = (rel) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + rel, import.meta.url), 'utf8'));
const lista = (pasta) => fs.readdirSync(new URL('./fixtures/' + pasta, import.meta.url)).filter((n) => n.endsWith('.json')).sort();
const clone = (o) => JSON.parse(JSON.stringify(o));
const NICHOS = ['clinica', 'embalagens', 'loja'];
const fx = (n) => clone(lerJson('planta/' + n + '.json'));
const letras = (n) => 'abcdefghij'.repeat(Math.ceil(n / 10)).slice(0, n);
const codigos = (r) => r.motivos.slice().sort();

/* ---------- 1. carregar dos dois jeitos ---------- */
test('o módulo carrega como no navegador (script clássico, sem module) e como no servidor (CommonJS), com a mesma API', () => {
  const janela = {};
  vm.runInNewContext(fonte, { window: janela });
  assert.ok(janela.BZPlantaForma, 'window.BZPlantaForma');
  assert.deepEqual(Object.keys(janela.BZPlantaForma).sort(), Object.keys(F).sort());
  /* e funciona de fato, mesmo vindo de outro "mundo" do JavaScript (objetos de fora, protótipos de fora) */
  assert.equal(janela.BZPlantaForma.validarFormaPlano(fx('clinica')).ok, true);
  assert.equal(janela.BZPlantaForma.validarFormaLeitura(lerJson('radar/loja.json')).ok, true);
});

test('o arquivo não usa DOM nem node: nem import (ele roda na tela e no servidor)', () => {
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\bdocument\b|\brequire\s*\(|node:|\bprocess\.|\bimport\s/.test(semComentarios));
});

/* ---------- 2. listas fechadas e limites ---------- */
test('listas fechadas: topologias, tipos (chegada + 28), verbos, origens, eixos e níveis', () => {
  assert.deepEqual([...F.TOPOLOGIAS], ['laco', 'bifurca', 'espinha']);
  assert.equal(F.TIPOS.length, 29);
  assert.equal(F.TIPOS[0], 'chegada');
  assert.equal(new Set(F.TIPOS).size, 29);
  assert.equal(F.TIPOS_ETAPA.length, 28);
  assert.ok(!F.TIPOS_ETAPA.includes('chegada'));
  assert.deepEqual([...F.TIPOS_ETAPA], F.TIPOS.slice(1));
  for (const t of ['pagina', 'conversa', 'agenda', 'lembrete', 'retoma', 'sinal', 'vitrine', 'cabide', 'produto', 'guia', 'carrinho', 'pagamento', 'caixa', 'tabela', 'briefing',
    'amostra', 'proposta', 'acabamento', 'aviso', 'formulario', 'mapa', 'galeria', 'catalogo', 'cardapio', 'aula', 'documento', 'confirmacao', 'mensagem']) assert.ok(F.TIPOS.includes(t), t);
  assert.ok(F.VERBOS.length >= 30, 'uns 30 verbos');
  assert.equal(new Set(F.VERBOS).size, F.VERBOS.length);
  for (const v of F.VERBOS) assert.match(v, /^[A-ZÀ-Ý][a-zà-ÿ]+$/, v + ': uma palavra, inicial maiúscula');
  for (const v of ['Recebe', 'Mostra', 'Conduz', 'Decide', 'Agenda', 'Lembra', 'Cobra', 'Calcula', 'Levanta', 'Combina', 'Propõe', 'Retoma', 'Reativa', 'Mede', 'Convence', 'Reúne', 'Avisa', 'Escolhe', 'Confirma', 'Responde', 'Registra', 'Organiza']) assert.ok(F.VERBOS.includes(v), v);
  assert.deepEqual([...F.ORIGENS], ['busca', 'mapa', 'indicacao', 'rede', 'anuncio', 'direto', 'email']);
  assert.deepEqual([...F.EIXOS], ['volume', 'repeticao', 'urgencia', 'pessoas', 'informacao']);
  assert.deepEqual([...F.NIVEIS], ['nao_falou', 'comentou', 'deixou_claro']);
  assert.deepEqual([...F.PLANTA_CHAVES], ['planta', 'leitura', 'planta_pedidos']);
});

test('limites da spec §2.2: título 3 a 40, frase 20 a 110, rótulos 28, 7 a 8 etapas (8 ou 9 caixas), 8 KB, evidência 60; tudo congelado', () => {
  const L = F.LIMITES;
  assert.deepEqual([L.titulo_min, L.titulo_max, L.frase_min, L.frase_max, L.rotulo_max, L.etapas_min, L.etapas_max, L.plano_bytes, L.evidencia_max, L.origens_max],
    [3, 40, 20, 110, 28, 7, 8, 8192, 60, 4]);
  for (const o of [F.LIMITES, F.TOPOLOGIAS, F.TIPOS, F.TIPOS_ETAPA, F.VERBOS, F.ORIGENS, F.EIXOS, F.NIVEIS, F.PLANTA_CHAVES]) assert.ok(Object.isFrozen(o));
  assert.match('a1-b', F.ID_ETAPA);
  assert.ok(!F.ID_ETAPA.test('A1') && !F.ID_ETAPA.test('a') && !F.ID_ETAPA.test('a'.repeat(25)));
});

/* ---------- 3. as fixtures ---------- */
test('as 3 fixtures validam e devolvem uma CÓPIA igual (o bruto não é tocado nem aliado)', () => {
  for (const n of NICHOS) {
    const bruto = fx(n);
    const antes = JSON.stringify(bruto);
    const r = F.validarFormaPlano(bruto);
    assert.equal(r.ok, true, n + ' ' + JSON.stringify(r.motivos));
    assert.deepEqual(r.motivos, []);
    assert.deepEqual(r.plano, bruto);
    assert.notEqual(r.plano, bruto);
    assert.notEqual(r.plano.etapas[0], bruto.etapas[0]);
    assert.equal(JSON.stringify(bruto), antes);
  }
  assert.equal(fx('clinica').etapas.length + 1, 8);
  assert.equal(fx('embalagens').etapas.length + 1, 9);
  assert.equal(fx('loja').etapas.length + 1, 8);
});

test('um plano congelado (profundo) também valida; a cópia devolvida não é congelada', () => {
  const duro = (o) => { Object.freeze(o); Object.values(o).forEach((v) => { if (v && typeof v === 'object') duro(v); }); return o; };
  const r = F.validarFormaPlano(duro(fx('loja')));
  assert.equal(r.ok, true);
  assert.ok(!Object.isFrozen(r.plano));
});

test('cada inválido de forma é rejeitado com o código esperado; os de TEXTO passam na forma (quem os barra é o PR 2a)', () => {
  const nomes = lista('planta/invalidos');
  let forma = 0, texto = 0;
  for (const nome of nomes) {
    const e = lerJson('planta/invalidos/' + nome);
    const r = F.validarFormaPlano(e.plano);
    if (e._camada === 'texto') {
      texto++;
      assert.equal(r.ok, true, nome + ': a forma deve deixar passar (' + JSON.stringify(r.motivos) + ')');
      continue;
    }
    forma++;
    assert.equal(r.ok, false, nome + ' deveria ser rejeitado');
    assert.ok(r.motivos.includes(e._defeito), nome + ': esperado ' + e._defeito + ', veio ' + JSON.stringify(r.motivos));
    assert.equal(r.plano, undefined, nome + ': sem plano quando falha');
  }
  assert.ok(forma >= 40 && texto === 5, 'forma ' + forma + ', texto ' + texto);
});

test('os de um defeito só: o 9 KB responde só "grande" (e não gasta tempo olhando o resto); __proto__ e constructor são chave proibida', () => {
  assert.deepEqual(F.validarFormaPlano(lerJson('planta/invalidos/plano-9kb.json').plano).motivos, ['grande']);
  assert.ok(F.validarFormaPlano(lerJson('planta/invalidos/proto-na-raiz.json').plano).motivos.includes('chave_proibida'));
  assert.ok(F.validarFormaPlano(lerJson('planta/invalidos/constructor-na-etapa.json').plano).motivos.includes('chave_proibida'));
  assert.equal(({}).polluted, undefined, 'nada vazou para Object.prototype');
});

/* ---------- 4. fronteiras ---------- */
test('fronteiras de tamanho: título 2/3 e 40/41, frase 19/20 e 110/111, rótulos 28/29, para o título da etapa, da chegada e do fim', () => {
  const com = (campo, n, onde) => { const p = fx('clinica'); onde(p)[campo] = letras(n); return F.validarFormaPlano(p); };
  const alvos = { etapa: (p) => p.etapas[2], chegada: (p) => p.chegada, fim: (p) => p.fim };
  for (const [nome, onde] of Object.entries(alvos)) {
    assert.equal(com('titulo', 3, onde).ok, true, nome + ' 3');
    assert.equal(com('titulo', 40, onde).ok, true, nome + ' 40');
    assert.deepEqual(com('titulo', 2, onde).motivos, ['titulo_curto'], nome + ' 2');
    assert.deepEqual(com('titulo', 41, onde).motivos, ['titulo_longo'], nome + ' 41');
    assert.equal(com('frase', 20, onde).ok, true, nome + ' f20');
    assert.equal(com('frase', 110, onde).ok, true, nome + ' f110');
    assert.deepEqual(com('frase', 19, onde).motivos, ['frase_curta'], nome + ' f19');
    assert.deepEqual(com('frase', 111, onde).motivos, ['frase_longa'], nome + ' f111');
  }
  const fecho = (n) => { const p = fx('clinica'); p.fecho = letras(n); return F.validarFormaPlano(p); };
  assert.equal(fecho(110).ok, true);
  assert.deepEqual(fecho(111).motivos, ['frase_longa']);
  assert.deepEqual(fecho(19).motivos, ['frase_curta']);
  const rot = (n) => { const p = fx('clinica'); p.rotulo_retorno = letras(n); return F.validarFormaPlano(p); };
  assert.equal(rot(28).ok, true);
  assert.deepEqual(rot(29).motivos, ['rotulo']);
  const ramos = (a, b) => { const p = fx('embalagens'); p.rotulos_ramos = [letras(a), letras(b)]; return F.validarFormaPlano(p); };
  assert.equal(ramos(28, 3).ok, true);
  assert.deepEqual(ramos(3, 29).motivos, ['rotulo']);
});

test('o título só com espaços não vale (o mínimo conta o texto aparado); o máximo conta o texto como veio', () => {
  const p = fx('clinica'); p.etapas[0].titulo = '    ';
  assert.deepEqual(F.validarFormaPlano(p).motivos, ['titulo_curto']);
});

test('caracteres: "<" ">" controles, quebra de linha, separador de linha e invisíveis são recusados; espaço sem quebra e acento passam (a normalização é do PR 2a)', () => {
  const tit = (t) => { const p = fx('clinica'); p.etapas[0].titulo = t; return F.validarFormaPlano(p); };
  /* (os caracteres invisíveis entram por código numérico, para o arquivo de teste não carregar invisível nenhum) */
  const com = (cod) => 'Página' + String.fromCharCode(cod) + 'forte';
  const proibidos = ['Página <b>forte</b>', 'Página > forte', com(0x09), com(0x00), com(0x0a), com(0x7f), com(0x85), com(0x2028), com(0x2029), com(0x200b), com(0x200f), com(0x202e), com(0x2060), com(0x2066), com(0xfeff), com(0xad)];
  for (const t of proibidos) assert.deepEqual(tit(t).motivos, ['caractere'], JSON.stringify(t));
  for (const t of [com(0xa0), com(0x20), 'Atendimento é ação', 'Pergunta o que incomoda']) assert.equal(tit(t).ok, true, JSON.stringify(t));
});

/* ---------- 5. regras por topologia ---------- */
test('laço: tudo em sequência, só a última com retorno; sem campo de outra topologia; "rotulo_retorno" só no laço', () => {
  const p = fx('clinica'); p.etapas[6].retorno = false;
  assert.deepEqual(F.validarFormaPlano(p).motivos, ['retorno']);
  const q = fx('clinica'); q.rotulos_ramos = ['a b c', 'd e f'];
  assert.deepEqual(F.validarFormaPlano(q).motivos, ['campo_fora_da_topologia']);
  const s = fx('clinica'); s.etapas[2].satelite_de = 'pagina'; s.etapas[2].lado = 'cima';
  assert.ok(F.validarFormaPlano(s).motivos.includes('campo_fora_da_topologia'));
  const sem = fx('clinica'); delete sem.rotulo_retorno;
  assert.equal(F.validarFormaPlano(sem).ok, true, 'o rótulo do retorno é opcional');
});

test('decisão: no máximo uma em qualquer topologia; na bifurca é obrigatória e é a última de entrada', () => {
  const l = fx('clinica'); l.etapas[0].decisao = true;
  assert.deepEqual(F.validarFormaPlano(l).motivos, ['decisao']);
  const l0 = fx('clinica'); delete l0.etapas[1].decisao;
  assert.equal(F.validarFormaPlano(l0).ok, true, 'no laço a decisão é opcional');
  const b = fx('embalagens'); delete b.etapas[1].decisao;
  assert.deepEqual(F.validarFormaPlano(b).motivos, ['decisao']);
  const b2 = fx('embalagens'); b2.etapas[6].decisao = true;
  assert.deepEqual(F.validarFormaPlano(b2).motivos, ['decisao']);
  const e = fx('loja'); e.etapas[0].decisao = true;
  assert.equal(F.validarFormaPlano(e).ok, true, 'na espinha uma decisão é opcional');
  e.etapas[2].decisao = true;
  assert.deepEqual(F.validarFormaPlano(e).motivos, ['decisao']);
  const naoBool = fx('clinica'); naoBool.etapas[1].decisao = 'sim';
  assert.deepEqual(F.validarFormaPlano(naoBool).motivos, ['decisao']);
});

test('bifurca: entrada, 1 a 2 no ramo 0, 1 a 2 no ramo 1, 1 a 2 de saída; ramos contíguos e em ordem; "ramo" só 0 ou 1', () => {
  const ok = (mexer) => { const p = fx('embalagens'); mexer(p); return F.validarFormaPlano(p); };
  /* 3 no ramo 0 (e 7 etapas no total para não cair na contagem) */
  const tres = ok((p) => { p.etapas.splice(3, 0, clone(p.etapas[3])); p.etapas[3].id = 'acab-b'; p.etapas.splice(7, 2); });
  assert.deepEqual(codigos(tres), ['ramo']);
  /* saída vazia: as duas últimas viram ramo 1 */
  const semSaida = ok((p) => { p.etapas[6].ramo = 1; p.etapas[7].ramo = 1; });
  assert.ok(semSaida.motivos.includes('ramo'));
  /* ramo como texto */
  assert.ok(ok((p) => { p.etapas[2].ramo = '0'; }).motivos.includes('ramo'));
  /* ramo 1 antes do ramo 0 */
  const ordem = ok((p) => { const t = p.etapas[2]; p.etapas[2] = p.etapas[4]; p.etapas[4] = t; });
  assert.ok(ordem.motivos.includes('ramo'));
  /* sem rótulos dos ramos é aceito; com um só, não */
  assert.equal(ok((p) => { delete p.rotulos_ramos; }).ok, true);
  assert.deepEqual(ok((p) => { p.rotulos_ramos = ['só um aqui']; }).motivos, ['rotulo']);
  assert.deepEqual(ok((p) => { p.rotulos_ramos = 'texto'; }).motivos, ['rotulo']);
});

test('espinha: 4 a 5 de tronco e 2 a 4 satélites; satélite aponta para o tronco, um por etapa, lado cima/baixo, no máximo um laço', () => {
  const trocar = (p, ids, mexer) => { ids.forEach((id) => mexer(p.etapas.find((e) => e.id === id))); return F.validarFormaPlano(p); };
  /* satélite de satélite */
  assert.ok(trocar(fx('loja'), ['guia'], (e) => { e.satelite_de = 'look'; }).motivos.includes('satelite'));
  /* dois satélites na mesma etapa */
  assert.ok(trocar(fx('loja'), ['guia'], (e) => { e.satelite_de = 'vitrine'; }).motivos.includes('satelite'));
  /* aponta para o nada */
  assert.ok(trocar(fx('loja'), ['look'], (e) => { e.satelite_de = 'nada'; }).motivos.includes('satelite'));
  /* aponta para ele mesmo */
  assert.ok(trocar(fx('loja'), ['look'], (e) => { e.satelite_de = 'look'; }).motivos.includes('satelite'));
  /* lado ausente ou fora da lista */
  assert.ok(trocar(fx('loja'), ['look'], (e) => { e.lado = 'meio'; }).motivos.includes('lado'));
  assert.ok(trocar(fx('loja'), ['look'], (e) => { delete e.lado; }).motivos.includes('lado'));
  /* dois laços; laço no tronco */
  assert.deepEqual(trocar(fx('loja'), ['guia'], (e) => { e.laco = true; }).motivos, ['laco']);
  assert.ok(trocar(fx('loja'), ['vitrine'], (e) => { e.laco = true; }).motivos.includes('laco'));
  /* tronco de 3 + 4 satélites (7 etapas) */
  const t3 = fx('loja'); t3.etapas[6].satelite_de = 'sacola'; t3.etapas[6].lado = 'cima';
  const r3 = F.validarFormaPlano(t3); assert.ok(r3.motivos.includes('tronco') || r3.motivos.includes('satelite'), JSON.stringify(r3.motivos));
  /* tronco de 6 + 1 satélite */
  const t6 = fx('loja'); t6.etapas = t6.etapas.filter((e) => e.id !== 'guia' && e.id !== 'esquecida');
  t6.etapas.push({ id: 'tronco-a', tipo: 'pagina', verbo: 'Mostra', titulo: 'Mais uma etapa do tronco', frase: 'Uma etapa a mais no tronco, só para testar a contagem.' },
    { id: 'tronco-b', tipo: 'pagina', verbo: 'Mostra', titulo: 'Outra etapa do tronco', frase: 'Outra etapa a mais no tronco, só para testar a contagem.' });
  const r6 = F.validarFormaPlano(t6); assert.equal(r6.ok, false); assert.ok(r6.motivos.includes('tronco'), JSON.stringify(r6.motivos));
  /* o limite bom: 5 de tronco + 3 satélites = 8 etapas */
  const t5 = fx('loja');
  t5.etapas.push({ id: 'entrega', tipo: 'confirmacao', verbo: 'Confirma', titulo: 'Confirma a entrega', frase: 'A pessoa recebe a confirmação de que o pedido saiu.' });
  assert.equal(F.validarFormaPlano(t5).ok, true);
});

test('campos que são de outra topologia são recusados (ramo fora da bifurca, lado e laço fora da espinha, retorno fora do laço)', () => {
  const f = (n, mexer) => { const p = fx(n); mexer(p); return F.validarFormaPlano(p); };
  assert.ok(f('loja', (p) => { p.etapas[0].ramo = 0; }).motivos.includes('campo_fora_da_topologia'));
  assert.ok(f('embalagens', (p) => { p.etapas[0].lado = 'cima'; }).motivos.includes('campo_fora_da_topologia'));
  assert.ok(f('embalagens', (p) => { p.etapas[7].retorno = true; }).motivos.includes('campo_fora_da_topologia'));
  assert.ok(f('loja', (p) => { p.etapas[0].retorno = true; }).motivos.includes('campo_fora_da_topologia'));
  assert.ok(f('loja', (p) => { p.rotulo_retorno = 'o site volta'; }).motivos.includes('campo_fora_da_topologia'));
  assert.ok(f('clinica', (p) => { p.etapas[2].laco = true; }).motivos.includes('campo_fora_da_topologia'));
});

test('número de caixas: 7 e 10 caixas são recusadas; 8 e 9 passam (7 e 8 etapas mais a chegada)', () => {
  const com = (n) => { const p = fx('clinica'); while (p.etapas.length < n) { const e = clone(p.etapas[2]); e.id = 'extra-' + p.etapas.length; p.etapas.splice(p.etapas.length - 1, 0, e); } p.etapas.length = Math.min(p.etapas.length, n); p.etapas[n - 1] = Object.assign({}, fx('clinica').etapas[6]); return F.validarFormaPlano(p); };
  assert.deepEqual(codigos(com(6)), ['etapas_qtd']);
  assert.equal(com(7).ok, true);
  assert.equal(com(8).ok, true);
  assert.deepEqual(codigos(com(9)), ['etapas_qtd']);
});

test('ids: formato, repetição e nomes reservados; o id vale como texto simples (nada de caminho nem seletor)', () => {
  const id = (v) => { const p = fx('clinica'); p.etapas[3].id = v; return F.validarFormaPlano(p); };
  assert.equal(id('ab').ok, true);
  assert.equal(id('a'.repeat(24)).ok, true);
  assert.equal(id('a-1-b').ok, true);
  for (const ruim of ['a', 'a'.repeat(25), 'A1', 'a b', 'a_b', 'a.b', 'a/b', 'a"b', "a'b", '1<2', 'á', '', 7, null, ['ab']]) assert.deepEqual(id(ruim).motivos, ['id'], JSON.stringify(ruim));
  assert.deepEqual(id('pagina').motivos, ['id_repetido']);
  for (const reservado of ['nucleo', 'led', 'chegada']) assert.deepEqual(id(reservado).motivos, ['id_reservado'], reservado);
});

test('origens: de 1 a 4, da lista, sem repetir', () => {
  const o = (v) => { const p = fx('clinica'); p.chegada.origens = v; return F.validarFormaPlano(p); };
  assert.equal(o(['direto']).ok, true);
  assert.equal(o(['busca', 'mapa', 'indicacao', 'rede']).ok, true);
  for (const ruim of [[], ['busca', 'busca'], ['busca', 'mapa', 'indicacao', 'rede', 'anuncio'], ['sorteio'], 'busca', null, [7], ['__proto__']]) assert.deepEqual(o(ruim).motivos, ['origens'], JSON.stringify(ruim));
});

/* ---------- 6. nunca lança ---------- */
test('validarFormaPlano nunca lança e sempre devolve { ok:false, motivos } para o que não é plano', () => {
  const circular = {}; circular.eu = circular;
  const fundo = {}; let c = fundo; for (let i = 0; i < 20000; i++) { c.n = {}; c = c.n; }
  const getterQueLanca = fx('clinica'); Object.defineProperty(getterQueLanca, 'topologia', { enumerable: true, get() { throw new Error('boom'); } });
  const proxyQueLanca = new Proxy({}, { ownKeys() { throw new Error('boom'); }, get() { throw new Error('boom'); } });
  const comBigInt = fx('clinica'); comBigInt.fecho = 10n;
  const comToJSON = fx('clinica'); comToJSON.toJSON = () => { throw new Error('boom'); };
  const grande = new Array(2000000).fill(1);
  for (const ruim of [undefined, null, 7, 0, NaN, '', 'x', true, [], [1, 2], () => 1, Symbol('s'), circular, fundo, getterQueLanca, proxyQueLanca, comBigInt, comToJSON, grande, new Date(), new Map(), Object.create(null), JSON.parse('"x"')]) {
    let r;
    assert.doesNotThrow(() => { r = F.validarFormaPlano(ruim); });
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.motivos) && r.motivos.length >= 1, 'motivos');
    assert.equal(r.plano, undefined);
  }
  assert.deepEqual(F.validarFormaPlano(undefined).motivos, ['nao_objeto']);
  assert.deepEqual(F.validarFormaPlano(circular).motivos, ['nao_serializavel']);
  assert.deepEqual(F.validarFormaPlano(grande).motivos, ['grande']);
});

test('um plano de outro mundo (protótipo de fora) ou sem protótipo vale pelo conteúdo', () => {
  const sem = Object.assign(Object.create(null), fx('loja'));
  assert.equal(F.validarFormaPlano(sem).ok, true);
  const fora = vm.runInNewContext('(' + JSON.stringify(fx('embalagens')) + ')');
  assert.equal(F.validarFormaPlano(fora).ok, true);
});

test('cada erro vem com caminho legível (para o servidor montar a mensagem de volta ao modelo) e há teto de erros', () => {
  const p = fx('clinica'); p.etapas[2].titulo = letras(47); p.etapas[4].frase = 'curta';
  const r = F.validarFormaPlano(p);
  assert.equal(r.ok, false);
  assert.deepEqual(r.erros.map((e) => e.caminho + ':' + e.codigo).sort(), ['etapas[2].titulo:titulo_longo', 'etapas[4].frase:frase_curta']);
  assert.deepEqual(codigos(r), ['frase_curta', 'titulo_longo']);
  const lixo = fx('clinica'); lixo.etapas.forEach((e) => { e.tipo = 'x'; e.verbo = 'y'; e.titulo = 1; e.frase = 2; e.id = 'A'; });
  assert.ok(F.validarFormaPlano(lixo).erros.length <= F.LIMITES.erros_max);
});

test('chaves: as que o esquema não conhece, em qualquer nível, são recusadas; as de protótipo são "chave_proibida"', () => {
  const p = fx('clinica'); p.chegada.extra = 1; p.fim.extra = 1; p.etapas[0].extra = 1;
  assert.deepEqual(codigos(F.validarFormaPlano(p)), ['chave_extra']);
  for (const k of ['__proto__', 'constructor', 'prototype']) {
    const bruto = JSON.parse('{"' + k + '": {"x": 1}, "topologia": "laco"}');
    assert.deepEqual(F.validarFormaPlano(bruto).motivos.includes('chave_proibida'), true, k);
  }
  const faltando = fx('clinica'); delete faltando.fim; delete faltando.etapas[0].verbo;
  assert.ok(codigos(F.validarFormaPlano(faltando)).includes('chave_faltando'));
});

/* ---------- 7. o radar ---------- */
test('radar: as 3 leituras validam, em ordem canônica dos eixos, e cada inválido cai com o código esperado', () => {
  for (const n of NICHOS) {
    const bruto = clone(lerJson('radar/' + n + '.json'));
    const r = F.validarFormaLeitura(bruto);
    assert.equal(r.ok, true, n + ' ' + JSON.stringify(r.motivos));
    assert.deepEqual(r.leitura, bruto);
    assert.notEqual(r.leitura, bruto);
    assert.deepEqual(r.leitura.eixos.map((e) => e.eixo), [...F.EIXOS]);
  }
  const nomes = lista('radar/invalidos');
  assert.ok(nomes.length >= 10);
  for (const nome of nomes) {
    const e = lerJson('radar/invalidos/' + nome);
    const r = F.validarFormaLeitura(e.leitura);
    assert.equal(r.ok, false, nome);
    assert.ok(r.motivos.includes(e._defeito), nome + ': esperado ' + e._defeito + ', veio ' + JSON.stringify(r.motivos));
  }
});

test('radar: exatamente 5 eixos (4 e 6 recusados), sem repetir, nível da lista, evidência opcional de 1 a 60; fora de ordem é reordenado', () => {
  const base = () => clone(lerJson('radar/clinica.json'));
  const quatro = base(); quatro.eixos.length = 4;
  assert.deepEqual(F.validarFormaLeitura(quatro).motivos, ['eixos_qtd']);
  const seis = base(); seis.eixos.push({ eixo: 'volume', nivel: 'comentou' });
  assert.deepEqual(F.validarFormaLeitura(seis).motivos, ['eixos_qtd']);
  const rep = base(); rep.eixos[2].eixo = 'volume';
  assert.deepEqual(F.validarFormaLeitura(rep).motivos, ['eixo_repetido']);
  const nivel = base(); nivel.eixos[0].nivel = 'MUITO';
  assert.deepEqual(F.validarFormaLeitura(nivel).motivos, ['nivel']);
  const ev = (n) => { const l = base(); l.eixos[1].evidencia = letras(n); return F.validarFormaLeitura(l); };
  assert.equal(ev(1).ok, true); assert.equal(ev(60).ok, true);
  assert.deepEqual(ev(61).motivos, ['evidencia_longa']);
  const virada = base(); virada.eixos.reverse();
  const rv = F.validarFormaLeitura(virada);
  assert.equal(rv.ok, true);
  assert.deepEqual(rv.leitura.eixos.map((e) => e.eixo), [...F.EIXOS]);
  assert.equal(F.validarFormaLeitura(base()).leitura.eixos[2].evidencia, undefined, 'sem evidência continua sem a chave');
});

test('radar: nunca lança (nulo, texto, circular, getter que lança) e a evidência passa pela mesma limpeza de caracteres', () => {
  const circular = { eixos: [] }; circular.eixos.push(circular);
  for (const ruim of [undefined, null, 5, 'x', [], {}, { eixos: 'x' }, { eixos: [null, 1, 'x', [], {}] }, circular, new Proxy({}, { get() { throw new Error('boom'); }, ownKeys() { throw new Error('boom'); } })]) {
    let r; assert.doesNotThrow(() => { r = F.validarFormaLeitura(ruim); });
    assert.equal(r.ok, false); assert.ok(r.motivos.length >= 1); assert.equal(r.leitura, undefined);
  }
  const l = clone(lerJson('radar/clinica.json')); l.eixos[1].evidencia = 'texto' + String.fromCharCode(0x200b) + ' escondido';
  assert.deepEqual(F.validarFormaLeitura(l).motivos, ['caractere']);
});

/* ---------- 8. ES5 ---------- */
/* tira comentários, strings e literais de regex (para a varredura não se enganar com aspas dentro de regex) */
function semComentariosEStrings(src) {
  let out = '', i = 0, ultimoSig = '';
  const abreRegex = (u) => u === '' || '(,=:[!&|?{};+-*%<>~^'.includes(u);
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; out += '""'; ultimoSig = '"'; continue; }
    if (c === '/' && abreRegex(ultimoSig)) {
      i++; let classe = false;
      while (i < src.length && (src[i] !== '/' || classe)) { if (src[i] === '\\') i++; else if (src[i] === '[') classe = true; else if (src[i] === ']') classe = false; i++; }
      i++; while (/[a-z]/.test(src[i] || '')) i++; out += '/r/'; ultimoSig = ')'; continue;
    }
    out += c; if (!/\s/.test(c)) ultimoSig = c; i++;
  }
  return out;
}
const PROIBIDOS_ES5 = [
  [/=>/, 'seta (=>)'], [/\bconst\b/, 'const'], [/\blet\b/, 'let'], [/`/, 'crase'], [/\bclass\b/, 'class'], [/\.\.\./, 'espalhar (...)'],
  [/Object\.values/, 'Object.values'], [/Object\.entries/, 'Object.entries'], [/Object\.assign/, 'Object.assign'], [/\bpadStart\b|\bpadEnd\b/, 'padStart/padEnd'],
  [/Array\.from/, 'Array.from'], [/\.includes\(/, '.includes('], [/\basync\b|\bawait\b/, 'async/await'], [/\.startsWith\(|\.endsWith\(/, 'startsWith/endsWith'],
  [/\.find\(|\.findIndex\(/, '.find('], [/\bSymbol\b|\bPromise\b|\bnew Map\b|\bnew Set\b|\bProxy\b/, 'Symbol/Promise/Map/Set/Proxy'], [/\byield\b|\bfunction\s*\*/, 'gerador']
];
const proibidosEm = (src) => PROIBIDOS_ES5.filter(([re]) => re.test(semComentariosEStrings(src))).map(([, nome]) => nome);

test('a varredura ES5 enxerga o que deve (seta, const, let, crase, class, espalhar, includes, async) e ignora comentário, string e regex', () => {
  assert.deepEqual(proibidosEm('var a = function () { return 1; }; // () => 1 const let class `x`'), []);
  assert.deepEqual(proibidosEm('var r = /[\'"`]/; var s = "const => ... `"; /* let class */'), []);
  assert.deepEqual(proibidosEm('var f = (a) => a;'), ['seta (=>)']);
  assert.deepEqual(proibidosEm('const a = 1;'), ['const']);
  assert.deepEqual(proibidosEm('let a = 1;'), ['let']);
  assert.deepEqual(proibidosEm('var a = `x`;'), ['crase']);
  assert.deepEqual(proibidosEm('class A {}'), ['class']);
  assert.deepEqual(proibidosEm('f(...a);'), ['espalhar (...)']);
  assert.deepEqual(proibidosEm('[].includes(1); Object.values(o);').sort(), ['.includes(', 'Object.values']);
  assert.deepEqual(proibidosEm('async function f() { await g(); }'), ['async/await']);
});

test('o módulo de forma é ES5 sintático (sem =>, const, let, crase, class, ..., Object.values/entries, padStart, Array.from, includes, async)', () => {
  assert.deepEqual(proibidosEm(fonte), []);
  assert.ok(/\bvar\b/.test(fonte) && /\bfunction\b/.test(fonte));
  assert.ok(/'use strict'/.test(fonte));
});
