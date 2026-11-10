import { HttpError } from "./httpError.js";

export const isUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const isEmail = (value) =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const isMonth = (value) =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/**
 * Normaliza un string. Devuelve null si es opcional y está vacío.
 */
export const cleanText = (
  value,
  field,
  { required = false, max = 255, trim = true } = {},
) => {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio`);
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `El campo "${field}" debe ser texto`);
  }

  const text = trim ? value.trim() : value;

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
