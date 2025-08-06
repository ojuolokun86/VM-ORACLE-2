const sendToChat = require('../../utils/sendToChat');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

let lastTagAllEmoji = null; // Store the last used emoji
const generateTagAllMessage = (groupName, sender, botOwnerName, messageContent, mentions, adminList, emoji, senderJid) => {
    mentions = Array.isArray(mentions) ? mentions : [];
    adminList = Array.isArray(adminList) ? adminList : [];
    const totalMembers = mentions.length;
    const adminIds = adminList.map(id => id.split('@')[0]);

    let text = `🤖 [TAG PROTOCOL INITIATED]\n`;
    text += `────────────────────────────\n`;
    text += `[GROUP]: ${groupName}\n`;
    text += `[REQUESTED BY]: @${senderJid.split('@')[0]}\n`;
    text += `[OWNER]: ${botOwnerName}\n`;
    text += `[MESSAGE]: ${messageContent || 'No message provided'}\n`;
    text += `────────────────────────────\n`;
    text += `[GROUP STATS]\n`;
    text += `• MEMBERS: ${totalMembers}\n`;
    text += `• ADMINS: ${adminList.length}\n`;
    text += `• NON-ADMINS: ${totalMembers - adminList.length}\n`;
    text += `────────────────────────────\n`;
    text += `[MENTION LIST]\n`;
    text += mentions.map(id => {
        const username = id.split('@')[0];
        const isAdmin = adminIds.includes(username);
        return `• ${isAdmin ? '👑' : emoji} @${username}`;
    }).join('\n');
    text += `\n────────────────────────────\n`;
    text += `[SYSTEM]: EXECUTION COMPLETE\n`;
    

    const allMentions = mentions.includes(senderJid) ? mentions : [senderJid, ...mentions];
    return { text, mentions: allMentions };

};

function getNewRandomEmoji() {
  const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
    '😜', '🤪', '😝', '🤑', '🤡', '🤠', '🥳', '😎', '🤓', '🧐', '😏', '😬', '🤭', '🤫', '😛', '😋', '😺', '😹', '😻',
    '😼', '🙈', '🙉', '🙊', '👻', '💩', '👽', '👾', '🤖', '🎃', '😈', '👹', '👺', '🦄', '🐵', '🐒', '🦍', '🐶', '🐱',
    '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🦝', '🦥', '🦦', '🦨', '🦧', '🦩',
    '🦚', '🦜', '🦢', '🦩', '🦦', '🦥', '🦨', '🦧', '🦮', '🐕‍🦺', '🐈‍⬛', '🦴', '🦷', '🦾', '🦿', '🦻', '🧠', '🦷'
  ];
  let emoji;
  do {
    emoji = emojis[Math.floor(Math.random() * emojis.length)];
  } while (emoji === lastTagAllEmoji);
  lastTagAllEmoji = emoji;
  return emoji;
}


/**
 * Main tag command handler.
 */
async function tagCommand(sock, msg, command, args) {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid.endsWith('@g.us')) {
    await sendToChat(sock, remoteJid, { message: '❌ This command only works in groups.' });
    return;
  }

  const groupMetadata = await sock.groupMetadata(remoteJid);
  const participants = groupMetadata.participants.map(p => p.id);
  const adminList = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
  const groupName = groupMetadata.subject;
  const senderName = msg.pushName || 'Unknown';
  const botOwnerName = sock.user?.name || 'BMM';
  const senderJid = msg.key.participant || msg.key.remoteJid;

  let additionalMessage = args.join(' ') || '';

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedType = quoted ? Object.keys(quoted)[0] : null;

  // Extract text if quoted
  if (quotedType === 'conversation') additionalMessage = quoted.conversation;
  else if (quotedType === 'extendedTextMessage') additionalMessage = quoted.extendedTextMessage.text;

  // Media types
  const isMedia = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'voiceMessage'].includes(quotedType);

  // Handle media reply
  if (isMedia && quoted) {
    const mediaMsg = quoted[quotedType];
    const buffer = await downloadMediaMessage(
      { message: { [quotedType]: mediaMsg } },
      'buffer',
      {}
    );

    if (!buffer) {
      await sendToChat(sock, remoteJid, { message: '❌ Failed to download media.', quotedMessage: msg });
      return;
    }

    const mediaType = quotedType.replace('Message', '');
    const caption = command === 'tagall'
      ? generateTagAllMessage(groupName, senderName, botOwnerName, additionalMessage || mediaMsg.caption, participants, adminList, getNewRandomEmoji(), senderJid).text
      : (additionalMessage || mediaMsg.caption || '');

    await sendToChat(sock, remoteJid, {
      media: buffer,
      mediaType,
      caption,
      mentions: participants,
    }, { quotedMessage: msg });

    return;
  }

  // Handle normal text-only tag
  if (command === 'tag') {
    await sendToChat(sock, remoteJid, {
      message: additionalMessage || '📢 Attention everyone!',
      mentions: participants,
      quotedMessage: msg
    });
  } else if (command === 'tagall') {
    const emoji = getNewRandomEmoji();
    const tagAllMsgObj = generateTagAllMessage(
      groupName,
      senderName,
      botOwnerName,
      additionalMessage,
      participants,
      adminList,
      emoji,
      senderJid
    );
    const mentionsWithSender = tagAllMsgObj.mentions.includes(senderJid)
      ? tagAllMsgObj.mentions
      : [senderJid, ...tagAllMsgObj.mentions];

    await sendToChat(sock, remoteJid, {
      message: tagAllMsgObj.text,
      mentions: mentionsWithSender,
      quotedMessage: msg
    });
  } else if (command === 'admin') {
    const admins = groupMetadata.participants.filter(p => p.admin);
    const adminIds = admins.map(p => p.id);
    let adminMsg = `🤖 *BMM BOT* 🤖\n\n👑 *Group Admins in ${groupName}:*\n`;
    adminMsg += admins.map(p => `• 👮 @${p.id.split('@')[0]}`).join('\n');
    adminMsg += `\n\n${additionalMessage ? `📝 ${additionalMessage}\n` : ''}`;

    await sendToChat(sock, remoteJid, {
      message: adminMsg,
      mentions: adminIds,
      quotedMessage: msg
    });
  } else {
    await sendToChat(sock, remoteJid, { message: '❌ Unknown tag command. Use tag, tagall, or admin.' });
  }
}

module.exports = tagCommand;