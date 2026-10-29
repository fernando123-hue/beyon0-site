/* ==========================================================================
   PRAZO PROMETIDO × REAL, por formato (dono, 2026-10-28: "se o trabalho não couber em 10 dias úteis, crie uma métrica para
   analisar e aumentar a quantidade de dias desde já"). Quem roda é o DONO, no terminal dele, com BZ_BASE (o site) e
   PAINEL_CHAVE no ambiente (nunca em arquivo nem em argumento), como o scripts/entregas.mjs. SÓ LÊ: um GET na lista do painel.
     node "<repo>/scripts/prazo-real.mjs" --sql                         (O CAMINHO PRINCIPAL, 1 de 2)
         imprime uma consulta SÓ DE LEITURA para o SQL Editor do Supabase, com o histórico inteiro (as concluídas também)
     node "<repo>/scripts/prazo-real.mjs" --arquivo "<entregas.json>"   (2 de 2)
         lê a exportação dessa consulta (JSON), sem rede
     node "<repo>/scripts/prazo-real.mjs"
         AMOSTRA PARCIAL: só as entregas da lista do painel que já foram ao ar (no ar, suspensas); a lista não guarda as
         concluídas, e o aviso sai antes da tabela
     --regras "<tabela.json>"   o prazo_dias de cada formato para comparar (padrão: docs/fase2/regras-rascunho-v1.json;
                                 use o JSON da tabela ATIVA se ela for outra)
   A conta e a sugestão estão em scripts/prazo-real-lib.mjs. Mudar o prazo_dias da tabela é decisão do dono, numa versão nova.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarBase, paraTerminal } from './direcoes.mjs';
import { cabecalhosDeAcesso } from '../docs/acesso.mjs';
import { analisarPrazos, deItemDoPainel, tabelaDePrazos } from './prazo-real-lib.mjs';

const TEMPO_MS = 30000;
const REGRAS_PADRAO = fileURLToPath(new URL('../docs/fase2/regras-rascunho-v1.json', import.meta.url));
const USO = 'Uso: node scripts/prazo-real.mjs [--regras <tabela.json>] | --sql | --arquivo <entregas.json> [--regras <tabela.json>]';

/* o histórico inteiro, para o SQL Editor do Supabase (só leitura): os mesmos campos que a lista do painel traz */
export const SQL_HISTORICO = `select jsonb_agg(jsonb_build_object('formato', c.briefing #>> '{projeto,formato}', 'prazo_dias', e.prazo_dias, 'prazo', e.prazo, 'no_ar_em', e.no_ar_em) order by e.no_ar_em) as entregas
  from app.entregas e join app.conversas c on c.id = e.conversa_id
 where e.no_ar_em is not null;`;

const doFlag = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : ''; };

function prazosDaTabela(arquivo) {
  let r;
  try { r = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { throw new Error('Não deu para ler a tabela de regras: ' + arquivo); }
  return Object.fromEntries(Object.entries(r.formatos || {}).map(([k, f]) => [k, f && f.prazo_dias]));
}

/* a exportação do SQL Editor: [{ entregas: [...] }] (uma linha, a coluna "entregas"), ou a lista direto */
function itensDoArquivo(arquivo) {
  let dados;
  try { dados = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { throw new Error('O arquivo não é um JSON legível: ' + arquivo); }
  const linha = Array.isArray(dados) && dados.length === 1 && dados[0] && Array.isArray(dados[0].entregas) ? dados[0].entregas : dados;
  if (!Array.isArray(linha)) throw new Error('O arquivo não traz uma lista de entregas: ' + arquivo);
  return linha;
}

async function itensDoPainel(env, buscar) {
  const origem = validarBase(env.BZ_BASE), chave = env.PAINEL_CHAVE || '';
  if (chave.length < 32) throw new Error('Defina PAINEL_CHAVE (a chave do painel) no ambiente do SEU terminal, não em arquivo.');
  const r = await buscar(origem + '/api/painel?fila=entregas', { method: 'GET', redirect: 'error', headers: { authorization: 'Bearer ' + chave, ...cabecalhosDeAcesso(env, origem) },   /* (o staging fica atrás do Access, como em direcoes.mjs) */ signal: AbortSignal.timeout(TEMPO_MS) });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo && typeof corpo.erro === 'string' ? paraTerminal(corpo.erro.split(chave).join('[chave]'), 400) : 'O painel respondeu ' + r.status + '.');
  return Array.isArray(corpo.entregas) ? corpo.entregas : [];
}

/* roda e devolve o código de saída (0 certo, 1 erro, 2 uso); o erro é só a frase, sem a chave */
export async function executar(argv, { env = process.env, buscar = fetch, saida = console.log, erro = console.error } = {}) {
  const chave = env.PAINEL_CHAVE || '';
  try {
    if (argv.includes('--sql')) { saida('Cole no SQL Editor do Supabase (só lê), exporte o resultado em JSON e rode com --arquivo:\n\n' + SQL_HISTORICO); return 0; }
    if (argv.some(a => a.startsWith('--') && !['--arquivo', '--regras'].includes(a))) { erro(USO); return 2; }
    const prazosAtuais = prazosDaTabela(doFlag(argv, '--regras') || REGRAS_PADRAO);
    const arquivo = doFlag(argv, '--arquivo');
    const itens = arquivo ? itensDoArquivo(arquivo) : await itensDoPainel(env, buscar);
    const r = analisarPrazos(itens.map(deItemDoPainel), { prazosAtuais });
    /* (modo painel: a amostra é só das entregas ainda abertas; o aviso vem ANTES da tabela, para ninguém decidir só por ela) */
    const aviso = arquivo ? [] : ['ATENÇÃO: amostra parcial. Só as entregas que ainda estão na lista do painel (no ar ou suspensas): as concluídas saem dela, e são justamente as que mais contam. Para decidir, use o histórico inteiro: --sql (consulta só de leitura para o SQL Editor) e depois --arquivo com a exportação.', ''];
    const linhas = [...aviso, ...tabelaDePrazos(r).map(l => paraTerminal(l, 300))];   /* (o formato vem do banco: dado, não comando) */
    linhas.push('Sugestão = prazo da tabela × o p75 de real ÷ prometido, arredondado para cima, só para cima, com 3 entregas ou mais. Mudar a tabela é decisão sua, numa versão nova.');
    saida(linhas.join('\n'));
    return 0;
  } catch (e) {
    const frase = String(e && e.message ? e.message : e);
    erro('ERRO: ' + (chave ? frase.split(chave).join('[chave]') : frase));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await executar(process.argv.slice(2));
}
