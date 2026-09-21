import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { AuthModal } from './AuthModal.jsx';

export function UserBadge() {
  const { user, role } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="user-badge-trigger"
        onClick={() => setModalOpen(true)}
        title="Click to switch operator role or account"
      >
        <span className="user-dot" aria-hidden="true" />
        <span>{user ? user.name : 'Not Signed In'}</span>
        <span className={`ops-badge ops-badge-${role?.toLowerCase() || 'viewer'}`}>
          {role}
        </span>
      </button>

      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
