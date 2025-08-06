// src/commands/commandRegistry.js
const { version } = require('../../../package.json');
const { description } = require('./report');

const commandRegistry = {
    // Bot Control
    'restart': {
        description: 'Restart the bot',
        usage: 'restart',
        category: 'Bot Control',
        ownerOnly: true
    },
    'status': {
        description: 'Configure status viewing and reactions',
        usage: 'status',
        category: 'Bot Control'
    },
    'ping': {
        description: 'Check bot response time',
        usage: 'ping',
        category: 'Bot Control'
    },
    'logout': {
        description: 'Log out from bot system and clear all session ',
        usage: 'logout',
        category: 'Bot Control',
        ownerOnly: true
    },
    // Group Management
    'group': {
        description: 'Group management commands',
        usage: 'group [option]',
        category: 'Group',
        adminOnly: true
    },
    'kick': {
        description: 'Kick a user, all members, or inactive members',
        usage: 'kick @user | kick members | kick inactive',
        category: 'Group',
        adminOnly: true
    },
    'promote': {
        description: 'Promote a user to admin',
        usage: 'promote @user',
        category: 'Group',
        adminOnly: true
    },
    'demote': {
        description: 'Demote a user from admin',
        usage: 'demote @user',
        category: 'Group',
        adminOnly: true
    },
    'listgroup': {
        description: 'List all groups the bot is in',
        usage: 'listgroup',
        category: 'Group',
        ownerOnly: true
    },
    'mute': {
        description: 'Mute group (announcement only)',
        usage: 'mute',
        category: 'Group',
        adminOnly: true
    },
    'unmute': {
        description: 'Unmute group (allow all members)',
        usage: 'unmute',
        category: 'Group',
        adminOnly: true
    },
    'lockinfo': {
        description: 'Lock group info (admins only)',
        usage: 'lockinfo',
        category: 'Group',
        adminOnly: true
    },
    'unlockinfo': {
        description: 'Unlock group info (all members)',
        usage: 'unlockinfo',
        category: 'Group',
        adminOnly: true
    },
    'add': {
        description: 'Add a user to the group',
        usage: 'add <number>',
        category: 'Group',
        adminOnly: true
    },
    'requestlist': {
        description: 'List pending group join requests',
        usage: 'requestlist',
        category: 'Group',
        adminOnly: true
    },
    'acceptall': {
        description: 'Accept all pending join requests',
        usage: 'acceptall',
        category: 'Group',
        adminOnly: true
    },
    'rejectall': {
        description: 'Reject all pending join requests',
        usage: 'rejectall',
        category: 'Group',
        adminOnly: true
    },
    'tag': {
        description: 'Mention all group members',
        usage: 'tag [message]',
        category: 'Group',
        adminOnly: true
    },
    'tagall': {
        description: 'Mention all group members with stats',
        usage: 'tagall [message]',
        category: 'Group',
        adminOnly: true
    },
    'admin': {
        description: 'Mention all group admins',
        usage: 'admin [message]',
        category: 'Group',
        adminOnly: true
    },
    'listinactive': {
        description: 'List inactive members (no message in 30 days)',
        usage: 'listinactive',
        category: 'Group',
        adminOnly: true
    },

    // Anti-Delete & Moderation
    'antidelete': {
        description: 'Toggle anti-delete feature',
        usage: 'antidelete [on/off]',
        category: 'Moderation',
        adminOnly: true
    },
    'antilink': {
        description: 'Configure anti-link protection',
        usage: 'antilink',
        category: 'Moderation',
        adminOnly: true
    },
    'resetwarn': {
        description: 'Reset warnings for a user or all',
        usage: 'resetwarn @user | resetwarn all',
        category: 'Moderation',
        ownerOnly: true
    },
    'warnlist': {
        description: 'Show warning list for group',
        usage: 'warnlist',
        category: 'Moderation',
        adminOnly: true
    },
    'listwarn': {
        description: 'Alias for warnlist',
        usage: 'listwarn',
        category: 'Moderation',
        adminOnly: true
    },

    // Welcome
    'welcome': {
        description: 'Configure welcome/goodbye messages',
        usage: 'welcome',
        category: 'Features',
        adminOnly: true
    },

    // Media
    'sticker': {
        description: 'Create sticker from image/video/GIF',
        usage: 'sticker (reply to image/video/GIF)',
        category: 'Media'
    },
    'stimage': {
        description: 'Convert sticker to image',
        usage: 'stimage (reply to sticker)',
        category: 'Media'
    },
    'sttoimg': {
        description: 'Alias for stimage',
        usage: 'sttoimg (reply to sticker)',
        category: 'Media'
    },
    'stgif': {
        description: 'Convert animated sticker to GIF',
        usage: 'stgif (reply to animated sticker)',
        category: 'Media'
    },
    'ss': {
        description: 'Take a screenshot of a website',
        usage: 'ss [url]',
        category: 'Media'
    },
    'ssweb': {
        description: 'Alias for ss',
        usage: 'ssweb [url]',
        category: 'Media'
    },
    'screenshot': {
        description: 'Alias for ss',
        usage: 'screenshot [url]',
        category: 'Media'
    },
    // Poll
    'poll': {
        description: 'Create a poll',
        usage: 'poll <question> | <option1> | <option2> ...',
        category: 'Utilities',
        adminOnly: true
    },

    // Privacy & Settings
    'privacy': {
        description: 'Configure privacy settings',
        usage: 'privacy',
        category: 'Settings',
        ownerOnly: true
    },
    'setprofile': {
        description: 'Bot profile settings (name, pic, bio, blocklist)',
        usage: 'setprofile',
        category: 'Settings',
        ownerOnly: true
    },
    'disappear': {
        description: 'Configure disappearing messages',
        usage: 'disappear',
        category: 'Settings',
        ownerOnly: true
    },
    'disappearing': {
        description: 'Alias for disappear',
        usage: 'disappearing',
        category: 'Settings',
        ownerOnly: true
    },
    'mode': {
        description: 'Set bot mode (public/private/admin)',
        usage: 'mode [public|private|admin]',
        category: 'Settings',
        ownerOnly: true
    },
    'prefix': {
        description: 'Set bot command prefix',
        usage: 'prefix <new_prefix>',
        category: 'Settings',
        ownerOnly: true
    },
    'settings': {
        description: 'Show bot settings',
        usage: 'settings',
        category: 'Settings',
        ownerOnly: true
    },

    // Utilities
    'help': {
        description: 'Show help information',
        usage: 'help [command]',
        category: 'Utilities'
    },
    'h': {
        description: 'Alias for help',
        usage: 'h [command]',
        category: 'Utilities'
    },
    'ajuda': {
        description: 'Alias for help',
        usage: 'ajuda [command]',
        category: 'Utilities'
    },
    'menu': {
        description: 'Show command menu',
        usage: 'menu',
        category: 'Utilities'
    },
    'info': {
        description: 'Show bot/server/system info',
        usage: 'info',
        category: 'Utilities'
    },
    'report': {
        description: 'Report an issue to the developers',
        usage: 'report [your message]',
        category: 'Utilities'
    },
    'react': {
        description: 'Toggle command reaction (emoji)',
        usage: 'react on/off',
        category: 'Utilities',
        ownerOnly: true
    },
    'online': {
        description: 'Configure bot presence (online/typing/recording)',
        usage: 'online',
        category: 'Utilities',
        ownerOnly: true
    },

    // Status & View Once
    'vv': {
        description: 'Repost view-once media to chat',
        usage: 'vv (reply to view-once media)',
        category: 'Utilities'
    },
    'view': {
        description: 'Send view-once media to your DM',
        usage: 'view (reply to view-once media)',
        category: 'Utilities'
    },

    // Fun 
    'imagine': {
        description: 'Generate an AI image from a prompt',
        usage: 'imagine <prompt>',
        category: 'Fun'
    },
    'echo': {
        description: 'Echo back your message',
        usage: 'echo <text>',
        category: 'Fun'
    },


    // AI
   // In your commandRegistry object, add:
    'gpt': {
    description: 'Chat with GPT-3.5 AI',
    usage: 'gpt <your message>',
    category: 'AI',
    aliases: ['ai']
},
'llama': {
    description: 'Chat with Meta Llama AI',
    usage: 'llama <your message>',
    category: 'AI'
},
'mistral': {
    description: 'Chat with Mistral AI',
    usage: 'mistral <your message>',
    category: 'AI'
},
'deepseek': {
    description: 'Chat with DeepSeek V3 AI',
    usage: 'deepseek <your message>',
    category: 'AI',
    aliases: ['ds']
},

'video': {
    description: 'Download video from url',
    usage: 'video <url>',
    category: 'Media'
},
'play': {
    description: 'Play a song from YouTube',
    usage: 'play [song name]',
    category: 'Media'
},
'song': {
    description: 'Download a song from YouTube',
    usage: 'song [song name or link]',
    category: 'Media'
},

    // Fun 
    'imagine': {
        description: 'Generate an AI image from a prompt',
        usage: 'imagine <prompt>',
        category: 'Fun'
    },
    'echo': {
        description: 'Echo back your message',
        usage: 'echo <text>',
        category: 'Fun'
    },
    'quote': {
        description: 'Get a random inspirational quote',
        usage: 'quote',
        category: 'Fun'
    },
    'joke': {
        description: 'Get a random joke',
        usage: 'joke',
        category: 'Fun'
    },
    'translate': {
        description: 'Translate text to another language',
        usage: 'translate <lang_code> <text>',
        category: 'Fun'
    },
    // Fun action commands (GIFs)
    'slap': { description: 'Slap someone with a GIF', usage: 'slap [@user]', category: 'Fun' },
    'hug': { description: 'Hug someone with a GIF', usage: 'hug [@user]', category: 'Fun' },
    'kick': { description: 'Kick someone with a GIF', usage: 'kick [@user]', category: 'Fun' },
    'poke': { description: 'Poke someone with a GIF', usage: 'poke [@user]', category: 'Fun' },
    'tickle': { description: 'Tickle someone with a GIF', usage: 'tickle [@user]', category: 'Fun' },
    'cry': { description: 'Show a crying GIF', usage: 'cry', category: 'Fun' },
    'pat': { description: 'Pat someone with a GIF', usage: 'pat [@user]', category: 'Fun' },
    'kiss': { description: 'Kiss someone with a GIF', usage: 'kiss [@user]', category: 'Fun' },
    'wave': { description: 'Wave with a GIF', usage: 'wave', category: 'Fun' },
    'blush': { description: 'Show a blushing GIF', usage: 'blush', category: 'Fun' },
    'shrug': { description: 'Shrug with a GIF', usage: 'shrug', category: 'Fun' },
    'smile': { description: 'Show a smiling GIF', usage: 'smile', category: 'Fun' },
    'laugh': { description: 'Show a laughing GIF', usage: 'laugh', category: 'Fun' },
    'lick': { description: 'Lick someone with a GIF', usage: 'lick [@user]', category: 'Fun' },
    'bored': { description: 'Show a bored GIF', usage: 'bored', category: 'Fun' },
    'stare': { description: 'Stare with a GIF', usage: 'stare [@user]', category: 'Fun' },
    'yeet': { description: 'Yeet with a GIF', usage: 'yeet [@user]', category: 'Fun' },
    'feed': { description: 'Feed someone with a GIF', usage: 'feed [@user]', category: 'Fun' },
    'dance': { description: 'Show a dancing GIF', usage: 'dance', category: 'Fun' },
    'cuddle': { description: 'Cuddle with someone with a GIF', usage: 'cuddle [@user]', category: 'Fun' },
    'highfive': { description: 'High five with a GIF', usage: 'highfive [@user]', category: 'Fun' },
    'facepalm': { description: 'Show a facepalm GIF', usage: 'facepalm', category: 'Fun' },
    'thumbsup': { description: 'Show a thumbs up GIF', usage: 'thumbsup', category: 'Fun' },
    'think': { description: 'Show a thinking GIF', usage: 'think', category: 'Fun' },
    'shoot': { description: 'Shoot with a GIF', usage: 'shoot [@user]', category: 'Fun' },
    'pout': { description: 'Show a pouting GIF', usage: 'pout', category: 'Fun' },
    'bite': { description: 'Bite someone with a GIF', usage: 'bite [@user]', category: 'Fun' },
    'smug': { description: 'Show a smug GIF', usage: 'smug', category: 'Fun' },
    'baka': { description: 'Call someone baka with a GIF', usage: 'baka [@user]', category: 'Fun' },

};

// Add aliases
commandRegistry.h = commandRegistry.help;
commandRegistry.ajuda = commandRegistry.help;


// Group commands by category
const commandsByCategory = {};
Object.entries(commandRegistry).forEach(([cmd, info]) => {
    if (!commandsByCategory[info.category]) {
        commandsByCategory[info.category] = [];
    }
    commandsByCategory[info.category].push({name: cmd, ...info});
});

module.exports = { commandRegistry, commandsByCategory, version };