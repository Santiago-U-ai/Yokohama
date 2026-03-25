import mongoose from "mongoose";

const AlumnoSchema = new mongoose.Schema({
  nombre: String,
  correo: String,
  telefono: String,
  edad: Number,
  direccion: String,
  supabaseId: {
    type: String,
    default: null,
  },

  fechaRegistro: {
    type: Date,
    default: Date.now,
  },
});

// Crear índice único solo para supabaseId cuando no es null
AlumnoSchema.index({ supabaseId: 1 }, { unique: true, sparse: true });

export default mongoose.model("Alumno", AlumnoSchema);
