-- ==========================================================================
-- ORÇAMENTO SEM IA (spec docs/specs/2026-10-11-orcamento-sem-ia.md, PR 1):
-- as respostas do formulário gravam o começo do briefing SEM turno de
-- conversa (sem mensagens, sem custo, sem contar turno). Só antes do contato
-- (descoberta, estimativa): depois disso o briefing é o que gerou os modelos.
-- ==========================================================================

-- o evento novo precisa estar na lista fechada de tipos do funil
-- (a lista é a de 20261008120000_auditoria_p0.sql mais 'respostas_formulario')
alter table app.eventos_funil drop constraint eventos_funil_tipo_check;
alter table app.eventos_funil add constraint eventos_funil_tipo_check check (tipo in (
  'conversa_iniciada', 'briefing_completo', 'estimativa_mostrada', 'contato_informado',
  'direcoes_solicitadas', 'direcoes_prontas', 'direcoes_falharam', 'direcao_escolhida',
  'alteracao_pedida', 'escopo_apresentado', 'escopo_confirmado', 'pagamento_iniciado',
  'pagamento_confirmado', 'ia_falhou', 'tentativa_bloqueada', 'freio_ip',
  'respostas_formulario'));

create function app.vendas_registrar_respostas(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas;
begin
  c := privado.conversa_do((p ->> 'conversa_id')::uuid, (p ->> 'visitante_id')::uuid);   -- (FOR UPDATE; de outro visitante: P0002)
  perform privado.exigir_etapa(c, array['descoberta', 'estimativa']);
  if jsonb_typeof(p -> 'briefing') is distinct from 'object' then raise exception 'briefing inválido' using errcode = '22023'; end if;
  update app.conversas set
    briefing = coalesce(briefing, '{}') || (p -> 'briefing'),
    confianca = least(1, greatest(0, coalesce((p ->> 'confianca')::numeric, confianca))),
    ultima_atividade = now()
  where id = c.id;
  perform privado.evento(c.org_id, c.id, 'respostas_formulario');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function app.vendas_registrar_respostas(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_registrar_respostas(jsonb) to service_role;
