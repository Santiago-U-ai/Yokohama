# Backend con Supabase

Backend Express que usa **Supabase Postgres** para alumnos/pagos, **Supabase Auth** para sesiones y **Supabase Storage** para comprobantes. MongoDB/Mongoose ya no se usa.

## 1. Crear el proyecto

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings > API** copia:
   - `Project URL` -> `SUPABASE_URL`
   - `anon public` -> `SUPABASE_ANON_KEY`
   - `service_role` -> `SUPABASE_SERVICE_ROLE_KEY` (solo backend, nunca frontend)

## 2. Ejecutar el esquema

En **SQL Editor**, ejecuta completo:

```text
BACK/supabase/schema.sql
```

Esto crea:

- `profiles` (rol `admin` o `alumno`)
- `alumnos` (puede existir sin cuenta de Auth)
- `pagos` (un pago por alumno/mes)
- triggers de `updated_at` y de creación automática de perfil
- políticas RLS
- bucket privado `comprobantes` (5 MB, JPG/PNG/WEBP/PDF)

## 3. Configurar variables

Copia `BACK/.env.example` a `BACK/.env` y completa los valores:

```env
PORT=5000
CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173

SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
SUPABASE_STORAGE_BUCKET=comprobantes
```

`SUPABASE_SERVICE_ROLE_KEY` **nunca** debe ir al frontend ni a Git. `BACK/.env` está ignorado.

## 4. Crear el primer administrador

1. Crea la cuenta. Dos opciones:
   - `POST /api/auth/signup` con `email`, `password` y `nombre`.
   - Supabase Dashboard -> **Authentication > Users > Add user** (marca *Auto Confirm User*).
2. En SQL Editor promueve el perfil:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@tudominio.com';
```

Los usuarios nuevos se crean como `alumno` y el perfil se genera solo por trigger.

> **Límite de correos:** el plan gratuito de Supabase limita los correos de confirmación/recuperación (por defecto ~2 por hora). Si `POST /api/auth/signup` responde `{"error":"Error en el registro","details":"email rate limit exceeded"}`, crea el usuario desde el Dashboard o configura SMTP propio en **Authentication > Emails**.

## 5. Ejecutar

```bash
cd BACK
npm install
npm run dev
```

- `npm run dev` usa `node --watch` (reinicio automático).
- `npm start` ejecuta sin watch.
- `npm test` corre las pruebas de validación/serialización con `node --test`.

Servidor: `http://localhost:5000`.

## Endpoints

Todas las rutas protegidas esperan `Authorization: Bearer <access_token>`.

### Auth

| Método | Ruta | Acceso |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Público. Body: `email`, `password`, `nombre?` |
| `POST` | `/api/auth/login` | Público. Body: `email`, `password` |
| `GET` | `/api/auth/verify` | Autenticado |
| `GET` | `/api/auth/me` | Autenticado |
| `POST` | `/api/auth/logout` | Autenticado (revoca la sesión) |

### Alumnos

| Método | Ruta | Acceso |
| --- | --- | --- |
| `GET` | `/api/alumnos` | Admin. Filtros: `grupo`, `activo`, `q` |
| `GET` | `/api/alumnos/me` | Alumno autenticado. Vincula por correo si existe una ficha sin cuenta |
| `GET` | `/api/alumnos/:id` | Admin o el propio alumno |
| `POST` | `/api/alumnos` | Admin, o usuario creando su propia ficha |
| `PATCH` | `/api/alumnos/:id` | Admin o el propio alumno (sin cambiar estado/grupo/cinturón) |
| `DELETE` | `/api/alumnos/:id` | Admin |

`GET /api/alumnos` y `GET /api/alumnos/me` incluyen `ultimo_pago` (fecha del último pago pagado, o `null`) y `pagos_pendientes` (cantidad). El frontend usa esos campos para calcular Activo/Inactivo.

### Pagos

