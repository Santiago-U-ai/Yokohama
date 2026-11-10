import { HttpError } from "./httpError.js";

/**
 * Convierte errores de Supabase en HttpError sin filtrar detalles al cliente
 * en entornos de producción.
 */
export const throwIfError = (
  error,
  status = 500,
  message = "Error de base de datos",
) => {
  if (!error) return;

  const details = error.message || error.details || error.hint || String(error);
  console.error("[supabase]", details);

  throw new HttpError(status, message, details);
};

/**
 * Error de escritura: mapea violaciones de unicidad a 409.
 */
export const throwWriteError = (error, message) => {
  if (!error) return;

  if (error.code === "23505") {
    throw new HttpError(
      409,
      "Ya existe un registro con esos datos",
      error.message,
    );
  }

  throwIfError(error, 400, message);
};
