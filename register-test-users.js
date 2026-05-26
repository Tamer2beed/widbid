const bcrypt = require('bcryptjs');
const db = require('./server/db');

const users = [
  { username: 'owner1', email: 'owner@widbid.com', role_id: 2 },
  { username: 'superroot', email: 'superroot@widbid.com', role_id: 3 },
  { username: 'root1', email: 'root@widbid.com', role_id: 4 },
  { username: 'supermaster', email: 'supermaster@widbid.com', role_id: 5 },
  { username: 'master1', email: 'master@widbid.com', role_id: 6 },
  { username: 'superadmin', email: 'superadmin@widbid.com', role_id: 7 },
  { username: 'admin1', email: 'admin@widbid.com', role_id: 8 },
  { username: 'royal1', email: 'royal@widbid.com', role_id: 9 },
  { username: 'protected1', email: 'protected@widbid.com', role_id: 10 },
  { username: 'member1', email: 'member@widbid.com', role_id: 11 },
  { username: 'guest1', email: 'guest@widbid.com', role_id: 12 },
];

async function run() {
  const hash = await bcrypt.hash('123456', 10);
  for (const u of users) {
    try {
      const [result] = await db.query(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [u.username, u.email, hash]
      );
      await db.query(
        'INSERT INTO user_global_roles (user_id, role_id, assigned_by) VALUES (?, ?, 1)',
        [result.insertId, u.role_id]
      );
      if (u.role_id === 2) {
        await db.query(
          'INSERT INTO owners (user_id, max_rooms, created_by) VALUES (?, 100, 1)',
          [result.insertId]
        );
      }
      console.log('Created: ' + u.username);
    } catch (e) {
      console.log('Skipped: ' + u.username + ' - ' + e.message);
    }
  }
  console.log('Done!');
  process.exit();
}

run();