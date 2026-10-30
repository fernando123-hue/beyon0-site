/* OS SONS do site (dono, 2026-10-28: "Sons, para ambientação do site, selecionar card, botão e para clicar"; "Som de
   fundo com opção para deixar ligado ou desligar"; "Não só o de fundo, mas os sons em geral"; começa ligado, "bem
   baixo e irá se estabilizando"). Desenho: docs/superpowers/specs/2026-10-28-sons-design.md.  node --test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = f => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const PAGINAS = ['index.html', 'sites.html', 'automacao.html'];

test('as páginas de venda carregam som.js depois do core.js e têm os dois botões de som, escondidos até o JS', () => {
  for (const p of PAGINAS) {
    const html = ler(p);
    const core = html.indexOf('src="js/core.js"'), som = html.indexOf('src="js/som.js"');
    assert.ok(som > core && core > 0, p + ': som.js depois do core.js');
    assert.match(html, /<script src="js\/som\.js" defer><\/script>/, p + ': som.js com defer');
    const botoes = html.match(/<button[^>]*data-som[^>]*>/g) || [];
    assert.equal(botoes.length, 2, p + ': um botão no cabeçalho e um no rodapé');
    for (const b of botoes) {
      assert.match(b, /type="button"/, p);
      assert.match(b, /aria-pressed="true"/, p + ': nasce ligado (o dono escolheu começar ligado)');
      assert.match(b, /\shidden[\s>]/, p + ': sem JS ou sem Web Audio o botão não faria nada');
    }
  }
});

test('som.js: preferência só desliga com "0", sem estilo inline nem innerHTML, gesto antes do AudioContext', () => {
  const js = ler('js/som.js');
  assert.match(js, /'bz-som'/);
  assert.match(js, /!== '0'/, 'sem nada gravado = ligado');
  assert.doesNotMatch(js, /innerHTML|setAttribute\('style'/);
  /* o gesto que acorda o áudio: toque (o pointerup é o gesto do dedo; o pointerdown, o do mouse; touchend/click,
     o do iOS antigo) e tecla */
  assert.match(js, /\['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'\]\.forEach\(function \(ev\) \{\s*document\.addEventListener\(ev, acordar/);
  assert.doesNotMatch(js, /requestAnimationFrame/, 'nada por frame: a respiração é agendada no relógio do áudio');
  assert.match(js, /visibilitychange/, 'aba escondida pausa');
});

test('carga.js avisa quando o card enche, para o sino', () => {
  assert.match(ler('js/carga.js'), /B\.emit\('carga:cheio', card\)/);
});

test('a privacidade cita a preferência de som guardada no aparelho', () => {
  assert.match(ler('privacidade.html'), /som/i);
  assert.match(ler('privacidade.html'), /se você desligou o som/);
});

test('som.js: se o áudio falhar ao nascer, desiste quieto (sem erro a cada gesto) e esconde os botões', () => {
  const js = ler('js/som.js');
  assert.match(js, /function montar\(\) \{\s*try \{/, 'montar() protegido');
  assert.match(js, /semAudio = true/, 'marca que não há áudio');
  assert.match(js, /if \(!ligado \|\| semAudio/, 'acordar() desiste quando não há áudio');
  assert.match(js, /if \(!montar\(\)\) return;/, 'acordar() não segue com o contexto quebrado');
});
