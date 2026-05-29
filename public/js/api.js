/* ========================================
   API Helper Module
   ======================================== */
const API = {
  base: '/api',

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.id) {
      headers['X-User-Id'] = user.id.toString();
    }
    return headers;
  },

  async request(endpoint, options = {}) {
    const url = `${this.base}${endpoint}`;
    const config = {
      headers: { ...this.getHeaders(), ...(options.headers || {}) },
      ...options,
    };
    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(url, config);
    if (!response.ok) {
      if (response.status === 401) {
        // Unauthorized, logout
        localStorage.removeItem('user');
        window.location.reload();
      }
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Request failed');
    }
    return response.json();
  },

  // === AUTH ===
  auth: {
    login(username, password) {
      return API.request('/auth/login', { method: 'POST', body: { username, password } });
    },
    register(username, password) {
      return API.request('/auth/register', { method: 'POST', body: { username, password } });
    }
  },

  // === HABITS ===
  habits: {
    getAll() { return API.request('/habits'); },
    get(id) { return API.request(`/habits/${id}`); },
    create(data) { return API.request('/habits', { method: 'POST', body: data }); },
    update(id, data) { return API.request(`/habits/${id}`, { method: 'PUT', body: data }); },
    delete(id) { return API.request(`/habits/${id}`, { method: 'DELETE' }); },
    toggleComplete(id, date) {
      return API.request(`/habits/${id}/complete`, { method: 'POST', body: { date } });
    },
    getCompletions(id, from, to) {
      return API.request(`/habits/${id}/completions?from=${from}&to=${to}`);
    },
    getCompletionsRange(from, to) {
      return API.request(`/habits/completions/range?from=${from}&to=${to}`);
    },
  },

  // === TASKS ===
  tasks: {
    getAll(date) {
      const query = date ? `?date=${date}` : '';
      return API.request(`/tasks${query}`);
    },
    get(id) { return API.request(`/tasks/${id}`); },
    create(data) { return API.request('/tasks', { method: 'POST', body: data }); },
    update(id, data) { return API.request(`/tasks/${id}`, { method: 'PUT', body: data }); },
    delete(id) { return API.request(`/tasks/${id}`, { method: 'DELETE' }); },
    toggle(id) { return API.request(`/tasks/${id}/toggle`, { method: 'PATCH' }); }, // Note: We might not use this if using drag and drop for status
  },

  // === STATS ===
  stats: {
    get() { return API.request('/stats'); },
  },
};
