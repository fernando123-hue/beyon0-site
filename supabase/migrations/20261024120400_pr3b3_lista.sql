-- ==========================================================================
-- PR 3b-3 (decisão do dono de 22/10, material de projeto parado): a lista do painel passa a trazer o aviso prévio do apagamento (aviso_apagar_material_em), o dia em que a rotina
-- apagou o material (material_apagado_em) e se o aviso prévio é DEVIDO agora (apagar_material_devido: a mesma conta da rotina diária e do alarme, privado.material_apagar_devido),
-- para o `listar` do terminal dizer o próximo passo. Só leitura; o corpo é o da migration 20261024120100, com estas três chaves a mais. `create or replace` mantém os privilégios (só service_role).
-- ==========================================================================
create or replace function app.vendas_entregas_lista(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; r record; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  for r in select c.id from app.conversas c where c.org_id = v_org and c.etapa = 'em_producao' and not exists (select 1 from app.entregas e where e.conversa_id = c.id) loop
    perform privado.garantir_entrega(r.id);
  end loop;
  select coalesce(jsonb_agg(q.x order by q.x ->> 'criada_em'), '[]'::jsonb) into v_itens from (
    select jsonb_build_object(
      'codigo', pd.codigo, 'passo', e.passo, 'material_status', m.status, 'enviado_em', m.enviado_em, 'importado_em', m.importado_em,
      'entrada_em', e.prazo ->> 'entrada_em', 'entrega_ate', e.entrega_ate, 'prazo_dias', e.prazo_dias, 'prazo', e.prazo,
      'dias_desde_entrada', (now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date,
      'arquivos', (select count(*) from app.material_arquivos a where a.entrega_id = e.id and a.status = 'conferido'),
      'formato', c.briefing #>> '{projeto,formato}', 'segmento', c.briefing #>> '{negocio,segmento}',
      'cliente_captacao', e.cliente_captacao, 'tem_whatsapp', coalesce(m.dados ->> 'whatsapp', '') <> '',
      'autorizacao_marcada', coalesce(m.autorizacao ->> 'marcada', '') = 'true', 'tem_uf', coalesce(m.negocio ->> 'uf', '') <> '',
      'rodadas', jsonb_build_object('usadas', e.rodadas_usadas, 'max', e.rodadas_max),
      'ajustes_na_fila', (select count(*) from app.entrega_ajustes ea where ea.entrega_id = e.id and ea.status = 'na_fila'),
      'ajustes_com_contato', (select count(*) from app.entrega_ajustes ea where ea.entrega_id = e.id and ea.status = 'na_fila' and (ea.contato_whatsapp is not null or ea.contato_email is not null)),
      'previa_url', e.previa_url, 'previa_em', e.previa_em,
      'dias_na_previa', case when e.passo = 'previa' then (now() at time zone 'America/Campo_Grande')::date - (e.previa_em at time zone 'America/Campo_Grande')::date end,
      'no_ar_em', e.no_ar_em,
      'dias_no_ar', case when e.no_ar_em is not null then (now() at time zone 'America/Campo_Grande')::date - (e.no_ar_em at time zone 'America/Campo_Grande')::date end,
      'aviso_material_em', e.aviso_material_em, 'aviso_no_ar_feito_em', e.aviso_no_ar_feito_em,
      'aviso_apagar_material_em', e.aviso_apagar_material_em, 'material_apagado_em', e.material_apagado_em, 'apagar_material_devido', privado.material_apagar_devido(e),
      'dias_do_aviso', case when e.aviso_no_ar_feito_em is not null then (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date end,
      'lembrete_restante_1_em', e.lembrete_restante_1_em, 'lembrete_restante_2_em', e.lembrete_restante_2_em,
      'aviso_previa_pendente', e.aviso_previa_desde is not null, 'aviso_no_ar_pendente', e.aviso_no_ar_desde is not null,
      'religar_pendente', e.religar_pendente, 'criada_em', e.created_at) as x
      from app.entregas e
      join app.materiais m on m.entrega_id = e.id
      join app.conversas c on c.id = e.conversa_id
      left join app.pedidos pd on pd.conversa_id = c.id
     where e.org_id = v_org and (e.passo not in ('concluida', 'encerrada') or e.religar_pendente)
     order by e.created_at limit 100
  ) q;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;
