const {
  makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { startBmmBot } = require('./main');
const pino = require('pino');
const Boom = require('@hapi/boom');
const { emitToBot } = require('../server/socket'); // Adjust path as needed
const { useSQLiteAuthState } = require('../database/sqliteAuthState');
const { deleteSession } = require('../database/sqliteAuthState');

/**
 * Deploys a bot instance for the given user.
 * @param {string} authId - The user's authentication ID.
 * @param {object} options - Any extra options for deployment.
 * @returns {Promise<{ success: boolean, message: string }> }
 */
async function registerAndDeploy({
  authId,
  phoneNumber,
  pairingMethod,
  onQr,
  onPairingCode,
  onStatus,
  restartCount = 0
}) {
  //console.log(`🔄 Starting registration for ${phoneNumber} with method: ${pairingMethod}`);

  // Use SQLite for session persistence
  const { state, saveCreds } = await useSQLiteAuthState(authId, phoneNumber);
  const { version } = await fetchLatestBaileysVersion();

  let registrationDone = false;
  let pairingCodeRequested = false;

  return new Promise((resolve, reject) => {
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({ level: 'fatal' }).child({ level: 'fatal' })
        )
      },
      logger: pino({ level: 'silent' }),
      browser: ['Linux', 'Safari', '18.5'],
      printQRInTerminal: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      //console.log('🔄 Connection update:', update);
      if (registrationDone) return;

      // 🔐 Pairing Code Logic
      if (pairingMethod === 'pairingCode' && !pairingCodeRequested && update.qr) {
        pairingCodeRequested = true;
        try {
          const code = await sock.requestPairingCode(phoneNumber);
          const formattedCode = code.match(/.{1,4}/g).join('-');
          emitToBot(authId, phoneNumber, 'pairingCode', { code: formattedCode });
          //console.log('📱 Pairing code:', formattedCode);
        } catch (err) {
          console.error('❌ Failed to get pairing code:', err.message);
        }
      }

      // 📱 QR Code Logic
      if (pairingMethod === 'qrCode' && update.qr) {
        emitToBot(authId, phoneNumber, 'qr', { qr: update.qr });
        console.log('📱 QR code received for registration:');
      }

      // ✅ Successful connection
      if (update.connection === 'open') {
        registrationDone = true;
        await saveCreds();
        onStatus?.('registered');
        emitToBot(authId, phoneNumber, 'status', { status: 'registered' });

        try { await sock.ws.close(); } catch {}
        await startBmmBot({
          authId,
          phoneNumber,
          pairingMethod,
          onStatus,
          onQr,
          onPairingCode
        });

        return resolve({ success: true, message: 'Registration complete, bot started.' });
      }

      // ❌ Connection closed before registration
     if (update.connection === 'close' && !registrationDone) {
        console.log('❌ Registration connection closed unexpectedly');
        const reason = update.lastDisconnect?.error;
        let code = reason?.output?.statusCode || reason?.statusCode || reason?.code || reason;
        if (Boom.isBoom(reason)) code = reason.output.statusCode;
        const errorMsg = reason?.message || '';

        if (errorMsg.includes('restart required')) {
          emitToBot(authId, phoneNumber, 'registration-status', { status: '💥connecting', error: errorMsg });
          onStatus?.('💥connecting', errorMsg);
          sock.ev.removeAllListeners();
          try { await sock.ws.close(); } catch {}

          if (restartCount < 1) {
            console.log('🔄 Auto-restarting registration...');
            try {
              const result = await registerAndDeploy({
                authId,
                phoneNumber,
                pairingMethod,
                onQr,
                onPairingCode,
                onStatus,
                restartCount: restartCount + 1
              });
              resolve(result);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(Boom.serverUnavailable('Restart required but auto-retry failed.'));
          }
        } else {
          emitToBot(authId, phoneNumber, 'registration-status', { status: 'registration_failed', error: errorMsg });
          onStatus?.('registration_failed', errorMsg);
          sock.ev.removeAllListeners();
          try { await sock.ws.close(); } catch {}
          await deleteSession(authId, phoneNumber);
          reject(Boom.badImplementation(errorMsg || 'Registration failed or closed.'));
        }
      }
    });
  });
}

module.exports = { registerAndDeploy };
