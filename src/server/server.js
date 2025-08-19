const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcrypt');
const supabase = require('../supabaseClient'); // Adjust path as needed
const { initializeSocket } = require('./socket');
const { getSessionFromSupabase } = require('../database/supabaseSession');
const { writeSessionToSQLite } = require('../database/sqliteAuthState');
const { startBmmBot } = require('../main/main'); // adjust path as needed
const { deliverToDeveloperHere } = require('../utils/devMessenger');

async function loadSessionFromSupabaseAndStart(authId, phoneNumber) {
    // 1. Get session from Supabase
    const sessionData = await getSessionFromSupabase(authId, phoneNumber);
    if (!sessionData) {
      console.warn(`No session found for ${authId}:${phoneNumber}`);
      return false;
    }
  
    // 2. Write session to SQLite
    await writeSessionToSQLite(authId, phoneNumber, sessionData);
  
    // 3. Start the BMM bot for this user
    await startBmmBot(authId, phoneNumber);
  }

function generateAuthId() {
  return Math.floor(100000 + Math.random() * 900000);
}

async function generateUniqueAuthId() {
  const { data: existingAuthIds, error } = await supabase
    .from('user_auth')
    .select('auth_id');
  if (error) throw new Error('Failed to fetch existing auth_id values.');
  const authIdSet = new Set(existingAuthIds.map((entry) => entry.auth_id));
  let authId;
  do {
    authId = generateAuthId();
  } while (authIdSet.has(authId));
  return authId;
}

function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
   const adminRoute = require('./adminRoute');
  const userRoute = require('./userRoute');
  app.use('/api', userRoute);
  console.log(`✅ User routes loaded`);
  app.use('/api/admin', adminRoute);
  console.log(`✅ Admin routes loaded`);

  app.get('/api/health', (req, res) => {
    console.log('Health check request received');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  

    app.post('/relay-report', async (req, res) => {
      const { devNumber, errorMsg, contextInfo } = req.body;
      // Only deliver if this server has the dev session
      const delivered = await deliverToDeveloperHere(errorMsg, contextInfo, [devNumber]);
      if (delivered) {
        res.json({ delivered: true });
      } else {
        res.json({ delivered: false });
      }
    });

  app.post('/api/load-session', async (req, res) => {
    const { authId, phoneNumber } = req.body;
    if (!authId || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'authId and phoneNumber required' });
    }
    try {
      await loadSessionFromSupabaseAndStart(authId, phoneNumber);
      res.json({ success: true, message: `Session loaded and bot started for ${authId}:${phoneNumber}` });
      console.log(`[API] Loaded and started bot for session ${authId}:${phoneNumber}`);
    } catch (err) {
      console.error(`[API] Failed to load/start session ${authId}:${phoneNumber}:`, err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/login', async (req, res) => {
    let { email, password } = req.body;
    email = email.toLowerCase();
    console.log('📥 Received login request:', req.body); // Debug log

    // Validate input
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        // Check if the user is an admin
        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            return res.status(200).json({
                success: true,
                role: 'admin',
                auth_id: process.env.ADMIN_AUTH_ID, // Return admin auth_id
                message: 'Admin login successful',
            });
        }

        // Handle normal user login
        const { data: user, error } = await supabase
            .from('user_auth')
            .select('id, email, password, auth_id')
            .eq('email', email)
            .single();

            console.log('🔍 User data fetched:', user); // Debug log

        if (error || !user) {
            console.error('❌ User not found or error fetching user:', error ? error.message : 'User not found');
            return res.status(401).json({ success: false, message: 'Invalid email.' });
        }

        // Compare passwords
      // Compare passwords
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.error('❌ Invalid password for user:', email);
                return res.status(402).json({ success: false, message: 'Invalid password.' });
            }

            // Fetch subscription info
            let daysLeft = 'N/A', subscriptionLevel = 'N/A';
            try {
                const { data: tokens, error: tokenError } = await supabase
                    .from('subscription_tokens')
                    .select('expiration_date, subscription_level')
                    .eq('user_auth_id', user.auth_id)
                    .maybeSingle();

                if (!tokenError && tokens && tokens.expiration_date) {
                    const expiration = new Date(tokens.expiration_date);
                    const now = new Date();
                    daysLeft = Math.max(0, Math.ceil((expiration - now) / (1000 * 60 * 60 * 24)));
                    subscriptionLevel = tokens.subscription_level;
                }
            } catch (err) {
                console.error('❌ Error fetching subscription info:', err.message);
            }

            // Return auth_id, role, and subscription info on successful login
            console.log(`✅ User ${email} logged in successfully with auth_id: ${user.auth_id} and level: ${subscriptionLevel}`); // Debug log
            res.status(200).json({
                success: true,
                role: 'user',
                auth_id: user.auth_id,
                email: user.email,
                subscription_level: subscriptionLevel,
                days_left: daysLeft
            });
    } catch (error) {
        console.error('❌ Error during login:', error.message);
        res.status(500).json({ success: false, message: 'Failed to log in.', error: error.message });
    }
});

  app.post('/api/register', async (req, res) => {
    // console.log('📥 Received registration request:', req.body); // Debug log
   let { email, password, confirmPassword } = req.body;
    email = email.toLowerCase();

    if (!email || !password || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    try {
        // console.log('🔒 Hashing password...'); // Debug log
        const hashedPassword = await bcrypt.hash(password, 10);

        // console.log('🔢 Generating unique auth_id...'); // Debug log
        const authId = await generateUniqueAuthId(); // Generate a six-digit auth_id

        // console.log('💾 Saving user to user_auth table...'); // Debug log
        const { data: authData, error: authError } = await supabase
            .from('user_auth')
            .insert([{ email, password: hashedPassword, auth_id: authId }])
            .select('auth_id'); // Get the generated auth_id
            
            if (authError) {
            // Check for duplicate email error
            if (authError.code === '23505' && authError.message.includes('user_auth_email_key')) {
                return res.status(409).json({ success: false, message: 'User already registered. Please login.' });
            }
            console.error('❌ Error saving to user_auth table:', authError.message);
            throw new Error(authError.message);
        }

        // console.log(`✅ User registered successfully with auth_id: ${authData[0].auth_id}`); // Debug log
        res.status(201).json({ success: true, message: 'User registered successfully.', auth_id: authData[0].auth_id });
    } catch (error) {
        console.error('❌ Error registering user:', error.message);
        res.status(500).json({ success: false, message: 'Failed to register user.', error: error.message });
    }
});

  const server = http.createServer(app);
  initializeSocket(server);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}

const { db } = require('../database/database');
const { syncUserSettingsToSupabase } = require('../database/supabaseDb');
const { syncSQLiteToSupabase } = require('../database/sqliteAuthState');

let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    console.log(`🛑 Received ${signal}, syncing sessions and settings to Supabase before exit...`);
    // 1. Sync all sessions
    await syncSQLiteToSupabase();
    // 2. Sync all user settings
    await Promise.all(
      db.prepare('SELECT DISTINCT auth_id FROM users').all().map(r =>
        syncUserSettingsToSupabase(r.auth_id)
      )
    );
    console.log('✅ Shutdown sync complete. Exiting.');
    setTimeout(() => process.exit(0), 300); // Let logs flush
  } catch (err) {
    console.error('❌ Error during shutdown sync:', err);
    setTimeout(() => process.exit(1), 300);
  }
}

// Catch all common shutdown signals
['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGHUP'].forEach(sig => {
  process.on(sig, () => gracefulShutdown(sig));
});

// process.on('exit', gracefulShutdown);
module.exports = { createServer };