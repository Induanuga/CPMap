import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';

function StatusBadge({ status }) {
  const styles = {
    pending:  { background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)' },
    approved: { background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.35)' },
    rejected: { background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)' },
  };

  return (
    <span style={{ ...styles[status], borderRadius: '999px', padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

export default function AdminCareerPath() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPath() {
      try {
        const res = await api.get(`/career-paths/${id}`);
        setPath(res.data.path);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load career path.');
      } finally {
        setLoading(false);
      }
    }
    fetchPath();
  }, [id]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="empty-state"><div className="empty-icon">⏳</div><h3>Loading career path…</h3></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--border)' }}>
          <h2 style={{ marginBottom: '1rem' }}>Error</h2>
          <p style={{ color: '#ef4444' }}>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ paddingBottom: '3rem' }}>
      <div className="search-hero">
        <h1>{path.title}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>{path.description}</p>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{path.category}</span>
            <StatusBadge status={path.status} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
            ← Back to admin list
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {path.submittedBy && (
            <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Submitted by</div>
              <div style={{ fontWeight: 700 }}>{path.submittedBy.name}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>{path.submittedBy.email}</div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Role: {path.submittedBy.role}</div>
            </div>
          )}
          {path.submitterName && (
            <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Individual profile</div>
              <div style={{ fontWeight: 700 }}>{path.submitterName}</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{path.submitterGender ? `Gender: ${path.submitterGender}` : 'Gender: N/A'}</div>
              {path.submitterBackground && <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>Background: {path.submitterBackground}</div>}
              {path.submitterEconomicStatus && <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>Economic status: {path.submitterEconomicStatus}</div>}
            </div>
          )}
          <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Dates & status</div>
            <div><strong>Created:</strong> {new Date(path.createdAt).toLocaleDateString()}</div>
            {path.moderatedBy && <div style={{ marginTop: '0.5rem' }}><strong>Moderated by:</strong> {path.moderatedBy.name}</div>}
            {path.moderationNote && <div style={{ marginTop: '0.5rem' }}><strong>Note:</strong> {path.moderationNote}</div>}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Career Path Details</h2>
        <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          <div><strong>Description:</strong> {path.description || 'No description provided.'}</div>
          {path.submitterEducationHistory && <div><strong>Education history:</strong> {path.submitterEducationHistory}</div>}
          {path.submitterSkills?.length > 0 && <div><strong>Skills:</strong> {path.submitterSkills.join(', ')}</div>}
          {path.stages?.length > 0 && <div><strong>Stages:</strong> {path.stages.length}</div>}
          {path.transitions?.length > 0 && <div><strong>Transitions:</strong> {path.transitions.length}</div>}
        </div>
      </div>

      {path.stages?.length > 0 && (
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Stages</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {path.stages.map((stage, idx) => (
              <div key={idx} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>{idx + 1}. {stage.stageName || `Stage ${idx + 1}`}</h3>
                {stage.ageRange && <div style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>Age range: {stage.ageRange}</div>}
                {stage.education && <div style={{ marginTop: '0.75rem' }}><strong>Education:</strong> {stage.education}</div>}
                {stage.skills?.length > 0 && <div style={{ marginTop: '0.5rem' }}><strong>Skills:</strong> {stage.skills.join(', ')}</div>}
                {stage.experience && <div style={{ marginTop: '0.5rem' }}><strong>Experience:</strong> {stage.experience}</div>}
                {stage.livingConditions && <div style={{ marginTop: '0.5rem' }}><strong>Living conditions:</strong> {stage.livingConditions}</div>}
                {stage.helpReceived && <div style={{ marginTop: '0.5rem' }}><strong>Help received:</strong> {stage.helpReceived}</div>}
                {stage.suggestions && <div style={{ marginTop: '0.5rem' }}><strong>Suggestions:</strong> {stage.suggestions}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {path.transitions?.length > 0 && (
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Transitions</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {path.transitions.map((transition, idx) => (
              <div key={idx} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{transition.fromStage} → {transition.toStage}</div>
                {transition.optionsAvailable?.length > 0 && <div style={{ marginTop: '0.5rem' }}><strong>Options available:</strong> {transition.optionsAvailable.join(', ')}</div>}
                {transition.reasonChosen && <div style={{ marginTop: '0.5rem' }}><strong>Reason chosen:</strong> {transition.reasonChosen}</div>}
                {transition.mistakes && <div style={{ marginTop: '0.5rem' }}><strong>Mistakes:</strong> {transition.mistakes}</div>}
                {transition.advice && <div style={{ marginTop: '0.5rem' }}><strong>Advice:</strong> {transition.advice}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
