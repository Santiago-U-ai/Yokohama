import express from "express";
import { supabaseAdmin, storageBucket } from "../config/supabase.js";
import {
  authMiddleware,
  requireAdmin,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureCobroMes } from "../utils/cobros.js";
import { HttpError } from "../utils/httpError.js";
import { attachPaymentInfo } from "../utils/paymentInfo.js";
import { serializeAlumno } from "../utils/serializers.js";
import { throwIfError, throwWriteError } from "../utils/supabaseError.js";
import {
  assertEnum,
  cleanText,
  isEmail,
  isUuid,
  parseBoolean,
  parseDate,
  sanitizeSearchTerm,
} from "../utils/validation.js";

const router = express.Router();

const GRUPOS = ["BABY", "JUVENIL", "SENIOR"];

/** Fecha de hoy (AAAA-MM-DD) para rechazar fechas futuras. */
const todayISO = () => new Date().toISOString().slice(0, 10);

// Incluye los pagos para calcular el último pago y los pendientes.
const ALUMNO_SELECT = "*, pagos(mes, estado, monto, fecha_pago)";

const normalizeAlumnoPayload = (body, { partial = false } = {}) => {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const payload = {};

  if (!partial || has("nombre")) {
    payload.nombre = cleanText(body.nombre, "nombre", {
      required: true,
      max: 120,
    });
  }

  if (has("correo")) {
    payload.correo = cleanText(body.correo, "correo", { max: 160 });
    if (payload.correo && !isEmail(payload.correo)) {
      throw new HttpError(400, "El correo no es válido");
    }
  }

  if (has("telefono")) {
    payload.telefono = cleanText(body.telefono, "telefono", { max: 40 });
  }

  if (has("fecha_nacimiento")) {
    payload.fecha_nacimiento = parseDate(
      body.fecha_nacimiento,
      "fecha_nacimiento",
      { max: todayISO() },
    );
  }

  if (has("fecha_inicio")) {
    payload.fecha_inicio = parseDate(body.fecha_inicio, "fecha_inicio", {
      max: todayISO(),
    });
  }

  if (has("direccion")) {
    payload.direccion = cleanText(body.direccion, "direccion", { max: 200 });
  }

  if (has("grupo")) {
    payload.grupo = assertEnum(body.grupo, "grupo", GRUPOS);
  }

  if (has("cinturon")) {
    payload.cinturon = cleanText(body.cinturon, "cinturon", { max: 40 });
  }

  if (has("activo")) {
    payload.activo = parseBoolean(body.activo, "activo");
  }

  if (has("user_id")) {
    if (body.user_id === null || body.user_id === "") {
      payload.user_id = null;
    } else if (isUuid(body.user_id)) {
      payload.user_id = body.user_id;
    } else {
      throw new HttpError(400, "El campo \"user_id\" no es un UUID válido");
    }
  }

  return payload;
};

const findAlumnoById = async (id) => {
  const { data, error } = await supabaseAdmin
    .from("alumnos")
    .select(ALUMNO_SELECT)
    .eq("id", id)
    .maybeSingle();

  throwIfError(error);
  return data;
};

const canAccessAlumno = (req, alumno) =>
  req.role === "admin" || alumno.user_id === req.user.id;

/**
 * Crea el cobro del mes actual para un alumno recién registrado y
 * devuelve la fila completa con su estado de mensualidad.
 */
const withCobroActual = async (alumno) => {
  try {
    await ensureCobroMes(alumno.id);
  } catch (error) {
    console.error(
      "[cobros] no se pudo crear el cobro del mes para el alumno:",
      error.message,
    );
  }

  return (await findAlumnoById(alumno.id)) ?? alumno;
};

/**
 * GET /api/alumnos
 * Solo admin. Filtros: ?grupo=BABY&activo=true&q=texto
 */
router.get(
  "/",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from("alumnos")
      .select(ALUMNO_SELECT)
      .order("nombre", { ascending: true });

    if (req.query.grupo) {
      const grupo = assertEnum(req.query.grupo, "grupo", GRUPOS);
      query = query.eq("grupo", grupo);
    }

    if (req.query.activo !== undefined) {
      query = query.eq("activo", parseBoolean(req.query.activo, "activo"));
    }

    if (req.query.q) {
      const term = sanitizeSearchTerm(req.query.q, 80);

      if (term) {
        // El término ya está limitado a letras, números y signos seguros,
        // así no puede inyectar operadores en el filtro de PostgREST.
        query = query.or(`nombre.ilike.%${term}%,correo.ilike.%${term}%`);
      }
    }

    const { data, error } = await query;
    throwIfError(error);

    res.json((data ?? []).map((row) => serializeAlumno(attachPaymentInfo(row))));
  }),
);

/**
 * GET /api/alumnos/me
 * Devuelve la ficha del usuario autenticado. Si existe una ficha creada
 * por un admin con el mismo correo, la vincula automáticamente.
 */
