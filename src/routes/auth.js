const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Admin login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_admin) {
        return res.status(403).json({ error: 'Admin access only' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);

    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id);

    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            is_admin: user.is_admin
        }
    });
});

// User registration (requires invite code)
router.post('/register', (req, res) => {
    const { username, password, inviteCode } = req.body;

    if (!username || !password || !inviteCode) {
        return res.status(400).json({ error: 'Username, password, and invite code required' });
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_-]+$/.test(username) || username.length < 3 || username.length > 30) {
        return res.status(400).json({ error: 'Username must be 3-30 characters, alphanumeric, dash, or underscore only' });
    }

    // Check reserved usernames
    const reserved = ['admin', 'api', 'static', 'public', 'register', 'login'];
    if (reserved.includes(username.toLowerCase())) {
        return res.status(400).json({ error: 'This username is reserved' });
    }

    // Check if username exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
    }

    // Validate invite code
    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ? AND used_by IS NULL').get(inviteCode);
    if (!invite) {
        return res.status(400).json({ error: 'Invalid or already used invite code' });
    }

    // Create user
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, default_password) VALUES (?, ?, ?)')
        .run(username, passwordHash, password);

    // Mark invite code as used
    db.prepare('UPDATE invite_codes SET used_by = ?, used_at = datetime("now") WHERE id = ?')
        .run(result.lastInsertRowid, invite.id);

    res.json({
        success: true,
        message: 'Registration successful',
        user: {
            id: result.lastInsertRowid,
            username
        }
    });
});

module.exports = router;
