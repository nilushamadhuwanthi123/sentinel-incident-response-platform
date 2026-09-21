/**
 * SENTINEL platform REST API client.
 * Connects to the server backend when available, or falls back to local simulation.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getAuthHeader() {
  const token = localStorage.getItem('sentinel_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[apiService] network call failed for ${path}:`, err.message);
    return { ok: false, error: err.message, networkError: true };
  }
}

export const api = {
  // --- Auth ---
  auth: {
    async login(email, password) {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.ok && res.token) {
        localStorage.setItem('sentinel_token', res.token);
      }
      return res;
    },
    async register(name, email, password, role) {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      if (res.ok && res.token) {
        localStorage.setItem('sentinel_token', res.token);
      }
      return res;
    },
    async me() {
      return request('/api/auth/me');
    },
    async logout() {
      localStorage.removeItem('sentinel_token');
      return request('/api/auth/logout', { method: 'POST' });
    },
    async users() {
      return request('/api/auth/users');
    },
  },

  // --- Incidents ---
  incidents: {
    async list(filters = {}) {
      const query = new URLSearchParams(filters).toString();
      return request(`/api/incidents${query ? `?${query}` : ''}`);
    },
    async get(id) {
      return request(`/api/incidents/${id}`);
    },
    async create(data) {
      return request('/api/incidents', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    async update(id, updates) {
      return request(`/api/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    async delete(id) {
      return request(`/api/incidents/${id}`, { method: 'DELETE' });
    },
    async getReport(id) {
      return request(`/api/incidents/${id}/report`);
    },
  },

  // --- Playbooks & Actions ---
  playbooks: {
    async list() {
      return request('/api/playbooks');
    },
    async executeAction(incidentId, actionData) {
      return request(`/api/incidents/${incidentId}/actions`, {
        method: 'POST',
        body: JSON.stringify(actionData),
      });
    },
    async listActions(incidentId) {
      return request(`/api/incidents/${incidentId}/actions`);
    },
  },

  // --- Services & Observability ---
  services: {
    async list() {
      return request('/api/services');
    },
    async get(id) {
      return request(`/api/services/${id}`);
    },
    async overrideStatus(id, status, reason) {
      return request(`/api/services/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      });
    },
  },

  // --- Metrics ---
  metrics: {
    async summary() {
      return request('/api/metrics/summary');
    },
    async history(serviceId, points = 24) {
      const query = new URLSearchParams({ ...(serviceId ? { serviceId } : {}), points }).toString();
      return request(`/api/metrics/history?${query}`);
    },
  },

  // --- Analytics ---
  analytics: {
    async overview() {
      return request('/api/analytics/overview');
    },
    async trends() {
      return request('/api/analytics/trends');
    },
  },

  // --- Audit Trail ---
  audit: {
    async list(filters = {}) {
      const query = new URLSearchParams(filters).toString();
      return request(`/api/audit${query ? `?${query}` : ''}`);
    },
  },
};
