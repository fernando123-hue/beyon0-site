-- ==========================================================================
-- O VIGIA DO SITE (spec docs/superpowers/specs/2026-11-15-auto-reparo-design.md, D2).
-- O cron horário do Worker confere o site sem chamar IA e avisa o dono por e-mail sem repetir o mesmo aviso toda hora.
-- Esta migration guarda a MEMÓRIA do vigia (o que está quebrado desde quando e quando foi avisado) e junta numa leitura
-- só os números que ele confere: falhas da IA nas conversas reais (app.ia_chamadas), a última reconciliação de
-- pagamentos, a última rotina diária e os alertas urgentes abertos. Sem dado pessoal: só item, datas e contagens.
-- Só acréscimo (uma tabela e duas funções); só service_role. Uma organização só (o site da Beyon): app.vigia,
-- app.pagamentos_auditoria e app.rotinas_execucoes não têm org_id; com mais de uma organização, a leitura precisa de filtro.
-- ==========================================================================
create table app.vigia (
  item        text primary key check (item in ('estreia', 'paginas', 'configuracao', 'pagamentos', 'rotina_diaria',
                                               'alertas_urgentes', 'ia_falhando', 'ia_conta')),
  ativo       boolean not null default false,
  desde       timestamptz,
  avisado_em  timestamptz,
  detalhe     text check (char_length(detalhe) <= 300),   -- o texto avisado: se mudar (ex.: de 1 para 5 alertas), é novidade
  updated_at  timestamptz not null default now()
);
revoke all on app.vigia from public, anon, authenticated, service_role;
alter table app.vigia enable row level security;   -- (sem política: só as funções abaixo, security definer, leem e gravam)

-- a leitura da ronda: o estado guardado e os números de agora, numa chamada (o vigia gasta poucos subpedidos)
create function app.rotinas_vigia_ler(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_dia date := (now() at time zone 'America/Sao_Paulo')::date; r jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if v_org is null then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;

  select jsonb_build_object(
    'estado', coalesce((select jsonb_object_agg(item, jsonb_build_object('ativo', ativo, 'desde', desde, 'avisado_em', avisado_em, 'detalhe', detalhe)) from app.vigia), '{}'::jsonb),
    'estreia_em', (select desde from app.vigia where item = 'estreia'),
    'falhas_ia_hora', count(*) filter (where erro in ('tempo', 'limite', 'falha') and created_at > now() - interval '1 hour'),
    'conversas_falha_hora', count(distinct conversa_id) filter (where erro in ('tempo', 'limite', 'falha') and created_at > now() - interval '1 hour'),
    'ultima_falha_conta_em', max(created_at) filter (where erro = 'indisponivel'),
    'ultima_ok_ia_em', max(created_at) filter (where erro is null),
    'ultima_falha_ia_em', max(created_at) filter (where erro in ('tempo', 'limite', 'falha')),
    'ultima_reconciliacao_em', (select max(created_at) from app.pagamentos_auditoria where evento = 'payment.reconciled'),
    'ultima_diaria_em', (select max(updated_at) from app.rotinas_execucoes where rotina = 'diaria'),
    'urgentes', (select count(*) from app.alertas where org_id = v_org and nivel = 'urgente' and resolvido_em is null and dia > v_dia - 7))
  into r
  -- (30 dias: a tabela só cresce e a leitura roda de hora em hora; o índice ia_chamadas_org cobre o intervalo. Sem chamada nenhuma
  --  em 30 dias, a última falha de conta sai da janela e o item volta: aceito, é um site parado há um mês)
  from app.ia_chamadas where org_id = v_org and created_at > now() - interval '30 days';
  return r;
end $$;

-- a gravação do estado depois da ronda (e depois do e-mail: o que não saiu não fica "avisado")
create function app.rotinas_vigia_gravar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_n integer := 0;
begin
  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') not between 1 and 20 then
    raise exception 'itens inválidos' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p -> 'itens') loop
    if coalesce(v_item ->> 'item', '') not in ('estreia', 'paginas', 'configuracao', 'pagamentos', 'rotina_diaria',
                                               'alertas_urgentes', 'ia_falhando', 'ia_conta')
       or jsonb_typeof(v_item -> 'ativo') is distinct from 'boolean' then
      raise exception 'item inválido' using errcode = '22023';
    end if;
    insert into app.vigia (item, ativo, desde, avisado_em, detalhe, updated_at)
    values (v_item ->> 'item', (v_item ->> 'ativo')::boolean, (v_item ->> 'desde')::timestamptz, (v_item ->> 'avisado_em')::timestamptz, v_item ->> 'detalhe', now())
    on conflict (item) do update set ativo = excluded.ativo, desde = excluded.desde, avisado_em = excluded.avisado_em, detalhe = excluded.detalhe, updated_at = now();
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('gravados', v_n);
end $$;

revoke all on function app.rotinas_vigia_ler(jsonb) from public, anon, authenticated;
revoke all on function app.rotinas_vigia_gravar(jsonb) from public, anon, authenticated;
grant execute on function app.rotinas_vigia_ler(jsonb) to service_role;
grant execute on function app.rotinas_vigia_gravar(jsonb) to service_role;
