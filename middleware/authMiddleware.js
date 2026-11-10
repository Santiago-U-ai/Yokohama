import { supabase, supabaseAdmin } from "../config/supabase.js";
import { HttpError } from "../utils/httpError.js";

const getBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
};

const ensureProfile = async (user) => {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "No se pudo cargar el perfil", error.message);
  }

  if (profile) return profile;

  // Respaldo por si el trigger de auth.users no está instalado.
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

const authenticate = async (req) => {
  const token = getBearerToken(req);

  if (!token) {
    throw new HttpError(401, "No autorizado", "Falta el token de autenticación");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new HttpError(401, "Token inválido", error?.message);
  }

  const profile = await ensureProfile(user);

  req.accessToken = token;
  req.user = user;
  req.profile = profile;
  req.role = profile.role;
};

/**
 * Exige un JWT válido de Supabase y carga el perfil/rol del usuario.
 */
export const authMiddleware = async (req, res, next) => {
  try {
    await authenticate(req);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Intenta autenticar pero nunca bloquea la petición.
 * Útil para endpoints públicos que se comportan distinto si hay sesión.
 */
export const optionalAuthMiddleware = async (req, res, next) => {
  if (!getBearerToken(req)) return next();

  try {
    await authenticate(req);
  } catch (error) {
    // La petición continúa sin usuario autenticado.
  }

  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.role !== "admin") {
    return next(
      new HttpError(403, "No autorizado", "Se requiere rol de administrador"),
    );
  }
  next();
};
