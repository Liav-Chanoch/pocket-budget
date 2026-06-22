import { useState } from 'react';
import { doc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { generateInviteCode, getYesterdayStr } from './utils';
import { useLanguage } from './LanguageContext';

export default function GroupSetup({ user, onGroupJoined }) {
  const { t, lang, setLang } = useLanguage();
  const [mode, setMode]       = useState(null);
  const [code, setCode]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function createGroup() {
    setLoading(true); setError('');
    try {
      const groupId    = user.uid;
      const inviteCode = generateInviteCode();
      await setDoc(doc(db, 'groups', groupId), {
        adminUid: user.uid, budgetMode: 'daily', budgetAmount: 100,
        currency: 'ILS', inviteCode, savings_box_shared: 0,
        shared_savings_contributors: {}, groupMode: 'trip', createdAt: new Date(),
      });
      await setDoc(doc(db, 'groups', groupId, 'members', user.uid), {
        uid: user.uid, displayName: user.displayName || user.email,
        email: user.email, role: 'admin', running_balance: 0,
        last_day_processed: getYesterdayStr(), savings_box_personal: 0, last_sunday_prompt: null,
      });
      await setDoc(doc(db, 'users', user.uid), { groupId });
      onGroupJoined(groupId);
    } catch { setError(t.failedCreate); }
    setLoading(false);
  }

  async function joinGroup() {
    if (!code.trim()) return;
    setLoading(true); setError('');
    try {
      const q    = query(collection(db, 'groups'), where('inviteCode', '==', code.trim().toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) { setError(t.invalidCode); setLoading(false); return; }
      const groupId = snap.docs[0].id;
      await setDoc(doc(db, 'groups', groupId, 'members', user.uid), {
        uid: user.uid, displayName: user.displayName || user.email,
        email: user.email, role: 'user', running_balance: 0,
        last_day_processed: getYesterdayStr(), savings_box_personal: 0, last_sunday_prompt: null,
      });
      await setDoc(doc(db, 'users', user.uid), { groupId });
      onGroupJoined(groupId);
    } catch { setError(t.failedJoin); }
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
        <div className="auth-subtitle">{t.setupSubtitle}</div>

        {!mode && (
          <>
            <button className="btn-primary" style={{ marginBottom: '0.75rem' }} onClick={() => setMode('create')}>
              {t.createGroupBtn}
            </button>
            <button className="btn-secondary" onClick={() => setMode('join')}>
              {t.joinGroupBtn}
            </button>
          </>
        )}

        {mode === 'create' && (
          <>
            <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '1.2rem', textAlign: 'center', lineHeight: 1.5 }}>
              {t.createGroupDesc}
            </p>
            <button className="btn-primary" onClick={createGroup} disabled={loading}>
              {loading ? '…' : t.createGroupAction}
            </button>
            <button className="btn-secondary" onClick={() => { setMode(null); setError(''); }} style={{ marginTop: '0.5rem' }}>
              {t.back}
            </button>
          </>
        )}

        {mode === 'join' && (
          <>
            <input
              type="text" placeholder={t.inviteCodePlaceholder}
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              style={{
                width: '100%', padding: '0.85rem 1rem',
                border: '2px solid #e8e8e8', borderRadius: '12px',
                fontSize: '1.4rem', textAlign: 'center',
                letterSpacing: '0.25em', marginBottom: '0.75rem',
                outline: 'none', fontWeight: 700,
              }}
            />
            <button className="btn-primary" onClick={joinGroup} disabled={loading || !code.trim()}>
              {loading ? '…' : t.joinGroupAction}
            </button>
            <button className="btn-secondary" onClick={() => { setMode(null); setError(''); }} style={{ marginTop: '0.5rem' }}>
              {t.back}
            </button>
          </>
        )}

        {error && <div className="auth-error" style={{ marginTop: '0.75rem' }}>{error}</div>}
      </div>
    </div>
  );
}
