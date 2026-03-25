import mongoose from "mongoose";

const PagoSchema = new mongoose.Schema({
  alumno: String,

  mes: String,

  monto: {
    type: Number,
    default: 500, // Monto por defecto
  },

  estado: {
    type: String,
    default: "pendiente",
  },

  comprobante: String,
});

export default mongoose.model("Pago", PagoSchema);
