const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const router = express.Router();

// Get user info and pastes (public)
router.get('/:username', (req, res) => {
    const { username } = req.params;

    const user = db.prepare('SELECT id, username, created_at FROM users WHERE username = ?').get(username);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Get pastes (only public metadata)
    const pastes = db.prepare(`
    SELECT id, name, type, size, created_at, expires_at,
      CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END as has_password
    FROM pastes 
    WHERE user_id = ? 
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at DESC
  `).all(user.id);

    res.json({
        user: {
            username: user.username,
            created_at: user.created_at
        },
        pastes
    });
});

// Unlock user homepage (verify user password for management)
router.post('/:username/unlock', (req, res) => {
    const { username } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);

    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    // Return a session token for this user
    const { generateToken } = require('../middleware/auth');
    const token = generateToken(user.id);

    res.json({
        success: true,
        token,
        user: {
            id: user.id,
            username: user.username,
            default_password: user.default_password
        }
    });
});

module.exports = router;
