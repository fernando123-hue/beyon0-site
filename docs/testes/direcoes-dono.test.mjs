/* O COMANDO DO DONO (scripts/direcoes.mjs), pendências do PR #43 (docs/revisoes/pr1-pendencias.md): o conferir só
   abre o arquivo REAL de um pedido (sem seguir junção ou link para outra pasta); o preparo da sessão olha CLAUDE.md
   em TODAS as pastas acima e não grava seguindo um link plantado; a entrega recusada não faz nenhum POST. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../../scripts/direcoes.mjs';

const { arquivoDeDirecao, configsAcima, prepararPastaSessao, entregarPedido, planejarEntrega, gravarPedido, pastaReal } = D;

/* toda pasta temporária dos testes é apagada no fim (rmSync não segue junção: só o link some, nunca o destino) */
const criadas = [];
const tmp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bz-dono-'))); criadas.push(d); return d; };
after(() => { for (const d of criadas) fs.rmSync(d, { recursive: true, force: true }); });
/* fileURLToPath: o pathname de uma URL sai com %20 no lugar dos espaços ("Beyon Zero" é pasta deste repositório) */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* junção no Windows (sem privilégio), link simbólico no resto */
/* a pasta temporária-base dos testes fica, no Windows, DENTRO da casa de verdade (e a .claude dela é achada como se fosse
   de uma pasta acima): o que vale aqui é o que está de dentro da base para baixo. O filtro é a BASE, não a "casa" de teste:
   assim um CLAUDE.md plantado ACIMA da casa também tem de ser achado (a subida não pode parar na casa) */
const dentroDe = (base, achados) => achados.filter(a => a.startsWith(base + path.sep));
const VALIDA = () => JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'testes', 'fixtures', 'direcao-valida.json'), 'utf8'));
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

test('preparo: CLAUDE.md em qualquer pasta acima recusa (também ACIMA da casa); .claude na casa do usuário não conta', () => {
  const base = tmp();
  const casa = path.join(base, 'casa');
  const mae = path.join(casa, 'BeyonZero-direcoes');
  const dir = path.join(mae, 'aaaaaaaa');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(casa, '.claude'));
  assert.deepEqual(dentroDe(base, configsAcima(dir, casa)), [], 'a .claude da casa é a configuração do usuário');
  fs.writeFileSync(path.join(casa, 'CLAUDE.md'), '# plantado');
  assert.deepEqual(dentroDe(base, configsAcima(dir, casa)), [path.join(casa, 'CLAUDE.md')]);
  assert.throws(() => prepararPastaSessao({ dir, repo: REPO, casa }), /CLAUDE\.md/);
  fs.rmSync(path.join(casa, 'CLAUDE.md'));
  fs.mkdirSync(path.join(mae, '.claude'));
  assert.deepEqual(dentroDe(base, configsAcima(dir, casa)), [path.join(mae, '.claude')], 'fora da casa, a .claude conta');
  fs.rmSync(path.join(mae, '.claude'), { recursive: true });
  /* ACIMA da casa (a pasta do usuário, o disco): o Claude Code também lê dali, então a subida não para na casa */
  fs.writeFileSync(path.join(base, 'CLAUDE.md'), '# plantado acima da casa');
  assert.deepEqual(dentroDe(base, configsAcima(dir, casa)), [path.join(base, 'CLAUDE.md')], 'a subida vai até a raiz do disco');
  assert.throws(() => prepararPastaSessao({ dir, repo: REPO, casa }), /CLAUDE\.md/);
});

/* hard link (fs.linkSync) roda em qualquer máquina, ao contrário do link simbólico de arquivo (EPERM no Windows sem modo
   desenvolvedor); e é o caso que importa: apagar o hard link não toca o alvo, mas gravar "através" dele muda o alvo */
test('preparo: um hard link plantado no lugar do .sessao.json e do .instrucoes.md é apagado, não seguido', () => {
  const base = tmp();
  const dir = path.join(base, 'BeyonZero-direcoes', 'aaaaaaaa');
  fs.mkdirSync(dir, { recursive: true });
  const alvos = { '.sessao.json': path.join(base, 'alvo1.txt'), '.instrucoes.md': path.join(base, 'alvo2.txt') };
  for (const [nome, alvo] of Object.entries(alvos)) {
    fs.writeFileSync(alvo, 'intacto');
    fs.linkSync(alvo, path.join(dir, nome));
    assert.equal(fs.statSync(alvo).nlink, 2, 'o hard link foi plantado');
  }
  prepararPastaSessao({ dir, repo: REPO, casa: os.homedir() });
  for (const [nome, alvo] of Object.entries(alvos)) {
    assert.equal(fs.readFileSync(alvo, 'utf8'), 'intacto', 'o alvo do link de ' + nome + ' não foi escrito');
    assert.equal(fs.statSync(path.join(dir, nome)).nlink, 1, nome + ' agora é um arquivo só dele');
    assert.notEqual(fs.readFileSync(path.join(dir, nome), 'utf8'), 'intacto');
  }
});

