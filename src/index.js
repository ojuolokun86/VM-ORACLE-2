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
const { deleteBmmBot } = require('./main/main');
const { db } = require('./database/database');
const supabase = require('./supabaseClient');

process.on('unhandledRejection', (reason, promise) => {
  console.error('🛑 Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

// At the top of the file, make sure you have access to the global bot instances
const { botInstances } = require('./utils/globalStore'); // Adjust the path as needed

async function checkAndCleanupExpiredSubscriptions() {
  try {
      const now = new Date().toISOString();
      //console.log(`🕒 Checking for expired subscriptions at ${now}...`);

      // Get all expired subscriptions
      const { data: expiredSubscriptions, error } = await supabase
          .from('subscription_tokens')
          .select('token_id, user_auth_id, subscription_level, expiration_date')
          .lt('expiration_date', now);

      if (error) {
          console.error('❌ Error fetching expired subscriptions:', error);
          return;
      }

      if (!expiredSubscriptions || expiredSubscriptions.length === 0) {
          //console.log('✅ No expired subscriptions found');
          return;
      }

      //console.log(`⚠️ Found ${expiredSubscriptions.length} expired subscriptions. Cleaning up...`);

      // Process each expired subscription
      for (const sub of expiredSubscriptions) {
          //console.log(`🔄 Processing subscription for user_auth_id: ${sub.user_auth_id}`);
          function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
          try {
             // Get all sessions for this auth_id
              // console.log('🔍 Debug: All sessions in database:');
              // const allSessions = db.prepare('SELECT auth_id, phone_number FROM sessions').all();
              // console.log(allSessions);
              
              // And modify the sessions query to:
              // Update the sessions query to trim auth_id
                const sessions = db.prepare(`
                  SELECT * FROM sessions 
                  WHERE TRIM(auth_id) = ?
                `).all(String(sub.user_auth_id).trim()); // Also trim the input value

              // Process each session
              for (const session of sessions) {
                  const { phone_number } = session;
                  //console.log(`  📱 Processing session for phone: ${phone_number}`);

                  // Check if there's an active bot instance
                  const botInstance = botInstances[phone_number];
                  if (botInstance) {
                      try {
                          // Send notification
                          //console.log(`    📢 Sending expiry notification to ${phone_number}`);
                          await botInstance.sendMessage(
                              phone_number.includes('@') ? phone_number : `${phone_number}@s.whatsapp.net`,
                              { text: "⚠️ Your subscription has expired. Your bot session will be terminated." }
                          );
                          await delay(3000);                          
                          // Delete the bot instance
                          //console.log(`    🗑️ Deleting bot instance for ${phone_number}`);
                          await deleteBmmBot(sub.user_auth_id.toString(), phone_number);
                          delete botInstances[phone_number];
                      } catch (error) {
                          console.error(`    ❌ Error processing bot ${phone_number}:`, error.message);
                      }
                  }

                  // Delete the session from database
                  try {
                      //console.log(`    🗑️ Deleting session for ${phone_number}`);
                      await deleteBmmBot(sub.user_auth_id.toString(), phone_number);
                  } catch (error) {
                      console.error(`    ❌ Error deleting session ${phone_number}:`, error.message);
                  }
              }
          } catch (error) {
              console.error(`❌ Error processing subscription ${sub.token_id}:`, error);
          }
      }

      console.log('✅ Completed expired subscription cleanup');
  } catch (error) {
      console.error('❌ Fatal error in subscription cleanup:', error);
  }
}
// Check for expired subscriptions every 12 hours (12 * 60 * 60 * 1000 = 43200000 ms)
const SUBSCRIPTION_CHECK_INTERVAL =   12 * 60 * 60 * 1000;
setInterval(checkAndCleanupExpiredSubscriptions, SUBSCRIPTION_CHECK_INTERVAL);

// Also run once on startup
checkAndCleanupExpiredSubscriptions().catch(console.error);

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