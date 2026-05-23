const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware');

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
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

router.get('/all', verifyToken, isSuperOwner, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, username, email, status, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/ban', verifyToken, isSuperOwner, async (req, res) => {
  const { user_id } = req.body;
  try {
    await db.query('UPDATE users SET status = ? WHERE id = ?', ['banned', user_id]);
    res.json({ success: true, message: 'User banned' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/unban', verifyToken, isSuperOwner, async (req, res) => {
  const { user_id } = req.body;
  try {
    await db.query('UPDATE users SET status = ? WHERE id = ?', ['offline', user_id]);
    res.json({ success: true, message: 'User unbanned' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;