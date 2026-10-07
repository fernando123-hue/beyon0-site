-- ==========================================================================
-- P0 DA AUDITORIA DO HARNESS (06 Operação/Auditoria do Harness — 2026-10-07.md)
-- Só substitui o que tinha furo verificado; o resto das funções fica como está.
--   1. Troca de direção depois do 1º ajuste: gerar de novo a partir de
--      "alteracoes" reabria a escolha, e o escopo descrevia os ajustes da
--      direção A enquanto a proposta gravava a B. Agora: nova geração só antes
--      do 1º ajuste; só se escolhe direção da geração ATUAL; e o ajuste grava
--      só se a escolha não mudou enquanto o modelo traduzia (corrida
--      "alterar" × "escolher").
--   2. Ajuste e preço juntos: a estimativa nova (escopo mudou) e o ajuste
--      entram na MESMA transação (antes eram duas chamadas: uma podia ficar
--      sem a outra).
--   3. Prova de consentimento: informar o contato de novo reescrevia a data do
--      1º aceite. Agora a data do 1º aceite fica.
--   4. Custo: o que é somado fora do turno (geração, ajuste, falhas) marca a
--      atividade do dia, senão escapava do teto DIÁRIO.
--   5. Abuso do teto diário (global): conversas que USAM a IA por IP por dia
--      têm limite, contado no banco (vale entre instâncias da função). O banco
--      recebe só um HMAC do IP feito no servidor com segredo de ambiente e a
--      data do dia: sem o segredo, o banco não volta ao IP. Apagado em 2 dias
--      pela rotina diária. Recarregar a página sem conversar não gasta a cota.
-- ==========================================================================

-- ---------- 1a. nova geração só ANTES do 1º ajuste ----------
create or replace function app.vendas_iniciar_geracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_geracao integer; v_max integer := coalesce((p ->> 'max_geracoes')::integer, 3);
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if c.lead_id is null then raise exception 'informe o contato antes de gerar as direções' using errcode = '55000'; end if;
  if not exists (select 1 from app.estimativas e where e.conversa_id = c.id) then
    raise exception 'a estimativa vem antes das direções' using errcode = '55000';
  end if;
  -- uma geração em andamento: devolve a mesma
  select geracao into v_geracao from app.direcoes where conversa_id = c.id and status = 'gerando' order by geracao desc limit 1;
  if found then
    return jsonb_build_object('geracao', v_geracao, 'nova', false,
      'direcoes', (select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'estrategia', estrategia) order by numero) from app.direcoes where conversa_id = c.id and geracao = v_geracao));
  end if;
  -- (sem "alteracoes": os ajustes são da direção escolhida; gerar de novo depois deles reabria a troca)
  perform privado.exigir_etapa(c, array['contato', 'estimativa', 'direcoes', 'escolhida']);
  select coalesce(max(geracao), 0) + 1 into v_geracao from app.direcoes where conversa_id = c.id;
  if v_geracao > v_max then raise exception 'limite de gerações desta conversa atingido' using errcode = '23514'; end if;
  insert into app.direcoes (org_id, conversa_id, geracao, numero, estrategia)
  values (c.org_id, c.id, v_geracao, 1, 'conversao'), (c.org_id, c.id, v_geracao, 2, 'autoridade'), (c.org_id, c.id, v_geracao, 3, 'experiencia');
  update app.conversas set etapa = 'gerando', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'direcoes_solicitadas', jsonb_build_object('geracao', v_geracao));
  return jsonb_build_object('geracao', v_geracao, 'nova', true,
    'direcoes', (select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'estrategia', estrategia) order by numero) from app.direcoes where conversa_id = c.id and geracao = v_geracao));
end $$;

-- ---------- 1b. só se escolhe direção da geração atual (a tela só mostra a atual; a API agora também) ----------
create or replace function app.vendas_escolher(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; d app.direcoes;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  -- trocar de direção só ANTES do 1º ajuste: os ajustes são sobre a direção escolhida (senão o escopo descreve outra)
  perform privado.exigir_etapa(c, array['direcoes', 'escolhida']);
  select * into d from app.direcoes
  where id = (p ->> 'direcao_id')::uuid and conversa_id = c.id and status = 'pronta'
    and geracao = (select max(x.geracao) from app.direcoes x where x.conversa_id = c.id);
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  insert into app.escolhas (org_id, conversa_id, direcao_id, visitante_id, lead_id, geracao)
  values (c.org_id, c.id, d.id, c.visitante_id, c.lead_id, d.geracao);
  update app.conversas set etapa = 'escolhida', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'direcao_escolhida', jsonb_build_object('numero', d.numero, 'estrategia', d.estrategia, 'geracao', d.geracao));
  return jsonb_build_object('direcao_id', d.id);
