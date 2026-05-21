const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const roleRoutes = require('./routes/roles');
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
app.use('/api/points', pointsRouter);
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('WidBid Server is running');
});

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

  socket.on('disconnect', () => {
    console.log('User disconnected: ' + socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});