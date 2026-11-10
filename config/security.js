import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on", "si", "sí"].includes(
    String(value).trim().toLowerCase(),
  );
};

const parseList = (value) =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Orígenes permitidos para CORS. En producción la lista es obligatoria:
 * si está vacía se rechaza todo origen cruzado.
 */
export const allowedOrigins = parseList(process.env.CORS_ORIGINS);
if (!isProduction && allowedOrigins.length === 0) {
  allowedOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");
}
export const frontendUrl = process.env.FRONTEND_URL || "";

export const trustProxy = parseBoolean(process.env.TRUST_PROXY, isProduction);
export const trustProxyHops = parseNumber(process.env.TRUST_PROXY_HOPS, 1);
export const forceHttps = parseBoolean(process.env.FORCE_HTTPS, isProduction);

export const enablePublicSignup = parseBoolean(
  process.env.ENABLE_PUBLIC_SIGNUP,
  false,
);

/**
 * Cookies de sesión httpOnly: el navegador nunca ve el token de acceso ni
 * el refresh token, así un XSS no puede robarlos con document.cookie.
 */
export const cookieSecure = parseBoolean(process.env.COOKIE_SECURE, isProduction);
export const cookieSameSite = process.env.COOKIE_SAMESITE || "lax";

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "yh_session";
export const REFRESH_COOKIE = process.env.REFRESH_COOKIE_NAME || "yh_refresh";
export const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || "yh_csrf";

export const SESSION_TTL_MINUTES = parseNumber(
  process.env.SESSION_TTL_MINUTES,
  55,
);
export const REFRESH_TTL_DAYS = parseNumber(process.env.REFRESH_TTL_DAYS, 30);
export const CSRF_TTL_HOURS = parseNumber(process.env.CSRF_TTL_HOURS, 12);

export const sessionCookieOptions = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieSameSite,
  path: "/",
  maxAge: SESSION_TTL_MINUTES * 60 * 1000,
};

export const refreshCookieOptions = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieSameSite,
  path: "/api/auth",
  maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
};

export const csrfCookieOptions = {
  httpOnly: false,
  secure: cookieSecure,
  sameSite: cookieSameSite,
  path: "/",
  maxAge: CSRF_TTL_HOURS * 60 * 60 * 1000,
};

/** Token aleatorio para el patrón double-submit de CSRF. */
export const createCsrfToken = () => crypto.randomBytes(32).toString("hex");
