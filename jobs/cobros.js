import cron from "node-cron";
import { currentMonth } from "../utils/paymentInfo.js";
import { generarCobrosDelMes } from "../utils/cobros.js";

const CRON_EXPRESSION = process.env.COBROS_CRON || "10 0 * * *";
const TIMEZONE = process.env.COBROS_TZ || "America/Bogota";

const ejecutar = async (origen) => {
  const mes = currentMonth();

  try {
    const { alumnos, creados } = await generarCobrosDelMes(mes);
    console.log(
      `[cobros] ${origen}: ${creados} cobro(s) nuevo(s) de ${alumnos} alumno(s) activo(s) para ${mes}`,
    );
  } catch (error) {
    console.error(`[cobros] ${origen}: no se pudieron generar los cobros:`, error.message);
  }
};

/**
 * Arranca el job de cobros: ejecuta al iniciar el servidor (recupera el
 * mes actual si estuvo apagado) y luego todos los días a medianoche.
 */
export const startCobrosJob = () => {
  ejecutar("inicio");

  const task = cron.schedule(
    CRON_EXPRESSION,
    () => ejecutar("programado"),
    { timezone: TIMEZONE },
  );

  console.log(`Job de cobros activo (${CRON_EXPRESSION}, ${TIMEZONE})`);
  return task;
};
