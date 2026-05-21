const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware');

const DAILY_CAP = 100;
const POINTS_PER_MESSAGE = 1;

router.get('/balance', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM user_points WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.json({ success: true, points: 0, total_earned: 0 });
    }
    res.json({ success: true, points: rows[0].points, total_earned: rows[0].total_earned });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/history', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM points_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ success: true, history: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/store', async (req, res) => {
  try {
    const [items] = await db.query('SELECT * FROM store_items');
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/buy', verifyToken, async (req, res) => {
  const { item_id } = req.body;
  try {
    const [items] = await db.query('SELECT * FROM store_items WHERE id = ?', [item_id]);
    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    const item = items[0];
    const [balance] = await db.query('SELECT points FROM user_points WHERE user_id = ?', [req.user.id]);
    if (balance.length === 0 || balance[0].points < item.price) {
      return res.status(400).json({ success: false, message: 'Not enough points' });
    }
    await db.query('UPDATE user_points SET points = points - ? WHERE user_id = ?', [item.price, req.user.id]);
    await db.query('INSERT INTO user_purchases (user_id, item_id) VALUES (?, ?)', [req.user.id, item_id]);
    await db.query('INSERT INTO points_history (user_id, amount, reason) VALUES (?, ?, ?)', [req.user.id, -item.price, 'Purchase: ' + item.name]);
    res.json({ success: true, message: 'Purchase successful' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const addPoints = async (user_id, amount, reason) => {
  const today = new Date().toISOString().split('T')[0];
  const [rows] = await db.query('SELECT * FROM user_points WHERE user_id = ?', [user_id]);
  if (rows.length === 0) {
    await db.query(
      'INSERT INTO user_points (user_id, points, total_earned, daily_earned, last_reset) VALUES (?, ?, ?, ?, ?)',
      [user_id, amount, amount, amount, today]
    );
  } else {
    const row = rows[0];
    const lastReset = row.last_reset ? row.last_reset.toISOString().split('T')[0] : null;
    const dailyEarned = lastReset === today ? row.daily_earned : 0;
    if (dailyEarned >= DAILY_CAP) return;
    const actualAmount = Math.min(amount, DAILY_CAP - dailyEarned);
    await db.query(
      'UPDATE user_points SET points = points + ?, total_earned = total_earned + ?, daily_earned = ?, last_reset = ? WHERE user_id = ?',
      [actualAmount, actualAmount, dailyEarned + actualAmount, today, user_id]
    );
  }
  await db.query('INSERT INTO points_history (user_id, amount, reason) VALUES (?, ?, ?)', [user_id, amount, reason]);
};

module.exports = { router, addPoints, POINTS_PER_MESSAGE };