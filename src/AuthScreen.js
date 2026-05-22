import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from './firebase';
import { useLanguage } from './LanguageContext';

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'Email already in use.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-not-found': 'No account with this email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/invalid-credential': 'Invalid email or password.',
};

export default function AuthScreen() {
  const { t, lang, setLang } = useLanguage();
  const [mode, setMode]               = useState('login');
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || 'Something went wrong.');
    }
    setLoading(false);
  }

  return (
    <div className="auth-screen">
      <img src="/logo-header-v4.png" alt="Pocket Budget" style={{ height: '56px', marginBottom: '1.5rem' }} />
      <div className="auth-card">
        <button className="lang-toggle-auth" onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
          {lang === 'en' ? 'עב' : 'EN'}
        </button>
        <div className="auth-title">Pocket Budget</div>
        <div className="auth-subtitle">{t.appSubtitle}</div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input type="text" placeholder={t.yourName} value={name}
              onChange={e => setName(e.target.value)} required />
          )}
          <input type="email" placeholder={t.email} value={email}
            onChange={e => setEmail(e.target.value)} required />
          <div className="password-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t.password}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button type="button" className="eye-btn" onClick={() => setShowPassword(s => !s)} tabIndex={-1}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '…' : mode === 'login' ? t.signIn : t.createAccount}
          </button>
        </form>

        <button className="btn-secondary" onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? t.noAccount : t.haveAccount}
        </button>
        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  );
}