test('preparo: a pasta do pedido sendo uma junção para outro lugar RECUSA, e o destino fica intacto', () => {
  const base = tmp();
  const casaFalsa = path.join(base, 'casa-falsa');
  fs.mkdirSync(path.join(casaFalsa, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(casaFalsa, '.claude', 'settings.json'), 'config do usuario');
  fs.writeFileSync(path.join(casaFalsa, 'CLAUDE.md'), 'memoria do usuario');
  const mae = path.join(base, 'BeyonZero-direcoes');
  fs.mkdirSync(mae);
  const dir = path.join(mae, 'abcd1234');
  ligar(casaFalsa, dir);
  assert.throws(() => prepararPastaSessao({ dir, repo: REPO, casa: os.homedir() }), /link ou junção/);
  assert.equal(fs.readFileSync(path.join(casaFalsa, '.claude', 'settings.json'), 'utf8'), 'config do usuario', 'a .claude do destino não foi apagada');
  assert.equal(fs.readFileSync(path.join(casaFalsa, 'CLAUDE.md'), 'utf8'), 'memoria do usuario', 'o CLAUDE.md do destino não foi apagado');
  assert.deepEqual(fs.readdirSync(casaFalsa).sort(), ['.claude', 'CLAUDE.md'], 'nada foi gravado no destino');
});

test('pedido: pasta do pedido (ou a raiz) sendo junção recusa; pedido.json plantado como hard link não é seguido', () => {
  const base = tmp();
  const destino = path.join(base, 'destino');
  fs.mkdirSync(destino);
  /* a pasta do pedido é uma junção */
  const raiz = path.join(base, 'BeyonZero-direcoes');
  fs.mkdirSync(raiz);
  ligar(destino, path.join(raiz, 'abcd1234'));
  assert.throws(() => gravarPedido(path.join(raiz, 'abcd1234'), '{}'), /link ou junção/);
  assert.deepEqual(fs.readdirSync(destino), [], 'nada foi gravado no destino');
  /* a RAIZ é uma junção */
  const raizLink = path.join(base, 'raiz-link');
  ligar(destino, raizLink);
  assert.throws(() => gravarPedido(path.join(raizLink, 'abcd1234'), '{}'), /link ou junção/);
  assert.deepEqual(fs.readdirSync(destino), [], 'a raiz-junção também não grava');
  /* pasta normal: grava, e regrava (o "pedido" rodado de novo) */
  const dir = path.join(raiz, 'eeee5555');
  assert.equal(gravarPedido(dir, '{"v":1}'), path.join(dir, 'pedido.json'));
  assert.equal(gravarPedido(dir, '{"v":2}'), path.join(dir, 'pedido.json'));
  assert.equal(fs.readFileSync(path.join(dir, 'pedido.json'), 'utf8'), '{"v":2}');
  /* pedido.json plantado como hard link para fora */
  const alvo = path.join(base, 'alvo.txt');
  fs.writeFileSync(alvo, 'intacto');
  fs.rmSync(path.join(dir, 'pedido.json'));
  fs.linkSync(alvo, path.join(dir, 'pedido.json'));
  gravarPedido(dir, '{"v":3}');
  assert.equal(fs.readFileSync(alvo, 'utf8'), 'intacto', 'o alvo do hard link não foi sobrescrito');
  assert.equal(fs.readFileSync(path.join(dir, 'pedido.json'), 'utf8'), '{"v":3}');
  assert.equal(fs.statSync(path.join(dir, 'pedido.json')).nlink, 1);
});

test('pastaReal: pasta comum devolve o caminho real; inexistente recusa', () => {
  const base = tmp();
  assert.equal(pastaReal(base), base);
  assert.throws(() => pastaReal(path.join(base, 'nao-existe')), /não existe/);
});

test('conferir e entrega: hard link para um arquivo de FORA da pasta do pedido é recusado', () => {
  const raiz = tmp();
  const pasta = path.join(raiz, 'aaaaaaaa');
  fs.mkdirSync(pasta);
  const fora = path.join(raiz, 'fora.json');
  fs.writeFileSync(fora, JSON.stringify(VALIDA()));
  const arq = path.join(pasta, 'conversao.json');
  fs.writeFileSync(arq, JSON.stringify(VALIDA()));
  assert.equal(arquivoDeDirecao(arq, raiz), fs.realpathSync(arq), 'arquivo comum passa');
  fs.rmSync(arq);
  fs.linkSync(fora, arq);
  assert.throws(() => arquivoDeDirecao(arq, raiz), /Só confiro/, 'o conferir recusa o hard link');
  /* a entrega (o caminho que envia ao painel) passa pela mesma checagem */
  const id = '11111111-1111-4111-8111-111111111111';
  fs.writeFileSync(path.join(pasta, 'pedido.json'), JSON.stringify({ direcoes: [{ id, estrategia: 'conversao', status: 'gerando' }] }));
  assert.throws(() => planejarEntrega(pasta), /conversao\.json não é um arquivo comum/, 'a entrega recusa o hard link');
  fs.rmSync(arq);
  fs.writeFileSync(arq, JSON.stringify(VALIDA()));
  assert.equal(planejarEntrega(pasta).length, 1, 'arquivo comum: segue');
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
  fs.writeFileSync(path.join(pasta, 'conversao.json'), JSON.stringify(VALIDA()));
  const r = await entregarPedido({ prefixo: 'aaaaaaaa', raiz, painel, perguntar: async () => 'ENTREGAR-ERRADO', log: () => {} });
  assert.deepEqual(r, { entregues: [], pendentes: null });
  assert.equal(posts.length, 0, 'código errado: nada saiu');
});
