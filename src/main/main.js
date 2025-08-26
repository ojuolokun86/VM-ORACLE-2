const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, encodeBase64EncodedStringForUpload, } = require('@whiskeysockets/baileys');
const path = require('path');
const Boom = require('@hapi/boom');
const pino = require('pino');
const { saveSessionToSupabase, loadSessionFromSupabase, deleteSessionFromSupabase } = require('../database/supabaseSession');
const { useSQLiteAuthState } = require('../database/sqliteAuthState');
const  handleMessage  = require('../handler/messageHandler');
const { saveUserToDb, userExists } = require('../database/database');
const { restartBotForUser, sendRestartMessage } = require('./restart');
const sessions = new Map(); // Map<authId:phoneNumber, { bmm, cleanup }>
const { botInstances, botStartTimes } = require('../utils/globalStore')
const deletedSessions = new Set(); // To prevent restart of deleted bots
const { makeInMemoryStore } = require('@rodrigogs/baileys-store')
const store = makeInMemoryStore({});
const { recordBotActivity } = require('../database/database');
const { addSession, removeSession } = require('../utils/sessionManager');
const NodeCache = require('node-cache');
async function startBmmBot({ authId, phoneNumber, country, pairingMethod, onStatus, onQr, onPairingCode, isInitialStart = false }) {
    recordBotActivity({ user: authId, bot: phoneNumber, action: 'starting' });
    console.log(`Starting Bmm for user ${phoneNumber} (${isInitialStart ? 'initial' : 'restart'})`);
    
    if (!authId) throw new Error('authId is required');
    const sessionKey = `${authId}:${phoneNumber}`;
    
    // If session already exists, return it
    if (sessions.has(sessionKey)) {
        onStatus?.('already_running');
        return sessions.get(sessionKey).bmm;
    }

    
    // Use SQLite for session persistence
    const { state, saveCreds } = await useSQLiteAuthState(authId, phoneNumber);

    const { version } = await fetchLatestBaileysVersion();
    const groupCache = new NodeCache({ stdTTL: 60 * 60, useClone: false });
    const bmm = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        browser: ['Windows', 'Chrome', '128.0.6613.137'],
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        receivedPendingNotifications: true,
        appStateSyncIntervalMs: 60000,
        keepAliveIntervalMs: 30000, 
        connectTimeoutMs: 90000, 
        emitOwnEvents: true, 
        linkPreviewImageThumbnailWidth: 1200, 
        fireInitQueries: false,         
        markOnlineOnConnect: false,   
        groupMetadataCache: async (key) => {
            return groupCache.get(key);
        },
        groupMetadataCacheSet: async (key, value) => {
            groupCache.set(key, value);
        },
        getMessage: async (key) => {
            return (await store.loadMessage?.(key.remoteJid, key.id)) || undefined;
         }
    });
    store.bind(bmm.ev);
    bmm.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        
        if (connection === 'open') { 
            console.log(`🤖 connection Open for ${phoneNumber}`);
            const added = addSession(phoneNumber, bmm);
            //console.log(`Session added: ${added ? '✅' : '❌'}`);
            try {
            // Record per-bot start time
            const user_id_for_start = bmm.user?.id?.split(':')[0]?.split('@')[0];
            if (user_id_for_start) {
                botStartTimes[user_id_for_start] = Date.now();
            }
            } catch {}
              try {
            console.info(`🔄 Uploading pre-keys for ${phoneNumber}`);
            await bmm.uploadPreKeys();
            console.log(`✅ Pre-keys uploaded to WhatsApp for ${phoneNumber}`);
        } catch (err) {
            console.warn(`⚠️ Failed to upload pre-keys:`, err.message);
        }

        try {
            await bmm.assertSessions([`${phoneNumber}@s.whatsapp.net`]);
            console.log(`✅ session assert  uploaded to WhatsApp for ${phoneNumber}`);
        } catch (error) {
            console.warn(`⚠️ Failed to assert session:`, error.message);
        }
            await saveCreds();
            console.log(`✅ Connection established for ${phoneNumber}`);
            onStatus?.('connected');
            const user_id = bmm.user?.id?.split(':')[0]?.split('@')[0];
            const user_lid = bmm.user?.lid ? bmm.user.lid.split(':')[0] : '';
            const user_name = bmm.user?.name || ''
            if (user_id) botStartTimes[user_id] = Date.now();
            recordBotActivity({ user: authId, bot: phoneNumber, action: 'connection_open' });
            botInstances[user_id] = bmm;
            if (!userExists(user_id)) {
                console.log(`📥 User ${user_id} not found in database, saving...`);
            saveUserToDb({ user_id, user_lid, user_name, auth_id: authId });
            await restartBotForUser({
                authId,
                phoneNumber,
                country,
                pairingMethod,
                onStatus,
                onQr,
                onPairingCode,
                restartType: 'initial',
                additionalInfo: `✨ Your bot is now online and ready to use!\n\n> Syncing your WhatsApp data...`
                });
            console.log(`✅ User ${user_id} saved to database`);
            }

            setTimeout(async () => {
                const {  syncUserSession } = require('../database/sqliteAuthState');
                await  syncUserSession(authId, phoneNumber);
                console.log(`🔄 Synced all sessions from SQLite to Supabase after 5 seconds for ${phoneNumber}`);
            }, 5000); // 5 seconds
        }        
        if (connection === 'close') {
            recordBotActivity({ user: authId, bot: phoneNumber, action: 'connection_close' });
            const reason = update.lastDisconnect?.error;
            let code = reason?.output?.statusCode || reason?.statusCode || reason?.code || reason;
            if (Boom.isBoom(reason)) code = reason.output.statusCode;

            console.log(`🔌 Disconnected for reason:`, code);

            // Handle session deletion for bad session/logged out/failure
            if (
                code === DisconnectReason.badSession ||
                code === DisconnectReason.loggedOut ||
                code === DisconnectReason.Failure ||
                code === 405 || // Custom code for "bad session"
                code === DisconnectReason.forbidden
            ) {
                // Delete session and do NOT restart
                console.log('🗑️ Deleting session for', sessionKey);
                await deleteBmmBot(authId, phoneNumber);
                onStatus?.('deleted');
            } else if (
                code === DisconnectReason.connectionClosed ||
                code === DisconnectReason.connectionLost ||
                code === DisconnectReason.connectionReplaced ||
                code === DisconnectReason.restartRequired ||
                code === DisconnectReason.timedOut
            ) {
                // Restart the bot
                console.log('🔄 Restarting bot for', sessionKey);
                cleanup();
               if (!deletedSessions.has(`${authId}:${phoneNumber}`)) {
                    setTimeout(() => {
                        startBmmBot({ authId, phoneNumber, country, pairingMethod, onStatus, onQr, onPairingCode });
                    }, 2000);
                    } else {
                    console.log(`🛑 Bot ${authId}:${phoneNumber} was deleted manually — skipping restart.`);
                    }

                onStatus?.('restarting');
            } else {
                // Unknown reason
                cleanup();
                 if (!deletedSessions.has(`${authId}:${phoneNumber}`)) {
                    setTimeout(() => {
                        startBmmBot({ authId, phoneNumber, country, pairingMethod, onStatus, onQr, onPairingCode });
                    }, 2000);
                    } else {
                    console.log(`🛑 Bot ${authId}:${phoneNumber} was deleted manually — skipping restart.`);
                    }

                onStatus?.('restarting', reason);
            }
        }
    });

    bmm.ev.on('creds.update', saveCreds);
    //  await saveSessionToSupabase(phoneNumber, {
    //             creds: bmm.authState.creds,
    //             keys: bmm.authState.keys,
    //             authId
    //         });

    function cleanup() {
        try { bmm.ws?.close(); } catch {}
        sessions.delete(sessionKey);
        delete botInstances[phoneNumber];
        removeSession(phoneNumber);
        recordBotActivity({ user: authId, bot: phoneNumber, action: 'cleanup' });
    }

    sessions.set(sessionKey, { bmm, cleanup });


    let totalChats = 0;
    let receivedChats = 0;
    let syncDone = false;

    bmm.ev.on('chats.set', ({ chats }) => {
        totalChats = chats.length;
        console.log(`Total chats expected: ${totalChats}`);
    });

   

  // Track which percentages we've already notified
    let notifiedPercents = new Set();

    bmm.ev.on('messages.upsert', async ({ messages }) => {
        //console.log('Received messages:', messages);

        if (isInitialStart) {
        
        receivedChats++;
        let percent = Math.min(100, Math.floor((receivedChats / totalChats) * 100));
        console.log(`Sync progress: ${percent}%`);

        // Milestones we want to notify
        const milestones = [25, 50, 75, 100];

        if (milestones.includes(percent) && !notifiedPercents.has(percent)) {
            notifiedPercents.add(percent);

            try {
                const userJid = bmm.user?.id || `${phoneNumber}@s.whatsapp.net`;
                await bmm.sendMessage(userJid, {
                    text: `🔄 Sync Progress: ${percent}%\n\n> Your bot is still syncing your WhatsApp data.`
                });
                console.log(`Sent sync progress DM (${percent}%) to ${userJid}`);
            } catch (error) {
                console.error(`Failed to send sync progress DM (${percent}%):`, error);
            }
        }

        if (!syncDone && percent >= 100) {
            syncDone = true;
            await bmm.sendMessage(`${phoneNumber}@s.whatsapp.net`, {
                text: `🔄 Sync complete!\n\n> Your bot is now ready to use.`
            });
            console.log('Sync complete!');
        }
    }

        const msg = messages[0];
        if (!msg.message) return;
        await handleMessage({ authId, sock: bmm, msg, phoneNumber });
    });


