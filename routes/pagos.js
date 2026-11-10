import express from "express";
import { supabaseAdmin, storageBucket } from "../config/supabase.js";
import {
  authMiddleware,
  requireAdmin,
} from "../middleware/authMiddleware.js";
import { comprobanteUpload } from "../middleware/upload.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { serializePago } from "../utils/serializers.js";
import { throwIfError, throwWriteError } from "../utils/supabaseError.js";
import {
  assertOneOf,
  cleanText,
  isMonth,
  isUuid,
  parseInteger,
  parseNumber,
} from "../utils/validation.js";

const router = express.Router();

const ESTADOS = ["pendiente", "pagado", "vencido"];
const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const isIsoDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

const today = () => new Date().toISOString().slice(0, 10);

const normalizePagoPayload = (body, { partial = false } = {}) => {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const payload = {};

  if (!partial || has("alumno_id")) {
    const alumnoId = cleanText(body.alumno_id, "alumno_id", {
      required: true,
      max: 36,
    });

    if (!isUuid(alumnoId)) {
      throw new HttpError(400, "El campo \"alumno_id\" no es un UUID válido");
    }

    payload.alumno_id = alumnoId;
  }

  if (!partial || has("mes")) {
    const mes = cleanText(body.mes, "mes", { required: true, max: 7 });

    if (!isMonth(mes)) {
      throw new HttpError(400, "El campo \"mes\" debe tener formato YYYY-MM");
    }

    payload.mes = mes;
  }

  if (has("monto")) {
    const monto = parseNumber(body.monto, "monto", { min: 0, max: 1000000 });
    if (monto !== null) payload.monto = monto;
  }

  if (has("estado")) {
    const estado = assertOneOf(
      String(body.estado).toLowerCase(),
      "estado",
      ESTADOS,
    );
    payload.estado = estado;
  }

  if (has("fecha_pago")) {
    const fechaPago = cleanText(body.fecha_pago, "fecha_pago", { max: 10 });

    if (fechaPago && !isIsoDate(fechaPago)) {
      throw new HttpError(
        400,
        "El campo \"fecha_pago\" debe tener formato YYYY-MM-DD",
      );
    }

    payload.fecha_pago = fechaPago || null;
  }

  return payload;
};

const findAlumnoForUser = async (userId) => {
  const { data, error } = await supabaseAdmin
    .from("alumnos")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  throwIfError(error);
  return data;
};

const findPagoWithAlumno = async (pagoId) => {
  const { data, error } = await supabaseAdmin
    .from("pagos")
    .select("*, alumno:alumnos(id, nombre, correo, user_id)")
    .eq("id", pagoId)
    .maybeSingle();

  throwIfError(error);
  return data;
};

const canAccessPago = (req, pago) =>
  req.role === "admin" || pago.alumno?.user_id === req.user.id;

const signedUrlFor = async (path) => {
  const { data, error } = await supabaseAdmin.storage
    .from(storageBucket)
    .createSignedUrl(path, 3600);

  throwIfError(error, 500, "No se pudo generar el enlace del comprobante");
  return data?.signedUrl ?? null;
};

/**
 * GET /api/pagos
 * Solo admin. Filtros: ?alumno_id=&estado=&mes=&desde=&hasta=&limit=
 */
router.get(
  "/",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from("pagos")
      .select("*, alumno:alumnos(id, nombre, correo, user_id)")
      .order("mes", { ascending: false });

    if (req.query.alumno_id) {
      if (!isUuid(req.query.alumno_id)) {
        throw new HttpError(400, "El campo \"alumno_id\" no es un UUID válido");
      }
      query = query.eq("alumno_id", req.query.alumno_id);
    }

    if (req.query.estado) {
      query = query.eq(
        "estado",
        assertOneOf(String(req.query.estado).toLowerCase(), "estado", ESTADOS),
      );
    }

    if (req.query.mes) {
      if (!isMonth(req.query.mes)) {
        throw new HttpError(400, "El campo \"mes\" debe tener formato YYYY-MM");
      }
      query = query.eq("mes", req.query.mes);
    }

    if (req.query.desde) {
      if (!isMonth(req.query.desde)) {
        throw new HttpError(400, "El campo \"desde\" debe tener formato YYYY-MM");
      }
      query = query.gte("mes", req.query.desde);
    }

    if (req.query.hasta) {
      if (!isMonth(req.query.hasta)) {
        throw new HttpError(400, "El campo \"hasta\" debe tener formato YYYY-MM");
      }
      query = query.lte("mes", req.query.hasta);
    }

    const limit = parseInteger(req.query.limit, "limit", {
      min: 1,
      max: 500,
    });
    query = query.limit(limit ?? 200);

    const { data, error } = await query;
    throwIfError(error);

    res.json((data ?? []).map(serializePago));
  }),
);

