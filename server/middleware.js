const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const isRoomAdmin = async (req, res, next) => {
  const db = require('./db');
  const { room_id } = req.body;
  const user_id = req.user.id;
  try {
    const [rows] = await db.query(
      'SELECT role FROM room_members WHERE room_id = ? AND user_id = ?',
      [room_id, user_id]
    );
    if (rows.length === 0 || !['admin', 'moderator'].includes(rows[0].role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { verifyToken, isRoomAdmin };