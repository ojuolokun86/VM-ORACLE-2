require('dotenv').config();
const path = require('path');
const { createServer } = require('./server/server');
const { restoreAllSessionsFromSupabase } = require('./database/sqliteAuthState');
const { startBmmBot } = require('./main/main');
const Database = require('better-sqlite3');
const { getActiveSessions } = require('./utils/sessionManager');
const { sendRestartMessage } = require('./main/restart');
const { version } = require('../package.json');
const fs = require('fs');
const NOTIFICATION_FILE = path.join(__dirname, '../.update-notification');

process.on('unhandledRejection', (reason, promise) => {
  console.error('🛑 Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});


async function checkForUpdateNotifications() {
  try {
      if (fs.existsSync(NOTIFICATION_FILE)) {
          console.log('📄 Update notification file found');
          const content = fs.readFileSync(NOTIFICATION_FILE, 'utf8');
          const notification = JSON.parse(content);
          
          console.log('📋 Processing update notification:', notification);
          const activeSessions = getActiveSessions();
          console.log('📋 Active sessions:', Object.keys(activeSessions).length);

          // Send notification to each active session
          for (const [phoneNumber, sock] of Object.entries(activeSessions)) {
              try {
                  console.log(`📤 Sending update to ${phoneNumber}...`);
                  await sendRestartMessage(sock, phoneNumber, {
                      type: 'deployment',
                      additionalInfo: `🚀 Bot has been updated to version ${notification.version}!`
                  });
                  console.log(`✅ Update sent to ${phoneNumber}`);
              } catch (error) {
                  console.error(`❌ Error sending to ${phoneNumber}:`, error.message);
              }
          }

          // Delete the notification file after processing
          fs.unlinkSync(NOTIFICATION_FILE);
          console.log('✅ Update notification processed and file removed');
      }
  } catch (error) {
      console.error('❌ Error in checkForUpdateNotifications:', error.message);
  }
}

// Check for notifications every 5 seconds
setInterval(() => {
  checkForUpdateNotifications().catch(console.error);
}, 5000);

// Initial check
checkForUpdateNotifications().catch(console.error);
// Scheduled sync every 2 hours
const { syncUserSettingsToSupabase } = require('./database/supabaseDb');
const { db } = require('./database/database');
function syncAllUsersToSupabase() {
  // Get all unique authIds from users table
  const authIds = db.prepare('SELECT DISTINCT auth_id FROM users').all().map(r => r.auth_id);
  for (const authId of authIds) {
    syncUserSettingsToSupabase(authId)
      .then(() => console.log(`✅ Synced settings for user ${authId} to Supabase (scheduled)`))
      .catch(err => console.error(`❌ Failed to sync settings for user ${authId}:`, err.message));
  }
}
setInterval(syncAllUsersToSupabase, 2 * 60 * 60 * 1000); // Sync every 2 hours

// Start all bots based on sessions stored in the SQLite database
async function startAllBots() {
  // Match the dbPath from sqliteAuthState.js
  const dbPath = path.join(__dirname, 'database', 'sessions.db');
  const db = new Database(dbPath);

  const rows = db.prepare('SELECT auth_id, phone_number FROM sessions').all();
  if (rows.length === 0) {
    console.info('❗ No sessions found in the database.');
    return;
  }
  let success = 0;
  for (const { auth_id, phone_number } of rows) {
    try {
      await startBmmBot({
        authId: auth_id,
        phoneNumber: phone_number,
        pairingMethod: 'none', // Not needed, just placeholder
        country: null,         // Optional
        onStatus: () => {},    // Optional dummy
      });
      console.log(`✅ Started bot for ${auth_id} (${phone_number})`);
      success++;
    } catch (err) {
      console.error(`❌ Failed to start ${auth_id} (${phone_number}):`, err.message);
    }
  }
  console.log(`🚀 Started ${success} out of ${rows.length} bots successfully.`);
}

// Main startup sequence
(async () => {
  console.log('🚀 Starting BMM DEV V2...');
  createServer();
  await restoreAllSessionsFromSupabase(); // Restore from Supabase first
  await startAllBots(); // Then start all bots from SQLite
  syncAllUsersToSupabase(); // Sync all users to Supabase
})();

// Robust graceful shutdown (sessions + settings)
const { syncSQLiteToSupabase } = require('./database/sqliteAuthState');
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    console.log(`🛑 Received ${signal}, syncing sessions and settings to Supabase before exit...`);
    await syncSQLiteToSupabase();
    await Promise.all(
      db.prepare('SELECT DISTINCT auth_id FROM users').all().map(r =>
        syncUserSettingsToSupabase(r.auth_id)
      )
    );
    console.log('✅ Shutdown sync complete. Exiting.');
    setTimeout(() => process.exit(0), 300);
  } catch (err) {
    console.error('❌ Error during shutdown sync:', err);
    setTimeout(() => process.exit(1), 300);
  }
}

// Catch all common shutdown signals
['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGHUP'].forEach(sig => {
  process.on(sig, () => gracefulShutdown(sig));
});

process.once('SIGUSR2', async () => {
  await gracefulShutdown('SIGUSR2');
  // Wait a little longer to ensure all async operations and logs are flushed
  setTimeout(() => {
    process.kill(process.pid, 'SIGUSR2');
  }, 1000); // 1 second (adjust as needed)
});