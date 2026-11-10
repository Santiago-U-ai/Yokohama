import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { securityLogFromRequest } from "../utils/securityLog.js";

const rateLimitHandler = (event) => (req, res) => {
  securityLogFromRequest(req, event, {
    reason: "Límite de peticiones excedido",
  });

  res.status(429).json({
    error: "Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.",
  });
};

const baseOptions = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
};

export const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 400,
  skip: (req) => req.method === "OPTIONS",
  handler: rateLimitHandler("rate_limit_global"),
});

/**
 * Límite agresivo para login/registro. Cuenta por IP + correo para frenar
 * ataques de fuerza bruta sin bloquear a todos los usuarios de una red.
 */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email ?? req.body?.correo ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 160);
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  handler: rateLimitHandler("rate_limit_auth"),
});

export const refreshLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  handler: rateLimitHandler("rate_limit_refresh"),
});

export const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  handler: rateLimitHandler("rate_limit_upload"),
});
