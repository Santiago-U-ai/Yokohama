import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../utils/httpError.js";
import {
  assertEnum,
  assertOneOf,
  cleanText,
  isDate,
  isEmail,
  isMonth,
  isTime,
  isUuid,
  parseBoolean,
  parseDate,
  parseInteger,
  parseNumber,
  parseTime,
} from "../utils/validation.js";

const isHttpError = (status) => (error) =>
  error instanceof HttpError && error.status === status;

test("isUuid acepta UUIDs válidos y rechaza el resto", () => {
  assert.equal(isUuid("7f1c2b3a-4d5e-4f60-8a9b-0c1d2e3f4a5b"), true);
  assert.equal(isUuid("no-es-uuid"), false);
  assert.equal(isUuid(null), false);
});

test("isEmail valida correos básicos", () => {
  assert.equal(isEmail("alumno@example.com"), true);
  assert.equal(isEmail("alumno.example.com"), false);
});

test("isMonth solo acepta YYYY-MM", () => {
  assert.equal(isMonth("2026-11"), true);
  assert.equal(isMonth("2026-13"), false);
  assert.equal(isMonth("11-2026"), false);
});

test("isDate solo acepta fechas reales en formato AAAA-MM-DD", () => {
  assert.equal(isDate("2024-02-29"), true);
  assert.equal(isDate("2023-02-29"), false);
  assert.equal(isDate("2024-13-01"), false);
  assert.equal(isDate("01-02-2024"), false);
  assert.equal(isDate("ayer"), false);
});

test("parseDate normaliza opcionales y valida rangos", () => {
  assert.equal(parseDate("2024-02-29", "fecha_nacimiento"), "2024-02-29");
  assert.equal(parseDate("", "fecha_nacimiento"), null);
  assert.equal(parseDate(null, "fecha_inicio"), null);
  assert.throws(() => parseDate("2023-02-29", "fecha"), isHttpError(400));
  assert.throws(() => parseDate("2024-13-01", "fecha"), isHttpError(400));
  assert.throws(
    () => parseDate("2024-05-01", "fecha", { max: "2024-04-30" }),
    isHttpError(400),
  );
  assert.throws(
    () => parseDate("1899-12-31", "fecha", { min: "1900-01-01" }),
    isHttpError(400),
  );
});

test("isTime solo acepta horas reales en formato HH:MM", () => {
  assert.equal(isTime("08:30"), true);
  assert.equal(isTime("23:59"), true);
  assert.equal(isTime("00:00:00"), true);
  assert.equal(isTime("24:00"), false);
  assert.equal(isTime("8:30"), false);
  assert.equal(isTime("18:60"), false);
  assert.equal(isTime("tarde"), false);
});

test("parseTime normaliza a HH:MM y valida obligatorios", () => {
  assert.equal(parseTime("18:30", "hora"), "18:30");
  assert.equal(parseTime("18:30:45", "hora"), "18:30");
  assert.equal(parseTime("", "hora"), null);
  assert.equal(parseTime(null, "hora"), null);
  assert.throws(() => parseTime("", "hora", { required: true }), isHttpError(400));
  assert.throws(() => parseTime("25:00", "hora"), isHttpError(400));
  assert.throws(() => parseTime(1830, "hora"), isHttpError(400));
});

test("cleanText recorta, valida obligatorios y longitud", () => {
  assert.equal(cleanText("  Emiliano  ", "nombre"), "Emiliano");
  assert.equal(cleanText("", "nombre"), null);
  assert.throws(
    () => cleanText("", "nombre", { required: true }),
    isHttpError(400),
  );
  assert.throws(
    () => cleanText("abc", "nombre", { max: 2 }),
    isHttpError(400),
  );
});

test("cleanText puede conservar espacios (contraseñas)", () => {
  assert.equal(cleanText(" pass word ", "password", { trim: false }), " pass word ");
});

test("parseInteger valida enteros y rangos", () => {
  assert.equal(parseInteger("12", "edad", { min: 0, max: 120 }), 12);
  assert.equal(parseInteger("", "edad"), null);
  assert.throws(() => parseInteger("12.5", "edad"), isHttpError(400));
  assert.throws(() => parseInteger("130", "edad", { max: 120 }), isHttpError(400));
});

test("parseNumber valida decimales y rangos", () => {
  assert.equal(parseNumber("500.50", "monto", { min: 0 }), 500.5);
  assert.throws(() => parseNumber("abc", "monto"), isHttpError(400));
  assert.throws(() => parseNumber("-1", "monto", { min: 0 }), isHttpError(400));
});

test("parseBoolean normaliza booleanos y strings", () => {
  assert.equal(parseBoolean(true, "activo"), true);
  assert.equal(parseBoolean("false", "activo"), false);
  assert.equal(parseBoolean(1, "activo"), true);
  assert.throws(() => parseBoolean("tal vez", "activo"), isHttpError(400));
});

test("assertEnum y assertOneOf validan valores permitidos", () => {
  assert.equal(assertEnum("baby", "grupo", ["BABY", "JUVENIL"]), "BABY");
  assert.equal(assertOneOf("pagado", "estado", ["pendiente", "pagado"]), "pagado");
  assert.throws(
    () => assertEnum("infantil", "grupo", ["BABY", "JUVENIL"]),
    isHttpError(400),
  );
  assert.throws(
    () => assertOneOf("otro", "estado", ["pendiente", "pagado"]),
    isHttpError(400),
  );
});
