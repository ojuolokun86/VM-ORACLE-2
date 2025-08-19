const express = require('express');
const router = express.Router();
const { registerAndDeploy } = require('../main/deployment');
const { emitToBot } = require('../server/socket'); // Adjust path as needed
const Database = require('better-sqlite3');
const path = require('path');
const { getUserSettings } = require('../utils/settings');
const { setUserMode, setUserPrefix, } = require('../database/database');
const { deleteBmmBot } = require('../main/main');
const { restartBotForUser } = require('../main/restart');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// POST /api/deploy-bot
router.post('/deploy-bot', async (req, res) => {
  console.log('📩 Received deploy request:', req.body);
  const { authId, phoneNumber, pairingMethod, subscriptionLevel, daysLeft } = req.body;

  if (!authId) return res.status(400).json({ success: false, message: 'authId is required.' });
  if (!phoneNumber) return res.status(400).json({ success: false, message: 'phoneNumber is required.' });

  const subLevel = subscriptionLevel || 'free';
  const days = parseInt(daysLeft, 10) || 0;
  const dbPath = path.join(__dirname, '../database/sessions.db');
  const db = new Database(dbPath);

  try {
    // Check if session exists in local DB
    const localSession = db.prepare('SELECT * FROM sessions WHERE auth_id = ? AND phone_number = ?').get(authId, phoneNumber);
    
    if (!localSession) {
      // If no local session, check Supabase
      const { data: supabaseSession, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('authId', authId)
        .eq('phoneNumber', phoneNumber)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is 'no rows returned' error
        console.error('Supabase error:', error);
        return res.status(500).json({ success: false, message: 'Error checking session in Supabase' });
      }

      // If no session exists in either local or Supabase, proceed to check bot limits
      if (!supabaseSession) {
        // Get bot count for this auth_id
        const { count: botCount } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('authId', authId);

        // Define bot limits based on subscription level
        const botLimits = {
          trier: 1,
          basic: 1,
          gold: 3,
          premium: 5
        };

        const maxBots = botLimits[subLevel] || 1;
        const currentBots = botCount || 0;

        if (currentBots >= maxBots) {
          emitToBot(authId, phoneNumber, 'status', {
            error: true,
            reason: 'limit',
            message: `You have reached your bot limit for the "${subLevel}" subscription (${maxBots} bots).`
          });
          return res.status(404).json({
            success: false,
            message: `You have reached your bot limit for the "${subLevel}" subscription (${maxBots} bots).`,
            handledViaSocket: true
          });
        }
      }
    }

    // Check subscription expiration
    if (days <= 0) {
      emitToBot(authId, phoneNumber, 'status', {
        error: true,
        reason: 'expired',
        message: 'Your subscription has expired. Please renew to deploy a new bot.'
      });
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired.',
        handledViaSocket: true
      });
    }

    // If we get here, either session exists or user is under bot limit
    // Proceed with bot deployment
    try {
      await registerAndDeploy({
        authId,
        phoneNumber,
        pairingMethod,
        onQr: qr => emitToBot(authId, phoneNumber, 'qr', { qr }),
        onPairingCode: code => emitToBot(authId, phoneNumber, 'pairingCode', { code }),
        onStatus: status => emitToBot(authId, phoneNumber, 'status', { status })
      });
      return res.json({ success: true, message: 'Deployment started!' });
    } catch (error) {
      console.error('Error in registerAndDeploy:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  } catch (error) {
    console.error('Error in deploy-bot:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    db.close();
  }
});

// GET /api/bots?authId=123456
router.get('/bots', async (req, res) => {
  //console.log('📩Received request for bots');
  const { authId } = req.query;
  if (!authId) {
    return res.status(400).json({ success: false, message: 'authId is required.' });
  }
  try {
   // console.log(`🔗 Fetching bots for authId: ${authId}`);
    const dbPath = path.join(__dirname, '../database/sessions.db');
    const db = new Database(dbPath);
    // Only select columns that exist
    const rows = db.prepare('SELECT phone_number FROM sessions WHERE auth_id = ?').all(authId);
   // console.log(`📩 Found ${rows.length} bots for authId: ${authId}`);
    res.json({ success: true, bots: rows });
  } catch (err) {
    console.error('❌ Error fetching bots:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});
router.get('/bot-settings', async (req, res) => {
  const { authId, phoneNumber } = req.query;
  if (!authId || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'authId and phoneNumber are required.' });
  }
  try {
    // Use the settings.js helper, not direct DB access
    const settings = getUserSettings(phoneNumber);
    res.json({
      success: true,
      settings
    });
  } catch (err) {
    console.error('❌ Error fetching bot settings:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/bot-settings', async (req, res) => {
  const { authId, phoneNumber, mode, prefix } = req.body;
  if (!authId || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'authId and phoneNumber are required.' });
  }
  try {
    if (mode && ['public', 'private', 'admin'].includes(mode)) {
      setUserMode(phoneNumber, mode);
    }
    if (prefix && typeof prefix === 'string' && prefix.length > 0 && prefix.length <= 3) {
      setUserPrefix(phoneNumber, prefix);
    }
    res.json({ success: true, message: 'Settings updated.' });
  } catch (err) {
    console.error('❌ Error updating bot settings:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/bot
router.delete('/bot', async (req, res) => {
  const { authId, phoneNumber } = req.body;
  if (!authId || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'authId and phoneNumber are required.' });
  }
  try {
    // Delete bot session and user info everywhere
    await deleteBmmBot(authId, phoneNumber);
    res.json({ success: true, message: 'Bot and all related info deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/bot/restart
router.post('/bot/restart', async (req, res) => {
  const { authId, phoneNumber } = req.body;
  if (!authId || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'authId and phoneNumber are required.' });
  }
  try {
    await restartBotForUser({ authId, phoneNumber, restartType: 'manual', additionalInfo: 'Bot restarted manually.' });
    res.json({ success: true, message: 'Bot restarted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/bot-groups?authId=...&phoneNumber=...
router.get('/bot-groups', async (req, res) => {
  const { authId, phoneNumber } = req.query;
  if (!authId || !phoneNumber) {
    return res.status(400).json({ success: false, message: 'authId and phoneNumber are required.' });
  }
  try {
    // This assumes you have a way to access the in-memory bot instance by phoneNumber
    const { getBotGroups } = require('../main/main');
    const groups = await getBotGroups(authId, phoneNumber);
    console.log(`📩 Found ${groups.length} groups for bot ${phoneNumber}`);
    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/set-antilink', async (req, res) => {
  const { authId, phoneNumber, groupId } = req.body;
  if (!authId || !phoneNumber || !groupId) {
    return res.status(400).json({ success: false, message: 'authId, phoneNumber, and groupId are required.' });
  }
  try {
    const { setAntilinkSettings, getAntilinkSettings } = require('../database/antilinkDb');
    const botId = phoneNumber;
    const current = getAntilinkSettings(groupId, botId);
    const newMode = current.mode === 'off' ? 'warn' : 'off';
    setAntilinkSettings(groupId, botId, { mode: newMode });
    res.json({ success: true, message: `Antilink is now ${newMode === 'off' ? 'disabled' : 'enabled'} for this group.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/group-settings?authId=...&phoneNumber=...&groupId=...
router.get('/group-settings', async (req, res) => {
  const { authId, phoneNumber, groupId } = req.query;
  if (!authId || !phoneNumber || !groupId) {
    return res.status(400).json({ success: false, message: 'authId, phoneNumber, and groupId are required.' });
  }
  try {
    const { getAntilinkSettings } = require('../database/antilinkDb');
    const { getAntideleteSettings } = require('../database/antideleteDb');
    const botId = phoneNumber;
    const antilink = getAntilinkSettings(groupId, botId);
    const antidelete = getAntideleteSettings(groupId, botId);
    res.json({ success: true, settings: { antilink, antidelete } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/set-antidelete
router.post('/set-antidelete', async (req, res) => {
  const { authId, phoneNumber, groupId, mode, excluded } = req.body;
  if (!authId || !phoneNumber || !groupId) {
    return res.status(400).json({ success: false, message: 'authId, phoneNumber, and groupId are required.' });
  }
  try {
    const { setAntideleteSettings } = require('../database/antideleteDb');
    const botId = phoneNumber;
    const updates = {};
    if (typeof mode === 'string') updates.mode = mode;
    if (typeof excluded === 'boolean') updates.excluded = excluded;
    setAntideleteSettings(groupId, botId, updates);
    res.json({ success: true, message: 'Antidelete settings updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;