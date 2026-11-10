import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  loginWithEmail,
  signUpWithEmail,
  logout,
} from "../services/authService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { cleanText, isEmail } from "../utils/validation.js";

const router = express.Router();

const parseCredentials = (body) => {
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
  });

  if (password.length < 6) {
    throw new HttpError(400, "La contraseña debe tener al menos 6 caracteres");
  }

  const fullName = cleanText(body.nombre ?? body.full_name, "nombre", {
    max: 120,
  });

  return { email, password, fullName };
};

/**
 * POST /api/auth/login
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = parseCredentials(req.body ?? {});
    const result = await loginWithEmail(email, password);

    res.json({
      success: true,
      user: result.user,
      accessToken: result.accessToken,
      message: "Inicio de sesión exitoso",
    });
  }),
);

/**
 * POST /api/auth/signup
 */
router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email, password, fullName } = parseCredentials(req.body ?? {});
    const result = await signUpWithEmail(email, password, fullName);

    res.status(201).json({
      success: true,
      user: result.user,
      accessToken: result.session?.access_token ?? null,
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
    res.json({
      success: true,
      user: req.user,
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
    res.json({
      success: true,
      user: req.user,
      profile: req.profile,
      role: req.role,
    });
  }),
);

/**
 * POST /api/auth/logout
 */
router.post(
  "/logout",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const result = await logout(req.accessToken);
    res.json({ success: true, ...result });
  }),
);

export default router;
