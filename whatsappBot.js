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

async function iniciarBot() {
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

      if (qr) {
        console.log('📱 Nuevo QR generado:', qr);
        setQR(qr);
      }

      if (connection === 'close') {
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
        console.log('✅ WhatsApp Bot conectado');
        setQR(null);

        // Obtener y listar todos los grupos en los que el bot participa
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

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (msg.message?.conversation?.toLowerCase() === 'hola') {
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hola, estoy activo 🤖' });
      }
    });
  } catch (err) {
    console.error('❌ Error al iniciar el bot:', err.message);
    setTimeout(iniciarBot, 5000);
  }
}

async function enviarMensajeGrupo({ groupId, alumno }) {
  if (!sock) throw new Error('Bot no inicializado');

  // Validar que el groupId sea un ID de grupo válido (termina en @g.us)
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