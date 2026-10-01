import { useEffect, useState } from 'react';
import api from '../api/axios';
import CareerCard from '../components/CareerCard';

/* ── Option constants ───────────────────────────────────────────────────────── */
const GENDER_OPTIONS = ['Any', 'Male', 'Female', 'Other'];
const CASTE_OPTIONS  = ['Any', 'SC', 'ST', 'BC', 'OC', 'Other'];

const CURRENT_ROLE_OPTIONS = [
  { value: '', label: 'Select your current situation *' },
  { value: 'Student', label: 'Student (still studying)' },
  { value: 'Fresher', label: 'Fresher (just graduated, no job yet)' },
  { value: 'Intern', label: 'Intern' },
  { value: 'Junior professional', label: 'Junior Professional (0–2 years experience)' },
  { value: 'Mid-level professional', label: 'Mid-level Professional (2–5 years)' },
  { value: 'Senior professional', label: 'Senior Professional (5+ years)' },
  { value: 'Career changer', label: 'Looking to change career' },
  { value: 'Entrepreneur', label: 'Entrepreneur / Self-employed' },
];

const BACKGROUND_OPTIONS = ['Any', 'Rural', 'Urban', 'Semi-Urban', 'Tribal'];
const ECONOMIC_OPTIONS   = ['Any', 'Poor', 'Middle', 'Rich'];
const SEARCH_STATE_KEY   = 'cpmap-search-state';

/* ── Education cascade data ─────────────────────────────────────────────────── */
// Level 1 → education level
const EDU_LEVELS = [
  { value: '', label: 'Select education level *' },
  { value: '10th', label: '10th (Secondary)' },
  { value: '12th', label: '12th (Higher Secondary)' },
  { value: 'Diploma', label: 'Diploma' },
  { value: 'UG', label: 'Under Graduate (UG)' },
  { value: 'PG', label: 'Post Graduate (PG)' },
  { value: 'PhD', label: 'PhD / Doctoral' },
  { value: 'Other', label: 'Other' },
];

// Level 2 → courses per level (only for UG/PG/Diploma that have sub-selections)
const EDU_COURSES = {
  UG: [
    { value: '', label: 'Select UG course' },
    { value: 'B.Tech', label: 'B.Tech / B.E.' },
    { value: 'B.Sc', label: 'B.Sc' },
    { value: 'B.Com', label: 'B.Com' },
    { value: 'BA', label: 'BA' },
    { value: 'BBA', label: 'BBA' },
    { value: 'BCA', label: 'BCA' },
    { value: 'MBBS', label: 'MBBS' },
    { value: 'BDS', label: 'BDS' },
    { value: 'LLB', label: 'LLB' },
    { value: 'B.Arch', label: 'B.Arch' },
    { value: 'B.Pharm', label: 'B.Pharm' },
    { value: 'B.Ed', label: 'B.Ed' },
    { value: 'Other UG', label: 'Other UG' },
  ],
  PG: [
    { value: '', label: 'Select PG course' },
    { value: 'M.Tech', label: 'M.Tech / M.E.' },
    { value: 'MBA', label: 'MBA' },
    { value: 'M.Sc', label: 'M.Sc' },
    { value: 'MA', label: 'MA' },
    { value: 'M.Com', label: 'M.Com' },
    { value: 'MCA', label: 'MCA' },
    { value: 'MD', label: 'MD / MS (Medical)' },
    { value: 'LLM', label: 'LLM' },
    { value: 'M.Pharm', label: 'M.Pharm' },
    { value: 'M.Ed', label: 'M.Ed' },
    { value: 'Other PG', label: 'Other PG' },
  ],
  Diploma: [
    { value: '', label: 'Select diploma type' },
    { value: 'Polytechnic Diploma', label: 'Polytechnic Diploma' },
    { value: 'ITI', label: 'ITI' },
    { value: 'Diploma in Computer Science', label: 'Diploma in Computer Science' },
    { value: 'Diploma in Civil', label: 'Diploma in Civil' },
    { value: 'Diploma in Mechanical', label: 'Diploma in Mechanical' },
    { value: 'Diploma in Electrical', label: 'Diploma in Electrical' },
    { value: 'Other Diploma', label: 'Other Diploma' },
  ],
};

