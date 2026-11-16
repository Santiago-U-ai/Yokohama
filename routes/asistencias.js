import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import {
  authMiddleware,
  requireAdmin,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { serializeAsistencia } from "../utils/serializers.js";
import { throwIfError, throwWriteError } from "../utils/supabaseError.js";
import {
  assertEnum,
  isTime,
  isUuid,
  parseBoolean,
  parseDate,
  parseTime,
} from "../utils/validation.js";

const router = express.Router();

const GRUPOS = ["BABY", "JUVENIL", "SENIOR"];
const SEDES = ["NORTE", "SUR"];

/** Tope de alumnos por llamada a lista. */
const MAX_REGISTROS = 200;

/** Fecha de hoy (AAAA-MM-DD) para rechazar asistencias futuras. */
const todayISO = () => new Date().toISOString().slice(0, 10);

const ASISTENCIA_SELECT =
  "*, alumno:alumnos(id, nombre, correo, grupo, sede)";

const byAlumnoName = (a, b) =>
  String(a.alumno ?? "").localeCompare(String(b.alumno ?? ""), "es");

/**
 * Normaliza la lista de registros enviada por el panel:
 * { alumno_id, presente }. Descarta duplicados (gana el último).
 */
const parseRegistros = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "Debes enviar al menos un alumno en la lista");
  }

  if (value.length > MAX_REGISTROS) {
    throw new HttpError(
      400,
      `La lista no puede superar ${MAX_REGISTROS} alumnos`,
    );
  }

  const porAlumno = new Map();

  for (const registro of value) {
    if (!registro || typeof registro !== "object") {
      throw new HttpError(400, "Cada registro de la lista debe ser un objeto");
    }

    if (!isUuid(registro.alumno_id)) {
      throw new HttpError(400, 'El campo "alumno_id" no es un UUID válido');
    }

    porAlumno.set(registro.alumno_id, {
      alumno_id: registro.alumno_id,
      presente: parseBoolean(registro.presente, "presente"),
    });
  }

  return [...porAlumno.values()];
};

/**
 * GET /api/asistencias
 * Solo admin. Filtros: ?fecha=AAAA-MM-DD&hora=HH:MM&grupo=BABY&sede=NORTE
 */
router.get(
  "/",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fecha = parseDate(req.query.fecha, "fecha", {
      required: true,
      min: "1900-01-01",
    });
    const hora = parseTime(req.query.hora, "hora");
    const grupo = assertEnum(req.query.grupo, "grupo", GRUPOS);
    const sede = assertEnum(req.query.sede, "sede", SEDES);

    let query = supabaseAdmin
      .from("asistencias")
      .select(ASISTENCIA_SELECT)
      .eq("fecha", fecha);

    // Postgres compara `time` con la forma HH:MM sin problema.
    if (hora) query = query.eq("hora", hora);

    // El grupo y la sede viven en `alumnos`, así que primero se resuelven
    // los ids que cumplen el filtro.
    if (grupo || sede) {
      let alumnosQuery = supabaseAdmin.from("alumnos").select("id");

      if (grupo) alumnosQuery = alumnosQuery.eq("grupo", grupo);
      if (sede) alumnosQuery = alumnosQuery.eq("sede", sede);

      const { data: alumnos, error: alumnosError } = await alumnosQuery;
      throwIfError(alumnosError);

      const ids = (alumnos ?? []).map((alumno) => alumno.id);
      if (ids.length === 0) return res.json([]);

      query = query.in("alumno_id", ids);
    }

    const { data, error } = await query;
    throwIfError(error);

    res.json((data ?? []).map(serializeAsistencia).sort(byAlumnoName));
  }),
);

/**
 * POST /api/asistencias
 * Solo admin. Registra la lista completa de un entreno:
 * { fecha, hora, registros: [{ alumno_id, presente }] }.
 * Es idempotente por (alumno_id, fecha, hora): vuelve a guardar y actualiza.
 */
router.post(
  "/",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};

    const fecha = parseDate(body.fecha, "fecha", {
      required: true,
      min: "1900-01-01",
      max: todayISO(),
    });
    const hora = parseTime(body.hora, "hora", { required: true });
    const registros = parseRegistros(body.registros);

    // Todos los alumnos deben existir: evita registros huérfanos y confirma
    // que el panel está trabajando con datos vigentes.
    const ids = registros.map((registro) => registro.alumno_id);
    const { data: alumnos, error: alumnosError } = await supabaseAdmin
      .from("alumnos")
      .select("id")
      .in("id", ids);

    throwIfError(alumnosError);

    const existentes = new Set((alumnos ?? []).map((alumno) => alumno.id));
    const faltante = ids.find((id) => !existentes.has(id));

    if (faltante) {
      throw new HttpError(
        400,
        "Uno de los alumnos de la lista ya no existe. Recarga e inténtalo de nuevo",
      );
    }

    const rows = registros.map((registro) => ({
      alumno_id: registro.alumno_id,
      fecha,
      hora,
      presente: registro.presente,
      registrado_por: req.user.id,
    }));

    const { data, error } = await supabaseAdmin
      .from("asistencias")
      .upsert(rows, { onConflict: "alumno_id,fecha,hora" })
      .select(ASISTENCIA_SELECT);

    throwWriteError(error, "No se pudo guardar la asistencia");

    res.json((data ?? []).map(serializeAsistencia).sort(byAlumnoName));
  }),
);

/**
 * GET /api/asistencias/resumen
 * Solo admin. Totales por alumno en un rango, para ver la constancia.
 * Filtros: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 */
router.get(
  "/resumen",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const desde = parseDate(req.query.desde, "desde", { min: "1900-01-01" });
    const hasta = parseDate(req.query.hasta, "hasta", { min: "1900-01-01" });

    let query = supabaseAdmin
      .from("asistencias")
      .select("alumno_id, fecha, hora, presente");

    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);

    const { data, error } = await query;
    throwIfError(error);

    const resumen = new Map();

    for (const row of data ?? []) {
      const actual = resumen.get(row.alumno_id) ?? {
        alumno_id: row.alumno_id,
        clases: 0,
        asistencias: 0,
      };

      actual.clases += 1;
      if (row.presente) actual.asistencias += 1;

      resumen.set(row.alumno_id, actual);
    }

    res.json([...resumen.values()]);
  }),
);

export default router;
