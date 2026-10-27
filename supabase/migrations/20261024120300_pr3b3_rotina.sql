-- ==========================================================================
-- PR 3b-3 (spec §2.1, §5, §10): OS ALARMES DE PRAZO na rotina diária que já existe (sem cron novo). Só CONTAGEM (o alerta do painel não leva dado pessoal;
-- o código do pedido aparece no `listar` do terminal). D5: nada aqui muda o passo de uma entrega; a prévia parada não gera alarme.
-- ==========================================================================
alter table app.alertas drop constraint alertas_tipo_check;
alter table app.alertas add constraint alertas_tipo_check check (tipo in (
  'pagamento_atencao', 'teto_ia', 'ia_falhando', 'freio_ip', 'rotina_falhou', 'prazo_vencido', 'material_30_dias', 'restante_3_dias', 'material_apagar'));

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
           'entrada_em', e.prazo ->> 'entrada_em', 'no_ar_em', e.no_ar_em, 'aviso_material_em', e.aviso_material_em, 'aviso_no_ar_feito_em', e.aviso_no_ar_feito_em,
           'apagar_material_devido', privado.material_apagar_devido(e))), '[]'::jsonb) into v_itens
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
  v_apagar integer := coalesce((v_ent ->> 'material_apagar')::integer, 0);
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
  if v_apagar > 0 then
    insert into app.alertas (org_id, dia, tipo, nivel, mensagem) values (v_org, v_dia, 'material_apagar', 'aviso',
      v_apagar || ' pedido(s) parado(s) há 5 meses ou mais esperando o material ou a autorização: o material será apagado aos 6 meses, e o cliente precisa ser avisado 30 dias antes. Veja "entregas.mjs listar" (o aviso prévio é registrado pelo dono; sem ele, nada é apagado).')
    on conflict (org_id, dia, tipo) do nothing;
  end if;

  insert into app.rotinas_execucoes (dia, rotina, ok, resultado)
  values (v_dia, 'diaria', v_falhou is null, jsonb_build_object('atencao', v_atencao, 'custo_dia', v_custo, 'falhas_ia', v_falhas, 'freios', v_freios,
                                                                'entregas', jsonb_build_object('prazo_vencido', v_prazo, 'material_30', v_mat, 'restante_vencido', v_resto, 'material_apagar', v_apagar)))
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

-- ==========================================================================
-- O MATERIAL DO PROJETO PARADO (decisão do dono de 22/10, publicada em /privacidade#material): "Se o projeto ficar parado esperando o seu material ou a sua
-- autorização, ele continua reservado para você. Depois de 6 meses parado, o material é apagado, e avisamos você antes."
--  • o "parado" começa no aviso de material parado (aviso_material_em) e recomeça se o cliente mexer no material (campo salvo ou foto mandada);
--  • aos 5 meses (por DATA de Campo Grande) o dono deve o aviso prévio (momento "material_apagar", 30 dias antes do apagamento): a rotina só conta (alarme);
--  • aos 6 meses E 30 dias corridos depois do aviso prévio registrado, a rotina de limpeza apaga o material (o armazém primeiro, o banco depois, como na 3b-2) e SÓ ele:
--    o pedido, a proposta e o pagamento ficam, o passo continua "material" e a vaga continua do cliente (nunca se encerra por falta de material);
--  • com a autorização completa do cliente (número + caixa + UF) ou com o material enviado (o passo muda), nada é apagado.
-- D5: nada aqui muda o passo.
-- ==========================================================================
alter table app.entregas
  add column aviso_apagar_material_em timestamptz,   -- o dono REGISTROU o aviso prévio de que o material será apagado (vale se for depois da última mexida do cliente)
  add column material_apagado_em timestamptz;         -- o dia em que a rotina apagou o material do projeto parado (o passo continua "material")

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
  'restante_iniciado', 'restante_pago', 'entrega_suspensa', 'entrega_encerrada', 'aviso_registrado', 'material_apagado'));

-- a autorização completa do material (a mesma conta de vendas_aviso_feito e vendas_avisos_lista): número + caixa marcada + UF
create function privado.material_autorizado(m app.materiais) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(m.dados ->> 'whatsapp', '') <> '' and coalesce(m.autorizacao ->> 'marcada', '') = 'true' and coalesce(m.negocio ->> 'uf', '') <> '';
$$;
revoke all on function privado.material_autorizado(app.materiais) from public, anon, authenticated, service_role;

