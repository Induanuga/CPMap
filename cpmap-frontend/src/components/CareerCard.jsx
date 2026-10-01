import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

const STAGE_TYPE_LABEL = {
  school:        'School',
  undergraduate: 'Undergraduate',
  postgraduate:  'Postgraduate',
  training:      'Training',
  job:           'Career',
  senior_role:   'Senior Role',
};

function resolveType(stage) {
  if (stage.stageType) return stage.stageType;
  const n = (stage.stageName || '').toLowerCase();
  if (n.includes('school') || n.includes('secondary')) return 'school';
  if (n.includes('peak') || n.includes('senior')) return 'senior_role';
  if (n.includes('early career') || n.includes('career in') || n.includes('job')) return 'job';
  if (n.includes('bachelor') || n.includes('undergraduate') || n.includes('college') ||
      n.includes('university') || n.includes('b.a') || n.includes('b.s')) return 'undergraduate';
  if (n.includes('master') || n.includes('ph.d') || n.includes('postgrad')) return 'postgraduate';
  return 'job';
}

function StageRow({ stage, index, isMatched, isNext, isLast }) {
  const type = resolveType(stage);
  const icon = STAGE_ICONS[type] || '📍';
  const what = stage.what || stage.stageName || `Stage ${index + 1}`;
  const where = stage.where || stage.education || '';
  const year = stage.year || stage.ageRange || '';

  const bgHighlight = isMatched
    ? 'rgba(198, 229, 255, 0.45)'
    : isNext
    ? 'rgba(70, 84, 139, 0.08)'
    : 'var(--surface-2)';

  const borderStyle = isMatched
    ? '1.5px solid var(--primary)'
    : isNext
    ? '1.5px dashed var(--primary-light)'
    : '1px solid var(--border-light)';

  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
      {/* Icon node */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 26 }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: isMatched ? 'var(--primary)' : isNext ? 'var(--primary-light)' : 'var(--surface-3)',
          color: isMatched || isNext ? '#fff' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 700,
        }}>
          {icon}
        </div>
        {!isLast && (
          <div style={{ width: 2, height: 16, background: 'var(--border-light)', margin: '2px 0' }} />
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8,
        background: bgHighlight, border: borderStyle,
      }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem',
        }}>
          {STAGE_TYPE_LABEL[type] || type}
          {isMatched && ' · YOU ARE HERE'}
          {isNext && ' · NEXT STEP'}
        </div>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>
          {what}
        </div>
        {(where || year) && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {where && <span>📍 {where}</span>}
            {where && year && <span> · </span>}
            {year && <span>{year}</span>}
          </div>
        )}
        {stage.skills?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem' }}>
            {stage.skills.map(s => (
              <span key={s} className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Google Search Result Card ─────────────────────────────────────────────────
export default function CareerCard({ career, rank }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const catIcon = CATEGORY_ICONS[career.category] || '🎯';
  const stages = career.stages || [];

  const matchedStageIndex = career.matchedStageIndex ?? -1;
  const matchedStage = career.matchedStage || null;
  const nextStage = career.nextStage || null;

  const matchedSkills = [...new Set(career.matchedSkills || [])].slice(0, 5);

  const handleCardClick = () => {
    navigate(`/career-path/${career._id}`, {
      state: {
        matchedStageIndex,
        matchedStage,
        nextStage,
        finalScore: career.finalScore,
        matchedSkills: career.matchedSkills,
      }
    });
  };

  const scorePct = Math.round((career.finalScore || career.score || 0) * 100);

  return (
    <div
      className="glass-card"
      style={{
        padding: '1.25rem 1.5rem',
        borderRadius: 'var(--radius-md)',
        transition: 'var(--transition)',
        position: 'relative',
      }}
    >
      {/* ── 1. Google Search Breadcrumb & Metadata Line ───────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        marginBottom: '0.35rem',
      }}>
        {/* Favicon + Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <div style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'rgba(198, 229, 255, 0.45)',
            border: '1px solid rgba(70, 84, 139, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            flexShrink: 0,
          }}>
            {catIcon}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>cpmap</span>
            <span>›</span>
            <span>{career.category || 'Career Path'}</span>
            {career.submitterName && (
              <>
                <span>›</span>
                <span style={{ color: 'var(--text-dim)' }}>{career.submitterName}</span>
              </>
            )}
          </div>
        </div>

        {/* Rank & Match Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {rank !== undefined && (
            <span style={{
              background: 'rgba(70, 84, 139, 0.08)',
              color: 'var(--primary)',
              fontWeight: 700,
              fontSize: '0.72rem',
              padding: '0.15rem 0.5rem',
              borderRadius: 4,
              border: '1px solid rgba(70, 84, 139, 0.18)',
            }}>
              #{rank}
            </span>
          )}
          {scorePct > 0 && (
            <span style={{
              background: scorePct >= 70 ? 'rgba(46, 158, 107, 0.12)' : 'rgba(198, 229, 255, 0.5)',
              color: scorePct >= 70 ? 'var(--success)' : 'var(--primary)',
              border: `1px solid ${scorePct >= 70 ? 'rgba(46, 158, 107, 0.25)' : 'rgba(70, 84, 139, 0.2)'}`,
              fontWeight: 700,
              fontSize: '0.74rem',
              padding: '0.15rem 0.55rem',
              borderRadius: 20,
            }}>
              {scorePct}% Match
            </span>
          )}
        </div>
      </div>

      {/* ── 2. Clickable Google Search Headline ───────────────────────── */}
      <h2
        onClick={handleCardClick}
        style={{
          fontSize: '1.2rem',
          fontWeight: 600,
          color: 'var(--primary)',
          cursor: 'pointer',
          marginBottom: '0.4rem',
          lineHeight: 1.35,
          textDecoration: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
      >
        {career.title}
        {career.submitterName && (
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '1.05rem' }}>
            {' '}— {career.submitterName}
          </span>
        )}
      </h2>

      {/* ── 3. Google Snippet / Description ───────────────────────────── */}
      <p style={{
        fontSize: '0.88rem',
        color: 'var(--text)',
        lineHeight: 1.55,
        marginBottom: '0.75rem',
        maxWidth: 820,
      }}>
        {career.description || `Career path in ${career.category || 'Professional Domain'}. Contains ${stages.length} documented career stages with transitions and advice.`}
      </p>

      {/* ── 4. Google Rich Snippet (Pathway: You Are Here → Next Step) ── */}
      {matchedStage && (
        <div style={{
          background: 'rgba(198, 229, 255, 0.28)',
          border: '1px solid rgba(70, 84, 139, 0.18)',
          borderRadius: 8,
          padding: '0.65rem 0.9rem',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.6rem',
          fontSize: '0.82rem',
        }}>
          {/* Matched stage */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{
              background: 'var(--primary)',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0.12rem 0.4rem',
              borderRadius: 4,
              textTransform: 'uppercase',
            }}>
              You Are Here
            </span>
            <strong style={{ color: 'var(--text)' }}>
              {matchedStage.what || matchedStage.stageName}
            </strong>
            {matchedStage.where && (
              <span style={{ color: 'var(--text-muted)' }}>({matchedStage.where})</span>
            )}
          </div>

          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>➔</span>

          {/* Next stage */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{
              background: nextStage ? 'rgba(70, 84, 139, 0.12)' : 'rgba(46, 158, 107, 0.15)',
              color: nextStage ? 'var(--primary)' : 'var(--success)',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0.12rem 0.4rem',
              borderRadius: 4,
              textTransform: 'uppercase',
            }}>
              {nextStage ? 'Next Step' : 'Goal'}
            </span>
            <strong style={{ color: nextStage ? 'var(--primary)' : 'var(--success)' }}>
              {nextStage ? (nextStage.what || nextStage.stageName) : 'Final stage reached!'}
            </strong>
            {nextStage?.where && (
              <span style={{ color: 'var(--text-muted)' }}>({nextStage.where})</span>
            )}
          </div>
        </div>
      )}

      {/* ── 5. Matched Skills / Sitelink Chips ────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.6rem',
        borderTop: '1px solid var(--border-light)',
        paddingTop: '0.65rem',
      }}>
        {/* Skills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          {matchedSkills.length > 0 ? (
            <>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                Matched skills:
              </span>
              {matchedSkills.map(sk => (
                <span
                  key={sk}
                  style={{
                    background: 'rgba(198, 229, 255, 0.45)',
                    color: 'var(--primary-dark)',
                    border: '1px solid rgba(70, 84, 139, 0.18)',
                    borderRadius: 14,
                    padding: '0.12rem 0.5rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                  }}
                >
                  {sk}
                </span>
              ))}
            </>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {stages.length} career stages
            </span>
          )}
        </div>

        {/* Actions (Google Sitelink style) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.2rem 0.4rem',
            }}
          >
            <span>{expanded ? '▲ Hide Timeline' : '▼ Preview Timeline'}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCardClick}
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
          >
            View Path ➔
          </button>
        </div>
      </div>

      {/* ── 6. Expandable Inline Timeline (Google Instant Sitelink) ──── */}
      {expanded && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '0.9rem',
          borderTop: '1px dashed var(--border-light)',
        }}>
          <div style={{
            fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)',
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.75rem',
          }}>
            Complete Career Journey ({stages.length} stages)
          </div>
          {stages.map((stage, i) => (
            <StageRow
              key={i}
              stage={stage}
              index={i}
              isMatched={i === matchedStageIndex}
              isNext={i === matchedStageIndex + 1}
              isLast={i === stages.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
