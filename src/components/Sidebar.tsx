import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Home, Users, Receipt, FileText,
  History, CreditCard, BarChart3, Settings, DatabaseBackup,
  ChevronDown, X, HelpCircle, PiggyBank, Wrench, Wallet, BellRing, FolderOpen, History as HistoryIcon, ShieldCheck,
  FileSpreadsheet, Landmark, SquareParking, Warehouse,
} from 'lucide-react';
import { useState } from 'react';
import StorageStatus from './StorageStatus';

// Standalone top-level items (no group header).
const topNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
];

const propertiesNav = [
  { to: '/buildings', label: 'Buildings', icon: Building2 },
  { to: '/flats', label: 'Flats', icon: Home },
];

const peopleNav = [
  { to: '/residents', label: 'Residents', icon: Users },
  { to: '/owners', label: 'Owners', icon: Landmark },
];

const operationsNav = [
  { to: '/parking', label: 'Parking', icon: SquareParking },
  { to: '/storage', label: 'Storage', icon: Warehouse },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/reminders', label: 'Reminders', icon: BellRing },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/timeline', label: 'Timeline', icon: HistoryIcon },
];

const financeNav = [
  { to: '/billing/generator', label: 'Billing Center', icon: FileText },
  { to: '/billing/history', label: 'Bills History', icon: History },
  { to: '/billing/payments', label: 'Payments', icon: CreditCard },
  { to: '/deposits', label: 'Deposits & Advances', icon: PiggyBank },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
];

const midNav = [
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const systemNav = [
  { to: '/import', label: 'Import Data', icon: FileSpreadsheet },
  { to: '/backup', label: 'Backup & Restore', icon: DatabaseBackup },
  { to: '/audit-log', label: 'Audit Log', icon: ShieldCheck },
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

/** Small uppercase label above a group of related nav items - gives large portfolios with many pages a clear visual hierarchy without extra clicks. */
function GroupHeader({ label }: { label: string }) {
  return <div className="px-3.5 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">{label}</div>;
}

/** Collapsible group - used for sections with more items than a small landlord needs to see by default, keeping the nav scannable for large portfolios. */
function CollapsibleGroup({ label, icon: Icon, items, defaultOpen }: { label: string; icon: any; items: typeof financeNav; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium text-gray-400 hover:bg-white/[0.06] hover:text-white"
      >
        <span className="flex items-center gap-3"><Icon size={18} /> {label}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pl-4 space-y-1">
          {items.map((n) => <Item key={n.to} {...n} />)}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
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

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {topNav.map((n) => <Item key={n.to} {...n} />)}

          <GroupHeader label="Properties" />
          {propertiesNav.map((n) => <Item key={n.to} {...n} />)}

          <GroupHeader label="People" />
          {peopleNav.map((n) => <Item key={n.to} {...n} />)}

          <GroupHeader label="Operations" />
          {operationsNav.map((n) => <Item key={n.to} {...n} />)}

          <div className="pt-1">
            <CollapsibleGroup label="Finance" icon={Receipt} items={financeNav} defaultOpen={true} />
          </div>

          <div className="pt-2 mt-1 border-t border-white/[0.06] pb-1" />
          {midNav.map((n) => <Item key={n.to} {...n} />)}

          <div className="pt-1">
            <CollapsibleGroup label="System" icon={ShieldCheck} items={systemNav} defaultOpen={false} />
          </div>
        </nav>

        <StorageStatus />
      </aside>
    </>
  );
}