end $$;

-- ---------- 1c + 2. o ajuste: só sobre a direção que o servidor leu, e com a estimativa nova na mesma transação ----------
create or replace function app.vendas_registrar_alteracao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_escolhida uuid; v_id uuid; v_status text;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['escolhida', 'alteracoes']);
  select direcao_id into v_escolhida from app.escolhas where conversa_id = c.id order by created_at desc limit 1;
  -- o ajuste foi montado sobre a direção que o servidor leu antes de chamar o modelo: se outra foi escolhida no meio, recusa
  if p ? 'direcao_id' and (p ->> 'direcao_id')::uuid is distinct from v_escolhida then
    raise exception 'a direção escolhida mudou durante o ajuste' using errcode = '40001';
  end if;
  -- o escopo mudou: a estimativa nova entra JUNTO (o mesmo caminho e as mesmas regras de vendas_registrar_estimativa)
  if jsonb_typeof(p -> 'estimativa') = 'object' then
    perform app.vendas_registrar_estimativa((p -> 'estimativa') || jsonb_build_object('conversa_id', c.id, 'visitante_id', c.visitante_id));
  end if;
  v_status := case when jsonb_typeof(p -> 'resultado') = 'object' then 'aplicada' else 'recusada' end;
  insert into app.alteracoes (org_id, conversa_id, direcao_id, pedido, mudancas, status, resultado)
  values (c.org_id, c.id, v_escolhida, p ->> 'pedido', coalesce(p -> 'mudancas', '[]'), v_status,
          case when v_status = 'aplicada' then p -> 'resultado' end)
  returning id into v_id;
  update app.conversas set etapa = 'alteracoes', ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'alteracao_pedida', jsonb_build_object('mudancas', jsonb_array_length(coalesce(p -> 'mudancas', '[]')), 'status', v_status));
  return jsonb_build_object('alteracao_id', v_id, 'status', v_status);
end $$;