-- desde quando o projeto está parado: o aviso de material parado, ou a última mexida do cliente no material (campo salvo, foto mandada), a que for mais recente
create function privado.material_parado_desde(e app.entregas) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select case when e.aviso_material_em is null then null
    else greatest(e.aviso_material_em, (select m.updated_at from app.materiais m where m.entrega_id = e.id),
                  (select max(a.created_at) from app.material_arquivos a where a.entrega_id = e.id)) end;
$$;
revoke all on function privado.material_parado_desde(app.entregas) from public, anon, authenticated, service_role;

-- há alguma coisa para apagar (foto viva ou campo preenchido)? Sem material não há aviso nem alarme
create function privado.material_tem_o_que_apagar(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.material_arquivos a where a.entrega_id = e.id and a.status in ('reservado', 'conferido'))
      or exists (select 1 from app.materiais m where m.entrega_id = e.id and (m.dados <> '{}'::jsonb or m.negocio <> '{}'::jsonb));
$$;
revoke all on function privado.material_tem_o_que_apagar(app.entregas) from public, anon, authenticated, service_role;

-- o aviso prévio é DEVIDO: passo material, parado há 5 meses por DATA de Campo Grande, sem a autorização completa, com o que apagar e sem aviso prévio válido
-- (um aviso anterior à última mexida do cliente não vale: o cliente voltou e a contagem recomeçou)
create function privado.material_apagar_devido(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(e.passo = 'material' and e.aviso_material_em is not null
    and not exists (select 1 from app.materiais m where m.entrega_id = e.id and privado.material_autorizado(m))
    and privado.material_tem_o_que_apagar(e)
    and ((privado.material_parado_desde(e) at time zone 'America/Campo_Grande')::date + interval '5 months')::date <= (now() at time zone 'America/Campo_Grande')::date
    and (e.aviso_apagar_material_em is null or e.aviso_apagar_material_em < privado.material_parado_desde(e)), false);
$$;
revoke all on function privado.material_apagar_devido(app.entregas) from public, anon, authenticated, service_role;

-- o material PODE ser apagado: parado há 6 meses por data, com o aviso prévio registrado depois da última mexida do cliente e 30 dias corridos (por data) passados desde ele
create function privado.material_apagavel(e app.entregas) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(e.passo = 'material' and e.aviso_material_em is not null and e.aviso_apagar_material_em is not null
    and not exists (select 1 from app.materiais m where m.entrega_id = e.id and privado.material_autorizado(m))
    and e.aviso_apagar_material_em >= privado.material_parado_desde(e)
    and ((privado.material_parado_desde(e) at time zone 'America/Campo_Grande')::date + interval '6 months')::date <= (now() at time zone 'America/Campo_Grande')::date
    and (e.aviso_apagar_material_em at time zone 'America/Campo_Grande')::date + 30 <= (now() at time zone 'America/Campo_Grande')::date, false);
$$;
revoke all on function privado.material_apagavel(app.entregas) from public, anon, authenticated, service_role;

-- ---------- a limpeza: o caso (f), projeto parado (a 3b-2 com mais um caso) ----------
create or replace function app.rotinas_material_pendencias(p jsonb) returns jsonb
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
      union all
      -- (f) projeto parado: 6 meses esperando o material ou a autorização, com o aviso prévio dado há 30 dias ou mais (privado.material_apagavel)
      select a.caminho from app.material_arquivos a join app.entregas e on e.id = a.entrega_id
       where a.status in ('conferido', 'reservado') and privado.material_apagavel(e)
    ) t order by t.caminho limit v_lim
  ) u;
  v_bytes := privado.bytes_no_balde();
  return jsonb_build_object('caminhos', to_jsonb(v_caminhos), 'balde_bytes', v_bytes, 'balde_pct', round(v_bytes * 100.0 / 838860800)::integer, 'alarme', v_bytes >= 0.7 * 838860800);
end $$;

