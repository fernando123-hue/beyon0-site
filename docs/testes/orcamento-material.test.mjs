/* O FORMULÁRIO DO MATERIAL (PR 3b-2; spec §3): os 6 blocos na ordem da spec, os limites vindos do esquema (nenhum número
   repetido à mão), o aviso de dados pessoais, a caixa de autorização com o texto do servidor, e o HTML sem inline. Os
   comportamentos de tela (salvar sozinho, "Falta:", enviar) são conferidos no E2E (Task 19); aqui, o que dá sem navegador.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ESQ from '../../js/orcamento-material-esquema.js';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const FONTE = ler('js/orcamento-material.js');
const janela = { BZMaterialEsquema: ESQ, BZEnvio: { criar: () => ({}) } };
new Function('window', FONTE)(janela);
const M = janela.BZMaterial;
const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('M6: salvar sozinho, a 429 espera 11 s e repete UMA vez antes de mostrar erro (o freio do servidor é de 10 pedidos em 10 s)', () => {
  const codigo = semComentario(FONTE);
  assert.match(codigo, /ESPERA_FREIO_MS\s*=\s*11000/);
  assert.match(codigo, /status !== 429/, 'só a 429 espera e repete; o resto sobe como erro');
  assert.match(codigo, /Aguardando um instante/);
});

test('os 6 blocos, na ordem da spec §3', () => {
  assert.deepEqual(M.blocos.map(b => b.titulo), ['1 · Logo e fotos', '2 · Contatos do site', '3 · Serviços', '4 · Onde e quando', '5 · Provas e depoimentos', '6 · Cor e envio']);
});

test('os campos de cada bloco são os de CAMPOS_DADOS da captação (e nenhum a mais); os limites vêm do esquema', () => {
  const campos = M.blocos.flatMap(b => (b.campos || []).map(c => c.campo));
  const dados = campos.filter(c => !c.includes('.'));
  for (const c of ESQ.CAMPOS_SALVOS) if (c !== 'cor') assert.ok(dados.includes(c), 'falta o campo ' + c);
  assert.ok(dados.every(c => ESQ.CAMPOS_SALVOS.includes(c)), 'campo que o esquema não conhece: ' + dados.filter(c => !ESQ.CAMPOS_SALVOS.includes(c)));
  const limite = c => M.blocos.flatMap(b => b.campos || []).find(x => x.campo === c);
  assert.deepEqual([limite('servicos').max, limite('horario').max, limite('bairros').max, limite('provas').max, limite('depoimentos').max, limite('emails').max, limite('redes').max], [12, 7, 20, 4, 3, 2, 4]);
  assert.deepEqual(limite('servicos').itens.map(i => [i.k, i.min, i.max, i.opcional]), [['nome', 2, 60, false], ['descricao', 2, 140, true]]);
  assert.deepEqual(limite('depoimentos').itens.map(i => [i.k, i.min, i.max]), [['texto', 5, 300], ['autor', 2, 60]]);
  assert.deepEqual(limite('horario').itens.map(i => [i.k, i.min, i.max]), [['dias', 2, 40], ['horas', 2, 40]]);
  assert.equal(limite('endereco').max, 120);
  for (const c of M.blocos.flatMap(b => b.campos || []).filter(c => c.max)) assert.equal(ESQ.validarCampo(c.campo, c.tipo === 'objetos' ? Array.from({ length: c.max + 1 }, () => Object.fromEntries(c.itens.map(i => [i.k, 'x'.repeat(i.max)]))) : c.tipo === 'lista' ? Array.from({ length: c.max + 1 }, () => 'a@b.co') : 'x'.repeat(c.max + 1)), false, 'o esquema recusa mais que ' + c.max + ' em ' + c.campo);
});

test('formatarTelefone e as listas: lista vazia vira null (o campo é limpo, nunca [])', () => {
  assert.equal(M.formatarTelefone('+5521999990001'), '(21) 99999-0001');
  assert.equal(M.formatarTelefone('+552133334444'), '(21) 3333-4444');
  assert.equal(M.formatarTelefone(undefined), '');
  assert.equal(M.lerLista(['  Centro ', '', '  ', 'Jardim']).join('|'), 'Centro|Jardim');
  assert.equal(M.lerLista(['', ' ']), null);
  const def = { itens: [{ k: 'nome', min: 2, max: 60, opcional: false }, { k: 'descricao', min: 2, max: 140, opcional: true }] };
  assert.deepEqual(M.lerObjetos([{ nome: ' Fisio ', descricao: '' }, { nome: '', descricao: '' }], def), [{ nome: 'Fisio' }]);
  assert.equal(M.lerObjetos([{ nome: '', descricao: 'sem nome' }], def), false, 'linha com o obrigatório vazio: não salva, avisa');
  assert.equal(M.lerObjetos([{ nome: '', descricao: '' }], def), null);
});

test('a tela: aviso de dados pessoais, o texto da autorização é o do esquema, só textContent, sem inline nem blur', () => {
  const js = semComentario(FONTE);
  assert.ok(js.includes('Não escreva CPF, CNPJ nem dados de outras pessoas.'));
  assert.ok(js.includes('ESQ.AUTORIZACAO.texto'), 'a caixa mostra o texto que o servidor grava');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'tudo que vem do cliente ou do servidor entra por textContent');
  assert.ok(!/\.style\.cssText|setAttribute\(\s*['"]style/.test(js));
  assert.ok(!/blur\(|backdrop-filter|box-shadow/.test(js + ler('css/orcamento-entrega.css')), 'sem desfoque nem sombra');
  assert.ok(js.includes('O que você não mandar fica como no modelo.') && js.includes('mudanças entram na lista de ajustes da prévia'));
  assert.ok(js.includes('Recebido. Previsão do seu site:') && js.includes('Você vê a prévia aqui mesmo.'));
  assert.ok(js.includes("'image/jpeg,image/png,image/webp'") || js.includes('image/jpeg,image/png,image/webp'), 'accept só com os três tipos');
  assert.ok(!/image\/svg|\.svg|heic/i.test(js), 'SVG nunca');
});

test('as regras de CSS do material: botões de 44 px e texto de 16 px nos controles', () => {
  const css = ler('css/orcamento-entrega.css');
  assert.match(css, /\.orc-mat__campo input[^{]*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.orc-arq__tirar[^{]*\{[^}]*min-(width|height):\s*44px/);
  assert.ok(!/font-size:\s*(1[0-5]px|\.[0-8]\d*rem)/.test(css.slice(css.indexOf('.orc-mat'))), 'texto que importa com 16 px ou mais no material');
});

test('M2 (revisão): 429 no salvamento espera 11 s e repete até 5 vezes; só a 429 repete; salvar o que não mudou não gasta o freio', async () => {
  let n = 0; const esperas = [];
  assert.equal(await M.repetirNo429(async () => { if (++n <= 3) throw Object.assign(new Error('x'), { status: 429 }); return 'ok'; }, { esperar: async ms => { esperas.push(ms); } }), 'ok');
  assert.deepEqual(esperas, [11000, 11000, 11000]);
  await assert.rejects(M.repetirNo429(async () => { throw Object.assign(new Error('x'), { status: 429 }); }, { esperar: async () => {}, vezes: 2 }), e => e.status === 429, 'depois da última tentativa vira erro');
  let k = 0;
  await assert.rejects(M.repetirNo429(async () => { k++; throw Object.assign(new Error('x'), { status: 400 }); }, { esperar: async () => {} }), e => e.status === 400);
  assert.equal(k, 1, 'outro erro não repete');
  assert.equal(M.mudouDe(['Centro'], ['Centro']), false); assert.equal(M.mudouDe(undefined, null), false); assert.equal(M.mudouDe('a', 'b'), true); assert.equal(M.mudouDe(undefined, 'a'), true);
  const codigo = semComentario(FONTE);
  assert.ok(/mudouDe\(/.test(codigo.slice(codigo.indexOf('async function salvar'), codigo.indexOf('function guardarLocal'))), 'salvar compara com o que o servidor já tem antes de pedir');
});

test('M3 (revisão): "Enviar" primeiro esvazia a fila de salvamentos (o que está agendado sai na hora e o que está em andamento termina)', async () => {
  const fila = M.criarFilaDeSalvamento(), feitos = [];
  fila.agendar('a', async () => { feitos.push('a1'); return true; }, 20);
  fila.agendar('a', async () => { feitos.push('a2'); return true; }, 20);   /* o mesmo campo: só o último valor vale */
  fila.agendar('b', async () => { await new Promise(r => setTimeout(r, 30)); feitos.push('b'); return true; }, 60000);
  assert.equal(fila.pendentes(), 2);
  assert.equal(await fila.esvaziar(), true);
  assert.deepEqual(feitos.sort(), ['a2', 'b']);
  assert.equal(fila.pendentes(), 0);
  fila.agendar('c', async () => false, 60000);
  assert.equal(await fila.esvaziar(), false, 'um salvamento que falhou impede o envio');
  fila.agendar('d', async () => { throw new Error('rede'); }, 60000);
  assert.equal(await fila.esvaziar(), false);
  const agora = semComentario(FONTE);
  const enviar = agora.slice(agora.indexOf('async function enviar()'), agora.indexOf('function somenteLeitura'));
  assert.ok(enviar.indexOf('esvaziar()') > 0 && enviar.indexOf('esvaziar()') < enviar.indexOf('materialEnviar()'), 'enviar espera os salvamentos antes de enviar');
});

