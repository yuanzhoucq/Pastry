const fs = require('fs');
const path = require('path');
const db = require('../config/database');

function cleanupExpiredPastes() {
    console.log('[Cleanup] Running expired paste cleanup...');

    // Get expired pastes
    const expiredPastes = db.prepare(`
    SELECT * FROM pastes 
    WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `).all();

    let deletedCount = 0;

    for (const paste of expiredPastes) {
        // Delete file if exists
        if (paste.file_path) {
            const filePath = path.join(__dirname, '../../uploads', paste.file_path);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.error(`[Cleanup] Failed to delete file: ${filePath}`, err);
                }
            }
        }

        // Delete paste record
        db.prepare('DELETE FROM pastes WHERE id = ?').run(paste.id);
        deletedCount++;
    }

    if (deletedCount > 0) {
        console.log(`[Cleanup] Deleted ${deletedCount} expired paste(s)`);
    }
}

// Run cleanup every hour
function startCleanupJob() {
    // Run immediately on start
    cleanupExpiredPastes();

    // Then run every hour
    setInterval(cleanupExpiredPastes, 60 * 60 * 1000);
}

module.exports = { cleanupExpiredPastes, startCleanupJob };
