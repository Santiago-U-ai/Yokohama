import test from "node:test";
import assert from "node:assert/strict";
import { groupClases } from "../utils/asistencias.js";

const row = (fecha, hora, grupo, sede, presente) => ({
  fecha,
  hora,
  presente,
  grupo,
  sede,
  alumno: { grupo, sede },
});

test("groupClases agrupa por fecha, hora, sede y grupo", () => {
  const clases = groupClases([
    row("2026-11-15", "18:30:00", "BABY", "NORTE", true),
    row("2026-11-15", "18:30:00", "BABY", "NORTE", false),
    row("2026-11-15", "19:30:00", "JUVENIL", "NORTE", true),
    row("2026-11-14", "09:00:00", "BABY", "SUR", true),
  ]);

  assert.equal(clases.length, 3);

  assert.deepEqual(clases[0], {
    fecha: "2026-11-15",
    hora: "18:30",
    sede: "NORTE",
    grupo: "BABY",
    total: 2,
    presentes: 1,
    ausentes: 1,
  });

  assert.equal(clases[1].hora, "19:30");
  assert.equal(clases[2].fecha, "2026-11-14");
  assert.equal(clases[2].sede, "SUR");
});

test("groupClases filtra por grupo y sede", () => {
  const rows = [
    row("2026-11-15", "18:30", "BABY", "NORTE", true),
    row("2026-11-15", "18:30", "JUVENIL", "NORTE", true),
    row("2026-11-15", "18:30", "BABY", "SUR", true),
  ];

  assert.equal(groupClases(rows, { grupo: "BABY" }).length, 2);
  assert.equal(groupClases(rows, { sede: "NORTE" }).length, 2);
  assert.equal(
    groupClases(rows, { grupo: "BABY", sede: "NORTE" }).length,
    1,
  );
});

test("groupClases respeta el límite y ordena de más reciente a más antiguo", () => {
  const rows = [
    row("2026-11-01", "08:00", "BABY", "NORTE", true),
    row("2026-11-10", "08:00", "BABY", "NORTE", true),
    row("2026-11-05", "08:00", "BABY", "NORTE", true),
  ];

  const clases = groupClases(rows, { limit: 2 });

  assert.equal(clases.length, 2);
  assert.equal(clases[0].fecha, "2026-11-10");
  assert.equal(clases[1].fecha, "2026-11-05");
});

test("groupClases prefiere el grupo y la sede del registro", () => {
  const clases = groupClases([
    {
      fecha: "2026-11-15",
      hora: "18:30",
      presente: true,
      grupo: "BABY",
      sede: "NORTE",
      // El alumno ya se cambió a JUVENIL: la clase antigua sigue en BABY.
      alumno: { grupo: "JUVENIL", sede: "SUR" },
    },
  ]);

  assert.equal(clases.length, 1);
  assert.equal(clases[0].grupo, "BABY");
  assert.equal(clases[0].sede, "NORTE");
});

test("groupClases ignora filas sin alumno y alumnos sin grupo", () => {
  const clases = groupClases([
    { fecha: "2026-11-15", hora: "18:30", presente: true, alumno: null },
    row("2026-11-15", "18:30", null, "NORTE", true),
  ]);

  assert.equal(clases.length, 1);
  assert.equal(clases[0].grupo, "SIN GRUPO");
  assert.equal(groupClases(null).length, 0);
});
