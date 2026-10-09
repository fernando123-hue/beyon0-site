-- ==========================================================================
-- RETENÇÃO: o ajuste da conversa parada sai INTEIRO (auditoria 2026-10-09,
-- segurança 10). A política de privacidade diz que os pedidos de ajuste são
-- apagados aos 2 meses; a vendas_reter apagava só app.alteracoes.pedido e
-- deixava:
-- • mudancas: as operações traduzidas do pedido, com o texto novo que a
--   pessoa pediu (trocar_texto → valor) e a descrição do que não coube;
-- • resultado: a direção com esses textos aplicados.
-- Agora os três saem. Fica a linha (houve um ajuste, e de que tipo de
-- status), como os números do orçamento.
-- A regra "ajuste aplicado tem resultado" passa a aceitar o ajuste apagado
-- pela retenção (pedido '[apagado]' e sem operações); para ajuste novo ela
-- continua igual. Sem a direção ajustada, vendas_estado devolve
-- versao_final nulo e a prévia volta à direção escolhida.
-- O resto da função é igual à versão anterior (20261008120600).
-- ==========================================================================
do $$
declare v_nome text;
begin
  -- a regra antiga não tem nome próprio (o Postgres a chamou pela tabela): acha pela definição
  for v_nome in
    select conname from pg_constraint
    where conrelid = 'app.alteracoes'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%aplicada%' and pg_get_constraintdef(oid) like '%resultado%'
  loop
    execute format('alter table app.alteracoes drop constraint %I', v_nome);
  end loop;
end $$;

alter table app.alteracoes add constraint alteracoes_aplicada_tem_resultado
  check (status <> 'aplicada' or resultado is not null or (pedido = '[apagado]' and mudancas = '[]'::jsonb));

create or replace function app.vendas_reter(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dias integer := coalesce((p ->> 'dias')::integer, 60);
  v_limite timestamptz;
  v_velhas uuid[];
  v_conversas integer;
  v_mensagens integer;
  v_ajustes integer;
  v_freio integer;
  v_leads integer;
  v_anonimos uuid[];
begin
  if v_dias < 30 then raise exception 'retenção mínima de 30 dias' using errcode = '22023'; end if;
  v_limite := now() - make_interval(days => v_dias);
  -- as conversas paradas que não fecharam
  select coalesce(array_agg(c.id), '{}') into v_velhas
  from app.conversas c
  where c.ultima_atividade < v_limite
    and c.etapa <> 'em_producao'
    and not exists (
      select 1 from app.propostas pr join app.pagamentos pg on pg.org_id = pr.org_id and pg.proposta_id = pr.id
      where pr.org_id = c.org_id and pr.conversa_id = c.id
        and (pg.status in ('pago', 'estornado', 'contestado') or (pg.status = 'pendente' and pg.created_at >= v_limite)));

  delete from app.mensagens m where m.conversa_id = any(v_velhas);
  get diagnostics v_mensagens = row_count;
  -- o ajuste também é texto do visitante: o pedido, as operações traduzidas dele e a direção com elas aplicadas
  update app.alteracoes a set pedido = '[apagado]', mudancas = '[]', resultado = null
  where a.conversa_id = any(v_velhas)
    and (a.pedido <> '[apagado]' or a.mudancas <> '[]'::jsonb or a.resultado is not null);
  get diagnostics v_ajustes = row_count;
  update app.conversas c set briefing = '{}' where c.id = any(v_velhas) and c.briefing <> '{}';
  get diagnostics v_conversas = row_count;

  -- o contato de quem não fechou: anonimizado (os ids voltam para limpar a conversa)
  with anonimizados as (
  update app.leads l
  set nome = '[apagado]', email = null, telefone = null, empresa = null, observacoes = null, motivo_perda = null,
      codigo_visita = null, termo = null   -- (o código da visita liga às métricas da visita; o termo é o que a pessoa buscou)
  where l.nome is distinct from '[apagado]'
    and l.updated_at < v_limite
    and l.status not in ('ganho', 'proposta') and l.cliente_id is null
    and exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id)
    and not exists (select 1 from app.conversas c where c.org_id = l.org_id and c.lead_id = l.id and not (c.id = any(v_velhas)))
    and not exists (select 1 from app.projetos pr where pr.org_id = l.org_id and pr.lead_id = l.id)
  returning l.id)
  select coalesce(array_agg(id), '{}') into v_anonimos from anonimizados;
  v_leads := cardinality(v_anonimos);
  -- na conversa do lead anonimizado: o código da visita e o termo (ligam às métricas) e o aceite, que valia para o
  -- contato que saiu (se a pessoa voltar e informar de novo, um aceite novo é registrado)
  update app.conversas c set codigo_visita = null, termo = null, contato_aceite_em = null
  where c.lead_id = any(v_anonimos);

  delete from privado.freio_ip where dia < (now() at time zone 'America/Sao_Paulo')::date - 1;
  get diagnostics v_freio = row_count;
  return jsonb_build_object('mensagens_apagadas', v_mensagens, 'briefings_esvaziados', v_conversas, 'ajustes_esvaziados', v_ajustes,
                            'leads_anonimizados', v_leads, 'dias', v_dias, 'freio_apagado', v_freio);
end $$;

revoke all on function app.vendas_reter(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_reter(jsonb) to service_role;
