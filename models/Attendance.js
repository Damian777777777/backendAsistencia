const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema({
  matricula: { type: String, required: true }, // 🔧 AÑADIR ESTA LÍNEA
  nombre: { type: String, required: true },
  grado: { type: String, required: true },
  grupo: { type: String, required: true },
  fecha: { type: Date, required: true },
  status: { type: String, enum: ["A", "I", "J"], required: true },
  tipo: { type: String, enum: ["asistencia", "retardo", "prueba"], required: true }, // 🔧 AÑADIR ESTA LÍNEA
});

module.exports = mongoose.model("Attendance", AttendanceSchema);
