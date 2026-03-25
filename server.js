import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";

import alumnosRoutes from "./routes/alumnos.js";
import pagosRoutes from "./routes/pagos.js";
import dashboardRoutes from "./routes/dashboard.js";
dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// Rutas de autenticación
app.use("/api/auth", authRoutes);

// Rutas de negocio
app.use("/api", dashboardRoutes);
app.use("/api/alumnos", alumnosRoutes);
app.use("/api/pagos", pagosRoutes);
app.get("/api/debug", (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT, () => {
  console.log("Servidor corriendo en el puerto " + process.env.PORT);
});
