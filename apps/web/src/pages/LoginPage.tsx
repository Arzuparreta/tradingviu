import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import { ApiError } from '../api/client';
import { Field } from '../ui';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const login = useAuth((s) => s.login);
  const devOwnerLogin = useAuth((s) => s.devOwnerLogin);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const loginAsLocalOwner = async () => {
    setError(null);
    setLoading(true);
    try {
      await devOwnerLogin();
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo">t</span>
          <h1>Sign in</h1>
        </div>
        <form onSubmit={submit}>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          {error && <div className="err">{error}</div>}
          <div className="auth-actions">
            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            {import.meta.env.DEV && (
              <button type="button" disabled={loading} onClick={loginAsLocalOwner}>
                Local owner
              </button>
            )}
            <button type="button" disabled={loading} onClick={() => navigate('/signup')}>
              Create user
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
