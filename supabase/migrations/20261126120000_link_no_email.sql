-- ==========================================================================
-- O LINK DO PEDIDO NO E-MAIL DA CONFIRMAÇÃO (decisão do dono, 19/11/2026: "o cliente não tem que se preocupar com nenhum código,
-- com nada; isso é do nosso sistema"). O e-mail da entrada paga (api/_pagamentos/confirmacao.mjs) passa a levar o link pessoal
-- do pedido, <origem>/orcamento#pedido=<código>, o mesmo que a página gera em "Guarde o link do seu pedido".
-- • O servidor sorteia o código depois da reserva da confirmação e manda ao banco SÓ o hash (o mesmo de api/_vendas/link-pedido.mjs).
--   O banco cria o link se a conversa não tem um vivo. Se já tem (o cliente gerou o dele na página antes de o e-mail sair), NÃO troca:
--   o link que o cliente guardou continua valendo e o e-mail vai sem link, com a frase de antes. Nunca revoga nada.
-- • Só para a entrada paga cuja confirmação foi RESERVADA há menos de 1 hora (a função não vira um gerador de links), na etapa
--   em_producao, com a entrega criada e o sinal pago: as mesmas condições de app.vendas_link_pedido_criar.
-- • `desfazer`: o Resend recusou o envio (o e-mail não saiu): apaga o link criado para ele, se ainda não foi usado. Ninguém o
--   recebeu; a página volta a gerar e mostrar o dela. Vale mesmo passada a 1 hora (um envio lento não deixa o link vivo).
-- • app.links_pedido.pelo_email: o link foi criado para o e-mail. app.vendas_estado ganha entrega.link_no_email (o link vivo foi
--   por e-mail), para a página dizer "está no seu e-mail" em vez de "gere um novo" (que revogaria o do e-mail).
-- ORDEM DE TRAVAS: a conversa antes do link (a mesma de 20261023120200_pr3b2_link_pedido.sql). A reserva da confirmação já
-- terminou (outra transação): nenhuma trava de tentativa fica presa aqui (pagamentos_aplicar trava conversa → tentativa).
-- ==========================================================================

alter table app.links_pedido add column pelo_email boolean not null default false;

create or replace function app.pagamentos_link_da_confirmacao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := coalesce(p ->> 'codigo_hash', '');
  v_tid uuid;
  v_conversa uuid;
  v_proposta uuid;
  c app.conversas;
  e app.entregas;
  v_n integer;
  v_desfazer boolean := coalesce((p ->> 'desfazer')::boolean, false);
  v_reservada_em timestamptz;
begin
  if v_hash !~ '^[0-9a-f]{64}$' or coalesce(p ->> 'tentativa_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'link da confirmação: parâmetros inválidos' using errcode = '22023';
  end if;
  v_tid := (p ->> 'tentativa_id')::uuid;
  -- a entrada desta tentativa, com a confirmação reservada (as mesmas junções da reserva, 20261115130000)
  select pr.conversa_id, pr.id, t.confirmacao_email_em into v_conversa, v_proposta, v_reservada_em
    from app.tentativas_pagamento t
    join app.pagamentos pg on pg.org_id = t.org_id and pg.id = t.pagamento_id
    join app.propostas pr on pr.org_id = pg.org_id and pr.id = pg.proposta_id
   where t.id = v_tid and t.status = 'aprovada' and pg.parcela = 'sinal' and pg.gateway_ref = t.provedor_order_id
     and t.confirmacao_email_em is not null and pr.conversa_id is not null;
  if not found then
    return case when v_desfazer then jsonb_build_object('ok', true, 'desfeito', false)
                else jsonb_build_object('ok', true, 'criado', false, 'motivo', 'fora_da_confirmacao') end;
  end if;
  -- criar só logo depois da reserva (a função não vira um gerador de links); desfazer vale sempre (o envio lento não deixa o link vivo)
  if not v_desfazer and v_reservada_em <= now() - interval '1 hour' then
    return jsonb_build_object('ok', true, 'criado', false, 'motivo', 'fora_da_confirmacao');
  end if;
  select * into c from app.conversas where id = v_conversa for update;   -- trava 1: a conversa

  if v_desfazer then
    delete from app.links_pedido
     where conversa_id = c.id and codigo_hash = v_hash and pelo_email and revogado_em is null and ultimo_uso_em is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then perform privado.evento(c.org_id, c.id, 'link_pedido_revogado', jsonb_build_object('pelo_email', true, 'motivo', 'email_nao_saiu')); end if;
    return jsonb_build_object('ok', true, 'desfeito', v_n > 0);
  end if;

  select * into e from app.entregas where conversa_id = c.id and proposta_id = v_proposta;
  if c.etapa <> 'em_producao' or e.id is null or not privado.sinal_pago(e.proposta_id) then
    return jsonb_build_object('ok', true, 'criado', false, 'motivo', 'fora_do_pedido');
  end if;
  -- trava 2: o link. Já existe um (vivo, mesmo vencido): não se mexe nele; o e-mail vai sem link
  perform 1 from app.links_pedido where conversa_id = c.id and revogado_em is null for update;
  if found then return jsonb_build_object('ok', true, 'criado', false, 'motivo', 'ja_tem_link'); end if;
  insert into app.links_pedido (org_id, conversa_id, codigo_hash, valido_ate, pelo_email)
  values (c.org_id, c.id, v_hash, now() + interval '120 days', true);   -- (os 120 dias do link da página, 20261023120200)
  perform privado.evento(c.org_id, c.id, 'link_pedido_criado', jsonb_build_object('pelo_email', true));
  return jsonb_build_object('ok', true, 'criado', true);
end $$;
revoke all on function app.pagamentos_link_da_confirmacao(jsonb) from public, anon, authenticated;
grant execute on function app.pagamentos_link_da_confirmacao(jsonb) to service_role;

-- ---------- a leitura do cliente: link_no_email ----------
alter function app.vendas_estado(jsonb) rename to vendas_estado_antes_link_email;
revoke all on function app.vendas_estado_antes_link_email(jsonb) from public, anon, authenticated, service_role;

create function app.vendas_estado(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := app.vendas_estado_antes_link_email(p);   -- (o dono da conversa é conferido lá: de outro visitante, P0002)
  if jsonb_typeof(r -> 'entrega') = 'object' then
    r := jsonb_set(r, '{entrega,link_no_email}', to_jsonb(exists (
      select 1 from app.links_pedido l
       where l.conversa_id = (r #>> '{conversa,id}')::uuid and l.revogado_em is null and l.valido_ate > now() and l.pelo_email)));
  end if;
  return r;
end $$;
revoke all on function app.vendas_estado(jsonb) from public, anon, authenticated;
grant execute on function app.vendas_estado(jsonb) to service_role;
