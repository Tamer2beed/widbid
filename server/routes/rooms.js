const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const [rooms] = await db.query(
      'SELECT rooms.*, COUNT(room_members.id) as member_count FROM rooms LEFT JOIN room_members ON rooms.id = room_members.room_id GROUP BY rooms.id'
    );
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/create', async (req, res) => {
  const { name, type, owner_id } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO rooms (name, type, owner_id) VALUES (?, ?, ?)',
      [name, type || 'public', owner_id]
    );
    res.json({ success: true, room_id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/join', async (req, res) => {
  const { room_id, user_id } = req.body;
  try {
    await db.query(
      'INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)',
      [room_id, user_id]
    );
    res.json({ success: true, message: 'Joined room' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;