const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Initialize database (creates tables and admin user)
require('./src/config/database');

const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const userRoutes = require('./src/routes/user');
const pasteRoutes = require('./src/routes/paste');
const { startCleanupJob } = require('./src/utils/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// SECURITY: Add security headers via helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// SECURITY: Rate limiter for auth endpoints (5 attempts per 15 minutes)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { error: 'Too many login attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware - SECURITY: Limit body size to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

// API routes - Apply rate limiter to auth routes
app.use('/api/auth', authLimiter, authRoutes);
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
      SELECT username, display_name, created_at,
        (SELECT COUNT(*) FROM pastes WHERE user_id = users.id AND (expires_at IS NULL OR expires_at > datetime('now'))) as paste_count
      FROM users
      ORDER BY created_at DESC
    `).all();
        // Map display_name to displayName for frontend consistency
        const mappedUsers = users.map(u => ({
            username: u.username,
            displayName: u.display_name || u.username,
            created_at: u.created_at,
            paste_count: u.paste_count
        }));
        res.json({ type: 'user_list', users: mappedUsers });
    } else if (settings.homepage_type === 'user_page' && settings.homepage_user) {
        res.json({ type: 'redirect', username: settings.homepage_user });
    } else {
        res.json({ type: 'user_list', users: [] });
    }
});

// Serve app system pages
app.get('/app/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'login.html'));
});

app.get('/app/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'admin.html'));
});

app.get('/app/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'register.html'));
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
