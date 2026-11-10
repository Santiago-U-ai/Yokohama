import nodemailer from "nodemailer";

let transporter;

const getTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error(
      "EMAIL_USER y EMAIL_PASS deben estar configurados para enviar recordatorios",
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  return transporter;
};

export const enviarRecordatorio = async (correo, nombre, mes) => {
  if (!correo) return;

  const from = process.env.EMAIL_FROM || "Club Yokohama";

  await getTransporter().sendMail({
    from,
    to: correo,
    subject: "Recordatorio mensualidad",
    html: `
      <h2>Hola ${nombre}</h2>
      <p>Tu mensualidad de ${mes} está pendiente.</p>
      <p>Club Deportivo Yokohama</p>
    `,
  });
};
