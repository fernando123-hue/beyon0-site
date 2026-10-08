-- ==========================================================================
-- DIREÇÃO EM ANDAMENTO, sem trava (revisão de segurança do PR 16, M1). O navegador repede cada direção a cada 60 s
-- enquanto a geração (até 300 s) roda; cada repedido entrava na reserva de custo, que trava a ORGANIZAÇÃO inteira,
-- só para ouvir de app.vendas_reivindicar_direcao que a posse é de outro pedido. Martelado, isso enfileira a trava
-- (503 para outros visitantes) e segura reservas no teto do dia. Esta consulta responde antes: só lê, não trava a
-- conversa nem a direção, e usa a MESMA regra de posse de vendas_reivindicar_direcao (iniciada há menos de vence_s,
-- padrão 360 s). Reivindicar continua sendo a decisão final; esta só evita a reserva quando não há o que fazer.
-- ==========================================================================
-- p = { conversa_id, visitante_id, direcao_id, vence_s? } → { status, em_andamento }
create function app.vendas_direcao_em_andamento(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d app.direcoes; v_vence interval := make_interval(secs => coalesce((p ->> 'vence_s')::integer, 360));
begin
  select x.* into d from app.direcoes x join app.conversas c on c.id = x.conversa_id
  where x.id = (p ->> 'direcao_id')::uuid and c.id = (p ->> 'conversa_id')::uuid and c.visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  return jsonb_build_object('status', d.status,
    'em_andamento', d.status = 'gerando' and d.iniciada_em is not null and d.iniciada_em > now() - v_vence);
end $$;
revoke all on function app.vendas_direcao_em_andamento(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_direcao_em_andamento(jsonb) to service_role;
