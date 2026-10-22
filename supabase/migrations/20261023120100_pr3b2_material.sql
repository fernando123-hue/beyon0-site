-- ==========================================================================
-- PR 3b-2: AS AÇÕES DO MATERIAL (spec §2, §7, §8). Toda função: conversa_do (dono da sessão) → entrega no passo
-- "material" (privado.entrega_trava) → material → arquivos. Regra de negócio recusada volta como { ok: false, motivo }
-- (o transporte de produção só leva o SQLSTATE e o retorno normal COMMITA os contadores do freio); exceção só para dono
-- errado (P0002), passo errado (55000), dado malformado (22023) e corrida (40001).
-- Freios por hora SEM tabela nova: privado.contar_ip guarda (dia, chave) → n; a chave leva a hora no hash.
-- ==========================================================================

create function privado.freio_hora(p_chave text, p_max integer) returns boolean
language sql security definer set search_path = '' as $$
  select privado.contar_ip(encode(sha256(convert_to(p_chave || '|' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24'), 'UTF8')), 'hex'), p_max);
$$;
revoke all on function privado.freio_hora(text, integer) from public, anon, authenticated, service_role;

-- o que o balde ocupa: o tamanho REAL dos objetos (storage.objects) mais as reservas abertas, pelo limite do papel
create function privado.bytes_no_balde() returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare v_objetos bigint; v_reservas bigint;
begin
  select coalesce(sum((metadata ->> 'size')::bigint), 0) into v_objetos from storage.objects where bucket_id = 'material';
  select coalesce(sum(case papel when 'logo' then 5242880 else 10485760 end), 0) into v_reservas from app.material_arquivos where status = 'reservado';
  return v_objetos + v_reservas;
end $$;
revoke all on function privado.bytes_no_balde() from public, anon, authenticated, service_role;

-- ---------- salvar (campo a campo; o servidor já validou o esquema; null remove o campo) ----------
create function app.vendas_material_salvar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; v_tel text; v_dados jsonb := coalesce(p -> 'dados', '{}'::jsonb);
begin
  e := privado.entrega_trava((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid, array['material']);
  select * into m from app.materiais where entrega_id = e.id for update;
  if m.status <> 'rascunho' then raise exception 'material já enviado' using errcode = '55000'; end if;
  if jsonb_typeof(v_dados) <> 'object' or jsonb_typeof(coalesce(p -> 'negocio', '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p -> 'autorizacao', '{}'::jsonb)) <> 'object' then
    raise exception 'material: parâmetros inválidos' using errcode = '22023';
  end if;
  if not privado.freio_hora('mat|salvar|' || e.conversa_id, 120) then return jsonb_build_object('ok', false, 'motivo', 'freio'); end if;
  if coalesce((p ->> 'usar_numero_do_pedido')::boolean, false) then
    select regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') into v_tel
      from app.conversas cv join app.leads l on l.id = cv.lead_id where cv.id = e.conversa_id;
    v_tel := case when length(v_tel) in (10, 11) then '55' || v_tel when length(v_tel) in (12, 13) and left(v_tel, 2) = '55' then v_tel end;
    if v_tel is null then return jsonb_build_object('ok', false, 'motivo', 'numero'); end if;
    v_dados := v_dados || jsonb_build_object('whatsapp', '+' || v_tel);
  end if;
  update app.materiais set
    dados = jsonb_strip_nulls(dados || v_dados),
    negocio = jsonb_strip_nulls(negocio || coalesce(p -> 'negocio', '{}'::jsonb)),
    autorizacao = jsonb_strip_nulls(autorizacao || coalesce(p -> 'autorizacao', '{}'::jsonb)),
    primeiro_salvo_em = coalesce(primeiro_salvo_em, now()), updated_at = now()
   where id = m.id;
  if m.primeiro_salvo_em is null then perform privado.evento(e.org_id, e.conversa_id, 'material_salvo'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- reservar (o caminho é sorteado AQUI: <entrega>/<uuid>; nunca o nome do arquivo do cliente) ----------
create function app.vendas_material_reservar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; v_papel text := p ->> 'papel'; v_tipo text := p ->> 'tipo'; v_tam bigint; v_max bigint;
        v_vivas integer; v_total bigint; v_id uuid := gen_random_uuid(); v_caminho text; v_ordem integer;
begin
  if v_papel not in ('logo', 'foto') or v_tipo not in ('image/png', 'image/jpeg', 'image/webp') or coalesce(p ->> 'tamanho', '') !~ '^[0-9]{1,10}$' then
    raise exception 'material: parâmetros inválidos' using errcode = '22023';
  end if;
  v_tam := (p ->> 'tamanho')::bigint;
  e := privado.entrega_trava((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid, array['material']);
  select * into m from app.materiais where entrega_id = e.id for update;
  if m.status <> 'rascunho' then raise exception 'material já enviado' using errcode = '55000'; end if;
  v_max := case v_papel when 'logo' then 5242880 else 10485760 end;
  if v_tam < 1 or v_tam > v_max then return jsonb_build_object('ok', false, 'motivo', 'tamanho'); end if;
  -- os freios contam TODA tentativa (aceita ou recusada): quem martela uma recusa também bate no teto
  if not privado.freio_hora('mat|reservar|' || e.conversa_id, 40) then return jsonb_build_object('ok', false, 'motivo', 'freio'); end if;
  if coalesce(p ->> 'chave_ip', '') ~ '^[0-9a-f]{64}$' and not privado.freio_hora('mat|ip|' || (p ->> 'chave_ip'), 60) then
    return jsonb_build_object('ok', false, 'motivo', 'freio');
  end if;
  if (select count(*) from app.material_arquivos where entrega_id = e.id) >= 30 then return jsonb_build_object('ok', false, 'motivo', 'reservas'); end if;
  select count(*) into v_vivas from app.material_arquivos where entrega_id = e.id and papel = v_papel and status in ('reservado', 'conferido');
  if v_papel = 'logo' and v_vivas >= 1 then return jsonb_build_object('ok', false, 'motivo', 'logo'); end if;
  if v_papel = 'foto' and v_vivas >= 20 then return jsonb_build_object('ok', false, 'motivo', 'fotos'); end if;
  select coalesce(sum(coalesce(tamanho_real, tamanho_declarado)), 0) into v_total from app.material_arquivos where entrega_id = e.id and status in ('reservado', 'conferido');
  if v_total + v_tam > 157286400 then return jsonb_build_object('ok', false, 'motivo', 'pedido'); end if;
  if privado.bytes_no_balde() + v_tam > 838860800 then return jsonb_build_object('ok', false, 'motivo', 'balde'); end if;   -- (a nova conta pelo declarado; as reservas JÁ abertas, pelo limite do papel)
  v_caminho := e.id::text || '/' || v_id::text;
  select coalesce(max(ordem), 0) + 1 into v_ordem from app.material_arquivos where entrega_id = e.id and papel = v_papel;
  insert into app.material_arquivos (id, org_id, entrega_id, papel, ordem, caminho, tipo_declarado, tamanho_declarado)
  values (v_id, e.org_id, e.id, v_papel, v_ordem, v_caminho, v_tipo, v_tam);
  return jsonb_build_object('ok', true, 'arquivo_id', v_id, 'caminho', v_caminho);
end $$;

-- ---------- a leitura que o Worker faz antes de olhar o objeto no armazém ----------
create function app.vendas_material_arquivo(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; a app.material_arquivos;
begin
  e := privado.entrega_trava((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid, array['material']);
  select * into a from app.material_arquivos where id = (p ->> 'arquivo_id')::uuid and entrega_id = e.id;
  if not found then raise exception 'arquivo não encontrado' using errcode = 'P0002'; end if;
  -- o freio da conferência conta AQUI, antes de o Worker pedir qualquer coisa ao armazém (o objeto ausente também gasta; B4)
  if not privado.freio_hora('mat|conferir|' || e.conversa_id, 60) then return jsonb_build_object('ok', false, 'motivo', 'freio'); end if;
  return jsonb_build_object('ok', true, 'caminho', a.caminho, 'status', a.status, 'tamanho_declarado', a.tamanho_declarado, 'tipo_declarado', a.tipo_declarado);
end $$;

-- ---------- conferir: só linha em "reservado"; tipo e tamanho REAIS iguais ao declarado ----------
create function app.vendas_material_conferir(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; a app.material_arquivos; v_mime text; v_motivo text;
begin
  e := privado.entrega_trava((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid, array['material']);
  select * into a from app.material_arquivos where id = (p ->> 'arquivo_id')::uuid and entrega_id = e.id for update;
  if not found then raise exception 'arquivo não encontrado' using errcode = 'P0002'; end if;
  if a.status <> 'reservado' then return jsonb_build_object('ok', false, 'motivo', 'estado', 'status', a.status); end if;
  -- reserva com mais de 23 h não se confere: a limpeza (24 h) pode estar apagando o objeto neste momento (B3)
  if a.created_at < now() - interval '23 hours' then return jsonb_build_object('ok', false, 'motivo', 'estado', 'status', a.status); end if;
  v_mime := case p ->> 'tipo_real' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end;
  v_motivo := case
    when v_mime is null or v_mime <> a.tipo_declarado then 'tipo'
    when coalesce(p ->> 'tamanho_real', '') !~ '^[0-9]{1,12}$' or (p ->> 'tamanho_real')::bigint <> a.tamanho_declarado then 'tamanho'
  end;
  if v_motivo is null then
    update app.material_arquivos set status = 'conferido', tipo_real = p ->> 'tipo_real', tamanho_real = (p ->> 'tamanho_real')::bigint, conferido_em = now() where id = a.id;
    perform privado.evento(e.org_id, e.conversa_id, 'material_arquivo', jsonb_build_object('papel', a.papel));
    return jsonb_build_object('ok', true, 'status', 'conferido', 'caminho', a.caminho);
  end if;
  update app.material_arquivos set status = 'recusado', motivo = v_motivo, conferido_em = now() where id = a.id;
  perform privado.evento(e.org_id, e.conversa_id, 'material_recusado', jsonb_build_object('papel', a.papel, 'motivo', v_motivo));
  return jsonb_build_object('ok', false, 'status', 'recusado', 'motivo', v_motivo, 'caminho', a.caminho);
end $$;

-- ---------- remover (antes de enviar) ----------
create function app.vendas_material_remover(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; v_caminho text;
begin
  e := privado.entrega_trava((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid, array['material']);
  select * into m from app.materiais where entrega_id = e.id for update;
  if m.status <> 'rascunho' then raise exception 'material já enviado' using errcode = '55000'; end if;
  update app.material_arquivos set status = 'removido', removido_em = now()
   where id = (p ->> 'arquivo_id')::uuid and entrega_id = e.id and status in ('reservado', 'conferido', 'recusado')
  returning caminho into v_caminho;
  if v_caminho is null then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'caminho', v_caminho);
end $$;

-- ---------- enviar: material → producao (a data prevista vem calculada pelo servidor com a regra da captação) ----------
create function app.vendas_material_enviar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; v_agora timestamptz;
begin
  if coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' or jsonb_typeof(p -> 'prazo') <> 'object' or coalesce(p ->> 'entrega_ate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'material: parâmetros inválidos' using errcode = '22023';
  end if;
  v_agora := (p ->> 'agora')::timestamptz;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'material: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_trava((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid, array['material']);
  select * into m from app.materiais where entrega_id = e.id for update;
  if m.status <> 'rascunho' then raise exception 'material já enviado' using errcode = '55000'; end if;
  if m.updated_at is distinct from (p ->> 'versao')::timestamptz then raise exception 'o material mudou enquanto você enviava' using errcode = '40001'; end if;
  if coalesce(m.dados ->> 'whatsapp', '') = '' or coalesce(m.autorizacao ->> 'marcada', '') <> 'true' then
    return jsonb_build_object('ok', false, 'motivo', 'faltam_campos');
  end if;
  if exists (select 1 from app.material_arquivos where entrega_id = e.id and status = 'reservado') then
    return jsonb_build_object('ok', false, 'motivo', 'enviando');
  end if;
  with n as (select id, row_number() over (partition by papel order by ordem, created_at) as r from app.material_arquivos where entrega_id = e.id and status = 'conferido')
  update app.material_arquivos a set ordem = n.r from n where a.id = n.id;
  update app.materiais set status = 'enviado', enviado_em = v_agora, updated_at = now() where id = m.id;
  update app.entregas set passo = 'producao', prazo = prazo || (p -> 'prazo'), entrega_ate = (p ->> 'entrega_ate')::date, updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'material_enviado', jsonb_build_object('arquivos', (select count(*) from app.material_arquivos where entrega_id = e.id and status = 'conferido')));
  return jsonb_build_object('ok', true, 'enviado_em', v_agora);
end $$;

do $$
declare f text;
begin
  foreach f in array array['vendas_material_salvar', 'vendas_material_reservar', 'vendas_material_arquivo', 'vendas_material_conferir', 'vendas_material_remover', 'vendas_material_enviar'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
