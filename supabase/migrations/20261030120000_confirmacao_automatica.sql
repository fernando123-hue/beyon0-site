-- Confirmação AUTOMÁTICA do pedido (Decisões 30/10: sem WhatsApp e sem clique do dono).
-- Antes: o pedido nascia "aguardando" e só virava "confirmado" (e só então as três direções entravam na fila) quando o
-- dono marcava "chegou a mensagem do WhatsApp" no painel. Agora: o pedido nasce confirmado, na MESMA transação dos freios
-- (uma vez por conversa, IP, /48, telefone, tentativas, teto da fila de 10). O dono segue podendo Descartar/Arquivar no painel.
-- A regra de registrar fica na função antiga, renomeada; a nova só a chama e acrescenta a confirmação (mesmo padrão de
-- vendas_estado_base). Nenhuma migration antiga foi editada. vendas_confirmar_whatsapp e a expiração ficam no banco sem uso novo.
alter function app.vendas_registrar_detalhes(jsonb) rename to vendas_registrar_detalhes_base;

create function app.vendas_registrar_detalhes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; c app.conversas; v_geracao jsonb; v_org uuid;
begin
  -- (S2) UMA fila: o teto de 10 e o limite por hora contam e entram na mesma transação, então os envios da organização
  -- passam um de cada vez (o volume é baixo; a trava da base é por telefone e não impediria a corrida entre números diferentes)
  perform pg_advisory_xact_lock(hashtextextended('pedidos-fila', 0));
  -- (S1) limite GLOBAL por hora: ninguém enche a fila em minutos, mesmo trocando de IP e de telefone. Mesma saída da fila cheia
  select c0.org_id into v_org from app.conversas c0 where c0.id = (p ->> 'conversa_id')::uuid;
  if v_org is not null and (select count(*) from app.pedidos pd where pd.org_id = v_org and pd.created_at >= now() - interval '1 hour')
       >= coalesce((p ->> 'max_por_hora')::integer, 5) then
    return jsonb_build_object('ok', false, 'motivo', 'limite_hora');
  end if;
  r := app.vendas_registrar_detalhes_base(p);
  -- recusado pelos freios: nada muda
  if r ->> 'ok' is distinct from 'true' then
    return r;
  end if;
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid;
  update app.pedidos set status = 'confirmado', confirmado_em = now() where conversa_id = c.id and status = 'aguardando';
  -- (o nome do evento é o de sempre, para o funil não perder a série; agora significa "pedido confirmado")
  perform privado.evento(c.org_id, c.id, 'confirmacao_whatsapp');
  -- confirmado, o pedido entra na fila: as três direções nascem agora (a 1ª geração), como na confirmação do dono
  v_geracao := app.vendas_iniciar_geracao(jsonb_build_object('conversa_id', c.id, 'visitante_id', c.visitante_id, 'max_geracoes', 1));
  return r || jsonb_build_object('status', 'confirmado', 'geracao', v_geracao -> 'geracao');
end $$;

revoke all on function app.vendas_registrar_detalhes_base(jsonb) from public, anon, authenticated, service_role;
revoke all on function app.vendas_registrar_detalhes(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_registrar_detalhes(jsonb) to service_role;

-- Pedidos que estavam "aguardando" (ainda dentro do prazo) quando esta migration for aplicada: promovidos a confirmado e com as
-- três direções iniciadas, para não ficarem sem tela nem painel (o painel antigo de confirmação saiu). Sem inventar dado: só o
-- estado e a geração, como a confirmação antiga faria; o teto vale para pedidos NOVOS (estes já existiam).
do $$
declare x record;
begin
  for x in select pd.id, pd.conversa_id, c.visitante_id from app.pedidos pd join app.conversas c on c.id = pd.conversa_id
            where pd.status = 'aguardando' and pd.expira_em > now() and c.etapa = 'contato' for update of pd loop
    update app.pedidos set status = 'confirmado', confirmado_em = now() where id = x.id;
    perform app.vendas_iniciar_geracao(jsonb_build_object('conversa_id', x.conversa_id, 'visitante_id', x.visitante_id, 'max_geracoes', 1));
  end loop;
end $$;
