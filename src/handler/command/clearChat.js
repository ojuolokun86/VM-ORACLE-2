const { isBotOwner } = require('../../database/database');
const { checkIfAdmin } = require('./kick');

/**
 * Clear all messages in a chat
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The WhatsApp socket
 * @param {string} from - The chat ID
 * @param {object} msg - The message object
 */
async function clearChat(sock, from, msg) {
    try {
        console.log('clearChat called');
        const sender = msg.key.participant || msg.key.remoteJid;
        const botId = sock.user.id.split(':')[0].split('@')[0];
        const botLid = sock.user.lid.split(':')[0].split('@')[0];
        const senderId = sender.split(':')[0].split('@')[0];
        if (from.endsWith('@g.us')) {
            console.log('clearChat called for group');
            // Check if the bot is an admin in the group
            const isAdmin = await checkIfAdmin(sock, from, senderId);
            const isBotAdmin = await checkIfAdmin(sock, from, botLid);
            if (!isBotAdmin) {
                console.log('clearChat called for group');
                return await sock.sendMessage(from, {
                    text: "❌ I need to be an admin to clear messages in this group."
                }, { quoted: msg });
            }

            // Check if the sender is an admin
            if (!isAdmin) {
                console.log('clearChat called for group');
                return await sock.sendMessage(from, {
                    text: "❌ You need to be an admin to use this command."
                }, { quoted: msg });
            }
        } else {
            console.log('clearChat called for DM');
            // For DMs, only allow the bot owner
            if (!msg.key.fromMe && !isBotOwner(senderId, botId, botLid)) {
                return await sock.sendMessage(from, {
                    text: "❌ This command can only be used by the bot owner."
                }, { quoted: msg });
            }
        }

        // Clear the chat
        console.log('Clearing chat...');
        await sock.chatModify(
            { 
                clear: {
                    messages: { 
                        clear: true 
                    } 
                } 
            }, 
            from
        );
        console.log('Chat cleared successfully!');
        await sock.sendMessage(from, {
            text: "✅ Chat has been cleared successfully!"
        }, { quoted: msg });

    } catch (error) {
        console.error('Error in clearChat:', error);
        await sock.sendMessage(from, {
            text: "❌ An error occurred while trying to clear the chat."
        }, { quoted: msg });
    }
}

module.exports = {
    clearChat
};