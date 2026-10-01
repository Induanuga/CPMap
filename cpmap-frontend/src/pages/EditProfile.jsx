import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { getUser, setToken, setUser } from '../utils/auth';

const ROLE_LABEL = {
  user: 'User',
  collector: 'Collector',
  moderator: 'Moderator',
  admin: 'Admin',
};

export default function EditProfile() {
  const navigate = useNavigate();
  const currentUser = getUser();

  const [form, setForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    password: '',
  });

  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/profile');
        if (res.data?.user) {
          setForm({
            name: res.data.user.name || '',
            email: res.data.user.email || '',
            phone: res.data.user.phone || '',
            password: '',
          });
        }
      } catch (err) {
        console.error('Failed to load profile details:', err);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
    setServerError('');
    setSuccessMsg('');
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (!form.email.match(/^\S+@\S+\.\S+$/)) errs.email = 'Enter a valid email address.';
    if (!form.phone.match(/^\d{10}$/)) errs.phone = 'Phone number must be 10 digits.';
    if (form.password && form.password.length < 6) {
      errs.password = 'Password must be at least 6 characters.';
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    setServerError('');
    setSuccessMsg('');

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };
      if (form.password) {
        payload.password = form.password;
      }

      const res = await api.patch('/auth/profile', payload);

      if (res.data.token) {
        setToken(res.data.token);
      }
      if (res.data.user) {
        setUser(res.data.user);
      }

      setSuccessMsg(res.data.message || 'Profile updated successfully!');
      setForm((prev) => ({ ...prev, password: '' }));
    } catch (err) {
      setServerError(err.response?.data?.message || 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="glass-card" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>
            ✏️ Edit Profile
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Update your account details and security settings
          </p>
        </div>

        {successMsg && (
          <div
            style={{
              background: 'rgba(0,201,125,0.1)',
              border: '1px solid rgba(0,201,125,0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              color: 'var(--success)',
              fontSize: '0.88rem',
              fontWeight: 500,
            }}
          >
            ✅ {successMsg}
          </div>
        )}

        {serverError && (
          <div
            style={{
              background: 'rgba(255,85,114,0.1)',
              border: '1px solid rgba(255,85,114,0.3)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              color: 'var(--danger)',
              fontSize: '0.88rem',
              fontWeight: 500,
            }}
          >
            ❌ {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Full Name</label>
            <input
              className="form-input"
              type="text"
              name="name"
              placeholder="Your full name"
              value={form.name}
              onChange={handleChange}
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Email Address</label>
            <input
              className="form-input"
              type="email"
              name="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={handleChange}
            />
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Phone Number</label>
            <input
              className="form-input"
              type="tel"
              name="phone"
              placeholder="10-digit mobile number"
              maxLength={10}
              value={form.phone}
              onChange={handleChange}
            />
            {errors.phone && <span className="form-error">{errors.phone}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>
              New Password <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(Leave blank to keep unchanged)</span>
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Enter new password (min. 6 chars)"
                value={form.password}
                onChange={handleChange}
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  color: 'var(--text-muted)',
                  fontSize: '1.1rem',
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 600 }}>Account Role</label>
            <div
              style={{
                background: 'var(--surface-3)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              🔒 {ROLE_LABEL[currentUser?.role] || 'User'} (Managed by Administrator)
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ flex: 1 }}>
              {loading ? <><span className="spinner" /> Saving Changes…</> : 'Save Changes'}
            </button>
            <button
              className="btn btn-ghost btn-lg"
              type="button"
              onClick={() => navigate(-1)}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
