const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const roleRoutes = require('./routes/roles');
const ownerRoutes = require('./routes/owner');
const usersRoutes = require('./routes/users');
const { router: pointsRouter, addPoints, POINTS_PER_MESSAGE } = require('./routes/points');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/points', pointsRouter);
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('WidBid Server is running');
});

const games = {};

// 🛠️ إصلاح مصفوفة فحص الفوز بشكل كامل لتعمل اللعبة برمجياً بشكل صحيح
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // أسطر أفقية
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // أعمدة رأسية
    [0, 4, 8], [2, 4, 6]             // أوتار قطرية
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('User connected: ' + socket.id);

  socket.on('joinRoom', async (data) => {
    socket.join(data.room_id);
    socket.username = data.username;
    socket.room_id = data.room_id;

    const [messages] = await db.query(
      'SELECT messages.content, users.username FROM messages JOIN users ON messages.sender_id = users.id WHERE messages.room_id = ? ORDER BY messages.created_at DESC LIMIT 50',
      [data.room_id]
    );

    socket.emit('messageHistory', messages.reverse());

    const roomSockets = await io.in(data.room_id).fetchSockets();
    const onlineUsers = roomSockets.map(s => s.username);
    io.to(data.room_id).emit('onlineUsers', onlineUsers);
    io.to(data.room_id).emit('userJoined', { username: data.username });
  });

  socket.on('sendMessage', async (data) => {
    try {
      await db.query(
        'INSERT INTO messages (room_id, sender_id, content) VALUES (?, ?, ?)',
        [data.room_id, data.user_id, data.message]
      );
      io.to(data.room_id).emit('newMessage', {
        username: data.username,
        message: data.message,
        room_id: data.room_id
      });
      await addPoints(data.user_id, POINTS_PER_MESSAGE, 'Message sent');
    } catch (err) {
      console.error('Message error:', err);
    }
  });

  socket.on('leaveRoom', (data) => {
    socket.leave(data.room_id);
    io.to(data.room_id).emit('userLeft', { username: data.username });
  });

  socket.on('joinGame', async (data) => {
    const gameRoom = 'game_' + data.room_id + '_' + data.game;
    socket.join(gameRoom);
    socket.gameRoom = gameRoom;
    socket.gameUsername = data.username;

    if (!games[gameRoom]) {
      // 🛠️ إضافة حقل turn لمعرفة من عليه الدور (يبدأ بـ X دائماً)
      games[gameRoom] = { players: [], board: Array(9).fill(''), active: false, turn: 'X' };
    }

    const game = games[gameRoom];
    if (game.players.length < 2 && !game.players.includes(data.username)) {
      game.players.push(data.username);
    }

    if (game.players.length === 2 && !game.active) {
      game.active = true;
      game.board = Array(9).fill('');
      game.turn = 'X'; // إعادة تعيين الدور البادئ لـ X

      const sockets = await io.in(gameRoom).fetchSockets();
      sockets.forEach((s) => {
        const isFirstPlayer = s.gameUsername === game.players[0];
        // 🛠️ إصلاح إرسال أسماء اللاعبين بشكل فردي وصحيح للتخلص من مشكلة undefined
        s.emit('gameStart', {
          playerX: game.players[0],
          playerO: game.players[1],
          symbol: isFirstPlayer ? 'X' : 'O'
        });
      });
    }
  });

  socket.on('gameMove', (data) => {
    const gameRoom = 'game_' + data.room_id + '_' + data.game;
    const game = games[gameRoom];
    
    // 🛠️ شرط الحماية: التحقق من أن اللعبة نشطة، المربع فارغ، وأن اللاعب الذي نقر هو صاحب الدور فعلياً
    if (!game || !game.active || game.board[data.index] !== '' || data.symbol !== game.turn) return;

    game.board[data.index] = data.symbol;
    
    // 🛠️ تبديل الدور منطقياً في ذاكرة السيرفر ليقبل حركة اللاعب القادم
    const nextTurn = data.symbol === 'X' ? 'O' : 'X';
    game.turn = nextTurn; 

    // إرسال الحركة للجميع بالمتغير الجديد للتبديل في المتصفح
    io.to(gameRoom).emit('gameMove', { index: data.index, symbol: data.symbol, nextTurn });
    
    const winner = checkWinner(game.board);
    if (winner) {
      io.to(gameRoom).emit('gameOver', { winner });
      game.active = false;
    } else if (!game.board.includes('')) {
      io.to(gameRoom).emit('gameOver', { winner: 'draw' });
      game.active = false;
    }
  });

  socket.on('restartGame', (data) => {
    const gameRoom = 'game_' + data.room_id + '_' + data.game;
    if (games[gameRoom]) {
      games[gameRoom].board = Array(9).fill('');
      games[gameRoom].active = true;
      games[gameRoom].turn = 'X';
      io.to(gameRoom).emit('gameStart', {
        playerX: games[gameRoom].players[0],
        playerO: games[gameRoom].players[1],
        symbol: 'X'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected: ' + socket.id);
    // إذا كنت تريد إبلاغ الطرف الآخر بمغادرة الخصم
    if (socket.gameRoom) {
      io.to(socket.gameRoom).emit('playerLeft');
      delete games[socket.gameRoom];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
