const sendToChat = require('../../utils/sendToChat');
const { getContextInfo, getForwardedContext } = require('../../utils/contextInfo');
const { version } = require('../../../package.json');

const getMainMenu = (
  ownerName = 'Unknown',
  mode = 'private',
  phoneNumber = 'Unknown',
  prefix = 'Unknown',
  version = 'Unknown',
) => `
🖥️ *SYSTEM CONTROL PANEL INITIALIZED*
━━━━━━━━━━━━━━━━━━━━━━━━━━
> **Operator:** ${ownerName || 'Not Set'}
> **Mode:** ${mode ? mode.toUpperCase() : 'PRIVATE'}
> **System ID:** ${phoneNumber || 'Not Available'}
> **Prefix:** ${prefix || 'Not Set'}
> **Firmware:** v${version || '1.0.0'}
━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 *CORE COMMANDS*
> ping → Check bot responsiveness
> settings → Configure system settings
> prefix → Change command prefix
> mode → Switch system mode
> help → Command manual
> menu → Display system menu
> info → System information
> restart → Reboot system
> logout → Logout session

🛡️ *MODERATION & SECURITY*
> antilink → Block external links
> warnlist → View warnings
> antidelete → Monitor message deletions
> privacy → Configure privacy
> disappear → Enable disappearing messages

📦 *GROUP MANAGEMENT*
> listgroup → List all groups
> tag → Tag a user
> tagall → Mention all members
> mute / unmute → Silence or activate chat
> lockinfo / unlockinfo → Lock or unlock group info
> add / kick → Add or remove members
> promote / demote → Manage roles
> poll → Create a poll
> group link → Fetch invite link
> group stats → Display group stats
> listinactive → View inactive members

🎨 *FUN*
> sticker → Convert image/video to sticker
> stimage → Sticker to image
> stgif → Sticker to GIF
> kill → Kill someone
> hug → Hug someone
> joke → Tell a joke
> fact → Tell a fact
> quote → Tell a quote
> imagine → Generate AI image
> slap → Slap someone
> hug → Hug someone
> kick → Kick someone
> poke → Poke someone
> tick → Tick someone
> shoot → Shoot someone
> feed → Feed someone
> pat → Pat someone
> kill → Kill someone
> kiss → Kiss someone
> laugh → Laugh at someone
> lick → lick someone
> blush → blush at someone
> shrug → shrug at someone
> smile → smile at someone
> stare → stare at someone
> yeet → yeet someone
> cuddle → cuddle someone
> highfive → highfive someone
> facepalm → facepalm someone
> think → think at someone
> pout → pout at someone
> bite → bite someone
> smug → smug at someone
> baka → baka at someone
> translate → Translate text

📁 *MEDIA*
> ss → Take screenshot of a webpage
> imagine → Generate AI image
> song → Download audio
> play → Play music
> video → Download video

🔧 *UTILITIES*
> status → View system uptime
> vv → View once media
> view → View profile info
> online → Show online members
> setprofile → Update profile
> report → Send a report

🤖 *AI* 
> ai → Chat with AI
> gpt → Chat with GPT
> llama → Chat with Meta Llama AI
> mistral → Chat with Mistral AI
> deepseek → Chat with DeepSeek V3 AI

━━━━━━━━━━━━━━━━━━━━━━━━━━
🖥️ *EXECUTION MODE*: Reply with a command to run.
ℹ️ *Use help <command> for command details.*
⚠️ *Root access unlocks advanced privileges.*
━━━━━━━━━━━━━━━━━━━━━━━━━━
Follow us on whatsapp channel click view channel
`;



async function menu(sock, chatId, message,   ownerName, mode, phoneNumber, prefix) {
  const menuText = getMainMenu(
    ownerName, 
    mode, 
    phoneNumber, 
    prefix,
    version, 
     // This comes from the imported package.json
  );
  const contextInfo = {
    ...getContextInfo(),
    ...getForwardedContext()
  };

  const sent = await sock.sendMessage(chatId, {
    text: menuText,
    contextInfo,
    quoted: message
  });

  const menuMsgId = sent.key.id;

  // Listener for user response after menu
  const listener = async (m) => {
    const { execute } = require('../commandHandler');
    const reply = m.messages?.[0];
    if (!reply || reply.key.remoteJid !== chatId) return;

    const quotedId = reply.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (quotedId !== menuMsgId) return;

    const text = reply.message?.conversation || reply.message?.extendedTextMessage?.text || '';
    const input = text.trim().toLowerCase();

    await execute({
      sock,
      msg: reply,
      textMsg: input,
      phoneNumber: null
    });

    sock.ev.off('messages.upsert', listener); // Remove listener after execution
  };

  sock.ev.on('messages.upsert', listener);
}

module.exports = { menu };
