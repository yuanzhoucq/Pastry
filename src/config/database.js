const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const { generateWordPassword } = require('../utils/words');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'pastebin.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    default_password TEXT,
    allow_anonymous_upload INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pastes (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'file')),
    content TEXT,
    file_path TEXT,
    original_filename TEXT,
    password_hash TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    size INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    disabled INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invite_code_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invite_code_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    used_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (invite_code_id) REFERENCES invite_codes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_pastes_user_id ON pastes(user_id);
  CREATE INDEX IF NOT EXISTS idx_pastes_expires_at ON pastes(expires_at);
  CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
  CREATE INDEX IF NOT EXISTS idx_invite_code_uses_code_id ON invite_code_uses(invite_code_id);
`);

// Initialize default settings
const defaultSettings = {
  homepage_type: 'user_list',
  homepage_user: '',
  max_expiration_days: '30',
  max_file_size_mb: '10'
};

for (const [key, value] of Object.entries(defaultSettings)) {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

// Migration: Add allow_anonymous_upload column if it doesn't exist
try {
  db.prepare('SELECT allow_anonymous_upload FROM users LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE users ADD COLUMN allow_anonymous_upload INTEGER DEFAULT 1');
  console.log('[Migration] Added allow_anonymous_upload column to users table');
}

// Migration: Add disabled column to invite_codes if it doesn't exist
try {
  db.prepare('SELECT disabled FROM invite_codes LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE invite_codes ADD COLUMN disabled INTEGER DEFAULT 0');
  console.log('[Migration] Added disabled column to invite_codes table');
}

// Migration: Add display_name column to users if it doesn't exist
try {
  db.prepare('SELECT display_name FROM users LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  console.log('[Migration] Added display_name column to users table');
}

// Migration: Migrate used_by data to invite_code_uses table
try {
  const hasUsedBy = db.prepare("SELECT name FROM pragma_table_info('invite_codes') WHERE name = 'used_by'").get();
  if (hasUsedBy) {
    // Migrate existing usage data
    const usedCodes = db.prepare('SELECT id, used_by, used_at FROM invite_codes WHERE used_by IS NOT NULL').all();
    for (const code of usedCodes) {
      const existing = db.prepare('SELECT id FROM invite_code_uses WHERE invite_code_id = ? AND user_id = ?').get(code.id, code.used_by);
      if (!existing) {
        db.prepare("INSERT INTO invite_code_uses (invite_code_id, user_id, used_at) VALUES (?, ?, ?)").run(code.id, code.used_by, code.used_at || new Date().toISOString());
      }
    }
    console.log(`[Migration] Migrated ${usedCodes.length} invite code usage records`);
  }
} catch (err) {
  // Table might not have used_by column in new installs, that's fine
}

// Create admin user if not exists
const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminUser) {
  const adminPassword = generateWordPassword();
  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO users (username, password_hash, is_admin, default_password) VALUES (?, ?, 1, ?)')
    .run('admin', passwordHash, adminPassword);

  console.log('='.repeat(50));
  console.log('Admin account created:');
  console.log(`  Username: admin`);
  console.log(`  Password: ${adminPassword}`);
  console.log('='.repeat(50));
}

module.exports = db;
