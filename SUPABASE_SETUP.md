# Supabase Integration - Guía de Configuración

## ✅ Lo que se ha configurado

### 1. **Backend (Express + Supabase)**

- Instalado: `@supabase/supabase-js`
- Creados archivos:
  - `config/supabase.js` - Configuración de cliente Supabase
  - `middleware/authMiddleware.js` - Middleware para verificar tokens JWT
  - `services/authService.js` - Servicios de autenticación
  - `routes/auth.js` - Endpoints de autenticación

### 2. **Rutas de autenticación disponibles:**

```
POST   /api/auth/login          - Login con email/contraseña
POST   /api/auth/signup         - Registro (no necesario si usas el frontend)
GET    /api/auth/verify         - Verificar token actual
POST   /api/auth/logout         - Logout
```

### 3. **Modelo de Alumno actualizado**

- Agregado campo: `supabaseId` - ID del usuario en Supabase
- Agregado campo: `direccion` - Dirección del alumno

### 4. **Rutas protegidas**

- `POST /api/alumnos` - Ahora guarda el `supabaseId` del usuario registrado

---

## 🔧 Configuración necesaria

### Variables de entorno (.env)

Asegúrate de que tu `.env` tenga:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/yokohama

SUPABASE_URL=https://rpddsxvcnoxhipyxzeeg.supabase.co
SUPABASE_ANON_KEY=sb_publishable_PJqeC76lpq5peqfRHCgL7w_pHWItV5c
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

⚠️ **IMPORTANTE:** Reemplaza `SUPABASE_SERVICE_KEY` con tu clave real si deseas usar servicios del lado del servidor.

---

## 📱 Flujo de autenticación

## OPCIÓN A: El frontend maneja todo (Recomendado)

El frontend ya usa Supabase directamente:

1. Usuario se registra con `supabase.auth.signUp()`
2. Usuario inicia sesión con `supabase.auth.signInWithPassword()`
3. Al registrarse/loguear, el frontend obtiene el token JWT
4. Envía el token en el header: `Authorization: Bearer <token>`
5. Backend valida el token para guardar datos adicionales en BD

### Código en el Frontend (ya existe):

```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: form.correo,
  password: form.password,
});

// Luego envía datos al backend:
api.post("/alumnos", {Alumni datos...})
```

---

## OPCIÓN B: Usar endpoints del backend (alternativa)

Si prefieres que el backend maneje login/signup:

```javascript
// Login
const response = await api.post("/auth/login", {
  email: usuario@example.com,
  password: "password123"
});
const token = response.data.accessToken;

// Guardar token en localStorage
localStorage.setItem("accessToken", token);

// Usar en próximas requests
api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
```

---

## 🚀 Cómo ejecutar

### En terminal:

```bash
cd "c:\Users\santy\OneDrive\Escritorio\Yokohama\BACK"
npm start
```

El servidor debería escuchar en `http://localhost:5000`

---

## ✅ Próximos pasos

1. **Obtener Service Key de Supabase** (si quieres validar desde el backend)
   - Ve a: Settings → API → Service Role Key en tu proyecto Supabase
   - Cópiala en `.env` como `SUPABASE_SERVICE_KEY`

2. **Iniciar MongoDB localmente**

   ```bash
   mongod
   ```

   O actualiza `MONGO_URI` en `.env` si usas MongoDB Atlas

3. **Probar endpoints** con Postman o Thunder Client:

   ```
   POST http://localhost:5000/api/auth/login
   Content-Type: application/json

   {
     "email": "usuario@example.com",
     "password": "password123"
   }
   ```

4. **Conectar con el frontend** en `C:\Users\santy\OneDrive\Escritorio\Yokohama\FRONT\frontend`

---

## 🔐 Seguridad

- Los tokens JWT se validan en cada request protegido
- Las contraseñas se guardan encriptadas en Supabase
- El middleware valida usuarios antes de acceder a rutas protegidas

---

## 📝 Archivos modificados

✅ `package.json` - Agregados scripts start/dev y dependencias
✅ `server.js` - Importadas rutas de autenticación
✅ `config/supabase.js` - Nuevo archivo de configuración
✅ `middleware/authMiddleware.js` - Nuevo middleware
✅ `services/authService.js` - Nuevos servicios
✅ `routes/auth.js` - Nuevos endpoints
✅ `routes/alumnos.js` - Actualizado con middleware y validaciones
✅ `models/Alumno.js` - Agregados campos supabaseId y direccion
✅ `.env` - Actualizado con variables de Supabase

---

## 💬 Preguntas frecuentes

**P: ¿Qué pasa si el usuario no está autenticado?**
R: Las rutas con `authMiddleware` devuelven 401. Las rutas con `optionalAuthMiddleware` continúan pero sin usuario.

**P: ¿Cómo valido el token en el frontend?**
R: Cuando el usuario inicia sesión, Supabase automáticamente:

- Guarda el token en `localStorage`
- Lo incluye en requests automáticamente
- Lo refresca cuando expira

**P: ¿Necesito cambiar el frontend?**
R: No, el frontend ya está configurado correctamente y usa Supabase.

---

## 🆘 Troubleshooting

Si obtienes error al iniciar:

1. Verifica que MongoDB esté ejecutándose
2. Verifica las variables de `.env`
3. Instala dependencias: `npm install`
4. Revisa los logs en la consola

¡Tu integración Supabase está lista! 🎉
