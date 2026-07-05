import { useState, useEffect, useRef } from 'react';
import { Plus, Square, CheckSquare, Trash2, ShoppingCart as ListIcon, Settings as SettingsIcon, LogOut, Globe, BarChart2, Package as PackageIcon, Users, ChevronRight, ClipboardList, Camera, ScanLine, Receipt as ReceiptIcon, NotepadText, TrendingDown, TrendingUp, Repeat2, X, MapPin, Pencil, AlertTriangle } from 'lucide-react';
import { scanReceipt, fetchGeminiPriceEstimate, categorizeItemsByStore } from './receiptService';
import {
  collection, addDoc, onSnapshot, deleteDoc, doc, getDoc,
  query, orderBy, where, getDocs, updateDoc, setDoc, writeBatch, serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import {
  getTodayStr, getYesterdayStr, addDaysToStr,
  getDailyBudget, getCurrencySymbol, getCat, CATEGORIES,
  isSunday,
} from './utils';
import { useLanguage } from './LanguageContext';
import { estimatePrice, toDisplayCurrency, convertAmount, fetchLiveRates } from './pricedb';

// Map currency symbols to codes so getDisplayAmount works whether you pass '€' or 'EUR'
const SYMBOL_TO_CODE = { '€': 'EUR', '₪': 'ILS', '£': 'GBP', '$': 'USD' };

// Returns the expense amount converted to the current group currency.
// Uses originalAmount + originalCurrency when present; falls back to legacy amount.
function getDisplayAmount(exp, currencyOrCode) {
  const code = SYMBOL_TO_CODE[currencyOrCode] || currencyOrCode;
  if (exp.originalCurrency && exp.originalAmount != null) {
    return convertAmount(exp.originalAmount, exp.originalCurrency, code);
  }
  return exp.amount;
}

function CatIcon({ cat, size = 18 }) {
  const Icon = cat.icon;
  return <Icon size={size} strokeWidth={1.5} />;
}

// Minimalistic edit pencil that matches the app's line-icon style
function EditPencilIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ verticalAlign: 'middle', opacity: 0.55 }}>
      <path d="M9.5 2.5 L11.5 4.5 L4.5 11.5 L2 12 L2.5 9.5 Z" />
      <path d="M8 4 L10 6" />
    </svg>
  );
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

function ExpenseItem({ exp, user, currency, onDelete, onPhotoClick, onReassign, onAddPhoto, allMembers, t, isOwn, viewMode }) {
  const cat = getCat(exp.category);
  const isCredit = exp.amount < 0;
  const amountColor = isCredit ? '#16a34a' : (viewMode === 'all' && isOwn) ? '#f0948a' : '#e74c3c';
  const canReassign = allMembers && allMembers.length > 1;
  const canAddPhoto = isOwn && !exp.photo;
  const photoInputRef = useRef(null);

  function handleIconClick() {
    if (exp.photo) {
      onPhotoClick?.(exp.photo);
    } else if (canAddPhoto) {
      photoInputRef.current?.click();
    }
  }

  return (
    <div className="expense-item">
      <div
        className={`expense-icon cat-icon--${exp.category}`}
        style={{ overflow: 'hidden', padding: exp.photo ? 0 : undefined, cursor: (exp.photo || canAddPhoto) ? 'pointer' : 'default', position: 'relative' }}
        onClick={handleIconClick}
      >
        {exp.photo
          ? <img src={exp.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '11px' }} />
          : <CatIcon cat={cat} />}
        {canAddPhoto && (
          <div style={{ position: 'absolute', bottom: 1, right: 1, background: 'rgba(255,255,255,0.82)', borderRadius: '50%', width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={9} strokeWidth={1.8} color="var(--color-primary)" />
          </div>
        )}
        <input
          ref={photoInputRef}
          type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onAddPhoto?.(exp, f); }}
        />
      </div>
      <div className="expense-info">
        <div className="expense-name">
          {exp.description}
          {exp.quantity > 1 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontWeight: 500, marginLeft: '0.25rem' }}>
              ×{exp.quantity}
            </span>
          )}
          <span
            className={`who-badge${exp.uid === user.uid ? ' who-badge--own' : ' who-badge--other'}`}
            style={{ cursor: canReassign ? 'pointer' : 'default' }}
            onClick={canReassign ? () => onReassign(exp) : undefined}
          >
            {(exp.addedBy || '?').split(' ')[0]}
          </span>
        </div>
        <div className="expense-meta">{getCatLabel(exp.category, t)}</div>
      </div>
      <div className="expense-amount" style={{ color: amountColor }}>{isCredit ? '−' : ''}{currency}{Math.abs(getDisplayAmount(exp, currency)).toFixed(2)}</div>
      {exp.uid === user.uid && (
        <button className="expense-delete" onClick={() => onDelete(exp.id)}>×</button>
      )}
    </div>
  );
}

function ExpensesTab({ expenses, user, currency, onDelete, onPhotoClick, onReassign, onAddPhoto, allMembers, t, lang, viewMode, onViewModeChange }) {
  const today = getTodayStr();
  const [selDate,       setSelDate]       = useState(today);
  const [pendingDelete, setPendingDelete] = useState(null); // expense object awaiting confirm

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
          <div className="empty-state">
            <div className="empty-state-logo-wrap">
              <img src="/logo-header-v4.png" alt="" className="empty-state-logo" />
            </div>
            {t.noExpenses}
          </div>
        ) : sortedDays.map(dateKey => {
          const dayTotal   = groups[dateKey].reduce((s, e) => s + getDisplayAmount(e, currency), 0);
          const myDayTotal = groups[dateKey].filter(e => e.uid === user.uid).reduce((s, e) => s + getDisplayAmount(e, currency), 0);
          return (
            <div key={dateKey} className="day-group">
              <div className="day-label">
                <span>{formatDateStr(dateKey, t, lang)}</span>
                {viewMode === 'all' ? (
                  <span className="day-total day-total--split">
                    <span className="day-total-mine"><span className="day-total-label">My: </span>{currency}{myDayTotal.toFixed(2)}</span>
                    <span className="day-total-sep">·</span>
                    <span><span className="day-total-label">All: </span>{currency}{dayTotal.toFixed(2)}</span>
                  </span>
                ) : (
                  <span className="day-total"><span className="day-total-label">Total: </span>{currency}{dayTotal.toFixed(2)}</span>
                )}
              </div>
              {groups[dateKey].map(exp => (
                <ExpenseItem key={exp.id} exp={exp} user={user} currency={currency} onDelete={() => setPendingDelete(exp)} onPhotoClick={onPhotoClick} onReassign={onReassign} onAddPhoto={onAddPhoto} allMembers={allMembers} t={t} isOwn={exp.uid === user.uid} viewMode={viewMode} />
              ))}
            </div>
          );
        })}
      </div>

      {pendingDelete && (
        <div className="modal-overlay" onClick={() => setPendingDelete(null)} style={{ alignItems: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20, padding: '1.4rem 1.2rem 1rem',
            width: '88vw', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
          }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', marginBottom: '0.35rem' }}>
              {t.deleteExpenseTitle}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '1.1rem', lineHeight: 1.5 }}>
              "{pendingDelete.description}" · {currency}{Math.abs(getDisplayAmount(pendingDelete, currency)).toFixed(2)}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setPendingDelete(null)} style={{
                flex: 1, padding: '0.6rem', borderRadius: 12,
                border: '1.5px solid #E5E7EB', background: 'none',
                color: '#6B7280', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              }}>
                {t.cancelBtn}
              </button>
              <button onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null); }} style={{
                flex: 1, padding: '0.6rem', borderRadius: 12,
                border: 'none', background: '#EF4444',
                color: 'white', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              }}>
                {t.deleteExpenseConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
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
    .map(cat => ({ ...cat, label: getCatLabel(cat.id, t), total: filtered.filter(e => e.category === cat.id).reduce((s, e) => s + getDisplayAmount(e, currency), 0) }))
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
    const catTotal = catExps.reduce((s, e) => s + getDisplayAmount(e, currency), 0);
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
          <div className="empty-state"><div className="empty-state-icon"><BarChart2 size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>{t.noDataPeriod}</div>
        ) : catExps.map(exp => (
          <div key={exp.id} className="expense-item" style={{ marginBottom: '0.45rem' }}>
            <div className={`expense-icon cat-icon--${drillCategory}`}><CatIcon cat={cat} /></div>
            <div className="expense-info">
              <div className="expense-name">
                {exp.description}
                {exp.quantity > 1 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontWeight: 500, marginLeft: '0.25rem' }}>
                    ×{exp.quantity}
                  </span>
                )}
                <span className={`who-badge${exp.uid === user.uid ? ' who-badge--own' : ' who-badge--other'}`}>{(exp.addedBy || '?').split(' ')[0]}</span>
              </div>
              <div className="expense-meta">{formatDateStr(exp.date, t, lang)}</div>
            </div>
            <div className="expense-amount">{currency}{getDisplayAmount(exp, currency).toFixed(2)}</div>
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
        <div className="empty-state"><div className="empty-state-icon"><BarChart2 size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>{t.noDataPeriod}</div>
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
        const mt  = expenses.filter(e => e.uid === member.uid && e.date === today).reduce((s, e) => s + getDisplayAmount(e, currency), 0);
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

// ─── Profile Page ─────────────────────────────────────────────────────────────

