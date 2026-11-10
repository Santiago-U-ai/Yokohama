import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import alumnosRoutes from "./routes/alumnos.js";
import pagosRoutes from "./routes/pagos.js";
import dashboardRoutes from "./routes/dashboard.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { globalLimiter } from "./middleware/rateLimit.js";
import {
  corsOptions,
  csrfProtection,
  enforceHttps,
  originGuard,
  prototypePollutionGuard,
  securityHeaders,
} from "./middleware/security.js";
import {
  allowedOrigins,
  cookieSecure,
  forceHttps,
  isProduction,
  trustProxy,
  trustProxyHops,
} from "./config/security.js";
import { startRemindersJob } from "./jobs/recordatorios.js";
import { startCobrosJob } from "./jobs/cobros.js";
import { securityLog } from "./utils/securityLog.js";

dotenv.config();

const app = express();

// No revelar el framework en las cabeceras.
app.disable("x-powered-by");

// Necesario para req.secure y para el rate limit detrás de un proxy.
app.set("trust proxy", trustProxy ? trustProxyHops : false);

app.use((req, res, next) => {
  req.id = req.get("x-request-id") || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});

app.use(securityHeaders);
app.use(enforceHttps);
app.use(cors(corsOptions));
app.use(cookieParser());

// El límite global va antes de parsear el cuerpo y de validar CSRF/origen,
// para que los intentos inválidos también cuenten.
app.use("/api", globalLimiter);

app.use(express.json({ limit: "100kb", strict: true }));
app.use(prototypePollutionGuard);
app.use(originGuard);
app.use(csrfProtection);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "yokohama-backend",
    timestamp: new Date().toISOString(),
  });
});

// Autenticación
app.use("/api/auth", authRoutes);

// Recursos
app.use("/api/alumnos", alumnosRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const assertProductionConfig = () => {
  if (!isProduction) return;

  if (allowedOrigins.length === 0) {
    console.warn(
      "[seguridad] CORS_ORIGINS está vacío en producción: se rechazará todo origen cruzado.",
    );
  }

  if (!cookieSecure) {
    console.warn(
      "[seguridad] COOKIE_SECURE está desactivado en producción. Actívalo para que las cookies no viajen por HTTP.",
    );
  }

  if (!forceHttps) {
    console.warn(
      "[seguridad] FORCE_HTTPS está desactivado en producción. Se recomienda activarlo.",
    );
  }
};

app.listen(PORT, () => {
  console.log(`Servidor Yokohama escuchando en el puerto ${PORT}`);
  assertProductionConfig();
  startCobrosJob();
  startRemindersJob();
});

process.on("unhandledRejection", (reason) => {
  securityLog("unhandled_rejection", {
    level: "error",
    detail: reason?.message || String(reason),
  });
});

process.on("uncaughtException", (error) => {
  securityLog("uncaught_exception", {
    level: "error",
    detail: error?.message || String(error),
  });
});
