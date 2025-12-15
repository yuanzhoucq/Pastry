const express = require('express');
const path = require('path');
const fs = require('fs');

// Initialize database (creates tables and admin user)
require('./src/config/database');

const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const userRoutes = require('./src/routes/user');
const pasteRoutes = require('./src/routes/paste');
const { startCleanupJob } = require('./src/utils/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create directories if they don't exist
const dirs = ['data', 'uploads'];
for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pastes', pasteRoutes);

// Get homepage settings
app.get('/api/homepage', (req, res) => {
    const db = require('./src/config/database');
    const settings = {};
    const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)').all('homepage_type', 'homepage_user');
    for (const row of rows) {
        settings[row.key] = row.value;
    }

    if (settings.homepage_type === 'user_list') {
        const users = db.prepare(`
      SELECT username, created_at,
        (SELECT COUNT(*) FROM pastes WHERE user_id = users.id AND (expires_at IS NULL OR expires_at > datetime('now'))) as paste_count
      FROM users
      WHERE is_admin = 0
      ORDER BY created_at DESC
    `).all();
        res.json({ type: 'user_list', users });
    } else if (settings.homepage_type === 'user_page' && settings.homepage_user) {
        res.json({ type: 'redirect', username: settings.homepage_user });
    } else {
        res.json({ type: 'user_list', users: [] });
    }
});

// Serve user settings page
app.get('/:username/setting', (req, res) => {
    const { username } = req.params;

    // Skip API paths
    if (username.startsWith('api')) {
        return res.status(404).send('Not found');
    }

    res.sendFile(path.join(__dirname, 'public', 'user-settings.html'));
});

// Serve user pages (must be after API routes)
app.get('/:username', (req, res) => {
    const { username } = req.params;

    // Skip API and static paths
    if (username.startsWith('api') || username.includes('.')) {
        return res.status(404).send('Not found');
    }

    // Serve the user page template
    res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Start cleanup job
startCleanupJob();

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
