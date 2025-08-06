const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { initAuthCreds, makeCacheableSignalKeyStore, BufferJSON } = require('@whiskeysockets/baileys');
const { saveSessionToSupabase, loadAllSessionsFromSupabase, getSessionFromSupabase, } = require('./supabaseSession');
const { syncUserSettingsFromSupabase, syncUserSettingsToSupabase } = require('./supabaseDb');

const dbPath = path.join(__dirname, 'sessions.db');
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '');

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    auth_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL,
    creds TEXT NOT NULL,
    keys TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (auth_id, phone_number)
  )
`);

// Buffer-safe stringify
function encodeKeys(keys) {
  const encoded = {};
  for (const category in keys) {
    encoded[category] = {};
    for (const id in keys[category]) {
      encoded[category][id] = JSON.stringify(keys[category][id], BufferJSON.replacer);
    }
  }
  return encoded;
}

// Buffer-safe parse
function decodeKeys(encoded) {
  const parsed = {};
  for (const category in encoded) {
    parsed[category] = {};
    for (const id in encoded[category]) {
      parsed[category][id] = JSON.parse(encoded[category][id], BufferJSON.reviver);
    }
  }
  return parsed;
}

// Load session from DB
function loadSession(authId, phoneNumber) {
  const row = db.prepare(`
    SELECT creds, keys FROM sessions
    WHERE auth_id = ? AND phone_number = ?
  `).get(authId, phoneNumber);

  if (!row) return null;

  return {
    creds: JSON.parse(row.creds, BufferJSON.reviver),
    keys: decodeKeys(JSON.parse(row.keys)),
    status: row.status,

  };
}

// Save session to DB
function saveSession(authId, phoneNumber, status, creds, keys) {
  db.prepare(`
    INSERT INTO sessions (auth_id, phone_number, status, creds, keys)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(auth_id, phone_number)
    DO UPDATE SET creds = excluded.creds, keys = excluded.keys, updated_at = CURRENT_TIMESTAMP
  `).run(
    authId,
    phoneNumber,
    status,
    JSON.stringify(creds, BufferJSON.replacer),
    JSON.stringify(encodeKeys(keys))
  );
}
try{
  db.prepare(`
    ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
  `).run();
} catch (e) {
  // Ignore if already exists
}  

// Main function used in Baileys
async function useSQLiteAuthState(authId, phoneNumber) {
  let session = loadSession(authId, phoneNumber);

  if (!session) {
    session = {
      creds: initAuthCreds(),
      keys: {},
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  const { creds, keys } = session;

  const keyStore = makeCacheableSignalKeyStore({
    get: async (type, ids) => {
      const result = {};
      for (const id of ids) {
        if (keys[type] && keys[type][id]) {
          result[id] = keys[type][id];
        }
      }
      return result;
    },
    set: async (data) => {
  for (const category in data) {
    if (!keys[category]) keys[category] = {};
    for (const id in data[category]) {
      keys[category][id] = data[category][id];
    }
  }
  saveSession(authId, phoneNumber, 'active', creds, keys);
    }
  });

  return {
    state: {
      creds,
      keys: keyStore
    },
    saveCreds: async () => {
      saveSession(authId, phoneNumber, 'active', creds, keys);
    }
  };
}

// Delete session
function deleteSession(authId, phoneNumber) {
  db.prepare(`DELETE FROM sessions WHERE auth_id = ? AND phone_number = ?`).run(authId, phoneNumber);
}

function deleteAllSessions() {
  db.prepare('DELETE FROM sessions').run();
}

async function syncUserSession(authId, phoneNumber) {
  const session = loadSession(authId, phoneNumber);
  if (!session) return;

  await saveSessionToSupabase(authId, phoneNumber, {
    creds: session.creds,
    keys: session.keys,
    authId
  });
  await syncUserSettingsToSupabase(authId);
  console.log(`✅ Synced session for ${phoneNumber} to Supabase. with keys ${Object.keys(session.keys).join(', ')}`);
}

async function syncSQLiteToSupabase() {
  const rows = db.prepare('SELECT auth_id, phone_number, creds, keys FROM sessions').all();
  let synced = 0, failed = 0;
  for (const row of rows) {
    try {
      await saveSessionToSupabase(row.auth_id, row.phone_number, {
        creds: JSON.parse(row.creds, BufferJSON.reviver),
        keys: decodeKeys(JSON.parse(row.keys))
      });
      synced++;
    } catch (err) {
      console.error(`❌ Failed to sync session for ${row.phone_number}:`, err.message);
      failed++;
    }
  }
  console.log(`✅ Synced ${synced} sessions from SQLite to Supabase. Failed: ${failed}`);
}

async function restoreAllSessionsFromSupabase() {
  // 1. Delete all local sessions
  deleteAllSessions();
  console.log('🗑️ Deleted all sessions from SQLite.');

  // 2. Load all sessions from Supabase
  const sessions = await loadAllSessionsFromSupabase();
  if (!sessions || sessions.length === 0) {
    console.log('⚠️ No sessions found in Supabase.');
    return;
  }
  let restored = 0;
  for (const session of sessions) {
    try {
      const creds = JSON.parse(session.creds, BufferJSON.reviver);
      const rawKeys = JSON.parse(session.keys);
      const keys = {};
      for (const category in rawKeys) {
        keys[category] = {};
        for (const id in rawKeys[category]) {
          keys[category][id] = JSON.parse(rawKeys[category][id], BufferJSON.reviver);
        }
      }
      saveSession(session.authId, session.phoneNumber, session.status || 'active', creds, keys);
      restored++;
      console.log(`💾 Restored session for ${session.phoneNumber} to SQLite.`);
      console.log('🔍 Loaded app-state-sync-key IDs:', Object.keys(keys['app-state-sync-key'] || {}));

      await syncUserSettingsFromSupabase(session.authId);
    } catch (err) {
      console.error(`❌ Failed to restore session for ${session.phoneNumber}:`, err.message);
    }
  }
  console.log(`✅ Restored ${restored} sessions from Supabase to SQLite.`);
}
async function writeSessionToSQLite(authId, phoneNumber, sessionData = null) {
  try {
    const session = sessionData || await getSessionFromSupabase(authId, phoneNumber);
    if (!session) {
      console.warn(`No session found for ${authId}:${phoneNumber}`);
      return false;
    }
    const creds = JSON.parse(session.creds, BufferJSON.reviver);
    const rawKeys = JSON.parse(session.keys);
    const keys = {};
    for (const category in rawKeys) {
      keys[category] = {};
      for (const id in rawKeys[category]) {
        keys[category][id] = JSON.parse(rawKeys[category][id], BufferJSON.reviver);
      }
    }
    saveSession(authId, phoneNumber, 'active', creds, keys);
    return true;
  } catch (err) {
    console.error(`Failed to write session to SQLite for ${authId}:${phoneNumber}:`, err.message);
    return false;
  }
}
module.exports = { useSQLiteAuthState, deleteSession, syncSQLiteToSupabase, deleteAllSessions, restoreAllSessionsFromSupabase, syncUserSession, writeSessionToSQLite};
