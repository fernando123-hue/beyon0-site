-- Confirmação AUTOMÁTICA do pedido (Decisões 30/10: sem WhatsApp e sem clique do dono).
-- Antes: o pedido nascia "aguardando" e só virava "confirmado" (e só então as três direções entravam na fila) quando o
-- dono marcava "chegou a mensagem do WhatsApp" no painel. Agora: o pedido nasce confirmado, na MESMA transação dos freios
-- (uma vez por conversa, IP, /48, telefone, tentativas, teto da fila de 10). O dono segue podendo Descartar/Arquivar no painel.
-- A regra de registrar fica na função antiga, renomeada; a nova só a chama e acrescenta a confirmação (mesmo padrão de
-- vendas_estado_base). Nenhuma migration antiga foi editada. vendas_confirmar_whatsapp e a expiração ficam no banco sem uso novo.
alter function app.vendas_registrar_detalhes(jsonb) rename to vendas_registrar_detalhes_base;

create function app.vendas_registrar_detalhes(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; c app.conversas; v_geracao jsonb;
begin
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
