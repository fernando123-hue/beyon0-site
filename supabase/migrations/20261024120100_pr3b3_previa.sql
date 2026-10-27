-- ==========================================================================
-- PR 3b-3: A PRÉVIA (spec §2 e §3). Parte 1 (cliente): o que a tela recebe (privado.entrega_json estendido), a lista de ajustes e a aprovação.
-- Toda função: conversa_do (dono da sessão) → entrega no passo exigido (privado.entrega_trava, que também confere o sinal pago) → o resto.
-- Ordem de travas: conversa → entrega (a mesma de todas as funções de entrega; nunca o contrário).
-- Recusa de regra volta como { ok: false, motivo }; exceção só para dono errado (P0002), passo errado ou sinal estornado (55000),
-- dado malformado (22023) e corrida (40001).
-- O PRAZO é calculado no servidor (JS, a regra da captação) e chega pronto; o banco guarda e confere a `versao` (entregas.updated_at).
-- D5: nenhuma função daqui é de rotina e nenhuma aprova por tempo. Só estas duas mudam previa → ajustes/aprovada, e só no nome do cliente dono da conversa.
-- Aplicar DEPOIS de 20261024120000_pr3b3_esquema.sql. As próximas tarefas acrescentam seções ao fim deste arquivo.
-- ==========================================================================

-- ==========================================================================
-- SEÇÃO 1. O que a tela recebe (privado.entrega_json)
-- ==========================================================================
-- (já existe, criada na 3b-2 com `create function`; aqui `create or replace` com a MESMA assinatura)
-- O texto da lista de ajustes, o telefone e o e-mail do site NUNCA entram aqui.

create or replace function privado.entrega_json(p_conversa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; m app.materiais; pr app.propostas; v_dias integer;
begin
  select * into e from app.entregas where conversa_id = p_conversa;
  if not found then return null; end if;
  select * into m from app.materiais where entrega_id = e.id;
  select * into pr from app.propostas where id = e.proposta_id;
  -- dias CORRIDOS desde o REGISTRO do aviso "seu site está no ar", no dia de Campo Grande (a regra de 22/10: o restante vale 3 dias a partir dele; antes do registro, nulo)
  v_dias := case when e.aviso_no_ar_feito_em is null then null
                 else (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date end;
  return jsonb_build_object(
    'id', e.id, 'passo', e.passo, 'prazo_dias', e.prazo_dias, 'entrega_ate', e.entrega_ate, 'prazo', e.prazo,
    'entrada_paga_em', e.prazo ->> 'entrada_em',
    'versao', e.updated_at,
    'importada', e.cliente_captacao is not null,
    'percentuais', jsonb_build_object('entrada', pr.sinal_percentual, 'restante', 100 - pr.sinal_percentual),
    'link_pedido', exists (select 1 from app.links_pedido l where l.conversa_id = p_conversa and l.revogado_em is null and l.valido_ate > now()),
    'rodadas', jsonb_build_object('usadas', e.rodadas_usadas, 'max', e.rodadas_max),
    'previa', jsonb_build_object('url', e.previa_url, 'em', e.previa_em),
    'site', jsonb_build_object('url', e.site_url, 'no_ar_em', e.no_ar_em, 'aviso_em', e.aviso_no_ar_feito_em, 'dias_do_aviso', v_dias, 'limite_dias', 3),
    'aprovada_em', e.aprovada_em, 'suspensa_em', e.suspensa_em, 'concluida_em', e.concluida_em,
    'material', jsonb_build_object('status', m.status, 'dados', m.dados, 'negocio', m.negocio, 'autorizacao', m.autorizacao,
      'enviado_em', m.enviado_em, 'updated_at', m.updated_at,
      'arquivos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'papel', a.papel, 'ordem', a.ordem,
                              'tamanho', coalesce(a.tamanho_real, a.tamanho_declarado), 'status', a.status) order by a.papel, a.ordem, a.created_at)
                              from app.material_arquivos a where a.entrega_id = e.id and a.status in ('reservado', 'conferido')), '[]'::jsonb)));
end $$;

-- ==========================================================================
-- SEÇÃO 2. As ações do cliente na prévia: a lista de ajustes e aprovar
-- ==========================================================================

-- ---------- a lista de ajustes: previa → ajustes (conta 1 rodada; a 3ª é recusada, D2) ----------
-- O texto livre já chega REDIGIDO pelo servidor. O WhatsApp/telefone e o e-mail DO SITE (M3, 22/10) chegam em campos próprios, já normalizados, e só valem com a
-- autorização de uso no site (a mesma do material): o banco confere o formato de novo (a mesma regra da tela e do servidor) e grava a data da autorização.
create function app.vendas_previa_ajustes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_texto text := btrim(coalesce(p ->> 'texto', '')); v_agora timestamptz; v_versao_vista timestamptz; v_ate date; v_conversa uuid; v_visitante uuid;
        v_whats text := nullif(btrim(coalesce(p ->> 'whatsapp', '')), ''); v_email text := nullif(btrim(coalesce(p ->> 'email', '')), '');
        v_versao text := nullif(btrim(coalesce(p ->> 'autorizacao_versao', '')), '');
