const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
  qrCode: { type: String, required: true, unique: true },
  hijoMatricula: { type: String, required: true },
  telefono: { type: String, required: true },
});

module.exports = mongoose.model('Parent', parentSchema);