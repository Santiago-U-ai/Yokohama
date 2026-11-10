import { securityLogFromRequest } from "../utils/securityLog.js";

export const notFound = (req, res) => {
  // No se devuelve la ruta solicitada para no facilitar el escaneo.
  res.status(404).json({ error: "Ruta no encontrada" });
};

const isJsonParseError = (error) =>
  error?.type === "entity.parse.failed" ||
  (error instanceof SyntaxError && "body" in error);

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.name === "MulterError") {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "El comprobante no puede superar 5 MB"
        : "No se pudo procesar el archivo";

    return res.status(400).json({ error: message });
  }

  if (isJsonParseError(error)) {
    securityLogFromRequest(req, "json_invalido", {
      reason: "Cuerpo JSON malformado",
    });
    return res.status(400).json({ error: "El cuerpo de la solicitud no es válido" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "La solicitud es demasiado grande" });
  }

  const status = Number(error.status) || 500;

  if (status >= 500) {
    console.error("[api]", error);
    securityLogFromRequest(req, "error_interno", {
      level: "error",
      reason: error.message,
    });
  }

  // Nunca se envían detalles internos (mensajes de Supabase, SQL, stack).
  res.status(status).json({
    error: status >= 500 ? "Error interno del servidor" : error.message,
  });
};
