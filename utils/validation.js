import { HttpError } from "./httpError.js";

export const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const isEmail = (value) =>
  typeof value === "string" &&
  value.length <= 254 &&
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) &&
  !/[\u0000-\u001F\u007F]/.test(value);

export const isMonth = (value) =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/**
 * Caracteres de control y de formato bidireccional que permiten inyectar
 * saltos, ocultar texto o romper cabeceras.
 */
const DANGEROUS_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * Limpia texto libre antes de guardarlo: elimina controles y los signos
 * `<`/`>` para que nunca se almacene HTML ejecutable (defensa en
 * profundidad; React además escapa al renderizar).
 */
export const sanitizeText = (value) =>
  String(value).replace(DANGEROUS_CHARS, "").replace(/[<>]/g, "").normalize("NFC");

/**
 * Normaliza un string. Devuelve null si es opcional y está vacío.
 */
export const cleanText = (
  value,
  field,
  { required = false, max = 255, trim = true, sanitize = true } = {},
) => {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio`);
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `El campo "${field}" debe ser texto`);
  }

  const cleaned = sanitize ? sanitizeText(value) : value;
  const text = trim ? cleaned.trim() : cleaned;

  if (!text) {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio`);
    return null;
  }

  if (text.length > max) {
    throw new HttpError(
      400,
      `El campo "${field}" no puede superar ${max} caracteres`,
    );
  }

  return text;
};

/**
 * Término de búsqueda seguro para PostgREST: solo letras, números y unos
 * pocos signos. Evita inyectar operadores en `.or()` o comodines de SQL.
 */
export const sanitizeSearchTerm = (value, max = 80) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") {
    throw new HttpError(400, 'El campo "q" debe ser texto');
  }

  const term = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}@._\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

  return term || null;
};

export const parseInteger = (
  value,
  field,
  { required = false, min, max } = {},
) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio`);
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new HttpError(400, `El campo "${field}" debe ser un número entero`);
  }
  if (min !== undefined && number < min) {
    throw new HttpError(400, `El campo "${field}" debe ser mayor o igual a ${min}`);
  }
  if (max !== undefined && number > max) {
    throw new HttpError(400, `El campo "${field}" debe ser menor o igual a ${max}`);
  }

  return number;
};

export const parseNumber = (
  value,
  field,
  { required = false, min, max } = {},
) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio`);
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new HttpError(400, `El campo "${field}" debe ser un número`);
  }
  if (min !== undefined && number < min) {
    throw new HttpError(400, `El campo "${field}" debe ser mayor o igual a ${min}`);
  }
  if (max !== undefined && number > max) {
    throw new HttpError(400, `El campo "${field}" debe ser menor o igual a ${max}`);
  }

  return number;
};

export const parseBoolean = (value, field) => {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  throw new HttpError(400, `El campo "${field}" debe ser booleano`);
};

export const assertEnum = (value, field, allowed) => {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).toUpperCase();
  if (!allowed.includes(normalized)) {
    throw new HttpError(
      400,
      `El campo "${field}" debe ser uno de: ${allowed.join(", ")}`,
    );
  }
  return normalized;
};

export const assertOneOf = (value, field, allowed) => {
  if (!allowed.includes(value)) {
    throw new HttpError(
      400,
      `El campo "${field}" debe ser uno de: ${allowed.join(", ")}`,
    );
  }
  return value;
};
