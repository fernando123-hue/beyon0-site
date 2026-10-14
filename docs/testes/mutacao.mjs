/* Teste de mutação: sabota as migrations de propósito e confere que os testes FALHAM. Um teste que nunca fica
   vermelho não prova nada.   node docs/testes/mutacao.mjs
   Cada sabotagem diz quais testes têm de pegá-la (padrão: os de banco da fundação). Desde 2026-10-07 (revisão técnica
   do PR #1, M4) também o DINHEIRO (conferência do pagamento), a máquina de estados da conversa e a retenção.
   Sabotagem com "fonte" não é de migration: sabota um arquivo de código do repositório NO LUGAR, com cópia de segurança
   restaurada no fim (e também se o processo morrer): é a única forma de provar o freio que vive no JS (api/_vendas/fluxo.mjs). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGEM = path.join(RAIZ, 'supabase', 'migrations');
const SABOTAGENS = [
  { nome: 'RLS de leitura aberta para todos', arquivo: '20261006120500_app_rls.sql',
    de: "for select to authenticated using (org_id in (select privado.minhas_orgs()))', t || '_ler'", para: "for select to authenticated using (true)', t || '_ler'" },
  /* (as três camadas abertas: só a concessão da tabela não basta, o anon nem tem USAGE no esquema app) */
  { nome: 'anon com leitura nos clientes', arquivo: '20261006120500_app_rls.sql', acrescentar: '\ngrant usage on schema app to anon;\ngrant select on app.clientes to anon;\ncreate policy anon_ve on app.clientes for select to anon using (true);\n' },
  { nome: 'chave estrangeira simples (sem org_id) no projeto', arquivo: '20261006120300_app_comercial.sql',
    de: 'foreign key (org_id, cliente_id) references app.clientes (org_id, id),\n  foreign key (org_id, lead_id) references app.leads', para: 'foreign key (cliente_id) references app.clientes (id),\n  foreign key (org_id, lead_id) references app.leads' },
  { nome: 'membro pode apagar', arquivo: '20261006120500_app_rls.sql',
    de: "using (org_id in (select privado.minhas_orgs(array[''dono'', ''admin''])))', t || '_apagar'", para: "using (org_id in (select privado.minhas_orgs()))', t || '_apagar'" },
  { nome: 'função nova sem revogar o EXECUTE de PUBLIC', arquivo: '20261006120500_app_rls.sql',
    acrescentar: '\ncreate function privado.esquecida() returns int language sql as $$ select 1 $$;\n' },
  { nome: 'auditoria copiando todos os valores', arquivo: '20261006120400_app_auditoria.sql', de: 'where k = any (seguros);', para: 'where true;' },
  /* ---- o dinheiro: a conferência do pagamento (fail closed) ---- */
  { nome: 'pagamento aceita dinheiro de outra conta do Mercado Pago', arquivo: '20261007130000_pagamentos.sql', testes: ['docs/testes/pagamentos-banco.test.mjs'],
    de: "    when coalesce(r ->> 'user_id', '') <> p ->> 'conta_esperada' then 'conta do provedor diferente'\n", para: '' },
  { nome: 'pagamento aceita valor diferente do cobrado', arquivo: '20261007130000_pagamentos.sql', testes: ['docs/testes/pagamentos-banco.test.mjs'],
    de: "    when v_total <> t.valor then 'valor total diferente'\n    when v_amount <> t.valor then 'valor da transação diferente'\n", para: '' },
  { nome: 'pagamento dado como pago com valor menor', arquivo: '20261007130000_pagamentos.sql', testes: ['docs/testes/pagamentos-banco.test.mjs'],
    de: "when v_estado = 'aprovada' and (v_pago is null or v_pago < t.valor) then", para: 'when false then' },
  /* ---- a máquina de estados da conversa ---- */
  { nome: 'conversa pula etapa (qualquer transição vale)', arquivo: '20261008120100_transicoes_conversa.sql', testes: ['docs/testes/auditoria-p1.test.mjs'],
    de: 'if not exists (select 1 from privado.transicoes_conversa t where t.de = old.etapa and t.para = new.etapa) then', para: 'if false then' },
  /* ---- a retenção: quem pagou não perde a conversa ---- */
  /* (a função vendas_reter vive na migration MAIS NOVA que a redefine: sabotar a antiga não tinha efeito) */
  { nome: 'retenção apaga o briefing e o contato de quem pagou', arquivo: '20261011120000_retencao_pagos_e_contato.sql', testes: ['docs/testes/fluxo-api.test.mjs'],
    de: "pg.status in ('pago', 'estornado', 'contestado')", para: "pg.status in ('estornado', 'contestado')" },
  { nome: 'retenção apaga a prova de um pagamento contestado', arquivo: '20261011120000_retencao_pagos_e_contato.sql', testes: ['docs/testes/fluxo-api.test.mjs'],
    de: "and (pg.status = 'contestado' or exists (", para: "and (false and exists (" },
  /* ---- o pedido de modelos (PR 2a): os freios ---- */
  { nome: 'telefone sem limite de pedido aberto', arquivo: '20261013120000_pedidos.sql', testes: ['docs/testes/pedidos-banco.test.mjs'],
    de: 'if exists (select 1 from app.pedidos pd where pd.org_id = c.org_id and pd.telefone_hash = v_tel and privado.pedido_aberto(pd)) then', para: 'if false then' },
  { nome: 'direções geradas sem a confirmação pelo WhatsApp', arquivo: '20261013120100_pedidos_dono.sql', testes: ['docs/testes/pedidos-banco.test.mjs'],
    de: "if exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status <> 'confirmado') then", para: 'if false then' },
  { nome: 'fila do dono mostra pedido fora da fila (descartado, arquivado, concluído)', arquivo: '20261013120200_fila_confirmados.sql', testes: ['docs/testes/pedidos-banco.test.mjs'],
    de: 'where pd.org_id = v_org and privado.pedido_na_fila(pd)', para: 'where pd.org_id = v_org' },
  /* ---- o freio que vive no JS: gerar só com o pedido confirmado (o banco ainda aceita a conversa sem pedido; PR2a-banco) ---- */
  { nome: 'gerar sem o pedido confirmado pelo WhatsApp (freio do JS)', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/fluxo-api.test.mjs'],
    de: "exigir(est.pedido && est.pedido.status === 'confirmado', 409,", para: 'exigir(true, 409,' }
];

