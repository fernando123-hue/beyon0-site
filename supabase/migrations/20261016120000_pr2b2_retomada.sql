-- ==========================================================================
-- ORÇAMENTO SEM IA, PR 2b-2 (spec docs/specs/2026-10-11-orcamento-sem-ia.md §3, "Espera útil"):
-- • o LINK DE RETOMADA: o aviso de "prontos" leva um código de uso único que reabre o pedido em qualquer aparelho.
--   Guardado só como hash (SHA-256, feito no servidor), com validade, um valendo por vez; usar = a conversa passa
--   para o visitante anônimo do aparelho novo (o antigo perde o acesso). Só para pedido confirmado e nas etapas do
--   pedido (gerando → escopo): no pagamento, o Pix está no aparelho de quem pagou e não muda de dono por link.
-- • o LEMBRETE de 2 dias depois do aviso (envio manual pelo dono): pedidos confirmados, as três avisadas, ainda sem
--   escolha, uma vez só (app.pedidos.lembrete_em).
-- • o estado passa a trazer a data da confirmação do pedido (a tela calcula "prontos até <data>").
-- ORDEM DE TRAVAS: a conversa SEMPRE antes da retomada (criar e usar), para as duas não esperarem uma pela outra.
-- O dono aplica esta migration no banco real antes de promover o código do PR 2b-2.
-- ==========================================================================

alter table app.eventos_funil drop constraint eventos_funil_tipo_check;
alter table app.eventos_funil add constraint eventos_funil_tipo_check check (tipo in (
  'conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado',
  'direcoes_solicitadas', 'direcoes_prontas', 'direcoes_falharam', 'direcao_escolhida',
  'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado',
  'pagamento_confirmado', 'ia_falhou', 'tentativa_bloqueada', 'freio_ip',
  'respostas_formulario', 'confirmacao_whatsapp', 'pedido_expirado', 'pedido_descartado',
  'retomada_criada', 'retomada_usada', 'lembrete_enviado'));

create table app.retomadas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references app.organizacoes (id) on delete cascade,
  conversa_id  uuid not null,
  codigo_hash  text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  expira_em    timestamptz not null,
  usada_em     timestamptz,
  created_at   timestamptz not null default now(),
  foreign key (org_id, conversa_id) references app.conversas (org_id, id) on delete cascade
);
create index retomadas_conversa on app.retomadas (conversa_id, created_at desc);
alter table app.retomadas enable row level security;   -- (sem política: só as funções do backend leem e escrevem)
revoke all on app.retomadas from public, anon, authenticated;

alter table app.pedidos add column lembrete_em timestamptz;   -- o dono mandou o lembrete de 2 dias (uma vez)

-- as etapas em que o pedido pode ser retomado por link (do "na fila" ao resumo)
create function privado.etapa_retomavel(p_etapa text) returns boolean
language sql immutable set search_path = '' as $$
  select p_etapa in ('gerando', 'direcoes', 'escolhida', 'alteracoes', 'escopo');
$$;