/**
 * GET /api/pagos/me
 * Pagos del alumno autenticado.
 */
router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const alumno = await findAlumnoForUser(req.user.id);

    if (!alumno) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from("pagos")
      .select("*, alumno:alumnos(id, nombre, correo, user_id)")
      .eq("alumno_id", alumno.id)
      .order("mes", { ascending: false });

    throwIfError(error);

    res.json((data ?? []).map(serializePago));
  }),
);

/**
 * GET /api/pagos/alumno/:alumnoId
 */
router.get(
  "/alumno/:alumnoId",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.alumnoId)) {
      throw new HttpError(400, "El ID del alumno no es válido");
    }

    const { data: alumno, error: alumnoError } = await supabaseAdmin
      .from("alumnos")
      .select("id, user_id")
      .eq("id", req.params.alumnoId)
      .maybeSingle();

    throwIfError(alumnoError);
    if (!alumno) throw new HttpError(404, "Alumno no encontrado");

    if (req.role !== "admin" && alumno.user_id !== req.user.id) {
      throw new HttpError(403, "No autorizado");
    }

    const { data, error } = await supabaseAdmin
      .from("pagos")
      .select("*, alumno:alumnos(id, nombre, correo, user_id)")
      .eq("alumno_id", alumno.id)
      .order("mes", { ascending: false });

    throwIfError(error);

    res.json((data ?? []).map(serializePago));
  }),
);

