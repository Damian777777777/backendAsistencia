const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs').promises;
const { setQR } = require('./qrHandler');

let sock = null;
let isReady = false; // 🔹 bandera para saber si está conectado

async function iniciarBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    sock = makeWASocket({
      logger: pino({ level: 'debug' }), // 🔹 más detalle en logs
      auth: state,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📱 Nuevo QR generado:', qr);
        setQR(qr);
      }

      if (connection === 'close') {
        isReady = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.error('❌ Conexión cerrada:', lastDisconnect?.error);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('🚫 Sesión cerrada. Eliminando credenciales y reiniciando...');
          await fs.rm('./auth_info_baileys', { recursive: true, force: true });
          setTimeout(iniciarBot, 5000);
        } else {
          console.log('🔁 Reintentando conexión en 5s...');
          setTimeout(iniciarBot, 5000);
        }
      } else if (connection === 'open') {
        isReady = true;
        console.log('✅ WhatsApp Bot conectado');
        setQR(null);

        try {
          const groups = await sock.groupFetchAllParticipating();
          console.log('🔍 Grupos encontrados:');
          for (const [groupId, metadata] of Object.entries(groups)) {
            console.log(`📌 ${metadata.subject} (${groupId})`);
          }
        } catch (error) {
          console.error('❌ Error al obtener grupos:', error);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (msg.message?.conversation?.toLowerCase() === 'hola') {
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hola, estoy activo 🤖' });
      }
    });
  } catch (err) {
    console.error('❌ Error al iniciar el bot:', err);
    setTimeout(iniciarBot, 5000);
  }
}

async function enviarMensajeGrupo({ groupId, alumno }) {
  if (!sock || !isReady) {
    throw new Error('Bot no está conectado a WhatsApp todavía');
  }

  if (!groupId || !groupId.endsWith('@g.us')) {
    throw new Error('ID de grupo inválido');
  }

  const mensaje = `📚 Han llegado por:\n👦 Nombre: ${alumno.nombreCompleto}\n📘 Grado: ${alumno.grado}°\n👥 Grupo: ${alumno.grupo}`;

  try {
    console.log(`📤 Enviando mensaje al grupo ${groupId}...`);
    await sock.sendMessage(groupId, { text: mensaje });
    console.log(`✅ Mensaje enviado al grupo ${groupId}`);
  } catch (err) {
    console.error('❌ Error al enviar mensaje al grupo:', err);
    if (err?.data) console.error('📄 Detalle del error:', err.data);
    throw err;
  }
}

module.exports = {
  iniciarBot,
  enviarMensajeGrupo,
};
