// API Client
const API = {
    token: localStorage.getItem('token'),
    userToken: sessionStorage.getItem('userToken'),

    setAdminToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    },

    setUserToken(token) {
        this.userToken = token;
        sessionStorage.setItem('userToken', token);
    },

    clearAdminToken() {
        this.token = null;
        localStorage.removeItem('token');
    },

    clearUserToken() {
        this.userToken = null;
        sessionStorage.removeItem('userToken');
    },

    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Token selection priority:
        // - useUserToken: explicitly use user token (for user-specific operations)
        // - useAdminToken: explicitly use admin token (for admin operations)
        // - default: prefer user token if available, fall back to admin token
        let token;
        if (options.useUserToken) {
            token = this.userToken;
        } else if (options.useAdminToken) {
            token = this.token;
        } else {
            token = this.userToken || this.token;
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    },

    // Auth
    async adminLogin(username, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async register(username, password, inviteCode, displayName) {
        return this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, inviteCode, displayName })
        });
    },

    // Admin
    async getUsers() {
        return this.request('/api/admin/users', { useAdminToken: true });
    },

    async deleteUser(id) {
        return this.request(`/api/admin/users/${id}`, { method: 'DELETE', useAdminToken: true });
    },

    async updateUser(id, data) {
        return this.request(`/api/admin/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            useAdminToken: true
        });
    },

    async getSettings() {
        return this.request('/api/admin/settings', { useAdminToken: true });
    },

    async updateSettings(data) {
        return this.request('/api/admin/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
            useAdminToken: true
        });
    },

    async createInviteCode() {
        return this.request('/api/admin/invite-codes', { method: 'POST', useAdminToken: true });
    },

    async getInviteCodes() {
        return this.request('/api/admin/invite-codes', { useAdminToken: true });
    },

    async deleteInviteCode(id) {
        return this.request(`/api/admin/invite-codes/${id}`, { method: 'DELETE', useAdminToken: true });
    },

    async toggleInviteCode(id, disabled) {
        return this.request(`/api/admin/invite-codes/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ disabled }),
            useAdminToken: true
        });
    },

    // Users
    async getUserPage(username) {
        return this.request(`/api/users/${username}`);
    },

    async unlockUserPage(username, password) {
        return this.request(`/api/users/${username}/unlock`, {
            method: 'POST',
            body: JSON.stringify({ password })
        });
    },

    async updateUserSettings(username, settings) {
        return this.request(`/api/users/${username}/settings`, {
            method: 'PUT',
            body: JSON.stringify(settings),
            useUserToken: true
        });
    },

    // Pastes
    async createPaste(formData) {
        const token = this.userToken || this.token;
        const response = await fetch('/api/pastes', {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        return data;
    },

    async getPaste(id) {
        return this.request(`/api/pastes/${id}`);
    },

    async verifyPaste(id, password) {
        return this.request(`/api/pastes/${id}/verify`, {
            method: 'POST',
            body: JSON.stringify({ password })
        });
    },

    async deletePaste(id) {
        return this.request(`/api/pastes/${id}`, {
            method: 'DELETE',
            useUserToken: true
        });
    },

    // Homepage
    async getHomepage() {
        return this.request('/api/homepage');
    }
};

// Utility functions
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    // SQLite stores datetime('now') as UTC without timezone indicator
    // Append 'Z' to indicate UTC so JavaScript parses it correctly
    const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    const now = new Date();
    const diff = now - date;

    // Future date (expiration)
    if (diff < 0) {
        const futureDiff = -diff;
        if (futureDiff < 3600000) return `in ${Math.ceil(futureDiff / 60000)}m`;
        if (futureDiff < 86400000) return `in ${Math.ceil(futureDiff / 3600000)}h`;
        if (futureDiff < 604800000) return `in ${Math.ceil(futureDiff / 86400000)}d`;
        return date.toLocaleDateString();
    }

    // Past date (created)
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
}

function showAlert(container, message, type = 'error') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} animate-in`;
    alert.textContent = message;

    container.insertBefore(alert, container.firstChild);

    setTimeout(() => alert.remove(), 5000);
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Universal modal for alerts and confirmations
// Usage: showModal({ title, message, type, onConfirm })
// type: 'success', 'error', 'confirm', 'info' (default)
function showModal(options) {
    const { title = 'Notice', message, type = 'info', onConfirm } = options;

    // Create or get the universal modal
    let modal = document.getElementById('universalModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'universalModal';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 id="universalModalTitle"></h3>
                    <button class="modal-close" onclick="closeModal('universalModal')">&times;</button>
                </div>
                <p id="universalModalMessage"></p>
                <div id="universalModalActions" style="display: flex; gap: var(--spacing-md); margin-top: var(--spacing-lg);"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const icons = { success: '✅', error: '❌', confirm: '⚠️', info: 'ℹ️' };
    document.getElementById('universalModalTitle').textContent = `${icons[type] || ''} ${title}`;
    document.getElementById('universalModalMessage').textContent = message;

    const actionsDiv = document.getElementById('universalModalActions');
    if (type === 'confirm' && onConfirm) {
        actionsDiv.innerHTML = `
            <button class="btn" style="flex: 1;" onclick="closeModal('universalModal')">Cancel</button>
            <button class="btn btn-danger" style="flex: 1;" id="universalModalConfirmBtn">Confirm</button>
        `;
        document.getElementById('universalModalConfirmBtn').onclick = () => {
            closeModal('universalModal');
            onConfirm();
        };
    } else {
        actionsDiv.innerHTML = `<button class="btn btn-primary" style="flex: 1;" onclick="closeModal('universalModal')">OK</button>`;
    }

    openModal('universalModal');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});
