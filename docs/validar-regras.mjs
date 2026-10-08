/* ==========================================================================
   VALIDAR A TABELA DE PREÇOS antes de ativá-la no banco (a ativação é um
   insert manual: docs/fase2/02-OPERACAO.md). Usa a MESMA validação do
   servidor (api/_vendas/precos.mjs → validarRegras); tabela que não passa
   aqui faria o orçamento responder "tabela em atualização" para todos.
   Uso:  npm run validar:regras -- docs/fase2/regras-rascunho-v1.json
   Saída: "Tabela válida." (código 0) ou a lista de erros (código 1).
   ========================================================================== */
import { readFile } from 'node:fs/promises';
import { validarRegras } from '../api/_vendas/precos.mjs';

const arquivo = process.argv[2];
if (!arquivo) { console.error('Informe o arquivo JSON da tabela. Ex.: npm run validar:regras -- docs/fase2/regras-rascunho-v1.json'); process.exit(2); }
let regras;
try { regras = JSON.parse(await readFile(arquivo, 'utf8')); }
catch (e) { console.error('Não deu para ler o JSON de ' + arquivo + ': ' + e.message); process.exit(1); }
const r = validarRegras(regras);
if (r.ok) { console.log('Tabela válida.'); process.exit(0); }
console.error('Tabela INVÁLIDA (não ative):\n- ' + r.erros.join('\n- '));
process.exit(1);
