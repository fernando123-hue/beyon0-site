-- ==========================================================================
-- PR 3b-2: O LINK DO PEDIDO (spec §1, §2, §8; achado R2-1 da rodada 2). O cliente guarda UM link e volta por ele se o
-- celular apagar o armazenamento do navegador. FIXO durante o pedido: usar NÃO revoga (se revogasse, o link salvo no
-- WhatsApp morreria no primeiro uso e o código novo ficaria só no armazenamento que se apagou). Muda só em "Gerar um
-- link novo" e em "Sair deste aparelho". Guardado só como hash; um vivo por conversa. Abrir pelo link leva o pedido para o
-- aparelho que abriu (o anterior perde o acesso), como na retomada.
-- ORDEM DE TRAVAS: a conversa SEMPRE antes do link (criar e usar).
-- ==========================================================================

create function app.vendas_link_pedido_criar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; e app.entregas; v_vivo app.links_pedido; v_forcar boolean := coalesce((p ->> 'forcar')::boolean, false); v_valido timestamptz;
begin
  if coalesce(p ->> 'codigo_hash', '') !~ '^[0-9a-f]{64}$' then raise exception 'link: parâmetros inválidos' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- trava 1
  perform privado.exigir_etapa(c, array['em_producao']);
  select * into e from app.entregas where conversa_id = c.id for update;
  if not found then raise exception 'entrega não encontrada' using errcode = 'P0002'; end if;
  if not privado.sinal_pago(e.proposta_id) then raise exception 'o sinal não está pago (estornado ou contestado)' using errcode = '55000'; end if;
  select * into v_vivo from app.links_pedido where conversa_id = c.id and revogado_em is null for update;
  -- já existe um vivo e ninguém pediu outro: devolve (o código em claro nunca volta; só o hash está guardado)
  if found and v_vivo.valido_ate > now() and not v_forcar then
    return jsonb_build_object('ok', true, 'criado', false, 'valido_ate', v_vivo.valido_ate);
  end if;
  if not privado.freio_dia('link|pedido|' || c.id, 3) then return jsonb_build_object('ok', false, 'motivo', 'freio'); end if;
  if v_vivo.id is not null then
    update app.links_pedido set revogado_em = now(), motivo_revogacao = case when v_forcar then 'novo_a_pedido' else 'fim_do_pedido' end where id = v_vivo.id;
    perform privado.evento(c.org_id, c.id, 'link_pedido_revogado');
  end if;
  v_valido := now() + interval '120 days';   -- o pedido inteiro cabe (material, prazo, prévia, restante); a 3b-3 encurta para 30 dias depois do fim
  insert into app.links_pedido (org_id, conversa_id, codigo_hash, valido_ate) values (c.org_id, c.id, p ->> 'codigo_hash', v_valido);
  perform privado.evento(c.org_id, c.id, 'link_pedido_criado');
  return jsonb_build_object('ok', true, 'criado', true, 'valido_ate', v_valido);
end $$;

