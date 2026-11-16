import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import {
  authMiddleware,
  requireAdmin,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { groupClases } from "../utils/asistencias.js";
import { HttpError } from "../utils/httpError.js";
import { serializeAsistencia } from "../utils/serializers.js";
import { throwIfError, throwWriteError } from "../utils/supabaseError.js";
import {
  assertEnum,
  isUuid,
  parseBoolean,
  parseDate,
  parseInteger,
  parseTime,
} from "../utils/validation.js";

const router = express.Router();

const GRUPOS = ["BABY", "JUVENIL", "SENIOR"];
const SEDES = ["NORTE", "SUR"];

/** Tope de alumnos por llamada a lista. */
const MAX_REGISTROS = 200;

/** Tope de clases devueltas por el historial. */
const MAX_CLASES = 200;

/** Fecha de hoy (AAAA-MM-DD) para rechazar asistencias futuras. */
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Suma (o resta) días a una fecha ISO. */
const shiftDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const ASISTENCIA_SELECT =
  "*, alumno:alumnos(id, nombre, correo, grupo, sede)";

const byAlumnoName = (a, b) =>
  String(a.alumno ?? "").localeCompare(String(b.alumno ?? ""), "es");

/**
 * PostgREST devuelve como máximo 1000 filas por petición, así que el
 * historial se pide por páginas hasta agotar el rango.
 */
const fetchAsistencias = async (buildQuery) => {
  const pageSize = 1000;
  const rows = [];

  for (let page = 0; page < 10; page += 1) {
    const from = page * pageSize;
    const { data, error } = await buildQuery().range(
      from,
      from + pageSize - 1,
    );

    throwIfError(error);

    rows.push(...(data ?? []));

    if ((data ?? []).length < pageSize) break;
  }

  return rows;
};


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

    const { data, error } = await query;
    throwIfError(error);

    // El grupo y la sede se guardan en el propio registro; si un alumno
    // cambió de grupo, la lista antigua sigue perteneciendo a su clase.
    const lista = (data ?? [])
      .map(serializeAsistencia)
      .filter((registro) => {
        const grupoRegistro =
          registro.grupo ?? registro.alumnoGrupo ?? "SIN GRUPO";
        const sedeRegistro = registro.sede ?? registro.alumnoSede;

        return (
          (!grupo || grupoRegistro === grupo) && (!sede || sedeRegistro === sede)
        );
      })
      .sort(byAlumnoName);

    res.json(lista);
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
      .select("id, grupo, sede")
      .in("id", ids);

    throwIfError(alumnosError);

    const porId = new Map((alumnos ?? []).map((alumno) => [alumno.id, alumno]));
    const faltante = ids.find((id) => !porId.has(id));

    if (faltante) {
      throw new HttpError(
        400,
        "Uno de los alumnos de la lista ya no existe. Recarga e inténtalo de nuevo",
      );
    }

    const rows = registros.map((registro) => {
      const alumno = porId.get(registro.alumno_id);

      return {
        alumno_id: registro.alumno_id,
        fecha,
        hora,
        presente: registro.presente,
        // La clase queda fijada aunque después el alumno cambie de grupo.
        grupo: alumno?.grupo ?? null,
        sede: alumno?.sede ?? null,
        registrado_por: req.user.id,
      };
    });

    const { data, error } = await supabaseAdmin
      .from("asistencias")
      .upsert(rows, { onConflict: "alumno_id,fecha,hora" })
      .select(ASISTENCIA_SELECT);

    throwWriteError(error, "No se pudo guardar la asistencia");

    res.json((data ?? []).map(serializeAsistencia).sort(byAlumnoName));
  }),
);

/**
 * GET /api/asistencias/clases
 * Solo admin. Lista las clases con lista guardada, agrupadas por
 * fecha, hora, sede y grupo.
 * Filtros: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&grupo=BABY&sede=NORTE&limit=30
 */
router.get(
  "/clases",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const hoy = todayISO();
    const desde =
      parseDate(req.query.desde, "desde", { min: "1900-01-01" }) ??
      shiftDays(hoy, -60);
    const hasta =
      parseDate(req.query.hasta, "hasta", { min: "1900-01-01" }) ?? hoy;
    const grupo = assertEnum(req.query.grupo, "grupo", GRUPOS);
    const sede = assertEnum(req.query.sede, "sede", SEDES);
    const limit = parseInteger(req.query.limit ?? 30, "limit", {
      min: 1,
      max: MAX_CLASES,
    });

    if (desde > hasta) {
      throw new HttpError(400, "El rango de fechas está invertido");
    }

    const rows = await fetchAsistencias(() =>
      supabaseAdmin
        .from("asistencias")
        .select(
          "alumno_id, fecha, hora, presente, grupo, sede, alumno:alumnos(grupo, sede)",
        )
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false })
        .order("hora", { ascending: false })
        // Desempata para que la paginación no repita ni pierda filas.
        .order("alumno_id", { ascending: true }),
    );

    res.json(groupClases(rows, { grupo, sede, limit }));
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
