const { getUserMode, getUserPrefix, getUserStatusViewMode, getReactToCommand, followedTeams } = require('../database/database');
const { getAntilinkSettings } = require('../database/antilinkDb');
const { getAntideleteMode, isGroupExcluded, shouldForwardToOwner } = require('../database/antideleteDb');
const { getWelcomeSettings } = require('../database/welcomeDb')
const { getSubscriptionInfo } = require('../database/supabaseDb');
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../database/sessions.db');
const db = new Database(dbPath);
const { version } = require('../../package.json');

async function getUserSettings(authId, userId, groupId = null) {
  const mode = getUserMode(userId);
  const prefix = getUserPrefix(userId);
  const statusView = getUserStatusViewMode(userId);
  const commandReact = getReactToCommand(userId);
  const userFollowedTeams = followedTeams(userId);
  const row = db.prepare('SELECT user_name, user_lid FROM users WHERE user_id = ?').get(userId);

  let antilink = null;
  let antidelete = null;
  let welcomeSettings = null;
  let subscription_level, daysLeft;
  
  try {
    const subscription = await getSubscriptionInfo(authId);
    subscription_level = subscription?.subscription_level;
    daysLeft = subscription?.daysLeft;
  } catch (error) {
    console.error('Error getting subscription info:', error);
    subscription_level = undefined;
    daysLeft = undefined;
  }
  
  const botVersion = version;
  if (groupId) {
    antilink = getAntilinkSettings(groupId, userId);
    antidelete = {
      mode: getAntideleteMode(userId),
      sendToOwner: shouldForwardToOwner(userId),
      excluded: isGroupExcluded(userId, groupId)
    };
   welcomeSettings = getWelcomeSettings(groupId, userId); // <-- add this
  } else {
    // Global settings (botId as both groupId and userId)
    antilink = getAntilinkSettings(userId, userId); // optional, if you want global antilink
    antidelete = {
      mode: getAntideleteMode(userId),
      sendToOwner: shouldForwardToOwner(userId),
      excluded: false // global can't be excluded
    };
     welcomeSettings = { welcome: false, goodbye: false };
  }

  return {
    mode,
    prefix,
    statusView,
    ownerName: row ? row.user_name : '',
    botLid: row ? row.user_lid : '',
    antilink,
    antidelete,
    welcomeSettings,
    commandReact,
    userFollowedTeams,
    subscription_level,
    daysLeft,
    authId,
    botVersion
  };
}

module.exports = { getUserSettings };
