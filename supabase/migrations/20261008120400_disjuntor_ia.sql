-- ==========================================================================
-- P1 DA AUDITORIA DO HARNESS: o DISJUNTOR da IA (padrão do Sistema SBP).
-- Antes, com a Anthropic fora do ar, cada visitante tentava de novo (com as
-- novas tentativas automáticas do SDK) e esperava o tempo esgotar. Agora:
-- se as ÚLTIMAS 5 chamadas da organização nos últimos 10 minutos falharam
-- pelo PROVEDOR (tempo, limite, indisponível, falha HTTP 5xx/rede), vindas de
-- pelo menos 2 conversas diferentes, o site não chama o modelo e oferece o
-- WhatsApp. Passados 10 minutos, as falhas saem da janela e a próxima
-- chamada testa de novo ("meio aberto"). Lê o registro das chamadas
-- (app.ia_chamadas): vale entre instâncias da função.
-- Não contam: recusa, formato e entrada (vêm do conteúdo, que um visitante
-- controla) nem erro interno. As 2 conversas: um visitante sozinho, com uma
-- entrada que faça o provedor falhar, não derruba o agente de todos.
-- ==========================================================================
create function app.vendas_ia_disponivel(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('disponivel', not (
    count(*) = 5
    and bool_and(coalesce(x.erro in ('tempo', 'limite', 'indisponivel', 'falha'), false))
    and count(distinct x.conversa_id) >= 2))
  from (select c.erro, c.conversa_id from app.ia_chamadas c join app.organizacoes o on o.id = c.org_id
        where o.slug = p ->> 'org_slug' and c.created_at > now() - interval '10 minutes'
        order by c.created_at desc, c.id desc limit 5) x
$$;
revoke all on function app.vendas_ia_disponivel(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_ia_disponivel(jsonb) to service_role;
