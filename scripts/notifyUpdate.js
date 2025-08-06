// scripts/notifyUpdate.js
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');

// Use absolute path to the project root
const NOTIFICATION_FILE = path.join(process.cwd(), '.update-notification');

// Create a notification file
const notification = {
    version,
    timestamp: Date.now(),
    message: '🚀 Bot has been updated!'
};

fs.writeFileSync(NOTIFICATION_FILE, JSON.stringify(notification, null, 2));
console.log('📝 Update notification queued:', notification);