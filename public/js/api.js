// API Client
const API = {
    token: localStorage.getItem('token'),

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    },

    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
    },

    // Legacy aliases for compatibility
    setAdminToken(token) { this.setToken(token); },
    setUserToken(token) { this.setToken(token); },
    clearAdminToken() { this.clearToken(); },
    clearUserToken() { this.clearToken(); },
    get userToken() { return this.token; },

    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
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
    async login(username, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    // Alias for backwards compatibility
    async adminLogin(username, password) {
        return this.login(username, password);
    },

    async register(username, password, inviteCode, displayName) {
        return this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, inviteCode, displayName })
        });
    },

    // Admin
    async getUsers() {
        return this.request('/api/admin/users');
    },

    async deleteUser(id) {
        return this.request(`/api/admin/users/${id}`, { method: 'DELETE' });
    },

    async updateUser(id, data) {
        return this.request(`/api/admin/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async getSettings() {
        return this.request('/api/admin/settings');
    },

    async updateSettings(data) {
        return this.request('/api/admin/settings', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async createInviteCode() {
        return this.request('/api/admin/invite-codes', { method: 'POST' });
    },

    async getInviteCodes() {
        return this.request('/api/admin/invite-codes');
    },

    async deleteInviteCode(id) {
        return this.request(`/api/admin/invite-codes/${id}`, { method: 'DELETE' });
    },

    async toggleInviteCode(id, disabled) {
        return this.request(`/api/admin/invite-codes/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ disabled })
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
            body: JSON.stringify(settings)
        });
    },

    // Pastes
    async createPaste(formData) {
        const response = await fetch('/api/pastes', {
            method: 'POST',
            headers: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
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
        return this.request(`/api/pastes/${id}`, { method: 'DELETE' });
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

// Modal functions - make globally accessible for inline onclick handlers
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Attach to window for inline onclick handlers in HTML
window.openModal = openModal;
window.closeModal = closeModal;

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
                    <button class="modal-close" id="universalModalClose">&times;</button>
                </div>
                <p id="universalModalMessage"></p>
                <div id="universalModalActions" style="display: flex; gap: var(--spacing-md); margin-top: var(--spacing-lg);"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add close button event listener
        document.getElementById('universalModalClose').addEventListener('click', () => {
            closeModal('universalModal');
        });
    }

    const icons = { success: '✅', error: '❌', confirm: '⚠️', info: 'ℹ️' };
    document.getElementById('universalModalTitle').textContent = `${icons[type] || ''} ${title}`;
    document.getElementById('universalModalMessage').textContent = message;

    const actionsDiv = document.getElementById('universalModalActions');
    actionsDiv.innerHTML = ''; // Clear previous buttons

    if (type === 'confirm' && onConfirm) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn';
        cancelBtn.style.flex = '1';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => closeModal('universalModal'));

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.style.flex = '1';
        confirmBtn.textContent = 'Confirm';
        confirmBtn.addEventListener('click', () => {
            closeModal('universalModal');
            onConfirm();
        });

        actionsDiv.appendChild(cancelBtn);
        actionsDiv.appendChild(confirmBtn);
    } else {
        const okBtn = document.createElement('button');
        okBtn.className = 'btn btn-primary';
        okBtn.style.flex = '1';
        okBtn.textContent = 'OK';
        okBtn.addEventListener('click', () => closeModal('universalModal'));
        actionsDiv.appendChild(okBtn);
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