create or replace function app.rotinas_material_baixar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_caminhos text[]; v_n integer; r record; v_limpos integer := 0; v_parados integer := 0;
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
  -- (f) o projeto parado: com os arquivos já baixados, os campos saem (a prova da autorização fica); o material continua um rascunho, o passo continua "material" e
  -- a contagem recomeça (updated_at), de modo que a rotina de amanhã não repete nem apaga o que o cliente mandar quando voltar
  for r in
    select e.id, e.conversa_id, e.org_id from app.entregas e
     where privado.material_apagavel(e)
       and not exists (select 1 from app.material_arquivos a where a.entrega_id = e.id and a.status in ('reservado', 'conferido'))
  loop
    update app.materiais set dados = '{}', negocio = '{}', updated_at = now() where entrega_id = r.id;
    update app.entregas set material_apagado_em = now() where id = r.id;
    perform privado.evento(r.org_id, r.conversa_id, 'material_apagado');
    v_parados := v_parados + 1;
  end loop;
  delete from app.links_pedido where valido_ate < now() - interval '30 days' or revogado_em < now() - interval '30 days';
  return jsonb_build_object('baixados', v_n, 'limpos', v_limpos, 'parados', v_parados);
end $$;

-- ---------- os avisos do dono: o aviso prévio do apagamento (a 3b-3 com mais um momento) ----------
create or replace function app.vendas_aviso_feito(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; v_momento text := p ->> 'momento'; v_dias integer; v_min integer; v_desde timestamptz;
begin
  if v_momento is null or v_momento not in ('previa', 'no_ar', 'material_parado', 'material_apagar', 'restante_lembrete_1', 'restante_lembrete_2') then
    raise exception 'aviso: momento fora da lista' using errcode = '22023';
  end if;
  e := privado.entrega_do_dono(p, null);
  if v_momento = 'previa' then update app.entregas set aviso_previa_desde = null where id = e.id;
  elsif v_momento = 'no_ar' then
    update app.entregas set aviso_no_ar_desde = null, aviso_no_ar_feito_em = case when e.passo = 'no_ar' then coalesce(aviso_no_ar_feito_em, now()) else aviso_no_ar_feito_em end where id = e.id;
  elsif v_momento = 'material_parado' then
    if e.passo <> 'material' then return jsonb_build_object('ok', false, 'motivo', 'estado'); end if;
    if e.aviso_material_em is not null then return jsonb_build_object('ok', false, 'motivo', 'ja'); end if;
    -- (A1) a captação só deixa o aviso a partir do dia 30 depois da entrada (clientes/producao.mjs:118): sem esta trava o aviso podia sair no dia 1 e
    -- o pedido passar por "parado" sem ter esperado. Mesma conta de dias da vendas_material_dispensar.
    v_dias := coalesce((now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date, 0);   -- (idem: sem entrada_em não passa do dia 30)
    if v_dias < 30 then return jsonb_build_object('ok', false, 'dias', v_dias, 'motivo', 'cedo'); end if;
    -- com o número AUTORIZADO (WhatsApp + caixa + UF) o caminho é dispensar o material, não o aviso de material parado
    select * into m from app.materiais where entrega_id = e.id;
    if coalesce(m.dados ->> 'whatsapp', '') <> '' and coalesce(m.autorizacao ->> 'marcada', '') = 'true' and coalesce(m.negocio ->> 'uf', '') <> '' then
      return jsonb_build_object('ok', false, 'motivo', 'dispensar');
    end if;
    update app.entregas set aviso_material_em = now() where id = e.id;
  elsif v_momento = 'material_apagar' then
    -- o aviso prévio do apagamento (decisão do dono de 22/10): 30 dias antes dos 6 meses parado; o dono manda a mensagem e registra aqui
    if e.passo <> 'material' then return jsonb_build_object('ok', false, 'motivo', 'estado'); end if;
    v_desde := privado.material_parado_desde(e);
    if e.aviso_apagar_material_em is not null and v_desde is not null and e.aviso_apagar_material_em >= v_desde then return jsonb_build_object('ok', false, 'motivo', 'ja'); end if;
    if e.aviso_material_em is null then return jsonb_build_object('ok', false, 'motivo', 'sem_aviso'); end if;
    select * into m from app.materiais where entrega_id = e.id;
    if privado.material_autorizado(m) then return jsonb_build_object('ok', false, 'motivo', 'dispensar'); end if;
    if not privado.material_tem_o_que_apagar(e) then return jsonb_build_object('ok', false, 'motivo', 'nada'); end if;
    if not privado.material_apagar_devido(e) then return jsonb_build_object('ok', false, 'motivo', 'cedo'); end if;
    update app.entregas set aviso_apagar_material_em = now() where id = e.id;
  else
    if e.passo <> 'no_ar' then return jsonb_build_object('ok', false, 'motivo', 'fora_do_ar'); end if;
    if e.aviso_no_ar_feito_em is null then return jsonb_build_object('ok', false, 'motivo', 'sem_aviso'); end if;
    if (v_momento = 'restante_lembrete_1' and e.lembrete_restante_1_em is not null) or (v_momento = 'restante_lembrete_2' and e.lembrete_restante_2_em is not null) then
      return jsonb_build_object('ok', false, 'motivo', 'ja');
    end if;
    v_dias := (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date;
    v_min := case when v_momento = 'restante_lembrete_1' then 2 else 3 end;   -- (o CASE não pode ficar dentro do IF: o THEN do CASE confunde o plpgsql)
    if v_dias < v_min then return jsonb_build_object('ok', false, 'motivo', 'cedo', 'dias', v_dias); end if;
    if v_momento = 'restante_lembrete_1' then update app.entregas set lembrete_restante_1_em = now() where id = e.id;
    else update app.entregas set lembrete_restante_2_em = now() where id = e.id; end if;
  end if;
  perform privado.evento(e.org_id, e.conversa_id, 'aviso_registrado', jsonb_build_object('momento', v_momento));
  return jsonb_build_object('ok', true);
end $$;

create or replace function app.vendas_avisos_lista(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with x as (
    select e.conversa_id, 'previa'::text as momento, e.aviso_previa_desde as desde from app.entregas e
     where e.org_id = v_org and e.aviso_previa_desde is not null and e.passo = 'previa'
    union all
    select e.conversa_id, 'no_ar', e.aviso_no_ar_desde from app.entregas e
     where e.org_id = v_org and e.aviso_no_ar_desde is not null and e.passo in ('no_ar', 'suspensa')
    union all   -- (22/10) material parado: dia 30 sem o material, SEM número autorizado e sem o aviso já registrado
    select e.conversa_id, 'material_parado', (e.prazo ->> 'entrada_em')::timestamptz + interval '30 days' from app.entregas e join app.materiais m on m.entrega_id = e.id
     where e.org_id = v_org and e.passo = 'material' and e.aviso_material_em is null
       and (now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date >= 30
       and not (coalesce(m.dados ->> 'whatsapp', '') <> '' and coalesce(m.autorizacao ->> 'marcada', '') = 'true' and coalesce(m.negocio ->> 'uf', '') <> '')
    union all   -- (22/10) o aviso prévio do apagamento do material: o projeto parado completou 5 meses (privado.material_apagar_devido)
    select e.conversa_id, 'material_apagar', ((privado.material_parado_desde(e) at time zone 'America/Campo_Grande')::date + interval '5 months') at time zone 'America/Campo_Grande' from app.entregas e
     where e.org_id = v_org and privado.material_apagar_devido(e)
    union all   -- (22/10) o lembrete do 2º dia depois do aviso "no ar"
    select e.conversa_id, 'restante_lembrete_1', e.aviso_no_ar_feito_em + interval '2 days' from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_1_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 2
    union all   -- (22/10) o último lembrete, no 3º dia
    select e.conversa_id, 'restante_lembrete_2', e.aviso_no_ar_feito_em + interval '3 days' from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_2_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 3)
  select coalesce(jsonb_agg(jsonb_build_object('conversa_id', c.id, 'codigo', pd.codigo, 'momento', x.momento, 'desde', x.desde,
           'contato', jsonb_build_object('nome', l.nome, 'telefone', l.telefone, 'email', l.email)) order by x.desde), '[]'::jsonb) into v_itens
    from x join app.conversas c on c.id = x.conversa_id join app.pedidos pd on pd.conversa_id = c.id left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

do $$
declare f text;
begin
  foreach f in array array['rotinas_material_pendencias', 'rotinas_material_baixar', 'vendas_aviso_feito', 'vendas_avisos_lista'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
