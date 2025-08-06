const sendToChat = require('../../utils/sendToChat');
const { db } = require('../../database/database');

module.exports = async function warnlistCommand(sock, msg) {
  const from = msg.key.remoteJid;
  const botId = sock.user?.id?.split(':')[0]?.split('@')[0];

  if (!msg.key.remoteJid.endsWith('@g.us')) {
  await sendToChat(sock, msg.key.remoteJid, {
    message: '❌ This command can only be used in a group.'
  });
  return;
}

  const warns = db.prepare(`
    SELECT user_jid, warn_count, reasons FROM antilink_warns
    WHERE group_id = ? AND bot_id = ?
    ORDER BY warn_count DESC
  `).all(from, botId);

  if (!warns.length) {
    return await sendToChat(sock, from, { message: '✅ No warnings in this group.' });
  }

  const lines = warns.map((w, i) => {
    const jidShort = w.user_jid.split('@')[0];
    const mention = `@${jidShort}`;
    const reasonLines = w.reasons ? `\n${w.reasons}` : '';
    return `${i + 1}. ${mention} – ${w.warn_count} warning(s)${reasonLines}`;
  });

  await sendToChat(sock, from, {
    message: `⚠️ *Warning List*\n\n${lines.join('\n\n')}`,
    mentions: warns.map(w => w.user_jid)
  });
};