| Método | Ruta | Acceso |
| --- | --- | --- |
| `GET` | `/api/pagos` | Admin. Filtros: `alumno_id`, `estado`, `mes`, `desde`, `hasta`, `limit` |
| `GET` | `/api/pagos/me` | Alumno autenticado |
| `GET` | `/api/pagos/alumno/:alumnoId` | Admin o el propio alumno |
| `GET` | `/api/pagos/:id` | Admin o el propio alumno |
| `POST` | `/api/pagos` | Admin. Body: `alumno_id`, `mes` (`YYYY-MM`), `monto?`, `estado?` |
| `PATCH` | `/api/pagos/:id` | Admin. Cambia estado, monto, mes o fecha |
| `DELETE` | `/api/pagos/:id` | Admin. También elimina el comprobante de Storage |
| `POST` | `/api/pagos/comprobante` | Alumno/admin. Multipart `comprobante` + `pago_id?` |
| `POST` | `/api/pagos/:id/comprobante` | Alumno propietario o admin |
| `GET` | `/api/pagos/:id/comprobante` | Devuelve URL firmada por 1 hora |

Al marcar un pago como `pagado`, si no se envía `fecha_pago` se usa la fecha actual.

### Dashboard

| Método | Ruta | Acceso |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Admin. Totales, ingresos del mes, pendientes, vencidos y últimos movimientos |
| `GET` | `/api/dashboard/me` | Alumno. Deuda pendiente y meses |

### Salud

- `GET /api/health`
- `GET /api/debug`

## Roles y RLS

- El backend usa la `service_role` y por tanto omite RLS.
- Las políticas RLS existen para proteger accesos directos desde el frontend con la `publishable`/anon key.
- Un alumno solo puede leer su propia ficha y sus pagos.
- Solo un `admin` puede crear/editar/eliminar pagos y listar todos los alumnos.
- Endurecimiento adicional del esquema:
  - `profiles` no tiene `update` para `authenticated`, así que nadie puede ascenderse a `admin` desde el cliente.
  - `alumnos` solo permite actualizar `nombre`, `correo`, `telefono`, `edad` y `direccion`; `activo`, `grupo`, `cinturon` y `user_id` quedan solo para el backend.
  - Un alumno no puede ver fichas ni pagos de otros (verificado con la clave pública).

## Verificación

Prueba de humo ejecutada contra el proyecto real (24/24 correctas):

- login/verify de admin y alumno
- crear/listar alumnos, validaciones y 401/403
- crear pago, duplicado -> 409 y mes inválido -> 400
- vinculación de `/alumnos/me` por correo
- subida de comprobante, URL firmada y descarga
- marcar pago como pagado con `fecha_pago` automática
- dashboards de admin y alumno
- RLS: ascenso a admin bloqueado, desactivar ficha bloqueado, datos ajenos invisibles

## Comprobantes

- Bucket privado `comprobantes`.
- Ruta interna: `<alumno_id>/<pago_id>-<timestamp>.<ext>`.
- El backend sube con `service_role` y devuelve una URL firmada temporal.
- Formatos: JPG, PNG, WEBP, PDF. Tamaño máximo: 5 MB.

## Recordatorios por correo (opcional)

En `.env`:

```env
ENABLE_REMINDERS=true
REMINDERS_CRON=0 9 * * *
EMAIL_SERVICE=gmail
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASS=tu-app-password
EMAIL_FROM=Club Deportivo Yokohama
```

El job agrupa los meses pendientes por alumno y envía un correo. Se inicia solo si `ENABLE_REMINDERS=true`.

## Notas de migración

- El backend anterior usaba MongoDB. Los datos existentes **no** se migran automáticamente.
- Si necesitas conservarlos, exporta los documentos de `alumnos`/`pagos` y mapéalos a las tablas nuevas:
  - `nombre`, `correo`, `telefono`, `edad`, `direccion` se mantienen.
  - `pagos.alumno` (nombre) debe convertirse en `pagos.alumno_id` (UUID de `alumnos`).
  - `supabaseId` pasa a `alumnos.user_id`.
- El proyecto Supabase anterior (`rpddsxvcnoxhipyxzeeg`) ya no existe; usa uno nuevo.
