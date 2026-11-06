/* O ENVIO INCERTO DE js/orcamento.js (ajustes pós-radar): a rede cai com a IA respondendo, o turno PODE ter entrado no servidor, a releitura pode falhar também. Roda o arquivo
   REAL numa página de mentira (docs/testes/orcamento-pagina-falsa.mjs) com um servidor e uma rede que o teste controla.
   Regra: o mesmo texto, de novo, relê antes e só dá o turno por entrado se o servidor tem, DEPOIS do ponto de antes, uma fala do visitante com o MESMO texto (a contagem sozinha não
   basta: outra aba ou aparelho também escreve); releitura que falha de novo = não reenvia, avisa e guarda o texto; outro texto desarma a dúvida.
   node --test docs/testes/orcamento-reenvio.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPagina } from './orcamento-pagina-falsa.mjs';

const CERTO = 'A planta está certa.';
const calar = () => new Promise((r) => setImmediate(r));
const esperar = async () => { for (let i = 0; i < 30; i++) await calar(); };
const AVISO_INCERTO = 'Não consegui confirmar se a sua mensagem foi. Confira a conversa antes de mandar de novo.';

async function paginaComConversa() {
  const p = criarPagina({ mensagens: [{ papel: 'visitante', conteudo: 'oi' }, { papel: 'agente', conteudo: 'Olá!' }] });
  assert.ok(await p.pronta());
  return p;
}
const redeCaiu = (p, { entra }) => { p.servidor.rede = false; p.servidor.redeParaLer = false; p.servidor.entra = entra; };
const redeVoltou = (p, { entra = true } = {}) => { p.servidor.rede = true; p.servidor.redeParaLer = true; p.servidor.entra = entra; };
const visitantes = (p, texto) => p.servidor.mensagens.filter((m) => m.papel === 'visitante' && m.conteudo === texto).length;

test('(i) envio incerto (entrou, a releitura também falhou) e o MESMO texto depois, com o estado relido mostrando o turno: não repete', async () => {
  const p = await paginaComConversa();
  redeCaiu(p, { entra: true });
  assert.equal(await p.enviar(CERTO), false, 'a página não sabe se entrou');
  redeVoltou(p, { entra: true });
  assert.equal(await p.enviar(CERTO), true, 'a releitura mostra o turno: entrou');
  assert.equal(p.servidor.chamadasMensagem.length, 1, 'só uma chamada de envio chegou ao servidor');
  assert.equal(visitantes(p, CERTO), 1);
});

test('(ii) envio incerto, OUTRO texto entra, depois o primeiro texto de novo, de propósito: ENVIA (a dúvida acabou com o outro texto)', async () => {
  const p = await paginaComConversa();
  redeCaiu(p, { entra: true });
  await p.enviar(CERTO);
  redeVoltou(p);
  assert.equal(await p.enviar('E o prazo, como fica?'), true);
  assert.equal(await p.enviar(CERTO), true);
  assert.equal(p.servidor.chamadasMensagem.filter((t) => t === CERTO).length, 2, 'o texto repetido de propósito vai');
  assert.equal(visitantes(p, CERTO), 2);
});

test('(iii) a releitura FALHA de novo na 2ª tentativa: não reenvia, avisa em palavra simples, mantém o texto na caixa e a dúvida armada', async () => {
  const p = await paginaComConversa();
  redeCaiu(p, { entra: true });
  await p.enviar(CERTO);
  p.servidor.rede = true;          /* o envio voltaria... */
  p.servidor.redeParaLer = false;  /* ...mas a releitura ainda não */
  p.caixa().value = '';
  assert.equal(await p.enviar(CERTO), false);
  assert.equal(p.servidor.chamadasMensagem.length, 1, 'NÃO reenviou: não dá para saber se a 1ª entrou');
  const a = p.aviso();
  assert.ok(a.visivel && a.texto === AVISO_INCERTO, a.texto);
  assert.equal(p.caixa().value, CERTO, 'o texto da pessoa não se perde');
  /* a dúvida segue armada: com a leitura de volta, o turno que tinha entrado não é repetido */
  redeVoltou(p, { entra: true });
  assert.equal(await p.enviar(CERTO), true);
  assert.equal(p.servidor.chamadasMensagem.length, 1);
});

test('(iv) uma fala de OUTRA aba com texto diferente não confirma o envio: a mensagem que não entrou é mandada', async () => {
  const p = await paginaComConversa();
  redeCaiu(p, { entra: false });
  assert.equal(await p.enviar(CERTO), false);
  p.servidor.mensagens.push({ papel: 'visitante', conteudo: 'escrevi isto em outra aba' }, { papel: 'agente', conteudo: 'ok' });
  redeVoltou(p, { entra: true });
  assert.equal(await p.enviar(CERTO), true);
  assert.equal(visitantes(p, CERTO), 1, 'a mensagem foi mandada (a contagem sozinha a teria engolido)');
  assert.equal(p.servidor.chamadasMensagem.length, 2);
});

test('(v) "Tentar de novo" (reenviar) segue a mesma regra, com uma releitura só: não repete o que entrou e manda o que não entrou', async () => {
  for (const entrou of [true, false]) {
    const p = await paginaComConversa();
    redeCaiu(p, { entra: entrou });
    p.caixa().value = '';
    await p.enviar('Quero um sinal menor');
    assert.equal(p.aviso().temAcao, true, 'a falha de rede oferece tentar de novo');
    redeVoltou(p, { entra: true });
    const leiturasAntes = p.servidor.leituras;
    p.tentarDeNovo();
    await esperar();
    assert.equal(visitantes(p, 'Quero um sinal menor'), 1, entrou ? 'entrou: não repetiu' : 'não tinha entrado: foi mandada');
    assert.equal(p.servidor.chamadasMensagem.length, entrou ? 1 : 2);
    assert.ok(p.servidor.leituras - leiturasAntes <= 2, 'sem releitura dupla (' + (p.servidor.leituras - leiturasAntes) + ' leituras)');
    assert.equal(p.caixa().value, '', 'a caixa não fica com o texto que já foi');
  }
});

test('(vi) uma falha com a releitura FUNCIONANDO e o turno fora do servidor deixa o texto na caixa e o envio seguinte vai (nada engolido)', async () => {
  const p = await paginaComConversa();
  p.servidor.rede = false; p.servidor.entra = false;   /* só a resposta falha; a releitura (rede de leitura) funciona */
  assert.equal(await p.enviar('Posso pagar no Pix?'), false);
  assert.equal(p.caixa().value, 'Posso pagar no Pix?');
  redeVoltou(p, { entra: true });
  assert.equal(await p.enviar('Posso pagar no Pix?'), true);
  assert.equal(visitantes(p, 'Posso pagar no Pix?'), 1);
});
