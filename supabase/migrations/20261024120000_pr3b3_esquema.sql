-- ==========================================================================
-- PR 3b-3 (spec docs/specs/2026-10-21-pr3b-vender-sozinho.md §2): DA PRÉVIA AO FIM. A entrega que a 3b-2 criou (material → producao)
-- ganha o resto do caminho: previa → (ajustes → previa)* → aprovada → no_ar → (suspensa) → concluida, e o fim por encerrada.
-- • D2: rodadas_max = 2 (a captação, max_rodadas). D5: a prévia só sai por ação do cliente (ajustes, aprovada) ou pelo encerrar do
--   painel; NENHUMA saída é de rotina (o teste previa-esquema.test.mjs prende a lista inteira).
-- • As transições continuam conferidas no banco (privado.transicoes_entrega + gatilho da 3b-2).
-- • Só as funções do backend escrevem aqui: service_role não tem privilégio nas tabelas.
-- Aplicar DEPOIS de 20261023120300_pr3b2_dono.sql.
-- ==========================================================================

alter table app.eventos_funil drop constraint eventos_funil_tipo_check;
alter table app.eventos_funil add constraint eventos_funil_tipo_check check (tipo in (
  'conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado',
  'direcoes_solicitadas', 'direcoes_prontas', 'direcoes_falharam', 'direcao_escolhida',
  'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado',
  'pagamento_confirmado', 'ia_falhou', 'tentativa_bloqueada', 'freio_ip',
  'respostas_formulario', 'confirmacao_whatsapp', 'pedido_expirado', 'pedido_descartado',
  'retomada_criada', 'retomada_usada', 'lembrete_enviado',
  'ajuste_desfeito', 'pedido_livre', 'pedido_livre_resolvido',
  'entrega_criada', 'material_salvo', 'material_arquivo', 'material_recusado', 'material_enviado',
  'material_importado', 'material_limpo', 'link_pedido_criado', 'link_pedido_usado', 'link_pedido_revogado',
  -- (3b-3) sem texto do cliente; e SEM "previa_sem_resposta": a D5 não tem esse evento
  'material_dispensado', 'previa_pronta', 'previa_ajustes', 'previa_aprovada', 'site_no_ar',
  'restante_iniciado', 'restante_pago', 'entrega_suspensa', 'entrega_encerrada', 'aviso_registrado'));

