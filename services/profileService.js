import { supabaseAdmin } from "../config/supabase.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Carga el perfil del usuario y lo crea si el trigger de auth.users no está
 * instalado. El rol inicial solo puede ser `admin` si viene en
 * app_metadata, que únicamente puede escribir la service role.
 */
export const ensureProfile = async (user) => {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "No se pudo cargar el perfil", error.message);
  }

  if (profile) return profile;

  const fallbackProfile = {
    id: user.id,
    email: user.email ?? null,
    full_name: user.user_metadata?.full_name ?? user.email ?? null,
    role: user.app_metadata?.role === "admin" ? "admin" : "alumno",
  };

  const { data: created, error: createError } = await supabaseAdmin
    .from("profiles")
    .insert(fallbackProfile)
    .select("*")
    .single();

  if (createError) {
    throw new HttpError(500, "No se pudo crear el perfil", createError.message);
  }

  return created;
};

/**
 * Datos mínimos del usuario que se pueden devolver al cliente. Evita
 * exponer metadatos internos de Supabase Auth.
 */
export const publicUser = (user) =>
  user
    ? {
        id: user.id,
        email: user.email ?? null,
      }
    : null;
