import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({

service:"gmail",

auth:{
user:process.env.EMAIL_USER,
pass:process.env.EMAIL_PASS
}

})

export const enviarRecordatorio = async(correo,nombre,mes)=>{

await transporter.sendMail({

from:"Club Yokohama",

to:correo,

subject:"Recordatorio mensualidad",

html:`

<h2>Hola ${nombre}</h2>

<p>Tu mensualidad de ${mes} está pendiente.</p>

<p>Club Karate Yokohama</p>

`

})

}