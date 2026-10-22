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
