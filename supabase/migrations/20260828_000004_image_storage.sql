-- Active machine/style image storage draft.
-- Path convention: <store_uuid>/<machine_style_uuid>/<generated_filename>.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'machine-style-images',
  'machine-style-images',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy machine_style_images_read on storage.objects
for select to authenticated
using (
  bucket_id = 'machine-style-images'
  and array_length(storage.foldername(name), 1) >= 2
  and private.has_store_access(private.safe_uuid((storage.foldername(name))[1]))
);

create policy machine_style_images_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'machine-style-images'
  and array_length(storage.foldername(name), 1) >= 2
  and private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(private.safe_uuid((storage.foldername(name))[1]))
);

create policy machine_style_images_update on storage.objects
for update to authenticated
using (
  bucket_id = 'machine-style-images'
  and array_length(storage.foldername(name), 1) >= 2
  and private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(private.safe_uuid((storage.foldername(name))[1]))
)
with check (
  bucket_id = 'machine-style-images'
  and array_length(storage.foldername(name), 1) >= 2
  and private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(private.safe_uuid((storage.foldername(name))[1]))
);

create policy machine_style_images_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'machine-style-images'
  and array_length(storage.foldername(name), 1) >= 2
  and private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(private.safe_uuid((storage.foldername(name))[1]))
);
