const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const generateOwnerToken = () => crypto.randomBytes(3).toString('hex').toUpperCase();

const isSuperOwner = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT global_roles.level FROM user_global_roles 
       JOIN global_roles ON user_global_roles.role_id = global_roles.id 
       WHERE user_global_roles.user_id = ? 
       ORDER BY global_roles.level DESC LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0 || rows[0].level < 1200) {
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
    const ownerToken = generateOwnerToken();
    await db.query(
      'INSERT INTO owners (user_id, max_rooms, created_by, owner_token) VALUES (?, ?, ?, ?)',
      [user_id, max_rooms || 100, req.user.id, ownerToken]
    );
    const [ownerRole] = await db.query("SELECT id FROM global_roles WHERE name = 'Owner' LIMIT 1");
    if (ownerRole.length > 0) {
      await db.query(
        'INSERT INTO user_global_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)',
        [user_id, ownerRole[0].id, req.user.id]
      );
    }
    res.json({ success: true, message: 'Owner created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/createRoom', verifyToken, async (req, res) => {
  const {
    name, type, max_members, count,
    max_supermaster, max_master, max_superadmin, max_admin,
    group_name, superroot_ids
  } = req.body;

  try {
    const [ownerData] = await db.query('SELECT * FROM owners WHERE user_id = ?', [req.user.id]);
    if (ownerData.length === 0) {
      return res.status(403).json({ success: false, message: 'Not an owner' });
    }
    const owner = ownerData[0];
    const roomCount = parseInt(count) || 1;

    if (owner.rooms_count + roomCount > owner.max_rooms) {
      return res.status(400).json({ success: false, message: 'Room limit exceeded' });
    }

    const createdRooms = [];
    let groupId = null;

    if (roomCount > 1 && group_name) {
      const [groupResult] = await db.query(
        'INSERT INTO room_groups (name, owner_id) VALUES (?, ?)',
        [group_name, req.user.id]
      );
      groupId = groupResult.insertId;

      if (superroot_ids && superroot_ids.length > 0) {
        for (const srId of superroot_ids) {
          await db.query(
            'INSERT INTO room_group_superroots (group_id, user_id) VALUES (?, ?)',
            [groupId, srId]
          );
        }
      }
    }

    for (let i = 0; i < roomCount; i++) {
      const roomName = roomCount > 1 ? `${name} ${i + 1}` : name;
      const [ownerInfo] = await db.query(
        'SELECT owner_token, rooms_count FROM owners WHERE user_id = ?',
        [req.user.id]
      );
      const ownerToken = ownerInfo[0].owner_token;
      const roomNumber = ownerInfo[0].rooms_count + 1;
      const shortToken = ownerToken + '-' + roomNumber;

      const masterRawPassword = Math.random().toString(36).slice(-8).toUpperCase();
      const masterHash = await bcrypt.hash(masterRawPassword, 10);

      const [result] = await db.query(
        `INSERT INTO rooms 
        (name, type, owner_id, owner_id_global, room_token, max_members, room_number,
         max_supermaster, max_master, max_superadmin, max_admin,
         master_username, master_password, master_must_change_password) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          roomName, type || 'public', req.user.id, owner.id, shortToken,
          max_members || 100, roomNumber,
          max_supermaster || 1, max_master || 3,
          max_superadmin || 5, max_admin || 10,
          'Master', masterHash
        ]
      );

      await db.query(
        'UPDATE owners SET rooms_count = rooms_count + 1 WHERE user_id = ?',
        [req.user.id]
      );

      if (groupId) {
        await db.query(
          'INSERT INTO room_group_members (group_id, room_id) VALUES (?, ?)',
          [groupId, result.insertId]
        );
      }

      createdRooms.push({
        room_id: result.insertId,
        name: roomName,
        token: shortToken,
        link: '/room/' + shortToken,
        master_password: masterRawPassword
      });
    }

    res.json({ success: true, rooms: createdRooms });
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

router.get('/myGroups', verifyToken, async (req, res) => {
  try {
    const [groups] = await db.query(
      'SELECT * FROM room_groups WHERE owner_id = ?',
      [req.user.id]
    );
    for (const group of groups) {
      const [members] = await db.query(
        'SELECT room_id FROM room_group_members WHERE group_id = ?',
        [group.id]
      );
      group.room_ids = members.map(m => m.room_id);
    }
    res.json({ success: true, groups });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/allOwners', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT global_roles.level FROM user_global_roles 
       JOIN global_roles ON user_global_roles.role_id = global_roles.id 
       WHERE user_global_roles.user_id = ? 
       ORDER BY global_roles.level DESC LIMIT 1`,
      [req.user.id]
    );
    const level = rows.length > 0 ? rows[0].level : 0;
    let owners;
    if (level >= 1200) {
      const [all] = await db.query(
        `SELECT owners.*, users.username, users.email 
         FROM owners JOIN users ON owners.user_id = users.id`
      );
      owners = all;
    } else {
      const [mine] = await db.query(
        `SELECT owners.*, users.username, users.email 
         FROM owners JOIN users ON owners.user_id = users.id
         WHERE owners.user_id = ?`,
        [req.user.id]
      );
      owners = mine;
    }
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

router.post('/freezeRoom', verifyToken, async (req, res) => {
  const { room_id } = req.body;
  try {
    const [room] = await db.query('SELECT frozen, owner_id FROM rooms WHERE id = ?', [room_id]);
    if (room.length === 0 || room[0].owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const newState = room[0].frozen ? 0 : 1;
    await db.query('UPDATE rooms SET frozen = ? WHERE id = ?', [newState, room_id]);
    res.json({ success: true, frozen: newState });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/deleteRoom', verifyToken, async (req, res) => {
  const { room_id } = req.body;
  try {
    const [room] = await db.query('SELECT owner_id FROM rooms WHERE id = ?', [room_id]);
    if (room.length === 0 || room[0].owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await db.query('DELETE FROM room_members WHERE room_id = ?', [room_id]);
    await db.query('DELETE FROM messages WHERE room_id = ?', [room_id]);
    await db.query('DELETE FROM room_group_members WHERE room_id = ?', [room_id]);
    await db.query('DELETE FROM rooms WHERE id = ?', [room_id]);
    await db.query('UPDATE owners SET rooms_count = rooms_count - 1 WHERE user_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/updateRoom', verifyToken, async (req, res) => {
  const { room_id, max_members, max_supermaster, max_master, max_superadmin, max_admin } = req.body;
  try {
    const [room] = await db.query('SELECT owner_id FROM rooms WHERE id = ?', [room_id]);
    if (room.length === 0 || room[0].owner_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await db.query(
      'UPDATE rooms SET max_members = ?, max_supermaster = ?, max_master = ?, max_superadmin = ?, max_admin = ? WHERE id = ?',
      [max_members, max_supermaster, max_master, max_superadmin, max_admin, room_id]
    );
    res.json({ success: true, message: 'Room updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;