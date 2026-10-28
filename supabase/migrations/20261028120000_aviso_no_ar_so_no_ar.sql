-- (28/10) A fila de avisos do dono passa a dizer o PASSO da entrega e o aviso "no ar" só vale com o site NO AR.
-- O erro: vendas_avisos_lista (3b-3, refeita no 3b-3c) deixava o aviso "no ar" pendente entrar na fila também com a entrega `suspensa`. O painel então ofereceria a mensagem
-- pronta "O seu site está no ar!" para um cliente cujo site saiu do ar por falta do restante. Pelo fluxo normal isso não acontece (para suspender é preciso ter registrado o aviso,
-- e registrar tira o pendente), mas a trava não pode depender do caminho: a fila filtra na origem. Se a entrega voltar a `no_ar`, o aviso pendente volta à fila.
-- Não há mensagem do dono para a suspensa (a tela do cliente já diz "Seu site saiu do ar"; religar o site é pela captação), então nada é oferecido no lugar.
-- Função refeita com `create or replace` (a assinatura é a mesma), copiada da versão de 20261024120300_pr3b3_rotina.sql: só mudam o filtro do "no_ar" e a coluna `passo`.
create or replace function app.vendas_avisos_lista(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_itens jsonb;
begin
  select id into v_org from app.organizacoes where slug = p ->> 'org_slug';
  if not found then raise exception 'organização não encontrada' using errcode = 'P0002'; end if;
  with x as (
    select e.conversa_id, 'previa'::text as momento, e.aviso_previa_desde as desde, e.passo from app.entregas e
     where e.org_id = v_org and e.aviso_previa_desde is not null and e.passo = 'previa'
    union all   -- (28/10) só com o site no ar: suspensa (e qualquer outro passo) não oferece "O seu site está no ar!"
    select e.conversa_id, 'no_ar', e.aviso_no_ar_desde, e.passo from app.entregas e
     where e.org_id = v_org and e.aviso_no_ar_desde is not null and e.passo = 'no_ar'
    union all   -- (22/10) material parado: dia 30 sem o material, SEM número autorizado e sem o aviso já registrado
    select e.conversa_id, 'material_parado', (e.prazo ->> 'entrada_em')::timestamptz + interval '30 days', e.passo from app.entregas e join app.materiais m on m.entrega_id = e.id
     where e.org_id = v_org and e.passo = 'material' and e.aviso_material_em is null
       and (now() at time zone 'America/Campo_Grande')::date - ((e.prazo ->> 'entrada_em')::timestamptz at time zone 'America/Campo_Grande')::date >= 30
       and not privado.material_autorizado(m)
    union all   -- (22/10) o aviso prévio do apagamento do material: o projeto parado completou 5 meses (privado.material_apagar_devido)
    select e.conversa_id, 'material_apagar', ((privado.material_parado_desde(e) at time zone 'America/Campo_Grande')::date + interval '5 months') at time zone 'America/Campo_Grande', e.passo from app.entregas e
     where e.org_id = v_org and privado.material_apagar_devido(e)
    union all   -- (22/10) o lembrete do 2º dia depois do aviso "no ar"
    select e.conversa_id, 'restante_lembrete_1', e.aviso_no_ar_feito_em + interval '2 days', e.passo from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_1_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 2
    union all   -- (22/10) o último lembrete, no 3º dia
    select e.conversa_id, 'restante_lembrete_2', e.aviso_no_ar_feito_em + interval '3 days', e.passo from app.entregas e
     where e.org_id = v_org and e.passo = 'no_ar' and e.aviso_no_ar_feito_em is not null and e.lembrete_restante_2_em is null
       and (now() at time zone 'America/Campo_Grande')::date - (e.aviso_no_ar_feito_em at time zone 'America/Campo_Grande')::date >= 3)
  select coalesce(jsonb_agg(jsonb_build_object('conversa_id', c.id, 'codigo', pd.codigo, 'momento', x.momento, 'passo', x.passo, 'desde', x.desde,
           'contato', jsonb_build_object('nome', l.nome, 'telefone', l.telefone, 'email', l.email)) order by x.desde), '[]'::jsonb) into v_itens
    from x join app.conversas c on c.id = x.conversa_id join app.pedidos pd on pd.conversa_id = c.id left join app.leads l on l.org_id = c.org_id and l.id = c.lead_id;
  return jsonb_build_object('itens', v_itens, 'total', jsonb_array_length(v_itens));
end $$;

-- os mesmos privilégios da função original (só o servidor): o `create or replace` mantém, e o revoke/grant abaixo repete o que a 3b-3 e a rotina fizeram
revoke all on function app.vendas_avisos_lista(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_avisos_lista(jsonb) to service_role;
