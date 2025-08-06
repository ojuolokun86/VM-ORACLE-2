const { db } = require('./database');

// 🔍 Get antilink settings
function getAntilinkSettings(groupId, botId) {
  const row = db.prepare(`
    SELECT mode, warn_limit, bypass_admins
    FROM antilink_settings
    WHERE group_id = ? AND bot_id = ?
  `).get(groupId, botId);

  return {
    mode: row?.mode || 'off',
    warnLimit: row?.warn_limit || 2,
    bypassAdmins: row?.bypass_admins === 1
  };
}

// 💾 Set or update antilink settings
function setAntilinkSettings(groupId, botId, updates = {}) {
  const existing = db.prepare(`
    SELECT mode, warn_limit, bypass_admins FROM antilink_settings WHERE group_id = ? AND bot_id = ?
  `).get(groupId, botId);

  // Use existing values if not provided in updates
  const mode = typeof updates.mode !== 'undefined' ? updates.mode : existing?.mode || 'off';
  const warnLimit = typeof updates.warnLimit !== 'undefined' ? Number(updates.warnLimit) : existing?.warn_limit || 2;
  const bypass = typeof updates.bypassAdmins !== 'undefined'
    ? (updates.bypassAdmins ? 1 : 0)
    : typeof existing?.bypass_admins !== 'undefined'
      ? existing.bypass_admins
      : 1;

  if (existing) {
    db.prepare(`UPDATE antilink_settings SET mode = ?, warn_limit = ?, bypass_admins = ? WHERE group_id = ? AND bot_id = ?`)
      .run(mode, warnLimit, bypass, groupId, botId);
  } else {
    db.prepare(`INSERT INTO antilink_settings (group_id, bot_id, mode, warn_limit, bypass_admins) VALUES (?, ?, ?, ?, ?)`)
      .run(groupId, botId, mode, warnLimit, bypass);
  }
}

// 🚨 Increase warn
function incrementWarn(groupId, botId, userJid, reason = 'No reason') {
  const row = db.prepare(`
    SELECT warn_count, reasons FROM antilink_warns
    WHERE group_id = ? AND bot_id = ? AND user_jid = ?
  `).get(groupId, botId, userJid);

  const newCount = row ? row.warn_count + 1 : 1;
  const reasons = row?.reasons ? `${row.reasons}\n• ${reason}` : `• ${reason}`;

  if (row) {
    db.prepare(`UPDATE antilink_warns SET warn_count = ?, reasons = ? WHERE group_id = ? AND bot_id = ? AND user_jid = ?`)
      .run(newCount, reasons, groupId, botId, userJid);
  } else {
    db.prepare(`INSERT INTO antilink_warns (group_id, bot_id, user_jid, warn_count, reasons) VALUES (?, ?, ?, ?, ?)`)
      .run(groupId, botId, userJid, 1, reasons);
  }

  return newCount;
}

// 🔄 Reset warning
function resetWarn(groupId, botId, userJid) {
  db.prepare(`UPDATE antilink_warns SET warn_count = 0 WHERE group_id = ? AND bot_id = ? AND user_jid = ?`)
    .run(groupId, botId, userJid);
}

// ❌ Delete all user data
function deleteAllAntilinkSettings(botId) {
  db.prepare(`DELETE FROM antilink_settings WHERE bot_id = ?`).run(botId);
  db.prepare(`DELETE FROM antilink_warns WHERE bot_id = ?`).run(botId);
}

// ❌ Optional: delete group-specific settings
function deleteAntilinkGroup(botId, groupId) {
  db.prepare(`DELETE FROM antilink_settings WHERE group_id = ? AND bot_id = ?`).run(groupId, botId);
  db.prepare(`DELETE FROM antilink_warns WHERE group_id = ? AND bot_id = ?`).run(groupId, botId);
}

module.exports = {
  getAntilinkSettings,
  setAntilinkSettings,
  incrementWarn,
  resetWarn,
  deleteAllAntilinkSettings,
  deleteAntilinkGroup
};
