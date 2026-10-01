import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getUser, logout } from '../utils/auth';

const ROLE_BADGE = {
  user:      { label: 'User',      color: 'var(--primary)' },
  collector: { label: 'Collector', color: 'var(--primary)' },
  moderator: { label: 'Moderator', color: 'var(--primary)' },
  admin:     { label: 'Admin',     color: 'var(--primary)' },
};

import Logo from './Logo';

export default function Navbar() {
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const user = getUser();
  const role = user?.role || null;
  const badge = role ? (ROLE_BADGE[role] || ROLE_BADGE.user) : null;

  const handleLogout = () => {
    logout();
    navigate('/search');
  };

  const handleAvatarClick = () => {
    setProfileOpen((prev) => !prev);
  };

  const initial = user?.name ? user.name[0].toUpperCase() : 'U';

  const brandTo = !user
    ? '/login'
    : role === 'admin'
    ? '/admin'
    : role === 'moderator'
    ? '/moderator-dashboard'
    : role === 'collector'
    ? '/collector'
    : '/search';

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink to={brandTo} className="navbar-brand" style={{ textDecoration: 'none' }}>
          <Logo size="medium" />
        </NavLink>

        <div className="navbar-links">
          {/* User & Admin: explore */}
          {user && (role === 'user' || role === 'admin') && (
            <NavLink to="/search" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              🔍 Explore
            </NavLink>
          )}

          {/* User: submit own path & view submissions */}
          {user && role === 'user' && (
            <>
              <NavLink to="/cp-form" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                ✍️ Submit Path
              </NavLink>
              <NavLink to="/my-submissions" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                📊 My Submissions
              </NavLink>
            </>
          )}

          {/* Collector: submit paths for others */}
          {user && role === 'collector' && (
            <>
              <NavLink to="/collector" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                📋 Collector Dashboard
              </NavLink>
              <NavLink to="/my-submissions" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                📊 My Submissions
              </NavLink>
            </>
          )}

          {/* Moderator */}
          {user && role === 'moderator' && (
            <NavLink to="/moderator-dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              🛡️ Moderation
            </NavLink>
          )}

          {/* Admin */}
          {user && role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              ⚙️ Admin
            </NavLink>
          )}
        </div>

        <div className="navbar-user">
          {user ? (
            <>
              <button className="navbar-avatar" type="button" onClick={handleAvatarClick} aria-label="Open profile menu">
                {initial}
              </button>

              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-header">Profile</div>
                  <div className="profile-row">
                    <span>Name</span>
                    <strong>{user?.name || 'Unknown'}</strong>
                  </div>
                  <div className="profile-row">
                    <span>Email</span>
                    <strong>{user?.email || 'Unknown'}</strong>
                  </div>
                  <div className="profile-row">
                    <span>Role</span>
                    <strong>{badge?.label || 'User'}</strong>
                  </div>
                  <NavLink
                    to="/edit-profile"
                    className="btn btn-secondary btn-sm btn-block"
                    style={{ textDecoration: 'none', marginBottom: '0.5rem', textAlign: 'center', display: 'block' }}
                    onClick={() => setProfileOpen(false)}
                  >
                    ✏️ Edit Profile
                  </NavLink>
                  <button className="btn btn-sm btn-block" type="button" onClick={handleLogout}>
                    Logout
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Not logged in — show Sign In + Register */
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <NavLink
                to="/login"
                className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none' }}
              >
                Sign In
              </NavLink>
              <NavLink
                to="/register"
                className="btn btn-primary btn-sm"
                style={{ textDecoration: 'none' }}
              >
                Register
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
