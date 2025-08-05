const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['parent', 'teacher'], default: 'parent' }, 
  // Puedes agregar más campos si quieres
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
