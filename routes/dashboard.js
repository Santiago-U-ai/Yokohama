import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import {
  authMiddleware,
  requireAdmin,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { serializeAlumno, serializePago } from "../utils/serializers.js";
import { throwIfError } from "../utils/supabaseError.js";

const router = express.Router();

const currentMonth = () => new Date().toISOString().slice(0, 7);

const sumMontos = (rows) =>
  (rows ?? []).reduce((total, row) => total + Number(row.monto || 0), 0);

/**
 * GET /api/dashboard
 * Resumen para administradores.
 */
router.get(
  "/",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const mes = currentMonth();

    const [
      totalAlumnos,
      alumnosActivos,
      pagosPendientes,
      pagosDelMes,
      pagosVencidos,
      alumnosRecientes,
      pagosRecientes,
      grupos,
    ] = await Promise.all([
      supabaseAdmin
        .from("alumnos")
        .select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("alumnos")
        .select("*", { count: "exact", head: true })
        .eq("activo", true),
      supabaseAdmin
        .from("pagos")
        .select("*", { count: "exact", head: true })
        .eq("estado", "pendiente"),
      supabaseAdmin
        .from("pagos")
        .select("monto")
        .eq("estado", "pagado")
        .eq("mes", mes),
      supabaseAdmin
        .from("pagos")
        .select("*", { count: "exact", head: true })
        .neq("estado", "pagado")
        .lt("mes", mes),
      supabaseAdmin
        .from("alumnos")
        .select("*")
        .order("fecha_registro", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("pagos")
        .select("*, alumno:alumnos(id, nombre, correo)")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin.from("alumnos").select("sede, grupo"),
    ]);

    for (const result of [
      totalAlumnos,
      alumnosActivos,
      pagosPendientes,
      pagosDelMes,
      pagosVencidos,
      alumnosRecientes,
      pagosRecientes,
      grupos,
    ]) {
      throwIfError(result.error);
    }

    const porGrupo = { BABY: 0, JUVENIL: 0, SENIOR: 0, sinGrupo: 0 };
    const porSede = { NORTE: 0, SUR: 0 };

    for (const alumno of grupos.data ?? []) {
      if (alumno.grupo && porGrupo[alumno.grupo] !== undefined) {
        porGrupo[alumno.grupo] += 1;
      } else {
        porGrupo.sinGrupo += 1;
      }

      if (alumno.sede && porSede[alumno.sede] !== undefined) {
        porSede[alumno.sede] += 1;
      }
    }

    res.json({
      stats: {
        alumnos: totalAlumnos.count ?? 0,
        activos: alumnosActivos.count ?? 0,
        ingresos: sumMontos(pagosDelMes.data),
        pendientes: pagosPendientes.count ?? 0,
        vencimientos: pagosVencidos.count ?? 0,
        porGrupo,
        porSede,
        mes,
      },
      alumnos: (alumnosRecientes.data ?? []).map(serializeAlumno),
      pagosRecientes: (pagosRecientes.data ?? []).map(serializePago),
    });
  }),
);

/**
 * GET /api/dashboard/me
 * Resumen del alumno autenticado.
 */
router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { data: alumno, error: alumnoError } = await supabaseAdmin
      .from("alumnos")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();

    throwIfError(alumnoError);

    if (!alumno) {
      return res.json({
        alumno: null,
        pagos: [],
        stats: { pendientes: 0, montoPendiente: 0, meses: [] },
      });
    }

    const { data: pagos, error: pagosError } = await supabaseAdmin
      .from("pagos")
      .select("*, alumno:alumnos(id, nombre, correo)")
      .eq("alumno_id", alumno.id)
      .order("mes", { ascending: true });

    throwIfError(pagosError);

    const pendientes = (pagos ?? []).filter((pago) => pago.estado !== "pagado");

    res.json({
      alumno: serializeAlumno(alumno),
      pagos: (pagos ?? []).map(serializePago),
      stats: {
        pendientes: pendientes.length,
        montoPendiente: sumMontos(pendientes),
        meses: pendientes.map((pago) => pago.mes),
      },
    });
  }),
);

export default router;
