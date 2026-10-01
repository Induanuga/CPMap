import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { getUser } from '../utils/auth';

const ROLES = ['user', 'collector', 'moderator', 'admin'];

const ROLE_COLORS = {
  user:      '#6366f1',
  collector: '#f59e0b',
  moderator: '#8b5cf6',
  admin:     '#ef4444',
};

const STATUS_COLORS = {
  pending:  '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
};

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
      background: 'rgba(91,82,224,0.9)', color: '#fff', padding: '0.75rem 1.25rem',
      borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '0.88rem',
    }}>
      {msg}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [toast, setToast]     = useState('');
  const currentUser           = getUser();

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/career-paths/admin/users');
      setUsers(res.data.users || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.patch(`/career-paths/admin/users/${userId}/role`, { role: newRole });
      setUsers((prev) => prev.map((u) => u._id === userId ? { ...u, role: newRole } : u));
      showToast(`Role updated to ${newRole}.`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update role.');
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/career-paths/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u._id !== userId));
      showToast('User deleted.');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete user.');
    }
  };

  if (loading) return <div className="empty-state"><div className="empty-icon">⏳</div><h3>Loading users…</h3></div>;
  if (error)   return <div style={{ color: '#ef4444', padding: '1rem' }}>❌ {error}</div>;

  return (
    <>
      <Toast msg={toast} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {['Name', 'Email', 'Phone', 'Role', 'Joined', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{u.email}</td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>{u.phone}</td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u._id, e.target.value)}
                    disabled={u._id === currentUser?.id || u.role === 'admin'}
                    style={{
                      background: ROLE_COLORS[u.role] + '22',
                      color: ROLE_COLORS[u.role],
                      border: `1px solid ${ROLE_COLORS[u.role]}55`,
                      borderRadius: '999px', padding: '2px 10px',
                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {ROLES.filter((r) => r !== 'admin' || u.role === 'admin').map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {u._id !== currentUser?.id && (
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                      onClick={() => handleDeleteUser(u._id, u.name)}
                    >
                      🗑️ Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="empty-state"><div className="empty-icon">👥</div><h3>No users found</h3></div>
        )}
      </div>
    </>
  );
}

// ─── Career Paths Tab ─────────────────────────────────────────────────────────
function PathsTab() {
  const [paths, setPaths]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [toast, setToast]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchPaths = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/career-paths/admin/all');
      setPaths(res.data.paths || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load career paths.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPaths(); }, [fetchPaths]);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete career path "${title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/career-paths/admin/${id}`);
      setPaths((prev) => prev.filter((p) => p._id !== id));
      showToast('Career path deleted.');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete.');
    }
  };

  const handleModerate = async (id, status) => {
    try {
      await api.patch(`/career-paths/${id}/moderate`, { status });
      setPaths((prev) => prev.map((p) => p._id === id ? { ...p, status } : p));
      showToast(`Career path ${status}.`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed.');
    }
  };

  const displayed = statusFilter === 'all' ? paths : paths.filter((p) => p.status === statusFilter);

  if (loading) return <div className="empty-state"><div className="empty-icon">⏳</div><h3>Loading paths…</h3></div>;
  if (error)   return <div style={{ color: '#ef4444', padding: '1rem' }}>❌ {error}</div>;

  return (
    <>
      <Toast msg={toast} />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'rejected'].map((s) => (
          <button key={s}
            className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatusFilter(s)}
            style={{ textTransform: 'capitalize' }}>
            {s} ({s === 'all' ? paths.length : paths.filter((p) => p.status === s).length})
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📭</div><h3>No paths found</h3></div>
      ) : (
        displayed.map((path) => (
          <div key={path._id} className="glass-card" style={{ marginBottom: '1rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{path.title}</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{path.category}</span>
              </div>
              <span style={{
                background: STATUS_COLORS[path.status] + '22',
                color: STATUS_COLORS[path.status],
                border: `1px solid ${STATUS_COLORS[path.status]}55`,
                padding: '2px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
              }}>
                {path.status}
              </span>
            </div>

            <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              {path.submittedBy && <span>👤 {path.submittedBy.name} ({path.submittedBy.role})</span>}
              {path.submitterName && <span>📝 {path.submitterName}</span>}
              <span>📅 {new Date(path.createdAt).toLocaleDateString()}</span>
              {path.moderatedBy && <span>🛡️ Moderated by {path.moderatedBy.name}</span>}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
              {path.stages?.length > 0 && (
                <span style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '999px', padding: '4px 10px', fontSize: '0.75rem' }}>
                  {path.stages.length} stages
                </span>
              )}
              {path.transitions?.length > 0 && (
                <span style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '999px', padding: '4px 10px', fontSize: '0.75rem' }}>
                  {path.transitions.length} transitions
                </span>
              )}
              <Link to={`/admin/path/${path._id}`} className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }}>
                View full career path
              </Link>
            </div>

            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {path.status !== 'approved' && (
                <button className="btn btn-sm"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                  onClick={() => handleModerate(path._id, 'approved')}>
                  ✅ Approve
                </button>
              )}
              {path.status !== 'rejected' && (
                <button className="btn btn-sm"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                  onClick={() => handleModerate(path._id, 'rejected')}>
                  ❌ Reject
                </button>
              )}
              <button className="btn btn-sm"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', marginLeft: 'auto' }}
                onClick={() => handleDelete(path._id, path.title)}>
                🗑️ Delete
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ─── Graph Tab ────────────────────────────────────────────────────────────────
function GraphTab() {
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState('');
  const [neo4jStatus, setNeo4jStatus] = useState('unknown');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [healthRes, statsRes] = await Promise.all([
        api.get('/graph/health'),
        api.get('/graph/stats'),
      ]);
      setNeo4jStatus(healthRes.data.neo4j);
      setStats(statsRes.data.stats);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load graph stats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleSyncAll = async () => {
    if (!window.confirm('Sync all approved career paths to Neo4j? This may take a moment.')) return;
    setSyncing(true);
    try {
      const res = await api.post('/graph/sync-all');
      showToast(res.data.message || 'Sync complete!');
      await fetchStats();
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div className="empty-state"><div className="empty-icon">⏳</div><h3>Loading graph stats…</h3></div>;

  return (
    <>
      <Toast msg={toast} />
      {error && <div style={{ color: '#ef4444', padding: '1rem', marginBottom: '1rem' }}>❌ {error}</div>}

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Neo4j Graph Database</h3>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Status: <span style={{ color: neo4jStatus === 'connected' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {neo4jStatus === 'connected' ? '● Connected' : '● Disconnected'}
              </span>
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSyncAll}
            disabled={syncing || neo4jStatus !== 'connected'}
          >
            {syncing ? '⏳ Syncing…' : '🔄 Sync Career Paths to Graph'}
          </button>
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Career Paths', value: stats.careerPaths, icon: '🛤️' },
            { label: 'Graph Nodes', value: stats.nodes, icon: '📍' },
            { label: 'Relationships', value: stats.edges, icon: '🔗' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="glass-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem' }}>{icon}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0' }}>{value ?? 0}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {stats && stats.careerPaths === 0 && neo4jStatus === 'connected' && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-icon">📊</div>
          <h3>Graph is empty</h3>
          <p style={{ color: 'var(--text-muted)' }}>Click "Sync Career Paths to Graph" to populate Neo4j with approved career paths.</p>
        </div>
      )}
    </>
  );
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab, setTab] = useState('paths');

  return (
    <div className="page-container" style={{ paddingBottom: '3rem' }}>
      <div className="search-hero">
        <h1>⚙️ Admin <span className="gradient-text">Console</span></h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Manage all career paths and users across the platform.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {[
          { key: 'paths', label: '📋 Career Paths' },
          { key: 'users', label: '👥 Users' },
          { key: 'graph', label: '🕸️ Graph (Neo4j)' },
        ].map(({ key, label }) => (
          <button key={key}
            className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'paths' && <PathsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'graph' && <GraphTab />}
    </div>
  );
}
