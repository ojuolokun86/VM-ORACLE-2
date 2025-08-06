const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const path = require('path');
const { getSessionFromSupabase } = require('../database/supabaseSession.js'); // Adjust to your actual import
const { startBmmBot } = require('../main/main.js'); // Or wherever your bot start logic is
const { writeSessionToSQLite } = require('../database/sqliteAuthState.js'); // Adjust to your actual import




router.post('/load-session', async (req, res) => {
  const { authId, phoneNumber } = req.body;
  if (!authId || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'Missing authId or phoneNumber' });
  }

  try {
    // 1. Fetch session data from Supabase
    const sessionData = await getSessionFromSupabase(authId, phoneNumber);
    if (!sessionData) {
      console.log(`Session not found for authId: ${authId}, phoneNumber: ${phoneNumber}`);
      return res.status(404).json({ success: false, message: 'Session not found in Supabase' });
    }

    // 2. Save to SQLite
    await writeSessionToSQLite(authId, phoneNumber, sessionData);

    // 3. Start the bot/session using your core logic
    await startBmmBot(sessionData);

    res.json({ success: true, message: 'Session loaded, saved to SQLite, and started.' });
  } catch (err) {
    console.error('❌ Error loading session from Supabase:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// GET /api/admin/users-info
router.get('/users-info', async (req, res) => {
    try {
        // Fetch all users
        const { data: users, error } = await supabase
            .from('user_auth')
            .select('email, auth_id, subscription_status');

        if (error) {
            console.error('❌ Error fetching users:', error.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
        }

        // Fetch all tokens (subscription info)
        const { data: tokens, error: tokenError } = await supabase
            .from('subscription_tokens')
            .select('user_auth_id, expiration_date, subscription_level');

        if (tokenError) {
            console.error('❌ Error fetching tokens:', tokenError.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch tokens.' });
        }

        // Map tokens by auth_id for quick lookup
        const tokenMap = {};
        tokens.forEach(token => {
            tokenMap[token.user_auth_id] = token;
        });

        // Attach daysLeft and subscription_level to each user
        const usersWithSubscription = users.map(user => {
            const token = tokenMap[user.auth_id];
            let daysLeft = 'N/A';
            let subscriptionLevel = user.subscription_status || 'N/A';
            if (token && token.expiration_date) {
                const expiration = new Date(token.expiration_date);
                const now = new Date();
                daysLeft = Math.max(0, Math.ceil((expiration - now) / (1000 * 60 * 60 * 24)));
                subscriptionLevel = token.subscription_level;
            }
            return {
                ...user,
                subscription_level: subscriptionLevel,
                days_left: daysLeft
            };
        });

        res.status(200).json({ success: true, users: usersWithSubscription });
    } catch (err) {
        console.error('❌ Unexpected error fetching users:', err.message);
        res.status(500).json({ success: false, message: 'Unexpected error occurred.' });
    }
});

// GET /api/admin/bots/:authId
router.get('/bots/:authId', async (req, res) => {
    const authId = req.params.authId;
    if (!authId) {
        return res.status(400).json({ success: false, message: 'authId is required.' });
    }
    try {
        // Use your local SQLite DB to fetch bots for this authId
        const Database = require('better-sqlite3');
        const path = require('path');
        const dbPath = path.join(__dirname, '../database/sessions.db');
        const db = new Database(dbPath);
        const bots = db.prepare('SELECT phone_number FROM sessions WHERE auth_id = ?').all(authId);
        res.json({ success: true, bots });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
router.get('/bots', (req, res) => {
    try {
      const dbPath = path.join(__dirname, '../database/sessions.db');
      const db = new Database(dbPath);
  
      // Fetch all bots from sessions table (adjust columns as needed)
      const bots = db.prepare('SELECT session_id, auth_id AS user_auth_id, phone_number, status, created_at FROM sessions').all();
  
      // You can format/rename fields here if needed
      const formattedBots = bots.map(bot => ({
        id: bot.session_id,
        user_auth_id: bot.user_auth_id,
        status: bot.status || 'unknown',
        phone_number: bot.phone_number,
        created_at: bot.created_at
      }));
  
      res.json({ success: true, bots: formattedBots });
    } catch (err) {
      console.error('❌ Error listing bots:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // In adminRoute.js
router.get('/load', (req, res) => {
    try {
        const Database = require('better-sqlite3');
      const dbPath = path.join(__dirname, '../database/sessions.db');
      const db = new Database(dbPath);
      // Count active sessions (or whatever status means "active" for you)
      const { count } = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'").get();
      //console.log(count);
      res.json({ userCount: count });
    } catch (err) {
        console.error('❌ Error listing bots:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

 
  router.delete('/user/:authId', async (req, res) => {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '../database/sessions.db');
    const db = new Database(dbPath);
  
    const { authId } = req.params;
    try {
      // 1. Find user row by auth_id
      const userRow = db.prepare('SELECT user_id FROM users WHERE auth_id = ?').get(authId);
      if (!userRow) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      const userId = userRow.user_id;
  
      // 2. Delete all sessions (and stop bots)
      const sessionRows = db.prepare('SELECT phone_number FROM sessions WHERE auth_id = ?').all(authId);
      const { deleteBmmBot } = require('../main/main');
      for (const { phone_number } of sessionRows) {
        deleteBmmBot(authId, phone_number);
        db.prepare('DELETE FROM sessions WHERE auth_id = ? AND phone_number = ?').run(authId, phone_number);
        // Also delete all per-bot settings for this phone_number
        db.prepare('DELETE FROM antilink_settings WHERE bot_id = ?').run(phone_number);
        db.prepare('DELETE FROM antilink_warns WHERE bot_id = ?').run(phone_number);
        db.prepare('DELETE FROM welcome_settings WHERE bot_id = ?').run(phone_number);
        db.prepare('DELETE FROM antidelete_settings WHERE user_id = ?').run(phone_number);
        db.prepare('DELETE FROM antidelete_excludes WHERE user_id = ?').run(phone_number);
      }
  
      // 3. Delete user from users table
      db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
        
      res.json({ success: true, message: `User ${authId} and all related data deleted.` });
    } catch (err) {
      console.error('❌ Error deleting user:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.get('/bot-activity', (req, res) => {
    try {
      const Database = require('better-sqlite3');
      const path = require('path');
        const dbPath = path.join(__dirname, '../database/sessions.db');
        const db = new Database(dbPath);
        const rows = db.prepare(
            'SELECT user, bot, action, time FROM bot_activity ORDER BY time DESC LIMIT 10'
        ).all();
        res.json({ activity: rows });
        //console.log(rows);
    } catch (err) {
        console.error('❌ Error fetching bot activity:', err);
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;