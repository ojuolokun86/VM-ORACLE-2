const commandEmojis = {
  // Core Commands
  ping: '🏓',
  settings: '🧰',
  prefix: '🔤',
  mode: '🔄',
  help: '📚',
  menu: '📚',
  info: 'ℹ️',
  restart: '🔄',
  logout: '🚪',

  // Moderation & Security
  antilink: '🧨',
  resetwarn: '🧹',
  warnlist: '📑',
  antidelete: '🕵️‍♂️',
  privacy: '🔐',
  disappear: '⌛',

  // Group Management
  listgroup: '🗂️',
  tag: '🗣️',
  tagall: '📢',
  mute: '🔇',
  unmute: '🔊',
  lockinfo: '🔒',
  unlockinfo: '🔓',
  add: '➕',
  kick: '➖',
  promote: '🆙',
  demote: '🧍',
  poll: '📊',
  'group link': '🔗',
  'group stats': '📈',
  listinactive: '💤',
  requestlist: '📬',
  acceptall: '✅',
  rejectall: '❌',

  // Media & Fun
  sticker: '🖼️',
  stimage: '🖼️',
  stgif: '🖼️',
  ss: '🌐',
  imagine: '🧠',
  song: '🎵',
  play: '▶️',

  // Utilities
  status: '📶',
  vv: '👁️',
  view: '📤',
  online: '👥',
  setprofile: '🧑‍🎨',
  report: '📣',

  // AI
  ai: '🤖',
  gpt: '🧠',
  llama: '🦙',
  mistral: '🌬️',
  deepseek: '🔎'
};

const randomEmojis = ['🤖', '✨', '🎲', '🚀', '💡', '🎯', '🧠', '🎉', '⚙️', '💥'];

function getEmojiForCommand(command) {
  return (
    commandEmojis[command] ||
    randomEmojis[Math.floor(Math.random() * randomEmojis.length)]
  );
}

module.exports = { getEmojiForCommand };
