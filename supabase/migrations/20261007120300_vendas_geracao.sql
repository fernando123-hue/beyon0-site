-- ==========================================================================
-- FASE 2 — geração das direções: um pedido por direção (cabe no limite de
-- 300 s por função do plano Hobby da Vercel), as 3 em paralelo, com POSSE:
-- quem vai gerar "reivindica" a direção; outra aba ou um clique duplo não
-- gera a mesma de novo; uma posse abandonada (aba fechada no meio) vence em
-- 6 minutos e pode ser retomada. A direção nunca fica "gerando" para sempre.
-- ==========================================================================
alter table app.direcoes add column iniciada_em timestamptz;

create function app.vendas_reivindicar_direcao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; d app.direcoes; e app.estimativas; v_vence interval := make_interval(secs => coalesce((p ->> 'vence_s')::integer, 360));
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  select * into d from app.direcoes where id = (p ->> 'direcao_id')::uuid and conversa_id = c.id for update;
  if not found then raise exception 'direção não encontrada' using errcode = 'P0002'; end if;
  if d.status <> 'gerando' then return jsonb_build_object('reivindicada', false, 'status', d.status); end if;
  if d.iniciada_em is not null and d.iniciada_em > now() - v_vence then
    return jsonb_build_object('reivindicada', false, 'status', 'em_andamento');
  end if;
  update app.direcoes set iniciada_em = now() where id = d.id;
  select * into e from app.estimativas where conversa_id = c.id order by created_at desc limit 1;
  return jsonb_build_object('reivindicada', true, 'direcao_id', d.id, 'numero', d.numero, 'estrategia', d.estrategia, 'geracao', d.geracao,
                            'briefing', c.briefing, 'fatores', e.fatores, 'prazo_dias', e.prazo_dias, 'fase', e.fase);
end $$;

revoke all on function app.vendas_reivindicar_direcao(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reivindicar_direcao(jsonb) to service_role;
