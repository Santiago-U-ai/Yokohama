# Backend con Supabase

Backend Express que usa **Supabase Postgres** para alumnos/pagos, **Supabase Auth** para sesiones y **Supabase Storage** para comprobantes. La autenticación es **solo del lado del servidor**: el navegador nunca recibe tokens ni claves de Supabase.

## 1. Crear el proyecto

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings > API** copia:
   - `Project URL` -> `SUPABASE_URL`
   - `anon public` -> `SUPABASE_ANON_KEY`
   - `service_role` -> `SUPABASE_SERVICE_ROLE_KEY` (solo backend, nunca frontend)

## 2. Ejecutar el esquema

En **SQL Editor**, ejecuta en este orden:

```text
BACK/supabase/schema.sql
BACK/supabase/security_hardening.sql
BACK/supabase/migracion_fechas.sql   # solo si la base ya existía
```

`migracion_fechas.sql` reemplaza la antigua columna `edad` por
`fecha_nacimiento` y añade `fecha_inicio` (inicio en karate). En proyectos
nuevos no hace falta: `schema.sql` ya crea las columnas definitivas.

Esto crea:

- `profiles` (rol `admin` o `alumno`)
- `alumnos` (puede existir sin cuenta de Auth)
- `pagos` (un pago por alumno/mes)
- `security_events` (auditoría, sin acceso desde el cliente)
- triggers de `updated_at` y de creación automática de perfil
- políticas RLS y permisos mínimos
- bucket privado `comprobantes` (5 MB, JPG/PNG/WEBP/PDF)

## 3. Configurar variables

Copia `BACK/.env.example` a `BACK/.env` y completa los valores:

```env
PORT=5000
NODE_ENV=development

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FRONTEND_URL=http://localhost:5173

FORCE_HTTPS=false
TRUST_PROXY=false
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
ENABLE_PUBLIC_SIGNUP=false

SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
SUPABASE_STORAGE_BUCKET=comprobantes
```

`SUPABASE_SERVICE_ROLE_KEY` **nunca** debe ir al frontend ni a Git. `BACK/.env` está ignorado.

En producción:

```env
NODE_ENV=production
FORCE_HTTPS=true
TRUST_PROXY=true
COOKIE_SECURE=true
CORS_ORIGINS=https://tu-frontend.example.com
FRONTEND_URL=https://tu-frontend.example.com
```

Si el frontend y la API están en dominios distintos, usa `COOKIE_SAMESITE=none` (obliga a `COOKIE_SECURE=true`).

## 4. Crear el primer administrador

