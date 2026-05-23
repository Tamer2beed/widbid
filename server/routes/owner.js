const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware');
const crypto = require('crypto');

const generateToken = () => crypto.randomBytes(32).toString('hex');

const isSuperOwner = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT global_roles.level FROM user_global_roles 
       JOIN global_roles ON user_global_roles.role_id = global_roles.id 
       WHERE user_global_roles.user_id = ? 
       ORDER BY global_roles.level DESC LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0 || rows[0].level < 1000) {
      return res.status(403).json({ success: false, message: 'Super Owner only' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

router.post('/create', verifyToken, isSuperOwner, async (req, res) => {
  const { user_id, max_rooms } = req.body;
  try {
    const [existing] = await db.query('SELECT id FROM owners WHERE user_id = ?', [user_id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'User is already an owner' });
    }
    await db.query(
      'INSERT INTO owners (user_id, max_rooms, created_by) VALUES (?, ?, ?)',
      [user_id, max_rooms || 100, req.user.id]
    );
    await db.query(
      `INSERT INTO user_global_roles (user_id, role_id, assigned_by) 
       VALUES (?, (SELECT id FROM global_roles WHERE name = 'Owner'), ?)`,
      [user_id, req.user.id]
    );
    res.json({ success: true, message: 'Owner created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/createRoom', verifyToken, async (req, res) => {
  const { name, type, max_members } = req.body;
  try {
    const [ownerData] = await db.query('SELECT * FROM owners WHERE user_id = ?', [req.user.id]);
    if (ownerData.length === 0) {
      return res.status(403).json({ success: false, message: 'Not an owner' });
    }
    const owner = ownerData[0];
    if (owner.rooms_count >= owner.max_rooms) {
      return res.status(400).json({ success: false, message: 'Room limit reached' });
    }
    const token = generateToken();
    const [result] = await db.query(
      'INSERT INTO rooms (name, type, owner_id, owner_id_global, room_token, max_members) VALUES (?, ?, ?, ?, ?, ?)',
      [name, type || 'public', req.user.id, owner.id, token, max_members || 100]
    );
    await db.query('UPDATE owners SET rooms_count = rooms_count + 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, room_id: result.insertId, token, link: '/room/' + token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/myRooms', verifyToken, async (req, res) => {
  try {
    const [rooms] = await db.query(
      `SELECT rooms.*, COUNT(room_members.id) as member_count 
       FROM rooms 
       LEFT JOIN room_members ON rooms.id = room_members.room_id 
       WHERE rooms.owner_id = ? 
       GROUP BY rooms.id`,
      [req.user.id]
    );
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/allOwners', verifyToken, isSuperOwner, async (req, res) => {
  try {
    const [owners] = await db.query(
      `SELECT owners.*, users.username, users.email 
       FROM owners 
       JOIN users ON owners.user_id = users.id`
    );
    res.json({ success: true, owners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/room/:token', async (req, res) => {
  try {
    const [rooms] = await db.query(
      'SELECT * FROM rooms WHERE room_token = ?',
      [req.params.token]
    );
    if (rooms.length === 0) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }
    res.json({ success: true, room: rooms[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;