router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { data: linked, error: linkedError } = await supabaseAdmin
      .from("alumnos")
      .select(ALUMNO_SELECT)
      .eq("user_id", req.user.id)
      .maybeSingle();

    throwIfError(linkedError);
    if (linked) return res.json(serializeAlumno(attachPaymentInfo(linked)));

    if (req.user.email) {
      const { data: matches, error: matchError } = await supabaseAdmin
        .from("alumnos")
        .select("*")
        .is("user_id", null)
        .ilike("correo", req.user.email);

      throwIfError(matchError);

      if (matches?.length === 1) {
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("alumnos")
          .update({ user_id: req.user.id })
          .eq("id", matches[0].id)
          .select(ALUMNO_SELECT)
          .single();

        throwIfError(updateError);
        return res.json(serializeAlumno(attachPaymentInfo(updated)));
      }

      if (matches?.length > 1) {
        throw new HttpError(
          409,
          "Hay varias fichas con tu correo. Pide a un administrador que vincule tu cuenta.",
        );
      }
    }

    if (req.role === "admin") {
      throw new HttpError(404, "El administrador no tiene ficha de alumno");
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("alumnos")
      .insert({
        user_id: req.user.id,
        nombre:
          req.user.user_metadata?.full_name || req.user.email || "Alumno",
        correo: req.user.email ?? null,
        activo: true,
      })
      .select(ALUMNO_SELECT)
      .single();

    throwWriteError(createError, "No se pudo crear la ficha del alumno");

    res
      .status(201)
      .json(serializeAlumno(attachPaymentInfo(await withCobroActual(created))));
  }),
);

/**
 * GET /api/alumnos/:id
 */
router.get(
  "/:id",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      throw new HttpError(400, "El ID del alumno no es válido");
    }

    const alumno = await findAlumnoById(req.params.id);

    if (!alumno) throw new HttpError(404, "Alumno no encontrado");
    if (!canAccessAlumno(req, alumno)) {
      throw new HttpError(403, "No autorizado");
    }

    res.json(serializeAlumno(attachPaymentInfo(alumno)));
  }),
);

/**
 * POST /api/alumnos
 * Admin puede crear cualquier ficha. Un usuario autenticado crea su
 * propia ficha (la vinculación con Auth se hace desde el token).
 */
router.post(
  "/",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const isAdmin = req.role === "admin";
    const payload = normalizeAlumnoPayload(req.body ?? {});

    if (!isAdmin) {
      delete payload.user_id;
      payload.user_id = req.user.id;
      if (!payload.correo) payload.correo = req.user.email;
    }

    if (payload.user_id) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("alumnos")
        .select("*")
        .eq("user_id", payload.user_id)
        .maybeSingle();

      throwIfError(existingError);

      if (existing) {
        throw new HttpError(
          409,
          "Este usuario ya está registrado",
          existing.id,
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("alumnos")
      .insert(payload)
      .select("*")
      .single();

    throwWriteError(error, "No se pudo registrar el alumno");

    res.status(201).json({
      success: true,
      message: "Alumno registrado correctamente",
      alumno: serializeAlumno(attachPaymentInfo(await withCobroActual(data))),
    });
  }),
);

/**
 * PATCH /api/alumnos/:id
 */
router.patch(
  "/:id",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      throw new HttpError(400, "El ID del alumno no es válido");
    }

    const alumno = await findAlumnoById(req.params.id);

    if (!alumno) throw new HttpError(404, "Alumno no encontrado");
    if (!canAccessAlumno(req, alumno)) {
      throw new HttpError(403, "No autorizado");
    }

    const payload = normalizeAlumnoPayload(req.body ?? {}, { partial: true });

    if (req.role !== "admin") {
      // Un alumno puede actualizar sus datos de contacto, no su estado,
      // grupo, cinturón ni la vinculación con otra cuenta.
      delete payload.activo;
      delete payload.grupo;
      delete payload.cinturon;
      delete payload.user_id;
    }

    if (Object.keys(payload).length === 0) {
      throw new HttpError(400, "No hay campos para actualizar");
    }

    const { data, error } = await supabaseAdmin
      .from("alumnos")
      .update(payload)
      .eq("id", alumno.id)
      .select("*")
      .single();

    throwWriteError(error, "No se pudo actualizar el alumno");

    if (payload.activo === true) {
      try {
        await ensureCobroMes(data.id);
      } catch (ensureError) {
        console.error(
          "[cobros] no se pudo crear el cobro del mes al reactivar:",
          ensureError.message,
        );
      }
    }

    const completo = (await findAlumnoById(data.id)) ?? data;

    res.json({
      success: true,
      alumno: serializeAlumno(attachPaymentInfo(completo)),
    });
  }),
);

/**
 * DELETE /api/alumnos/:id
 */
router.delete(
  "/:id",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      throw new HttpError(400, "El ID del alumno no es válido");
    }

    const alumno = await findAlumnoById(req.params.id);
    if (!alumno) throw new HttpError(404, "Alumno no encontrado");

    const { data: pagos, error: pagosError } = await supabaseAdmin
      .from("pagos")
      .select("comprobante_path")
      .eq("alumno_id", alumno.id)
      .not("comprobante_path", "is", null);

    throwIfError(pagosError);

    const comprobantes = (pagos ?? [])
      .map((pago) => pago.comprobante_path)
      .filter(Boolean);

    if (comprobantes.length > 0) {
      await supabaseAdmin.storage.from(storageBucket).remove(comprobantes);
    }

    const { error } = await supabaseAdmin
      .from("alumnos")
      .delete()
      .eq("id", alumno.id);

    throwIfError(error);

    res.json({ success: true, message: "Alumno eliminado" });
  }),
);

export default router;
