import { supabase, supabaseAdmin } from "../config/supabase.js";
import { HttpError } from "../utils/httpError.js";

export const loginWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Mensaje genérico: no revelamos si el correo existe o no.
    throw new HttpError(401, "Correo o contraseña incorrectos", error.message);
  }

  return {
    user: data.user,
    session: data.session,
  };
};

/**
 * Renueva la sesión a partir del refresh token (guardado en cookie
 * httpOnly). Supabase rota el refresh token en cada llamada.
 */
export const refreshSession = async (refreshToken) => {
  if (!refreshToken) {
    throw new HttpError(401, "Sesión expirada");
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data?.session) {
    throw new HttpError(401, "Sesión expirada", error?.message);
  }

  return data.session;
};

export const signUpWithEmail = async (email, password, fullName) => {
  const options = {};

  if (fullName) {
    options.data = { full_name: fullName };
  }
  if (process.env.FRONTEND_URL) {
    options.emailRedirectTo = process.env.FRONTEND_URL;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  });

  if (error) {
    throw new HttpError(400, "Error en el registro", error.message);
  }

  return {
    user: data.user,
    session: data.session,
  };
};

export const verifyToken = async (token) => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new HttpError(401, "Token inválido", error?.message);
  }

  return user;
};

export const logout = async (token) => {
  if (!token) return { message: "Sesión cerrada correctamente" };

  const { error } = await supabaseAdmin.auth.admin.signOut(token, "global");

  if (error) {
    // Si el token ya expiró no es un fallo real: las cookies se borran igual.
    console.warn("[auth] signOut:", error.message);
  }

  return { message: "Sesión cerrada correctamente" };
};
