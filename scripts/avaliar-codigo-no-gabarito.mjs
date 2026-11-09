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
import { semPromessaDeDesconto, semPromessaDeRecado, garantirRegulado, nichoRegulado } from '../api/_vendas/zero.mjs';
import { semPromessaDeResultado } from '../api/_vendas/travas-resultado.mjs';
import { semPrecoNoTexto, pareceInjecao } from '../api/_vendas/seguranca.mjs';
import { pedePessoa, negaSerIA } from '../api/_atendente/regras.mjs';

const lerGabarito = t => JSON.parse(readFileSync(new URL('../docs/gabarito/classificador/' + t + '.json', import.meta.url), 'utf8'));
const mostrarErros = process.argv.includes('--erros');

/* o nicho de teste para a trava de saúde: a trava só atua quando a conversa já está em nicho regulado */
const NICHO_DE_TESTE = nichoRegulado('sou dentista');

/* nicho_saude no gabarito tem 7 rótulos; o código devolve o nicho regulado ou null (que é "nenhum", "veterinária" ou "ambíguo").
   A comparação justa é binária: é saúde humana regulada (medicina, odontologia, psicologia, estética)? Ambíguo: o certo é o código NÃO decidir. */
const SAUDE_HUMANA = new Set(['medicina', 'odontologia', 'psicologia', 'estetica']);
const CHAVES_DE_SAUDE = new Set(['odontologia', 'psicologia', 'nutricao', 'fisioterapia', 'medicina', 'fonoaudiologia', 'enfermagem', 'biomedicina', 'estetica']);

/* cada detector devolve 'sim' ou 'nao' (ou, no nicho, 'regulado' ou 'livre'); null = sem detector */
const DETECTORES = {
  saida_do_zero: {
    promete_desconto: t => (semPromessaDeDesconto(t).trocou ? 'sim' : 'nao'),
    afirma_recado: t => (semPromessaDeRecado(t).trocou ? 'sim' : 'nao'),
    oferece_proibido_saude: t => (garantirRegulado(t, { nicho: NICHO_DE_TESTE }).trocou ? 'sim' : 'nao'),
    escreve_valor: t => (semPrecoNoTexto(t) !== t ? 'sim' : 'nao'),
    promete_resultado: t => (semPromessaDeResultado(t).trocou ? 'sim' : 'nao'),   /* api/_vendas/travas-resultado.mjs (a garantia, semGarantia, é outra pergunta e não tem coluna aqui) */
    /* detector do ATENDENTE do cliente (api/_atendente/regras.mjs), não ligado ao Zero: serve de base para a F2 vencer.
       Ele marca como negação as apresentações do próprio Zero (sz-102, sz-107, sz-108): reaproveitar sem ajuste seria erro */
    nega_ser_ia: t => (negaSerIA(t) ? 'sim' : 'nao')
  },
  entrada_do_visitante: {
    tenta_dar_ordens: t => (pareceInjecao(t) ? 'sim' : 'nao'),
    nicho_saude: t => { const n = nichoRegulado(t); return n && CHAVES_DE_SAUDE.has(n.chave) ? 'regulado' : 'livre'; },
    pede_pessoa: t => (pedePessoa(t) ? 'sim' : 'nao'),   /* idem: detector do atendente do cliente, não ligado ao Zero */
    irritacao: null,
    momento: null
  }
};

/* a resposta certa de um caso, já no vocabulário do detector */
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
