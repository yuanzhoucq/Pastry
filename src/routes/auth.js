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
    const { username, password, inviteCode, displayName } = req.body;

    if (!username || !password || !inviteCode) {
        return res.status(400).json({ error: 'Username, password, and invite code required' });
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_-]+$/.test(username) || username.length < 3 || username.length > 30) {
        return res.status(400).json({ error: 'Username must be 3-30 characters, alphanumeric, dash, or underscore only' });
    }

    // SECURITY: Password policy - minimum 8 characters
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Validate display name if provided (allow any characters, max 50)
    const trimmedDisplayName = displayName ? displayName.trim() : null;
    if (trimmedDisplayName && trimmedDisplayName.length > 50) {
        return res.status(400).json({ error: 'Display name must be 50 characters or less' });
    }

    // Check reserved usernames - 'app' prefix is reserved for system routes
    const reserved = ['app'];
    if (reserved.includes(username.toLowerCase())) {
        return res.status(400).json({ error: 'This username is reserved' });
    }

    // Check if username exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
    }

    // Validate invite code (must exist and not be disabled)
    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ? AND disabled = 0').get(inviteCode);
    if (!invite) {
        return res.status(400).json({ error: 'Invalid or disabled invite code' });
    }

    // SECURITY: Create user WITHOUT storing plaintext password
    const passwordHash = bcrypt.hashSync(password, 10);

    const registerUser = db.transaction(() => {
        const result = db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)')
            .run(username, passwordHash, trimmedDisplayName);

        // Record the usage (allow multiple users per code)
        db.prepare("INSERT INTO invite_code_uses (invite_code_id, user_id) VALUES (?, ?)")
            .run(invite.id, result.lastInsertRowid);

        return result;
    });

    try {
        const result = registerUser();
        res.json({
            success: true,
            message: 'Registration successful',
            user: {
                id: result.lastInsertRowid,
                username
            }
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ error: 'Registration failed, please try again' });
    }
});

module.exports = router;
