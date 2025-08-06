const sendToChat = require('../../utils/sendToChat');
const { db } = require('../../database/database');
const { isBotOwner } = require('../../database/database');

module.exports = async function resetWarnCommand(sock, msg, textMsg) {
  const from = msg.key.remoteJid;
  const botId = sock.user?.id?.split(':')[0];
  const botLid = sock.user?.lid?.split(':')[0];
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderId = senderJid.split('@')[0];

  const args = textMsg.trim().split(/\s+/).slice(1);
  const target = args[0];

  if (!isBotOwner(senderId, null, botId, botLid)) {
    return await sendToChat(sock, from, {
      message: '❌ Only the bot owner can reset warnings.'
    });
  }

  if (!msg.key.remoteJid.endsWith('@g.us')) {
  await sendToChat(sock, msg.key.remoteJid, {
    message: '❌ This command can only be used in a group.'
  });
  return;
}


  // Reset ALL in the group
  if (target === 'all') {
    db.prepare(`DELETE FROM antilink_warns WHERE group_id = ? AND bot_id = ?`).run(from, botId);
    return await sendToChat(sock, from, {
      message: '♻️ All warnings for this group have been cleared.'
    });
  }

  // Reset specific user by mention or reply
  let userToReset = null;

  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
    userToReset = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
  } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
    userToReset = msg.message.extendedTextMessage.contextInfo.participant;
  }

  if (!userToReset) {
    return await sendToChat(sock, from, {
      message: '❌ Please mention or reply to the user to reset their warnings.'
    });
  }

  db.prepare(`
    DELETE FROM antilink_warns WHERE group_id = ? AND bot_id = ? AND user_jid = ?
  `).run(from, botId, userToReset);

  await sendToChat(sock, from, {
    message: `✅ Warnings for @${userToReset.split('@')[0]} have been cleared.`,
    mentions: [userToReset]
  });
};
