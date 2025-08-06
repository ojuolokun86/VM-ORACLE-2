const { execute } = require('./commandHandler');
const detectAndAct = require('./features/detectAndAct');
const { getUserPrefix } = require('../database/database');
const  handleIncomingForAntidelete = require('../handler/features/saveAntideleteMessage');
const handleDeletedMessage  = require('./features/antideleteListener');
const { handleStatusUpdate } = require('./features/statusView');
const { incrementGroupUserStat } = require('./features/groupStats');
const globalStore = require('../utils/globalStore');
const sendToChat = require('../utils/sendToChat');
async function handleIncomingMessage({ authId, sock, msg, phoneNumber }) {
  let from;
  let botId; 
  try {
  const message = msg?.message;
  from = msg?.key?.remoteJid;
  const sender = msg?.key?.participant || msg?.key?.remoteJid;
  const receivedFrom = msg?.key?.fromMe ? phoneNumber : from;
  const textMsg = message?.conversation || message?.extendedTextMessage?.text || '';
  const botId = sock.user.id.split(':')[0]?.split('@')[0];
  const botLid = sock.user.lid.split(':')[0]?.split('@')[0];
  const botPhoneNumber = botId && botLid;
  console.log(`[MSG] User: ${sender} | Bot: ${botId} | Chat: ${from}`);  
  // Only increment for group messages with a participant
if (msg.key?.remoteJid?.endsWith('@g.us') && msg.key?.participant) {
  const groupId = msg.key.remoteJid;
  const userId = msg.key.participant.split('@')[0];
  const name = msg.pushName || userId;
  const messageId = msg.key.id;
  await incrementGroupUserStat(groupId, userId, name, messageId);
}
  //console.log(`Received message from ${sender} in ${from}`, message);
  if (!message || !from) return;
  //console.log(`📥 Incoming message from ${sender} in ${from}: to ${receivedFrom}`, message);
  await handleDeletedMessage(sock, msg); // <- important
  await handleIncomingForAntidelete(sock, msg);
  await handleStatusUpdate(sock, msg, botId); // Handle status updates
  if (await detectAndAct({ sock, from, msg, textMsg })) return;
  const presenceType =
  (globalStore.presenceTypeStore[botId] && globalStore.presenceTypeStore[botId] || 'paused');
  await sock.sendPresenceUpdate(presenceType, from);
  // ⚙️ Check for command
  const userPrefix = await getUserPrefix(botId);
  if (textMsg.startsWith(userPrefix)) {
    await execute({ authId, sock, msg, textMsg, phoneNumber: botPhoneNumber });
  }
}
catch (err) {
  await sendToChat(sock, from, {
    message: '❌ Message handler error: ' + err + 'Please use report command with the error message to report this issue.'
  });
  console.error(`[ERROR] Message handler failed!`, {
    error: err,
    msg: msg,
    botId: botId
  });
}
}
module.exports = handleIncomingMessage;

