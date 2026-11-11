-- ==========================================================================
-- O RECADO ACEITA WHATSAPP (decisão do dono, 10/11 noite: "Não torne obrigatório o cliente por email. permita ele por o zap se
-- desejar."). Muda a de 28/10 ("site sem WhatsApp") SÓ no recado: o contato para a resposta é opcional e pode ser e-mail OU
-- WhatsApp. O site continua sem botão de WhatsApp; quem responde é o dono, à mão.
--
-- • whatsapp: opcional, pela MESMA regra do WhatsApp do site (js/orcamento-material-esquema.js WHATSAPP_SITE: +55, DDD, celular
--   com 9 ou fixo com 8 dígitos). O servidor normaliza o que a pessoa digita; aqui só o formato final entra.
-- • A retenção não muda: a linha inteira (texto, e-mail e WhatsApp) sai em 60 dias pela rotina diária (app.rotinas_recados).
-- • As duas funções são recriadas com o mesmo nome e a mesma assinatura: as permissões (só service_role) continuam.
-- ==========================================================================

alter table app.recados add column whatsapp text
  check (whatsapp is null or whatsapp ~ '^\+55[1-9][1-9](9[0-9]{8}|[2-8][0-9]{7})$');

create or replace function app.vendas_recado_criar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_texto text := btrim(coalesce(p ->> 'texto', ''));
  v_email text := nullif(lower(btrim(coalesce(p ->> 'email', ''))), '');
  v_whatsapp text := nullif(coalesce(p ->> 'whatsapp', ''), '');
  v_origem text := nullif(btrim(coalesce(p ->> 'origem', '')), '');
  v_conversa uuid;
  v_id uuid;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  if char_length(v_texto) not between 1 and 1000 or v_texto ~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f]'
     or (v_email is not null and (char_length(v_email) > 120 or char_length(split_part(v_email, '@', 1)) > 64
         or v_email !~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'))
     or (v_whatsapp is not null and v_whatsapp !~ '^\+55[1-9][1-9](9[0-9]{8}|[2-8][0-9]{7})$')
     or (v_origem is not null and v_origem !~ '^[a-z0-9_-]{1,30}$') then
    raise exception 'recado inválido' using errcode = '22023';
  end if;
  -- os freios: o do IP primeiro (quem passou da cota não gasta o teto do dia dos outros)
  if coalesce(p ->> 'chave_ip', '') ~ '^[0-9a-f]{64}$' and not privado.freio_hora('recado|ip|' || (p ->> 'chave_ip'), 5) then
    return jsonb_build_object('ok', false, 'motivo', 'freio');
  end if;
  if not privado.freio_dia('recado|dia|' || v_org, 200) then
    return jsonb_build_object('ok', false, 'motivo', 'cheio');
  end if;
  -- a conversa: só se for DESTE visitante; senão, sem ligação (nunca um erro que diga que a conversa existe)
  if coalesce(p ->> 'conversa_id', '') ~ '^[0-9a-f-]{36}$' and coalesce(p ->> 'visitante_id', '') ~ '^[0-9a-f-]{36}$' then
    select id into v_conversa from app.conversas
     where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid and org_id = v_org;
  end if;
  insert into app.recados (org_id, texto, email, whatsapp, origem, conversa_id)
    values (v_org, v_texto, v_email, v_whatsapp, v_origem, v_conversa) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function app.vendas_recados_listar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_limite integer := least(greatest(coalesce((p ->> 'limite')::integer, 50), 1), 100);
  v_so_nao_lidos boolean := coalesce((p ->> 'so_nao_lidos')::boolean, false);
  v_itens jsonb; v_total integer; v_nao_lidos integer;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  select count(*) filter (where not v_so_nao_lidos or lido_em is null), count(*) filter (where lido_em is null)
    into v_total, v_nao_lidos from app.recados where org_id = v_org;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'criado_em', x.criado_em, 'texto', x.texto, 'email', x.email, 'whatsapp', x.whatsapp,
           'origem', x.origem, 'conversa', left(x.conversa_id::text, 8), 'pedido_codigo', x.pedido_codigo, 'lido_em', x.lido_em) order by x.criado_em desc), '[]'::jsonb)
    into v_itens
    from (select r.*, pd.codigo as pedido_codigo from app.recados r left join app.pedidos pd on pd.org_id = r.org_id and pd.conversa_id = r.conversa_id
           where r.org_id = v_org and (not v_so_nao_lidos or r.lido_em is null) order by r.criado_em desc limit v_limite) x;
  return jsonb_build_object('itens', v_itens, 'total', v_total, 'nao_lidos', v_nao_lidos);
end $$;
