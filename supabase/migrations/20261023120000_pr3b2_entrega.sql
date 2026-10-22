-- ==========================================================================
-- PR 3b-2 (spec docs/specs/2026-10-21-pr3b-vender-sozinho.md §2): A ENTREGA. Depois da entrada paga, o pedido vira uma
-- ENTREGA com passos conferidos no banco (como as etapas da conversa), um MATERIAL (os campos que o cliente preenche e
-- os arquivos) e o LINK DO PEDIDO (a volta ao pedido se o celular apagar o armazenamento).
-- • A entrega nasce de um GATILHO em app.pagamentos (sinal virou "pago"), dentro de um bloco que engole o erro: o
--   pagamento nunca falha por causa dela; app.vendas_estado conserta a que faltar (privado.garantir_entrega).
-- • Passos que existem neste PR: material → producao. Os outros valores já são aceitos pelo CHECK (a 3b-3 acrescenta
--   as transições em privado.transicoes_entrega).
-- • Só as funções do backend escrevem aqui: service_role não tem privilégio nas tabelas (como app.pagamentos).
-- • ORDEM DE TRAVAS: conversa → entrega → material → arquivos (privado.entrega_trava).
-- O dono aplica esta migration (e as três seguintes) no banco real antes de promover o código do PR 3b-2.
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
  'material_importado', 'material_limpo', 'link_pedido_criado', 'link_pedido_usado', 'link_pedido_revogado'));

create table app.entregas (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id      uuid not null,
  proposta_id      uuid not null,
  projeto_id       uuid,   -- preenchido na leitura (o gatilho roda antes de o projeto existir)
  passo            text not null default 'material' check (passo in ('material', 'producao', 'previa', 'ajustes', 'aprovada', 'no_ar', 'suspensa', 'concluida', 'encerrada')),
  prazo_dias       integer not null check (prazo_dias between 1 and 60),
  prazo            jsonb not null default '{}' check (jsonb_typeof(prazo) = 'object' and pg_column_size(prazo) <= 4096),
  entrega_ate      date,
  cliente_captacao text check (cliente_captacao ~ '^c-[abcdefghjkmnpqrstuvwxyz23456789]{6}$'),   -- o id do cliente na captação (chega no "importado")
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (conversa_id), unique (proposta_id), unique (org_id, id),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade,
  foreign key (org_id, proposta_id) references app.propostas (org_id, id) on delete cascade
);
create index entregas_org_passo on app.entregas (org_id, passo, created_at);

create table app.materiais (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references app.organizacoes (id) on delete cascade,
  entrega_id        uuid not null unique references app.entregas (id) on delete cascade,
  dados             jsonb not null default '{}' check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 32768),
  negocio           jsonb not null default '{}' check (jsonb_typeof(negocio) = 'object' and pg_column_size(negocio) <= 2048),
  autorizacao       jsonb not null default '{}' check (jsonb_typeof(autorizacao) = 'object' and pg_column_size(autorizacao) <= 4096),
  status            text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'importado', 'limpo')),
  primeiro_salvo_em timestamptz, enviado_em timestamptz, importado_em timestamptz, limpo_em timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table app.material_arquivos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references app.organizacoes (id) on delete cascade,
  entrega_id        uuid not null references app.entregas (id) on delete cascade,
  papel             text not null check (papel in ('logo', 'foto')),
  ordem             integer not null check (ordem between 1 and 60),
  caminho           text not null unique check (caminho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  tipo_declarado    text not null check (tipo_declarado in ('image/png', 'image/jpeg', 'image/webp')),
  tamanho_declarado bigint not null check (tamanho_declarado between 1 and 10485760),
  tipo_real         text check (tipo_real in ('png', 'jpg', 'webp')),
  tamanho_real      bigint check (tamanho_real >= 0),
  status            text not null default 'reservado' check (status in ('reservado', 'conferido', 'recusado', 'removido')),
  motivo            text check (char_length(motivo) <= 40),
  created_at        timestamptz not null default now(),
  conferido_em      timestamptz,
  removido_em       timestamptz
);
create index material_arquivos_entrega on app.material_arquivos (entrega_id, status);
create unique index material_arquivos_uma_logo on app.material_arquivos (entrega_id) where papel = 'logo' and status in ('reservado', 'conferido');

