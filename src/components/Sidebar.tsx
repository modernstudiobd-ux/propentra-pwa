import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Home, Users, Receipt, FileText,
  History, CreditCard, BarChart3, Settings, DatabaseBackup,
  ChevronDown, X, HelpCircle, PiggyBank, Wrench, Wallet, BellRing, FolderOpen, History as HistoryIcon, ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import StorageStatus from './StorageStatus';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/buildings', label: 'Buildings', icon: Building2 },
  { to: '/flats', label: 'Flats', icon: Home },
  { to: '/residents', label: 'Residents', icon: Users },
];

const billingNav = [
  { to: '/billing/generator', label: 'Billing Center', icon: FileText },
  { to: '/billing/history', label: 'Bills History', icon: History },
];

const paymentsNav = [
  { to: '/billing/payments', label: 'Payments', icon: CreditCard },
  { to: '/deposits', label: 'Deposits & Advances', icon: PiggyBank },
];

const operationsNav = [
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/reminders', label: 'Reminders', icon: BellRing },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/timeline', label: 'Timeline', icon: HistoryIcon },
  { to: '/audit-log', label: 'Audit Log', icon: ShieldCheck },
];

const bottomNav = [
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/backup', label: 'Backup & Restore', icon: DatabaseBackup },
  { to: '/help', label: 'Help', icon: HelpCircle },
];

function Item({ to, label, icon: Icon, end }: { to: string; label: string; icon: any; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-gray-400 hover:bg-white/[0.06] hover:text-white'
        }`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [billingOpen, setBillingOpen] = useState(true);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-64 bg-brand-900 text-white flex flex-col transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-4 h-16 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center font-semibold">P</div>
            <div>
              <div className="font-semibold leading-tight">Propentra</div>
              <div className="text-[11px] text-gray-400 leading-tight">Property Management &amp; Billing</div>
            </div>
          </div>
          <button className="md:hidden text-gray-400" onClick={onClose}><X size={20} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {nav.map((n) => <Item key={n.to} {...n} />)}

          <button
            onClick={() => setBillingOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium text-gray-400 hover:bg-white/[0.06] hover:text-white"
          >
            <span className="flex items-center gap-3"><Receipt size={18} /> Billing</span>
            <ChevronDown size={16} className={`transition-transform ${billingOpen ? 'rotate-180' : ''}`} />
          </button>
          {billingOpen && (
            <div className="pl-4 space-y-1">
              {billingNav.map((n) => <Item key={n.to} {...n} />)}
            </div>
          )}

          <div className="pt-1 space-y-1">
            {paymentsNav.map((n) => <Item key={n.to} {...n} />)}
          </div>

          <div className="pt-2 mt-1 border-t border-white/[0.06] pb-1" />
          <div className="pt-1 space-y-1">
            {operationsNav.map((n) => <Item key={n.to} {...n} />)}
          </div>

          <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1">
            {bottomNav.map((n) => <Item key={n.to} {...n} />)}
          </div>
        </nav>

        <StorageStatus />
      </aside>
    </>
  );
}
