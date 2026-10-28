/* Teste de mutação: sabota as migrations de propósito e confere que os testes FALHAM. Um teste que nunca fica
   vermelho não prova nada.   node docs/testes/mutacao.mjs
   Cada sabotagem diz quais testes têm de pegá-la (padrão: os de banco da fundação). Desde 2026-10-07 (revisão técnica
   do PR #1, M4) também o DINHEIRO (conferência do pagamento), a máquina de estados da conversa e a retenção.
   Sabotagem com "fonte" não é de migration: sabota um arquivo de código do repositório NO LUGAR, com cópia de segurança
   restaurada no fim (e também se o processo morrer): é a única forma de provar o freio que vive no JS (api/_vendas/fluxo.mjs).
   Na partida, recusa rodar se um arquivo "fonte" já está sabotado ou tem mudança fora do git (revisão final do PR 2a, B7):
   a cópia de segurança guardaria a sabotagem de uma rodada que morreu como se fosse o original. A conferência da partida
   e a lista de sinais são testadas em docs/testes/mutacao.test.mjs (importar este arquivo não roda nada). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGEM = path.join(RAIZ, 'supabase', 'migrations');
export const SABOTAGENS = [
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
    de: "if not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then", para: 'if false then' },
  { nome: 'fila do dono mostra pedido fora da fila (descartado, arquivado, concluído)', arquivo: '20261013120200_fila_confirmados.sql', testes: ['docs/testes/pedidos-banco.test.mjs'],
    de: 'where pd.org_id = v_org and privado.pedido_na_fila(pd)', para: 'where pd.org_id = v_org' },
  /* ---- o freio que vive no JS: gerar só com o pedido confirmado, com a frase de cada situação (o banco também recusa,
     com a frase genérica da etapa: o teste da frase "ainda não foi confirmado pelo WhatsApp" é o que pega) ---- */
  { nome: 'gerar sem o pedido confirmado pelo WhatsApp (freio do JS)', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/fluxo-api.test.mjs'],
    de: 'if (semConfirmacao) throw semConfirmacao;', para: 'if (false) throw semConfirmacao;' },
  /* ---- os ajustes sem IA (PR 3a): o teto, a versão final sem o desfeito e o dono fora da etapa ---- */
  /* (a função vendas_registrar_alteracao vive na migration MAIS NOVA que a redefine, a da auditoria; as duas sabotagens
     seguintes e a "origem ia" miram nela: sabotar a do PR 3a não teria efeito) */
  { nome: 'opção pronta sem o teto de 30 ajustes', arquivo: '20261020120000_auditoria_correcoes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: "if (select count(*) from app.alteracoes a where a.conversa_id = c.id and a.origem = 'opcao') >= 30 then", para: 'if false then' },
  { nome: 'a versão final conta o ajuste desfeito', arquivo: '20261017120000_pr3a_ajustes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: "where a.conversa_id = v_conversa and a.status = 'aplicada'", para: "where a.conversa_id = v_conversa and a.status in ('aplicada', 'desfeita')" },
  { nome: 'o dono resolve ajuste de conversa que passou da etapa de ajustes', arquivo: '20261017120000_pr3a_ajustes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: "perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);   -- (o dono: só na etapa de ajustes)", para: '-- (sabotado)' },
  { nome: 'opção pronta aceita estimativa (muda o preço)', arquivo: '20261020120000_auditoria_correcoes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: "if p ? 'estimativa' or jsonb_typeof(p -> 'resultado') is distinct from 'object' then", para: "if jsonb_typeof(p -> 'resultado') is distinct from 'object' then" },
  { nome: "ajuste aceita origem 'ia' ou sem origem (a porta antiga)", arquivo: '20261020120000_auditoria_correcoes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: "if v_origem is distinct from 'opcao' then raise exception 'origem inválida'", para: "if false then raise exception 'origem inválida'" },
  { nome: 'pedido livre sem o teto de 3', arquivo: '20261017120000_pr3a_ajustes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: 'if v_feitos >= 3 then', para: 'if false then' },
  { nome: 'pedido livre sem o teto de 300 caracteres', arquivo: '20261017120000_pr3a_ajustes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: 'char_length(v_texto) not between 1 and 300', para: 'char_length(v_texto) not between 1 and 3000' },
  { nome: 'a trava de direções sem o filtro do visitante', arquivo: '20261017120000_pr3a_ajustes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: 'where d.conversa_id = p_conversa and cv.visitante_id = p_visitante', para: 'where d.conversa_id = p_conversa' },
  /* ---- a lista fechada das opções prontas vive no JS ---- */
  { nome: 'opção pronta aceita campo a mais (valor livre)', fonte: 'api/_vendas/opcoes.mjs', testes: ['docs/testes/opcoes.test.mjs'],
    de: 'if (chaves.length !== permitidas.length || !chaves.every(k => permitidas.includes(k))) return null;', para: '' },
  /* ---- a correção final do PR 3a ---- */
  { nome: 'a fila de pedidos livres sem o corte de 50', arquivo: '20261017120000_pr3a_ajustes.sql', testes: ['docs/testes/ajustes-banco.test.mjs'],
    de: 'order by f.created_at, f.id limit 50', para: 'order by f.created_at, f.id limit 5000' },
  { nome: 'acrescentar seção com o modelo já no máximo (a seção some calada)', fonte: 'api/_vendas/fluxo-ajustes.mjs', testes: ['docs/testes/ajustes-api.test.mjs'],
    de: "m.operacao === 'adicionar_secao' && secoes.length >= MAX_SECOES &&", para: "m.operacao === 'adicionar_secao' && false &&" },
  /* ---- as correções da auditoria de segurança (run-1, 20/10): a migration 20261020120000 ---- */
  { nome: 'consultor sem o freio do /48 do IPv6', arquivo: '20261020120000_auditoria_correcoes.sql', testes: ['docs/testes/auditoria-correcoes.test.mjs'],
    de: 'if v_chave48 is not null then\n      if not privado.contar_ip', para: 'if false then\n      if not privado.contar_ip' },
  { nome: 'teto do dia soma a vida inteira das conversas tocadas hoje', arquivo: '20261020120000_auditoria_correcoes.sql', testes: ['docs/testes/teto-dia.test.mjs'],
    de: "select coalesce(sum(c.custo_usd), 0)\n  from app.ia_chamadas c\n  where c.org_id = p_org\n    and c.created_at >=", para: "select coalesce(sum(c.custo_ia_usd), 0)\n  from app.conversas c\n  where c.org_id = p_org\n    and c.ultima_atividade >=" },
  { nome: 'estimativa aceita depois da escolha (o banco)', arquivo: '20261020120000_auditoria_correcoes.sql', testes: ['docs/testes/auditoria-correcoes.test.mjs'],
    de: "perform privado.exigir_etapa(c, array['descoberta', 'estimativa', 'contato']);", para: "perform privado.exigir_etapa(c, array['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes']);" },
  /* a lista positiva do JS abre de uma vez a lista de ferramentas, a recusa do agente e o que o turno grava; sobra o banco (55000) */
  { nome: 'estimar aceito depois da escolha (a lista do JS: ferramentas, agente e turno)', fonte: 'api/_vendas/consultor.mjs', testes: ['docs/testes/auditoria-correcoes.test.mjs', 'docs/testes/consultor.test.mjs'],
    de: "export const ETAPAS_COM_PRECO = ['descoberta', 'estimativa', 'contato'];", para: "export const ETAPAS_COM_PRECO = ['descoberta', 'estimativa', 'contato', 'direcoes', 'escolhida', 'alteracoes'];" },
  /* ---- a correção final: o pedido confirmado fecha o preço também na etapa "contato"; o registro da geração é um só ---- */
  { nome: 'estimativa aceita com o pedido já confirmado (o banco)', arquivo: '20261020120000_auditoria_correcoes.sql', testes: ['docs/testes/auditoria-correcoes.test.mjs'],
    de: "if exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then\n    raise exception 'pacote fechado", para: "if false then\n    raise exception 'pacote fechado" },
  { nome: 'pedido confirmado não fecha o preço no JS (ferramentas, agente e turno)', fonte: 'api/_vendas/consultor.mjs', testes: ['docs/testes/auditoria-correcoes.test.mjs', 'docs/testes/consultor.test.mjs'],
    de: "ETAPAS_COM_PRECO.includes(etapa) && statusDoPedido !== 'confirmado';", para: 'ETAPAS_COM_PRECO.includes(etapa);' },
  { nome: 'a geração grava o registro por conta própria (a falha libera a reserva na hora)', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/teto-dia.test.mjs'],
    de: "          throw e;\n        }\n      });   /* (o registro da chamada é gravado UMA vez, no finally de comReserva, antes de a reserva sair) */",
    para: "          throw e;\n        } finally {\n          await gravarChamadas(corpo.conversa_id, vid);\n        }\n      });" },
  /* ---- o ambiente (migração para a Cloudflare, A1/A2): a Cloudflare nunca pode parecer "local" ---- */
  { nome: 'Cloudflare vista como local (runtime ignorado)', fonte: 'api/_ambiente.mjs', testes: ['docs/testes/ambiente.test.mjs'],
    de: "globalThis.navigator?.userAgent === USER_AGENT_CLOUDFLARE || ", para: "false || " },   /* ('para' vazio faria o teste da partida ver "já sabotado" em qualquer texto) */
  { nome: 'detalhes sem ambiente abrem a trava do IP', fonte: 'api/_vendas/fluxo-pedido.mjs', testes: ['docs/testes/detalhes-api.test.mjs'],
    de: "const local = !!env && ambienteDe(env) === 'local';", para: "const local = !env || ambienteDe(env) === 'local';" },
  { nome: 'prévia declarada com erro de digitação vira prévia', fonte: 'api/_ambiente.mjs', testes: ['docs/testes/ambiente.test.mjs'],
    de: "String(e.BZ_AMBIENTE || '').trim() === 'previa'", para: "/previa/i.test(String(e.BZ_AMBIENTE || ''))" },
  /* ---- só Pix no lançamento (A7): o servidor recusa o cartão antes do banco ---- */
  { nome: 'cartão aceito com só Pix (o servidor)', fonte: 'api/_pagamentos/servico.mjs', testes: ['docs/testes/pagamentos.test.mjs'],
    de: "if (!(cfg.metodos || ['pix']).includes(metodo)) throw", para: "if (false) throw" },
  /* ---- a entrada (PR 3b-1): sem o percentual da proposta, nada é cobrado (a falha fechada no lugar do 50) ---- */
  { nome: 'entrada sem percentual cobra assim mesmo', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/vendas-banco.test.mjs'],
    de: "if pr.sinal_percentual is null or pr.sinal_percentual < 1 then\n    raise exception 'proposta sem percentual de entrada'", para: "if false then\n    raise exception 'proposta sem percentual de entrada'" },
  /* ---- a entrega e o material (PR 3b-2) ---- */
  { nome: 'conferir aceita linha fora de "reservado"', arquivo: '20261023120100_pr3b2_material.sql', testes: ['docs/testes/material-banco.test.mjs'],
    de: "if a.status <> 'reservado' then return jsonb_build_object('ok', false, 'motivo', 'estado', 'status', a.status); end if;", para: "if false then return jsonb_build_object('ok', false, 'motivo', 'estado', 'status', a.status); end if;" },
  { nome: 'tamanho menor que o declarado é aceito na conferência', arquivo: '20261023120100_pr3b2_material.sql', testes: ['docs/testes/material-banco.test.mjs'],
    de: "(p ->> 'tamanho_real')::bigint <> a.tamanho_declarado", para: "(p ->> 'tamanho_real')::bigint > a.tamanho_declarado" },
  { nome: 'enviar aceita sem a caixa de autorização', arquivo: '20261023120100_pr3b2_material.sql', testes: ['docs/testes/material-banco.test.mjs'],
    de: "or coalesce(m.autorizacao ->> 'marcada', '') <> 'true' then", para: "then" },
  { nome: 'o teto do balde ignora as reservas abertas', arquivo: '20261023120100_pr3b2_material.sql', testes: ['docs/testes/material-banco.test.mjs'],
    de: "from app.material_arquivos where status = 'reservado';", para: "from app.material_arquivos where status = 'conferido';" },
  { nome: 'esquecer o dono da sessão na trava da entrega', arquivo: '20261023120000_pr3b2_entrega.sql', testes: ['docs/testes/material-banco.test.mjs', 'docs/testes/link-pedido-banco.test.mjs'],
    de: "c := privado.conversa_do(p_conversa, p_visitante);   -- trava 1 (de outro visitante: P0002)", para: "select * into c from app.conversas where id = p_conversa for update;" },
  { nome: 'a reconciliação apaga a reserva recente (menos de 24 h)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/limpeza.test.mjs'],
    de: "where a.status = 'reservado' and a.created_at < now() - interval '24 hours'", para: "where a.status = 'reservado' and a.created_at < now()" },
  { nome: 'o link do pedido é revogado no primeiro uso', arquivo: '20261023120200_pr3b2_link_pedido.sql', testes: ['docs/testes/link-pedido-banco.test.mjs'],
    de: "update app.links_pedido set ultimo_uso_em = now(), valido_ate = case when l.fim_em is null and c.etapa = 'em_producao' then greatest(valido_ate, now() + interval '120 days') else valido_ate end where id = l.id;", para: "update app.links_pedido set ultimo_uso_em = now(), revogado_em = now(), motivo_revogacao = 'fim_do_pedido' where id = l.id;" },
  { nome: 'a conferência de bytes pulada (o servidor confia no tipo declarado)', fonte: 'api/_vendas/fluxo-material.mjs', testes: ['docs/testes/material-api.test.mjs'],
    de: "tipo_real: tipoPorBytes(ini.bytes)", para: "tipo_real: a.tipo_declarado === 'image/png' ? 'png' : a.tipo_declarado === 'image/jpeg' ? 'jpg' : 'webp'" },
  { nome: 'o prazo conta os dias em UTC (não no fuso da captação)', fonte: 'api/_material/prazo.mjs', testes: ['docs/testes/prazo.test.mjs'],
    de: "new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric'", para: "new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric'" },
  { nome: '"baixar" marca importado (antes de a captação importar)', fonte: 'scripts/entregas-lib.mjs', testes: ['docs/testes/entregas-dono.test.mjs'],
    de: "  return { pasta, arquivos: lidos.map(l => l.nome), suspeitos: Array.isArray(pac.suspeitos) ? pac.suspeitos : [], comandos: [", para: "  await marcarImportado({ base, chave, buscar, codigo, cliente: 'c-aaaaab' });\n  return { pasta, arquivos: lidos.map(l => l.nome), suspeitos: Array.isArray(pac.suspeitos) ? pac.suspeitos : [], comandos: [" },
  { nome: '"Mandar para mim" por wa.me com o código', fonte: 'js/orcamento-entrega.js', testes: ['docs/testes/orcamento-entrega.test.mjs'],
    de: "await navigator.share({ title: 'Meu pedido na Beyon Zero', url: $('o-link-campo').value });", para: "window.open('https://wa.me/?text=' + encodeURIComponent($('o-link-campo').value));" },
  /* ---- as correções da revisão do plano ---- */
  { nome: 'o sinal estornado ainda conta como pago (M3: o cliente que desistiu segue enviando e abrindo links)', arquivo: '20261023120000_pr3b2_entrega.sql', testes: ['docs/testes/material-banco.test.mjs', 'docs/testes/link-pedido-banco.test.mjs'],
    de: "where proposta_id = p_proposta and parcela = 'sinal' and status = 'pago');", para: "where proposta_id = p_proposta and parcela = 'sinal' and status in ('pago', 'estornado'));" },
  { nome: '"Sair deste aparelho" só esquece no navegador (logout local, M1)', fonte: 'api/_vendas/visitante.mjs', testes: ['docs/testes/link-pedido-api.test.mjs'],
    de: "/auth/v1/logout?scope=global', { method: 'POST', headers: { apikey: cfg.publica", para: "/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: cfg.publica" },
  { nome: 'o interruptor da entrega sempre ligado (M5)', fonte: 'api/_material/interruptor.mjs', testes: ['docs/testes/interruptor.test.mjs'],
    de: ".trim() === 'ligada'", para: ".trim() !== 'desligada'" },
  { nome: 'sábado conta como dia útil (a regra da captação)', fonte: 'api/_material/prazo.mjs', testes: ['docs/testes/prazo.test.mjs', 'docs/testes/captacao-igual.test.mjs'],
    de: "return semana !== 0 && semana !== 6 && !feriados.has(d);", para: "return semana !== 0 && !feriados.has(d);" },
  /* ---- as respostas da captação e a decisão dos feriados (21/10) ---- */
  { nome: 'o uso do link renova a validade mesmo depois do fim do pedido (M5 da revisão)', arquivo: '20261023120200_pr3b2_link_pedido.sql', testes: ['docs/testes/link-pedido-banco.test.mjs'],
    de: "case when l.fim_em is null and c.etapa = 'em_producao' then", para: "case when true then" },
  { nome: 'a UF deixa de ser obrigatória no envio (A2 da revisão: o pacote não monta)', fonte: 'js/orcamento-material-esquema.js', testes: ['docs/testes/material-esquema.test.mjs'],
    de: "if (UFS.indexOf(m && m.negocio && m.negocio.uf) < 0) f.push(", para: "if (false) f.push(" },
  { nome: 'PUT 409 volta a travar o arquivo (M1 da revisão)', fonte: 'js/orcamento-envio.js', testes: ['docs/testes/orcamento-envio.test.mjs'],
    de: "return status === 409 || (status === 400 &&", para: "return (status === 400 &&" },
  { nome: 'Finados conta como dia útil (feriado nacional fora da lista)', fonte: 'api/_material/prazo.mjs', testes: ['docs/testes/prazo.test.mjs', 'docs/testes/captacao-igual.test.mjs'],
    de: "'10-12', '11-02', '11-15'", para: "'10-12', '11-15'" },
  { nome: 'cliente de saúde sai no pacote (a captação recusa)', fonte: 'api/_material/pacote.mjs', testes: ['docs/testes/pacote.test.mjs'],
    de: "  if (saude) throw new Error(", para: "  if (false) throw new Error(" },
  /* ---- 3b-3a: os textos da D4 que o cliente confirma (api/_vendas/escopo.mjs) ---- */
  { nome: 'contrato volta a dizer "o restante na entrega" (D4)', fonte: 'api/_vendas/escopo.mjs', testes: ['docs/testes/textos-d4.test.mjs'],
    de: "') e o restante quando o site estiver no ar.');", para: "') e o restante na entrega.');" },
  { nome: 'contrato diz 10 dias para o restante em vez de 3 (D4, 22/10)', fonte: 'api/_vendas/escopo.mjs', testes: ['docs/testes/textos-d4.test.mjs'],
    de: "Se o restante não for pago em 3 dias depois do meu aviso", para: "Se o restante não for pago em 10 dias depois do meu aviso" },
  { nome: 'contrato volta a prometer as imagens do modelo com 30 dias sem material (D4 revista, 22/10)', fonte: 'api/_vendas/escopo.mjs', testes: ['docs/testes/textos-d4.test.mjs'],
    de: "'MATERIAL: Nada vai ao ar sem o seu material e a sua autorização:", para: "'MATERIAL: Se o material não chegar em 30 dias, o site sai com as imagens do modelo. Nada vai ao ar sem o seu material e a sua autorização:" },
  { nome: '/condicoes perde a frase do prazo parado enquanto espera a lista de ajustes (D4, captação 8fb5208)', fonte: 'condicoes.html', testes: ['docs/testes/textos-d4.test.mjs'],
    de: ' Enquanto espero a sua lista de ajustes, o prazo também fica parado.', para: '' },
  { nome: 'consultor volta a dizer que o restante é pago na entrega (D4)', fonte: 'api/_vendas/consultor.mjs', testes: ['docs/testes/textos-d4.test.mjs'],
    de: 'o restante é pago por Pix quando o site estiver no ar. Se a tela', para: 'o restante é pago por Pix na entrega. Se a tela' },
  /* ---- D5 (21/10): a prévia nunca é aprovada nem passa sozinha ---- */
  { nome: 'a prévia ganha uma saída de rotina (aprova sozinha)', arquivo: '20261024120000_pr3b3_esquema.sql', testes: ['docs/testes/previa-esquema.test.mjs'],
    acrescentar: "\ninsert into privado.transicoes_entrega (de, para, quem) values ('previa', 'no_ar', 'rotinas_diaria');\n" },
  /* ---- 22/10: nada de encerrar por falta de material; o contato do site só com a autorização de uso ---- */
  { nome: 'o encerrar por "sem_material" volta à lista fechada', arquivo: '20261024120000_pr3b3_esquema.sql', testes: ['docs/testes/previa-esquema.test.mjs'],
    de: "('desistencia', 'atraso', 'producao_manual', 'outro')),   -- lista fechada", para: "('desistencia', 'atraso', 'sem_material', 'producao_manual', 'outro')),   -- lista fechada" },
  { nome: 'o contato do site é aceito sem a autorização de uso', arquivo: '20261024120000_pr3b3_esquema.sql', testes: ['docs/testes/previa-esquema.test.mjs'],
    de: '(contato_autorizado_em is not null and contato_autorizacao_versao is not null)', para: 'true' },

  /* ---- M3 (22/10): o telefone e o e-mail do site só existem com a autorização de uso ---- */
  { nome: 'a função aceita o contato do site sem a versão da autorização', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-banco.test.mjs'],
    de: "or ((v_whats is not null or v_email is not null) and (v_versao is null or char_length(v_versao) > 20)) then", para: 'or false then' },
  /* ---- a aprovação e o prazo do cliente (fix wave final): a corrida e a chave estranha ---- */
  { nome: 'aprovar sem conferir a versão que a tela viu', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-banco.test.mjs'],
    de: "if e.updated_at is distinct from v_versao_vista then raise exception 'a prévia mudou' using errcode = '40001'; end if;", para: '' },
  { nome: 'a lista de ajustes aceita qualquer chave do prazo do servidor', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-banco.test.mjs'],
    de: "rodadas_usadas = rodadas_usadas + 1, prazo = prazo || jsonb_strip_nulls(jsonb_build_object('conta_desde', p -> 'prazo' -> 'conta_desde', 'pausas', p -> 'prazo' -> 'pausas')),", para: "rodadas_usadas = rodadas_usadas + 1, prazo = prazo || (p -> 'prazo')," },
  { nome: 'aprovar aceita qualquer chave do prazo do servidor', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-banco.test.mjs'],
    de: "aprovada_em = v_agora, prazo = prazo || jsonb_strip_nulls(jsonb_build_object('conta_desde', p -> 'prazo' -> 'conta_desde', 'pausas', p -> 'prazo' -> 'pausas')),", para: "aprovada_em = v_agora, prazo = prazo || (p -> 'prazo')," },
  /* ---- A1 (revisão de 22/10): o aviso de material parado só vale a partir do dia 30 ---- */
  { nome: 'o aviso de material parado sai antes do dia 30', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "if v_dias < 30 then return jsonb_build_object('ok', false, 'dias', v_dias, 'motivo', 'cedo'); end if;", para: 'null;' },
  /* ---- 22/10: o restante em 3 dias, nada de encerrar por falta de material, o aviso "no ar" é a data de partida ---- */
  { nome: 'o site sai do ar antes do fim do 3º dia do aviso', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "if v_dias < 4 then return jsonb_build_object('ok', false, 'motivo', 'cedo', 'dias', v_dias); end if;", para: 'null;' },
  { nome: 'o encerrar volta a aceitar "sem_material" (encerrar por sumiço do cliente)', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "v_motivo not in ('desistencia', 'atraso', 'producao_manual', 'outro')", para: "v_motivo not in ('desistencia', 'atraso', 'sem_material', 'producao_manual', 'outro')" },
  { nome: 'o aviso "no ar" registrado de novo adia o prazo do cliente', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: 'coalesce(aviso_no_ar_feito_em, now())', para: 'now()' },
  /* ---- a autorização expressa: o dono não dispensa o material sem a caixa marcada (previa → no_ar sem aprovação é barrada DUAS vezes, na função e na tabela de transições; a tabela tem a sua sabotagem em previa-esquema) ---- */
  { nome: 'dispensar o material sem a caixa de autorização marcada', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "or coalesce(m.autorizacao ->> 'marcada', '') <> 'true' or", para: 'or' },
  { nome: 'o aviso de material parado sai mesmo com o número autorizado (o caminho é dispensar)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "\n      return jsonb_build_object('ok', false, 'motivo', 'dispensar');\n", para: '\n      null;\n' },
  { nome: 'as ações do dono ficam abertas ao usuário logado', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    acrescentar: '\ngrant execute on function app.vendas_encerrar(jsonb) to authenticated;\n' },
  /* ---- revisão da Task 5: o Pix do restante em andamento, o que o encerrar faz, a DATA de Campo Grande e os 30 dias ---- */
  { nome: 'encerrar com o Pix do restante em andamento', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "    return jsonb_build_object('ok', false, 'motivo', 'pagamento_em_andamento');\n  end if;\n  update app.pagamentos set status = 'cancelado'",
    para: "    null;\n  end if;\n  update app.pagamentos set status = 'cancelado'" },
  { nome: 'suspender com o Pix do restante em andamento', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "    return jsonb_build_object('ok', false, 'motivo', 'pagamento_em_andamento');\n  end if;\n  update app.entregas set passo = 'suspensa'",
    para: "    null;\n  end if;\n  update app.entregas set passo = 'suspensa'" },
  { nome: 'encerrar deixa o saldo pendente de pé', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "update app.pagamentos set status = 'cancelado' where proposta_id = e.proposta_id and parcela = 'saldo' and status = 'pendente';", para: 'null;' },
  { nome: 'encerrar não cancela o projeto', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "update app.projetos set status = 'cancelado' where", para: 'update app.projetos set status = status where' },
  { nome: 'encerrar não limita o link do pedido', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: 'perform privado.encerrar_links_do_pedido(e.conversa_id, 30);', para: 'null;' },
  { nome: 'suspender conta 96 horas de relógio em vez da data de Campo Grande', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "\n  v_dias := (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date;",
    para: "\n  v_dias := floor(extract(epoch from (now() - e.aviso_no_ar_feito_em)) / 86400)::integer;" },
  { nome: 'os lembretes contam horas de relógio em vez da data de Campo Grande', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "\n    v_dias := (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date;",
    para: "\n    v_dias := floor(extract(epoch from (now() - e.aviso_no_ar_feito_em)) / 86400)::integer;" },
  { nome: 'dispensar conta 30 dias de relógio em vez da data de Campo Grande', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "\n  v_dias := coalesce((now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date, 0);",
    para: "\n  v_dias := coalesce(floor(extract(epoch from (now() - (e.prazo ->> 'entrada_em')::timestamptz)) / 86400)::integer, 0);" },
  { nome: 'o aviso de material parado conta 30 dias de relógio em vez da data de Campo Grande', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "\n    v_dias := coalesce((now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date, 0);",
    para: "\n    v_dias := coalesce(floor(extract(epoch from (now() - (e.prazo ->> 'entrada_em')::timestamptz)) / 86400)::integer, 0);" },
  { nome: 'dispensar sem entrada_em pula a trava dos 30 dias', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: ", 0);   -- (entrada_em ausente conta como dia 0: a trava dos 30 dias falha FECHADA)", para: ');' },
  { nome: 'o aviso de material parado sem entrada_em pula a trava dos 30 dias', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: ", 0);   -- (idem: sem entrada_em não passa do dia 30)", para: ');' },
  { nome: 'dispensar sem a trava dos 30 dias', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "if v_dias < 30 then return jsonb_build_object('ok', false, 'motivo', 'cedo', 'dias', v_dias); end if;", para: 'null;' },
  { nome: 'dispensar sem exigir o WhatsApp salvo', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "if coalesce(m.dados ->> 'whatsapp', '') = '' or", para: 'if' },
  { nome: 'dispensar sem exigir a UF', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "or coalesce(m.negocio ->> 'uf', '') = '' then", para: 'then' },
  { nome: 'o aviso de material parado fora do passo material volta a dizer "ja"', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "if e.passo <> 'material' then return jsonb_build_object('ok', false, 'motivo', 'estado'); end if;", para: "if e.passo <> 'material' then return jsonb_build_object('ok', false, 'motivo', 'ja'); end if;" },
  /* ---- o restante (PR 3b-3) ---- */
  { nome: 'o restante abre fora do ar (qualquer passo da entrega)', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "if not found or e.passo not in ('no_ar', 'suspensa') then", para: 'if not found then' },
  { nome: 'o restante cobra um valor que não é o saldo (usa o total)', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: 'v_valor := pr.valor_total - v_sinal;', para: 'v_valor := pr.valor_total;' },
  { nome: 'o restante pago não conclui a entrega', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "update app.entregas set passo = 'concluida'", para: "update app.entregas set passo = passo" },
  { nome: 'o restante aceita cartão no banco (B3)', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "if v_parcela = 'saldo' and p ->> 'metodo' <> 'pix' then", para: 'if false then' },
  { nome: 'o estado do pagamento nunca olha o saldo', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "then 'saldo' else 'sinal' end;", para: "then 'sinal' else 'sinal' end;" },
  { nome: 'o gatilho do saldo deixa o erro derrubar o pagamento', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "exception when others then\n    raise warning 'entrega não concluída", para: "exception when no_data_found then\n    raise warning 'entrega não concluída" },
  { nome: 'a leitura do estado deixa o erro da conclusão derrubar a tela', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "exception when others then\n      raise warning 'conclusão pendente", para: "exception when no_data_found then\n      raise warning 'conclusão pendente" },
  { nome: 'a conclusão refeita a cada contestação revertida (evento duplicado)', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "if e.passo not in ('no_ar', 'suspensa') then return false; end if;", para: 'null;' },
  { nome: 'o restante pago com a entrega encerrada passa sem avisar a equipe', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "and not exists (select 1 from app.entregas where proposta_id = new.proposta_id and passo = 'concluida') then", para: 'and false then' },
  { nome: 'a tela conta os dias do aviso do ar em horas de relógio em vez da data de Campo Grande', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "\n                 else (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date end;",
    para: "\n                 else floor(extract(epoch from (now() - e.aviso_no_ar_feito_em)) / 86400)::integer end;" },
  { nome: 'o restante abre com a entrada estornada ou contestada', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: 'if not privado.sinal_pago(pr.id) then raise exception', para: 'if false then raise exception' },
  { nome: 'o restante pago não limita o link do pedido', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: 'perform privado.encerrar_links_do_pedido(e.conversa_id, 30);', para: 'null;' },
  { nome: 'o restante cobra com a entrega de outra proposta', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: 'if e.proposta_id <> pr.id then raise exception', para: 'if false then raise exception' },
  { nome: 'o restante pago com o projeto pausado passa sem avisar a equipe', arquivo: '20261024120200_pr3b3_restante.sql', testes: ['docs/testes/restante-banco.test.mjs'],
    de: "if not found and not exists (select 1 from app.projetos where id = v_projeto and status = 'entregue') then", para: 'if false then' },
  /* ---- 3b-3 Task 7: a API do cliente (prévia e restante) ---- */
  { nome: 'a API aceita o telefone ou o e-mail do site sem a autorização de uso', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "if (temContato && corpo.autorizo !== true) throw new Recusa(422, FRASES.autorizacao);", para: '/* sem a trava */' },
  { nome: 'a API mede o limite de 1.500 DEPOIS de redigir (quem digita 1.500 com e-mail leva 422)', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: 'if (limpo.length > MAX_LISTA) throw', para: 'if (redigir(limpo).length > MAX_LISTA) throw' },
  { nome: 'a API grava o texto da lista sem redigir (telefone e e-mail passam)', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: 'const texto = cortar(redigir(unirQuebras(limpo)).trim(), MAX_LISTA).trim();', para: 'const texto = cortar(unirQuebras(limpo), MAX_LISTA).trim();' },
  { nome: 'aprovar ignora a recusa { ok: false } do banco e responde 200', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "      if (!r || r.ok !== true) throw new Recusa(409, FRASES.passo, { whatsapp: true });\n      return { ok: true };", para: "      return { ok: true };" },
  { nome: 'aprovar aceita a prévia que a pessoa não viu (o servidor ignora a rodada_base) (3b-3c, B1)', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: 'if (corpo.rodada_base !== e.rodadas.usadas) throw new Recusa(409, FRASES.mudou);', para: '/* sem a conferência da rodada */' },
  { nome: 'a tela aprova sem dizer qual prévia viu (não manda a rodada_base) (3b-3c, B1)', fonte: 'js/orcamento-api.js', testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "comConversa({ rodada_base: rodadaBase })", para: "comConversa()" },
  { nome: 'o pagar abre o restante antes do site no ar', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "if (passo !== 'no_ar' && passo !== 'suspensa') throw new Recusa(409, 'O restante abre quando o site estiver no ar.');", para: "if (false) throw new Recusa(409, 'O restante abre quando o site estiver no ar.');" },
  { nome: 'o pagar do restante aceita cartão', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "if (corpo?.metodo !== 'pix') throw new Recusa(400, 'O restante é pago por Pix.');", para: '/* sem a trava do Pix */' },
  { nome: 'o pagar do restante ignora o interruptor desligado', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "  if (!entregaLigada(env)) throw new Recusa(503, FRASE_DESLIGADA, { whatsapp: true });\n  if (passo === 'concluida')", para: "  if (passo === 'concluida')" },
  { nome: 'a entrega encerrada passa por "site no ar" no pagar do restante', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "  if (passo === 'encerrada') throw new Recusa(409, PEDIDO_ENCERRADO, { whatsapp: true });\n", para: "  /* sem a frase do pedido encerrado */\n" },
  /* ---- correção da revisão da Task 7: texto escondido, linhas em branco, saídas pelo WhatsApp ---- */
  { nome: 'o texto livre deixa passar caracteres de formato (tag characters escondem instrução)', fonte: 'api/_vendas/seguranca.mjs', testes: ['docs/testes/previa-api.test.mjs', 'docs/testes/ajustes-api.test.mjs'],
    de: "String(s).replace(/[\\p{Cf}\\p{Co}\\p{Cs}]/gu, '')", para: "String(s).replace(/[\\p{Co}\\p{Cs}]/gu, '')" },
  { nome: 'a lista de ajustes deixa as linhas em branco esconderem CPF e telefone da redação', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "redigir(unirQuebras(limpo))", para: "redigir(limpo)" },
  { nome: 'o passo errado da prévia perde a saída pelo WhatsApp', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "if (!e || e.passo !== 'previa') throw new Recusa(409, FRASES.passo, { whatsapp: true });", para: "if (!e || e.passo !== 'previa') throw new Recusa(409, FRASES.passo);" },
  { nome: 'o pagar do restante decide a recusa do banco pela mensagem (em produção ela não traz o texto) e não pelo código', fonte: 'api/_vendas/fluxo.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "e.codigo === '55000') throw new Recusa(409, RESTANTE_TRAVADO, { whatsapp: true });", para: "e.codigo === '55000' && /entrada não está paga/.test(e.message)) throw new Recusa(409, RESTANTE_TRAVADO, { whatsapp: true });" },
  { nome: 'a lista de ajustes deixa o fim de linha do Windows esconder CPF e telefone da redação', fonte: 'api/_vendas/fluxo-previa.mjs', testes: ['docs/testes/previa-api.test.mjs'],
    de: "s.replace(/\\s*\\n\\s*/g, '\\n')", para: "s.replace(/[ \\t]*\\n\\s*/g, '\\n')" },
  /* ---- a API do dono (PR 3b-3b, Task 8): o que SÓ o JS protege, ou onde o JS dá a frase certa ao dono ---- */
  { nome: 'o prazo vencido deixa publicar a prévia (painel do dono)', fonte: 'api/_entrega/painel-entrega.mjs', testes: ['docs/testes/previa-painel.test.mjs'],
    de: "const atrasoPrevia = barrarPeloPrazo(info, t.agora, 'mostrar a prévia'); if (atrasoPrevia) return atrasoPrevia;", para: '/* (sabotado: a prévia sai com o prazo vencido) */' },
  { nome: 'o prazo vencido deixa pôr o site no ar (painel do dono)', fonte: 'api/_entrega/painel-entrega.mjs', testes: ['docs/testes/previa-painel.test.mjs'],
    de: "const atrasoSite = barrarPeloPrazo(info, t.agora, 'publicar o site'); if (atrasoSite) return atrasoSite;", para: '/* (sabotado: o site sai com o prazo vencido) */' },
  { nome: 'o dispensar devolve a data de agora no lugar da marcação real da caixa (painel do dono)', fonte: 'api/_entrega/painel-entrega.mjs', testes: ['docs/testes/previa-painel.test.mjs'],
    de: "marcada_em: (info.material && info.material.autorizacao && info.material.autorizacao.marcada_em) || null", para: 'marcada_em: t.iso' },
  { nome: 'o prazo com data ilegível passa por legível (painel do dono)', fonte: 'api/_entrega/painel-entrega.mjs', testes: ['docs/testes/previa-painel.test.mjs'],
    de: 'function prazoLegivel(prazo) {\n', para: 'function prazoLegivel(prazo) {\n  return true;\n' },
  { nome: 'a lista de ajustes perde o selo de texto suspeito (painel do dono)', fonte: 'api/_entrega/painel-entrega.mjs', testes: ['docs/testes/previa-painel.test.mjs'],
    de: "suspeito: pareceInjecao(String(a.texto || ''))", para: 'suspeito: false' },
  { nome: 'pôr no ar sem a aprovação do cliente, no JS (painel do dono)', fonte: 'api/_entrega/painel-entrega.mjs', testes: ['docs/testes/previa-painel.test.mjs'],
    de: "if (info.passo !== 'aprovada') {", para: 'if (false) {' },
  { nome: 'dispensar o material sem conferir o número autorizado, no JS (painel do dono)', fonte: 'api/_entrega/painel-entrega.mjs', testes: ['docs/testes/previa-painel.test.mjs'],
    de: 'const falta = ESQ.faltas(info.material);', para: 'const falta = [];' },
  /* ---- a rotina diária (Task 9): a lista de ajustes, o prazo sem dias, o passo (D5) ---- */
  { nome: 'a rotina diária apaga a lista de ajustes que ainda está na fila', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/rotina-entregas.test.mjs'],
    de: "where e.id = a.entrega_id and e.updated_at < now() - interval '30 days' and (a.status = 'feito' or e.passo in ('concluida', 'encerrada'))", para: "where e.id = a.entrega_id and e.updated_at < now() - interval '30 days' and true" },
  { nome: 'a rotina apaga a lista de ajustes sem copiar a prova da autorização do contato (M1)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/rotina-entregas.test.mjs'],
    de: "from apagadas where contato_whatsapp is not null or contato_email is not null", para: "from apagadas where false" },
  { nome: 'a prova da autorização do contato é copiada de toda lista, mesmo sem contato (M1)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/rotina-entregas.test.mjs'],
    de: "from apagadas where contato_whatsapp is not null or contato_email is not null", para: "from apagadas" },
  { nome: 'a tabela da prova do contato é aberta ao service_role (M1)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/rotina-entregas.test.mjs'],
    acrescentar: '\ngrant select, delete on app.entrega_contato_autorizacoes to service_role;\n' },
  { nome: 'um item torto derruba os alarmes do dia inteiro (B1)', fonte: 'api/_entrega/alarmes.mjs', testes: ['docs/testes/prazo-limites.test.mjs'],
    de: 'try { contarUm(it, agora, r); } catch (e) { if (!(e instanceof RangeError)) throw e; r.ilegiveis++; }', para: 'contarUm(it, agora, r);' },
  { nome: 'o alarme engole também erro de programação (TypeError) como se fosse dado torto (B1)', fonte: 'api/_entrega/alarmes.mjs', testes: ['docs/testes/prazo-limites.test.mjs'],
    de: 'if (!(e instanceof RangeError)) throw e; r.ilegiveis++;', para: 'r.ilegiveis++;' },
  { nome: 'a rotina deixa o item torto sumir calado, sem alerta (B1)', fonte: 'api/rotinas.mjs', testes: ['docs/testes/rotina-entregas.test.mjs'],
    de: 'if (entregas.ilegiveis > 0) falhas.push(', para: 'if (false) falhas.push(' },
  { nome: 'o listar do terminal imprime dias_na_previa sem limpar (B3)', fonte: 'scripts/entregas-lib.mjs', testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: 'paraTerminal(it.dias_na_previa, 10)', para: 'it.dias_na_previa' },
  { nome: 'o prazo aceita prazo_dias fora de 1 a 60 (B1)', fonte: 'api/_material/prazo.mjs', testes: ['docs/testes/prazo-limites.test.mjs'],
    de: "prazoDias < 1 || prazoDias > PRAZO_DIAS_MAX) throw", para: "prazoDias < 1 || prazoDias > 100000) throw" },   /* (a sabotagem NÃO desliga a guarda inteira: sem ela o 1e12 do teste vira um laço sem fim) */
  { nome: 'atingir o teto dos dias parados devolve data limite errada em vez de erro (B1)', fonte: 'api/_material/prazo.mjs', testes: ['docs/testes/prazo-limites.test.mjs'],
    de: 'if (parados >= PARADOS_DIAS_UTEIS_MAX) throw new RangeError(', para: 'if (false) throw new RangeError(' },
  { nome: 'o teto dos dias parados volta a ser de 260 (a prévia parada mais de um ano vence por engano) (B1)', fonte: 'api/_material/prazo.mjs', testes: ['docs/testes/prazo-limites.test.mjs'],
    de: 'export const PARADOS_DIAS_UTEIS_MAX = 3650;', para: 'export const PARADOS_DIAS_UTEIS_MAX = 260;' },
  { nome: 'a rotina diária encerra o pedido parado (muda o passo, D5), dentro da função que lista as entregas', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/previa-esquema.test.mjs'],
    de: "  return jsonb_build_object('itens', v_itens, 'ajustes_apagados', v_apagados);", para: "  update app.entregas set passo = 'encerrada' where passo = 'material' and updated_at < now() - interval '400 days';\n  return jsonb_build_object('itens', v_itens, 'ajustes_apagados', v_apagados);" },
  /* ---- o material do projeto parado (decisão do dono de 22/10): 6 meses parado + aviso prévio + 30 dias; nunca com autorização completa; o cliente que volta recomeça ---- */
  { nome: 'o material parado é apagado antes dos 30 dias do aviso prévio', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "(e.aviso_apagar_material_em at time zone 'America/Campo_Grande')::date + 30 <= ", para: "(e.aviso_apagar_material_em at time zone 'America/Campo_Grande')::date + 0 <= " },
  { nome: 'o material parado é apagado aos 5 meses em vez dos 6', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "::date + interval '6 months')::date <=", para: "::date + interval '5 months')::date <=" },
  { nome: 'o aviso prévio do apagamento só é devido aos 4 meses', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "::date + interval '5 months')::date <=", para: "::date + interval '4 months')::date <=" },
  { nome: 'o material de quem tem a autorização completa também é apagado', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "    and not exists (select 1 from app.materiais m where m.entrega_id = e.id and privado.material_autorizado(m))\n    and exists (select 1 from app.materiais m where m.entrega_id = e.id and m.status = 'rascunho')", para: "    and exists (select 1 from app.materiais m where m.entrega_id = e.id and m.status = 'rascunho')" },
  { nome: 'a mexida do cliente no material não recomeça a contagem do parado', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "else greatest(e.aviso_material_em, (select m.updated_at from app.materiais m where m.entrega_id = e.id),\n                  (select max(a.created_at) from app.material_arquivos a where a.entrega_id = e.id)) end;", para: "else e.aviso_material_em end;" },
  { nome: 'o aviso prévio do apagamento é devido mesmo sem nada para apagar', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "    and privado.material_tem_o_que_apagar(e)\n", para: "" },
  { nome: 'a limpeza esquece o material do projeto parado (os arquivos ficam no armazém)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "where a.status in ('conferido', 'reservado') and privado.material_apagavel(e)", para: "where false" },
  { nome: 'o apagamento do projeto parado deixa os campos do material no banco', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "update app.materiais set dados = '{}', negocio = '{}', updated_at = now() where entrega_id = e.id and status = 'rascunho';", para: "update app.materiais set updated_at = now() where entrega_id = e.id and status = 'rascunho';" },
  { nome: 'o apagamento do projeto parado não registra o dia na entrega', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "  update app.entregas set material_apagado_em = now() where id = e.id;\n", para: "" },
  { nome: 'o aviso prévio do apagamento pode ser registrado mais de uma vez', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "then return jsonb_build_object('ok', false, 'motivo', 'ja'); end if;\n    if e.aviso_material_em is null then", para: "then null; end if;\n    if e.aviso_material_em is null then" },
  { nome: 'o aviso prévio do apagamento sai sem o aviso de material parado', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "if e.aviso_material_em is null then return jsonb_build_object('ok', false, 'motivo', 'sem_aviso'); end if;", para: "null;" },
  /* ---- B3 (fix wave 2): encerrar e dispensar do terminal pedem o código digitado ---- */
  { nome: 'encerrar do terminal dispara sem pedir o código digitado (B3)', fonte: 'scripts/entregas-lib.mjs', testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "if (!(await pedirConfirmacao(perguntar, gerar, 'encerrar o pedido'))) throw", para: 'if (false) throw' },
  { nome: 'dispensar do terminal dispara sem pedir o código digitado (B3)', fonte: 'scripts/entregas-lib.mjs', testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "if (!(await pedirConfirmacao(perguntar, gerar, 'dispensar o material e seguir para a produção'))) throw", para: 'if (false) throw' },
  { nome: 'o listar do terminal imprime o que vem do servidor sem limpar (B3)', fonte: 'scripts/entregas-lib.mjs', testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "const t = (v, max = 40) => paraTerminal(v, max);", para: 'const t = (v, max = 40) => String(v);' },
  /* ---- B5 (fix wave 2): o prazo que chega do servidor só mescla chaves fechadas ---- */
  { nome: 'publicar a prévia mescla o prazo inteiro que chega (B5)', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "previa_em = v_agora, prazo = prazo || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p -> 'prazo') as t(k, v) where k in ('conta_desde', 'pausas')),", para: "previa_em = v_agora, prazo = prazo || (p -> 'prazo')," },
  { nome: 'dispensar o material mescla o prazo inteiro que chega (B5)', arquivo: '20261024120100_pr3b3_previa.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "set passo = 'producao', prazo = prazo || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(p -> 'prazo') as t(k, v) where k in ('numero_em', 'conta_desde')),", para: "set passo = 'producao', prazo = prazo || (p -> 'prazo')," },
  { nome: 'o alarme de apagar o material conta pedido que o banco não deve', fonte: 'api/_entrega/alarmes.mjs', testes: ['docs/testes/alarmes.test.mjs'],
    de: "if (it.apagar_material_devido === true) r.material_apagar++;", para: "r.material_apagar++;" },
  /* ---- revisão da Task 9: a corrida do apagamento e a guarda do aviso prévio ---- */
  { nome: 'o apagamento do material parado não reconfere sob trava (apaga o que o cliente acabou de salvar)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "  if not privado.material_apagavel(e)\n     or exists (", para: "  if false\n     or exists (" },
  { nome: 'o aviso prévio anterior à mexida do cliente passa a valer (a guarda do aviso some)', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "    and e.aviso_apagar_material_em >= privado.material_parado_desde(e)\n    and ((", para: "    and true\n    and ((" },
  { nome: 'o material que não é rascunho também é apagado pelo caminho do projeto parado', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/material-parado.test.mjs'],
    de: "    and exists (select 1 from app.materiais m where m.entrega_id = e.id and m.status = 'rascunho')\n", para: "" },
  { nome: 'o histórico do dia grava zeros quando as entregas não foram lidas', arquivo: '20261024120300_pr3b3_rotina.sql', testes: ['docs/testes/rotina-entregas.test.mjs'],
    de: "case when jsonb_typeof(p -> 'entregas') = 'object' then jsonb_build_object('prazo_vencido', v_prazo, 'material_30', v_mat, 'restante_vencido', v_resto, 'material_apagar', v_apagar) end))",
    para: "jsonb_build_object('prazo_vencido', v_prazo, 'material_30', v_mat, 'restante_vencido', v_resto, 'material_apagar', v_apagar)))" },
  /* ---- o comando do dono (Task 10): o que só vive no JS do terminal ---- */
  { nome: "o \"no ar\" sem pedir o código sorteado (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "  if (!(await pedirConfirmacao(perguntar, gerar, 'pôr o site no ar e abrir a cobrança do restante'))) throw new Error('Não confirmado: nada foi feito.');\n", para: "  /* (confirmação removida) */\n" },
  { nome: "o \"no ar\" não mostra o pedido e o endereço antes do código (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "  saida(codigo + ' -> ' + paraTerminal(url, 300));", para: "  /* (impressão removida) */" },
  { nome: "o aviso da suspensão chega ao terminal sem limpar a sequência de controle", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "return (r && r.aviso && paraTerminal(r.aviso, 400)) ||", para: "return (r && r.aviso) ||" },
  { nome: "um valor torto no prazo (TypeError) derruba o listar", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "e instanceof RangeError || e instanceof TypeError", para: "e instanceof RangeError" },
  { nome: "o encerrar aceita \"sem resposta\" e \"sem material\" (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "const MOTIVOS = ['desistencia', 'atraso', 'producao_manual', 'outro'];", para: "const MOTIVOS = ['desistencia', 'atraso', 'producao_manual', 'outro', 'sem_resposta', 'sem_material'];" },
  { nome: "o contato do site vai para a pasta sem a autorização registrada (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: " || !a.contato.autorizado_em || !a.contato.autorizacao_versao) {", para: " || false) {" },
  { nome: "a lista de ajustes do cliente vai sem a moldura do briefing (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "REGRA_BRIEFING + '\\n\\n' + moldura + '\\n'", para: "lista.map(a => String(a.texto || '')).join('\\n') + '\\n'" },
  { nome: "o selo de texto suspeito só vale o que o servidor trouxe (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "a.suspeito === true || pareceInjecao(String(a.texto || ''))", para: "a.suspeito === true" },
  { nome: "a chave do painel aparece na frase de erro do terminal (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "corpo.erro.split(chave).join('[chave]')", para: "corpo.erro" },
  { nome: "o aviso material-apagar registra o momento errado (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "'material-apagar': 'material_apagar'", para: "'material-apagar': 'material_parado'" },
  { nome: "o listar não sugere o aviso prévio do apagamento (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "it.passo === 'material' && it.apagar_material_devido &&", para: "it.passo === 'material' && false &&" },
  { nome: "o prazo sem dias inteiros do prazo vira vencimento inventado (terminal do dono)", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: " && it.prazo && Number.isInteger(it.prazo_dias)) {", para: " && it.prazo) {" },
  { nome: "o terminal sai com sucesso quando o painel recusa (terminal do dono)", fonte: "scripts/entregas.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "(chave ? frase.split(chave).join('[chave]') : frase));\n    return 1;", para: "(chave ? frase.split(chave).join('[chave]') : frase));\n    return 0;" },
  { nome: "a lista do painel esconde que o aviso prévio do apagamento é devido", arquivo: "20261024120400_pr3b3_lista.sql", testes: ['docs/testes/lista-material-banco.test.mjs'],
    de: "'apagar_material_devido', privado.material_apagar_devido(e),", para: "'apagar_material_devido', false," },
  /* ---- 3b-3c: o painel do dono, a tela da prévia, o restante só por Pix, o verificador do "antes de ligar" e o servidor local ---- */
  { nome: "o botão da mensagem pronta volta a montar ?text= (o link de retomada iria para o endereço de terceiro) (3b-3c)", fonte: "js/painel-pedido-comum.js", testes: ['docs/testes/painel-aviso.test.mjs'],
    de: "a.href = 'https://wa.me/' + digitos;", para: "a.href = 'https://wa.me/' + digitos + '?text=' + encodeURIComponent(msg.value);" },
  { nome: "o botão do e-mail volta a levar o corpo (o link de retomada iria no mailto:) (3b-3c)", fonte: "js/painel-pedido-comum.js", testes: ['docs/testes/painel-aviso.test.mjs'],
    de: "a.href = 'mailto:' + email;", para: "a.href = 'mailto:' + email + '?body=' + encodeURIComponent(msg.value);" },
  { nome: "o aviso de apagar o material fica sem mensagem pronta no painel (3b-3c)", fonte: "js/painel-entregas.js", testes: ['docs/testes/painel-entregas.test.mjs'],
    de: "    material_apagar: {\n      titulo:", para: "    material_apagar_removido: {\n      titulo:" },
  { nome: "o \"Já avisei\" do painel não manda o momento do aviso (tira o aviso errado da fila) (3b-3c)", fonte: "js/painel-entregas.js", testes: ['docs/testes/painel-entregas.test.mjs'],
    de: "JSON.stringify({ aviso_feito: a.codigo, momento: a.momento })", para: "JSON.stringify({ aviso_feito: a.codigo })" },
  { nome: "o endereço da prévia aceita qualquer host (regra frouxa em vez da da captação) (3b-3c)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: String.raw`new RegExp('^https://v\\d{1,2}\\.bz-c-[' + ESQ.ALFABETO_ID + ']{6}\\.pages\\.dev/?$').test(url)`, para: String.raw`/^https?:\/\/[^ ]+$/.test(url)` },
  { nome: "o cliente pode aprovar uma prévia que não consegue ver (sem endereço válido) (3b-3c)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "podeResponder: pode, podeAjustes: pode &&", para: "podeResponder: true, podeAjustes: pode &&" },
  { nome: "o botão \"Está bom: aprovar\" aparece com a prévia que não abriu (aprovar sem ver, na tela) (3b-3c)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "$('o-prv-botoes').hidden = !responde || formAberto;", para: "$('o-prv-botoes').hidden = !pronta || formAberto;" },
  { nome: "aprovar a prévia sem passar pelo <dialog> de confirmação (3b-3c)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "abridor = $('o-prv-aprovar'); $('o-prv-dialogo').showModal(); $('o-prv-voltar').focus(); });", para: "abridor = $('o-prv-aprovar'); API.previaAprovar(); });" },
  { nome: "a lista de ajustes aceita CPF e CNPJ na tela (3b-3c)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "if (ESQ && ESQ.CPF_CNPJ.test(t)) return 'Não escreva CPF nem CNPJ aqui.';", para: "/* sabotagem: sem a conferência de CPF e CNPJ */" },
  { nome: "trocar o telefone ou o e-mail do site sem marcar a autorização de uso, na tela (3b-3c)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "if (!autorizo) return 'Para trocar o telefone ou o e-mail do site, marque a autorização de uso.';", para: "/* sabotagem: sem a conferência da autorização */" },
  { nome: "o texto da prévia entra por innerHTML (3b-3c)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "$('o-prv-texto').textContent = f.texto;", para: "$('o-prv-texto').innerHTML = f.texto;" },
  { nome: "a frase \"o prazo fica parado\" some da tela da prévia (D4/D5) (3b-3c)", fonte: "orcamento.html", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: 'id="o-prv-prazo">Enquanto espero a sua lista de ajustes, o prazo fica parado.</p>', para: 'id="o-prv-prazo"></p>' },
  { nome: "o endereço do site no ar abre sem rel=\"noopener noreferrer\" (3b-3c)", fonte: "orcamento.html", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: 'id="o-noar-abrir" target="_blank" rel="noopener noreferrer"', para: 'id="o-noar-abrir" target="_blank"' },
  { nome: "o endereço do site aceita caminho, consulta e # (só a origem é o endereço do site) (3b-3c)", fonte: "js/orcamento-restante.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "if (u.pathname !== '/' || u.search || u.hash) return null;", para: "/* sabotagem: o caminho do endereço é aceito */" },
  { nome: "o restante cobra o total e não total menos a entrada (3b-3c)", fonte: "js/orcamento-restante.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "var resto = centavos(total) - (paga ? centavos(paga.valor) : centavos(Pix.valorDaEntrada(pr)));", para: "var resto = centavos(total);" },
  { nome: "o Pix do restante pede o componente sem a restrição { metodos: ['pix'] } (3b-3c)", fonte: "js/orcamento-restante.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "tela.mostrar(valor, pct.restante, { metodos: ['pix'] })", para: "tela.mostrar(valor, pct.restante)" },
  { nome: "o pedido conta como concluído com o restante ainda pendente (3b-3c)", fonte: "js/orcamento-restante.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "r = daParcela(pagamentos, 'saldo', 'pago');", para: "r = (pagamentos || []).filter(function (p) { return p.parcela === 'saldo'; })[0] || null;" },
  { nome: "o restante abre mesmo com a entrega desligada no servidor (interruptor ignorado) (3b-3c)", fonte: "js/orcamento-restante.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "E.entrega_ligada !== false && ", para: "true && " },
  { nome: "quem volta pelo link cai no Pix e não no bloco \"site no ar\" (3b-3c)", fonte: "js/orcamento-restante.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "restanteAberto(E) ? 'o-noar' : previaAberta", para: "restanteAberto(E) ? 'o-pagamento' : previaAberta" },
  { nome: "o componente do Pix esquece a restrição de métodos do restante (3b-3c)", fonte: "js/orcamento-pagamento.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "if (arguments.length > 2) permitidos = opcoes && Array.isArray(opcoes.metodos) ? opcoes.metodos.slice() : null;", para: "/* sabotagem: a restrição de métodos é esquecida */" },
  { nome: "o seletor de cartão aparece no restante (a restrição é ignorada ao decidir) (3b-3c)", fonte: "js/orcamento-pagamento.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "&& (!permitidos || permitidos.indexOf('cartao') >= 0);", para: ";" },
  { nome: "a página para a espera do Pix do restante a cada leitura (3b-3c)", fonte: "js/orcamento.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "if (telaPagamento && !restanteAberto()) telaPagamento.parar();", para: "if (telaPagamento) telaPagamento.parar();" },
  { nome: "o verificador aceita o curinga do Supabase como se fosse o endereço exato (3b-3c)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: String.raw`([a-z0-9]{20})\.supabase\.co`, para: String.raw`([a-z0-9*]{1,20})\.supabase\.co` },
  { nome: "o verificador deixa de contar como FALTA a CSP que existe e não consegue ler (3b-3c)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: "if (csp === null) return { itens: [item('FALTA',", para: "if (csp === null) return { itens: [item('OK'," },
  { nome: "o verificador deixa passar o BZ_ENTREGA ligado num arquivo de deploy (3b-3c)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: String.raw`ligada(?![\w-])/.test(semComentarios(ler(f)))`, para: String.raw`ligada(?![\w-])/.test('')` },
  { nome: "o verificador deixa passar qualquer fonte no connect-src (só confere o Supabase) (3b-3c, B2)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: "if (fora.length) problemas.push(", para: "if (false) problemas.push(" },
  { nome: "o verificador não olha script-src, style-src e default-src (unsafe-inline, * e esquemas soltos passam) (3b-3c, B2)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: "if (abertas.length) itens.push(", para: "if (false) itens.push(" },
  { nome: "o verificador não varre os workflows nem o Worker atrás do BZ_ENTREGA (3b-3c, B3)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: "const mexem = mencionamOInterruptor(mundo);", para: "const mexem = [];" },
  { nome: "o recibo de cima continua prometendo o material depois de enviado (3b-3c, I1)", fonte: "js/orcamento-entrega.js", testes: ['docs/testes/orcamento-entrega.test.mjs'],
    de: "return !passo || passo === 'material' || passo === 'producao' ? padrao : LEAD_DEPOIS_DO_MATERIAL;", para: "return padrao;" },
  { nome: "quem volta pelo aviso \"A prévia está pronta\" cai no recibo e não na seção da prévia (3b-3c, I4)", fonte: "js/orcamento-restante.js", testes: ['docs/testes/orcamento-restante.test.mjs'],
    de: "previaAberta(E) ? 'o-previa' : 'o-pronto';", para: "previaAberta(E) ? 'o-pronto' : 'o-pronto';" },
  { nome: "aprovar aceita rodada_base que não é um inteiro (a forma do corpo não é conferida) (3b-3c, B1)", fonte: "api/_vendas/fluxo-previa.mjs", testes: ['docs/testes/previa-api.test.mjs'],
    de: "!ehUuid(corpo.conversa_id) || !Number.isInteger(corpo.rodada_base) || corpo.rodada_base < 0) throw", para: "!ehUuid(corpo.conversa_id)) throw" },
  { nome: "o dialog de aprovar fica aberto quando chega outra prévia (a pessoa confirma sem ver a nova) (3b-3c, B1)", fonte: "js/orcamento-previa.js", testes: ['docs/testes/orcamento-previa.test.mjs'],
    de: "if (mudou) { formAberto = false; fecharDialogo(); limparErro(); }", para: "if (mudou) { formAberto = false; limparErro(); }" },
  { nome: "o verificador deixa passar fonte de script fora da lista (3b-3c, B2)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: "(DIRETIVAS_POR_LISTA.includes(nome) ? !SCRIPT_PERMITIDAS.includes(t.toLowerCase()) : FONTE_ABERTA.test(t))", para: "FONTE_ABERTA.test(t)" },
  { nome: "o verificador apaga como comentário o que está entre dois globs (comentário de bloco em qualquer arquivo) (3b-3c, B3)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: "  if (/\\.ya?ml$/i.test(nome)) return semHashDeLinha(texto);", para: "  if (/\\.ya?ml$/i.test(nome)) return semComentarios(texto.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ''));" },
  { nome: "o verificador aceita a captação com regras diferentes das do site (3b-3c)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: "const igual = JSON.stringify(valor) === JSON.stringify(esperado);", para: "const igual = true;" },
  { nome: "o verificador esquece a migration da lista do painel, a 10ª (3b-3c)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: ", '20261024120400_pr3b3_lista.sql',\n  '20261028120000_aviso_no_ar_so_no_ar.sql'\n];", para: ", /* sem a lista */\n  '20261028120000_aviso_no_ar_so_no_ar.sql'\n];" },
  { nome: "o verificador esquece a migration do aviso \"no ar\" (a de 28/10)", fonte: "scripts/antes-de-ligar.mjs", testes: ['docs/testes/antes-de-ligar.test.mjs'],
    de: ",\n  '20261028120000_aviso_no_ar_so_no_ar.sql'\n];", para: "\n];" },
  { nome: "o servidor local liga a entrega mesmo com BZ_ENTREGA_LOCAL=desligada (3b-3c)", fonte: "docs/servidor.mjs", testes: ['docs/testes/interruptor.test.mjs'],
    de: "if (process.env.BZ_ENTREGA_LOCAL !== 'desligada') process.env.BZ_ENTREGA = 'ligada';", para: "process.env.BZ_ENTREGA = 'ligada';" },
  /* ---- 28/10: o aviso \"no ar\" só vale com o site no ar, e a fila de avisos traz o passo da entrega ---- */
  { nome: "o aviso \"no ar\" da suspensa volta à fila (oferece \"O seu site está no ar!\" com o site fora do ar)", arquivo: '20261028120000_aviso_no_ar_so_no_ar.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "e.aviso_no_ar_desde is not null and e.passo = 'no_ar'", para: "e.aviso_no_ar_desde is not null and e.passo in ('no_ar', 'suspensa')" },
  { nome: "o aviso \"no ar\" da encerrada e da concluída volta à fila", arquivo: '20261028120000_aviso_no_ar_so_no_ar.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    de: "e.aviso_no_ar_desde is not null and e.passo = 'no_ar'", para: "e.aviso_no_ar_desde is not null" },
  { nome: "a fila de avisos deixa de trazer o passo da entrega", arquivo: '20261028120000_aviso_no_ar_so_no_ar.sql', testes: ['docs/testes/previa-dono-banco.test.mjs', 'docs/testes/previa-painel.test.mjs'],
    de: "'momento', x.momento, 'passo', x.passo, 'desde'", para: "'momento', x.momento, 'desde'" },
  { nome: "a fila de avisos abre a função para o anon (privilégio da nova versão)", arquivo: '20261028120000_aviso_no_ar_so_no_ar.sql', testes: ['docs/testes/previa-dono-banco.test.mjs'],
    acrescentar: '\ngrant execute on function app.vendas_avisos_lista(jsonb) to anon;\n' },
  { nome: "o painel oferece o aviso \"no ar\" mesmo com a entrega fora do ar (segunda trava)", fonte: "js/painel-entregas.js", testes: ['docs/testes/painel-entregas.test.mjs'],
    de: "if (a.momento === 'no_ar' && a.passo !== 'no_ar') return null;", para: "/* sem a segunda trava */" },
  { nome: "o terminal manda avisar o \"site no ar\" com a entrega suspensa", fonte: "scripts/entregas-lib.mjs", testes: ['docs/testes/entregas-dono-previa.test.mjs'],
    de: "if (it.aviso_no_ar_pendente && it.passo === 'no_ar') a.push(", para: "if (it.aviso_no_ar_pendente) a.push(" },
];

/* as sabotagens que a rodada vai fazer: todas, ou só as do filtro (parte do nome, sem diferenciar maiúsculas). Filtro que não
   casa nenhuma devolve o erro: "0 de 0 sabotagens pegas" não prova nada */
export function escolherSabotagens(sabotagens, filtro = '') {
  const f = String(filtro).toLowerCase();
  const escolhidas = sabotagens.filter(s => s.nome.toLowerCase().includes(f));
  return { sabotagens: escolhidas, erro: f && !escolhidas.length ? 'o filtro "' + filtro + '" não casa com nenhuma sabotagem (nada foi testado)' : null };
}

/* os sinais em que o arquivo sabotado volta ao original antes de sair: Ctrl+C, o kill comum, o terminal que fecha
   (SIGHUP) e o Ctrl+Break do Windows (SIGBREAK) */
export const SINAIS_DE_SAIDA = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']);

/* o arquivo tem mudança fora do git? (null: sem git ou fora de um repositório; não dá para conferir) */
function gitLimpo(arquivo) {
  const r = spawnSync('git', ['diff', '--quiet', '--', arquivo], { cwd: RAIZ });
  if (r.error || (r.status !== 0 && r.status !== 1)) return null;
  return r.status === 0;
}

/* o que impede a partida: um arquivo "fonte" que já tem a sabotagem (sobra de uma rodada que morreu sem restaurar) ou que
   tem mudança fora do git. A cópia de segurança guardaria esse estado como o original */
export function problemasNaPartida(sabotagens, raiz = RAIZ, limpo = gitLimpo) {
  const problemas = [];
  for (const s of sabotagens.filter(x => x.fonte)) {
    const texto = fs.readFileSync(path.join(raiz, s.fonte), 'utf8').replace(/\r\n/g, '\n');
    if (texto.includes(s.para) && !texto.includes(s.de)) problemas.push(s.fonte + ' já está sabotado ("' + s.para + '"): restaure com git checkout -- ' + s.fonte);
    else if (limpo(s.fonte) === false) problemas.push(s.fonte + ' tem mudança fora do git: faça o commit (ou desfaça) antes de rodar a mutação');
  }
  return problemas;
}

function rodar() {
  const problemas = problemasNaPartida(SABOTAGENS);
  if (problemas.length) {
    for (const p of problemas) console.log('RECUSADO: ' + p);
    process.exitCode = 2;
    return;
  }
  /* o arquivo de código sabotado no lugar volta ao que era, aconteça o que acontecer */
  const restauracoes = new Map();
  const restaurar = () => { for (const [caminho, original] of restauracoes) fs.writeFileSync(caminho, original); restauracoes.clear(); };
  process.on('exit', restaurar);
  for (const sinal of SINAIS_DE_SAIDA) if (os.constants.signals[sinal] !== undefined) process.on(sinal, () => { restaurar(); process.exit(130); });

  /* BZ_MUTACAO_FILTRO: roda só as sabotagens cujo nome contém o texto (para conferir uma sabotagem nova sem rodar todas).
     Filtro que não casa nenhuma é ERRO, não "0 de 0" com sucesso (uma variável esquecida no ambiente parece rodada completa) */
  const filtro = process.env.BZ_MUTACAO_FILTRO || '';
  const { sabotagens: rodadas, erro } = escolherSabotagens(SABOTAGENS, filtro);
  if (filtro) console.log('FILTRO ATIVO: "' + filtro + '" escolheu ' + rodadas.length + ' de ' + SABOTAGENS.length + ' sabotagens');
  if (erro) { console.log('ERRO: ' + erro); process.exitCode = 1; return; }
  let pegas = 0;
  for (const s of rodadas) {
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
  console.log(pegas + ' de ' + rodadas.length + ' sabotagens pegas pelos testes');
  if (pegas < rodadas.length) process.exitCode = 1;
}

/* só roda chamado direto (node docs/testes/mutacao.mjs); importado pelo teste, nada é sabotado */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) rodar();

