/* Gera o SQL que ATIVA a tabela-rascunho no banco (arquiva a ativa e grava a nova como ativa, numa transação só).
   Uso: node docs/fase2/gerar-ativar-sql.mjs "<fontes: quem aprovou e quando>" > docs/fase2/regras-v4-ativar.sql
   Quem roda o SQL é o dono (ou o agente com o "sim" dele), primeiro no banco de TESTE e só depois na produção, e só
   com o código que aceita a tabela já publicado no mesmo ambiente (docs/PROCESSO.md, "Migration de banco").
   O JSON vai entre $tabela$ ... $tabela$ (sem escapar aspas); a tabela é validada antes pela mesma regra do servidor. */
import { readFileSync } from 'node:fs';
import { validarRegras } from '../../api/_vendas/precos.mjs';

const DELIMITADOR = '$tabela$';
/* o _status do rascunho é o histórico longo das decisões; no banco (e neste SQL, que fica no repositório público) vai só uma linha */
const STATUS_NO_BANCO = 'Tabela ativada a partir de docs/fase2/regras-rascunho-v1.json; o histórico das decisões está no _status desse arquivo.';

export function sqlDeAtivacao(jsonRascunho, fontes) {
  const tabela = JSON.parse(jsonRascunho);
  const v = validarRegras(tabela);
  if (!v.ok) throw new Error('Tabela inválida: ' + v.erros.join('; '));
  const json = JSON.stringify({ ...tabela, _status: STATUS_NO_BANCO });
  if (json.includes(DELIMITADOR) || json.includes('$ativar$')) throw new Error('A tabela contém um delimitador do SQL (' + DELIMITADOR + ' ou $ativar$)');
  /* (aspas simples, barra invertida e quebra de linha: o texto vai entre aspas simples, e com standard_conforming_strings desligado a barra escaparia) */
  if (typeof fontes !== 'string' || !fontes || /['\\\r\n]/.test(fontes)) throw new Error('Fontes vazias ou com aspas simples, barra invertida ou quebra de linha');
  return [
    '-- Ativa a tabela-rascunho (docs/fase2/regras-rascunho-v1.json). Gerado por docs/fase2/gerar-ativar-sql.mjs; não edite à mão.',
    '-- Rodar no SQL Editor do Supabase, primeiro no banco de teste. Uma ativa por organização (índice regras_uma_ativa).',
    '-- Aborta sem mudar nada se a organização não existir ou se esta mesma tabela já estiver ativa (rodar de novo é seguro).',
    'do $ativar$',
    'declare v_org uuid; v_regras jsonb := ' + DELIMITADOR + json + DELIMITADOR + '::jsonb; n integer;',
    'begin',
    "  select id into v_org from app.organizacoes where slug = 'beyon-zero';",
    "  if v_org is null then raise exception 'organização beyon-zero não existe neste banco'; end if;",
    "  if exists (select 1 from app.regras_comerciais where org_id = v_org and status = 'ativa' and regras = v_regras) then",
    "    raise exception 'esta tabela já está ativa: nada a fazer';",
    '  end if;',
    "  update app.regras_comerciais set status = 'arquivada' where org_id = v_org and status = 'ativa';",
    '  insert into app.regras_comerciais (org_id, versao, status, regras, fontes, aprovada_em)',
    "  select v_org, coalesce(max(versao), 0) + 1, 'ativa', v_regras, '" + fontes + "', now() from app.regras_comerciais where org_id = v_org;",
    '  get diagnostics n = row_count;',
    "  if n <> 1 then raise exception 'esperava gravar 1 tabela, gravou %', n; end if;",
    'end',
    '$ativar$;',
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