const uploadComprobante = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(
      400,
      "Adjunta el archivo en el campo \"comprobante\"",
    );
  }

  const pagoId = req.params.id || req.body?.pago_id || req.query.pago_id;
  let pago;

  if (pagoId) {
    if (!isUuid(pagoId)) {
      throw new HttpError(400, "El ID del pago no es válido");
    }

    pago = await findPagoWithAlumno(pagoId);
  } else {
    const alumno = await findAlumnoForUser(req.user.id);
    if (!alumno) throw new HttpError(404, "Alumno no encontrado");

    const { data, error } = await supabaseAdmin
      .from("pagos")
      .select("*, alumno:alumnos(id, nombre, correo, user_id)")
      .eq("alumno_id", alumno.id)
      .neq("estado", "pagado")
      .order("mes", { ascending: true })
      .limit(1)
      .maybeSingle();

    throwIfError(error);
    pago = data;
  }

  if (!pago) throw new HttpError(404, "Pago no encontrado");
  if (!canAccessPago(req, pago)) {
    throw new HttpError(403, "No autorizado");
  }

  const extension = EXTENSIONS[req.file.mimetype] || "bin";
  const path = `${pago.alumno_id}/${pago.id}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(storageBucket)
    .upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new HttpError(
      500,
      "No se pudo subir el comprobante",
      uploadError.message,
    );
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("pagos")
    .update({ comprobante_path: path })
    .eq("id", pago.id)
    .select("*, alumno:alumnos(id, nombre, correo, user_id)")
    .single();

  if (updateError) {
    await supabaseAdmin.storage.from(storageBucket).remove([path]);
    throwIfError(updateError, 500, "No se pudo guardar el comprobante");
  }

  res.json({
    success: true,
    pago: serializePago(updated),
    comprobanteUrl: await signedUrlFor(path),
    expiresIn: 3600,
  });
});

/**
 * POST /api/pagos/comprobante
 * Compatibilidad con el frontend anterior: si no se envía pago_id,
 * se usa el primer pago pendiente del alumno autenticado.
 */
router.post(
  "/comprobante",
  authMiddleware,
  comprobanteUpload.single("comprobante"),
  uploadComprobante,
);

/**
 * POST /api/pagos/:id/comprobante
 */
router.post(
  "/:id/comprobante",
  authMiddleware,
  comprobanteUpload.single("comprobante"),
  uploadComprobante,
);

/**
 * GET /api/pagos/:id/comprobante
 */
router.get(
  "/:id/comprobante",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      throw new HttpError(400, "El ID del pago no es válido");
    }

    const pago = await findPagoWithAlumno(req.params.id);

    if (!pago) throw new HttpError(404, "Pago no encontrado");
    if (!canAccessPago(req, pago)) {
      throw new HttpError(403, "No autorizado");
    }
    if (!pago.comprobante_path) {
      throw new HttpError(404, "Este pago no tiene comprobante");
    }

    res.json({
      success: true,
      comprobanteUrl: await signedUrlFor(pago.comprobante_path),
      expiresIn: 3600,
    });
  }),
);

/**
 * GET /api/pagos/:id
 */
router.get(
  "/:id",
  authMiddleware,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      throw new HttpError(400, "El ID del pago no es válido");
    }

    const pago = await findPagoWithAlumno(req.params.id);

    if (!pago) throw new HttpError(404, "Pago no encontrado");
    if (!canAccessPago(req, pago)) {
      throw new HttpError(403, "No autorizado");
    }

    res.json(serializePago(pago));
  }),
);

/**
 * POST /api/pagos
 * Solo admin.
 */
router.post(
  "/",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payload = normalizePagoPayload(req.body ?? {});

    if (!payload.estado) payload.estado = "pendiente";
    if (payload.estado === "pagado" && !payload.fecha_pago) {
      payload.fecha_pago = today();
    }

    const { data: alumno, error: alumnoError } = await supabaseAdmin
      .from("alumnos")
      .select("id")
      .eq("id", payload.alumno_id)
      .maybeSingle();

    throwIfError(alumnoError);
    if (!alumno) throw new HttpError(404, "Alumno no encontrado");

    const { data, error } = await supabaseAdmin
      .from("pagos")
      .insert(payload)
      .select("*, alumno:alumnos(id, nombre, correo, user_id)")
      .single();

    throwWriteError(error, "No se pudo registrar el pago");

    res.status(201).json({ success: true, pago: serializePago(data) });
  }),
);

/**
 * PATCH /api/pagos/:id
 * Solo admin.
 */
router.patch(
  "/:id",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      throw new HttpError(400, "El ID del pago no es válido");
    }

    const pago = await findPagoWithAlumno(req.params.id);
    if (!pago) throw new HttpError(404, "Pago no encontrado");

    const payload = normalizePagoPayload(req.body ?? {}, { partial: true });

    if (Object.keys(payload).length === 0) {
      throw new HttpError(400, "No hay campos para actualizar");
    }

    if (payload.alumno_id) {
      const { data: alumno, error: alumnoError } = await supabaseAdmin
        .from("alumnos")
        .select("id")
        .eq("id", payload.alumno_id)
        .maybeSingle();

      throwIfError(alumnoError);
      if (!alumno) throw new HttpError(404, "Alumno no encontrado");
    }

    if (payload.estado === "pagado" && !payload.fecha_pago) {
      payload.fecha_pago = today();
    }

    const { data, error } = await supabaseAdmin
      .from("pagos")
      .update(payload)
      .eq("id", pago.id)
      .select("*, alumno:alumnos(id, nombre, correo, user_id)")
      .single();

    throwWriteError(error, "No se pudo actualizar el pago");

    res.json({ success: true, pago: serializePago(data) });
  }),
);

/**
 * DELETE /api/pagos/:id
 * Solo admin.
 */
router.delete(
  "/:id",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!isUuid(req.params.id)) {
      throw new HttpError(400, "El ID del pago no es válido");
    }

    const pago = await findPagoWithAlumno(req.params.id);
    if (!pago) throw new HttpError(404, "Pago no encontrado");

    if (pago.comprobante_path) {
      await supabaseAdmin.storage
        .from(storageBucket)
        .remove([pago.comprobante_path]);
    }

    const { error } = await supabaseAdmin
      .from("pagos")
      .delete()
      .eq("id", pago.id);

    throwIfError(error);

    res.json({ success: true, message: "Pago eliminado" });
  }),
);

export default router;
