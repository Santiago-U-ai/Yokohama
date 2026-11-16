/**
 * Agrupa registros de asistencia en clases (fecha + hora + sede + grupo)
 * con sus totales. Se usa en `GET /api/asistencias/clases`.
 */
export const groupClases = (rows, { grupo, sede, limit = 30 } = {}) => {
  const clases = new Map();

  for (const row of rows ?? []) {
    const alumno = Array.isArray(row.alumno) ? row.alumno[0] : row.alumno;
    if (!alumno) continue;

    // El grupo y la sede del registro mandan; si faltan (filas antiguas)
    // se usa lo que tenga el alumno hoy.
    const grupoAlumno = row.grupo ?? alumno.grupo ?? "SIN GRUPO";
    const sedeAlumno = row.sede ?? alumno.sede ?? null;

    if (grupo && grupoAlumno !== grupo) continue;
    if (sede && sedeAlumno !== sede) continue;

    const hora = String(row.hora ?? "").slice(0, 5);
    const clave = `${row.fecha}|${hora}|${sedeAlumno}|${grupoAlumno}`;

    const actual = clases.get(clave) ?? {
      fecha: row.fecha,
      hora,
      sede: sedeAlumno,
      grupo: grupoAlumno,
      total: 0,
      presentes: 0,
    };

    actual.total += 1;
    if (row.presente) actual.presentes += 1;

    clases.set(clave, actual);
  }

  return [...clases.values()]
    .map((clase) => ({ ...clase, ausentes: clase.total - clase.presentes }))
    .sort(
      (a, b) =>
        b.fecha.localeCompare(a.fecha) ||
        // Dentro del mismo día, las clases van en orden del reloj.
        a.hora.localeCompare(b.hora) ||
        a.grupo.localeCompare(b.grupo, "es"),
    )
    .slice(0, limit);
};