-- o link do pedido (spec §1 e §8): hash do código, um vivo por conversa, fixo durante o pedido
create table app.links_pedido (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id       uuid not null,
  codigo_hash       text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  valido_ate        timestamptz not null,
  ultimo_uso_em     timestamptz,
  revogado_em       timestamptz,
  fim_em            timestamptz,   -- o pedido acabou (privado.encerrar_links_do_pedido): daqui em diante o uso não renova mais a validade
  motivo_revogacao  text check (motivo_revogacao in ('novo_a_pedido', 'sair_do_aparelho', 'fim_do_pedido')),
  created_at        timestamptz not null default now(),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade,
  check ((revogado_em is null) = (motivo_revogacao is null))
);
create unique index links_pedido_um_vivo on app.links_pedido (conversa_id) where revogado_em is null;

do $$
declare t text;
begin
  foreach t in array array['entregas', 'materiais', 'material_arquivos', 'links_pedido'] loop
    execute format('alter table app.%I enable row level security', t);   -- (sem política: só as funções do backend leem e escrevem)
    execute format('revoke all on app.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

-- ---------- as transições do passo (documentação viva + rede de baixo) ----------
create table privado.transicoes_entrega (
  de   text not null,
  para text not null,
  quem text not null,
  primary key (de, para)
);
alter table privado.transicoes_entrega enable row level security;
revoke all on privado.transicoes_entrega from public, anon, authenticated, service_role;
insert into privado.transicoes_entrega (de, para, quem) values ('material', 'producao', 'vendas_material_enviar');

create function privado.conferir_transicao_entrega() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- (a licença só vale numa conexão SQL do dono, sem usuário do Auth: como privado.conferir_transicao)
  if coalesce(current_setting('bz.transicao_livre', true), '') = 'on' and auth.uid() is null then return new; end if;
  if not exists (select 1 from privado.transicoes_entrega t where t.de = old.passo and t.para = new.passo) then
    raise exception 'transição de passo não permitida: % → %', old.passo, new.passo using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function privado.conferir_transicao_entrega() from public, anon, authenticated, service_role;
create trigger entregas_transicao before update of passo on app.entregas
for each row when (old.passo is distinct from new.passo) execute function privado.conferir_transicao_entrega();

-- ---------- a criação: idempotente, pelo sinal pago ----------
create function privado.criar_entrega(p_proposta uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pr app.propostas; pg app.pagamentos; v_id uuid;
begin
  select * into pr from app.propostas where id = p_proposta and conversa_id is not null;
  if not found then return null; end if;
  select * into pg from app.pagamentos where proposta_id = pr.id and parcela = 'sinal' and status in ('pago', 'contestado') and pago_em is not null order by pago_em limit 1;
  if not found then return null; end if;
  insert into app.entregas (org_id, conversa_id, proposta_id, projeto_id, prazo_dias, prazo)
  values (pr.org_id, pr.conversa_id, pr.id, pr.projeto_id, greatest(1, least(60, coalesce(pr.prazo_dias, 10))),
          jsonb_build_object('entrada_em', to_char(pg.pago_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))   -- (UTC: o -04:00 é do JS, que lê o deslocamento real do fuso)
  on conflict do nothing   -- (sem alvo: cobre o unique da proposta E o da conversa)
  returning id into v_id;
  if v_id is not null then
    insert into app.materiais (org_id, entrega_id) values (pr.org_id, v_id);
    perform privado.evento(pr.org_id, pr.conversa_id, 'entrega_criada');
  end if;
  return v_id;
end $$;
revoke all on function privado.criar_entrega(uuid) from public, anon, authenticated, service_role;

create function privado.entrega_apos_pagamento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform privado.criar_entrega(new.proposta_id);
  exception when others then
    -- (o pagamento NUNCA falha por causa da entrega: app.vendas_estado conserta, privado.garantir_entrega)
    raise warning 'entrega não criada para a proposta %: %', new.proposta_id, sqlerrm;
    -- o erro também vai para a trilha de auditoria, onde o dono o vê (como o project.error de pagamentos_aplicar); a assinatura
    -- é a de privado.auditar_pagamento em 20261007130000_pagamentos.sql: confira os argumentos. Falhar aqui também não derruba nada
    begin
      perform privado.auditar_pagamento(new.org_id, new.id, null, 'project.error', 'sistema', null, 'operacao', null, null,
        jsonb_build_object('motivo', 'entrega não criada: ' || left(sqlerrm, 120), 'codigo', sqlstate), null);
    exception when others then null;
    end;
  end;
  return new;
end $$;
revoke all on function privado.entrega_apos_pagamento() from public, anon, authenticated, service_role;
create trigger pagamentos_entrega after update of status on app.pagamentos
for each row when (new.parcela = 'sinal' and new.status = 'pago' and old.status is distinct from 'pago')
execute function privado.entrega_apos_pagamento();

-- a leitura conserta o que faltar (a entrega que o gatilho não criou) e preenche o projeto
create function privado.garantir_entrega(p_conversa uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_prop uuid;
begin
  if exists (select 1 from app.entregas where conversa_id = p_conversa) then
    update app.entregas e set projeto_id = pr.projeto_id
      from app.propostas pr
     where pr.id = e.proposta_id and e.conversa_id = p_conversa and e.projeto_id is null and pr.projeto_id is not null;
    return;
  end if;
  select id into v_prop from app.propostas where conversa_id = p_conversa and status = 'aceita' order by versao desc limit 1;
  if v_prop is not null then perform privado.criar_entrega(v_prop); end if;
end $$;
revoke all on function privado.garantir_entrega(uuid) from public, anon, authenticated, service_role;

-- o sinal está PAGO? (estorno e contestação fecham a entrega: o cliente que desistiu não segue enviando material nem abrindo links)
create function privado.sinal_pago(p_proposta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.pagamentos where proposta_id = p_proposta and parcela = 'sinal' and status = 'pago');
$$;
revoke all on function privado.sinal_pago(uuid) from public, anon, authenticated, service_role;

-- ---------- a trava de toda ação do cliente: conversa → entrega (com o passo exigido) ----------
create function privado.entrega_trava(p_conversa uuid, p_visitante uuid, p_passos text[]) returns app.entregas
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; e app.entregas;
begin
  c := privado.conversa_do(p_conversa, p_visitante);   -- trava 1 (de outro visitante: P0002)
  perform privado.exigir_etapa(c, array['em_producao']);
  select * into e from app.entregas where conversa_id = c.id for update;   -- trava 2
  if not found then raise exception 'entrega não encontrada' using errcode = 'P0002'; end if;
  if not privado.sinal_pago(e.proposta_id) then raise exception 'o sinal não está pago (estornado ou contestado)' using errcode = '55000'; end if;
  if not e.passo = any (p_passos) then raise exception 'passo atual (%) não permite esta ação', e.passo using errcode = '55000'; end if;
  return e;
end $$;
revoke all on function privado.entrega_trava(uuid, uuid, text[]) from public, anon, authenticated, service_role;

-- ---------- o que a tela recebe ----------
create function privado.entrega_json(p_conversa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; pr app.propostas;
begin
  select * into e from app.entregas where conversa_id = p_conversa;
  if not found then return null; end if;
  select * into m from app.materiais where entrega_id = e.id;
  select * into pr from app.propostas where id = e.proposta_id;
  return jsonb_build_object(
    'id', e.id, 'passo', e.passo, 'prazo_dias', e.prazo_dias, 'entrega_ate', e.entrega_ate, 'prazo', e.prazo,
    'entrada_paga_em', e.prazo ->> 'entrada_em',
    'percentuais', jsonb_build_object('entrada', pr.sinal_percentual, 'restante', 100 - pr.sinal_percentual),
    'link_pedido', exists (select 1 from app.links_pedido l where l.conversa_id = p_conversa and l.revogado_em is null and l.valido_ate > now()),
    'material', jsonb_build_object('status', m.status, 'dados', m.dados, 'negocio', m.negocio, 'autorizacao', m.autorizacao,
      'enviado_em', m.enviado_em, 'updated_at', m.updated_at,
      'arquivos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'papel', a.papel, 'ordem', a.ordem,
                              'tamanho', coalesce(a.tamanho_real, a.tamanho_declarado), 'status', a.status) order by a.papel, a.ordem, a.created_at)
                              from app.material_arquivos a where a.entrega_id = e.id and a.status in ('reservado', 'conferido')), '[]'::jsonb)));
end $$;
revoke all on function privado.entrega_json(uuid) from public, anon, authenticated, service_role;

-- o estado: embrulha o de antes (a 3a) e acrescenta `entrega`
alter function app.vendas_estado(jsonb) rename to vendas_estado_pr3a;
revoke all on function app.vendas_estado_pr3a(jsonb) from public, anon, authenticated, service_role;
create function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_conversa uuid;
begin
  r := app.vendas_estado_pr3a(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  v_conversa := (r #>> '{conversa,id}')::uuid;
  if r #>> '{conversa,etapa}' = 'em_producao' then perform privado.garantir_entrega(v_conversa); end if;
  return r || jsonb_build_object('entrega', privado.entrega_json(v_conversa));
end $$;
revoke all on function app.vendas_estado(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_estado(jsonb) to service_role;

-- a retomada (PR 2b-2) passa a valer depois do pagamento: o aviso da D1 (prévia pronta, site no ar) leva o link
create or replace function privado.etapa_retomavel(p_etapa text) returns boolean
language sql immutable set search_path = '' as $$
  select p_etapa in ('gerando', 'direcoes', 'escolhida', 'alteracoes', 'escopo', 'em_producao');
$$;
