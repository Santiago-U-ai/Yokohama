import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { authLimiter, refreshLimiter } from "../middleware/rateLimit.js";
import { issueCsrfToken } from "../middleware/security.js";
import {
  loginWithEmail,
  logout,
  refreshSession,
  signUpWithEmail,
} from "../services/authService.js";
import { ensureProfile, publicUser } from "../services/profileService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { clearSessionCookies, getAccessToken, getRefreshToken, setSessionCookies } from "../utils/cookies.js";
import { HttpError } from "../utils/httpError.js";
import { securityLogFromRequest } from "../utils/securityLog.js";
import { cleanText, isEmail } from "../utils/validation.js";
import { enablePublicSignup } from "../config/security.js";

const router = express.Router();

const noStore = (res) => res.set("Cache-Control", "no-store");

const parseLogin = (body) => {
  const email = cleanText(body.email ?? body.correo, "email", {
    required: true,
    max: 160,
  }).toLowerCase();

  if (!isEmail(email)) {
    throw new HttpError(400, "El correo no es válido");
  }

  const password = cleanText(body.password, "password", {
    required: true,
    max: 200,
    trim: false,
    sanitize: false,
  });

  if (password.length < 6) {
    throw new HttpError(400, "Correo o contraseña incorrectos");
  }

  return { email, password };
};

const parseSignup = (body) => {
  const { email, password } = parseLogin(body);

  if (password.length < 12) {
    throw new HttpError(
      400,
      "La contraseña debe tener al menos 12 caracteres",
    );
  }

  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError(
      400,
      "La contraseña debe incluir al menos una letra y un número",
    );
  }

  const fullName = cleanText(body.nombre ?? body.full_name, "nombre", {
    max: 120,
  });

  return { email, password, fullName };
};

/**
 * GET /api/auth/csrf
 * Entrega el token CSRF (double-submit) y lo guarda en cookie.
 */
router.get("/csrf", (req, res) => {
  noStore(res);
  res.json({ csrfToken: issueCsrfToken(res) });
});

/**
 * POST /api/auth/login
 * La sesión se entrega en cookies httpOnly, nunca en el cuerpo.
 */
router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parseLogin(req.body ?? {});

    let result;

    try {
      result = await loginWithEmail(email, password);
    } catch (error) {
      securityLogFromRequest(req, "login_fallido", {
        reason: "Credenciales inválidas",
        detail: email,
      });
      throw error;
    }

    const profile = await ensureProfile(result.user);

    clearSessionCookies(res);
    setSessionCookies(res, result.session);

    securityLogFromRequest(req, "login_exitoso", {
      level: "info",
      user: email,
      role: profile.role,
    });

    noStore(res);
    res.json({
      success: true,
      user: publicUser(result.user),
      profile,
      role: profile.role,
      message: "Inicio de sesión exitoso",
    });
  }),
);

/**
 * POST /api/auth/refresh
 * Rota el refresh token y renueva las cookies de sesión.
 */
router.post(
  "/refresh",
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = getRefreshToken(req);

    let session;

    try {
      session = await refreshSession(refreshToken);
    } catch (error) {
      clearSessionCookies(res);
      securityLogFromRequest(req, "refresh_fallido", {
        reason: "Refresh token inválido o expirado",
      });
      throw error;
    }

    setSessionCookies(res, session);

    noStore(res);
    res.json({ success: true, message: "Sesión renovada" });
  }),
);

/**
 * POST /api/auth/signup
 * Deshabilitado por defecto: las cuentas se crean desde Supabase y se
 * promueven a admin manualmente.
 */
router.post(
  "/signup",
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!enablePublicSignup) {
      securityLogFromRequest(req, "registro_bloqueado", {
        reason: "El registro público está deshabilitado",
      });
      throw new HttpError(403, "El registro público está deshabilitado");
    }

    const { email, password, fullName } = parseSignup(req.body ?? {});
    const result = await signUpWithEmail(email, password, fullName);

    if (result.session) {
      setSessionCookies(res, result.session);
    }

    securityLogFromRequest(req, "registro_creado", {
      level: "info",
      user: email,
    });

    noStore(res);
    res.status(201).json({
      success: true,
      user: publicUser(result.user),
      message: result.session
        ? "Registro exitoso"
        : "Registro exitoso. Verifica tu correo para confirmar tu cuenta.",
    });
  }),
);

/**
 * GET /api/auth/verify
 */
router.get(
  "/verify",
  authMiddleware,
  asyncHandler(async (req, res) => {
    noStore(res);
    res.json({
      success: true,
      user: publicUser(req.user),
      profile: req.profile,
      role: req.role,
      message: "Token válido",
    });
  }),
);

/**
 * GET /api/auth/me
 */
router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    noStore(res);
    res.json({
      success: true,
      user: publicUser(req.user),
      profile: req.profile,
      role: req.role,
    });
  }),
);

/**
 * POST /api/auth/logout
 * No exige sesión válida para poder limpiar cookies expiradas.
 */
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    let accessToken = getAccessToken(req);
    const refreshToken = getRefreshToken(req);

    // Si el access token ya expiró, se usa el refresh token para poder
    // revocar la sesión en Supabase antes de borrar las cookies.
    if (!accessToken && refreshToken) {
      try {
        accessToken = (await refreshSession(refreshToken)).access_token;
      } catch {
        // La sesión ya no existe; igual se limpian las cookies.
      }
    }

    await logout(accessToken).catch((error) => {
      console.warn("[auth] logout:", error.message);
    });

    clearSessionCookies(res);

    securityLogFromRequest(req, "logout", {
      level: "info",
      user: req.user?.email,
    });

    noStore(res);
    res.json({ success: true, message: "Sesión cerrada correctamente" });
  }),
);

export default router;
