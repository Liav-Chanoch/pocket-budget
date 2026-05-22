import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { fetchLiveRates } from './pricedb';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { LanguageProvider } from './LanguageContext';
import AuthScreen from './AuthScreen';
import GroupSetup from './GroupSetup';
import Dashboard from './Dashboard';

fetchLiveRates();

function useAutoUpdate() {
  const currentHash = useRef(null);
  useEffect(() => {
    // Grab the hash of the current JS bundle from the loaded <script> tags
    const scriptEl = Array.from(document.scripts).find(s => /\/static\/js\/main\.[a-f0-9]+\.js/.test(s.src));
    if (scriptEl) {
      const m = scriptEl.src.match(/main\.([a-f0-9]+)\.js/);
      if (m) currentHash.current = m[1];
    }

    async function check() {
      try {
        const res  = await fetch('/index.html', { cache: 'no-store' });
        const html = await res.text();
        const m    = html.match(/main\.([a-f0-9]+)\.js/);
        if (m && currentHash.current && m[1] !== currentHash.current) {
          window.location.reload();
        }
      } catch {}
    }

    const interval = setInterval(check, 3_600_000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
}

function Spinner() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#214e99',
    }}>
      <img
        src="/logo-header-v4.png"
        alt="Pocket Budget"
        style={{ width: '160px', animation: 'splashPulse 1.4s ease-in-out infinite' }}
      />
      <style>{`
        @keyframes splashPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
}

function AppInner() {
  useAutoUpdate();
  const [user, setUser]             = useState(undefined);
  const [groupId, setGroupId]       = useState(undefined);
  const [group, setGroup]           = useState(null);
  const [memberData, setMemberData] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setGroup(null);
      setMemberData(null);
      if (!u) { setGroupId(null); return; }
      const d = await getDoc(doc(db, 'users', u.uid));
      setGroupId(d.exists() && d.data().groupId ? d.data().groupId : null);
    });
  }, []);

  useEffect(() => {
    if (!groupId || !user) return;
    const u1 = onSnapshot(doc(db, 'groups', groupId), d => {
      if (d.exists()) setGroup({ id: d.id, ...d.data() });
    });
    const u2 = onSnapshot(doc(db, 'groups', groupId, 'members', user.uid), d => {
      if (d.exists()) setMemberData(d.data());
    });
    return () => { u1(); u2(); };
  }, [groupId, user?.uid]);

  const loading =
    user === undefined ||
    groupId === undefined ||
    (groupId !== null && (!group || !memberData));

  if (loading)  return <Spinner />;
  if (!user)    return <AuthScreen />;
  if (!groupId) return <GroupSetup user={user} onGroupJoined={setGroupId} />;

  return (
    <div className="app">
      <Dashboard
        user={user}
        groupId={groupId}
        group={group}
        memberData={memberData}
        onLogout={() => signOut(auth)}
      />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
