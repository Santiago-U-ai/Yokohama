import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  loginWithEmail,
  signUpWithEmail,
  verifyToken,
  logout,
} from "../services/authService.js";

const router = express.Router();

/**
 * POST /api/auth/login
 * Login con email y contraseña
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email y contraseña son requeridos",
      });
    }

    const result = await loginWithEmail(email, password);

    res.json({
      success: true,
      user: result.user,
      accessToken: result.accessToken,
      message: "Inicio de sesión exitoso",
    });
  } catch (error) {
    res.status(401).json({
      error: "Error de autenticación",
      message: error.message,
    });
  }
});

/**
 * POST /api/auth/signup
 * Registro con email y contraseña
 */
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email y contraseña son requeridos",
      });
    }

    const result = await signUpWithEmail(email, password);

    res.json({
      success: true,
      user: result.user,
      message: "Registro exitoso. Verifica tu email para confirmar tu cuenta.",
    });
  } catch (error) {
    res.status(400).json({
      error: "Error en el registro",
      message: error.message,
    });
  }
});

/**
 * GET /api/auth/verify
 * Verificar el token del usuario actual
 */
router.get("/verify", authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user,
      message: "Token válido",
    });
  } catch (error) {
    res.status(401).json({
      error: "Token inválido",
      message: error.message,
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout del usuario
 */
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    await logout(req.headers.authorization.replace("Bearer ", ""));

    res.json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    res.status(500).json({
      error: "Error en logout",
      message: error.message,
    });
  }
});

export default router;
