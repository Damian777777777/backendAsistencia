require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const { iniciarBot } = require('./whatsappBot');

const app = express();

// Seguridad: cabeceras HTTP seguras
app.use(helmet());

// Limitar peticiones para evitar ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
});
app.use(limiter);

app.use(cors());
app.use(express.json());

// Variable para rastrear el estado de MongoDB
let isMongoConnected = false;

// Conexión a MongoDB Atlas con reintentos
const connectToMongoDB = async () => {
  let retries = 5;
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    console.error('❌ MONGO_URI no está definido en las variables de entorno');
    process.exit(1);
  }

  console.log('🔍 Intentando conectar a:', mongoURI.replace(/:([^@]+)@/, ':****@'));

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

// Manejo global de errores
process.on('uncaughtException', (err) => {
  console.error('❌ Error no capturado:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Promesa rechazada no manejada:', err);
});