alter table app.entregas
  add column rodadas_usadas integer not null default 0 check (rodadas_usadas >= 0),
  add column rodadas_max integer default 2 check (rodadas_max is null or rodadas_max between 1 and 10),   -- nulo = sem limite: só o valor que o banco aceita, sem uso no orçamento (D2)
  add column previa_url text check (previa_url ~ '^https://v[0-9]{1,2}\.bz-c-[abcdefghjkmnpqrstuvwxyz23456789]{6}\.pages\.dev/?$'),   -- = URL_PREVIA da captação (clientes/esquema.mjs)
  add column previa_em timestamptz,
  add column aprovada_em timestamptz,
  add column site_url text check (site_url ~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/?$'),   -- (B4) domínio com ponto e TLD de letras: nada de localhost nem IP
  add column no_ar_em timestamptz,
  add column suspensa_em timestamptz,
  add column concluida_em timestamptz,
  add column encerrada_em timestamptz,
  add column encerrada_motivo text check (encerrada_motivo in ('desistencia', 'atraso', 'producao_manual', 'outro')),   -- lista fechada; nunca "sem resposta" (D5) e, desde 22/10, nunca "sem material": o pedido sem material fica PARADO, não se encerra
  add column aviso_previa_desde timestamptz,   -- a D1: há um aviso de "prévia pronta" para o dono mandar (nulo = nada pendente)
  add column aviso_no_ar_desde timestamptz,    -- a D1: há um aviso de "site no ar" para o dono mandar
  add column aviso_material_em timestamptz,   -- o aviso de material parado (dia 30 sem número autorizado): o dono avisou que aguarda o material e que o projeto fica PARADO; nada é publicado nem encerrado por isso (22/10)
  add column aviso_no_ar_feito_em timestamptz,   -- o dono REGISTROU o aviso "seu site está no ar": daqui contam os 3 dias do restante (22/10); nulo = a contagem não começou
  add column lembrete_restante_1_em timestamptz,   -- o lembrete do 2º dia (a mensagem pronta está no painel; o dono manda e registra)
  add column lembrete_restante_2_em timestamptz,   -- o último lembrete, no 3º dia
  add column religar_pendente boolean not null default false;   -- o restante caiu com o site suspenso: a produção (captação) religa e o dono marca "religado"

alter table app.materiais add column dispensado_em timestamptz;   -- o dono dispensou o material (dia 30, com a AUTORIZAÇÃO EXPRESSA do cliente: caixa marcada + número + UF): o pedido segue com as imagens do modelo, mas o site só vai ao ar depois de o cliente aprovar a prévia (D5)

-- a lista de ajustes do cliente (spec §2): fica FORA do resumo (o contrato) e não volta à tela.
-- O WhatsApp/telefone e o e-mail DO SITE (M3, 22/10) têm colunas PRÓPRIAS: o texto livre é redigido (telefone e e-mail viram marcador), estes campos são conferidos
-- (o mesmo formato da tela e do servidor, ESQ.WHATSAPP_SITE e ESQ.EMAIL_SITE) e só valem com a autorização de uso no site (a mesma do material, com a versão).
create table app.entrega_ajustes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references app.organizacoes (id) on delete cascade,
  entrega_id uuid not null references app.entregas (id) on delete cascade,
  rodada     integer not null check (rodada between 1 and 10),
  texto      text not null check (char_length(texto) between 0 and 1500),
  contato_whatsapp text check (contato_whatsapp ~ '^\+55[1-9][1-9](9[0-9]{8}|[2-8][0-9]{7})$'),   -- E.164 do Brasil: DDD + celular (9 e mais 8 dígitos) ou fixo (8 dígitos começando em 2 a 8)
  contato_email    text check (char_length(contato_email) <= 120 and char_length(split_part(contato_email, '@', 1)) <= 64
                               and contato_email ~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),   -- minúsculas, sem '..'
  contato_autorizado_em      timestamptz,
  contato_autorizacao_versao text check (char_length(contato_autorizacao_versao) between 1 and 20),
  status     text not null default 'na_fila' check (status in ('na_fila', 'feito')),
  created_at timestamptz not null default now(),
  feito_em   timestamptz,
  unique (entrega_id, rodada),
  check (char_length(texto) > 0 or contato_whatsapp is not null or contato_email is not null),   -- uma lista tem texto, contato do site, ou os dois: nunca vazia
  check ((contato_whatsapp is null and contato_email is null) or (contato_autorizado_em is not null and contato_autorizacao_versao is not null))   -- nada de contato no site sem a autorização de uso
);
alter table app.entrega_ajustes enable row level security;   -- (sem política: só as funções do backend leem e escrevem)
revoke all on app.entrega_ajustes from public, anon, authenticated, service_role;

-- ---------- as transições do passo (spec §2); a de material → producao ganha o dispensar ----------
update privado.transicoes_entrega set quem = 'vendas_material_enviar, vendas_material_dispensar' where de = 'material' and para = 'producao';
insert into privado.transicoes_entrega (de, para, quem) values
  ('producao', 'previa', 'vendas_previa_publicar'),
  ('ajustes', 'previa', 'vendas_previa_publicar'),
  ('previa', 'ajustes', 'vendas_previa_ajustes'),
  ('previa', 'aprovada', 'vendas_previa_aprovar'),   -- D5: só o cliente aprova; não existe aprovação automática
  ('aprovada', 'no_ar', 'vendas_no_ar'),
  ('no_ar', 'suspensa', 'vendas_suspender'),
  ('no_ar', 'concluida', 'privado.concluir_entrega (saldo pago)'),
  ('suspensa', 'concluida', 'privado.concluir_entrega (saldo pago)');
insert into privado.transicoes_entrega (de, para, quem)
select p, 'encerrada', 'vendas_encerrar' from unnest(array['material', 'producao', 'previa', 'ajustes', 'aprovada', 'no_ar', 'suspensa']) p;

-- a conversa encerra quando o restante cai ou o painel encerra o pedido
insert into privado.transicoes_conversa (de, para, quem) values ('em_producao', 'encerrada', 'privado.concluir_entrega, vendas_encerrar');
