const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

const Attendance = require('../models/Attendance');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const User = require('../models/User');

const { enviarMensajeGrupo } = require('../whatsappBot');
const { getQR } = require('../qrHandler');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_segura';

/* -----------------------------------------------------------
   📌 AUTENTICACIÓN
----------------------------------------------------------- */

// Registro de usuario
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ msg: 'Campos incompletos o email inválido' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: 'Usuario ya existe' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ msg: 'Usuario registrado' });
  } catch (error) {
    console.error('❌ Error en /register:', error.message);
    res.status(500).json({ msg: 'Error del servidor', error: error.message });
  }
});

// Login de usuario
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ msg: 'Campos incompletos o email inválido' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Usuario o contraseña incorrectos' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Usuario o contraseña incorrectos' });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error('❌ Error en /login:', error.message);
    res.status(500).json({ msg: 'Error del servidor', error: error.message });
  }
});

/* -----------------------------------------------------------
   🧾 REGISTRO DE ESTUDIANTE Y PADRE
----------------------------------------------------------- */

router.post('/insert', async (req, res) => {
  try {
    const { student, parent } = req.body;
    if (!student || !parent ||
        !student.nombreCompleto || !student.matricula || !student.grado || !student.grupo || !student.nivel ||
        !parent.nombre || !parent.domicilio || !parent.qrCode) {
      return res.status(400).json({ msg: 'Faltan datos requeridos' });
    }

    if (parent.telefono && !/^\d{10}$/.test(parent.telefono)) {
      return res.status(400).json({ msg: 'Teléfono inválido, debe tener 10 dígitos' });
    }

    const existingStudent = await Student.findOne({ matricula: student.matricula });
    if (existingStudent) return res.status(400).json({ msg: 'Matrícula ya registrada' });

    const existingParent = await Parent.findOne({ qrCode: parent.qrCode });
    if (existingParent) return res.status(400).json({ msg: 'Código QR ya registrado' });

    const newStudent = new Student({
      nombreCompleto: student.nombreCompleto,
      matricula: student.matricula,
      grado: student.grado,
      grupo: student.grupo,
      nivel: student.nivel,
      calificaciones: student.calificaciones || [],
      qrCode: student.qrCode || null,
    });
    await newStudent.save();

    const newParent = new Parent({
      nombre: parent.nombre,
      domicilio: parent.domicilio,
      telefono: parent.telefono || null,
      hijoMatricula: student.matricula,
      qrCode: parent.qrCode,
    });
    await newParent.save();

    res.json({ msg: 'Insertado correctamente', student: newStudent, parent: newParent });
  } catch (error) {
    console.error('❌ Error insertando:', error.message);
    if (error.code === 11000) return res.status(400).json({ msg: 'Código QR o matrícula duplicados' });
    res.status(500).json({ msg: 'Error en el servidor', error: error.message });
  }
});

/* -----------------------------------------------------------
   📆 ASISTENCIAS
----------------------------------------------------------- */

// Registrar asistencia (por matrícula)
router.post('/asistencia', async (req, res) => {
  try {
    const { matricula } = req.body;
    if (!matricula || typeof matricula !== 'string' || matricula.trim().length < 3) {
      return res.status(400).json({ msg: 'Matrícula inválida o ausente' });
    }

    const student = await Student.findOne({ matricula: matricula.trim() });
    if (!student) return res.status(404).json({ msg: 'Estudiante no encontrado' });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const existingAttendance = await Attendance.findOne({
      matricula: matricula.trim(),
      fecha: { $gte: today },
    });

    if (existingAttendance) return res.status(400).json({ msg: 'Ya se registró asistencia hoy' });

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const tipoAsistencia =
      currentMinutes >= 360 && currentMinutes <= 450 ? 'asistencia' :
      currentMinutes > 450 && currentMinutes <= 460 ? 'retardo' :
      currentMinutes >= 480 || currentMinutes < 360 ? 'prueba' :
      null;

    if (!tipoAsistencia) return res.status(400).json({ msg: 'Horario de asistencia cerrado' });

    const newAttendance = new Attendance({
      matricula: matricula.trim(),
      nombre: student.nombreCompleto,
      grado: student.grado,
      grupo: student.grupo,
      fecha: now,
      status: 'A',
      tipo: tipoAsistencia,
    });

    await newAttendance.save();

    res.status(201).json({
      msg: `Registrado como ${tipoAsistencia}`,
      asistencia: newAttendance,
    });
  } catch (error) {
    console.error('❌ Error en /asistencia:', error.message);
    res.status(500).json({ msg: 'Error al registrar asistencia', error: error.message });
  }
});

