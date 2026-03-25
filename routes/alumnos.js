import express from "express";
import Alumno from "../models/Alumno.js";
import { optionalAuthMiddleware } from "../middleware/authMiddleware.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", optionalAuthMiddleware, async (req, res) => {
  try {
    const alumnos = await Alumno.find();
    res.json(alumnos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/me", optionalAuthMiddleware, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "No autorizado" });
    }

    let alumno = await Alumno.findOne({ supabaseId: req.user.id });

    // Si no existe registro, crearlo automáticamente para permitir el flujo de dashboard
    if (!alumno) {
      const nombrePredeterminado =
        req.user.user_metadata?.full_name || req.user.email || "Alumno";

      alumno = new Alumno({
        nombre: nombrePredeterminado,
        correo: req.user.email,
        telefono: "",
        edad: 0,
        direccion: "",
        supabaseId: req.user.id,
      });

      await alumno.save();
    }

    res.json(alumno);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", optionalAuthMiddleware, async (req, res) => {
  try {
    const { nombre, correo, telefono, edad, direccion, supabaseId } = req.body;

    // Validación básica
    if (!nombre || !correo) {
      return res.status(400).json({
        error: "Error al registrar alumno",
        message: "Nombre y correo son requeridos",
      });
    }

    // Si hay usuario autenticado, guarda su ID de Supabase, si no toma el valor de body
    const alumnoData = {
      nombre,
      correo,
      telefono: telefono || "",
      edad: edad || 0,
      direccion: direccion || "",
      supabaseId: req.user?.id || supabaseId || null,
    };

    // Checar si ya existe alumno con este supabaseId
    if (alumnoData.supabaseId) {
      const existente = await Alumno.findOne({
        supabaseId: alumnoData.supabaseId,
      });
      if (existente) {
        return res.status(409).json({
          success: false,
          error: "Este usuario ya está registrado",
          alumno: existente,
        });
      }
    }

    const alumno = new Alumno(alumnoData);
    await alumno.save();

    res.status(201).json({
      success: true,
      message: "Alumno registrado correctamente",
      alumno,
    });
  } catch (error) {
    console.error("Error al guardar alumno:", error);
    res.status(400).json({
      error: "Error al registrar alumno",
      message: error.message,
    });
  }
});

export default router;
