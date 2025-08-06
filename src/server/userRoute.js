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

// POST /api/deploy-bot
router.post('/deploy-bot', async (req, res) => {
  const { authId, phoneNumber, pairingMethod, subscriptionLevel, daysLeft } = req.body;

  if (!authId) return res.status(400).json({ success: false, message: 'authId is required.' });
  if (!phoneNumber) return res.status(400).json({ success: false, message: 'phoneNumber is required.' });

  let subLevel = subscriptionLevel || 'free';
  let days = parseInt(daysLeft, 10) || 0;

  const dbPath = path.join(__dirname, '../database/sessions.db');
  const db = new Database(dbPath);

  const botCount = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE auth_id = ?').get(authId).count;

  let maxBots = 1;
  if (subLevel === 'gold') maxBots = 3;
  if (subLevel === 'premium') maxBots = 5;
  if (subLevel === 'trier') maxBots = 1;
  if (subLevel === 'basic') maxBots = 1;

  if (days === 0) {
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

 if (botCount >= maxBots) {
  emitToBot(authId, phoneNumber, 'status', {
    error: true,
    reason: 'limit',
    message: `You have reached your bot limit for the "${subLevel}" subscription (${maxBots} bots).`
  });
  return res.status(403).json({
    success: false,
    message: `Bot limit reached`,
    handledViaSocket: true
  });
}

  // ✅ Now proceed with deployment
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
  } catch (err) {
    console.error('❌ Deployment error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
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