// Level 3 → specialisations per course
const EDU_BRANCHES = {
  'B.Tech': [
    { value: '', label: 'Select branch / specialisation' },
    { value: 'CSE', label: 'CSE (Computer Science)' },
    { value: 'ECE', label: 'ECE (Electronics & Comm.)' },
    { value: 'ME', label: 'Mechanical Engineering' },
    { value: 'Civil', label: 'Civil Engineering' },
    { value: 'EEE', label: 'EEE (Electrical & Electronics)' },
    { value: 'IT', label: 'IT (Information Technology)' },
    { value: 'Chemical', label: 'Chemical Engineering' },
    { value: 'Biotechnology', label: 'Biotechnology' },
    { value: 'Aerospace', label: 'Aerospace Engineering' },
    { value: 'Other B.Tech', label: 'Other / Not listed' },
  ],
  'M.Tech': [
    { value: '', label: 'Select branch / specialisation' },
    { value: 'CSE', label: 'CSE' },
    { value: 'VLSI', label: 'VLSI / Embedded Systems' },
    { value: 'Structural', label: 'Structural Engineering' },
    { value: 'Machine Design', label: 'Machine Design' },
    { value: 'Power Systems', label: 'Power Systems' },
    { value: 'AI & ML', label: 'AI & Machine Learning' },
    { value: 'Data Science', label: 'Data Science' },
    { value: 'Other M.Tech', label: 'Other / Not listed' },
  ],
  'B.Sc': [
    { value: '', label: 'Select specialisation' },
    { value: 'Physics', label: 'Physics' },
    { value: 'Chemistry', label: 'Chemistry' },
    { value: 'Mathematics', label: 'Mathematics' },
    { value: 'Biology', label: 'Biology' },
    { value: 'Computer Science', label: 'Computer Science' },
    { value: 'Statistics', label: 'Statistics' },
    { value: 'Nursing', label: 'Nursing' },
    { value: 'Other B.Sc', label: 'Other / Not listed' },
  ],
  'M.Sc': [
    { value: '', label: 'Select specialisation' },
    { value: 'Physics', label: 'Physics' },
    { value: 'Chemistry', label: 'Chemistry' },
    { value: 'Mathematics', label: 'Mathematics' },
    { value: 'Biology', label: 'Biology' },
    { value: 'Computer Science', label: 'Computer Science' },
    { value: 'Data Science', label: 'Data Science' },
    { value: 'Other M.Sc', label: 'Other / Not listed' },
  ],
  MBA: [
    { value: '', label: 'Select specialisation' },
    { value: 'Finance', label: 'Finance' },
    { value: 'Marketing', label: 'Marketing' },
    { value: 'HR', label: 'Human Resources' },
    { value: 'Operations', label: 'Operations' },
    { value: 'IT / Systems', label: 'IT / Systems' },
    { value: 'Entrepreneurship', label: 'Entrepreneurship' },
    { value: 'Other MBA', label: 'Other / Not listed' },
  ],
  BA: [
    { value: '', label: 'Select specialisation' },
    { value: 'English', label: 'English' },
    { value: 'History', label: 'History' },
    { value: 'Political Science', label: 'Political Science' },
    { value: 'Economics', label: 'Economics' },
    { value: 'Psychology', label: 'Psychology' },
    { value: 'Sociology', label: 'Sociology' },
    { value: 'Other BA', label: 'Other / Not listed' },
  ],
  'B.Com': [
    { value: '', label: 'Select specialisation' },
    { value: 'General', label: 'B.Com General' },
    { value: 'Computers', label: 'B.Com Computers' },
    { value: 'Accounting & Finance', label: 'Accounting & Finance' },
    { value: 'Tax', label: 'Taxation' },
    { value: 'Other B.Com', label: 'Other / Not listed' },
  ],
};

/* ── Build composed education string ───────────────────────────────────────── */
function buildEducationString(level, course, branch) {
  if (!level) return '';
  if (!course) return level;
  if (!branch) return `${level} → ${course}`;
  return `${level} → ${course} → ${branch}`;
}

