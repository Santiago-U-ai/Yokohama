import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import alumnosRoutes from "./routes/alumnos.js";
import pagosRoutes from "./routes/pagos.js";
import dashboardRoutes from "./routes/dashboard.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { startRemindersJob } from "./jobs/recordatorios.js";
import { startCobrosJob } from "./jobs/cobros.js";

dotenv.config();

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "yokohama-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/debug", (req, res) => res.json({ ok: true }));

// Autenticación
app.use("/api/auth", authRoutes);

// Negocio
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/alumnos", alumnosRoutes);
app.use("/api/pagos", pagosRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});

// Cobro automático de la mensualidad de cada mes.
startCobrosJob();

if (process.env.ENABLE_REMINDERS === "true") {
  startRemindersJob();
}

export default app;
