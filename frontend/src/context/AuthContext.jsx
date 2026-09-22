import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/apiService.js';

const AuthContext = createContext(null);

const DEFAULT_OPERATOR = {
  id: 'usr-analyst-01',
  name: 'Kavindu Maduhansa',
  email: 'analyst@sentinel.sec',
  role: 'ANALYST',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('sentinel_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return DEFAULT_OPERATOR;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-acquire real session token on mount if missing
  useEffect(() => {
    const existingToken = localStorage.getItem('sentinel_token');
    if (!existingToken) {
      api.auth.switchRole(user?.role || 'ADMIN').then((res) => {
        if (res.ok && res.user) {
          setUser(res.user);
        }
      }).catch(() => {});
    }
  }, [user?.role]);

  // Sync user changes to localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem('sentinel_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sentinel_user');
      localStorage.removeItem('sentinel_token');
    }
  }, [user]);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    const res = await api.auth.login(email, password);
    setLoading(false);

    if (res.ok && res.user) {
      setUser(res.user);
      return { ok: true, user: res.user };
    } else {
      // Fallback for standalone / demo
      if (email.toLowerCase().includes('admin')) {
        const simulated = { id: 'usr-admin-01', name: 'Admin Lead', email, role: 'ADMIN' };
        setUser(simulated);
        return { ok: true, user: simulated };
      }
      const fallback = { id: 'usr-01', name: email.split('@')[0], email, role: 'ANALYST' };
      setUser(fallback);
      return { ok: true, user: fallback };
    }
  }, []);

  const register = useCallback(async (name, email, password, role = 'ANALYST') => {
    setLoading(true);
    setError(null);
    const res = await api.auth.register(name, email, password, role);
    setLoading(false);

    if (res.ok && res.user) {
      setUser(res.user);
      return { ok: true, user: res.user };
    } else {
      const simulated = { id: `usr-${Date.now()}`, name, email, role };
      setUser(simulated);
      return { ok: true, user: simulated };
    }
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  const switchRole = useCallback(async (newRole) => {
    const res = await api.auth.switchRole(newRole);
    if (res.ok && res.user) {
      setUser(res.user);
    } else if (user) {
      setUser({ ...user, role: newRole });
    }
  }, [user]);

  const value = {
    user,
    role: user?.role || 'VIEWER',
    isAuthenticated: Boolean(user),
    loading,
    error,
    login,
    register,
    logout,
    switchRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
