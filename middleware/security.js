import crypto from "node:crypto";
import helmet from "helmet";
import {
  CSRF_COOKIE,
  allowedOrigins,
  createCsrfToken,
  csrfCookieOptions,
  forceHttps,
  isProduction,
} from "../config/security.js";
import { securityLogFromRequest } from "../utils/securityLog.js";

const safeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return (
    bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB)
  );
};

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
};

/**
 * Cabeceras de seguridad para todas las respuestas. La API solo devuelve
 * JSON, así que la CSP más estricta posible es `default-src 'none'`.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
      "frame-ancestors": ["'none'"],
      "img-src": ["'none'"],
      "object-src": ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
  frameguard: { action: "deny" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
});

/**
 * Fuerza HTTPS en producción. Para peticiones GET redirige; para el resto
 * (que podrían llevar credenciales) responde 403 en lugar de reenviar el
 * cuerpo a otra URL.
 */
export const enforceHttps = (req, res, next) => {
  if (!forceHttps || req.secure) return next();

  securityLogFromRequest(req, "https_requerido", {
    reason: "Petición sin TLS",
  });

  if (req.method === "GET" || req.method === "HEAD") {
    const host = req.get("host");
    return res.redirect(308, `https://${host}${req.originalUrl}`);
  }

  return res.status(403).json({ error: "Se requiere una conexión HTTPS" });
};

/**
 * Rechaza orígenes no autorizados antes de llegar a las rutas. Sin esta
 * comprobación el navegador bloquearía la lectura, pero la petición ya se
 * habría ejecutado.
 */
export const originGuard = (req, res, next) => {
  const origin = req.get("origin");

  if (!origin || isAllowedOrigin(origin)) return next();

  securityLogFromRequest(req, "origen_no_permitido", {
    reason: "Origen fuera de la allowlist",
    detail: origin,
  });

  return res.status(403).json({ error: "Origen no permitido" });
};

export const corsOptions = {
  origin(origin, callback) {
    // Sin Origin (curl, health checks, mismo origen) se permite; el
    // originGuard ya validó los orígenes presentes.
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-CSRF-Token",
    "X-Requested-With",
  ],
  exposedHeaders: ["X-Request-Id", "Retry-After"],
  maxAge: 600,
};

/**
 * Emite un token CSRF y lo guarda en una cookie legible por el frontend.
 * El cliente debe devolverlo en la cabecera X-CSRF-Token.
 */
export const issueCsrfToken = (res) => {
  const token = createCsrfToken();
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions);
  return token;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Protección CSRF double-submit: la cookie y la cabecera deben coincidir.
 * Se aplica a toda petición que modifica estado (incluido el login).
 */
export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get("x-csrf-token");

  if (!safeCompare(cookieToken, headerToken)) {
    securityLogFromRequest(req, "csrf_invalido", {
      reason: "Token CSRF ausente o distinto",
      detail: cookieToken ? "token no coincide" : "cookie CSRF ausente",
    });

    return res.status(403).json({
      error: "Solicitud no válida. Recarga la página e inténtalo de nuevo.",
    });
  }

  return next();
};

/**
 * Bloquea claves peligrosas en el cuerpo JSON (prototype pollution).
 */
export const prototypePollutionGuard = (req, res, next) => {
  const forbidden = new Set(["__proto__", "constructor", "prototype"]);

  const walk = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 6) return false;
    return Object.keys(value).some(
      (key) => forbidden.has(key) || walk(value[key], depth + 1),
    );
  };

  if (req.body && walk(req.body)) {
    securityLogFromRequest(req, "payload_peligroso", {
      reason: "Claves de prototype pollution en el cuerpo",
    });
    return res.status(400).json({ error: "Solicitud no válida" });
  }

  return next();
};
