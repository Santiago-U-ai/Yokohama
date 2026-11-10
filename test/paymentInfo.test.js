import test from "node:test";
import assert from "node:assert/strict";
import { attachPaymentInfo, currentMonth } from "../utils/paymentInfo.js";

test("currentMonth devuelve el mes local en formato YYYY-MM", () => {
  const now = new Date();
  const esperado = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  assert.equal(currentMonth(), esperado);
});

test("attachPaymentInfo marca el mes actual y detecta deuda anterior", () => {
  const mes = currentMonth();

  const result = attachPaymentInfo({
    id: "alumno-1",
    nombre: "Emiliano",
    pagos: [
      { mes, estado: "pagado", fecha_pago: "2026-11-04", monto: 500 },
      { mes: "2025-01", estado: "pendiente", fecha_pago: null, monto: 500 },
    ],
  });

  assert.equal(result.pagado_mes_actual, true);
  assert.equal(result.al_dia, false);
  assert.equal(result.ultimo_pago, "2026-11-04");
  assert.equal(result.pagos_pendientes, 1);
  assert.equal(result.mes_deuda, "2025-01");
  assert.deepEqual(result.meses_pendientes, ["2025-01"]);
  assert.equal(result.deuda_total, 500);
  assert.equal(result.pagos, undefined);
});

test("attachPaymentInfo queda al día con el mes actual pagado y sin deudas", () => {
  const result = attachPaymentInfo({
    id: "alumno-7",
    pagos: [
      {
        mes: currentMonth(),
        estado: "pagado",
        fecha_pago: "2026-11-04",
        monto: 500,
      },
      {
        mes: "2025-01",
        estado: "pagado",
        fecha_pago: "2025-01-10",
        monto: 500,
      },
    ],
  });

  assert.equal(result.al_dia, true);
  assert.equal(result.pagado_mes_actual, true);
  assert.equal(result.mes_deuda, null);
  assert.equal(result.pagos_pendientes, 0);
  assert.equal(result.deuda_total, 0);
});

test("attachPaymentInfo deja al_dia en false si el mes actual está pendiente", () => {
  const result = attachPaymentInfo({
    id: "alumno-2",
    pagos: [
      { mes: currentMonth(), estado: "pendiente", fecha_pago: null, monto: 500 },
    ],
  });

  assert.equal(result.al_dia, false);
  assert.equal(result.pagado_mes_actual, false);
  assert.equal(result.pagos_pendientes, 1);
  assert.equal(result.mes_deuda, currentMonth());
});

test("attachPaymentInfo informa el mes más antiguo que se debe", () => {
  const result = attachPaymentInfo({
    id: "alumno-5",
    pagos: [
      { mes: "2025-01", estado: "pagado", fecha_pago: "2025-01-10", monto: 500 },
      { mes: "2025-03", estado: "pendiente", fecha_pago: null, monto: 450 },
      { mes: "2025-02", estado: "vencido", fecha_pago: null, monto: 500 },
    ],
  });

  assert.equal(result.al_dia, false);
  assert.equal(result.pagado_mes_actual, false);
  assert.equal(result.mes_deuda, "2025-02");
  assert.deepEqual(result.meses_pendientes, ["2025-02", "2025-03"]);
  assert.equal(result.pagos_pendientes, 2);
  assert.equal(result.deuda_total, 950);
});

test("attachPaymentInfo no cuenta como deuda un mes futuro", () => {
  const futuro = new Date();
  futuro.setMonth(futuro.getMonth() + 2);
  const mesFuturo = `${futuro.getFullYear()}-${String(futuro.getMonth() + 1).padStart(2, "0")}`;

  const result = attachPaymentInfo({
    id: "alumno-6",
    pagos: [
      { mes: mesFuturo, estado: "pendiente", fecha_pago: null, monto: 500 },
    ],
  });

  assert.equal(result.al_dia, false);
  assert.equal(result.pagado_mes_actual, false);
  assert.equal(result.mes_deuda, null);
  assert.deepEqual(result.meses_pendientes, []);
  assert.equal(result.deuda_total, 0);
});

test("attachPaymentInfo ignora pagos no pagados para la fecha", () => {
  const result = attachPaymentInfo({
    id: "alumno-3",
    pagos: [
      {
        mes: currentMonth(),
        estado: "vencido",
        fecha_pago: "2026-11-01",
        monto: 500,
      },
    ],
  });

  assert.equal(result.ultimo_pago, null);
  assert.equal(result.al_dia, false);
});

test("attachPaymentInfo tolera alumnos sin pagos", () => {
  const result = attachPaymentInfo({ id: "alumno-4", nombre: "Nuevo" });

  assert.equal(result.al_dia, false);
  assert.equal(result.pagado_mes_actual, false);
  assert.equal(result.ultimo_pago, null);
  assert.equal(result.pagos_pendientes, 0);
  assert.equal(result.mes_deuda, null);
  assert.deepEqual(result.meses_pendientes, []);
  assert.equal(result.deuda_total, 0);
});