// 🔐 Monitor app-state.sync to detect when key is received
bmm.ev.on('app-state.sync', async (update) => {
    const appStateKeys = Object.keys(bmm.authState.keys['app-state-sync-key'] || {});
    console.log(`📥 app-state.sync triggered for ${phoneNumber}, keys now:`, appStateKeys);

    if (appStateKeys.length > 0) {
        // Save again with app-state-sync-key included
        await saveSessionToSupabase(authId, phoneNumber, {
            creds: bmm.authState.creds,
            keys: bmm.authState.keys
        });
        console.log(`💾 Session with app-state-sync-key saved for ${phoneNumber}`);
    }
});

    bmm.ev.on('message-receipt.update', async (update) => {
    //console.log(`Received message receipt update for ${phoneNumber}:`, update);
    if (update.receipts) {
        for (const receipt of update.receipts) {
            // Handle each receipt
        }
    }
    });
    
    const handleGroupParticipantsUpdate = require('../handler/features/welcome');
    bmm.ev.on('group-participants.update', async (update) => {
    await handleGroupParticipantsUpdate(bmm, update);
    });

// Register bot in your bot manager
//addBot(phoneNumber, bmm);

bmm.ev.on('error', (err) => {
    console.error('Baileys error:', err);
});
    const added = addSession(phoneNumber, bmm);
    //console.log(`Session added on connect: ${added ? '✅' : '❌'}`);
    return bmm;

    
}



