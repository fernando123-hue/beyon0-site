-- ==========================================================================
-- PR 3b-2: O LADO DO DONO (spec §6, §9, §10). Funções que só o painel chama (org_slug, sem visitante): a lista das entregas,
-- o material para baixar e o "importado". A limpeza e a reconciliação da rotina diária (rotinas_material_*) estão no fim.
-- "Baixar" só LÊ. "Importado" é um comando à parte, depois de a importação da captação passar: é ele que começa a contar os
-- 7 dias da nuvem (privacidade, spec §10).
-- ==========================================================================

create function app.vendas_entregas_lista(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; r record; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  -- a entrega que o gatilho não criou (a leitura conserta)
  for r in select c.id from app.conversas c where c.org_id = v_org and c.etapa = 'em_producao' and not exists (select 1 from app.entregas e where e.conversa_id = c.id) loop
    perform privado.garantir_entrega(r.id);
  end loop;
  select coalesce(jsonb_agg(q.x order by q.x ->> 'criada_em'), '[]'::jsonb) into v_itens from (
    select jsonb_build_object(
      'codigo', pd.codigo, 'passo', e.passo, 'material_status', m.status, 'enviado_em', m.enviado_em, 'importado_em', m.importado_em,
      'entrada_em', e.prazo ->> 'entrada_em', 'entrega_ate', e.entrega_ate, 'prazo_dias', e.prazo_dias,
      'dias_desde_entrada', floor(extract(epoch from (now() - (e.prazo ->> 'entrada_em')::timestamptz)) / 86400)::integer,
      'arquivos', (select count(*) from app.material_arquivos a where a.entrega_id = e.id and a.status = 'conferido'),
      'formato', c.briefing #>> '{projeto,formato}', 'segmento', c.briefing #>> '{negocio,segmento}',
      'cliente_captacao', e.cliente_captacao, 'tem_whatsapp', coalesce(m.dados ->> 'whatsapp', '') <> '', 'criada_em', e.created_at) as x
      from app.entregas e
      join app.materiais m on m.entrega_id = e.id
      join app.conversas c on c.id = e.conversa_id
      left join app.pedidos pd on pd.conversa_id = c.id
     where e.org_id = v_org and e.passo not in ('concluida', 'encerrada')
     order by e.created_at limit 100
  ) q;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

create function app.vendas_material_para_baixar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; e app.entregas; m app.materiais; c app.conversas; pr app.propostas; l app.leads; v_codigo text := p ->> 'codigo';
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  select e2.* into e from app.entregas e2 join app.pedidos pd on pd.conversa_id = e2.conversa_id where pd.codigo = v_codigo and e2.org_id = v_org;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  select * into m from app.materiais where entrega_id = e.id;
  if m.status not in ('enviado', 'importado') then raise exception 'o cliente ainda não enviou o material' using errcode = '55000'; end if;
  select * into c from app.conversas where id = e.conversa_id;
  select * into pr from app.propostas where id = e.proposta_id;
  select * into l from app.leads where id = c.lead_id;
  return jsonb_build_object(
    'codigo', v_codigo,
    'material', jsonb_build_object('status', m.status, 'dados', m.dados, 'negocio', m.negocio, 'autorizacao', m.autorizacao, 'enviado_em', m.enviado_em),
    'negocio', jsonb_build_object('nome', c.briefing #>> '{negocio,nome}', 'segmento', c.briefing #>> '{negocio,segmento}', 'cidade', c.briefing #>> '{negocio,cidade}'),
    'proposta', jsonb_build_object('formato', c.briefing #>> '{projeto,formato}', 'valor_total', pr.valor_total, 'sinal_percentual', pr.sinal_percentual,
                                   'prazo_dias', e.prazo_dias, 'aceita_em', pr.respondida_em, 'escopo', pr.escopo),
    'entrada_paga_em', e.prazo ->> 'entrada_em',
    'whatsapp_contato', l.telefone,
    'arquivos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'papel', a.papel, 'ordem', a.ordem, 'caminho', a.caminho, 'tipo_real', a.tipo_real, 'tamanho_real', a.tamanho_real)
                                           order by a.papel, a.ordem) from app.material_arquivos a where a.entrega_id = e.id and a.status = 'conferido'), '[]'::jsonb));
end $$;

