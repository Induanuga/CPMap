import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../api/axios';

const CATEGORY_ICONS = {
  'Engineering & Tech':          '💻',
  'Medical':                     '🏥',
  'Commerce & Management':       '📊',
  'Creative Fields':             '🎨',
  'Skilled Trades':              '🛠️',
  'Government Jobs':             '🏛️',
  'Government & Public Service': '🏛️',
  'Rural / Non-traditional':     '🌾',
  'Sports & Athletics':          '🏅',
  'Research & Academia':         '🔬',
  'Law & Administration':        '⚖️',
  'Other':                       '🎯',
};

const STAGE_ICONS = {
  school:        '🏫',
  undergraduate: '🎓',
  postgraduate:  '🎓',
  training:      '📚',
  job:           '💼',
  senior_role:   '🏆',
};

const STAGE_COLORS = {
  school:        'var(--primary)',
  undergraduate: 'var(--primary)',
  postgraduate:  'var(--primary)',
  training:      'var(--primary)',
  job:           'var(--primary)',
  senior_role:   'var(--primary)',
};

function resolveType(stage) {
  if (stage.stageType) return stage.stageType;
  const n = (stage.stageName || stage.what || stage.education || '').toLowerCase();
  if (n.includes('school') || n.includes('secondary') || n.includes('10th') || n.includes('12th')) return 'school';
  if (n.includes('peak') || n.includes('senior') || n.includes('lead') || n.includes('manager')) return 'senior_role';
  if (n.includes('early career') || n.includes('job') || n.includes('developer') || n.includes('engineer') || n.includes('work')) return 'job';
  if (n.includes('bachelor') || n.includes('undergraduate') || n.includes('college') ||
      n.includes('university') || n.includes('b.a') || n.includes('b.s') || n.includes('b.tech')) return 'undergraduate';
  if (n.includes('master') || n.includes('ph.d') || n.includes('postgrad') || n.includes('m.tech') || n.includes('mba')) return 'postgraduate';
  return 'job';
}

