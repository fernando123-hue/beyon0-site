-- O orçamento como conversa (spec docs/superpowers/specs/2026-11-13-orcamento-conversa-design.md §5; PR 3): QUAL texto de aceite a pessoa viu.
-- A prova do consentimento é do controlador (LGPD art. 8º §2º): além de quando (contato_aceite_em, de antes), a conversa guarda a versão do texto
-- exibido e o hash dele (SHA-256, calculado pelo servidor a partir do texto da versão; o cliente só diz qual versão viu). Não são dado pessoal:
-- provam o texto, não a pessoa; por isso a retenção não precisa apagá-los.
alter table app.conversas
  add column contato_aceite_versao text check (contato_aceite_versao ~ '^a[0-9]{1,3}$'),
  add column contato_aceite_hash text check (contato_aceite_hash ~ '^[0-9a-f]{64}$');

-- os detalhes do pedido COM a versão do aceite, numa transação só: a função de hoje (freios, pedido, contato, contato_aceite_em) e, se ela
-- gravou o pedido, a versão e o hash do texto aceito. Sem versão ou hash bem formados, nada é gravado
create function app.vendas_registrar_detalhes_com_aceite(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if coalesce(p ->> 'aceite_versao', '') !~ '^a[0-9]{1,3}$' or coalesce(p ->> 'aceite_hash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'versão do aceite inválida' using errcode = '22023';
  end if;
  r := app.vendas_registrar_detalhes(p - 'aceite_versao' - 'aceite_hash');
  if coalesce((r ->> 'ok')::boolean, false) then
    update app.conversas set contato_aceite_versao = p ->> 'aceite_versao', contato_aceite_hash = p ->> 'aceite_hash'
      where id = (p ->> 'conversa_id')::uuid and visitante_id = (p ->> 'visitante_id')::uuid;
  end if;
  return r;
end $$;

-- só o backend executa (o padrão das funções de vendas)
revoke all on function app.vendas_registrar_detalhes_com_aceite(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_registrar_detalhes_com_aceite(jsonb) to service_role;
