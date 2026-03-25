import express from "express"
import Alumno from "../models/Alumno.js"
import Pago from "../models/Pago.js"

const router = express.Router()

router.get("/dashboard", async(req,res)=>{

const totalAlumnos = await Alumno.countDocuments()

const pagosMes = await Pago.aggregate([
{
$group:{
_id:null,
total:{$sum:"$monto"}
}
}
])

const pendientes = await Alumno.countDocuments({estado:"pendiente"})

const alumnos = await Alumno.find().limit(5)

res.json({

stats:{
alumnos:totalAlumnos,
ingresos:pagosMes[0]?.total || 0,
pendientes,
vencimientos:3
},

alumnos

})

})

export default router