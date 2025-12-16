const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');

// SECURITY: Require JWT_SECRET to be set - fail fast if not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('='.repeat(50));
    console.error('SECURITY ERROR: JWT_SECRET environment variable is not set!');
    console.error('Set it before starting the server:');
    console.error('  JWT_SECRET=your-secret-key npm start');
    console.error('='.repeat(50));
    process.exit(1);
}

// Middleware to verify admin JWT token
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        if (!user.is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Generate JWT token for user sessions
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
}

// Generate secure download token (short-lived, for file downloads after password verification)
function generateDownloadToken(pasteId) {
    return jwt.sign({ pasteId, type: 'download' }, JWT_SECRET, { expiresIn: '5m' });
}

// Verify download token
function verifyDownloadToken(token, pasteId) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.type === 'download' && decoded.pasteId === pasteId;
    } catch {
        return false;
    }
}

module.exports = { requireAdmin, generateToken, generateDownloadToken, verifyDownloadToken, JWT_SECRET };

