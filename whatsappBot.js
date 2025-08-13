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
let isRestarting = false;

async function iniciarBot() {
  if (isRestarting) return; // Evita que se inicie más de una vez al mismo tiempo
  isRestarting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: state,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Mostrar QR solo una vez
      if (qr) {
        console.log('📱 Nuevo QR generado:', qr);
        setQR(qr);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.error('❌ Conexión cerrada:', lastDisconnect?.error);

        // Si está cerrada la sesión, borrar credenciales
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('🚫 Sesión cerrada. Eliminando credenciales y reiniciando...');
          await fs.rm('./auth_info_baileys', { recursive: true, force: true });
        }

        // Cerrar el socket actual antes de reiniciar
        try {
          sock.ws.close();
        } catch (err) {
          console.error('⚠️ Error cerrando socket:', err.message);
        }

        // Reiniciar después de 5s
        isRestarting = false;
        setTimeout(iniciarBot, 5000);
      } else if (connection === 'open') {
        console.log('✅ WhatsApp Bot conectado');
        setQR(null); // Limpiar QR

        // Listar grupos donde está el bot
        try {
          const groups = await sock.groupFetchAllParticipating();
          console.log('🔍 Grupos encontrados:');
          for (const [groupId, metadata] of Object.entries(groups)) {
            console.log(`ID del grupo: ${groupId}, Nombre: ${metadata.subject}`);
          }
        } catch (error) {
          console.error('❌ Error al obtener grupos:', error.message);
        }
      }
    });

    // Responder automáticamente a "hola"
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (msg.message?.conversation?.toLowerCase() === 'hola') {
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hola, estoy activo 🤖' });
      }
    });

    isRestarting = false; // Marca que ya está listo
  } catch (err) {
    console.error('❌ Error al iniciar el bot:', err.message);
    isRestarting = false;
    setTimeout(iniciarBot, 5000);
  }
}

async function enviarMensajeGrupo({ groupId, alumno }) {
  if (!sock) throw new Error('Bot no inicializado');

  if (!groupId || !groupId.endsWith('@g.us')) {
    throw new Error('ID de grupo inválido');
  }

  const mensaje = `📚 Han llegado por:\n👦 Nombre: ${alumno.nombreCompleto}\n📘 Grado: ${alumno.grado}°\n👥 Grupo: ${alumno.grupo}`;

  try {
    await sock.sendMessage(groupId, { text: mensaje });
    console.log(`✅ Mensaje enviado al grupo ${groupId}`);
  } catch (err) {
    console.error('❌ Error al enviar mensaje al grupo:', err.message);
    throw err;
  }
}

module.exports = {
  iniciarBot,
  enviarMensajeGrupo,
};
