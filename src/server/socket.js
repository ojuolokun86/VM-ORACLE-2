const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const { getBotInstanceCount } = require('../utils/globalStore');

let io;
const clients = new Map(); // Map<socket.id, { authId, phoneNumber }>
//const LM_URL =  'http://localhost:4000';
const LM_URL = process.env.LM_URL || 'http://localhost:4000';
const lmSocket = ioClient(LM_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true
});

lmSocket.on('connect', () => {
  console.log('✅ Connected to LM at', LM_URL);
});

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*', // Adjust for production
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    //console.log('🔌 Socket.IO client connected:', socket.id);
    function emitServerStatus() {
      const load = getBotInstanceCount();
      console.log(load) // Or however you track active sessions
      if (lmSocket && lmSocket.connected) {
        lmSocket.emit('status', { load });
      }
    }
    
    // Expect client to send authId and phoneNumber after connecting
    socket.on('register-bot-session', ({ authId, phoneNumber }) => {
      clients.set(socket.id, { authId, phoneNumber });
      socket.join(`${authId}:${phoneNumber}`); // Join a room for this bot instance
      //console.log(`🟢 Registered bot session: authId=${authId}, phoneNumber=${phoneNumber}, socket=${socket.id}`);
    });

    socket.on('disconnect', () => {
      clients.delete(socket.id);
      //console.log('🔌 Socket.IO client disconnected:', socket.id);
    });
  });
}

// Instead of emitting locally, emit to LM:
function emitToBot(authId, phoneNumber, event, payload) {
  if (lmSocket && lmSocket.connected) {
    lmSocket.emit('backend-event', { authId, phoneNumber, event, payload });
    //console.log(`[BACKEND] Emitting to LM: event=${event}, authId=${authId}, phoneNumber=${phoneNumber}, payload=`, payload);
  }
}

module.exports = { initializeSocket, emitToBot };