/* Gera o SQL que ATIVA a tabela-rascunho no banco (arquiva a ativa e grava a nova como ativa, numa transação só).
   Uso: node docs/fase2/gerar-ativar-sql.mjs "<fontes: quem aprovou e quando>" > docs/fase2/regras-v4-ativar.sql
   Quem roda o SQL é o dono (ou o agente com o "sim" dele), primeiro no banco de TESTE e só depois na produção, e só
   com o código que aceita a tabela já publicado no mesmo ambiente (docs/PROCESSO.md, "Migration de banco").
   O JSON vai entre $tabela$ ... $tabela$ (sem escapar aspas); a tabela é validada antes pela mesma regra do servidor. */
import { readFileSync } from 'node:fs';
import { validarRegras } from '../../api/_vendas/precos.mjs';

const DELIMITADOR = '$tabela$';

export function sqlDeAtivacao(json, fontes) {
  const v = validarRegras(JSON.parse(json));
  if (!v.ok) throw new Error('Tabela inválida: ' + v.erros.join('; '));
  if (json.includes(DELIMITADOR)) throw new Error('A tabela contém o delimitador ' + DELIMITADOR);
  if (typeof fontes !== 'string' || !fontes || fontes.includes("'")) throw new Error('Fontes vazias ou com aspas simples');
  return [
    '-- Ativa a tabela-rascunho (docs/fase2/regras-rascunho-v1.json). Gerado por docs/fase2/gerar-ativar-sql.mjs; não edite à mão.',
    '-- Rodar no SQL Editor do Supabase, primeiro no banco de teste. Uma ativa por organização (índice regras_uma_ativa).',
    'begin;',
    "update app.regras_comerciais set status = 'arquivada'",
    "  where org_id = (select id from app.organizacoes where slug = 'beyon-zero') and status = 'ativa';",
    'insert into app.regras_comerciais (org_id, versao, status, regras, fontes, aprovada_em)',
    "select o.id, coalesce((select max(versao) from app.regras_comerciais r where r.org_id = o.id), 0) + 1, 'ativa',",
    '  ' + DELIMITADOR + json + DELIMITADOR + "::jsonb, '" + fontes + "', now()",
    "from app.organizacoes o where o.slug = 'beyon-zero';",
    'commit;',
    "-- conferir: select versao, status, regras -> 'formatos' ? 'sob_medida' as tem_atelier from app.regras_comerciais order by versao;",
    ''
  ].join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  try {
    const json = readFileSync(new URL('./regras-rascunho-v1.json', import.meta.url), 'utf8').trim();
    process.stdout.write(sqlDeAtivacao(json, process.argv[2]));
  } catch (e) { console.error(e.message); process.exit(1); }
}
