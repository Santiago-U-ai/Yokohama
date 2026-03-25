// Ejemplo de cómo integrar el frontend con el backend Supabase

import { supabase } from "../services/supabase";
import API from "../services/api";

/**
 * Registrar un nuevo alumno
 * Pasos:
 * 1. Crea cuenta en Supabase
 * 2. Guarda datos del alumno en MongoDB
 */
export async function registrarAlumno(datosAlumno) {
  try {
    // PASO 1: Registrar en Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: datosAlumno.correo,
      password: datosAlumno.password,
    });

    if (authError) {
      alert("Error en Supabase: " + authError.message);
      return;
    }

    // PASO 2: Obtener el token
    const session = authData.session;
    const token = session?.access_token;

    // PASO 3: Guardar datos en MongoDB (backend)
    const response = await API.post(
      "/alumnos",
      {
        nombre: datosAlumno.nombre,
        edad: datosAlumno.edad,
        correo: datosAlumno.correo,
        telefono: datosAlumno.telefono,
        direccion: datosAlumno.direccion,
        // El backend agregará automáticamente el supabaseId
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    console.log("Alumno registrado:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error en registro:", error);
    alert("Error: " + error.message);
  }
}

/**
 * Iniciar sesión
 * Pasos:
 * 1. Login en Supabase
 * 2. Obtener token JWT
 * 3. Guardar token en localStorage (Supabase lo hace automáticamente)
 * 4. Hacer requests al backend con el token
 */
export async function loginAlumno(email, password) {
  try {
    // PASO 1: Login en Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("Error de login: " + error.message);
      return;
    }

    // PASO 2 & 3: Supabase automáticamente guarda el token en localStorage
    const token = data.session.access_token;

    // PASO 4: Verificar con el backend (opcional)
    const response = await API.get("/auth/verify", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("Usuario verificado:", response.data);

    // Ahora puedes hacer requests al backend
    // API.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    return response.data;
  } catch (error) {
    console.error("Error en login:", error);
    alert("Error: " + error.message);
  }
}

/**
 * Obtener el token actual del usuario autenticado
 */
export async function obtenerTokenActual() {
  const session = await supabase.auth.getSession();
  return session?.data?.session?.access_token;
}

/**
 * Hacer una request protegida al backend con el token
 */
export async function hacerRequestProtegido(
  endpoint,
  metodo = "get",
  datos = null,
) {
  try {
    const token = await obtenerTokenActual();

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    let response;
    if (metodo === "get") {
      response = await API.get(endpoint, config);
    } else if (metodo === "post") {
      response = await API.post(endpoint, datos, config);
    } else if (metodo === "put") {
      response = await API.put(endpoint, datos, config);
    } else if (metodo === "delete") {
      response = await API.delete(endpoint, config);
    }

    return response.data;
  } catch (error) {
    console.error("Error en request protegido:", error);
    throw error;
  }
}

/**
 * Logout - Cierra sesión en Supabase
 */
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Error en logout: " + error.message);
      return;
    }

    // Token se elimina automáticamente de localStorage
    console.log("Sesión cerrada correctamente");
  } catch (error) {
    console.error("Error en logout:", error);
  }
}

/**
 * Ejemplo de uso en un componente React:
 *
 * import { registrarAlumno, loginAlumno, logout, hacerRequestProtegido } from './authHelper';
 *
 * // En el componente de registro:
 * const handleRegistro = async (form) => {
 *   await registrarAlumno({
 *     nombre: form.nombre,
 *     edad: form.edad,
 *     correo: form.correo,
 *     password: form.password,
 *     telefono: form.telefono,
 *     direccion: form.direccion
 *   });
 * };
 *
 * // En el componente de login:
 * const handleLogin = async (email, password) => {
 *   await loginAlumno(email, password);
 * };
 *
 * // Para hacer requests protegidos:
 * const obtenerAlumnos = async () => {
 *   const datos = await hacerRequestProtegido('/alumnos', 'get');
 *   console.log(datos);
 * };
 *
 * // Para logout:
 * const handleLogout = () => {
 *   await logout();
 *   navigate('/login');
 * };
 */
