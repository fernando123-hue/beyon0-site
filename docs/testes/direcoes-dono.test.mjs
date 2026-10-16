/* O COMANDO DO DONO (scripts/direcoes.mjs), pendências do PR #43 (docs/revisoes/pr1-pendencias.md): o conferir só
   abre o arquivo REAL de um pedido (sem seguir junção ou link para outra pasta); o preparo da sessão olha CLAUDE.md
   em TODAS as pastas acima e não grava seguindo um link plantado; a entrega recusada não faz nenhum POST. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { arquivoDeDirecao, configsAcima, prepararPastaSessao, entregarPedido } from '../../scripts/direcoes.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bz-dono-'));
/* fileURLToPath: o pathname de uma URL sai com %20 no lugar dos espaços ("Beyon Zero" é pasta deste repositório) */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* junção no Windows (sem privilégio), link simbólico no resto */
/* a "casa" dos testes é uma pasta temporária, que no Windows fica DENTRO da casa de verdade (e a .claude dela é achada
   como se fosse de uma pasta acima): o que vale aqui é o que está de dentro da casa de teste para baixo */
const dentroDe = (casa, achados) => achados.filter(a => a.startsWith(casa + path.sep));
const ligar = (alvo, link) => fs.symlinkSync(alvo, link, process.platform === 'win32' ? 'junction' : 'dir');

test('conferir: arquivo real de um pedido passa; junção para outra pasta e "../outro" recusam', () => {
  const raiz = tmp();
  fs.mkdirSync(path.join(raiz, 'aaaaaaaa'));
  fs.mkdirSync(path.join(raiz, 'bbbbbbbb'));
  fs.writeFileSync(path.join(raiz, 'aaaaaaaa', 'conversao.json'), '{}');
  fs.writeFileSync(path.join(raiz, 'bbbbbbbb', 'conversao.json'), '{}');
  assert.equal(arquivoDeDirecao(path.join(raiz, 'aaaaaaaa', 'conversao.json'), raiz), fs.realpathSync(path.join(raiz, 'aaaaaaaa', 'conversao.json')));
  const fora = tmp();
  fs.writeFileSync(path.join(fora, 'conversao.json'), '{}');
  ligar(fora, path.join(raiz, 'cccccccc'));
  assert.throws(() => arquivoDeDirecao(path.join(raiz, 'cccccccc', 'conversao.json'), raiz), /Só confiro/);
  assert.throws(() => arquivoDeDirecao(path.join(raiz, 'aaaaaaaa', '..', 'bbbbbbbb', '..', 'aaaaaaaa', 'pedido.json'), raiz), /Só confiro/);
});

test('preparo: CLAUDE.md em qualquer pasta acima recusa; .claude na casa do usuário não conta', () => {
  const casa = tmp();
  const mae = path.join(casa, 'BeyonZero-direcoes');
  const dir = path.join(mae, 'aaaaaaaa');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(casa, '.claude'));
  assert.deepEqual(dentroDe(casa, configsAcima(dir, casa)), [], 'a .claude da casa é a configuração do usuário');
  fs.writeFileSync(path.join(casa, 'CLAUDE.md'), '# plantado');
  assert.deepEqual(dentroDe(casa, configsAcima(dir, casa)), [path.join(casa, 'CLAUDE.md')]);
  assert.throws(() => prepararPastaSessao({ dir, repo: REPO, casa }), /CLAUDE\.md/);
  fs.rmSync(path.join(casa, 'CLAUDE.md'));
  fs.mkdirSync(path.join(mae, '.claude'));
  assert.deepEqual(dentroDe(casa, configsAcima(dir, casa)), [path.join(mae, '.claude')], 'fora da casa, a .claude conta');
});

test('preparo: um link plantado no lugar do .sessao.json é apagado, não seguido', () => {
  const casa = tmp();
  const dir = path.join(casa, 'BeyonZero-direcoes', 'aaaaaaaa');
  fs.mkdirSync(dir, { recursive: true });
  const alvo = path.join(casa, 'alvo.txt');
  fs.writeFileSync(alvo, 'intacto');
  try { fs.symlinkSync(alvo, path.join(dir, '.sessao.json'), 'file'); }
  catch { return; /* sem permissão de link de arquivo (Windows sem modo desenvolvedor): a junção já cobre o caso das pastas */ }
  prepararPastaSessao({ dir, repo: REPO, casa: os.homedir() });
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'intacto', 'o alvo do link não foi escrito');
  assert.equal(fs.lstatSync(path.join(dir, '.sessao.json')).isSymbolicLink(), false);
});

test('entregar: o dono recusa (ou o filtro recusa) e NENHUM POST sai', async () => {
  const raiz = tmp();
  const pasta = path.join(raiz, 'aaaaaaaa');
  fs.mkdirSync(pasta);
  const id = '11111111-1111-4111-8111-111111111111';
  fs.writeFileSync(path.join(pasta, 'pedido.json'), JSON.stringify({ direcoes: [{ id, estrategia: 'conversao', status: 'gerando' }] }));
  fs.writeFileSync(path.join(pasta, 'conversao.json'), JSON.stringify({ lixo: true }));
  const posts = [];
  const painel = async (metodo, consulta, corpo) => {
    if (metodo === 'POST') { posts.push(corpo); return { ajustes: [], pendentes: 0 }; }
    return { fila: [{ conversa_id: 'aaaaaaaa-0000-4000-8000-000000000000', direcoes: [{ id, status: 'gerando' }] }] };
  };
  await assert.rejects(entregarPedido({ prefixo: 'aaaaaaaa', raiz, painel, perguntar: async () => 'qualquer', log: () => {} }), /recusado pelo filtro/);
  assert.equal(posts.length, 0, 'filtro recusou: nada saiu');
  const valida = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'testes', 'fixtures', 'direcao-valida.json'), 'utf8'));
  fs.writeFileSync(path.join(pasta, 'conversao.json'), JSON.stringify(valida));
  const r = await entregarPedido({ prefixo: 'aaaaaaaa', raiz, painel, perguntar: async () => 'ENTREGAR-ERRADO', log: () => {} });
  assert.deepEqual(r, { entregues: [], pendentes: null });
  assert.equal(posts.length, 0, 'código errado: nada saiu');
});