// In src/main/main.js
async function handleLogout(bmm, authId, phoneNumber) {
    try {
        console.log('Logout requested for', phoneNumber);

        // 1. Close the connection gracefully
        try {
            if (bmm?.ws) {
                await bmm.ws.close();
            }
        } catch (err) {
            console.warn(`⚠️ Failed to close connection: ${err.message}`);
        }
        
        // 2. Clean up event listeners
        if (bmm?.ev && typeof bmm.ev.removeAllListeners === 'function') {
            bmm.ev.removeAllListeners();
        } else {
            console.warn("⚠️ Event emitter not available for this instance");
        }
        
        // 3. Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 4. Delete session and user data
        try {
            await deleteBmmBot(authId, phoneNumber);
            console.log('Bot session deleted successfully');
            // In main.js, update the recordBotActivity call to:
                await recordBotActivity({
                    user: authId,
                    bot: phoneNumber,
                    action: 'logout'
                });
            return { success: true, message: 'Successfully logged out' };
        } catch (error) {
            console.error('Failed to delete bot:', error);
            throw new Error('Failed to complete logout: ' + error.message);
        }
    } catch (error) {
        console.error('Logout error:', error);
        throw error; // Re-throw to be handled by the caller
    }
}



// Delete bot session from SQLite and memory
async function deleteBmmBot(authId, phoneNumber) {
    console.log(`Deleting Bmm bot for user ${phoneNumber}`);
    
    const sessionKey = `${authId}:${phoneNumber}`;
    
    // 🚨 Add this line
    deletedSessions.add(sessionKey);

    stopBmmBot(authId, phoneNumber);
    const session = sessions.get(sessionKey);
    if (session) {
        session.cleanup();
    }
    delete botInstances[phoneNumber];

    const { deleteSession } = require('../database/sqliteAuthState');
    await deleteSession(authId, phoneNumber);

    const { deleteUser } = require('../database/database');
    await deleteUser(authId, phoneNumber);

    await deleteSessionFromSupabase(phoneNumber);
    sessions.delete(sessionKey);
    const { deleteAllAntideleteSettings} = require('../database/antideleteDb')
    await deleteAllAntideleteSettings(phoneNumber);
    const { deleteAllAntilinkSettings} = require('../database/antilinkDb')
    await deleteAllAntilinkSettings(phoneNumber);
    console.log(`Bmm bot for user ${phoneNumber} deleted successfully`);
    recordBotActivity({ user: authId, bot: phoneNumber, action: 'deleted' });
}

