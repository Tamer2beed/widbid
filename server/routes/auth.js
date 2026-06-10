const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    );
    res.json({ success: true, message: 'Account created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Username or email already exists' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Email not found' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Wrong password' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success:  true,
      token,
      user_id:  user.id,
      username: user.username,
      rank:     user.rank || 100,
      email:    user.email,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
const { verifyToken } = require('../middleware');

router.get('/stats', verifyToken, async (req, res) => {
  try {
    const [users] = await db.query('SELECT COUNT(*) as count FROM users');
    const [messages] = await db.query('SELECT COUNT(*) as count FROM messages');
    res.json({ success: true, users: users[0].count, messages: messages[0].count });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;