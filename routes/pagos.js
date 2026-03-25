import express from "express";
import Pago from "../models/Pago.js";
import { optionalAuthMiddleware } from "../middleware/authMiddleware.js";
import Alumno from "../models/Alumno.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const pagos = await Pago.find();

  res.json(pagos);
});

router.get("/me", optionalAuthMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const alumno = await Alumno.findOne({ supabaseId: req.user.id });
    if (!alumno) {
      // Si no hay alumno, devolvemos lista vacía en vez de 404 para no romper dashboard
      return res.json([]);
    }

    const pagos = await Pago.find({ alumno: alumno.nombre });
    res.json(pagos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req, res) => {
  const pago = new Pago(req.body);

  await pago.save();

  res.json(pago);
});

export default router;
