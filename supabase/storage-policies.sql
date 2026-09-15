-- Políticas de RLS para o bucket de Storage "Pingo de Mell" (fotos de
-- produtos). A tabela `produtos` já tem RLS liberando escrita para usuário
-- autenticado, mas o Storage usa políticas próprias em storage.objects —
-- sem isso, o upload de foto no CMS falha com "new row violates row-level
-- security policy" mesmo logado.
--
-- RLS já vem ativado por padrão em storage.objects em todo projeto Supabase
-- (não precisa de ALTER TABLE aqui — isso exigiria ser dono da tabela).
--
-- Leitura (SELECT) não precisa de policy: o bucket é público, então as URLs
-- de imagem funcionam sem autenticação de qualquer forma.

create policy "Autenticados podem enviar fotos de produtos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'Pingo de Mell');

create policy "Autenticados podem atualizar fotos de produtos"
on storage.objects for update
to authenticated
using (bucket_id = 'Pingo de Mell');

create policy "Autenticados podem excluir fotos de produtos"
on storage.objects for delete
to authenticated
using (bucket_id = 'Pingo de Mell');
