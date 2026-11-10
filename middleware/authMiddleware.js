import { supabase } from "../config/supabase.js";
import { ensureProfile } from "../services/profileService.js";
import { getAccessToken } from "../utils/cookies.js";
import { HttpError } from "../utils/httpError.js";
import { securityLogFromRequest } from "../utils/securityLog.js";

const getBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
};

/**
 * Prefiere la cookie httpOnly; el Bearer queda solo para clientes de API
 * que no son navegador.
 */
const resolveToken = (req) => {
  const cookieToken = getAccessToken(req);
  if (cookieToken) return { token: cookieToken, source: "cookie" };

  const bearer = getBearerToken(req);
  if (bearer) return { token: bearer, source: "bearer" };

  return null;
};

const authenticate = async (req) => {
  const resolved = resolveToken(req);

  if (!resolved) {
    throw new HttpError(401, "No autorizado", "Falta la sesión");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(resolved.token);

  if (error || !user) {
    securityLogFromRequest(req, "token_invalido", {
      reason: "Supabase rechazó el token",
      detail: error?.message,
    });
    throw new HttpError(401, "Sesión expirada", error?.message);
  }

  const profile = await ensureProfile(user);

  req.accessToken = resolved.token;
  req.authSource = resolved.source;
  req.user = user;
  req.profile = profile;
  req.role = profile.role;
};

/**
 * Exige una sesión válida y carga el perfil/rol del usuario.
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
 */
export const optionalAuthMiddleware = async (req, res, next) => {
  if (!resolveToken(req)) return next();

  try {
    await authenticate(req);
  } catch {
    // La petición continúa sin usuario autenticado.
  }

  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.role !== "admin") {
    securityLogFromRequest(req, "acceso_admin_denegado", {
      reason: "El usuario no tiene rol de administrador",
    });

    return next(
      new HttpError(403, "No autorizado", "Se requiere rol de administrador"),
    );
  }
  next();
};
