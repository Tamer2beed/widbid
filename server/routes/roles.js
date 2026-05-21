const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware');

router.get('/', async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM global_roles ORDER BY level DESC');
    res.json({ success: true, roles });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/myRole', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT global_roles.* FROM user_global_roles 
       JOIN global_roles ON user_global_roles.role_id = global_roles.id 
       WHERE user_global_roles.user_id = ? 
       ORDER BY global_roles.level DESC LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.json({ success: true, role: { name: 'Member', level: 100, name_color: '#ffffff', badge_color: '#c9a84c' } });
    }
    res.json({ success: true, role: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/assign', verifyToken, async (req, res) => {
  const { user_id, role_id, expires_at } = req.body;
  try {
    const [myRole] = await db.query(
      `SELECT global_roles.level FROM user_global_roles 
       JOIN global_roles ON user_global_roles.role_id = global_roles.id 
       WHERE user_global_roles.user_id = ? 
       ORDER BY global_roles.level DESC LIMIT 1`,
      [req.user.id]
    );
    if (myRole.length === 0 || myRole[0].level < 900) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await db.query(
      'INSERT INTO user_global_roles (user_id, role_id, assigned_by, expires_at) VALUES (?, ?, ?, ?)',
      [user_id, role_id, req.user.id, expires_at || null]
    );
    res.json({ success: true, message: 'Role assigned' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/revoke', verifyToken, async (req, res) => {
  const { user_id, role_id } = req.body;
  try {
    const [myRole] = await db.query(
      `SELECT global_roles.level FROM user_global_roles 
       JOIN global_roles ON user_global_roles.role_id = global_roles.id 
       WHERE user_global_roles.user_id = ? 
       ORDER BY global_roles.level DESC LIMIT 1`,
      [req.user.id]
    );
    if (myRole.length === 0 || myRole[0].level < 900) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await db.query(
      'DELETE FROM user_global_roles WHERE user_id = ? AND role_id = ?',
      [user_id, role_id]
    );
    res.json({ success: true, message: 'Role revoked' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;