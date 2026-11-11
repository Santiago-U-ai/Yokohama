-- ============================================================
-- Club Deportivo Yokohama - Esquema Supabase
-- Ejecutar completo en: Supabase Dashboard > SQL Editor
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Perfiles (rol admin / alumno)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'alumno' check (role in ('admin', 'alumno')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Alumnos
--    user_id es opcional: un admin puede crear alumnos sin cuenta.
-- ------------------------------------------------------------
create table if not exists public.alumnos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  nombre text not null,
  correo text,
  telefono text,
  fecha_nacimiento date check (
    fecha_nacimiento is null
    or (fecha_nacimiento >= '1900-01-01' and fecha_nacimiento <= current_date)
  ),
  fecha_inicio date check (
    fecha_inicio is null
    or (fecha_inicio >= '1900-01-01' and fecha_inicio <= current_date)
  ),
  direccion text,
  grupo text check (grupo is null or grupo in ('BABY', 'JUVENIL', 'SENIOR')),
  cinturon text,
  activo boolean not null default true,
  fecha_registro timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alumnos_user_id_idx on public.alumnos (user_id);
create index if not exists alumnos_nombre_idx on public.alumnos (nombre);
create index if not exists alumnos_correo_idx on public.alumnos (lower(correo));

-- ------------------------------------------------------------
-- 3. Pagos
--    mes en formato YYYY-MM. Un solo pago por alumno y mes.
-- ------------------------------------------------------------
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos (id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  monto numeric(10, 2) not null default 500 check (monto >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'vencido')),
  comprobante_path text,
  fecha_pago date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alumno_id, mes)
);

create index if not exists pagos_alumno_id_idx on public.pagos (alumno_id);
create index if not exists pagos_estado_idx on public.pagos (estado);
create index if not exists pagos_mes_idx on public.pagos (mes);

-- ------------------------------------------------------------
-- 4. updated_at automático
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists alumnos_set_updated_at on public.alumnos;
create trigger alumnos_set_updated_at
before update on public.alumnos
for each row execute function public.set_updated_at();

drop trigger if exists pagos_set_updated_at on public.pagos;
create trigger pagos_set_updated_at
before update on public.pagos
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. Crear perfil automáticamente al registrar usuario en Auth
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'alumno'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 6. Helper para políticas RLS
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------
-- 7. Row Level Security
--    El backend usa la service role key y por tanto omite RLS.
--    Estas políticas protegen accesos directos desde el cliente.
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.alumnos enable row level security;
alter table public.pagos enable row level security;

-- Evita que un usuario se ascienda a admin o cambie columnas protegidas
-- desde el cliente. El backend usa service_role y omite estos grants.
revoke update on public.profiles from authenticated;
revoke update on public.alumnos from authenticated;
grant update (nombre, correo, telefono, direccion, fecha_nacimiento, fecha_inicio)
  on public.alumnos to authenticated;

drop policy if exists "profiles_update_own_or_admin" on public.profiles;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "alumnos_select_own_or_admin" on public.alumnos;
create policy "alumnos_select_own_or_admin"
on public.alumnos for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "alumnos_insert_self_or_admin" on public.alumnos;
create policy "alumnos_insert_self_or_admin"
on public.alumnos for insert to authenticated
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "alumnos_update_own_or_admin" on public.alumnos;
create policy "alumnos_update_own_or_admin"
on public.alumnos for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "alumnos_delete_admin" on public.alumnos;
create policy "alumnos_delete_admin"
on public.alumnos for delete to authenticated
using (public.is_admin());

drop policy if exists "pagos_select_own_or_admin" on public.pagos;
create policy "pagos_select_own_or_admin"
on public.pagos for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.alumnos a
    where a.id = alumno_id and a.user_id = auth.uid()
  )
);

drop policy if exists "pagos_insert_admin" on public.pagos;
create policy "pagos_insert_admin"
on public.pagos for insert to authenticated
with check (public.is_admin());

drop policy if exists "pagos_update_admin" on public.pagos;
create policy "pagos_update_admin"
on public.pagos for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pagos_delete_admin" on public.pagos;
create policy "pagos_delete_admin"
on public.pagos for delete to authenticated
using (public.is_admin());

-- ------------------------------------------------------------
-- 8. Bucket privado para comprobantes
--    La subida/descarga la hace el backend con service role.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 9. Convertir tu primer usuario en administrador
--    Ejecuta esto DESPUÉS de crear la cuenta:
--
--    update public.profiles
--    set role = 'admin'
--    where email = 'admin@tudominio.com';
-- ------------------------------------------------------------
