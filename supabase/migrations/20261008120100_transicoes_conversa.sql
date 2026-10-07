-- ==========================================================================
-- P1 DA AUDITORIA DO HARNESS: a MÁQUINA DE ESTADOS da conversa num lugar só.
-- Antes, cada função conferia a sua lista de etapas (8 listas) e o banco
-- aceitava qualquer UPDATE de etapa (o pagamento já tinha gatilho; a
-- conversa, não). Agora a tabela abaixo é a regra, e um gatilho recusa
-- qualquer mudança de etapa que não esteja nela, venha de função, de
-- painel ou de SQL à mão. As listas das funções continuam (dão a mensagem
-- certa ao visitante); o gatilho é a rede de baixo.
-- Montar cenário de teste ou manutenção à mão do dono: numa transação,
--   set local bz.transicao_livre = 'on';
-- ==========================================================================
create table privado.transicoes_conversa (
  de     text not null,
  para   text not null,
  quem   text not null,          -- a função que faz a transição (documentação viva)
  primary key (de, para)
);
alter table privado.transicoes_conversa enable row level security;
revoke all on privado.transicoes_conversa from public, anon, authenticated, service_role;

insert into privado.transicoes_conversa (de, para, quem) values
  ('descoberta', 'estimativa', 'vendas_registrar_estimativa'),
  ('descoberta', 'contato', 'vendas_informar_contato'),
  ('estimativa', 'contato', 'vendas_informar_contato'),
  ('estimativa', 'gerando', 'vendas_iniciar_geracao'),
  ('contato', 'gerando', 'vendas_iniciar_geracao'),
  ('direcoes', 'gerando', 'vendas_iniciar_geracao'),
  ('escolhida', 'gerando', 'vendas_iniciar_geracao'),
  ('gerando', 'direcoes', 'vendas_concluir_direcao'),
  ('gerando', 'contato', 'vendas_concluir_direcao (as 3 falharam)'),
  ('direcoes', 'escolhida', 'vendas_escolher'),
  ('escolhida', 'alteracoes', 'vendas_registrar_alteracao'),
  ('escolhida', 'escopo', 'vendas_apresentar_escopo'),
  ('alteracoes', 'escopo', 'vendas_apresentar_escopo'),
  ('escopo', 'aguardando_pagamento', 'vendas_confirmar_escopo'),
  ('aguardando_pagamento', 'em_producao', 'pagamentos_aplicar (sinal pago)');

create function privado.conferir_transicao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- (a licença só vale numa conexão SQL do dono, sem usuário do Auth: como privado.restaurando)
  if coalesce(current_setting('bz.transicao_livre', true), '') = 'on' and auth.uid() is null then return new; end if;
  if not exists (select 1 from privado.transicoes_conversa t where t.de = old.etapa and t.para = new.etapa) then
    raise exception 'transição de etapa não permitida: % → %', old.etapa, new.etapa using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function privado.conferir_transicao() from public, anon, authenticated, service_role;

create trigger conversas_transicao before update of etapa on app.conversas
for each row when (old.etapa is distinct from new.etapa) execute function privado.conferir_transicao();

-- o backend não muda conversa por fora das funções (como já é com app.pagamentos): com a chave secreta vazada, um
-- PATCH direto em "etapa" passaria por qualquer par válido da tabela (ex.: aguardando_pagamento → em_producao sem
-- pagamento). As funções security definer seguem funcionando (rodam como o dono das tabelas).
revoke update on app.conversas from service_role;