create function app.vendas_criar_retomada(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_dias integer; v_expira timestamptz;
begin
  if coalesce(p ->> 'codigo_hash', '') !~ '^[0-9a-f]{64}$' or coalesce(p ->> 'dias', '') !~ '^[0-9]{1,2}$' then
    raise exception 'retomada: parâmetros inválidos' using errcode = '22023';
  end if;
  v_dias := (p ->> 'dias')::integer;
  if v_dias not between 1 and 14 then raise exception 'retomada: validade inválida' using errcode = '22023'; end if;
  select cv.* into c from app.conversas cv join app.organizacoes o on o.id = cv.org_id
   where cv.id = (p ->> 'conversa_id')::uuid and o.slug = p ->> 'org_slug'
   for update of cv;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  if not privado.etapa_retomavel(c.etapa)
     or not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    raise exception 'retomada: só para pedido confirmado, nas etapas do pedido' using errcode = '55000';
  end if;
  -- um link valendo por vez: o novo apaga os que não foram usados
  delete from app.retomadas where conversa_id = c.id and usada_em is null;
  v_expira := now() + make_interval(days => v_dias);
  insert into app.retomadas (org_id, conversa_id, codigo_hash, expira_em) values (c.org_id, c.id, p ->> 'codigo_hash', v_expira);
  perform privado.evento(c.org_id, c.id, 'retomada_criada');
  return jsonb_build_object('expira_em', v_expira);
end $$;

create function app.vendas_usar_retomada(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_conversa uuid; c app.conversas; r app.retomadas; v_vid uuid;
begin
  if coalesce(p ->> 'codigo_hash', '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false); end if;
  v_vid := (p ->> 'visitante_id')::uuid;
  -- 1º a conversa (sem trava, só para saber qual), depois a trava da conversa, depois a da retomada: a mesma ordem do criar
  select rt.conversa_id into v_conversa from app.retomadas rt join app.organizacoes o on o.id = rt.org_id
   where rt.codigo_hash = p ->> 'codigo_hash' and o.slug = p ->> 'org_slug';
  if not found then return jsonb_build_object('ok', false); end if;
  select * into c from app.conversas where id = v_conversa for update;
  select * into r from app.retomadas where codigo_hash = p ->> 'codigo_hash' and conversa_id = v_conversa for update;
  if not found or r.usada_em is not null or r.expira_em <= now() or not privado.etapa_retomavel(c.etapa)
     or not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    return jsonb_build_object('ok', false);
  end if;
  update app.retomadas set usada_em = now() where id = r.id;
  update app.conversas set visitante_id = v_vid, ultima_atividade = now() where id = c.id;
  -- (a escolha guarda quem escolheu; se o visitante antigo for apagado um dia (limpeza de anônimos, pedido da LGPD), a cascata levaria a escolha junto)
  update app.escolhas set visitante_id = v_vid where conversa_id = c.id;
  perform privado.evento(c.org_id, c.id, 'retomada_usada');
  return jsonb_build_object('ok', true, 'conversa_id', c.id);
end $$;

create function app.vendas_lembretes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_dias integer := coalesce(nullif(p ->> 'dias', '')::integer, 2); v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with ult as (
    select c.id as conversa_id, pd.codigo, l.nome, l.telefone, l.email,
           max(d.avisada_em) as avisado_em,
           bool_and(d.status = 'pronta' and d.avisada_em is not null) as todas_avisadas
      from app.pedidos pd
      join app.conversas c on c.id = pd.conversa_id
      join app.direcoes d on d.conversa_id = c.id
       and d.geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id)
      left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id
     where pd.org_id = v_org and pd.status = 'confirmado' and pd.lembrete_em is null and c.etapa = 'direcoes'
     group by c.id, pd.id, l.nome, l.telefone, l.email
  )
  select coalesce(jsonb_agg(jsonb_build_object('conversa_id', conversa_id, 'codigo', codigo, 'avisado_em', avisado_em,
           'contato', jsonb_build_object('nome', nome, 'telefone', telefone, 'email', email)) order by avisado_em), '[]'::jsonb)
    into v_itens
    from ult where todas_avisadas and avisado_em <= now() - make_interval(days => v_dias);
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

create function app.vendas_marcar_lembrete(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pd app.pedidos;
begin
  update app.pedidos x set lembrete_em = now()
    from app.organizacoes o
   where o.id = x.org_id and o.slug = p ->> 'org_slug' and x.conversa_id = (p ->> 'conversa_id')::uuid
     and x.status = 'confirmado' and x.lembrete_em is null
  returning x.* into pd;
  if not found then return jsonb_build_object('lembrados', 0); end if;
  perform privado.evento(pd.org_id, pd.conversa_id, 'lembrete_enviado');
  return jsonb_build_object('lembrados', 1);
end $$;

-- ---------- o estado: o pedido traz também a data da confirmação (troca a de 20261013120000_pedidos.sql) ----------
create or replace function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_conversa uuid;
begin
  r := app.vendas_estado_base(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  v_conversa := (r #>> '{conversa,id}')::uuid;
  return r || jsonb_build_object(
    'pedido', (select jsonb_build_object('codigo', pd.codigo, 'expira_em', pd.expira_em, 'confirmado_em', pd.confirmado_em,
                 'status', case when pd.status = 'aguardando' and pd.expira_em <= now() then 'expirado' else pd.status end)
               from app.pedidos pd where pd.conversa_id = v_conversa),
    'fila_confirmados', (select count(*)::integer from app.pedidos pd
                         where pd.org_id = (select c.org_id from app.conversas c where c.id = v_conversa)
                           and privado.pedido_na_fila(pd)));
end $$;

-- ---------- quem chama ----------
do $$
declare f text;
begin
  foreach f in array array['vendas_criar_retomada', 'vendas_usar_retomada', 'vendas_lembretes', 'vendas_marcar_lembrete'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
revoke all on function privado.etapa_retomavel(text) from public, anon, authenticated;
