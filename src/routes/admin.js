const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { generateWordPassword } = require('../utils/words');

const router = express.Router();

// All routes require admin
router.use(requireAdmin);

// Get all users
router.get('/users', (req, res) => {
    const users = db.prepare(`
    SELECT id, username, is_admin, default_password, created_at,
      (SELECT COUNT(*) FROM pastes WHERE user_id = users.id) as paste_count
    FROM users
    ORDER BY created_at DESC
  `).all();

    res.json(users);
});

// Delete user
router.delete('/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);

    // Prevent deleting self
    if (userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Delete user (cascades to pastes)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ success: true });
});

// Update user
router.put('/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const { resetPassword, isAdmin } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    let newPassword = null;

    if (resetPassword) {
        newPassword = generateWordPassword();
        const passwordHash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ?, default_password = ? WHERE id = ?')
            .run(passwordHash, newPassword, userId);
    }

    if (typeof isAdmin === 'boolean' && userId !== req.user.id) {
        db.prepare('UPDATE users SET is_admin = ? WHERE id = ?')
            .run(isAdmin ? 1 : 0, userId);
    }

    res.json({
        success: true,
        newPassword: newPassword
    });
});

// Get settings
router.get('/settings', (req, res) => {
    const settings = {};
    const rows = db.prepare('SELECT key, value FROM settings').all();
    for (const row of rows) {
        settings[row.key] = row.value;
    }
    res.json(settings);
});

// Update settings
router.put('/settings', (req, res) => {
    const { homepage_type, homepage_user, max_expiration_days, max_file_size_mb } = req.body;

    if (homepage_type) {
        if (!['user_list', 'user_page'].includes(homepage_type)) {
            return res.status(400).json({ error: 'Invalid homepage type' });
        }
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(homepage_type, 'homepage_type');
    }

    if (homepage_user !== undefined) {
        if (homepage_user) {
            const user = db.prepare('SELECT id FROM users WHERE username = ?').get(homepage_user);
            if (!user) {
                return res.status(400).json({ error: 'User not found' });
            }
        }
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(homepage_user, 'homepage_user');
    }

    if (max_expiration_days !== undefined) {
        const days = parseInt(max_expiration_days);
        if (isNaN(days) || days < 1 || days > 365) {
            return res.status(400).json({ error: 'Max expiration must be 1-365 days' });
        }
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(days.toString(), 'max_expiration_days');
    }

    if (max_file_size_mb !== undefined) {
        const size = parseInt(max_file_size_mb);
        if (isNaN(size) || size < 1 || size > 100) {
            return res.status(400).json({ error: 'Max file size must be 1-100 MB' });
        }
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(size.toString(), 'max_file_size_mb');
    }

    res.json({ success: true });
});

// Generate invite code
router.post('/invite-codes', (req, res) => {
    const code = generateWordPassword();

    db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)')
        .run(code, req.user.id);

    res.json({ code });
});

// List invite codes
router.get('/invite-codes', (req, res) => {
    const codes = db.prepare(`
    SELECT 
      ic.id, ic.code, ic.created_at, ic.disabled,
      creator.username as created_by
    FROM invite_codes ic
    JOIN users creator ON ic.created_by = creator.id
    ORDER BY ic.created_at DESC
  `).all();

    // Get usage info for each code
    const codesWithUsage = codes.map(code => {
        const uses = db.prepare(`
      SELECT u.username, icu.used_at
      FROM invite_code_uses icu
      JOIN users u ON icu.user_id = u.id
      WHERE icu.invite_code_id = ?
      ORDER BY icu.used_at DESC
    `).all(code.id);

        return {
            ...code,
            use_count: uses.length,
            used_by: uses.map(u => u.username)
        };
    });

    res.json(codesWithUsage);
});

// Toggle invite code (enable/disable)
router.put('/invite-codes/:id', (req, res) => {
    const codeId = parseInt(req.params.id);
    const { disabled } = req.body;

    const code = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(codeId);
    if (!code) {
        return res.status(404).json({ error: 'Code not found' });
    }

    db.prepare('UPDATE invite_codes SET disabled = ? WHERE id = ?')
        .run(disabled ? 1 : 0, codeId);

    res.json({ success: true, disabled: !!disabled });
});

// Delete invite code
router.delete('/invite-codes/:id', (req, res) => {
    const codeId = parseInt(req.params.id);

    const code = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(codeId);
    if (!code) {
        return res.status(404).json({ error: 'Code not found' });
    }

    db.prepare('DELETE FROM invite_codes WHERE id = ?').run(codeId);

    res.json({ success: true });
});

module.exports = router;
