-- ------------------------------------------------------------
-- Migración: dos sedes (Norte y Sur)
--
-- Agrega la columna `sede` a `alumnos`. Cada alumno pertenece a una
-- sede y los grupos (BABY, JUVENIL, SENIOR) se cuentan por sede.
--
-- Ejecutar UNA vez en el SQL Editor de Supabase, después de
-- `schema.sql` y de `security_hardening.sql`.
-- ------------------------------------------------------------

alter table public.alumnos
  add column if not exists sede text;

-- Los alumnos que ya existían quedan en la sede Norte.
update public.alumnos set sede = 'NORTE' where sede is null or sede = '';

alter table public.alumnos
  alter column sede set default 'NORTE';
alter table public.alumnos
  alter column sede set not null;

alter table public.alumnos
  drop constraint if exists alumnos_sede_check;
alter table public.alumnos
  add constraint alumnos_sede_check check (sede in ('NORTE', 'SUR'));

create index if not exists alumnos_sede_grupo_idx
  on public.alumnos (sede, grupo);

-- `sede` es solo para el backend: service_role omite estos permisos,
-- pero conviene dejarlo explícito para accesos directos desde el cliente.
revoke update on public.alumnos from authenticated;
grant update (nombre, correo, telefono, direccion, fecha_nacimiento, fecha_inicio)
  on public.alumnos to authenticated;

-- Recarga el esquema en PostgREST para que la API vea la columna nueva.
notify pgrst, 'reload schema';