// Stop bot only (no session deletion)
function stopBmmBot(authId, phoneNumber) {
    const sessionKey = `${authId}:${phoneNumber}`;
    const session = sessions.get(sessionKey);
    if (session) {
        session.cleanup();
    }
    sessions.delete(sessionKey);
    delete botInstances[phoneNumber];
    removeSession(phoneNumber);
    recordBotActivity({ user: authId, bot: phoneNumber, action: 'stopped' });
}
async function getBotGroups(authId, phoneNumber) {
    // Use the in-memory bot instance
    const bot = botInstances[phoneNumber];
    if (!bot) throw new Error('Bot not running');
    // groupFetchAllParticipating returns a map of group JIDs to group info
    const chats = await bot.groupFetchAllParticipating();
    return Object.values(chats).map(g => ({
        id: g.id,
        name: g.subject
    }));
}

// const { syncSQLiteToSupabase } = require('../database/sqliteAuthState');

// async function gracefulShutdown(isRestart = false) {
//     console.log('🛑 Shutting down, syncing SQLite sessions to Supabase...');
//     try {
//         await syncSQLiteToSupabase();
//         console.log('✅ All sessions synced to Supabase.');

//         if (isRestart) {
//             // Only for nodemon restarts (SIGUSR2), allow process to restart
//             process.kill(process.pid, 'SIGUSR2');
//         } else {
//             process.exit(0);
//         }
//     } catch (e) {
//         console.error('❌ Sync on shutdown failed:', e);
//         process.exit(1);
//     }
// }

// // Handle regular termination signals
// ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
//     process.on(signal, () => gracefulShutdown(false));
// });

// Handle nodemon restart
// process.once('SIGUSR2', () => gracefulShutdown(true));

// // Optional final exit safety
// process.on('exit', () => gracefulShutdown(false));


module.exports = { startBmmBot, stopBmmBot, deleteBmmBot, getBotGroups, store, handleLogout };