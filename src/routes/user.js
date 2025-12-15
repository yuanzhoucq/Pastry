const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const router = express.Router();

// Get user info and pastes (public)
router.get('/:username', (req, res) => {
    const { username } = req.params;

    const user = db.prepare('SELECT id, username, display_name, created_at, allow_anonymous_upload FROM users WHERE username = ?').get(username);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Get pastes (only public metadata)
    const rawPastes = db.prepare(`
    SELECT id, name, type, size, content, created_at, expires_at,
      CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END as has_password
    FROM pastes 
    WHERE user_id = ? 
      AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at DESC
  `).all(user.id);

    // Calculate word count for text pastes (supporting Chinese)
    const pastes = rawPastes.map(paste => {
        const result = {
            id: paste.id,
            name: paste.name,
            type: paste.type,
            size: paste.size,
            created_at: paste.created_at,
            expires_at: paste.expires_at,
            has_password: paste.has_password
        };

        if (paste.type === 'text' && paste.content) {
            // Count words: split by whitespace for English, count characters for CJK
            const content = paste.content.trim();
            // Match CJK characters and non-whitespace sequences
            const matches = content.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[^\s]+/g);
            result.word_count = matches ? matches.length : 0;
        }

        return result;
    });

    // Get max expiration setting
    const maxExpirationSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('max_expiration_days');
    const maxExpirationDays = maxExpirationSetting ? parseInt(maxExpirationSetting.value) : 30;

    res.json({
        user: {
            username: user.username,
            displayName: user.display_name || user.username,
            created_at: user.created_at
        },
        pastes,
        allowAnonymousUpload: user.allow_anonymous_upload === 1,
        maxExpirationDays
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
            default_password: user.default_password,
            allow_anonymous_upload: user.allow_anonymous_upload === 1
        }
    });
});

// Update user settings (requires authentication)
router.put('/:username/settings', (req, res) => {
    const { username } = req.params;
    const { allow_anonymous_upload, display_name } = req.body;

    // Verify auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');

    let userId;
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.userId;
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (user.id !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    // Update allow_anonymous_upload if provided
    if (allow_anonymous_upload !== undefined) {
        db.prepare('UPDATE users SET allow_anonymous_upload = ? WHERE id = ?')
            .run(allow_anonymous_upload ? 1 : 0, user.id);
    }

    // Update display_name if provided (can be null/empty to clear)
    if (display_name !== undefined) {
        const trimmedName = display_name ? display_name.trim() : null;
        if (trimmedName && trimmedName.length > 50) {
            return res.status(400).json({ error: 'Display name must be 50 characters or less' });
        }
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?')
            .run(trimmedName || null, user.id);
    }

    res.json({ success: true });
});

module.exports = router;
