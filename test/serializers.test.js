import test from "node:test";
import assert from "node:assert/strict";
import { serializeAlumno, serializePago } from "../utils/serializers.js";

test("serializeAlumno agrega alias compatibles con el frontend", () => {
  const row = {
    id: "uuid-1",
    user_id: "uuid-user",
    nombre: "Emiliano",
    fecha_registro: "2026-01-01T00:00:00Z",
  };

  assert.deepEqual(serializeAlumno(row), {
    ...row,
    _id: "uuid-1",
    supabaseId: "uuid-user",
    fechaRegistro: "2026-01-01T00:00:00Z",
  });
  assert.equal(serializeAlumno(null), null);
});

test("serializePago aplana el nombre del alumno y sus alias", () => {
  const row = {
    id: "pago-1",
    alumno_id: "alumno-1",
    mes: "2026-11",
    monto: 500,
    comprobante_path: "alumno-1/pago-1.jpg",
    fecha_pago: "2026-11-01",
    alumno: { id: "alumno-1", nombre: "Emiliano" },
  };

  const serialized = serializePago(row);

  assert.equal(serialized._id, "pago-1");
  assert.equal(serialized.alumno, "Emiliano");
  assert.equal(serialized.alumnoId, "alumno-1");
  assert.equal(serialized.comprobante, "alumno-1/pago-1.jpg");
  assert.equal(serialized.fechaPago, "2026-11-01");
  assert.equal(serializePago(null), null);
});

test("serializePago tolera pagos sin relación cargada", () => {
  const serialized = serializePago({
    id: "pago-2",
    alumno_id: "alumno-2",
    alumno: null,
  });

  assert.equal(serialized.alumno, null);
});