El registro público está deshabilitado. Crea la cuenta desde
**Supabase Dashboard > Authentication > Users > Add user** (marca *Auto Confirm User*)
y promueve el perfil:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@tudominio.com';
```

Las contraseñas las almacena Supabase Auth con hash (bcrypt/scrypt); el backend
nunca las recibe para guardarlas ni las registra en logs.

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

## Seguridad implementada

- **Sesión en cookies httpOnly** (`yh_session`, `yh_refresh`): ningún token está en `localStorage`.
- **CSRF double-submit** con cookie `yh_csrf` + cabecera `X-CSRF-Token` en toda petición que modifica estado.
- **CORS con allowlist** y `credentials: true`; en producción no se acepta ningún origen fuera de `CORS_ORIGINS`.
- **Helmet**: CSP `default-src 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` y HSTS en producción.
- **HTTPS obligatorio** con `FORCE_HTTPS=true` (redirección en GET, 403 en el resto).
- **Rate limiting**: global, login (IP + correo) y subida de comprobantes.
- **Validación estricta** de todos los campos, sanitización de texto y búsqueda segura para PostgREST.
- **Registro de eventos** en `BACK/logs/security.log` (login fallido, CSRF inválido, origen bloqueado, acceso admin denegado, rate limit, etc.). Con `SECURITY_DB_LOG=true` también se guardan en `public.security_events`.
- **Errores sin detalles internos**: nunca se devuelven mensajes de Supabase/SQL.
- **Archivos**: máximo 5 MB y verificación de firma real (magic bytes), no solo del `mimetype`.
- **Registro público deshabilitado** (`ENABLE_PUBLIC_SIGNUP=false`).

## Endpoints

La sesión se envía automáticamente en cookies. Para clientes que no son
navegador también se acepta `Authorization: Bearer <access_token>`.

### Auth

| Método | Ruta | Acceso |
| --- | --- | --- |
| `GET` | `/api/auth/csrf` | Público. Devuelve el token CSRF |
| `POST` | `/api/auth/login` | Público. Body: `email`, `password` + `X-CSRF-Token` |
| `POST` | `/api/auth/refresh` | Rota el refresh token (cookie) |
| `GET` | `/api/auth/verify` | Autenticado |
| `GET` | `/api/auth/me` | Autenticado |
| `POST` | `/api/auth/logout` | Limpia las cookies y revoca la sesión |
| `POST` | `/api/auth/signup` | Deshabilitado salvo `ENABLE_PUBLIC_SIGNUP=true` |

### Alumnos

| Método | Ruta | Acceso |
| --- | --- | --- |
| `GET` | `/api/alumnos` | Admin. Filtros: `grupo`, `activo`, `q` |
| `GET` | `/api/alumnos/me` | Alumno autenticado. Vincula por correo si existe una ficha sin cuenta |
| `GET` | `/api/alumnos/:id` | Admin o el propio alumno |
| `POST` | `/api/alumnos` | Admin, o usuario creando su propia ficha |
| `PATCH` | `/api/alumnos/:id` | Admin o el propio alumno (sin cambiar estado/grupo/cinturón) |
| `DELETE` | `/api/alumnos/:id` | Admin |

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

No existe `/api/debug`.

## Roles y RLS

- El backend usa la `service_role` y por tanto omite RLS.
- El frontend **ya no** habla con Supabase; aunque la clave publishable es pública, las políticas siguen protegiendo accesos directos.
- Un alumno solo puede leer su propia ficha y sus pagos.
- Solo un `admin` puede crear/editar/eliminar pagos y listar todos los alumnos.
- `profiles` no tiene `insert/update/delete` para `authenticated`: nadie puede ascenderse a `admin` desde el cliente.
- `alumnos` solo permite actualizar `nombre`, `correo`, `telefono`, `direccion`, `fecha_nacimiento` y `fecha_inicio`; `activo`, `grupo`, `cinturon` y `user_id` quedan solo para el backend.
- `pagos` es de solo lectura para `authenticated`; toda escritura pasa por el backend.
- RLS está forzado (`force row level security`) y `anon` no tiene permisos sobre las tablas.

## Verificación

Pruebas automáticas:

```bash
cd BACK
npm test
```

Prueba de humo de seguridad ejecutada contra el servidor local:

- `/api/debug` responde 404.
- Origen no permitido responde 403 y queda registrado.
- Login sin token CSRF responde 403.
- Credenciales inválidas responden 401 con mensaje genérico.
- Registro público responde 403.
- `/api/auth/me` sin sesión responde 401.
- `x-powered-by` ausente, CSP estricta, `X-Frame-Options: DENY`, `nosniff` y `Referrer-Policy` presentes.

## Comprobantes

- Bucket privado `comprobantes`.
- Ruta interna: `<alumno_id>/<pago_id>-<timestamp>.<ext>`.
- El backend sube con `service_role` y devuelve una URL firmada temporal.
- Formatos: JPG, PNG, WEBP, PDF. Tamaño máximo: 5 MB.
- Se valida la firma real del archivo (magic bytes).

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

El job agrupa los meses pendientes por alumno y envía un correo. Se inicia solo si `ENABLE_REMINDERS=true` y hay credenciales.

## Notas de migración

- El backend anterior usaba MongoDB. Los datos existentes **no** se migran automáticamente.
- `pagos.alumno` (nombre) debe convertirse en `pagos.alumno_id` (UUID de `alumnos`).
- `supabaseId` pasa a `alumnos.user_id`.
- El proyecto Supabase anterior (`rpddsxvcnoxhipyxzeeg`) ya no existe; usa uno nuevo.
