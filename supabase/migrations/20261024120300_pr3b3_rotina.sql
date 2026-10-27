-- ==========================================================================
-- PR 3b-3 (spec §2.1, §5, §10): OS ALARMES DE PRAZO na rotina diária que já existe (sem cron novo). Só CONTAGEM (o alerta do painel não leva dado pessoal;
-- o código do pedido aparece no `listar` do terminal). D5: nada aqui muda o passo de uma entrega; a prévia parada não gera alarme.
-- ==========================================================================
alter table app.alertas drop constraint alertas_tipo_check;
alter table app.alertas add constraint alertas_tipo_check check (tipo in (
  'pagamento_atencao', 'teto_ia', 'ia_falhando', 'freio_ip', 'rotina_falhou', 'prazo_vencido', 'material_30_dias', 'restante_3_dias'));

-- o que o JS conta (a regra de dias úteis e a pausa são do JS, uma regra só) + a retenção da lista de ajustes (spec §10: 30 dias depois da última atividade).
-- A lista que ainda está NA FILA nunca é apagada por idade (a produção deve a nova prévia); a de um pedido encerrado ou concluído, sim.
create function app.rotinas_entregas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_apagados integer; v_itens jsonb;
begin
  delete from app.entrega_ajustes a using app.entregas e
   where e.id = a.entrega_id and e.updated_at < now() - interval '30 days' and (a.status = 'feito' or e.passo in ('concluida', 'encerrada'));
  get diagnostics v_apagados = row_count;
  select coalesce(jsonb_agg(jsonb_build_object('passo', e.passo, 'prazo', e.prazo, 'prazo_dias', e.prazo_dias,
           'entrada_em', e.prazo ->> 'entrada_em', 'no_ar_em', e.no_ar_em, 'aviso_material_em', e.aviso_material_em, 'aviso_no_ar_feito_em', e.aviso_no_ar_feito_em)), '[]'::jsonb) into v_itens
    from (select * from app.entregas where passo in ('material', 'producao', 'ajustes', 'aprovada', 'no_ar') order by created_at limit 500) e;
  return jsonb_build_object('itens', v_itens, 'ajustes_apagados', v_apagados);
end $$;
revoke all on function app.rotinas_entregas(jsonb) from public, anon, authenticated;
grant execute on function app.rotinas_entregas(jsonb) to service_role;

-- a conferência do dia: a de 20261008120300_rotinas_alertas.sql com os três alertas das entregas (contagens que o JS passa em p.entregas)
create or replace function app.rotinas_conferir(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_atencao integer; v_custo numeric; v_teto numeric := coalesce((p ->> 'teto_dia_usd')::numeric, 25);
  v_falhas integer; v_freios integer; v_falhou text := nullif(p ->> 'falha', '');
  v_avisado boolean;
  v_ent jsonb := case when jsonb_typeof(p -> 'entregas') = 'object' then p -> 'entregas' else '{}'::jsonb end;
  v_prazo integer := coalesce((v_ent ->> 'prazo_vencido')::integer, 0);
  v_mat integer := coalesce((v_ent ->> 'material_30')::integer, 0);
  v_resto integer := coalesce((v_ent ->> 'restante_vencido')::integer, 0);
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if v_org is null then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;

  select coalesce((app.pagamentos_atencao('{"horas": 24}'::jsonb) ->> 'total')::integer, 0) into v_atencao;
  select coalesce(sum(custo_usd), 0) into v_custo from app.ia_chamadas where org_id = v_org and created_at > now() - interval '24 hours';
  select count(*) into v_falhas from app.ia_chamadas where org_id = v_org and erro in ('tempo', 'limite', 'indisponivel', 'falha')
    and created_at > now() - interval '24 hours';
  select count(*) into v_freios from app.eventos_funil where org_id = v_org and tipo = 'freio_ip' and created_at > now() - interval '24 hours';

  if v_atencao > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'pagamento_atencao', 'urgente',
      v_atencao || ' evento(s) de pagamento pedem uma pessoa nas últimas 24 h (divergência, estorno, contestação ou projeto pausado).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_custo >= 0.8 * v_teto then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'teto_ia', case when v_custo >= v_teto then 'urgente' else 'aviso' end,
      'Gasto de IA nas últimas 24 h: US$ ' || replace(round(v_custo, 2)::text, '.', ',') || ' (teto do dia: US$ ' || replace(v_teto::text, '.', ',') || '; no teto, o agente para e oferece o WhatsApp).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_falhas >= coalesce((p ->> 'max_falhas_ia')::integer, 5) then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'ia_falhando', 'aviso',
      v_falhas || ' chamada(s) de IA falharam nas últimas 24 h (veja app.ia_chamadas).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_freios > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'freio_ip', 'aviso',
      v_freios || ' conversa(s) barradas pelo limite diário por endereço (abuso ou muita gente na mesma rede).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_falhou is not null then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'rotina_falhou', 'urgente',
      'A rotina diária falhou em: ' || left(v_falhou, 200))
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  -- (PR 3b-3, D4) os prazos da entrega: só contagem; o dono vê os pedidos com `node scripts/entregas.mjs listar`
  if v_prazo > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'prazo_vencido', 'urgente',
      v_prazo || ' entrega(s) com o prazo vencido: a regra da D4 devolve a entrada se a Beyon atrasar. Veja "entregas.mjs listar".')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_mat > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'material_30_dias', 'aviso',
      v_mat || ' pedido(s) com 30 dias ou mais sem o material e sem o aviso de material parado: veja "entregas.mjs listar" (dispensar, se o cliente autorizou expressamente; senão, o aviso de que se aguarda o material: o projeto fica parado, nada é publicado nem encerrado).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;
  if v_resto > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'restante_3_dias', 'urgente',
      v_resto || ' site(s) com o prazo de 3 dias do restante vencido (passou da 00:00 depois do 3º dia do aviso "no ar"): veja "entregas.mjs listar" (suspender).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;

  insert into app.rotinas_execucoes (dia, rotina, ok, resultado)
  values (v_dia, 'diaria', v_falhou is null, jsonb_build_object('atencao', v_atencao, 'custo_dia', v_custo, 'falhas_ia', v_falhas, 'freios', v_freios,
                                                                'entregas', jsonb_build_object('prazo_vencido', v_prazo, 'material_30', v_mat, 'restante_vencido', v_resto)))
  on conflict (dia, rotina) do update set ok = excluded.ok, resultado = excluded.resultado, updated_at = now()
  returning avisado into v_avisado;

  return jsonb_build_object(
    'alertas', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'nivel', nivel, 'dia', dia, 'mensagem', mensagem) order by nivel desc, dia desc, tipo)
                         from app.alertas where org_id = v_org and dia > v_dia - 7 and resolvido_em is null
                           and (dia = v_dia or nivel = 'urgente')), '[]'),
    'avisar', not v_avisado);
end $$;
revoke all on function app.rotinas_conferir(jsonb) from public, anon, authenticated;
grant execute on function app.rotinas_conferir(jsonb) to service_role;
