const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { generateWordPassword } = require('../utils/words');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, generateDownloadToken, verifyDownloadToken } = require('../middleware/auth');

const router = express.Router();

// SECURITY: Block dangerous file extensions that could be executed
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.html', '.htm', '.svg', '.php', '.asp', '.aspx', '.jsp'];

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    // Fix Chinese filename encoding: multer decodes as latin1, but browsers send UTF-8
    fileFilter: (req, file, cb) => {
        // Re-encode originalname from latin1 to UTF-8
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

        // SECURITY: Block dangerous file extensions
        const ext = path.extname(file.originalname).toLowerCase();
        if (BLOCKED_EXTENSIONS.includes(ext)) {
            return cb(new Error(`File type ${ext} is not allowed for security reasons`), false);
        }
        cb(null, true);
    }
});

// Helper to get settings
function getSettings() {
    const settings = {};
    const rows = db.prepare('SELECT key, value FROM settings').all();
    for (const row of rows) {
        settings[row.key] = row.value;
    }
    return settings;
}

// Helper to verify user token
function getUserFromToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        return db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    } catch {
        return null;
    }
}

// Create paste (text or file)
router.post('/', upload.single('file'), (req, res) => {
    const user = getUserFromToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const settings = getSettings();
    const maxFileSizeMb = parseInt(settings.max_file_size_mb) || 10;
    const maxExpirationDays = parseInt(settings.max_expiration_days) || 30;

    const { name, content, expiresIn, passwordOption, customPassword } = req.body;
    const file = req.file;

    // Determine type
    const type = file ? 'file' : 'text';

    if (type === 'text' && !content) {
        return res.status(400).json({ error: 'Content required for text paste' });
    }

    // Check file size
    if (file && file.size > maxFileSizeMb * 1024 * 1024) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: `File exceeds maximum size of ${maxFileSizeMb}MB` });
    }

    // SECURITY: Use 12-character IDs for better entropy
    const id = uuidv4().replace(/-/g, '').slice(0, 12);

    // Generate friendly default name: "Text Dec 15 18:04" or "File Dec 15 18:04"
    let pasteName = name;
    if (!pasteName) {
        const now = new Date();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[now.getMonth()];
        const day = now.getDate();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const typeLabel = type === 'file' ? 'File' : 'Text';
        pasteName = `${typeLabel} ${month} ${day} ${hours}:${minutes}`;
    }

    // Calculate expiration
    let expiresAt = null;
    if (expiresIn) {
        const days = parseFloat(expiresIn);
        if (days > 0 && days <= maxExpirationDays) {
            const expirationDate = new Date();
            // Support fractional days (e.g., 0.0416667 for 1 hour)
            expirationDate.setTime(expirationDate.getTime() + days * 24 * 60 * 60 * 1000);
            expiresAt = expirationDate.toISOString();
        } else if (days > maxExpirationDays) {
            if (file) fs.unlinkSync(file.path);
            return res.status(400).json({ error: `Expiration cannot exceed ${maxExpirationDays} days` });
        }
    }

    // Handle password
    let passwordHash = null;
    let generatedPassword = null;

    switch (passwordOption) {
        case 'none':
            passwordHash = null;
            break;
        case 'default':
            // SECURITY: 'default' password option removed - was exposing plaintext passwords
            // Fall through to 'none' - no password protection
            passwordHash = null;
            break;
        case 'random':
            generatedPassword = generateWordPassword();
            passwordHash = bcrypt.hashSync(generatedPassword, 10);
            break;
        case 'custom':
            if (customPassword) {
                passwordHash = bcrypt.hashSync(customPassword, 10);
            }
            break;
    }

    // Calculate size
    const size = file ? file.size : Buffer.byteLength(content, 'utf8');

    // Insert paste
    db.prepare(`
    INSERT INTO pastes (id, user_id, name, type, content, file_path, original_filename, password_hash, expires_at, size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        id,
        user.id,
        pasteName,
        type,
        type === 'text' ? content : null,
        file ? file.filename : null,
        file ? file.originalname : null,
        passwordHash,
        expiresAt,
        size
    );

    res.json({
        success: true,
        paste: {
            id,
            name: pasteName,
            type,
            size,
            expires_at: expiresAt,
            has_password: !!passwordHash
        },
        generatedPassword
    });
});

// Get paste metadata
router.get('/:id', (req, res) => {
    const paste = db.prepare(`
    SELECT p.*, u.username 
    FROM pastes p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

    if (!paste) {
        return res.status(404).json({ error: 'Paste not found' });
    }

    // Check expiration
    if (paste.expires_at && new Date(paste.expires_at) < new Date()) {
        return res.status(404).json({ error: 'Paste has expired' });
    }

    res.json({
        id: paste.id,
        name: paste.name,
        username: paste.username,
        type: paste.type,
        size: paste.size,
        created_at: paste.created_at,
        expires_at: paste.expires_at,
        has_password: !!paste.password_hash,
        original_filename: paste.original_filename
    });
});

