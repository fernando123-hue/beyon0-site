-- ==========================================================================
-- O BALDE DO MATERIAL (PR 3b-2; spec §7 e §8). Quem roda é o DONO, no Supabase de produção (SQL Editor › Run).
-- PRIVADO (sem endereço público), só os três tipos de imagem, até 10 MB por arquivo (o limite de 5 MB da logo e o de
-- 20 fotos são conferidos pelo servidor). NENHUMA política em storage.objects: só a chave de serviço do servidor lê e
-- escreve; o navegador só envia pelo link assinado que o servidor cria (2 h, sem sobrescrever).
-- Reaplicável. O PGlite dos testes não tem o esquema `storage` de verdade: este arquivo não roda lá.
-- ==========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material', 'material', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
