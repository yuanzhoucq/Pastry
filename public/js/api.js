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

        // Use user token for paste operations if available
        const token = options.useUserToken ? this.userToken : (this.userToken || this.token);
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

    async register(username, password, inviteCode) {
        return this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, inviteCode })
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
