require('dotenv').config({ path: require('path').resolve(__dirname, '.env') }); // Carga .env desde la raíz del proyecto
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const { iniciarBot } = require('./whatsappBot');

const app = express();

app.use(cors());
app.use(express.json());

// Variable para rastrear el estado de MongoDB
let isMongoConnected = false;

// Conexión a MongoDB Atlas con reintentos
const connectToMongoDB = async () => {
  let retries = 5;
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    console.error('❌ MONGO_URI no está definido en el archivo .env');
    process.exit(1);
  }

  console.log('🔍 Intentando conectar a:', mongoURI.replace(/:([^@]+)@/, ':****@')); // Oculta la contraseña en logs

  while (retries > 0) {
    try {
      await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
      });
      console.log('✅ MongoDB Atlas conectado');
      isMongoConnected = true;
      return;
    } catch (err) {
      console.error(`❌ Error conectando a MongoDB Atlas (intentos restantes: ${retries}):`, err.message);
      retries -= 1;
      if (retries === 0) {
        console.error('⚠️ No se pudo conectar a MongoDB Atlas tras varios intentos');
        isMongoConnected = false;
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

// Inicia la conexión a MongoDB
connectToMongoDB();

// Middleware para verificar conexión a MongoDB
app.use('/api/auth', (req, res, next) => {
  if (!isMongoConnected) {
    return res.status(503).json({ msg: 'Base de datos no disponible. Intenta de nuevo más tarde.' });
  }
  next();
}, authRoutes);

// Inicia el bot de WhatsApp
iniciarBot();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));

// Maneja errores no capturados
process.on('uncaughtException', (err) => {
  console.error('❌ Error no capturado:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Promesa rechazada no manejada:', err);
});