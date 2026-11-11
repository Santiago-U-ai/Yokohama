-- ============================================================
-- Club Deportivo Yokohama - Endurecimiento de seguridad
-- Ejecutar DESPUÉS de supabase/schema.sql en el SQL Editor.
-- Es idempotente: se puede volver a ejecutar sin problema.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RLS forzado y permisos mínimos
--    El backend usa service_role (omite RLS). El resto solo
--    puede hacer lo estrictamente necesario.
-- ------------------------------------------------------------
alter table public.profiles force row level security;
alter table public.alumnos force row level security;
alter table public.pagos force row level security;

revoke all on public.profiles from anon;
revoke all on public.alumnos from anon;
revoke all on public.pagos from anon;

-- Nadie puede modificar perfiles desde el cliente: el rol solo se
-- cambia con service_role (panel de Supabase / backend).
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Alumnos: lectura según RLS, alta propia y edición de contacto.
revoke insert, update, delete on public.alumnos from authenticated;
grant select, insert, delete on public.alumnos to authenticated;
grant update (nombre, correo, telefono, direccion, fecha_nacimiento, fecha_inicio)
  on public.alumnos to authenticated;

-- Pagos: solo lectura desde el cliente. Toda escritura pasa por el backend.
revoke insert, update, delete on public.pagos from authenticated;
grant select on public.pagos to authenticated;

-- ------------------------------------------------------------
-- 2. Funciones: ejecución restringida
-- ------------------------------------------------------------
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Límites de tamaño para evitar datos abusivos
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'alumnos_nombre_len'
  ) then
    alter table public.alumnos
      add constraint alumnos_nombre_len
      check (char_length(nombre) between 1 and 120) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'alumnos_correo_len'
  ) then
    alter table public.alumnos
      add constraint alumnos_correo_len
      check (correo is null or char_length(correo) <= 160) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'alumnos_telefono_len'
  ) then
    alter table public.alumnos
      add constraint alumnos_telefono_len
      check (telefono is null or char_length(telefono) <= 40) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'alumnos_direccion_len'
  ) then
    alter table public.alumnos
      add constraint alumnos_direccion_len
      check (direccion is null or char_length(direccion) <= 200) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'alumnos_cinturon_len'
  ) then
    alter table public.alumnos
      add constraint alumnos_cinturon_len
      check (cinturon is null or char_length(cinturon) <= 40) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'pagos_monto_max'
  ) then
    alter table public.pagos
      add constraint pagos_monto_max
      check (monto >= 0 and monto <= 1000000) not valid;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 4. Storage: el bucket es privado y solo lo usa el backend
--    (service_role). Sin políticas para anon/authenticated.
-- ------------------------------------------------------------
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'comprobantes';

drop policy if exists "comprobantes_public_read" on storage.objects;
drop policy if exists "comprobantes_public_write" on storage.objects;

-- ------------------------------------------------------------
-- 5. Auditoría de seguridad (opcional)
--    Tabla de solo escritura para el backend. Sin acceso desde
--    anon/authenticated.
-- ------------------------------------------------------------
create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  event text not null,
  level text not null default 'warn' check (level in ('info', 'warn', 'error')),
  user_email text,
  role text,
  ip text,
  method text,
  path text,
  reason text,
  detail text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_idx
  on public.security_events (created_at desc);
create index if not exists security_events_event_idx
  on public.security_events (event);

alter table public.security_events enable row level security;
alter table public.security_events force row level security;
revoke all on public.security_events from anon, authenticated;

-- ------------------------------------------------------------
-- 6. Verificación rápida
--    Debe devolver 3 filas con rowsecurity = true.
-- ------------------------------------------------------------
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class
-- where relname in ('profiles', 'alumnos', 'pagos');
