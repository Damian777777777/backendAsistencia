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
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: state,
      defaultQueryTimeoutMs: 60000,
      printQRInTerminal: false, // No imprime QR en consola si no quieres
    });

    // Guardar credenciales cuando se actualicen
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📱 Nuevo QR generado');
        setQR(qr);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

        console.error('❌ Conexión cerrada:', lastDisconnect?.error?.message || lastDisconnect?.error);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('🚫 Sesión cerrada. Eliminando credenciales y reiniciando...');
          await fs.rm('./auth_info_baileys', { recursive: true, force: true });
          setTimeout(iniciarBot, 5000);
        } else if (!isRestarting) {
          isRestarting = true;
          console.log('🔁 Reintentando conexión en 5s...');
          setTimeout(() => {
            isRestarting = false;
            iniciarBot();
          }, 5000);
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp Bot conectado');
        setQR(null);

        try {
          const groups = await sock.groupFetchAllParticipating();
          console.log('🔍 Grupos encontrados:');
          for (const [groupId, metadata] of Object.entries(groups)) {
            console.log(`ID: ${groupId}, Nombre: ${metadata.subject}`);
          }
        } catch (error) {
          console.error('❌ Error al obtener grupos:', error.message);
        }
      }
    });

    // Respuesta automática de prueba
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (msg.message?.conversation?.toLowerCase() === 'hola') {
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hola, estoy activo 🤖' });
      }
    });

    // Mantener viva la conexión cada 60s
    setInterval(() => {
      if (sock?.user) {
        sock.sendPresenceUpdate('available').catch(() => {});
      }
    }, 60000);

  } catch (err) {
    console.error('❌ Error al iniciar el bot:', err.message);
    setTimeout(iniciarBot, 5000);
  }
}

async function enviarMensajeGrupo({ groupId, alumno }) {
  if (!sock?.user) {
    throw new Error('Bot no conectado a WhatsApp');
  }

  if (!groupId || !groupId.endsWith('@g.us')) {
    throw new Error('ID de grupo inválido');
  }

  const mensaje = `📚 Han llegado por:
👦 Nombre: ${alumno.nombreCompleto}
📘 Grado: ${alumno.grado}°
👥 Grupo: ${alumno.grupo}`;

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
