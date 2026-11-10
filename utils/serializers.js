/**
 * Normaliza filas de Supabase a la forma que ya consume el frontend.
 * Se mantienen alias _id / supabaseId / fechaRegistro por compatibilidad.
 */
export const serializeAlumno = (row) => {
  if (!row) return null;

  return {
    ...row,
    _id: row.id,
    supabaseId: row.user_id,
    fechaRegistro: row.fecha_registro,
  };
};

export const serializePago = (row) => {
  if (!row) return null;

  const alumno = row.alumno;

  return {
    ...row,
    _id: row.id,
    alumnoId: row.alumno_id,
    alumno:
      alumno && !Array.isArray(alumno) && typeof alumno === "object"
        ? alumno.nombre
        : (alumno ?? null),
    comprobante: row.comprobante_path,
    fechaPago: row.fecha_pago,
  };
};
