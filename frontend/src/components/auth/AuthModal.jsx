import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

export function AuthModal({ open, onClose }) {
  const { user, login, register, logout, switchRole, loading, error } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('ANALYST');
  const [msg, setMsg] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (mode === 'login') {
      const res = await login(email, password);
      if (res.ok) {
        setMsg('Authenticated successfully');
        setTimeout(onClose, 400);
      }
    } else {
      const res = await register(name, email, password, role);
      if (res.ok) {
        setMsg('Registered and logged in');
        setTimeout(onClose, 400);
      }
    }
  };

  const handleQuickSwitch = (targetRole) => {
    switchRole(targetRole);
    setMsg(`Role switched to ${targetRole}`);
    setTimeout(onClose, 400);
  };

  return (
    <div className="ops-modal-backdrop" onClick={onClose}>
      <div className="ops-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ops-modal-header">
          <h2 style={{ margin: 0, fontSize: 'var(--t-body)', fontFamily: 'var(--font-mono)' }}>
            SENTINEL AUTHENTICATION & ACCESS CONTROL
          </h2>
          <button type="button" className="ops-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="ops-modal-body">
          {/* Quick Role Switcher for Testing */}
          <div style={{ background: 'var(--obsidian)', padding: 'var(--s-3)', borderRadius: 'var(--r-sm)' }}>
            <span className="ops-kpi-label" style={{ display: 'block', marginBottom: 'var(--s-2)' }}>
              ⚡ Quick Role Testing (Simulated RBAC)
            </span>
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`ops-btn ${user?.role === 'ADMIN' ? 'ops-btn-primary' : ''}`}
                onClick={() => handleQuickSwitch('ADMIN')}
              >
                Lead Admin (Full Access)
              </button>
              <button
                type="button"
                className={`ops-btn ${user?.role === 'ANALYST' ? 'ops-btn-primary' : ''}`}
                onClick={() => handleQuickSwitch('ANALYST')}
              >
                Security Analyst
              </button>
              <button
                type="button"
                className={`ops-btn ${user?.role === 'VIEWER' ? 'ops-btn-primary' : ''}`}
                onClick={() => handleQuickSwitch('VIEWER')}
              >
                Auditor (Read-Only)
              </button>
            </div>
          </div>

          {/* Real Credentials Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ops-kpi-label">{mode === 'login' ? 'LOGIN WITH ACCOUNT' : 'REGISTER OPERATOR'}</span>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--acid)', cursor: 'pointer', fontSize: 'var(--t-label)' }}
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? 'Need an account? Register' : 'Existing operator? Login'}
              </button>
            </div>

            {mode === 'register' && (
              <div>
                <label className="ops-kpi-label" style={{ display: 'block', marginBottom: 'var(--s-1)' }}>Name</label>
                <input
                  className="ops-input"
                  style={{ width: '100%' }}
                  type="text"
                  placeholder="Operator Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label className="ops-kpi-label" style={{ display: 'block', marginBottom: 'var(--s-1)' }}>Email Address</label>
              <input
                className="ops-input"
                style={{ width: '100%' }}
                type="email"
                placeholder="analyst@sentinel.sec"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="ops-kpi-label" style={{ display: 'block', marginBottom: 'var(--s-1)' }}>Password</label>
              <input
                className="ops-input"
                style={{ width: '100%' }}
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="ops-kpi-label" style={{ display: 'block', marginBottom: 'var(--s-1)' }}>Role</label>
                <select className="ops-select" style={{ width: '100%' }} value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="ANALYST">Security Analyst</option>
                  <option value="ADMIN">System Administrator</option>
                  <option value="VIEWER">Auditor / Viewer</option>
                </select>
              </div>
            )}

            {error && <div style={{ color: 'var(--critical)', fontSize: 'var(--t-label)' }}>{error}</div>}
            {msg && <div style={{ color: 'var(--operational)', fontSize: 'var(--t-label)' }}>{msg}</div>}

            <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
              <button type="submit" className="ops-btn ops-btn-primary" disabled={loading} style={{ flex: 1 }}>
                {loading ? 'Authenticating...' : mode === 'login' ? 'Authenticate' : 'Register Operator'}
              </button>
              {user && (
                <button type="button" className="ops-btn ops-btn-danger" onClick={logout}>
                  Sign Out
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