/* o arquivo de código sabotado no lugar volta ao que era, aconteça o que acontecer */
const restauracoes = new Map();
function restaurar() { for (const [caminho, original] of restauracoes) fs.writeFileSync(caminho, original); restauracoes.clear(); }
process.on('exit', restaurar);
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => { restaurar(); process.exit(130); });

let pegas = 0;
for (const s of SABOTAGENS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bz-mutacao-'));
  for (const f of fs.readdirSync(ORIGEM)) fs.copyFileSync(path.join(ORIGEM, f), path.join(dir, f));
  const alvo = path.join(s.fonte ? RAIZ : dir, s.fonte || s.arquivo);
  const bruto = fs.readFileSync(alvo, 'utf8');
  let sql = bruto.replace(/\r\n/g, '\n');   /* (checkout no Windows com autocrlf: o texto da sabotagem é LF) */
  if (s.acrescentar) sql += s.acrescentar;
  else { if (!sql.includes(s.de)) { console.log('SABOTAGEM NÃO APLICADA (texto mudou):', s.nome); process.exitCode = 1; fs.rmSync(dir, { recursive: true, force: true }); continue; } sql = sql.replace(s.de, () => s.para); }
  if (s.fonte) { restauracoes.set(alvo, bruto); if (bruto.includes('\r\n')) sql = sql.replace(/\n/g, '\r\n'); }
  fs.writeFileSync(alvo, sql);
  const testes = (s.testes || ['docs/testes/banco.test.mjs']).map(t => path.join(RAIZ, t));
  const r = spawnSync(process.execPath, ['--test', ...testes], { env: { ...process.env, BZ_MIGRATIONS: dir }, encoding: 'utf8' });
  const falhas = (r.stdout.match(/^✖ .+$/gm) || []).filter(l => !/failing tests/.test(l));
  /* "pegou" = um teste caiu numa ASSERÇÃO. Migration que nem carrega ou suíte que nem roda também saem com erro, mas
     não provam nada: contam como sabotagem mal feita (revisão técnica do PR 14) */
  const quebrou = /migration .* falhou|SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND/.test(r.stdout + r.stderr);
  const testesRodados = Number((r.stdout.match(/^ℹ tests (\d+)/m) || [])[1] || 0);
  restaurar();   /* (já rodou: o arquivo de código volta ao que era antes de qualquer saída abaixo) */
  if (quebrou || testesRodados === 0) { console.log('INVÁLIDA ' + s.nome + ' (a sabotagem quebrou a carga ou nenhum teste rodou)'); process.exitCode = 1; fs.rmSync(dir, { recursive: true, force: true }); continue; }
  const pegou = r.status !== 0 && falhas.length > 0;
  if (pegou) pegas++;
  console.log((pegou ? 'PEGOU ' : 'ESCAPOU') + '  ' + s.nome + (pegou ? '  ← ' + [...new Set(falhas)].slice(0, 2).join(' | ').replace(/\s*\(\d+(\.\d+)?ms\)/g, '') : ''));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(pegas + ' de ' + SABOTAGENS.length + ' sabotagens pegas pelos testes');
if (pegas < SABOTAGENS.length) process.exitCode = 1;
