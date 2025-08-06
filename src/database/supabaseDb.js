const supabase = require('../supabaseClient');
const { db } = require('./database');

async function syncUserSettingsFromSupabase(authId) {
  // 1. Get all bot phone numbers for this user from local sessions table
  const botRows = db.prepare('SELECT phone_number FROM sessions WHERE auth_id = ?').all(authId);

  for (const { phone_number } of botRows) {
    // ---- Antilink Settings ----
    const { data: antilinkSettings } = await supabase
      .from('antilink_setting')
      .select('*')
      .eq('bot_id', phone_number);
    for (const setting of antilinkSettings || []) {
      db.prepare(`
        INSERT OR IGNORE INTO antilink_settings (group_id, bot_id, mode, warn_limit, bypass_admins)
        VALUES (?, ?, ?, ?, ?)
      `).run(setting.group_id, setting.bot_id, setting.mode, setting.warn_limit, setting.bypass_admins);
    }

    // ---- Antidelete Settings ----
    const { data: antideleteSettings } = await supabase
      .from('antidelete_setting')
      .select('*')
      .eq('user_id', phone_number);
    for (const setting of antideleteSettings || []) {
      db.prepare(`
        INSERT OR IGNORE INTO antidelete_settings (user_id, enabled)
        VALUES (?, ?)
      `).run(setting.user_id, setting.enabled);
    }

    // ---- Welcome Settings ----
    const { data: welcomeSettings } = await supabase
      .from('welcome_setting')
      .select('*')
      .eq('bot_id', phone_number);
    for (const setting of welcomeSettings || []) {
      db.prepare(`
        INSERT OR IGNORE INTO welcome_settings (group_id, bot_id, welcome_message)
        VALUES (?, ?, ?)
      `).run(setting.group_id, setting.bot_id, setting.welcome_message);
    }

    // ---- Add more settings as needed ----
    // ---- User Table ----
            const { data: userRows } = await supabase
            .from('user')
            .select('*')
            .eq('auth_id', authId);
            for (const user of userRows || []) {
            db.prepare(`
        INSERT OR IGNORE INTO users (user_id, user_lid, user_name, auth_id, mode, prefix, status_view_mode, react_to_command, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        user.user_id, user.user_lid, user.user_name, user.auth_id, user.mode, user.prefix,
        user.status_view_mode, user.react_to_command, user.created_at
        );
        }
  }
}

async function syncUserSettingsToSupabase(authId) {
    // 1. Sync user row
    // For each bot/session of this user
const botRows = db.prepare('SELECT phone_number FROM sessions WHERE auth_id = ?').all(authId);
for (const { phone_number } of botRows) {
    const user = db.prepare('SELECT * FROM users WHERE auth_id = ?').get(authId);
if (user) {
  await supabase.from('user').upsert([user], { onConflict: 'user_id' });
}
  // Antilink
  const antilinkSettings = db.prepare('SELECT * FROM antilink_settings WHERE bot_id = ?').all(phone_number);
  if (antilinkSettings.length) {
    await supabase.from('antilink_setting').upsert(antilinkSettings, { onConflict: 'group_id,bot_id' });
  }
  // Antidelete
  const antideleteSettings = db.prepare('SELECT * FROM antidelete_settings WHERE user_id = ?').all(phone_number);
  if (antideleteSettings.length) {
    await supabase.from('antidelete_setting').upsert(antideleteSettings, { onConflict: 'user_id' });
  }
  // Welcome
  const welcomeSettings = db.prepare('SELECT * FROM welcome_settings WHERE bot_id = ?').all(phone_number);
  if (welcomeSettings.length) {
    await supabase.from('welcome_setting').upsert(welcomeSettings, { onConflict: 'group_id,bot_id' });
  }
}
}
  module.exports = { syncUserSettingsFromSupabase, syncUserSettingsToSupabase };