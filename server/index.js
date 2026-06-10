const express  = require('express');
const http     = require('http');
const socketio = require('socket.io');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
require('dotenv').config();

const db          = require('./db');
const authRoutes  = require('./routes/auth');
const roomRoutes  = require('./routes/rooms');
const roleRoutes  = require('./routes/roles');
const ownerRoutes = require('./routes/owner');
const usersRoutes = require('./routes/users');
const { router: pointsRouter, addPoints, POINTS_PER_MESSAGE } = require('./routes/points');

const app    = express();
const server = http.createServer(app);
const io     = socketio(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api/auth',   authRoutes);
app.use('/api/rooms',  roomRoutes);
app.use('/api/roles',  roleRoutes);
app.use('/api/owner',  ownerRoutes);
app.use('/api/users',  usersRoutes);
app.use('/api/points', pointsRouter);
app.use(express.static('public'));

app.get('/', (req, res) => res.send('WidBid Server Running ✅'));

/* ════════════════════════════════════════════════
   أدوات مساعدة
════════════════════════════════════════════════ */

// قراءة رتبة المستخدم من DB
async function getUserRank(userId) {
  if (!userId) return 100;
  try {
    const [rows] = await db.query(
      'SELECT rank FROM users WHERE id = ?', [userId]
    );
    return rows.length ? (rows[0].rank || 100) : 100;
  } catch { return 100; }
}

// قراءة إعدادات الغرفة (بانر + ثيم)
async function getRoomInfo(roomId) {
  try {
    const [rows] = await db.query(
      'SELECT welcome_message, theme FROM rooms WHERE id = ?', [roomId]
    );
    return rows.length ? rows[0] : { welcome_message: 'مرحباً بكم', theme: 'candy' };
  } catch { return { welcome_message: 'مرحباً بكم', theme: 'candy' }; }
}

// بناء قائمة المتواجدين مع الرتبة والحالة
async function buildOnlineUsers(roomId) {
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.map(s => ({
    username: s.userData?.username || s.username || '?',
    rank:     s.userData?.rank     || 100,
    status:   s.userData?.status   || 'available',
    isMuted:  s.userData?.isMuted  || false,
  })).filter(u => u.username !== '?');
}

// التحقق من صلاحية تنفيذ إجراء على هدف
function canActOn(actorRank, targetRank, minActorRank = 500) {
  return actorRank >= minActorRank && actorRank > targetRank;
}

/* ════════════════════════════════════════════════
   الألعاب
════════════════════════════════════════════════ */
const games = {};

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

/* ════════════════════════════════════════════════
   Socket.io
════════════════════════════════════════════════ */
io.on('connection', (socket) => {
  console.log(`🔌 connected: ${socket.id}`);

  /* ─── دخول الغرفة ─────────────────────────── */
  socket.on('joinRoom', async (data) => {
    const { room_id, username, user_id, rank } = data;
    if (!room_id || !username) return;

    socket.join(room_id);

    // تحميل الرتبة من DB إذا كان المستخدم مسجلاً
    const dbRank = user_id ? await getUserRank(user_id) : (rank || 100);

    // تخزين بيانات المستخدم على الـ socket
    socket.userData = {
      username,
      user_id: user_id || null,
      rank:    dbRank,
      room_id,
      status:  'available',
      isMuted: false,
      isMicOn: false,
    };
    socket.username = username;
    socket.room_id  = room_id;

    // إرسال إعدادات الغرفة (بانر + ثيم)
    const roomInfo = await getRoomInfo(room_id);
    socket.emit('roomInfo', roomInfo);

    // سجل الرسائل (آخر 50 رسالة مع الرتبة)
    const [messages] = await db.query(`
      SELECT m.content, m.created_at, u.username, u.rank
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.room_id = ?
      ORDER BY m.created_at DESC LIMIT 50
    `, [room_id]);
    socket.emit('messageHistory', messages.reverse());

    // إبلاغ الجميع بالدخول
    io.to(room_id).emit('userJoined', { username, rank: dbRank });

    // تحديث قائمة المتواجدين
    const users = await buildOnlineUsers(room_id);
    io.to(room_id).emit('onlineUsers', users);

    console.log(`👤 ${username} (rank:${dbRank}) joined room ${room_id}`);
  });

  /* ─── إرسال رسالة ─────────────────────────── */
  socket.on('sendMessage', async (data) => {
    const { room_id, user_id, message, username, rank } = data;
    if (!message?.trim() || !room_id) return;

    // فحص الكتم
    if (socket.userData?.isMuted) {
      socket.emit('error', 'أنت مكتوم ولا يمكنك الكتابة');
      return;
    }

    const senderRank = socket.userData?.rank || rank || 100;

    try {
      if (user_id) {
        await db.query(
          'INSERT INTO messages (room_id, sender_id, content) VALUES (?, ?, ?)',
          [room_id, user_id, message]
        );
        await addPoints(user_id, POINTS_PER_MESSAGE, 'Message sent');
      }

      io.to(room_id).emit('newMessage', {
        username: username || socket.userData?.username,
        message,
        rank: senderRank,
        room_id,
        time: new Date().toISOString(),
      });
    } catch (err) {
      console.error('❌ sendMessage:', err.message);
    }
  });

  /* ─── مغادرة الغرفة ───────────────────────── */
  socket.on('leaveRoom', async (data) => {
    const { room_id, username } = data;
    socket.leave(room_id);
    io.to(room_id).emit('userLeft', { username });
    const users = await buildOnlineUsers(room_id);
    io.to(room_id).emit('onlineUsers', users);
  });

  /* ─── تغيير الحالة ────────────────────────── */
  socket.on('setStatus', async (data) => {
    const { room_id, username, status } = data;
    if (!socket.userData) return;
    socket.userData.status = status;
    io.to(room_id).emit('statusChanged', { username, status });
  });

  /* ─── المايك ──────────────────────────────── */
  socket.on('micOn', async (data) => {
    if (!socket.userData) return;
    socket.userData.isMicOn = true;
    io.to(data.room_id).emit('micOn', { username: data.username });
  });

  socket.on('micOff', async (data) => {
    if (!socket.userData) return;
    socket.userData.isMicOn = false;
    io.to(data.room_id).emit('micOff', { username: data.username });
  });

  /* ─── رفع اليد ────────────────────────────── */
  socket.on('raiseHand', (data) => {
    const { room_id, username } = data;
    // إبلاغ المشرفين فقط (Admin 500+)
    io.to(room_id).emit('raiseHand', { username });
  });

  /* ─── كتم مستخدم ──────────────────────────── */
  socket.on('muteUser', async (data) => {
    const { room_id, target, by } = data;
    const actorRank = socket.userData?.rank || 100;

    // تحقق من الصلاحية
    if (actorRank < 500) {
      socket.emit('error', 'ليس لديك صلاحية الكتم');
      return;
    }

    // إيجاد socket الهدف
    const roomSockets = await io.in(room_id).fetchSockets();
    const targetSocket = roomSockets.find(s => s.userData?.username === target);

    if (!targetSocket) { socket.emit('error', 'المستخدم غير موجود'); return; }

    const targetRank = targetSocket.userData?.rank || 100;
    if (!canActOn(actorRank, targetRank)) {
      socket.emit('error', 'لا يمكنك كتم شخص برتبة أعلى أو مساوية لك');
      return;
    }

    targetSocket.userData.isMuted = true;
    targetSocket.emit('youAreMuted', { by });
    io.to(room_id).emit('userMuted', { username: target, by });
    console.log(`🔇 ${by} muted ${target} in room ${room_id}`);
  });

  /* ─── فك الكتم ────────────────────────────── */
  socket.on('unmuteUser', async (data) => {
    const { room_id, target, by } = data;
    const actorRank = socket.userData?.rank || 100;
    if (actorRank < 500) { socket.emit('error', 'ليس لديك صلاحية'); return; }

    const roomSockets = await io.in(room_id).fetchSockets();
    const targetSocket = roomSockets.find(s => s.userData?.username === target);
    if (!targetSocket) return;

    targetSocket.userData.isMuted = false;
    targetSocket.emit('youAreUnmuted', { by });
    io.to(room_id).emit('userUnmuted', { username: target, by });
  });

  /* ─── طرد مستخدم ──────────────────────────── */
  socket.on('kickUser', async (data) => {
    const { room_id, target, by } = data;
    const actorRank = socket.userData?.rank || 100;

    if (actorRank < 500) {
      socket.emit('error', 'ليس لديك صلاحية الطرد');
      return;
    }

    const roomSockets = await io.in(room_id).fetchSockets();
    const targetSocket = roomSockets.find(s => s.userData?.username === target);
    if (!targetSocket) { socket.emit('error', 'المستخدم غير موجود'); return; }

    const targetRank = targetSocket.userData?.rank || 100;
    if (!canActOn(actorRank, targetRank)) {
      socket.emit('error', 'لا يمكنك طرد شخص برتبة أعلى أو مساوية لك');
      return;
    }

    targetSocket.emit('youAreKicked', { by });
    targetSocket.leave(room_id);
    io.to(room_id).emit('userKicked', { username: target, by });

    const users = await buildOnlineUsers(room_id);
    io.to(room_id).emit('onlineUsers', users);
    console.log(`🚪 ${by} kicked ${target} from room ${room_id}`);
  });

  /* ─── مسح الشات ───────────────────────────── */
  socket.on('clearChat', (data) => {
    const { room_id, by } = data;
    const actorRank = socket.userData?.rank || 100;
    if (actorRank < 500) { socket.emit('error', 'ليس لديك صلاحية مسح الشات'); return; }
    io.to(room_id).emit('chatCleared', { by });
    console.log(`🗑️ ${by} cleared chat in room ${room_id}`);
  });

  /* ─── تغيير ثيم الغرفة (Root 900+) ────────── */
  socket.on('setTheme', async (data) => {
    const { room_id, theme, by } = data;
    const actorRank = socket.userData?.rank || 100;
    if (actorRank < 900) { socket.emit('error', 'ليس لديك صلاحية تغيير الثيم'); return; }

    const validThemes = ['candy','ocean','flower','night','neutral'];
    if (!validThemes.includes(theme)) { socket.emit('error', 'ثيم غير صحيح'); return; }

    try {
      await db.query('UPDATE rooms SET theme = ? WHERE id = ?', [theme, room_id]);
      io.to(room_id).emit('themeChanged', { theme, by });
    } catch (err) { console.error('setTheme:', err.message); }
  });

  /* ─── تغيير بانر الترحيب (Master 700+) ────── */
  socket.on('setWelcome', async (data) => {
    const { room_id, message, by } = data;
    const actorRank = socket.userData?.rank || 100;
    if (actorRank < 700) { socket.emit('error', 'ليس لديك صلاحية تغيير البانر'); return; }

    try {
      await db.query(
        'UPDATE rooms SET welcome_message = ? WHERE id = ?',
        [message, room_id]
      );
      io.to(room_id).emit('welcomeUpdated', { message, by });
    } catch (err) { console.error('setWelcome:', err.message); }
  });

  /* ─── تبليغ عن الغرفة ─────────────────────── */
  socket.on('reportRoom', async (data) => {
    const { room_id, by } = data;
    try {
      await db.query(
        'INSERT INTO reports (room_id, reported_by, reason) VALUES (?, ?, ?)',
        [room_id, socket.userData?.user_id || null, 'User report']
      );
      socket.emit('reportSent', { ok: true });
      console.log(`🚨 Room ${room_id} reported by ${by}`);
    } catch (err) {
      // جدول التبليغات قد لا يكون موجوداً بعد — نسجل فقط
      console.log(`🚨 Report (no table yet): room ${room_id} by ${by}`);
      socket.emit('reportSent', { ok: true });
    }
  });

  /* ─── الألعاب (بدون تغيير) ────────────────── */
  socket.on('joinGame', async (data) => {
    const gameRoom = `game_${data.room_id}_${data.game}`;
    socket.join(gameRoom);
    socket.gameRoom = gameRoom;
    socket.gameUsername = data.username;

    if (!games[gameRoom]) {
      games[gameRoom] = { players:[], board:Array(9).fill(''), active:false, turn:'X' };
    }
    const game = games[gameRoom];
    if (game.players.length < 2 && !game.players.includes(data.username)) {
      game.players.push(data.username);
    }
    if (game.players.length === 2 && !game.active) {
      game.active = true;
      game.board  = Array(9).fill('');
      game.turn   = 'X';
      const sockets = await io.in(gameRoom).fetchSockets();
      sockets.forEach(s => {
        const isFirst = s.gameUsername === game.players[0];
        s.emit('gameStart', {
          playerX: game.players[0],
          playerO: game.players[1],
          symbol:  isFirst ? 'X' : 'O',
        });
      });
    }
  });

  socket.on('gameMove', (data) => {
    const gameRoom = `game_${data.room_id}_${data.game}`;
    const game = games[gameRoom];
    if (!game || !game.active || game.board[data.index] !== '' || data.symbol !== game.turn) return;

    game.board[data.index] = data.symbol;
    const nextTurn = data.symbol === 'X' ? 'O' : 'X';
    game.turn = nextTurn;
    io.to(gameRoom).emit('gameMove', { index:data.index, symbol:data.symbol, nextTurn });

    const winner = checkWinner(game.board);
    if (winner) {
      io.to(gameRoom).emit('gameOver', { winner });
      game.active = false;
    } else if (!game.board.includes('')) {
      io.to(gameRoom).emit('gameOver', { winner:'draw' });
      game.active = false;
    }
  });

  socket.on('restartGame', (data) => {
    const gameRoom = `game_${data.room_id}_${data.game}`;
    if (!games[gameRoom]) return;
    games[gameRoom].board  = Array(9).fill('');
    games[gameRoom].active = true;
    games[gameRoom].turn   = 'X';
    io.to(gameRoom).emit('gameStart', {
      playerX: games[gameRoom].players[0],
      playerO: games[gameRoom].players[1],
      symbol:  'X',
    });
  });

  /* ─── قطع الاتصال ─────────────────────────── */
  socket.on('disconnect', async () => {
    console.log(`❌ disconnected: ${socket.id}`);

    const room_id = socket.userData?.room_id || socket.room_id;
    const username = socket.userData?.username || socket.username;

    if (room_id && username) {
      io.to(room_id).emit('userLeft', { username });
      const users = await buildOnlineUsers(room_id);
      io.to(room_id).emit('onlineUsers', users);
    }

    if (socket.gameRoom) {
      io.to(socket.gameRoom).emit('playerLeft');
      delete games[socket.gameRoom];
    }
  });
});

/* ════════════════════════════════════════════════
   تشغيل السيرفر
════════════════════════════════════════════════ */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 WidBid Server on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🗄️  Database: ${process.env.DB_NAME}`);
});