// Verify password and get content
router.post('/:id/verify', (req, res) => {
    const { password } = req.body;

    const paste = db.prepare('SELECT * FROM pastes WHERE id = ?').get(req.params.id);

    if (!paste) {
        return res.status(404).json({ error: 'Paste not found' });
    }

    // Check expiration
    if (paste.expires_at && new Date(paste.expires_at) < new Date()) {
        return res.status(404).json({ error: 'Paste has expired' });
    }

    // If no password required, return content directly
    if (!paste.password_hash) {
        if (paste.type === 'text') {
            return res.json({ content: paste.content });
        } else {
            return res.json({
                download: true,
                filename: paste.original_filename
            });
        }
    }

    // Verify password
    if (!password) {
        return res.status(401).json({ error: 'Password required' });
    }

    const validPassword = bcrypt.compareSync(password, paste.password_hash);

    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    if (paste.type === 'text') {
        res.json({ content: paste.content });
    } else {
        // SECURITY: Generate a secure, time-limited download token
        const downloadToken = generateDownloadToken(paste.id);
        res.json({
            download: true,
            filename: paste.original_filename,
            downloadToken
        });
    }
});

// Download file
router.get('/:id/download', (req, res) => {
    const { token } = req.query;

    const paste = db.prepare('SELECT * FROM pastes WHERE id = ?').get(req.params.id);

    if (!paste || paste.type !== 'file') {
        return res.status(404).json({ error: 'File not found' });
    }

    // Check expiration
    if (paste.expires_at && new Date(paste.expires_at) < new Date()) {
        return res.status(404).json({ error: 'File has expired' });
    }

    // SECURITY: For password-protected files, verify the secure download token
    if (paste.password_hash) {
        if (!token || !verifyDownloadToken(token, paste.id)) {
            return res.status(401).json({ error: 'Invalid or expired download token. Please verify password again.' });
        }
    }

    const filePath = path.join(__dirname, '../../uploads', paste.file_path);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
    }

    // Encode filename for proper display of non-ASCII characters (like Chinese)
    const encodedFilename = encodeURIComponent(paste.original_filename).replace(/'/g, '%27');
    res.setHeader('Content-Disposition', `attachment; filename="${paste.original_filename}"; filename*=UTF-8''${encodedFilename}`);
    res.download(filePath);
});

// Delete paste (owner only)
router.delete('/:id', (req, res) => {
    const user = getUserFromToken(req);
    if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const paste = db.prepare('SELECT * FROM pastes WHERE id = ?').get(req.params.id);

    if (!paste) {
        return res.status(404).json({ error: 'Paste not found' });
    }

    if (paste.user_id !== user.id && !user.is_admin) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete file if exists
    if (paste.file_path) {
        const filePath = path.join(__dirname, '../../uploads', paste.file_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    db.prepare('DELETE FROM pastes WHERE id = ?').run(req.params.id);

    res.json({ success: true });
});

module.exports = router;
