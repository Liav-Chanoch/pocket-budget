import { useState, useEffect, useRef } from 'react';
import { Plus, Square, CheckSquare, Trash2, ShoppingCart as ListIcon, Settings as SettingsIcon, LogOut, Globe, BarChart2, Package as PackageIcon, Users, Navigation, ChevronRight, ClipboardList } from 'lucide-react';
import {
  collection, addDoc, onSnapshot, deleteDoc, doc,
  query, orderBy, where, getDocs, updateDoc, setDoc, writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import {
  getTodayStr, getYesterdayStr, addDaysToStr,
  getDailyBudget, getCurrencySymbol, getCat, CATEGORIES,
  isSunday,
} from './utils';
import { useLanguage } from './LanguageContext';
import { estimatePrice, toDisplayCurrency } from './pricedb';

function CatIcon({ cat, size = 18 }) {
  const Icon = cat.icon;
  return <Icon size={size} strokeWidth={1.5} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterByPeriod(expenses, filter, today, fromDate, toDate) {
  if (filter === 'all') return expenses;
  if (filter === 'today') return expenses.filter(e => e.date === today);
  if (filter === 'week') {
    const d = new Date(today + 'T12:00:00');
    const dates = Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(d); dd.setDate(d.getDate() - i);
      return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
    });
    return expenses.filter(e => dates.includes(e.date));
  }
  if (filter === 'month') {
    return expenses.filter(e => e.date?.startsWith(today.substring(0, 7)));
  }
  if (filter === 'custom') {
    return expenses.filter(e => {
      if (fromDate && e.date < fromDate) return false;
      if (toDate   && e.date > toDate)   return false;
      return true;
    });
  }
  return expenses;
}

