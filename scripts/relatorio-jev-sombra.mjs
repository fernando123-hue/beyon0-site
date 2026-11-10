/* O relatório do modo sombra do JEV (F3): lê app.jev_sombra pela função app.vendas_sombra_resumo (só rótulos, probabilidades,
   custo e tempo; nenhum texto) e imprime a concordância código × Haiku por pergunta, as falhas e o custo por dia.

     node scripts/com-chave.mjs --so SUPABASE_URL,SUPABASE_CHAVE_SECRETA node scripts/relatorio-jev-sombra.mjs --dias 7

   Só lê; não chama a Anthropic. */
import { criarTransporte } from '../api/_vendas/transporte.mjs';
import { ORG } from '../api/_vendas/org.mjs';
import { resumir } from './jev-sombra-resumo.mjs';

const i = process.argv.indexOf('--dias');
const DIAS = i > 0 ? Number(process.argv[i + 1]) : 7;
const banco = criarTransporte(process.env);
if (!banco || !process.env.SUPABASE_URL) { console.error('sem SUPABASE_URL e SUPABASE_CHAVE_SECRETA: rode por scripts/com-chave.mjs --so SUPABASE_URL,SUPABASE_CHAVE_SECRETA'); process.exit(2); }

const { linhas } = await banco('vendas_sombra_resumo', { org_slug: ORG, dias: DIAS });
const r = resumir(linhas);
const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '-');

console.log(`\nModo sombra do JEV · últimos ${DIAS} dias · ${linhas.length} leituras\n`);
console.log('| texto lido | pergunta | leituras | concordam | só o Haiku marcou | só o código marcou |');
console.log('|---|---|---|---|---|---|');
for (const p of r.perguntas.sort((a, b) => a.alvo.localeCompare(b.alvo) || a.pergunta.localeCompare(b.pergunta))) {
  console.log(`| ${p.alvo} | ${p.pergunta} | ${p.leituras} | ${p.concordam} (${pct(p.concordam, p.leituras)}) | ${p.so_haiku} | ${p.so_codigo} |`);
}
console.log('\nFalhas (sem sinal): ' + (Object.entries(r.falhas).map(([m, n]) => `${m}: ${n}`).join(' · ') || 'nenhuma'));
console.log('\n| dia | leituras | custo US$ | tempo mediano |');
console.log('|---|---|---|---|');
for (const d of r.dias) console.log(`| ${d.dia} | ${d.leituras} | ${d.custo_usd.toFixed(4)} | ${d.ms_mediana ?? '-'} ms |`);