/* ── TagInput component ─────────────────────────────────────────────────────── */
function TagInput({ tags, setTags, placeholder }) {
  const [input, setInput] = useState('');
  const id = `tag-${placeholder.replace(/\s+/g, '-')}`;

  const addTag = (v) => {
    const t = v.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setInput('');
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
    else if (e.key === 'Backspace' && !input && tags.length > 0) setTags(tags.slice(0, -1));
  };

  return (
    <div className="tag-input-container" onClick={() => document.getElementById(id)?.focus()}>
      {tags.map(tag => (
        <span key={tag} className="tag-item">
          {tag}
          <button className="tag-remove"
            onClick={e => { e.stopPropagation(); setTags(tags.filter(t => t !== tag)); }}>×</button>
        </span>
      ))}
      <input id={id} className="tag-input-field" value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''} />
    </div>
  );
}

/* ── Main Search component ──────────────────────────────────────────────────── */
export default function Search() {
  // Education cascade state
  const [eduLevel,  setEduLevel]  = useState('');
  const [eduCourse, setEduCourse] = useState('');
  const [eduBranch, setEduBranch] = useState('');

  const [filters, setFilters] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY))?.filters || {
        currentRole:       '',
        background:        'Any',
        economic:          'Any',
        gender:            'Any',
        religion:          '',
        caste:             'Any',
        parentOccupation:  '',
        currentOccupation: '',
      };
    } catch {
      return {
        currentRole:       '',
        background:        'Any',
        economic:          'Any',
        gender:            'Any',
        religion:          '',
        caste:             'Any',
        parentOccupation:  '',
        currentOccupation: '',
      };
    }
  });

  const [skills, setSkills] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY))?.skills || []; } catch { return []; }
  });
  const [results, setResults] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY))?.results || []; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY))?.searched || false; } catch { return false; }
  });
  const [categoryFilter, setCategoryFilter] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY))?.categoryFilter || 'All'; } catch { return 'All'; }
  });
  const [error, setError] = useState('');
  const [showAdditional, setShowAdditional] = useState(false);

  // Persist state
  useEffect(() => {
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ filters, skills, results, searched, categoryFilter }));
  }, [filters, skills, results, searched, categoryFilter]);

  // Category chips from actual results
  const categoryFilters = ['All', ...Array.from(
    new Set(results.map(r => r.category).filter(Boolean))
  ).sort()];

  const handleSearch = async (e) => {
    e?.preventDefault();

    // Required field validation
    if (!filters.currentRole) {
      setError('Please select your Current Situation — it is required.');
      return;
    }
    const eduValue = buildEducationString(eduLevel, eduCourse, eduBranch);
    if (!eduValue) {
      setError('Please select your Education Level — it is required.');
      return;
    }
    if (skills.length === 0) {
      setError('Please add at least one Skill — it is required.');
      return;
    }

    setLoading(true);
    setSearched(true);
    setError('');

    try {
      const education = eduValue;
      const query = Object.fromEntries([
        ['education',              education],
        ['skills',                 skills.length > 0 ? skills : null],
        ['currentStage',           education || filters.currentRole],
        ['currentJob',             filters.currentOccupation],
        ['childhoodEconomicStatus', filters.economic],
        ['background',             filters.background],
        ['gender',                 filters.gender],
        ['religion',               filters.religion],
        ['caste',                  filters.caste],
        ['parentOccupation',       filters.parentOccupation],
        ['currentRole',            filters.currentRole],
      ].filter(([, value]) => value && value !== 'Any'));

      const fields = Object.keys(query);
      const requestBody = { query, fields };
      console.log('[Search] Graph search request:', requestBody);
      const res = await api.post('/graph/search', requestBody);
      console.log('[Search] Graph search response:', res.data);
      setResults(res.data.results || []);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to search. Please try again.';
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    sessionStorage.removeItem(SEARCH_STATE_KEY);
    setEduLevel(''); setEduCourse(''); setEduBranch('');
    setFilters({
      currentRole: '', background: 'Any', economic: 'Any',
      gender: 'Any', religion: '', caste: 'Any', parentOccupation: '', currentOccupation: '',
    });
    setSkills([]);
    setResults([]);
    setSearched(false);
    setCategoryFilter('All');
    setError('');
  };

  const filtered = categoryFilter === 'All'
    ? results
    : results.filter(r => r.category === categoryFilter);

  // Check if course/branch dropdowns are visible
  const hasCourseDropdown  = !!EDU_COURSES[eduLevel];
  const hasBranchDropdown  = !!(eduCourse && EDU_BRANCHES[eduCourse]);

  return (
    <div className="page-container" style={{ paddingBottom: '3rem' }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="search-hero">
        <h1>Find Your <span className="gradient-text">Next Career Step</span></h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: 560, lineHeight: 1.7, marginTop: '0.5rem' }}>
          Tell us where you are right now — your education, current situation, and skills.
          We'll match you to real career paths and show you exactly which stage you're at
          and what comes next.
        </p>
      </div>

      {/* ── Search Form ───────────────────────────────────────────────── */}
      <form className="glass-card search-form-card" onSubmit={handleSearch}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="section-title" style={{ fontSize: '1.1rem' }}>📍 Your Current Situation</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
            * indicates required fields
          </p>
          <div className="section-subtitle">
            Fill in where you are right now — the more you tell us, the better the match.
          </div>
        </div>

        {/* ── Row 1: Current Situation (required) + Background + Economic ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 2fr) minmax(130px, 1fr) minmax(140px, 1fr)',
          gap: '0.75rem',
          marginBottom: '0.75rem',
          alignItems: 'end',
        }}>
          {/* Current Situation — REQUIRED */}
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--primary)', fontWeight: 700 }}>
              Current Situation <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              className="form-select"
              value={filters.currentRole}
              onChange={e => setFilters({ ...filters, currentRole: e.target.value })}
              required
              style={!filters.currentRole ? {
                borderColor: 'rgba(70,84,139,0.4)',
                boxShadow: '0 0 0 2px rgba(70,84,139,0.10)',
              } : {}}
            >
              {CURRENT_ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Background */}
          <div className="form-group">
            <label className="form-label">Background</label>
            <select className="form-select" value={filters.background}
              onChange={e => setFilters({ ...filters, background: e.target.value })}>
              {BACKGROUND_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          {/* Economic */}
          <div className="form-group">
            <label className="form-label">Economic Condition</label>
            <select className="form-select" value={filters.economic}
              onChange={e => setFilters({ ...filters, economic: e.target.value })}>
              {ECONOMIC_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* ── Row 2: Education cascade (1–3 dropdowns) — REQUIRED ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: hasCourseDropdown
            ? hasBranchDropdown
              ? 'repeat(3, 1fr)'
              : 'repeat(2, 1fr)'
            : '1fr',
          gap: '0.75rem',
          marginBottom: '0.75rem',
          alignItems: 'end',
        }}>
          {/* Level 1 */}
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--primary)', fontWeight: 700 }}>
              Education Level <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              className="form-select"
              value={eduLevel}
              onChange={e => { setEduLevel(e.target.value); setEduCourse(''); setEduBranch(''); }}
              required
            >
              {EDU_LEVELS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Level 2 — course (only if level has sub-options) */}
          {hasCourseDropdown && (
            <div className="form-group">
              <label className="form-label">Course / Degree</label>
              <select
                className="form-select"
                value={eduCourse}
                onChange={e => { setEduCourse(e.target.value); setEduBranch(''); }}
              >
                {EDU_COURSES[eduLevel].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Level 3 — branch (only if course has sub-options) */}
          {hasBranchDropdown && (
            <div className="form-group">
              <label className="form-label">Branch / Specialisation</label>
              <select
                className="form-select"
                value={eduBranch}
                onChange={e => setEduBranch(e.target.value)}
              >
                {EDU_BRANCHES[eduCourse].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Composed education preview */}
        {buildEducationString(eduLevel, eduCourse, eduBranch) && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(198,229,255,0.40)', color: 'var(--primary-dark)',
            border: '1px solid rgba(70,84,139,0.20)', borderRadius: 20,
            padding: '0.2rem 0.75rem', fontSize: '0.82rem', fontWeight: 600,
            marginBottom: '0.75rem',
          }}>
            🎓 {buildEducationString(eduLevel, eduCourse, eduBranch)}
          </div>
        )}

        {/* ── Skills row — REQUIRED ── */}
        <div className="form-group" style={{ marginBottom: '0.5rem' }}>
          <label className="form-label" style={{ color: 'var(--primary)', fontWeight: 700 }}>
            Your Skills <span style={{ color: 'var(--danger)' }}>*</span> <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>— press Enter or comma to add</span>
          </label>
          <TagInput tags={skills} setTags={setSkills}
            placeholder="e.g. Java, Communication, Drawing, Football..." />
        </div>

        {/* Additional filters toggle */}
        <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowAdditional(!showAdditional)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)',
              padding: '0.45rem 0.9rem', borderRadius: 8,
              border: '1.5px solid rgba(70,84,139,0.25)',
              background: 'rgba(70,84,139,0.06)', cursor: 'pointer',
              marginBottom: showAdditional ? '0.75rem' : 0,
            }}
          >
            <span>{showAdditional ? '▼' : '▶'}</span>
            <span>Additional Fields</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400 }}>
              ({showAdditional ? 'Click to hide optional filters' : 'Click to expand optional filters'})
            </span>
          </button>

          {showAdditional && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'end', marginTop: '0.75rem' }}>

              {/* Gender */}
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select className="form-select" value={filters.gender}
                  onChange={e => setFilters({ ...filters, gender: e.target.value })}>
                  {GENDER_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>

              {/* Religion */}
              <div className="form-group">
                <label className="form-label">Religion</label>
                <input type="text" className="form-input" placeholder="e.g. Hindu, Muslim, Christian..."
                  value={filters.religion}
                  onChange={e => setFilters({ ...filters, religion: e.target.value })} />
              </div>

              {/* Caste */}
              <div className="form-group">
                <label className="form-label">Caste</label>
                <select className="form-select" value={filters.caste}
                  onChange={e => setFilters({ ...filters, caste: e.target.value })}>
                  {CASTE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>

              {/* Parent Occupation */}
              <div className="form-group">
                <label className="form-label">Parent's Occupation</label>
                <input type="text" className="form-input" placeholder="e.g. Farmer, Teacher, Engineer..."
                  value={filters.parentOccupation}
                  onChange={e => setFilters({ ...filters, parentOccupation: e.target.value })} />
              </div>

              {/* Current Occupation */}
              <div className="form-group">
                <label className="form-label">Current Occupation</label>
                <input type="text" className="form-input" placeholder="e.g. Software Developer, Student..."
                  value={filters.currentOccupation}
                  onChange={e => setFilters({ ...filters, currentOccupation: e.target.value })} />
              </div>

            </div>
          )}
        </div>

        {error && (
          <div style={{
            color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem',
            padding: '0.5rem 0.75rem', background: 'rgba(231,76,111,0.08)',
            borderRadius: 6, border: '1px solid rgba(231,76,111,0.2)',
          }}>
            ⚠️ {error}
          </div>
        )}

        <div className="search-btn-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleReset}
            style={{ background: 'rgba(70,84,139,0.08)', color: 'var(--primary)', border: '1.5px solid rgba(70,84,139,0.22)' }}
          >
            Reset
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading
              ? <><span className="spinner" /> Finding your next step…</>
              : '🔍 Find My Next Career Step'}
          </button>
        </div>
      </form>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {searched && (
        <>
          <div className="results-header">
            <div>
              <div className="section-title" style={{ fontSize: '1.2rem' }}>
                {loading
                  ? 'Matching career paths…'
                  : `${filtered.length} Career Path${filtered.length !== 1 ? 's' : ''} Found`}
              </div>
              {!loading && results.length > 0 && (
                <div className="results-count">
                  Showing where you fit in each path and what your next step would be
                </div>
              )}
            </div>

            {/* Category filter chips */}
            {!loading && results.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {categoryFilters.map(cat => (
                  <button key={cat}
                    className={`btn btn-sm ${categoryFilter === cat ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setCategoryFilter(cat)}
                    style={{ fontSize: '0.75rem' }}>
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="empty-state">
              <div className="empty-icon">⏳</div>
              <h3>Matching your profile against career stages…</h3>
              <p>This may take a few seconds.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔭</div>
              <h3>No matching career paths found</h3>
              <p>Try changing your education level, current situation, or add more skills.</p>
            </div>
          ) : (
            <div className="results-grid">
              {filtered.map((career, idx) => (
                <CareerCard key={career._id} career={career} rank={idx + 1} />
              ))}
            </div>
          )}
        </>
      )}

      {!searched && (
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <h3>Where are you in your career journey?</h3>
          <p>Fill in your current situation above and click <strong>Find My Next Career Step</strong>.</p>
        </div>
      )}
    </div>
  );
}