function formatDateStr(dateStr, t, lang) {
  if (!dateStr) return '';
  const today = getTodayStr();
  const yesterday = getYesterdayStr();
  if (dateStr === today)     return t.today;
  if (dateStr === yesterday) return t.yesterday;
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function getCatLabel(catId, t) {
  return t[`cat_${catId}`] || catId;
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────

function ExpenseItem({ exp, user, currency, onDelete, onPhotoClick, t, isOwn, viewMode }) {
  const cat = getCat(exp.category);
  // In "everyone" mode: own expenses use a lighter red so you can distinguish them
  const amountColor = (viewMode === 'all' && isOwn) ? '#f0948a' : '#e74c3c';
  return (
    <div className="expense-item">
      <div
        className="expense-icon"
        style={{ background: cat.color + '22', overflow: 'hidden', padding: exp.photo ? 0 : undefined, cursor: exp.photo ? 'pointer' : 'default' }}
        onClick={() => exp.photo && onPhotoClick && onPhotoClick(exp.photo)}
      >
        {exp.photo
          ? <img src={exp.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '11px' }} />
          : <CatIcon cat={cat} />}
      </div>
      <div className="expense-info">
        <div className="expense-name">
          {exp.description}
          <span className="who-badge">{(exp.addedBy || '?').split(' ')[0]}</span>
        </div>
        <div className="expense-meta">{getCatLabel(exp.category, t)}</div>
      </div>
      <div className="expense-amount" style={{ color: amountColor }}>{currency}{Number(exp.amount).toFixed(2)}</div>
      {exp.uid === user.uid && (
        <button className="expense-delete" onClick={() => onDelete(exp.id)}>×</button>
      )}
    </div>
  );
}

function ExpensesTab({ expenses, user, currency, onDelete, onPhotoClick, t, lang, viewMode, onViewModeChange }) {
  const today = getTodayStr();
  const [selDate, setSelDate] = useState(today);

  const visible = (viewMode === 'me' ? expenses.filter(e => e.uid === user.uid) : expenses)
    .filter(e => selDate === 'all' || e.date === selDate);

  const groups = {};
  visible.forEach(exp => {
    const key = exp.date || 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(exp);
  });
  const sortedDays = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="expense-tab-toolbar">
        <div className="view-toggle">
          <button className={`view-btn${viewMode === 'me'  ? ' active' : ''}`} onClick={() => onViewModeChange('me') }>👤 {t.viewMe}</button>
          <button className={`view-btn${viewMode === 'all' ? ' active' : ''}`} onClick={() => onViewModeChange('all')}>👥 {t.viewAll}</button>
        </div>
      </div>
      <div className="day-scroll">
        <button className={`day-pill${selDate === today ? ' active' : ''}`} onClick={() => setSelDate(today)}>{t.filterToday}</button>
        <button className={`day-pill${selDate === 'all'  ? ' active' : ''}`} onClick={() => setSelDate('all')}>{t.filterAll}</button>
      </div>
      <div className="expense-list">
        {visible.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🌍</div>{t.noExpenses}</div>
        ) : sortedDays.map(dateKey => {
          const dayTotal   = groups[dateKey].reduce((s, e) => s + Number(e.amount), 0);
          const myDayTotal = groups[dateKey].filter(e => e.uid === user.uid).reduce((s, e) => s + Number(e.amount), 0);
          return (
            <div key={dateKey} className="day-group">
              <div className="day-label">
                <span>{formatDateStr(dateKey, t, lang)}</span>
                {viewMode === 'all' ? (
                  <span className="day-total day-total--split">
                    <span className="day-total-mine">My: {currency}{myDayTotal.toFixed(2)}</span>
                    <span className="day-total-sep">·</span>
                    <span>All: {currency}{dayTotal.toFixed(2)}</span>
                  </span>
                ) : (
                  <span className="day-total">Total: {currency}{dayTotal.toFixed(2)}</span>
                )}
              </div>
              {groups[dateKey].map(exp => (
                <ExpenseItem key={exp.id} exp={exp} user={user} currency={currency} onDelete={onDelete} onPhotoClick={onPhotoClick} t={t} isOwn={exp.uid === user.uid} viewMode={viewMode} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function getFilterDateLabel(filter, today, lang) {
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  if (filter === 'today') return fmt(today);
  if (filter === 'week') {
    const d = new Date(today + 'T12:00:00');
    const from = new Date(d); from.setDate(d.getDate() - 6);
    const fromStr = `${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-${String(from.getDate()).padStart(2,'0')}`;
    return `${fmt(fromStr)} – ${fmt(today)}`;
  }
  if (filter === 'month') {
    return new Date(today + 'T12:00:00').toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }
  return null;
}

function StatsTab({ expenses, user, currency, today, t, lang, viewMode, onViewModeChange }) {
  const [filter,        setFilter]        = useState('all');
  const [drillCategory, setDrillCategory] = useState(null);
  const [fromDate,      setFromDate]      = useState('');
  const [toDate,        setToDate]        = useState('');

  const scoped   = viewMode === 'me' ? expenses.filter(e => e.uid === user.uid) : expenses;
  const filtered = filterByPeriod(scoped, filter, today, fromDate, toDate);
  const catTotals  = CATEGORIES
    .map(cat => ({ ...cat, label: getCatLabel(cat.id, t), total: filtered.filter(e => e.category === cat.id).reduce((s, e) => s + e.amount, 0) }))
    .filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const grandTotal = catTotals.reduce((s, c) => s + c.total, 0);
  const maxCat     = catTotals[0]?.total || 1;

  const filters = [
    { key: 'today',  label: t.filterToday },
    { key: 'week',   label: t.filter7Days },
    { key: 'month',  label: t.filterMonth },
    { key: 'all',    label: t.filterAll },
    { key: 'custom', label: '📅 Range' },
  ];

  if (drillCategory) {
    const cat     = getCat(drillCategory);
    const catExps = filtered.filter(e => e.category === drillCategory);
    const catTotal = catExps.reduce((s, e) => s + e.amount, 0);
    return (
      <div className="stats-section">
        <button className="back-btn" onClick={() => setDrillCategory(null)}>
          {lang === 'he' ? '→' : '←'} {t.back}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ color: cat.color }}><CatIcon cat={cat} size={24} /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{getCatLabel(drillCategory, t)}</div>
            <div style={{ color: '#aaa', fontSize: '0.8rem' }}>{catExps.length} · {currency}{catTotal.toFixed(2)}</div>
          </div>
        </div>
        {catExps.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">📭</div>{t.noDataPeriod}</div>
        ) : catExps.map(exp => (
          <div key={exp.id} className="expense-item" style={{ marginBottom: '0.45rem' }}>
            <div className="expense-icon" style={{ background: cat.color + '22' }}><CatIcon cat={cat} /></div>
            <div className="expense-info">
              <div className="expense-name">
                {exp.description}
                <span className="who-badge">{(exp.addedBy || '?').split(' ')[0]}</span>
              </div>
              <div className="expense-meta">{formatDateStr(exp.date, t, lang)}</div>
            </div>
            <div className="expense-amount">{currency}{Number(exp.amount).toFixed(2)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="stats-section">
      <div className="view-toggle" style={{ marginBottom: '0.75rem' }}>
        <button className={`view-btn${viewMode === 'me'  ? ' active' : ''}`} onClick={() => onViewModeChange('me') }>👤 {t.viewMe}</button>
        <button className={`view-btn${viewMode === 'all' ? ' active' : ''}`} onClick={() => onViewModeChange('all')}>👥 {t.viewAll}</button>
      </div>
      <div className="stats-filters">
        {filters.map(({ key, label }) => (
          <button key={key} className={`filter-pill${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {filter === 'custom' && (
        <div className="stats-date-range">
          <div className="stats-date-field">
            <label className="stats-date-label">From</label>
            <input
              type="date" className="stats-date-input"
              value={fromDate} max={toDate || today}
              onChange={e => setFromDate(e.target.value)}
            />
          </div>
          <span className="stats-date-dash">—</span>
          <div className="stats-date-field">
            <label className="stats-date-label">To</label>
            <input
              type="date" className="stats-date-input"
              value={toDate} min={fromDate} max={today}
              onChange={e => setToDate(e.target.value)}
            />
          </div>
        </div>
      )}
      {filter !== 'custom' && getFilterDateLabel(filter, today, lang) && (
        <div style={{ fontSize: '0.78rem', color: '#aaa', marginBottom: '0.75rem', marginTop: '-0.25rem' }}>
          {getFilterDateLabel(filter, today, lang)}
        </div>
      )}
      {catTotals.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📊</div>{t.noDataPeriod}</div>
      ) : (
        <>
          <div className="stats-title">{t.breakdownLabel(`${currency}${grandTotal.toFixed(2)}`)}</div>
          {catTotals.map(cat => (
            <button key={cat.id} className="category-row-btn" onClick={() => setDrillCategory(cat.id)}>
              <div className="category-icon" style={{ color: cat.color }}><CatIcon cat={cat} size={20} /></div>
              <div className="category-bar-wrap">
                <div className="category-name">
                  {cat.label} · {grandTotal > 0 ? Math.round((cat.total / grandTotal) * 100) : 0}%
                </div>
                <div className="category-bar-bg">
                  <div className="category-bar-fill" style={{ width: `${(cat.total / maxCat) * 100}%`, background: cat.color }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div className="category-amount">{currency}{cat.total.toFixed(2)}</div>
                <div style={{ fontSize: '0.68rem', color: '#bbb' }}>{t.tapDrilldown}</div>
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({ members, expenses, today, currency, group, groupId, isAdmin, getMemberBalance, t }) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(group.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function resetSharedSavings() {
    if (!window.confirm(t.resetSharedSavings + '?')) return;
    await updateDoc(doc(db, 'groups', groupId), { savings_box_shared: 0, shared_savings_contributors: {} });
  }

  return (
    <div className="stats-section">
      <div className="settings-row">
        <div>
          <div className="settings-label">{t.inviteCodeLabel}</div>
          <div className="settings-sub">{t.inviteCodeDesc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, fontSize: '1.15rem', letterSpacing: '0.12em', color: '#214e99' }}>
            {group.inviteCode}
          </span>
          <button onClick={copyCode} className="copy-btn">{copied ? '✓' : t.copy}</button>
        </div>
      </div>

      <div className="stats-title" style={{ marginTop: '1rem' }}>{t.groupMembersLabel}</div>
      {members.map(member => {
        const bal = getMemberBalance(member);
        const mt  = expenses.filter(e => e.uid === member.uid && e.date === today).reduce((s, e) => s + e.amount, 0);
        return (
          <div key={member.uid} className="expense-item" style={{ marginBottom: '0.75rem' }}>
            <div className="expense-icon" style={{ background: '#e8eef8', fontSize: '1.3rem', overflow: 'hidden', padding: member.avatarUrl ? 0 : undefined }}>
              {member.avatarUrl
                ? <img src={member.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '11px' }} />
                : member.role === 'admin' ? '👑' : '👤'}
            </div>
            <div className="expense-info">
              <div className="expense-name">
                {member.displayName}
                {member.role === 'admin' && <span className="who-badge">{t.adminLabel}</span>}
              </div>
              <div className="expense-meta">{t.todayLabel(`${currency}${mt.toFixed(2)}`)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: bal >= 0 ? '#4caf50' : '#f44336' }}>
                {bal < 0 ? '-' : ''}{currency}{Math.abs(bal).toFixed(2)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#aaa' }}>{t.balanceLabel}</div>
            </div>
          </div>
        );
      })}

      <div className="stats-title" style={{ marginTop: '1rem' }}>{t.sharedSavingsBox}</div>
      <div className="settings-row">
        <div>
          <div className="settings-label">{t.totalLabel}</div>
          {Object.entries(group.shared_savings_contributors || {}).map(([uid, amt]) => {
            const m = members.find(m => m.uid === uid);
            return <div key={uid} className="settings-sub">{m?.displayName || uid}: {currency}{Number(amt).toFixed(2)}</div>;
          })}
        </div>
        <div style={{ fontWeight: 700, fontSize: '1.3rem', color: '#214e99' }}>
          {currency}{(group.savings_box_shared || 0).toFixed(2)}
        </div>
      </div>
      {isAdmin && (
        <button onClick={resetSharedSavings} className="danger-btn" style={{ marginTop: '0.5rem' }}>
          {t.resetSharedSavings}
        </button>
      )}
    </div>
  );
}

// ─── Reset Rollover Button (admin only) ──────────────────────────────────────

function ResetRolloverButton({ groupId, user }) {
  const [confirm, setConfirm] = useState(false);

  async function doReset() {
    await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { running_balance: 0 });
    setConfirm(false);
  }

  return (
    <>
      <button
        className="reset-rollover-btn"
        style={{ marginTop: '0.5rem' }}
        onClick={() => setConfirm(true)}
      >
        🔄 Reset Rollover to €0
      </button>

      {confirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirm(false)}>
          <div className="modal">
            <div className="modal-title">Reset Rollover?</div>
            <p style={{ color: '#666', fontSize: '0.9rem', margin: '0.5rem 0 1.25rem', lineHeight: 1.5 }}>
              This will set your rollover balance to €0. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn-danger" onClick={doReset}>Yes, reset</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ group, groupId, isAdmin, memberData, user, t }) {
  const [budgetMode,   setBudgetMode]   = useState(group.budgetMode   || 'daily');
  const [budgetAmount, setBudgetAmount] = useState(String(group.budgetAmount || ''));
  const [curr,         setCurr]         = useState(group.currency     || 'ILS');
  const [country,      setCountry]      = useState(group.country      || 'de');
  const [saved,        setSaved]        = useState(false);
  const avatarInputRef = useRef(null);

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 80; canvas.height = 80;
        const ctx = canvas.getContext('2d');
        const size = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 80, 80);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { avatarUrl: dataUrl });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  const previewDaily = budgetMode === 'weekly'
    ? Math.round((parseFloat(budgetAmount) / 7) * 100) / 100
    : parseFloat(budgetAmount) || 0;

  async function saveSettings() {
    await updateDoc(doc(db, 'groups', groupId), {
      budgetMode, budgetAmount: parseFloat(budgetAmount) || 0, currency: curr, country,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="settings-section">
      <div className="stats-title">{t.yourProfile}</div>
      <div className="settings-row" style={{ cursor: 'pointer' }} onClick={() => avatarInputRef.current.click()}>
        <div>
          <div className="settings-label">{memberData.avatarUrl ? t.changeAvatar : t.uploadAvatar}</div>
          <div className="settings-sub">{user.displayName || user.email}</div>
        </div>
        <div className="avatar-circle">
          {memberData.avatarUrl
            ? <img src={memberData.avatarUrl} alt="" className="avatar-img" />
            : <span style={{ fontSize: '1.5rem' }}>{isAdmin ? '👑' : '👤'}</span>}
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
      </div>

      <div className="stats-title" style={{ marginTop: '1rem' }}>{t.yourSavingsBox}</div>
      <div className="settings-row">
        <div>
          <div className="settings-label">{t.personalSavings}</div>
          <div className="settings-sub">{t.personalSavingsDesc}</div>
        </div>
        <div style={{ fontWeight: 700, fontSize: '1.3rem', color: '#214e99' }}>
          {getCurrencySymbol(group.currency)}{(memberData.savings_box_personal || 0).toFixed(2)}
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="stats-title" style={{ marginTop: '1.25rem' }}>{t.budgetSettingsLabel}</div>
          <div className="settings-sub" style={{ marginBottom: '0.75rem', color: '#aaa' }}>{t.budgetSettingsDesc}</div>

          <div className="settings-row">
            <div><div className="settings-label">{t.currencyLabel}</div><div className="settings-sub">{t.currencyDesc}</div></div>
            <select value={curr} onChange={e => setCurr(e.target.value)} className="settings-select">
              <option value="ILS">₪ ILS</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option>
            </select>
          </div>

          <div className="settings-row">
            <div><div className="settings-label">{t.countryLabel}</div><div className="settings-sub">{t.countryDesc}</div></div>
            <select value={country} onChange={e => setCountry(e.target.value)} className="settings-select">
              <option value="de">{t.countryDE}</option>
              <option value="il">{t.countryIL}</option>
              <option value="fr">{t.countryFR}</option>
              <option value="es">{t.countryES}</option>
              <option value="gb">{t.countryGB}</option>
              <option value="us">{t.countryUS}</option>
            </select>
          </div>

          <div className="settings-row">
            <div><div className="settings-label">{t.budgetModeLabel}</div><div className="settings-sub">{t.budgetModeDesc}</div></div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[['daily', t.modeDaily], ['weekly', t.modeWeekly]].map(([m, label]) => (
                <button key={m} onClick={() => setBudgetMode(m)} className={`mode-btn${budgetMode === m ? ' active' : ''}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">{budgetMode === 'weekly' ? t.weeklyBudgetInput : t.dailyBudgetInput}</div>
              {budgetMode === 'weekly' && budgetAmount && (
                <div className="settings-sub">{t.dailyPreview}: {getCurrencySymbol(curr)}{previewDaily.toFixed(2)}</div>
              )}
            </div>
            <input type="number" className="settings-input" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} placeholder="0" />
          </div>

          <button className="save-btn" onClick={saveSettings}>{saved ? t.savedBtn : t.saveSettingsBtn}</button>
        </>
      )}

      {isAdmin && (
        <>
          <div className="stats-title" style={{ marginTop: '1.5rem' }}>{t.balanceLabel}</div>
          <ResetRolloverButton groupId={groupId} user={user} />
        </>
      )}
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({ groupId, user, currency, t }) {
  const [products,  setProducts]  = useState([]);
  const [showAdd,   setShowAdd]   = useState(false);
  const [name,      setName]      = useState('');
  const [price,     setPrice]     = useState('');
  const [category,  setCategory]  = useState('food');

  useEffect(() => {
    return onSnapshot(
      collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items'),
      snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)))
    );
  }, [groupId, user.uid]);

  async function saveProduct(e) {
    e.preventDefault();
    if (!name.trim() || !price) return;
    const catRef   = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
    const existing = products.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      await updateDoc(doc(db, 'groups', groupId, 'product_catalog', user.uid, 'items', existing.id), { price: parseFloat(price), category });
    } else {
      await addDoc(catRef, { name: name.trim(), price: parseFloat(price), category });
    }
    setName(''); setPrice(''); setCategory('food'); setShowAdd(false);
  }

  return (
    <div className="stats-section">
      <button className="save-btn" style={{ marginBottom: '1rem' }} onClick={() => { setName(''); setPrice(''); setCategory('food'); setShowAdd(true); }}>
        {t.addProductBtn}
      </button>
      {products.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🛍️</div>{t.noProducts}</div>
      ) : products.map(p => {
        const cat = getCat(p.category);
        return (
          <div key={p.id} className="expense-item" style={{ marginBottom: '0.45rem' }}>
            <div className="expense-icon" style={{ background: cat.color + '22', overflow: 'hidden', padding: p.photo ? 0 : undefined }}>
              {p.photo
                ? <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '11px' }} />
                : <CatIcon cat={cat} />}
            </div>
            <div className="expense-info">
              <div className="expense-name">{p.name}</div>
              <div className="expense-meta">{getCatLabel(p.category, t)}</div>
            </div>
            <div className="expense-amount">{currency}{Number(p.price).toFixed(2)}</div>
            <button className="expense-delete" onClick={() => deleteDoc(doc(db, 'groups', groupId, 'product_catalog', user.uid, 'items', p.id))}>×</button>
          </div>
        );
      })}

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-title">{t.addProductTitle}</div>
            <form onSubmit={saveProduct}>
              <input type="text" placeholder={t.productNamePlaceholder} value={name} onChange={e => setName(e.target.value)} autoFocus required />
              <input type="number" step="0.01" placeholder={t.amountPlaceholder(currency)} value={price} onChange={e => setPrice(e.target.value)} required />
              <select value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{t[`cat_${c.id}`] || c.label}</option>)}
              </select>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>{t.cancelBtn}</button>
                <button type="submit" className="btn-primary">{t.addBtn}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shopping List ────────────────────────────────────────────────────────────


function ShoppingListTab({ groupId, user, currency, country: initialCountry, onCountryChange, estimation, onEstimationChange, estimationOpen, onEstimationOpenChange, t }) {
  const [country, setCountry] = useState(initialCountry || 'de');
  function changeCountry(c) { setCountry(c); onCountryChange && onCountryChange(c); }
  const [items,         setItems]       = useState([]);
  const [catalog,       setCatalog]     = useState([]);
  const [text,          setText]        = useState('');
  const [suggestions,   setSuggestions] = useState([]);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [newPrice,      setNewPrice]    = useState('');
  const [newCategory,   setNewCategory] = useState('groceries');
  const [filterMode,    setFilterMode]  = useState('all');
  const [buyItem,       setBuyItem]     = useState(null);
  const [buyPrice,      setBuyPrice]    = useState('');
  const [buyCategory,   setBuyCategory] = useState('groceries');
  const [buying,        setBuying]      = useState(false);
  const [estimating,    setEstimating]  = useState(false);
  function setEstimationOpen(v) { onEstimationOpenChange(typeof v === 'function' ? v(estimationOpen) : v); }
  const [editingId,     setEditingId]   = useState(null);
  const [editText,      setEditText]    = useState('');
  function setEstimation(v) { onEstimationChange(typeof v === 'function' ? v(estimation) : v); }

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'shopping_list'), orderBy('addedAt', 'asc')),
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [groupId]);

  useEffect(() => {
    getDocs(collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items'))
      .then(snap => setCatalog(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [groupId, user.uid]);

  useEffect(() => {
    const q = text.trim().toLowerCase();
    if (!q) { setSuggestions([]); return; }
    setSuggestions(catalog.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5));
  }, [text, catalog]);

  const visibleItems = filterMode === 'mine' ? items.filter(i => i.uid === user.uid) : items;

  async function addItem(nameOverride) {
    const trimmed = (nameOverride ?? text).trim();
    if (!trimmed) return;
    setText('');
    setSuggestions([]);
    setShowPriceForm(false);
    setNewPrice('');
    setNewCategory('groceries');
    await addDoc(collection(db, 'groups', groupId, 'shopping_list'), {
      text: trimmed, uid: user.uid,
      addedBy: user.displayName || user.email, addedAt: new Date(),
    });
  }

  function handleInputChange(val) {
    setText(val);
    setShowPriceForm(false);
    setNewPrice('');
    setNewCategory('groceries');
  }

  async function addItemWithPrice() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const amt = parseFloat(newPrice);
    if (!isNaN(amt) && amt > 0) {
      // Save to catalog
      const existing = catalog.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
      const catRef = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
      if (existing) {
        await updateDoc(doc(catRef, existing.id), { price: amt, category: newCategory });
        setCatalog(prev => prev.map(c => c.id === existing.id ? { ...c, price: amt, category: newCategory } : c));
      } else {
        const newDoc = await addDoc(catRef, { name: trimmed, price: amt, category: newCategory });
        setCatalog(prev => [...prev, { id: newDoc.id, name: trimmed, price: amt, category: newCategory }]);
      }
    }
    await addItem(trimmed);
  }

  function handleAddBtn() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const inCatalog = catalog.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (inCatalog) {
      addItem();
    } else {
      setShowPriceForm(p => !p);
    }
  }

  async function handleClaim(item) {
    if (item.claimedBy && item.claimedBy !== user.uid) return;
    const claiming = item.claimedBy !== user.uid;
    await updateDoc(doc(db, 'groups', groupId, 'shopping_list', item.id), {
      claimedBy:   claiming ? user.uid : null,
      claimedByName: claiming ? (user.displayName || user.email) : null,
    });
  }

  function openBuyModal(item) {
    setBuyItem(item);
    setBuyPrice('');
    setBuyCategory('groceries');
  }

  async function handleJustDelete() {
    await deleteDoc(doc(db, 'groups', groupId, 'shopping_list', buyItem.id));
    setBuyItem(null);
  }

  async function handleAddAsExpense() {
    const amt = parseFloat(buyPrice);
    if (!amt || isNaN(amt) || amt <= 0) return;
    setBuying(true);
    await addDoc(collection(db, 'groups', groupId, 'expenses'), {
      uid: user.uid, addedBy: user.displayName || user.email,
      amount: amt, description: buyItem.text,
      category: buyCategory, date: getTodayStr(), createdAt: new Date(),
    });
    // Save / update product catalog silently and refresh local catalog state
    const catRef  = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
    const existing = catalog.find(c => c.name.toLowerCase() === buyItem.text.toLowerCase());
    if (existing) {
      await updateDoc(doc(catRef, existing.id), { price: amt, category: buyCategory });
      setCatalog(prev => prev.map(c => c.id === existing.id ? { ...c, price: amt, category: buyCategory } : c));
    } else {
      const newDoc = await addDoc(catRef, { name: buyItem.text, price: amt, category: buyCategory });
      setCatalog(prev => [...prev, { id: newDoc.id, name: buyItem.text, price: amt, category: buyCategory }]);
    }
    await deleteDoc(doc(db, 'groups', groupId, 'shopping_list', buyItem.id));
    setBuyItem(null);
    setBuying(false);
  }

  async function remove(id) {
    await deleteDoc(doc(db, 'groups', groupId, 'shopping_list', id));
  }

  async function runEstimation() {
    setEstimating(true);
    setEstimation(null);

    const results = items.map(item => {
      // 1. Check personal catalog first (exact price the user has paid)
      const hit = catalog.find(c => c.name.toLowerCase() === item.text.toLowerCase());
      if (hit?.price) return { text: item.text, price: hit.price, fromCatalog: true };
      // 2. Fall back to local price reference database, then convert to display currency
      const ref = estimatePrice(item.text, country);
      const converted = ref !== null ? toDisplayCurrency(ref, country, currency) : null;
      return { text: item.text, price: converted, fromCatalog: false };
    });

    const priced = results.filter(r => r.price !== null).length;
    setEstimation({ items: results, total: results.reduce((s, r) => s + (r.price || 0), 0), priced, unknown: results.length - priced });
    setEstimationOpen(true);
    setEstimating(false);
  }

  function handleEstimationBtn() {
    if (estimation) {
      setEstimationOpen(o => !o);
    } else {
      runEstimation();
    }
  }

  async function saveEdit(item) {
    const trimmed = editText.trim();
    setEditingId(null);
    if (!trimmed || trimmed === item.text) return;
    await updateDoc(doc(db, 'groups', groupId, 'shopping_list', item.id), { text: trimmed });
  }

  return (
    <div className="tab-content shopping-tab-content">

      {/* ── Scrollable list area ── */}
      <div className="shopping-list-area">
        <div className="expense-tab-toolbar">
          <div className="view-toggle">
            <button className={`view-btn${filterMode === 'all'  ? ' active' : ''}`} onClick={() => setFilterMode('all')}>{t.filterAll}</button>
            <button className={`view-btn${filterMode === 'mine' ? ' active' : ''}`} onClick={() => setFilterMode('mine')}>{t.filterMine}</button>
          </div>
        </div>

        <div className="shopping-input-wrapper">
          <div className="shopping-input-row">
            <input
              className="shopping-input"
              placeholder={t.addShoppingItem}
              value={text}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { if (showPriceForm) addItemWithPrice(); else handleAddBtn(); } }}
              autoComplete="off"
            />
            <button className="shopping-add-btn" onClick={handleAddBtn} disabled={!text.trim()}>
              <Plus size={20} strokeWidth={2} />
            </button>
          </div>

          {suggestions.length > 0 && !showPriceForm && (
            <div className="shopping-suggestions">
              {suggestions.map(s => (
                <button key={s.id} className="shopping-suggestion-item" onMouseDown={() => addItem(s.name)}>
                  <span className="suggestion-name">{s.name}</span>
                  {s.price > 0 && <span className="suggestion-price">{currency}{s.price.toFixed(2)}</span>}
                </button>
              ))}
            </div>
          )}

          {showPriceForm && (
            <div className="shopping-price-form">
              <input
                type="number" step="0.01" min="0"
                className="shopping-price-input"
                placeholder={t.amountPlaceholder(currency)}
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                autoFocus
              />
              <select className="shopping-cat-select" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{t[`cat_${c.id}`] || c.label}</option>)}
              </select>
              <div className="shopping-price-actions">
                <button className="shop-quick-btn" onClick={() => addItem()}>{t.addBtn}</button>
                <button className="shop-priced-btn" onClick={addItemWithPrice} disabled={!newPrice.trim()}>
                  {t.addBtn} + {currency}
                </button>
              </div>
            </div>
          )}
        </div>

        {visibleItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><ListIcon size={40} strokeWidth={1} /></div>
            {t.noShoppingItems}
          </div>
        ) : (
          <div className="shopping-list">
            {visibleItems.map(item => (
              <div key={item.id} className="shopping-item">
                <button className="shopping-check" onClick={() => openBuyModal(item)}>
                  <Square size={22} strokeWidth={1.5} color="#bbb" />
                </button>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => { setEditingId(item.id); setEditText(item.text); }}>
                  {editingId === item.id ? (
                    <input
                      className="shopping-edit-input"
                      value={editText}
                      autoFocus
                      onChange={e => setEditText(e.target.value)}
                      onBlur={() => saveEdit(item)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') setEditingId(null); }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="shopping-text">{item.text}</div>
                      {item.claimedBy && (
                        <div className={`claimed-badge${item.claimedBy === user.uid ? ' mine' : ''}`}>
                          🛒 {item.claimedByName?.split(' ')[0]} {t.onMyWayBadge}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <span className="shopping-by">{(item.addedBy || '?').split(' ')[0]}</span>
                <button
                  className={`shopping-claim-btn${item.claimedBy === user.uid ? ' active' : ''}${item.claimedBy && item.claimedBy !== user.uid ? ' other' : ''}`}
                  onClick={() => handleClaim(item)}
                  title={item.claimedBy && item.claimedBy !== user.uid ? t.alreadyClaimed : item.claimedBy ? t.unclaimBtn : t.claimBtn}
                >
                  <Navigation size={20} strokeWidth={1.5} />
                </button>
                <button className="shopping-delete" onClick={() => remove(item.id)}>
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Estimation panel docked below list ── */}
      {items.length > 0 && (
        <div className="estimation-panel">
          <div className="estimation-panel-header">
            <button
              className={`estimation-btn${estimating ? ' loading' : ''}`}
              onClick={handleEstimationBtn}
              disabled={estimating}
            >
              {estimating ? t.estimating : t.cartEstimationBtn}
              {estimation && !estimating && <span className="estimation-toggle-icon">{estimationOpen ? ' ▾' : ' ▸'}</span>}
            </button>
            <select
              className="estimation-country-select"
              value={country}
              onChange={e => { changeCountry(e.target.value); setEstimation(null); }}
            >
              <option value="de">{t.countryDE}</option>
              <option value="il">{t.countryIL}</option>
              <option value="fr">{t.countryFR}</option>
              <option value="es">{t.countryES}</option>
              <option value="gb">{t.countryGB}</option>
              <option value="us">{t.countryUS}</option>
            </select>
            {estimation && (
              <span className="estimation-total-inline">{currency}{estimation.total.toFixed(2)}</span>
            )}
          </div>

          {estimation && estimationOpen && (
            <div className="estimation-results">
              <div className="estimation-total">{t.estimatedTotal(`${currency}${estimation.total.toFixed(2)}`)}</div>
              <div className="estimation-summary-row">
                {t.estimationSummary(estimation.priced, estimation.items.length)}
                {estimation.unknown > 0 && <span className="estimation-unknown"> · {t.estimationUnrecognized(estimation.unknown)}</span>}
              </div>
              <div className="estimation-list">
                {estimation.items.map((it, i) => (
                  <div key={i} className={`estimation-item${it.price === null ? ' unknown-price' : ''}`}>
                    <span className="estimation-item-name">{it.text}</span>
                    <span className="estimation-item-price">
                      {it.price !== null ? `${currency}${it.price.toFixed(2)}` : '?'}
                    </span>
                  </div>
                ))}
                <div style={{ height: '5rem' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {buyItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBuyItem(null)}>
          <div className="modal">
            <div className="modal-title">{t.boughtModalTitle}</div>
            <div className="bought-item-name">{buyItem.text}</div>
            <input
              type="number" step="0.01" min="0"
              placeholder={t.amountPlaceholder(currency)}
              value={buyPrice}
              onChange={e => setBuyPrice(e.target.value)}
              autoFocus
            />
            <select value={buyCategory} onChange={e => setBuyCategory(e.target.value)}>
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{t[`cat_${c.id}`] || c.label}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={handleJustDelete}>{t.justDelete}</button>
              <button type="button" className="btn-primary" onClick={handleAddAsExpense} disabled={!buyPrice.trim() || buying}>
                {buying ? '…' : t.addAsExpense}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Named Lists ─────────────────────────────────────────────────────────────

function MyListsPage({ groupId, user, t, lang, onClose }) {
  const [lists,         setLists]       = useState([]);
  const [selectedListId, setSelected]   = useState(null);
  const [listItems,     setListItems]   = useState([]);
  const [showCreate,    setShowCreate]  = useState(false);
  const [newName,       setNewName]     = useState('');
  const [newEmoji,      setNewEmoji]    = useState('');
  const [isShared,      setIsShared]    = useState(true);
  const [newItemText,   setNewItemText] = useState('');

  const selectedList = selectedListId ? lists.find(l => l.id === selectedListId) : null;

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'named_lists'), orderBy('createdAt', 'asc')),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLists(all.filter(l => l.isShared || l.createdBy === user.uid));
      }
    );
  }, [groupId]); // eslint-disable-line

  useEffect(() => {
    if (!selectedListId) { setListItems([]); return; }
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'named_lists', selectedListId, 'items'), orderBy('addedAt', 'asc')),
      snap => setListItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [groupId, selectedListId]); // eslint-disable-line

  async function createList(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await addDoc(collection(db, 'groups', groupId, 'named_lists'), {
      name: newName.trim(), emoji: newEmoji.trim() || '📋',
      isShared, createdBy: user.uid, createdAt: new Date(),
    });
    setNewName(''); setNewEmoji(''); setIsShared(true); setShowCreate(false);
  }

  async function addListItem() {
    const trimmed = newItemText.trim();
    if (!trimmed || !selectedListId) return;
    setNewItemText('');
    await addDoc(collection(db, 'groups', groupId, 'named_lists', selectedListId, 'items'), {
      text: trimmed, checked: false,
      addedBy: user.displayName || user.email, addedAt: new Date(),
    });
  }

  async function toggleListItem(itemId, checked) {
    await updateDoc(doc(db, 'groups', groupId, 'named_lists', selectedListId, 'items', itemId), { checked: !checked });
  }

  async function deleteListItem(itemId) {
    await deleteDoc(doc(db, 'groups', groupId, 'named_lists', selectedListId, 'items', itemId));
  }

  const backAction = selectedList ? () => setSelected(null) : onClose;
  const pageTitle  = selectedList ? `${selectedList.emoji} ${selectedList.name}` : t.myLists;

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={backAction}>
          {lang === 'he' ? '→' : '←'} {t.back}
        </button>
        <div className="settings-page-title">{pageTitle}</div>
        {!selectedList && (
          <button className="settings-back-btn" style={{ marginLeft: 'auto', fontSize: '1.3rem', fontWeight: 700, lineHeight: 1 }} onClick={() => setShowCreate(true)}>+</button>
        )}
      </div>

      {!selectedList ? (
        <div className="tab-content">
          {lists.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              {t.noLists}
            </div>
          ) : lists.map(list => (
            <div key={list.id} className="named-list-row" onClick={() => setSelected(list.id)}>
              <span className="named-list-emoji">{list.emoji}</span>
              <div className="named-list-info">
                <div className="named-list-name">{list.name}</div>
                <div className="named-list-meta">{list.isShared ? t.sharedList : t.privateList}</div>
              </div>
              <ChevronRight size={18} strokeWidth={1.5} color="#bbb" />
            </div>
          ))}
        </div>
      ) : (
        <div className="tab-content">
          <div className="shopping-input-row">
            <input
              className="shopping-input"
              placeholder={t.addListItem}
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addListItem()}
            />
            <button className="shopping-add-btn" onClick={addListItem} disabled={!newItemText.trim()}>
              <Plus size={20} strokeWidth={2} />
            </button>
          </div>
          {listItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              {t.noListItems}
            </div>
          ) : (
            <div className="shopping-list">
              {listItems.map(item => (
                <div key={item.id} className={`shopping-item${item.checked ? ' checked' : ''}`}>
                  <button className="shopping-check" onClick={() => toggleListItem(item.id, item.checked)}>
                    {item.checked
                      ? <CheckSquare size={22} strokeWidth={1.5} color="#214e99" />
                      : <Square size={22} strokeWidth={1.5} color="#bbb" />}
                  </button>
                  <span className="shopping-text">{item.text}</span>
                  <button className="shopping-delete" onClick={() => deleteListItem(item.id)}>
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <div className="modal-title">{t.createList}</div>
            <form onSubmit={createList}>
              <input type="text" placeholder={t.listNamePlaceholder} value={newName} onChange={e => setNewName(e.target.value)} autoFocus required />
              <input type="text" placeholder={t.listEmojiPlaceholder} value={newEmoji} onChange={e => setNewEmoji(e.target.value)} maxLength={4} style={{ textAlign: 'center', fontSize: '1.4rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button type="button" className={`view-btn${isShared ? ' active' : ''}`} style={{ flex: 1 }} onClick={() => setIsShared(true)}>{t.sharedList}</button>
                <button type="button" className={`view-btn${!isShared ? ' active' : ''}`} style={{ flex: 1 }} onClick={() => setIsShared(false)}>{t.privateList}</button>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowCreate(false)}>{t.cancelBtn}</button>
                <button type="submit" className="btn-primary">{t.createList}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sunday Prompt ────────────────────────────────────────────────────────────

function SundayPromptModal({ surplus, currency, onChoice, onDismiss, t }) {
  const [step, setStep]               = useState('menu');
  const [personalAmt, setPersonalAmt] = useState('');
  const [sharedAmt,   setSharedAmt]   = useState('');
  const amountStr = `${currency}${surplus.toFixed(2)}`;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">{t.sundayTitle}</div>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          {t.sundayDesc(amountStr)}
        </p>
        {step === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <button className="btn-primary"  onClick={() => onChoice('A', 0, 0)}>{t.keepCarrying}</button>
            <button className="btn-outline"  onClick={() => setStep('B')}>{t.moveToPersonal}</button>
            <button className="btn-outline"  onClick={() => setStep('C')}>{t.splitSavings}</button>
            <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#bbb', fontSize: '0.85rem', cursor: 'pointer' }}>{t.remindLater}</button>
          </div>
        )}
        {step === 'B' && (
          <>
            <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem' }}>{t.moveAllDesc(amountStr)}</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setStep('menu')}>{t.back}</button>
              <button className="btn-primary" onClick={() => onChoice('B', surplus, 0)}>{t.confirmBtn}</button>
            </div>
          </>
        )}
        {step === 'C' && (
          <>
            <div style={{ marginBottom: '0.75rem' }}>
              <label className="input-label">{t.toPersonal}</label>
              <input type="number" step="0.01" placeholder="0" value={personalAmt} onChange={e => setPersonalAmt(e.target.value)} className="split-input" />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="input-label">{t.toShared}</label>
              <input type="number" step="0.01" placeholder="0" value={sharedAmt} onChange={e => setSharedAmt(e.target.value)} className="split-input" />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setStep('menu')}>{t.back}</button>
              <button className="btn-primary" onClick={() => onChoice('C', parseFloat(personalAmt) || 0, parseFloat(sharedAmt) || 0)}>{t.confirmBtn}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function usePullToRefresh() {
  useEffect(() => {
    let startY = 0;
    function onTouchStart(e) { startY = e.touches[0].clientY; }
    function onTouchEnd(e) {
      const dist = e.changedTouches[0].clientY - startY;
      if (dist > 90 && window.scrollY === 0) window.location.reload();
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);
}

export default function Dashboard({ user, groupId, group, memberData, onLogout }) {
  const { t, lang, setLang } = useLanguage();
  usePullToRefresh();
  const TABS = [t.tabExpenses, t.tabShopping];

  const [tab,          setTab]         = useState(t.tabExpenses);
  const [shoppingEstimation, setShoppingEstimation] = useState(null);
  const [shoppingEstimationOpen, setShoppingEstimationOpen] = useState(true);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [showMenu,     setShowMenu]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats,    setShowStats]   = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [showMembers,  setShowMembers] = useState(false);
  const [showLists,    setShowLists]   = useState(false);
  const menuRef = useRef(null);
  const [expenses,     setExpenses]    = useState([]);
  const [allMembers,   setAllMembers]  = useState([]);
  const [showAdd,      setShowAdd]     = useState(false);
  const [showSunday,   setShowSunday]  = useState(false);
  const [viewMode,     setViewMode]    = useState('all');
  const [form,         setForm]        = useState({ amount: '', description: '', category: 'food', date: getTodayStr(), photo: null });
  const [addError,     setAddError]    = useState('');
  const [catalog,      setCatalog]     = useState([]);
  const [suggestions,  setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef(null);
  const photoInputRef = useRef(null);

  // Keep tab in sync when language changes
  useEffect(() => {
    setTab(t.tabExpenses);
  }, [lang]); // eslint-disable-line

  const dailyBudget = getDailyBudget(group);
  const currency    = getCurrencySymbol(group.currency);
  const today       = getTodayStr();
  const isAdmin     = group.adminUid === user.uid;

  // Load catalog when modal opens
  useEffect(() => {
    if (!showAdd) { setSuggestions([]); setShowSuggestions(false); return; }
    getDocs(collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items'))
      .then(snap => setCatalog(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [showAdd]); // eslint-disable-line

  // Close header dropdown on outside click
  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  // Process past days
  useEffect(() => {
    if (!memberData) return;
    const yesterday    = getYesterdayStr();
    const lastProcessed = memberData.last_day_processed;
    if (lastProcessed === yesterday || lastProcessed === today) return;

    async function processDays() {
      let runningBalance = memberData.running_balance || 0;
      if (!lastProcessed) {
        await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { last_day_processed: yesterday });
        return;
      }
      let processDate = addDaysToStr(lastProcessed, 1);
      while (processDate <= yesterday) {
        const expQ    = query(collection(db, 'groups', groupId, 'expenses'), where('uid', '==', user.uid), where('date', '==', processDate));
        const expSnap = await getDocs(expQ);
        const dayTotal = expSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
        const net      = dailyBudget - dayTotal;
        runningBalance += net;
        await setDoc(doc(db, 'groups', groupId, 'daily_records', `${user.uid}_${processDate}`), {
          uid: user.uid, date: processDate,
          total_spent: dayTotal, debt: Math.max(0, -net), surplus: Math.max(0, net), daily_budget: dailyBudget,
        });
        processDate = addDaysToStr(processDate, 1);
      }
      await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
        running_balance: runningBalance, last_day_processed: yesterday,
      });
    }
    processDays();
  }, [memberData?.last_day_processed]); // eslint-disable-line

  // Sunday prompt
  useEffect(() => {
    if (!memberData || !isSunday()) return;
    if (memberData.last_sunday_prompt === today) return;
    if ((memberData.running_balance || 0) <= 0) return;
    setShowSunday(true);
  }, [memberData?.last_sunday_prompt, memberData?.running_balance]); // eslint-disable-line

  // Real-time data
  useEffect(() => {
    const q = query(collection(db, 'groups', groupId, 'expenses'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [groupId]);

  useEffect(() => {
    return onSnapshot(
      collection(db, 'groups', groupId, 'members'),
      snap => setAllMembers(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    );
  }, [groupId]);

  // Balance
  const myTodayTotal   = expenses.filter(e => e.uid === user.uid && e.date === today).reduce((s, e) => s + e.amount, 0);
  const runningBalance = memberData.running_balance || 0;
  const todayBalance   = runningBalance + dailyBudget - myTodayTotal;
  const maxTodaySpend  = dailyBudget * 2;
  const canStillSpend  = Math.max(0, todayBalance);
  const inOverdraft    = todayBalance < 0;
  const balancePct     = dailyBudget > 0 ? Math.min(100, Math.max(0, (todayBalance / dailyBudget) * 100)) : 0;
  const balanceColor   = todayBalance > dailyBudget * 0.5 ? '#4caf50' : todayBalance > dailyBudget * 0.2 ? '#ff9800' : '#f44336';

  function getMemberBalance(member) {
    const mt = expenses.filter(e => e.uid === member.uid && e.date === today).reduce((s, e) => s + e.amount, 0);
    return (member.running_balance || 0) + dailyBudget - mt;
  }

  // Catalog autocomplete
  function handleDescriptionChange(val) {
    setForm(f => ({ ...f, description: val }));
    if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    const matches = catalog.filter(c => c.name.toLowerCase().includes(val.toLowerCase()));
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }

  function selectSuggestion(item) {
    setForm(f => ({ ...f, description: item.name, amount: String(item.price), category: item.category }));
    setShowSuggestions(false);
  }

  // Last 7 days for date picker
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    const str = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const label = i === 0 ? t.today : i === 1 ? t.yesterday
      : d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return { value: str, label };
  });

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * ratio; canvas.height = img.height * ratio;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setForm(f => ({ ...f, photo: canvas.toDataURL('image/jpeg', 0.75) }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Add expense
  async function addExpense(e) {
    e.preventDefault();
    setAddError('');
    const amt = parseFloat(form.amount);
    if (!amt || isNaN(amt) || amt <= 0) return;

    if (form.date === today && myTodayTotal + amt > maxTodaySpend) {
      setAddError(t.maxSpendError(currency, maxTodaySpend.toFixed(2)));
      return;
    }

    const expDate = form.date || today;
    const expDoc = {
      uid: user.uid, addedBy: user.displayName || user.email,
      amount: amt,
      description: form.description.trim() || getCat(form.category).label,
      category: form.category, date: expDate, createdAt: new Date(),
    };
    if (form.photo) expDoc.photo = form.photo;
    await addDoc(collection(db, 'groups', groupId, 'expenses'), expDoc);

    // Retroactive: deduct from already-processed running_balance
    if (expDate !== today) {
      await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
        running_balance: (memberData.running_balance || 0) - amt,
      });
    }

    if (form.description.trim()) {
      const name     = form.description.trim();
      const catRef   = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
      const existing = catalog.find(c => c.name.toLowerCase() === name.toLowerCase());
      const catalogUpdate = { price: amt, category: form.category };
      if (form.photo) catalogUpdate.photo = form.photo;
      if (existing) {
        await updateDoc(doc(catRef, existing.id), catalogUpdate);
      } else {
        await addDoc(catRef, { name, ...catalogUpdate });
      }
    }

    setForm({ amount: '', description: '', category: 'food', date: today, photo: null });
    setShowAdd(false);
  }

  async function deleteExpense(id) {
    const exp = expenses.find(e => e.id === id);
    await deleteDoc(doc(db, 'groups', groupId, 'expenses', id));
    // If it was a past-day expense, restore the running_balance that was deducted when it was added
    if (exp && exp.uid === user.uid && exp.date !== today) {
      await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
        running_balance: (memberData.running_balance || 0) + exp.amount,
      });
    }
  }

  // Sunday choice
  async function handleSundayChoice(option, personalAmt, sharedAmt) {
    const surplus   = memberData.running_balance || 0;
    const batch     = writeBatch(db);
    const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
    const groupRef  = doc(db, 'groups', groupId);

    if (option === 'A') {
      batch.update(memberRef, { last_sunday_prompt: today });
    } else if (option === 'B') {
      batch.update(memberRef, { savings_box_personal: (memberData.savings_box_personal || 0) + surplus, running_balance: 0, last_sunday_prompt: today });
    } else if (option === 'C') {
      const toPersonal = Math.min(personalAmt, surplus);
      const toShared   = Math.min(sharedAmt, surplus - toPersonal);
      batch.update(memberRef, { savings_box_personal: (memberData.savings_box_personal || 0) + toPersonal, running_balance: surplus - toPersonal - toShared, last_sunday_prompt: today });
      if (toShared > 0) {
        batch.update(groupRef, {
          savings_box_shared: (group.savings_box_shared || 0) + toShared,
          [`shared_savings_contributors.${user.uid}`]: ((group.shared_savings_contributors?.[user.uid]) || 0) + toShared,
        });
      }
    }
    await batch.commit();
    setShowSunday(false);
  }

  return (
    <>
      <div className="header">
        <div className="header-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <img src="/logo-header-v4.png" alt="Pocket Budget" style={{ height: '64px' }} />
            <div className="header-user">{t.hi}, {(user.displayName || user.email).split(' ')[0]}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="logout-btn" onClick={() => window.location.reload()} title="Refresh">↺</button>
            <div className="header-menu-wrap" ref={menuRef}>
              <button className="logout-btn" onClick={() => setShowMenu(m => !m)} title="Menu">
                <SettingsIcon size={16} strokeWidth={1.5} />
              </button>
              {showMenu && (
                <div className="header-dropdown">
                  <button onClick={() => { setShowMenu(false); setShowSettings(true); }}>
                    <SettingsIcon size={15} strokeWidth={1.5} /> {t.tabSettings}
                  </button>
                  <button onClick={() => { setLang(lang === 'en' ? 'he' : 'en'); setShowMenu(false); }}>
                    <Globe size={15} strokeWidth={1.5} /> {lang === 'en' ? 'עברית' : 'English'}
                  </button>
                  <button onClick={() => { setShowLists(true); setShowMenu(false); }}>
                    <ClipboardList size={15} strokeWidth={1.5} /> {t.myLists}
                  </button>
                  <div className="dropdown-divider" />
                  <button onClick={() => { setShowStats(true); setShowMenu(false); }}>
                    <BarChart2 size={15} strokeWidth={1.5} /> {t.tabStats}
                  </button>
                  <button onClick={() => { setShowProducts(true); setShowMenu(false); }}>
                    <PackageIcon size={15} strokeWidth={1.5} /> {t.tabProducts}
                  </button>
                  <button onClick={() => { setShowMembers(true); setShowMenu(false); }}>
                    <Users size={15} strokeWidth={1.5} /> {t.tabMembers}
                  </button>
                  <div className="dropdown-divider" />
                  <button onClick={onLogout}>
                    <LogOut size={15} strokeWidth={1.5} /> {t.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="budget-overview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
            <div>
              <div className="budget-label">{t.todayBalance}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '0.1rem' }}>
                {new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
              <div className="budget-amount" style={{ color: todayBalance < 0 ? '#ff6b6b' : todayBalance < dailyBudget * 0.2 ? '#ffcc80' : 'white' }}>
                {todayBalance < 0 ? '-' : ''}{currency}{Math.abs(todayBalance).toFixed(2)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="budget-label">{t.dailyBudget}</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{currency}{dailyBudget.toFixed(2)}</div>
              {group.budgetMode === 'weekly' && (
                <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{t.weekly}: {currency}{group.budgetAmount}</div>
              )}
            </div>
          </div>
          {inOverdraft && (
            <div className="overdraft-banner">
              ⚠️ {t.overdraft(`${currency}${canStillSpend.toFixed(2)}`)}
            </div>
          )}
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${balancePct}%`, background: balanceColor }} />
          </div>
          <div className="budget-meta" style={{ marginTop: '0.5rem' }}>
            <div className="budget-meta-item">{t.spent}: <span>{currency}{myTodayTotal.toFixed(2)}</span></div>
            <div className="budget-meta-item">
              {t.rollover}: <span style={{ color: runningBalance < 0 ? '#ff9999' : 'rgba(255,255,255,0.9)' }}>
                {runningBalance >= 0 ? '+' : ''}{currency}{runningBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(tabName => (
          <button key={tabName} className={`tab${tab === tabName ? ' active' : ''}`} onClick={() => setTab(tabName)}>
            {tabName}
          </button>
        ))}
      </div>

      {tab === t.tabExpenses && <ExpensesTab expenses={expenses} user={user} currency={currency} onDelete={deleteExpense} onPhotoClick={setLightboxPhoto} t={t} lang={lang} viewMode={viewMode} onViewModeChange={setViewMode} />}
      {tab === t.tabShopping && <ShoppingListTab groupId={groupId} user={user} currency={currency} country={group.country || 'de'} onCountryChange={c => updateDoc(doc(db, 'groups', groupId), { country: c })} estimation={shoppingEstimation} onEstimationChange={setShoppingEstimation} estimationOpen={shoppingEstimationOpen} onEstimationOpenChange={setShoppingEstimationOpen} t={t} />}

      {showSettings && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowSettings(false)}>
              {lang === 'he' ? '→' : '←'} {t.back}
            </button>
            <div className="settings-page-title">{t.tabSettings}</div>
          </div>
          <SettingsTab group={group} groupId={groupId} isAdmin={isAdmin} memberData={memberData} user={user} t={t} />
        </div>
      )}

      {showStats && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowStats(false)}>
              {lang === 'he' ? '→' : '←'} {t.back}
            </button>
            <div className="settings-page-title">{t.tabStats}</div>
          </div>
          <StatsTab expenses={expenses} user={user} currency={currency} today={today} t={t} lang={lang} viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>
      )}

      {showProducts && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowProducts(false)}>
              {lang === 'he' ? '→' : '←'} {t.back}
            </button>
            <div className="settings-page-title">{t.tabProducts}</div>
          </div>
          <ProductsTab groupId={groupId} user={user} currency={currency} t={t} />
        </div>
      )}

      {showMembers && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowMembers(false)}>
              {lang === 'he' ? '→' : '←'} {t.back}
            </button>
            <div className="settings-page-title">{t.tabMembers}</div>
          </div>
          <MembersTab members={allMembers} expenses={expenses} today={today} currency={currency}
            group={group} groupId={groupId} isAdmin={isAdmin} getMemberBalance={getMemberBalance} t={t} />
        </div>
      )}

      {showLists && (
        <MyListsPage groupId={groupId} user={user} t={t} lang={lang} onClose={() => setShowLists(false)} />
      )}

      <button className="add-btn" onClick={() => {
        setForm({ amount: '', description: '', category: 'food', date: today, photo: null });
        setSuggestions([]); setShowSuggestions(false);
        setAddError(''); setShowAdd(true);
      }}>+</button>

      {showAdd && (
        <div className="modal-overlay add-expense-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal add-expense-modal">
            <div className="modal-title">{t.addExpenseTitle}</div>
            <form onSubmit={addExpense}>
              <div className="autocomplete-wrap" ref={suggestionRef}>
                <input
                  type="text" placeholder={t.productNamePlaceholder}
                  value={form.description} onChange={e => handleDescriptionChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  autoComplete="off" autoFocus required
                />
                {showSuggestions && (
                  <div className="suggestions-list">
                    {suggestions.map(item => (
                      <div key={item.id} className="suggestion-item" onMouseDown={e => { e.preventDefault(); selectSuggestion(item); }}>
                        <span className="suggestion-name">{item.name}</span>
                        <span className="suggestion-meta">{currency}{item.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number" step="0.01" placeholder={t.amountPlaceholder(currency)}
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required
              />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{t[`cat_${c.id}`] || c.label}</option>
                ))}
              </select>
              <select value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}>
                {dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{ marginBottom: '0.7rem' }}>
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
                {form.photo ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <img src={form.photo} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10 }} />
                    <button type="button" className="btn-secondary" style={{ flex: 1, marginTop: 0, padding: '0.5rem' }}
                      onClick={() => photoInputRef.current.click()}>{t.changePhoto}</button>
                    <button type="button" className="btn-cancel" style={{ padding: '0.5rem 0.75rem', borderRadius: 10, border: 'none', background: '#f5f5f5', cursor: 'pointer' }}
                      onClick={() => setForm(f => ({ ...f, photo: null }))}>×</button>
                  </div>
                ) : (
                  <button type="button" className="btn-secondary" style={{ marginTop: 0 }}
                    onClick={() => photoInputRef.current.click()}>📷 {t.addPhoto}</button>
                )}
              </div>
              {addError && <div className="add-error">{addError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>{t.cancelBtn}</button>
                <button type="submit" className="btn-primary">{t.addBtn}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSunday && (
        <SundayPromptModal
          surplus={memberData.running_balance || 0} currency={currency}
          onChoice={handleSundayChoice} t={t}
          onDismiss={async () => {
            await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { last_sunday_prompt: today });
            setShowSunday(false);
          }}
        />
      )}

      {lightboxPhoto && (
        <div className="lightbox-overlay" onClick={() => setLightboxPhoto(null)}>
          <img src={lightboxPhoto} alt="" className="lightbox-img" />
        </div>
      )}
    </>
  );
}
