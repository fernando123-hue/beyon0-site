-- ==========================================================================
-- CONVERSA ABERTA ATÉ O PAGAMENTO (PROPOSTA de 2026-10-09, §4, item 3b).
-- Antes, o consultor sumia no escopo e na tela do sinal, que é a hora mais
-- tensa. Agora a pessoa pode perguntar nessas duas etapas, só para dúvidas:
-- • aguardando_pagamento passa a aceitar o turno (o escopo já aceitava);
-- • no escopo e no sinal o turno grava pergunta e resposta, conta o turno e
--   o custo, mas NÃO mexe no briefing nem na confiança: o escopo confirmado
--   foi montado com eles. A API também não manda (api/_vendas/fluxo.mjs);
--   aqui é a segunda trava.
-- • em_producao e encerrada continuam fechadas.
-- A estimativa segue recusada nessas etapas (vendas_registrar_estimativa).
-- O resto da função é igual à versão anterior (20261007120100).
-- ==========================================================================

create or replace function app.vendas_registrar_turno(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_conf numeric; v_completo boolean; v_so_duvidas boolean;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);
  if c.etapa in ('em_producao', 'encerrada') then
    raise exception 'esta conversa não recebe mais mensagens do agente' using errcode = '55000';
  end if;
  v_so_duvidas := c.etapa in ('escopo', 'aguardando_pagamento');
  insert into app.mensagens (org_id, conversa_id, papel, conteudo) values (c.org_id, c.id, 'visitante', p ->> 'mensagem_visitante');
  insert into app.mensagens (org_id, conversa_id, papel, conteudo) values (c.org_id, c.id, 'agente', p ->> 'mensagem_agente');
  v_conf := case when v_so_duvidas then c.confianca
                 else least(1, greatest(0, coalesce((p ->> 'confianca')::numeric, c.confianca))) end;
  v_completo := c.confianca < 0.7 and v_conf >= 0.7;
  update app.conversas set
    briefing = case when v_so_duvidas then briefing else coalesce(p -> 'briefing', briefing) end,
    confianca = v_conf,
    turnos = turnos + 1,
    custo_ia_usd = custo_ia_usd + greatest(0, coalesce((p ->> 'custo_usd')::numeric, 0)),
    ultima_atividade = now()
  where id = c.id;
  if v_completo then perform privado.evento(c.org_id, c.id, 'briefing_completo'); end if;
  return jsonb_build_object('turnos', c.turnos + 1, 'briefing_completo', v_conf >= 0.7);
end $$;

revoke all on function app.vendas_registrar_turno(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_registrar_turno(jsonb) to service_role;
