-- ------------------------------------------------------------
-- Migración: asistencia por grupo («llamar a lista»)
--
-- Crea `asistencias`: un registro por alumno, fecha y hora del entreno.
-- `presente` distingue a quien asistió de quien faltó, así el mismo
-- registro sirve de lista completa de la clase.
--
-- Ejecutar UNA vez en el SQL Editor de Supabase, después de
-- `schema.sql`, `security_hardening.sql` y las migraciones previas.
-- Es idempotente: se puede volver a ejecutar sin problema.
-- ------------------------------------------------------------

create table if not exists public.asistencias (
  alumno_id uuid not null references public.alumnos (id) on delete cascade,
  fecha date not null check (fecha >= '1900-01-01'),
  hora time not null,
  presente boolean not null default true,
  grupo text,
  sede text,
  registrado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alumno_id, fecha, hora)
);

-- Si la tabla ya existía, añade las columnas de la clase.
alter table public.asistencias add column if not exists grupo text;
alter table public.asistencias add column if not exists sede text;

alter table public.asistencias drop constraint if exists asistencias_grupo_check;
alter table public.asistencias
  add constraint asistencias_grupo_check
  check (grupo is null or grupo in ('BABY', 'JUVENIL', 'SENIOR'));

alter table public.asistencias drop constraint if exists asistencias_sede_check;
alter table public.asistencias
  add constraint asistencias_sede_check
  check (sede is null or sede in ('NORTE', 'SUR'));

create index if not exists asistencias_fecha_idx
  on public.asistencias (fecha, hora);
create index if not exists asistencias_alumno_id_idx
  on public.asistencias (alumno_id);

-- updated_at automático (misma función que usan las otras tablas).
drop trigger if exists asistencias_set_updated_at on public.asistencias;
create trigger asistencias_set_updated_at
before update on public.asistencias
for each row execute function public.set_updated_at();

-- RLS: la asistencia solo la ve un admin. El backend escribe con
-- service_role, que omite RLS y estos grants.
alter table public.asistencias enable row level security;
alter table public.asistencias force row level security;

revoke all on public.asistencias from anon;
revoke insert, update, delete on public.asistencias from authenticated;
grant select on public.asistencias to authenticated;

drop policy if exists "asistencias_select_admin" on public.asistencias;
create policy "asistencias_select_admin"
on public.asistencias for select to authenticated
using (public.is_admin());

drop policy if exists "asistencias_insert_admin" on public.asistencias;
create policy "asistencias_insert_admin"
on public.asistencias for insert to authenticated
with check (public.is_admin());

drop policy if exists "asistencias_update_admin" on public.asistencias;
create policy "asistencias_update_admin"
on public.asistencias for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "asistencias_delete_admin" on public.asistencias;
create policy "asistencias_delete_admin"
on public.asistencias for delete to authenticated
using (public.is_admin());

-- Recarga el esquema en PostgREST para que la API vea la tabla nueva.
notify pgrst, 'reload schema';