create function app.vendas_link_pedido_usar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_conversa uuid; c app.conversas; l app.links_pedido; v_vid uuid;
begin
  if coalesce(p ->> 'codigo_hash', '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false); end if;
  -- o freio por IP (o HMAC do servidor) vale também para código errado: quem adivinha gasta a cota
  if coalesce(p ->> 'chave_ip', '') ~ '^[0-9a-f]{64}$' and not privado.freio_hora('link|ip|' || (p ->> 'chave_ip'), 30) then
    return jsonb_build_object('ok', false, 'motivo', 'freio');
  end if;
  v_vid := (p ->> 'visitante_id')::uuid;
  -- 1º a conversa (sem trava, só para saber qual), depois a trava da conversa, depois a do link: a mesma ordem do criar
  select lp.conversa_id into v_conversa from app.links_pedido lp join app.organizacoes o on o.id = lp.org_id
   where lp.codigo_hash = p ->> 'codigo_hash' and o.slug = p ->> 'org_slug';
  if not found then return jsonb_build_object('ok', false); end if;
  select * into c from app.conversas where id = v_conversa for update;
  select * into l from app.links_pedido where codigo_hash = p ->> 'codigo_hash' and conversa_id = v_conversa for update;
  if not found or l.revogado_em is not null or l.valido_ate <= now() or c.etapa not in ('em_producao', 'encerrada') then
    return jsonb_build_object('ok', false);
  end if;
  -- NÃO revoga: o link é fixo. Cada uso RENOVA a validade (janela deslizante): a D5 deixa o pedido parado na prévia sem prazo
  update app.links_pedido set ultimo_uso_em = now(), valido_ate = greatest(valido_ate, now() + interval '120 days') where id = l.id;
  update app.conversas set visitante_id = v_vid, ultima_atividade = now() where id = c.id;
  update app.escolhas set visitante_id = v_vid where conversa_id = c.id;   -- (a escolha guarda quem escolheu; ver a retomada, 20261016120000)
  perform privado.evento(c.org_id, c.id, 'link_pedido_usado');
  return jsonb_build_object('ok', true, 'conversa_id', c.id);
end $$;

create function app.vendas_link_pedido_sair(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_n integer;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  update app.links_pedido set revogado_em = now(), motivo_revogacao = 'sair_do_aparelho' where conversa_id = c.id and revogado_em is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform privado.evento(c.org_id, c.id, 'link_pedido_revogado'); end if;
  return jsonb_build_object('ok', true, 'revogados', v_n);
end $$;

-- "Continuar no computador": a retomada de 7 dias e uso único do PR 2b-2, pedida pelo próprio cliente (3 por dia)
create function app.vendas_retomada_do_cliente(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_expira timestamptz;
begin
  if coalesce(p ->> 'codigo_hash', '') !~ '^[0-9a-f]{64}$' then raise exception 'retomada: parâmetros inválidos' using errcode = '22023'; end if;
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  perform privado.exigir_etapa(c, array['em_producao']);
  if not privado.sinal_pago((select proposta_id from app.entregas where conversa_id = c.id)) then
    raise exception 'o sinal não está pago (estornado ou contestado)' using errcode = '55000';
  end if;
  if not exists (select 1 from app.pedidos pd where pd.conversa_id = c.id and pd.status = 'confirmado') then
    raise exception 'retomada: só para pedido confirmado' using errcode = '55000';
  end if;
  if not privado.freio_dia('retomada|cliente|' || c.id, 3) then return jsonb_build_object('ok', false, 'motivo', 'freio'); end if;
  delete from app.retomadas where conversa_id = c.id and usada_em is null;   -- um valendo por vez
  v_expira := now() + interval '7 days';
  insert into app.retomadas (org_id, conversa_id, codigo_hash, expira_em) values (c.org_id, c.id, p ->> 'codigo_hash', v_expira);
  perform privado.evento(c.org_id, c.id, 'retomada_criada');
  return jsonb_build_object('ok', true, 'expira_em', v_expira);
end $$;

-- a 3b-3 chama ao concluir ou encerrar o pedido: o link passa a valer só mais p_dias
create function privado.encerrar_links_do_pedido(p_conversa uuid, p_dias integer) returns void
language sql security definer set search_path = '' as $$
  update app.links_pedido set valido_ate = least(valido_ate, now() + make_interval(days => p_dias)) where conversa_id = p_conversa and revogado_em is null;
$$;
revoke all on function privado.encerrar_links_do_pedido(uuid, integer) from public, anon, authenticated, service_role;

create function privado.freio_dia(p_chave text, p_max integer) returns boolean
language sql security definer set search_path = '' as $$
  select privado.contar_ip(encode(sha256(convert_to(p_chave, 'UTF8')), 'hex'), p_max);
$$;
revoke all on function privado.freio_dia(text, integer) from public, anon, authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array['vendas_link_pedido_criar', 'vendas_link_pedido_usar', 'vendas_link_pedido_sair', 'vendas_retomada_do_cliente'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
