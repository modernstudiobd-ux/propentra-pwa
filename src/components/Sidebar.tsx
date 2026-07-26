import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Home, Users, Receipt, FileText, FileEdit,
  History, CreditCard, BarChart3, Settings, DatabaseBackup,
  ChevronDown, X, HelpCircle,
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
  { to: '/billing/generator', label: 'Bill Generator', icon: FileText },
  { to: '/billing/invoice-generator', label: 'Invoice Generator', icon: FileEdit },
  { to: '/billing/receipt-generator', label: 'Receipt Generator', icon: Receipt },
  { to: '/billing/history', label: 'Bills History', icon: History },
];

const paymentsNav = [
  { to: '/billing/payments', label: 'Payments', icon: CreditCard },
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
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
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
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed md:sticky top-0 z-40 h-screen w-64 bg-brand-900 text-white flex flex-col transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-4 h-16 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center font-bold">B</div>
            <div>
              <div className="font-semibold leading-tight">BuildingBill</div>
              <div className="text-[11px] text-gray-400 leading-tight">Smart Building Management</div>
            </div>
          </div>
          <button className="md:hidden text-gray-400" onClick={onClose}><X size={20} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {nav.map((n) => <Item key={n.to} {...n} />)}

          <button
            onClick={() => setBillingOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white"
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

          <div className="pt-2 mt-2 border-t border-white/10 space-y-1">
            {bottomNav.map((n) => <Item key={n.to} {...n} />)}
          </div>
        </nav>

        <StorageStatus />
      </aside>
    </>
  );
}
