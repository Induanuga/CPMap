import { Fragment, useEffect, useState } from 'react';
import api from '../api/axios';

const STATUS_COLOR = {
  pending: '#ffb535',
  approved: '#00c97d',
  rejected: '#ff5572',
};

const STATUS_LABEL = {
  pending: '⏳ Pending',
  approved: '✅ Approved',
  rejected: '❌ Rejected',
};

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function MySubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(10);
  const [expandedId, setExpandedId] = useState(null);
  // Change 14: view modal state
  const [viewModal, setViewModal] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const getSubmissionFeedback = (submission) =>
    submission.moderatorFeedback || submission.moderationNote || '';

  // Fetch submissions
  const fetchSubmissions = async (pageNum = 1) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/career-paths/submissions/my-submissions', {
        params: { page: pageNum, limit },
      });
      setSubmissions(response.data.submissions || []);
      setTotalPages(response.data.totalPages || 1);
      setPage(pageNum);
    } catch (err) {
      console.error('Fetch submissions error:', err);
      const message = err.response?.data?.message || err.message || 'Failed to load submissions.';
      setError(message);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions(1);
  }, []);

  const handlePrevPage = () => {
    if (page > 1) fetchSubmissions(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) fetchSubmissions(page + 1);
  };

  // Change 14: fetch and show full career path in modal
  const handleView = async (id) => {
    setViewLoading(true);
    try {
      const res = await api.get(`/career-paths/${id}`);
      setViewModal(res.data.path);
    } catch (err) {
      console.error('View submission error:', err);
    } finally {
      setViewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading your submissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="submissions-header">
        <h1>📋 My Submissions</h1>
        <p className="subtitle">View and track all your career path submissions</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {submissions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <h2>No Submissions Yet</h2>
          <p>You haven't submitted any career paths. Start by going to your dashboard to create one!</p>
        </div>
      ) : (
        <>
          <div className="submissions-table-wrapper glass-card">
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Submission ID</th>
                  <th>Career Path Name</th>
                  <th>Submission Date</th>
                  <th>Status</th>
                  <th>Feedback</th>
                  {/* Detailed View column */}
                  <th>Detailed View</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <Fragment key={submission._id}>
                    <tr key={submission._id} className="submission-row">
                      <td className="cell-id">
                        <code>{submission._id.slice(-8)}</code>
                      </td>
                      <td className="cell-title">{submission.title}</td>
                      <td className="cell-date">{formatDate(submission.createdAt)}</td>
                      <td className="cell-status">
                        <span
                          className="status-badge"
                          style={{ backgroundColor: `${STATUS_COLOR[submission.status]}20`, color: STATUS_COLOR[submission.status] }}
                        >
                          {STATUS_LABEL[submission.status]}
                        </span>
                      </td>
                      <td className="cell-feedback">
                        {getSubmissionFeedback(submission) ? (
                          <button
                            className="btn-feedback"
                            onClick={() => setExpandedId(expandedId === submission._id ? null : submission._id)}
                            title="View feedback"
                          >
                            💬
                          </button>
                        ) : submission.status === 'approved' ? (
                          ''
                        ) : (
                          <span className="no-feedback">No feedback yet</span>
                        )}
                      </td>
                      {/* Detailed View button */}
                      <td className="cell-view" style={{ textAlign: 'center' }}>
                        <button
                          style={{
                            background: 'rgba(91,82,224,0.12)',
                            color: 'var(--primary)',
                            border: '1px solid rgba(91,82,224,0.3)',
                            borderRadius: '6px',
                            padding: '0.4rem 0.85rem',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            whiteSpace: 'nowrap',
                          }}
                          onClick={() => handleView(submission._id)}
                        >
                          🔍 Detailed View
                        </button>
                      </td>
                    </tr>

                    {expandedId === submission._id && (
                      <tr className="feedback-row">
                        <td colSpan="6" className="feedback-row-cell">
                          <div className="feedback-expandable">
                            <div className="feedback-content">
                              <div className="feedback-header">
                                <h3>Moderator Feedback</h3>
                                <button
                                  className="btn-close"
                                  onClick={() => setExpandedId(null)}
                                  title="Close feedback"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="feedback-body">
                                <p className="feedback-title">
                                  <strong>{submission.title}</strong>
                                </p>
                                <p className="feedback-status">
                                  Status: <span style={{ color: STATUS_COLOR[submission.status] }}>{STATUS_LABEL[submission.status]}</span>
                                </p>
                                {submission.moderatedBy && (
                                  <p className="feedback-moderator">
                                    Reviewed by: <strong>{submission.moderatedBy.name}</strong> ({submission.moderatedBy.email})
                                  </p>
                                )}
                                <div className="feedback-note">
                                  <strong>Feedback:</strong>
                                  <p>{getSubmissionFeedback(submission)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}

      {/* Change 14: View Modal */}
      {viewModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewModal(null); }}
        >
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '1.75rem', maxWidth: 720, width: '100%',
            maxHeight: '85vh', overflowY: 'auto', position: 'relative',
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>
                  {viewModal.title}
                </h2>
                {viewModal.category && (
                  <span style={{ fontSize: '0.78rem', background: 'rgba(91,82,224,0.12)', color: 'var(--primary)', padding: '0.2rem 0.6rem', borderRadius: 20, fontWeight: 600 }}>
                    {viewModal.category}
                  </span>
                )}
              </div>
              <button
                onClick={() => setViewModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)', padding: '0.25rem', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Description */}
            {viewModal.description && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                {viewModal.description}
              </p>
            )}

            {/* Stages */}
            {viewModal.stages && viewModal.stages.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                  Career Stages
                </div>
                {viewModal.stages.map((stage, i) => (
                  <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '0.9rem 1rem', marginBottom: '0.6rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                      <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, marginRight: '0.5rem' }}>{i + 1}</span>
                      {stage.stageName}
                    </div>
                    {stage.education && <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>Education: {stage.education}</div>}
                    {stage.ageRange && <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>Age: {stage.ageRange}</div>}
                    {stage.skills && stage.skills.length > 0 && (
                      <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                        Skills: {Array.isArray(stage.skills) ? stage.skills.join(', ') : stage.skills}
                      </div>
                    )}
                    {stage.suggestions && (
                      <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: '0.3rem', fontStyle: 'italic' }}>
                        "{stage.suggestions}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Transitions */}
            {viewModal.transitions && viewModal.transitions.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                  Transitions
                </div>
                {viewModal.transitions.map((tr, i) => (
                  <div key={i} style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 8, padding: '0.9rem 1rem', marginBottom: '0.6rem', fontSize: '0.83rem' }}>
                    <div style={{ fontWeight: 600, color: '#14b8a6', marginBottom: '0.3rem' }}>
                      {tr.fromStage} → {tr.toStage}
                    </div>
                    {tr.reasonChosen && <div style={{ color: 'var(--text-muted)' }}>Reason: {tr.reasonChosen}</div>}
                    {tr.advice && <div style={{ color: 'var(--text-muted)' }}>Advice: {tr.advice}</div>}
                    {tr.mistakes && <div style={{ color: 'var(--text-muted)' }}>Mistakes to avoid: {tr.mistakes}</div>}
                    {tr.optionsAvailable && tr.optionsAvailable.length > 0 && (
                      <div style={{ color: 'var(--text-muted)' }}>
                        Options: {Array.isArray(tr.optionsAvailable) ? tr.optionsAvailable.join(', ') : tr.optionsAvailable}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading overlay for view fetch */}
      {viewLoading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40 }}></div>
        </div>
      )}

      <style jsx>{`
        .submissions-header {
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-light);
        }

        .submissions-header h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: var(--text);
        }

        .submissions-header .subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
        }

        .error-banner {
          background: rgba(255, 85, 114, 0.15);
          border: 1px solid var(--danger);
          color: var(--danger);
          padding: 1rem;
          border-radius: var(--radius-md);
          margin-bottom: 1.5rem;
          font-size: 0.92rem;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          text-align: center;
          border: 2px dashed var(--border);
          border-radius: var(--radius-lg);
          background: rgba(91, 82, 224, 0.03);
        }

        .empty-state-icon {
          font-size: 3.5rem;
          margin-bottom: 1rem;
        }

        .empty-state h2 {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
          color: var(--text);
        }

        .empty-state p {
          color: var(--text-muted);
          max-width: 400px;
        }

        .submissions-table-wrapper {
          overflow-x: auto;
          margin-bottom: 2rem;
        }

        .submissions-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.92rem;
        }

        .submissions-table thead {
          background: var(--surface-3);
          border-bottom: 2px solid var(--border);
        }

        .submissions-table th {
          padding: 1rem;
          text-align: left;
          font-weight: 600;
          color: var(--text);
          text-transform: uppercase;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
        }

        .submission-row {
          border-bottom: 1px solid var(--border-light);
          transition: var(--transition-fast);
        }

        .submission-row:hover {
          background: rgba(108, 99, 255, 0.08);
        }

        .feedback-row {
          background: transparent;
        }

        .submissions-table td {
          padding: 1rem;
          vertical-align: top;
        }

        .feedback-row-cell {
          padding: 0 !important;
        }

        .cell-id code {
          font-family: 'Courier New', monospace;
          background: var(--surface-3);
          padding: 0.3rem 0.6rem;
          border-radius: 4px;
          font-size: 0.8rem;
          color: var(--accent);
        }

        .cell-title {
          font-weight: 500;
          color: var(--text);
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cell-date {
          color: var(--text-muted);
          white-space: nowrap;
        }

        .cell-status {
          text-align: center;
        }

        .status-badge {
          display: inline-block;
          padding: 0.4rem 0.8rem;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .cell-feedback {
          text-align: center;
        }

        .btn-feedback {
          background: none;
          border: none;
          font-size: 1.3rem;
          cursor: pointer;
          padding: 0.4rem 0.8rem;
          border-radius: 4px;
          transition: var(--transition-fast);
        }

        .btn-feedback:hover {
          background: var(--surface-3);
        }

        .no-feedback {
          color: var(--text-dim);
          font-size: 0.85rem;
          white-space: nowrap;
        }

        .feedback-expandable {
          background: var(--surface-2);
          border: 1px solid var(--border);
          padding: 1.5rem;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .feedback-content {
          max-width: 100%;
        }

        .feedback-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-light);
        }

        .feedback-header h3 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
        }

        .btn-close {
          background: none;
          border: none;
          font-size: 1.2rem;
          cursor: pointer;
          color: var(--text-muted);
          transition: var(--transition-fast);
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-close:hover {
          color: var(--text);
        }

        .feedback-body {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }

        .feedback-title {
          font-weight: 600;
          color: var(--text);
        }

        .feedback-status {
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .feedback-moderator {
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .feedback-note {
          background: rgba(108, 99, 255, 0.08);
          border-left: 3px solid var(--primary);
          padding: 1rem;
          border-radius: 4px;
          margin-top: 0.5rem;
        }

        .feedback-note strong {
          display: block;
          margin-bottom: 0.5rem;
          color: var(--text);
        }

        .feedback-note p {
          color: var(--text);
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 60vh;
          gap: 1rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .loading-container p {
          color: var(--text-muted);
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .submissions-header h1 {
            font-size: 1.5rem;
          }

          .submissions-table {
            font-size: 0.85rem;
          }

          .submissions-table th,
          .submissions-table td {
            padding: 0.7rem;
          }

          .cell-title {
            max-width: 150px;
          }
        }
      `}</style>
    </div>
  );
}
