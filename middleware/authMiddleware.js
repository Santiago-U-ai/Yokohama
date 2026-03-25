import { supabase } from "../config/supabase.js";

/**
 * Middleware para verificar autenticación con Supabase
 * Extrae el token JWT del header Authorization y lo valida
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "No autorizado",
        message: "Falta el token de autenticación",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verifica el token con Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: "Token inválido",
        message: error?.message || "No se pudo verificar el usuario",
      });
    }

    // Agrega el usuario al objeto request
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({
      error: "Error en autenticación",
      message: error.message,
    });
  }
};

/**
 * Middleware opcional - no bloquea pero agrega el usuario si está disponible
 */
export const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabase.auth.getUser(token);

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Si hay error, continúa sin usuario
    next();
  }
};
