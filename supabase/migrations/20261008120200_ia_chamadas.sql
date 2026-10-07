-- ==========================================================================
-- P1 DA AUDITORIA DO HARNESS: o REGISTRO DAS CHAMADAS DE IA (ledger).
-- Antes, de uma decisão da IA só ficavam o turno e o custo somado: não dava
-- para responder "qual modelo, quais ferramentas, quanto custou, o que
-- falhou, em qual pedido". Agora cada chamada ao modelo vira uma linha, com
-- o id do pedido HTTP (x-request-id, o mesmo do log e da resposta).
-- Sem conteúdo: nem o texto da pessoa nem o do modelo (só números, nomes de
-- ferramenta e o motivo do erro). Só acréscimo: ninguém altera nem apaga.
-- ==========================================================================
-- (sem chave estrangeira, como a trilha financeira app.pagamentos_auditoria: com "on delete cascade", apagar uma
--  conversa ou um visitante — pedido de exclusão da LGPD, limpeza de anônimos — esbarrava no "só acréscimo" e falhava.
--  As linhas não têm dado pessoal: ficam como número do funil.)
create table app.ia_chamadas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  conversa_id     uuid not null,
  request_id      text check (request_id ~ '^[0-9a-f-]{36}$'),
  papel           text not null check (papel in ('conversa', 'extracao', 'geracao')),
  modelo          text check (char_length(modelo) <= 60),
  parada          text check (parada in ('fim', 'ferramenta', 'limite', 'recusa')),
  -- tempo/limite/indisponivel/falha = o PROVEDOR (contam no disjuntor); formato/recusa/entrada = o conteúdo;
  -- interno = erro do nosso código (nenhum dos dois conta no disjuntor)
  erro            text check (erro in ('tempo', 'limite', 'indisponivel', 'falha', 'formato', 'recusa', 'entrada', 'interno')),
  custo_usd       numeric(10, 6) not null default 0 check (custo_usd >= 0),
  tokens_entrada  integer check (tokens_entrada >= 0),
  tokens_saida    integer check (tokens_saida >= 0),
  ferramentas     text[] not null default '{}' check (cardinality(ferramentas) <= 20),
  ms              integer check (ms >= 0),
  created_at      timestamptz not null default clock_timestamp()   -- (a hora de CADA linha, não a da transação: o disjuntor ordena por ela)
);
create index ia_chamadas_org on app.ia_chamadas (org_id, created_at desc);
create index ia_chamadas_pedido on app.ia_chamadas (request_id);

revoke all on app.ia_chamadas from public, anon, authenticated, service_role;
grant select on app.ia_chamadas to authenticated;
grant select on app.ia_chamadas to service_role;   -- (quem grava é só app.vendas_registrar_ia, que confere o dono da conversa)
alter table app.ia_chamadas enable row level security;
create policy ia_chamadas_ler on app.ia_chamadas for select to authenticated using (org_id in (select privado.minhas_orgs()));

-- só acréscimo (a mesma regra da trilha financeira)
create function privado.ia_chamadas_so_acrescimo() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'o registro de chamadas de IA não se altera nem se apaga' using errcode = '42501';
end $$;
create trigger ia_chamadas_so_acrescimo before update or delete on app.ia_chamadas
for each row execute function privado.ia_chamadas_so_acrescimo();
create trigger ia_chamadas_sem_truncate before truncate on app.ia_chamadas
for each statement execute function privado.ia_chamadas_so_acrescimo();
revoke all on function privado.ia_chamadas_so_acrescimo() from public, anon, authenticated, service_role;

-- grava as chamadas de um pedido (o backend junta durante a ação e grava no fim, dê certo ou não)
create function app.vendas_registrar_ia(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c app.conversas; v_n integer;
begin
  select * into c from app.conversas where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  if not found then raise exception 'conversa não encontrada' using errcode = 'P0002'; end if;
  if jsonb_typeof(p -> 'chamadas') is distinct from 'array' or jsonb_array_length(p -> 'chamadas') > 20 then
    raise exception 'chamadas inválidas' using errcode = '22023';
  end if;
  insert into app.ia_chamadas (org_id, conversa_id, request_id, papel, modelo, parada, erro, custo_usd, tokens_entrada, tokens_saida, ferramentas, ms)
  select c.org_id, c.id, nullif(p ->> 'request_id', ''), x ->> 'papel', left(x ->> 'modelo', 60), x ->> 'parada', x ->> 'erro',
         greatest(0, coalesce((x ->> 'custo_usd')::numeric, 0)), (x ->> 'tokens_entrada')::integer, (x ->> 'tokens_saida')::integer,
         coalesce(array(select left(f, 40) from jsonb_array_elements_text(coalesce(x -> 'ferramentas', '[]')) f limit 20), '{}'),
         (x ->> 'ms')::integer
  from jsonb_array_elements(p -> 'chamadas') x;
  get diagnostics v_n = row_count;
  return jsonb_build_object('registradas', v_n);
end $$;
revoke all on function app.vendas_registrar_ia(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_registrar_ia(jsonb) to service_role;
