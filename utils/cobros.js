import { supabaseAdmin } from "../config/supabase.js";
import { currentMonth } from "./paymentInfo.js";
import { throwIfError } from "./supabaseError.js";

/**
 * Cobros mensuales automáticos.
 *
 * Cada mes se crea un pago en estado "pendiente" para cada alumno activo.
 * Si el pago del mes ya existe (pagado o pendiente) no se toca, de modo que
 * el job es idempotente y puede correr varias veces sin duplicar registros.
 */

export const montoMensualidad = () => {
  const monto = Number(process.env.MONTO_MENSUALIDAD ?? 500);
  return Number.isFinite(monto) && monto >= 0 ? monto : 500;
};

const cobroDe = (alumnoId, mes) => ({
  alumno_id: alumnoId,
  mes,
  monto: montoMensualidad(),
  estado: "pendiente",
});

/**
 * Garantiza el cobro de un mes para un alumno.
 * Devuelve 1 si lo creó y 0 si ya existía.
 */
export const ensureCobroMes = async (alumnoId, mes = currentMonth()) => {
  const { data, error } = await supabaseAdmin
    .from("pagos")
    .upsert(cobroDe(alumnoId, mes), {
      onConflict: "alumno_id,mes",
      ignoreDuplicates: true,
    })
    .select("id");

  throwIfError(error);
  return (data ?? []).length;
};

/**
 * Genera el cobro de un mes para todos los alumnos activos.
 * Devuelve cuántos alumnos se revisaron y cuántos cobros se crearon.
 */
export const generarCobrosDelMes = async (mes = currentMonth()) => {
  const { data: alumnos, error } = await supabaseAdmin
    .from("alumnos")
    .select("id")
    .eq("activo", true);

  throwIfError(error);

  if (!alumnos?.length) {
    return { alumnos: 0, creados: 0 };
  }

  const { data, error: cobrosError } = await supabaseAdmin
    .from("pagos")
    .upsert(
      alumnos.map((alumno) => cobroDe(alumno.id, mes)),
      { onConflict: "alumno_id,mes", ignoreDuplicates: true },
    )
    .select("id");

  throwIfError(cobrosError);

  return { alumnos: alumnos.length, creados: (data ?? []).length };
};
