-- ------------------------------------------------------------
-- Migración: fecha de nacimiento e inicio en karate
--
-- Reemplaza la columna `edad` (un número que había que actualizar a mano)
-- por `fecha_nacimiento`, y añade `fecha_inicio` para calcular cuánto
-- tiempo lleva el alumno en el club.
--
-- Ejecutar UNA vez en el SQL Editor de Supabase, después de
-- `schema.sql` y de `security_hardening.sql`.
-- ------------------------------------------------------------

alter table public.alumnos
  add column if not exists fecha_nacimiento date;

alter table public.alumnos
  add column if not exists fecha_inicio date;

-- Fechas coherentes: ni futuras ni anteriores a 1900.
alter table public.alumnos
  drop constraint if exists alumnos_fecha_nacimiento_check;
alter table public.alumnos
  add constraint alumnos_fecha_nacimiento_check check (
    fecha_nacimiento is null
    or (fecha_nacimiento >= '1900-01-01' and fecha_nacimiento <= current_date)
  );

alter table public.alumnos
  drop constraint if exists alumnos_fecha_inicio_check;
alter table public.alumnos
  add constraint alumnos_fecha_inicio_check check (
    fecha_inicio is null
    or (fecha_inicio >= '1900-01-01' and fecha_inicio <= current_date)
  );

-- La edad pasa a calcularse desde la fecha de nacimiento.
alter table public.alumnos
  drop column if exists edad;

-- Permisos por columna para usuarios autenticados (el backend usa
-- service_role y no depende de estos grants).
revoke update on public.alumnos from authenticated;
grant update (nombre, correo, telefono, direccion, fecha_nacimiento, fecha_inicio)
  on public.alumnos to authenticated;

-- Recarga el esquema en PostgREST para que la API vea las columnas nuevas.
notify pgrst, 'reload schema';
