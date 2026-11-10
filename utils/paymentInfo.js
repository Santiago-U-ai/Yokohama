/**
 * Añade al alumno su estado de mensualidad a partir de la relación
 * `pagos(...)` que devuelve Supabase.
 *
 * - `al_dia`: el mes actual está pagado y no hay meses anteriores debiendo.
 * - `pagado_mes_actual`: el pago del mes actual está en estado "pagado".
 * - `ultimo_pago`: fecha del último pago pagado.
 * - `mes_deuda`: mes más antiguo que se debe (<= mes actual).
 * - `meses_pendientes`: lista ordenada de meses que se deben.
 * - `pagos_pendientes`: cantidad de meses que se deben.
 * - `deuda_total`: suma de los montos de esos meses.
 */
const byPaymentDateDesc = (a, b) =>
  String(b.fecha_pago).localeCompare(String(a.fecha_pago));

const byMonthAsc = (a, b) => a.mes.localeCompare(b.mes);

/**
 * Mes actual en formato YYYY-MM usando la hora local del servidor.
 * (`toISOString` usaría UTC y adelantaría el mes en las últimas horas
 * del día en zonas como America/Bogota).
 */
export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const attachPaymentInfo = (row) => {
  if (!row) return null;

  const { pagos, ...alumno } = row;
  const pagosAlumno = Array.isArray(pagos) ? pagos : [];
  const mesActual = currentMonth();

  const pagados = pagosAlumno
    .filter((pago) => pago.estado === "pagado" && pago.fecha_pago)
    .sort(byPaymentDateDesc);

  const pagoMesActual = pagosAlumno.find(
    (pago) => pago.mes === mesActual,
  );

  // Solo se debe lo que ya venció: un mes futuro registrado como
  // pendiente todavía no es deuda.
  const pendientes = pagosAlumno
    .filter((pago) => pago.estado !== "pagado" && pago.mes <= mesActual)
    .sort(byMonthAsc);

  const mesesPendientes = [...new Set(pendientes.map((pago) => pago.mes))];
  const deudaTotal = pendientes.reduce(
    (sum, pago) => sum + Number(pago.monto ?? 0),
    0,
  );

  return {
    ...alumno,
    // Al día = el mes actual está pagado y no hay meses anteriores debiendo.
    al_dia: pagoMesActual?.estado === "pagado" && mesesPendientes.length === 0,
    pagado_mes_actual: pagoMesActual?.estado === "pagado",
    ultimo_pago: pagados[0]?.fecha_pago ?? null,
    mes_deuda: mesesPendientes[0] ?? null,
    meses_pendientes: mesesPendientes,
    pagos_pendientes: mesesPendientes.length,
    deuda_total: deudaTotal,
  };
};