-- ---------- 3. o contato: a data do 1º aceite é a prova do consentimento e não é reescrita ----------
create or replace function app.vendas_informar_contato(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_lead uuid;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if coalesce((p ->> 'aceite')::boolean, false) is not true then raise exception 'aceite necessário' using errcode = '22023'; end if;
  if c.lead_id is null then
    insert into app.leads (org_id, nome, email, telefone, interesse, status, origem_meio, origem_fonte, campanha, termo, codigo_visita)
    values (c.org_id, nullif(p ->> 'nome', ''), nullif(p ->> 'email', ''), nullif(p ->> 'telefone', ''), 'site', 'em_conversa',
            case when c.origem_meio in ('anuncio', 'busca', 'social', 'mensagem', 'email', 'referencia', 'direto') then c.origem_meio else 'outro' end,
            c.origem_fonte, c.campanha, c.termo,
            -- o código da visita é único por organização: se outro lead já tem, este fica sem
            case when c.codigo_visita is not null and not exists (select 1 from app.leads l where l.org_id = c.org_id and l.codigo_visita = c.codigo_visita)
                 then c.codigo_visita end)
    returning id into v_lead;
  else
    update app.leads set nome = coalesce(nullif(p ->> 'nome', ''), nome), email = coalesce(nullif(p ->> 'email', ''), email),
                         telefone = coalesce(nullif(p ->> 'telefone', ''), telefone)
    where id = c.lead_id returning id into v_lead;
  end if;
  update app.conversas set lead_id = v_lead, etapa = case when etapa in ('descoberta', 'estimativa') then 'contato' else etapa end,
                           contato_aceite_em = coalesce(contato_aceite_em, now()), ultima_atividade = now() where id = c.id;
  perform privado.evento(c.org_id, c.id, 'contato_informado');
  return jsonb_build_object('lead_id', v_lead);
end $$;

-- ---------- 4. custo somado fora do turno também marca a atividade do dia (o teto diário soma as conversas ativas hoje) ----------
create or replace function app.vendas_somar_custo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update app.conversas set custo_ia_usd = custo_ia_usd + greatest(0, coalesce((p ->> 'custo_usd')::numeric, 0)), ultima_atividade = now()
  where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 5. freio por IP, contado na 1ª vez que a conversa usa a IA ----------
alter table app.conversas add column ip_contado boolean not null default false;
alter table app.eventos_funil drop constraint eventos_funil_tipo_check;
alter table app.eventos_funil add constraint eventos_funil_tipo_check check (tipo in (
  'conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado',
  'direcoes_solicitadas', 'direcoes_prontas', 'direcoes_falharam', 'direcao_escolhida',
  'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado',
  'pagamento_confirmado', 'ia_falhou', 'tentativa_bloqueada', 'freio_ip'));

create table privado.freio_ip (
  dia   date not null,
  chave text not null check (chave ~ '^[0-9a-f]{64}$'),   -- HMAC-SHA256(segredo do servidor, dia|ip): o banco não volta ao IP
  n     integer not null default 0,
  primary key (dia, chave)
);
alter table privado.freio_ip enable row level security;   -- (sem política: ninguém lê por API; só as funções do dono)
revoke all on privado.freio_ip from public, anon, authenticated, service_role;

-- mais uma para a chave hoje (fuso de Brasília); devolve se ainda cabe. Atômico: insert … on conflict … returning
create function privado.contar_ip(p_chave text, p_max integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_dia date := (now() at time zone 'America/Sao_Paulo')::date; v_n integer;
begin
  insert into privado.freio_ip (dia, chave, n) values (v_dia, p_chave, 1)
  on conflict (dia, chave) do update set n = privado.freio_ip.n + 1
  returning n into v_n;
  return v_n <= p_max;
end $$;
revoke all on function privado.contar_ip(text, integer) from public, anon, authenticated, service_role;

-- a reserva da IA (UMA chamada por vez por conversa) passa a contar o IP na 1ª vez; passou do limite: não reserva,
-- devolve freio_ip e grava o evento (sem o IP) para o dono ver no funil
create or replace function app.vendas_reservar_ia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_chave text := p ->> 'chave_ip';
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- (FOR UPDATE)
  if c.ia_ate is not null and c.ia_ate > now() then raise exception 'outra resposta em andamento' using errcode = '55P03'; end if;
  if c.turnos >= coalesce((p ->> 'max_turnos')::integer, 40) then raise exception 'turnos esgotados' using errcode = '23514'; end if;
  if c.custo_ia_usd >= coalesce((p ->> 'teto_usd')::numeric, 1.5) then raise exception 'custo esgotado' using errcode = '23514'; end if;
  if not c.ip_contado and v_chave ~ '^[0-9a-f]{64}$' and (p ->> 'max_por_ip') is not null then
    if not privado.contar_ip(v_chave, (p ->> 'max_por_ip')::integer) then
      perform privado.evento(c.org_id, c.id, 'freio_ip');
      return jsonb_build_object('ok', false, 'freio_ip', true);
    end if;
    update app.conversas set ip_contado = true where id = c.id;
  end if;
  update app.conversas set ia_ate = now() + make_interval(secs => least(300, greatest(30, coalesce((p ->> 'segundos')::integer, 120)))) where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

-- a retenção diária também apaga o freio de dias anteriores (não depende de haver tráfego)
create or replace function app.vendas_reter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dias integer := coalesce((p ->> 'dias')::integer, 90);
  v_conversas integer;
  v_mensagens integer;
  v_freio integer;
begin
  if v_dias < 30 then raise exception 'retenção mínima de 30 dias' using errcode = '22023'; end if;
  with velhas as (
    select id from app.conversas
    where ultima_atividade < now() - make_interval(days => v_dias)
      and etapa not in ('aguardando_pagamento', 'em_producao')
  ), apagadas as (
    delete from app.mensagens m using velhas v where m.conversa_id = v.id returning m.id
  )
  select count(*) into v_mensagens from apagadas;
  -- o pedido de ajuste também é texto do visitante
  update app.alteracoes a set pedido = '[apagado]'
  from app.conversas c
  where a.conversa_id = c.id and a.pedido <> '[apagado]'
    and c.ultima_atividade < now() - make_interval(days => v_dias) and c.etapa not in ('aguardando_pagamento', 'em_producao');
  update app.conversas set briefing = '{}'
  where ultima_atividade < now() - make_interval(days => v_dias)
    and etapa not in ('aguardando_pagamento', 'em_producao')
    and briefing <> '{}';
  get diagnostics v_conversas = row_count;
  delete from privado.freio_ip where dia < (now() at time zone 'America/Sao_Paulo')::date - 1;
  get diagnostics v_freio = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'briefings_esvaziados', v_conversas, 'dias', v_dias, 'freio_apagado', v_freio);
end $$;

-- (create or replace mantém as concessões; repetidas aqui para a migration se explicar sozinha)
do $$
declare f text;
begin
  foreach f in array array['vendas_iniciar_geracao', 'vendas_escolher', 'vendas_registrar_alteracao', 'vendas_informar_contato',
                           'vendas_somar_custo', 'vendas_reservar_ia', 'vendas_reter'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
