import { useState, useEffect } from 'react';
import api from '../api/axios';

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const BACKGROUNDS = ['Rural', 'Urban', 'Semi-Urban', 'Tribal'];
const ECONOMICS = ['Poor', 'Middle', 'Rich'];

const CATEGORIES = [
  'Engineering & Tech', 'Medical', 'Commerce & Management',
  'Creative Fields', 'Skilled Trades', 'Government Jobs',
  'Rural / Non-traditional', 'Other',
];

// Change 9: education entry placeholders
const EDU_PLACEHOLDERS = [
  'e.g. 10th at XYZ School',
  'e.g. 12th MPC',
  'e.g. B.Tech CSE, ABC College',
];

// Change 11: empty stage now includes inline transition
const emptyStage = () => ({
  stageName: '', education: '', skills: '', experience: '',
  livingConditions: '', helpReceived: '', suggestions: '', ageRange: '',
  transition: { optionsAvailable: '', reasonChosen: '', advice: '', mistakes: '' },
});

function TagInput({ value, onChange, placeholder, index = 0 }) {
  const tags = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  const [input, setInput] = useState('');
  const id = `tag-cpform-${index}-${placeholder.replace(/\s+/g, '-')}`;
  const addTag = (v) => {
    const t = v.trim();
    if (t) onChange([...tags, t].join(', '));
    setInput('');
  };
  const removeTag = (idx) => { const copy = [...tags]; copy.splice(idx, 1); onChange(copy.join(', ')); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
    else if (e.key === 'Backspace' && !input && tags.length > 0) removeTag(tags.length - 1);
  };
  return (
    <div className="tag-input-container" onClick={() => document.getElementById(id)?.focus()}>
      {tags.map((tag, i) => (
        <span key={i} className="tag-item">{tag}
          <button className="tag-remove" onClick={(e) => { e.stopPropagation(); removeTag(i); }}>×</button>
        </span>
      ))}
      <input id={id} className="tag-input-field" value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown} onBlur={() => input && addTag(input)} placeholder={tags.length === 0 ? placeholder : ''} />
    </div>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

export default function CPForm() {
  // Section 1: Personal
  // Change 9: educationHistory → educationEntries (array)
  const [personal, setPersonal] = useState({
    name: '', email: '', gender: '', background: '', economicStatus: '',
    skills: '',
  });
  const [educationEntries, setEducationEntries] = useState(['']);

  // Section 2: Career meta
  const [meta, setMeta] = useState({ title: '', category: '', description: '' });
  // Section 3: Stages (Change 11: transitions removed as separate section)
  const [stages, setStages] = useState([emptyStage()]);

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ msg: '', type: '' });

  // O*NET occupation search state
  const [occSearch, setOccSearch]     = useState('');
  const [occResults, setOccResults]   = useState([]);
  const [occLoading, setOccLoading]   = useState(false);
  const [occDropOpen, setOccDropOpen] = useState(false);

  // Populate category options from O*NET keyword search
  useEffect(() => {
    if (!occSearch.trim() || occSearch.trim().length < 2) {
      setOccResults([]);
      setOccDropOpen(false);
      return;
    }
    const delay = setTimeout(async () => {
      setOccLoading(true);
      try {
        const res = await api.get('/onet/occupations/search', { params: { keyword: occSearch } });
        setOccResults(res.data.occupations || []);
        setOccDropOpen(true);
      } catch {
        setOccResults([]);
      } finally {
        setOccLoading(false);
      }
    }, 350); // debounce
    return () => clearTimeout(delay);
  }, [occSearch]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3200);
  };

  /* ── Stage helpers ── */
  const updateStage = (i, field, val) => {
    const copy = [...stages]; copy[i] = { ...copy[i], [field]: val }; setStages(copy);
  };
  const addStage = () => {
    if (stages.length < 5) setStages([...stages, emptyStage()]);
  };
  const removeStage = (i) => { if (stages.length > 1) setStages(stages.filter((_, idx) => idx !== i)); };

  /* ── Change 11: Inline transition helper ── */
  const updateStageTransition = (i, field, val) => {
    const copy = [...stages];
    copy[i] = { ...copy[i], transition: { ...copy[i].transition, [field]: val } };
    setStages(copy);
  };

  /* ── Change 9: Education entries helpers ── */
  const updateEduEntry = (i, val) => {
    const copy = [...educationEntries]; copy[i] = val; setEducationEntries(copy);
  };
  const addEduEntry = () => setEducationEntries([...educationEntries, '']);
  const removeEduEntry = (i) => {
    if (educationEntries.length > 1) setEducationEntries(educationEntries.filter((_, idx) => idx !== i));
  };

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!meta.title.trim()) { showToast('Career title is required.', 'error'); return; }

    setLoading(true);
    try {
      // Parse skills/options from comma-string to array
      const parseArr = (str) => str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];

      // Change 9: serialize education entries to string
      const educationHistoryStr = educationEntries.filter(Boolean).join(' → ');

      // Build transitions from stages
      const transitions = stages.slice(0, -1).map((s, i) => ({
        fromStage:        s.education || s.experience || `Stage ${i + 1}`,
        toStage:          stages[i + 1].education || stages[i + 1].experience || `Stage ${i + 2}`,
        optionsAvailable: parseArr(s.transition.optionsAvailable),
        reasonChosen:     s.transition.reasonChosen,
        advice:           s.transition.advice,
        mistakes:         s.transition.mistakes,
      }));

      const payload = {
        // Career meta
        title: meta.title,
        category: meta.category || 'Other',
        description: meta.description,

        // Submitter personal info
        submitterName: personal.name,
        submitterEmail: personal.email,
        submitterGender: personal.gender,
        submitterEducationHistory: educationHistoryStr,
        submitterSkills: parseArr(personal.skills),
        submitterBackground: personal.background,
        submitterEconomicStatus: personal.economicStatus,

        // Journey structure
        stages: stages.map((s, i) => ({
          stageName:       s.education || s.experience || `Stage ${i + 1}`,
          what:            s.education || `Stage ${i + 1}`,
          education:       s.education,
          skills:          parseArr(s.skills),
          experience:      s.experience,
          livingConditions: s.livingConditions,
          helpReceived:    s.helpReceived,
          suggestions:     s.suggestions,
          ageRange:        s.ageRange,
        })),
        transitions,
      };
      await api.post('/career-paths/submit', payload);
      showToast('✅ Career path submitted successfully! Thank you for contributing.', 'success');
      // Reset form
      setPersonal({ name: '', email: '', gender: '', background: '', economicStatus: '', skills: '' });
      setEducationEntries(['']);
      setMeta({ title: '', category: '', description: '' });
      setStages([emptyStage()]);
    } catch (err) {
      showToast(err.response?.data?.message || 'Submission failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container cpform-page">
      <Toast msg={toast.msg} type={toast.type} />

      <div className="cpform-header">
        <h1 className="section-title" style={{ fontSize: '2rem' }}>
          ✍️ Share Your <span className="gradient-text" style={{background:'linear-gradient(135deg,var(--primary-light),var(--accent))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Career Path</span>
        </h1>
        <p className="section-subtitle" style={{ marginTop: '0.4rem' }}>
          Help others by documenting your real career journey — stages, decisions, and advice.
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>* indicates required fields</p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Section 1: Career Meta ── */}
        <div className="glass-card cpform-section">
          <div className="cpform-section-title">🎯 Career Information</div>
          <div className="cpform-grid">
            <div className="form-group">
              <label className="form-label">Career Title *</label>
              <input className="form-input" placeholder="e.g., Software Engineer, Doctor, CA..." value={meta.title}
                onChange={e => setMeta({ ...meta, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Professional Domain</label>
              <select
                className="form-select"
                value={meta.category}
                onChange={e => setMeta({ ...meta, category: e.target.value })}
              >
                <option value="">Select category</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group cpform-grid-full">
              <label className="form-label">Brief Description</label>
              <textarea className="form-textarea" placeholder="Summarize this career path in 1–2 sentences..." value={meta.description}
                onChange={e => setMeta({ ...meta, description: e.target.value })} />
            </div>
          </div>
        </div>

        {/* ── Section 2: Personal Details ── */}
        <div className="glass-card cpform-section">
          <div className="cpform-section-title">👤 Personal Background</div>
          <div className="cpform-grid">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" placeholder="Your name (or anonymous)" value={personal.name}
                onChange={e => setPersonal({ ...personal, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="contact@example.com" value={personal.email}
                onChange={e => setPersonal({ ...personal, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-select" value={personal.gender} onChange={e => setPersonal({ ...personal, gender: e.target.value })}>
                <option value="">Prefer not to say</option>
                {GENDERS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Background</label>
              <select className="form-select" value={personal.background} onChange={e => setPersonal({ ...personal, background: e.target.value })}>
                <option value="">Select background</option>
                {BACKGROUNDS.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Economic Status (childhood)</label>
              <select className="form-select" value={personal.economicStatus} onChange={e => setPersonal({ ...personal, economicStatus: e.target.value })}>
                <option value="">Select</option>
                {ECONOMICS.map(ec => <option key={ec}>{ec}</option>)}
              </select>
            </div>
            {/* Change 9: Education History as multiple boxes */}
            <div className="form-group cpform-grid-full">
              <label className="form-label">Education History</label>
              {educationEntries.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    placeholder={EDU_PLACEHOLDERS[i % EDU_PLACEHOLDERS.length]}
                    value={entry}
                    onChange={e => updateEduEntry(i, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {educationEntries.length > 1 && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeEduEntry(i)}
                      style={{ flexShrink: 0 }}>×</button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addEduEntry}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  background: 'none', border: '1.5px dashed var(--border)',
                  color: 'var(--text-muted)', padding: '0.4rem 0.9rem',
                  borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.25rem',
                }}
              >
                ＋ Add More
              </button>
            </div>
            <div className="form-group cpform-grid-full">
              <label className="form-label">Skills (talents and expertise)</label>
              <TagInput value={personal.skills}
                onChange={v => setPersonal({ ...personal, skills: v })}
                placeholder="e.g., Leadership, Python, Auditing, Patient Care — press Enter or comma" />
            </div>
          </div>
        </div>

        {/* ── Section 3: Stages (Change 11: with inline transitions) ── */}
        <div className="glass-card cpform-section">
          <div className="cpform-section-title">📍 Career Stages <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400 }}>(add each major stage of your journey)</span></div>

          {stages.map((stage, i) => (
            <div key={i}>
              <div className="stage-block">
                <div className="stage-block-header">
                  <div className="stage-block-title">
                    <div className="stage-number" style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,var(--primary),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight:700, color:'#fff', flexShrink:0 }}>{i + 1}</div>
                    Stage {i + 1}
                  </div>
                  {stages.length > 1 && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeStage(i)}>✕ Remove</button>
                  )}
                </div>

                <div className="stage-block-grid">
                  <div className="form-group">
                    <label className="form-label">Education at this Stage</label>
                    <input className="form-input" placeholder="e.g., B.Tech CSE at XYZ College" value={stage.education}
                      onChange={e => updateStage(i, 'education', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Age Range</label>
                    <input className="form-input" placeholder="e.g., 18–22 years" value={stage.ageRange}
                      onChange={e => updateStage(i, 'ageRange', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Living Conditions</label>
                    <input className="form-input" placeholder="e.g., Hostel, Home, PG in city" value={stage.livingConditions}
                      onChange={e => updateStage(i, 'livingConditions', e.target.value)} />
                  </div>
                  <div className="form-group stage-block-full">
                    <label className="form-label">Skills Gained — press Enter or comma to add</label>
                    <TagInput value={stage.skills} onChange={v => updateStage(i, 'skills', v)} index={i}
                      placeholder="e.g., Java, Patient Care, Tax Filing..." />
                  </div>
                  {/* Change 10: "Experience / Internships" → "Work Experience" */}
                  <div className="form-group stage-block-full">
                    <label className="form-label">Work Experience</label>
                    <textarea className="form-textarea" placeholder="Describe your work/internship experience at this stage..." value={stage.experience}
                      onChange={e => updateStage(i, 'experience', e.target.value)} style={{ minHeight: 70 }} />
                  </div>
                  <div className="form-group stage-block-full">
                    <label className="form-label">Help Received (mentors, scholarships, support)</label>
                    <input className="form-input" placeholder="e.g., Scholarship from XYZ, mentored by Prof. ABC" value={stage.helpReceived}
                      onChange={e => updateStage(i, 'helpReceived', e.target.value)} />
                  </div>
                  {/* Change 12: remove emoji from label */}
                  <div className="form-group stage-block-full">
                    <label className="form-label">Suggestions for Others at this Stage</label>
                    <textarea className="form-textarea" placeholder="What advice would you give someone at this stage?" value={stage.suggestions}
                      onChange={e => updateStage(i, 'suggestions', e.target.value)} style={{ minHeight: 70 }} />
                  </div>
                </div>
              </div>

              {/* Change 11: Inline transition panel after each stage except last */}
              {i < stages.length - 1 && (
                <div style={{
                  margin: '0.5rem 0 0.5rem 1.5rem',
                  padding: '1rem 1.25rem',
                  border: '1.5px solid rgba(20,184,166,0.35)',
                  borderRadius: 8,
                  background: 'rgba(20,184,166,0.05)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#14b8a6', marginBottom: '0.75rem', letterSpacing: '0.02em' }}>
                    ↓ Transition to next stage
                  </div>
                  <div className="cpform-grid">
                    <div className="form-group cpform-grid-full">
                      <label className="form-label">Why move to next stage?</label>
                      <textarea className="form-textarea"
                        placeholder="Their reasoning for choosing this transition..."
                        value={stage.transition.reasonChosen}
                        onChange={e => updateStageTransition(i, 'reasonChosen', e.target.value)}
                        style={{ minHeight: 60 }} />
                    </div>
                    <div className="form-group cpform-grid-full">
                      <label className="form-label">Options you had — press Enter to add</label>
                      <TagInput
                        value={stage.transition.optionsAvailable}
                        onChange={v => updateStageTransition(i, 'optionsAvailable', v)}
                        index={i * 100}
                        placeholder="e.g., B.Pharm, Nursing, Direct work..." />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Advice for this decision</label>
                      <textarea className="form-textarea"
                        placeholder="Key advice for someone at this crossroads..."
                        value={stage.transition.advice}
                        onChange={e => updateStageTransition(i, 'advice', e.target.value)}
                        style={{ minHeight: 60 }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mistakes to avoid</label>
                      <textarea className="form-textarea"
                        placeholder="What would you have done differently?"
                        value={stage.transition.mistakes}
                        onChange={e => updateStageTransition(i, 'mistakes', e.target.value)}
                        style={{ minHeight: 60 }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {stages.length < 5 && (
            <button type="button" className="add-btn" onClick={addStage}>
              ＋ Add Another Stage
            </button>
          )}
        </div>

        {/* Submit */}
        <div className="cpform-submit-footer">
          <button type="button" className="btn btn-ghost" onClick={() => {
            setStages([emptyStage()]);
            setEducationEntries(['']);
            setMeta({ title: '', category: '', description: '' });
            setPersonal({ name: '', email: '', gender: '', background: '', economicStatus: '', skills: '' });
          }}>
            Reset Form
          </button>
          <button type="submit" className="btn btn-accent btn-lg" disabled={loading}>
            {loading ? <><span className="spinner" /> Submitting…</> : '🚀 Submit Career Path'}
          </button>
        </div>
      </form>
    </div>
  );
}
