import cron from "node-cron";
import { supabaseAdmin } from "../config/supabase.js";
import { enviarRecordatorio } from "../services/emailService.js";

const CRON_EXPRESSION = process.env.REMINDERS_CRON || "0 9 * * *";

/**
 * Envía un correo por alumno con todos sus meses pendientes.
 */
export const sendPendingReminders = async () => {
  const { data, error } = await supabaseAdmin
    .from("pagos")
    .select("mes, monto, estado, alumno:alumnos(nombre, correo)")
    .neq("estado", "pagado")
    .order("mes", { ascending: true });

  if (error) throw error;

  const porCorreo = new Map();

  for (const pago of data ?? []) {
    const correo = pago.alumno?.correo;
    if (!correo) continue;

    const entry = porCorreo.get(correo) ?? {
      nombre: pago.alumno?.nombre || "Alumno",
      correo,
      meses: [],
    };

    entry.meses.push(pago.mes);
    porCorreo.set(correo, entry);
  }

  for (const entry of porCorreo.values()) {
    await enviarRecordatorio(
      entry.correo,
      entry.nombre,
      entry.meses.join(", "),
    );
  }

  return porCorreo.size;
};

export const startRemindersJob = () => {
  const task = cron.schedule(CRON_EXPRESSION, async () => {
    try {
      const enviados = await sendPendingReminders();
      console.log(`Recordatorios enviados a ${enviados} alumno(s)`);
    } catch (error) {
      console.error("Error enviando recordatorios:", error.message);
    }
  });

  console.log(`Job de recordatorios activo (${CRON_EXPRESSION})`);
  return task;
};