export default function CareerPathDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [career, setCareer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search recommendation state passed via navigate(..., { state: {...} })
  const navState = location.state || {};
  const matchedStageIndex = navState.matchedStageIndex ?? -1;
  const matchedStage      = navState.matchedStage || null;
  const nextStage         = navState.nextStage    || null;
  const finalScore        = navState.finalScore   || null;
  const matchedSkills     = navState.matchedSkills || [];

  useEffect(() => {
    async function fetchCareerPath() {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/career-paths/${id}`);
        setCareer(res.data.path || res.data);
      } catch (err) {
        console.error('Error fetching career path details:', err);
        setError(err.response?.data?.message || 'Failed to load career path details.');
      } finally {
        setLoading(false);
      }
    }
    fetchCareerPath();
  }, [id]);

  if (loading) {
    return (
      <div className="page-container" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '2rem auto' }} />
        <h3>Loading career path details…</h3>
      </div>
    );
  }

  if (error || !career) {
    return (
      <div className="page-container" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h3>{error || 'Career path not found'}</h3>
        <button className="btn btn-primary" onClick={() => navigate('/search')} style={{ marginTop: '1.5rem' }}>
          ← Back to Search Page
        </button>
      </div>
    );
  }

  const catIcon = CATEGORY_ICONS[career.category] || '🎯';
  const stages = career.stages || [];
  const transitions = career.transitions || [];

  return (
    <div className="page-container" style={{ paddingBottom: '4rem' }}>
      {/* Back button */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          ← Back to Search Results
        </button>
      </div>

      {/* Main Header Card */}
      <div className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '2rem' }}>{catIcon}</span>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text)' }}>{career.title}</h1>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <span className="badge badge-primary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>
                {career.category}
              </span>
              <span className="badge badge-accent" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>
                {stages.length} Stages
              </span>
              {career.status && (
                <span className={`badge ${career.status === 'approved' ? 'badge-success' : 'badge-warning'}`}
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem', textTransform: 'capitalize' }}>
                  {career.status}
                </span>
              )}
            </div>
          </div>

          {finalScore !== null && (
            <div style={{
              background: 'rgba(91,82,224,0.08)',
              border: '1.5px solid rgba(91,82,224,0.25)',
              borderRadius: 12,
              padding: '0.85rem 1.25rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                {Math.round(finalScore * 100)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Match Score
              </div>
            </div>
          )}
        </div>

        {career.description && (
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: '0.5rem' }}>
            {career.description}
          </p>
        )}

        {/* Matched skills from search */}
        {matchedSkills.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)' }}>Your Matched Skills:</span>
            {matchedSkills.map(sk => (
              <span key={sk} className="badge badge-warning" style={{ fontSize: '0.75rem' }}>{sk}</span>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Match Step Callout (if coming from search) */}
      {matchedStage && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem', borderLeft: '5px solid var(--primary)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>
            🎯 Personalised Match Result
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>
            You match Stage {matchedStageIndex + 1}: {matchedStage.what || matchedStage.education || matchedStage.stageName}
          </div>
          {nextStage ? (
            <div style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>
              🚀 Next Recommended Step: Stage {matchedStageIndex + 2} — {nextStage.what || nextStage.education || nextStage.stageName}
            </div>
          ) : (
            <div style={{ fontSize: '0.9rem', color: 'var(--success)', fontWeight: 600 }}>
              🏆 You are at the final stage of this career path!
            </div>
          )}
        </div>
      )}

      {/* Submitter Personal Info / Context & Background (above stages) */}
      {(career.submitterBackground || career.submitterEconomicStatus || career.submitterEducationHistory || career.submitterGender) && (
        <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text)' }}>
            👤 Submitter Context & Background
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
            {career.submitterBackground && (
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Background: </span>
                <span>{career.submitterBackground}</span>
              </div>
            )}
            {career.submitterEconomicStatus && (
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Economic Status: </span>
                <span>{career.submitterEconomicStatus}</span>
              </div>
            )}
            {career.submitterGender && (
              <div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Gender: </span>
                <span>{career.submitterGender}</span>
              </div>
            )}
            {career.submitterEducationHistory && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Education Path: </span>
                <span>{career.submitterEducationHistory}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stages & Transitions Timeline */}
      <div style={{ marginBottom: '3rem' }}>
        <h2 className="section-title" style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>
          📍 Complete Career Timeline
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {stages.map((stage, idx) => {
            const type = resolveType(stage);
            const icon = STAGE_ICONS[type] || '📍';
            const color = STAGE_COLORS[type] || 'var(--primary)';
            const isMatched = idx === matchedStageIndex;
            const isNext = idx === matchedStageIndex + 1;

            // Find transition coming out of this stage
            const transition = transitions.find(
              t => t.fromStage === stage.stageName || t.fromStage === stage.education || idx === transitions.indexOf(t)
            ) || (career.transitions && career.transitions[idx]);

            return (
              <div key={idx}>
                {/* Stage Box */}
                <div className="glass-card" style={{
                  padding: '1.5rem',
                  borderLeft: isMatched ? '5px solid var(--primary)' : isNext ? '5px dashed var(--primary-light)' : '5px solid rgba(70, 84, 139, 0.35)',
                  background: isMatched ? 'rgba(198, 229, 255, 0.35)' : isNext ? 'rgba(70, 84, 139, 0.05)' : 'rgba(255,255,255,0.9)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.4rem' }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Stage {idx + 1} {isMatched ? '· You Are Here' : isNext ? '· Next Step' : ''}
                        </div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                          {stage.what || stage.education || stage.stageName || `Stage ${idx + 1}`}
                        </h3>
                      </div>
                    </div>

                    {stage.ageRange && (
                      <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        ⏳ {stage.ageRange}
                      </span>
                    )}
                  </div>

                  {/* Stage Grid details */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                    {stage.education && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                          🎓 Education
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text)', marginTop: '0.2rem' }}>
                          {stage.education}
                        </div>
                      </div>
                    )}

                    {stage.where && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                          📍 Institution / Location
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text)', marginTop: '0.2rem' }}>
                          {stage.where}
                        </div>
                      </div>
                    )}

                    {stage.livingConditions && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                          🏠 Living Conditions
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text)', marginTop: '0.2rem' }}>
                          {stage.livingConditions}
                        </div>
                      </div>
                    )}

                    {stage.helpReceived && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                          🤝 Help & Support Received
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text)', marginTop: '0.2rem' }}>
                          {stage.helpReceived}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Skills Gained */}
                  {stage.skills && stage.skills.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                        🛠️ Skills Gained
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {stage.skills.map(s => (
                          <span key={s} className="badge badge-primary" style={{ fontSize: '0.72rem' }}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Work Experience */}
                  {stage.experience && (
                    <div style={{ marginTop: '1rem', background: 'var(--surface-2)', padding: '0.75rem 1rem', borderRadius: 8 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        💼 Work Experience
                      </div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.6 }}>
                        {stage.experience}
                      </div>
                    </div>
                  )}

                  {/* Advice & Suggestions - High contrast visible text with theme colors */}
                  {stage.suggestions && (
                    <div style={{
                      marginTop: '1rem',
                      background: 'rgba(198, 229, 255, 0.45)',
                      border: '1px solid rgba(70, 84, 139, 0.25)',
                      padding: '0.85rem 1rem',
                      borderRadius: 8,
                    }}>
                      <div style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: 'var(--primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: '0.35rem',
                      }}>
                        💡 Advice for Others at this Stage
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.6 }}>
                        {stage.suggestions}
                      </div>
                    </div>
                  )}
                </div>

                {/* Transition Arrow / Card if not last stage */}
                {idx < stages.length - 1 && (
                  <div style={{
                    margin: '1rem 0 1rem 1.5rem',
                    padding: '1rem 1.25rem',
                    border: '1.5px dashed rgba(70, 84, 139, 0.35)',
                    borderRadius: 10,
                    background: 'rgba(198, 229, 255, 0.25)'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>↓</span> Transition to Stage {idx + 2}
                    </div>

                    {transition ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.84rem' }}>
                        {transition.reasonChosen && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Why chosen: </span>
                            <span style={{ color: 'var(--text)' }}>{transition.reasonChosen}</span>
                          </div>
                        )}
                        {transition.optionsAvailable && transition.optionsAvailable.length > 0 && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Options considered: </span>
                            <span style={{ color: 'var(--text)' }}>
                              {Array.isArray(transition.optionsAvailable)
                                ? transition.optionsAvailable.join(', ')
                                : transition.optionsAvailable}
                            </span>
                          </div>
                        )}
                        {transition.advice && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Decision advice: </span>
                            <span style={{ color: 'var(--text)' }}>{transition.advice}</span>
                          </div>
                        )}
                        {transition.mistakes && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--danger)' }}>Mistakes to avoid: </span>
                            <span style={{ color: 'var(--text)' }}>{transition.mistakes}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        Transition to next career stage
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* O*NET Skills (if available) */}
      {career.onetSkills && career.onetSkills.length > 0 && (
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text)' }}>
            🧠 Standardised O*NET Skills Taxonomy
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {career.onetSkills.map((sk, i) => (
              <span key={i} className="badge badge-ghost" style={{ fontSize: '0.75rem' }}>
                {sk.skillName || sk}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
