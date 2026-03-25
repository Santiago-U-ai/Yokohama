import cron from "node-cron"
import Alumno from "../models/Alumno.js"
import {enviarRecordatorio} from "../services/emailService.js"

cron.schedule("0 9 * * *", async ()=>{

const alumnos = await Alumno.find()

for(const alumno of alumnos){

await enviarRecordatorio(
alumno.correo,
alumno.nombre,
"este mes"
)

}

console.log("Recordatorios enviados")

})