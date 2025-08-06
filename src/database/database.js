const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'sessions.db');
const db = new Database(dbPath);

// 🔐 Users Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    user_lid TEXT,
    user_name TEXT,
    auth_id TEXT,
    mode TEXT DEFAULT 'private',
    prefix TEXT DEFAULT '.',
    status_view_mode INTEGER DEFAULT 0, -- 0: default, 1: compact, 2: detailed
    react_to_command INTEGER DEFAULT 0, -- 0: off, 1: on
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// 🛡️ Antilink Settings Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS antilink_settings (
    group_id TEXT,
    bot_id TEXT,
    mode TEXT DEFAULT 'off',
    warn_limit INTEGER DEFAULT 2,
    bypass_admins INTEGER DEFAULT 1,
    PRIMARY KEY (group_id, bot_id)
  )
`).run();

// 🚨 Antilink Warnings Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS antilink_warns (
    group_id TEXT,
    bot_id TEXT,
    user_jid TEXT,
    warn_count INTEGER DEFAULT 0,
    PRIMARY KEY (group_id, bot_id, user_jid)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS antidelete_settings (
    user_id TEXT PRIMARY KEY,
    mode TEXT DEFAULT 'off',
    forward_to_dm INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS antidelete_excludes (
    user_id TEXT,
    group_id TEXT,
    PRIMARY KEY (user_id, group_id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS welcome_settings (
    group_id TEXT,
    bot_id TEXT,
    welcome_enabled INTEGER DEFAULT 0,
    goodbye_enabled INTEGER DEFAULT 0,
    PRIMARY KEY (group_id, bot_id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS bot_activity (
    user TEXT,
    bot TEXT,
    action TEXT,
    time INTEGER
  )
`).run();

function recordBotActivity({ user, bot, action }) {
  if (!user || !bot || !action) {
    throw new Error('Missing required parameters for recordBotActivity');
}
  db.prepare(
      'INSERT INTO bot_activity (user, bot, action, time) VALUES (?, ?, ?, ?)'
  ).run(user, bot, action, Date.now());
}

// In database.js or migration setup
try {
  db.prepare("ALTER TABLE antilink_warns ADD COLUMN reasons TEXT").run();
} catch (e) {
  // Ignore if already exists
}
try{
  db.prepare("ALTER TABLE users ADD COLUMN status_view_mode INTEGER DEFAULT 0;").run();
} catch (e) {}

 try {
  db.prepare("ALTER TABLE antidelete_settings ADD COLUMN forward_to_dm INTEGER DEFAULT 0;").run();
} catch (e) {
  // Ignore if already exists
 }
// 🧩 Auto-migrate missing columns
try {
  db.prepare("ALTER TABLE users ADD COLUMN prefix TEXT DEFAULT '.'").run();
} catch (e) {} // Ignore if already exists

try {
  db.prepare("ALTER TABLE antilink_settings ADD COLUMN bypass_admins INTEGER DEFAULT 1").run();
} catch (e) {} // Ignore if already exists

try {
  db.prepare("ALTER TABLE users ADD COLUMN react_to_command INTEGER DEFAULT 0;").run();
} catch (e) {}
// 🔧 User Management Functions
function saveUserToDb({ user_id, user_lid, user_name, auth_id, mode = 'private', prefix = '.', status_view_mode = 0 }) {
  db.prepare(
    `INSERT OR IGNORE INTO users (user_id, user_lid, user_name, auth_id, mode, prefix, status_view_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(user_id, user_lid, user_name, auth_id, mode, prefix, status_view_mode);
}

function getUserPrefix(user_id) {
  const row = db.prepare(`SELECT prefix FROM users WHERE user_id = ?`).get(user_id);
  return row?.prefix || '.';
}
function getUserStatusViewMode(user_id) {
  const row = db.prepare(`SELECT status_view_mode FROM users WHERE user_id = ?`).get(user_id);
  return typeof row?.status_view_mode === 'number' ? row.status_view_mode : 0;
}

function setUserStatusViewMode(user_id, mode) {
  db.prepare(`UPDATE users SET status_view_mode = ? WHERE user_id = ?`).run(mode, user_id);
}

function setUserPrefix(user_id, prefix) {
  db.prepare(`UPDATE users SET prefix = ? WHERE user_id = ?`).run(prefix, user_id);
}

function getUserMode(user_id) {
  const row = db.prepare(`SELECT mode FROM users WHERE user_id = ?`).get(user_id);
  return row?.mode || 'private';
}

function setUserMode(user_id, mode) {
  db.prepare(`UPDATE users SET mode = ? WHERE user_id = ?`).run(mode, user_id);
}

function userExists(user_id) {
  return !!db.prepare(`SELECT 1 FROM users WHERE user_id = ?`).get(user_id);
}

function getBotOwnerByPhone(phoneNumber) {
  const row = db.prepare(`SELECT user_id FROM users WHERE user_id = ?`).get(phoneNumber);
  return row?.user_id || null;
}

function deleteUser(authId, phoneNumber) {
  db.prepare(`DELETE FROM users WHERE auth_id = ? AND user_id = ?`).run(authId, phoneNumber);
}

function isBotOwner(senderId, senderLid, botId, botLid) {
  return (
    senderId === botId ||
    senderId === botLid ||
    (senderLid && (senderLid === botId || senderLid === botLid))
  );
}

function getReactToCommand(user_id) {
  const row = db.prepare(`SELECT react_to_command FROM users WHERE user_id = ?`).get(user_id);
  return row?.react_to_command === 1;
}
function setReactToCommand(user_id, enabled) {
  db.prepare(`UPDATE users SET react_to_command = ? WHERE user_id = ?`).run(enabled ? 1 : 0, user_id);
}

module.exports = {
  db,
  saveUserToDb,
  userExists,
  setUserMode,
  getUserMode,
  getUserPrefix,
  setUserPrefix,
  getBotOwnerByPhone,
  deleteUser,
  isBotOwner,
   getUserStatusViewMode,
  setUserStatusViewMode,
   getReactToCommand,
  setReactToCommand,
  recordBotActivity,
};
