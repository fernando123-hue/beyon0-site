/* ==========================================================================
   QUANTO O CÓDIGO ATUAL JÁ ACERTA do gabarito do classificador (F1, estudo do JEV). Custo zero: só roda as travas e detectores
   que já existem em api/ contra docs/gabarito/classificador/*.json e conta acertos, falsos "sim" e falsos "não".
   É a base que um motor de modelo (F2) precisa vencer: "regras de código primeiro, modelo só na dúvida".

     node scripts/avaliar-codigo-no-gabarito.mjs            tabela por pergunta
     node scripts/avaliar-codigo-no-gabarito.mjs --erros    mais a lista dos casos errados (id e texto)

   Pergunta SEM detector em código aparece como "sem detector": é onde um modelo teria algo a acrescentar.
   Atenção: oferece_proibido_saude força o nicho de teste (dentista) em todo texto; um falso "sim" em texto de outro ramo
   (ex.: sz-052, loja de roupas) é artefato da medição, pois em produção a trava só atua em nicho regulado.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { DETECTORES, SAUDE_HUMANA } from './detectores-do-gabarito.mjs';

const lerGabarito = t => JSON.parse(readFileSync(new URL('../docs/gabarito/classificador/' + (process.argv.includes('--separado') ? 'separado/' : '') + t + '.json', import.meta.url), 'utf8'));
const mostrarErros = process.argv.includes('--erros');
function certaDe(g, caso, pergunta) {
  const r = caso.certa[pergunta] ?? g.padrao[pergunta];
  if (pergunta !== 'nicho_saude') return r;
  if (r === 'ambiguo') return 'livre';          /* o certo é o código não aplicar a regra: o Zero pergunta antes */
  return SAUDE_HUMANA.has(r) ? 'regulado' : 'livre';
}

const linhas = [];
const erros = [];
for (const tarefa of Object.keys(DETECTORES)) {
  const g = lerGabarito(tarefa);
  for (const [pergunta, detector] of Object.entries(DETECTORES[tarefa])) {
    const casos = g.casos.filter(c => certaDe(g, c, pergunta) !== undefined);
    if (!detector) { linhas.push({ tarefa, pergunta, n: casos.length, sem: true }); continue; }
    const positivo = pergunta === 'nicho_saude' ? 'regulado' : 'sim';
    let ok = 0, falsoSim = 0, falsoNao = 0, incertosErrados = 0;
    for (const c of casos) {
      const certa = certaDe(g, c, pergunta), obteve = detector(c.texto);
      if (obteve === certa) ok++;
      else {
        if (obteve === positivo) falsoSim++; else falsoNao++;
        if (c.incerto) incertosErrados++;
        erros.push({ tarefa, pergunta, id: c.id, certa, obteve, texto: c.texto, incerto: !!c.incerto });
      }
    }
    linhas.push({ tarefa, pergunta, n: casos.length, ok, falsoSim, falsoNao, incertosErrados });
  }
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-');
console.log('| tarefa | pergunta | casos | acertos | falso "sim" | falso "não" | dos erros, em caso incerto |');
console.log('|---|---|---|---|---|---|---|');
for (const l of linhas) {
  console.log(l.sem
    ? `| ${l.tarefa} | ${l.pergunta} | ${l.n} | sem detector | - | - | - |`
    : `| ${l.tarefa} | ${l.pergunta} | ${l.n} | ${l.ok} (${pct(l.ok, l.n)}) | ${l.falsoSim} | ${l.falsoNao} | ${l.incertosErrados} |`);
}
if (mostrarErros) {
  console.log('\nCasos errados:');
  for (const e of erros) console.log(`- ${e.id} [${e.pergunta}] certo=${e.certa} código=${e.obteve}${e.incerto ? ' (caso incerto)' : ''}: ${e.texto}`);
}