begin
  if char_length(v_texto) > 1500 or (v_texto = '' and v_whats is null and v_email is null) or coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = ''
     or jsonb_typeof(p -> 'prazo') is distinct from 'object' or coalesce(p ->> 'entrega_ate', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p ->> 'rodada_base', '') !~ '^[0-9]{1,2}$' then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end if;
  -- o contato do site: formato, tamanho e autorização (a mesma regra do check da tabela)
  if (v_whats is not null and v_whats !~ '^\+55[1-9][1-9](9[0-9]{8}|[2-8][0-9]{7})$')
     or (v_email is not null and (char_length(v_email) > 120 or char_length(split_part(v_email, '@', 1)) > 64
         or v_email !~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'))
     or ((v_whats is not null or v_email is not null) and (v_versao is null or char_length(v_versao) > 20)) then
    raise exception 'previa: contato do site inválido' using errcode = '22023';
  end if;
  -- datas e ids malformados (ex.: 2026-02-31) são dado ruim, não erro de conversão
  begin
    v_agora := (p ->> 'agora')::timestamptz; v_versao_vista := (p ->> 'versao')::timestamptz; v_ate := (p ->> 'entrega_ate')::date;
    v_conversa := (p ->> 'conversa_id')::uuid; v_visitante := (p ->> 'visitante_id')::uuid;
  exception when others then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'previa: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_trava(v_conversa, v_visitante, array['previa']);
  if e.updated_at is distinct from v_versao_vista or e.rodadas_usadas <> (p ->> 'rodada_base')::integer then
    raise exception 'a prévia mudou enquanto você escrevia' using errcode = '40001';
  end if;
  if e.rodadas_max is not null and e.rodadas_usadas >= e.rodadas_max then return jsonb_build_object('ok', false, 'motivo', 'rodadas'); end if;
  insert into app.entrega_ajustes (org_id, entrega_id, rodada, texto, contato_whatsapp, contato_email, contato_autorizado_em, contato_autorizacao_versao)
  values (e.org_id, e.id, e.rodadas_usadas + 1, v_texto, v_whats, v_email,
          case when v_whats is not null or v_email is not null then v_agora end, case when v_whats is not null or v_email is not null then v_versao end);
  update app.entregas set passo = 'ajustes', rodadas_usadas = rodadas_usadas + 1, prazo = prazo || (p -> 'prazo'),
         entrega_ate = v_ate, updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'previa_ajustes', jsonb_build_object('rodada', e.rodadas_usadas + 1));
  return jsonb_build_object('ok', true, 'rodada', e.rodadas_usadas + 1);
end $$;

-- ---------- aprovar: previa → aprovada (só o cliente, D5) ----------
create function app.vendas_previa_aprovar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e app.entregas; v_agora timestamptz; v_versao_vista timestamptz; v_conversa uuid; v_visitante uuid;
begin
  if coalesce(p ->> 'agora', '') = '' or coalesce(p ->> 'versao', '') = '' or jsonb_typeof(p -> 'prazo') is distinct from 'object' then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end if;
  begin
    v_agora := (p ->> 'agora')::timestamptz; v_versao_vista := (p ->> 'versao')::timestamptz;
    v_conversa := (p ->> 'conversa_id')::uuid; v_visitante := (p ->> 'visitante_id')::uuid;
  exception when others then
    raise exception 'previa: parâmetros inválidos' using errcode = '22023';
  end;
  if abs(extract(epoch from (now() - v_agora))) > 300 then raise exception 'previa: relógio fora da janela' using errcode = '22023'; end if;
  e := privado.entrega_trava(v_conversa, v_visitante, array['previa']);
  if e.updated_at is distinct from v_versao_vista then raise exception 'a prévia mudou' using errcode = '40001'; end if;
  update app.entregas set passo = 'aprovada', aprovada_em = v_agora, prazo = prazo || (p -> 'prazo'), updated_at = now() where id = e.id;
  perform privado.evento(e.org_id, e.conversa_id, 'previa_aprovada');
  return jsonb_build_object('ok', true);
end $$;

-- ---------- permissões: só o servidor (service_role) chama ----------
do $$
declare f text;
begin
  foreach f in array array['vendas_previa_ajustes', 'vendas_previa_aprovar'] loop
    execute format('revoke all on function app.%I(jsonb) from public, anon, authenticated', f);
    execute format('grant execute on function app.%I(jsonb) to service_role', f);
  end loop;
end $$;
