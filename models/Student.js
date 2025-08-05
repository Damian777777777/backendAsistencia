const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  matricula: { type: String, required: true, unique: true },
  nombreCompleto: { type: String, required: true },
  grado: { type: String, required: true },
  grupo: { type: String, required: true },
});

module.exports = mongoose.model('Student', studentSchema);