function ProfilePage({ group, groupId, memberData, user, isAdmin, t, lang, onClose, onOpenList, todayBalance = 0, bigExpenses = [] }) {
  const avatarInputRef = useRef(null);
  const currency = getCurrencySymbol(group.currency);
  const [lists,         setLists]        = useState([]);
  const [savingsAction, setSavingsAction] = useState(null); // null | 'toBalance' | 'toShared' | 'fromBalance'
  const [savingsAmount, setSavingsAmount] = useState('');
  const [savingSaving,  setSavingSaving]  = useState(false);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'named_lists'), orderBy('createdAt', 'asc')),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLists(all.filter(l => l.isShared || l.createdBy === user.uid));
      }
    );
  }, [groupId]); // eslint-disable-line

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
        await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { avatarUrl: canvas.toDataURL('image/jpeg', 0.82) });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function handleSavingsConfirm() {
    const amt = parseFloat(savingsAmount);
    if (!amt || isNaN(amt) || amt <= 0) return;
    setSavingSaving(true);
    try {
      if (savingsAction === 'fromBalance') {
        if (amt > todayBalance) { alert(t.balanceInsufficientFunds); return; }
        await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
          running_balance: (memberData.running_balance || 0) - amt,
          savings_box_personal: (memberData.savings_box_personal || 0) + amt,
        });
      } else {
        const current = memberData.savings_box_personal || 0;
        if (amt > current) { alert(t.savingsInsufficientFunds); return; }
        if (savingsAction === 'toBalance') {
          await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
            savings_box_personal: current - amt,
            running_balance: (memberData.running_balance || 0) + amt,
          });
        } else if (savingsAction === 'toShared') {
          await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
            savings_box_personal: current - amt,
          });
          await updateDoc(doc(db, 'groups', groupId), {
            savings_box_shared: (group.savings_box_shared || 0) + amt,
            [`shared_savings_contributors.${user.uid}`]: ((group.shared_savings_contributors?.[user.uid]) || 0) + amt,
          });
        }
      }
      setSavingsAction(null);
      setSavingsAmount('');
    } finally { setSavingSaving(false); }
  }

  const personalSavings = memberData.savings_box_personal || 0;

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onClose}>{lang === 'he' ? '→' : '←'} {t.back}</button>
        <div className="settings-page-title">{t.tabProfile}</div>
      </div>
      <div className="settings-page-body">
        <div className="settings-section">
          {/* Avatar */}
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

          {/* Personal savings */}
          <div className="stats-title" style={{ marginTop: '1rem' }}>{t.yourSavingsBox}</div>

          {/* Add from balance — above the savings row */}
          {!savingsAction && (
            <button className="btn-outline"
              style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem', marginBottom: '0.4rem',
                opacity: todayBalance > 0 ? 1 : 0.4, pointerEvents: todayBalance > 0 ? 'auto' : 'none' }}
              onClick={() => setSavingsAction('fromBalance')}
              disabled={todayBalance <= 0}>
              {t.addFromBalance}
            </button>
          )}

          <div className="settings-row">
            <div>
              <div className="settings-label">{t.personalSavings}</div>
              <div className="settings-sub">{t.personalSavingsDesc}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.3rem', color: '#214e99' }}>
              {currency}{personalSavings.toFixed(2)}
            </div>
          </div>

          {/* Add to balance + Move to shared — always visible */}
          {!savingsAction && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
              <button className="btn-outline"
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem',
                  opacity: personalSavings > 0 ? 1 : 0.4 }}
                disabled={personalSavings <= 0}
                onClick={() => setSavingsAction('toBalance')}>
                {t.addToBalance}
              </button>
              <button className="btn-outline"
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem',
                  opacity: personalSavings > 0 ? 1 : 0.4 }}
                disabled={personalSavings <= 0}
                onClick={() => setSavingsAction('toShared')}>
                {t.moveToShared}
              </button>
            </div>
          )}

          {/* Savings action form */}
          {savingsAction && (
            <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text)' }}>
                {savingsAction === 'toBalance' ? t.addToBalance : savingsAction === 'toShared' ? t.moveToShared : t.addFromBalance}
              </div>
              <input
                type="number" step="0.01" min="0.01" max={personalSavings}
                className="settings-input"
                value={savingsAmount}
                onChange={e => setSavingsAmount(e.target.value)}
                placeholder={t.amountPlaceholder(currency)}
                autoFocus
                style={{ marginBottom: '0.5rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-primary" style={{ flex: 1 }}
                  onClick={handleSavingsConfirm} disabled={savingSaving || !savingsAmount}>
                  {savingSaving ? '…' : t.confirmBtn}
                </button>
                <button className="btn-outline" style={{ flex: 1 }}
                  onClick={() => { setSavingsAction(null); setSavingsAmount(''); }}>
                  {t.cancelBtn}
                </button>
              </div>
            </div>
          )}

          {/* Big Expenses */}
          {bigExpenses.length > 0 && (
            <>
              <div className="stats-title" style={{ marginTop: '1.5rem' }}>{t.bigExpenses}</div>
              {bigExpenses.map(exp => {
                const daysElapsed = Math.max(0, Math.floor((new Date(getTodayStr()) - new Date(exp.startDate)) / 86400000));
                const totalDays = exp.weeks * 7;
                const isDone = daysElapsed >= totalDays;
                const remaining = isDone ? 0 : Math.max(0, exp.totalAmount - daysElapsed * exp.dailyAmount);
                const daysLeft = Math.max(0, totalDays - daysElapsed);
                const pct = totalDays > 0 ? Math.min(100, (daysElapsed / totalDays) * 100) : 100;
                return (
                  <div key={exp.id} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span className="settings-label">{exp.name}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isDone ? '#4ADE80' : 'var(--color-primary)' }}>
                        {isDone ? t.bigExpensePaidOff : `${currency}${remaining.toFixed(2)} ${t.bigExpenseRemaining}`}
                      </span>
                    </div>
                    <div className="settings-sub" style={{ marginBottom: '0.35rem' }}>
                      −{currency}{exp.dailyAmount.toFixed(2)}{t.bigExpensePerDay}
                      {!isDone && ` · ${t.bigExpenseEndsIn(daysLeft)}`}
                    </div>
                    <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2 }}>
                      <div style={{ height: 4, width: `${pct}%`, background: isDone ? '#4ADE80' : 'var(--color-primary)', borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* My Lists */}
          <div className="stats-title" style={{ marginTop: '1.5rem' }}>{t.myLists}</div>
          {lists.map(list => (
            <div key={list.id} className="settings-row" style={{ cursor: 'pointer' }} onClick={() => onOpenList(list.id)}>
              <div>
                <div className="settings-label">{list.emoji} {list.name}</div>
                <div className="settings-sub">{list.isShared ? t.sharedList : t.privateList}</div>
              </div>
              <ChevronRight size={16} color="#aaa" />
            </div>
          ))}
          <div className="settings-row" style={{ cursor: 'pointer' }} onClick={() => onOpenList(null)}>
            <div className="settings-label" style={{ color: 'var(--color-primary)' }}>+ {t.createList}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scanned Receipts Page ─────────────────────────────────────────────────────

const RECEIPT_CURRENCIES = ['ILS', 'EUR', 'USD', 'GBP'];

function ScannedReceiptsPage({ groupId, currency, t, lang, onClose }) {
  const [receipts,           setReceipts]           = useState([]);
  const [lightboxReceipt,    setLightboxReceipt]    = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [editingName,        setEditingName]        = useState(false);
  const [nameInput,          setNameInput]          = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'groups', groupId, 'receipts'), orderBy('scannedAt', 'desc')))
      .then(snap => { setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
  }, [groupId]);

  function formatReceiptDate(r) {
    if (!r.scannedAt) return '';
    const d = r.scannedAt.toDate ? r.scannedAt.toDate() : new Date(r.scannedAt);
    return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function openNameEdit() {
    setNameInput(lightboxReceipt.storeName || '');
    setEditingName(true);
  }

  async function confirmNameEdit() {
    const name = nameInput.trim() || null;
    await updateDoc(doc(db, 'groups', groupId, 'receipts', lightboxReceipt.id), { storeName: name });
    const updated = { ...lightboxReceipt, storeName: name };
    setLightboxReceipt(updated);
    setReceipts(prev => prev.map(r => r.id === lightboxReceipt.id ? updated : r));
    setEditingName(false);
  }

  async function handleCurrencyChange(code) {
    await updateDoc(doc(db, 'groups', groupId, 'receipts', lightboxReceipt.id), { currency: code });
    const updated = { ...lightboxReceipt, currency: code };
    setLightboxReceipt(updated);
    setReceipts(prev => prev.map(r => r.id === lightboxReceipt.id ? updated : r));
    setCurrencyPickerOpen(false);
  }

  async function handleSaveImage() {
    if (!lightboxReceipt?.imageBase64) return;
    const byteStr = atob(lightboxReceipt.imageBase64);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    const blob = new Blob([ab], { type: 'image/jpeg' });
    const safeName = (lightboxReceipt.storeName || 'receipt').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `receipt_${safeName}_${formatReceiptDate(lightboxReceipt)}.jpg`;
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t.saveReceipt });
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onClose}>{lang === 'he' ? '→' : '←'} {t.back}</button>
        <div className="settings-page-title">{t.scannedReceipts}</div>
      </div>
      <div className="settings-page-body">
        {loading ? (
          <div className="empty-state"><div style={{ width: 36, height: 36, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>
        ) : receipts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><ReceiptIcon size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>
            <div>{t.noReceipts}</div>
          </div>
        ) : (
          <div style={{ padding: '0.5rem 0' }}>
            {receipts.map(r => (
              <div key={r.id} onClick={() => setLightboxReceipt(r)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
                {r.imageBase64
                  ? <img src={`data:image/jpeg;base64,${r.imageBase64}`} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, background: '#f0f3ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ReceiptIcon size={24} strokeWidth={1.5} color="var(--color-primary)" /></div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-main)' }}>{r.storeName || '—'}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>{formatReceiptDate(r)} · {r.itemCount} items</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-primary)', flexShrink: 0 }}>
                  {r.currency ? getCurrencySymbol(r.currency) : currency}{Number(r.total || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxReceipt && (
        <div className="lightbox-overlay" onClick={() => { setLightboxReceipt(null); setCurrencyPickerOpen(false); setEditingName(false); }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            {lightboxReceipt.imageBase64
              ? <img src={`data:image/jpeg;base64,${lightboxReceipt.imageBase64}`} alt="" style={{ maxWidth: '90vw', maxHeight: '70vh', borderRadius: 12, objectFit: 'contain' }} />
              : <div style={{ opacity: 0.5 }}><ReceiptIcon size={64} strokeWidth={1} color="white" /></div>
            }
            <div style={{ color: 'white', fontSize: '0.9rem', textAlign: 'center' }}>
              {editingName ? (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmNameEdit(); if (e.key === 'Escape') setEditingName(false); }}
                    autoFocus
                    style={{ borderRadius: 6, border: 'none', padding: '0.25rem 0.5rem', fontSize: '0.9rem', width: 180 }}
                  />
                  <button onClick={confirmNameEdit} style={{ background: 'white', color: '#333', border: 'none', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                  <button onClick={() => setEditingName(false)} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 6, padding: '0.25rem 0.5rem', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }} onClick={openNameEdit}>
                  {lightboxReceipt.storeName || '—'}
                  <span style={{ opacity: 0.6, fontSize: '0.75rem', fontWeight: 400 }}>✏️</span>
                </div>
              )}
              {lightboxReceipt.total != null && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <span
                    onClick={() => setCurrencyPickerOpen(o => !o)}
                    style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                  >
                    {lightboxReceipt.currency ? getCurrencySymbol(lightboxReceipt.currency) : currency}{Number(lightboxReceipt.total).toFixed(2)}
                  </span>
                  <span style={{ opacity: 0.6 }}>· {lightboxReceipt.itemCount} items</span>
                </div>
              )}
              {currencyPickerOpen && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', justifyContent: 'center' }}>
                  {RECEIPT_CURRENCIES.map(code => (
                    <button key={code} onClick={() => handleCurrencyChange(code)}
                      style={{
                        background: (lightboxReceipt.currency || 'EUR') === code ? 'white' : 'rgba(255,255,255,0.2)',
                        color: (lightboxReceipt.currency || 'EUR') === code ? '#333' : 'white',
                        border: 'none', borderRadius: 6, padding: '0.25rem 0.6rem',
                        fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                      }}>
                      {getCurrencySymbol(code)} {code}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ opacity: 0.7, fontSize: '0.8rem', marginTop: '0.2rem' }}>{formatReceiptDate(lightboxReceipt)}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {lightboxReceipt.imageBase64 && (
                <button onClick={handleSaveImage} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, padding: '0.5rem 1.25rem', cursor: 'pointer' }}>
                  {t.saveReceipt}
                </button>
              )}
              <button onClick={() => { setLightboxReceipt(null); setCurrencyPickerOpen(false); setEditingName(false); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, padding: '0.5rem 1.25rem', cursor: 'pointer' }}>{t.back}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ group, groupId, isAdmin, memberData, user, t, onShowReceipts, onShowHistory, bigExpenses = [] }) {
  const [budgetMode,    setBudgetMode]    = useState(group.budgetMode   || 'daily');
  const [budgetAmount,  setBudgetAmount]  = useState(String(group.budgetAmount || ''));
  const [curr,          setCurr]          = useState(group.currency     || 'ILS');
  const [country,       setCountry]       = useState(group.country      || 'de');
  const [saved,         setSaved]         = useState(false);
  const [borrowEnabled,       setBorrowEnabled]       = useState(memberData.borrow_enabled ?? false);
  const [borrowPercent,       setBorrowPercent]       = useState(memberData.borrow_percent ?? 100);
  const [borrowSaved,         setBorrowSaved]         = useState(false);
  const [translateReceipts,   setTranslateReceipts]   = useState(group.translateReceipts ?? true);
  const [showAddBigExpense,   setShowAddBigExpense]   = useState(false);
  const [beName,   setBeName]   = useState('');
  const [beAmount, setBeAmount] = useState('');
  const [beWeeks,  setBeWeeks]  = useState('');
  const [beAdding, setBeAdding] = useState(false);

  async function saveBorrowSettings(enabled, pct) {
    await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
      borrow_enabled: enabled, borrow_percent: pct,
    });
    setBorrowSaved(true);
    setTimeout(() => setBorrowSaved(false), 2000);
  }

  async function handleAddBigExpense(e) {
    e.preventDefault();
    const amount = parseFloat(beAmount);
    const weeks = parseInt(beWeeks, 10);
    if (!beName.trim() || !amount || !weeks || amount <= 0 || weeks <= 0) return;
    setBeAdding(true);
    try {
      const dailyAmount = Math.round((amount / (weeks * 7)) * 100) / 100;
      await addDoc(collection(db, 'groups', groupId, 'big_expenses'), {
        name: beName.trim(), totalAmount: amount, weeks, dailyAmount,
        startDate: getTodayStr(), createdBy: user.uid, createdAt: serverTimestamp(), active: true,
      });
      setBeName(''); setBeAmount(''); setBeWeeks(''); setShowAddBigExpense(false);
    } finally { setBeAdding(false); }
  }

  const previewDaily = budgetMode === 'weekly'
    ? Math.round((parseFloat(budgetAmount) / 7) * 100) / 100
    : parseFloat(budgetAmount) || 0;

  function handleCurrencyChange(newCurrency) {
    const current = parseFloat(budgetAmount);
    if (newCurrency !== curr && current > 0) {
      const converted = convertAmount(current, curr, newCurrency);
      setBudgetAmount(String(Math.round(converted * 100) / 100));
    }
    setCurr(newCurrency);
  }

  async function saveSettings() {
    const finalBudget = parseFloat(budgetAmount) || 0;
    const oldCurrency = group.currency;

    await updateDoc(doc(db, 'groups', groupId), {
      budgetMode, budgetAmount: finalBudget, currency: curr, country,
    });

    // Convert running_balance for all members when currency changed
    if (curr !== oldCurrency) {
      const membersSnap = await getDocs(collection(db, 'groups', groupId, 'members'));
      await Promise.all(membersSnap.docs.map(memberDoc => {
        const rb = memberDoc.data().running_balance || 0;
        if (!rb) return Promise.resolve();
        return updateDoc(doc(db, 'groups', groupId, 'members', memberDoc.id), {
          running_balance: Math.round(convertAmount(rb, oldCurrency, curr) * 100) / 100,
        });
      }));
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="settings-section">
      {/* Budget Settings — admin only, shown at top */}
      {isAdmin && (
        <>
          <div className="stats-title" style={{ marginTop: '0' }}>{t.budgetSettingsLabel}</div>
          <div className="settings-sub" style={{ marginBottom: '0.75rem', color: '#aaa' }}>{t.budgetSettingsDesc}</div>

          <div className="settings-row">
            <div><div className="settings-label">{t.currencyLabel}</div><div className="settings-sub">{t.currencyDesc}</div></div>
            <select value={curr} onChange={e => handleCurrencyChange(e.target.value)} className="settings-select">
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
                <button key={m} onClick={() => setBudgetMode(m)} className={`mode-btn${budgetMode === m ? ' active' : ''}`}>{label}</button>
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

      {/* Big Expenses */}
      <div className="stats-title" style={{ marginTop: '1.25rem' }}>{t.bigExpenses}</div>
      {bigExpenses.length === 0 && !showAddBigExpense && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
          {t.noBigExpenses}
        </div>
      )}
      {bigExpenses.map(exp => {
        const daysElapsed = Math.max(0, Math.floor((new Date(getTodayStr()) - new Date(exp.startDate)) / 86400000));
        const totalDays = exp.weeks * 7;
        const isDone = daysElapsed >= totalDays;
        const remaining = isDone ? 0 : Math.max(0, exp.totalAmount - daysElapsed * exp.dailyAmount);
        return (
          <div key={exp.id} className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.2rem', marginBottom: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="settings-label">{exp.name}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isDone ? '#4ADE80' : 'var(--color-primary)' }}>
                {isDone ? t.bigExpensePaidOff : `${getCurrencySymbol(group.currency)}${remaining.toFixed(2)} ${t.bigExpenseRemaining}`}
              </span>
            </div>
            <div className="settings-sub">
              −{getCurrencySymbol(group.currency)}{exp.dailyAmount.toFixed(2)}{t.bigExpensePerDay}
              {!isDone && ` · ${t.bigExpenseEndsIn(Math.max(0, totalDays - daysElapsed))}`}
            </div>
          </div>
        );
      })}
      {showAddBigExpense ? (
        <form onSubmit={handleAddBigExpense} style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          <input
            className="settings-input"
            placeholder={t.bigExpenseName}
            value={beName} onChange={e => setBeName(e.target.value)}
            style={{ marginBottom: '0.5rem' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input type="number" min="0.01" step="0.01"
              className="settings-input"
              placeholder={t.bigExpenseAmountLabel}
              value={beAmount} onChange={e => setBeAmount(e.target.value)}
              style={{ flex: 1 }}
            />
            <input type="number" min="1" step="1"
              className="settings-input"
              placeholder={t.bigExpenseWeeksLabel}
              value={beWeeks} onChange={e => setBeWeeks(e.target.value)}
              style={{ width: '80px' }}
            />
          </div>
          {beAmount && beWeeks && parseFloat(beAmount) > 0 && parseInt(beWeeks) > 0 && (
            <div className="settings-sub" style={{ marginBottom: '0.5rem' }}>
              {getCurrencySymbol(group.currency)}{(parseFloat(beAmount) / (parseInt(beWeeks) * 7)).toFixed(2)}{t.bigExpensePerDay}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="save-btn" style={{ flex: 1 }} disabled={beAdding}>
              {beAdding ? '…' : t.confirmBtn}
            </button>
            <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setShowAddBigExpense(false); setBeName(''); setBeAmount(''); setBeWeeks(''); }}>
              {t.cancelBtn}
            </button>
          </div>
        </form>
      ) : (
        <button className="btn-outline" style={{ width: '100%', marginTop: '0.35rem', fontSize: '0.85rem' }} onClick={() => setShowAddBigExpense(true)}>
          {t.addBigExpense}
        </button>
      )}
      <button className="btn-outline" style={{ width: '100%', marginTop: '0.35rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }} onClick={onShowHistory}>
        {t.bigExpenseHistory}
      </button>

      {/* Borrow from tomorrow */}
      <div className="stats-title" style={{ marginTop: '1.25rem' }}>{t.borrowLabel}</div>
      <div className="settings-row">
        <div>
          <div className="settings-label">{t.borrowLabel}</div>
          <div className="settings-sub">{t.borrowDesc}</div>
        </div>
        <label className="pill-toggle">
          <input type="checkbox" checked={borrowEnabled} onChange={e => {
            const on = e.target.checked;
            setBorrowEnabled(on);
            saveBorrowSettings(on, borrowPercent);
          }} />
          <span className="pill-toggle-track" />
        </label>
      </div>
      {borrowEnabled && (
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
          <div className="settings-label">{t.borrowPercent}</div>
          <div className="settings-sub">{t.borrowPercentDesc(borrowPercent)}</div>
          <input type="range" min="10" max="100" step="5" value={borrowPercent} className="borrow-slider"
            onChange={e => setBorrowPercent(Number(e.target.value))}
            onMouseUp={() => saveBorrowSettings(borrowEnabled, borrowPercent)}
            onTouchEnd={() => saveBorrowSettings(borrowEnabled, borrowPercent)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            <span>10%</span><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{borrowPercent}%</span><span>100%</span>
          </div>
          {borrowSaved && <div style={{ fontSize: '0.78rem', color: 'var(--color-accent-green-text)', textAlign: 'center' }}>✓ {t.borrowSaved}</div>}
        </div>
      )}

      {/* Scanned Receipts link */}
      <div className="stats-title" style={{ marginTop: '1.25rem' }}>{t.scannedReceipts}</div>
      <div className="settings-row" style={{ cursor: 'pointer' }} onClick={onShowReceipts}>
        <div>
          <div className="settings-label">🧾 {t.scannedReceipts}</div>
          <div className="settings-sub">{t.viewScannedReceipts}</div>
        </div>
        <ChevronRight size={18} strokeWidth={1.5} color="#bbb" />
      </div>

      {/* Translate receipts toggle */}
      <div className="settings-row">
        <div>
          <div className="settings-label">{t.translateReceiptsLabel}</div>
          <div className="settings-sub">{t.translateReceiptsDesc}</div>
        </div>
        <label className="pill-toggle">
          <input type="checkbox" checked={translateReceipts} onChange={async e => {
            const val = e.target.checked;
            setTranslateReceipts(val);
            await updateDoc(doc(db, 'groups', groupId), { translateReceipts: val });
          }} />
          <span className="pill-toggle-track" />
        </label>
      </div>

      {/* Balance reset — admin only */}
      {isAdmin && (
        <>
          <ResetRolloverButton groupId={groupId} user={user} />
        </>
      )}

      {/* groupMode migration — admin only, shown only when field is absent */}
      {isAdmin && group.groupMode == null && (
        <button className="btn-outline" style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.82rem' }}
          onClick={() => updateDoc(doc(db, 'groups', groupId), { groupMode: 'trip' })}>
          Set groupMode = 'trip' (one-time migration)
        </button>
      )}


      <button className="dev-refresh-btn" onClick={async () => {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.update()));
        }
        window.location.reload(true);
      }}>↺ Refresh app</button>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({ groupId, user, currency, groupCurrency, t }) {
  const [products,       setProducts]       = useState([]);
  const [search,         setSearch]         = useState('');
  const [showAdd,        setShowAdd]        = useState(false);
  const [name,           setName]           = useState('');
  const [price,          setPrice]          = useState('');
  const [category,       setCategory]       = useState('food');
  const [actionProduct,  setActionProduct]  = useState(null); // product tapped for action
  const [expAmount,      setExpAmount]      = useState('');
  const [editingPrice,   setEditingPrice]   = useState(false);
  const [qlFeedback,     setQlFeedback]     = useState(false); // "Added ✓" flash

  useEffect(() => {
    return onSnapshot(
      collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items'),
      snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)))
    );
  }, [groupId, user.uid]);

  const filtered = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

  async function saveProduct(e) {
    e.preventDefault();
    if (!name.trim() || !price) return;
    const amt    = parseFloat(price);
    const catRef = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
    const existing = products.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
    const catData = { price: amt, originalPrice: amt, originalCurrency: groupCurrency, category };
    if (existing) {
      await updateDoc(doc(db, 'groups', groupId, 'product_catalog', user.uid, 'items', existing.id), catData);
    } else {
      await addDoc(catRef, { name: name.trim(), ...catData });
    }
    setName(''); setPrice(''); setCategory('food'); setShowAdd(false);
  }

  function openAction(p) {
    setActionProduct(p);
    const displayPrice = (p.originalPrice != null && p.originalCurrency)
      ? convertAmount(p.originalPrice, p.originalCurrency, groupCurrency)
      : p.price;
    setExpAmount(displayPrice != null ? String(Math.round(displayPrice * 100) / 100) : '');
    setEditingPrice(false);
    setQlFeedback(false);
  }

  async function handleAddToExpenses() {
    const amt = parseFloat(expAmount);
    if (!amt || isNaN(amt) || amt <= 0) return;
    await addDoc(collection(db, 'groups', groupId, 'expenses'), {
      uid: user.uid, addedBy: user.displayName || user.email,
      amount: amt, originalAmount: amt, originalCurrency: groupCurrency,
      description: actionProduct.name,
      category: actionProduct.category || 'groceries',
      date: getTodayStr(), createdAt: new Date(),
    });
    setActionProduct(null);
  }

  async function handleAddToQuickList() {
    const qlData = {
      text: actionProduct.name, uid: user.uid,
      addedBy: user.displayName || user.email, addedAt: new Date(),
    };
    const qlPrice = parseFloat(expAmount);
    if (!isNaN(qlPrice) && qlPrice > 0) qlData.price = qlPrice;
    if (actionProduct.category)      qlData.category = actionProduct.category;
    await addDoc(collection(db, 'groups', groupId, 'shopping_list'), qlData);
    setQlFeedback(true);
    setTimeout(() => { setActionProduct(null); setQlFeedback(false); }, 1200);
  }

  return (
    <div className="stats-section">
      {/* Add Product button */}
      <button className="save-btn" style={{ marginBottom: '1rem', width: '100%' }}
        onClick={() => { setName(''); setPrice(''); setCategory('food'); setShowAdd(true); }}>
        {t.addProductBtn}
      </button>

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t.searchProducts}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="search"
            placeholder="…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.5rem 2rem 0.5rem 0.75rem', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '1rem', padding: 0 }}>✕</button>
          )}
        </div>
      </div>

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><PackageIcon size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>
          {search ? t.noProductsSearch : t.noProducts}
        </div>
      ) : filtered.map(p => {
        const cat = getCat(p.category);
        return (
          <div key={p.id} className="expense-item" style={{ marginBottom: '0.45rem', cursor: 'pointer' }}
            onClick={() => openAction(p)}>
            <div className={`expense-icon cat-icon--${p.category}`} style={{ overflow: 'hidden', padding: p.photo ? 0 : undefined }}>
              {p.photo
                ? <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '11px' }} />
                : <CatIcon cat={cat} />}
            </div>
            <div className="expense-info">
              <div className="expense-name">{p.name}</div>
              <div className="expense-meta">{getCatLabel(p.category, t)}</div>
            </div>
            <div className="expense-amount">{currency}{(p.originalPrice && p.originalCurrency ? convertAmount(p.originalPrice, p.originalCurrency, groupCurrency) : p.price).toFixed(2)}</div>
            <button className="expense-delete" onClick={e => { e.stopPropagation(); deleteDoc(doc(db, 'groups', groupId, 'product_catalog', user.uid, 'items', p.id)); }}>×</button>
          </div>
        );
      })}

      {/* Action sheet for a tapped product */}
      {actionProduct && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setActionProduct(null)}>
          <div className="modal" style={{ paddingBottom: '0.5rem' }}>
            {/* Product header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.1rem' }}>
              <div className={`expense-icon cat-icon--${actionProduct.category}`} style={{ overflow: 'hidden', padding: actionProduct.photo ? 0 : undefined, flexShrink: 0 }}>
                {actionProduct.photo
                  ? <img src={actionProduct.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '11px' }} />
                  : <CatIcon cat={getCat(actionProduct.category)} />}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{actionProduct.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{getCatLabel(actionProduct.category, t)}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-primary)', cursor: 'pointer' }}
                onClick={() => setEditingPrice(true)}>
                {editingPrice
                  ? <input
                      type="number" step="0.01" min="0" autoFocus
                      value={expAmount}
                      onChange={e => setExpAmount(e.target.value)}
                      onBlur={() => setEditingPrice(false)}
                      onKeyDown={e => e.key === 'Enter' && setEditingPrice(false)}
                      style={{ width: '5rem', padding: '0.2rem 0.4rem', borderRadius: 8, border: '1.5px solid var(--color-primary)', fontSize: '1rem', fontFamily: 'inherit', textAlign: 'right', color: 'var(--color-primary)', fontWeight: 700 }}
                    />
                  : <>{currency}{Number(expAmount || actionProduct.price).toFixed(2)} <EditPencilIcon /></>}
              </div>
            </div>

            {/* Add to Expenses */}
            <button className="btn-primary" style={{ width: '100%', marginBottom: '0.75rem' }}
              onClick={handleAddToExpenses}>
              + {t.addToExpenses}
            </button>

            <div style={{ height: 1, background: 'var(--color-border)', margin: '0.75rem 0' }} />

            {/* Add to Quick List */}
            <button
              className={qlFeedback ? 'btn-outline' : 'btn-outline'}
              style={{ width: '100%', marginBottom: '0.5rem', color: qlFeedback ? '#1a7a45' : undefined, borderColor: qlFeedback ? '#1a7a45' : undefined }}
              onClick={handleAddToQuickList}
              disabled={qlFeedback}
            >
              {qlFeedback ? t.addedToQuickList : `📋 ${t.addToQuickList}`}
            </button>

            <button onClick={() => setActionProduct(null)}
              style={{ width: '100%', background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.3rem' }}>
              {t.cancelBtn}
            </button>
          </div>
        </div>
      )}

      {/* Add product modal */}
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


// ─── TO REVERT NEARBY SHOPS: remove getMapLinks ──────────────────────────────
function getMapLinks(searchQuery, lat, lng) {
  const q = encodeURIComponent(searchQuery);
  return [
    { label: 'Google Maps', url: `https://www.google.com/maps/search/${q}/@${lat},${lng},15z` },
    { label: 'Waze',        url: `https://waze.com/ul?ll=${lat},${lng}&q=${q}&navigate=yes` },
    { label: 'Apple Maps',  url: `https://maps.apple.com/?q=${q}&sll=${lat},${lng}&z=15` },
  ];
}
// ─────────────────────────────────────────────────────────────────────────────

function ShoppingListTab({ groupId, user, currency, groupCurrency, country: initialCountry, onCountryChange, estimation, onEstimationChange, estimationOpen, onEstimationOpenChange, t, onOpenOtherLists }) {
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
  const [buyItem,         setBuyItem]       = useState(null);
  const [buyPrice,        setBuyPrice]      = useState('');
  const [buyCategory,     setBuyCategory]   = useState('groceries');
  const [editingBuyPrice, setEditingBuyPrice] = useState(false);
  const [buying,          setBuying]        = useState(false);
  const [estimating,    setEstimating]  = useState(false);
  function setEstimationOpen(v) { onEstimationOpenChange(typeof v === 'function' ? v(estimationOpen) : v); }
  const [editingId,     setEditingId]   = useState(null);
  const [editText,      setEditText]    = useState('');
  function setEstimation(v) { onEstimationChange(typeof v === 'function' ? v(estimation) : v); }
  // ─── TO REVERT NEARBY SHOPS: remove these 4 state lines ─────────────────
  const [itemActionPopup, setItemActionPopup] = useState(null);
  const [nearbyShopsData, setNearbyShopsData] = useState(null);
  const [findingShops,    setFindingShops]    = useState(false);
  const [shopsCoords,     setShopsCoords]     = useState(null);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'shopping_list'), orderBy('addedAt', 'asc')),
      snap => {
        const newItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setItems(newItems);
        // Clear stale estimation when list becomes empty
        if (newItems.length === 0) {
          setEstimation(null);
          setEstimationOpen(true);
        }
      }
    );
  }, [groupId]); // eslint-disable-line

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
    setEstimation(null);
    await addDoc(collection(db, 'groups', groupId, 'shopping_list'), {
      text: trimmed, uid: user.uid,
      addedBy: user.displayName || user.email, addedAt: new Date(),
      quantity: 1,
    });
  }

  async function changeQty(item, delta) {
    const current = item.quantity || 1;
    const next = Math.max(1, current + delta);
    if (next === current) return;
    setEstimation(null);
    await updateDoc(doc(db, 'groups', groupId, 'shopping_list', item.id), { quantity: next });
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
      const catData = { price: amt, originalPrice: amt, originalCurrency: groupCurrency, category: newCategory };
      if (existing) {
        await updateDoc(doc(catRef, existing.id), catData);
        setCatalog(prev => prev.map(c => c.id === existing.id ? { ...c, ...catData } : c));
      } else {
        const newDoc = await addDoc(catRef, { name: trimmed, ...catData });
        setCatalog(prev => [...prev, { id: newDoc.id, name: trimmed, ...catData }]);
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
    // Dismiss any open keyboard before showing the modal
    if (document.activeElement) document.activeElement.blur();
    setBuyItem(item);
    // Pre-fill price/category from item itself (added via product page) or from catalog
    const catalogHit = catalog.find(c => c.name.toLowerCase() === item.text.toLowerCase());
    const catalogPrice = catalogHit
      ? (catalogHit.originalPrice != null && catalogHit.originalCurrency
          ? convertAmount(catalogHit.originalPrice, catalogHit.originalCurrency, groupCurrency)
          : catalogHit.price)
      : null;
    const knownPrice = item.price ?? catalogPrice;
    const knownCat   = item.category ?? catalogHit?.category ?? 'groceries';
    const prefilled  = knownPrice != null;
    setBuyPrice(prefilled ? String(knownPrice) : '');
    setBuyCategory(knownCat);
    // Show chip if price is pre-filled, show input if not
    setEditingBuyPrice(!prefilled);
  }

  async function handleJustDelete() {
    setEstimation(null);
    await deleteDoc(doc(db, 'groups', groupId, 'shopping_list', buyItem.id));
    setBuyItem(null);
  }

  async function handleAddAsExpense() {
    const unitAmt = parseFloat(buyPrice);
    if (!unitAmt || isNaN(unitAmt) || unitAmt <= 0) return;
    const qty = buyItem.quantity || 1;
    const totalAmt = unitAmt * qty;
    setBuying(true);
    await addDoc(collection(db, 'groups', groupId, 'expenses'), {
      uid: user.uid, addedBy: user.displayName || user.email,
      amount: totalAmt, originalAmount: totalAmt, originalCurrency: groupCurrency,
      description: buyItem.text,
      category: buyCategory, date: getTodayStr(), createdAt: new Date(),
      ...(qty > 1 ? { quantity: qty } : {}),
    });
    // Catalog stores the unit price (not total)
    const catRef  = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
    const existing = catalog.find(c => c.name.toLowerCase() === buyItem.text.toLowerCase());
    const catData = { price: unitAmt, originalPrice: unitAmt, originalCurrency: groupCurrency, category: buyCategory };
    if (existing) {
      await updateDoc(doc(catRef, existing.id), catData);
      setCatalog(prev => prev.map(c => c.id === existing.id ? { ...c, ...catData } : c));
    } else {
      const newDoc = await addDoc(catRef, { name: buyItem.text, ...catData });
      setCatalog(prev => [...prev, { id: newDoc.id, name: buyItem.text, ...catData }]);
    }
    setEstimation(null);
    await deleteDoc(doc(db, 'groups', groupId, 'shopping_list', buyItem.id));
    setBuyItem(null);
    setBuying(false);
  }

  async function remove(id) {
    setEstimation(null);
    await deleteDoc(doc(db, 'groups', groupId, 'shopping_list', id));
  }

  async function runEstimation() {
    setEstimating(true);
    setEstimation(null);

    const results = await Promise.all(items.map(async item => {
      const qty = item.quantity || 1;

      // 1. Personal catalog — exact price the user has paid before
      const hit = catalog.find(c => c.name.toLowerCase() === item.text.toLowerCase());
      if (hit?.price) {
        const hitPrice = hit.originalPrice != null && hit.originalCurrency
          ? convertAmount(hit.originalPrice, hit.originalCurrency, groupCurrency)
          : hit.price;
        return { text: item.text, price: hitPrice * qty, fromCatalog: true, qty };
      }

      // 2. Local price reference database
      const ref = estimatePrice(item.text, country);
      if (ref !== null) {
        return { text: item.text, price: toDisplayCurrency(ref, country, currency) * qty, fromCatalog: false, qty };
      }

      // 3. Firestore cache (previous Gemini lookups)
      const cacheKey = `${country}_${item.text.toLowerCase().trim().replace(/[^a-z0-9א-ת]/g, '_')}`;
      try {
        const cached = await getDoc(doc(db, 'groups', groupId, 'price_estimates', cacheKey));
        if (cached.exists()) {
          const p = toDisplayCurrency(cached.data().price, country, currency);
          return { text: item.text, price: p * qty, fromCatalog: false, fromAI: true, qty };
        }
      } catch { /* best-effort */ }

      // 4. Gemini AI estimate — only on cache miss
      try {
        const aiPrice = await fetchGeminiPriceEstimate(item.text, country);
        if (aiPrice !== null) {
          setDoc(doc(db, 'groups', groupId, 'price_estimates', cacheKey), { price: aiPrice, item: item.text, country, cachedAt: new Date() }).catch(() => {});
          return { text: item.text, price: toDisplayCurrency(aiPrice, country, currency) * qty, fromCatalog: false, fromAI: true, qty };
        }
      } catch { /* best-effort */ }

      return { text: item.text, price: null, fromCatalog: false, qty };
    }));

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

  // ─── TO REVERT NEARBY SHOPS: remove handleFindNearbyShops ────────────────
  async function handleFindNearbyShops(targetItems) {
    if (!targetItems || targetItems.length === 0) return;
    setFindingShops(true);
    try {
      let coords = shopsCoords;
      if (!coords) {
        coords = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            err => reject(err),
            { timeout: 10000 }
          )
        );
        setShopsCoords(coords);
      }
      const data = await categorizeItemsByStore(targetItems);
      if (!data) { alert(t.shopsFailed); return; }
      setNearbyShopsData({ ...data, coords });
    } catch (err) {
      alert(err.code === 1 ? t.locationNeeded : t.shopsFailed);
    } finally {
      setFindingShops(false);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="tab-content shopping-tab-content">

      {/* ── Scrollable list area ── */}
      <div className="shopping-list-area">
        <div className="expense-tab-toolbar">
          <div className="view-toggle">
            <button className={`view-btn${filterMode === 'all'  ? ' active' : ''}`} onClick={() => setFilterMode('all')}>{t.filterAll}</button>
            <button className={`view-btn${filterMode === 'mine' ? ' active' : ''}`} onClick={() => setFilterMode('mine')}>{t.filterMine}</button>
          </div>
          {/* Other Lists button — hidden for now, re-enable by uncommenting
          {onOpenOtherLists && (
            <button onClick={onOpenOtherLists} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', padding: '0.2rem 0.4rem', whiteSpace: 'nowrap' }}>
              {t.otherLists} ›
            </button>
          )}
          */}
          {/* TO REVERT NEARBY SHOPS: remove this button */}
          {items.length > 0 && (
            <button
              onClick={() => handleFindNearbyShops(items)}
              disabled={findingShops}
              style={{
                marginLeft: 'auto',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.28rem 0.7rem', borderRadius: '100px',
                background: 'none', border: '1.5px solid var(--color-primary)',
                color: findingShops ? 'var(--color-text-muted)' : 'var(--color-primary)',
                borderColor: findingShops ? 'var(--color-border)' : 'var(--color-primary)',
                fontSize: '0.78rem', fontWeight: 600,
                cursor: findingShops ? 'default' : 'pointer', whiteSpace: 'nowrap',
                opacity: findingShops ? 0.6 : 1,
              }}
            >
              <MapPin size={12} strokeWidth={2.5} />
              {findingShops ? t.findingShops : t.findNearbyShops}
            </button>
          )}
          {/* ─────────────────────────────────────── */}
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
                  {s.price > 0 && <span className="suggestion-price">{currency}{(s.originalPrice != null && s.originalCurrency ? convertAmount(s.originalPrice, s.originalCurrency, groupCurrency) : s.price).toFixed(2)}</span>}
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
                {/* TO REVERT: change onClick back to: () => { setEditingId(item.id); setEditText(item.text); } */}
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => { if (editingId !== item.id) setItemActionPopup(item); }}>
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
                {/* Quantity counter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px', flexShrink: 0 }}>
                  <button
                    onClick={e => { e.stopPropagation(); changeQty(item, -1); }}
                    style={{ width: 22, height: 22, border: '1px solid var(--color-border)', borderRadius: 5, background: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ minWidth: 18, textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: (item.quantity || 1) > 1 ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                    {item.quantity || 1}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); changeQty(item, +1); }}
                    style={{ width: 22, height: 22, border: '1px solid var(--color-border)', borderRadius: 5, background: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
                <button
                  className={`shopping-claim-btn${item.claimedBy === user.uid ? ' active' : ''}${item.claimedBy && item.claimedBy !== user.uid ? ' other' : ''}`}
                  onClick={() => handleClaim(item)}
                  title={item.claimedBy && item.claimedBy !== user.uid ? t.alreadyClaimed : item.claimedBy ? t.unclaimBtn : t.claimBtn}
                >
                  <span className="on-my-way-text">I'm<br/>on it</span>
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
                    <span className="estimation-item-name">
                      {it.text}{it.qty > 1 ? ` ×${it.qty}` : ''}
                    </span>
                    <span className="estimation-item-price">
                      {it.price !== null ? `${it.fromAI ? '~' : ''}${currency}${it.price.toFixed(2)}` : '?'}
                    </span>
                  </div>
                ))}
                <div style={{ height: '5rem' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TO REVERT NEARBY SHOPS: remove itemActionPopup and nearbyShopsData blocks ─── */}
      {itemActionPopup && (
        <div className="modal-overlay" onClick={() => setItemActionPopup(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-card)', borderRadius: 20, padding: '1.25rem 1rem 1rem',
            width: '88vw', maxWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Quick List
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text-main)', textAlign: 'center', marginBottom: '1rem' }}>
              {itemActionPopup.text}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => {
                setEditingId(itemActionPopup.id);
                setEditText(itemActionPopup.text);
                setItemActionPopup(null);
              }} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.65rem', borderRadius: 12, border: '1.5px solid var(--color-border)',
                background: 'none', color: 'var(--color-text-main)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
              }}>
                <Pencil size={15} strokeWidth={2} /> {t.editItem}
              </button>
              <button onClick={() => {
                const item = itemActionPopup;
                setItemActionPopup(null);
                handleFindNearbyShops([item]);
              }} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.65rem', borderRadius: 12, border: 'none',
                background: 'var(--color-primary)', color: 'white', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer',
              }}>
                <MapPin size={15} strokeWidth={2} /> {t.findNearbyShops}
              </button>
            </div>
          </div>
        </div>
      )}

      {nearbyShopsData && nearbyShopsData.coords && (
        <div className="modal-overlay" onClick={() => setNearbyShopsData(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 20,
            width: '92vw', maxWidth: 380, maxHeight: '82vh',
            overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
            padding: '1.25rem 1rem 1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D23', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <MapPin size={16} strokeWidth={2} style={{ color: 'var(--color-primary)' }} /> {t.nearbyShops}
              </div>
              <button onClick={() => setNearbyShopsData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '0.2rem', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {(nearbyShopsData.groups || []).map(group => (
                <div key={group.storeType} style={{
                  borderRadius: 14, border: '1px solid #EAEDF2',
                  overflow: 'hidden', background: '#fff',
                }}>
                  <div style={{
                    padding: '0.6rem 0.85rem',
                    borderBottom: '1px solid #EAEDF2',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
                    background: '#F8F9FA',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D23' }}>
                      {group.storeType}
                    </span>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {getMapLinks(group.searchQuery, nearbyShopsData.coords.lat, nearbyShopsData.coords.lng).map(link => (
                        <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                          style={{
                            fontSize: '0.68rem', padding: '0.2rem 0.55rem', borderRadius: '100px',
                            border: '1.5px solid var(--color-primary)', color: 'var(--color-primary)',
                            textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap',
                            background: '#fff',
                          }}>
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: '0.55rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {(group.items || []).map(itemText => (
                      <div key={itemText} style={{ fontSize: '0.85rem', color: '#4B5563', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', flexShrink: 0, display: 'inline-block' }} />
                        {itemText}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {(nearbyShopsData.unmatched || []).length > 0 && (
                <div style={{ borderRadius: 14, border: '1px solid #EAEDF2', overflow: 'hidden', background: '#fff' }}>
                  <div style={{ padding: '0.5rem 0.85rem', background: '#F8F9FA', borderBottom: '1px solid #EAEDF2' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#9CA3AF' }}>{t.itemsNotHere}</span>
                  </div>
                  <div style={{ padding: '0.55rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {(nearbyShopsData.unmatched || []).map(itemText => (
                      <div key={itemText} style={{ fontSize: '0.85rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D1D5DB', flexShrink: 0, display: 'inline-block' }} />
                        {itemText}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ────────────────────────────────────────────────────────────────────── */}

      {buyItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBuyItem(null)}>
          <div className="modal" style={{ paddingBottom: '0.5rem' }}>
            {/* Item header */}
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1rem' }}>{buyItem.text}</div>

            {/* Price row — input while editing, tappable chip when confirmed */}
            {editingBuyPrice
              ? <input
                  type="number" step="0.01" min="0"
                  value={buyPrice}
                  onChange={e => setBuyPrice(e.target.value)}
                  onBlur={() => { if (buyPrice.trim()) setEditingBuyPrice(false); }}
                  onKeyDown={e => { if (e.key === 'Enter' && buyPrice.trim()) setEditingBuyPrice(false); }}
                  placeholder={t.amountPlaceholder(currency)}
                  style={{ marginBottom: '0.85rem' }}
                />
              : /* Has confirmed price — compact tappable chip */
                <div onClick={() => setEditingBuyPrice(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.85rem',
                    fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-primary)', cursor: 'pointer' }}>
                  {(buyItem.quantity || 1) > 1
                    ? <>{currency}{Number(buyPrice).toFixed(2)} × {buyItem.quantity} = {currency}{(Number(buyPrice) * buyItem.quantity).toFixed(2)}</>
                    : <>{currency}{Number(buyPrice).toFixed(2)}</>
                  }
                  {' '}<EditPencilIcon />
                </div>}

            {/* Category */}
            <select value={buyCategory} onChange={e => setBuyCategory(e.target.value)}
              style={{ marginBottom: '1rem' }}>
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{t[`cat_${c.id}`] || c.label}</option>
              ))}
            </select>

            {/* Add as expense */}
            <button type="button" className="btn-primary" style={{ width: '100%', marginBottom: '0.75rem' }}
              onClick={handleAddAsExpense} disabled={!buyPrice.trim() || buying}>
              {buying ? '…' : t.addAsExpense}
            </button>

            <div style={{ height: 1, background: 'var(--color-border)', margin: '0 0 0.65rem' }} />

            <button type="button" onClick={handleJustDelete}
              style={{ width: '100%', background: 'none', border: '1.5px solid var(--color-border)',
                borderRadius: 10, color: '#d32f2f', cursor: 'pointer',
                fontSize: '0.9rem', fontWeight: 500, padding: '0.55rem' }}>
              {t.justDelete}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Other Lists ─────────────────────────────────────────────────────────────

function OtherListDetail({ listId, listName, listEmoji, groupId, user, currency, groupCurrency, t, lang, onBack }) {
  const [items,          setItems]         = useState([]);
  const [catalog,        setCatalog]       = useState([]);
  const [text,           setText]          = useState('');
  const [suggestions,    setSuggestions]   = useState([]);
  const [showPriceForm,  setShowPriceForm] = useState(false);
  const [newPrice,       setNewPrice]      = useState('');
  const [newCategory,    setNewCategory]   = useState('groceries');
  const [buyItem,        setBuyItem]       = useState(null);
  const [buyPrice,       setBuyPrice]      = useState('');
  const [buyCategory,    setBuyCategory]   = useState('groceries');
  const [editingBuyPrice,setEditingBuyPrice] = useState(false);
  const [buying,         setBuying]        = useState(false);
  const [editingId,      setEditingId]     = useState(null);
  const [editText,       setEditText]      = useState('');
  const [estimation,     setEstimation]    = useState(null);
  const [estimationOpen, setEstimationOpen] = useState(true);
  const [estimating,     setEstimating]    = useState(false);
  const [country,        setCountry]       = useState('de');

  const listColl = () => collection(db, 'groups', groupId, 'other_lists', listId, 'items');
  const listDoc  = (id) => doc(db, 'groups', groupId, 'other_lists', listId, 'items', id);

  useEffect(() => {
    return onSnapshot(
      query(listColl(), orderBy('addedAt', 'asc')),
      snap => { const it = snap.docs.map(d => ({ id: d.id, ...d.data() })); setItems(it); if (it.length === 0) setEstimation(null); }
    );
  }, [groupId, listId]); // eslint-disable-line

  useEffect(() => {
    getDocs(collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items'))
      .then(snap => setCatalog(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [groupId, user.uid]);

  useEffect(() => {
    const q = text.trim().toLowerCase();
    if (!q) { setSuggestions([]); return; }
    setSuggestions(catalog.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5));
  }, [text, catalog]);

  async function addItem(nameOverride) {
    const trimmed = (nameOverride ?? text).trim();
    if (!trimmed) return;
    setText(''); setSuggestions([]); setShowPriceForm(false); setNewPrice(''); setNewCategory('groceries'); setEstimation(null);
    await addDoc(listColl(), { text: trimmed, uid: user.uid, addedBy: user.displayName || user.email, addedAt: new Date(), quantity: 1 });
  }

  async function changeQty(item, delta) {
    const next = Math.max(1, (item.quantity || 1) + delta);
    if (next === (item.quantity || 1)) return;
    setEstimation(null);
    await updateDoc(listDoc(item.id), { quantity: next });
  }

  function handleInputChange(val) { setText(val); setShowPriceForm(false); setNewPrice(''); setNewCategory('groceries'); }

  async function addItemWithPrice() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const amt = parseFloat(newPrice);
    if (!isNaN(amt) && amt > 0) {
      const existing = catalog.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
      const catRef = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
      const catData = { price: amt, originalPrice: amt, originalCurrency: groupCurrency, category: newCategory };
      if (existing) { await updateDoc(doc(catRef, existing.id), catData); setCatalog(prev => prev.map(c => c.id === existing.id ? { ...c, ...catData } : c)); }
      else { const nd = await addDoc(catRef, { name: trimmed, ...catData }); setCatalog(prev => [...prev, { id: nd.id, name: trimmed, ...catData }]); }
    }
    await addItem(trimmed);
  }

  function handleAddBtn() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (catalog.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) addItem();
    else setShowPriceForm(p => !p);
  }

  async function handleClaim(item) {
    if (item.claimedBy && item.claimedBy !== user.uid) return;
    const claiming = item.claimedBy !== user.uid;
    await updateDoc(listDoc(item.id), { claimedBy: claiming ? user.uid : null, claimedByName: claiming ? (user.displayName || user.email) : null });
  }

  function openBuyModal(item) {
    if (document.activeElement) document.activeElement.blur();
    setBuyItem(item);
    const hit = catalog.find(c => c.name.toLowerCase() === item.text.toLowerCase());
    const hitPrice = hit ? (hit.originalPrice != null && hit.originalCurrency ? convertAmount(hit.originalPrice, hit.originalCurrency, groupCurrency) : hit.price) : null;
    const knownPrice = item.price ?? hitPrice;
    setBuyPrice(knownPrice != null ? String(knownPrice) : '');
    setBuyCategory(item.category ?? hit?.category ?? 'groceries');
    setEditingBuyPrice(knownPrice == null);
  }

  async function handleJustDelete() {
    setEstimation(null);
    await deleteDoc(listDoc(buyItem.id));
    setBuyItem(null);
  }

  async function handleAddAsExpense() {
    const unitAmt = parseFloat(buyPrice);
    if (!unitAmt || isNaN(unitAmt) || unitAmt <= 0) return;
    const qty = buyItem.quantity || 1;
    setBuying(true);
    await addDoc(collection(db, 'groups', groupId, 'expenses'), {
      uid: user.uid, addedBy: user.displayName || user.email,
      amount: unitAmt * qty, originalAmount: unitAmt * qty, originalCurrency: groupCurrency,
      description: buyItem.text, category: buyCategory, date: getTodayStr(), createdAt: new Date(),
      ...(qty > 1 ? { quantity: qty } : {}),
    });
    const catRef = collection(db, 'groups', groupId, 'product_catalog', user.uid, 'items');
    const existing = catalog.find(c => c.name.toLowerCase() === buyItem.text.toLowerCase());
    const catData = { price: unitAmt, originalPrice: unitAmt, originalCurrency: groupCurrency, category: buyCategory };
    if (existing) { await updateDoc(doc(catRef, existing.id), catData); setCatalog(prev => prev.map(c => c.id === existing.id ? { ...c, ...catData } : c)); }
    else { const nd = await addDoc(catRef, { name: buyItem.text, ...catData }); setCatalog(prev => [...prev, { id: nd.id, name: buyItem.text, ...catData }]); }
    setEstimation(null);
    await deleteDoc(listDoc(buyItem.id));
    setBuyItem(null); setBuying(false);
  }

  async function runEstimation() {
    setEstimating(true); setEstimation(null);
    const results = await Promise.all(items.map(async item => {
      const qty = item.quantity || 1;
      const hit = catalog.find(c => c.name.toLowerCase() === item.text.toLowerCase());
      if (hit?.price) {
        const p = hit.originalPrice != null && hit.originalCurrency ? convertAmount(hit.originalPrice, hit.originalCurrency, groupCurrency) : hit.price;
        return { text: item.text, price: p * qty, fromCatalog: true, qty };
      }
      const ref = estimatePrice(item.text, country);
      if (ref !== null) return { text: item.text, price: toDisplayCurrency(ref, country, currency) * qty, fromCatalog: false, qty };
      const cacheKey = `${country}_${item.text.toLowerCase().trim().replace(/[^a-z0-9א-ת]/g, '_')}`;
      try {
        const cached = await getDoc(doc(db, 'groups', groupId, 'price_estimates', cacheKey));
        if (cached.exists()) return { text: item.text, price: toDisplayCurrency(cached.data().price, country, currency) * qty, fromCatalog: false, fromAI: true, qty };
      } catch { /* best-effort */ }
      try {
        const aiPrice = await fetchGeminiPriceEstimate(item.text, country);
        if (aiPrice !== null) {
          setDoc(doc(db, 'groups', groupId, 'price_estimates', cacheKey), { price: aiPrice, item: item.text, country, cachedAt: new Date() }).catch(() => {});
          return { text: item.text, price: toDisplayCurrency(aiPrice, country, currency) * qty, fromCatalog: false, fromAI: true, qty };
        }
      } catch { /* best-effort */ }
      return { text: item.text, price: null, fromCatalog: false, qty };
    }));
    const priced = results.filter(r => r.price !== null).length;
    setEstimation({ items: results, total: results.reduce((s, r) => s + (r.price || 0), 0), priced, unknown: results.length - priced });
    setEstimationOpen(true); setEstimating(false);
  }

  const today = getTodayStr();

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onBack}>{lang === 'he' ? '→' : '←'} {t.back}</button>
        <div className="settings-page-title">{listEmoji ? `${listEmoji} ${listName}` : listName}</div>
      </div>
      <div className="settings-page-body" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div className="tab-content shopping-tab-content" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="shopping-list-area">
            {/* Input */}
            <div className="shopping-input-wrapper">
              <div className="shopping-input-row">
                <input className="shopping-input" placeholder={t.addShoppingItem} value={text}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { if (showPriceForm) addItemWithPrice(); else handleAddBtn(); } }}
                  autoComplete="off" />
                <button className="shopping-add-btn" onClick={handleAddBtn} disabled={!text.trim()}><Plus size={20} strokeWidth={2} /></button>
              </div>
              {suggestions.length > 0 && !showPriceForm && (
                <div className="shopping-suggestions">
                  {suggestions.map(s => (
                    <button key={s.id} className="shopping-suggestion-item" onMouseDown={() => addItem(s.name)}>
                      <span className="suggestion-name">{s.name}</span>
                      {s.price > 0 && <span className="suggestion-price">{currency}{(s.originalPrice != null && s.originalCurrency ? convertAmount(s.originalPrice, s.originalCurrency, groupCurrency) : s.price).toFixed(2)}</span>}
                    </button>
                  ))}
                </div>
              )}
              {showPriceForm && (
                <div className="shopping-price-form">
                  <input type="number" step="0.01" min="0" className="shopping-price-input" placeholder={t.amountPlaceholder(currency)} value={newPrice} onChange={e => setNewPrice(e.target.value)} autoFocus
                    onKeyDown={e => e.key === 'Enter' && addItemWithPrice()} />
                  <div className="shopping-cat-pills">
                    {['food','groceries','transport','activities','shopping','accommodation','beauty','other'].map(c => (
                      <button key={c} className={`receipt-cat-pill${newCategory === c ? ' active' : ''}`} onClick={() => setNewCategory(c)}>{c}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-cancel" style={{ flex: 1, fontSize: '0.8rem' }} onClick={() => setShowPriceForm(false)}>{t.cancelBtn}</button>
                    <button className="btn-primary" style={{ flex: 2, fontSize: '0.8rem' }} onClick={addItemWithPrice}>{t.addShoppingItem}</button>
                  </div>
                </div>
              )}
            </div>

            {/* Items */}
            {items.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon"><ClipboardList size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>{t.noListItems}</div>
            ) : (
              <div className="shopping-list">
                {items.map(item => {
                  const qty = item.quantity || 1;
                  const isMine = item.claimedBy === user.uid;
                  const isClaimed = !!item.claimedBy && !isMine;
                  return (
                    <div key={item.id} className="shopping-item" onClick={() => openBuyModal(item)} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                        {editingId === item.id ? (
                          <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                            onBlur={() => { const trimmed = editText.trim(); setEditingId(null); if (trimmed && trimmed !== item.text) updateDoc(listDoc(item.id), { text: trimmed }); }}
                            onKeyDown={e => { if (e.key === 'Enter') { const trimmed = editText.trim(); setEditingId(null); if (trimmed && trimmed !== item.text) updateDoc(listDoc(item.id), { text: trimmed }); } if (e.key === 'Escape') setEditingId(null); }}
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, fontSize: '0.95rem', border: 'none', borderBottom: '1px solid var(--color-primary)', background: 'none', outline: 'none' }} />
                        ) : (
                          <span className="shopping-text" onDoubleClick={e => { e.stopPropagation(); setEditingId(item.id); setEditText(item.text); }}>{item.text}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button className="qty-btn" onClick={() => changeQty(item, -1)}>−</button>
                        <span className={`qty-count${qty > 1 ? ' qty-count--active' : ''}`}>{qty}</span>
                        <button className="qty-btn" onClick={() => changeQty(item, 1)}>+</button>
                        <button className={`claim-btn${isMine ? ' claimed' : ''}${isClaimed ? ' claimed-other' : ''}`} onClick={() => handleClaim(item)} disabled={isClaimed} title={isClaimed ? item.claimedByName : undefined}>
                          {isMine ? '✓' : isClaimed ? '👤' : <span style={{ fontSize: '0.6rem', lineHeight: 1.1, textAlign: 'center' }}>I'M<br/>ON IT</span>}
                        </button>
                        <button className="shopping-delete" onClick={() => { setEstimation(null); deleteDoc(listDoc(item.id)); }}><Trash2 size={15} strokeWidth={1.5} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Estimation panel */}
          {items.length > 0 && (
            <div className="estimation-panel">
              <div className="estimation-panel-header">
                <button
                  className={`estimation-btn${estimating ? ' loading' : ''}`}
                  onClick={() => estimation ? setEstimationOpen(o => !o) : runEstimation()}
                  disabled={estimating}
                >
                  {estimating ? t.estimating : t.cartEstimationBtn}
                  {estimation && !estimating && <span className="estimation-toggle-icon">{estimationOpen ? ' ▾' : ' ▸'}</span>}
                </button>
                <select className="estimation-country-select" value={country} onChange={e => { setCountry(e.target.value); setEstimation(null); }}>
                  <option value="de">{t.countryDE}</option>
                  <option value="il">{t.countryIL}</option>
                  <option value="fr">{t.countryFR}</option>
                  <option value="es">{t.countryES}</option>
                  <option value="gb">{t.countryGB}</option>
                  <option value="us">{t.countryUS}</option>
                </select>
                {estimation && <span className="estimation-total-inline">{currency}{estimation.total.toFixed(2)}</span>}
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
                        <span className="estimation-item-name">{it.text}{it.qty > 1 ? ` ×${it.qty}` : ''}</span>
                        <span className="estimation-item-price">{it.price !== null ? `${it.fromAI ? '~' : ''}${currency}${it.price.toFixed(2)}` : '?'}</span>
                      </div>
                    ))}
                    <div style={{ height: '5rem' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Buy modal */}
      {buyItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBuyItem(null)}>
          <div className="modal" style={{ paddingBottom: '0.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1rem' }}>{buyItem.text}</div>
            {editingBuyPrice
              ? <input type="number" step="0.01" min="0" className="modal-price-input" placeholder={t.amountPlaceholder(currency)} value={buyPrice} onChange={e => setBuyPrice(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && setEditingBuyPrice(false)} />
              : buyPrice
                ? <div className="price-chip" onClick={() => setEditingBuyPrice(true)}>{currency}{(parseFloat(buyPrice) * (buyItem.quantity || 1)).toFixed(2)}{buyItem.quantity > 1 && <span style={{ fontSize: '0.75rem', opacity: 0.7 }}> ({currency}{parseFloat(buyPrice).toFixed(2)} ×{buyItem.quantity})</span>}</div>
                : <button className="btn-secondary" style={{ width: '100%', marginBottom: '0.75rem' }} onClick={() => setEditingBuyPrice(true)}>{t.enterPrice}</button>
            }
            <div className="shopping-cat-pills" style={{ marginBottom: '0.75rem' }}>
              {['food','groceries','transport','activities','shopping','accommodation','beauty','other'].map(c => (
                <button key={c} className={`receipt-cat-pill${buyCategory === c ? ' active' : ''}`} onClick={() => setBuyCategory(c)}>{c}</button>
              ))}
            </div>
            <button className="btn-primary" style={{ width: '100%', marginBottom: '0.5rem' }} disabled={!buyPrice || buying} onClick={handleAddAsExpense}>{t.addExpense}</button>
            <button className="btn-secondary" style={{ width: '100%', marginBottom: '0.5rem' }} onClick={handleJustDelete}>{t.justDelete}</button>
            <button onClick={() => setBuyItem(null)} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.25rem' }}>{t.cancelBtn}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OtherListsPage({ groupId, user, currency, groupCurrency, t, lang, onClose }) {
  const [lists,       setLists]      = useState([]);
  const [selected,    setSelected]   = useState(null);
  const [showCreate,  setShowCreate] = useState(false);
  const [newName,     setNewName]    = useState('');
  const [newEmoji,    setNewEmoji]   = useState('');
  const [confirmDel,  setConfirmDel] = useState(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'other_lists'), orderBy('createdAt', 'asc')),
      snap => setLists(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [groupId]); // eslint-disable-line

  async function createList(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const name = newName.trim(); const emoji = newEmoji.trim();
    const ref = await addDoc(collection(db, 'groups', groupId, 'other_lists'), { name, emoji, createdBy: user.uid, createdAt: new Date() });
    setNewName(''); setNewEmoji(''); setShowCreate(false);
    setSelected({ id: ref.id, name, emoji });
  }

  async function deleteList(list) {
    const itemsSnap = await getDocs(collection(db, 'groups', groupId, 'other_lists', list.id, 'items'));
    const batch = writeBatch(db);
    itemsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'groups', groupId, 'other_lists', list.id));
    await batch.commit();
    setConfirmDel(null);
  }

  if (selected) {
    return <OtherListDetail key={selected.id} listId={selected.id} listName={selected.name} listEmoji={selected.emoji}
      groupId={groupId} user={user} currency={currency} groupCurrency={groupCurrency} t={t} lang={lang}
      onBack={() => setSelected(null)} />;
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onClose}>{lang === 'he' ? '→' : '←'} {t.back}</button>
        <div className="settings-page-title">{t.otherLists}</div>
        <button className="settings-back-btn" style={{ marginLeft: 'auto', fontSize: '1.3rem', fontWeight: 700, lineHeight: 1 }} onClick={() => setShowCreate(true)}>+</button>
      </div>
      <div className="settings-page-body">
        {lists.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon"><ClipboardList size={48} strokeWidth={1} color="var(--color-text-muted)" /></div>{t.noLists}</div>
        ) : lists.map(list => (
          <div key={list.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.75rem 1rem', cursor: 'pointer' }} onClick={() => setSelected(list)}>
            {list.emoji && <span style={{ fontSize: '1.4rem', marginRight: '0.75rem' }}>{list.emoji}</span>}
            <span style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}>{list.name}</span>
            <button onClick={e => { e.stopPropagation(); setConfirmDel(list); }} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '1rem' }}>✕</button>
            <ChevronRight size={18} strokeWidth={1.5} color="#bbb" />
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="modal-overlay add-expense-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal add-expense-modal" style={{ borderRadius: '0 0 22px 22px', paddingTop: '1.4rem' }}>
            <div className="modal-title">{t.createList}</div>
            <form onSubmit={createList}>
              <input type="text" placeholder={t.listNamePlaceholder} value={newName} onChange={e => setNewName(e.target.value)} autoFocus required style={{ marginBottom: '0.5rem' }} />
              <input type="text" placeholder={t.listEmojiPlaceholder} value={newEmoji} onChange={e => setNewEmoji(e.target.value)} maxLength={4} style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: '0.75rem' }} />
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowCreate(false)}>{t.cancelBtn}</button>
                <button type="submit" className="btn-primary">{t.createList}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal">
            <div className="modal-title">{t.deleteList}</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>"{confirmDel.emoji} {confirmDel.name}"</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setConfirmDel(null)}>{t.cancelBtn}</button>
              <button className="btn-primary" style={{ background: '#ef4444' }} onClick={() => deleteList(confirmDel)}>{t.deleteList}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Named Lists ─────────────────────────────────────────────────────────────

function MyListsPage({ groupId, user, t, lang, onClose, initialListId = null }) {
  const [lists,         setLists]       = useState([]);
  const [selectedListId, setSelected]   = useState(initialListId);
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

      <div className="settings-page-body">
      {!selectedList ? (
        <div className="tab-content">
          {lists.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><ClipboardList size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>
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
              <div className="empty-state-icon"><ClipboardList size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>
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
      </div>

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

// ─── Notes Page ──────────────────────────────────────────────────────────────

function NotesPage({ groupId, user, memberData, group, lang, hasIndicator, onClose, t }) {
  const [mode, setMode] = useState(hasIndicator ? 'shared' : 'personal');
  const [text, setText] = useState(memberData.notes || '');
  const [saved, setSaved] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    setText(mode === 'personal' ? (memberData.notes || '') : (group.sharedNotes || ''));
    setSaved(false);
    if (mode === 'shared') {
      updateDoc(doc(db, 'groups', groupId, 'members', user.uid), {
        sharedNotesLastSeenAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function handleChange(val) {
    setText(val);
    setSaved(false);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        if (mode === 'personal') {
          await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { notes: val });
        } else {
          await updateDoc(doc(db, 'groups', groupId), {
            sharedNotes: val,
            sharedNotesUpdatedAt: serverTimestamp(),
            sharedNotesUpdatedBy: user.uid,
          });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch { /* best effort */ }
    }, 800);
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onClose}>
          {lang === 'he' ? '→' : '←'} {t.back}
        </button>
        <div className="settings-page-title">{t.notes}</div>
        <div style={{ minWidth: 40, textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-accent-green-text)', fontWeight: 600 }}>
          {saved ? '✓' : ''}
        </div>
      </div>
      <div className="settings-page-body" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 56px)', padding: '0 1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', marginTop: '1rem' }}>
          {[['personal', t.personalNotes], ['shared', t.sharedNotes]].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`mode-btn${mode === m ? ' active' : ''}`}
              style={{ flex: 1 }}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'shared' && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            {t.notesSharedHint}
          </div>
        )}
        <textarea
          value={text}
          onChange={e => handleChange(e.target.value)}
          placeholder={mode === 'personal' ? t.notesPlaceholderPersonal : t.notesPlaceholderShared}
          style={{
            flex: 1, width: '100%', boxSizing: 'border-box',
            padding: '0.75rem', border: '1px solid var(--color-border)',
            borderRadius: 10, fontSize: '0.95rem', lineHeight: 1.6,
            fontFamily: 'inherit', resize: 'none',
            background: 'var(--color-surface)', color: 'var(--color-text)',
            outline: 'none', minHeight: 300,
          }}
        />
      </div>
    </div>
  );
}

// ─── Income Page (Household Mode only) ────────────────────────────────────────────

function IncomePage({ groupId, user, currency, t, lang, onClose }) {
  const [incomes,   setIncomes]   = useState([]);
  const [showAdd,   setShowAdd]   = useState(false);
  const [desc,      setDesc]      = useState('');
  const [amount,    setAmount]    = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [isShared,  setIsShared]  = useState(false);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'income'), orderBy('createdAt', 'desc')),
      snap => setIncomes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [groupId]); // eslint-disable-line

  async function handleAdd(e) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!desc.trim() || !amt || amt <= 0) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'groups', groupId, 'income'), {
        uid: user.uid,
        description: desc.trim(),
        amount: amt,
        frequency,
        isShared,
        startDate: getTodayStr(),
        createdAt: new Date(),
      });
      setDesc(''); setAmount(''); setFrequency('monthly'); setIsShared(false); setShowAdd(false);
    } finally { setSaving(false); }
  }

  const freqLabel = (f) => ({ monthly: t.incomeFreqMonthly, weekly: t.incomeFreqWeekly, once: t.incomeFreqOnce }[f] || f);

  const shared   = incomes.filter(i => i.isShared);
  const personal = incomes.filter(i => !i.isShared && i.uid === user.uid);
  const isEmpty  = shared.length === 0 && personal.length === 0;

  function IncomeSection({ items }) {
    return items.map(item => (
      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-main)' }}>{item.description}</div>
          <div style={{ marginTop: '0.2rem' }}>
            <span style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {freqLabel(item.frequency)}
            </span>
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#4ADE80', flexShrink: 0 }}>
          +{currency}{Number(item.amount).toFixed(2)}
        </div>
        {item.uid === user.uid && (
          <button onClick={() => deleteDoc(doc(db, 'groups', groupId, 'income', item.id))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0.15rem', display: 'flex', flexShrink: 0 }}>
            <X size={16} />
          </button>
        )}
      </div>
    ));
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onClose}>{lang === 'he' ? '→' : '←'} {t.back}</button>
        <div className="settings-page-title">{t.tabIncome}</div>
      </div>
      <div className="settings-page-body" style={{ padding: '1rem 1.25rem', paddingBottom: '5rem' }}>

        <button className="save-btn" style={{ width: '100%', marginBottom: '1.25rem' }}
          onClick={() => setShowAdd(s => !s)}>
          {t.addIncome}
        </button>

        {showAdd && (
          <form onSubmit={handleAdd} style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
            <input
              className="settings-input" required autoFocus
              placeholder={t.incomeDescPlaceholder}
              value={desc} onChange={e => setDesc(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <input
              type="number" step="0.01" min="0.01" required
              className="settings-input"
              placeholder={t.amountPlaceholder(currency)}
              value={amount} onChange={e => setAmount(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <select
              className="settings-select"
              value={frequency} onChange={e => setFrequency(e.target.value)}
              style={{ width: '100%', marginBottom: '0.75rem' }}
            >
              <option value="monthly">{t.incomeFreqMonthly}</option>
              <option value="weekly">{t.incomeFreqWeekly}</option>
              <option value="once">{t.incomeFreqOnce}</option>
            </select>
            <div className="settings-row" style={{ marginBottom: '0.75rem' }}>
              <div>
                <div className="settings-label">{t.incomeShared}</div>
                <div className="settings-sub">{t.incomeSharedDesc}</div>
              </div>
              <label className="pill-toggle">
                <input type="checkbox" checked={isShared} onChange={e => setIsShared(e.target.checked)} />
                <span className="pill-toggle-track" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
                {saving ? '…' : t.addBtn}
              </button>
              <button type="button" className="btn-outline" style={{ flex: 1 }}
                onClick={() => { setShowAdd(false); setDesc(''); setAmount(''); setFrequency('monthly'); setIsShared(false); }}>
                {t.cancelBtn}
              </button>
            </div>
          </form>
        )}

        {shared.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div className="stats-title">{t.incomeSectionShared}</div>
            <IncomeSection items={shared} />
          </div>
        )}

        {personal.length > 0 && (
          <div>
            <div className="stats-title">{t.incomeSectionPersonal}</div>
            <IncomeSection items={personal} />
          </div>
        )}

        {isEmpty && !showAdd && (
          <div className="empty-state">
            <div className="empty-state-icon"><TrendingUp size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>
            {t.noIncome}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recurring Expenses Page (Household Mode only) ─────────────────────────────────

function getNextPaymentDate(item) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (item.frequency === 'monthly' && item.dayOfMonth) {
    const day = Number(item.dayOfMonth);
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
    return d;
  }
  if (item.frequency === 'weekly') {
    const created = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
    const targetDay = created.getDay();
    const diff = (targetDay - today.getDay() + 7) % 7 || 7;
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return d;
  }
  return null;
}

function formatNextPayment(date, t, lang) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return t.today;
  if (diff === 1) return t.tomorrow;
  return date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' });
}

function RecurringExpensesPage({ groupId, user, currency, isAdmin, members, t, lang, onClose }) {
  const [items,       setItems]       = useState([]);
  const [showAdd,     setShowAdd]     = useState(false);
  const [desc,        setDesc]        = useState('');
  const [amount,      setAmount]      = useState('');
  const [frequency,   setFrequency]   = useState('monthly');
  const [type,        setType]        = useState('fixed');
  const [dayOfMonth,  setDayOfMonth]  = useState(1);
  const [isShared,    setIsShared]    = useState(false);
  const [splitType,   setSplitType]   = useState('equal'); // 'equal' | 'custom'
  const [customSplit, setCustomSplit] = useState({});
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'recurring_expenses'), orderBy('createdAt', 'desc')),
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [groupId]); // eslint-disable-line

  function initCustomSplit(amt) {
    const per = members.length > 0 ? (parseFloat(amt) || 0) / members.length : 0;
    const init = {};
    members.forEach(m => { init[m.uid] = per > 0 ? per.toFixed(2) : ''; });
    setCustomSplit(init);
  }

  function handleSplitTypeChange(val) {
    setSplitType(val);
    if (val === 'custom') initCustomSplit(amount);
  }

  function handleAmountChange(val) {
    setAmount(val);
    if (isShared && splitType === 'custom') initCustomSplit(val);
  }

  function resetForm() {
    setDesc(''); setAmount(''); setFrequency('monthly'); setType('fixed');
    setDayOfMonth(1); setIsShared(false); setSplitType('equal'); setCustomSplit({});
  }

  async function handleAdd(e) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!desc.trim() || !amt || amt <= 0) return;
    setSaving(true);
    try {
      const parsed = isShared && splitType === 'custom'
        ? Object.fromEntries(Object.entries(customSplit).map(([k, v]) => [k, parseFloat(v) || 0]))
        : null;
      await addDoc(collection(db, 'groups', groupId, 'recurring_expenses'), {
        uid: user.uid,
        description: desc.trim(),
        amount: amt,
        frequency,
        type,
        autoDeduct: type === 'fixed',
        dayOfMonth: frequency === 'monthly' ? Number(dayOfMonth) : null,
        isShared,
        ...(isShared ? { splitType } : {}),
        ...(isShared && splitType === 'custom' && parsed ? { customSplit: parsed } : {}),
        createdAt: new Date(),
      });
      resetForm();
      setShowAdd(false);
    } finally { setSaving(false); }
  }

  function getShareLabel(item) {
    if (!item.isShared) return null;
    if (item.splitType === 'equal') {
      const per = members.length > 0 ? item.amount / members.length : item.amount;
      return `${t.recurringSplitEqual} · ${currency}${per.toFixed(2)} ${t.recurringPerPerson}`;
    }
    if (item.splitType === 'custom' && item.customSplit) {
      const myShare = item.customSplit[user.uid];
      if (myShare != null) return `${t.recurringYourShare}: ${currency}${Number(myShare).toFixed(2)}`;
    }
    return t.recurringShared;
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onClose}>{lang === 'he' ? '→' : '←'} {t.back}</button>
        <div className="settings-page-title">{t.recurringTitle}</div>
      </div>
      <div className="settings-page-body" style={{ padding: '1rem 1.25rem', paddingBottom: '5rem' }}>

        <button className="save-btn" style={{ width: '100%', marginBottom: '1.25rem' }}
          onClick={() => setShowAdd(s => !s)}>
          {t.addRecurring}
        </button>

        {showAdd && (
          <form onSubmit={handleAdd} style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
            <input
              className="settings-input" required autoFocus
              placeholder={t.recurringDescPlaceholder}
              value={desc} onChange={e => setDesc(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <input
              type="number" step="0.01" min="0.01" required
              className="settings-input"
              placeholder={t.amountPlaceholder(currency)}
              value={amount} onChange={e => handleAmountChange(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />

            {/* Frequency */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {[['monthly', t.incomeFreqMonthly], ['weekly', t.incomeFreqWeekly]].map(([val, label]) => (
                <button key={val} type="button"
                  className={`mode-btn${frequency === val ? ' active' : ''}`}
                  style={{ flex: 1 }} onClick={() => setFrequency(val)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Type */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }}>
                {[['fixed', t.recurringTypeFixed], ['variable', t.recurringTypeVariable]].map(([val, label]) => (
                  <button key={val} type="button"
                    className={`mode-btn${type === val ? ' active' : ''}`}
                    style={{ flex: 1 }} onClick={() => setType(val)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="settings-sub">
                {type === 'fixed' ? t.recurringTypeFixedDesc : t.recurringTypeVariableDesc}
              </div>
            </div>

            {/* Day of month — monthly only */}
            {frequency === 'monthly' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div className="settings-label" style={{ marginBottom: '0.35rem' }}>{t.recurringDayOfMonth}</div>
                <input
                  type="number" min="1" max="28" step="1"
                  className="settings-input"
                  value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)}
                />
              </div>
            )}

            {/* Shared toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', padding: '0.5rem 0' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-main)' }}>{t.recurringShared}</span>
              <button type="button"
                onClick={() => { setIsShared(s => !s); if (!isShared) { setSplitType('equal'); setCustomSplit({}); } }}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 0,
                  background: isShared ? 'var(--color-primary)' : 'var(--color-border)',
                  transition: 'background 0.2s', position: 'relative',
                }}>
                <span style={{
                  position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  left: isShared ? (lang === 'he' ? 3 : 23) : (lang === 'he' ? 23 : 3),
                }} />
              </button>
            </div>

            {/* Split options — visible only when shared */}
            {isShared && (
              <div style={{ marginBottom: '0.75rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--color-primary)' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  {[['equal', t.recurringSplitEqual], ['custom', t.recurringSplitCustom]].map(([val, label]) => (
                    <button key={val} type="button"
                      className={`mode-btn${splitType === val ? ' active' : ''}`}
                      style={{ flex: 1 }} onClick={() => handleSplitTypeChange(val)}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Custom amounts per member */}
                {splitType === 'custom' && members.map(m => (
                  <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--color-text-main)', fontWeight: m.uid === user.uid ? 700 : 400 }}>
                      {m.displayName || m.email}
                    </span>
                    <input
                      type="number" step="0.01" min="0"
                      className="settings-input"
                      style={{ width: 90, marginBottom: 0 }}
                      placeholder={currency}
                      value={customSplit[m.uid] ?? ''}
                      onChange={e => setCustomSplit(prev => ({ ...prev, [m.uid]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
                {saving ? '…' : t.addBtn}
              </button>
              <button type="button" className="btn-outline" style={{ flex: 1 }}
                onClick={() => { setShowAdd(false); resetForm(); }}>
                {t.cancelBtn}
              </button>
            </div>
          </form>
        )}

        {items.length === 0 && !showAdd ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Repeat2 size={40} strokeWidth={1} color="var(--color-text-muted)" /></div>
            {t.noRecurring}
          </div>
        ) : items.map(item => {
          const shareLabel = getShareLabel(item);
          const nextDate   = getNextPaymentDate(item);
          const nextLabel  = formatNextPayment(nextDate, t, lang);
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-main)', marginBottom: '0.2rem' }}>
                  {item.description}
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                  <span style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {item.frequency === 'monthly' ? t.incomeFreqMonthly : t.incomeFreqWeekly}
                  </span>
                  <span style={{
                    borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 600,
                    border: `1px solid ${item.type === 'fixed' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: item.type === 'fixed' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    background: item.type === 'fixed' ? '#e8eef8' : 'var(--color-bg)',
                  }}>
                    {item.type === 'fixed' ? t.recurringTypeFixed : t.recurringTypeVariable}
                  </span>
                  {shareLabel && (
                    <span style={{ borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 600, border: '1px solid #27ae6088', color: '#27ae60', background: '#27ae6011' }}>
                      {shareLabel}
                    </span>
                  )}
                </div>
                {nextLabel && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                    {t.recurringNextPayment}: {nextLabel}
                  </div>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#e74c3c', flexShrink: 0 }}>
                −{currency}{Number(item.amount).toFixed(2)}
              </div>
              {(item.uid === user.uid || isAdmin) && (
                <button onClick={() => deleteDoc(doc(db, 'groups', groupId, 'recurring_expenses', item.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0.15rem', display: 'flex', flexShrink: 0 }}>
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Receipt Review Modal ─────────────────────────────────────────────────────

function ReceiptReviewModal({ result, members, user, currency, groupId, today, onConfirm, onClose, t }) {
  const { items: rawItems, storeName, total, currency: receiptCurrency, receiptDate: detectedDate } = result;
  const displayCurrency = receiptCurrency ? getCurrencySymbol(receiptCurrency) : currency;

  // Past 7 days as YYYY-MM-DD strings (index 0 = today)
  const past7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [selectedDate, setSelectedDate] = useState(today);

  function dayLabel(dateStr, idx) {
    if (idx === 0) return 'Today';
    if (idx === 1) return t.yesterday || 'Yesterday';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  }

  const [items, setItems] = useState(
    rawItems.map((it, i) => ({
      ...it, id: i, checked: true,
      ownerUid: user.uid,
      ownerName: (user.displayName || user.email || '').split(' ')[0],
      quantity:     it.quantity     || 1,
      unitPrice:    it.unitPrice    ?? it.price,
      itemDiscount: it.itemDiscount || 0,
    }))
  );
  const [saveMode, setSaveMode] = useState('separate'); // 'separate' | 'single'
  const [singleName, setSingleName] = useState(
    `${t.receiptSingleDefault} · ${selectedDate}${storeName ? ` · ${storeName}` : ''} · ${displayCurrency}${(total || rawItems.reduce((s, i) => s + i.price, 0)).toFixed(2)}`
  );
  const [catPickerFor, setCatPickerFor] = useState(null);
  const [ownerPickerFor, setOwnerPickerFor] = useState(null);

  function update(id, field, value) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
  }

  const checked = items.filter(it => it.checked);
  const checkedTotal = checked.reduce((s, it) => s + (parseFloat(it.price) || 0), 0);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-title" style={{ fontSize: '1rem', flexShrink: 0 }}>
          {t.receiptScannedTitle}{storeName ? ` — ${storeName}` : ''} ({t.receiptItemCount(checked.length)})
        </div>

        {/* Date picker */}
        <div style={{ flexShrink: 0, marginBottom: '0.5rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
            {detectedDate && detectedDate !== today ? `Receipt date: ${detectedDate} — adjust if needed` : 'Date'}
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '2px' }}>
            {past7.map((d, i) => (
              <button key={d} onClick={() => setSelectedDate(d)} style={{
                flexShrink: 0, padding: '0.28rem 0.65rem', borderRadius: '100px',
                border: `1.5px solid ${selectedDate === d ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: selectedDate === d ? 'var(--color-primary)' : 'none',
                color: selectedDate === d ? 'white' : 'var(--color-text-secondary)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {dayLabel(d, i)}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable item list */}
        <div style={{ flex: 1, overflowY: 'auto', margin: '0.5rem 0' }}>
          {items.map(it => (
            <div key={it.id} style={{
              borderBottom: '1px solid var(--color-border)',
              padding: '0.55rem 0',
              opacity: it.checked ? 1 : 0.4,
              position: 'relative',
            }}>
              {/* Line 1: checkbox + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <input
                  type="checkbox"
                  checked={it.checked}
                  onChange={e => update(it.id, 'checked', e.target.checked)}
                  style={{ flexShrink: 0, width: 18, height: 18, accentColor: 'var(--color-primary)' }}
                />
                <input
                  value={it.name}
                  onChange={e => update(it.id, 'name', e.target.value)}
                  enterKeyHint="done"
                  style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500, border: 'none', background: 'none', outline: 'none', fontFamily: 'inherit', color: '#1A1D23', minWidth: 0 }}
                  placeholder="Product name"
                />
                {it.confident === false && (
                  <span title="Low confidence — please verify" style={{ fontSize: '0.85rem', flexShrink: 0 }}>⚠️</span>
                )}
                {it.quicklistMatchId && <span className="receipt-ql-badge">{t.receiptQlBadge}</span>}
              </div>
              {/* Raw text hint for low-confidence items */}
              {it.confident === false && it.rawText && (
                <div style={{ paddingLeft: '1.75rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontFamily: 'monospace' }}>
                    ↳ {it.rawText}
                  </span>
                </div>
              )}
              {/* Line 2: category + owner + price */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1.75rem' }}>
                <button className="receipt-cat-pill" onClick={() => setCatPickerFor(catPickerFor === it.id ? null : it.id)}>
                  {it.category}
                </button>
                <button className="receipt-owner-btn" onClick={() => setOwnerPickerFor(ownerPickerFor === it.id ? null : it.id)}>
                  {it.ownerName}
                </button>
                <div style={{ flex: 1 }} />
                {parseFloat(it.price) < 0 && (
                  <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600, background: '#dcfce7', borderRadius: 4, padding: '1px 5px' }}>credit</span>
                )}
                <input
                  type="number" step="0.01"
                  value={it.price}
                  onChange={e => update(it.id, 'price', e.target.value)}
                  enterKeyHint="done"
                  style={{ width: 64, textAlign: 'right', fontSize: '0.9rem', fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 6, padding: '2px 6px', fontFamily: 'inherit', color: parseFloat(it.price) < 0 ? '#16a34a' : '#1A1D23', background: 'white' }}
                />
              </div>
              {/* Line 3: quantity / discount info (only shown when relevant) */}
              {(it.quantity > 1 || it.itemDiscount > 0) && (
                <div style={{ paddingLeft: '1.75rem', marginTop: '0.2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {it.quantity > 1 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {it.quantity} × {displayCurrency}{Number(it.unitPrice).toFixed(2)}
                    </span>
                  )}
                  {it.itemDiscount > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                      {t.receiptDiscount} −{displayCurrency}{Number(it.itemDiscount).toFixed(2)}
                    </span>
                  )}
                </div>
              )}
              {/* Category picker */}
              {catPickerFor === it.id && (
                <div style={{ position: 'absolute', top: '100%', left: '1.75rem', zIndex: 20, background: 'white', border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', maxWidth: 240, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  {['food','groceries','transport','activities','shopping','accommodation','beauty','other'].map(c => (
                    <button key={c} className="receipt-cat-pill"
                      style={{ background: it.category === c ? 'var(--color-primary)' : undefined, color: it.category === c ? 'white' : undefined }}
                      onClick={() => { update(it.id, 'category', c); setCatPickerFor(null); }}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {/* Owner picker */}
              {ownerPickerFor === it.id && (
                <div style={{ position: 'absolute', top: '100%', left: '1.75rem', zIndex: 20, background: 'white', border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  {members.map(m => (
                    <button key={m.uid} className="receipt-owner-btn"
                      style={{ background: it.ownerUid === m.uid ? 'var(--color-primary-light)' : undefined }}
                      onClick={() => { update(it.id, 'ownerUid', m.uid); update(it.id, 'ownerName', (m.displayName || m.uid).split(' ')[0]); setOwnerPickerFor(null); }}>
                      {(m.displayName || m.uid).split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {[['separate', t.receiptSaveSeparate], ['single', t.receiptSaveSingle]].map(([m, label]) => (
              <button key={m} className={`mode-btn${saveMode === m ? ' active' : ''}`} onClick={() => setSaveMode(m)} style={{ flex: 1, fontSize: '0.78rem' }}>
                {label}
              </button>
            ))}
          </div>
          {saveMode === 'single' && (
            <input className="settings-input" value={singleName} onChange={e => setSingleName(e.target.value)}
              style={{ width: '100%', marginBottom: '0.65rem', fontSize: '0.82rem' }} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{t.receiptSelectedTotal} {displayCurrency}{checkedTotal.toFixed(2)}</span>
          </div>
          <button className="btn-primary" style={{ width: '100%', marginBottom: '0.5rem', touchAction: 'manipulation' }}
            disabled={checked.length === 0}
            onClick={() => onConfirm({ items, saveMode, singleName, storeName, total: checkedTotal, receiptCurrency, receiptDate: selectedDate })}>
            {t.receiptConfirmBtn}
          </button>
          <button onClick={onClose} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.25rem' }}>
            {t.cancelBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reassign Expense Modal ───────────────────────────────────────────────────

function ReassignModal({ exp, members, user, currency, onConfirm, onClose, t }) {
  const others = members.filter(m => m.uid !== exp.uid);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ fontSize: '1rem' }}>{t.reassignTitle(exp.description)}</div>
        <p style={{ color: '#888', fontSize: '0.82rem', margin: '0.25rem 0 1rem' }}>
          {currency}{Number(exp.amount).toFixed(2)} · {exp.date}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {others.map(m => (
            <button key={m.uid} className="btn-outline" onClick={() => onConfirm(exp, m)}>
              {(m.displayName || m.uid).split(' ')[0]}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#bbb', fontSize: '0.85rem', cursor: 'pointer', marginTop: '1rem' }}>
          {t.reassignCancel}
        </button>
      </div>
    </div>
  );
}

// ─── Available Today Info Popup ──────────────────────────────────────────────
// TO REVERT: remove <AvailableInfoPopup> usage + showAvailableInfo state + this component

function AvailableInfoPopup({ todayBalance, canStillSpend, dailyBudget, currency, onClose, t, bigExpenseDailyTotal = 0 }) {
  const fromBalance = Math.max(0, todayBalance);
  const borrowed    = canStillSpend - fromBalance;
  const row = (label, value, bold) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.45rem', fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: '#555', fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', color: bold ? '#1A1D23' : '#444' }}>{value}</span>
    </div>
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 300 }}>
        <div className="modal-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>{t.availableInfoTitle}</div>
        {row(t.availableInfoFromBalance, `${currency}${fromBalance.toFixed(2)}`)}
        {row(t.availableInfoBorrow,      `${currency}${borrowed.toFixed(2)}`)}
        <div style={{ borderTop: '1px solid #EAEDF2', margin: '0.5rem 0' }} />
        {row(t.availableInfoTotal, `${currency}${canStillSpend.toFixed(2)}`, true)}
        <p style={{ color: '#888', fontSize: '0.78rem', lineHeight: 1.5, margin: '0.75rem 0 1rem' }}>{t.availableInfoNote}</p>
        {bigExpenseDailyTotal > 0 && (
          <p style={{ color: '#ff9999', fontSize: '0.78rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
            {t.bigExpenseTooltipNote(`${currency}${bigExpenseDailyTotal.toFixed(2)}`)}
          </p>
        )}
        <button className="btn-primary" onClick={onClose}>{t.gotIt}</button>
      </div>
    </div>
  );
}

// ─── Big Expense History Page ─────────────────────────────────────────────────

function BigExpenseHistoryPage({ bigExpenses, currency, today, t, lang, onClose }) {
  const sorted = [...bigExpenses].sort((a, b) => {
    const tsA = a.createdAt?.toMillis?.() ?? 0;
    const tsB = b.createdAt?.toMillis?.() ?? 0;
    return tsB - tsA;
  });

  return (
    <div className="settings-page" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      <div className="settings-page-header">
        <button className="settings-back-btn" onClick={onClose}>
          {lang === 'he' ? '→' : '←'} {t.back}
        </button>
        <div className="settings-page-title">{t.bigExpenseHistoryTitle}</div>
      </div>
      <div className="settings-page-body" style={{ padding: '1rem 1.25rem', paddingBottom: '5rem' }}>
        {sorted.length === 0 && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{t.noBigExpenses}</div>
        )}
        {sorted.map(exp => {
          const daysElapsed = Math.max(0, Math.floor((new Date(today) - new Date(exp.startDate)) / 86400000));
          const totalDays = exp.weeks * 7;
          const timeDone = daysElapsed >= totalDays;
          const cancelled = exp.active === false && !timeDone && !(exp.paidOff >= exp.totalAmount);
          const paidOff = exp.active === false && !cancelled;
          const isDone = timeDone || paidOff;
          const remaining = isDone ? 0 : Math.max(0, exp.totalAmount - (exp.paidOff || 0) - daysElapsed * exp.dailyAmount);
          const pct = totalDays > 0 ? Math.min(100, ((exp.paidOff || 0) / exp.totalAmount + Math.min(daysElapsed, totalDays) / totalDays) * 100) : 100;

          let statusLabel, statusColor;
          if (cancelled) { statusLabel = t.bigExpenseCancelled; statusColor = 'var(--color-text-muted)'; }
          else if (isDone) { statusLabel = t.bigExpensePaidOff; statusColor = '#4ADE80'; }
          else { statusLabel = `${currency}${remaining.toFixed(2)} ${t.bigExpenseRemaining}`; statusColor = 'var(--color-primary)'; }

          return (
            <div key={exp.id} style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 10, border: '1px solid var(--color-border)', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{exp.name}</span>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: statusColor }}>{statusLabel}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                {currency}{exp.totalAmount?.toFixed(2)} · −{currency}{exp.dailyAmount?.toFixed(2)}{t.bigExpensePerDay} · {exp.startDate}
              </div>
              <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2 }}>
                <div style={{ height: 4, width: `${pct}%`, background: cancelled ? 'var(--color-text-muted)' : isDone ? '#4ADE80' : 'var(--color-primary)', borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Big Expense Sheet ────────────────────────────────────────────────────────

function BigExpenseSheet({ bigExpenses, currency, isAdmin, today, t, groupId, canStillSpend, user, onClose }) {
  const [cancelConfirmId, setCancelConfirmId] = useState(null);
  const [payoffId,        setPayoffId]        = useState(null);
  const [payoffAmount,    setPayoffAmount]     = useState('');
  const [payoffError,     setPayoffError]      = useState('');
  const [payoffSaving,    setPayoffSaving]     = useState(false);

  async function handleCancel(id) {
    await updateDoc(doc(db, 'groups', groupId, 'big_expenses', id), {
      active: false, cancelledAt: new Date(),
    });
    setCancelConfirmId(null);
  }

  function openPayoff(exp, remaining) {
    setPayoffId(exp.id);
    setPayoffAmount(remaining.toFixed(2));
    setPayoffError('');
    setCancelConfirmId(null);
  }

  async function confirmPayoff(exp, remaining) {
    const amt = parseFloat(payoffAmount);
    if (!amt || amt <= 0) return;
    if (amt > canStillSpend) {
      setPayoffError(t.payOffInsufficientBalance);
      return;
    }
    setPayoffSaving(true);
    try {
      const batch = writeBatch(db);
      // Record as a regular expense so it shows in history and deducts from balance
      const expRef = doc(collection(db, 'groups', groupId, 'expenses'));
      batch.set(expRef, {
        uid: user.uid, addedBy: user.displayName || user.email,
        amount: amt, description: exp.name,
        category: 'other', date: today, createdAt: new Date(),
      });
      // Increase paidOff; mark inactive if fully cleared
      const newPaidOff = (exp.paidOff || 0) + amt;
      const daysElapsed = Math.max(0, Math.floor((new Date(today) - new Date(exp.startDate)) / 86400000));
      const newRemaining = Math.max(0, exp.totalAmount - newPaidOff - daysElapsed * exp.dailyAmount);
      const bigRef = doc(db, 'groups', groupId, 'big_expenses', exp.id);
      batch.update(bigRef, { paidOff: newPaidOff, ...(newRemaining <= 0 ? { active: false } : {}) });
      await batch.commit();
      setPayoffId(null);
      setPayoffAmount('');
    } finally {
      setPayoffSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="modal-title" style={{ margin: 0, fontSize: '1rem' }}>{t.bigExpenses}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0.25rem' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {bigExpenses.map(exp => {
            const daysElapsed = Math.max(0, Math.floor((new Date(today) - new Date(exp.startDate)) / 86400000));
            const totalDays = exp.weeks * 7;
            const isDone = daysElapsed >= totalDays;
            const remaining = isDone ? 0 : Math.max(0, exp.totalAmount - (exp.paidOff || 0) - daysElapsed * exp.dailyAmount);
            const daysLeft = Math.max(0, totalDays - daysElapsed);
            const pct = totalDays > 0 ? Math.min(100, ((exp.paidOff || 0) / exp.totalAmount + daysElapsed / totalDays) * 100) : 100;
            const isPayingOff = payoffId === exp.id;

            return (
              <div key={exp.id} style={{ padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-main)' }}>{exp.name}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isDone ? '#4ADE80' : 'var(--color-primary)' }}>
                    {isDone ? t.bigExpensePaidOff : `${currency}${remaining.toFixed(2)} ${t.bigExpenseRemaining}`}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                  <span>−{currency}{exp.dailyAmount.toFixed(2)}{t.bigExpensePerDay}</span>
                  {!isDone && <span>{t.bigExpenseEndsIn(daysLeft)}</span>}
                </div>
                <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2, marginBottom: '0.6rem' }}>
                  <div style={{ height: 4, width: `${pct}%`, background: isDone ? '#4ADE80' : 'var(--color-primary)', borderRadius: 2 }} />
                </div>

                {/* Pay off inline form */}
                {isPayingOff && (
                  <div style={{ marginBottom: '0.6rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                      {t.payOffAmountLabel}
                    </div>
                    <input
                      type="number" inputMode="decimal" min="0.01" step="0.01"
                      value={payoffAmount}
                      onChange={e => { setPayoffAmount(e.target.value); setPayoffError(''); }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: '1rem', fontFamily: 'inherit', outline: 'none', marginBottom: '0.45rem' }}
                    />
                    {payoffError && (
                      <div style={{ fontSize: '0.75rem', color: '#ff6b6b', marginBottom: '0.4rem' }}>{payoffError}</div>
                    )}
                    <button
                      onClick={() => confirmPayoff(exp, remaining)}
                      disabled={payoffSaving}
                      className="btn-primary"
                      style={{ width: '100%', marginBottom: '0.4rem' }}>
                      {payoffSaving ? '…' : t.payOffConfirm}
                    </button>
                    <button onClick={() => setPayoffId(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'center' }}>
                      {t.cancelBtn}
                    </button>
                  </div>
                )}

                {!isDone && !isPayingOff && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      className="btn-outline"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }}
                      onClick={() => openPayoff(exp, remaining)}>
                      {t.payOffNow}
                    </button>
                    {isAdmin && (
                      cancelConfirmId === exp.id ? (
                        <div style={{ display: 'flex', gap: '0.4rem', flex: 1 }}>
                          <button className="btn-outline"
                            style={{ flex: 1, fontSize: '0.75rem', color: '#ff6b6b', borderColor: '#ff6b6b' }}
                            onClick={() => handleCancel(exp.id)}>
                            {t.cancelBigExpense}
                          </button>
                          <button className="btn-outline"
                            style={{ flex: 1, fontSize: '0.75rem' }}
                            onClick={() => setCancelConfirmId(null)}>
                            {t.cancelBtn}
                          </button>
                        </div>
                      ) : (
                        <button
                          style={{ background: 'none', border: 'none', color: '#ff9999', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                          onClick={() => setCancelConfirmId(exp.id)}>
                          {t.cancelBigExpense}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sunday Prompt ────────────────────────────────────────────────────────────

function SundayPromptModal({ mode, balance, currency, onChoice, onDismiss, t }) {
  const amountStr = `${currency}${Math.abs(balance).toFixed(2)}`;

  // Deficit: info only
  if (mode === 'deficit') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className="modal-title">{t.sundayDeficitTitle}</div>
          <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            {t.sundayDeficitDesc(amountStr)}
          </p>
          <button className="btn-primary" onClick={onDismiss}>{t.gotIt}</button>
        </div>
      </div>
    );
  }

  // Surplus: 3 choices
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">{t.sundayTitle}</div>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          {t.sundayDesc(amountStr)}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <button className="btn-primary" onClick={() => onChoice('A')}>{t.keepCarrying}</button>
          <button className="btn-outline"  onClick={() => onChoice('B')}>{t.moveToPersonal}</button>
          <button className="btn-outline"  onClick={() => onChoice('C')}>{t.moveToShared}</button>
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#bbb', fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.25rem' }}>{t.remindLater}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function usePullToRefresh() {
  useEffect(() => {
    let startY = 0;
    let startX = 0;
    function onTouchStart(e) {
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    }
    function onTouchEnd(e) {
      const distY = e.changedTouches[0].clientY - startY;
      const distX = Math.abs(e.changedTouches[0].clientX - startX);
      // Only reload if: pulled down 160px+, mostly vertical, page is at top,
      // and touch started within the top 120px of screen (header area)
      if (distY > 160 && distX < 40 && window.scrollY === 0 && startY < 120) {
        window.location.reload();
      }
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
  const [showProfile,  setShowProfile]  = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);
  const [showStats,    setShowStats]   = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [showMembers,  setShowMembers] = useState(false);
  const [showLists,    setShowLists]   = useState(false);
  const [showOtherLists, setShowOtherLists] = useState(false);
  const [initialListId, setInitialListId] = useState(null);
  const [showNotes,    setShowNotes]   = useState(false);
  const [showIncome,     setShowIncome]     = useState(false);
  const [showRecurring,  setShowRecurring]  = useState(false);
  const menuRef = useRef(null);
  const [expenses,     setExpenses]    = useState([]);
  const [allMembers,   setAllMembers]  = useState([]);
  const [showAdd,      setShowAdd]     = useState(false);
  const [showSunday,        setShowSunday]        = useState(null); // null | 'surplus' | 'deficit'
  const [showAvailableInfo,   setShowAvailableInfo]   = useState(false);
  const [bigExpenses,         setBigExpenses]         = useState([]);
  const [showBigExpenseSheet, setShowBigExpenseSheet] = useState(false);
  const [showBigExpHistory,   setShowBigExpHistory]   = useState(false);
  const [reassignExp,         setReassignExp]         = useState(null);
  const [viewMode,     setViewMode]    = useState('all');
  const [form,         setForm]        = useState({ amount: '', description: '', category: 'food', date: getTodayStr(), photo: null });
  const [addError,       setAddError]       = useState('');
  const [overBudgetToast, setOverBudgetToast] = useState(null);
  const [catalog,        setCatalog]        = useState([]);
  const [suggestions,  setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef(null);
  const photoInputRef        = useRef(null);
  const scanInputRef         = useRef(null);
  const processScanFileRef   = useRef(null);
  const [isScanning,         setIsScanning]         = useState(false);
  const [receiptResult,      setReceiptResult]      = useState(null);
  const [receiptImageBase64, setReceiptImageBase64] = useState(null);
  const [showReceiptReview,  setShowReceiptReview]  = useState(false);

  // Keep tab in sync when language changes
  useEffect(() => {
    setTab(t.tabExpenses);
  }, [lang]); // eslint-disable-line

  // Fetch live exchange rates once on mount
  useEffect(() => { fetchLiveRates(); }, []); // eslint-disable-line

  // Handle image shared from the OS share sheet (Web Share Target API)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('shared')) return;
    window.history.replaceState({}, '', window.location.pathname);
    fetch('/shared-image')
      .then(async res => {
        if (!res.ok) return;
        const blob = await res.blob();
        const file = new File([blob], 'shared.jpg', { type: blob.type || 'image/jpeg' });
        processScanFileRef.current?.(file);
        caches.open('share-target-v1').then(c => c.delete('/shared-image'));
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  const dailyBudget = getDailyBudget(group);
  const currency    = getCurrencySymbol(group.currency);
  const today       = getTodayStr();
  const isAdmin     = group.adminUid === user.uid;
  const groupMode   = (group.groupMode || 'trip').toLowerCase();
  const hasNotesIndicator = !!(
    group.sharedNotesUpdatedBy &&
    group.sharedNotesUpdatedBy !== user.uid &&
    group.sharedNotesUpdatedAt &&
    (!memberData.sharedNotesLastSeenAt ||
      group.sharedNotesUpdatedAt.toMillis() > memberData.sharedNotesLastSeenAt.toMillis())
  );

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
    const rb = memberData.running_balance || 0;
    if (rb === 0) return;
    setShowSunday(rb > 0 ? 'surplus' : 'deficit');
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

  useEffect(() => {
    return onSnapshot(
      collection(db, 'groups', groupId, 'big_expenses'),
      snap => setBigExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.createdBy === user.uid))
    );
  }, [groupId]); // eslint-disable-line

  // Active big expenses: not cancelled and not time-expired
  const activeBigExpenses = bigExpenses.filter(exp => {
    if (exp.active === false) return false;
    const daysElapsed = Math.max(0, Math.floor((new Date(today) - new Date(exp.startDate)) / 86400000));
    return daysElapsed < exp.weeks * 7;
  });

  // Balance
  const myTodayTotal   = expenses.filter(e => e.uid === user.uid && e.date === today).reduce((s, e) => s + getDisplayAmount(e, group.currency), 0);
  const runningBalance = memberData.running_balance || 0;
  const bigExpenseDailyTotal = activeBigExpenses.reduce((sum, exp) => {
    const daysElapsed = Math.floor((new Date(today) - new Date(exp.startDate)) / 86400000);
    if (daysElapsed < 0 || daysElapsed >= exp.weeks * 7) return sum;
    return sum + exp.dailyAmount;
  }, 0);
  const bigExpenseTotalRemaining = activeBigExpenses.reduce((sum, exp) => {
    const daysElapsed = Math.max(0, Math.floor((new Date(today) - new Date(exp.startDate)) / 86400000));
    const totalDays = exp.weeks * 7;
    if (daysElapsed >= totalDays) return sum;
    return sum + Math.max(0, exp.totalAmount - (exp.paidOff || 0) - daysElapsed * exp.dailyAmount);
  }, 0);
  const todayBalance   = runningBalance + dailyBudget - myTodayTotal - bigExpenseDailyTotal;
  // Rule: end-of-day balance can never drop below −dailyBudget.
  // Floor: today's balance can never go below -(dailyBudget × borrowFraction).
  // borrowFraction = 0 when borrow is off (no overdraft allowed).
  const borrowFraction = (memberData.borrow_enabled ?? false)
    ? (memberData.borrow_percent ?? 100) / 100
    : 0;
  const canStillSpend  = Math.max(0, todayBalance + dailyBudget * borrowFraction);
  const maxTodaySpend  = myTodayTotal + canStillSpend;
  const inOverdraft    = todayBalance < 0;
  const totalAvailable = dailyBudget + runningBalance;
  const balancePct     = totalAvailable > 0 ? Math.min(100, Math.max(0, (todayBalance / totalAvailable) * 100)) : 0;
  const balanceColor   = todayBalance > totalAvailable * 0.3 ? '#4caf50'
                       : todayBalance > totalAvailable * 0.1 ? '#ff9800'
                       : '#f44336';

  function getMemberBalance(member) {
    const mt = expenses.filter(e => e.uid === member.uid && e.date === today).reduce((s, e) => s + getDisplayAmount(e, group.currency), 0);
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
    const convertedPrice = item.originalPrice != null && item.originalCurrency
      ? convertAmount(item.originalPrice, item.originalCurrency, group.currency)
      : item.price;
    setForm(f => ({ ...f, description: item.name, amount: String(Math.round(convertedPrice * 100) / 100), category: item.category, photo: item.photo || null }));
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

    const willBeOverBudget = form.date === today && (todayBalance - amt) < 0;
    const expDate = form.date || today;
    const expDoc = {
      uid: user.uid, addedBy: user.displayName || user.email,
      amount: amt, originalAmount: amt, originalCurrency: group.currency,
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
      const catalogUpdate = { price: amt, originalPrice: amt, originalCurrency: group.currency, category: form.category };
      if (form.photo) catalogUpdate.photo = form.photo;
      if (existing) {
        await updateDoc(doc(catRef, existing.id), catalogUpdate);
      } else {
        await addDoc(catRef, { name, ...catalogUpdate });
      }
    }

    setForm({ amount: '', description: '', category: 'food', date: today, photo: null });
    setShowAdd(false);
    if (willBeOverBudget) {
      const overAmt = `${currency}${Math.abs(todayBalance - amt).toFixed(2)}`;
      setOverBudgetToast(t.overBudgetSaved(overAmt));
      setTimeout(() => setOverBudgetToast(null), 4000);
    }
  }

  async function handleAddExpensePhoto(exp, file) {
    // Compress to max 400px
    const photoDataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX = 400;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Save to expense
    await updateDoc(doc(db, 'groups', groupId, 'expenses', exp.id), { photo: photoDataUrl });

    // Also update product catalog entry (best-effort)
    try {
      const catRef = collection(db, 'groups', groupId, 'product_catalog', exp.uid, 'items');
      const catSnap = await getDocs(catRef);
      const existing = catSnap.docs.find(d =>
        d.data().name?.toLowerCase() === (exp.description || '').toLowerCase()
      );
      if (existing) {
        await updateDoc(doc(catRef, existing.id), { photo: photoDataUrl });
      }
    } catch { /* best-effort */ }
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

  async function reassignExpense(exp, toMember) {
    const batch      = writeBatch(db);
    const expRef     = doc(db, 'groups', groupId, 'expenses', exp.id);
    const fromRef    = doc(db, 'groups', groupId, 'members', exp.uid);
    const toRef      = doc(db, 'groups', groupId, 'members', toMember.uid);
    const fromMember = allMembers.find(m => m.uid === exp.uid);

    // Update expense ownership
    batch.update(expRef, {
      uid:     toMember.uid,
      addedBy: toMember.displayName || toMember.uid,
    });

    // Only adjust running_balance for already-processed days (not today)
    if (exp.date !== today) {
      batch.update(fromRef, { running_balance: (fromMember?.running_balance || 0) + exp.amount });
      batch.update(toRef,   { running_balance: (toMember.running_balance   || 0) - exp.amount });
    }

    await batch.commit();
    setReassignExp(null);
  }

  // Receipt scanning
  async function processScanFile(file) {
    if (!file) return;
    if (!navigator.onLine) {
      alert('No internet connection. Please connect and try again.');
      return;
    }
    setIsScanning(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = ev => resolve(ev.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const qlSnap = await getDocs(collection(db, 'groups', groupId, 'shopping_list'));
      const quicklistItems = qlSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const result = await scanReceipt(base64, file.type || 'image/jpeg', quicklistItems, group.translateReceipts ?? true);
      setReceiptResult(result);
      setReceiptImageBase64(base64);
      setShowReceiptReview(true);
    } catch (err) {
      const msg = err.message === 'NETWORK_ERROR' ? 'Network error. Check your connection.' :
                  err.message === 'PARSE_ERROR'   ? 'Could not parse receipt. Try a clearer photo.' :
                  `Scan failed: ${err.message}`;
      alert(msg);
    } finally {
      setIsScanning(false);
    }
  }
  processScanFileRef.current = processScanFile;

  async function handleScanReceipt(e) {
    const file = e.target.files[0];
    e.target.value = '';
    await processScanFile(file);
  }

  async function handleReceiptConfirm({ items, saveMode, singleName, storeName, total: checkedTotal, receiptCurrency, receiptDate }) {
    const checked = items.filter(it => it.checked);
    if (checked.length === 0) return;
    const foreignCurrency = receiptCurrency && receiptCurrency !== group.currency ? receiptCurrency : null;
    const toGroupAmt = (amt) => foreignCurrency ? convertAmount(amt, foreignCurrency, group.currency) : amt;

    // Close modal immediately so the user sees feedback
    setShowReceiptReview(false);

    // Step 1: compress image thumbnail (non-blocking, doesn't block expenses)
    let thumbBase64 = null;
    if (receiptImageBase64) {
      try {
        thumbBase64 = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const MAX = 1000;
            const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * ratio);
            canvas.height = Math.round(img.height * ratio);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.78).split(',')[1]);
          };
          img.onerror = () => resolve(null);
          img.src = `data:image/jpeg;base64,${receiptImageBase64}`;
          setTimeout(() => resolve(null), 5000); // safety timeout
        });
      } catch { thumbBase64 = null; }
    }
    setReceiptResult(null);
    setReceiptImageBase64(null);

    // Step 2: write expenses + receipt record in one batch
    try {
      const batch = writeBatch(db);

      if (saveMode === 'single') {
        const expRef = doc(collection(db, 'groups', groupId, 'expenses'));
        batch.set(expRef, {
          uid: user.uid, addedBy: user.displayName || user.email,
          amount: toGroupAmt(checkedTotal),
          originalAmount: checkedTotal,
          originalCurrency: foreignCurrency || group.currency,
          description: singleName.trim() || storeName || 'Receipt',
          category: 'groceries', date: receiptDate || today, createdAt: new Date(),
        });
      } else {
        checked.forEach(it => {
          const amt = parseFloat(it.price) || 0;
          const qty = it.quantity || 1;
          const expRef = doc(collection(db, 'groups', groupId, 'expenses'));
          batch.set(expRef, {
            uid: it.ownerUid, addedBy: it.ownerName,
            amount: toGroupAmt(amt),
            originalAmount: amt,
            originalCurrency: foreignCurrency || group.currency,
            description: it.name,
            category: it.category || 'groceries',
            date: receiptDate || today, createdAt: new Date(),
            ...(qty > 1 ? { quantity: qty } : {}),
          });
        });
      }

      // Receipt record (thumbnail, not full image)
      const receiptRef = doc(collection(db, 'groups', groupId, 'receipts'));
      batch.set(receiptRef, {
        storeName: storeName || null,
        total: checkedTotal,
        currency: foreignCurrency || group.currency,
        scannedAt: new Date(),
        scannedBy: user.uid,
        itemCount: checked.length,
        ...(thumbBase64 ? { imageBase64: thumbBase64 } : {}),
      });

      // Remove matched quicklist items
      [...new Set(checked.filter(it => it.quicklistMatchId && it.quicklistMatchId !== 'null').map(it => it.quicklistMatchId))]
        .forEach(id => batch.delete(doc(db, 'groups', groupId, 'shopping_list', id)));

      await batch.commit();
      setOverBudgetToast(`✓ ${checked.length} expense${checked.length !== 1 ? 's' : ''} added`);
      setTimeout(() => setOverBudgetToast(null), 3000);
    } catch (err) {
      console.error('Receipt save error:', err);
      setOverBudgetToast(`⚠ Save failed: ${err.message}`);
      setTimeout(() => setOverBudgetToast(null), 6000);
      return;
    }

    // Step 3: update product catalog (best-effort, doesn't affect expenses)
    if (saveMode === 'separate') {
      for (const it of checked) {
        // Catalog stores the per-unit pre-discount price (unitPrice), not the discounted line total
        const unitAmt = parseFloat(it.unitPrice) || parseFloat(it.price) || 0;
        if (!unitAmt || unitAmt < 0 || !it.name) continue;
        try {
          const catRef   = collection(db, 'groups', groupId, 'product_catalog', it.ownerUid, 'items');
          const catSnap  = await getDocs(catRef);
          const existing = catSnap.docs.find(d => d.data().name?.toLowerCase() === it.name.toLowerCase());
          if (existing) {
            const exData = existing.data();
            const samePrice = exData.originalCurrency === group.currency
              && Math.round((exData.originalPrice ?? exData.price) * 100) === Math.round(unitAmt * 100);
            if (!samePrice) {
              await updateDoc(doc(catRef, existing.id), { price: unitAmt, originalPrice: unitAmt, originalCurrency: group.currency, category: it.category || 'groceries' });
            }
            // exact duplicate (same name + same price) — skip, no write needed
          } else {
            await addDoc(catRef, { name: it.name, price: unitAmt, originalPrice: unitAmt, originalCurrency: group.currency, category: it.category || 'groceries' });
          }
        } catch { /* catalog update is best-effort */ }
      }
    }
  }

  // Sunday choice
  async function handleSundayChoice(option) {
    const surplus   = memberData.running_balance || 0;
    const batch     = writeBatch(db);
    const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
    const groupRef  = doc(db, 'groups', groupId);

    if (option === 'A') {
      // Keep in balance — no balance change
      batch.update(memberRef, { last_sunday_prompt: today });
    } else if (option === 'B') {
      // Move all to personal savings
      batch.update(memberRef, {
        savings_box_personal: (memberData.savings_box_personal || 0) + surplus,
        running_balance: 0,
        last_sunday_prompt: today,
      });
    } else if (option === 'C') {
      // Move all to shared savings
      batch.update(memberRef, { running_balance: 0, last_sunday_prompt: today });
      batch.update(groupRef, {
        savings_box_shared: (group.savings_box_shared || 0) + surplus,
        [`shared_savings_contributors.${user.uid}`]: ((group.shared_savings_contributors?.[user.uid]) || 0) + surplus,
      });
    }
    await batch.commit();
    setShowSunday(null);
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
            <button className="logout-btn" onClick={() => setShowStats(true)} title={t.tabStats}>
              <BarChart2 size={16} strokeWidth={1.5} />
            </button>
            <button className="logout-btn" onClick={() => setShowMembers(true)} title={t.tabMembers}>
              <Users size={16} strokeWidth={1.5} />
            </button>
            <div className="header-menu-wrap" ref={menuRef}>
              <button className="logout-btn" onClick={() => setShowMenu(m => !m)} title="Menu" style={{ position: 'relative' }}>
                <SettingsIcon size={16} strokeWidth={1.5} />
                {hasNotesIndicator && (
                  <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '1.5px solid white' }} />
                )}
              </button>
              {showMenu && (
                <div className="header-dropdown">
                  <button onClick={() => { setShowMenu(false); setShowProfile(true); }}>
                    <Users size={15} strokeWidth={1.5} /> {t.tabProfile}
                  </button>
                  <button onClick={() => { setShowMenu(false); setShowSettings(true); }}>
                    <SettingsIcon size={15} strokeWidth={1.5} /> {t.tabSettings}
                  </button>
                  <button onClick={() => { setLang(lang === 'en' ? 'he' : 'en'); setShowMenu(false); }}>
                    <Globe size={15} strokeWidth={1.5} /> {lang === 'en' ? 'עברית' : 'English'}
                  </button>
                  <button onClick={() => { setShowNotes(true); setShowMenu(false); }}>
                    <NotepadText size={15} strokeWidth={1.5} /> {t.notes}
                    {hasNotesIndicator && (
                      <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                    )}
                  </button>
                  {groupMode === 'home' && (
                    <button onClick={() => { setShowIncome(true); setShowMenu(false); }}>
                      <TrendingUp size={15} strokeWidth={1.5} /> {t.tabIncome}
                    </button>
                  )}
                  {groupMode === 'home' && (
                    <button onClick={() => { setShowRecurring(true); setShowMenu(false); }}>
                      <Repeat2 size={15} strokeWidth={1.5} /> {t.tabRecurring}
                    </button>
                  )}
                  <div className="dropdown-divider" />
                  <button onClick={() => { setShowProducts(true); setShowMenu(false); }}>
                    <PackageIcon size={15} strokeWidth={1.5} /> {t.tabProducts}
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
              <div className="budget-meta-item" style={{ marginTop: '0.35rem', justifyContent: 'flex-end' }}>
                <span className="budget-meta-dot" style={{ background: canStillSpend > 0 ? '#4ADE80' : '#ff6b6b' }} />
                {t.availableToday}:&nbsp;
                <span style={{ fontWeight: 700, color: canStillSpend > 0 ? '#4ADE80' : '#ff9999' }}>{currency}{canStillSpend.toFixed(2)}</span>
                <button onClick={() => setShowAvailableInfo(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 4px', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', lineHeight: 1 }}>ⓘ</button>
              </div>
            </div>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${balancePct}%`, background: balanceColor }} />
          </div>
          <div className="budget-meta" style={{ marginTop: '0.5rem' }}>
            <div className="budget-meta-item">
              <span className="budget-meta-dot" style={{ background: 'rgba(255,255,255,0.45)' }} />
              {t.spent}: <span>{currency}{myTodayTotal.toFixed(2)}</span>
            </div>
            <div className="budget-meta-item">
              <span className="budget-meta-dot" style={{ background: runningBalance < 0 ? '#ff6b6b' : '#4ADE80' }} />
              {t.carriedOver}: <span style={{ color: runningBalance < 0 ? '#ff9999' : '#4ADE80' }}>
                {runningBalance >= 0 ? '+' : ''}{currency}{runningBalance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
        {bigExpenseDailyTotal > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0.4rem 0 0.15rem' }}>
          <div
            onClick={() => setShowBigExpenseSheet(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              background: 'rgba(0,0,0,0.2)', borderRadius: '100px',
              padding: '0.28rem 0.75rem',
              cursor: 'pointer', fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)',
            }}
          >
            <TrendingDown size={13} />
            <span>−{currency}{bigExpenseDailyTotal.toFixed(2)}{t.bigExpensePerDay}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{currency}{bigExpenseTotalRemaining.toFixed(2)} {t.bigExpenseRemaining}</span>
            <ChevronRight size={13} />
          </div>
          </div>
        )}
      </div>

      {todayBalance < 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.5rem 1rem 0', padding: '0.5rem 0.85rem', background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.25)', borderRadius: 10, fontSize: '0.82rem', color: '#ff9999' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          {t.overBudgetWarning(`${currency}${Math.abs(todayBalance).toFixed(2)}`)}
        </div>
      )}

      <div className="tabs">
        {TABS.map(tabName => (
          <button key={tabName} className={`tab${tab === tabName ? ' active' : ''}`} onClick={() => setTab(tabName)}>
            {tabName}
          </button>
        ))}
      </div>

      {tab === t.tabExpenses && <ExpensesTab expenses={expenses} user={user} currency={currency} onDelete={deleteExpense} onPhotoClick={setLightboxPhoto} onReassign={setReassignExp} onAddPhoto={handleAddExpensePhoto} allMembers={allMembers} t={t} lang={lang} viewMode={viewMode} onViewModeChange={setViewMode} />}
      {tab === t.tabShopping && <ShoppingListTab groupId={groupId} user={user} currency={currency} groupCurrency={group.currency} country={group.country || 'de'} onCountryChange={c => updateDoc(doc(db, 'groups', groupId), { country: c })} estimation={shoppingEstimation} onEstimationChange={setShoppingEstimation} estimationOpen={shoppingEstimationOpen} onEstimationOpenChange={setShoppingEstimationOpen} t={t} onOpenOtherLists={() => setShowOtherLists(true)} />}

      {showSettings && (
        <div className="settings-page">
          <div className="settings-page-header">
            <button className="settings-back-btn" onClick={() => setShowSettings(false)}>
              {lang === 'he' ? '→' : '←'} {t.back}
            </button>
            <div className="settings-page-title">{t.tabSettings}</div>
          </div>
          <div className="settings-page-body">
            <SettingsTab group={group} groupId={groupId} isAdmin={isAdmin} memberData={memberData} user={user} t={t} onShowReceipts={() => { setShowSettings(false); setShowReceipts(true); }} bigExpenses={activeBigExpenses} onShowHistory={() => setShowBigExpHistory(true)} />
          </div>
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
          <div className="settings-page-body">
            <StatsTab expenses={expenses} user={user} currency={currency} today={today} t={t} lang={lang} viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
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
          <div className="settings-page-body">
            <ProductsTab groupId={groupId} user={user} currency={currency} groupCurrency={group.currency} t={t} />
          </div>
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
          <div className="settings-page-body">
            <MembersTab members={allMembers} expenses={expenses} today={today} currency={currency}
              group={group} groupId={groupId} isAdmin={isAdmin} getMemberBalance={getMemberBalance} t={t} />
          </div>
        </div>
      )}

      {showOtherLists && (
        <OtherListsPage groupId={groupId} user={user} currency={currency} groupCurrency={group.currency} t={t} lang={lang}
          onClose={() => setShowOtherLists(false)} />
      )}

      {showLists && (
        <MyListsPage groupId={groupId} user={user} t={t} lang={lang}
          initialListId={initialListId}
          onClose={() => { setShowLists(false); setInitialListId(null); }} />
      )}

      {showIncome && (
        <IncomePage
          groupId={groupId} user={user} currency={currency} t={t} lang={lang}
          onClose={() => setShowIncome(false)}
        />
      )}

      {showRecurring && (
        <RecurringExpensesPage
          groupId={groupId} user={user} currency={currency} isAdmin={isAdmin}
          members={allMembers} t={t} lang={lang}
          onClose={() => setShowRecurring(false)}
        />
      )}

      {showNotes && (
        <NotesPage
          groupId={groupId} user={user} memberData={memberData}
          group={group} lang={lang} t={t}
          hasIndicator={hasNotesIndicator}
          onClose={() => setShowNotes(false)}
        />
      )}

      {showProfile && (
        <ProfilePage
          group={group} groupId={groupId} memberData={memberData}
          user={user} isAdmin={isAdmin} t={t} lang={lang}
          todayBalance={todayBalance} bigExpenses={activeBigExpenses}
          onClose={() => setShowProfile(false)}
          onOpenList={(listId) => { setInitialListId(listId); setShowProfile(false); setShowLists(true); }}
        />
      )}

      {showReceipts && (
        <ScannedReceiptsPage
          groupId={groupId} currency={currency} t={t} lang={lang}
          onClose={() => setShowReceipts(false)}
        />
      )}

      {showBigExpenseSheet && (
        <BigExpenseSheet
          bigExpenses={activeBigExpenses} currency={currency} isAdmin={isAdmin}
          today={today} t={t} groupId={groupId}
          canStillSpend={canStillSpend} user={user}
          onClose={() => setShowBigExpenseSheet(false)}
        />
      )}

      {showBigExpHistory && (
        <BigExpenseHistoryPage
          bigExpenses={bigExpenses} currency={currency} today={today} t={t} lang={lang}
          onClose={() => setShowBigExpHistory(false)}
        />
      )}

      {overBudgetToast && (
        <div style={{ position: 'fixed', bottom: '5.5rem', left: '50%', transform: 'translateX(-50%)', background: '#b45309', color: 'white', padding: '0.6rem 1.1rem', borderRadius: 10, fontSize: '0.83rem', fontWeight: 500, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.35)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangle size={14} />
          {overBudgetToast}
        </div>
      )}

      <button className="scan-btn" onClick={() => scanInputRef.current?.click()} title="Scan receipt">
        <ScanLine size={20} strokeWidth={1.5} />
      </button>
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleScanReceipt}
      />

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
                  onKeyDown={e => { if (e.key === 'Escape') setShowSuggestions(false); }}
                  autoComplete="off" autoFocus required
                />
                {showSuggestions && (
                  <div className="suggestions-list">
                    <div className="suggestions-header">
                      <span className="suggestions-label">Suggestions</span>
                      <button
                        type="button"
                        className="suggestions-dismiss"
                        onMouseDown={e => { e.preventDefault(); setShowSuggestions(false); }}
                      >✕ Use my text</button>
                    </div>
                    {suggestions.map(item => (
                      <div key={item.id} className="suggestion-item" onMouseDown={e => { e.preventDefault(); selectSuggestion(item); }}>
                        <span className="suggestion-name">{item.name}</span>
                        <span className="suggestion-meta">{currency}{(item.originalPrice != null && item.originalCurrency ? convertAmount(item.originalPrice, item.originalCurrency, group.currency) : item.price).toFixed(2)}</span>
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
                    <button type="button" className="btn-secondary" style={{ flex: 1, marginTop: 0, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                      onClick={() => photoInputRef.current.click()}><Camera size={15} strokeWidth={1.5} />{t.changePhoto}</button>
                    <button type="button" className="btn-cancel" style={{ padding: '0.5rem 0.75rem', borderRadius: 10, border: 'none', background: '#f5f5f5', cursor: 'pointer' }}
                      onClick={() => setForm(f => ({ ...f, photo: null }))}>×</button>
                  </div>
                ) : (
                  <button type="button" className="btn-secondary" style={{ marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    onClick={() => photoInputRef.current.click()}>
                    <Camera size={16} strokeWidth={1.5} />{t.addPhoto}
                  </button>
                )}
              </div>
              {(() => {
                const enteredAmt = parseFloat(form.amount);
                const willOver = form.date === today && enteredAmt > 0 && enteredAmt > todayBalance;
                const overAmt = willOver ? `${currency}${(enteredAmt - todayBalance).toFixed(2)}` : null;
                return willOver ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#ffcc80', fontSize: '0.82rem', margin: '0.4rem 0' }}>
                    <AlertTriangle size={13} />
                    {t.overBudgetWarning(overAmt)}
                  </div>
                ) : addError ? (
                  <div className="add-error">{addError}</div>
                ) : null;
              })()}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowAdd(false)}>{t.cancelBtn}</button>
                <button type="submit" className="btn-primary">{t.addBtn}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reassignExp && (
        <ReassignModal
          exp={reassignExp} members={allMembers} user={user} currency={currency}
          onConfirm={reassignExpense} onClose={() => setReassignExp(null)} t={t}
        />
      )}

      {showAvailableInfo && (
        <AvailableInfoPopup
          todayBalance={todayBalance} canStillSpend={canStillSpend}
          dailyBudget={dailyBudget} currency={currency}
          bigExpenseDailyTotal={bigExpenseDailyTotal}
          onClose={() => setShowAvailableInfo(false)} t={t}
        />
      )}

      {showSunday && (
        <SundayPromptModal
          mode={showSunday}
          balance={memberData.running_balance || 0}
          currency={currency}
          onChoice={handleSundayChoice}
          t={t}
          onDismiss={async () => {
            // "Remind me later" — only for surplus. Deficit always fully dismisses.
            if (showSunday === 'deficit') {
              await updateDoc(doc(db, 'groups', groupId, 'members', user.uid), { last_sunday_prompt: today });
            }
            setShowSunday(null);
          }}
        />
      )}

      {lightboxPhoto && (
        <div className="lightbox-overlay" onClick={() => setLightboxPhoto(null)}>
          <img src={lightboxPhoto} alt="" className="lightbox-img" />
        </div>
      )}

      {isScanning && (
        <div className="receipt-scanning-overlay">
          <div className="receipt-spinner" />
          <div style={{ marginTop: '1rem', color: 'white', fontSize: '0.9rem' }}>{t.scanningReceipt}</div>
        </div>
      )}

      {showReceiptReview && receiptResult && (
        <ReceiptReviewModal
          result={receiptResult}
          members={allMembers}
          user={user}
          currency={currency}
          groupId={groupId}
          today={today}
          onConfirm={handleReceiptConfirm}
          onClose={() => { setShowReceiptReview(false); setReceiptResult(null); setReceiptImageBase64(null); }}
          t={t}
        />
      )}
    </>
  );
}
