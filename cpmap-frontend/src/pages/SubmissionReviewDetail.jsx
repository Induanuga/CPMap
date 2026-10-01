import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';

function StatusBadge({ status }) {
  const styles = {
    pending:  { background: 'rgba(245,158,11,0.15)',  color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)'  },
    approved: { background: 'rgba(16,185,129,0.15)',  color: '#10b981', border: '1px solid rgba(16,185,129,0.4)'  },
    rejected: { background: 'rgba(239,68,68,0.15)',   color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)'   },
  };
  const labels = { pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected' };
  return (
    <span style={{ ...styles[status], padding: '4px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600 }}>
      {labels[status] || status}
    </span>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value, highlight = false }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
      <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{label}:</span>
      <span style={{ marginLeft: '0.5rem', color: highlight ? 'var(--primary)' : 'inherit', fontWeight: highlight ? 600 : 400 }}>
        {Array.isArray(value) ? value.join(', ') : value}
      </span>
    </div>
  );
}

function TagGroup({ tags, label }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{label}</span>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
        {tags.map((tag, i) => (
          <span key={i} style={{
            background: 'rgba(99,102,241,0.1)',
            color: 'var(--primary)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '999px',
            padding: '3px 10px',
            fontSize: '0.75rem',
            fontWeight: 500
          }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SubmissionReviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetchSubmission();
  }, [id]);

  const fetchSubmission = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/career-paths/${id}`);
      setPath(res.data.path);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load submission.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/career-paths/${id}/moderate`, { status: 'approved' });
      showToast('✅ Submission approved successfully!');
      setTimeout(() => navigate('/moderator-dashboard'), 1500);
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!feedback.trim()) {
      showToast('❌ Please provide feedback before rejecting.');
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/career-paths/${id}/moderate`, { 
        status: 'rejected', 
        moderatorFeedback: feedback
      });
      showToast('❌ Submission rejected with feedback.');
      setTimeout(() => navigate('/moderator-dashboard'), 1500);
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ paddingTop: '4rem' }}>
        <div className="empty-state">
          <div className="empty-icon">⏳</div>
          <h3>Loading submission…</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container" style={{ paddingTop: '2rem' }}>
        <div className="glass-card" style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgb(220,38,38)', padding: '1.5rem', color: 'rgb(220,38,38)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>❌</div>
          <h3>{error}</h3>
          <button className="btn" onClick={() => navigate('/moderator-dashboard')} style={{ marginTop: '1rem' }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!path) return null;

  const parseSkills = (val) => typeof val === 'string' ? val.split(',').map(s => s.trim()).filter(Boolean) : Array.isArray(val) ? val : [];

  return (
    <div className="page-container" style={{ paddingBottom: '3rem' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
          background: 'rgba(16,185,129,0.9)', color: '#fff', padding: '0.75rem 1.25rem',
          borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '0.88rem',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          onClick={() => navigate('/moderator-dashboard')} 
          style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem' }}
          title="Back to Dashboard"
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 0.25rem 0', fontSize: '1.5rem' }}>{path.title}</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{path.category}</span>
        </div>
        <StatusBadge status={path.status} />
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CAREER META */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Career Overview" icon="🎯">
        <InfoRow label="Title" value={path.title} highlight />
        <InfoRow label="Category" value={path.category} />
        {path.description && (
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Description:</span>
            <p style={{ margin: 0, lineHeight: 1.6, color: 'inherit' }}>{path.description}</p>
          </div>
        )}
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SUBMITTER PROFILE */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionCard title="Submitter Profile" icon="👤">
        <InfoRow label="Name" value={path.submitterName} highlight={!!path.submitterName} />
        <InfoRow label="Email" value={path.submitterEmail} />
        <InfoRow label="Gender" value={path.submitterGender} />
        <InfoRow label="Background" value={path.submitterBackground} />
        <InfoRow label="Economic Status" value={path.submitterEconomicStatus} />
        {path.submitterEducationHistory && (
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Education History:</span>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{path.submitterEducationHistory}</p>
          </div>
        )}
        <TagGroup tags={parseSkills(path.submitterSkills)} label="Skills" />
        {path.submittedBy && (
          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <InfoRow label="Submitted by User" value={path.submittedBy.name} />
            <InfoRow label="User Role" value={path.submittedBy.role} />
          </div>
        )}
      </SectionCard>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* STAGES */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {path.stages && path.stages.length > 0 && (
        <SectionCard title={`Career Stages (${path.stages.length})`} icon="📍">
          {path.stages.map((stage, idx) => (
            <div key={idx} style={{
              background: 'rgba(99,102,241,0.05)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem',
              marginBottom: idx < path.stages.length - 1 ? '1rem' : '0'
            }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>
                Stage {idx + 1}: {stage.stageName}
              </h4>
              <InfoRow label="Education" value={stage.education} />
              <InfoRow label="Age Range" value={stage.ageRange} />
              <TagGroup tags={parseSkills(stage.skills)} label="Skills Gained" />
              {stage.experience && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Experience:</span>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{stage.experience}</p>
                </div>
              )}
              {stage.livingConditions && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Living Conditions:</span>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{stage.livingConditions}</p>
                </div>
              )}
              {stage.helpReceived && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Help Received:</span>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{stage.helpReceived}</p>
                </div>
              )}
              {stage.suggestions && (
                <div style={{ fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Suggestions:</span>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{stage.suggestions}</p>
                </div>
              )}
            </div>
          ))}
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TRANSITIONS */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {path.transitions && path.transitions.length > 0 && (
        <SectionCard title={`Decision Points (${path.transitions.length})`} icon="🔀">
          {path.transitions.map((trans, idx) => (
            <div key={idx} style={{
              background: 'rgba(168,85,247,0.05)',
              border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem',
              marginBottom: idx < path.transitions.length - 1 ? '1rem' : '0'
            }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>
                {trans.fromStage} → {trans.toStage}
              </h4>
              {trans.reasonChosen && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Why this path was chosen:</span>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{trans.reasonChosen}</p>
                </div>
              )}
              <TagGroup tags={parseSkills(trans.optionsAvailable)} label="Other Options Available" />
              {trans.mistakes && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Mistakes / Regrets:</span>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{trans.mistakes}</p>
                </div>
              )}
              {trans.advice && (
                <div style={{ fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Advice for Others:</span>
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{trans.advice}</p>
                </div>
              )}
            </div>
          ))}
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MODERATION INFO */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {(path.status !== 'pending' || path.moderatedBy) && (
        <SectionCard title="Moderation History" icon="📋">
          <InfoRow label="Status" value={path.status} highlight />
          {path.moderatedBy && <InfoRow label="Moderated by" value={path.moderatedBy.name} />}
          {path.moderationNote && (
            <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Moderation Note:</span>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{path.moderationNote}</p>
            </div>
          )}
          {path.moderatorFeedback && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.9rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>Moderator Feedback:</span>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{path.moderatorFeedback}</p>
            </div>
          )}
          {path.createdAt && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
              Submitted: {new Date(path.createdAt).toLocaleString()}
            </div>
          )}
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ACTION SECTION (only for pending submissions) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {path.status === 'pending' && (
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.25rem', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700 }}>📝 Moderation Action</h3>
          
          {!showRejectForm ? (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                className="btn"
                style={{ 
                  background: 'rgba(16,185,129,0.15)', 
                  color: '#10b981', 
                  border: '1px solid rgba(16,185,129,0.4)', 
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={handleApprove}
                disabled={actionLoading}
              >
                {actionLoading ? <span className="spinner" /> : '✅ Approve Submission'}
              </button>
              <button
                className="btn"
                style={{ 
                  background: 'rgba(239,68,68,0.15)', 
                  color: '#ef4444', 
                  border: '1px solid rgba(239,68,68,0.4)', 
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={() => setShowRejectForm(true)}
                disabled={actionLoading}
              >
                ❌ Reject with Feedback
              </button>
            </div>
          ) : (
            <div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">Feedback for Submitter (required)</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '100px', resize: 'vertical' }}
                  placeholder="Explain why this submission is being rejected. Be constructive and specific..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={actionLoading}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  style={{ 
                    background: 'rgba(239,68,68,0.15)', 
                    color: '#ef4444', 
                    border: '1px solid rgba(239,68,68,0.4)', 
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  onClick={handleReject}
                  disabled={actionLoading || !feedback.trim()}
                >
                  {actionLoading ? <span className="spinner" /> : '❌ Confirm Rejection'}
                </button>
                <button
                  className="btn"
                  style={{ 
                    background: 'rgba(107,114,128,0.15)', 
                    color: '#6b7280', 
                    border: '1px solid rgba(107,114,128,0.4)', 
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setShowRejectForm(false);
                    setFeedback('');
                  }}
                  disabled={actionLoading}
                >
                  ← Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
