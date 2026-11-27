-- ==========================================================================
-- Mapa vivo v2, fase 1b (PR #274, revisão técnica, achado 1): o DISJUNTOR da IA
-- (app.vendas_ia_disponivel, 20261008120400) passa a ignorar as reações do
-- Mapa vivo, que o registro guarda como papel 'extracao' (api/_vendas/fluxo.mjs,
-- PAPEL_NO_REGISTRO). Sem isto, reações boas (muitas por minuto, modelo barato)
-- empurravam para fora da janela das 5 últimas linhas as falhas do Zero
-- consultor (Sonnet/Opus) e escondiam uma queda real; e reações falhando
-- podiam fechar o Zero para todos. É o que faltava para ligar BZ_REACAO em
-- produção. Mesma regra de antes para 'conversa' e 'geracao'.
-- Só troca o corpo da função (mesma assinatura, mesmo dono): o revoke/grant
-- de 20261008120400 continua valendo; repetido abaixo por segurança.
-- ==========================================================================
create or replace function app.vendas_ia_disponivel(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('disponivel', not (
    count(*) = 5
    and bool_and(coalesce(x.erro in ('tempo', 'limite', 'indisponivel', 'falha'), false))
    and count(distinct x.conversa_id) >= 2))
  from (select c.erro, c.conversa_id from app.ia_chamadas c join app.organizacoes o on o.id = c.org_id
        where o.slug = p ->> 'org_slug' and c.created_at > now() - interval '10 minutes'
          and c.papel <> 'extracao'
        order by c.created_at desc, c.id desc limit 5) x
$$;
revoke all on function app.vendas_ia_disponivel(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_ia_disponivel(jsonb) to service_role;