// Obtener todas las asistencias
router.get('/asistencias', async (req, res) => {
  try {
    const data = await Attendance.find().sort({ fecha: -1 });
    res.json(data);
  } catch (error) {
    console.error('❌ Error en /asistencias:', error.message);
    res.status(500).json({ msg: 'Error al obtener asistencias', error: error.message });
  }
});
// Crear asistencia manual
router.post('/asistencias', async (req, res) => {
  try {
    console.log("📥 Datos recibidos:", req.body);
    
    const { nombre, grado, grupo, fecha, status } = req.body;
    
    if (!nombre || !grado || !grupo || !fecha || !['A', 'F', 'J'].includes(status)) {
      console.log("❌ Validación fallida");
      return res.status(400).json({ msg: 'Faltan datos o estado inválido' });
    }
    
    const nuevaAsistencia = new Attendance({ 
      nombre, 
      grado, 
      grupo, 
      fecha, 
      status,
      tipo: 'asistencia', // CAMBIO: usar un valor válido del enum
      matricula: req.body.matricula || 'N/A' // CAMBIO: valor por defecto válido
    });
    
    console.log("💾 Intentando guardar:", nuevaAsistencia);
    await nuevaAsistencia.save();
    console.log("✅ Guardado exitoso");
    
    res.status(201).json(nuevaAsistencia);
  } catch (error) {
    console.error('❌ Error en /asistencias POST:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ msg: 'Error al crear asistencia', error: error.message });
  }
});
// Actualizar asistencia
router.put('/asistencias/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['A', 'F', 'J'].includes(status)) {
      return res.status(400).json({ msg: 'Estado inválido' });
    }
    const asistencia = await Attendance.findById(req.params.id);
    if (!asistencia) return res.status(404).json({ msg: 'Asistencia no encontrada' });
    
    asistencia.status = status;
    await asistencia.save();
    
    // CAMBIO: Devolver directamente el objeto de asistencia actualizado
    res.json(asistencia);
  } catch (error) {
    console.error('❌ Error en PUT /asistencias/:id:', error.message);
    res.status(500).json({ msg: 'Error al actualizar asistencia', error: error.message });
  }
});


/* -----------------------------------------------------------
   📱 WHATSAPP Y QR
----------------------------------------------------------- */

// Obtener el QR del bot de WhatsApp
router.get('/get-qr', async (req, res) => {
  try {
    const qr = getQR();
    if (!qr) return res.status(404).json({ msg: 'No hay QR disponible. Bot ya conectado.' });
    const qrImage = await QRCode.toDataURL(qr);
    res.json({ qrImage });
  } catch (err) {
    console.error('❌ Error generando QR:', err.message);
    res.status(500).json({ msg: 'Error generando QR', error: err.message });
  }
});


// Buscar padre por QR y enviar mensaje a grupo
router.get('/buscar-qr-padre/:qrCode', async (req, res) => {
  console.log("📩 Llamada recibida en /scan-qr");

  try {
    const qrCode = req.params.qrCode;
    if (!qrCode || qrCode.length < 3) return res.status(400).json({ msg: 'Código QR inválido' });

    const parent = await Parent.findOne({ qrCode });
    if (!parent) return res.status(404).json({ msg: 'Padre no encontrado' });

    const student = await Student.findOne({ matricula: parent.hijoMatricula });
    if (!student) return res.status(404).json({ msg: 'Estudiante no encontrado' });

    const groupId = '120363416896007690@g.us'; // ID del grupo de WhatsApp
    await enviarMensajeGrupo({ groupId, alumno: student });

    res.json({
      msg: 'Mensaje enviado al grupo',
      estudiante: student,
    });
  } catch (err) {
    console.error('❌ Error en /buscar-qr-padre:', err.message);
    res.status(500).json({ msg: 'Error interno', error: err.message });
  }
});
router.post('/scan-qr', async (req, res) => {
  try {
    const { qrCode } = req.body;
    if (!qrCode || typeof qrCode !== 'string' || qrCode.trim().length < 3) {
      return res.status(400).json({ msg: 'Código QR inválido o ausente' });
    }
    const code = qrCode.trim();

    // Intentar encontrar alumno por matrícula (asistencia)
    const student = await Student.findOne({ matricula: code });
    if (student) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const tipoAsistencia =
        currentMinutes >= 360 && currentMinutes <= 450 ? 'asistencia' :
        currentMinutes > 450 && currentMinutes <= 460 ? 'retardo' :
        currentMinutes >= 480 || currentMinutes < 360 ? 'prueba' :
        null;

      if (!tipoAsistencia) return res.status(400).json({ msg: 'Horario de asistencia cerrado' });

      // Buscar asistencia existente para hoy
      let existingAttendance = await Attendance.findOne({
        matricula: code,
        fecha: { $gte: today },
      });

      if (existingAttendance) {
        existingAttendance.tipo = tipoAsistencia;
        existingAttendance.fecha = now;
        await existingAttendance.save();

        return res.status(200).json({
          msg: `Asistencia actualizada como ${tipoAsistencia}`,
          estudiante: student,
          asistencia: existingAttendance,
        });
      }

      // Si no existe, crear nueva asistencia
      const newAttendance = new Attendance({
        matricula: code,
        nombre: student.nombreCompleto,
        grado: student.grado,
        grupo: student.grupo,
        fecha: now,
        status: 'A',
        tipo: tipoAsistencia,
      });
console.log("➡️ Guardando asistencia:", newAttendance);
      await newAttendance.save();

      return res.status(201).json({
        msg: `Asistencia registrada como ${tipoAsistencia}`,
        estudiante: student,
        asistencia: newAttendance,
      });
    }

    // Si no es alumno, intentar buscar padre por QR para enviar mensaje
    const parent = await Parent.findOne({ qrCode: code });
    if (parent) {
      const student = await Student.findOne({ matricula: parent.hijoMatricula });
      if (!student) return res.status(404).json({ msg: 'Estudiante no encontrado para este padre' });

      const groupId = '120363416896007690@g.us'; // ID grupo WhatsApp
      await enviarMensajeGrupo({ groupId, alumno: student });

      return res.json({
        msg: 'Mensaje enviado al grupo',
        estudiante: student,
      });
    }

    // No se encontró ni alumno ni padre
    return res.status(404).json({ msg: 'Código QR no asociado a alumno ni padre' });
  } catch (err) {
    console.error('❌ Error en /scan-qr:', err.message);
    res.status(500).json({ msg: 'Error interno', error: err.message });
  }
});



module.exports = router;