create function app.vendas_material_importado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; e app.entregas; m app.materiais; v_cliente text := p ->> 'cliente';
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  if coalesce(v_cliente, '') !~ '^c-[abcdefghjkmnpqrstuvwxyz23456789]{6}$' then raise exception 'cliente da captação inválido' using errcode = '22023'; end if;
  select e2.* into e from app.entregas e2 join app.pedidos pd on pd.conversa_id = e2.conversa_id where pd.codigo = p ->> 'codigo' and e2.org_id = v_org for update of e2;
  if not found then raise exception 'pedido não encontrado' using errcode = 'P0002'; end if;
  select * into m from app.materiais where entrega_id = e.id for update;
  if m.status = 'rascunho' then raise exception 'o cliente ainda não enviou o material' using errcode = '55000'; end if;
  if m.status in ('importado', 'limpo') then
    if e.cliente_captacao is distinct from v_cliente then return jsonb_build_object('ok', false, 'motivo', 'outro_cliente'); end if;
    return jsonb_build_object('ok', true, 'ja', true);
  end if;
  update app.materiais set status = 'importado', importado_em = now(), updated_at = now() where id = m.id;
  update app.entregas set cliente_captacao = v_cliente, updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'material_importado');
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['vendas_entregas_lista', 'vendas_material_para_baixar', 'vendas_material_importado'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;

-- ---------- A ROTINA DIÁRIA: limpeza e reconciliação do armazém (spec §7, §9, §10) ----------
-- o pedido acabou há tempo suficiente para o material sair? Nunca importado: 30 dias depois de concluído; no dia seguinte se foi
-- encerrado OU se o SINAL foi estornado (a desistência em 7 dias é lei, CDC art. 49; M3 da revisão do plano). Confira que
-- app.pagamentos tem `updated_at` (20261007130000_pagamentos.sql); se não tiver, use a data do estorno da auditoria.
create function privado.material_vencido_pelo_fim(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (e.passo = 'concluida' and e.updated_at < now() - interval '30 days')
    or (e.passo = 'encerrada' and e.updated_at < now() - interval '1 day')
    or exists (select 1 from app.pagamentos pg where pg.proposta_id = e.proposta_id and pg.parcela = 'sinal'
                 and pg.status = 'estornado' and pg.updated_at < now() - interval '1 day'), false);
$$;
revoke all on function privado.material_vencido_pelo_fim(app.entregas) from public, anon, authenticated, service_role;

-- A lista dos objetos vem DAQUI (storage.objects, uma consulta), nunca da listagem paginada do Storage.
create function app.rotinas_material_pendencias(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim integer := least(greatest(coalesce((p ->> 'limite')::integer, 100), 1), 200); v_caminhos text[]; v_bytes bigint;
begin
  select coalesce(array_agg(u.caminho), '{}') into v_caminhos from (
    select distinct t.caminho from (
      -- (a) objeto sem linha
      select o.name as caminho from storage.objects o
       where o.bucket_id = 'material' and not exists (select 1 from app.material_arquivos a where a.caminho = o.name)
      union all
      -- (b) linha recusada ou removida cujo objeto ainda existe (o link de 2 h poderia ter gravado de novo)
      select o.name from storage.objects o join app.material_arquivos a on a.caminho = o.name
       where o.bucket_id = 'material' and a.status in ('recusado', 'removido')
      union all
      -- (c) reserva não conferida há mais de 24 h (com menos de 24 h é POUPADA: um envio em andamento não some)
      select a.caminho from app.material_arquivos a where a.status = 'reservado' and a.created_at < now() - interval '24 hours'
      union all
      -- (d) 7 dias depois de importado pela produção
      select a.caminho from app.material_arquivos a join app.materiais m on m.entrega_id = a.entrega_id
       where a.status in ('conferido', 'reservado') and m.status = 'importado' and m.importado_em < now() - interval '7 days'
      union all
      -- (e) nunca importado: 30 dias depois do fim do pedido; encerrado (desistência e afins), no dia seguinte
      select a.caminho from app.material_arquivos a join app.entregas e on e.id = a.entrega_id join app.materiais m on m.entrega_id = e.id
       where a.status in ('conferido', 'reservado') and m.status in ('rascunho', 'enviado')
         and privado.material_vencido_pelo_fim(e)
    ) t order by t.caminho limit v_lim
  ) u;
  v_bytes := privado.bytes_no_balde();
  return jsonb_build_object('caminhos', to_jsonb(v_caminhos), 'balde_bytes', v_bytes, 'balde_pct', round(v_bytes * 100.0 / 838860800)::integer, 'alarme', v_bytes >= 0.7 * 838860800);
end $$;

-- depois de o armazém apagar os objetos: marca as linhas, deixa o material "limpo" (os campos saem; a prova da autorização
-- fica) e apaga os links do pedido vencidos há mais de 30 dias
create function app.rotinas_material_baixar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_caminhos text[]; v_n integer; r record; v_limpos integer := 0;
begin
  select coalesce(array_agg(x), '{}') into v_caminhos from jsonb_array_elements_text(coalesce(p -> 'caminhos', '[]'::jsonb)) x;
  update app.material_arquivos set status = 'removido', removido_em = now(), motivo = coalesce(motivo, 'limpeza')
   where caminho = any (v_caminhos) and status in ('reservado', 'conferido', 'recusado');
  get diagnostics v_n = row_count;
  for r in
    select m.id, e.conversa_id, e.org_id from app.materiais m join app.entregas e on e.id = m.entrega_id
     where (  (m.status = 'importado' and m.importado_em < now() - interval '7 days')
           or (m.status in ('rascunho', 'enviado') and privado.material_vencido_pelo_fim(e)))
       and not exists (select 1 from app.material_arquivos a where a.entrega_id = m.entrega_id and a.status in ('reservado', 'conferido'))
  loop
    update app.materiais set status = 'limpo', limpo_em = now(), dados = '{}', negocio = '{}', updated_at = now() where id = r.id;
    perform privado.evento(r.org_id, r.conversa_id, 'material_limpo');
    v_limpos := v_limpos + 1;
  end loop;
  delete from app.links_pedido where valido_ate < now() - interval '30 days' or revogado_em < now() - interval '30 days';
  return jsonb_build_object('baixados', v_n, 'limpos', v_limpos);
end $$;

do $$
declare f text;
begin
  foreach f in array array['rotinas_material_pendencias', 'rotinas_material_baixar'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
