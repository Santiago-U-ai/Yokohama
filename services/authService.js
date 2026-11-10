import { supabase, supabaseAdmin } from "../config/supabase.js";
import { HttpError } from "../utils/httpError.js";

export const loginWithEmail = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new HttpError(401, "Credenciales inválidas", error.message);
  }

  return {
    user: data.user,
    session: data.session,
    accessToken: data.session?.access_token,
  };
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
  const { error } = await supabaseAdmin.auth.admin.signOut(token, "global");

  if (error) {
    throw new HttpError(500, "No se pudo cerrar la sesión", error.message);
  }

  return { message: "Sesión cerrada correctamente" };
};
