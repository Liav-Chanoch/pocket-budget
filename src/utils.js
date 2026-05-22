import { Utensils, ShoppingCart, Train, Ticket, ShoppingBag, Home, Sparkles, Package } from 'lucide-react';

export const CURRENCIES = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };

export const CATEGORIES = [
  { id: 'food',          label: 'Food & Drinks',   icon: Utensils,     color: '#ff6b6b' },
  { id: 'groceries',    label: 'Groceries',        icon: ShoppingCart, color: '#26de81' },
  { id: 'transport',     label: 'Transport',        icon: Train,        color: '#4ecdc4' },
  { id: 'activities',    label: 'Activities',       icon: Ticket,       color: '#45b7d1' },
  { id: 'shopping',      label: 'Shopping',         icon: ShoppingBag,  color: '#f9ca24' },
  { id: 'accommodation', label: 'Accommodation',    icon: Home,         color: '#a29bfe' },
  { id: 'beauty',        label: 'Beauty',           icon: Sparkles,     color: '#e84393' },
  { id: 'other',         label: 'Other',            icon: Package,      color: '#fd79a8' },
];

export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function addDaysToStr(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getDailyBudget(group) {
  if (!group?.budgetAmount) return 0;
  if (group.budgetMode === 'weekly') {
    return Math.round((group.budgetAmount / 7) * 100) / 100;
  }
  return group.budgetAmount || 0;
}

export function getCurrencySymbol(currency) {
  return CURRENCIES[currency] || '₪';
}

export function isSunday() {
  return new Date().getDay() === 0;
}

export function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function getCat(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[5];
}

export function formatDateStr(dateStr) {
  if (!dateStr) return 'Unknown';
  const today = getTodayStr();
  const yesterday = getYesterdayStr();
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
