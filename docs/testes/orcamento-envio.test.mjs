/* O MOTOR DE ENVIO (PR 3b-2; spec §7): um arquivo por vez, cada passo na ordem (reduzir → reservar → enviar → conferir), os
   erros em palavra simples na linha do arquivo, "Tentar de novo" que desfaz a reserva velha, os limites avisados antes
   (a tela só repete o servidor), e o nome do arquivo do aparelho que nunca sai dele. JS de navegador (IIFE): roda aqui com
   window de mentira; a redução (canvas) e o PUT (XHR) são injetados.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ESQ from '../../js/orcamento-material-esquema.js';

const janela = { BZMaterialEsquema: ESQ };
new Function('window', fs.readFileSync(new URL('../../js/orcamento-envio.js', import.meta.url), 'utf8'))(janela);
const V = janela.BZEnvio;
const MB = 1024 * 1024;
const arq = (nome, type, size) => ({ name: nome, type, size });

test('a escolha: só PNG, JPEG e WebP; SVG, GIF, HEIC e sem tipo não; 21ª foto e 2ª logo não', () => {
  const vivos = (n, papel) => Array.from({ length: n }, () => ({ papel, estado: 'enviado' }));
  assert.equal(V.problemaDaEscolha(arq('a.jpg', 'image/jpeg', MB), 'foto', []), null);
  for (const t of ['image/svg+xml', 'image/gif', 'image/heic', '', 'text/html']) assert.match(V.problemaDaEscolha(arq('x', t, 10), 'foto', []), /Use JPG, PNG ou WebP/, t);
  assert.match(V.problemaDaEscolha(arq('a.jpg', 'image/jpeg', MB), 'foto', vivos(20, 'foto')), /limite de 20 fotos/);
  assert.equal(V.problemaDaEscolha(arq('a.jpg', 'image/jpeg', MB), 'foto', vivos(19, 'foto')), null);
  assert.match(V.problemaDaEscolha(arq('l.png', 'image/png', MB), 'logo', vivos(1, 'logo')), /Já há uma logo/);
  assert.match(V.problemaDaEscolha(arq('l.png', 'image/png', 6 * MB), 'logo', []), /até 5 MB/, 'a logo vai como está: acima de 5 MB já avisa');
  assert.equal(V.problemaDaEscolha(arq('a.jpg', 'image/jpeg', 12 * MB), 'foto', []), null, 'foto grande: o aparelho reduz antes de enviar');
  assert.equal(V.problemaDaEscolha(arq('a.jpg', 'image/jpeg', 10), 'foto', [{ papel: 'foto', estado: 'erro' }, ...vivos(19, 'foto')]), null, 'linha com erro não conta no limite');
});

test('o tamanho final (depois de reduzir): foto até 10 MB, logo até 5 MB', () => {
  assert.equal(V.problemaDoTamanho('foto', 10 * MB), null);
  assert.match(V.problemaDoTamanho('foto', 10 * MB + 1), /até 10 MB/);
  assert.match(V.problemaDoTamanho('logo', 5 * MB + 1), /até 5 MB/);
});

test('reduzir: acima de 3 MB ou de 2560 px; nunca amplia', () => {
  assert.equal(V.precisaReduzir({ size: 3 * MB + 1, largura: 1000, altura: 800 }), true);
  assert.equal(V.precisaReduzir({ size: MB, largura: 4032, altura: 3024 }), true);
  assert.equal(V.precisaReduzir({ size: MB, largura: 2560, altura: 1920 }), false);
  assert.equal(V.escalaFinal(4032, 3024), 2560 / 4032);
  assert.equal(V.escalaFinal(800, 600), 1);
});

function montar({ reservar, enviar, conferir, reduzir } = {}) {
  const log = [], esperas = [];
  const API = {
    materialReservar: async (papel, tipo, tamanho) => { log.push(['reservar', papel, tipo, tamanho]); return reservar ? reservar(papel, tipo, tamanho) : { arquivo_id: 'id' + log.length, url_envio: 'http://x/up' + log.length }; },
    materialConferir: async id => { log.push(['conferir', id]); return conferir ? conferir(id) : { status: 'conferido' }; },
    materialRemover: async id => { log.push(['remover', id]); return { ok: true }; }
  };
  const motor = V.criar({ API, aoMudar: () => {}, reduzir: reduzir || (async a => { log.push(['reduzir']); return { blob: a, tipo: a.type }; }),
    enviarPut: async (url, blob, tipo, prog) => { log.push(['put', url, tipo]); if (enviar) await enviar(url); prog(1); },
    esperar: async ms => { esperas.push(ms); }, agora: () => relogio.t });
  return { motor, log, esperas };
}
const relogio = { t: 1_000_000 };
const erroHttp = (status, msg) => Object.assign(new Error(msg || 'erro ' + status), { status });
const esperar = async m => { for (let i = 0; i < 50 && m.motor.resumo().emAndamento; i++) await new Promise(r => setTimeout(r, 1)); };

test('o caminho de um arquivo: reservar → enviar → conferir, um por vez, na ordem em que foram escolhidos', async () => {
  const { motor, log } = montar();
  motor.adicionar([arq('IMG_1.jpg', 'image/jpeg', MB), arq('IMG_2.jpg', 'image/jpeg', 2 * MB)], 'foto');
  await esperar({ motor });
  assert.deepEqual(log.map(l => l[0]).filter(x => x !== 'reduzir'), ['reservar', 'put', 'conferir', 'reservar', 'put', 'conferir'], 'o segundo só começa depois do primeiro');
  assert.deepEqual(motor.itens().map(i => i.estado), ['enviado', 'enviado']);
  assert.deepEqual(log.filter(l => l[0] === 'reservar').map(l => [l[1], l[2], l[3]]), [['foto', 'image/jpeg', MB], ['foto', 'image/jpeg', 2 * MB]], 'o tamanho declarado é o do arquivo que vai mesmo');
  assert.deepEqual(motor.resumo(), { logo: false, fotos: 2, emAndamento: false, presos: 0 });
});

test('o nome do arquivo do aparelho nunca vai ao servidor (nem na reserva, nem no envio)', async () => {
  const { motor, log } = montar();
  motor.adicionar([arq('Foto_da_minha_casa_Joana_Silva.jpg', 'image/jpeg', MB)], 'foto');
  await esperar({ motor });
  assert.ok(!JSON.stringify(log).includes('Joana'), JSON.stringify(log));
  assert.equal(motor.itens()[0].nome, 'Foto_da_minha_casa_Joana_Silva.jpg', 'só a tela mostra o nome');
});

test('erro do servidor aparece na linha do arquivo, em palavra simples; "Tentar de novo" desfaz a reserva velha e refaz', async () => {
  let vez = 0;
  const { motor, log } = montar({ conferir: id => { if (++vez === 1) { const e = new Error('O arquivo que chegou não é o que você escolheu. Tente de novo.'); e.status = 422; throw e; } return { status: 'conferido' }; } });
  motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto');
  await esperar({ motor });
  const it = motor.itens()[0];
  assert.deepEqual([it.estado, it.erro], ['erro', 'O arquivo que chegou não é o que você escolheu. Tente de novo.']);
  motor.tentarDeNovo(it.id);
  await esperar({ motor });
  assert.equal(motor.itens()[0].estado, 'enviado');
  assert.deepEqual(log.map(l => l[0]).filter(x => x !== 'reduzir'), ['reservar', 'put', 'conferir', 'remover', 'reservar', 'put', 'conferir'], 'o servidor recusou o conteúdo: a reserva é desfeita antes da nova');
  assert.equal(log.filter(l => l[0] === 'reduzir').length, 1, 'a foto não é reduzida de novo');
});

test('M6: conferência "não chegou" (409) + "Tentar de novo": repete SÓ o envio, no mesmo link; nenhuma reserva nova, nenhuma redução nova', async () => {
  let vez = 0;
  const { motor, log } = montar({ conferir: () => { if (++vez === 1) throw erroHttp(409, 'O arquivo ainda não chegou.'); return { status: 'conferido' }; } });
  motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor });
  assert.equal(motor.itens()[0].estado, 'erro');
  motor.tentarDeNovo(motor.itens()[0].id); await esperar({ motor });
  assert.equal(motor.itens()[0].estado, 'enviado');
  assert.deepEqual(log.map(l => l[0]), ['reduzir', 'reservar', 'put', 'conferir', 'put', 'conferir']);
  assert.equal(log.filter(l => l[0] === 'put')[0][1], log.filter(l => l[0] === 'put')[1][1], 'o mesmo link');
});

test('M6: falha só no envio (rede): "Tentar de novo" reaproveita a reserva; se o link já passou de 110 min, reserva de novo', async () => {
  let n = 0;
  const { motor, log } = montar({ enviar: async () => { if (++n === 1) throw new Error('Sem conexão. Confira a internet e tente de novo.'); } });
  motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor });
  motor.tentarDeNovo(motor.itens()[0].id); await esperar({ motor });
  assert.deepEqual(log.map(l => l[0]), ['reduzir', 'reservar', 'put', 'put', 'conferir'], 'mesmo link, sem reservar de novo');
  let k = 0;
  const v = montar({ enviar: async () => { if (++k === 1) throw new Error('Sem conexão. Confira a internet e tente de novo.'); } });
  v.motor.adicionar([arq('b.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor: v.motor });
  relogio.t += 111 * 60 * 1000;
  v.motor.tentarDeNovo(v.motor.itens()[0].id); await esperar({ motor: v.motor });
  assert.deepEqual(v.log.map(l => l[0]), ['reduzir', 'reservar', 'put', 'remover', 'reservar', 'put', 'conferir'], 'link velho: a reserva antiga sai e entra uma nova');
});

test('M6: 429 do servidor (freio): espera 11 s e repete o MESMO passo até 3 vezes, sem a pessoa tocar; depois da 3ª vira erro', async () => {
  let n = 0;
  const a = montar({ reservar: async () => { if (++n <= 2) throw erroHttp(429, 'Muitos pedidos.'); return { arquivo_id: 'x1', url_envio: 'http://x/up' }; } });
  a.motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor: a.motor });
  assert.equal(a.motor.itens()[0].estado, 'enviado');
  assert.deepEqual(a.esperas, [11000, 11000]);
  const b = montar({ conferir: async () => { throw erroHttp(503, 'Tente em instantes.'); } });
  b.motor.adicionar([arq('b.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor: b.motor });
  assert.equal(b.motor.itens()[0].estado, 'erro');
  assert.equal(b.esperas.length, 3, 'três esperas, depois desiste e mostra o erro');
  assert.equal(b.log.filter(l => l[0] === 'put').length, 1, 'repetiu a conferência, não o envio');
});

test('falha de rede no envio vira a frase da tela; foto grande demais mesmo reduzida vira erro sem reservar', async () => {
  const { motor, log } = montar({ enviar: async () => { throw new Error('Sem conexão. Confira a internet e tente de novo.'); } });
  motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor });
  assert.equal(motor.itens()[0].estado, 'erro'); assert.match(motor.itens()[0].erro, /Sem conexão/);
  const g = montar({ reduzir: async a => ({ blob: { size: 11 * MB }, tipo: 'image/jpeg' }) });
  g.motor.adicionar([arq('b.jpg', 'image/jpeg', 12 * MB)], 'foto'); await esperar({ motor: g.motor });
  assert.match(g.motor.itens()[0].erro, /até 10 MB/); assert.equal(g.log.length, 0, 'nada foi reservado');
  assert.ok(log.length > 0);
});

test('remover: tira da lista e do servidor (só o que já tinha reserva); a linha com erro sem reserva sai sem chamar nada', async () => {
  const { motor, log } = montar();
  motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor });
  motor.remover(motor.itens()[0].id);
  assert.deepEqual(log.filter(l => l[0] === 'remover'), [['remover', 'id2']], 'o id de mentira é "id" + o tamanho do log na hora da reserva (já havia a redução)');
  assert.deepEqual(motor.itens(), []);
  const r = montar(); r.motor.adicionar([arq('a.svg', 'image/svg+xml', 10)], 'foto');
  assert.equal(r.motor.itens()[0].estado, 'erro'); r.motor.remover(r.motor.itens()[0].id);
  assert.equal(r.log.length, 0); assert.deepEqual(r.motor.itens(), []);
});

test('hidratar: o que o servidor já tem (outra aba, volta ao pedido) vira linha "enviada" sem miniatura; uma reserva abandonada vira erro', async () => {
  const { motor } = montar();
  motor.hidratar([{ id: 'a1', papel: 'logo', tamanho: 4000, status: 'conferido' }, { id: 'a2', papel: 'foto', tamanho: 9000, status: 'conferido' }, { id: 'a3', papel: 'foto', tamanho: 5, status: 'reservado' }]);
  assert.deepEqual(motor.itens().map(i => [i.papel, i.estado, i.arquivo || null]), [['logo', 'enviado', null], ['foto', 'enviado', null], ['foto', 'erro', null]]);
  assert.deepEqual(motor.resumo(), { logo: true, fotos: 1, emAndamento: false, presos: 1 });
  motor.hidratar([{ id: 'a1', papel: 'logo', tamanho: 4000, status: 'conferido' }]);
  assert.equal(motor.itens().filter(i => i.arquivoId === 'a1').length, 1, 'hidratar duas vezes não duplica');
});

test('a logo vai como está (sem reduzir); a foto passa pela redução', async () => {
  const visto = [];
  const { motor } = montar({ reduzir: async (a, papel) => { visto.push(papel); return { blob: a, tipo: a.type }; } });
  motor.adicionar([arq('l.png', 'image/png', MB)], 'logo'); await esperar({ motor });
  motor.adicionar([arq('f.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor });
  assert.deepEqual(visto, ['logo', 'foto'], 'a função de redução é chamada com o papel; ela decide não mexer na logo');
});

test('M1 (revisão): PUT que responde 409 (já gravado antes: a resposta se perdeu) segue para a conferência, sem reservar nem reduzir de novo', async () => {
  let n = 0;
  const { motor, log } = montar({ enviar: async () => { if (++n === 1) throw Object.assign(new Error('O envio não terminou. Toque em "Tentar de novo".'), { status: 409 }); } });
  motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor });
  assert.equal(motor.itens()[0].estado, 'enviado', 'o objeto já estava lá: a conferência decide');
  assert.deepEqual(log.map(l => l[0]), ['reduzir', 'reservar', 'put', 'conferir']);
  /* o Supabase também pode responder 400 com "Duplicate" / statusCode 409 no corpo */
  const d = montar({ enviar: async () => { throw Object.assign(new Error('x'), { status: 400, corpo: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }); } });
  d.motor.adicionar([arq('b.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor: d.motor });
  assert.equal(d.motor.itens()[0].estado, 'enviado');
  /* já gravado mas a conferência recusa (objeto de outro tamanho): erro na linha, como sempre */
  const r = montar({ enviar: async () => { throw Object.assign(new Error('x'), { status: 409 }); }, conferir: async () => { throw erroHttp(422, 'O arquivo que chegou não é o que você escolheu. Tente de novo.'); } });
  r.motor.adicionar([arq('c.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor: r.motor });
  assert.equal(r.motor.itens()[0].estado, 'erro');
  assert.equal(V.jaGravado(409), true); assert.equal(V.jaGravado(400, 'Duplicate'), true); assert.equal(V.jaGravado(400, 'outro erro'), false); assert.equal(V.jaGravado(500, 'Duplicate'), false);
});

test('B1 (revisão): o resumo conta os arquivos presos (com reserva no servidor e em erro), que travam o Enviar até serem tirados', async () => {
  const { motor } = montar();
  motor.hidratar([{ id: 'a3', papel: 'foto', tamanho: 5, status: 'reservado' }, { id: 'a4', papel: 'foto', tamanho: 5, status: 'conferido' }]);
  assert.equal(motor.resumo().presos, 1, 'a reserva abandonada vinda do servidor');
  motor.remover('sa3');
  assert.equal(motor.resumo().presos, 0);
  const r = montar(); r.motor.adicionar([arq('a.svg', 'image/svg+xml', 10)], 'foto');
  assert.equal(r.motor.itens()[0].estado, 'erro'); assert.equal(r.motor.resumo().presos, 0, 'erro local sem reserva não trava nada');
});

test('B2 (revisão): enquanto uma reserva está sendo feita aqui, a hidratação não a toma por abandonada', async () => {
  let solta;
  const { motor } = montar({ reservar: () => new Promise(ok => { solta = () => ok({ arquivo_id: 'x9', url_envio: 'http://x/up' }); }) });
  motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto');
  for (let i = 0; i < 20 && motor.itens()[0].estado !== 'reservando'; i++) await new Promise(r => setTimeout(r, 1));
  assert.equal(motor.itens()[0].estado, 'reservando');
  motor.hidratar([{ id: 'x9', papel: 'foto', tamanho: MB, status: 'reservado' }]);
  assert.equal(motor.itens().length, 1, 'nenhuma linha "abandonada" duplicada');
  solta(); await esperar({ motor });
  assert.equal(motor.itens()[0].estado, 'enviado');
});

test('B9 (revisão): a recusa "tente amanhã" (balde cheio) não espera 33 s repetindo; o freio comum (429) continua repetindo', async () => {
  const a = montar({ reservar: async () => { throw Object.assign(new Error('Recebemos muitos arquivos agora. Tente de novo amanhã.'), { status: 503, dados: { recuperavel: true, tentarDepois: true } }); } });
  a.motor.adicionar([arq('a.jpg', 'image/jpeg', MB)], 'foto'); await esperar({ motor: a.motor });
  assert.equal(a.motor.itens()[0].estado, 'erro'); assert.deepEqual(a.esperas, [], 'nenhuma espera');
  assert.match(a.motor.itens()[0].erro, /amanhã/);
});