test('M4 (revisão): a linha do arquivo só é refeita quando muda de forma (o progresso só troca o texto e a barra: o foco fica); miniatura pequena; URL revogada', () => {
  const it = { id: 'l1', papel: 'foto', estado: 'enviando', progresso: 0.2, erro: null, tamanho: 2 * 1024 * 1024 };
  assert.equal(M.chaveDaLinha(it), M.chaveDaLinha({ ...it, progresso: 0.9 }), 'o progresso não muda a forma da linha');
  assert.notEqual(M.chaveDaLinha(it), M.chaveDaLinha({ ...it, estado: 'erro', erro: 'x' }));
  assert.notEqual(M.chaveDaLinha(it), M.chaveDaLinha({ ...it, estado: 'enviado' }));
  assert.equal(M.textoDoEstado({ ...it, progresso: 0.4 }), '2 MB · enviando 40%');
  assert.equal(M.textoDoEstado({ ...it, estado: 'enviado' }), '2 MB · enviada');
  assert.equal(M.textoDoEstado({ ...it, estado: 'fila' }), '2 MB · preparando…');
  assert.equal(M.textoDoEstado({ ...it, estado: 'erro', erro: 'Sem conexão.' }), 'Sem conexão.');
  const js = semComentario(FONTE);
  assert.ok(!/createObjectURL\(it\.arquivo\)/.test(js), 'a miniatura não vem do arquivo original inteiro (decodificar 20 fotos de 12 MP derruba o Safari)');
  assert.ok(js.includes('resizeWidth') && js.includes('revokeObjectURL'), 'miniatura reduzida na decodificação e URL revogada quando a linha sai');
  assert.ok(!/logo\.textContent = ''|fotos\.textContent = ''/.test(js), 'a lista não é apagada e refeita a cada progresso');
});
